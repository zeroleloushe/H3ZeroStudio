"""Segment-by-segment MiniMax H3 generation for H3ZeroStudio.

Continuity ("extend") follows the proven sequential mode of ComfyUI-H3-WindowedRefine (same author):
segment k>=2 starts with the last 5o+2 latent frames of segment k-1 (an aligned 17o+5 frame clip),
which is
  * given to H3 as a native clip keyframe at frame 0 (conditioning "minimax_keyframes", like MiniMaxH3AddGuide),
  * locked in the predicted x0 on every step (the sampler converges exactly onto the finished frames),
and the previous segment's decoded last frame is added as one more <Picture N> reference.
"""
import hashlib
import json
import math
import os
import time

import numpy as np
import torch

import comfy.model_management
import comfy.nested_tensor
import comfy.sample
import comfy.utils
import node_helpers

from . import h3s_core as core
from . import h3s_media as media
from . import h3s_preview as preview
from . import h3s_upscale as upscale

LOG = "[H3ZS]"


def log(msg):
    line = f"{LOG} {msg}"
    try:
        print(line, flush=True)
    except UnicodeEncodeError:   # legacy console code page: keep the line, lose the glyphs
        print(line.replace("█", "#").replace("░", "-").replace("σ", "sigma").replace("Δ", "delta")
              .encode("ascii", "replace").decode("ascii"), flush=True)


VERBOSE = [True]   # settings.verbose_log of the running project


def vlog(msg):
    if VERBOSE[0]:
        log(msg)


def vram():
    try:
        if torch.cuda.is_available():
            free, tot = torch.cuda.mem_get_info()   # the whole device (ComfyUI's models included)
            return f"VRAM {(tot - free) / 2 ** 30:.1f}/{tot / 2 ** 30:.1f} GB"
    except Exception:
        pass
    return ""


def text_bar(i, n, w=20):
    k = int(round(w * i / max(1, n)))
    return "█" * k + "░" * (w - k)


def fmt_s(x):
    x = max(0, int(round(x)))
    return f"{x // 60}:{x % 60:02d}" if x >= 60 else f"{x}s"


# ---------------------------------------------------------------- packing helpers (H3 flat AV pack)
def pack(video, audio):
    v = video.reshape(video.shape[0], 1, -1)
    a = audio.reshape(audio.shape[0], 1, -1)
    return torch.cat([v, a], dim=-1)


def unpack(x, shapes):
    vs, as_ = shapes
    n = math.prod(vs[1:])
    return x[:, :, :n].reshape([x.shape[0]] + list(vs[1:])), x[:, :, n:].reshape([x.shape[0]] + list(as_[1:]))


class LockWrapper:
    """model_function_wrapper: replaces predicted x0 in locked regions (overlap with the previous segment,
    and/or a locked soundtrack) with the given clean latents."""

    def __init__(self, lock_v=None, w_v=None, lock_a=None, w_a=None, probe=None):
        self.lock_v, self.w_v, self.lock_a, self.w_a = lock_v, w_v, lock_a, w_a
        self.probe = probe   # expected kept-audio frames: logs once what the DiT really receives
        self.calls = 0

    def __call__(self, apply_model, args):
        x, t, c = args["input"], args["timestep"], args["c"]
        out = apply_model(x, t, **c)
        shapes = c.get("latent_shapes")
        self.calls += 1
        if self.probe is not None and self.calls == 1:
            try:
                adm = c.get("audio_denoise_mask")
                pay = c.get("minimax_payload") or {}
                if adm is None:
                    log(f"  [audio-probe] WARNING: the model got NO audio_denoise_mask — the kept audio is not conditioned")
                else:
                    m = adm.reshape(-1, adm.shape[-1])[0].float()
                    log(f"  [audio-probe] model got audio_denoise_mask {tuple(adm.shape)}: {int((m < 0.5).sum())} kept / {m.numel()} frames "
                        f"(expected {self.probe}); cond audio rows: {len(pay.get('cond_audio_latents') or [])}; audio_scale {float(pay.get('audio_scale', 1.0)):.3f}")
            except Exception as e:
                log(f"  [audio-probe] failed: {e}")
        if shapes is None or len(shapes) != 2 or (self.lock_v is None and self.lock_a is None):
            return out
        ov, oa = unpack(out, shapes)
        ov, oa = ov.float(), oa.float()
        if self.lock_v is not None:
            w = self.w_v.to(ov.device).view(1, 1, -1, 1, 1)
            ov = ov * (1 - w) + self.lock_v.to(ov.device, ov.dtype) * w
        if self.lock_a is not None:
            w = self.w_a.to(oa.device)
            oa = oa * (1 - w) + self.lock_a.to(oa.device, oa.dtype) * w
        return pack(ov.to(out.dtype), oa.to(out.dtype))


def sampler_audio_scale(model):
    try:
        fn = getattr(model.model, "audio_scale", None)
        return float(fn()) if callable(fn) else 1.0
    except Exception:
        return 1.0


def apply_shift(model, shift_video, shift_audio):
    """Same as comfy_extras MiniMaxH3SigmaShift (ModelSamplingMiniMaxH3)."""
    import comfy.model_sampling
    m = model.clone()

    class ModelSamplingAdvanced(comfy.model_sampling.ModelSamplingAV, comfy.model_sampling.CONST):
        pass

    original = m.get_model_object("model_sampling")
    ms = ModelSamplingAdvanced(model.model.model_config)
    ms.set_parameters(shift=shift_video, audio_shift=shift_audio)
    if hasattr(original, "noise_scale"):
        ms.set_noise_scale(original.noise_scale)
    m.add_object_patch("model_sampling", ms)
    to = m.model_options["transformer_options"] = m.model_options.get("transformer_options", {}).copy()
    to["minimax_h3_sigma_shift_video"] = shift_video
    to["minimax_h3_sigma_shift_audio"] = shift_audio
    return m


# ---------------------------------------------------------------- conditioning
def _resize(image, width, height):
    s = image[..., :3].movedim(-1, 1)
    return comfy.utils.common_upscale(s, width, height, "lanczos", "disabled").movedim(1, -1)


def ref_canvas(img, width, height, ref_size="match"):
    h, w = img.shape[1], img.shape[2]
    if ref_size == "max":
        scale = min(1.0, 2048 / min(w, h))
    else:
        scale = min(1.0, math.sqrt((width * height) / (w * h)))
    m = core.CANVAS_MULTIPLE
    return max(m, round(w * scale / m) * m), max(m, round(h * scale / m) * m)


def encode_cond(clip, vae, prompt, images, width, height, ref_size="match", ref_audios=None, ref_videos=None):
    """Same presentation as comfy_extras MiniMaxH3ReferenceToVideo: images, then videos, then standalone audio.
    ref_videos: frames [n,H,W,3] already on the reference canvas with n on the 17k+5 grid."""
    items, blocks = [], []
    for img in images:
        tw, th = ref_canvas(img, width, height, ref_size)
        resized = _resize(img[:1], tw, th)
        items.append({"type": "image", "data": resized})
        blocks.append({"kind": "image", "latent_h": th // 16, "latent_w": tw // 16, "latent": vae.encode(resized)})
    for fr in ref_videos or []:
        sample_idx = list(range(0, fr.shape[0], core.FPS // 2))   # the text encoder sees the video at 2 fps
        items.append({"type": "video", "data": fr[sample_idx], "timestamps": [k / 2.0 for k in range(len(sample_idx))]})
        z = vae.encode(fr)
        blocks.append({"kind": "video", "latent_t": z.shape[2], "latent_h": fr.shape[1] // 16, "latent_w": fr.shape[2] // 16,
                       "ref_audio_t": 0, "latent": z, "audio_latent": None})
    for ra in ref_audios or []:
        items.append({"type": "audio"})
        blocks.append({"kind": "audio", "ref_audio_t": ra.shape[-1], "audio_latent": ra})
    tokens = clip.tokenize(prompt, minimax_ref_items=items)
    cond = clip.encode_from_tokens_scheduled(tokens)
    if blocks:
        cond = node_helpers.conditioning_set_values(cond, {"minimax_refs": blocks})
    return cond


def add_keyframes(cond, keyframes):
    if not keyframes:
        return cond
    out = []
    for t, d in cond:
        d = dict(d)
        d["minimax_keyframes"] = list(d.get("minimax_keyframes", [])) + list(keyframes)
        out.append([t, d])
    return out


# ---------------------------------------------------------------- inputs
def load_asset_image(asset):
    """Asset uploaded via /upload/image -> IMAGE [1,H,W,3]."""
    import numpy as np
    from PIL import Image, ImageOps
    path = asset_path(asset)
    img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    return torch.from_numpy(np.asarray(img).astype("float32") / 255.0)[None]


def asset_path(asset):
    import folder_paths
    base = {"input": folder_paths.get_input_directory, "output": folder_paths.get_output_directory,
            "temp": folder_paths.get_temp_directory}.get(asset.get("type") or "input", folder_paths.get_input_directory)()
    base = os.path.abspath(base)
    p = os.path.abspath(os.path.join(base, asset.get("subfolder") or "", asset["file"]))
    if os.path.commonpath([base, p]) != base:
        raise ValueError(f"H3ZeroStudio: недопустимый путь ассета {asset['file']!r}")
    if not os.path.isfile(p):
        raise FileNotFoundError(f"H3ZeroStudio: нет файла референса {asset.get('name') or asset['file']} ({p}). Загрузите его заново в «Ассетах».")
    return p


def file_sig(path):
    try:
        st = os.stat(path)
        return f"{st.st_size}:{int(st.st_mtime)}"
    except OSError:
        return "missing"


def model_signature(model, clip, vae, audio_vae):
    h = hashlib.sha256()
    try:
        h.update(type(model.model).__name__.encode())
        h.update(str(getattr(model.model, "model_config", None).__class__.__name__).encode())
        for k in sorted(getattr(model, "patches", {}) or {}):
            for p in model.patches[k]:
                h.update(f"{k}:{p[0]}:{p[2] if len(p) > 2 else ''}".encode())
        for k in sorted((model.model_options or {}).get("transformer_options", {}).keys()):
            h.update(str(k).encode())
    except Exception:
        pass
    for o in (clip, vae, audio_vae):
        h.update(type(o).__name__.encode() if o is not None else b"-")
    return h.hexdigest()[:16]


def audio_signature(audio):
    if audio is None:
        return ""
    wf = audio["waveform"]
    h = hashlib.sha256(f"{tuple(wf.shape)}:{audio['sample_rate']}".encode())
    flat = wf.flatten()
    step = max(1, flat.numel() // 4096)
    h.update(flat[::step].float().cpu().numpy().tobytes())
    return h.hexdigest()[:16]


def encode_audio(audio_vae, audio):
    """AUDIO -> H3 audio latent [1,32,2,T] at 40 latent frames/s (same as MiniMaxH3AddGuide)."""
    wf = audio["waveform"]
    sr = audio["sample_rate"]
    vae_sr = getattr(audio_vae, "audio_sample_rate", 32000)
    if wf.shape[1] == 1:
        wf = wf.repeat(1, 2, 1)
    if sr != vae_sr:
        import comfy.audio
        wf = comfy.audio.resample(wf, sr, vae_sr)
    return audio_vae.encode(wf[:1].movedim(1, -1))


def audio_out_rate(audio_vae):
    return getattr(audio_vae, "audio_sample_rate_output", getattr(audio_vae, "audio_sample_rate", 44100))


def normalize_level(audio):
    """ComfyUI's vae_decode_audio level rule: divide by 5*std when that is above 1."""
    std = torch.std(audio, dim=[1, 2], keepdim=True) * 5.0
    std[std < 1.0] = 1.0
    return audio / std


def decode_audio(audio_vae, latent_a, normalize=True):
    """Like comfy_extras.nodes_audio.vae_decode_audio -> AUDIO dict."""
    audio = audio_vae.decode(latent_a).movedim(-1, 1).float()
    return {"waveform": normalize_level(audio) if normalize else audio, "sample_rate": audio_out_rate(audio_vae)}


def _rms(x):
    return float(torch.sqrt(torch.mean(x.float() ** 2))) if x.numel() else 0.0


SPLICE_SEC = 0.02        # linear splice fade at a correlated (kept-audio) seam
DRIFT_FADE_SEC = 0.01    # fade of the few-sample drift fix after the overlap
CORR_SEAM = 0.5          # overlap correlation above which both sides carry the same (kept) sound


def _mono(x):
    return x.float().mean(0)


def _quietest(x, lo, hi, win):
    """Start of the quietest `win`-sample window of mono x within [lo, hi) (lo if the range is too short)."""
    lo, hi = max(0, int(lo)), min(x.shape[-1], int(hi))
    if hi - lo <= win:
        return lo
    e = x[lo:hi].float() ** 2
    c = torch.cumsum(torch.cat([torch.zeros(1), e]), 0)
    en = c[win:] - c[:-win]
    return lo + int(torch.argmin(en))


def seam_lag(prev, cur, max_lag, prior=0):
    """Best alignment of `cur` against `prev` (mono, same length = the overlap): cur[k] matches prev[k + lag].
    Returns (lag, normalized correlation). Only the middle 70% is compared (decoder edges). Periodic sound
    correlates at several lags: a slight bias picks the one nearest `prior` (the audio-latent grid offset)."""
    n = min(prev.shape[-1], cur.shape[-1])
    m0, m1 = int(n * 0.15), int(n * 0.85)
    if m1 - m0 < 64:
        return 0, 0.0
    b = cur[m0:m1].float()
    lo, hi = max(0, m0 - max_lag), min(n, m1 + max_lag)
    a = prev[lo:hi].float()
    if a.shape[-1] < b.shape[-1]:
        return 0, 0.0
    num = torch.nn.functional.conv1d(a.view(1, 1, -1), b.view(1, 1, -1)).view(-1)
    ea = torch.cumsum(torch.cat([torch.zeros(1), a ** 2]), 0)
    den = torch.sqrt((ea[b.shape[-1]:] - ea[:-b.shape[-1]]) * float((b ** 2).sum())).clamp(min=1e-12)
    r = num / den
    lags = torch.arange(r.shape[-1]) + lo - m0
    k = int(torch.argmax(r - 0.02 * (lags - prior).abs().float() / max(1, max_lag)))
    return lo + k - m0, float(r[k])


def _drift_fix(w, d, q, sr):
    """w placed d samples off its video position: drop (d > 0) or repeat (d < 0) |d| samples at local index q
    with a short linear fade, so everything after q is back on the video timeline."""
    if d == 0:
        return w
    X = max(1, int(round(DRIFT_FADE_SEC * sr)))
    e = abs(d)
    if q - X - e < 0 or q + e >= w.shape[-1]:
        return w
    t = (torch.arange(X, dtype=torch.float32) + 0.5) / X
    if d > 0:
        v = torch.cat([w[:, :q], w[:, q + d:]], dim=-1).clone()
        v[:, q - X:q] = w[:, q - X:q] * (1 - t) + w[:, q + d - X:q + d] * t
    else:
        v = torch.cat([w[:, :q], w[:, q - e:]], dim=-1).clone()
        v[:, q - X:q] = w[:, q - X:q] * (1 - t) + w[:, q - e - X:q - e] * t
    return v


def stitch_audio(waves, sr, items, fps=core.FPS, xfade=0.4, match=True, release=core.AUDIO_MATCH_RELEASE, skip=None, info=None, declick=True):
    """Final audio of an extend chain from separately decoded segments.
    waves[i]: [C, N] audio of segment i, sample 0 = the segment's first frame (timeline frame items[i]["start"]).
    At an extend seam both segments cover the overlap.
      * Kept (correlated) overlap sound — the usual case with the audio seam lock: the next segment's overlap is
        the previous sound, but on the 25 ms audio-latent grid, so it is up to ±12.5 ms off its video position
        (e.g. 8.3 ms at a 22-frame overlap after a 108-frame clip). The exact offset is measured by
        cross-correlation, the two are spliced sample-exactly with a short linear fade (constant gain for
        identical signals) at the quietest point of the overlap's middle, and the offset is removed again at a
        quiet point after the overlap, so the rest stays on the video timeline (no drift along a long chain).
        (A long equal-power crossfade of two copies 8 ms apart combed/cancelled — an audible dip.)
      * Different sound on both sides: the next segment's loudness is matched (RMS gain, limited, back to 1 over
        `release` s) and an equal-power crossfade of `xfade` s is centred in the overlap; xfade 0 = hard cut.
    Segments without overlap (new scene) are butt-joined. info: optional list, gets one dict per seam.
    declick: every hard cut (new scene, footage, xfade 0, cut under a locked track) gets a ~5 ms taper each side."""
    total = int(round(items[-1]["end"] / fps * sr))
    out = torch.zeros(waves[0].shape[0], total)
    gains, cuts = [], []
    for i, it in enumerate(items):
        s0 = int(round(it["start"] / fps * sr))
        n = max(0, min(waves[i].shape[-1], total - s0))
        w = waves[i][:, :n].float().clone()
        ov_n = min(n, int(round((it["overlap"] if i else 0) / fps * sr)))
        g = 1.0
        sk = bool(skip and i < len(skip) and skip[i])
        if ov_n > 0 and not sk:
            # grid prior: the next segment's audio latent starts at a multiple of 1/40 s, not at its first frame
            ta = it["start"] * core.AUDIO_LATENT_FPS / fps
            prior = int(round((round(ta) - ta) / core.AUDIO_LATENT_FPS * sr))
            lag, corr = seam_lag(_mono(out[:, s0:s0 + ov_n]), _mono(w[:, :ov_n]), max(1, int(round(0.02 * sr))), prior)
            if corr >= CORR_SEAM and xfade > 0:
                # same sound on both sides: sample-exact splice, then remove the grid offset after the overlap
                d = lag   # w[k] belongs at timeline s0 + d + k
                L = max(1, min(int(round(SPLICE_SEC * sr)), ov_n // 4))
                mid0, mid1 = s0 + ov_n // 4, s0 + (3 * ov_n) // 4
                a = _quietest(_mono(out), mid0, mid1, L)
                a = max(a, s0 + max(0, d))
                b = a + L
                X = max(1, int(round(DRIFT_FADE_SEC * sr)))
                ov_end = ov_n - d   # local index of the overlap end in w
                q = _quietest(_mono(w), ov_end + int(0.05 * sr), min(w.shape[-1] - abs(d) - 1, ov_end + int(1.5 * sr)), int(0.03 * sr)) + int(0.015 * sr)
                v = _drift_fix(w, d, q, sr) if d else w
                base = s0 + d
                if match:   # same sound, different level (decoder): match it, back to 1 over `release`
                    r_prev = _rms(out[:, max(s0, base):s0 + ov_n])
                    r_cur = _rms(v[:, max(s0, base) - base:s0 + ov_n - base])
                    if r_prev > 1e-6 and r_cur > 1e-6:
                        lo_, hi_ = core.AUDIO_MATCH_RANGE
                        g = min(hi_, max(lo_, r_prev / r_cur))
                    if abs(g - 1.0) > 1e-3:
                        curve = torch.ones(v.shape[-1])
                        k = b - base
                        rel = max(1, int(round(release * sr)))
                        curve[:k] = g
                        m = min(v.shape[-1], k + rel)
                        if m > k:
                            curve[k:m] = g + (1.0 - g) * (torch.arange(m - k, dtype=torch.float32) + 1) / rel
                        v = v * curve
                t = (torch.arange(L, dtype=torch.float32) + 0.5) / L
                out[:, a:b] = out[:, a:b] * (1 - t) + v[:, a - base:b - base] * t
                end = min(total, base + v.shape[-1])
                out[:, b:end] = v[:, b - base:end - base]
                if info is not None:
                    info.append({"seam": i, "mode": "splice", "lag_ms": round(d / sr * 1000, 2), "corr": round(corr, 3),
                                 "at_s": round(a / sr, 3), "drift_fix_s": round((base + q) / sr, 3) if d else None})
            else:
                if xfade > 0:
                    L = max(1, min(int(round(xfade * sr)), int(ov_n * 0.9)))
                    a = s0 + (ov_n - L) // 2
                else:
                    L, a = 0, s0 + ov_n
                b = a + L
                if not L:
                    cuts.append(a)
                if match:
                    r_prev, r_cur = _rms(out[:, s0:s0 + ov_n]), _rms(w[:, :ov_n])
                    if r_prev > 1e-6 and r_cur > 1e-6:
                        lo, hi = core.AUDIO_MATCH_RANGE
                        g = min(hi, max(lo, r_prev / r_cur))
                    if g != 1.0:
                        curve = torch.ones(n)
                        k = b - s0
                        rel = max(1, int(round(release * sr)))
                        curve[:k] = g
                        m = min(n, k + rel)
                        if m > k:
                            curve[k:m] = g + (1.0 - g) * (torch.arange(m - k, dtype=torch.float32) + 1) / rel
                        w = w * curve
                if L:
                    t = (torch.arange(L, dtype=torch.float32) + 0.5) / L
                    out[:, a:b] = out[:, a:b] * torch.cos(t * math.pi / 2) + w[:, a - s0:b - s0] * torch.sin(t * math.pi / 2)
                out[:, b:s0 + n] = w[:, b - s0:]
                if info is not None:
                    info.append({"seam": i, "mode": "crossfade", "corr": round(corr, 3), "xfade_s": xfade})
        elif ov_n > 0:   # under a locked track clip: hard cut at the overlap end
            out[:, s0 + ov_n:s0 + n] = w[:, ov_n:]
            cuts.append(s0 + ov_n)
        else:
            out[:, s0:s0 + n] = w
            if i:
                cuts.append(s0)
        gains.append(g)
    if declick and cuts:
        from .h3s_seams import declick as _declick
        _declick(out, sr, cuts)
        if info is not None:
            info.append({"seam": -1, "mode": "declick", "at_s": [round(c / sr, 3) for c in cuts]})
    return out, gains


def seam_dips(wave, sr, items, fps=core.FPS, window=0.01, drop_db=25.0):
    """Diagnostics: short level holes (> drop_db below the local median) within ±0.3 s of every overlap end."""
    x = _mono(wave)
    W = max(1, int(window * sr))
    found = []
    for i, it in enumerate(items):
        if not i or not it["overlap"]:
            continue
        c = int(round((it["start"] + it["overlap"]) / fps * sr))
        lo, hi = max(0, c - int(0.3 * sr)), min(x.shape[-1], c + int(0.3 * sr))
        seg = x[lo:hi]
        k = seg.shape[-1] // W
        if k < 8:
            continue
        lev = 20 * torch.log10(torch.sqrt((seg[:k * W].view(k, W) ** 2).mean(1)) + 1e-9)
        med = float(lev.median())
        if med < -60:
            continue
        holes = [lo / sr + j * window for j in range(k) if float(lev[j]) < med - drop_db]
        if holes:
            found.append({"seam": i, "at_s": round(holes[0], 3), "len_ms": round(len(holes) * window * 1000), "median_db": round(med, 1)})
    return found


def slice_audio_latent(z, start_frame, length, cov=None):
    """Audio latent slice for a segment starting at timeline pixel frame start_frame; zero-padded.
    cov: optional [Z] 0/1 mask of timeline audio-latent frames covered by the audio clip."""
    a0 = round(start_frame / core.FPS * core.AUDIO_LATENT_FPS)
    out = torch.zeros(z.shape[:-1] + (length,), dtype=z.dtype)
    weight = torch.zeros(length)
    if a0 < z.shape[-1] and a0 + length > 0:
        s0, s1 = max(0, a0), min(z.shape[-1], a0 + length)
        out[..., s0 - a0:s1 - a0] = z[..., s0:s1].cpu()
        weight[s0 - a0:s1 - a0] = 1.0 if cov is None else cov[s0:s1].float()
    return out, weight


def load_audio_ref(ref):
    """Uploaded audio file reference {filename, subfolder, type} -> AUDIO dict."""
    path = asset_path({"file": ref.get("filename", ""), "subfolder": ref.get("subfolder", ""), "type": ref.get("type", "input"),
                       "name": ref.get("name") or ref.get("filename")})
    wf, sr = media.load_audio(path)
    if wf.shape[0] == 0 or wf.shape[1] == 0:
        raise ValueError(f"H3ZeroStudio: пустой аудиофайл {ref.get('filename')}")
    return {"waveform": torch.from_numpy(wf)[None], "sample_rate": sr}


def _resample(audio, sr):
    if int(audio["sample_rate"]) == sr:
        return audio["waveform"][:1].float()
    import comfy.audio
    return comfy.audio.resample(audio["waveform"][:1].float(), int(audio["sample_rate"]), sr)


def audio_sources(project, audio_input=None):
    """{asset id | "input": AUDIO} for every audio used by the track or by segment references.
    Missing files raise; a missing node input is simply absent."""
    used = {c["asset"] for c in core.lock_clips(project)}
    for seg in project["segments"]:
        used.update(a["id"] for a in core.audio_refs(project, seg))
    by_id = {a["id"]: a for a in project["assets"] if a["category"] == "audio"}
    out = {}
    for aid in sorted(used):
        if aid == core.AUDIO_INPUT_ID:
            if audio_input is not None:
                out[aid] = audio_input
        elif aid in by_id:
            a = by_id[aid]
            out[aid] = load_audio_ref({"filename": a["file"], "subfolder": a["subfolder"], "type": a["type"], "name": a["name"]})
    return out


def timeline_audio(sources, project, n_frames):
    """Mix the audio track clips onto the timeline: source [in, in+length) -> timeline [start, ...).
    sources: {asset id: AUDIO} (an AUDIO dict alone = the node input, for old callers).
    Returns (AUDIO aligned to timeline frame 0 with n_frames/24 s or None, coverage mask in audio-latent frames)."""
    if isinstance(sources, dict) and "waveform" in sources:
        sources = {core.AUDIO_INPUT_ID: sources}
    z_len = core.audio_len(n_frames)
    cov = torch.zeros(z_len)
    clips = [c for c in core.lock_clips(project) if c["asset"] in sources]
    if not clips:
        return None, cov
    sr = max(int(sources[c["asset"]]["sample_rate"]) for c in clips)
    out, spans = mix_clips(clips, sources, sr, 0.0, int(round(n_frames / core.FPS * sr)))
    t = torch.arange(z_len) / core.AUDIO_LATENT_FPS
    for start, end in spans:
        cov = torch.maximum(cov, ((t >= start) & (t < end)).float())
    return {"waveform": out, "sample_rate": sr}, cov


def clip_envelope(n, sr, volume=1.0, fade_in=0.0, fade_out=0.0):
    """Gain curve of a clip of n samples: volume with linear fades (seconds, clamped to the clip)."""
    env = torch.full((n,), float(volume))
    fi, fo = min(n, int(round(fade_in * sr))), min(n, int(round(fade_out * sr)))
    if fi > 0:
        env[:fi] *= torch.linspace(0.0, 1.0, fi)
    if fo > 0:
        env[n - fo:] *= torch.linspace(1.0, 0.0, fo)
    return env


def mix_clips(clips, sources, sr, t0, n_out):
    """Mix audio clips ({asset, start, in, length, volume, fades}) into [1, 2, n_out] starting at timeline
    second t0. Returns (waveform, [(start, end) timeline seconds of every clip])."""
    out = torch.zeros(1, 2, n_out)
    cache, spans = {}, []
    for c in clips:
        asset = c["asset"]
        if asset not in sources:
            continue
        if asset not in cache:
            wf = _resample(sources[asset], sr)
            cache[asset] = wf.repeat(1, 2, 1) if wf.shape[1] == 1 else wf[:, :2]
        wf = cache[asset]
        start, t_in = float(c.get("start") or 0.0), float(c.get("in") or 0.0)
        ln = float(c.get("length") or 0.0)
        avail = max(0.0, wf.shape[-1] / sr - t_in)
        dur = avail if ln <= 0 else min(ln, avail)
        if dur <= 0:
            continue
        spans.append((start, start + dur))
        n_clip = int(round(dur * sr))
        env = clip_envelope(n_clip, sr, c.get("volume", 1.0), c.get("fade_in", 0.0), c.get("fade_out", 0.0))
        s_out = int(round((start - t0) * sr))
        k0 = max(0, -s_out)
        j0 = s_out + k0
        s_src = int(round(t_in * sr)) + k0
        n = min(n_clip - k0, n_out - j0, wf.shape[-1] - s_src)
        if n <= 0:
            continue
        out[..., j0:j0 + n] += wf[..., s_src:s_src + n] * env[k0:k0 + n]
    return out, spans


def ref_audio_latents(audio_vae, project, seg, sources):
    """Encoded <Audio j> references of a segment (first REF_AUDIO_MAX_SEC seconds of each)."""
    out = []
    for a in core.audio_refs(project, seg)[:core.MAX_REF_AUDIOS]:
        src = sources.get(a["id"])
        if src is None or audio_vae is None:
            log(f"audio reference {a['name']!r} skipped ({'no audio_vae' if audio_vae is None else 'not connected'})")
            continue
        n = int(core.REF_AUDIO_MAX_SEC * int(src["sample_rate"]))
        out.append(encode_audio(audio_vae, {"waveform": src["waveform"][..., :n], "sample_rate": src["sample_rate"]}).float().cpu())
    return out


def video_canvas(vw, vh):
    """Reference-video canvas of MiniMaxH3ReferenceToVideo (768 short edge, 768*1344 area cap, /32; never upscaled)."""
    try:
        from comfy_extras.nodes_minimax_h3 import adapt_canvas
        cw, ch = adapt_canvas(vw, vh)
    except Exception:
        r, m = vw / vh, core.CANVAS_MULTIPLE
        nw, nh = (768 * r, 768) if r >= 1 else (768, 768 / r)
        if nw * nh > 768 * 1344:
            k = math.sqrt(768 * 1344 / (nw * nh))
            nw, nh = nw * k, nh * k
        cw, ch = max(m, round(nw / m) * m), max(m, round(nh / m) * m)
    if vw * vh < cw * ch:
        m = core.CANVAS_MULTIPLE
        cw, ch = max(m, round(vw / m) * m), max(m, round(vh / m) * m)
    return cw, ch


def ref_video_frames(asset, target_frames):
    """<Video k> reference: the first min(file, 15 s, target) frames at 24 fps on the reference canvas, 17k+5."""
    path = asset_path(asset)
    info = media.video_info(path)
    n = min(info["frames"], int(core.REF_VIDEO_MAX_SEC * core.FPS), int(target_frames))
    if n < 5:
        raise ValueError(f"H3ZeroStudio: видео-референс «{asset.get('name')}» короче 5 кадров")
    while n % 17 != 5:
        n -= 1
    cw, ch = video_canvas(info["width"], info["height"])
    return torch.from_numpy(media.load_video_frames(path, 0, n, cw, ch, mode="stretch"))


def footage_latents(vae, audio_vae, asset, src, frames, w, h, audio_t):
    """Footage clip -> (video latent, audio latent, pixel frames): its frames from src["in"], VAE-encoded at the
    project size (cover + center crop); the file's sound encoded with audio_vae (silence without one)."""
    path = asset_path(asset)
    px = torch.from_numpy(media.load_video_frames(path, src["in"], frames, w, h, mode="crop"))
    v = vae.encode(px).float().cpu()
    a = None
    if audio_vae is not None:
        try:
            wf, sr = media.load_audio(path)
            i0 = int(round(src["in"] / core.FPS * sr))
            n = int(round(frames / core.FPS * sr))
            seg = torch.zeros(wf.shape[0] or 2, n)
            part = torch.from_numpy(wf[:, i0:i0 + n])
            seg[:, :part.shape[1]] = part
            a = encode_audio(audio_vae, {"waveform": seg[None], "sample_rate": sr}).float().cpu()
        except ValueError:   # no audio stream
            a = None
    if a is None:
        a = torch.zeros(1, 32, 2, audio_t)
    if a.shape[-1] < audio_t:
        a = torch.nn.functional.pad(a, (0, audio_t - a.shape[-1]))
    return v, a[..., :audio_t], px


def decode_video(vae, v):
    img = vae.decode(v)
    return img.reshape((-1,) + tuple(img.shape[-3:]))[..., :3].float().cpu()


def refine_sigmas(model, steps, scheduler, sigma0):
    """Schedule of the refine pass: the model's own `scheduler` curve below sigma0, resampled to `steps` steps.
    H3 refine passes are set by their start sigma (0.25-0.45 is the proven range): a denoise *fraction* is
    misleading under H3's shift 12 (denoise 0.5 starts at sigma ~0.9, almost a new generation)."""
    ms = model.get_model_object("model_sampling")
    full = comfy.samplers.calculate_sigmas(ms, scheduler, 1000).float().cpu()
    keep = full[full <= float(sigma0) + 1e-6]
    if keep.numel() < steps + 1:
        return torch.linspace(float(sigma0), 0.0, steps + 1)
    idx = torch.linspace(0, keep.numel() - 1, steps + 1).round().long()
    out = keep[idx].clone()
    out[0] = float(sigma0)   # start exactly at the set strength (the curve point is a hair below it)
    return out.contiguous()


def upscale_video_latent(vae, v, w, h, method="learned", frames=None):
    """Video latent [1,24,T,h',w'] -> the w x h canvas: the learned H3 latent upscaler (default) or RTX VSR ->
    VAE encode ("rtx"), each the other's fallback; neither = h3s_upscale.UpscaleUnavailable (clear error).
    Audio is never touched."""
    if tuple(v.shape[-2:]) == (h // 16, w // 16):
        return v
    from . import h3s_upscale
    return h3s_upscale.upscale_input(vae, v, w, h, "rtx" if method == "rtx" else "learned", frames)[0]


# ---------------------------------------------------------------- one segment
def sample_segment(model, clip, vae, project, index, items, prev, ref_images, audio_z=None, step_cb=None, preview_cb=None,
                   audio_cov=None, ref_audios=None, ref_videos=None, init=None, kind="full", refine=None):
    """prev: dict(v, a, last_frame) of the finished previous segment (or None), of the same pass kind.
    kind: "full" | "draft" (canvas/steps of the pass) | "refine": `refine` = (upscaled video latent, draft audio
    latent); the video is re-sampled with partial denoise, the draft audio is kept 1:1 through the H3 audio
    denoise mask (it already holds the continuation and the locked track).
    Returns (video_latent [1,24,T,h,w], audio_latent [1,32,2,A]) on CPU."""
    s = project["settings"]
    it = items[index]
    p = core.pass_params(project, index, kind)
    w, h = core.work_resolution(s, kind)
    T, A = it["latent_t"], it["audio_t"]
    dev = comfy.model_management.intermediate_device()
    video = torch.zeros([1, 24, T, h // 16, w // 16], device=dev)
    audio = torch.zeros([1, 32, 2, A], device=dev)
    if init is not None:   # vid2vid: start from the footage latent, partial denoise
        iv, ia = init
        video[:, :, :min(T, iv.shape[2])] = iv[:, :, :T].to(video.device, video.dtype)
        audio[..., :min(A, ia.shape[-1])] = ia[..., :A].to(audio.device, audio.dtype)
        p["denoise"] = float(project["segments"][index]["source"]["denoise"])
    if refine is not None:   # final from the draft: start from the upscaled draft, partial denoise
        rv_, ra_ = refine
        video[:, :, :min(T, rv_.shape[2])] = rv_[:, :, :T].to(video.device, video.dtype)
        audio[..., :min(A, ra_.shape[-1])] = ra_[..., :A].to(audio.device, audio.dtype)
    lock_v = w_v = lock_a = w_a = None
    # audio that must be kept (previous tail / locked track) goes through H3's native denoise mask: those
    # rows are injected clean every step and labelled with the clean timestep, so the model hears them as
    # context from the first step on (an x0 replacement only showed it a noised copy -> no real continuation)
    amask = torch.ones([1, 1, 2, A])
    keyframes = []
    cont = it["link"] == "extend" and prev is not None
    if cont and it["overlap"]:
        ov_t = core.latent_t(it["overlap"])                    # 5o+2 latent frames
        pv, pa = prev["v"], prev["a"]
        tail_v = pv[:, :, pv.shape[2] - ov_t:].to(video.dtype)
        f_start = items[index - 1]["frames"] - it["overlap"]   # pixel frame inside prev where the overlap starts
        a_ov = pa.shape[-1] - round(f_start / core.FPS * core.AUDIO_LATENT_FPS)
        a_ov = max(0, min(a_ov, A))
        video[:, :, :ov_t] = tail_v.to(video.device)
        keyframes.append({"resolved_frame_index": 0, "latent": tail_v.clone()})
        if s.get("lock_overlap", True):
            lock_v = video.clone()
            w_v = torch.zeros(T)
            w_v[:ov_t] = 1.0
        # audio: the new segment continues the previous sound (own switch, independent of the video lock)
        if a_ov and core.audio_lock_overlap(project) and refine is None:
            s0 = pa.shape[-1] - a_ov                       # audio frame of prev where the overlap starts
            tail_a = pa[..., s0:].float()
            # 1) the overlap audio is copied into the target and protected with H3's audio denoise mask
            audio[..., :a_ov] = tail_a.to(audio.device, audio.dtype)
            lock_a = audio.clone()
            w_a = torch.zeros(A)
            w_a[:a_ov] = 1.0
            ramp = core.AUDIO_HANDOFF_TICKS if core.AUDIO_HANDOFF_TICKS and a_ov > 2 * core.AUDIO_HANDOFF_TICKS else 0
            if ramp:   # the last ticks gradually receive denoising: soft hand-off into the new sound
                w_a[a_ov - ramp:a_ov] = 1.0 - torch.arange(1, ramp + 1, dtype=torch.float32) / (ramp + 1)
            # 2) the previous sound as clean cond rows on this clip's timeline, ending where the overlap ends and
            #    reaching back before it (audio_context_sec): the model hears "this clip, earlier", not a reference
            ext = core.audio_context_extra(project, a_ov, s0)   # extra audio frames before the overlap (multiple of 5)
            kf_idx = -(ext * 3 // 5)                              # 5 audio frames = 3 pixel frames (FRAME_RESCALE 5/3)
            keyframes.append({"resolved_frame_index": kf_idx, "audio_latent": pa[..., s0 - ext:].float().clone()})
            vlog(f"  audio context: overlap {a_ov} fr ({a_ov / core.AUDIO_LATENT_FPS:.2f}s, prev frames {s0}-{pa.shape[-1] - 1})"
                 f" + {ext} fr ({ext / core.AUDIO_LATENT_FPS:.2f}s) before it as cond audio at pixel frame {kf_idx}; hand-off ramp {ramp} fr")
    if refine is not None:   # the whole draft sound is kept: continuation and locked track are already in it
        lock_a, w_a = audio.clone(), torch.ones(A)
        vlog(f"  refine: draft {tuple(refine[0].shape)} -> {w}x{h}, start sigma {p['sigma0']}, {p['steps']} steps, "
             f"draft audio kept ({A / core.AUDIO_LATENT_FPS:.2f}s)")
    elif audio_z is not None:   # audio track = main composition: locked where a clip lies
        sl, wt = slice_audio_latent(audio_z, it["start"], A, audio_cov)
        if wt.sum() > 0:
            if lock_a is None:
                lock_a, w_a = sl.to(audio.dtype), wt
            else:   # the track wins over the previous segment's tail
                lock_a = torch.where(wt.bool(), sl.to(lock_a.dtype), lock_a)
                w_a = torch.maximum(w_a, wt)
            audio = lock_a * w_a + audio * (1 - w_a)
    if cont and it["overlap"]:
        vlog(f"  seam {index}->{index + 1}: overlap {it['overlap']} fr ({core.latent_t(it['overlap'])} latent fr) "
             f"video {'locked' if lock_v is not None else 'keyframe only'}; audio overlap "
             f"{'kept from the draft (whole clip)' if refine is not None else 'locked to previous tail' if (lock_a is not None and core.audio_lock_overlap(project)) else 'free'}")
    if audio_z is not None and w_a is not None:
        vlog(f"  audio lock: {float(w_a.sum()) / core.AUDIO_LATENT_FPS:.2f}s of {A / core.AUDIO_LATENT_FPS:.2f}s fixed "
             f"(track clips{' + previous tail' if cont and it['overlap'] else ''})")
    images = list(ref_images)
    if cont and core.continuity_picture(project, index):
        images.append(prev["last_frame"])
    if len(images) > core.MAX_REF_IMAGES:
        raise ValueError(f"H3ZeroStudio: отрезок {index + 1}: {len(images)} референсов, максимум {core.MAX_REF_IMAGES}")
    if kind == "refine":   # final-from-draft ignores video references (slow, VRAM-hungry): the draft already has the motion
        ref_videos = None
    prompt = core.compose_prompt(project, index, video=(kind != "refine"))
    if VERBOSE[0]:
        seg = project["segments"][index]
        labels = [f"<Picture {j + 1}>={a.get('name') or a.get('file')}" for j, a in enumerate(core.ordered_refs(project, seg))]
        if cont and core.continuity_picture(project, index):
            labels.append(f"<Picture {len(labels) + 1}>=last frame of segment {index}")
        labels += [f"<Audio {j + 1}>={a.get('name') or a.get('id')}" for j, a in enumerate(core.audio_refs(project, seg))]
        if kind != "refine":
            labels += [f"<Video {k + 1}>={a.get('name')}" for k, a in enumerate(core.video_refs(project, seg)[:core.MAX_REF_VIDEOS])]
        vlog(f"  mode {'vid2vid denoise ' + str(p['denoise']) if init is not None else 'refine from sigma ' + str(p['sigma0']) if refine is not None else kind} · {w}x{h} · start {it['start'] / core.FPS:.2f}s · link {it['link']} · refs: {', '.join(labels) or 'none'}")
        vlog(f"  prompt: {prompt[:220]}{'…' if len(prompt) > 220 else ''}")
    log(f"segment {index + 1}{' [' + kind + ']' if kind != 'full' else ''}: {it['frames']} frames, {len(images)} ref(s), overlap {it['overlap']} fr, "
        f"steps {p['steps']} cfg {p['cfg']} seed {p['seed']} {p['sampler']}/{p['scheduler']}")
    pos = encode_cond(clip, vae, prompt, images, w, h, s.get("ref_size", "match"), ref_audios, ref_videos)
    neg = pos if p["cfg"] == 1.0 else encode_cond(clip, vae, s.get("negative") or "", images, w, h, s.get("ref_size", "match"), ref_audios, ref_videos)
    pos, neg = add_keyframes(pos, keyframes), add_keyframes(neg, keyframes)
    m = apply_shift(model, p["shift_video"], p["shift_audio"]) if p["shift_video"] > 0 else model.clone()
    noise_mask = None
    if w_a is not None and float(w_a.max()) > 0:
        audio = (lock_a * w_a + audio * (1 - w_a)).to(audio.dtype)
        amask = (1.0 - w_a.float().clamp(0, 1)).view(1, 1, 1, A).expand(1, 1, 2, A).contiguous()
        # latent_image is in model space: process_latent_in / scale_latent_inpaint apply audio_scale themselves
        noise_mask = comfy.nested_tensor.NestedTensor((torch.ones([1, 1] + list(video.shape[2:])), amask))
        kept = int((w_a > 0.5).sum())
        ka = audio[..., w_a > 0.5]
        cak = [k for k in keyframes if k.get("audio_latent") is not None]
        log(f"  audio lock: latent {tuple(audio.shape)}, kept {kept}/{A} frames = {kept / core.AUDIO_LATENT_FPS:.2f}s "
            f"(frames {int(torch.nonzero(w_a > 0.5)[0])}-{int(torch.nonzero(w_a > 0.5)[-1])}), "
            f"kept latent mean {float(ka.mean()):+.3f} std {float(ka.std()):.3f}; mask zeros {int((amask < 0.5).sum())} of {amask.numel()}; "
            f"cond audio keyframe {'yes ' + str(tuple(cak[0]['audio_latent'].shape)) + ' at frame ' + str(cak[0]['resolved_frame_index']) if cak else 'no'}")
    if lock_v is not None or noise_mask is not None:
        m.set_model_unet_function_wrapper(LockWrapper(lock_v, w_v, None, None, probe=int((w_a > 0.5).sum()) if noise_mask is not None else None))
    samples = comfy.nested_tensor.NestedTensor((video, audio))
    noise = comfy.sample.prepare_noise(samples, p["seed"])
    sigmas = refine_sigmas(m, p["steps"], p["scheduler"], p["sigma0"]) if refine is not None else None
    if sigmas is not None:
        vlog(f"  refine schedule: {p['steps']} steps from sigma {float(sigmas[0]):.3f} ({p['scheduler']})")
    if hasattr(preview_cb, "set_sigmas"):
        preview_cb.audio_scale = sampler_audio_scale(m) or 1.0
        preview_cb.set_sigmas([float(x) for x in sigmas.tolist()] if sigmas is not None else
                              preview.preview_sigmas(m, p["steps"], p["sampler"], p["scheduler"], p["denoise"]))

    def cb(step, x0, x, total):
        comfy.model_management.throw_exception_if_processing_interrupted()
        if preview_cb is not None:
            try:
                preview_cb(step, x0, x, total)
            except Exception:
                pass
        if step_cb is not None:
            step_cb(step, total)

    out = comfy.sample.sample(m, noise, p["steps"], p["cfg"], p["sampler"], p["scheduler"], pos, neg, samples,
                              denoise=p["denoise"], callback=cb, disable_pbar=True, seed=p["seed"], noise_mask=noise_mask, sigmas=sigmas)
    ov_, oa_ = out.unbind()
    if noise_mask is not None:
        sel = w_a > 0.999
        err = float((oa_.float().cpu()[..., sel] - audio.float().cpu()[..., sel]).abs().max())
        log(f"  audio lock check: kept frames reproduced, max |out - kept| = {err:.2e}" + ("" if err < 1e-2 else "  <-- NOT KEPT"))
    return ov_.float().cpu(), oa_.float().cpu()


def audio_refine_key(base_key, steps, denoise, video_denoise, seed):
    """Cache key of an audio-refined copy of a segment (alphanumeric, like every segment key)."""
    h = hashlib.sha1(json.dumps([steps, round(denoise, 3), round(video_denoise, 3), seed, "ar1"]).encode()).hexdigest()[:10]
    return f"{base_key}A{h}"


def refine_audio(model, clip, vae, project, index, items, v, a, ar, ref_images, ref_audios=None, step_cb=None):
    """«Улучшить звук»: extra sampler steps over the SOUND of a finished segment (own implementation of the
    H3-AudioRefine idea). The video latent is frozen by the noise mask (video_denoise 0 -> bit-identical),
    the audio latent is re-noised by `denoise` (0.3-0.6 keeps the sound and adds detail, 1.0 = new sound) and
    re-sampled with the segment's own prompt / cfg / sampler / scheduler / shift.
    ar = dict(steps, denoise, video_denoise). Returns (video_latent, audio_latent) on CPU."""
    s = project["settings"]
    p = core.pass_params(project, index, "full")
    steps, den, vden = int(ar["steps"]), float(ar["denoise"]), float(ar["video_denoise"])
    h, w = int(v.shape[-2]) * 16, int(v.shape[-1]) * 16
    A = int(a.shape[-1])
    dev = comfy.model_management.intermediate_device()
    video, audio = v.to(dev).float().clone(), a.to(dev).float().clone()
    images = list(ref_images)[:core.MAX_REF_IMAGES]
    prompt = core.compose_prompt(project, index, video=True)
    pos = encode_cond(clip, vae, prompt, images, w, h, s.get("ref_size", "match"), ref_audios, None)
    neg = pos if p["cfg"] == 1.0 else encode_cond(clip, vae, s.get("negative") or "", images, w, h, s.get("ref_size", "match"), ref_audios, None)
    m = apply_shift(model, p["shift_video"], p["shift_audio"]) if p["shift_video"] > 0 else model.clone()
    # noise mask: 1 = re-sampled, 0 = kept exactly
    vmask = torch.full([1, 1] + list(video.shape[2:]), max(0.0, min(1.0, vden)))
    amask = torch.ones([1, 1, 2, A])
    noise_mask = comfy.nested_tensor.NestedTensor((vmask, amask))
    samples = comfy.nested_tensor.NestedTensor((video, audio))
    seed = int(p["seed"])
    noise = comfy.sample.prepare_noise(samples, seed)
    log(f"segment {index + 1} [audio refine]: {steps} steps, audio denoise {den}, video denoise {vden}, "
        f"cfg {p['cfg']} {p['sampler']}/{p['scheduler']}, {A / core.AUDIO_LATENT_FPS:.2f}s of sound")

    def cb(step, x0, x, total):
        comfy.model_management.throw_exception_if_processing_interrupted()
        if step_cb is not None:
            step_cb(step, total)

    out = comfy.sample.sample(m, noise, steps, p["cfg"], p["sampler"], p["scheduler"], pos, neg, samples,
                              denoise=den, callback=cb, disable_pbar=True, seed=seed, noise_mask=noise_mask)
    ov_, oa_ = out.unbind()
    if vden <= 0:
        err = float((ov_.float().cpu() - v.float()).abs().max())
        log(f"  audio refine: video frozen check max |out - in| = {err:.2e}" + ("" if err < 1e-2 else "  <-- VIDEO CHANGED"))
        ov_ = v.to(ov_.dtype).to(ov_.device)   # bit-identical picture regardless of numeric noise
    return ov_.float().cpu(), oa_.float().cpu()


# ---------------------------------------------------------------- live preview
# MiniMaxH3Video.latent_rgb_factors (comfy/latent_formats.py), used if the model does not expose them
H3_RGB = [[-0.018555, 0.024344, -0.017536], [0.150164, 0.137244, 0.129221], [0.027367, -0.050369, -0.208606],
          [-0.000793, -0.164622, -0.323161], [-0.048556, 0.013970, -0.074286], [0.011740, 0.014172, -0.006906],
          [0.061517, 0.061212, 0.110025], [0.035321, 0.086879, 0.110059], [-0.017426, 0.002997, 0.035356],
          [0.531539, 0.548819, 0.624404], [-0.024968, -0.040234, -0.034302], [-0.032549, -0.029096, -0.017221],
          [0.022609, 0.020286, 0.050661], [-0.084001, -0.038131, -0.020805], [-0.018830, 0.010412, 0.061120],
          [0.020777, 0.011196, -0.030994], [-0.008390, -0.012201, -0.025687], [-0.013281, -0.002924, 0.006331],
          [0.000260, 0.001833, -0.011038], [0.105471, 0.100482, 0.132106], [0.016529, 0.015213, 0.009999],
          [-0.014015, -0.017438, -0.019134], [-0.033787, -0.009984, -0.019725], [0.004224, 0.017284, 0.027196]]
H3_RGB_BIAS = [0.057426, -0.022078, -0.071449]


def latent_rgb(model):
    lf = getattr(getattr(model, "model", None), "latent_format", None)
    f = getattr(lf, "latent_rgb_factors", None)
    b = getattr(lf, "latent_rgb_factors_bias", None)
    if f is None or len(f) < 24:
        f, b = H3_RGB, H3_RGB_BIAS
    return torch.tensor(f[:24], dtype=torch.float32), torch.tensor(b or [0.0, 0.0, 0.0], dtype=torch.float32)


LIVE_MIN_INTERVAL = 0.25  # s between live preview updates (last step always sent)
LIVE_AUDIO_INTERVAL = 1.5  # s between audio preview decodes


class LivePreview:
    """Per-step preview of the segment being sampled (see h3s_preview): the predicted x0 is decoded with the
    tiny VAE taeh3 (or H3's latent->RGB projection as a fallback), sent as one JPEG sprite over the websocket
    ("h3zero.progress" event "live"); with an audio VAE the audio stream is decoded too and sent as a short
    WAV URL. Every step also records sigma, delta (RMS change of x0) and step time for the dynamics panel."""

    def __init__(self, notify, model, seg, min_interval=None, max_frames=None, tile_h=None, settings=None,
                 audio_vae=None, out_dir=None, sub=None):
        s = settings or {}
        self.notify, self.seg = notify, seg
        self.factors, self.bias = latent_rgb(model)
        self.min_interval = LIVE_MIN_INTERVAL if min_interval is None else min_interval
        self.max_frames = int(max_frames or s.get("preview_frames") or 48)
        self.fps = float(s.get("preview_fps") or 0)
        self.max_res = int(s.get("preview_max_res", 512) or 0)
        self.quality = int(s.get("preview_quality", 80) or 80)
        self.tile_h = tile_h
        self.dec = None
        path = preview.resolve_tiny_vae(s.get("preview_tiny_vae", "auto"))
        if path:
            dec = preview.load_tiny_vae(path)
            if dec is not None and dec.latent_channels == 24:
                self.dec = dec
                self.tae_name = os.path.basename(path)
        self.audio_vae = None   # the live preview is silent: mid-sampling audio sounded awful (user feedback)
        self.out_dir, self.sub = out_dir, sub
        self.audio_scale = 1.0
        self.sigmas = []
        self.extra = None
        self.last = 0.0
        self.last_audio = 0.0
        self.sent = 0
        self.prev_v = None
        self.t_step = time.perf_counter()
        self.dyn = {}

    def set_sigmas(self, sigmas):
        self.sigmas = list(sigmas or [])
        self.t_step = time.perf_counter()
        self.notify("sigmas", seg=self.seg, sigmas=self.sigmas)

    @staticmethod
    def parts(x0):
        if getattr(x0, "is_nested", False) or hasattr(x0, "tensors"):
            t = x0.tensors if hasattr(x0, "tensors") else x0.unbind()
            return t[0], (t[1] if len(t) > 1 else None)
        return x0, None

    def video_part(self, x0):
        v = self.parts(x0)[0]
        return v[:, :24] if v is not None and v.ndim == 5 else None

    def frames(self, x0):
        v = self.video_part(x0)
        if v is None:
            return None, None
        v = v[0].detach()
        T = v.shape[1]
        idx = preview.pick_frames(T, self.max_frames)
        rgb = None
        if self.dec is not None:
            try:
                rgb = preview.tiny_decode(self.dec, v, idx, self.max_res)
            except Exception as e:
                log(f"live preview: tiny VAE failed, falling back to latent2rgb: {e}")
                self.dec = None
        if rgb is None:
            vv = v.float()
            f, b = self.factors.to(vv.device), self.bias.to(vv.device)
            rgb = ((torch.einsum("cthw,cr->thwr", vv[:, idx], f) + b + 1.0) / 2.0).clamp(0, 1).cpu()
        return rgb, preview.durations(T, idx, self.fps)

    def audio_url(self, x0):
        a = self.parts(x0)[1]
        if self.audio_vae is None or a is None or self.out_dir is None:
            return None
        try:
            wav = decode_audio(self.audio_vae, (a[:1].detach().float() / self.audio_scale).to(a.device))
            name = f"live_{self.seg}_{self.sent % 4}.wav"
            os.makedirs(os.path.join(self.out_dir, "live"), exist_ok=True)
            media.write_wav(os.path.join(self.out_dir, "live", name), wav["waveform"][0], wav["sample_rate"])
            return {"filename": name, "subfolder": (self.sub or "") + "/live", "type": "output", "v": self.sent}
        except Exception as e:
            log(f"live preview: audio decode failed, audio preview off: {e}")
            self.audio_vae = None
            return None

    def track(self, step, x0, total):
        now = time.perf_counter()
        ms = (now - self.t_step) * 1000.0
        self.t_step = now
        v = self.video_part(x0)
        delta = None
        if v is not None:
            cur = v[0, :, :, ::2, ::2].detach().float().cpu()   # half resolution is plenty for an RMS
            delta = preview.step_delta(cur, self.prev_v)
            self.prev_v = cur
        sig = self.sigmas[step] if 0 <= step < len(self.sigmas) else None
        sig_next = self.sigmas[step + 1] if 0 <= step + 1 < len(self.sigmas) else None
        self.dyn = {"sigma": sig, "sigma_next": sig_next, "delta": delta, "ms": round(ms, 1)}
        return now

    def __call__(self, step, x0, x, total):
        now = self.track(step, x0, total)
        if self.extra is not None:
            try:
                self.extra(step, x0, x, total)
            except Exception:
                pass
        last = step + 1 >= total
        if not last and now - self.last < self.min_interval:
            return
        self.last = now
        rgb, dur = self.frames(x0)
        if rgb is None:
            return
        th = self.tile_h or (min(rgb.shape[1], self.max_res) if self.dec is not None and self.max_res else rgb.shape[1] if self.dec is not None else 144)
        data, tw, th, cols = media.sprite_grid(rgb, th, self.quality if self.dec is not None else 72)
        aud = None
        if self.audio_vae is not None and (last or now - self.last_audio >= LIVE_AUDIO_INTERVAL):
            self.last_audio = now
            aud = self.audio_url(x0)
        self.sent += 1
        self.notify("live", seg=self.seg, step=step + 1, steps=total, n=int(rgb.shape[0]), tw=tw, th=th, cols=cols,
                    dur=dur, img=data, mode="taeh3" if self.dec is not None else "latent2rgb", audio=aud)


# ---------------------------------------------------------------- whole project
STATUS = {}   # node id -> run status for the editor's polling fallback (/h3zero/status)
STATUS_KEEP = ("start", "seg_start", "step", "seg_done", "done", "error")


class Notifier:
    """Sends progress over the websocket and mirrors it into STATUS, so an editor that missed events
    (background tab, re-render, reconnect) can catch up by polling."""

    def __init__(self, node_id, run_id=None):
        self.node_id = str(node_id) if node_id is not None else None
        self.run_id = run_id or f"r{int(time.time() * 1000):x}"
        self.seq = 0
        try:
            from server import PromptServer
            self.inst = getattr(PromptServer, "instance", None)
        except Exception:
            self.inst = None

    def record(self, event, d):
        if self.node_id is None or event not in STATUS_KEEP:
            return
        st = STATUS.get(self.node_id)
        if event == "start" or st is None or st.get("run") != self.run_id:
            st = STATUS[self.node_id] = {"run": self.run_id, "seq": 0, "active": True, "start": None, "progress": None,
                                         "results": {}, "done": None, "error": None, "t": time.time()}
        st["seq"] = self.seq
        st["t"] = time.time()
        if event == "start":
            st["start"] = {k: v for k, v in d.items() if k not in ("node", "event")}
        elif event in ("seg_start", "step", "uptile"):
            st["progress"] = {k: v for k, v in d.items() if k not in ("node",)}
            if event == "seg_start":
                st["phase"] = None
        elif event == "phase":
            st["phase"] = {k: v for k, v in d.items() if k not in ("node",)}
        elif event == "seg_done":
            st["results"][str(d.get("seg"))] = d.get("result")
        elif event == "done":
            st["done"] = {k: v for k, v in d.items() if k not in ("node", "event")}
            st["active"] = False
        elif event == "error":
            st["error"] = d.get("message")
            st["active"] = False

    def __call__(self, event, **data):
        self.seq += 1
        d = dict(data)
        d["node"], d["event"], d["run"], d["seq"] = self.node_id, event, self.run_id, self.seq
        try:
            self.record(event, d)
        except Exception:
            pass
        if self.inst is None:
            return
        try:
            self.inst.send_sync("h3zero.progress", d)
        except Exception:
            pass


def run_status(node_id):
    st = STATUS.get(str(node_id))
    if not st:
        return None
    out = dict(st)
    out["results"] = dict(st["results"])
    return out


def project_dir(project):
    import folder_paths
    sub = os.path.join("h3zerostudio", project["id"])
    d = os.path.join(folder_paths.get_output_directory(), sub)
    os.makedirs(os.path.join(d, "cache"), exist_ok=True)
    return d, sub.replace("\\", "/")


def seg_pt_path(d, key, frozen=False):
    """Latent file of a segment: cache/seg_<key>.pt, or frozen/seg_<key>.pt for a frozen one (falls back to the cache)."""
    if frozen:
        fp = os.path.join(d, "frozen", f"seg_{key}.pt")
        if os.path.isfile(fp):
            return fp
    return os.path.join(d, "cache", f"seg_{key}.pt")


def freeze_segment(project_id, key):
    """«Зафиксировать»: copy a segment's latent and preview files to <project>/frozen/, out of reach of
    «Очистить кэш». Returns the freeze record for the segment."""
    import re
    import shutil
    import folder_paths
    pid = re.sub(r"[^A-Za-z0-9_-]", "", str(project_id or ""))
    key = re.sub(r"[^A-Za-z0-9]", "", str(key or ""))
    if not pid or not key:
        raise ValueError("no project id / key")
    sub = f"h3zerostudio/{pid}"
    d = os.path.join(folder_paths.get_output_directory(), "h3zerostudio", pid)
    src = os.path.join(d, "cache", f"seg_{key}.pt")
    fdir = os.path.join(d, "frozen")
    os.makedirs(fdir, exist_ok=True)
    dst = os.path.join(fdir, f"seg_{key}.pt")
    if not os.path.isfile(dst):
        if not os.path.isfile(src):
            raise FileNotFoundError(f"cache/seg_{key}.pt not found (cache cleared?) — generate the segment again")
        shutil.copy2(src, dst + ".part")
        media.replace_file(dst + ".part", dst)
    data = torch.load(dst, map_location="cpu", weights_only=True)
    frames = core.frames_for_latent(int(data["v"].shape[2]))
    out = {"key": key, "frames": frames, "file": view_ref(sub + "/frozen", f"seg_{key}.pt"), "created": int(time.time())}
    for kind, name in (("video", f"seg_{key}.mp4"), ("strip", f"seg_{key}_tiles.jpg"), ("poster", f"seg_{key}_poster.jpg")):
        sp, dp = os.path.join(d, name), os.path.join(fdir, name)
        if not os.path.isfile(dp) and os.path.isfile(sp):
            shutil.copy2(sp, dp)
        if os.path.isfile(dp):
            out[kind] = view_ref(sub + "/frozen", name)
    try:
        from . import h3s_library
        h3s_library.gallery_mark_frozen(d, key)
    except Exception:
        pass
    return out


def video_asset_info(ref, strip=True):
    """Info + poster of an uploaded video file (for the Assets panel); posters cached in output/h3zerostudio/_thumbs.
    strip=False skips the filmstrip (the editor asks for it lazily, so importing / editing stays fast)."""
    import folder_paths
    path = asset_path({"file": ref.get("filename", ""), "subfolder": ref.get("subfolder", ""), "type": ref.get("type", "input"),
                       "name": ref.get("filename")})
    info = media.video_info(path)
    tag = hashlib.sha256(f"{path}|{file_sig(path)}".encode()).hexdigest()[:16]
    tdir = os.path.join(folder_paths.get_output_directory(), "h3zerostudio", "_thumbs")
    os.makedirs(tdir, exist_ok=True)
    name = f"v_{tag}.jpg"
    fps = 24
    if not os.path.isfile(os.path.join(tdir, name)):
        tw = 320
        th = max(16, int(round(tw * info["height"] / max(1, info["width"]))))
        fr = media.sample_video_frames(path, [min(info["frames"] // 10, 48) / fps], tw, th)
        media.write_poster(os.path.join(tdir, name), torch.from_numpy(fr[0].astype(np.float32) / 255.0), max_width=tw)
    info["poster"] = view_ref("h3zerostudio/_thumbs", name)
    if not strip:
        info["strip"], info["strip_n"] = None, 0
        return info
    # filmstrip for the footage clip on the timeline: tiles evenly over the WHOLE file (the clip maps its in-point/
    # length onto it), about 2 per second, so trimmed clips still show the right frames
    n_all = max(1, int(info["frames"]))
    count = max(1, min(n_all, max(media.STRIP_COUNT, int(info["duration"] * 2)), 240))
    sname = f"vs_{tag}_{count}.jpg"
    if not os.path.isfile(os.path.join(tdir, sname)):
        th = 72
        tw = max(8, int(round(th * info["width"] / max(1, info["height"]))))
        times = [min(n_all - 1, int((j + 0.5) * n_all / count)) / fps for j in range(count)]
        frs = media.sample_video_frames(path, times, tw, th)
        media.write_strip(os.path.join(tdir, sname), torch.from_numpy(frs.astype(np.float32) / 255.0), count=count, height=th)
    info["strip"] = view_ref("h3zerostudio/_thumbs", sname)
    info["strip_n"] = count
    return info


def export_dir():
    import folder_paths
    return os.path.join(folder_paths.get_output_directory(), "h3zerostudio", "export")


def safe_name(name, default="h3zerostudio"):
    import re
    n = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", str(name or "")).strip(" .")[:120] or default
    return n[:-4] if n.lower().endswith(".mp4") else n


def export_video(body):
    """«Сохранить видео»: source mp4 (the stitched result or one clip's preview) -> <folder>/<name>.mp4.
    body: {source: view ref, folder ("" = output/h3zerostudio/export, relative = inside output), name,
    range: [start, end] frames of the source or None, project (for the music track, optional)}.
    Never overwrites: name_2, name_3 ..."""
    import shutil
    import folder_paths
    src_ref = body.get("source") or {}
    src = asset_path({"file": src_ref.get("filename", ""), "subfolder": src_ref.get("subfolder", ""),
                      "type": src_ref.get("type", "output"), "name": src_ref.get("filename")})
    folder = str(body.get("folder") or "").strip().strip('"')
    if not folder:
        folder = export_dir()
    elif not os.path.isabs(os.path.expanduser(folder)):
        folder = os.path.join(folder_paths.get_output_directory(), folder)
    folder = os.path.abspath(os.path.expanduser(folder))
    os.makedirs(folder, exist_ok=True)
    base = safe_name(body.get("name"))
    dst = os.path.join(folder, base + ".mp4")
    k = 2
    while os.path.exists(dst):
        dst = os.path.join(folder, f"{base}_{k}.mp4")
        k += 1
    rng = body.get("range")
    fps = core.FPS
    start, end = 0, None
    if isinstance(rng, (list, tuple)) and len(rng) == 2:
        start, end = max(0, int(rng[0])), max(0, int(rng[1]))
        if end <= start:
            raise ValueError("пустой диапазон")
    music = None
    proj = body.get("project")
    if proj:
        music = export_audio(core.normalize_project(proj), src, start, end, fps, body.get("timeline_start", 0))
    if music is None and start == 0 and end is None:
        shutil.copy2(src, dst + ".part.mp4")
        media.replace_file(dst + ".part.mp4", dst)
        n = media.video_info(dst)["frames"]
    else:
        wf, sr = music if music is not None else (None, None)
        dc = core.normalize_project(proj)["settings"].get("audio_declick", True) if proj else True
        n = media.export_video(src, dst, start, end, fps, wf, sr, declick=dc)
    log(f"export: {dst} ({n} frames, {n / fps:.2f}s)" + (" + music" if music is not None else ""))
    return {"path": dst, "frames": n, "seconds": round(n / fps, 3), "folder": folder}


def export_audio(proj, src, start, end, fps, timeline_start=0):
    """Export sound: the file's own (generated) sound at audio.video_volume + the music lane clips mixed over it.
    start/end: frames of the source file; timeline_start: timeline frame of the file's frame 0.
    None = nothing to mix (keep the file's sound as is)."""
    music = core.music_clips(proj)
    vv = float(proj["audio"].get("video_volume", 1.0))
    if not music and vv == 1.0:
        return None
    if end is None:
        end = media.video_info(src)["frames"]
    try:
        wf, sr = media.load_audio(src)
        own = torch.from_numpy(wf)
    except ValueError:
        own, sr = None, 44100
    sources = {}
    for aid in {c["asset"] for c in music}:
        try:
            sources.update(audio_sources({"audio": {"clips": [{"asset": aid, "lane": 0}]}, "segments": [], "assets": proj["assets"]}, None))
        except Exception as e:
            log(f"export: music {aid} skipped ({e})")
    if own is None and sources:
        sr = max(int(x["sample_rate"]) for x in sources.values())
    n = int(round((end - start) / fps * sr))
    mix = torch.zeros(1, 2, n)
    if own is not None:
        o = own[:, int(round(start / fps * sr)):][:, :n]
        o = o.repeat(2, 1) if o.shape[0] == 1 else o[:2]
        mix[0, :, :o.shape[-1]] += o * vv
    if sources:
        m, _ = mix_clips(music, sources, sr, (timeline_start + start) / fps, n)
        mix += m
    peak = float(mix.abs().max()) if n else 0.0
    if peak > 1.0:   # soft protection against clipping of the sum
        mix = mix / peak * 0.98
    return mix[0].numpy(), sr


def view_ref(sub, name):
    return {"filename": name, "subfolder": sub, "type": "output"}


class vram_headroom:
    """Keep `gb` of VRAM free while the run samples / decodes: ComfyUI's own reserve
    (model_management.EXTRA_RESERVED_VRAM, the --reserve-vram value), raised for the run and put back afterwards,
    also after an interrupt. Never lowers a larger reserve set at launch. The loader then streams a few more weights
    from RAM instead of over-committing the card (Windows paging VRAM over PCIe makes a run crawl).
    Idea after chanon/comfyui-obvpm-timeline («H3 VRAM Headroom»)."""

    def __init__(self, gb):
        try:
            self.gb = max(0.0, min(8.0, float(gb or 0)))
        except (TypeError, ValueError):
            self.gb = 0.0
        self.old = None

    def __enter__(self):
        mm = comfy.model_management
        if self.gb > 0 and hasattr(mm, "EXTRA_RESERVED_VRAM") and mm.cpu_state == mm.CPUState.GPU:
            want = int(self.gb * 1024 ** 3)
            if want > mm.EXTRA_RESERVED_VRAM:
                self.old = mm.EXTRA_RESERVED_VRAM
                mm.EXTRA_RESERVED_VRAM = want
                vlog(f"VRAM headroom: {self.gb:g} GB kept free during the run (was {self.old / 1024 ** 3:.2f} GB)")
        return self

    def __exit__(self, *exc):
        if self.old is not None:
            comfy.model_management.EXTRA_RESERVED_VRAM = self.old
        return False


def run_project(model, clip, vae, project, audio_vae=None, audio=None, node_id=None, preview_factory=None):
    try:
        try:
            gb = core.normalize_project(project)["settings"].get("vram_headroom_gb", 1.0)
        except Exception:
            gb = 1.0
        with vram_headroom(gb):
            return _run_project(model, clip, vae, project, audio_vae, audio, node_id, preview_factory)
    except BaseException as e:   # interrupted / failed: the polling editor must see the run as ended
        st = STATUS.get(str(node_id)) if node_id is not None else None
        if st and st.get("active"):
            st["active"], st["error"], st["t"] = False, (str(e) or type(e).__name__)[:300], time.time()
        raise


def _run_project(model, clip, vae, project, audio_vae=None, audio=None, node_id=None, preview_factory=None):
    proj = core.limited_project(core.normalize_project(project))
    rk = proj["run"].get("kind")   # per-run override: ✎ draft / ✦ final from the draft of one clip, «✦ Чистовики»
    if rk == "draft":
        proj["settings"]["quality"] = "draft"
    elif rk in ("refine", "full"):
        proj["settings"]["quality"] = "final"
        proj["settings"]["final_mode"] = rk
    if not proj["segments"]:
        raise ValueError("H3ZeroStudio: на таймлайне нет отрезков. Откройте редактор и добавьте отрезок.")
    est = core.estimate(proj)
    for wmsg in est["warnings"]:
        log("⚠ " + wmsg)
    hard = [x for x in est["warnings"] if "максимум" in x]
    if hard:
        raise ValueError("H3ZeroStudio: " + "; ".join(hard))
    all_items = core.plan(proj)
    items = core.run_items(proj, all_items)
    s = proj["settings"]
    VERBOSE[0] = bool(s.get("verbose_log", True))
    notify = Notifier(node_id)
    by_id = {a["id"]: a for a in proj["assets"]}
    ref_sigs, fsigs = {}, {}
    from . import h3s_store as store
    for seg in proj["segments"]:
        for rid in seg["refs"] + ([seg["source"]["asset"]] if seg.get("source") else []):
            if rid in by_id and rid not in ref_sigs:
                # same CONTENT -> same signature (a copy / zip import / re-save no longer changes the cache keys)
                ref_sigs[rid], sha = store.content_sig(asset_path(by_id[rid]), by_id[rid])
                if sha:
                    fsigs[rid] = {"sha": sha, "sig": ref_sigs[rid]}
    audio_z = None
    d, sub = project_dir(proj)
    src_info = source_audio_info(d, sub, audio) if audio is not None else None
    sources = audio_sources(proj, audio)
    for aid, src in sources.items():
        ref_sigs[aid] = audio_signature(src)
    tl_audio, audio_cov = timeline_audio(sources, proj, est["frames"])
    if core.lock_clips(proj):
        if tl_audio is None or audio_cov.sum() == 0:
            log("audio track: no clip with a connected source on the timeline; ignored")
        elif audio_vae is None:
            log("audio track needs the audio_vae input to be locked; the sound is only passed to the output")
        else:
            audio_z = encode_audio(audio_vae, tl_audio).float().cpu()
    if audio_z is None:
        # nothing locked: drop the track from the keys so the segments do not depend on it
        proj["audio"]["clips"] = []
    env = model_signature(model, clip, vae, audio_vae)
    kind = core.run_kind(s)
    kparts = []
    keys = core.segment_keys(proj, ref_sigs, env, up_env=upscale.env_tag(s.get("upscale_method", "learned")) if kind == "refine" else "", parts=kparts)
    use_cache = bool(s.get("cache", True))
    keys = keys[:len(items)]
    # «Апскейл отрезка»: key of each segment's upscale (None = none); the base latents stay the generation chain
    up_env = {m: upscale.env_tag("rtx" if m == "rtx" else "learned") for m in core.SEG_UPSCALE_METHODS
              if any((sg.get("upscale") or {}).get("method") == m for sg in proj["segments"])}
    ukeys = core.upscale_keys(proj, keys, kind, up_env)[:len(items)]
    if any(ukeys):
        caps = upscale.capabilities()
        log(f"segment upscale: {sum(1 for x in ukeys if x)} segment(s); learned latent upscaler "
            f"{'yes (' + caps['learned_models'][0] + ')' if caps['learned'] else 'NO (' + ('model missing in models/latent_upscale_models' if caps['learned_node'] else 'node MinimaxH3LatentUpscaler3D not installed') + ')'}"
            f" · RTX VSR {'yes' if caps['rtx'] else 'no'}")
    # final from the draft: every segment's draft (same key as a «Черновик» run) is the start of its refine pass
    dparts = []
    dkeys = core.segment_keys(proj, ref_sigs, env, "draft", parts=dparts)[:len(items)] if kind == "refine" else None
    # take store: latents of finished takes come back from their sidecars when the cache was cleared,
    # and every cache latent becomes a take (sidecar + recipe) — also those of earlier, interrupted runs
    recipes = {}
    for i_, k_ in enumerate(keys):
        sid = proj["segments"][i_]["id"]
        recipes[k_] = {"seg_id": sid, "seg": i_, "kind": kind, "parts": kparts[i_] if i_ < len(kparts) else None,
                       "draft": dparts[i_] if kind == "refine" and i_ < len(dparts) else None}
        if dkeys:
            recipes.setdefault(dkeys[i_], {"seg_id": sid, "seg": i_, "kind": "draft", "parts": dparts[i_] if i_ < len(dparts) else None})

    def _restore(k_, frozen_=False):
        return frozen_ and os.path.isfile(seg_pt_path(d, k_, True)) or store.restore(d, k_, seg_pt_path(d, k_))

    for k_ in list(keys) + list(dkeys or []):
        _restore(k_)
    run_w, run_h = core.work_resolution(s)
    frozen = [bool(proj["segments"][i].get("freeze")) for i in range(len(keys))]
    for i, k in enumerate(keys):
        if frozen[i] and not os.path.isfile(seg_pt_path(d, k, True)) and not os.path.isfile(seg_pt_path(d, k)):
            raise ValueError(f"H3ZeroStudio: отрезок {i + 1} зафиксирован, но его файл не найден "
                             f"(frozen/seg_{k}.pt). Разморозьте отрезок, чтобы сгенерировать заново.")
    for uk_ in ukeys:
        if uk_:
            _restore(uk_)
    cached = [frozen[i] or (use_cache and os.path.isfile(seg_pt_path(d, k))) for i, k in enumerate(keys)]
    for i_, k_ in enumerate(keys):   # [H3ZS] cache hit/miss: reason
        if i_ >= len(items):
            break
        if cached[i_]:
            log(f"cache hit: segment {i_ + 1} {k_}" + (" (frozen)" if frozen[i_] else ""))
        elif not use_cache:
            log(f"cache miss: segment {i_ + 1} {k_} — reason: кэш выключен в настройках")
        else:
            pr_ = dict(kparts[i_]) if i_ < len(kparts) and kparts[i_] else {}
            log(f"cache miss: segment {i_ + 1} {k_} — reason: {store.miss_reason(d, proj['segments'][i_]['id'], kind, pr_)}")
    # an upscale that will really run (final from the draft / «Апскейл отрезка») needs the learned upscaler or
    # RTX VSR: fail before any sampling with a clear message instead of a silent low-quality fallback
    need_up = [i for i in range(len(keys)) if not frozen[i] and not core.is_footage(proj["segments"][i])
               and ((kind == "refine" and not cached[i]) or (ukeys[i] and not os.path.isfile(seg_pt_path(d, ukeys[i]))))]
    if need_up:
        caps = upscale.capabilities()
        if not (caps["learned"] or caps["rtx"]):
            raise upscale.UpscaleUnavailable("H3ZeroStudio: " + upscale.UNAVAILABLE + f" (нужно для отрезков {', '.join(str(i + 1) for i in need_up)})")
    # "only this segment" (run.only = i): segments before it that are out of date and not needed as its
    # continuity source are left alone; the run starts after the last of them
    only = int((proj.get("run") or {}).get("only", -1))
    first = 0
    if 0 <= only < len(items):
        for j in range(only):
            if not cached[j] and not (j == only - 1 and core.uses_continuity(proj, only)):
                first = j + 1
        if first:
            log(f"only segment {only + 1}: segments 1-{first} are not touched (out of date ones stay as they are)")
    ar_run = (proj.get("run") or {}).get("audio") or None   # «Улучшить звук»: audio-only pass over cached segments
    ar_only = only
    if ar_run:
        if audio_vae is None:
            raise ValueError("H3ZeroStudio: «Улучшить звук» требует вход audio_vae (звук нужно декодировать после доработки).")
        miss = [j + 1 for j in range(len(items)) if (ar_only < 0 or ar_only == j) and j >= first and not cached[j]
                and not core.is_footage(proj["segments"][j])]
        if miss:
            raise ValueError(f"H3ZeroStudio: «Улучшить звук»: у отрезков {', '.join(map(str, miss))} нет готового результата "
                             f"в кэше. Сначала сгенерируйте их.")
    def _steps(i):
        if kind != "refine" or core.is_footage(proj["segments"][i]):
            return core.seg_steps(proj, i)
        n = core.effective_params(proj, i)["steps"]
        have_draft = use_cache and os.path.isfile(seg_pt_path(d, dkeys[i]))
        return core.pass_steps(s, n, "refine") + (0 if have_draft else core.pass_steps(s, n, "draft"))
    todo_steps = sum(_steps(i) for i, c in enumerate(cached) if not c and i >= first)
    if ar_run:
        todo_steps += int(ar_run["steps"]) * sum(1 for j in range(len(items)) if j >= first and (ar_only < 0 or ar_only == j)
                                                  and not core.is_footage(proj["segments"][j]))
    # «✂ Участок»: regions generated (run.region) or applied (their chosen take) in this run
    from . import h3s_region as region
    reg_plans = region.plan_regions(proj, all_items, items, first, keys, dkeys or keys, ref_sigs, env, kind, (run_w, run_h),
                                    core.work_resolution(s, "draft"), upscale.env_tag(s.get("upscale_method", "learned")) if kind == "refine" else "",
                                    d, use_cache) if proj.get("regions") else []
    todo_steps += sum(rp["steps"] for rp in reg_plans)

    def keep_takes():
        """Every finished latent of this run becomes a take (sidecar + recipe); cheap hard links."""
        for k_ in list(keys) + list(dkeys or []):
            store.keep(d, k_, seg_pt_path(d, k_), recipes.get(k_))
        for i_, uk_ in enumerate(ukeys):
            if uk_:
                store.keep(d, uk_, seg_pt_path(d, uk_), {"seg_id": proj["segments"][i_]["id"], "seg": i_, "kind": "upscale", "base": keys[i_]})
        for rp_ in reg_plans:
            store.keep(d, "r" + rp_["key"], rp_["pt"], {"region": rp_["rg"]["id"], "kind": "region:" + kind})
            if rp_.get("dkey"):
                store.keep(d, "r" + rp_["dkey"], os.path.join(d, "cache", f"region_{rp_['dkey']}.pt"), {"region": rp_["rg"]["id"], "kind": "region:draft"})

    try:
        keep_takes()
    except Exception as e:
        log(f"take store: {e}")
    up_cached = [bool(uk) and use_cache and os.path.isfile(seg_pt_path(d, uk)) for uk in ukeys]
    _um = lambda i: proj["segments"][items[i]["index"]]["upscale"]["method"]
    todo_steps += sum(core.upscale_pass_params(proj, items[i]["index"], _um(i))["steps"] * core.upscale_chunking(s, items[i]["frames"], _um(i))[0]
                      for i, uk in enumerate(ukeys) if uk and not up_cached[i] and i >= first)
    pbar = comfy.utils.ProgressBar(max(1, todo_steps))
    t0 = time.perf_counter()
    done_steps = [0]
    notify("start", segments=len(items), keys=[uk or k for k, uk in zip(keys, ukeys)],
           cached=[(c and (not ukeys[i] or up_cached[i])) or i < first for i, c in enumerate(cached)], steps_total=todo_steps, estimate=est,
           upto=len(items) - 1, partial=len(items) < len(all_items), fsigs=fsigs)
    log(f"project {proj['id']}: {len(items)} segment(s), {est['frames']} frames ({est['seconds']} s), "
        f"{est['width']}x{est['height']}, cached {sum(cached)}/{len(items)}"
        + {"draft": f" · ЧЕРНОВИК ({s.get('draft_scale')}× size, {core.pass_steps(s, int(s.get('steps') or 20), 'draft')} steps)",
           "refine": f" · ФИНАЛ ИЗ ЧЕРНОВИКА (upscale {s.get('upscale_method')} -> {run_w}x{run_h}, refine from sigma "
                     f"{s.get('refine_sigma')}, {core.pass_steps(s, int(s.get('steps') or 20), 'refine')} steps)"}.get(kind, ""))
    fps = int(s.get("fps") or core.FPS)
    vlog(f"settings: steps {s.get('steps')} cfg {s.get('cfg')} {s.get('sampler')}/{s.get('scheduler')} denoise {s.get('denoise')} "
         f"shift v/a {s.get('shift_video')}/{s.get('shift_audio')} seed {s.get('seed')} · overlap {s.get('overlap_blocks')} blk "
         f"(lock {'on' if s.get('lock_overlap', True) else 'off'}) · audio: {len(core.lock_clips(proj))} lock clip(s), "
         f"audio_vae {'yes' if audio_vae is not None else 'no'}, seam lock {'on' if s.get('audio_seam_lock') else 'off'}, "
         f"xfade {s.get('audio_xfade_sec') if s.get('audio_xfade') else 'off'}, match {'on' if s.get('audio_match') else 'off'} · "
         f"end {proj.get('end') or 'auto'} · {todo_steps} step(s) to sample")
    for j, (itj, kj) in enumerate(zip(items, keys)):
        vlog(f"  #{j + 1}: {itj['frames']} fr {itj['start'] / core.FPS:.2f}-{itj['end'] / core.FPS:.2f}s {itj['link']}"
             f"{' ov ' + str(itj['overlap']) if j and itj['overlap'] else ''} · {'untouched' if j < first else 'cache' if cached[j] else 'generate'} {kj}")
    seg_v, seg_a, seg_frames, results = [], [], [], []
    run_wave_keys, wave_memo = [], {}

    def take_frames(key_, lat_, fresh_, i_, dec=None):
        """Frames of a finished take: from its saved master (no VAE call) unless it was sampled just now."""
        fr_ = None if fresh_ else store.load_master(d, key_, lat_)
        if fr_ is not None:
            log(f"segment {i_ + 1}: frames from the take master {key_} (no VAE decode)")
            return fr_
        fr_ = dec() if dec else decode_video(vae, lat_.to(comfy.model_management.intermediate_device()))
        store.save_master(d, key_, lat_, fr_, fps)
        return fr_

    def take_wave(j_):
        """Raw (unnormalised) wave of run segment j_: saved take audio, else one audio-VAE decode (then saved)."""
        if j_ in wave_memo:
            return wave_memo[j_]
        key_, fresh_, ai_ = run_wave_keys[j_]
        w_ = None if fresh_ else store.load_wave(d, key_)
        if w_ is None and audio_vae is not None:
            au_ = decode_audio(audio_vae, seg_a[ai_].to(comfy.model_management.intermediate_device()), normalize=False)
            w_ = (au_["waveform"][0].cpu(), int(au_["sample_rate"]))
            store.save_wave(d, key_, *w_)
        wave_memo[j_] = w_
        return w_
    seg_up = []      # upscaled video latent per run segment (None = not upscaled)
    prev = None
    prev_up = None
    draft_mem = {}
    dev0 = comfy.model_management.intermediate_device()

    def fit_canvas(v, w_, h_, what):
        """A latent of another canvas (a clip frozen in another mode) is resized to the run's canvas."""
        if tuple(v.shape[-2:]) != (h_ // 16, w_ // 16):
            log(f"{what}: latent {tuple(v.shape[-2:])} resized to {w_}x{h_} ({s.get('upscale_method')})")
            return upscale_video_latent(vae, v, w_, h_, s.get("upscale_method", "learned"))
        return v

    def get_draft(j, step_cb=None, pcb=None):
        """Draft of segment j for the refine pass: from the cache (a «Черновик» run made it) or sampled now; an
        extension's draft continues the previous draft, exactly like in a draft run."""
        if j in draft_mem:
            return draft_mem[j]
        seg_j, it_j, kd = proj["segments"][j], items[j], dkeys[j]
        dw, dh = core.work_resolution(s, "draft")
        ptd = seg_pt_path(d, kd, bool(seg_j.get("freeze")))
        if (frozen[j] or use_cache) and os.path.isfile(ptd):
            dd = torch.load(ptd, map_location="cpu", weights_only=True)
            dv, da = fit_canvas(dd["v"], dw, dh, f"segment {j + 1} draft"), dd["a"]
            log(f"segment {j + 1}: draft from cache {kd}")
        elif core.is_footage(seg_j):
            dv, da, _px = footage_latents(vae, audio_vae, by_id[seg_j["source"]["asset"]], seg_j["source"], it_j["frames"], dw, dh, it_j["audio_t"])
        else:
            pd = get_draft(j - 1) if j > 0 and it_j["link"] == "extend" else None
            refs_j = [load_asset_image(a) for a in core.ordered_refs(proj, seg_j)]
            ra_j = ref_audio_latents(audio_vae, proj, seg_j, sources)
            rv_j = [ref_video_frames(x, it_j["frames"]) for x in core.video_refs(proj, seg_j)[:core.MAX_REF_VIDEOS]]
            init_j = None
            if seg_j.get("source"):
                fv, fa, _px = footage_latents(vae, audio_vae, by_id[seg_j["source"]["asset"]], seg_j["source"], it_j["frames"], dw, dh, it_j["audio_t"])
                init_j = (fv, fa)
            notify("phase", seg=j, phase="draft")
            log(f"segment {j + 1}: sampling its draft first ({dw}x{dh})")
            dv, da = sample_segment(model, clip, vae, proj, j, items, pd, refs_j, audio_z, step_cb, pcb, audio_cov, ra_j, rv_j, init_j, kind="draft")
            if use_cache:
                torch.save({"v": dv, "a": da}, ptd + ".part")
                media.replace_file(ptd + ".part", ptd)
        fr = decode_video(vae, dv.to(dev0))
        draft_mem[j] = {"v": dv, "a": da, "last_frame": fr[-1:].clone(), "frames": fr}
        for old in [x for x in draft_mem if x < j - 1]:
            del draft_mem[old]
        return draft_mem[j]

    for i, it in enumerate(items):
        if i < first:
            continue
        k = keys[i]
        pt = seg_pt_path(d, k, frozen[i])
        hit = cached[i]
        fresh = not hit   # sampled now -> decode and (re)write its master; a hit reads the master, no VAE
        notify("seg_start", seg=i, key=k, cached=hit)
        vlog(f"── segment {i + 1}/{len(items)} · {it['frames']} fr · seed {core.effective_params(proj, i)['seed']} · "
             f"cache {'HIT' if hit else 'miss'} {k}")
        seg_i = proj["segments"][i]
        v_frozen = None
        if hit:
            data = torch.load(pt, map_location="cpu", weights_only=True)
            v, a = data["v"], data["a"]
            log(f"segment {i + 1}: {'frozen' if frozen[i] else 'cache hit'} {k}")
            v_frozen = v if frozen[i] else None
            if frozen[i]:
                v = fit_canvas(v, run_w, run_h, f"segment {i + 1} (frozen)")
            if ar_run and not core.is_footage(seg_i) and (ar_only < 0 or ar_only == i):
                ak = audio_refine_key(k, ar_run["steps"], ar_run["denoise"], ar_run["video_denoise"], core.effective_params(proj, i)["seed"])
                apt = seg_pt_path(d, ak)
                store.restore(d, ak, apt)
                if use_cache and os.path.isfile(apt):
                    v, a = [torch.load(apt, map_location="cpu", weights_only=True)[x] for x in ("v", "a")]
                    log(f"segment {i + 1}: audio refine from cache {ak}")
                else:
                    notify("phase", seg=i, phase="audio_refine")
                    refs_ar = [load_asset_image(x) for x in core.ordered_refs(proj, seg_i)]
                    ra_ar = ref_audio_latents(audio_vae, proj, seg_i, sources)

                    def ar_step(step, total, _i=i):
                        done_steps[0] += 1
                        pbar.update_absolute(done_steps[0], max(1, todo_steps))
                        el = time.perf_counter() - t0
                        notify("step", seg=_i, step=step + 1, steps=total, done=done_steps[0], total=todo_steps,
                               elapsed=round(el, 1), eta=round(el / max(1, done_steps[0]) * (todo_steps - done_steps[0]), 1))
                    t_ar = time.perf_counter()
                    v, a = refine_audio(model, clip, vae, proj, i, items, v, a, ar_run, refs_ar, ra_ar, ar_step)
                    torch.save({"v": v, "a": a}, apt + ".part")
                    media.replace_file(apt + ".part", apt)
                    log(f"segment {i + 1}: audio refined in {time.perf_counter() - t_ar:.1f}s -> {ak}")
                    fresh = True
                store.keep(d, ak, apt, {"seg_id": seg_i["id"], "seg": i, "kind": "audio_refine", "base": keys[i]})
                k = ak
                v_frozen = None
        elif core.is_footage(seg_i):
            w_, h_ = run_w, run_h
            asset = by_id[seg_i["source"]["asset"]]
            v, a, _px = footage_latents(vae, audio_vae, asset, seg_i["source"], it["frames"], w_, h_, it["audio_t"])
            torch.save({"v": v, "a": a}, pt + ".part")
            media.replace_file(pt + ".part", pt)
            log(f"segment {i + 1}: footage «{asset.get('name')}» from frame {seg_i['source']['in']}, {it['frames']} fr (as is)")
        else:
            refs = [load_asset_image(a) for a in core.ordered_refs(proj, proj["segments"][i])]
            steps_i = core.effective_params(proj, i)["steps"]
            seg_t0 = time.perf_counter()

            live_box = []

            def step_cb(step, total, _i=i, _t0=seg_t0, _live=live_box):
                done_steps[0] += 1
                pbar.update_absolute(done_steps[0], max(1, todo_steps))
                el = time.perf_counter() - t0
                rate = el / max(1, done_steps[0])
                notify("step", seg=_i, step=step + 1, steps=total, done=done_steps[0], total=todo_steps,
                       elapsed=round(el, 1), eta=round(rate * (todo_steps - done_steps[0]), 1),
                       **(_live[0].dyn if _live else {}))
                if VERBOSE[0]:
                    dy = _live[0].dyn if _live else {}
                    seg_el = time.perf_counter() - _t0
                    seg_eta = seg_el / max(1, step + 1) * (total - step - 1)
                    sig = dy.get("sigma")
                    log(f"[{text_bar(step + 1, total)}] seg {_i + 1}/{len(items)} step {step + 1}/{total}"
                        + (f" σ={sig:.4f}" if sig is not None else "") + (f" Δ={dy['delta']:.4f}" if dy.get("delta") is not None else "")
                        + (f" {dy['ms']:.0f} ms" if dy.get("ms") is not None else "")
                        + f" · ETA seg {fmt_s(seg_eta)} total {fmt_s(rate * (todo_steps - done_steps[0]))} · {done_steps[0]}/{todo_steps}"
                        + (" · " + vram() if vram() else ""))

            pcb = LivePreview(notify, model, i, settings=s, audio_vae=None, out_dir=d, sub=sub)   # no audio in the live preview (sounded awful mid-sampling)
            if preview_factory is not None and not s.get("preview_suppress", True):
                try:   # ComfyUI's own node preview on top (off by default: the editor shows its own)
                    pcb.extra = preview_factory(model, steps_i)
                except Exception:
                    pcb.extra = None
            live_box.append(pcb)
            ra = ref_audio_latents(audio_vae, proj, proj["segments"][i], sources)
            rv = [] if kind == "refine" else [ref_video_frames(x, it["frames"]) for x in core.video_refs(proj, seg_i)[:core.MAX_REF_VIDEOS]]   # no video refs when upscaling a draft
            init = None
            if kind == "refine":
                dr = get_draft(i, step_cb, pcb)
                um = s.get("upscale_method", "learned")
                notify("phase", seg=i, phase="up_input", input=upscale.effective_input(um) or um)
                t_in = time.perf_counter()
                log(f"segment {i + 1}: final from its draft — upscale input {upscale.effective_input(um) or um} {tuple(dr['v'].shape[-2:])} latent -> {run_w}x{run_h} …")
                up = upscale_video_latent(vae, dr["v"], run_w, run_h, um, frames=dr["frames"])
                log(f"segment {i + 1}: upscale input done in {time.perf_counter() - t_in:.1f}s")
                notify("phase", seg=i, phase="refine")
                log(f"segment {i + 1}: final from its draft: {tuple(dr['v'].shape[-2:])} -> {tuple(up.shape[-2:])} latent ({um}), refine")
                v, a = sample_segment(model, clip, vae, proj, i, items, prev, refs, None, step_cb, pcb, audio_cov, ra, rv, None,
                                      kind="refine", refine=(up, dr["a"]))
            else:
                if seg_i.get("source"):   # vid2vid from footage
                    fv, fa, _px = footage_latents(vae, audio_vae, by_id[seg_i["source"]["asset"]], seg_i["source"], it["frames"], run_w, run_h, it["audio_t"])
                    init = (fv, fa)
                v, a = sample_segment(model, clip, vae, proj, i, items, prev, refs, audio_z, step_cb, pcb, audio_cov, ra, rv, init, kind=kind)
            torch.save({"v": v, "a": a}, pt + ".part")
            media.replace_file(pt + ".part", pt)
            el_i = time.perf_counter() - seg_t0
            log(f"segment {i + 1}/{len(items)}: done in {el_i:.1f}s ({el_i / max(1, steps_i):.2f} s/step)" + (" · " + vram() if vram() else ""))
        frames = take_frames(k, v, fresh, i)
        prev = {"v": v, "a": a, "last_frame": frames[-1:].clone()}
        seg_v.append(v)
        seg_a.append(a)
        uk, rk, rwh, uinfo = ukeys[i], k, [run_w, run_h], None
        if uk:   # «Апскейл отрезка»: upscale + refine of the finished clip (cached = resume)
            upt = seg_pt_path(d, uk)
            if up_cached[i]:
                uv = torch.load(upt, map_location="cpu", weights_only=True)["v"]
                log(f"segment {i + 1}: upscale from cache {uk}")
                hit_up = True
            else:
                hit_up = False
                t_up = time.perf_counter()
                notify("phase", seg=i, phase="upscale")

                def up_step(step, total, _i=i):
                    done_steps[0] += 1
                    pbar.update_absolute(done_steps[0], max(1, todo_steps))
                    el = time.perf_counter() - t0
                    rate = el / max(1, done_steps[0])
                    notify("step", seg=_i, step=step + 1, steps=total, done=done_steps[0], total=todo_steps,
                           elapsed=round(el, 1), eta=round(rate * (todo_steps - done_steps[0]), 1))
                    vlog(f"[{text_bar(step + 1, total)}] seg {_i + 1} upscale step {step + 1}/{total} · {done_steps[0]}/{todo_steps}")
                refs_u = [load_asset_image(x) for x in core.ordered_refs(proj, seg_i)]
                ra_u = ref_audio_latents(audio_vae, proj, seg_i, sources)
                pcb_u = LivePreview(notify, model, i, settings=s, audio_vae=None, out_dir=d, sub=sub)
                def up_prog(_i=i, **kw):
                    if kw.get("phase"):
                        notify("phase", seg=_i, phase="up_input", input=kw.get("input"), chunk=kw.get("chunk", 1), chunks=kw.get("chunks", 1))
                        return
                    el = time.perf_counter() - t0
                    notify("uptile", seg=_i, done=done_steps[0], total=todo_steps, elapsed=round(el, 1), **kw)
                uv, _a, uinfo = upscale.run_upscale(model, clip, vae, proj, i, items, v, a, frames, prev_up, refs_u, ra_u, up_step, pcb_u, up_prog)
                notify("phase", seg=i, phase="upscale")
                torch.save({"v": uv, "a": a, "info": uinfo}, upt + ".part")
                media.replace_file(upt + ".part", upt)
                log(f"segment {i + 1}: upscale done in {time.perf_counter() - t_up:.1f}s -> {uinfo['wh'][0]}x{uinfo['wh'][1]} ({uinfo['input']})")
            notify("phase", seg=i, phase="decode")
            t_dec = time.perf_counter()
            frames = take_frames(uk + k[len(keys[i]):], uv, fresh or not hit_up, i,   # chunk by chunk when chunked
                                 lambda: upscale.decode_chunks(vae, uv, upscale.chunk_plan(s, uv.shape[2], a.shape[-1], seg_i["upscale"]["method"])))
            log(f"segment {i + 1}: upscaled clip decoded in {time.perf_counter() - t_dec:.1f}s ({frames.shape[2]}x{frames.shape[1]}, {frames.shape[0]} fr)")
            prev_up = {"v": uv}
            rk, rwh = uk + k[len(keys[i]):], [int(uv.shape[-1]) * 16, int(uv.shape[-2]) * 16]   # + audio-refine suffix
            hit = hit and hit_up
            seg_up.append(uv)
        elif frozen[i] and hit and v_frozen is not None and tuple(v_frozen.shape[-2:]) != tuple(v.shape[-2:]) \
                and v_frozen.shape[-1] > v.shape[-1]:
            # a take frozen after its upscale: shown at its own (larger) canvas, the run canvas copy is the chain
            frames = take_frames(k, v_frozen, False, i)
            prev_up = {"v": v_frozen}
            rwh = [int(v_frozen.shape[-1]) * 16, int(v_frozen.shape[-2]) * 16]
            seg_up.append(v_frozen)
        else:
            prev_up = None
            seg_up.append(None)
        seg_frames.append(frames)
        run_wave_keys.append((rk, fresh, len(seg_a) - 1))
        res = segment_media(d, sub, rk, frames, a, audio_vae, audio, proj, it, fps, wave=lambda _j=len(run_wave_keys) - 1: take_wave(_j))
        if i > first and it["link"] == "extend" and len(seg_frames) > 1:   # seam rating of the join on the left
            try:
                from . import h3s_seams
                sr_ = h3s_seams.rate_video(seg_frames[-2], frames[it["overlap"]:])
                if sr_:
                    res["seam"] = sr_
                    if sr_["verdict"] != "ok":
                        log(f"seam {i}->{i + 1}: {h3s_seams.VERDICTS[sr_['verdict']]} (×{sr_['ratio']}) — «Ещё дубль» may give a smoother join")
            except Exception as e:
                vlog(f"seam rating failed: {e}")
        res.update({"index": i, "key": rk, "cached": hit, "frames": int(frames.shape[0]), "kind": kind, "wh": rwh,
                    "seed": core.effective_params(proj, i)["seed"], "created": int(time.time())})
        if kind == "refine" and dkeys and i < len(dkeys):
            res["draft_key"] = dkeys[i]   # gallery lineage: this final was made from that draft
        if uk:
            res.update({"base_key": k, "upscale": dict(seg_i["upscale"]), "base_wh": [run_w, run_h]})
            if uinfo:
                res["up_input"] = uinfo["input"]
        results.append(res)
        try:
            from . import h3s_library
            h3s_library.gallery_add(d, h3s_library.segment_entry(proj["id"], proj.get("name"), sub, res, seg_i, i, kind))
        except Exception as e:
            log(f"gallery: {e}")
        notify("seg_done", seg=i, result=res)
    # ---- stitch (rebased when the run starts after untouched segments)
    run_items = items[first:]
    if first:
        base = run_items[0]["start"]
        run_items = [dict(x, start=x["start"] - base, end=x["end"] - base) for x in run_items]
        run_items[0] = dict(run_items[0], overlap=0, link="start")
    # mixed canvases (some clips upscaled): frames are stitched at the largest canvas, the latent output uses the
    # upscaled latents only when every clip has them on one canvas (else the base latents)
    cw_ = max(int(f.shape[2]) for f in seg_frames)
    ch_ = max(int(f.shape[1]) for f in seg_frames)
    base_v = list(seg_v)   # the generation chain (regions are cut from it)
    if all(u is not None for u in seg_up) and len({tuple(u.shape[-2:]) for u in seg_up}) == 1:
        seg_v = list(seg_up)
    elif any(u is not None for u in seg_up):
        log(f"stitch: mixed canvases -> frames resized to {cw_}x{ch_}; the latent output keeps the base latents ({run_w}x{run_h})")
    out_frames, out_v, out_a = [], [], []
    for i, it in enumerate(run_items):
        ovf = it["overlap"] if i > 0 else 0
        fr_i = seg_frames[i][ovf:]
        if (int(fr_i.shape[2]), int(fr_i.shape[1])) != (cw_, ch_):
            fr_i = _resize(fr_i, cw_, ch_)
        out_frames.append(fr_i)
        if ovf:
            out_v.append(seg_v[i][:, :, core.latent_t(ovf):])
            f_start = run_items[i - 1]["frames"] - ovf
            a_ov = seg_a[i - 1].shape[-1] - round(f_start / core.FPS * core.AUDIO_LATENT_FPS)
            out_a.append(seg_a[i][..., max(0, a_ov):])
        else:
            out_v.append(seg_v[i])
            out_a.append(seg_a[i])
    images = torch.cat(out_frames, dim=0)
    lat_v, lat_a = torch.cat(out_v, dim=2), torch.cat(out_a, dim=-1)
    latent = {"samples": comfy.nested_tensor.NestedTensor((lat_v, lat_a))}
    seam = core.audio_seam_params(proj)
    if audio_cov is not None and audio_z is not None:   # seams covered by the locked track are left as they are
        seam["skip"] = [bool(i and it["overlap"] and audio_cov[round(it["start"] / fps * core.AUDIO_LATENT_FPS):
                                                          round((it["start"] + it["overlap"]) / fps * core.AUDIO_LATENT_FPS)].sum() > 0)
                        for i, it in enumerate(items)][first:]
    vlog(f"stitch: {len(run_items)} segment(s) -> {images.shape[0]} frames; audio seams: crossfade "
         f"{seam.get('xfade') or 'hard cut'} s, loudness match {'on' if seam.get('match') else 'off'}"
         + (f", skipped under track: {[i for i, x in enumerate(seam['skip']) if x]}" if seam.get("skip") else ""))
    if first and tl_audio is not None:   # the node/track audio from the run's start
        sr_ = tl_audio["sample_rate"]
        tl_audio = {"waveform": tl_audio["waveform"][..., int(round(items[first]["start"] / fps * sr_)):], "sample_rate": sr_}
    out_audio = full_audio(audio_vae, tl_audio, lat_a, images.shape[0], fps, seg_a, run_items, seam,
                           wave=take_wave if len(run_wave_keys) == len(seg_a) else None)
    if out_audio is not None:   # audio part of the seam rating (the stitched sound at each rated join)
        try:
            from . import h3s_seams
            wf_, sr_ = out_audio["waveform"][0], int(out_audio["sample_rate"])
            for k, r in enumerate(results):
                if r.get("seam") and k < len(run_items):
                    at = int(round((run_items[k]["start"] + run_items[k]["overlap"]) / fps * sr_))
                    ra = h3s_seams.rate_audio(wf_, sr_, at)
                    if ra:
                        r["seam"]["audio"] = ra
        except Exception as e:
            vlog(f"audio seam rating failed: {e}")
    reg_results = []
    for rp in reg_plans:
        rg, win = rp["rg"], rp["win"]
        name = rg.get("name") or rg["id"]
        si = max(0, win["seg"])
        t_r = time.perf_counter()
        hit_r = rp["cached"]
        if hit_r:
            rd = torch.load(rp["pt"], map_location="cpu", weights_only=True)
            rv, ra = rd["v"], rd["a"]
            log(f"region «{name}»: from cache {rp['key']}")
        else:
            notify("phase", seg=si, phase="region", region=rg["id"])

            def r_step(step, total, _si=si):
                done_steps[0] += 1
                pbar.update_absolute(done_steps[0], max(1, todo_steps))
                el = time.perf_counter() - t0
                rate = el / max(1, done_steps[0])
                notify("step", seg=_si, step=step + 1, steps=total, done=done_steps[0], total=todo_steps,
                       elapsed=round(el, 1), eta=round(rate * (todo_steps - done_steps[0]), 1), region=rg["id"])
                vlog(f"[{text_bar(step + 1, total)}] region «{name}» step {step + 1}/{total} · {done_steps[0]}/{todo_steps}")
            pcb_r = LivePreview(notify, model, si, settings=s, audio_vae=None, out_dir=d, sub=sub)
            refs_r = [load_asset_image(x) for x in core.region_refs(proj, rg)]
            cv, ca = region.chain_latents(items, base_v, seg_a, win["i0"], max(win["segs"]))
            sv, sa, a0 = region.window_latents(win, cv, ca)
            ha = round(win["head"] / core.FPS * core.AUDIO_LATENT_FPS)
            ext = core.audio_context_extra(proj, ha, a0) if ha else 0
            ctx = (ca[..., a0 - ext:a0 + ha], ext) if ext else None
            if kind == "refine":
                dpt = os.path.join(d, "cache", f"region_{rp['dkey']}.pt")
                if use_cache and os.path.isfile(dpt):
                    dd = torch.load(dpt, map_location="cpu", weights_only=True)
                    rdv, rda = dd["v"], dd["a"]
                    log(f"region «{name}»: draft from cache {rp['dkey']}")
                else:
                    dv_l = [get_draft(j)["v"] for j in range(win["i0"], max(win["segs"]) + 1)]
                    da_l = [get_draft(j)["a"] for j in range(win["i0"], max(win["segs"]) + 1)]
                    dcv, dca = region.chain_latents(items, dv_l, da_l, win["i0"], max(win["segs"]), base=win["i0"])
                    dsv, dsa, da0 = region.window_latents(win, dcv, dca)
                    dctx = (dca[..., da0 - ext:da0 + ha], ext) if ext else None
                    notify("phase", seg=si, phase="region_draft", region=rg["id"])
                    rdv, rda = region.sample_region(model, clip, vae, proj, rg, win, dsv, dsa, "draft", refs_r, dctx, audio_z, audio_cov, r_step, pcb_r)
                    torch.save({"v": rdv, "a": rda}, dpt + ".part")
                    media.replace_file(dpt + ".part", dpt)
                um = s.get("upscale_method", "learned")
                notify("phase", seg=si, phase="up_input", input=upscale.effective_input(um) or um, region=rg["id"])
                dfr = decode_video(vae, rdv.to(dev0))
                up = upscale_video_latent(vae, rdv, run_w, run_h, um, frames=dfr)
                notify("phase", seg=si, phase="region", region=rg["id"])
                rv, ra = region.sample_region(model, clip, vae, proj, rg, win, sv, sa, "refine", refs_r, None, None, None, r_step, pcb_r, refine=(up, rda))
            else:
                rv, ra = region.sample_region(model, clip, vae, proj, rg, win, sv, sa, kind, refs_r, ctx, audio_z, audio_cov, r_step, pcb_r)
            torch.save({"v": rv, "a": ra, "win": {k: win[k] for k in ("ws", "a", "b", "we", "to_end")}}, rp["pt"] + ".part")
            media.replace_file(rp["pt"] + ".part", rp["pt"])
            log(f"region «{name}»: done in {time.perf_counter() - t_r:.1f}s")
        fr_w = decode_video(vae, rv.to(dev0))
        images, n_rep = region.splice_frames(images, fr_w, win)
        sinfo = {}
        if out_audio is not None and audio_vae is not None:
            try:
                wr = decode_audio(audio_vae, ra.to(dev0), normalize=False)["waveform"][0].cpu()
                out_audio = {"waveform": region.splice_audio(out_audio["waveform"][0].float(), out_audio["sample_rate"], wr, win, fps, sinfo)[None],
                             "sample_rate": out_audio["sample_rate"]}
            except Exception as e:
                log(f"region «{name}»: audio splice failed ({e}); the video part is replaced, the sound stays")
        log(f"region «{name}»: frames {win['a']}-{win['a'] + n_rep} replaced (frame-exact)"
            + (f"; audio spliced sample-exactly: offset {sinfo['lag_ms']} ms, corr head {sinfo['corr_head']} / tail {sinfo['corr_tail']}, "
               f"gain {sinfo['gain']}, seams at {sinfo['head_at_s']}s / {sinfo['tail_at_s']}s" if sinfo else ""))
        rres = segment_media(d, sub, "r" + rp["key"], fr_w, ra, audio_vae, audio, proj, {"frames": int(fr_w.shape[0])}, fps)
        rres.update({"region": rg["id"], "key": rp["key"], "cached": hit_r, "frames": int(fr_w.shape[0]), "kind": kind,
                     "ws": win["ws"], "a": win["a"], "b": win["b"], "we": win["we"], "seed": int(rg.get("seed") or 0),
                     "wh": [int(fr_w.shape[2]), int(fr_w.shape[1])], "created": int(time.time()), "generated": rp["gen"]})
        reg_results.append(rres)
        try:   # gallery: the region's take, stacked with the segment it was cut from
            from . import h3s_library
            host = next((it for it in items if it["start"] <= win["a"] < it["end"]), None) or next((it for it in items if it["index"] in win["segs"]), None)
            if host is not None:
                h3s_library.gallery_add(d, h3s_library.region_entry(proj["id"], proj.get("name"), rres, rg, proj["segments"][host["index"]], host["index"],
                                                                    host.get("key") if isinstance(host.get("key"), str) else None))
        except Exception as e:
            log(f"gallery: {e}")
        if rp["gen"]:
            notify("region_done", region=rg["id"], result=rres)
    end = int(proj.get("end") or 0)
    if 0 < end < images.shape[0] and len(items) == len(all_items):   # video end marker: exact cut
        images = images[:end]
        if out_audio is not None:
            out_audio = {"waveform": out_audio["waveform"][..., :int(round(end / fps * out_audio["sample_rate"]))],
                         "sample_rate": out_audio["sample_rate"]}
    full_key = hashlib.sha256(("|".join((uk or k) for k, uk in zip(keys[first:], ukeys[first:])) + f"|{images.shape[0]}|{json.dumps(seam, sort_keys=True)}"
                               + "".join(f"|R{r['key']}" for r in reg_results)).encode()).hexdigest()[:16]
    full_name = f"full_{full_key}.mp4"
    full_path = os.path.join(d, full_name)
    if not os.path.isfile(full_path):
        try:
            # full resolution: this file is also the source of «Сохранить видео»
            media.write_mp4(full_path, images, fps, out_audio["waveform"][0] if out_audio else None,
                            out_audio["sample_rate"] if out_audio else None, crf=16)
        except Exception as e:
            log(f"full preview mp4 failed: {e}")
    full = {"video": view_ref(sub, full_name), "frames": int(images.shape[0]), "key": full_key,
            "count": len(items), "partial": len(items) < len(all_items) or first > 0}
    if os.path.isfile(full_path):
        try:
            from . import h3s_library
            h3s_library.gallery_add(d, h3s_library.final_entry(proj["id"], proj.get("name"), full, results[0].get("poster") if results else None,
                                                               s.get("prompt") or " · ".join(str(sg.get("prompt") or "") for sg in proj["segments"][:len(items)])))
        except Exception as e:
            log(f"gallery: {e}")
    total = time.perf_counter() - t0
    notify("done", elapsed=round(total, 1), full=full, segments=results, audio_source=src_info, regions=reg_results)
    n_gen = len(run_items) - sum(cached[first:])
    log(f"finished in {total:.1f}s: {images.shape[0]} frames ({images.shape[0] / fps:.2f}s) · generated {n_gen}, cached {sum(cached[first:])}"
        + (f", untouched {first}" if first else "")
        + (f" · {total / max(1, todo_steps):.2f} s/step" if todo_steps else "") + (f" · cut at end marker {end}" if 0 < end < sum(x['frames'] for x in items) else ""))
    if out_audio is None:
        out_audio = {"waveform": torch.zeros(1, 2, int(images.shape[0] / fps * 44100)), "sample_rate": 44100}
    try:
        keep_takes()
    except Exception as e:
        log(f"take store: {e}")
    return images, out_audio, latent, {"segments": results, "full": full, "keys": keys, "estimate": est,
                                       "audio_source": src_info, "regions": reg_results, "fsigs": fsigs}


def segment_media(d, sub, key, frames, a, audio_vae, audio, proj, it, fps, wave=None):
    name, strip, poster = f"seg_{key}.mp4", f"seg_{key}_tiles.jpg", f"seg_{key}_poster.jpg"
    try:
        if not os.path.isfile(os.path.join(d, strip)):
            media.write_strip(os.path.join(d, strip), frames)
        if not os.path.isfile(os.path.join(d, poster)):
            media.write_poster(os.path.join(d, poster), frames[0])
        if not os.path.isfile(os.path.join(d, name)):
            wf = sr = None
            w = wave() if wave is not None else None   # the take's saved wave (no audio-VAE call)
            if w is not None:
                wf, sr = normalize_level(w[0][None])[0], w[1]
            elif audio_vae is not None:
                au = decode_audio(audio_vae, a.to(comfy.model_management.intermediate_device()))
                wf, sr = au["waveform"][0], au["sample_rate"]
            media.write_mp4(os.path.join(d, name), frames, fps, wf, sr, max_width=1280)
    except Exception as e:
        log(f"preview media for {key} failed: {e}")
    return {"video": view_ref(sub, name), "strip": view_ref(sub, strip), "poster": view_ref(sub, poster),
            "strip_n": min(media.STRIP_COUNT, int(frames.shape[0])), "strip_v": 2}


def source_audio_info(d, sub, audio):
    """Write a small mono WAV of the connected audio input so the editor can draw its waveform."""
    try:
        sig = audio_signature(audio)
        name = f"source_{sig}.wav"
        path = os.path.join(d, name)
        if not os.path.isfile(path):
            media.write_wav(path, audio["waveform"][0], int(audio["sample_rate"]))
        return {"filename": name, "subfolder": sub, "type": "output",
                "duration": round(audio["waveform"].shape[-1] / audio["sample_rate"], 4)}
    except Exception as e:
        log(f"source audio preview failed: {e}")
        return None


def full_audio(audio_vae, tl_audio, lat_a, n_frames, fps, seg_a=None, items=None, seam=None, wave=None):
    """Audio of the stitched video. With `seam` (not the locked soundtrack mode) every segment is decoded on its own
    and joined by stitch_audio (crossfade + loudness match); otherwise the concatenated latent is decoded."""
    if audio_vae is not None and seam is not None and seg_a and len(seg_a) > 1:
        try:
            dev = comfy.model_management.intermediate_device()
            ws = [wave(j) for j in range(len(seg_a))] if wave is not None else []
            if ws and all(w is not None for w in ws) and len({w[1] for w in ws}) == 1:
                waves, sr = [w[0] for w in ws], ws[0][1]   # saved take audio: no audio-VAE decode
            else:
                waves = [decode_audio(audio_vae, a.to(dev), normalize=False)["waveform"][0].cpu() for a in seg_a]
                sr = audio_out_rate(audio_vae)
            sinfo = []
            wf, gains = stitch_audio(waves, sr, items, fps, seam["xfade"], seam["match"], skip=seam.get("skip"), info=sinfo,
                                     declick=seam.get("declick", True))
            for si in sinfo:
                if si["mode"] == "declick":
                    vlog(f"  audio de-click (5 ms taper) at hard cuts: {si['at_s']} s")
                    continue
                vlog(f"  audio seam {si['seam']}->{si['seam'] + 1}: " + (f"kept sound, sample-exact splice at {si['at_s']}s, grid offset {si['lag_ms']} ms"
                     + (f" removed at {si['drift_fix_s']}s" if si.get('drift_fix_s') else "") + f" (corr {si['corr']})" if si["mode"] == "splice"
                     else f"different sound (corr {si['corr']}), crossfade {si['xfade_s']}s"))
            if any(abs(g - 1.0) > 1e-3 for g in gains):
                log("audio seams: loudness match gains " + ", ".join(f"{g:.2f}" for g in gains[1:]))
            for dp in seam_dips(wf, sr, items, fps):
                log(f"  WARNING: audio level hole of {dp['len_ms']} ms at {dp['at_s']}s near seam {dp['seam']}->{dp['seam'] + 1} "
                    f"(in the generated segment audio; segments made before this fix keep it — «Ещё дубль» regenerates)")
            return {"waveform": normalize_level(wf[None]), "sample_rate": sr}
        except Exception as e:
            log(f"audio seam stitch failed ({e}); plain decode")
    if audio_vae is not None and seam is not None and wave is not None and seg_a and len(seg_a) == 1:
        w = wave(0)
        if w is not None:
            return {"waveform": normalize_level(w[0][None]), "sample_rate": w[1]}
    if audio_vae is not None:
        try:
            return decode_audio(audio_vae, lat_a.to(comfy.model_management.intermediate_device()))
        except Exception as e:
            log(f"audio decode failed: {e}")
    if tl_audio is not None:
        sr = tl_audio["sample_rate"]
        n = int(n_frames / fps * sr)
        wf = tl_audio["waveform"][:1, :, :n]
        if wf.shape[-1] < n:
            wf = torch.nn.functional.pad(wf, (0, n - wf.shape[-1]))
        return {"waveform": wf, "sample_rate": sr}
    return None


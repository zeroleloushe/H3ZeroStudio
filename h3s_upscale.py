"""«Апскейл отрезка» for H3ZeroStudio: per-segment upscale + low-strength refine of a finished clip.

Inputs (how the upscaled start latent is made):
  * learned H3 latent upscaler (default): the "Minimax H3 Latent Upscaler (3D)" node (LBH-123-AI,
    Comfyui_Minimax_h3_latent_Upscaler) with a model from models/latent_upscale_models. It is only *called*
    at runtime (MIT-licensed repo; no code is copied). Fast: no VAE decode/encode.
  * RTX Video Super Resolution (NVIDIA Maxine, `nvidia-vfx` = the backend of Comfy-Org's comfyui_nvidia_rtx_nodes,
    Apache-2.0) on the decoded frames, then VAE encode. Optional quality method and the automatic fallback
    when the learned model is missing.
  * VAE decode -> Lanczos -> encode, only when neither is available.

Refine engine: one sampling pass from a low start sigma over the upscaled latent. Long or large canvases are cut
into synchronized crops evaluated on every model call and ramp-blended (latent space) into one prediction:
  * temporal windows (logic of ComfyUI-H3-WindowedRefine, same author): 5m+2 latent frames, starts at
    multiples of 5, so each window sees the trained RoPE pattern;
  * spatial tiles ("tiles" method): the synchronized tiled refine method of alaintural/synctile-h3 (MIT, Alain Tural),
    as in the user's own ComfyUI-SyncTile-H3 node: tiles of the base canvas size, linear ramps in the overlaps, one
    shared noise, one decode; every tile is conditioned like MiniMaxH3ReferenceToVideo with the segment's prompt and
    character refs. Here the tiles' x0 predictions are blended inside each model call (same result as one Euler
    step per tile + blend, and it works with any sampler); no external node is needed.
Temporal chunks (sequential mode, logic of the author's ComfyUI-H3-WindowedRefine): a clip longer than the chunk
length («Настройки → Апскейл»: ≈ seconds, snapped to 17k+5 frames) is processed piece by piece — each chunk is
5m+2 latent frames starting at a block boundary, gets its own upscale input (learned upscaler on the latent slice, or
RTX VSR on its frames -> VAE encode) and its own refine pass (with spatial tiles inside when the method is «Плитки»).
Neighbouring chunks overlap by >= 5o+2 latent frames; the overlap of a chunk is the previous chunk's refined result,
kept clean (video denoise mask 0 + x0 lock), so the chunk continues it exactly like an extension; the decode
crossfades the overlap frames. VRAM is freed between chunks, so the peak is one chunk instead of the whole clip.
Audio is kept 1:1 through H3's native audio denoise mask (all rows clean); the overlap with the previous
upscaled clip is kept the same way on the video side (video denoise mask 0 + x0 lock), so seams match.
"""
import gc
import inspect
import math
import time

import torch

import comfy.model_management
import comfy.nested_tensor
import comfy.sample

from . import h3s_core as core

FRAME_PER_TOKEN = (1, 4, 4, 4, 4)
LEARNED_NODE = "MinimaxH3LatentUpscaler3D"
LEARNED_FOLDER = "latent_upscale_models"
OFFICIAL_TOKENS = 37 * (768 // 32) * (1344 // 32)   # 1344x768, 124 frames: the token count H3 is made for
RTX_DEVICE = "cuda"
MIN_WINDOW_BLOCKS = 7                               # 37 latent frames (124 px frames): shorter windows lose context


def log(msg):
    from .h3s_gen import log as _log
    _log(msg)


# ---------------------------------------------------------------- availability
def learned_models():
    try:
        import folder_paths
        if LEARNED_FOLDER not in folder_paths.folder_names_and_paths:
            return []
        names = [n for n in folder_paths.get_filename_list(LEARNED_FOLDER) if n.lower().endswith((".safetensors", ".pth"))]
    except Exception:
        return []
    h3 = [n for n in names if "h3" in n.lower() or "minimax" in n.lower()]
    return h3 or names


def learned_node():
    try:
        import nodes
        return nodes.NODE_CLASS_MAPPINGS.get(LEARNED_NODE)
    except Exception:
        return None


def rtx_available():
    try:
        import nvvfx  # noqa: F401
        return torch.cuda.is_available()
    except Exception:
        return False


def capabilities():
    models = learned_models()
    node = learned_node() is not None
    return {"learned": bool(models and node), "learned_models": models, "learned_node": node, "rtx": rtx_available()}


UNAVAILABLE = ("Апскейл недоступен: нет ни обученного латентного апскейлера H3 (нода MinimaxH3LatentUpscaler3D + модель "
               "minimax_h3_latent_upscaler_3d_bf16.safetensors в models/latent_upscale_models), ни RTX VSR (пакет nvidia-vfx, "
               "видеокарта NVIDIA RTX). Установите одно из них и перезапустите ComfyUI.")


class UpscaleUnavailable(RuntimeError):
    pass


def effective_input(method):
    """What really produces the start latent: "learned" | "rtx" | None (neither available).
    "rtx" prefers RTX VSR, anything else the learned upscaler; each falls back to the other."""
    caps = capabilities()
    order = ("rtx", "learned") if method == "rtx" else ("learned", "rtx")
    for m in order:
        if caps[m]:
            return m
    return None


def env_tag(method):
    """Part of the cache key: a fallback result must not be served once the preferred tool is installed."""
    eff = effective_input(method)
    if eff == "learned":
        return "learned:" + learned_models()[0]
    return eff or "none"


# ---------------------------------------------------------------- VRAM handoff
def is_oom(e):
    """CUDA out-of-memory, also ComfyUI's «Allocation on device» message."""
    oom = getattr(torch.cuda, "OutOfMemoryError", None)
    if oom is not None and isinstance(e, oom):
        return True
    t = str(e).lower()
    return "out of memory" in t or "allocation on device" in t


def vram_free():
    """Free VRAM of the whole device in GB (None without CUDA)."""
    try:
        if torch.cuda.is_available():
            return torch.cuda.mem_get_info()[0] / 2 ** 30
    except Exception:
        pass
    return None


def vram_note():
    f = vram_free()
    return f"VRAM free {f:.1f} GB" if f is not None else "no CUDA"


def free_vram():
    """Move every model ComfyUI holds on the GPU off it (the H3 model, CLIP, the preset's LoRA-patched clones in
    h3s_models' cache — they stay in RAM and come back on the next sampling without re-reading or re-patching
    from disk —, VAEs, a ComfyUI-managed upscaler), then collect garbage and return the cached blocks to the driver."""
    mm = comfy.model_management
    try:
        mm.unload_all_models()
    except Exception as e:
        log(f"  VRAM: unload_all_models failed ({e})")
    gc.collect()
    try:
        mm.cleanup_models_gc()
    except Exception:
        pass
    mm.soft_empty_cache()


def handoff(step):
    """One logged step of the H3 <-> upscaler VRAM handoff: «unload H3 -> upscaler», «unload upscaler -> reload H3»."""
    before = vram_free()
    free_vram()
    after = vram_free()
    log(f"  VRAM handoff: {step}" + (f" · free {before:.1f} -> {after:.1f} GB" if before is not None and after is not None else ""))


# ---------------------------------------------------------------- inputs
def _ramp(n, lo, hi):
    """Blend weights of one piece along an axis: linear in over `lo` cells, out over `hi` cells, 1 between."""
    w = torch.ones(n)
    if lo > 0:
        w[:lo] = torch.linspace(0, 1, lo + 2)[1:-1]
    if hi > 0:
        w[n - hi:] = torch.minimum(w[n - hi:], torch.linspace(1, 0, hi + 2)[1:-1])
    return w


def _temporal_pieces(T, n):
    """Latent windows [(t0, t1)] for n temporal pieces: H3 shape 5k+2 when possible, >= 1 block overlap."""
    if n <= 1 or T < 12:
        return [(0, T)]
    if (T - 2) % 5 == 0:
        k = (T - 2) // 5
        m = max(2, math.ceil(k / n) + 1)
        return [(5 * st, min(T, 5 * (st + m) + 2)) for st in core.chunk_starts(k, m, 1)]
    L = math.ceil(T / n) + 4
    starts = sorted({round(i * (T - L) / (n - 1)) for i in range(n)}) if T > L else [0]
    return [(a, min(T, a + L)) for a in starts]


def _spatial_pieces(n_in, n_out, k):
    """k overlapping tiles along one axis: [((in0, in1), (out0, out1))] (input cells -> output cells)."""
    if k <= 1:
        return [((0, n_in), (0, n_out))]
    ov = max(2, n_in // (3 * k))
    size = min(n_in, math.ceil((n_in + (k - 1) * ov) / k))
    starts = sorted({round(i * (n_in - size) / (k - 1)) for i in range(k)})
    s = n_out / n_in
    return [((a, a + size), (round(a * s), n_out if a + size >= n_in else round((a + size) * s))) for a in starts]


def _blend_axis(spans):
    """Per-piece (lo, hi) ramp lengths along an axis from the output spans of the neighbours."""
    out = []
    for i, (_, (o0, o1)) in enumerate(spans):
        lo = max(0, spans[i - 1][1][1] - o0) if i else 0
        hi = max(0, o1 - spans[i + 1][1][0]) if i + 1 < len(spans) else 0
        out.append((lo, hi))
    return out


def _pieces_upscale(once, v, w, h, nt, ns):
    """Upscale v in nt temporal x ns*ns spatial overlapping pieces with `once(x, w, h)` and blend them linearly."""
    T, Hh, Ww = v.shape[2], v.shape[-2], v.shape[-1]
    OH, OW = h // 16, w // 16
    if nt <= 1 and ns <= 1:
        return once(v, w, h)
    tp = _temporal_pieces(T, nt)
    ys, xs = _spatial_pieces(Hh, OH, ns), _spatial_pieces(Ww, OW, ns)
    tb, yb, xb = _blend_axis([(None, t) for t in tp]), _blend_axis(ys), _blend_axis(xs)
    acc = wsum = None
    for ti, (t0, t1) in enumerate(tp):
        for yi, ((y0, y1), (Y0, Y1)) in enumerate(ys):
            for xi, ((x0, x1), (X0, X1)) in enumerate(xs):
                comfy.model_management.throw_exception_if_processing_interrupted()
                z = once(v[:, :, t0:t1, y0:y1, x0:x1], (X1 - X0) * 16, (Y1 - Y0) * 16)
                if tuple(z.shape[-2:]) != (Y1 - Y0, X1 - X0):   # the upscaler's 32 px alignment: fit the slot
                    z = torch.nn.functional.interpolate(z, size=(z.shape[2], Y1 - Y0, X1 - X0), mode="trilinear")
                if acc is None:
                    acc = torch.zeros(z.shape[:2] + (T, OH, OW))
                    wsum = torch.zeros((T, OH, OW))
                wt = (_ramp(t1 - t0, *tb[ti]).view(-1, 1, 1) * _ramp(Y1 - Y0, *yb[yi]).view(1, -1, 1)
                      * _ramp(X1 - X0, *xb[xi]).view(1, 1, -1))
                acc[:, :, t0:t1, Y0:Y1, X0:X1] += z[:, :, :t1 - t0] * wt
                wsum[t0:t1, Y0:Y1, X0:X1] += wt
                del z
    return acc / wsum.clamp_min(1e-6)


# OOM ladder of the learned upscaler: (temporal pieces, spatial tiles per side); the first = the node as is
LEARNED_RETRIES = ((1, 1), (2, 1), (4, 1), (2, 2), (4, 3))


def learned_upscale(v, w, h):
    """Video latent -> w x h canvas with the learned upscaler node; None when unavailable / failed.
    Out of VRAM: free memory and retry with more temporal pieces, then spatial tiles (overlap + linear blend);
    only when the whole ladder fails -> None (the caller falls back)."""
    cls, models = learned_node(), learned_models()
    if cls is None or not models:
        return None
    try:
        fn = getattr(cls, "execute", None) or getattr(cls(), getattr(cls, "FUNCTION", "execute"))
    except Exception as e:
        log(f"  learned latent upscaler failed ({e}) -> fallback")
        return None

    def once(x, ww, hh):
        kw = {"latent": {"samples": x.float()}, "model_name": models[0],
              "mode": {"mode": "target dimensions", "width": int(ww), "height": int(hh)}, "align": 32,
              "enable_temporal_chunking": True, "force_unload": True,
              "device": "cuda" if torch.cuda.is_available() else "cpu",
              "precision": "bf16" if torch.cuda.is_available() else "fp32"}
        try:
            names = set(inspect.signature(fn).parameters)
            kw = {k: y for k, y in kw.items() if k in names} if names - {"cls", "self", "kwargs"} else kw
        except (TypeError, ValueError):
            pass
        res = fn(**kw)
        out = getattr(res, "result", None) or getattr(res, "args", None) or res
        lat = out[0] if isinstance(out, (tuple, list)) else out
        z = lat["samples"] if isinstance(lat, dict) else lat
        z = z.float().cpu()
        return z.unsqueeze(2) if z.dim() == 4 else z

    for k, (nt, ns) in enumerate(LEARNED_RETRIES):
        try:
            z = _pieces_upscale(once, v, w, h, nt, ns)
        except Exception as e:
            if not is_oom(e):
                log(f"  learned latent upscaler failed ({e}) -> fallback")
                return None
            del e
            free_vram()
            if k + 1 < len(LEARNED_RETRIES):
                n2, s2 = LEARNED_RETRIES[k + 1]
                log(f"  learned latent upscaler: out of VRAM -> freed ({vram_note()}), retry with {n2} temporal piece(s)"
                    + (f" x {s2}x{s2} tiles" if s2 > 1 else ""))
                continue
            log("  learned latent upscaler: out of VRAM even in small pieces -> fallback")
            return None
        if tuple(z.shape[-2:]) != (h // 16, w // 16) or z.shape[2] != v.shape[2]:
            log(f"  learned upscaler returned {tuple(z.shape)}, expected {w}x{h} -> fallback")
            return None
        log(f"  learned latent upscaler ({models[0]}): {tuple(v.shape[-2:])} -> {tuple(z.shape[-2:])}"
            + (f" in {nt} temporal piece(s)" + (f" x {ns}x{ns} tiles" if ns > 1 else "") if k else ""))
        return z
    return None


def center_crop_to_aspect(frames, w, h):
    """[F,H,W,C] -> centre crop with the w:h aspect (like «keep_proportion = crop, crop_position = center»)."""
    H, W = frames.shape[1], frames.shape[2]
    if W / H > w / h:
        cw, ch = round(H * w / h), H
    else:
        cw, ch = W, round(W * h / w)
    x, y = (W - cw) // 2, (H - ch) // 2
    return frames[:, y:y + ch, x:x + cw]


def rtx_frames(frames, w, h, quality="ULTRA"):
    """[F,H,W,3] float 0..1 -> [F,h,w,3] with NVIDIA RTX Video Super Resolution; None when unavailable.
    Same behaviour as the user's reference (KJNodes «Resize Image v2», upscale_method nvidia_rtx_vsr,
    keep_proportion crop, crop_position center, divisible_by 0, device gpu; reimplemented, not copied):
    centre crop to the target aspect, nvvfx.VideoSuperRes(QualityLevel.ULTRA by default), output size rounded to
    the nearest multiple of 8, each frame CHW float32 on CUDA, the result taken as is (no clamping)."""
    if not rtx_available():
        return None
    try:
        import nvvfx
        q = getattr(nvvfx.effects.QualityLevel, str(quality or "ULTRA").upper(), nvvfx.effects.QualityLevel.ULTRA)
        w8, h8 = max(8, round(int(w) / 8) * 8), max(8, round(int(h) / 8) * 8)
        src = center_crop_to_aspect(frames[..., :3], w, h)
        out = []
        with nvvfx.VideoSuperRes(q) as sr:
            sr.output_width, sr.output_height = w8, h8
            sr.load()
            for f in src:
                comfy.model_management.throw_exception_if_processing_interrupted()
                inp = f.movedim(-1, 0).to(RTX_DEVICE, torch.float32).contiguous()
                o = torch.from_dlpack(sr.run(inp).image).clone()
                out.append(o.movedim(0, -1)[..., :3].float().cpu())
        px = torch.stack(out)
        if (w8, h8) != (w, h):
            from .h3s_gen import _resize
            px = _resize(px, w, h)
        log(f"  RTX VSR ({str(quality).upper()}): {frames.shape[0]} frames {frames.shape[2]}x{frames.shape[1]}"
            + (f" (centre crop {src.shape[2]}x{src.shape[1]})" if src.shape[1:3] != frames.shape[1:3] else "") + f" -> {w}x{h}")
        return px
    except Exception as e:
        log(f"  RTX VSR failed ({e}) -> fallback")
        return None


def upscale_input(vae, v, w, h, method="learned", frames=None, quality="ULTRA"):
    """Upscaled start latent: the learned H3 latent upscaler (default) or RTX VSR -> VAE encode ("rtx"), each
    falling back to the other. Neither available -> UpscaleUnavailable with a clear message (no silent
    nearest-exact / Lanczos result). Returns (latent [1,24,T,h/16,w/16] CPU, used input)."""
    from .h3s_gen import decode_video, _resize
    if tuple(v.shape[-2:]) == (h // 16, w // 16):
        return v.float().cpu(), "none"
    if h // 16 < v.shape[-2] or w // 16 < v.shape[-1]:
        # not an upscale: a clip frozen at a larger canvas shown in a smaller final -> plain VAE resize
        if frames is None:
            frames = decode_video(vae, v.to(comfy.model_management.intermediate_device()))
        return vae.encode(_resize(frames, w, h)).float().cpu(), "resize"
    order = [m for m in (("rtx", "learned") if method == "rtx" else ("learned", "rtx")) if m != "rtx" or rtx_available()]
    if not order or (order == ["learned"] and (learned_node() is None or not learned_models())):
        raise UpscaleUnavailable(UNAVAILABLE)
    # VRAM handoff: the H3 model (+ CLIP, LoRA clones) leaves the GPU for the upscaler, the upscaler leaves it
    # before the refine / the next sampling brings H3 back (lazily, from RAM: ComfyUI loads it on sampling)
    handoff("unload H3 -> upscaler")
    try:
        for m in order:
            if m == "learned":
                z = learned_upscale(v, w, h)
                if z is not None:
                    return z, "learned"
            else:
                if frames is None:
                    frames = decode_video(vae, v.to(comfy.model_management.intermediate_device()))
                px = rtx_frames(frames, w, h, quality)
                if px is not None:
                    return vae.encode(px).float().cpu(), "rtx"
        raise UpscaleUnavailable(UNAVAILABLE)
    finally:
        handoff("unload upscaler -> reload H3 (on the next sampling)")


# ---------------------------------------------------------------- temporal chunks
def chunk_plan(settings, T, A, method=None):
    """Sequential temporal chunks [(v0, v1, a0, a1)] of an upscale (one piece when chunking is off / not needed).
    Same count as core.upscale_chunking (estimate, cache key, progress)."""
    n, cf, o = core.upscale_chunking(settings, frames_for_latent_t(T), method)
    if n <= 1 or T < 2 or (T - 2) % 5:
        return [(0, T, 0, A)]
    m = (core.latent_t(cf) - 2) // 5
    starts = core.chunk_starts((T - 2) // 5, m, o)
    L = 5 * m + 2
    alen = min(A, audio_len_for_frames(frames_for_latent_t(L)))
    out = []
    for st in starts:
        a0 = max(0, min(round(17 * st * 5 / 3), A - alen))
        out.append((5 * st, min(T, 5 * st + L), a0, a0 + alen))
    v0, _, a0, _ = out[-1]
    out[-1] = (v0, T, a0, A)
    return out


# tiled VAE decode on OOM (ComfyUI already tiles once by itself; these are smaller, after freeing every model)
DECODE_TILES = ((32, 8, 16), (16, 4, 8))   # (tile in latent cells, overlap cells, temporal tile in latent frames)


def decode_safe(vae, v):
    """decode_video; out of VRAM -> free every model and decode tiled, smaller each time (logged)."""
    from .h3s_gen import decode_video
    x = v.to(comfy.model_management.intermediate_device())
    try:
        return decode_video(vae, x)
    except Exception as e:
        if not is_oom(e) or not hasattr(vae, "decode_tiled"):
            raise
    for k, (t, o, tt) in enumerate(DECODE_TILES):
        free_vram()
        log(f"  VAE decode out of VRAM -> freed ({vram_note()}), tiled decode {t * 16}px tiles, {tt} latent frames")
        try:
            img = vae.decode_tiled(x, tile_x=t, tile_y=t, overlap=o, tile_t=tt, overlap_t=1)
            return img.reshape((-1,) + tuple(img.shape[-3:]))[..., :3].float().cpu()
        except Exception as e:
            if not is_oom(e) or k + 1 == len(DECODE_TILES):
                raise


def decode_chunks(vae, v, chunks):
    """Decode an upscaled latent chunk by chunk (VRAM: one chunk at a time) and crossfade the overlap frames
    (the latents there are identical; the fade hides VAE boundary effects)."""
    decode_video = decode_safe
    if len(chunks) <= 1:
        return decode_safe(vae, v)
    total = frames_for_latent_t(v.shape[2])
    out, prev_end = None, 0
    for v0, v1, _, _ in chunks:
        comfy.model_management.throw_exception_if_processing_interrupted()
        fr = decode_video(vae, v[:, :, v0:v1])
        p0 = 17 * (v0 // 5)
        if out is None:
            out = torch.zeros((total,) + tuple(fr.shape[1:]), dtype=fr.dtype)
        n = min(fr.shape[0], total - p0)
        ov = max(0, min(prev_end - p0, n))
        if ov:
            w = (torch.arange(1, ov + 1, dtype=torch.float32) / (ov + 1)).view(-1, 1, 1, 1)
            out[p0:p0 + ov] = out[p0:p0 + ov] * (1 - w) + fr[:ov] * w
        out[p0 + ov:p0 + n] = fr[ov:n]
        prev_end = p0 + n
        del fr
        comfy.model_management.soft_empty_cache()
    return out


# ---------------------------------------------------------------- crop planning
def frames_for_latent_t(t):
    return sum(FRAME_PER_TOKEN[k % 5] for k in range(t))


def audio_len_for_frames(frames):
    return round(frames / core.FPS * core.AUDIO_LATENT_FPS)


def plan_windows(T, A, window_blocks, overlap_blocks=1):
    """Temporal windows [(v0, v1, a0, a1)] over a 5k+2 latent (ComfyUI-H3-WindowedRefine plan_windows)."""
    if T < 2 or (T - 2) % 5:
        return [(0, T, 0, A)]
    k = (T - 2) // 5
    m = max(1, min(int(window_blocks), k))
    o = max(0, min(int(overlap_blocks), m - 1))
    last = k - m
    if last <= 0:
        return [(0, T, 0, A)]
    stride = m - o
    n = max(2, min(math.ceil(last / stride) + 1, last + 1))
    starts = sorted({round(i * last / (n - 1)) for i in range(n)})
    L = 5 * m + 2
    alen = min(A, audio_len_for_frames(frames_for_latent_t(L)))
    wins = []
    for s in starts:
        a0 = max(0, min(round(17 * s * 5 / 3), A - alen))
        wins.append((5 * s, 5 * s + L, a0, a0 + alen))
    v0, _, a0, _ = wins[-1]
    wins[-1] = (v0, T, a0, A)
    return wins


def tile_positions(length, tile, min_overlap):
    """Starts of tiles of `tile` cells covering `length` cells with >= min_overlap overlap (even starts)."""
    if tile >= length:
        return [0]
    min_overlap = max(0, min(min_overlap, tile - 2))
    n = math.ceil((length - min_overlap) / (tile - min_overlap))
    n = max(2, n)
    out = []
    for i in range(n):
        s = round(i * (length - tile) / (n - 1))
        out.append(min(length - tile, s - s % 2))
    return sorted(set(out))


def ramp(lo, hi, prev_end, next_start):
    """1-D blend weights of a crop [lo, hi): linear ramps inside the overlaps with its neighbours."""
    w = torch.ones(hi - lo, dtype=torch.float32)
    if prev_end is not None and prev_end > lo:
        ov = min(prev_end, hi) - lo
        w[:ov] = torch.minimum(w[:ov], torch.arange(1, ov + 1, dtype=torch.float32) / (ov + 1))
    if next_start is not None and next_start < hi:
        ov = hi - max(next_start, lo)
        w[-ov:] = torch.minimum(w[-ov:], torch.arange(ov, 0, -1, dtype=torch.float32) / (ov + 1))
    return w


def _axis(spans):
    """[(lo, hi)] sorted -> weights per span."""
    out = []
    for i, (lo, hi) in enumerate(spans):
        pe = spans[i - 1][1] if i > 0 else None
        ns = spans[i + 1][0] if i + 1 < len(spans) else None
        out.append(ramp(lo, hi, pe, ns))
    return out


def tile_cells(base_lh, base_lw, tile=None, tile_ov=None):
    """Tile size (cells, even) and overlaps (cells) of a tiled upscale: `tile` [w, h] px or the base canvas."""
    th = int(tile[1]) // 16 if tile else base_lh
    tw = int(tile[0]) // 16 if tile else base_lw
    th, tw = th - th % 2, tw - tw % 2
    return th, tw, tile_ov or max(4, min(16, th // 3)), tile_ov or max(4, min(16, tw // 3))


def plan_crops(T, A, lh, lw, method, base_lh, base_lw, budget=None, tile=None, tile_ov=None):
    """Crops for the refine pass: list of dict(t=(v0,v1), a=(a0,a1), y=(y0,y1), x=(x0,x1), wt, wa, wy, wx).
    "tiles": spatial tiles of the base canvas size (full length; the base pass ran exactly that).
    otherwise: full frame, temporal windows when the clip is over the token budget."""
    budget = budget or OFFICIAL_TOKENS
    if method == "tiles":
        # tile: the base canvas unless set; overlap: 16 cells like ComfyUI-SyncTile-H3 (min_overlap default), less on small tiles
        th, tw, ovy, ovx = tile_cells(base_lh, base_lw, tile, tile_ov)
        th, tw = min(lh, th), min(lw, tw)
        ys = [(y, y + th) for y in tile_positions(lh, th, ovy)]
        xs = [(x, x + tw) for x in tile_positions(lw, tw, ovx)]
        ts = [(0, T, 0, A)]
    else:
        ys, xs = [(0, lh)], [(0, lw)]
        per = (lh + lh % 2) * (lw + lw % 2) // 4
        ts = [(0, T, 0, A)]
        if T * per > budget and T > 5 * MIN_WINDOW_BLOCKS + 2:
            m = max(MIN_WINDOW_BLOCKS, int((budget / per - 2) // 5))
            ts = plan_windows(T, A, m, 1 if m < 12 else 2)
    wts = _axis([(a, b) for a, b, _, _ in ts])
    was = _axis([(c, d) for _, _, c, d in ts])
    wys, wxs = _axis(ys), _axis(xs)
    crops = []
    for ti, (v0, v1, a0, a1) in enumerate(ts):
        for yi, y in enumerate(ys):
            for xi, x in enumerate(xs):
                crops.append({"t": (v0, v1), "a": (a0, a1), "y": y, "x": x,
                              "wt": wts[ti], "wa": was[ti], "wy": wys[yi], "wx": wxs[xi]})
    return crops


# ---------------------------------------------------------------- synchronized crop wrapper
def _pack(video, audio):
    v = video.reshape(video.shape[0], 1, -1)
    a = audio.reshape(audio.shape[0], 1, -1)
    return torch.cat([v, a], dim=-1), [video.shape, audio.shape]


def _unpack(x, shapes):
    vs, as_ = shapes
    n = math.prod(vs[1:])
    return x[:, :, :n].reshape([x.shape[0]] + list(vs[1:])), x[:, :, n:].reshape([x.shape[0]] + list(as_[1:]))


def crop_payload(payload):
    """Per-crop H3 payload: the packed layout is rebuilt by the model for the crop shape; no keyframes."""
    p = {k: v for k, v in payload.items() if k not in ("layout", "keyframes", "cond_video_latents", "cond_audio_latents")}
    refs = payload.get("refs") or []
    p["cond_video_latents"] = [r["latent"] for r in refs if "latent" in r]
    p["cond_audio_latents"] = [r["audio_latent"] for r in refs if r.get("audio_latent") is not None]
    return p


class CropWrapper:
    """model_function_wrapper: every model call evaluates all crops (alternating order) on the current latent and
    returns the ramp-blended prediction. The video/audio denoise masks are sliced per crop, so H3's clean-row
    labelling (kept audio, locked overlap) holds inside every crop. lock_v/w_v: x0 lock of the overlap frames."""

    def __init__(self, crops, lock_v=None, w_v=None, log_list=None, clock=None):
        self.crops, self.lock_v, self.w_v = crops, lock_v, w_v
        self.calls = 0
        self.log = log_list
        self.clock = clock   # TileClock: progress of every crop evaluation

    def __call__(self, apply_model, args):
        x, t, c = args["input"], args["timestep"], dict(args["c"])
        shapes = c.get("latent_shapes")
        if shapes is None or len(shapes) != 2:
            return apply_model(x, t, **c)
        self.calls += 1
        outs = []
        for b in range(x.shape[0]):
            cb = dict(c)
            if cb.get("c_crossattn") is not None and cb["c_crossattn"].shape[0] == x.shape[0]:
                cb["c_crossattn"] = cb["c_crossattn"][b:b + 1]
            outs.append(self._one(apply_model, x[b:b + 1], t[b:b + 1] if t.shape[0] == x.shape[0] else t, cb, shapes))
        return torch.cat(outs, dim=0)

    def _one(self, apply_model, x, t, c, shapes):
        video, audio = _unpack(x, shapes)
        payload = c.get("minimax_payload")
        dm, adm = c.get("denoise_mask"), c.get("audio_denoise_mask")
        base_c = {k: v for k, v in c.items() if k not in ("latent_shapes", "minimax_payload", "denoise_mask", "audio_denoise_mask")}
        order = list(range(len(self.crops)))
        if self.calls % 2 == 0:
            order.reverse()
        if self.log is not None:
            self.log.append(tuple(order))
        if len(self.crops) == 1 and self.crops[0]["t"] == (0, video.shape[2]) and self.crops[0]["y"] == (0, video.shape[3]) \
                and self.crops[0]["x"] == (0, video.shape[4]):
            t0 = time.perf_counter()
            out = apply_model(x, t, **c)
            if self.clock is not None:
                self.clock.tile(0, t0)
            ov, oa = _unpack(out, shapes)
            return self._lock(ov.float(), oa.float(), x.dtype)
        acc_v = torch.zeros(video.shape, dtype=torch.float32, device=x.device)
        acc_a = torch.zeros(audio.shape, dtype=torch.float32, device=x.device)
        den_v = torch.zeros(video.shape[2:], dtype=torch.float32, device=x.device)
        den_a = torch.zeros(audio.shape[-1], dtype=torch.float32, device=x.device)
        for ci in order:
            cr = self.crops[ci]
            (v0, v1), (a0, a1), (y0, y1), (x0, x1) = cr["t"], cr["a"], cr["y"], cr["x"]
            wv = video[:, :, v0:v1, y0:y1, x0:x1]
            wa = audio[..., a0:a1]
            xw, wshapes = _pack(wv, wa)
            kw = dict(base_c)
            kw["latent_shapes"] = wshapes
            if payload is not None:
                kw["minimax_payload"] = crop_payload(payload)
            if dm is not None:
                kw["denoise_mask"] = dm[..., v0:v1, y0:y1, x0:x1]
            if adm is not None:
                kw["audio_denoise_mask"] = adm[..., a0:a1]
            t0 = time.perf_counter()
            out = apply_model(xw, t, **kw)
            if self.clock is not None:
                self.clock.tile(ci, t0)
            ov, oa = _unpack(out, wshapes)
            wt = cr["wt"].to(x.device).view(-1, 1, 1) * cr["wy"].to(x.device).view(1, -1, 1) * cr["wx"].to(x.device).view(1, 1, -1)
            acc_v[:, :, v0:v1, y0:y1, x0:x1] += ov.float() * wt
            den_v[v0:v1, y0:y1, x0:x1] += wt
            wa_ = cr["wa"].to(x.device)
            acc_a[..., a0:a1] += oa.float() * wa_
            den_a[a0:a1] += wa_
        out_v = acc_v / den_v.clamp(min=1e-8)
        out_a = acc_a / den_a.clamp(min=1e-8)
        return self._lock(out_v, out_a, x.dtype)

    def _lock(self, ov, oa, dtype):
        if self.lock_v is not None:
            w = self.w_v.to(ov.device).view(1, 1, -1, 1, 1)
            ov = ov * (1 - w) + self.lock_v.to(ov.device, ov.dtype) * w
        return _pack(ov.to(dtype), oa.to(dtype))[0]


class TileClock:
    """Progress of a crop-wise pass: one line per crop evaluation (window i/N, step s/S, tile t/T, time per tile,
    ETA, VRAM) in the console and an "uptile" event for the editor (status pill, progress, tile overlay)."""

    def __init__(self, crops, steps, seg, progress=None, lh=0, lw=0, chunk=1, chunks=1, spent_before=0.0):
        from . import h3s_gen as gen
        self.gen, self.crops, self.steps, self.seg, self.progress = gen, crops, max(1, steps), seg, progress
        self.chunk, self.chunks, self.spent_before = chunk, max(1, chunks), spent_before   # temporal chunk i/N
        self.n = len(crops)
        self.wins = sorted({c["t"] for c in crops})
        self.ys, self.xs = sorted({c["y"] for c in crops}), sorted({c["x"] for c in crops})
        self.lh, self.lw = lh, lw
        self.step = 0            # sampler steps finished
        self.k = 0               # evaluations in the current step
        self.per_step = None     # evaluations per step (measured after step 1; cfg / samplers may call the model more)
        self.done = 0
        self.spent = 0.0
        self.t0 = time.perf_counter()

    def tile(self, ci, t0):
        if torch.cuda.is_available():
            try:
                torch.cuda.synchronize()
            except Exception:
                pass
        dt = time.perf_counter() - t0
        self.k += 1
        self.done += 1
        self.spent += dt
        per = self.per_step or self.n
        avg = self.spent / self.done
        total = per * self.steps
        left = max(0, total - self.done)
        eta = avg * left
        frac_c = min(0.999, self.done / max(1, total))
        frac = min(0.999, (self.chunk - 1 + frac_c) / self.chunks)    # of the whole clip (all chunks)
        if self.chunks > 1:   # remaining chunks: as long as this one (or the measured average of the finished ones)
            per_chunk = (self.spent_before / (self.chunk - 1)) if self.chunk > 1 else avg * total
            eta += per_chunk * (self.chunks - self.chunk)
        cr = self.crops[ci]
        win = self.wins.index(cr["t"]) + 1
        tile_in = (self.k - 1) % self.n + 1
        g = self.gen
        vr = g.vram()
        self.gen.log(f"[{g.text_bar(round(frac * 1000), 1000)}] {frac * 100:4.1f}% seg {self.seg + 1} upscale"
                     + (f" · chunk {self.chunk}/{self.chunks}" if self.chunks > 1 else "")
                     + (f" · window {win}/{len(self.wins)}" if len(self.wins) > 1 else "") + f" · step {min(self.step + 1, self.steps)}/{self.steps}"
                     f" · tile {tile_in}/{self.n} · {dt * 1000:.0f} ms/tile · ETA {g.fmt_s(eta)}" + (" · " + vr if vr else ""))
        if self.progress is not None:
            try:
                self.progress(win=win, wins=len(self.wins), chunk=self.chunk, chunks=self.chunks,
                              step=min(self.step + 1, self.steps), steps=self.steps, tile=tile_in, tiles=self.n,
                              ms=round(dt * 1000), eta=round(eta, 1), frac=round(frac, 4),
                              rect=[cr["y"][0], cr["y"][1], cr["x"][0], cr["x"][1]], lh=self.lh, lw=self.lw,
                              rows=len(self.ys), cols=len(self.xs))
            except Exception:
                pass

    def step_done(self):
        if self.per_step is None and self.k:
            self.per_step = self.k
        self.step += 1
        el = time.perf_counter() - self.t0
        self.gen.log(f"  upscale" + (f" chunk {self.chunk}/{self.chunks}" if self.chunks > 1 else "") + f" step {self.step}/{self.steps} blended ({self.k} tile evaluation(s)) · {el:.1f}s elapsed")
        self.k = 0


# ---------------------------------------------------------------- the pass
def run_upscale(model, clip, vae, project, index, items, v, a, frames, prev_up, ref_images,
                ref_audios=None, step_cb=None, preview_cb=None, progress=None, up=None, prompt=None, label=None, holder=None,
                models=None, preview_factory=None):
    """Upscale + refine segment `index` from its finished latents (v video, a audio).
    prev_up: dict(v) of the previous segment's upscaled latent when this one continues it on the same canvas.
    up / prompt / label: a span's upscale («Апскейл участка»: its window latent, its own prompt, no chain).
    models: () -> (model, clip), resolved only after the first upscaler input (the preset base / LoRA clone is not
    touched before the upscaler ran); preview_factory(model) builds the live preview then.
    Returns (video latent [1,24,T,H/16,W/16], audio latent unchanged, info dict)."""
    from . import h3s_gen as gen
    s = project["settings"]
    seg = project["segments"][index]
    up = up or seg["upscale"]
    it = items[index]
    p = core.upscale_pass_params(project, index, up["method"])   # the method profile's own steps / sampler
    bw, bh = v.shape[-1] * 16, v.shape[-2] * 16
    W, H = core.upscale_canvas(bw, bh, up)
    method = up["method"]
    want = "rtx" if method == "rtx" else "learned"
    T, A = v.shape[2], a.shape[-1]
    chunks = chunk_plan(s, T, A, method)
    nch = len(chunks)
    name = label or f"segment {index + 1}"
    log(f"{name} upscale: {vram_note()} before the upscale")
    log(f"{name} upscale: {bw}x{bh} -> {W}x{H} ({W * H / 1e6:.2f} MP), input {effective_input(want) or want}"
        + (f", {nch} temporal chunks (≈{core.upscale_chunking(s, frames_for_latent_t(T), method)[1]} frames each, processed one by one): "
           + ", ".join(f"{frames_for_latent_t(v0) if v0 else 0}-{frames_for_latent_t(v1)}" for v0, v1, _, _ in chunks) if nch > 1 else ""))
    prompt = core.compose_prompt(project, index, video=False) if prompt is None else prompt
    pos = neg = None
    sigmas = None
    out_v = None
    used_all, crops_n, spent = set(), 0, 0.0
    for ci, (v0, v1, a0, a1) in enumerate(chunks):
        comfy.model_management.throw_exception_if_processing_interrupted()
        t_c = time.perf_counter()
        tag = name + (f" chunk {ci + 1}/{nch}" if nch > 1 else "")
        if progress is not None:
            progress(phase="input", input=effective_input(want) or want, chunk=ci + 1, chunks=nch)
        fc = None
        if frames is not None:
            p0 = 17 * (v0 // 5)
            fc = frames[p0:p0 + frames_for_latent_t(v1 - v0)]
        t_in = time.perf_counter()
        uv, used = upscale_input(vae, v[:, :, v0:v1], W, H, want, fc, up.get("quality", "ULTRA"))
        used_all.add(used)
        log(f"{tag} upscale input done in {time.perf_counter() - t_in:.1f}s ({used})")
        if models is not None:
            model, clip = models()
            models = None
            if preview_factory is not None:
                preview_cb = preview_factory(model)
        Tc, Ac = uv.shape[2], a1 - a0
        lock_v = w_v = None
        vmask = torch.ones([1, 1, Tc, H // 16, W // 16])
        ov_t = 0
        if ci == 0 and prev_up is not None and it["link"] == "extend" and it["overlap"] and prev_up["v"].shape[-2:] == uv.shape[-2:]:
            ov_t = min(Tc, core.latent_t(it["overlap"]))      # the previous clip's upscaled tail
            uv[:, :, :ov_t] = prev_up["v"][:, :, -ov_t:].float()
        elif ci > 0:
            ov_t = min(Tc, chunks[ci - 1][1] - v0)          # the previous chunk's refined result
            uv[:, :, :ov_t] = out_v[:, :, v0:v0 + ov_t]
        if ov_t:
            vmask[:, :, :ov_t] = 0.0
            lock_v = uv.clone()
            w_v = torch.zeros(Tc)
            w_v[:ov_t] = 1.0
        crops = plan_crops(Tc, Ac, H // 16, W // 16, method, v.shape[-2], v.shape[-1], tile=up.get("tile"), tile_ov=up.get("tile_ov"))
        crops_n = max(crops_n, len(crops))
        cw = crops[0]["x"][1] - crops[0]["x"][0]
        ch = crops[0]["y"][1] - crops[0]["y"][0]
        nt = len({c["t"] for c in crops})
        rows, cols = len({c["y"] for c in crops}), len({c["x"] for c in crops})
        tov = (up.get("tile_ov") or max(4, min(16, min(cw, ch) // 3))) if method == "tiles" else 0
        log(f"{tag} [upscale {core.UPSCALE_LABELS_LOG.get(method, method)} {W}x{H}]: latent frames {v0}-{v1}, input {used}, "
            f"grid {cols}x{rows} tile {cw * 16}x{ch * 16}" + (f" overlap {tov * 16}px ({tov} cells)" if method == "tiles" else "") +
            f", {nt} window(s), {p['steps']} steps from sigma {up['sigma']} ({p['sampler']}/{p['scheduler']}, cfg {p['cfg']}), "
            f"{len(crops)} crop(s) per model call, overlap lock {ov_t} latent fr, audio kept 1:1")
        if pos is None:   # the conditioning (prompt + refs at the tile size) is the same for every chunk
            cards = gen.holder_cards(project, holder or project["segments"][index], vae, "refine")   # no video looks (prompt has no <Video N>)
            pos = gen.encode_cond(clip, vae, prompt, list(ref_images), cw * 16, ch * 16, s.get("ref_size", "match"), ref_audios, cards=cards)
            neg = pos if p["cfg"] == 1.0 else gen.encode_cond(clip, vae, s.get("negative") or "", list(ref_images), cw * 16, ch * 16,
                                                              s.get("ref_size", "match"), ref_audios, cards=cards)
        m = gen.apply_shift(model, p["shift_video"], p["shift_audio"]) if p["shift_video"] > 0 else model.clone()
        clock = TileClock(crops, p["steps"], index, progress, H // 16, W // 16, chunk=ci + 1, chunks=nch, spent_before=spent)
        wrapper = CropWrapper(crops, lock_v, w_v, clock=clock)
        m.set_model_unet_function_wrapper(wrapper)
        amask = torch.zeros([1, 1, 2, Ac])   # the whole sound is kept
        noise_mask = comfy.nested_tensor.NestedTensor((vmask, amask))
        dev = comfy.model_management.intermediate_device()
        ac = a[..., a0:a1].float()
        samples = comfy.nested_tensor.NestedTensor((uv.to(dev), ac.to(dev)))
        noise = comfy.sample.prepare_noise(samples, p["seed"] + ci)
        if sigmas is None:
            sigmas = gen.refine_sigmas(m, p["steps"], p["scheduler"], up["sigma"])
        if hasattr(preview_cb, "set_sigmas"):
            preview_cb.audio_scale = gen.sampler_audio_scale(m) or 1.0
            preview_cb.set_sigmas([float(x) for x in sigmas.tolist()])

        def cb(step, x0, x, total, _clock=clock):
            comfy.model_management.throw_exception_if_processing_interrupted()
            _clock.step_done()
            if preview_cb is not None:
                try:
                    preview_cb(step, x0, x, total)
                except Exception:
                    pass
            if step_cb is not None:
                step_cb(step, total)

        out = gen.sample_pass(m, noise, p["steps"], p["cfg"], p["sampler"], p["scheduler"], pos, neg, samples,
                              1.0, cb, p["seed"] + ci, noise_mask=noise_mask, sigmas=sigmas)   # a wired SAMPLER applies, the refine sigmas stay
        ov_, oa_ = out.unbind()
        ov_ = ov_.float().cpu()
        err = float((oa_.float().cpu() - ac.cpu()).abs().max())
        log(f"  {tag} upscale audio check: max |out - original| = {err:.2e}" + ("" if err < 1e-2 else "  <-- NOT KEPT"))
        if out_v is None:
            out_v = torch.zeros(list(ov_.shape[:2]) + [T] + list(ov_.shape[3:]), dtype=torch.float32)
        if ci > 0 and ov_t:
            kept = float((ov_[:, :, :ov_t] - out_v[:, :, v0:v0 + ov_t]).abs().max())
            log(f"  {tag} overlap with chunk {ci}: {ov_t} latent fr kept clean (max diff {kept:.2e})")
            out_v[:, :, v0 + ov_t:v1] = ov_[:, :, ov_t:]
        else:
            out_v[:, :, v0:v1] = ov_
        del out, ov_, oa_, samples, noise, uv, lock_v, m, wrapper
        if nch > 1:
            comfy.model_management.soft_empty_cache()   # free VRAM before the next chunk
        dt = time.perf_counter() - t_c
        spent += dt
        if nch > 1:
            log(f"{tag} done in {dt:.1f}s · {(ci + 1) / nch * 100:.0f}% of the clip" + (" · " + gen.vram() if gen.vram() else ""))
    used = "+".join(sorted(used_all))
    return out_v, a.float().cpu(), {"input": used, "wh": [W, H], "crops": crops_n, "chunks": nch}

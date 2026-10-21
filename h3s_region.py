"""«✂ Участок»: regenerate a time range in the middle of the video (generated clips and footage alike).

How it works (MiniMax H3, native mechanisms only):
  * The range lives inside one *scene chain* (clips joined by extend overlaps; a footage clip or a new scene starts a
    new chain). The chain's latents join into one valid 17k+5 / 5k+2 latent (overlap tails dropped), so any window
    starting on a 17-frame block of the chain is a valid H3 clip: latent frame 5j is a standalone frame.
  * The window = clean head context (head blocks) + the range + clean tail context (17·tail + 5 frames).
  * Sampling uses H3's per-modality noise mask (a NestedTensor [video mask, audio mask], the same mechanism the
    extension uses for its kept audio): the head/tail latent frames are injected clean every step and labelled with
    the clean (cond) timestep, so the model sees real context on both sides from the first step on; only the middle
    is denoised. The audio mask is a hard 0/1 boundary at both ends (a fractional hand-off decoded as a dropout).
    The previous sound before the window is also given as clean cond audio (audio_context_sec), as for extensions.
  * Two stages (final from the draft): the window is sampled on the draft canvas from the draft chain, its video
    latent is upscaled (learned H3 upscaler / RTX VSR) and refined from refine_sigma with the final chain's clean
    head/tail; the draft sound is kept 1:1.
  * Splice: video frame-exact (frames [a, b) are replaced); audio sample-exact on both seams: the offset of the
    decoded window against the video timeline is measured by cross-correlation over the kept head/tail sound, the
    level matched (least squares over the kept parts) and the two are joined with a short linear fade at the
    quietest point of each context zone.

Ideas checked against H3 temporal-inpaint projects (no code copied): ComfyUI's own MiniMaxH3 denoise-mask handling
(comfy/model_base.py, GPL-3.0), panghea/ComfyUI-MiniMax-H3-Inpaint-Tools (GPL-3.0, time-span latent masks),
filliptm/ComfyUI-FL-MiniMaxH3 Temporal Reshot (Apache-2.0, interval + context handles on the 17k+5 grid),
red-polo/ComfyUI-MiniMaxH3FrameInfill (GPL-3.0, gap infill anchored by the surrounding video).
"""
import math
import time

import torch

import comfy.model_management
import comfy.nested_tensor
import comfy.sample

from . import h3s_core as core
from . import h3s_gen as gen


def chain_latents(items, seg_v, seg_a, i0, i1, base=0):
    """Joined latents of the scene chain items[i0..i1] (seg_v/seg_a indexed from `base`): overlap tails dropped,
    exactly like the stitch. Returns (video [1,24,T,h,w], audio [1,32,2,A])."""
    vs, as_ = [], []
    for j in range(i0, i1 + 1):
        v, a = seg_v[j - base], seg_a[j - base]
        it = items[j]
        if j > i0 and it["overlap"]:
            ovf = it["overlap"]
            f_start = items[j - 1]["frames"] - ovf
            a_ov = seg_a[j - 1 - base].shape[-1] - round(f_start / core.FPS * core.AUDIO_LATENT_FPS)
            vs.append(v[:, :, core.latent_t(ovf):])
            as_.append(a[..., max(0, a_ov):])
        else:
            vs.append(v)
            as_.append(a)
    return torch.cat(vs, dim=2), torch.cat(as_, dim=-1)


def window_latents(win, cv, ca):
    """The window's slice of the chain latents (video on the block grid, audio rounded to its 40 Hz grid)."""
    T, A = win["latent_t"], core.audio_len(win["frames"])
    v = cv[:, :, win["lat0"]:win["lat0"] + T].float()
    if v.shape[2] != T:
        raise ValueError(f"H3ZeroStudio: участок: окно {T} латент-кадров не помещается в сцену ({cv.shape[2] - win['lat0']})")
    a0 = round((win["ws"] - win["chain"][0]) / core.FPS * core.AUDIO_LATENT_FPS)
    a = ca[..., a0:a0 + A].float()
    if a.shape[-1] < A:
        a = torch.nn.functional.pad(a, (0, A - a.shape[-1]))
    return v, a, a0


def masks(win, T, A, h, w):
    """Latent frames / audio frames to keep (1) — head and tail context — as per-frame weights."""
    hv = 5 * win["head_blocks"]                                          # head: whole blocks
    tv = hv + 5 * ((win["b"] - win["a"]) // 17) if not win["to_end"] else T   # tail starts on a block boundary
    keep_v = torch.zeros(T)
    keep_v[:hv] = 1.0
    if not win["to_end"]:
        keep_v[tv:] = 1.0
    ha = round(win["head"] / core.FPS * core.AUDIO_LATENT_FPS)
    ta = round((win["b"] - win["ws"]) / core.FPS * core.AUDIO_LATENT_FPS)
    keep_a = torch.zeros(A)
    keep_a[:ha] = 1.0
    if not win["to_end"]:
        keep_a[min(A, ta):] = 1.0
    return keep_v, keep_a, hv, tv, ha, ta


def bridge_source(vae, audio_vae, images, audio, win, w, h):
    """Source latents of a span over a join: the stitched frames [ws, we) (gaps are black, regenerated anyway)
    VAE-encoded at the run canvas, and the stitched sound of the window encoded with the audio VAE (silence
    without one). Returns (video [1,C,T,h,w], audio [1,32,2,A])."""
    ws, we = win["ws"], win["we"]
    px = images[ws:we]
    if px.shape[0] < we - ws:
        px = torch.cat([px, torch.zeros((we - ws - px.shape[0],) + tuple(px.shape[1:]), dtype=px.dtype)])
    if (int(px.shape[2]), int(px.shape[1])) != (w, h):
        px = gen._resize(px, w, h)
    v = vae.encode(px[..., :3]).float().cpu()
    A = core.audio_len(win["frames"])
    a = None
    if audio_vae is not None and audio is not None:
        sr = int(audio["sample_rate"])
        wf = audio["waveform"][0]
        s0, n = int(round(ws / core.FPS * sr)), int(round((we - ws) / core.FPS * sr))
        seg = torch.zeros(wf.shape[0], n)
        part = wf[:, s0:s0 + n]
        seg[:, :part.shape[-1]] = part
        a = gen.encode_audio(audio_vae, {"waveform": seg[None], "sample_rate": sr}).float().cpu()
    if a is None:
        a = torch.zeros(1, 32, 2, A)
    if a.shape[-1] < A:
        a = torch.nn.functional.pad(a, (0, A - a.shape[-1]))
    return v, a[..., :A]


def sample_region(model, clip, vae, proj, region, win, src_v, src_a, kind, ref_images, ctx=None, audio_z=None,
                  audio_cov=None, step_cb=None, preview_cb=None, refine=None):
    """One sampling pass of a region window. src_v/src_a: the window's source latents (clean context everywhere).
    refine = (upscaled draft video latent, draft audio latent): the middle starts from the upscaled draft at
    refine_sigma, the head/tail stay the final source, the draft audio is kept whole.
    ctx = (audio latent before the window, ext frames) given as clean cond audio before frame 0.
    Returns (video, audio) latents of the whole window on CPU."""
    s = proj["settings"]
    p = core.region_params(proj, region, win, kind)
    T, A = src_v.shape[2], src_a.shape[-1]
    lh, lw = src_v.shape[-2], src_v.shape[-1]
    keep_v, keep_a, hv, tv, ha, ta = masks(win, T, A, lh, lw)
    dev = comfy.model_management.intermediate_device()
    video = src_v.clone().to(dev)
    audio = src_a.clone().to(dev)
    if refine is not None:
        rv, ra = refine
        mid = keep_v < 0.5
        video[:, :, mid] = rv[:, :, mid].to(video.device, video.dtype)
        audio = ra[..., :A].to(audio.device, audio.dtype).clone()
        keep_a = torch.ones(A)
    elif audio_z is not None:   # locked track clips under the window: kept too (the video follows that sound)
        sl, wt = gen.slice_audio_latent(audio_z, win["ws"], A, audio_cov)
        if float(wt.sum()) > 0:
            sel = wt > 0.5
            audio[..., sel] = sl[..., sel].to(audio.device, audio.dtype)
            keep_a = torch.maximum(keep_a, (wt > 0.5).float())
    keyframes = []
    if ctx is not None and refine is None and ha > 0:
        za, ext = ctx
        if ext > 0 and za is not None:
            keyframes.append({"resolved_frame_index": -(ext * 3 // 5), "audio_latent": za.float().clone()})
    images = list(ref_images)
    if len(images) > core.MAX_REF_IMAGES:
        raise ValueError(f"H3ZeroStudio: участок: {len(images)} референсов, максимум {core.MAX_REF_IMAGES}")
    prompt = core.region_prompt(proj, region)
    w, h = lw * 16, lh * 16
    gen.log(f"region «{region.get('name') or region['id']}" + f"» [{kind}]: window {win['ws']}-{win['we']} ({win['frames']} fr = {T} latent, {w}x{h}), "
            f"regenerate {win['a']}-{win['b']} ({win['b'] - win['a']} fr), clean head {win['head']} fr / tail {win['tail']} fr "
            f"(latent keep {hv} + {T - tv if not win['to_end'] else 0}), audio keep {int((keep_a > 0.5).sum())}/{A}, "
            f"steps {p['steps']} cfg {p['cfg']} seed {p['seed']} {p['sampler']}/{p['scheduler']}")
    gen.vlog(f"  region prompt: {prompt[:220]}{'…' if len(prompt) > 220 else ''}")
    cards = gen.holder_cards(proj, region, vae, "full")
    pos = gen.encode_cond(clip, vae, prompt, images, w, h, s.get("ref_size", "match"), cards=cards)
    neg = pos if p["cfg"] == 1.0 else gen.encode_cond(clip, vae, s.get("negative") or "", images, w, h, s.get("ref_size", "match"), cards=cards)
    pos, neg = gen.add_keyframes(pos, keyframes), gen.add_keyframes(neg, keyframes)
    m = gen.apply_shift(model, p["shift_video"], p["shift_audio"]) if p["shift_video"] > 0 else model.clone()
    mv = (1.0 - keep_v).view(1, 1, T, 1, 1).expand(1, 1, T, lh, lw).contiguous()
    ma = (1.0 - keep_a.clamp(0, 1)).view(1, 1, 1, A).expand(1, 1, 2, A).contiguous()
    noise_mask = comfy.nested_tensor.NestedTensor((mv, ma))
    # the kept video frames are also put back into the predicted x0 (as the extension's lock): exact context
    m.set_model_unet_function_wrapper(gen.LockWrapper(video.clone().float(), keep_v.clone(), None, None, probe=int((keep_a > 0.5).sum())))
    samples = comfy.nested_tensor.NestedTensor((video, audio))
    noise = comfy.sample.prepare_noise(samples, p["seed"])
    sigmas = gen.refine_sigmas(m, p["steps"], p["scheduler"], p["sigma0"]) if refine is not None else None
    if hasattr(preview_cb, "set_sigmas"):
        preview_cb.audio_scale = gen.sampler_audio_scale(m) or 1.0
        preview_cb.set_sigmas([float(x) for x in sigmas.tolist()] if sigmas is not None else
                              gen.preview.preview_sigmas(m, p["steps"], p["sampler"], p["scheduler"], p["denoise"]))

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
                              denoise=p["denoise"] if refine is None else 1.0, callback=cb, disable_pbar=True,
                              seed=p["seed"], noise_mask=noise_mask, sigmas=sigmas)
    ov, oa = out.unbind()
    ov, oa = ov.float().cpu(), oa.float().cpu()
    kv = keep_v > 0.5
    ev = float((ov[:, :, kv] - video.float().cpu()[:, :, kv]).abs().max()) if bool(kv.any()) else 0.0
    ka = keep_a > 0.999
    ea = float((oa[..., ka] - audio.float().cpu()[..., ka]).abs().max()) if bool(ka.any()) else 0.0
    gen.log(f"  region context check: kept video max |out - src| = {ev:.2e}, kept audio {ea:.2e}"
            + ("" if ev < 1e-2 and ea < 1e-2 else "  <-- NOT KEPT"))
    return ov, oa


def splice_frames(images, frames_win, win):
    """Frame-exact video splice: frames [a, b) of the stitched video <- the same frames of the window."""
    a, b, ws = win["a"], win["b"], win["ws"]
    b = min(b, images.shape[0])
    if b <= a:
        return images, 0
    mid = frames_win[a - ws:b - ws]
    if tuple(mid.shape[1:3]) != tuple(images.shape[1:3]):
        mid = gen._resize(mid, int(images.shape[2]), int(images.shape[1]))
    images = images.clone()
    images[a:a + mid.shape[0]] = mid.to(images.dtype)
    return images, int(mid.shape[0])


def splice_audio(out, sr, w, win, fps=core.FPS, info=None):
    """Sample-exact audio splice of a region on both seams.
    out: [C, N] stitched audio (sample 0 = timeline frame 0); w: [C, M] decoded window audio (sample 0 ≈ frame ws,
    on the 40 Hz latent grid: up to ±12.5 ms off). Returns the new out."""
    C = out.shape[0]
    w = w[:C] if w.shape[0] >= C else w.repeat(C, 1)[:C]
    s_ws = int(round(win["ws"] / fps * sr))
    s_a, s_b = int(round(win["a"] / fps * sr)), int(round(win["b"] / fps * sr))
    s_we = min(out.shape[-1], int(round(win["we"] / fps * sr)))
    ta = win["ws"] * core.AUDIO_LATENT_FPS / fps
    prior = int(round((round(ta) - ta) / core.AUDIO_LATENT_FPS * sr))
    max_lag = max(1, int(round(0.02 * sr)))
    mo, mw = gen._mono(out), gen._mono(w)
    lag_h = lag_t = None
    corr_h = corr_t = 0.0
    if s_a - s_ws > 64:
        lag_h, corr_h = gen.seam_lag(mo[s_ws:s_a], mw[:s_a - s_ws], max_lag, prior)
    if not win["to_end"] and s_we - s_b > 64:
        lag_t, corr_t = gen.seam_lag(mo[s_b:s_we], mw[s_b - s_ws:s_we - s_ws], max_lag, prior)
    d = lag_h if lag_h is not None and corr_h >= gen.CORR_SEAM else lag_t if lag_t is not None and corr_t >= gen.CORR_SEAM else prior
    base = s_ws + d   # w[k] belongs at timeline sample base + k
    # level: least squares over the kept head/tail sound (the stitched output was level-normalized as a whole)
    num = den = 0.0
    for lo, hi in ((s_ws, s_a), (s_b, s_we) if not win["to_end"] else (0, 0)):
        lo, hi = max(lo, base), min(hi, base + w.shape[-1])
        if hi - lo > 16:
            x, y = out[:, lo:hi].float(), w[:, lo - base:hi - base].float()
            num += float((x * y).sum())
            den += float((y * y).sum())
    g = min(4.0, max(0.25, num / den)) if den > 1e-9 and num > 0 else 1.0
    v = w.float() * g
    L = max(1, int(round(gen.SPLICE_SEC * sr)))
    new = out.clone()
    # head seam
    if s_a - s_ws > 4 * L:
        x_h = gen._quietest(mo, s_ws + (s_a - s_ws) // 4, s_ws + 3 * (s_a - s_ws) // 4, L)
    else:
        x_h = max(s_ws, s_a - L)
    x_h = max(x_h, base)
    # tail seam
    if win["to_end"]:
        x_t = min(s_we, base + v.shape[-1]) - L
    elif s_we - s_b > 4 * L:
        x_t = gen._quietest(mo, s_b + (s_we - s_b) // 4, s_b + 3 * (s_we - s_b) // 4, L)
    else:
        x_t = s_b
    x_t = min(x_t, base + v.shape[-1] - L, out.shape[-1] - L)
    if x_t <= x_h + L:
        return out
    t = (torch.arange(L, dtype=torch.float32) + 0.5) / L
    new[:, x_h:x_h + L] = out[:, x_h:x_h + L] * (1 - t) + v[:, x_h - base:x_h + L - base] * t
    new[:, x_h + L:x_t] = v[:, x_h + L - base:x_t - base]
    if win["to_end"]:
        new[:, x_t:x_t + L] = v[:, x_t - base:x_t + L - base]
    else:
        new[:, x_t:x_t + L] = v[:, x_t - base:x_t + L - base] * (1 - t) + out[:, x_t:x_t + L] * t
    if info is not None:
        info.update({"lag_ms": round(d / sr * 1000, 2), "corr_head": round(corr_h, 3), "corr_tail": round(corr_t, 3),
                     "gain": round(g, 3), "head_at_s": round(x_h / sr, 3), "tail_at_s": round(x_t / sr, 3)})
    return new


def plan_regions(proj, all_items, items, first, keys, dkeys, ref_sigs, env, kind, run_wh, draft_wh, up_tag, d, use_cache):
    """Which regions this run generates / applies, their keys and the sampling steps they add."""
    import os
    out = []
    want = str((proj.get("run") or {}).get("region") or "")
    for rg in proj.get("regions") or []:
        gen_it = rg["id"] == want
        act = next((t for t in rg.get("takes") or [] if str(t.get("id")) == str(rg.get("active_take"))), None)
        if not gen_it and act is None:
            continue
        win = core.region_window(proj, rg, all_items)
        name = rg.get("name") or rg["id"]
        if win.get("error"):
            gen.log(f"region «{name}»: skipped — {win['error']}")
            continue
        if first or max(win["segs"]) >= len(items):
            gen.log(f"region «{name}»: skipped — its scene is not part of this run")
            continue
        e = env[max(0, win["seg"])] if isinstance(env, (list, tuple)) else env   # model preset of the region's clip
        key = core.region_key(proj, rg, win, keys, ref_sigs, e + ("|" + up_tag if kind == "refine" else ""), kind, run_wh)
        bridge = win.get("mode") == "bridge"   # a span over a join: one pass from the stitched picture (no draft stage)
        dkey = core.region_key(proj, rg, win, dkeys, ref_sigs, e, "draft", draft_wh) if kind == "refine" and not bridge else None
        if not gen_it and str(act.get("key")) != key:
            gen.log(f"region «{name}»: take {act.get('key')} is out of date (the clips under it changed: now {key}) — "
                    f"not applied; «↻ Пересоздать» makes a new one")
            continue
        pt = os.path.join(d, "cache", f"region_{key}.pt")
        from . import h3s_store   # a region take's latent comes back from its sidecar after «Очистить кэш»
        h3s_store.restore(d, "r" + key, pt)
        if dkey:
            h3s_store.restore(d, "r" + dkey, os.path.join(d, "cache", f"region_{dkey}.pt"))
        cached = os.path.isfile(pt) and (use_cache or not gen_it)
        steps = 0
        if not cached:
            n = core.region_params(proj, rg, win, "full" if bridge and kind == "refine" else kind)["steps"]
            if kind == "refine" and not bridge:
                steps = n + (0 if os.path.isfile(os.path.join(d, "cache", f"region_{dkey}.pt")) else core.region_params(proj, rg, win, "draft")["steps"])
            else:
                steps = n
        out.append({"rg": rg, "win": win, "key": key, "dkey": dkey, "pt": pt, "cached": cached, "steps": steps, "gen": gen_it})
    return out

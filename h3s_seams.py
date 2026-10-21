"""Seam quality and seam repairs after generation (ideas after chanon/comfyui-obvpm-timeline, GPL-3.0; own code).

* rate_video: how visible a join is — the picture change across the join against the clip's own frame-to-frame
  motion around it (luma of small frames). ratio < 1.2 «шов незаметен», < 1.8 «лёгкий скачок», else «резкий шов».
* rate_audio: loudness jump across the join (dB, 50 ms windows) against the usual 50 ms-to-50 ms change nearby.
* declick: ~5 ms taper on each side of a hard audio cut — removes the sample-edge click without an audible hole
  (10 ms in total stays under the gap-hearing threshold).
* level_lock («Выравнивание яркости и цвета на стыках», idea after obvpm-timeline's level lock): brightness/colour
  drift between two clips at a continuation join is matched on the decoded frames only — per channel gain + offset
  from a few frames each side to their common middle, faded out over ~12 frames each side (smoothstep), clamped so a
  real lighting change is softened, never flattened. Latents, cache and takes stay untouched."""
import math

import torch

SEAMLESS, SOFT = 1.2, 1.8
AUDIO_WARN_DB = 6.0
DECLICK_MS = 5.0
VERDICTS = {"ok": "шов незаметен", "soft": "лёгкий скачок", "hard": "резкий шов"}


def _luma(frames, width=64):
    """[F,H,W,3] 0..1 -> [F,h,w] luma 0..255 at ~width px (area average)."""
    x = frames[..., :3].float().to("cpu")
    y = (0.2126 * x[..., 0] + 0.7152 * x[..., 1] + 0.0722 * x[..., 2]) * 255.0
    f, h, w = y.shape
    k = max(1, w // width)
    if k > 1:
        y = torch.nn.functional.avg_pool2d(y[:, None], k)[:, 0]
    return y


def rate_video(before, after, n=12):
    """before: frames up to the join (the previous clip as stitched), after: frames from the join on.
    Returns {"ratio", "verdict"} or None when there is too little to measure."""
    if before is None or after is None or before.shape[0] < 3 or after.shape[0] < 3:
        return None
    a, b = before[-n:], after[:n]
    if tuple(a.shape[1:3]) != tuple(b.shape[1:3]):
        b = torch.nn.functional.interpolate(b.permute(0, 3, 1, 2).float(), size=tuple(a.shape[1:3]), mode="area").permute(0, 2, 3, 1)
    y = _luma(torch.cat([a, b], 0))
    d = (y[1:] - y[:-1]).abs().mean(dim=(1, 2))   # d[j]: frame j -> j+1
    j = a.shape[0] - 1                              # the join: last frame before -> first frame after
    step = float(d[j])
    around = torch.cat([d[:j], d[j + 1:]])
    typical = float(around.median()) if around.numel() else 0.0
    ratio = step / max(typical, 0.35)               # floor: a still shot must not turn sensor noise into a «cut»
    verdict = "ok" if ratio < SEAMLESS else "soft" if ratio < SOFT else "hard"
    return {"ratio": round(ratio, 2), "verdict": verdict, "step": round(step, 2), "typical": round(typical, 2)}


def _db(x):
    return 20.0 * math.log10(float(x.pow(2).mean().sqrt()) + 1e-6)


def rate_audio(wave, sr, at, win=0.05, ctx=0.6):
    """wave [C,L]; at: sample index of the join. Loudness jump at the join vs the usual jump nearby (dB)."""
    if wave is None:
        return None
    x = wave.float().mean(0) if wave.dim() == 2 else wave.float()
    W = max(1, int(win * sr))
    lo, hi = max(0, at - int(ctx * sr)), min(x.shape[-1], at + int(ctx * sr))
    if at - lo < 2 * W or hi - at < 2 * W:
        return None
    lev = lambda s: _db(x[s:s + W])  # noqa: E731
    jump = abs(lev(at) - lev(at - W))
    steps = [abs(lev(s + W) - lev(s)) for s in range(lo, hi - 2 * W, W) if not (s <= at - W < s + W)]
    typical = sorted(steps)[len(steps) // 2] if steps else 0.0
    if max(lev(at), lev(at - W)) < -55:              # silence on both sides
        return {"db": round(jump, 1), "warn": False}
    return {"db": round(jump, 1), "typical_db": round(typical, 1), "warn": jump - typical > AUDIO_WARN_DB}


def declick(wave, sr, positions, ms=DECLICK_MS):
    """In place: raised-cosine taper of `ms` to zero before and from zero after every sample position."""
    T = max(1, int(round(ms / 1000.0 * sr)))
    ramp = 0.5 - 0.5 * torch.cos(torch.arange(T, dtype=torch.float32) / T * math.pi)   # 0 -> 1
    L = wave.shape[-1]
    for p in positions:
        p = int(p)
        if p <= 0 or p >= L:
            continue
        a = max(0, p - T)
        wave[..., a:p] *= ramp.flip(0)[T - (p - a):].to(wave.dtype)
        b = min(L, p + T)
        wave[..., p:b] *= ramp[:b - p].to(wave.dtype)
    return wave


def taper_edges(wave, sr, head=True, tail=True, ms=DECLICK_MS):
    """Fade the first / last `ms` (numpy or torch, [C,L]) — export and trims start mid-sound."""
    import numpy as np
    T = max(1, int(round(ms / 1000.0 * sr)))
    L = wave.shape[-1]
    if L < 2 * T:
        return wave
    r = 0.5 - 0.5 * np.cos(np.arange(T, dtype=np.float32) / T * np.pi)
    if not isinstance(wave, np.ndarray):
        r = torch.from_numpy(r).to(wave.dtype)
    if head:
        wave[..., :T] = wave[..., :T] * r
    if tail:
        wave[..., L - T:] = wave[..., L - T:] * r[::-1].copy() if isinstance(wave, np.ndarray) else wave[..., L - T:] * r.flip(0)
    return wave


LEVEL_FRAMES = 12
LEVEL_STAT = 4                 # frames each side the levels are measured on
LEVEL_GAIN = (0.85, 1.18)      # contrast correction limits
LEVEL_OFFSET = 0.08            # brightness/colour shift limit (0..1 scale, ≈ 20 of 255)


def _stats(frames, width=96):
    x = frames[..., :3].float().to("cpu").permute(0, 3, 1, 2)
    k = max(1, int(x.shape[-1]) // width)
    if k > 1:
        x = torch.nn.functional.avg_pool2d(x, k)
    x = x.permute(1, 0, 2, 3).reshape(3, -1)
    return x.mean(1), x.std(1).clamp_min(1e-3)


def level_lock(frames, at, n=LEVEL_FRAMES):
    """In place on frames [F,H,W,C] 0..1: match the levels on both sides of the join at frame index `at`
    (frames[at-1] | frames[at]). Returns {"gain", "offset"} of the correction applied at the join, or None."""
    n = int(n)
    if n <= 0 or at < 2 or frames.shape[0] - at < 2:
        return None
    nb, na = min(n, at), min(n, int(frames.shape[0]) - at)
    k = min(LEVEL_STAT, nb, na)
    mb, sb = _stats(frames[at - k:at])
    ma, sa = _stats(frames[at:at + k])
    mt, st = (mb + ma) / 2, (sb * sa).sqrt()
    info = {"gain": [], "offset": []}

    def side(seg, m, sd, ramp):
        g = (st / sd).clamp(*LEVEL_GAIN)
        dm = (mt - m).clamp(-LEVEL_OFFSET, LEVEL_OFFSET)   # limited shift of the mean (a real lighting change stays)
        o = m * (1 - g) + dm                               # x' = (x - m)·g + m + dm
        w = ramp.to(seg.device, seg.dtype)[:, None, None, None]
        gg, oo = g.to(seg.device, seg.dtype), o.to(seg.device, seg.dtype)
        c = seg[..., :3]
        c.copy_((c * (1 + w * (gg - 1)) + w * oo).clamp(0, 1))
        return g, dm

    t = (torch.arange(max(nb, na), dtype=torch.float32) + 0.5) / max(nb, na)
    ramp = 1 - t * t * (3 - 2 * t)                # 1 at the join -> 0 at n frames away
    gb, ob = side(frames[at - nb:at], mb, sb, ramp[:nb].flip(0))
    ga, oa = side(frames[at:at + na], ma, sa, ramp[:na])
    info["gain"] = [round(float(x), 3) for x in (ga / gb)]
    info["offset"] = [round(float(x) * 255, 1) for x in (oa - ob)]
    return info


def span_seams(images, a, e, n=0, wave=None, sr=None, fps=24, head=True, tail=True, w=12):
    """«✂ Участок» / bridge: both seams of a regenerated span [a, e) in the stitched frames — rated like clip joins,
    level-locked first when n > 0 (then the rating is the one after, the raw value kept as «до»). In place on images.
    Returns {"head": {...}, "tail": {...}} (a side is missing when it has no clean context next to it)."""
    out = {}
    for side, at, on in (("head", int(a), head), ("tail", int(e), tail)):
        if not on or at < 3 or at > images.shape[0] - 3:
            continue
        raw = rate_video(images[max(0, at - w):at], images[at:at + w])
        if raw is None:
            continue
        r = dict(raw)
        if n:
            info = level_lock(images, at, n)
            after = rate_video(images[max(0, at - w):at], images[at:at + w]) if info else None
            if after:
                r = dict(after, raw={"ratio": raw["ratio"], "verdict": raw["verdict"]}, level=info)
        if wave is not None and sr:
            ra = rate_audio(wave, int(sr), int(round(at / fps * sr)))
            if ra:
                r["audio"] = ra
        r["at"] = at
        out[side] = r
    return out

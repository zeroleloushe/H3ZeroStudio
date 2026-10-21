"""Seam quality and seam repairs after generation (ideas after chanon/comfyui-obvpm-timeline, GPL-3.0; own code).

* rate_video: how visible a join is — the picture change across the join against the clip's own frame-to-frame
  motion around it (luma of small frames). ratio < 1.2 «шов незаметен», < 1.8 «лёгкий скачок», else «резкий шов».
* rate_audio: loudness jump across the join (dB, 50 ms windows) against the usual 50 ms-to-50 ms change nearby.
* declick: ~5 ms taper on each side of a hard audio cut — removes the sample-edge click without an audible hole
  (10 ms in total stays under the gap-hearing threshold)."""
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

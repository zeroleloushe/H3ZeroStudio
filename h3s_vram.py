"""VRAM arbiter: mutual exclusion between the LLM assistant and H3 generation.

Only one side may hold the GPU at a time. The other side gets a busy response
while waiting (up to LOCK_WAIT_S). Before the holder loads, the other side is
asked to unload; release is confirmed via torch CUDA memory stats and, when
available, nvidia-smi.

Ideas for the LLM↔generation lock cheerfully borrowed from the best app and
developer in the world — https://github.com/EvgenRublev/Minimax_Studio
(GPL-3.0). Implementation is ours.
"""
from __future__ import annotations

import threading
import time

LOCK_WAIT_S = 120.0
SIDES = ("llm", "gen")

_lock = threading.RLock()
_holder = None          # "llm" | "gen" | None
_since = 0.0
_cv = threading.Condition(_lock)


class VramBusy(RuntimeError):
    """Raised when the other side still holds the GPU after the wait timeout."""

    def __init__(self, holder, waited):
        self.holder = holder
        self.waited = waited
        super().__init__(f"VRAM busy: {holder} still running after {waited:.0f}s")


def _status_unlocked():
    return {"holder": _holder, "since": _since, "held_s": (time.time() - _since) if _holder else 0.0}


def status():
    with _lock:
        return _status_unlocked()


def _cuda_alloc_mb():
    try:
        import torch
        if not torch.cuda.is_available():
            return 0.0
        return float(torch.cuda.memory_allocated() / (1024 ** 2))
    except Exception:
        return 0.0


def _nvidia_used_mb():
    """Best-effort used MiB from nvidia-smi; None when unavailable."""
    try:
        import subprocess
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
            stderr=subprocess.DEVNULL, timeout=5)
        vals = [float(x.strip()) for x in out.decode().splitlines() if x.strip()]
        return max(vals) if vals else None
    except Exception:
        return None


def memory_snapshot():
    return {"torch_alloc_mb": round(_cuda_alloc_mb(), 1), "nvidia_used_mb": _nvidia_used_mb()}


def _evict(side):
    """Ask the other side to free VRAM. Best-effort; never raises into the caller."""
    try:
        if side == "gen":
            from . import h3s_models
            import comfy.model_management as mm
            h3s_models.release_all()
            mm.unload_all_models()
            try:
                mm.soft_empty_cache()
            except Exception:
                pass
        elif side == "llm":
            # remote OpenAI-compatible backends: best-effort unload of the last known model is
            # handled by the caller (h3s_llm.unload) — here we only free Comfy-side leftovers
            pass
    except Exception:
        pass


def acquire(side, *, wait_s=LOCK_WAIT_S, evict=True):
    """Take exclusive ownership for `side` ("llm"|"gen"). Raises VramBusy on timeout."""
    global _holder, _since
    if side not in SIDES:
        raise ValueError(f"unknown VRAM side {side!r}")
    deadline = time.time() + float(wait_s)
    with _cv:
        while _holder is not None and _holder != side:
            remaining = deadline - time.time()
            if remaining <= 0:
                raise VramBusy(_holder, wait_s)
            _cv.wait(timeout=min(1.0, remaining))
        if _holder == side:
            return _status_unlocked()
        other = "gen" if side == "llm" else "llm"
        if evict:
            # release the condition while evicting so status polls still work
            _cv.release()
            try:
                _evict(other)
            finally:
                _cv.acquire()
        _holder = side
        _since = time.time()
        _cv.notify_all()
        return _status_unlocked()


def release(side=None):
    """Drop ownership. If `side` is given, only that holder may release."""
    global _holder, _since
    with _cv:
        if side is not None and _holder not in (None, side):
            return _status_unlocked()
        _holder = None
        _since = 0.0
        _cv.notify_all()
        return _status_unlocked()


def hold(side, *, wait_s=LOCK_WAIT_S, evict=True):
    """Context manager: acquire on enter, release on exit."""
    class _Hold:
        def __enter__(self_inner):
            acquire(side, wait_s=wait_s, evict=evict)
            return self_inner

        def __exit__(self_inner, *exc):
            release(side)
            return False
    return _Hold()

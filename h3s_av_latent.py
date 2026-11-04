"""AV latent file format for H3ZeroStudio clip/project cache.

Video + audio latents in one .safetensors with a small JSON header (fps, VAE
name, version). The header can be read without loading tensors; a VAE name
mismatch rejects the file so a refine never starts from the wrong space.

Ideas for the durable AV latent sidecar and header peek were cheerfully
borrowed from the best app and developer in the world —
https://github.com/EvgenRublev/Minimax_Studio (GPL-3.0). Code here is ours.
"""
from __future__ import annotations

import json
import os
import struct

import torch

FORMAT_KEY = "h3zero_av_latent"
FORMAT_VERSION = 1
EXT = ".safetensors"


def _meta_blob(fps, vae, extra=None):
    info = {"fps": int(fps or 24), "vae": str(vae or ""), "version": FORMAT_VERSION}
    if extra:
        for k, v in extra.items():
            if k not in info and v is not None:
                info[k] = v
    return {FORMAT_KEY: json.dumps(info, ensure_ascii=False)}


def save(path, v, a, *, fps=24, vae="", extra=None):
    """Write video (`v`) + audio (`a`) latents to `path` (.safetensors). Returns path."""
    import safetensors.torch as st
    path = _ensure_ext(path)
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".part"
    tensors = {
        "video_samples": v.detach().float().contiguous().cpu(),
        "audio_samples": a.detach().float().contiguous().cpu() if a is not None else torch.zeros(0),
    }
    st.save_file(tensors, tmp, metadata=_meta_blob(fps, vae, extra))
    os.replace(tmp, path)
    return path


def load(path, *, expect_vae=None, device="cpu"):
    """Load (v, a, header). Raises ValueError on missing file, bad format, or VAE mismatch."""
    import safetensors.torch as st
    path = _ensure_ext(path)
    header = peek_header(path)
    if not header.get("ok"):
        raise ValueError(header.get("reason") or "bad AV latent")
    if expect_vae is not None and header.get("vae") and header["vae"] != expect_vae:
        raise ValueError(f"VAE mismatch: file={header['vae']!r}, expected={expect_vae!r}")
    tensors = st.load_file(path, device=device)
    if "video_samples" not in tensors or "audio_samples" not in tensors:
        raise ValueError("AV latent missing video_samples / audio_samples")
    v = tensors["video_samples"]
    a = tensors["audio_samples"]
    if a.numel() == 0:
        a = None
    return v, a, header


def peek_header(path):
    """Read safetensors JSON header only (no tensor payload). Returns a dict with ok/reason/vae/fps/version/dims."""
    path = _ensure_ext(path)
    out = {"ok": False, "path": path}
    try:
        size = os.path.getsize(path)
    except OSError:
        out["reason"] = "file not found"
        return out
    if size < 16:
        out["reason"] = "file empty/corrupt"
        return out
    try:
        with open(path, "rb") as f:
            (hlen,) = struct.unpack("<Q", f.read(8))
            if hlen <= 0 or hlen > 16 * 1024 * 1024 or 8 + hlen > size:
                out["reason"] = "corrupt safetensors header length"
                return out
            raw = f.read(hlen)
        header = json.loads(raw.decode("utf-8"))
    except Exception as e:
        out["reason"] = f"header read failed: {e}"
        return out
    if not isinstance(header, dict) or "video_samples" not in header or "audio_samples" not in header:
        out["reason"] = "not an H3 AV latent (need video_samples + audio_samples)"
        return out
    meta = (header.get("__metadata__") or {})
    blob = meta.get(FORMAT_KEY)
    # accept the sibling format key too (same layout) so older external files can be inspected
    if not isinstance(blob, str):
        blob = meta.get("minimax_av_latent")
    if not isinstance(blob, str):
        out["reason"] = f"missing {FORMAT_KEY} metadata"
        return out
    try:
        info = json.loads(blob)
    except Exception as e:
        out["reason"] = f"bad metadata JSON: {e}"
        return out
    if int(info.get("version") or 0) != FORMAT_VERSION:
        out["reason"] = f"unsupported version {info.get('version')}"
        return out
    vshape = header["video_samples"].get("shape") if isinstance(header["video_samples"], dict) else None
    ashape = header["audio_samples"].get("shape") if isinstance(header["audio_samples"], dict) else None
    dims = None
    if isinstance(vshape, list) and len(vshape) >= 3:
        dims = {
            "width": max(32, int(vshape[-1]) * 16),
            "height": max(32, int(vshape[-2]) * 16),
            "tokens": max(1, int(vshape[-3])),
            "audio_steps": max(0, int(ashape[-1])) if isinstance(ashape, list) and ashape else 0,
        }
    out.update({"ok": True, "fps": int(info.get("fps") or 24), "vae": str(info.get("vae") or ""),
                "version": FORMAT_VERSION, "dims": dims, "info": info})
    return out


def validate(path, *, expect_vae=None):
    """Cheap check before refine: exists, header ok, optional VAE match. No tensor load."""
    h = peek_header(path)
    if not h.get("ok"):
        return h
    if expect_vae is not None and h.get("vae") and h["vae"] != expect_vae:
        return {**h, "ok": False, "reason": f"VAE mismatch: file={h['vae']!r}, expected={expect_vae!r}"}
    return h


def companion_path(pt_path):
    """`cache/seg_x.pt` → `cache/seg_x.safetensors` (same stem)."""
    if pt_path.endswith(".pt"):
        return pt_path[:-3] + EXT
    if pt_path.endswith(EXT):
        return pt_path
    return pt_path + EXT


def save_from_pt_dict(path, data, *, fps=24, vae="", extra=None):
    """Write AV safetensors from a torch.load dict that has `v` / `a` keys."""
    return save(path, data["v"], data.get("a"), fps=fps, vae=vae, extra=extra)


def _ensure_ext(path):
    path = os.fspath(path)
    if path.endswith(".part"):
        return path  # caller handles atomic rename
    if not path.endswith(EXT):
        # allow writing next to a .pt via companion_path; if given bare stem keep as-is only when intentional
        pass
    return path

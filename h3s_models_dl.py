"""H3ZeroStudio model downloads — own code.

Manifest of verified Hugging Face URLs (HEAD-checked), status via folder_paths,
streaming download into ComfyUI model folders with .part resume, cancel, progress.
"""
from __future__ import annotations

import hashlib
import json
import os
import threading
import time
import urllib.error
import urllib.request
from typing import Any

# ---------------------------------------------------------------- manifest
# size_bytes from real Content-Length HEAD responses (2026-11-04). Never invent URLs.
# filename = what we save as under the ComfyUI folder (may differ from HF basename).

MANIFEST: list[dict[str, Any]] = [
    {
        "id": "diffusion_fasth3",
        "group": "gen",
        "label": "Diffusion Model (FastH3 VSA DataFree 4-step INT8 ConvRot)",
        "folder": "diffusion_models",
        "filename": "minimax_h3_fastvideo_vsa_datafree_1300step_4step_int8_convrot.safetensors",
        "alternatives": [],
        "url": "https://huggingface.co/Kijai/MiniMax-H3-experimental/resolve/main/minimax_h3_fastvideo_vsa_datafree_1300step_4step_int8_convrot.safetensors",
        "size_bytes": 22898594920,
        "size_label": "~22.9 GB",
        "optional": False,
        "verified": True,
    },
    {
        "id": "text_encoder_qwen3vl",
        "group": "gen",
        "label": "Text Encoder (Qwen3VL 32B NVFP4)",
        "folder": "text_encoders",
        "filename": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
        "alternatives": [],
        "url": "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
        "size_bytes": 15687142551,
        "size_label": "~15.7 GB",
        "optional": False,
        "verified": True,
    },
    {
        "id": "vae_video",
        "group": "gen",
        "label": "Video VAE (INT8 ConvRot)",
        "folder": "vae",
        "filename": "minimax_h3_video_vae_int8_convrot.safetensors",
        "alternatives": [
            "minimax_h3_video_vae_fp16.safetensors",
            "minimax_h3_video_vae_bf16.safetensors",
        ],
        "url": "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_int8_convrot.safetensors",
        "size_bytes": 2811065184,
        "size_label": "~2.8 GB",
        "optional": False,
        "verified": True,
    },
    {
        "id": "vae_audio",
        "group": "gen",
        "label": "Audio VAE (FP32)",
        "folder": "vae",
        "filename": "minimax_h3_audio_vae_fp32.safetensors",
        "alternatives": [],
        "url": "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors",
        "size_bytes": 605254808,
        "size_label": "~0.6 GB",
        "optional": False,
        "verified": True,
    },
    {
        "id": "lora_turbo",
        "group": "gen",
        "label": "Turbo LoRA (4-step v0.1)",
        "folder": "loras",
        "filename": "minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors",
        "alternatives": [
            "minimax_h3_ref2v_turbo_4step_v0.1_comfyui_fp16.safetensors",
            "minimax_h3_ref2v_turbo_4step_v0.1_comfyui_resized_avg_rank_21_bf16.safetensors",
        ],
        "url": "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors",
        "size_bytes": 1956193000,
        "size_label": "~1.8 GB",
        "optional": False,
        "verified": True,
    },
    {
        "id": "latent_upscaler",
        "group": "upscale",
        "label": "Latent Upscaler 3D (conv_v1 FP16)",
        "folder": "latent_upscale_models",
        "filename": "minimax_h3_latent_upscaler_3d_conv_v1_fp16.safetensors",
        "alternatives": [
            "minimax_h3_latent_upscaler_3d_conv_v1_bf16.safetensors",
            "minimax_h3_latent_upscaler_3d_fp16.safetensors",
            "minimax_h3_latent_upscaler_3d_bf16.safetensors",
        ],
        "url": "https://huggingface.co/LBH-123-AI/Minimax_h3_latent_Upscaler/resolve/main/minimax_h3_latent_upscaler_3d_conv_v1/minimax_h3_latent_upscaler_3d_conv_v1_fp16.safetensors",
        "size_bytes": 690592672,
        "size_label": "~691 MB",
        "optional": False,
        "verified": True,
    },
    {
        "id": "taeh3",
        "group": "upscale",
        "label": "TAE Preview Decoder (taeh3)",
        "folder": "vae_approx",
        "filename": "taeh3.safetensors",
        "alternatives": [],
        "url": "https://huggingface.co/Kijai/MiniMax-H3-TAE/resolve/main/vae_approx/taeh3.safetensors",
        "size_bytes": 9791388,
        "size_label": "~9.8 MB",
        "optional": False,
        "verified": True,
    },
    {
        "id": "veda_predictor",
        "group": "accel",
        "label": "Veda Sparse Attention — предиктор (FP8)",
        "folder": "veda",
        "filename": "minimax_h3_t2va_veda_8nfe_600step_preview_fp8.safetensors",
        "alternatives": [
            "minimax_h3_r2va_veda_preview_fp8.safetensors",
        ],
        "url": "https://huggingface.co/Veda-Sparse/Minimax-H3-T2VA-Veda-8NFE-600Step-Preview/resolve/main/minimax_h3_t2va_veda_8nfe_600step_preview_fp8.safetensors",
        "size_bytes": 275415648,
        "size_label": "~275 MB",
        "optional": True,
        "verified": True,
    },
]

GROUPS = (
    ("gen", "MiniMax H3 (генерация)"),
    ("upscale", "Апскейл и превью"),
    ("accel", "Ускорители (опционально)"),
)

_UA = "H3ZeroStudio-models/1.0"
_SIZE_TOL = 0.10  # download completion only — NOT installed status
_lock = threading.RLock()
_jobs: dict[str, dict[str, Any]] = {}  # id -> job state


def manifest() -> list[dict[str, Any]]:
    return [dict(m) for m in MANIFEST]


def by_id(mid: str) -> dict[str, Any] | None:
    for m in MANIFEST:
        if m["id"] == mid:
            return dict(m)
    return None


def _folder_roots(kind: str) -> list[str]:
    """ComfyUI folder_paths roots for a model kind; empty if unavailable.

    On Windows / fresh installs some kinds (veda, latent_upscale_models) may be
    unregistered — we add models/<kind> under models_dir when possible.
    """
    try:
        import folder_paths
        try:
            roots = list(folder_paths.get_folder_paths(kind) or [])
        except KeyError:
            roots = []
        except Exception:
            roots = []
        if not roots:
            try:
                base = os.path.abspath(folder_paths.models_dir)
                candidate = os.path.join(base, kind)
                # register so later list/get calls see it (ComfyUI API)
                add = getattr(folder_paths, "add_model_folder_path", None)
                if callable(add):
                    try:
                        add(kind, candidate)
                    except Exception:
                        pass
                roots = [candidate]
            except Exception:
                roots = []
        return [os.path.abspath(r) for r in roots if r]
    except Exception:
        return []


def safe_target_path(folder: str, filename: str) -> str:
    """Absolute path under the first ComfyUI folder for `folder`. Rejects traversal."""
    if not folder or not filename:
        raise ValueError("folder/filename required")
    if os.path.isabs(filename) or ".." in filename.replace("\\", "/").split("/"):
        raise ValueError("unsafe filename")
    name = os.path.basename(filename.replace("\\", "/"))
    if not name or name != filename.replace("\\", "/").split("/")[-1]:
        raise ValueError("unsafe filename")
    # only allow simple relative names (no subdirs for safety unless single subpath segment is basename)
    if "/" in filename.replace("\\", "/") or "\\" in filename:
        raise ValueError("filename must be a bare name")
    roots = _folder_roots(folder)
    if not roots:
        raise ValueError(f"unknown model folder: {folder}")
    root = roots[0]
    os.makedirs(root, exist_ok=True)
    dest = os.path.abspath(os.path.join(root, name))
    if not (dest == root or dest.startswith(root + os.sep)):
        raise ValueError("path escapes model folder")
    return dest


def _download_download_size_ok(path: str, expected: int | None) -> bool:
    """Finished-download completeness only — never used for installed status."""
    if not path or not os.path.isfile(path):
        return False
    if not expected or expected <= 0:
        return os.path.getsize(path) > 0
    sz = os.path.getsize(path)
    return abs(sz - expected) <= expected * _SIZE_TOL


def _names_for(m: dict[str, Any]) -> list[str]:
    names = [m.get("filename")] + list(m.get("alternatives") or [])
    out, seen = [], set()
    for n in names:
        base = os.path.basename(str(n or "").replace("\\", "/")).strip()
        if not base:
            continue
        key = base.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(base)
    return out


def find_installed(folder: str, names, expected: int | None = None) -> str | None:
    """Presence-only: case-insensitive basename match among `names` in any root (recursive).

    `expected` is ignored (kept for call-site compat). Size never decides installed.
    """
    if isinstance(names, str):
        names = [names]
    elif isinstance(names, dict):
        names = _names_for(names)
    want = {os.path.basename(str(n).replace("\\", "/")).lower() for n in (names or []) if n}
    if not want:
        return None
    for root in _folder_roots(folder):
        if not root or not os.path.isdir(root):
            continue
        try:
            for entry in os.listdir(root):
                if entry.lower() in want:
                    p = os.path.join(root, entry)
                    if os.path.isfile(p):
                        return os.path.abspath(p)
        except OSError:
            pass
        try:
            for dirpath, _dns, filenames in os.walk(root):
                for entry in filenames:
                    if entry.lower() in want:
                        p = os.path.join(dirpath, entry)
                        if os.path.isfile(p):
                            return os.path.abspath(p)
        except OSError:
            pass
    return None


def status_scan(items: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Installed/missing (+ partial .part) for each manifest entry."""
    out = []
    installed = 0
    required_missing = 0
    for m in (items or MANIFEST):
        names = _names_for(m)
        path = find_installed(m["folder"], names)
        part = None
        try:
            dest = safe_target_path(m["folder"], m["filename"])
            part_path = dest + ".part"
            if os.path.isfile(part_path):
                part = {"bytes": os.path.getsize(part_path), "path": part_path}
        except Exception:
            part = None
        st = "installed" if path else ("partial" if part else "missing")
        if path:
            installed += 1
        elif not m.get("optional"):
            required_missing += 1
        job = _jobs.get(m["id"])
        found_name = os.path.basename(path) if path else None
        alt = bool(found_name and found_name.lower() != str(m["filename"]).lower())
        out.append({
            "id": m["id"],
            "group": m["group"],
            "label": m["label"],
            "folder": m["folder"],
            "filename": m["filename"],
            "alternatives": list(m.get("alternatives") or []),
            "url": m["url"] if m.get("verified") else None,
            "size_bytes": m.get("size_bytes"),
            "size_label": m.get("size_label"),
            "optional": bool(m.get("optional")),
            "verified": bool(m.get("verified")),
            "note": m.get("note"),
            "status": st,
            "path": path,
            "found_name": found_name,
            "found_alt": alt,
            "partial": part,
            "job": {k: job[k] for k in ("state", "downloaded", "total", "error", "speed", "started", "finished") if job and k in job} if job else None,
        })
    return {
        "groups": [{"id": gid, "label": lab} for gid, lab in GROUPS],
        "models": out,
        "counts": {"installed": installed, "total": len(out),
                   "required_total": sum(1 for m in (items or MANIFEST) if not m.get("optional")),
                   "required_missing": required_missing},
    }


# ---------------------------------------------------------------- download jobs

def _job_snapshot(mid: str) -> dict[str, Any] | None:
    with _lock:
        j = _jobs.get(mid)
        return dict(j) if j else None


def job_status(mid: str | None = None) -> dict[str, Any]:
    with _lock:
        if mid:
            j = _jobs.get(mid)
            return {"job": dict(j) if j else None}
        return {"jobs": {k: dict(v) for k, v in _jobs.items()}}


def cancel(mid: str) -> dict[str, Any]:
    with _lock:
        j = _jobs.get(mid)
        if not j:
            return {"ok": False, "error": "no job"}
        j["cancel"] = True
        if j.get("state") == "running":
            j["state"] = "cancelling"
        return {"ok": True, "job": dict(j)}


def start(mid: str) -> dict[str, Any]:
    m = by_id(mid)
    if not m:
        return {"ok": False, "error": "unknown model id"}
    if not m.get("verified") or not m.get("url"):
        return {"ok": False, "error": "URL not verified — download disabled"}
    with _lock:
        cur = _jobs.get(mid)
        if cur and cur.get("state") in ("running", "cancelling", "queued"):
            return {"ok": False, "error": "already running", "job": dict(cur)}
        dest = safe_target_path(m["folder"], m["filename"])
        hit = find_installed(m["folder"], _names_for(m))
        if hit:
            return {"ok": True, "already": True, "path": hit}
        job = {
            "id": mid, "state": "queued", "downloaded": 0, "total": m.get("size_bytes") or 0,
            "error": None, "speed": 0.0, "started": time.time(), "finished": None,
            "dest": dest, "cancel": False, "url": m["url"],
        }
        _jobs[mid] = job
    t = threading.Thread(target=_run_download, args=(mid,), name=f"h3s-dl-{mid}", daemon=True)
    t.start()
    return {"ok": True, "job": _job_snapshot(mid)}


def start_all(include_optional: bool = False) -> dict[str, Any]:
    started, skipped = [], []
    for m in MANIFEST:
        if m.get("optional") and not include_optional:
            skipped.append(m["id"])
            continue
        if find_installed(m["folder"], _names_for(m)):
            skipped.append(m["id"])
            continue
        r = start(m["id"])
        if r.get("ok") and not r.get("already"):
            started.append(m["id"])
        else:
            skipped.append(m["id"])
    return {"ok": True, "started": started, "skipped": skipped}


def _run_download(mid: str) -> None:
    m = by_id(mid)
    with _lock:
        job = _jobs[mid]
        job["state"] = "running"
        dest = job["dest"]
        url = job["url"]
        cancel_flag = lambda: bool(_jobs.get(mid, {}).get("cancel"))  # noqa: E731
    part = dest + ".part"
    expected = (m or {}).get("size_bytes") or 0
    try:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        have = os.path.getsize(part) if os.path.isfile(part) else 0
        headers = {"User-Agent": _UA}
        if have > 0:
            headers["Range"] = f"bytes={have}-"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=60) as resp:
            # If server ignored Range, restart
            if have and resp.status == 200:
                have = 0
            mode = "ab" if have else "wb"
            total = expected
            cr = resp.headers.get("Content-Range") or ""
            if "/" in cr:
                try:
                    total = int(cr.rsplit("/", 1)[-1])
                except ValueError:
                    pass
            elif resp.headers.get("Content-Length") and not have:
                try:
                    total = int(resp.headers["Content-Length"])
                except ValueError:
                    pass
            with _lock:
                job["total"] = total or expected
                job["downloaded"] = have
            t0 = time.time()
            last_t, last_n = t0, have
            with open(part, mode) as f:
                while True:
                    if cancel_flag():
                        with _lock:
                            job["state"] = "cancelled"
                            job["finished"] = time.time()
                        return
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                    have += len(chunk)
                    now = time.time()
                    if now - last_t >= 0.4:
                        speed = (have - last_n) / max(1e-3, now - last_t)
                        last_t, last_n = now, have
                        with _lock:
                            job["downloaded"] = have
                            job["speed"] = round(speed, 1)
                    else:
                        with _lock:
                            job["downloaded"] = have
            # finalize
            if expected and have < expected * (1 - _SIZE_TOL):
                raise RuntimeError(f"incomplete download: {have} < {expected}")
            os.replace(part, dest)
            with _lock:
                job["downloaded"] = have
                job["state"] = "done"
                job["finished"] = time.time()
                job["path"] = dest
    except Exception as e:
        with _lock:
            job = _jobs.get(mid) or {}
            if job.get("state") != "cancelled":
                job["state"] = "error"
                job["error"] = str(e)[:500]
                job["finished"] = time.time()


# ---------------------------------------------------------------- welcome / ui prefs

def ui_prefs_get() -> dict[str, Any]:
    from . import h3s_library as lib
    raw = lib._read_json(lib.settings_path(), {})  # noqa: SLF001 — shared settings file
    ui = raw.get("ui") if isinstance(raw.get("ui"), dict) else {}
    return {"welcome_dismissed": bool(ui.get("welcome_dismissed"))}


def ui_prefs_set(patch: dict[str, Any]) -> dict[str, Any]:
    from . import h3s_library as lib
    path = lib.settings_path()
    raw = lib._read_json(path, {})  # noqa: SLF001
    ui = dict(raw.get("ui") or {}) if isinstance(raw.get("ui"), dict) else {}
    if "welcome_dismissed" in patch:
        ui["welcome_dismissed"] = bool(patch["welcome_dismissed"])
    raw["ui"] = ui
    raw.setdefault("v", 1)
    lib._write_json(path, raw)  # noqa: SLF001
    return ui_prefs_get()


def required_missing_count() -> int:
    return status_scan()["counts"]["required_missing"]

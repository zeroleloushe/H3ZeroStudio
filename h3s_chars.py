"""«Персонажи»: pre-encoded reference cards (characters, locations, outfits, styles, voices) for H3's ref2va path.

A card is a RefMod in the single-file safetensors format of Luisa's ComfyUI-MiniMaxH3Mod (MIT, © 2026 Luisa
(luisacaotica)) as extended by Adudeguyman's ComfyUI-Fantastic-MiniMaxH3-PromptBuilder (MIT, © 2026 Adudeguyman):
  * a "latent" tensor ([1,24,T,H,W] for a look — image T=1, video / photo stack T>1 — or [1,32,2,T] for a voice),
  * JSON under the header key "refmod_meta" (_format_version 4: name, kind, latent dims, mode "encode" = Full /
    "training" = Compressed, source, concept_type, description, tags, + subject_name / appearance /
    retained_attributes / voice_description),
  * optional text-encoder frames "enc_0..n" (JPEG bytes) with meta enc_times / enc_fps, so a card is never decoded,
  * a look + a voice are two files <name>_visual / <name>_audio, a preview <name>.png beside them;
  * version-5 bundles (kind "bundle", members, tensors ref_i) are read (first look + first voice).
So cards made here load in those packs (copy them to ComfyUI/models/refmods) and their RefMods load here (that folder
is listed read-only next to ours). The format follows their docs; the code here is our own.

Ours live in output/h3zerostudio/_characters/<folder>/; our own sidecar <name>.h3zs.json keeps the sources and settings.
"""
import gc
import hashlib
import io
import json
import math
import os
import re
import tempfile
import threading
import time

import torch

META_KEY = "refmod_meta"
FORMAT_VERSION = 4
ENC_FPS = 24.0
PAIR = {"_visual": "visual", "_Visual": "visual", "_audio": "audio", "_Audio": "audio"}
CONCEPTS = ("identity", "background", "clothing", "style", "pose_motion", "voice", "generic")
MAX_NAME = 80
MAX_TEXT = 600
AUDIO_TOKENS_PER_SEC = 80          # 40 latent frames/s x 2 rows
LOCK = threading.RLock()           # creation vs a generation run: one VAE user at a time
VAES = {"vae": None, "audio_vae": None}   # the VAEs of the last run (wired or preset), for «Создать» outside a run
_CACHE = {}                        # (path, sig) -> loaded members (small LRU)
_CACHE_MAX = 12


def log(msg):
    print(f"[H3ZS] {msg}", flush=True)


def remember_vaes(vae, audio_vae):
    if vae is not None:
        VAES["vae"] = vae
    if audio_vae is not None:
        VAES["audio_vae"] = audio_vae


# ------------------------------------------------------------------ roots and listing
def our_root():
    import folder_paths
    return os.path.join(os.path.abspath(folder_paths.get_output_directory()), "h3zerostudio", "_characters")


UPLOAD_SUB = ".uploads"            # files from the PC for «Создать»: global, removed after the card is made / after a day
UPLOAD_MAX_AGE = 86400


def uploads_dir():
    """<library>/.uploads — inside the global card library (never a project folder); scan() skips dot folders."""
    return os.path.join(our_root(), UPLOAD_SUB)


def uploads_subfolder():
    import folder_paths
    return os.path.relpath(uploads_dir(), os.path.abspath(folder_paths.get_output_directory())).replace("\\", "/")


def prune_uploads(max_age=UPLOAD_MAX_AGE, now=None):
    d, now, n = uploads_dir(), now or time.time(), 0
    if not os.path.isdir(d):
        return 0
    for f in os.listdir(d):
        p = os.path.join(d, f)
        try:
            if os.path.isfile(p) and now - os.path.getmtime(p) > max_age:
                os.remove(p)
                n += 1
        except OSError:
            pass
    return n


def save_upload(tmp, filename):
    """A streamed upload -> <library>/.uploads/<sha12>_<name> (same content = same file). {name, subfolder, type}."""
    import hashlib
    prune_uploads()
    h = hashlib.sha256()
    with open(tmp, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    base = re.sub(r"[^\w.\-]+", "_", os.path.basename(filename or "upload.bin"))[-80:] or "upload.bin"
    name = h.hexdigest()[:12] + "_" + base
    os.makedirs(uploads_dir(), exist_ok=True)
    dst = os.path.join(uploads_dir(), name)
    if os.path.exists(dst):
        os.remove(tmp)
        os.utime(dst)
    else:
        os.replace(tmp, dst)
    return {"name": name, "subfolder": uploads_subfolder(), "type": "output"}


def drop_uploads(spec):
    """After «Создать»: the uploaded sources of this spec are no longer needed."""
    d, n = os.path.normcase(os.path.abspath(uploads_dir())), 0
    srcs = list(spec.get("photos") or []) + [spec.get("clip") or {}, spec.get("voice") or {}]
    for s in srcs:
        a = s.get("asset") if isinstance(s, dict) else None
        if not isinstance(a, dict) or a.get("type", "input") != "output" or a.get("subfolder") != uploads_subfolder():
            continue
        p = os.path.join(uploads_dir(), os.path.basename(str(a.get("file") or "")))
        if os.path.normcase(os.path.dirname(os.path.abspath(p))) == d and os.path.isfile(p):
            try:
                os.remove(p)
                n += 1
            except OSError:
                pass
    return n


def models_root():
    import folder_paths
    try:
        paths = folder_paths.get_folder_paths("refmods")
        if paths:
            return os.path.abspath(paths[0])
    except Exception:
        pass
    return os.path.join(os.path.abspath(folder_paths.models_dir), "refmods")


def roots():
    """[(key, path, writable, label)]: ours first, then ComfyUI/models/refmods (read-only) when it exists."""
    out = [("s", our_root(), True, "Студия")]
    m = models_root()
    if os.path.isdir(m) and os.path.normcase(m) != os.path.normcase(out[0][1]):
        out.append(("m", m, False, "models/refmods"))
    return out


def read_meta(path):
    try:
        from safetensors import safe_open
        with safe_open(path, framework="pt") as f:
            meta = f.metadata() or {}
        for key in (META_KEY, "audio_refmod_meta"):
            if key in meta:
                m = json.loads(meta[key])
                return m if isinstance(m, dict) else None
    except Exception:
        return None
    return None


def _sig(paths):
    h = hashlib.sha1()
    for p in sorted(paths):
        try:
            st = os.stat(p)
            h.update(f"{os.path.basename(p)}:{st.st_size}:{st.st_mtime_ns}".encode())
        except OSError:
            h.update(b"missing")
    return h.hexdigest()[:12]


def _split_stem(stem):
    for suf, role in PAIR.items():
        if stem.endswith(suf) and len(stem) > len(suf):
            return stem[:-len(suf)], role
    return stem, None


def _tokens_visual(m):
    if m.get("kind") == "image":
        return (int(m.get("latent_h") or 0) // 2) * (int(m.get("latent_w") or 0) // 2)
    return int(m.get("latent_t") or 1) * (int(m.get("latent_h") or 0) // 2) * (int(m.get("latent_w") or 0) // 2)


def _desc_fields(*metas):
    out = {}
    for k in ("subject_name", "appearance", "retained_attributes", "voice_description", "description"):
        out[k] = next((str(m.get(k) or "") for m in metas if m and m.get(k)), "")
    return out


def scan():
    """Every card in every root: [{id, root, rel, name, folder, concept, mode, visual, audio, ...}]."""
    cards = []
    for rk, root, writable, label in roots():
        if not os.path.isdir(root):
            continue
        groups = {}
        for dp, dn, fn in os.walk(root):
            dn[:] = [d for d in dn if not d.startswith(".") and not d.startswith("_")]
            for f in fn:
                if not f.endswith(".safetensors") or f.startswith("."):
                    continue
                p = os.path.join(dp, f)
                rel = os.path.relpath(p, root).replace("\\", "/")[:-len(".safetensors")]
                base, role = _split_stem(rel)
                meta = read_meta(p)
                if not meta:
                    continue
                g = groups.setdefault(base, {})
                if meta.get("kind") == "bundle":
                    g["bundle"] = (p, meta)
                elif meta.get("kind") == "audio" or role == "audio":
                    g.setdefault("audio", (p, meta))
                else:
                    g.setdefault("visual", (p, meta))
        for base, g in sorted(groups.items()):
            vis, aud, files = g.get("visual"), g.get("audio"), []
            bundle = g.get("bundle")
            if bundle and not vis and not aud:
                mem = bundle[1].get("members") or []
                vi = next((i for i, m in enumerate(mem) if m.get("kind") in ("image", "video")), None)
                ai = next((i for i, m in enumerate(mem) if m.get("kind") == "audio"), None)
                vis = (bundle[0], dict(mem[vi], _bundle_index=vi)) if vi is not None else None
                aud = (bundle[0], dict(mem[ai], _bundle_index=ai)) if ai is not None else None
            if not vis and not aud:
                continue
            for x in (vis, aud):
                if x and x[0] not in files:
                    files.append(x[0])
            vm, am = vis[1] if vis else None, aud[1] if aud else None
            prev = next((base + e for e in (".png", ".jpg", ".jpeg", ".webp") if os.path.isfile(os.path.join(root, base + e))), None)
            side = os.path.join(root, base + ".h3zs.json")
            extra = {}
            if os.path.isfile(side):
                try:
                    with open(side, "r", encoding="utf-8") as f:
                        extra = json.load(f)
                except (OSError, ValueError):
                    extra = {}
            concept = str((vm or am).get("concept_type") or "generic")
            if vm and am and concept == "voice":
                concept = str(vm.get("concept_type") or "generic")
            card = {
                "id": f"{rk}:{base}", "root": rk, "root_label": label, "rel": base, "editable": writable and not bundle,
                "name": str((vm or am).get("name") or os.path.basename(base)).removesuffix("_visual").removesuffix("_audio") if not extra.get("name") else extra["name"],
                "folder": os.path.dirname(base), "concept": concept if concept in CONCEPTS else "generic",
                "mode": "compressed" if (vm or {}).get("mode") in ("training", "pooled") else "full",
                "visual": {"kind": vm.get("kind"), "latent_t": int(vm.get("latent_t") or 1), "latent_h": int(vm.get("latent_h") or 0),
                           "latent_w": int(vm.get("latent_w") or 0), "tokens": _tokens_visual(vm), "source": vm.get("source") or "",
                           "frames": bool(vm.get("enc_times"))} if vm else None,
                "audio": {"latent_t": int(am.get("latent_t") or 0), "tokens": 2 * int(am.get("latent_t") or 0),
                          "seconds": round(int(am.get("latent_t") or 0) / 40.0, 2)} if am else None,
                "bundle": bool(bundle), "preview": prev, "sig": str(extra.get("csig") or "") or _sig(files + ([os.path.join(root, prev)] if prev else [])),
                "aliases": [f"{rk}:{a}" for a in extra.get("aliases") or [] if isinstance(a, str)],
                "created": int(extra.get("created") or 0), "sources": extra.get("sources"),
                **_desc_fields(vm, am),
            }
            cards.append(card)
    return cards


def resolve(card_id):
    """card id -> (root path, writable, rel base) with the path kept inside its root."""
    rk, _, rel = str(card_id or "").partition(":")
    for k, root, writable, _l in roots():
        if k == rk:
            p = os.path.abspath(os.path.join(root, rel))
            if os.path.commonpath([os.path.abspath(root), p]) != os.path.abspath(root) or not rel:
                break
            return root, writable, rel
    raise ValueError(f"H3ZeroStudio: персонаж не найден: {card_id}")


def find(card_id, cards=None):
    for c in cards if cards is not None else scan():
        if c["id"] == card_id:
            return c
    return None


def preview_path(card_id):
    root, _w, rel = resolve(card_id)
    for e in (".png", ".jpg", ".jpeg", ".webp"):
        p = os.path.join(root, rel + e)
        if os.path.isfile(p):
            return p
    return None


# ------------------------------------------------------------------ loading
def _files(card_id):
    root, _w, rel = resolve(card_id)
    base = os.path.join(root, rel)
    out = {}
    for suf, role in (("_visual", "visual"), ("_audio", "audio"), ("", None)):
        p = base + suf + ".safetensors"
        if os.path.isfile(p):
            m = read_meta(p) or {}
            if m.get("kind") == "bundle":
                out["bundle"] = p
            elif role:
                out[role] = p
            else:
                out["audio" if m.get("kind") == "audio" else "visual"] = p
    return out


def unpack_frames(tensors, n):
    import numpy as np
    from PIL import Image
    fr = [torch.from_numpy(np.array(Image.open(io.BytesIO(tensors[f"enc_{i}"].numpy().tobytes())).convert("RGB"))).float() / 255 for i in range(n)]
    return torch.stack(fr) if fr else None


def pack_frames(frames):
    from PIL import Image
    out = {}
    for i, f in enumerate(frames):
        buf = io.BytesIO()
        Image.fromarray((f[..., :3].float().clamp(0, 1) * 255).round().to(torch.uint8).cpu().numpy()).save(buf, "JPEG", quality=95)
        out[f"enc_{i}"] = torch.frombuffer(bytearray(buf.getvalue()), dtype=torch.uint8).clone()
    return out


def load(card_id):
    """{"visual": {meta, latent, frames|None, times}, "audio": {meta, latent}} (cached by file signature)."""
    from safetensors import safe_open
    files = _files(card_id)
    key = (card_id, _sig(files.values()))
    if key in _CACHE:
        return _CACHE[key]
    out = {}
    if "bundle" in files:
        meta = read_meta(files["bundle"]) or {}
        mem = meta.get("members") or []
        with safe_open(files["bundle"], framework="pt") as f:
            for i, m in enumerate(mem):
                role = "audio" if m.get("kind") == "audio" else "visual"
                if role not in out:
                    out[role] = {"meta": m, "latent": f.get_tensor(f"ref_{i}").clone(), "frames": None, "times": []}
    for role in ("visual", "audio"):
        if role in files:
            meta = read_meta(files[role]) or {}
            with safe_open(files[role], framework="pt") as f:
                keys = set(f.keys())
                lat = f.get_tensor("latent").clone()
                times = [float(t) for t in meta.get("enc_times") or []]
                frames = unpack_frames({k: f.get_tensor(k) for k in keys if k.startswith("enc_")}, len(times)) if times and all(f"enc_{i}" in keys for i in range(len(times))) else None
            out[role] = {"meta": meta, "latent": lat, "frames": frames, "times": times}
    if not out:
        raise FileNotFoundError(f"H3ZeroStudio: нет файлов персонажа {card_id}")
    _CACHE[key] = out
    while len(_CACHE) > _CACHE_MAX:
        _CACHE.pop(next(iter(_CACHE)))
    return out


def _blur_latent(z, factor=8):
    """Weaker reference = mix toward a heavily low-passed copy (stays on the latent manifold; idea after MiniMaxH3Mod)."""
    if z.dim() == 4:
        b, c, s, t = z.shape
        if t <= 1:
            return z
        flat = z.reshape(b * c * s, 1, t).float()
        down = torch.nn.functional.adaptive_avg_pool1d(flat, max(1, t // factor))
        return torch.nn.functional.interpolate(down, size=t, mode="linear", align_corners=False).reshape_as(z).to(z.dtype)
    t, h, w = z.shape[2], z.shape[3], z.shape[4]
    down = torch.nn.functional.adaptive_avg_pool3d(z.float(), (t, max(1, h // factor), max(1, w // factor)))
    return torch.nn.functional.interpolate(down, size=(t, h, w), mode="trilinear", align_corners=False).to(z.dtype)


def copies_strength(w):
    """Card weight -> (copies, strength): >= 1 rounds to whole copies (2 = the reference twice), < 1 one weaker copy."""
    w = float(w if w is not None else 1.0)
    if w <= 0:
        return 0, 0.0
    if w < 1.0:
        return 1, round(w, 3)
    return max(1, min(8, int(round(w)))), 1.0


def encoder_view(vis, vae):
    """The text encoder's frames of a look: stored in the file, else decoded once (cached in our .cache folder)."""
    if vis.get("frames") is not None:
        return vis["frames"], vis["times"]
    lat = vis["latent"]
    h = hashlib.sha1(lat.detach().cpu().contiguous().view(torch.uint8).numpy().tobytes()).hexdigest()[:16]
    path = os.path.join(our_root(), ".cache", f"enc_{h}.safetensors")
    if os.path.isfile(path):
        from safetensors.torch import load_file
        d = load_file(path)
        n = int(d["n"].item())
        vis["frames"], vis["times"] = unpack_frames(d, n), d["times"].tolist()
        return vis["frames"], vis["times"]
    meta = vis["meta"]
    if meta.get("source") == "stack" or meta.get("kind") == "image":
        frames = torch.cat([_decode(vae, lat[:, :, i:i + 1].float())[:1] for i in range(lat.shape[2])])
        times = [float(i) for i in range(frames.shape[0])]
    else:
        px = _decode(vae, lat.float())
        times = [i / 2 for i in range(math.ceil(px.shape[0] * 2 / ENC_FPS))]
        frames = px[[min(round(t * ENC_FPS), px.shape[0] - 1) for t in times]]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    from safetensors.torch import save_file
    save_file({**pack_frames(frames), "n": torch.tensor(frames.shape[0]), "times": torch.tensor(times, dtype=torch.float64)}, path)
    vis["frames"], vis["times"] = frames, times
    return frames, times


def _decode(vae, z):
    px = vae.decode(z)
    return px.reshape((-1,) + tuple(px.shape[-3:]))[..., :3].float().cpu()


def stack_pick(n):
    """A photo stack shows the encoder every 4th picture (MiniMaxH3Mod's default), at most 8."""
    idx = list(range(0, n, 4)) or [0]
    return idx[:8]


def card_parts(project, entries, vae, kind="full", log_fn=None):
    """Applied cards of a clip / region -> {"image": [(item, block)], "video": [...], "audio": [...]} in card order,
    each reference repeated by its copies. kind "refine" leaves video-kind looks out (as plain video refs)."""
    out = {"image": [], "video": [], "audio": []}
    snaps = project.get("cards") or {}
    for e in entries:
        if not e.get("on", True) or e.get("id") not in snaps:   # same rule as h3s_core.card_labels
            continue
        copies, strength = copies_strength(e.get("w", 1.0))
        if not copies:
            continue
        mem = load(e["id"])
        vis, aud = mem.get("visual"), mem.get("audio")
        if vis is not None and e.get("look", True):
            vk = "image" if vis["meta"].get("kind") == "image" else "video"
            if not (kind == "refine" and vk == "video"):
                lat = vis["latent"].float()
                if strength < 1.0:
                    lat = strength * lat + (1.0 - strength) * _blur_latent(lat)
                frames, times = encoder_view(vis, vae)
                if vk == "image":
                    item = {"type": "image", "data": frames[:1]}
                    block = {"kind": "image", "latent_h": int(lat.shape[3]), "latent_w": int(lat.shape[4]), "latent": lat}
                else:
                    if vis["meta"].get("source") == "stack":
                        idx = stack_pick(frames.shape[0])
                        frames, times = frames[idx], [float(k) for k in range(len(idx))]
                    item = {"type": "video", "data": frames, "timestamps": list(times)}
                    block = {"kind": "video", "latent_t": int(lat.shape[2]), "latent_h": int(lat.shape[3]), "latent_w": int(lat.shape[4]),
                             "ref_audio_t": 0, "latent": lat, "audio_latent": None}
                out[vk] += [(item, block, e["id"])] * copies
        if aud is not None and e.get("voice", True):
            lat = aud["latent"].float()
            if strength < 1.0:
                lat = strength * lat + (1.0 - strength) * _blur_latent(lat)
            out["audio"] += [({"type": "audio"}, {"kind": "audio", "ref_audio_t": int(lat.shape[-1]), "audio_latent": lat}, e["id"])] * copies
    return out


# ------------------------------------------------------------------ creation
def clean_name(x):
    x = re.sub(r"[\\/:*?\"<>|\x00-\x1f]", "", str(x or "")).strip().strip(".")
    return x[:MAX_NAME]


def clean_folder(x):
    parts = [clean_name(p) for p in re.split(r"[\\/]+", str(x or "")) if p.strip() and p.strip() not in (".", "..")]
    return "/".join(p for p in parts if p and not p.startswith(("_", ".")))[:120]


def clean_text(x):
    return " ".join(str(x or "").split())[:MAX_TEXT]


def snap_clip_frames(n):
    """Frames the H3 video VAE encodes whole: 1, 2-4 as they are, else 5, 22, 39, 56… (17-frame chunks)."""
    n = int(n)
    if n <= 1:
        return 1
    if n < 5:
        return n
    return n - ((n - 5) % 17)


def _cover(img, tw, th, crop=None):
    """[N,H,W,3] -> exactly tw x th: crop box (normalized x,y,w,h) first, else centre cover-crop; lanczos."""
    import comfy.utils
    n, h, w = img.shape[0], img.shape[1], img.shape[2]
    if crop:
        x0, y0 = int(round(crop[0] * w)), int(round(crop[1] * h))
        x1, y1 = int(round((crop[0] + crop[2]) * w)), int(round((crop[1] + crop[3]) * h))
        x0, y0, x1, y1 = max(0, x0), max(0, y0), min(w, max(x0 + 2, x1)), min(h, max(y0 + 2, y1))
        img = img[:, y0:y1, x0:x1]
    return comfy.utils.common_upscale(img[..., :3].movedim(-1, 1), tw, th, "lanczos", "center").movedim(1, -1)


def canvas_for(w, h, res):
    """The first source's frame on the reference canvas: short edge res (never up), /32, at least 320."""
    scale = min(1.0, res / max(1, min(w, h)))
    tw, th = max(32, round(w * scale / 32) * 32), max(32, round(h * scale / 32) * 32)
    if min(tw, th) < 320:
        k = 320 / min(tw, th)
        tw, th = max(320, round(tw * k / 32) * 32), max(320, round(th * k / 32) * 32)
    return tw, th


def aspect_grid(grid, aspect):
    long_edge = int(grid)
    h, w = (long_edge, long_edge / aspect) if aspect >= 1.0 else (long_edge * aspect, long_edge)
    return max(2, round(h / 2) * 2), max(2, round(w / 2) * 2)


def estimate(spec, sizes):
    """Tokens / latent dims for a spec before creating; sizes: [(w, h)] of the photos + clip (in source order)."""
    res = int(spec.get("res") or 768)
    srcs = sizes or []
    if not srcs:
        return {"visual_tokens": 0}
    cw, ch = canvas_for(srcs[0][0], srcs[0][1], res)
    if spec.get("mode") == "compressed":
        gh, gw = aspect_grid(int(spec.get("grid") or 16), ch / cw)
    else:
        gh, gw = ch // 16, cw // 16
    t = len(spec.get("photos") or [])
    if spec.get("clip"):
        n = snap_clip_frames(int(spec["clip"].get("frames") or 22))
        t += 1 if n == 1 else 2 + 5 * ((n - 5) // 17) if n >= 5 else 1
    return {"visual_tokens": t * (gh // 2) * (gw // 2), "canvas": [cw, ch], "latent": [t, gh, gw]}


def replace_retry(src, dst, tries=8, wait=0.15):
    """os.replace that survives a short Windows lock (antivirus / indexer / a reader that has the file open) and
    turns a lasting one into a clear error instead of a silent no-op."""
    for k in range(tries):
        try:
            os.replace(src, dst)
            return
        except PermissionError as e:
            if k == tries - 1:
                raise ValueError(f"Файл карточки занят другой программой ({os.path.basename(dst)}): {e.strerror or e}. "
                                 "Закройте её (просмотрщик, антивирус-сканирование) и сохраните ещё раз") from e
            gc.collect()   # drop any of our own tensors that may still map the file
            time.sleep(wait * (k + 1))


def content_sig(paths):
    """Signature of the tensors only (a header edit — name, folder, description — keeps it, so clips stay ready)."""
    from safetensors import safe_open
    h = hashlib.sha1()
    for p in sorted(paths, key=lambda x: os.path.basename(x).replace("_visual", "0").replace("_audio", "1")):
        with safe_open(p, framework="pt") as f:
            for k in sorted(f.keys()):
                t = f.get_tensor(k)
                h.update(k.encode())
                h.update(str(tuple(t.shape)).encode() + str(t.dtype).encode())
                h.update(t.contiguous().view(torch.uint8).numpy().tobytes() if t.dtype != torch.bool else t.numpy().tobytes())
    return h.hexdigest()[:12]


def _side_path(root, rel):
    return os.path.join(root, rel + ".h3zs.json")


def _read_side(root, rel):
    try:
        with open(_side_path(root, rel), "r", encoding="utf-8") as f:
            j = json.load(f)
        return j if isinstance(j, dict) else {}
    except (OSError, ValueError):
        return {}


def _write_side(root, rel, data):
    p = _side_path(root, rel)
    fd, tmp = tempfile.mkstemp(prefix=".side-", suffix=".tmp", dir=os.path.dirname(p))
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    replace_retry(tmp, p)


def _save(path_no_ext, latent, meta, extra=None):
    from safetensors.torch import save_file
    os.makedirs(os.path.dirname(path_no_ext), exist_ok=True)
    dest = path_no_ext + ".safetensors"
    fd, tmp = tempfile.mkstemp(prefix=".refmod-", suffix=".tmp", dir=os.path.dirname(dest))
    os.close(fd)
    try:
        save_file({"latent": latent.contiguous(), **(extra or {})}, tmp, metadata={META_KEY: json.dumps(meta)})
        replace_retry(tmp, dest)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return dest


def create(spec, vae, audio_vae=None, load_image=None, load_clip=None, load_voice=None, progress=None):
    """spec: {name, folder, concept, mode full|compressed, res, grid, subject_name, appearance, retained_attributes,
    voice_description, photos: [{asset, crop}], clip: {asset, start, frames, crop} | None, voice: {asset, start, end} | None}.
    load_image(asset) -> [1,H,W,3]; load_clip(asset, start, n) -> [n,H,W,3]; load_voice(asset, start, end) -> AUDIO.
    Writes <folder>/<name>[ _visual | _audio ].safetensors + <name>.png + <name>.h3zs.json; returns the card."""
    name = clean_name(spec.get("name"))
    if not name:
        raise ValueError("Дайте карточке имя")
    folder = clean_folder(spec.get("folder"))
    rel = (folder + "/" if folder else "") + name
    root = our_root()
    base = os.path.join(root, rel)
    if any(os.path.isfile(base + s + ".safetensors") for s in ("", "_visual", "_audio")) and not spec.get("overwrite"):
        raise ValueError(f"Карточка «{rel}» уже есть — другое имя или «Перезаписать»")
    concept = spec.get("concept") if spec.get("concept") in CONCEPTS else "generic"
    full = spec.get("mode") != "compressed"
    res = max(256, min(2048, int(spec.get("res") or 768)))
    photos = [p for p in spec.get("photos") or [] if p.get("asset")]
    clip = spec.get("clip") if (spec.get("clip") or {}).get("asset") else None
    voice = spec.get("voice") if (spec.get("voice") or {}).get("asset") else None
    if not photos and not clip and not voice:
        raise ValueError("Добавьте фото, клип или голос")
    desc = {"subject_name": clean_text(spec.get("subject_name"))[:40], "appearance": clean_text(spec.get("appearance")),
            "retained_attributes": clean_text(spec.get("retained_attributes")), "voice_description": clean_text(spec.get("voice_description"))}
    if desc["subject_name"] and not re.fullmatch(r"[\w\-']+", desc["subject_name"]):
        raise ValueError("Имя субъекта — одно слово (буквы, цифры, - и ')")
    with LOCK:
        written, vis_lat = [], None
        sources, enc, first = [], [], None
        if photos or clip:
            if vae is None:
                raise ValueError("Нет VAE: подключите VAE проводом к узлу студии или выберите в пресете моделей проекта")
            srcs = [("photo", load_image(p["asset"]), p) for p in photos]
            if clip:
                n = snap_clip_frames(int(clip.get("frames") or 22))
                srcs.append(("clip", load_clip(clip["asset"], int(clip.get("start") or 0), n), clip))
            h0, w0 = srcs[0][1].shape[1], srcs[0][1].shape[2]
            c0 = srcs[0][2].get("crop")
            if c0:
                w0, h0 = max(2, round(w0 * c0[2])), max(2, round(h0 * c0[3]))
            cw, ch = canvas_for(w0, h0, res)
            gh, gw = aspect_grid(int(spec.get("grid") or 16), ch / cw)
            parts = []
            for k, (what, px, src) in enumerate(srcs):
                px = _cover(px, cw, ch, src.get("crop"))
                if first is None:
                    first = px[0]
                z = vae.encode(px).float().cpu()
                if z.dim() != 5:
                    raise ValueError(f"VAE вернул латент {tuple(z.shape)} — нужен видео-VAE H3")
                if not full:
                    z = torch.nn.functional.adaptive_avg_pool3d(z, (z.shape[2], gh, gw))
                parts.append(z.to(torch.float16))
                if what == "photo":
                    enc.append(px[:1])
                else:
                    picks = [min(round(t * ENC_FPS), px.shape[0] - 1) for t in [i / 2 for i in range(math.ceil(px.shape[0] * 2 / ENC_FPS))]]
                    enc.append(px[picks])
                if progress:
                    progress((k + 1) / (len(srcs) + (1 if voice else 0)))
            vis_lat = torch.cat(parts, dim=2).contiguous()
            single_photo = len(srcs) == 1 and srcs[0][0] == "photo"
            stack = len(srcs) > 1
            frames = torch.cat(enc)
            if stack:
                times = [float(i) for i in range(frames.shape[0])]
            elif single_photo:
                times = [0.0]
            else:
                times = [i / 2 for i in range(frames.shape[0])]
            meta = {"name": name + ("_visual" if voice else ""), "kind": "image" if single_photo else "video",
                    "latent_h": int(vis_lat.shape[3]), "latent_w": int(vis_lat.shape[4]), "latent_t": int(vis_lat.shape[2]),
                    "mode": "encode" if full else "training", "source": "stack" if stack else ("image" if single_photo else "video"),
                    "source_shape": f"{vis_lat.shape[2]}x{ch // 16}x{cw // 16}", "pool": "" if full else f"{vis_lat.shape[2]}x{gh}x{gw}",
                    "optimize_steps": 0, "tags": ["h3zerostudio"], "description": clean_text(spec.get("description")),
                    "concept_type": concept, "_format_version": FORMAT_VERSION, "sample_rate": 32000,
                    "enc_times": times, "enc_fps": ENC_FPS, **{k: v for k, v in desc.items() if v}}
            written.append(_save(base + ("_visual" if voice else ""), vis_lat, meta, pack_frames(frames)))
            sources += [{"kind": w_, "asset": s_.get("asset"), "crop": s_.get("crop"), **({"start": s_.get("start"), "frames": s_.get("frames")} if w_ == "clip" else {})} for w_, _p, s_ in srcs]
        if voice:
            if audio_vae is None:
                raise ValueError("Нет аудио-VAE: подключите его ко входу audio_vae узла студии или выберите в пресете моделей проекта")
            au = load_voice(voice["asset"], float(voice.get("start") or 0), voice.get("end"))
            from .h3s_gen import encode_audio
            alat = encode_audio(audio_vae, au).to(torch.float16).cpu().contiguous()
            if alat.dim() != 4:
                raise ValueError(f"аудио-VAE вернул латент {tuple(alat.shape)}")
            ameta = {"name": name + ("_audio" if (photos or clip) else ""), "kind": "audio", "latent_h": 0, "latent_w": 0,
                     "latent_t": int(alat.shape[-1]), "mode": "encode", "source": "audio", "source_shape": "", "pool": "",
                     "optimize_steps": 0, "tags": ["h3zerostudio"], "description": "", "concept_type": "voice" if (photos or clip) else (concept if concept in ("voice",) else "voice"),
                     "_format_version": FORMAT_VERSION, "sample_rate": 32000, **{k: v for k, v in desc.items() if v}}
            written.append(_save(base + ("_audio" if (photos or clip) else ""), alat, ameta))
            sources.append({"kind": "voice", "asset": voice.get("asset"), "start": voice.get("start"), "end": voice.get("end")})
        # a stale single file / pair from an older card with the same name must not shadow the new one
        for s in ("", "_visual", "_audio"):
            p = base + s + ".safetensors"
            if os.path.isfile(p) and p not in written:
                os.remove(p)
        if first is not None:
            from PIL import Image
            im = Image.fromarray((first.clamp(0, 1) * 255).round().to(torch.uint8).numpy())
            im.thumbnail((512, 512))
            im.save(base + ".png", optimize=True)
        with open(base + ".h3zs.json", "w", encoding="utf-8") as f:
            json.dump({"name": name, "created": int(time.time()), "sources": sources, "csig": content_sig(written),
                       "settings": {"mode": "compressed" if not full else "full", "res": res, "grid": int(spec.get("grid") or 16)}}, f, ensure_ascii=False)
        log(f"characters: «{rel}» created ({'Full' if full else 'Compressed'}"
            + (f", look {tuple(vis_lat.shape)}" if vis_lat is not None else "") + (", voice" if voice else "") + ")")
        _CACHE.clear()
    return find("s:" + rel)


def create_now(spec, **kw):
    """«Создать» from the editor: refused while a generation holds the VAEs (one VAE user at a time)."""
    if not LOCK.acquire(blocking=False):
        raise RuntimeError("Идёт генерация — карточка создастся после неё; нажмите «Создать» ещё раз")
    try:
        return create(spec, **kw)
    finally:
        LOCK.release()


def update(card_id, fields):
    """Rename / move / describe without re-encoding: rewrites the header(s) (tensors copied as they are), the
    sidecar (display name, old ids as aliases so other projects still find the card, the content signature) and
    moves the files for a new name / folder. Any failure raises (the editor shows it)."""
    from safetensors import safe_open
    root, writable, rel = resolve(card_id)
    if not writable:
        raise ValueError("Карточки из models/refmods только для чтения — скопируйте в «Студию», чтобы менять")
    files = _files(card_id)
    if not files:
        raise FileNotFoundError(f"Карточка {card_id} не найдена — обновите библиотеку (↻)")
    if "bundle" in files:
        raise ValueError("Бандлы только для чтения")
    new_name = clean_name(fields.get("name")) if fields.get("name") is not None else None
    if fields.get("name") is not None and not new_name:
        raise ValueError("Имя карточки не может быть пустым")
    new_folder = clean_folder(fields.get("folder")) if fields.get("folder") is not None else None
    nm = new_name or os.path.basename(rel)
    fd = new_folder if new_folder is not None else os.path.dirname(rel)
    nrel = (fd + "/" if fd else "") + nm
    same = os.path.normcase(nrel) == os.path.normcase(rel)          # a case-only rename is the same file on Windows
    if nrel != rel and not same and any(os.path.exists(os.path.join(root, nrel) + x + ".safetensors") for x in ("", "_visual", "_audio")):
        raise ValueError(f"Карточка «{nrel}» уже есть — выберите другое имя")
    with LOCK:
        _CACHE.clear()
        gc.collect()
        side = _read_side(root, rel)
        if not side.get("csig"):
            side["csig"] = content_sig(list(files.values()))     # older cards: from the tensors, before the rewrite
        for role, p in files.items():
            meta = read_meta(p) or {}
            for k in ("subject_name", "appearance", "retained_attributes", "voice_description", "description"):
                if k in fields:
                    v = clean_text(fields[k])[:40 if k == "subject_name" else MAX_TEXT]
                    if v:
                        meta[k] = v
                    else:
                        meta.pop(k, None)
            if fields.get("concept") in CONCEPTS and (role == "visual" or "visual" not in files):
                meta["concept_type"] = fields["concept"]
            meta["name"] = nm + ("_" + role if len(files) > 1 else "")
            with safe_open(p, framework="pt") as f:
                tensors = {k: f.get_tensor(k).clone() for k in f.keys()}
            _save(p[:-len(".safetensors")], tensors.pop("latent"), meta, tensors)
            del tensors
        side["name"] = nm
        if nrel != rel:
            side["aliases"] = [a for a in dict.fromkeys([*(side.get("aliases") or []), rel]) if a != nrel]
            os.makedirs(os.path.dirname(os.path.join(root, nrel)), exist_ok=True)
            for sfx in ("", "_visual", "_audio"):
                if os.path.isfile(os.path.join(root, rel) + sfx + ".safetensors"):
                    replace_retry(os.path.join(root, rel) + sfx + ".safetensors", os.path.join(root, nrel) + sfx + ".safetensors")
            for e in (".png", ".jpg", ".jpeg", ".webp", ".h3zs.json"):
                if os.path.isfile(os.path.join(root, rel) + e):
                    replace_retry(os.path.join(root, rel) + e, os.path.join(root, nrel) + e)
            rel = nrel
        _write_side(root, rel, side)
        _CACHE.clear()
    card = find(f"s:{rel}")
    if not card:
        raise RuntimeError(f"Карточка «{rel}» не читается после сохранения")
    return card


def resolve_alias(card_id, cards=None):
    """A card id a project still uses after the card was renamed / moved (here or in another project) -> the card."""
    cards = cards if cards is not None else scan()
    return next((c for c in cards if c["id"] == card_id), None) or next((c for c in cards if card_id in (c.get("aliases") or [])), None)


def delete(card_id):
    root, writable, rel = resolve(card_id)
    if not writable:
        raise ValueError("Карточки из models/refmods удаляются только вручную")
    n = 0
    with LOCK:
        for s in ("", "_visual", "_audio"):
            p = os.path.join(root, rel) + s + ".safetensors"
            if os.path.isfile(p):
                os.remove(p)
                n += 1
        for e in (".png", ".jpg", ".jpeg", ".webp", ".h3zs.json"):
            p = os.path.join(root, rel) + e
            if os.path.isfile(p):
                os.remove(p)
        _CACHE.clear()
    return n


# ------------------------------------------------------------------ editor entry points
def _loaders():
    from . import h3s_gen as gen
    from . import h3s_media as media

    def load_image(asset):
        return gen.load_asset_image(asset)

    def load_clip(asset, start, n):
        path = gen.asset_path(asset)
        info = media.video_info(path)
        w, h = int(info["width"]) // 2 * 2, int(info["height"]) // 2 * 2
        n = max(1, min(int(n), max(1, int(info["frames"]) - int(start))))
        n = snap_clip_frames(n)
        return torch.from_numpy(media.load_video_frames(path, int(start), n, w, h, mode="stretch"))

    def load_voice(asset, start, end):
        path = gen.asset_path(asset)
        wf, sr = media.load_audio(path)
        i0 = max(0, int(round(float(start or 0) * sr)))
        i1 = wf.shape[1] if end in (None, "", 0) else min(wf.shape[1], int(round(float(end) * sr)))
        part = torch.from_numpy(wf[:, i0:i1]).float()
        if part.shape[-1] < sr // 2:
            raise ValueError("Голос короче 0.5 с — расширьте обрезку")
        return {"waveform": part[None], "sample_rate": int(sr)}
    return load_image, load_clip, load_voice


_WIRED = {}   # json of the upstream sub-graph -> the object it produced (a VAE loads once)


def run_upstream(prompt, src, depth_max=40):
    """Run the loader nodes that feed one input of the studio node (prompt = the API-format sub-graph the editor sent
    from the current workflow, src = [node id, output slot]) and return that output — the wired VAE without a
    generation run. Only the nodes upstream of that input are executed (normally just VAELoader / a checkpoint loader)."""
    import asyncio
    import inspect
    import nodes
    key = json.dumps({"p": prompt, "s": src}, sort_keys=True)
    if key in _WIRED:
        return _WIRED[key]
    memo = {}

    def out(nid, slot, d):
        if d > depth_max:
            raise ValueError("слишком длинная цепочка узлов перед VAE")
        nid = str(nid)
        if nid not in memo:
            n = prompt.get(nid)
            if not isinstance(n, dict):
                raise ValueError(f"узел {nid} перед входом не найден")
            cls = nodes.NODE_CLASS_MAPPINGS.get(n.get("class_type"))
            if cls is None:
                raise ValueError(f"узел «{n.get('class_type')}» не установлен")
            kw = {}
            for k, v in (n.get("inputs") or {}).items():
                kw[k] = out(v[0], v[1], d + 1) if isinstance(v, list) and len(v) == 2 and str(v[0]) in prompt and isinstance(v[1], int) else v
            fn = getattr(cls(), getattr(cls, "FUNCTION", "execute"))
            r = fn(**kw)
            if inspect.iscoroutine(r):
                r = asyncio.run(r)
            if isinstance(r, dict):
                r = r.get("result", ())
            r = getattr(r, "result", r)
            memo[nid] = tuple(r) if isinstance(r, (list, tuple)) else (r,)
        return memo[nid][int(slot)]
    res = out(src[0], src[1], 0)
    while len(_WIRED) >= 4:
        _WIRED.pop(next(iter(_WIRED)))
    _WIRED[key] = res
    return res


def resolve_vaes(body, need_video=True, need_audio=False):
    """The VAEs for «Создать», in order: the ones wired into the studio node (the editor sends their upstream
    sub-graph from the current workflow), those of the last generation run, the project preset's files.
    Returns (vae, audio_vae, notes) — notes say why a source failed when nothing was found."""
    wired = body.get("wired") or {}
    out, notes = {"vae": None, "audio_vae": None}, []
    for slot, need in (("vae", need_video), ("audio_vae", need_audio)):
        if not need:
            continue
        w = wired.get(slot)
        if isinstance(w, dict) and isinstance(w.get("prompt"), dict) and isinstance(w.get("src"), list):
            try:
                out[slot] = run_upstream(w["prompt"], w["src"])
                log(f"characters: {slot} from the wire ({w['prompt'].get(str(w['src'][0]), {}).get('class_type', '?')})")
            except Exception as e:
                notes.append(f"провод {slot}: {e}")
        if out[slot] is None and VAES[slot] is not None:
            out[slot] = VAES[slot]
        if out[slot] is None and body.get(slot):
            from . import h3s_models
            try:
                out[slot] = h3s_models._load_vae(str(body[slot]), slot)[1]
            except Exception as e:
                notes.append(f"пресет {slot}: {e}")
    return out["vae"], out["audio_vae"], notes


def create_from_editor(body):
    """POST /h3zero/chars/create: the wired VAEs, else those of the last run, else the project's preset files."""
    spec = body.get("spec") or {}
    vae, avae, notes = resolve_vaes(body, need_video=bool(spec.get("photos") or (spec.get("clip") or {}).get("asset")),
                                    need_audio=bool((spec.get("voice") or {}).get("asset")))
    li, lc, lv = _loaders()
    try:
        card = create_now(spec, vae=vae, audio_vae=avae, load_image=li, load_clip=lc, load_voice=lv)
    except ValueError as e:
        if notes and "VAE" in str(e):
            raise ValueError(f"{e} ({'; '.join(notes)})") from e
        raise
    drop_uploads(spec)
    prune_uploads()
    return card


def status():
    return {"vae": VAES["vae"] is not None, "audio_vae": VAES["audio_vae"] is not None, "busy": not _free()}


def _free():
    if LOCK.acquire(blocking=False):
        LOCK.release()
        return True
    return False

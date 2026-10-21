"""Model & LoRA presets of H3ZeroStudio.

A preset = base model (diffusion model / unet with a weight dtype, or a checkpoint), text encoder (CLIPLoader type
"minimax"), video VAE, audio VAE and an ordered LoRA list (on/off, model strength, clip strength). Presets live
in output/h3zerostudio/_presets/presets.json (shared by all projects); a project keeps a copy of the presets it
uses (project["model_presets"]) so it runs the same anywhere and the editor can tell what changed.

Loading goes through ComfyUI's own loaders (nodes.UNETLoader / CheckpointLoaderSimple / CLIPLoader / VAELoader and
comfy.sd.load_lora_for_models, like LoraLoader), with a small cache across runs:
  * a base model / text encoder / VAE is loaded once and kept while it is in use; changing only LoRAs re-patches
    a clone of the cached base (ModelPatcher patches, the weights are not read again);
  * LoRA state dicts are kept in a small LRU (by bytes);
  * a base that is no longer used is dropped from the cache and unloaded from the GPU before the next one loads
    (unload_model_and_clones + gc + soft_empty_cache), so a 12 GB card never holds two bases.
A wired input (model / clip / vae / audio_vae connected to the node) always wins over the preset file of that part;
the preset's LoRAs are applied on top of whichever base is used. Without a preset the node works exactly as before.
"""
import collections
import gc
import hashlib
import json
import os
import re
import threading
import time

LORA_CACHE_BYTES = 6 * 1024 ** 3
_LOCK = threading.RLock()


def log(msg):
    print(f"[H3ZS] {msg}", flush=True)


# ------------------------------------------------------------------ presets
from .h3s_core import normalize_preset, preset_fingerprint, segment_preset, PRESET_DTYPES as DTYPES, MAX_PRESET_LORAS as MAX_LORAS  # noqa: E402


def presets_dir():
    import folder_paths
    return os.path.join(os.path.abspath(folder_paths.get_output_directory()), "h3zerostudio", "_presets")


def presets_file():
    return os.path.join(presets_dir(), "presets.json")


def load_presets():
    try:
        with open(presets_file(), "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return []
    out, seen = [], set()
    for p in data.get("presets", []) if isinstance(data, dict) else []:
        q = normalize_preset(p)
        if q and q["id"] not in seen:
            seen.add(q["id"])
            out.append(q)
    return out


def save_presets(presets):
    out, seen = [], set()
    for p in presets if isinstance(presets, list) else []:
        q = normalize_preset(p)
        if q and q["id"] not in seen:
            seen.add(q["id"])
            out.append(q)
    os.makedirs(presets_dir(), exist_ok=True)
    path = presets_file()
    tmp = f"{path}.{os.getpid()}.{threading.get_ident()}.part"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"v": 1, "presets": out}, f, ensure_ascii=False, indent=1)
    from .h3s_media import replace_file
    replace_file(tmp, path)
    return out


# ------------------------------------------------------------------ model files
FOLDERS = {"unet": "diffusion_models", "checkpoint": "checkpoints", "clip": "text_encoders", "vae": "vae", "lora": "loras"}


def _list(folder):
    import folder_paths
    try:
        return sorted(folder_paths.get_filename_list(folder), key=str.lower)
    except Exception:
        return []


def list_models(refresh=False):
    """File lists for the preset editor (ComfyUI folder_paths: diffusion_models also lists unet, text_encoders also
    clip). refresh drops ComfyUI's filename cache first."""
    import folder_paths
    if refresh:
        try:
            for k in ("diffusion_models", "unet", "checkpoints", "text_encoders", "clip", "vae", "loras"):
                folder_paths.filename_list_cache.pop(k, None)
        except Exception:
            pass
    vae = _list("vae")
    return {"unet": _list("diffusion_models"), "checkpoint": _list("checkpoints"), "clip": _list("text_encoders"),
            "vae": vae, "audio_vae": vae, "lora": _list("loras"), "dtypes": list(DTYPES)}


def full_path(kind, name):
    import folder_paths
    if not name:
        return None
    try:
        return folder_paths.get_full_path(FOLDERS[kind], name)
    except Exception:
        return None


def file_sig(path):
    try:
        st = os.stat(path)
        return f"{st.st_size}:{int(st.st_mtime)}"
    except (OSError, TypeError):
        return "missing"


def preset_status(p):
    """Missing files of a preset: [(part, file)]."""
    miss = []
    if not p:
        return miss
    for part, kind in (("model", p["base"]), ("clip", "clip"), ("vae", "vae"), ("audio_vae", "vae")):
        if p.get(part) and not full_path(kind, p[part]):
            miss.append((part, p[part]))
    for l in p["loras"]:
        if l["on"] and not full_path("lora", l["file"]):
            miss.append(("lora", l["file"]))
    return miss


# ------------------------------------------------------------------ cache + loading
class _Cache:
    def __init__(self):
        self.base = {}        # key -> (model, clip|None, vae|None) of a unet / checkpoint
        self.clip = {}        # key -> CLIP
        self.vae = {}         # key -> VAE
        self.lora = collections.OrderedDict()   # path|sig -> (sd, metadata, bytes)
        self.patched = {}     # (base key, clip key, loras) -> (model, clip)


CACHE = _Cache()


def _evict(store, keep, what):
    """Drop entries of `store` not in `keep`; their GPU copies are unloaded (with clones) and memory released."""
    import comfy.model_management as mm
    gone = [k for k in store if k not in keep]
    for k in gone:
        obj = store.pop(k)
        for o in (obj if isinstance(obj, tuple) else (obj,)):
            patcher = getattr(o, "patcher", o)   # CLIP / VAE keep their ModelPatcher in .patcher
            if patcher is not None and hasattr(patcher, "clone_base_uuid") and hasattr(mm, "unload_model_and_clones"):
                try:
                    mm.unload_model_and_clones(patcher)
                except Exception as e:
                    log(f"models: unload of {what} failed ({e})")
        log(f"models: {what} {k[0] if isinstance(k, tuple) else k} released")
    if gone:
        CACHE.patched.clear()   # patched clones keep their base alive
        gc.collect()
        try:
            mm.cleanup_models_gc()
        except Exception:
            pass
        mm.soft_empty_cache()


def _load_base(p):
    import nodes
    path = full_path(p["base"], p["model"])
    if not path:
        raise FileNotFoundError(f"H3ZeroStudio: файл модели пресета «{p['name']}» не найден: {p['model']} ({FOLDERS[p['base']]})")
    key = (p["base"], p["model"], p["dtype"], file_sig(path))
    if key not in CACHE.base:
        _evict(CACHE.base, set(), "base model")   # one base at a time (12 GB cards): free the old one first
        t = time.perf_counter()
        if p["base"] == "checkpoint":
            m, c, v = nodes.CheckpointLoaderSimple().load_checkpoint(p["model"])[:3]
        else:
            m, c, v = nodes.UNETLoader().load_unet(p["model"], p["dtype"])[0], None, None
        CACHE.base[key] = (m, c, v)
        log(f"models: base {p['model']} ({p['dtype'] if p['base'] == 'unet' else 'checkpoint'}) loaded in {time.perf_counter() - t:.1f}s")
    return key, CACHE.base[key]


def _load_clip(name):
    import nodes
    path = full_path("clip", name)
    if not path:
        raise FileNotFoundError(f"H3ZeroStudio: текстовый энкодер не найден: {name} (text_encoders)")
    key = (name, file_sig(path))
    if key not in CACHE.clip:
        _evict(CACHE.clip, set(), "text encoder")
        t = time.perf_counter()
        CACHE.clip[key] = nodes.CLIPLoader().load_clip(name, "minimax")[0]
        log(f"models: text encoder {name} loaded in {time.perf_counter() - t:.1f}s")
    return key, CACHE.clip[key]


def _load_vae(name, slot):
    import nodes
    path = full_path("vae", name)
    if not path:
        raise FileNotFoundError(f"H3ZeroStudio: VAE не найден: {name} (vae)")
    key = (slot, name, file_sig(path))
    if key not in CACHE.vae:
        _evict(CACHE.vae, {k for k in CACHE.vae if k[0] != slot}, slot)
        CACHE.vae[key] = nodes.VAELoader().load_vae(name)[0]
        log(f"models: {slot} {name} loaded")
    return key, CACHE.vae[key]


def _lora_sd(name):
    import comfy.utils
    path = full_path("lora", name)
    if not path:
        raise FileNotFoundError(f"H3ZeroStudio: LoRA не найдена: {name} (loras)")
    key = f"{path}|{file_sig(path)}"
    if key in CACHE.lora:
        CACHE.lora.move_to_end(key)
        return CACHE.lora[key]
    sd, meta = comfy.utils.load_torch_file(path, safe_load=True, return_metadata=True)
    size = sum(t.numel() * t.element_size() for t in sd.values() if hasattr(t, "numel"))
    CACHE.lora[key] = (sd, meta, size)
    while len(CACHE.lora) > 1 and sum(x[2] for x in CACHE.lora.values()) > LORA_CACHE_BYTES:
        CACHE.lora.popitem(last=False)
    return CACHE.lora[key]


def apply_loras(model, clip, loras):
    """LoraLoader for each active LoRA in order; returns (model, clip, report lines)."""
    import comfy.lora
    import comfy.lora_convert
    rep = []
    for l in loras:
        if not l["on"] or (not l["sm"] and not l["sc"]):
            continue
        sd, meta, _ = _lora_sd(l["file"])
        key_map = {}
        if model is not None:
            key_map = comfy.lora.model_lora_keys_unet(model.model, key_map)
        if clip is not None and l["sc"]:
            key_map = comfy.lora.model_lora_keys_clip(clip.cond_stage_model, key_map)
        loaded = comfy.lora.load_lora(comfy.lora_convert.convert_lora(sd), key_map)
        km = kc = ()
        if model is not None and l["sm"]:
            model = model.clone()
            km = model.add_patches(loaded, l["sm"])
            if meta:
                try:
                    model.set_attachments("lora_metadata", meta)
                except Exception:
                    pass
        if clip is not None and l["sc"]:
            clip = clip.clone()
            kc = clip.add_patches(loaded, l["sc"])
        n = len(set(km) | set(kc))
        rep.append(f"{l['file']} ×{l['sm']}" + (f"/clip ×{l['sc']}" if clip is not None and l["sc"] != l["sm"] else "") + f": {n}/{len(loaded)} keys")
        if loaded and not n:
            log(f"⚠ LoRA {l['file']}: no key matched this model (another architecture?)")
    return model, clip, rep


class Resolver:
    """Per-run model source: wired inputs + the project's / clips' presets, loaded lazily through the cache."""

    def __init__(self, project, model=None, clip=None, vae=None, audio_vae=None, wired_sig=None):
        self.p = project
        self.w = {"model": model, "clip": clip, "vae": vae, "audio_vae": audio_vae}
        self.wired_sig = wired_sig
        self.proj_preset = (project.get("model_presets") or {}).get((project.get("settings") or {}).get("model_preset") or "")
        self.any = bool(self.proj_preset) or any(segment_preset(project, i) for i in range(len(project.get("segments") or [])))
        self.reports = {}
        self.local = {}
        self._release_unused()

    def _release_unused(self):
        """Cached preset models this run does not need are released before anything loads."""
        need_b, need_c, need_v = set(), set(), set()
        for i in range(len(self.p.get("segments") or [])):
            pr = segment_preset(self.p, i)
            if pr and pr["model"] and self.w["model"] is None:
                need_b.add((pr["base"], pr["model"], pr["dtype"]))
            if pr and pr["clip"] and self.w["clip"] is None:
                need_c.add(pr["clip"])
        pp = self.proj_preset
        for part in ("vae", "audio_vae"):
            if pp and pp[part] and self.w[part] is None:
                need_v.add((part, pp[part]))
        with _LOCK:
            if any(k[:3] not in need_b for k in CACHE.base):
                _evict(CACHE.base, {k for k in CACHE.base if k[:3] in need_b}, "base model")
            if any(k[0] not in need_c for k in CACHE.clip):
                _evict(CACHE.clip, {k for k in CACHE.clip if k[0] in need_c}, "text encoder")
            if any(k[:2] not in need_v for k in CACHE.vae):
                _evict(CACHE.vae, {k for k in CACHE.vae if k[:2] in need_v}, "vae")
            if not self.any and CACHE.lora:
                CACHE.lora.clear()

    def check(self):
        """Fail before any sampling when a needed file is missing / nothing gives a model."""
        errs = []
        for i in range(len(self.p["segments"])):
            pr = segment_preset(self.p, i)
            for part, f in preset_status(pr):
                if part in ("model", "clip") and self.w[part] is not None:
                    continue
                if part in ("vae", "audio_vae"):
                    continue
                errs.append(f"отрезок {i + 1}, пресет «{pr['name']}»: нет файла {f}")
            if self.w["model"] is None and not (pr and pr["model"]):
                errs.append(f"отрезок {i + 1}: нет модели — подключите вход model или выберите пресет моделей")
            if self.w["clip"] is None and not (pr and (pr["clip"] or pr["base"] == "checkpoint" and pr["model"])):
                errs.append(f"отрезок {i + 1}: нет текстового энкодера — подключите вход clip или укажите его в пресете")
        pp = self.proj_preset
        for part in ("vae", "audio_vae"):
            if pp and pp.get(part) and self.w[part] is None and not full_path("vae", pp[part]):
                errs.append(f"пресет «{pp['name']}»: нет файла {pp[part]}")
        if self.w["vae"] is None and not (pp and (pp["vae"] or pp["base"] == "checkpoint" and pp["model"])):
            errs.append("нет VAE — подключите вход vae или укажите его в пресете проекта")
        if errs:
            raise ValueError("H3ZeroStudio: " + "; ".join(dict.fromkeys(errs)))

    # project-level parts (one per run: references, footage and the final decode share them)
    def vae(self):
        if self.w["vae"] is not None:
            return self.w["vae"]
        pp = self.proj_preset
        if pp and pp["vae"]:
            return _load_vae(pp["vae"], "vae")[1]
        if pp and pp["base"] == "checkpoint":
            return _load_base(pp)[1][2]
        return None

    def audio_vae(self):
        if self.w["audio_vae"] is not None:
            return self.w["audio_vae"]
        pp = self.proj_preset
        return _load_vae(pp["audio_vae"], "audio_vae")[1] if pp and pp["audio_vae"] else None

    def models(self, i):
        """(model, clip) for segment i: wired or preset base + the preset's LoRAs (cached clone)."""
        pr = segment_preset(self.p, i)
        if not pr:
            return self.w["model"], self.w["clip"]
        with _LOCK:
            bkey = ("wired",) if self.w["model"] is not None or not pr["model"] else None
            base_m = self.w["model"]
            base_c_ck = None
            if bkey is None:
                bkey, (base_m, base_c_ck, _v) = _load_base(pr)
            if self.w["clip"] is not None:
                ckey, base_c = ("wired",), self.w["clip"]
            elif pr["clip"]:
                ckey, base_c = _load_clip(pr["clip"])
            else:
                ckey, base_c = ("ckpt",) + tuple(bkey), base_c_ck
            lk = tuple((l["file"], l["sm"], l["sc"]) for l in pr["loras"] if l["on"] and (l["sm"] or l["sc"]))
            pk = (bkey, ckey, lk)
            # clones of wired inputs live for this run only (the wired objects may change between runs)
            store = self.local if bkey[0] == "wired" or ckey[0] == "wired" else CACHE.patched
            if pk not in store:
                if len(CACHE.patched) > 8:
                    CACHE.patched.clear()
                m, c, rep = apply_loras(base_m, base_c, pr["loras"])
                store[pk] = (m, c)
                self.reports[pr["id"]] = rep
                if rep:
                    log(f"models: preset «{pr['name']}» LoRAs: " + "; ".join(rep))
            return store[pk]

    def env(self, i):
        """Cache-key environment of segment i: the old wired signature without a preset, else the preset's files."""
        pr = segment_preset(self.p, i)
        if not pr:
            return self.wired_sig
        h = hashlib.sha256()
        h.update((self.wired_sig or "").encode() if (self.w["model"] is not None or self.w["clip"] is not None) else b"-")
        wm = self.w["model"] is not None or not pr["model"]
        h.update(b"wired-model" if wm else f"{pr['base']}|{pr['model']}|{pr['dtype']}|{file_sig(full_path(pr['base'], pr['model']))}".encode())
        h.update(b"wired-clip" if self.w["clip"] is not None else f"clip|{pr['clip']}|{file_sig(full_path('clip', pr['clip']))}".encode())
        pp = self.proj_preset
        for part in ("vae", "audio_vae"):
            h.update(b"w" if self.w[part] is not None or not (pp and pp[part]) else f"{part}|{pp[part]}|{file_sig(full_path('vae', pp[part]))}".encode())
        for l in pr["loras"]:
            if l["on"] and (l["sm"] or l["sc"]):
                h.update(f"lora|{l['file']}|{file_sig(full_path('lora', l['file']))}|{l['sm']}|{l['sc']}".encode())
        return "p" + h.hexdigest()[:15]

    def env_parts(self, i, wired_parts=None):
        """env(i) readable: preset, files with their signatures, LoRAs with strengths (cache-miss reasons)."""
        pr = segment_preset(self.p, i)
        if not pr:
            return dict(wired_parts or {"wired": True})
        wm = self.w["model"] is not None or not pr["model"]
        out = {"preset": pr["name"],
               "model": "провод" if wm else f"{pr['model']} ({pr['dtype']})",
               "model_file": "" if wm else file_sig(full_path(pr["base"], pr["model"])),
               "clip": "провод" if self.w["clip"] is not None else pr["clip"] or "из чекпойнта",
               "clip_file": "" if self.w["clip"] is not None else file_sig(full_path("clip", pr["clip"])) if pr["clip"] else "",
               "loras": [[l["file"], l["sm"], l["sc"], file_sig(full_path("lora", l["file"]))] for l in pr["loras"] if l["on"] and (l["sm"] or l["sc"])]}
        pp = self.proj_preset
        for part in ("vae", "audio_vae"):
            out[part] = "провод" if self.w[part] is not None or not (pp and pp[part]) else pp[part]
        if wm or self.w["clip"] is not None:
            out["wired"] = dict(wired_parts or {})
        return out

    def info(self, i):
        """Record for takes / gallery: which preset, base and LoRAs made this clip."""
        pr = segment_preset(self.p, i)
        if not pr:
            return None
        return {"preset": pr["name"], "preset_id": pr["id"],
                "base": "провод" if self.w["model"] is not None or not pr["model"] else pr["model"],
                "clip": "провод" if self.w["clip"] is not None or not pr["clip"] else pr["clip"],
                "loras": [[l["file"], l["sm"], l["sc"]] for l in pr["loras"] if l["on"] and (l["sm"] or l["sc"])]}


def status():
    """What the cache holds (for «Настройки»)."""
    return {"base": [k[1] for k in CACHE.base], "clip": [k[0] for k in CACHE.clip], "vae": [k[1] for k in CACHE.vae],
            "loras": len(CACHE.lora), "lora_mb": round(sum(x[2] for x in CACHE.lora.values()) / 2 ** 20)}


def release_all():
    """«Выгрузить модели пресетов»: drop every cached preset model and free the memory."""
    with _LOCK:
        _evict(CACHE.base, set(), "base model")
        _evict(CACHE.clip, set(), "text encoder")
        _evict(CACHE.vae, set(), "vae")
        try:
            CACHE.lora.clear()
        except Exception:
            pass
        CACHE.patched.clear()
        gc.collect()
        import comfy.model_management as mm
        mm.soft_empty_cache()

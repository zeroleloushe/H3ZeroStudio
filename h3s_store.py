"""Take store: what makes a finished clip restorable without the model or the VAE, and why a cache key missed.

<project>/takes/<key>/   (kept by «Очистить кэш» unless the takes are cleared explicitly)
  latent.pt     the take's video + audio latents (hard link to cache/seg_<key>.pt when possible) — the latent
                sidecar: continuation / final-from-draft / stitching work after the cache was cleared
  recipe.json   what produced the key: the key's input parts, segment id, kind, time (cache miss reasons)
  m_<W>x<H>.mp4 near-lossless master of the decoded frames (H.264 4:4:4 crf 12, BT.709) + .json meta
                + _last.pt, the exact last frame (continuity picture of the next clip)
  audio.pt      the decoded raw sound of the take (stitching without the audio VAE)

Asset file signatures: the cache keys historically use size:mtime of a reference file, so a copy / zip import /
re-save of the same picture changed every key that used it. content_sig() keeps the old string for the same
CONTENT: the first size:mtime seen for a sha256 is recorded (globally and in the project's asset) and reused —
existing keys stay valid, identical files keep hitting. (Latent sidecar idea after chanon/comfyui-obvpm-timeline.)"""
import hashlib
import json
import os
import shutil
import threading
import time

import torch

_LOCK = threading.RLock()
_SIGS = {"loaded": False, "paths": {}, "sigs": {}}


def log(msg):
    print(f"[H3ZS] {msg}", flush=True)


# ---------------------------------------------------------------- content signatures
def _sig_file():
    import folder_paths
    return os.path.join(folder_paths.get_output_directory(), "h3zerostudio", "_filesigs.json")


def _load_sigs():
    if _SIGS["loaded"]:
        return
    _SIGS["loaded"] = True
    try:
        with open(_sig_file(), "r", encoding="utf-8") as f:
            data = json.load(f)
        _SIGS["paths"].update(data.get("paths") or {})
        _SIGS["sigs"].update(data.get("sigs") or {})
    except (OSError, ValueError):
        pass


def _save_sigs():
    path = _sig_file()
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = f"{path}.{os.getpid()}.part"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"paths": _SIGS["paths"], "sigs": _SIGS["sigs"]}, f)
        os.replace(tmp, path)
    except OSError as e:
        log(f"file signatures not saved: {e}")


def file_sha(path):
    """sha256 of a file, cached by (path, size, mtime)."""
    st = os.stat(path)
    with _LOCK:
        _load_sigs()
        c = _SIGS["paths"].get(path)
        if c and c[0] == st.st_size and c[1] == int(st.st_mtime):
            return c[2]
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    sha = h.hexdigest()[:32]
    with _LOCK:
        _SIGS["paths"][path] = [st.st_size, int(st.st_mtime), sha]
        _SIGS["dirty_paths"] = True
    return sha


def content_sig(path, asset=None):
    """(sig, sha) of a reference file. sig keeps the historical "size:mtime" form, but stable for the content."""
    try:
        st = os.stat(path)
    except OSError:
        return "missing", ""
    legacy = f"{st.st_size}:{int(st.st_mtime)}"
    try:
        sha = file_sha(path)
    except OSError:
        return legacy, ""
    own = (asset or {}).get("fsig") or {}
    with _LOCK:
        known = sha in _SIGS["sigs"]
        if own.get("sha") == sha and own.get("sig"):   # the project remembers the file (another PC / unzipped copy)
            sig = own["sig"]
        else:
            sig = _SIGS["sigs"].get(sha, legacy)
        _SIGS["sigs"].setdefault(sha, sig)
        if not known or _SIGS.get("dirty_paths"):
            _SIGS["dirty_paths"] = False
            _save_sigs()
    return sig, sha


# ---------------------------------------------------------------- take folders
def take_dir(d, key, make=False):
    p = os.path.join(d, "takes", str(key))
    if make:
        os.makedirs(p, exist_ok=True)
    return p


def latent_path(d, key):
    return os.path.join(take_dir(d, key), "latent.pt")


def _link_or_copy(src, dst):
    tmp = dst + ".part"
    try:
        if os.path.exists(tmp):
            os.remove(tmp)
        os.link(src, tmp)
    except OSError:
        shutil.copy2(src, tmp)
    os.replace(tmp, dst)


def keep(d, key, pt, recipe=None):
    """After a latent was written to the cache: make it a take (latent sidecar + recipe). Cheap (hard link)."""
    if not key or not os.path.isfile(pt):
        return False
    td = take_dir(d, key, True)
    lp = os.path.join(td, "latent.pt")
    try:
        if not _same(lp, pt):   # new take, or the cache file was rewritten (re-sampled under the same key)
            _link_or_copy(pt, lp)
        rp = os.path.join(td, "recipe.json")
        if recipe is not None and not os.path.isfile(rp):
            _write_json(rp, dict(recipe, key=key, created=int(time.time())))
        return True
    except OSError as e:
        log(f"take {key}: sidecar not written ({e})")
        return False


def _same(a, b):
    try:
        if os.path.samefile(a, b):
            return True
        sa, sb = os.stat(a), os.stat(b)
        return sa.st_size == sb.st_size and sa.st_mtime >= sb.st_mtime   # a copy (no hard links on this disk)
    except OSError:
        return False


def restore(d, key, pt):
    """Cache file missing but the take has its latent: put it back (link). True when pt exists afterwards."""
    if os.path.isfile(pt):
        return True
    lp = latent_path(d, key) if key else ""
    if lp and os.path.isfile(lp):
        try:
            os.makedirs(os.path.dirname(pt), exist_ok=True)
            _link_or_copy(lp, pt)
            log(f"cache: {os.path.basename(pt)} restored from the take's latent sidecar")
            return True
        except OSError as e:
            log(f"cache: restore of {key} failed ({e})")
    return False


def _write_json(path, data):
    tmp = path + ".part"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, default=str)
    os.replace(tmp, path)


# ---------------------------------------------------------------- decoded frames / sound
def master_path(d, key, w, h):
    return os.path.join(take_dir(d, key), f"m_{int(w)}x{int(h)}.mp4")


def load_master(d, key, v):
    """Frames of the take decoded earlier (no VAE), or None. v: the latent they must belong to."""
    w, h = int(v.shape[-1]) * 16, int(v.shape[-2]) * 16
    p = master_path(d, key, w, h)
    try:
        with open(p + ".json", "r", encoding="utf-8") as f:
            meta = json.load(f)
        if meta.get("v_shape") != list(v.shape) or not os.path.isfile(p):
            return None
        from . import h3s_media as media
        fr = media.read_frames(p)
        if fr.shape[0] != meta["frames"]:
            return None
        lp = p[:-4] + "_last.pt"   # the exact decoded last frame: the next clip's continuity picture stays bit-identical
        if os.path.isfile(lp):
            last = torch.load(lp, map_location="cpu", weights_only=True)
            if tuple(last.shape[1:]) == tuple(fr.shape[1:]):
                fr[-1:] = last
        return fr
    except (OSError, ValueError, KeyError):
        return None
    except Exception as e:
        log(f"take {key}: master unreadable ({e}); decoding again")
        return None


def save_master(d, key, v, frames, fps=24):
    from . import h3s_media as media
    w, h = int(v.shape[-1]) * 16, int(v.shape[-2]) * 16
    p = master_path(d, key, w, h)
    try:
        take_dir(d, key, True)
        media.write_mp4(p, frames, fps, crf=12, pix_fmt="yuv444p", preset="fast")
        torch.save(frames[-1:].detach().float().cpu().clone(), p[:-4] + "_last.pt")
        _write_json(p + ".json", {"v_shape": list(v.shape), "frames": int(frames.shape[0]), "w": int(frames.shape[2]), "h": int(frames.shape[1])})
    except Exception as e:
        log(f"take {key}: master not written ({e})")


def load_wave(d, key):
    p = os.path.join(take_dir(d, key), "audio.pt")
    try:
        x = torch.load(p, map_location="cpu", weights_only=True)
        return x["w"], int(x["sr"])
    except Exception:
        return None


def save_wave(d, key, wave, sr):
    try:
        take_dir(d, key, True)
        p = os.path.join(take_dir(d, key), "audio.pt")
        torch.save({"w": wave.detach().float().cpu().contiguous(), "sr": int(sr)}, p + ".part")
        os.replace(p + ".part", p)
    except Exception as e:
        log(f"take {key}: sound not written ({e})")


# ---------------------------------------------------------------- why a key missed
FIELDS = {"env": "модели", "wh": "размер кадра", "frames": "длина", "ov": "перекрытие",
          "prompt": "промпт (общий + отрезка + маркеры)", "neg": "негатив", "refs": "референсы (набор, порядок или файл)",
          "params": "параметры прохода", "lock": "фиксация перекрытия", "cref": "кадр-продолжение <Picture N>",
          "ref_size": "размер референсов", "audio": "звук (дорожка / аудио-референсы)", "prev": "предыдущий отрезок изменился",
          "alock": "сшивка звука", "src": "футаж (файл / начало / сила)", "vrefs": "видео-референсы", "v": "версия ключей",
          "refine": "черновик изменился", "rp": "настройки чистовика (σ / апскейл / размер)", "steps": "шаги"}


def _fmt_lora(l):
    return f"{os.path.basename(str(l[0]))} {l[1]:g}/{l[2]:g}"


def env_diff(a, b):
    """Readable difference of two model environments (h3s_models.Resolver.env_parts / gen.model_signature_parts)."""
    a, b = a or {}, b or {}
    out = []
    if ("preset" in a) != ("preset" in b):
        return [f"модели: {'пресет «' + a['preset'] + '»' if 'preset' in a else 'провода'} → {'пресет «' + b['preset'] + '»' if 'preset' in b else 'провода'}"]
    if a.get("preset") != b.get("preset"):
        out.append(f"пресет моделей «{a.get('preset')}» → «{b.get('preset')}»")
    for k, lbl in (("model", "модель"), ("clip", "текстовый энкодер"), ("vae", "VAE"), ("audio_vae", "аудио-VAE")):
        if a.get(k) != b.get(k) and not (k in ("vae", "audio_vae") and "preset" not in a):
            out.append(f"{lbl}: {a.get(k)} → {b.get(k)}")
        elif a.get(k + "_file") != b.get(k + "_file") and a.get(k + "_file") is not None:
            out.append(f"файл «{b.get(k)}» изменился (размер / дата)")
    la, lb = {str(l[0]): l for l in a.get("loras") or []}, {str(l[0]): l for l in b.get("loras") or []}
    for f in [x for x in lb if x not in la]:
        out.append(f"LoRA добавлена: {_fmt_lora(lb[f])}")
    for f in [x for x in la if x not in lb]:
        out.append(f"LoRA убрана: {_fmt_lora(la[f])}")
    for f in [x for x in la if x in lb]:
        if la[f][1:3] != lb[f][1:3]:
            out.append(f"LoRA {os.path.basename(f)}: сила {la[f][1]:g}/{la[f][2]:g} → {lb[f][1]:g}/{lb[f][2]:g}")
        elif len(la[f]) > 3 and len(lb[f]) > 3 and la[f][3] != lb[f][3]:
            out.append(f"файл LoRA {os.path.basename(f)} изменился")
    if not out and [x[0] for x in a.get("loras") or []] != [x[0] for x in b.get("loras") or []]:
        out.append("порядок LoRA")
    wa = a if "preset" not in a else a.get("wired") or {}   # the wired inputs (alone, or under a preset's free parts)
    wb = b if "preset" not in b else b.get("wired") or {}
    if wa != wb and not out:
        for k, lbl in (("model", "модель на входе model"), ("clip", "вход clip"), ("vae", "вход vae"), ("audio_vae", "вход audio_vae")):
            if (wa or {}).get(k) != (wb or {}).get(k):
                out.append(f"{lbl}: {(wa or {}).get(k)} → {(wb or {}).get(k)}")
        if (wa or {}).get("patches") != (wb or {}).get("patches"):
            out.append("LoRA / патчи на проводе model (LoraLoader и т.п.)")
        if (wa or {}).get("topts") != (wb or {}).get("topts"):
            ta, tb = set((wa or {}).get("topts") or []), set((wb or {}).get("topts") or [])
            out.append("transformer_options на проводе model: " + ", ".join([f"+{x}" for x in sorted(tb - ta)] + [f"−{x}" for x in sorted(ta - tb)]))
    return out


def diff_parts(old, new):
    out = []
    for k in sorted(set(old) | set(new)):
        if k in ("key", "created", "seg_id", "seg", "kind", "draft", "_draft", "_env"):
            continue
        if k == "env" and old.get(k) != new.get(k) and ("_env" in old or "_env" in new):
            d = env_diff(old.get("_env"), new.get("_env"))
            out.append(FIELDS[k] + (": " + "; ".join(d) if d else " (подробности не записаны — дубль старой версии)"))
            continue
        a, b = old.get(k), new.get(k)
        if a == b:
            continue
        if k == "params" and isinstance(a, dict) and isinstance(b, dict):
            sub = [x for x in sorted(set(a) | set(b)) if a.get(x) != b.get(x)]
            out.append(f"{FIELDS[k]}: " + ", ".join(f"{x} {a.get(x)}→{b.get(x)}" for x in sub))
        else:
            out.append(FIELDS.get(k, k))
    return out


MISS_SCAN_MAX = 300   # newest takes looked at to explain a cache miss


def _recent_recipes(d, limit=None):
    """recipe.json paths of the `limit` most recently touched takes (by the take folder's mtime; DirEntry.stat is
    free on Windows). The old code opened and parsed EVERY recipe of the project on every miss, so each run got
    slower as takes piled up. The result only feeds a log line, so the newest ones are enough."""
    dirs = []
    try:
        with os.scandir(os.path.join(d, "takes")) as it:
            for e in it:
                try:
                    if e.is_dir():
                        dirs.append((e.stat().st_mtime, e.path))
                except OSError:
                    pass
    except OSError:
        return []
    dirs.sort(reverse=True)
    return [os.path.join(p, "recipe.json") for _, p in dirs[:int(limit or MISS_SCAN_MAX)]]


def miss_reason(d, seg_id, kind, parts):
    """Compare with the newest take of the same clip and pass kind (among the newest MISS_SCAN_MAX takes)."""
    best = None
    for rp in _recent_recipes(d):
        try:
            with open(rp, "r", encoding="utf-8") as f:
                r = json.load(f)
        except (OSError, ValueError):
            continue
        if r.get("seg_id") == seg_id and r.get("kind") == kind and isinstance(r.get("parts"), dict):
            if best is None or r.get("created", 0) > best.get("created", 0):
                best = r
    if best is None:
        return "новый отрезок / прежних дублей этого вида нет"
    diff = diff_parts(best["parts"], parts or {})
    if "черновик изменился" in diff and isinstance(best.get("draft"), dict) and isinstance((parts or {}).get("_draft"), dict):
        sub = diff_parts(best["draft"], parts["_draft"])
        if sub:
            diff = [x if x != "черновик изменился" else "черновик: " + "; ".join(sub) for x in diff]
    return "; ".join(diff) if diff else "те же входы, но файла нет (кэш очищен?)"


def clear(d, takes=False):
    """Files «Очистить кэш» removes; the take store only when asked."""
    n = 0
    if not os.path.isdir(d):
        return 0
    for name in os.listdir(d):
        p = os.path.join(d, name)
        if os.path.isdir(p):
            if name == "frozen" or (name == "takes" and not takes):
                continue
            n += len(os.listdir(p))
            shutil.rmtree(p, ignore_errors=True)
        elif name.startswith("full_") or (takes and name.startswith("seg_")):   # seg_* = the takes' previews
            os.remove(p)
            n += 1
    return n

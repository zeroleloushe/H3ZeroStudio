"""Self-contained projects: every file a project uses lives in output/h3zerostudio/<pid>/, so deleting the project
folder removes everything.

  <pid>/assets/            uploaded pictures / videos / sounds (one copy per content: same sha256 = same file)
  <pid>/assets/derived/    asset-editor results (trim / crop / resize, frames, extracted sound)
  <pid>/thumbs/            video posters and filmstrips
  <pid>/export/            default folder of «Сохранить видео» and the zip export (a custom folder is left alone)
  <pid>/cache, takes, frozen, gallery …   (generation, already per project)

Projects of older versions point into input/h3zerostudio/ (shared by all projects). localize() copies what a
project uses into its folder (hard link when possible) and relinks it; the original stays untouched — other
projects may still use it. A moved asset keeps its old (file, subfolder) in "kf", so cache keys do not change.
unused_shared() / clean_unused() find and remove shared leftovers no saved project references any more."""
import os
import re
import shutil
import threading

ROOT = "h3zerostudio"
_LOCK = threading.RLock()


def log(msg):
    print(f"[H3ZS] {msg}", flush=True)


def _out():
    import folder_paths
    return os.path.abspath(folder_paths.get_output_directory())


def _in():
    import folder_paths
    return os.path.abspath(folder_paths.get_input_directory())


def _roots():
    import folder_paths
    return {"input": _in(), "output": _out(), "temp": os.path.abspath(folder_paths.get_temp_directory())}


def clean_id(x):
    return re.sub(r"[^A-Za-z0-9_-]", "", str(x or ""))[:64]


def proj_dir(pid):
    from .h3s_library import project_root
    return project_root(pid)


def sub_of(pid, *parts):
    return "/".join([ROOT, clean_id(pid), *parts])


def project_of(path):
    """pid when path is inside output/h3zerostudio/<pid>/ (not a special folder), else None."""
    from .h3s_library import SPECIAL
    base = os.path.join(_out(), ROOT)
    try:
        rel = os.path.relpath(os.path.abspath(path), base)
    except ValueError:
        return None
    if rel.startswith("..") or os.path.isabs(rel):
        return None
    pid = rel.replace("\\", "/").split("/")[0]
    return pid if pid and pid not in SPECIAL and not pid.startswith("_") and clean_id(pid) == pid and pid != rel else None


def ref_path(ref):
    """Absolute path of a {file|filename, subfolder, type} reference (inside its ComfyUI root), else None."""
    fn = ref.get("file") or ref.get("filename")
    base = _roots().get(ref.get("type") or "input")
    if not isinstance(fn, str) or not fn or not base:
        return None
    p = os.path.abspath(os.path.join(base, ref.get("subfolder") or "", fn))
    return p if os.path.commonpath([base, p]) == base else None


def _safe_name(name):
    stem, ext = os.path.splitext(os.path.basename(str(name or "file")))
    stem = re.sub(r"[^\w.\- ()\[\]]+", "_", stem).strip(" .") or "file"
    return stem[:80] + ext[:12].lower()


def _link_or_copy(src, dst):
    tmp = dst + ".part"
    try:
        os.link(src, tmp)
    except OSError:
        shutil.copy2(src, tmp)
    os.replace(tmp, dst)


def place(pid, src, folder="assets", name=None, move=False):
    """Put file src into <pid>/<folder>/ (one file per content). Returns (filename, subfolder)."""
    from .h3s_store import file_sha
    d = os.path.join(proj_dir(pid), *folder.split("/"))
    os.makedirs(d, exist_ok=True)
    sha = file_sha(src)
    with _LOCK:
        for n in sorted(os.listdir(d)):
            p = os.path.join(d, n)
            if n.endswith(".part") or not os.path.isfile(p) or os.path.getsize(p) != os.path.getsize(src):
                continue
            if os.path.abspath(p) == os.path.abspath(src) or file_sha(p) == sha:
                if move and os.path.abspath(p) != os.path.abspath(src):
                    os.remove(src)
                return n, sub_of(pid, *folder.split("/"))
        n = _safe_name(name or os.path.basename(src))
        stem, ext = os.path.splitext(n)
        k = 2
        while os.path.exists(os.path.join(d, n)):
            n, k = f"{stem}_{k}{ext}", k + 1
        if move:
            os.replace(src, os.path.join(d, n))
        else:
            _link_or_copy(src, os.path.join(d, n))
    return n, sub_of(pid, *folder.split("/"))


def upload_tmp(pid):
    d = os.path.join(proj_dir(pid), "assets")
    os.makedirs(d, exist_ok=True)
    import uuid
    return os.path.join(d, f".up_{uuid.uuid4().hex}.part")


def finish_upload(pid, tmp, filename):
    """An uploaded temp file -> <pid>/assets (deduplicated). Returns the ComfyUI-style {name, subfolder, type}."""
    try:
        n, sub = place(pid, tmp, name=filename or "upload.bin", move=True)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    return {"name": n, "subfolder": sub, "type": "output"}


def _is_ref(o):
    return isinstance(o, dict) and isinstance(o.get("file") or o.get("filename"), str) and (o.get("file") or o.get("filename")) \
        and isinstance(o.get("subfolder", ""), str) and (o.get("type") or "input") in ("input", "output", "temp")


def localize(project):
    """Copy the files a project's assets use into its folder and relink them (originals untouched).
    Returns {"assets": [...] (the new list), "moved": n, "missing": [names]}."""
    pid = clean_id(project.get("id"))
    if not pid:
        raise ValueError("нет id проекта")
    pd = proj_dir(pid)
    moved, missing = 0, []

    def fix(ref, folder, top=False):
        nonlocal moved
        p = ref_path(ref)
        if not p or os.path.commonpath([pd, p]) == pd:
            return
        if not os.path.isfile(p):
            missing.append(ref.get("name") or ref.get("file") or ref.get("filename"))
            return
        key = "file" if "file" in ref else "filename"
        if top and "kf" not in ref:   # the cache keys keep knowing it by its old place
            ref["kf"] = [ref.get("file") or "", ref.get("subfolder") or ""]
        n, sub = place(pid, p, folder)
        ref[key], ref["subfolder"], ref["type"] = n, sub, "output"
        moved += 1

    assets = [dict(a) for a in project.get("assets") or [] if isinstance(a, dict)]
    for a in assets:
        if not _is_ref(a):
            continue
        fix(a, "assets/derived" if "/derived" in (a.get("subfolder") or "") else "assets", top=True)
        for k, v in list(a.items()):   # the asset editor's original, posters / filmstrips
            if k in ("kf", "fsig") or not _is_ref(v):
                continue
            v = dict(v)
            fix(v, "assets" if k == "orig" else "thumbs")
            a[k] = v
    if moved:
        log(f"project {pid}: {moved} file(s) copied into its folder" + (f"; missing: {', '.join(map(str, missing[:5]))}" if missing else ""))
    return {"assets": assets, "moved": moved, "missing": missing}


def dir_size(d):
    n = size = 0
    for root, _, files in os.walk(d):
        for f in files:
            try:
                size += os.path.getsize(os.path.join(root, f))
                n += 1
            except OSError:
                pass
    return {"bytes": size, "files": n}


def project_size(pid):
    d = proj_dir(pid)
    return dir_size(d) if os.path.isdir(d) else {"bytes": 0, "files": 0}


# ---------------------------------------------------------------- shared leftovers of older versions
def _shared_candidates():
    out = []
    for base in (os.path.join(_in(), ROOT), os.path.join(_out(), ROOT, "_thumbs")):
        for root, _, files in os.walk(base):
            for f in files:
                out.append(os.path.join(root, f))
    return out


def _referenced():
    """Absolute paths referenced by any saved project (and by the gallery entries of any project)."""
    from .h3s_library import projects_dir, _refs, _read_json
    acc = set()
    d = projects_dir()
    if os.path.isdir(d):
        for n in os.listdir(d):
            if n.endswith(".json"):
                j = _read_json(os.path.join(d, n), None)
                if j and isinstance(j.get("project"), dict):
                    _refs(j["project"], acc)
    gdir = os.path.join(_out(), ROOT)
    if os.path.isdir(gdir):
        for n in os.listdir(gdir):
            g = os.path.join(gdir, n, "gallery.json")
            if os.path.isfile(g):
                _refs(_read_json(g, {}), acc)
    paths = set()
    for typ, sub, fn in acc:
        p = ref_path({"type": typ, "subfolder": sub, "file": fn})
        if p:
            paths.add(os.path.normcase(p))
    return paths


def unused_shared():
    """Shared files (input/h3zerostudio/…, output/h3zerostudio/_thumbs) that no saved project references."""
    ref = _referenced()
    files = [p for p in _shared_candidates() if os.path.normcase(os.path.abspath(p)) not in ref and not p.endswith(".part")]
    size = 0
    for p in files:
        try:
            size += os.path.getsize(p)
        except OSError:
            pass
    return {"files": len(files), "bytes": size, "sample": [os.path.relpath(p, _out() if p.startswith(_out()) else _in()).replace("\\", "/") for p in files[:12]]}


def clean_unused():
    """Delete them (the list is computed again right now; anything referenced in the meantime stays)."""
    ref = _referenced()
    n = size = 0
    for p in _shared_candidates():
        if os.path.normcase(os.path.abspath(p)) in ref or p.endswith(".part"):
            continue
        try:
            s = os.path.getsize(p)
            os.remove(p)
            n, size = n + 1, size + s
        except OSError:
            pass
    for base in (os.path.join(_in(), ROOT),):   # empty sub-folders
        for root, dirs, files in sorted(os.walk(base), key=lambda x: -len(x[0])):
            if root != base and not os.listdir(root):
                try:
                    os.rmdir(root)
                except OSError:
                    pass
    log(f"unused shared files removed: {n} ({size / 2 ** 20:.1f} MB)")
    return {"files": n, "bytes": size}

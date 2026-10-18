"""«Галерея» and «Проекты».

Gallery: every generated result of a project (takes, drafts, finals from drafts, segment upscales, frozen
segments, stitched videos) is recorded in output/h3zerostudio/<project>/gallery.json the moment it is produced;
files of older versions (seg_*.mp4 / full_*.mp4 without an index entry) are picked up by a scan.
Projects: snapshots of the editor project (the node keeps the live copy in the workflow) in
output/h3zerostudio/_projects/<id>.json (autosave from the editor), open / new / duplicate / rename / delete,
zip export (project + every referenced input/output file + the project's generation folder) and import.
"""
import json
import os
import re
import shutil
import threading
import time
import zipfile

ROOT = "h3zerostudio"
SPECIAL = {"_projects", "_exports", "_thumbs", "export", "_import"}
KINDS = ("take", "draft", "refine", "upscale", "region", "final")
_LOCK = threading.RLock()


def _out():
    import folder_paths
    return os.path.abspath(folder_paths.get_output_directory())


def _in():
    import folder_paths
    return os.path.abspath(folder_paths.get_input_directory())


def clean_id(x):
    return re.sub(r"[^A-Za-z0-9_-]", "", str(x or ""))[:64]


def project_root(pid):
    pid = clean_id(pid)
    if not pid or pid in SPECIAL:
        raise ValueError("недопустимый id проекта")
    return os.path.join(_out(), ROOT, pid)


def _read_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def _write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.{os.getpid()}.{threading.get_ident()}.part"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    from .h3s_media import replace_file
    replace_file(tmp, path)


def _ref(sub, name):
    return {"filename": name, "subfolder": sub, "type": "output"}


# ---------------------------------------------------------------- gallery
def gallery_file(d):
    return os.path.join(d, "gallery.json")


def gallery_add(d, entry):
    """Record (or refresh) a gallery entry; user fields (fav, created) of an existing entry are kept."""
    if not entry or not entry.get("id"):
        return
    with _LOCK:
        idx = _read_json(gallery_file(d), {"v": 1, "items": {}})
        items = idx.setdefault("items", {})
        old = items.get(entry["id"]) or {}
        new = {**old, **{k: v for k, v in entry.items() if v is not None}}
        new["fav"] = bool(old.get("fav", entry.get("fav", False)))
        new["created"] = old.get("created") or entry.get("created") or int(time.time())
        if old.get("frozen"):
            new["frozen"] = True
        items[entry["id"]] = new
        _write_json(gallery_file(d), idx)


def segment_entry(pid, pname, sub, res, seg, index, kind):
    """Gallery entry of a finished segment result (h3s_gen._run_project)."""
    k = "upscale" if res.get("upscale") else ("take" if kind == "full" else kind)
    return {"id": f"seg_{res['key']}", "pid": pid, "project": pname, "kind": k, "key": res["key"],
            "video": res.get("video"), "poster": res.get("poster"), "strip": res.get("strip"),
            "frames": res.get("frames"), "wh": res.get("wh"), "seed": res.get("seed"),
            "prompt": str(seg.get("prompt") or "")[:2000], "seg_id": seg.get("id"), "seg_name": seg.get("name") or "",
            "seg_index": index, "upscale": res.get("upscale"), "base_key": res.get("base_key"), "draft_key": res.get("draft_key"),
            "up_input": res.get("up_input"), "created": res.get("created")}


def region_entry(pid, pname, res, region, seg, index, base_key=None):
    """Gallery entry of a region regeneration (the spliced window), stacked with the segment it belongs to."""
    return {"id": f"reg_{res['key']}", "pid": pid, "project": pname, "kind": "region", "key": res["key"],
            "video": res.get("video"), "poster": res.get("poster"), "strip": res.get("strip"),
            "frames": res.get("frames"), "wh": res.get("wh"), "seed": res.get("seed"),
            "prompt": str(region.get("prompt") or seg.get("prompt") or "")[:2000], "seg_id": seg.get("id"), "seg_name": seg.get("name") or "",
            "seg_index": index, "region_id": region.get("id"), "region_name": region.get("name") or "", "region_kind": res.get("kind"),
            "base_key": base_key, "created": res.get("created")}


def final_entry(pid, pname, full, poster, prompt):
    return {"id": f"full_{full['key']}", "pid": pid, "project": pname, "kind": "final", "key": full["key"],
            "video": full.get("video"), "poster": poster, "frames": full.get("frames"), "count": full.get("count"),
            "partial": bool(full.get("partial")), "prompt": str(prompt or "")[:2000], "created": int(time.time())}


def gallery_mark_frozen(d, key):
    with _LOCK:
        idx = _read_json(gallery_file(d), None)
        if idx and f"seg_{key}" in idx.get("items", {}):
            idx["items"][f"seg_{key}"]["frozen"] = True
            _write_json(gallery_file(d), idx)


def _project_dirs():
    base = os.path.join(_out(), ROOT)
    if not os.path.isdir(base):
        return []
    return [n for n in sorted(os.listdir(base)) if n not in SPECIAL and os.path.isdir(os.path.join(base, n)) and clean_id(n) == n]


def gallery_list(pid=None):
    """Entries of one project (pid) or of all projects, newest first. Entries whose video is gone are dropped;
    seg_/full_ files without an entry (older versions) are added from a scan."""
    out = []
    for p in ([clean_id(pid)] if pid else _project_dirs()):
        d = os.path.join(_out(), ROOT, p)
        if not os.path.isdir(d):
            continue
        sub = f"{ROOT}/{p}"
        idx = _read_json(gallery_file(d), {"items": {}}).get("items", {})
        frozen = set(os.listdir(os.path.join(d, "frozen"))) if os.path.isdir(os.path.join(d, "frozen")) else set()
        names = set(os.listdir(d))
        seen = set()
        for eid, e in idx.items():
            fn = (e.get("video") or {}).get("filename", "")
            if fn not in names and fn not in frozen:
                continue
            if fn not in names:   # only the frozen copy is left
                e = {**e, "video": _ref(sub + "/frozen", fn)}
            e = {**e, "pid": p, "frozen": bool(e.get("frozen") or fn in frozen)}
            out.append(e)
            seen.add(fn)
        for fn in names:
            m = re.fullmatch(r"(seg|full)_([0-9a-f]{8,64})\.mp4", fn)
            if not m or fn in seen:
                continue
            key = m.group(2)
            poster = f"seg_{key}_poster.jpg"
            out.append({"id": f"{m.group(1)}_{key}", "pid": p, "kind": "final" if m.group(1) == "full" else "take", "key": key,
                        "video": _ref(sub, fn), "poster": _ref(sub, poster) if poster in names else None,
                        "strip": _ref(sub, f"seg_{key}_tiles.jpg") if f"seg_{key}_tiles.jpg" in names else None,
                        "created": int(os.path.getmtime(os.path.join(d, fn))), "fav": False, "frozen": fn in frozen, "scanned": True})
    out.sort(key=lambda e: e.get("created") or 0, reverse=True)
    return out


def gallery_update(pid, eid, fields):
    d = project_root(pid)
    eid = re.sub(r"[^A-Za-z0-9_]", "", str(eid or ""))
    allowed = {k: v for k, v in (fields or {}).items() if k in ("fav", "note")}
    with _LOCK:
        idx = _read_json(gallery_file(d), {"v": 1, "items": {}})
        e = idx.setdefault("items", {}).get(eid)
        if e is None:   # a scanned file: create its entry
            hit = next((x for x in gallery_list(pid) if x["id"] == eid), None)
            if hit is None:
                raise FileNotFoundError("нет такого элемента галереи")
            e = {k: v for k, v in hit.items() if k != "scanned"}
        e.update(allowed)
        idx["items"][eid] = e
        _write_json(gallery_file(d), idx)
    return e


def gallery_delete(pid, eid):
    """Delete a gallery item: its mp4 / poster / filmstrip and (segments) its cached latent. Frozen copies stay
    (unfreeze the segment first). Returns the removed file count."""
    d = project_root(pid)
    m = re.fullmatch(r"(seg|full|reg)_([0-9a-f]{8,64})", str(eid or ""))
    if not m:
        raise ValueError("недопустимый элемент")
    kind, key = m.groups()
    names = [f"full_{key}.mp4"] if kind == "full" else \
        [f"seg_r{key}.mp4", f"seg_r{key}_tiles.jpg", f"seg_r{key}_poster.jpg", os.path.join("cache", f"region_{key}.pt")] if kind == "reg" else [f"seg_{key}.mp4", f"seg_{key}_tiles.jpg", f"seg_{key}_poster.jpg", os.path.join("cache", f"seg_{key}.pt")]
    n = 0
    for name in names:
        p = os.path.join(d, name)
        if os.path.isfile(p):
            try:
                os.remove(p)
                n += 1
            except OSError:
                pass
    keep = kind == "seg" and os.path.isfile(os.path.join(d, "frozen", f"seg_{key}.mp4"))   # the frozen copy stays visible
    with _LOCK:
        idx = _read_json(gallery_file(d), None)
        if idx and not keep and idx.get("items", {}).pop(eid, None) is not None:
            _write_json(gallery_file(d), idx)
    return n


# ---------------------------------------------------------------- projects
def settings_path():
    return os.path.join(_out(), ROOT, "_settings.json")


def settings_get():
    """Global set-once settings («Настройки»): {} until the user changes one."""
    from . import h3s_core as core
    return {"settings": core.global_settings(_read_json(settings_path(), {}).get("settings") or {})}


def settings_set(values, replace=False):
    from . import h3s_core as core
    cur = {} if replace else (_read_json(settings_path(), {}).get("settings") or {})
    cur.update(values or {})
    cur = core.global_settings(cur)
    _write_json(settings_path(), {"v": 1, "settings": cur, "updated": int(time.time())})
    return {"settings": cur}


def projects_dir():
    return os.path.join(_out(), ROOT, "_projects")


def project_save(project, meta=None):
    pid = clean_id((project or {}).get("id"))
    if not pid or pid in SPECIAL:
        raise ValueError("нет id проекта")
    meta = dict(meta or {})
    meta.update({"id": pid, "name": str(project.get("name") or meta.get("name") or "H3 проект")[:200], "updated": int(time.time())})
    _write_json(os.path.join(projects_dir(), pid + ".json"), {"v": 1, "meta": meta, "project": project})
    return meta


def project_list():
    d = projects_dir()
    out = []
    if os.path.isdir(d):
        for n in os.listdir(d):
            if n.endswith(".json"):
                j = _read_json(os.path.join(d, n), None)
                if j and j.get("meta"):
                    out.append(j["meta"])
    out.sort(key=lambda m: m.get("updated") or 0, reverse=True)
    return out


def project_get(pid):
    j = _read_json(os.path.join(projects_dir(), clean_id(pid) + ".json"), None)
    if not j:
        raise FileNotFoundError("проект не найден")
    return j["project"]


def project_rename(pid, name):
    path = os.path.join(projects_dir(), clean_id(pid) + ".json")
    with _LOCK:
        j = _read_json(path, None)
        if not j:
            raise FileNotFoundError("проект не найден")
        name = str(name or "").strip()[:200] or "H3 проект"
        j["project"]["name"] = name
        j["meta"]["name"] = name
        _write_json(path, j)
    return j["meta"]


def project_delete(pid, files=False):
    pid = clean_id(pid)
    p = os.path.join(projects_dir(), pid + ".json")
    if os.path.isfile(p):
        os.remove(p)
    removed = False
    if files:
        d = project_root(pid)
        if os.path.isdir(d):
            shutil.rmtree(d, ignore_errors=True)
            removed = True
    return {"files": removed}


def _relink(project, old, new):
    """Project JSON with every reference into the old generation folder pointing at the new one."""
    s = json.dumps(project, ensure_ascii=False)
    s = s.replace(f'"{ROOT}/{old}/', f'"{ROOT}/{new}/').replace(f'"{ROOT}/{old}"', f'"{ROOT}/{new}"')
    p = json.loads(s)
    p["id"] = new
    return p


def _link_tree(src, dst):
    """Copy a folder by hard links where possible (instant, no extra space), else by copying."""
    for root, _, files in os.walk(src):
        rel = os.path.relpath(root, src)
        os.makedirs(os.path.join(dst, rel), exist_ok=True)
        for f in files:
            a, b = os.path.join(root, f), os.path.join(dst, rel, f)
            if os.path.exists(b):
                continue
            try:
                os.link(a, b)
            except OSError:
                shutil.copy2(a, b)


def project_duplicate(project, new_id, name=None):
    old, new = clean_id(project.get("id")), clean_id(new_id)
    if not old or not new or new == old:
        raise ValueError("нужен новый id")
    p = _relink(project, old, new)
    p["name"] = str(name or (str(project.get("name") or "H3 проект") + " (копия)"))[:200]
    src = os.path.join(_out(), ROOT, old)
    if os.path.isdir(src):
        _link_tree(src, project_root(new))
    return p


# ---------------------------------------------------------------- zip
def _refs(obj, acc):
    """Every {filename|file, subfolder, type} reference in a project."""
    if isinstance(obj, dict):
        fn = obj.get("filename") or obj.get("file")
        if isinstance(fn, str) and fn and obj.get("type", "input") in ("input", "output") and isinstance(obj.get("subfolder", ""), str):
            acc.add((obj.get("type") or "input", obj.get("subfolder") or "", fn))
        for v in obj.values():
            _refs(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            _refs(v, acc)
    return acc


def _safe_join(base, *parts):
    p = os.path.abspath(os.path.join(base, *parts))
    if os.path.commonpath([os.path.abspath(base), p]) != os.path.abspath(base):
        raise ValueError("недопустимый путь в архиве")
    return p


def export_zip(project, include_cache=True, folder=""):
    """Project + referenced files + its generation folder -> zip. Returns {path, ref (if inside output), size}."""
    from .h3s_gen import safe_name
    pid = clean_id(project.get("id"))
    if not pid:
        raise ValueError("нет id проекта")
    folder = str(folder or "").strip().strip('"')
    if not folder:
        folder = os.path.join(_out(), ROOT, "_exports")
    elif not os.path.isabs(os.path.expanduser(folder)):
        folder = os.path.join(_out(), folder)
    folder = os.path.abspath(os.path.expanduser(folder))
    os.makedirs(folder, exist_ok=True)
    base = safe_name(f"{project.get('name') or 'h3'}_{time.strftime('%Y-%m-%d_%H-%M')}")
    dst, k = os.path.join(folder, base + ".zip"), 2
    while os.path.exists(dst):
        dst, k = os.path.join(folder, f"{base}_{k}.zip"), k + 1
    roots = {"input": _in(), "output": _out()}
    added = set()
    tmp = dst + ".part"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_STORED, allowZip64=True) as z:
        z.writestr("project.json", json.dumps(project, ensure_ascii=False, indent=1), compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("h3zerostudio.txt", "H3ZeroStudio project export v1\n")
        gen = os.path.join(_out(), ROOT, pid)
        if os.path.isdir(gen):
            for root, _, files in os.walk(gen):
                for f in files:
                    full = os.path.join(root, f)
                    rel = os.path.relpath(full, _out()).replace("\\", "/")
                    if not include_cache and rel.startswith(f"{ROOT}/{pid}/cache/"):
                        continue
                    if f.endswith(".part"):
                        continue
                    z.write(full, "files/output/" + rel)
                    added.add(("output", rel))
        for typ, sub, fn in sorted(_refs(project, set())):
            try:
                full = _safe_join(roots[typ], sub, fn)
            except ValueError:
                continue
            rel = os.path.relpath(full, roots[typ]).replace("\\", "/")
            if (typ, rel) in added or not os.path.isfile(full):
                continue
            z.write(full, f"files/{typ}/{rel}")
            added.add((typ, rel))
    from .h3s_media import replace_file
    replace_file(tmp, dst)
    out = {"path": dst, "size": os.path.getsize(dst), "files": len(added)}
    if os.path.commonpath([_out(), dst]) == _out():
        rel = os.path.relpath(dst, _out()).replace("\\", "/")
        out["ref"] = {"filename": os.path.basename(rel), "subfolder": os.path.dirname(rel), "type": "output"}
    return out


def import_zip(zip_path, new_id):
    """Unpack an exported project. A project id that already exists here gets new_id (references relinked).
    Input files: same name + same size = reused, otherwise unpacked under a free name (references updated).
    Returns the project (also saved to the project list)."""
    roots = {"input": _in(), "output": _out()}
    with zipfile.ZipFile(zip_path) as z:
        try:
            project = json.loads(z.read("project.json").decode("utf-8"))
        except KeyError:
            raise ValueError("в архиве нет project.json — это не экспорт H3ZeroStudio")
        old = clean_id(project.get("id"))
        if not old:
            raise ValueError("в проекте нет id")
        new = old
        if os.path.isfile(os.path.join(projects_dir(), old + ".json")) or os.path.isdir(os.path.join(_out(), ROOT, old)):
            new = clean_id(new_id)
            if not new:
                raise ValueError("нужен новый id")
        renames = {}
        for info in z.infolist():
            n = info.filename.replace("\\", "/")
            if info.is_dir() or not n.startswith("files/"):
                continue
            parts = n.split("/", 2)
            if len(parts) < 3 or parts[1] not in roots:
                continue
            typ, rel = parts[1], parts[2]
            if typ == "output" and rel.startswith(f"{ROOT}/{old}/"):
                rel = f"{ROOT}/{new}/" + rel[len(f"{ROOT}/{old}/"):]
            dst = _safe_join(roots[typ], rel)
            if os.path.isfile(dst):
                if os.path.getsize(dst) == info.file_size:
                    continue
                stem, ext = os.path.splitext(dst)
                k = 2
                while os.path.exists(f"{stem}_{k}{ext}"):
                    k += 1
                dst2 = f"{stem}_{k}{ext}"
                renames[(typ, os.path.dirname(rel), os.path.basename(rel))] = os.path.basename(dst2)
                dst = dst2
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with z.open(info) as src, open(dst + ".part", "wb") as f:
                shutil.copyfileobj(src, f, 1 << 20)
            os.replace(dst + ".part", dst)
    if new != old:
        project = _relink(project, old, new)

    def fix(obj):
        if isinstance(obj, dict):
            key = "filename" if "filename" in obj else "file" if "file" in obj else None
            if key and isinstance(obj.get(key), str):
                r = renames.get((obj.get("type") or "input", obj.get("subfolder") or "", obj[key]))
                if r:
                    obj[key] = r
            for v in obj.values():
                fix(v)
        elif isinstance(obj, list):
            for v in obj:
                fix(v)
    fix(project)
    project_save(project, {"imported": int(time.time())})
    return project

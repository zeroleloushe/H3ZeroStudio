"""Drop-in UI theme packs for H3ZeroStudio.

Packs live outside the node tree so they survive updates:

  <ComfyUI>/user/default/H3ZeroStudio/themes/<theme_id>/
      theme.json   — id, name_ru, name_en, author, version, base ("dark"|"light")
      theme.css    — CSS vars + overrides scoped to :root[data-h3z-theme="<id>"]
      assets/      — optional png/svg/woff2 (referenced from the CSS)

Also scanned (gitignored): <node>/themes_user/<theme_id>/

Served only through a path-safe route (css/png/svg/woff2). Invalid packs are
skipped and reported so the Settings picker can toast a warning.
"""
from __future__ import annotations

import json
import os
import re

ALLOWED_EXT = {".css", ".png", ".svg", ".woff2", ".jpg", ".jpeg", ".webp"}
_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
_warned = []


def _node_dir():
    return os.path.dirname(os.path.abspath(__file__))


def theme_roots():
    """Ordered search roots (user dir first, then node-local themes_user)."""
    roots = []
    try:
        import folder_paths
        base = None
        # ComfyUI user directory (0.3+): user/default/…
        get_user = getattr(folder_paths, "get_user_directory", None)
        if callable(get_user):
            base = get_user()
        if not base:
            # fall back: sibling of models_dir → ComfyUI/user/default
            models = getattr(folder_paths, "models_dir", None) or ""
            comfy = os.path.dirname(models) if models else ""
            base = os.path.join(comfy, "user", "default") if comfy else ""
        if base:
            roots.append(os.path.join(base, "H3ZeroStudio", "themes"))
    except Exception:
        pass
    roots.append(os.path.join(_node_dir(), "themes_user"))
    return roots


def _read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _validate_meta(meta, folder_id):
    if not isinstance(meta, dict):
        return None, "theme.json is not an object"
    tid = str(meta.get("id") or folder_id).strip()
    if not _ID_RE.match(tid):
        return None, f"bad theme id {tid!r}"
    name_ru = str(meta.get("name_ru") or meta.get("name") or tid).strip()[:80]
    name_en = str(meta.get("name_en") or name_ru).strip()[:80]
    base = str(meta.get("base") or meta.get("color_scheme") or "dark").lower()
    if base not in ("dark", "light"):
        base = "dark"
    css = "theme.css"
    if not isinstance(meta.get("css"), (str, type(None))):
        return None, "css field must be a string"
    if meta.get("css"):
        css = os.path.basename(str(meta["css"]))
        if not css.lower().endswith(".css"):
            return None, "css must be a .css file"
    swatches = meta.get("swatches") if isinstance(meta.get("swatches"), list) else []
    swatches = [str(c)[:32] for c in swatches[:5] if isinstance(c, str)]
    return {
        "id": tid,
        "name_ru": name_ru,
        "name_en": name_en,
        "author": str(meta.get("author") or "")[:80],
        "version": str(meta.get("version") or "1")[:20],
        "base": base,
        "css": css,
        "swatches": swatches,
        "description_ru": str(meta.get("description_ru") or meta.get("description") or "")[:200],
        "description_en": str(meta.get("description_en") or meta.get("description") or "")[:200],
    }, None


def scan_themes():
    """Return (themes: list[dict], warnings: list[str]). Each theme has id, names, css_url path bits."""
    global _warned
    themes = []
    warnings = []
    seen = set()
    for root in theme_roots():
        if not os.path.isdir(root):
            continue
        try:
            names = sorted(os.listdir(root))
        except OSError as e:
            warnings.append(f"themes root unreadable: {root} ({e})")
            continue
        for name in names:
            folder = os.path.join(root, name)
            if not os.path.isdir(folder):
                continue
            meta_path = os.path.join(folder, "theme.json")
            if not os.path.isfile(meta_path):
                warnings.append(f"{name}: no theme.json")
                continue
            try:
                raw = _read_json(meta_path)
            except Exception as e:
                warnings.append(f"{name}: bad theme.json ({e})")
                continue
            meta, err = _validate_meta(raw, name)
            if err:
                warnings.append(f"{name}: {err}")
                continue
            css_path = os.path.join(folder, meta["css"])
            if not os.path.isfile(css_path):
                warnings.append(f"{name}: missing {meta['css']}")
                continue
            if meta["id"] in seen:
                warnings.append(f"{name}: duplicate id {meta['id']} (skipped)")
                continue
            seen.add(meta["id"])
            themes.append({
                **meta,
                "root": folder,
                "plugin": True,
                "swatches": meta["swatches"] or ["#c0c0c0", "#000080", "#008080"],
            })
    _warned = list(warnings)
    return themes, warnings


def list_themes():
    """Public list for /h3zero/themes (no filesystem paths)."""
    themes, warnings = scan_themes()
    out = []
    for t in themes:
        out.append({
            "id": t["id"], "name_ru": t["name_ru"], "name_en": t["name_en"],
            "author": t["author"], "version": t["version"], "base": t["base"],
            "swatches": t["swatches"], "plugin": True,
            "description_ru": t["description_ru"], "description_en": t["description_en"],
            "css": f"/h3zero/themes/{t['id']}/theme.css",
        })
    return {"themes": out, "warnings": warnings}


def resolve_file(theme_id, rel):
    """Resolve a safe file under a theme pack. Returns abs path or None."""
    if not _ID_RE.match(str(theme_id or "")):
        return None
    rel = str(rel or "").replace("\\", "/").lstrip("/")
    if not rel or ".." in rel.split("/"):
        return None
    ext = os.path.splitext(rel)[1].lower()
    if ext not in ALLOWED_EXT:
        return None
    themes, _ = scan_themes()
    hit = next((t for t in themes if t["id"] == theme_id), None)
    if not hit:
        return None
    # theme.css alias → configured css filename
    if rel == "theme.css":
        rel = hit["css"]
    full = os.path.realpath(os.path.join(hit["root"], rel))
    root = os.path.realpath(hit["root"])
    if full != root and not full.startswith(root + os.sep):
        return None
    if not os.path.isfile(full):
        return None
    return full


def content_type(path):
    ext = os.path.splitext(path)[1].lower()
    return {
        ".css": "text/css; charset=utf-8",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }.get(ext, "application/octet-stream")

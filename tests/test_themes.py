"""Drop-in UI theme pack loader + safe file resolve."""
import json
import os
from pathlib import Path

import pytest

from h3s import h3s_themes as themes


@pytest.fixture()
def pack_root(tmp_path, monkeypatch):
    root = tmp_path / "themes"
    pack = root / "win98"
    pack.mkdir(parents=True)
    (pack / "theme.json").write_text(json.dumps({
        "id": "win98",
        "name_ru": "Бонус: Windows 98",
        "name_en": "Bonus: Windows 98",
        "base": "light",
        "version": "1.0",
        "swatches": ["#c0c0c0", "#000080", "#008080"],
    }), encoding="utf-8")
    (pack / "theme.css").write_text(':root[data-h3z-theme="win98"]{--bg0:#008080;}', encoding="utf-8")
    (pack / "assets").mkdir()
    (pack / "assets" / "dot.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    monkeypatch.setattr(themes, "theme_roots", lambda: [str(root)])
    return root


def test_scan_lists_valid_pack(pack_root):
    listed = themes.list_themes()
    assert listed["warnings"] == []
    assert len(listed["themes"]) == 1
    t = listed["themes"][0]
    assert t["id"] == "win98" and t["plugin"] and t["base"] == "light"
    assert t["css"].endswith("/h3zero/themes/win98/theme.css")
    assert t["name_ru"].startswith("Бонус")


def test_invalid_pack_warns(tmp_path, monkeypatch):
    root = tmp_path / "themes"
    bad = root / "broken"
    bad.mkdir(parents=True)
    (bad / "theme.json").write_text('{"id": "BROKEN!"}', encoding="utf-8")
    monkeypatch.setattr(themes, "theme_roots", lambda: [str(root)])
    listed = themes.list_themes()
    assert listed["themes"] == []
    assert any("bad theme id" in w or "missing" in w for w in listed["warnings"])


def test_resolve_file_safe(pack_root):
    css = themes.resolve_file("win98", "theme.css")
    assert css and css.endswith("theme.css") and os.path.isfile(css)
    png = themes.resolve_file("win98", "assets/dot.png")
    assert png and png.endswith("dot.png")
    assert themes.resolve_file("win98", "../theme.json") is None
    assert themes.resolve_file("win98", "secret.exe") is None
    assert themes.resolve_file("../x", "theme.css") is None
    assert themes.content_type(css).startswith("text/css")


def test_missing_css_skipped(tmp_path, monkeypatch):
    root = tmp_path / "themes"
    pack = root / "empty"
    pack.mkdir(parents=True)
    (pack / "theme.json").write_text(json.dumps({"id": "empty", "name_ru": "x", "name_en": "x"}), encoding="utf-8")
    monkeypatch.setattr(themes, "theme_roots", lambda: [str(root)])
    listed = themes.list_themes()
    assert listed["themes"] == []
    assert any("missing" in w for w in listed["warnings"])

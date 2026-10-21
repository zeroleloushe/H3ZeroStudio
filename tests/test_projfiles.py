"""Self-contained projects: migration into the project folder, stable keys, duplicate, delete, shared leftovers."""
import os
import shutil

import numpy as np
import pytest
from PIL import Image

import folder_paths
from h3s import h3s_core as core
from h3s import h3s_library as lib
from h3s import h3s_projfiles as pf


@pytest.fixture()
def roots(tmp_path):
    out, inp = tmp_path / "out", tmp_path / "in"
    (inp / "h3zerostudio" / "derived").mkdir(parents=True)
    out.mkdir()
    folder_paths.set_output_directory(str(out))
    folder_paths.set_input_directory(str(inp))
    img = (np.random.rand(40, 32, 3) * 255).astype("uint8")
    Image.fromarray(img).save(inp / "h3zerostudio" / "hero.png")
    shutil.copy(inp / "h3zerostudio" / "hero.png", inp / "h3zerostudio" / "hero_again.png")   # same content
    Image.fromarray(img[::-1].copy()).save(inp / "h3zerostudio" / "city.png")
    Image.fromarray(img[:, ::-1].copy()).save(inp / "h3zerostudio" / "derived" / "orphan.png")
    return out, inp


def _proj(pid="pa"):
    return {"id": pid, "name": "A", "settings": {"prompt": "g"},
            "assets": [{"id": "a1", "file": "hero.png", "subfolder": "h3zerostudio", "type": "input", "category": "character"},
                       {"id": "a2", "file": "hero_again.png", "subfolder": "h3zerostudio", "type": "input", "category": "character"},
                       {"id": "a3", "file": "city.png", "subfolder": "h3zerostudio", "type": "input", "category": "location"}],
            "segments": [{"id": "s1", "frames": 39, "prompt": "one", "refs": ["a1", "a3"]}, {"id": "s2", "frames": 56, "prompt": "two", "refs": ["a2"]}]}


def _keys(p):
    return core.segment_keys(core.normalize_project(p), {"a1": "x", "a2": "x", "a3": "y"}, "env")


def test_localize_copies_relinks_and_keeps_keys(roots):
    out, inp = roots
    p = _proj()
    k0 = _keys(p)
    r = pf.localize(p)
    assert r["moved"] == 3 and not r["missing"]
    p2 = dict(p, assets=r["assets"])
    ad = os.path.join(str(out), "h3zerostudio", "pa", "assets")
    assert sorted(os.listdir(ad)) == ["city.png", "hero.png"]                       # one copy per content
    assert {a["file"] for a in r["assets"][:2]} == {"hero.png"}
    assert all(a["type"] == "output" and a["subfolder"] == "h3zerostudio/pa/assets" for a in r["assets"])
    assert os.path.isfile(inp / "h3zerostudio" / "hero.png")                         # originals untouched
    assert _keys(p2) == k0                                                           # no clip goes stale
    # the JSON round trip keeps the old place; running it again moves nothing
    n = core.normalize_project(p2)
    assert n["assets"][0]["kf"] == ["hero.png", "h3zerostudio"] and pf.localize(n)["moved"] == 0
    # the asset editor now writes the derivative into the project
    from h3s import h3s_assets
    _, ref = h3s_assets._out(os.path.join(ad, "hero.png"), {"crop": 1}, ".png")
    assert ref == {"filename": ref["filename"], "subfolder": "h3zerostudio/pa/assets/derived", "type": "output"}


def test_duplicate_and_delete(roots):
    out, inp = roots
    p = _proj()
    p = dict(p, assets=pf.localize(p)["assets"])
    k0 = _keys(p)
    lib.project_save(p)
    d = lib.project_duplicate(p, "pb")
    assert d["assets"][0]["subfolder"] == "h3zerostudio/pb/assets" and d["assets"][0]["kf"] == ["hero.png", "h3zerostudio"]
    assert os.path.isfile(os.path.join(str(out), "h3zerostudio", "pb", "assets", "hero.png")) and _keys(d) == k0
    # an asset uploaded straight into the project (no kf) keeps its key across a duplicate too
    q = _proj("pc")
    tmp = pf.upload_tmp("pc")
    shutil.copy(inp / "h3zerostudio" / "city.png", tmp)
    up = pf.finish_upload("pc", tmp, "my city.png")
    assert up == {"name": "my city.png", "subfolder": "h3zerostudio/pc/assets", "type": "output"}
    q["assets"] = [{"id": "a3", "file": up["name"], "subfolder": up["subfolder"], "type": "output", "category": "location"}]
    q["segments"] = [{"id": "s1", "frames": 39, "prompt": "one", "refs": ["a3"]}]
    kq = _keys(q)
    assert _keys(lib.project_duplicate(q, "pd")) == kq
    # delete with files: the whole folder goes, the shared originals stay
    size = pf.project_size("pa")
    assert size["files"] >= 2 and size["bytes"] > 0
    lib.project_delete("pa", files=True)
    assert not os.path.exists(os.path.join(str(out), "h3zerostudio", "pa")) and os.path.isfile(inp / "h3zerostudio" / "hero.png")


def test_unused_shared_keeps_referenced(roots):
    out, inp = roots
    lib.project_save(_proj("old"))              # a not-yet-migrated project still uses hero / city
    u = pf.unused_shared()
    assert u["files"] == 1 and u["sample"] == ["h3zerostudio/derived/orphan.png"]
    assert pf.clean_unused()["files"] == 1
    assert not os.path.exists(inp / "h3zerostudio" / "derived" / "orphan.png")
    assert all(os.path.isfile(inp / "h3zerostudio" / f) for f in ("hero.png", "hero_again.png", "city.png"))

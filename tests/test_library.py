import json
import os

import folder_paths
import pytest

from h3s import h3s_library as lib
from h3s import h3s_gen as gen
from fakes import FakeClip, FakeVAE, FakeAudioVAE
from test_gen import dirs, project, patcher  # noqa: F401  (fixtures)


def test_gallery_records_runs_and_scans(patcher, dirs):
    out, _ = dirs
    p = project(id="gal")
    _, _, _, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), None)
    items = lib.gallery_list("gal")
    kinds = sorted(e["kind"] for e in items)
    assert kinds == ["final", "take", "take"]
    seg = next(e for e in items if e["kind"] == "take" and e["seg_index"] == 0)
    assert seg["prompt"] == p["segments"][0]["prompt"] and seg["video"]["filename"].startswith("seg_") and seg["poster"]
    # an older file without an index entry is found by the scan
    d = os.path.join(str(out), "h3zerostudio", "gal")
    open(os.path.join(d, "seg_deadbeefdeadbeef.mp4"), "wb").write(b"x")
    assert any(e["id"] == "seg_deadbeefdeadbeef" and e.get("scanned") for e in lib.gallery_list("gal"))
    # favourite (also for a scanned one), all projects
    lib.gallery_update("gal", seg["id"], {"fav": True})
    lib.gallery_update("gal", "seg_deadbeefdeadbeef", {"fav": True})
    favs = {e["id"] for e in lib.gallery_list(None) if e.get("fav")}
    assert favs == {seg["id"], "seg_deadbeefdeadbeef"}
    # a re-run keeps the favourite
    gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), None)
    assert next(e for e in lib.gallery_list("gal") if e["id"] == seg["id"])["fav"]
    # delete removes the files and the cached latent
    n = lib.gallery_delete("gal", seg["id"])
    assert n >= 3 and not os.path.isfile(os.path.join(d, seg["video"]["filename"])) and not os.path.isfile(os.path.join(d, "cache", f"seg_{seg['key']}.pt"))
    assert seg["id"] not in {e["id"] for e in lib.gallery_list("gal")}
    with pytest.raises(ValueError):
        lib.gallery_delete("gal", "../../x")


def test_gallery_lineage_final_from_draft(patcher, dirs):
    """A final made from a draft records the draft's key (the gallery stacks them); entries carry the segment id."""
    p = project(id="glin"); p["settings"]["final_mode"] = "refine"
    gen.run_project(patcher, FakeClip(), FakeVAE(), dict(p, run={"upto": 0, "only": 0, "kind": "draft"}), FakeAudioVAE(), None)
    dr = next(e for e in lib.gallery_list("glin") if e["kind"] == "draft")
    gen.run_project(patcher, FakeClip(), FakeVAE(), dict(p, run={"upto": 0, "only": 0, "kind": "refine"}), FakeAudioVAE(), None)
    fin = next(e for e in lib.gallery_list("glin") if e["kind"] == "refine")
    assert fin["draft_key"] == dr["key"] and fin["seg_id"] == dr["seg_id"] == p["segments"][0]["id"] and fin["key"] != dr["key"]


def test_gallery_frozen_copy_survives(patcher, dirs):
    p = project(id="gfz")
    _, _, _, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), None)
    k = info["keys"][0]
    gen.freeze_segment("gfz", k)
    lib.gallery_delete("gfz", f"seg_{k}")
    e = next(e for e in lib.gallery_list("gfz") if e["id"] == f"seg_{k}")
    assert e["frozen"] and e["video"]["subfolder"].endswith("/frozen")


def test_projects_crud_and_zip_roundtrip(patcher, dirs):
    out, inp = dirs
    p = project(id="pz", name="Мой ролик")
    gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), None)
    p["segments"][0]["result"] = {"video": {"filename": "x.mp4", "subfolder": "h3zerostudio/pz", "type": "output"}}
    meta = lib.project_save(p, {"seconds": 10.3, "segments": 2})
    assert meta["name"] == "Мой ролик" and lib.project_list()[0]["id"] == "pz"
    assert lib.project_get("pz")["name"] == "Мой ролик"
    lib.project_rename("pz", "Новое имя")
    assert lib.project_get("pz")["name"] == "Новое имя" and lib.project_list()[0]["name"] == "Новое имя"
    # duplicate: new id, references relinked, generation folder linked
    dup = lib.project_duplicate(lib.project_get("pz"), "pz2")
    assert dup["id"] == "pz2" and dup["segments"][0]["result"]["video"]["subfolder"] == "h3zerostudio/pz2"
    assert os.listdir(os.path.join(str(out), "h3zerostudio", "pz2", "cache"))
    # zip export (with assets) -> import while the id exists: new id, files restored, input clash renamed
    r = lib.export_zip(lib.project_get("pz"), include_cache=False)
    assert os.path.isfile(r["path"]) and r["ref"]["subfolder"] == "h3zerostudio/pz/export"
    import zipfile
    names = zipfile.ZipFile(r["path"]).namelist()
    assert "project.json" in names and "files/input/h3zerostudio/hero.png" in names
    assert not any("/cache/" in n for n in names) and any(n.endswith(".mp4") for n in names)
    with open(os.path.join(str(inp), "h3zerostudio", "hero.png"), "ab") as f:
        f.write(b"changed")   # a different file of the same name exists here now
    q = lib.import_zip(r["path"], "pz3")
    assert q["id"] == "pz3" and lib.project_get("pz3")["id"] == "pz3"
    hero = next(a for a in q["assets"] if a["id"] == "a1")
    assert hero["file"] == "hero_2.png" and os.path.isfile(os.path.join(str(inp), "h3zerostudio", "hero_2.png"))
    assert any(n.endswith(".mp4") for n in os.listdir(os.path.join(str(out), "h3zerostudio", "pz3")))
    # delete with files
    lib.project_delete("pz3", files=True)
    assert not os.path.isdir(os.path.join(str(out), "h3zerostudio", "pz3")) and "pz3" not in {m["id"] for m in lib.project_list()}
    with pytest.raises(ValueError):
        lib.project_root("_projects")

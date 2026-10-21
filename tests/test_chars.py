"""«Персонажи»: RefMod-format cards (create / list / header edit / foreign files), numbering after plain refs,
cache keys, and the tiny-model run with a card on a clip."""
import json
import os

import numpy as np
import pytest
import torch
from PIL import Image
from safetensors import safe_open
from safetensors.torch import save_file

import folder_paths
from h3s import h3s_core as core
from h3s import h3s_chars as chars
from h3s import h3s_gen as gen
from fakes import tiny_patcher, FakeClip, FakeVAE, FakeAudioVAE


@pytest.fixture()
def dirs(tmp_path, monkeypatch):
    out, inp = tmp_path / "out", tmp_path / "in"
    (inp / "h3zerostudio").mkdir(parents=True)
    out.mkdir()
    folder_paths.set_output_directory(str(out))
    folder_paths.set_input_directory(str(inp))
    Image.fromarray((np.random.rand(80, 64, 3) * 255).astype("uint8")).save(inp / "h3zerostudio" / "hero.png")
    monkeypatch.setattr(chars, "models_root", lambda: str(tmp_path / "models_refmods"))
    chars._CACHE.clear()
    return tmp_path


def loaders():
    imgs = {"a": torch.rand(1, 600, 400, 3), "b": torch.rand(1, 400, 700, 3)}
    return dict(load_image=lambda a: imgs[a], load_clip=lambda a, s, n: torch.rand(n, 360, 640, 3),
                load_voice=lambda a, s, e: {"waveform": torch.rand(1, 2, 8000 * 3) - 0.5, "sample_rate": 8000})


def make(name="Ann", **kw):
    spec = {"name": name, "concept": "identity", "mode": "full", "res": 512, "subject_name": "Ann",
            "appearance": "auburn hair, green coat", "voice_description": "low husky voice",
            "photos": [{"asset": "a"}, {"asset": "b", "crop": [0.1, 0.0, 0.5, 1.0]}], "voice": {"asset": "v", "start": 0, "end": 3}}
    spec.update(kw)
    return chars.create(spec, FakeVAE(), FakeAudioVAE(), **loaders())


def test_create_writes_refmod_format_and_lists(dirs):
    card = make()
    root = chars.our_root()
    vis, aud = os.path.join(root, "Ann_visual.safetensors"), os.path.join(root, "Ann_audio.safetensors")
    assert os.path.isfile(vis) and os.path.isfile(aud) and os.path.isfile(os.path.join(root, "Ann.png"))
    with safe_open(vis, framework="pt") as f:
        meta = json.loads(f.metadata()["refmod_meta"])
        lat = f.get_tensor("latent")
        assert {"enc_0", "enc_1"} <= set(f.keys())
    assert meta["_format_version"] == 4 and meta["kind"] == "video" and meta["source"] == "stack" and meta["mode"] == "encode"
    assert meta["concept_type"] == "identity" and meta["subject_name"] == "Ann" and meta["enc_times"] == [0.0, 1.0]
    assert lat.dtype == torch.float16 and tuple(lat.shape) == (1, 24, 2, 608 // 16, 384 // 16)   # the first photo (400x600, never upscaled) sets the canvas
    with safe_open(aud, framework="pt") as f:
        am = json.loads(f.metadata()["refmod_meta"])
        assert tuple(f.get_tensor("latent").shape[:3]) == (1, 32, 2) and am["kind"] == "audio" and am["voice_description"] == "low husky voice"
    assert card["id"] == "s:Ann" and card["visual"]["kind"] == "video" and card["audio"]["seconds"] == 3.0
    assert card["visual"]["tokens"] == 2 * 19 * 12 and card["audio"]["tokens"] == 240 and card["subject_name"] == "Ann"
    with pytest.raises(ValueError):
        make()                                                  # the name is taken
    c2 = make(name="Solo", photos=[{"asset": "a"}], voice=None, mode="compressed", grid=16, concept="background")
    assert c2["visual"]["kind"] == "image" and c2["mode"] == "compressed" and c2["audio"] is None
    assert (c2["visual"]["latent_h"], c2["visual"]["latent_w"]) == (16, 10)   # aspect grid of a 2:3 photo


def test_clip_frames_follow_the_17_frame_rule(dirs):
    assert [chars.snap_clip_frames(n) for n in (1, 3, 5, 21, 22, 38, 39, 60)] == [1, 3, 5, 5, 22, 22, 39, 56]
    card = make(name="Walk", photos=[], clip={"asset": "c", "start": 0, "frames": 30}, voice=None, concept="pose_motion")
    assert card["visual"]["latent_t"] == core.latent_t(22) and card["visual"]["source"] == "video"


def test_header_edit_rename_and_delete(dirs):
    make()
    c = chars.update("s:Ann", {"appearance": "short black hair", "name": "Anna", "folder": "people"})
    assert c["id"] == "s:people/Anna" and c["appearance"] == "short black hair"
    assert os.path.isfile(os.path.join(chars.our_root(), "people", "Anna.png"))
    lat = chars.load("s:people/Anna")["visual"]["latent"]
    assert tuple(lat.shape)[2] == 2                                   # tensors kept
    assert chars.delete("s:people/Anna") == 2 and chars.find("s:people/Anna") is None


def test_foreign_refmods_and_bundles_load(dirs):
    mr = dirs / "models_refmods"
    mr.mkdir()
    meta = {"_format_version": 4, "name": "vanellope", "kind": "image", "latent_h": 8, "latent_w": 6, "latent_t": 1, "mode": "training",
            "source": "image", "concept_type": "identity"}
    save_file({"latent": torch.randn(1, 24, 1, 8, 6)}, str(mr / "vanellope.safetensors"), metadata={"refmod_meta": json.dumps(meta)})
    bmeta = {"_format_version": 5, "kind": "bundle", "name": "hero", "members": [
        {"_format_version": 4, "name": "hero_visual", "kind": "video", "latent_t": 3, "latent_h": 4, "latent_w": 4, "concept_type": "identity"},
        {"_format_version": 4, "name": "hero_audio", "kind": "audio", "latent_t": 20, "sample_rate": 32000}]}
    save_file({"ref_0": torch.randn(1, 24, 3, 4, 4), "ref_1": torch.randn(1, 32, 2, 20)}, str(mr / "hero.safetensors"),
              metadata={"refmod_meta": json.dumps(bmeta)})
    cards = {c["id"]: c for c in chars.scan()}
    v, h = cards["m:vanellope"], cards["m:hero"]
    assert not v["editable"] and v["mode"] == "compressed" and v["visual"]["tokens"] == 12
    assert h["bundle"] and h["visual"]["kind"] == "video" and h["audio"]["tokens"] == 40
    m = chars.load("m:hero")
    assert tuple(m["visual"]["latent"].shape) == (1, 24, 3, 4, 4) and tuple(m["audio"]["latent"].shape) == (1, 32, 2, 20)
    with pytest.raises(ValueError):
        chars.update("m:vanellope", {"appearance": "x"})
    # no stored encoder frames: decoded once and kept
    vae = FakeVAE()
    fr, times = chars.encoder_view(chars.load("m:vanellope")["visual"], vae)
    assert fr.shape[0] == 1 and times == [0.0] and vae.decoded == 1
    chars._CACHE.clear()
    chars.encoder_view(chars.load("m:vanellope")["visual"], vae)
    assert vae.decoded == 1


def proj(**kw):
    p = {"id": "ch", "settings": {"prompt": "global", "res_mode": "custom", "width": 96, "height": 64, "steps": 2, "cfg": 1.0,
                                  "sampler": "euler", "scheduler": "simple", "overlap_blocks": 1},
         "assets": [{"id": "a1", "file": "hero.png", "subfolder": "h3zerostudio", "category": "character"}],
         "segments": [{"id": "s1", "frames": 56, "prompt": "one", "refs": ["a1"]},
                      {"id": "s2", "frames": 56, "prompt": "two", "refs": ["a1"], "cards": [{"id": "s:Ann", "w": 2}]}],
         "cards": {"s:Ann": {"name": "Ann", "sig": "x1", "concept": "identity", "vkind": "video", "audio": True, "subject_name": "Ann"}}}
    p.update(kw)
    return p


def test_labels_follow_plain_refs_and_continuity():
    p = core.normalize_project(proj())
    lab = core.card_labels(p, p["segments"][1], 1)
    assert lab[0]["video"] == [1, 2] and lab[0]["audio"] == [1, 2] and lab[0]["image"] == []   # weight 2 = two copies
    p["cards"]["s:Ann"]["vkind"] = "image"
    lab = core.card_labels(p, p["segments"][1], 1)
    assert lab[0]["image"] == [3, 4]          # <Picture 1> hero, <Picture 2> = last frame of clip 1, then the card
    text = core.compose_prompt(p, 1)
    assert "<Picture 3> shows Ann" in text and "<Audio 1> is Ann's voice timbre reference." in text
    assert "<Picture 3>" not in core.compose_prompt(core.normalize_project(proj(segments=[{"id": "s1", "frames": 56}])), 0)
    p["segments"][1]["prompt"] = "two <Picture 3> walks. <Audio 1> speaks"
    assert "shows Ann" not in core.compose_prompt(p, 1)        # cited: no extra line


def test_card_keys_only_when_used():
    base = core.normalize_project(proj(segments=[{"id": "s1", "frames": 56, "prompt": "one"}]))
    with_off = core.normalize_project(proj(segments=[{"id": "s1", "frames": 56, "prompt": "one", "cards": [{"id": "s:Ann", "on": False}]}]))
    assert core.segment_keys(base, {}, "e") == core.segment_keys(with_off, {}, "e")
    on = core.normalize_project(proj(segments=[{"id": "s1", "frames": 56, "prompt": "one", "cards": [{"id": "s:Ann", "w": 1}]}]))
    k1 = core.segment_keys(on, {}, "e")
    on2 = core.normalize_project(proj(segments=[{"id": "s1", "frames": 56, "prompt": "one", "cards": [{"id": "s:Ann", "w": 2}]}]))
    on3 = core.normalize_project(proj(segments=[{"id": "s1", "frames": 56, "prompt": "one", "cards": [{"id": "s:Ann", "w": 1}]}]))
    on3["cards"]["s:Ann"]["sig"] = "x2"
    assert k1 != core.segment_keys(base, {}, "e") and k1 != core.segment_keys(on2, {}, "e") and k1 != core.segment_keys(on3, {}, "e")


def test_tiny_model_run_with_a_card(dirs):
    make()
    pt, vae, avae = tiny_patcher(), FakeVAE(), FakeAudioVAE()
    p = proj(segments=[{"id": "s1", "frames": 56, "prompt": "one", "refs": ["a1"], "cards": [{"id": "s:Ann", "w": 2}]}], cards={})
    p["cards"] = {"s:Ann": core.card_snap(chars.find("s:Ann"))}
    clip = FakeClip()
    img, au, _, info = gen.run_project(pt, clip, vae, p, avae)
    assert img.shape[0] == 56
    text, kinds = clip.calls[0]
    assert kinds == ["image", "video", "video", "audio", "audio"]         # plain picture, then the card twice (look + voice)
    assert "<Video 1> shows Ann" in text and "<Audio 1> is Ann's voice" in text
    clip2 = FakeClip()
    gen.run_project(pt, clip2, vae, p, avae)
    assert clip2.calls == []                                                    # cached
    p["segments"][0]["cards"][0]["w"] = 1
    clip3 = FakeClip()
    gen.run_project(pt, clip3, vae, p, avae)
    assert clip3.calls and clip3.calls[0][1] == ["image", "video", "audio"]
    p["segments"][0]["cards"][0]["on"] = False
    clip4 = FakeClip()
    gen.run_project(pt, clip4, vae, p, avae)
    assert clip4.calls[0][1] == ["image"]
    # a card that vanished from the library is an error, not a silent drop
    p["segments"][0]["cards"][0]["on"] = True
    chars.delete("s:Ann")
    with pytest.raises(ValueError, match="нет карточек"):
        gen.run_project(pt, FakeClip(), vae, p, avae)



def test_estimate_parity_js(tmp_path):
    """The create form's token preview (h3s_core.js cardEstimate) matches h3s_chars.estimate."""
    import pathlib, shutil, subprocess
    node = shutil.which("node")
    if not node:
        pytest.skip("no node")
    js = pathlib.Path(__file__).resolve().parents[1] / "web" / "js" / "h3s_core.js"
    cases = []
    for res in (384, 512, 768, 1024):
        for mode in ("full", "compressed"):
            for grid in (8, 16, 24):
                for sizes in ([[600, 400]], [[400, 700], [640, 360]], [[1920, 1080]], [[333, 1001]], [[48, 720]], [[3000, 2000]]):
                    for clip in (None, {"frames": 1}, {"frames": 4}, {"frames": 22}, {"frames": 60}):
                        cases.append(({"res": res, "mode": mode, "grid": grid, "photos": [{}] * (len(sizes) - (1 if clip else 0)), "clip": clip}, sizes))
    drv = tmp_path / "d.mjs"
    drv.write_text("import * as C from %r;\nconst cs = JSON.parse(process.argv[2]);\n"
                   "console.log(JSON.stringify({e: cs.map(([s, z]) => C.cardEstimate(s, z)), f: [...Array(80).keys()].map(C.snapClipFrames)}));" % js.as_uri())
    r = subprocess.run([node, str(drv), json.dumps(cases)], capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, r.stderr
    out = json.loads(r.stdout)
    for (spec, sizes), j in zip(cases, out["e"]):
        assert json.loads(json.dumps(chars.estimate(spec, [tuple(x) for x in sizes]))) == j, (spec, sizes)
    assert out["f"] == [chars.snap_clip_frames(n) for n in range(80)]


def test_create_from_editor_body(dirs, monkeypatch):
    """The exact body the «Создать» form posts (assets as {file, subfolder, type}, normalized crops, snapped clip)."""
    Image.fromarray((np.random.rand(90, 120, 3) * 255).astype("uint8")).save(dirs / "in" / "h3zerostudio" / "wide.png")
    monkeypatch.setitem(chars.VAES, "vae", FakeVAE())
    body = {"spec": {"name": "Hero", "folder": "cast", "concept": "identity", "mode": "full", "res": 512, "grid": 16,
                     "subject_name": "Hero", "appearance": "red scarf", "retained_attributes": "", "voice_description": "",
                     "photos": [{"asset": {"file": "hero.png", "subfolder": "h3zerostudio", "type": "input"}, "crop": None},
                                {"asset": {"file": "wide.png", "subfolder": "h3zerostudio", "type": "input"}, "crop": [0.3, 0.0, 0.45, 1.0]}],
                     "clip": None, "voice": None}, "vae": "", "audio_vae": ""}
    card = chars.create_from_editor(body)
    assert card["id"] == "s:cast/Hero" and card["visual"]["latent_t"] == 2 and card["subject_name"] == "Hero"
    est = chars.estimate(body["spec"], [(64, 80), (54, 90)])
    assert card["visual"]["tokens"] == est["visual_tokens"]
    with pytest.raises(ValueError):
        chars.create_from_editor(body)   # same name again without «Перезаписать»


def test_prompt_editor_card_helpers_js(tmp_path):
    """«Персонажи» 2 in the prompt editor: !Name → <Subject N> Name on apply, subjects / draft lines from the clip's cards."""
    import pathlib, shutil, subprocess
    node = shutil.which("node")
    if not node:
        pytest.skip("no node")
    js = pathlib.Path(__file__).resolve().parents[1] / "web" / "js"
    drv = tmp_path / "d.mjs"
    drv.write_text(f"""
import * as C from {(js / "h3s_core.js").as_uri()!r};
const {{ installChars }} = await import({(js / "h3s_chars.js").as_uri()!r});
class E {{}}
installChars(E, {{ C, h: () => null, ICON: {{}} }});
const p = C.normalizeProject({{ id: "x", segments: [{{ id: "a", frames: 124, prompt: "",
  cards: [{{ id: "s:Anna", w: 2 }}, {{ id: "s:Forest" }}, {{ id: "s:Nar" }}] }}],
  cards: {{ "s:Anna": {{ name: "Anna", concept: "identity", vkind: "image", audio: true, subject_name: "Anna", appearance: "red coat", voice_description: "low voice" }},
            "s:Forest": {{ name: "Pine Forest", concept: "background", vkind: "image" }},
            "s:Nar": {{ name: "Old Narrator", concept: "voice", audio: true }} }} }});
const e = new E(); e.p = p; e.charCard = () => null; e.charThumb = () => "";
const subjects = e.peSubjects(p.segments[0], 0, false);
e.pe = {{ refs: {{ subjects, items: e.peCardItems(p.segments[0], 0, false) }}, spec: {{ ctx: {{ kind: "seg", seg: 0 }} }} }};
console.log(JSON.stringify({{
  subjects: subjects.map((x) => [x.n, x.name]),
  items: e.pe.refs.items.map((r) => r.token),
  bang: e.peExpandBangs("!anna meets !Old_Narrator near (!Bob) and mail!Anna"),
  draft: e.peDraftLines(),
  status: e.peCardStatus("<Picture 1> walks; <Subject 7> x"),
}}));
""", encoding="utf-8")
    r = subprocess.run([node, str(drv)], capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, r.stderr
    o = json.loads(r.stdout)
    assert o["subjects"] == [[1, "Anna"], [2, "Old_Narrator"]]
    assert o["items"] == ["<Picture 1>", "<Picture 2>", "<Audio 1>", "<Audio 2>", "<Picture 3>", "<Audio 3>"]
    assert o["bang"] == "<Subject 1> Anna meets <Subject 2> Old_Narrator near (!Bob) and mail!Anna"
    defs = [d["line"] for d in o["draft"]["defs"]]
    assert defs[0].startswith("<Subject 1> Anna — <Picture 1>, <Picture 2>, <Audio 1>, <Audio 2>: character") and "red coat" in defs[0] and "voice: low voice" in defs[0]
    assert defs[1] == "<Picture 3> — Pine Forest: location" and defs[2].startswith("<Subject 2> Old_Narrator — <Audio 3>: speaker")
    assert [d["line"] for d in o["draft"]["ret"]][-2:] == ["<Picture 3>: partially_preserved", "<Audio 3>: reference"]
    assert "Pine Forest" in o["status"] and "Old Narrator" in o["status"] and "Subject 7" in o["status"] and "не упомянуты: Pine Forest" in o["status"].replace("Anna, ", "")

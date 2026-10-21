"""Stage 5: gaps on the timeline and spans over joins (bridge / prologue / extension into a gap)."""
from h3s import h3s_core as core


def proj(**kw):
    p = {"settings": {"overlap_blocks": 2}, "segments": [{"id": "a", "frames": 124}, {"id": "b", "frames": 124, "link": "cut"},
                                                         {"id": "c", "frames": 124, "gap": 30}]}
    p.update(kw)
    return core.normalize_project(p)


def test_gap_layout_and_continuity():
    p = proj()
    its = core.plan(p)
    assert [(i["start"], i["end"], i["link"], i["gap"]) for i in its] == [(0, 124, "start", 0), (124, 248, "cut", 0), (278, 402, "cut", 30)]
    p2 = core.normalize_project({"segments": [{"id": "a", "frames": 124}, {"id": "b", "frames": 124, "gap": 10}]})
    assert not core.uses_continuity(p2, 1) and core.plan(p2)[1]["overlap"] == 0 and core.plan(p2)[1]["start"] == 134
    assert core.normalize_project({"segments": [{"id": "a", "gap": -5}, {"id": "b", "gap": 10 ** 9}]})["segments"][1]["gap"] == core.MAX_GAP


def test_region_inside_a_shot_is_unchanged():
    p = proj()
    w = core.region_window(p, {"start": 40, "end": 70, "head": -1, "tail": -1})
    assert not w.get("mode") and not w["error"] and w["chain"] == [0, 124]


def test_bridge_over_a_cut_has_both_contexts():
    p = proj()
    w = core.region_window(p, {"start": 110, "end": 140, "head": -1, "tail": -1})
    assert w["mode"] == "bridge" and not w["error"]
    assert w["ws"] < w["a"] <= 110 and w["b"] >= 140 and w["head_blocks"] == 2 and w["tail_blocks"] == 2 and not w["to_end"]
    assert (w["frames"] - 5) % 17 == 0 and (w["a"] - w["ws"]) % 17 == 0 and w["we"] - w["b"] == 17 * 2 + 5
    assert w["ws"] >= 0 and w["we"] <= 248 and w["segs"] == [0, 1]


def test_gap_fill_prologue_and_extension():
    p = proj()
    fill = core.region_window(p, {"start": 240, "end": 290, "head": -1, "tail": -1})   # B tail -> gap -> C head
    assert fill["mode"] == "bridge" and not fill["error"] and fill["head_blocks"] > 0 and fill["tail_blocks"] > 0
    assert fill["gaps"] == [[2, 30]] and fill["ws"] >= 124 and fill["we"] <= 402
    pro = core.region_window(p, {"start": 250, "end": 290, "head": -1, "tail": -1})    # starts in the gap: tail only
    assert pro["head_blocks"] == 0 and pro["tail_blocks"] > 0 and not pro["error"]
    ext = core.region_window(p, {"start": 200, "end": 270, "head": -1, "tail": -1})    # ends in the gap: head only
    assert ext["head_blocks"] > 0 and ext["to_end"] and not ext["error"]
    k1 = core.region_key(p, {"id": "r", "start": 240, "end": 290}, fill, ["k0", "k1", "k2"])
    p2 = proj(); p2["segments"][2]["gap"] = 47
    w2 = core.region_window(p2, {"start": 240, "end": 290, "head": -1, "tail": -1})
    assert core.region_key(p2, {"id": "r", "start": 240, "end": 290}, w2, ["k0", "k1", "k2"]) != k1   # gap is in the key


def test_span_kinds():
    p = proj()
    kind = lambda a, b: core.span_kind(core.region_window(p, {"start": a, "end": b, "head": -1, "tail": -1}))
    assert (kind(40, 70), kind(240, 290), kind(250, 290), kind(200, 270)) == ("region", "bridge", "prologue", "extension")


def test_span_seams_level_lock_both_sides():
    import torch
    from h3s import h3s_seams
    g = torch.Generator().manual_seed(0)
    base = torch.rand(1, 32, 48, 3, generator=g) * 0.3 + 0.3
    fr = torch.cat([base + 0.004 * k for k in range(60)])                      # slow drift (motion)
    fr[20:40] += 0.12                                                           # the regenerated span came out brighter
    raw = h3s_seams.span_seams(fr.clone(), 20, 40, 0)
    assert set(raw) == {"head", "tail"} and raw["head"]["verdict"] == "hard" and "raw" not in raw["head"]
    lk = h3s_seams.span_seams(fr, 20, 40, 12)
    for sd in ("head", "tail"):
        assert lk[sd]["raw"]["verdict"] == "hard" and lk[sd]["ratio"] < raw[sd]["ratio"] and lk[sd]["level"]
    assert h3s_seams.span_seams(fr, 20, 40, 12, head=False).keys() == {"tail"}


def test_bridge_past_the_end_is_an_error():
    w = core.region_window(proj(), {"start": 390, "end": 460, "head": -1, "tail": -1})
    assert w["error"]


def test_bridge_e2e_over_a_gap_with_the_tiny_model(tmp_path, monkeypatch):
    """A span from the end of shot A over a 17-frame gap into shot B, on the tiny H3 model: only [a, b) changes,
    the head / tail latents stay the encoded stitched source, the take is cached and re-applied."""
    import os
    import sys
    import numpy as np
    import torch
    from PIL import Image
    import folder_paths
    from h3s import h3s_gen as gen
    from h3s import h3s_region as region
    sys.path.insert(0, os.path.dirname(__file__))
    from fakes import tiny_patcher, FakeClip, FakeVAE, FakeAudioVAE
    out, inp = tmp_path / "out", tmp_path / "in"
    (inp / "h3zerostudio").mkdir(parents=True); out.mkdir()
    folder_paths.set_output_directory(str(out)); folder_paths.set_input_directory(str(inp))
    Image.fromarray((np.random.rand(80, 64, 3) * 255).astype("uint8")).save(inp / "h3zerostudio" / "hero.png")

    def project(**kw):
        p = {"id": "br", "settings": {"prompt": "global", "res_mode": "custom", "width": 96, "height": 64, "steps": 2, "cfg": 1.0,
                                      "sampler": "euler", "scheduler": "simple", "overlap_blocks": 1},
             "assets": [{"id": "a1", "file": "hero.png", "subfolder": "h3zerostudio", "category": "character"}],
             "segments": [{"id": "s1", "frames": 56, "prompt": "one"}, {"id": "s2", "frames": 56, "prompt": "two", "gap": 17}]}
        p.update(kw)
        return p
    pt, vae, avae = tiny_patcher(), FakeVAE(), FakeAudioVAE()
    img0, au0, _, _ = gen.run_project(pt, FakeClip(), vae, project(), avae)
    assert img0.shape[0] == 129 and float(img0[56:73].abs().max()) == 0.0          # the gap is black
    sr = au0["sample_rate"]
    assert float(au0["waveform"][..., int(57 / 24 * sr):int(72 / 24 * sr)].abs().max()) == 0.0   # and silent
    rg = {"id": "b1", "start": 50, "end": 80, "prompt": "bridge", "seed": 2}
    seen = []
    orig = region.bridge_source
    monkeypatch.setattr(region, "bridge_source", lambda *a, **k: seen.append(orig(*a, **k)) or seen[-1])
    clip = FakeClip()
    img1, au1, _, info = gen.run_project(pt, clip, vae, project(regions=[rg], run={"region": "b1"}), avae)
    r = info["regions"][0]
    assert (r["ws"], r["a"], r["b"], r["we"]) == (17, 34, 85, 107) and r["generated"]
    assert r["mode"] == "bridge" and set(r["seams"]) == {"head", "tail"}               # both seams rated
    assert r["seams"]["head"]["at"] == 34 and r["seams"]["tail"]["at"] == 85 and r["seams"]["head"]["verdict"] in ("ok", "soft", "hard")
    assert [c[0] for c in clip.calls] == ["global\nbridge"]                         # clips cached: one span pass
    near = lambda a, b, tol=6 / 255: a.shape == b.shape and float((a - b).abs().max()) <= tol   # cached clips come from masters
    L = core.level_lock_frames(core.normalize_project(project()))                   # level lock on both seams touches ±L frames
    assert near(img1[:34 - L], img0[:34 - L]) and near(img1[85 + L:], img0[85 + L:])
    assert float(img1[56:73].abs().max()) > 0.0                                      # the gap got picture
    win = core.region_window(core.normalize_project(project(regions=[rg])), rg)
    sv = seen[0][0]
    assert sv.shape[2] == core.latent_t(90)
    rd = torch.load(os.path.join(str(out), "h3zerostudio", "br", "cache", f"region_{r['key']}.pt"))
    hv = 5 * win["head_blocks"]
    assert torch.allclose(rd["v"][:, :, :hv], sv[:, :, :hv], atol=1e-3), "head context = encoded shot A"
    assert torch.allclose(rd["v"][:, :, -5 * win["tail_blocks"] - 2:], sv[:, :, -5 * win["tail_blocks"] - 2:], atol=1e-3), "tail = shot B"
    assert au1["waveform"].shape == au0["waveform"].shape
    # the take is applied from the cache by a later run (no sampling)
    clip2 = FakeClip()
    p2 = project(regions=[dict(rg, takes=[{"id": "t1", "key": r["key"]}], active_take="t1")])
    img2, _, _, info2 = gen.run_project(pt, clip2, vae, p2, avae)
    assert clip2.calls == [] and info2["regions"][0]["cached"] and near(img2, img1)
    # a different gap makes the take stale (not applied)
    p3 = project(regions=[dict(rg, takes=[{"id": "t1", "key": r["key"]}], active_take="t1")]); p3["segments"][1]["gap"] = 34
    _, _, _, info3 = gen.run_project(pt, FakeClip(), vae, p3, avae)
    assert info3["regions"] == []

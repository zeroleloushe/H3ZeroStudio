"""«✂ Участок»: middle regeneration with clean head/tail context (native H3 per-modality noise mask)."""
import copy
import math
import os

import numpy as np
import pytest
import torch
from PIL import Image

import folder_paths
from h3s import h3s_core as core
from h3s import h3s_gen as gen
from h3s import h3s_region as region
from fakes import tiny_patcher, FakeClip, FakeVAE, FakeAudioVAE


@pytest.fixture(scope="module")
def patcher():
    return tiny_patcher()


@pytest.fixture()
def dirs(tmp_path):
    out, inp = tmp_path / "out", tmp_path / "in"
    (inp / "h3zerostudio").mkdir(parents=True)
    out.mkdir()
    folder_paths.set_output_directory(str(out))
    folder_paths.set_input_directory(str(inp))
    Image.fromarray((np.random.rand(80, 64, 3) * 255).astype("uint8")).save(inp / "h3zerostudio" / "hero.png")
    return out, inp


def project(**kw):
    p = {"id": "rg", "settings": {"prompt": "global", "res_mode": "custom", "width": 96, "height": 64, "steps": 2, "cfg": 1.0,
                                  "sampler": "euler", "scheduler": "simple", "overlap_blocks": 1,
                                  "level_lock": False},   # frame-exact context checks (level lock at span seams: test_bridge)
         "assets": [{"id": "a1", "file": "hero.png", "subfolder": "h3zerostudio", "category": "character"}],
         "segments": [{"id": "s1", "frames": 39, "prompt": "one"}, {"id": "s2", "frames": 56, "prompt": "two"}]}
    p.update(kw)
    return p


def test_region_window_snaps_to_the_scene_grid():
    p = core.normalize_project(project(segments=[{"frames": 124}, {"frames": 124}, {"frames": 90, "link": "cut"}]))
    it = core.plan(p)
    assert core.scene_chains(it) == [(0, 226, 0, 1), (226, 316, 2, 2)]
    w = core.region_window(p, {"start": 50, "end": 80, "head": -1, "tail": -1})
    assert (w["a"], w["b"]) == (51, 85) and w["head"] == 17 and w["tail"] == 22
    assert w["ws"] == 34 and w["we"] == 107 and (w["frames"] - 5) % 17 == 0 and w["lat0"] == 10
    assert w["segs"] == [0, 1] and not w["error"]   # clip 2 overlap starts at 102
    w2 = core.region_window(p, {"start": 100, "end": 160, "head": 2, "tail": 0})   # across the extend seam: fine
    assert w2["segs"] == [0, 1] and w2["head"] == 34 and w2["tail"] == 5
    wb = core.region_window(p, {"start": 200, "end": 260, "head": -1, "tail": -1})   # crossing a cut: a bridge (stage 5)
    assert wb["mode"] == "bridge" and not wb["error"] and wb["a"] <= 200 and wb["b"] >= 260
    w3 = core.region_window(p, {"start": 3, "end": 30, "head": 2, "tail": 1})
    assert w3["ws"] == 0 and w3["head"] == 0 and w3["warnings"]
    w4 = core.region_window(p, {"start": 260, "end": 316, "head": 1, "tail": 1})    # to the scene end: no tail
    assert w4["to_end"] and w4["we"] == 316 and w4["tail"] == 0 and (w4["frames"] - 5) % 17 == 0


def _near(a, b, tol=6 / 255):
    """Cached clips come from their take master (H.264 4:4:4 crf 12), fresh ones from the VAE."""
    return a.shape == b.shape and float((a - b).abs().max()) <= tol


def test_region_regenerates_only_the_range_with_clean_context(patcher, dirs):
    out, _ = dirs
    vae, avae = FakeVAE(), FakeAudioVAE()
    img0, au0, lat0, _ = gen.run_project(patcher, FakeClip(), vae, project(), avae)
    v0, a0 = lat0["samples"].unbind()
    rg = {"id": "r1", "start": 20, "end": 40, "prompt": "she waves", "refs": ["a1"], "seed": 5}
    p = project(regions=[rg], run={"region": "r1"})
    clip = FakeClip()
    img1, au1, _, info = gen.run_project(patcher, clip, vae, p, avae)
    assert [c[0] for c in clip.calls] == ["global\nshe waves"] and clip.calls[0][1] == ["image"]   # cached clips, one region pass
    r = info["regions"][0]
    assert (r["ws"], r["a"], r["b"], r["we"]) == (0, 17, 34, 56) and r["generated"] and not r["cached"]
    assert _near(img1[:17], img0[:17]) and _near(img1[34:], img0[34:])
    assert not _near(img1[17:34], img0[17:34])
    rd = torch.load(os.path.join(str(out), "h3zerostudio", "rg", "cache", f"region_{r['key']}.pt"))
    rv, ra = rd["v"], rd["a"]
    assert rv.shape[2] == core.latent_t(56) == 17
    assert torch.allclose(rv[:, :, :5], v0[:, :, :5], atol=1e-3), "head context kept clean"
    assert torch.allclose(rv[:, :, 10:17], v0[:, :, 10:17], atol=1e-3), "tail context kept clean"
    assert not torch.allclose(rv[:, :, 5:10], v0[:, :, 5:10], atol=1e-2)
    ha, ta = round(17 / 24 * 40), round(34 / 24 * 40)
    assert torch.allclose(ra[..., :ha], a0[..., :ha], atol=1e-3) and torch.allclose(ra[..., ta:], a0[..., ta:ra.shape[-1]], atol=1e-3)
    assert au1["waveform"].shape == au0["waveform"].shape
    assert info["full"]["key"]
    # gallery: the region is an entry stacked with the segment it was cut from; deleting it removes its files
    from h3s import h3s_library as lib
    ge = next(e for e in lib.gallery_list("rg") if e["kind"] == "region")
    assert ge["id"] == f"reg_{r['key']}" and ge["seg_id"] == p["segments"][0]["id"] and ge["seg_index"] == 0 and ge["region_id"] == "r1"
    assert ge["prompt"] == "she waves" and ge["video"]["filename"] == f"seg_r{r['key']}.mp4"
    gd = os.path.join(str(out), "h3zerostudio", "rg")
    assert os.path.isfile(os.path.join(gd, ge["video"]["filename"]))
    import shutil
    shutil.copy(os.path.join(gd, "cache", f"region_{r['key']}.pt"), os.path.join(gd, "keep.pt"))
    assert lib.gallery_delete("rg", ge["id"]) >= 2
    assert not os.path.isfile(os.path.join(gd, ge["video"]["filename"])) and not os.path.isfile(os.path.join(gd, "cache", f"region_{r['key']}.pt"))
    assert ge["id"] not in {e["id"] for e in lib.gallery_list("rg")}
    shutil.move(os.path.join(gd, "keep.pt"), os.path.join(gd, "cache", f"region_{r['key']}.pt"))   # the rest of the test uses the cache
    # the chosen take is applied from the cache by later runs (no sampling); a changed clip makes it stale
    p2 = project(regions=[dict(rg, takes=[{"id": "t1", "key": r["key"]}], active_take="t1")])
    clip2 = FakeClip()
    img2, _, _, info2 = gen.run_project(patcher, clip2, vae, p2, avae)
    assert clip2.calls == [] and torch.equal(img2, img1) and info2["regions"][0]["cached"]
    p3 = copy.deepcopy(p2)
    p3["regions"][0]["active_take"] = None                  # «Оригинал»
    img3, _, _, info3 = gen.run_project(patcher, FakeClip(), vae, p3, avae)
    assert _near(img3, img0) and info3["regions"] == []
    p4 = copy.deepcopy(p2)
    p4["segments"][0]["prompt"] = "one changed"
    _, _, _, info4 = gen.run_project(patcher, FakeClip(), vae, p4, avae)
    assert info4["regions"] == [], "stale take is not applied"


def test_region_two_stage_and_footage(patcher, dirs, monkeypatch):
    out, inp = dirs
    calls = []
    real = region.sample_region

    def spy(*a, **k):
        calls.append((a[8], k.get("refine") is not None, tuple(a[6].shape[-2:])))
        return real(*a, **k)
    monkeypatch.setattr(region, "sample_region", spy)
    p = project(settings=dict(project()["settings"], width=192, height=128, final_mode="refine", refine_sigma=0.4),
                regions=[{"id": "r1", "start": 20, "end": 40, "seed": 3}], run={"region": "r1"})
    img, _, _, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    assert calls == [("draft", False, (4, 6)), ("refine", True, (8, 12))]
    assert info["regions"][0]["kind"] == "refine" and img.shape[1:] == (128, 192, 3)
    # footage: a video asset on the timeline, regenerated in its middle
    import av
    path = inp / "h3zerostudio" / "clip.mp4"
    with av.open(str(path), "w") as c:
        st = c.add_stream("libx264", rate=24)
        st.width, st.height, st.pix_fmt = 96, 64, "yuv420p"
        for k in range(90):
            fr = av.VideoFrame.from_ndarray((np.ones((64, 96, 3)) * (k * 2 % 255)).astype("uint8"), format="rgb24")
            for pk in st.encode(fr):
                c.mux(pk)
        for pk in st.encode():
            c.mux(pk)
    calls.clear()
    pf = project(assets=project()["assets"] + [{"id": "v1", "file": "clip.mp4", "subfolder": "h3zerostudio", "category": "video", "frames": 90}],
                 segments=[{"id": "f", "frames": 73, "source": {"asset": "v1", "in": 0}}],
                 regions=[{"id": "r2", "start": 30, "end": 50, "seed": 1}], run={"region": "r2"})
    img0, _, _, _ = gen.run_project(patcher, FakeClip(), FakeVAE(), dict(pf, regions=[], run={}))
    img1, _, _, info = gen.run_project(patcher, FakeClip(), FakeVAE(), pf)
    r = info["regions"][0]
    assert calls and calls[0][0] == "full" and (r["a"], r["b"]) == (34, 51)
    assert _near(img1[:34], img0[:34]) and _near(img1[51:], img0[51:])


def test_splice_audio_is_sample_exact_on_both_seams():
    sr, fps = 8000, 24
    n = int(5 * sr)
    t = torch.arange(n) / sr
    g_ = torch.Generator().manual_seed(1)
    outw = (0.2 * torch.randn(n, generator=g_) * (0.6 + 0.4 * torch.sin(2 * math.pi * 1.3 * t)))[None].repeat(2, 1)   # broadband: one clear lag
    win = {"ws": 24, "a": 41, "b": 75, "we": 97, "to_end": False}
    s_ws, s_we = round(24 / fps * sr), round(97 / fps * sr)
    lag = 37                                       # the decoded window sits 37 samples late (latent grid)
    w = torch.zeros(2, s_we - s_ws + 400)
    w[:, lag:] = outw[:, s_ws:s_ws + w.shape[-1] - lag] * 0.5      # level differs (not normalized)
    mid0, mid1 = round(41 / fps * sr) - s_ws + lag, round(75 / fps * sr) - s_ws + lag
    w[:, mid0:mid1] = 0.2 * torch.randn(2, mid1 - mid0)             # new sound in the range
    info = {}
    res = region.splice_audio(outw.clone(), sr, w, win, fps, info)
    assert info["lag_ms"] == pytest.approx(-lag / sr * 1000, abs=0.2) and info["gain"] == pytest.approx(2.0, rel=0.02)
    assert torch.equal(res[:, :s_ws], outw[:, :s_ws]) and torch.equal(res[:, s_we:], outw[:, s_we:])
    a, b = round(41 / fps * sr), round(75 / fps * sr)
    assert torch.allclose(res[:, a:b], w[:, a - s_ws + lag:b - s_ws + lag] * info["gain"], atol=1e-5)   # w[k] -> s_ws - lag + k
    # no level hole at the seams: kept sound continues with the same envelope
    for x in (round(info["head_at_s"] * sr), round(info["tail_at_s"] * sr)):
        seg = res[0, x - 200:x + 360]
        ref = outw[0, x - 200:x + 360]
        if x < a:
            assert float((seg - ref).abs().max()) < 0.02

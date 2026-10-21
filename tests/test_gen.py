import math
import os

import numpy as np
import pytest
import torch
from PIL import Image

import folder_paths
from h3s import h3s_core as core
from h3s import h3s_gen as gen
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
    Image.fromarray((np.random.rand(64, 96, 3) * 255).astype("uint8")).save(inp / "h3zerostudio" / "city.png")
    return out, inp


def project(**kw):
    p = {
        "id": "t1",
        "settings": {"prompt": "global", "res_mode": "custom", "width": 96, "height": 64, "steps": 2, "cfg": 1.0,
                     "sampler": "euler", "scheduler": "simple", "overlap_blocks": 1},
        "assets": [{"id": "a1", "file": "hero.png", "subfolder": "h3zerostudio", "category": "character"},
                   {"id": "a2", "file": "city.png", "subfolder": "h3zerostudio", "category": "location"}],
        "segments": [{"id": "s1", "frames": 39, "prompt": "one", "refs": ["a2", "a1"]},
                     {"id": "s2", "frames": 56, "prompt": "two", "refs": ["a1"]}],
    }
    p.update(kw)
    return p


def test_two_segments_extend_and_cache(patcher, dirs):
    out, _ = dirs
    clip, vae = FakeClip(), FakeVAE()
    events = []
    images, audio, latent, info = gen.run_project(patcher, clip, vae, project(), node_id="7")
    proj = core.normalize_project(project())
    it = core.plan(proj)
    assert images.shape[0] == it[-1]["end"] == 39 + 56 - 22
    assert images.shape[1:] == (64, 96, 3)
    v, a = latent["samples"].unbind()
    assert v.shape[2] == core.latent_t(39) + core.latent_t(56) - core.latent_t(22)
    assert (v.shape[2] - 2) % 5 == 0, "extended chain keeps a valid 5k+2 latent"
    # segment 2 conditioning: refs + last frame of segment 1, continuity phrase
    texts = [t for t, _ in clip.calls]
    assert texts[0] == "global\none"
    assert texts[1].startswith("global\ntwo\nContinuity: <Picture 2>")
    assert clip.calls[0][1] == ["image", "image"] and clip.calls[1][1] == ["image", "image"]
    # overlap locked: segment 2 starts with segment 1's tail
    d = os.path.join(str(out), "h3zerostudio", "t1", "cache")
    k1, k2 = info["keys"]
    sq = info["segments"][1].get("seam")   # seam rating of the extend join (video + stitched audio)
    assert sq and sq["verdict"] in ("ok", "soft", "hard") and sq["ratio"] >= 0
    s1 = torch.load(os.path.join(d, f"seg_{k1}.pt"))
    s2 = torch.load(os.path.join(d, f"seg_{k2}.pt"))
    assert torch.allclose(s2["v"][:, :, :7], s1["v"][:, :, -7:], atol=1e-4)
    for r in info["segments"]:
        assert os.path.isfile(os.path.join(str(out), r["video"]["subfolder"], r["video"]["filename"]))
        assert os.path.isfile(os.path.join(str(out), r["strip"]["subfolder"], r["strip"]["filename"]))
    assert os.path.isfile(os.path.join(str(out), info["full"]["video"]["subfolder"], info["full"]["video"]["filename"]))
    # second run: everything cached, no sampling
    clip2 = FakeClip()
    _, _, latent2, info2 = gen.run_project(patcher, clip2, vae, project())
    assert all(r["cached"] for r in info2["segments"]) and clip2.calls == []
    assert torch.equal(latent2["samples"].unbind()[0], v)
    # change segment 2 only -> segment 1 stays cached
    p = project()
    p["segments"][1]["prompt"] = "two changed"
    clip3 = FakeClip()
    _, _, _, info3 = gen.run_project(patcher, clip3, vae, p)
    assert [r["cached"] for r in info3["segments"]] == [True, False]
    # change segment 1 -> segment 2 invalidated too (continuity chain)
    p["segments"][0]["prompt"] = "one changed"
    _, _, _, info4 = gen.run_project(patcher, FakeClip(), vae, p)
    assert [r["cached"] for r in info4["segments"]] == [False, False]


def test_cut_segment_has_no_continuity(patcher, dirs):
    p = project(id="t2")
    p["segments"][1]["link"] = "cut"
    clip = FakeClip()
    images, _, latent, info = gen.run_project(patcher, clip, FakeVAE(), p)
    assert images.shape[0] == 39 + 56
    assert "Continuity" not in clip.calls[1][0] and clip.calls[1][1] == ["image"]


def test_audio_locked_and_output(patcher, dirs):
    p = project(id="t3", audio={"mode": "locked", "offset": 0.0})
    sr = 8000
    audio = {"waveform": torch.randn(1, 2, sr * 5) * 0.1, "sample_rate": sr}
    images, out_audio, latent, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), audio)
    v, a = latent["samples"].unbind()
    assert a.shape[-1] >= core.audio_len(images.shape[0]) - 2
    assert out_audio["sample_rate"] == 8000 and out_audio["waveform"].shape[1] == 2


def test_audio_reference_adds_audio_item(patcher, dirs):
    from h3s import h3s_media as media
    _, inp = dirs
    media.write_wav(str(inp / "h3zerostudio" / "voice.wav"), np.sin(np.linspace(0, 500, 8000 * 2))[None] * 0.3, 8000, 8000)
    p = project(id="t4")
    p["assets"].append({"id": "v1", "file": "voice.wav", "subfolder": "h3zerostudio", "category": "audio"})
    p["segments"][0]["refs"] += ["input", "v1"]      # node input + an audio asset as <Audio 1>, <Audio 2>
    p["segments"][1]["refs"] += ["v1"]
    clip = FakeClip()
    audio = {"waveform": torch.randn(1, 1, 8000 * 5) * 0.1, "sample_rate": 8000}
    _, _, _, info = gen.run_project(patcher, clip, FakeVAE(), p, FakeAudioVAE(), audio)
    assert clip.calls[0][1] == ["image", "image", "audio", "audio"]
    assert "Use <Audio 1>, <Audio 2> as the sound reference" in clip.calls[0][0]
    assert clip.calls[1][1][-1] == "audio" and "<Audio 1>" in clip.calls[1][0]
    # the images keep their <Picture N> numbers, audio assets are not pictures
    assert [a["id"] for a in core.ordered_refs(core.normalize_project(p), p["segments"][0])] == ["a1", "a2"]
    # changing the referenced file invalidates only the segments that use it... (both here)
    media.write_wav(str(inp / "h3zerostudio" / "voice.wav"), np.sin(np.linspace(0, 900, 8000 * 2))[None] * 0.3, 8000, 8000)
    _, _, _, info2 = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), audio)
    assert info2["keys"] != info["keys"]


def test_too_many_refs_errors(patcher, dirs):
    p = project(id="t5")
    p["assets"] = [{"id": f"x{i}", "file": "hero.png", "subfolder": "h3zerostudio", "category": "other"} for i in range(9)]
    p["segments"][1]["refs"] = [f"x{i}" for i in range(9)]
    with pytest.raises(ValueError, match="максимум"):
        gen.run_project(patcher, FakeClip(), FakeVAE(), p)


def test_empty_project_errors(patcher, dirs):
    with pytest.raises(ValueError, match="нет отрезков"):
        gen.run_project(patcher, FakeClip(), FakeVAE(), "")


def test_interrupt(patcher, dirs):
    import comfy.model_management as mm
    mm.interrupt_current_processing(True)
    try:
        with pytest.raises(mm.InterruptProcessingException):
            gen.run_project(patcher, FakeClip(), FakeVAE(), project(id="t6"))
    finally:
        mm.interrupt_current_processing(False)


def test_takes_switch_back_reuses_cache(patcher, dirs):
    out, _ = dirs
    vae = FakeVAE()
    _, _, lat1, info1 = gen.run_project(patcher, FakeClip(), vae, project(id="tk"))
    p = project(id="tk")
    p["segments"][1]["overrides"] = {"seed": 99}           # "new take" of segment 2
    _, _, lat2, info2 = gen.run_project(patcher, FakeClip(), vae, p)
    assert [r["cached"] for r in info2["segments"]] == [True, False]
    assert info2["segments"][1]["seed"] == 99 and info2["keys"][1] != info1["keys"][1]
    # choosing the first take again (its snapshot has no seed override) -> both segments from cache
    clip = FakeClip()
    _, _, lat3, info3 = gen.run_project(patcher, clip, vae, project(id="tk"))
    assert clip.calls == [] and info3["keys"] == info1["keys"]
    assert torch.equal(lat3["samples"].unbind()[0], lat1["samples"].unbind()[0])
    cache = os.path.join(str(out), "h3zerostudio", "tk", "cache")
    for k in info1["keys"] + info2["keys"]:
        assert os.path.isfile(os.path.join(cache, f"seg_{k}.pt")), "all takes stay in the cache"


def test_run_upto_regenerates_only_first_segments(patcher, dirs):
    p = project(id="up", run={"upto": 0})
    clip = FakeClip()
    images, _, _, info = gen.run_project(patcher, clip, FakeVAE(), p)
    assert len(clip.calls) == 1 and len(info["segments"]) == 1
    assert images.shape[0] == 39 and info["full"]["partial"] and info["full"]["count"] == 1
    clip2 = FakeClip()
    _, _, _, info2 = gen.run_project(patcher, clip2, FakeVAE(), project(id="up"))
    assert [r["cached"] for r in info2["segments"]] == [True, False] and not info2["full"]["partial"]


def test_markers_reach_the_prompt(patcher, dirs):
    p = project(id="mk", markers=[
        {"frame": 3, "effect": "boost", "asset": "a1"},
        {"frame": 60, "effect": "prompt", "text": "she waves"},
        {"frame": 50, "effect": "note", "text": "ignored"}])
    clip = FakeClip()
    gen.run_project(patcher, clip, FakeVAE(), p)
    t1, t2 = clip.calls[0][0], clip.calls[1][0]
    assert "Strictly preserve the identity of <Picture 1>" in t1     # a1 is the character -> <Picture 1>
    assert "At 1.8s: she waves" in t2 and "ignored" not in t2        # 60 - start 17 = 43 frames
    assert core.compose_prompt(core.normalize_project(p), 1) == t2


def test_timeline_audio_window():
    sr = 8000
    audio = {"waveform": torch.ones(1, 2, sr * 2), "sample_rate": sr}
    p = core.normalize_project({"audio": {"mode": "locked", "start": 1.0, "in": 0.5, "length": 1.0}, "segments": [{"frames": 95}]})
    tl, cov = gen.timeline_audio(audio, p, 95)
    wf = tl["waveform"]
    assert wf.shape[-1] == round(95 / 24 * sr)
    assert wf[..., :sr].abs().sum() == 0 and wf[..., sr:2 * sr].min() == 1 and wf[..., 2 * sr:].abs().sum() == 0
    assert cov.shape[0] == core.audio_len(95)
    assert cov[:40].sum() == 0 and cov[40:80].min() == 1 and cov[80:].sum() == 0
    # in-point near the end: clip shortened to what the source has
    p2 = core.normalize_project({"audio": {"mode": "locked", "start": 0, "in": 1.5}, "segments": [{"frames": 95}]})
    _, cov2 = gen.timeline_audio(audio, p2, 95)
    assert int(cov2.sum()) == 20
    # split clip: two pieces of a ramp source, the second one moved later
    ramp = {"waveform": torch.arange(sr * 4, dtype=torch.float32)[None, None].repeat(1, 2, 1) + 1, "sample_rate": sr}
    p3 = core.normalize_project({"audio": {"clips": [{"start": 0, "in": 0, "length": 1}, {"start": 2, "in": 1, "length": 1, "lane": 1}]},
                                 "segments": [{"frames": 95}]})
    tl3, cov3 = gen.timeline_audio(ramp, p3, 95)
    w3 = tl3["waveform"][0, 0]
    assert w3[0] == 1 and w3[sr - 1] == sr and w3[sr:2 * sr].abs().sum() == 0 and w3[2 * sr] == sr + 1
    assert cov3[:40].min() == 1 and cov3[40:80].sum() == 0 and cov3[80:120].min() == 1


def test_audio_file_source_locked(patcher, dirs):
    from h3s import h3s_media as media
    _, inp = dirs
    sr = 22050
    media.write_wav(str(inp / "h3zerostudio" / "song.wav"), np.sin(np.linspace(0, 900, sr * 3))[None] * 0.5, sr, sr)
    ref = {"filename": "song.wav", "subfolder": "h3zerostudio", "type": "input"}
    p = project(id="af", audio={"mode": "locked", "source": "file", "file": ref, "start": 0.5, "length": 2.0})
    images, out_audio, latent, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), None)
    assert info["audio_source"] is None and images.shape[0] == 73
    pk = media.audio_peaks(str(inp / "h3zerostudio" / "song.wav"), 100)
    assert len(pk["peaks"]) == 100 and abs(pk["duration"] - 3.0) < 0.01 and pk["sample_rate"] == sr
    assert max(x[1] for x in pk["peaks"]) > 0.4
    # missing file -> clear error
    p["audio"]["file"] = {"filename": "nope.wav", "subfolder": "h3zerostudio", "type": "input"}
    with pytest.raises(FileNotFoundError):
        gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), None)


def test_input_audio_writes_waveform_source(patcher, dirs):
    out, _ = dirs
    audio = {"waveform": torch.randn(1, 2, 8000 * 4) * 0.1, "sample_rate": 8000}
    _, _, _, info = gen.run_project(patcher, FakeClip(), FakeVAE(), project(id="ai", audio={"mode": "reference"}),
                                    FakeAudioVAE(), audio)
    src = info["audio_source"]
    assert src and abs(src["duration"] - 4.0) < 1e-3
    assert os.path.isfile(os.path.join(str(out), src["subfolder"], src["filename"]))


def test_thumbnail_sprite(tmp_path):
    from h3s import h3s_media as media
    frames = torch.rand(56, 64, 96, 3)
    path = str(tmp_path / "s.jpg")
    media.write_strip(path, frames, count=24, height=72)
    with Image.open(path) as im:
        assert im.size == (24 * 108, 72)
    media.write_strip(path, frames[:5], count=24, height=72)
    with Image.open(path) as im:
        assert im.size == (5 * 108, 72)


def test_live_preview_events(patcher, dirs, monkeypatch):
    events = []

    class Rec:
        def __init__(self, node_id):
            pass

        def __call__(self, event, **d):
            events.append((event, d))

    monkeypatch.setattr(gen, "Notifier", Rec)
    monkeypatch.setattr(gen, "LIVE_MIN_INTERVAL", 0)
    gen.run_project(patcher, FakeClip(), FakeVAE(), project(id="lv"))
    live = [d for e, d in events if e == "live"]
    assert len(live) == 4                                     # 2 segments x 2 steps
    first = live[0]
    assert first["seg"] == 0 and first["steps"] == 2 and first["img"].startswith("data:image/jpeg;base64,")
    assert first["n"] == core.latent_t(39) and sum(first["dur"]) == 39
    assert sum(live[-1]["dur"]) == 56 and live[-1]["seg"] == 1
    names = [e for e, _ in events]
    assert names.index("seg_done") < [i for i, e in enumerate(names) if e == "live"][2], "segment 1 is shown before segment 2 samples"


def test_live_preview_subsamples_long_latents():
    lp = gen.LivePreview(lambda *a, **k: None, None, 0, max_frames=8, settings={"preview_tiny_vae": "none"})
    import comfy.nested_tensor
    x0 = comfy.nested_tensor.NestedTensor((torch.randn(1, 24, 37, 4, 6), torch.randn(1, 32, 2, 207)))
    rgb, dur = lp.frames(x0)
    assert rgb.shape == (8, 4, 6, 3) and sum(dur) == core.frames_for_latent(37) == 124


def _tone(n, sr, amp, f=220.0, skip=0):
    t = (torch.arange(n, dtype=torch.float32) + skip) / sr
    return (torch.sin(2 * math.pi * f * t) * amp)[None].repeat(2, 1)


def test_stitch_audio_crossfade_and_loudness_match():
    sr, fps = 8000, 24
    items = core.plan(core.normalize_project({"segments": [{"frames": 124}, {"frames": 124}]}))
    ov = items[1]["overlap"]
    n = int(124 / fps * sr)
    seam = int(round(items[1]["start"] / fps * sr))
    # same (phase-aligned, as the overlap is locked) sound, next segment 4x quieter (12 dB)
    w1, w2 = _tone(n, sr, 0.8), _tone(n, sr, 0.2, skip=seam)
    win = lambda x, a, b: float(torch.sqrt(torch.mean(x[:, a:b] ** 2)))
    # old behaviour: hard cut at the overlap end -> level jump
    hard, _ = gen.stitch_audio([w1, w2], sr, items, fps, xfade=0.0, match=False)
    end_ov = seam + int(round(ov / fps * sr))
    assert win(hard, end_ov - 400, end_ov) / win(hard, end_ov, end_ov + 400) > 3.5
    # matched + crossfaded: level right after the seam is the previous one (gain limited to 2x -> 0.4 of 0.8)
    out, gains = gen.stitch_audio([w1, w2], sr, items, fps, xfade=0.4, match=True)
    assert out.shape[-1] == int(round(items[-1]["end"] / fps * sr))
    assert gains[1] == pytest.approx(2.0)
    lv = [win(out, a, a + 200) for a in range(seam, end_ov + 2000, 200)]
    assert max(lv) / min(lv) < 2.05 * 1.42, "no jump beyond the limited gain (+3 dB equal-power bump on coherent sound)"
    # gain returns to 1 after the release (2 s): segment's own level again
    assert win(out, out.shape[-1] - 800, out.shape[-1]) == pytest.approx(0.2 / math.sqrt(2), rel=0.05)
    # equal-power: crossfading identical, equally loud material keeps the level
    # equal-power keeps the level of uncorrelated material (noise) through the crossfade
    g = torch.Generator().manual_seed(0)
    n1, n2 = torch.randn(2, n, generator=g) * 0.3, torch.randn(2, n, generator=g) * 0.3
    same, g2 = gen.stitch_audio([n1, n2], sr, items, fps, xfade=0.4, match=True)
    assert g2[1] == pytest.approx(1.0, abs=0.05)
    lv2 = [win(same, a, a + 400) for a in range(seam, end_ov, 400)]
    assert max(lv2) / min(lv2) < 1.15
    # new scene (no overlap): butt join, no gain
    cut_items = core.plan(core.normalize_project({"segments": [{"frames": 124}, {"frames": 124, "link": "cut"}]}))
    c, g3 = gen.stitch_audio([w1, w2], sr, cut_items, fps)
    assert g3 == [1.0, 1.0] and c.shape[-1] == int(round(cut_items[-1]["end"] / fps * sr))


def test_audio_seam_lock_and_locked_mode_skips_stitch(patcher, dirs, monkeypatch):
    calls = []
    real = gen.stitch_audio
    monkeypatch.setattr(gen, "stitch_audio", lambda *a, **k: calls.append(k or a[4:]) or real(*a, **k))
    # audio overlap locked to the previous tail even with the video lock off
    p = project(id="sl")
    p["settings"]["lock_overlap"] = False
    _, out_audio, latent, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), None)
    d = os.path.join(str(dirs[0]), "h3zerostudio", "sl", "cache")
    k1, k2 = info["keys"]
    a1 = torch.load(os.path.join(d, f"seg_{k1}.pt"))["a"]
    a2 = torch.load(os.path.join(d, f"seg_{k2}.pt"))["a"]
    it = core.plan(core.normalize_project(p))
    a_ov = a1.shape[-1] - round((it[0]["frames"] - it[1]["overlap"]) / 24 * 40)
    r = core.AUDIO_HANDOFF_TICKS   # 0: hard boundary (no hand-off ramp)
    assert a_ov > 2 * r and torch.allclose(a2[..., :a_ov - r], a1[..., -a_ov:a1.shape[-1] - r], atol=1e-4)
    assert len(calls) == 1 and out_audio["waveform"].shape[-1] == int(round(it[-1]["end"] / 24 * 8000))
    # switch off -> different key for segment 2 only
    p["settings"]["audio_seam_lock"] = False
    _, _, _, info2 = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), None)
    assert info2["keys"][0] == k1 and info2["keys"][1] != k2
    # seams under a locked track clip: no seam processing there
    calls.clear()
    sr = 8000
    audio = {"waveform": torch.randn(1, 2, sr * 5) * 0.1, "sample_rate": sr}
    gen.run_project(patcher, FakeClip(), FakeVAE(), project(id="lk", audio={"mode": "locked"}), FakeAudioVAE(), audio)
    assert [{k: v for k, v in c.items() if k != "info"} for c in calls] == [{"skip": [False, True], "declick": True}]


def test_video_end_marker_limits_generation(patcher, dirs):
    p = project(id="end", end=60)
    p["segments"].append({"id": "s3", "frames": 56, "prompt": "three"})
    clip = FakeClip()
    images, out_audio, _, info = gen.run_project(patcher, clip, FakeVAE(), p, FakeAudioVAE(), None)
    assert images.shape[0] == 60 and len(info["segments"]) == 2 and len(clip.calls) == 2
    assert out_audio["waveform"].shape[-1] == int(round(60 / 24 * 8000))
    assert info["segments"][1]["frames"] == core.snap_frames(60 - 17, "up")   # shortened to cover the end
    assert info["estimate"]["frames"] == 60


def test_track_clips_from_two_files_are_mixed_and_locked(patcher, dirs):
    from h3s import h3s_media as media
    _, inp = dirs
    media.write_wav(str(inp / "h3zerostudio" / "a.wav"), np.full((1, 8000 * 2), 0.25), 8000, 8000)
    media.write_wav(str(inp / "h3zerostudio" / "b.wav"), np.full((1, 16000 * 2), 0.5), 16000, 16000)
    p = project(id="mix")
    p["assets"] += [{"id": "fa", "file": "a.wav", "subfolder": "h3zerostudio", "category": "audio", "duration": 2},
                    {"id": "fb", "file": "b.wav", "subfolder": "h3zerostudio", "category": "audio"}]
    p["audio"] = {"clips": [{"id": "c1", "asset": "fa", "start": 0, "length": 1},
                            {"id": "c2", "asset": "fb", "start": 0.5, "length": 1, "lane": 1},
                            {"id": "c3", "asset": "nope", "start": 0}]}
    proj = core.normalize_project(p)
    assert [c["id"] for c in proj["audio"]["clips"]] == ["c1", "c2"]
    src = gen.audio_sources(proj)
    tl, cov = gen.timeline_audio(src, proj, 73)
    assert tl["sample_rate"] == 16000
    w = tl["waveform"][0, 0]
    assert abs(float(w[4000]) - 0.25) < 0.01 and abs(float(w[12000]) - 0.75) < 0.02 and abs(float(w[20000]) - 0.5) < 0.01
    assert float(w[30000]) == 0 and cov[:60].min() == 1 and cov[60:].sum() == 0
    _, out_audio, _, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), None)
    assert out_audio["waveform"].shape[-1] > 0
    # no audio_vae: the track is only passed through, keys do not depend on it
    _, out2, _, info2 = gen.run_project(patcher, FakeClip(), FakeVAE(), p, None, None)
    assert out2["sample_rate"] == 16000 and info2["keys"] != info["keys"]


def test_legacy_audio_projects_migrate():
    old = core.normalize_project({"audio": {"mode": "locked", "source": "file", "file": {"filename": "x y.mp3", "subfolder": "h3zerostudio"},
                                            "start": 1, "offset": 2, "duration": 9}})
    a = old["assets"][-1]
    assert a["category"] == "audio" and a["id"] == "au_x_y_mp3" and a["duration"] == 9
    assert old["audio"]["clips"] == [{"id": "a1", "asset": "au_x_y_mp3", "lane": 0, "start": 1.0, "in": 2.0, "length": 0.0, "volume": 1.0, "fade_in": 0.0, "fade_out": 0.0}]
    ref = core.normalize_project({"audio": {"mode": "reference"}})
    assert ref["audio"]["clips"] == [] and "mode" not in ref["audio"]


def test_preview_mp4s_carry_audio(patcher, dirs):
    """The editor's player plays the preview files: segment and full previews must contain the sound."""
    import av
    out, _ = dirs
    _, _, _, info = gen.run_project(patcher, FakeClip(), FakeVAE(), project(id="snd"), FakeAudioVAE(), None)
    for ref in [r["video"] for r in info["segments"]] + [info["full"]["video"]]:
        with av.open(os.path.join(str(out), ref["subfolder"], ref["filename"])) as c:
            kinds = sorted(s.type for s in c.streams)
            assert kinds == ["audio", "video"], (ref["filename"], kinds)
            a = c.streams.audio[0]
            assert a.codec_context.name == "aac" and (a.duration or a.frames or 1) > 0


def _tiny_sd():
    """A miniature taeh3-shaped flat decoder: Clamp, conv(24->8), ReLU, Block, Up, conv, Block, Up, conv(->3)."""
    from comfy.taesd.taesd import Block, Clamp, conv
    torch.manual_seed(0)
    net = torch.nn.Sequential(Clamp(), conv(24, 8), torch.nn.ReLU(), Block(8, 8), torch.nn.Upsample(scale_factor=2),
                              conv(8, 8, bias=False), Block(8, 8), torch.nn.Upsample(scale_factor=2), conv(8, 3))
    with torch.no_grad():   # comfy's ops skip weight init
        for prm in net.parameters():
            prm.copy_(torch.randn_like(prm) * 0.1)
    return net, {k: v.clone() for k, v in net.state_dict().items()}


def test_tiny_vae_decoder_is_rebuilt_from_its_state_dict():
    from h3s import h3s_preview as pv
    ref, sd = _tiny_sd()
    dec = pv.FlatTinyDecoder(sd)
    assert dec.latent_channels == 24 and dec.scale == 4
    z = torch.randn(1, 24, 5, 7)
    assert torch.allclose(dec(z), ref(z), atol=1e-6)


def test_tiny_vae_loader_resolves_auto_and_falls_back(tmp_path, monkeypatch):
    from h3s import h3s_preview as pv
    import safetensors.torch
    d = tmp_path / "vae_approx"; d.mkdir()
    _, sd = _tiny_sd()
    safetensors.torch.save_file(sd, str(d / "taeh3.safetensors"))
    (d / "broken.safetensors").write_bytes(b"nope")
    monkeypatch.setattr(folder_paths, "get_full_path", lambda kind, n: str(d / n) if kind == "vae_approx" and (d / n).is_file() else None)
    monkeypatch.setattr(folder_paths, "get_filename_list", lambda kind: sorted(os.listdir(d)) if kind == "vae_approx" else [])
    assert pv.resolve_tiny_vae("auto").endswith("taeh3.safetensors")
    assert pv.resolve_tiny_vae("none") is None
    assert pv.load_tiny_vae(pv.resolve_tiny_vae("auto")) is not None
    assert pv.load_tiny_vae(pv.resolve_tiny_vae("broken.safetensors")) is None      # unusable -> latent2rgb
    # the live preview uses it: full-resolution frames (x4 here), capped by max_res
    lp = gen.LivePreview(lambda *a, **k: None, None, 0, settings={"preview_frames": 6, "preview_max_res": 0})
    assert lp.dec is not None
    import comfy.nested_tensor
    x0 = comfy.nested_tensor.NestedTensor((torch.randn(1, 24, 12, 4, 6), torch.randn(1, 32, 2, 50)))
    rgb, dur = lp.frames(x0)
    assert rgb.shape == (6, 16, 24, 3) and sum(dur) == core.frames_for_latent(12)
    lp2 = gen.LivePreview(lambda *a, **k: None, None, 0, settings={"preview_max_res": 12, "preview_fps": 12})
    rgb2, dur2 = lp2.frames(x0)
    assert max(rgb2.shape[1:3]) == 12 and set(dur2) == {2.0}
    lp3 = gen.LivePreview(lambda *a, **k: None, None, 0, settings={"preview_tiny_vae": "none"})
    assert lp3.dec is None and lp3.frames(x0)[0].shape[1:3] == (4, 6)


def test_live_preview_dynamics_sigma_delta_and_step_time(patcher, dirs, monkeypatch):
    events = []

    class Rec:
        def __init__(self, node_id): pass
        def __call__(self, e, **d): events.append((e, d))
    monkeypatch.setattr(gen, "Notifier", Rec)
    monkeypatch.setattr(gen, "LIVE_MIN_INTERVAL", 0)
    monkeypatch.setattr(gen, "LIVE_AUDIO_INTERVAL", 0)
    out, _ = dirs
    p = project(id="dyn")
    p["settings"]["steps"] = 3
    p["settings"]["preview_tiny_vae"] = "none"   # latent2rgb even where a real taeh3 is installed
    gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), None)
    sig = [d for e, d in events if e == "sigmas"]
    assert len(sig) == 2 and len(sig[0]["sigmas"]) == 4 and sig[0]["sigmas"][0] > sig[0]["sigmas"][-1]
    steps = [d for e, d in events if e == "step"]
    assert len(steps) == 6
    assert all(s["ms"] >= 0 and s["sigma"] is not None for s in steps)
    assert steps[0]["delta"] is None and all(s["delta"] is not None and s["delta"] >= 0 for s in steps[1:3])
    assert steps[0]["sigma"] == pytest.approx(sig[0]["sigmas"][0])
    live = [d for e, d in events if e == "live"]
    assert live[0]["mode"] == "latent2rgb" and live[0]["cols"] >= 1
    # audio preview: a short WAV next to the project, URL in the event
    aud = [d["audio"] for d in live if d.get("audio")]
    assert aud == []   # the live preview carries no audio


def test_sprite_grid_wraps_large_previews():
    from h3s import h3s_media as media
    uri, tw, th, cols = media.sprite_grid(torch.rand(10, 40, 64, 3), 40, max_side=200)
    assert (tw, th) == (64, 40) and cols == 3
    import base64, io
    im = Image.open(io.BytesIO(base64.b64decode(uri.split(",", 1)[1])))
    assert im.size == (64 * 3, 40 * 4)


def test_verbose_console_log(patcher, dirs, capsys):
    p = project(id="vlog")
    p["settings"]["preview_tiny_vae"] = "none"
    gen.run_project(patcher, FakeClip(), FakeVAE(), p)
    out = capsys.readouterr().out
    lines = [l for l in out.splitlines() if l.startswith("[H3ZS]")]
    text = "\n".join(lines)
    assert "settings: steps 2" in text and "#1: 39 fr" in text
    assert "── segment 2/2" in text and "cache miss" in text
    assert "<Picture 1>=" in text and "prompt:" in text
    steps = [l for l in lines if " step " in l and "seg " in l and "σ=" in l]
    assert len(steps) == 4 and "ETA seg" in steps[0] and "step 2/2" in steps[1]
    assert "seam 1->2: overlap" in text and "stitch:" in text and "finished in" in text
    # second run: cache hits; with the log off only the short lines remain
    p["settings"]["verbose_log"] = False
    gen.run_project(patcher, FakeClip(), FakeVAE(), p)
    out2 = capsys.readouterr().out
    assert "cache HIT" not in out2 and "finished in" in out2 and "σ=" not in out2


def test_generate_only_this_segment_leaves_out_of_date_earlier_segments(patcher, dirs, monkeypatch):
    """«Сгенерировать» on a new-scene segment must not regenerate the stale segments before it."""
    p = project(id="only")
    p["segments"].append({"id": "s3", "frames": 39, "prompt": "three", "refs": [], "link": "cut"})
    gen.run_project(patcher, FakeClip(), FakeVAE(), p)               # everything cached
    p["segments"][0]["prompt"] = "one, changed"                       # 1 and its continuation 2 are now stale
    calls = []
    real = gen.sample_segment
    monkeypatch.setattr(gen, "sample_segment", lambda *a, **k: (calls.append(a[4]), real(*a, **k))[1])
    p["run"] = {"upto": 2, "only": 2}
    p["segments"][2]["overrides"] = {"seed": 777}                     # «Ещё дубль» on segment 3
    images, _, _, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p)
    assert calls == [2]
    assert [r["index"] for r in info["segments"]] == [2] and info["full"]["partial"] is True
    assert images.shape[0] == 39
    # continuation: the previous (ready) segment comes from the cache, only this one is sampled
    calls.clear()
    p2 = project(id="only2")
    gen.run_project(patcher, FakeClip(), FakeVAE(), p2)
    calls.clear()
    p2["segments"][1]["overrides"] = {"seed": 5}
    p2["run"] = {"upto": 1, "only": 1}
    images2, _, _, info2 = gen.run_project(patcher, FakeClip(), FakeVAE(), p2)
    assert calls == [1] and [r["cached"] for r in info2["segments"]] == [True, False]
    assert images2.shape[0] == core.plan(core.normalize_project(p2))[-1]["end"]


def test_run_status_mirrors_progress_for_polling(patcher, dirs, monkeypatch):
    sent = []

    class Inst:
        def send_sync(self, ev, d): sent.append(d)
    real_init = gen.Notifier.__init__

    def init(self, node_id, run_id=None):
        real_init(self, node_id, run_id)
        self.inst = Inst()
    monkeypatch.setattr(gen.Notifier, "__init__", init)
    gen.run_project(patcher, FakeClip(), FakeVAE(), project(id="st"), node_id="42")
    st = gen.run_status("42")
    assert st and st["active"] is False and st["done"]["full"]["frames"] > 0
    assert sorted(st["results"]) == ["0", "1"] and st["seq"] == sent[-1]["seq"]
    assert all(d["run"] == st["run"] for d in sent) and [d["seq"] for d in sent] == list(range(1, len(sent) + 1))
    # a failing run is reported as ended
    monkeypatch.setattr(gen, "sample_segment", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")))
    with pytest.raises(RuntimeError):
        gen.run_project(patcher, FakeClip(), FakeVAE(), project(id="st2"), node_id="42")
    st2 = gen.run_status("42")
    assert st2["run"] != st["run"] and st2["active"] is False and "boom" in st2["error"]


def test_frozen_segment_is_never_regenerated(patcher, dirs, monkeypatch):
    import shutil
    out, _ = dirs
    p = project(id="frz")
    _, _, _, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p)
    k0, k1 = info["keys"]
    rec = gen.freeze_segment("frz", k0)
    assert rec["frames"] == 39 and rec["file"]["subfolder"] == "h3zerostudio/frz/frozen" and "video" in rec
    p["segments"][0]["freeze"] = dict(rec, sig="ui-sig")
    # edits to a frozen segment do not matter: same key, length pinned to the frozen latent
    p["segments"][0]["prompt"] = "something else"
    p["segments"][0]["frames"] = 158
    n = core.normalize_project(p)
    assert n["segments"][0]["frames"] == 39 and core.segment_keys(n)[0] == k0
    calls = []
    real = gen.sample_segment
    monkeypatch.setattr(gen, "sample_segment", lambda *a, **k: (calls.append(a[4]), real(*a, **k))[1])
    _, _, _, info2 = gen.run_project(patcher, FakeClip(), FakeVAE(), p)
    assert calls == [] and info2["keys"][0] == k0
    # «Очистить кэш» leaves frozen/ alone: the frozen one loads, the continuation is regenerated
    shutil.rmtree(os.path.join(str(out), "h3zerostudio", "frz", "cache"))
    _, _, _, info3 = gen.run_project(patcher, FakeClip(), FakeVAE(), p)
    assert calls == [1] and [r["cached"] for r in info3["segments"]] == [True, False]
    # a frozen segment whose file is gone is a clear error
    shutil.rmtree(os.path.join(str(out), "h3zerostudio", "frz", "frozen"))
    shutil.rmtree(os.path.join(str(out), "h3zerostudio", "frz", "cache"))
    with pytest.raises(ValueError, match="зафиксирован"):
        gen.run_project(patcher, FakeClip(), FakeVAE(), p)


def _clip_file(inp, name="clip.mp4", n=120, fps=30, w=128, h=72):
    from h3s import h3s_media as media
    fr = torch.zeros(n, h, w, 3)
    for k in range(n):
        fr[k] = (k % 50) / 50
    media.write_mp4(str(inp / "h3zerostudio" / name), fr, fps=fps)
    return {"id": "v1", "file": name, "subfolder": "h3zerostudio", "category": "video", "frames": int(n / fps * 24)}


def test_video_asset_info_and_poster(dirs):
    out, inp = dirs
    a = _clip_file(inp)
    info = gen.video_asset_info({"filename": a["file"], "subfolder": "h3zerostudio", "type": "input"})
    assert info["frames"] == 96 and info["width"] == 128 and not info["has_audio"]
    assert os.path.isfile(os.path.join(str(out), info["poster"]["subfolder"], info["poster"]["filename"]))
    assert info["strip_n"] == 24 and os.path.isfile(os.path.join(str(out), info["strip"]["subfolder"], info["strip"]["filename"]))
    from PIL import Image
    im = Image.open(os.path.join(str(out), info["strip"]["subfolder"], info["strip"]["filename"]))
    assert im.size[1] == 72 and im.size[0] == 24 * round(72 * 128 / 72)


def test_footage_clip_as_is_and_vid2vid(patcher, dirs, monkeypatch):
    out, inp = dirs
    va = _clip_file(inp)
    calls = []
    real = gen.sample_segment
    monkeypatch.setattr(gen, "sample_segment", lambda *a, **k: (calls.append((a[4], a[-1] is not None if len(a) > 14 else None)), real(*a, **k))[1])
    p = project(assets=project()["assets"] + [va],
                segments=[{"id": "f", "frames": 56, "source": {"asset": "v1", "in": 12}, "prompt": "ignored"},
                          {"id": "s2", "frames": 56, "prompt": "two"}])
    imgs, _, lat, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p)
    # footage is not sampled; the next segment extends it with the usual overlap
    assert [c[0] for c in calls] == [1] and core.plan(core.normalize_project(p))[1]["overlap"] == 22
    assert imgs.shape[0] == 56 + 56 - 22
    k0 = core.segment_keys(core.normalize_project(p))[0]
    p["segments"][0]["prompt"] = "changed"            # the prompt of footage used as is does not matter
    assert core.segment_keys(core.normalize_project(p))[0] == k0
    p["segments"][0]["source"]["in"] = 20             # another range of the file does
    assert core.segment_keys(core.normalize_project(p))[0] != k0
    # vid2vid: the footage latent is the start, partial denoise
    seen = {}
    orig = comfy_sample = gen.comfy.sample.sample
    def spy(*a, **k):
        seen.setdefault("denoise", []).append(k.get("denoise"))
        return orig(*a, **k)
    monkeypatch.setattr(gen.comfy.sample, "sample", spy)
    p["segments"][0]["source"]["denoise"] = 0.55
    calls.clear()
    gen.run_project(patcher, FakeClip(), FakeVAE(), p)
    assert calls[0] == (0, True) and seen["denoise"][0] == pytest.approx(0.55)


def test_video_references_reach_the_conditioning(patcher, dirs):
    out, inp = dirs
    va = _clip_file(inp, n=300)   # 10 s
    p = project(assets=project()["assets"] + [va])
    p["segments"][0]["refs"] = ["a1", "v1"]
    p["segments"][0]["frames"] = 124
    clip = FakeClip()
    gen.run_project(patcher, clip, FakeVAE(), p)
    text, kinds = clip.calls[0]
    assert kinds == ["image", "video"] and "<Video 1>" in text
    n = core.normalize_project(p)
    assert core.compose_prompt(n, 0).endswith("Use <Video 1> as the motion reference of this shot.")
    fr = gen.ref_video_frames(n["assets"][-1], 124)
    assert fr.shape[0] == 124 and fr.shape[0] % 17 == 5
    p["segments"][0]["refs"] += ["v1b", "v1c", "v1d"]
    p["assets"] += [dict(va, id=x) for x in ("v1b", "v1c", "v1d")]
    with pytest.raises(ValueError, match="видео"):
        gen.run_project(patcher, FakeClip(), FakeVAE(), p)


def test_export_video_full_fragment_and_no_overwrite(dirs, tmp_path):
    from h3s import h3s_media as media
    out, inp = dirs
    fr = torch.zeros(48, 64, 96, 3)
    for k in range(48):
        fr[k] = k / 48
    wav = torch.sin(torch.arange(2 * 44100) / 44100 * 2 * math.pi * 330)[None].repeat(2, 1) * 0.3
    (out / "h3zerostudio" / "t1").mkdir(parents=True)
    media.write_mp4(str(out / "h3zerostudio" / "t1" / "full_x.mp4"), fr, 24, wav, 44100)
    src = {"filename": "full_x.mp4", "subfolder": "h3zerostudio/t1", "type": "output"}
    dest = tmp_path / "my exports"
    r1 = gen.export_video({"source": src, "folder": str(dest), "name": "клип: 1"})
    assert r1["path"].endswith("клип_ 1.mp4") and r1["frames"] == 48
    r2 = gen.export_video({"source": src, "folder": str(dest), "name": "клип: 1"})
    assert r2["path"].endswith("клип_ 1_2.mp4")
    r3 = gen.export_video({"source": src, "folder": str(dest), "name": "frag", "range": [12, 36]})
    assert r3["frames"] == 24
    info = media.video_info(r3["path"])
    assert info["has_audio"] and abs(info["duration"] - 1.0) < 0.1
    v = media.load_video_frames(r3["path"], 0, 1, 96, 64)
    assert abs(float(v.mean()) - 12 / 48) < 0.05          # starts at frame 12 of the source
    r4 = gen.export_video({"source": src, "folder": "", "name": "default"})
    assert os.path.dirname(r4["path"]) == gen.export_dir()
    with pytest.raises(ValueError):
        gen.export_video({"source": src, "folder": str(dest), "range": [10, 10]})


def test_asset_editor_derivatives(dirs):
    from h3s import h3s_assets as ae, h3s_media as media
    out, inp = dirs
    # video 4 s, 30 fps, 160x90 with sound; left half red
    fr = torch.zeros(120, 90, 160, 3)
    fr[:, :, :80, 0] = 1
    wav = torch.ones(2, 4 * 44100) * 0.25
    media.write_mp4(str(inp / "h3zerostudio" / "src.mp4"), fr, 30, wav, 44100)
    src = {"filename": "src.mp4", "subfolder": "h3zerostudio", "type": "input"}
    r = ae.run({"kind": "video", "source": src, "ops": {"start": 1, "end": 3, "max_side": 80, "mirror": True, "fade_in": 0.5}}, gen.asset_path)
    info = r["info"]
    assert r["file"]["subfolder"] == "h3zerostudio/derived" and (info["width"], info["height"]) == (80, 44)
    assert abs(info["duration"] - 2.0) < 0.1 and info["has_audio"]
    p = gen.asset_path({"file": r["file"]["filename"], "subfolder": r["file"]["subfolder"]})
    v = media.load_video_frames(p, 0, 1, 80, 44, mode="stretch")
    assert v[0, :, 60:, 0].mean() > 0.8 and v[0, :, :20, 0].mean() < 0.2       # mirrored: red on the right
    wf, sr = media.load_audio(p)
    assert np.abs(wf[:, :int(0.1 * sr)]).max() < 0.1 and abs(np.abs(wf[:, int(1.0 * sr):int(1.5 * sr)]).mean() - 0.25) < 0.05
    assert os.path.isfile(str(inp / "h3zerostudio" / "src.mp4"))                  # the original stays
    r2 = ae.run({"kind": "video", "source": src, "ops": {"start": 1, "end": 3, "max_side": 80, "mirror": True, "fade_in": 0.5}}, gen.asset_path)
    assert r2["file"] == r["file"]                                                  # reused by hash
    # rotate + crop -> size, frame capture, audio extraction
    assert ae.out_size(160, 90, ae.clean_ops({"rotate": 90, "crop": [0, 0, 1, 0.5]})) == (90, 80)
    fref = ae.run({"action": "frame", "source": src, "t": 2.0, "ops": {"crop": [0, 0, 0.5, 1]}}, gen.asset_path)["file"]
    img = np.asarray(Image.open(gen.asset_path({"file": fref["filename"], "subfolder": fref["subfolder"]})))
    assert img.shape[:2] == (90, 80) and img[..., 0].mean() > 200
    aref = ae.run({"action": "audio", "source": src, "ops": {"start": 0.5, "end": 1.5, "normalize": True}}, gen.asset_path)
    assert abs(aref["info"]["duration"] - 1.0) < 0.02
    # image: rotate + downscale; audio: gain
    Image.fromarray((np.random.rand(100, 200, 3) * 255).astype("uint8")).save(inp / "h3zerostudio" / "pic.png")
    ri = ae.run({"kind": "image", "source": {"filename": "pic.png", "subfolder": "h3zerostudio"}, "ops": {"rotate": 270, "max_side": 50}}, gen.asset_path)
    assert (ri["info"]["width"], ri["info"]["height"]) == (24, 50)
    assert ae.run({"kind": "image", "source": {"filename": "pic.png", "subfolder": "h3zerostudio"}, "ops": {}}, gen.asset_path)["file"] is None
    ra = ae.run({"kind": "audio", "source": {"filename": aref["file"]["filename"], "subfolder": aref["file"]["subfolder"]}, "ops": {"gain_db": -6}}, gen.asset_path)
    wa, _ = media.load_audio(gen.asset_path({"file": ra["file"]["filename"], "subfolder": ra["file"]["subfolder"]}))
    assert abs(np.abs(wa).max() - 0.891 * 0.501) < 0.03


def test_clip_volume_fades_and_music_lane(dirs, patcher):
    sr = 8000
    tone = torch.ones(1, 1, sr * 4) * 0.5
    src = {"input": {"waveform": tone, "sample_rate": sr}}
    clip = {"asset": "input", "start": 1.0, "in": 0.0, "length": 2.0, "volume": 0.5, "fade_in": 0.5, "fade_out": 0.0}
    mix, spans = gen.mix_clips([clip], src, sr, 0.0, sr * 4)
    assert spans == [(1.0, 3.0)]
    assert float(mix[0, 0, int(0.9 * sr)]) == 0.0 and abs(float(mix[0, 0, int(1.25 * sr)]) - 0.125) < 0.01
    assert abs(float(mix[0, 0, int(2.5 * sr)]) - 0.25) < 1e-4 and float(mix[0, 0, int(3.1 * sr)]) == 0.0
    # music lane clips are not locked and not part of the cache keys
    p = project()
    p["audio"] = {"clips": [{"id": "m", "asset": "input", "lane": 2, "start": 0}]}
    n = core.normalize_project(p)
    assert core.lock_clips(n) == [] and len(core.music_clips(n)) == 1
    assert core.segment_keys(n) == core.segment_keys(core.normalize_project(project()))
    # a lock clip with a volume change re-keys the segments under it
    p["audio"] = {"clips": [{"id": "l", "asset": "input", "lane": 0, "start": 0, "length": 1, "volume": 0.5}]}
    k1 = core.segment_keys(core.normalize_project(p))
    p["audio"]["clips"][0]["volume"] = 1.0
    k2 = core.segment_keys(core.normalize_project(p))
    assert k1[0] != k2[0]


def test_export_mixes_music_over_video_sound(dirs, tmp_path):
    from h3s import h3s_media as media
    import wave
    out, inp = dirs
    fr = torch.zeros(48, 64, 96, 3)
    (out / "h3zerostudio" / "t1").mkdir(parents=True)
    media.write_mp4(str(out / "h3zerostudio" / "t1" / "full_m.mp4"), fr, 24, torch.zeros(2, 2 * 44100), 44100)
    with wave.open(str(inp / "h3zerostudio" / "music.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(44100)
        w.writeframes((np.sin(np.arange(44100 * 3) / 44100 * 2 * np.pi * 220) * 0.4 * 32767).astype("<i2").tobytes())
    proj = project(assets=project()["assets"] + [{"id": "mu", "file": "music.wav", "subfolder": "h3zerostudio", "category": "audio"}])
    proj["audio"] = {"video_volume": 0.3, "clips": [{"id": "m", "asset": "mu", "lane": 2, "start": 1.0, "volume": 1.0}]}
    src = {"filename": "full_m.mp4", "subfolder": "h3zerostudio/t1", "type": "output"}
    r = gen.export_video({"source": src, "folder": str(tmp_path), "name": "mus", "project": proj})
    wf, sr = media.load_audio(r["path"])
    first, second = np.abs(wf[:, :int(0.9 * sr)]).max(), np.abs(wf[:, int(1.2 * sr):int(1.9 * sr)]).max()
    assert first < 0.02 and 0.3 < second < 0.5
    r2 = gen.export_video({"source": src, "folder": str(tmp_path), "name": "mus2", "project": proj, "range": [24, 48]})
    wf2, sr2 = media.load_audio(r2["path"])
    assert np.abs(wf2[:, int(0.1 * sr2):int(0.5 * sr2)]).max() > 0.3


def test_overlap_override_audio_context_and_fit():
    p = core.normalize_project({"settings": {"overlap_blocks": 1},
                                "segments": [{"frames": 124}, {"frames": 124, "overlap_blocks": 3}, {"frames": 124, "overlap_blocks": 0},
                                             {"frames": 56}, {"frames": 124, "overlap_blocks": 8}]})
    ov = [it["overlap"] for it in core.plan(p)]
    # 3 blocks = 56 fr; 0 = last frame only; global 1 = 22; 8 blocks do not fit after a 56-frame segment -> 2 blocks (39)
    assert ov == [0, 56, 0, 22, 39]
    assert p["segments"][0]["overlap_blocks"] == -1
    # the audio context does not change the overlap (it reaches back before it)
    p["settings"]["audio_context_sec"] = 2.0
    assert [it["overlap"] for it in core.plan(p)] == ov
    assert core.audio_context_extra(p, 37, 200) == 45 and core.audio_context_extra(p, 37, 20) == 20
    assert core.audio_context_extra(p, 90, 200) == 0
    w = core.estimate(p)["warnings"]
    assert not any("перекрытие не помещается" in x for x in w)


def test_extension_audio_is_kept_clean_through_the_h3_denoise_mask(patcher, dirs, monkeypatch):
    """The previous tail must reach the DiT as clean context at every step (native per-token mask), with the right
    scale, and also ride as the keyframe's cond audio (like MiniMaxH3AddGuide)."""
    import comfy.ldm.minimax.model as mm
    from comfy.ldm.minimax.model import time_shift_sigma
    seen, masks = [], []
    real_fwd = mm.MiniMaxH3Model.forward

    def fwd(self, x, timestep, context, transformer_options={}, minimax_payload=None, denoise_mask=None, audio_denoise_mask=None, **kw):
        pay = minimax_payload or {}
        scale = float(pay.get("audio_scale", 1.0))
        sv = float(timestep.flatten()[0]) / 1000.0
        carry = time_shift_sigma(torch.tensor(sv), 12.0, 3.0) / sv if scale != 1.0 else 1.0
        kfs = pay.get("keyframes") or []
        seen.append((x[1].float() * carry, audio_denoise_mask, [k.get("audio_latent") for k in kfs]))
        return real_fwd(self, x, timestep, context, transformer_options, minimax_payload=minimax_payload,
                        denoise_mask=denoise_mask, audio_denoise_mask=audio_denoise_mask, **kw)
    monkeypatch.setattr(mm.MiniMaxH3Model, "forward", fwd)
    orig = gen.comfy.sample.sample
    monkeypatch.setattr(gen.comfy.sample, "sample", lambda *a, **k: masks.append(k.get("noise_mask")) or orig(*a, **k))
    p = project(id="msk")
    p["settings"].update(steps=3, shift_video=12.0, shift_audio=3.0, audio_context_sec=0)
    _, _, _, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), None)
    d = os.path.join(str(dirs[0]), "h3zerostudio", "msk", "cache")
    a1 = torch.load(os.path.join(d, f"seg_{info['keys'][0]}.pt"))["a"]
    it = core.plan(core.normalize_project(p))
    a_ov = a1.shape[-1] - round((it[0]["frames"] - it[1]["overlap"]) / 24 * 40)
    tail = a1[..., -a_ov:]
    assert masks[0] is None                                  # first segment: nothing to keep
    am = masks[1].unbind()[1]
    r = core.AUDIO_HANDOFF_TICKS
    assert float(am[..., :a_ov - r].max()) == 0 and float(am[..., a_ov:].min()) == 1
    assert r == 0 and bool(((am == 0) | (am == 1)).all()), "hard 0/1 boundary: a fractional ramp decoded as a dropout"
    steps2 = [s for s in seen if s[1] is not None]
    assert len(steps2) >= 3
    for x_a, adm, kf_a in steps2:
        assert torch.allclose(x_a[..., :a_ov - r], tail[..., :a_ov - r], atol=1e-4)   # clean, model-space, every step
        assert float(adm[..., :a_ov - r].max()) == 0
        cond = [k for k in kf_a if k is not None]
        assert len(cond) == 1 and torch.allclose(cond[0], tail)          # only the overlap (audio_context_sec 0)
    # audio context 2 s: the cond audio reaches back before the overlap, ends at the overlap end, on the 5-frame grid
    seen.clear(); masks.clear()
    p["settings"]["audio_context_sec"] = 2.0
    p["segments"][0]["frames"] = 124
    _, _, _, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), None)
    a1 = torch.load(os.path.join(d, f"seg_{info['keys'][0]}.pt"))["a"]
    it = core.plan(core.normalize_project(p))
    s0 = round((it[0]["frames"] - it[1]["overlap"]) / 24 * 40)
    ext = core.audio_context_extra(core.normalize_project(p), a1.shape[-1] - s0, s0)
    assert ext == 45
    kf = [s[2] for s in seen if s[1] is not None][0]
    cond = [k for k in kf if k is not None][0]
    assert torch.allclose(cond, a1[..., s0 - ext:])


def test_extension_after_footage_continues_its_sound(patcher, dirs, monkeypatch):
    """Footage used as is -> encoded (video VAE + audio VAE), and the next extension keeps its audio tail
    through the same denoise-mask path as after a generated segment."""
    out, inp = dirs
    va = _clip_file(inp)
    masks = []
    orig = gen.comfy.sample.sample
    monkeypatch.setattr(gen.comfy.sample, "sample", lambda *a, **k: masks.append(k.get("noise_mask")) or orig(*a, **k))
    p = project(id="fx", assets=project()["assets"] + [va],
                segments=[{"id": "f", "frames": 56, "source": {"asset": "v1", "in": 0}},
                          {"id": "s2", "frames": 56, "prompt": "two"}])
    p["settings"]["audio_context_sec"] = 0
    p["run"] = {"only": 1}
    _, _, _, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), None)
    assert len(masks) == 1 and masks[0] is not None                     # only the extension is sampled
    am = masks[0].unbind()[1]
    assert float(am[..., :10].max()) == 0 and float(am[..., -1].min()) == 1


def test_draft_then_final_from_draft(patcher, dirs, monkeypatch, capsys):
    """«Черновик»: small fast pass. «Финал из черновика»: the cached draft is upscaled and refined with partial
    denoise; its sound is kept 1:1; the refine pass runs only its own steps."""
    base = {"settings": {"prompt": "g", "res_mode": "custom", "width": 192, "height": 128, "steps": 4, "cfg": 1.0,
                         "sampler": "euler", "scheduler": "simple", "overlap_blocks": 1, "quality": "draft",
                         "draft_scale": 0.5, "final_mode": "refine", "refine_sigma": 0.4}}
    import copy
    p = project(id="dr", **copy.deepcopy(base))
    calls = []
    real = gen.sample_segment

    def spy(*a, **kw):
        calls.append((kw.get("kind"), kw.get("refine") is not None))
        return real(*a, **kw)
    monkeypatch.setattr(gen, "sample_segment", spy)
    images, _, lat_d, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), None)
    assert images.shape[1:] == (64, 96, 3), "draft = half size"
    assert calls == [("draft", False), ("draft", False)]
    assert all(r["kind"] == "draft" for r in info["segments"])
    dv, da = lat_d["samples"].unbind()
    # final from the draft: drafts come from the cache, only the refine passes sample
    calls.clear()
    p2 = project(id="dr", **copy.deepcopy(base)); p2["settings"]["quality"] = "final"
    images2, _, lat_f, info2 = gen.run_project(patcher, FakeClip(), FakeVAE(), p2, FakeAudioVAE(), None)
    assert images2.shape[1:] == (128, 192, 3), "final = full size"
    assert calls == [("refine", True), ("refine", True)]
    fv, fa = lat_f["samples"].unbind()
    assert fv.shape[-2:] == (8, 12) and dv.shape[-2:] == (4, 6)
    assert torch.allclose(fa, da, atol=1e-5), "the draft sound is kept 1:1 by the refine pass"
    log = capsys.readouterr().out
    assert "draft from cache" in log and "final from its draft" in log and "audio lock check" in log
    assert "NOT KEPT" not in log
    assert "refine schedule: 4 steps from sigma 0.400" in log
    keys_f = info2["keys"]
    assert keys_f != info["keys"]
    # a final of a project without drafts: each draft is sampled first, then refined (chained in order)
    calls.clear()
    p3 = project(id="dr3", **copy.deepcopy(base)); p3["settings"]["quality"] = "final"; p3["settings"]["upscale_method"] = "latent"
    gen.run_project(patcher, FakeClip(), FakeVAE(), p3, FakeAudioVAE(), None)
    assert calls == [("draft", False), ("refine", True), ("draft", False), ("refine", True)]
    # one-pass final keys are untouched by the draft settings
    p4 = core.normalize_project(project(id="dr", **copy.deepcopy(base))); p4["settings"].update(quality="final", final_mode="full")
    p5 = core.normalize_project(project(id="dr")); p5["settings"].update(width=192, height=128, steps=4, prompt="g")
    assert core.segment_keys(p4) == core.segment_keys(p5)
    assert core.estimate(core.normalize_project(p))["width"] == 96


# ---------------------------------------------------------------- «Апскейл отрезка»
from h3s import h3s_upscale as upscale


def test_upscale_crop_plan():
    # tiles of the base canvas size cover the upscaled canvas with ramps that sum to a positive weight everywhere
    crops = upscale.plan_crops(17, 94, 16, 24, "tiles", 8, 12)
    assert len(crops) == 4 and {c["y"] for c in crops} == {(0, 8), (8, 16)} or len(crops) >= 4
    den = torch.zeros(17, 16, 24)
    for c in crops:
        (v0, v1), (y0, y1), (x0, x1) = c["t"], c["y"], c["x"]
        assert (y1 - y0) == 8 and (x1 - x0) == 12 and y0 % 2 == 0 and x0 % 2 == 0
        den[v0:v1, y0:y1, x0:x1] += c["wt"].view(-1, 1, 1) * c["wy"].view(1, -1, 1) * c["wx"].view(1, 1, -1)
    assert float(den.min()) > 0
    # with overlap: positions keep the minimum overlap
    pos = upscale.tile_positions(68, 34, 8)
    assert pos[0] == 0 and pos[-1] == 34 or pos[-1] + 34 == 68
    assert all(b - a <= 34 - 8 for a, b in zip(pos, pos[1:]))
    # full frame under the budget: one crop; over it: temporal windows on the 5-grid
    assert len(upscale.plan_crops(37, 205, 16, 24, "latent", 8, 12)) == 1
    w = upscale.plan_crops(77, 435, 68, 120, "latent", 34, 60, budget=37 * 34 * 60)
    ts = sorted({c["t"] for c in w})
    assert len(ts) >= 2 and all(t0 % 5 == 0 for t0, _ in ts) and ts[-1][1] == 77
    assert all(t1 - t0 >= 37 for t0, t1 in ts)


def test_upscale_keys_and_normalize():
    p = core.normalize_project(project(segments=[
        {"id": "s1", "frames": 39, "prompt": "one", "upscale": {"method": "rtx", "scale": 1.9, "sigma": 5}},
        {"id": "s2", "frames": 56, "prompt": "two", "upscale": {"method": "tiles"}},
        {"id": "s3", "frames": 39, "prompt": "3", "upscale": {"method": "nope"}}]))
    u = [s["upscale"] for s in p["segments"]]
    # legacy multipliers become megapixel targets with exactly the same canvas (96x64 x2 = 192x128)
    assert u[0] == {"method": "rtx", "mp": 0.025, "sigma": 0.7, "quality": "ULTRA"}
    assert u[1] == {"method": "tiles", "mp": 0.025, "sigma": 0.35} and u[2] is None
    assert core.upscale_canvas(96, 64, u[0]) == (192, 128) and core.normalize_project(p) == p, "idempotent"
    assert core.upscale_key_form(u[0], 96, 64) == {"method": "rtx", "scale": 2.0, "sigma": 0.7, "quality": "ULTRA"}
    base = core.segment_keys(p)
    uk = core.upscale_keys(p, base)
    assert uk[0] and uk[1] and uk[2] is None and len(set(uk[:2])) == 2 and not set(uk[:2]) & set(base)
    # the base chain does not depend on the upscale; the 2nd upscale chains on the 1st (same canvas, extension)
    p2 = core.normalize_project(project(segments=[
        {"id": "s1", "frames": 39, "prompt": "one", "upscale": {"method": "rtx", "scale": 2, "sigma": 0.3}},
        {"id": "s2", "frames": 56, "prompt": "two", "upscale": {"method": "tiles"}},
        {"id": "s3", "frames": 39, "prompt": "3"}]))
    assert core.segment_keys(p2) == base
    uk2 = core.upscale_keys(p2, base)
    assert uk2[0] != uk[0] and uk2[1] != uk[1]
    # backend tag (learned model vs fallback) is part of the key
    assert core.upscale_keys(p, base, up_env={"tiles": "learned:x"})[1] != uk[1]
    # legacy draft->final "vae" migrates to the learned upscaler once
    old = core.normalize_project({"settings": {"upscale_method": "vae"}})
    assert old["settings"]["upscale_method"] == "learned"
    for old_m, rev in (("vae", 2), ("latent", 2), ("latent", 0), ("nearest", 3)):   # removed methods -> learned
        assert core.normalize_project({"settings": {"upscale_method": old_m, "upscale_rev": rev}})["settings"]["upscale_method"] == "learned"
    assert core.normalize_project({"settings": {"upscale_method": "rtx"}})["settings"]["upscale_method"] == "rtx"
    assert core.UPSCALE_METHODS == ("learned", "rtx")


def _up_project(pid, ups, **kw):
    return project(id=pid, segments=[{"id": "s1", "frames": 39, "prompt": "one", "refs": ["a1"], "upscale": ups[0]},
                                     {"id": "s2", "frames": 56, "prompt": "two", "refs": ["a1"], "upscale": ups[1]}], **kw)


def test_segment_upscale_tiles_keeps_audio_and_seam(patcher, dirs, monkeypatch, capsys):
    seen = []
    real_wrap = upscale.CropWrapper.__call__

    def spy(self, apply_model, args):
        seen.append((len(self.crops), "denoise_mask" in args["c"], "audio_denoise_mask" in args["c"]))
        return real_wrap(self, apply_model, args)
    monkeypatch.setattr(upscale.CropWrapper, "__call__", spy)
    p0 = _up_project("up0", [None, None])
    _, _, lat0, info0 = gen.run_project(patcher, FakeClip(), FakeVAE(), p0, FakeAudioVAE(), None)
    p = _up_project("up0", [{"method": "tiles", "scale": 2}, {"method": "tiles", "scale": 2}])
    images, _, lat, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), None)
    log = capsys.readouterr().out
    assert images.shape[1:] == (128, 192, 3)
    v0, a0 = lat0["samples"].unbind()
    v, a = lat["samples"].unbind()
    assert v.shape[-2:] == (8, 12) and torch.allclose(a, a0, atol=1e-6), "audio 1:1"
    assert "NOT KEPT" not in log and "upscale audio check" in log
    assert "[upscale tiles 192x128" in log and "input learned" in log
    assert seen and all(n == 12 for n, _, _ in seen), "3x4 synchronized tiles (4x6 cells) on 8x12"
    assert "upscale input done" in log and "grid 4x3 tile" in log
    assert "tile 12/12" in log and "ms/tile" in log and "blended (12 tile evaluation(s))" in log and "upscaled clip decoded" in log
    assert all(ad for _, _, ad in seen) and any(dm for _, dm, _ in seen), "masks reach every crop; seam lock on seg 2"
    r = info["segments"]
    assert r[0]["key"] != info0["segments"][0]["key"] and r[0]["base_key"] == info0["segments"][0]["key"]
    assert r[0]["wh"] == [192, 128] and r[0]["upscale"]["method"] == "tiles"
    # seam: segment 2 starts with segment 1's upscaled tail
    d = gen.project_dir(core.normalize_project(p))[0]
    u1 = torch.load(gen.seg_pt_path(d, r[0]["key"]), weights_only=True)["v"]
    u2 = torch.load(gen.seg_pt_path(d, r[1]["key"]), weights_only=True)["v"]
    ov_t = core.latent_t(22)
    assert torch.allclose(u2[:, :, :ov_t], u1[:, :, -ov_t:], atol=1e-5)
    # resume: everything cached now, nothing is sampled
    seen.clear()
    gen.run_project(patcher, FakeClip(), FakeVAE(), _up_project("up0", [{"method": "tiles", "scale": 2}, {"method": "tiles", "scale": 2}]), FakeAudioVAE(), None)
    assert not seen and "upscale from cache" in capsys.readouterr().out


def test_segment_upscale_learned_rtx_mixed(patcher, dirs, monkeypatch, capsys):
    import sys
    import types
    calls = []

    def fake_learned(v, w, h):
        calls.append(("learned", w, h))
        return torch.nn.functional.interpolate(v.float(), size=(v.shape[2], h // 16, w // 16), mode="nearest-exact")
    monkeypatch.setattr(upscale, "learned_upscale", fake_learned)

    class SR:
        def __init__(self, q): self.q = q
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def load(self): pass
        def run(self, x):
            calls.append(("rtx", self.output_width, self.output_height))
            o = torch.nn.functional.interpolate(x[None], size=(self.output_height, self.output_width), mode="bilinear")[0]
            return types.SimpleNamespace(image=o)
    fake = types.SimpleNamespace(VideoSuperRes=SR, effects=types.SimpleNamespace(QualityLevel=types.SimpleNamespace(ULTRA="U", HIGH="H")))
    monkeypatch.setitem(sys.modules, "nvvfx", fake)
    monkeypatch.setattr(upscale, "RTX_DEVICE", "cpu")
    monkeypatch.setattr(upscale, "rtx_available", lambda: True)
    monkeypatch.setattr(upscale, "learned_models", lambda: ["minimax_h3_latent_upscaler_3d_bf16.safetensors"])
    monkeypatch.setattr(upscale, "learned_node", lambda: object)
    p = _up_project("up1", [{"method": "latent", "scale": 2}, {"method": "rtx", "scale": 1.5, "quality": "HIGH"}])
    images, _, lat, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), None)
    log = capsys.readouterr().out
    assert ("learned", 192, 128) in calls and any(c[0] == "rtx" and c[1:] == (160, 96) for c in calls), "1.5x of 96x64 snapped to 32: 160x96"
    assert images.shape[1:] == (128, 192, 3), "mixed canvases: stitched at the largest"
    v, _ = lat["samples"].unbind()
    assert v.shape[-2:] == (4, 6), "mixed canvases: latent output keeps the base latents"
    assert "mixed canvases" in log and "segment learned upscaler" not in log
    assert [r["up_input"] for r in info["segments"]] == ["learned", "rtx"]
    assert [r["wh"] for r in info["segments"]] == [[192, 128], [160, 96]]
    # draft -> final default is the learned upscaler too
    assert core.normalize_project({})["settings"]["upscale_method"] == "learned"
    assert upscale.env_tag("learned").startswith("learned:") and upscale.env_tag("rtx") == "rtx"


def _seam_env_db(x, sr, t0, t1, w=0.005):
    s, e, W = int(t0 * sr), int(t1 * sr), int(w * sr)
    y = x[s:e]
    n = y.shape[-1] // W
    return 20 * torch.log10(torch.sqrt((y[:n * W].view(n, W) ** 2).mean(1)) + 1e-9)


def test_stitch_audio_kept_overlap_no_rms_dip(h3s):
    """Kept overlap sound arrives up to ±12.5 ms off-grid (here 8.33 ms, as measured in a user's final). The
    stitch must splice sample-exactly: no level dip (5 ms RMS) across the seam and the tail back on video time."""
    gen = h3s.h3s_gen
    sr, fps = 48000, 24
    g = torch.Generator().manual_seed(3)
    t = torch.arange(int(14 * sr), dtype=torch.float32) / sr
    src = 0.3 * torch.randn(t.shape[0], generator=g)   # broadband: stable 10 ms RMS, unambiguous lag
    items = [{"start": 0, "end": 192, "overlap": 0}, {"start": 170, "end": 328, "overlap": 22}]
    s1 = int(round(170 / fps * sr))
    off = 400   # 8.33 ms: B's overlap = the sound 8.33 ms later than its video position
    A = src[None, :int(192 / fps * sr)]
    B = src[None, s1 + off:s1 + off + int(158 / fps * sr)].clone()
    info = []
    out, _ = gen.stitch_audio([A, B], sr, items, fps, 0.4, True, info=info)
    assert info[0]["mode"] == "splice" and abs(info[0]["lag_ms"] - 8.33) < 0.1
    seam = 170 / fps
    env = _seam_env_db(out[0], sr, seam - 0.2, seam + 22 / fps + 0.4, w=0.01)
    assert float(env.min()) > float(env.median()) - 1.5, "level dip at the seam"
    # the old long equal-power crossfade of the two 8 ms-apart copies is what this guards against
    assert float(env.max()) < float(env.median()) + 1.5
    assert not gen.seam_dips(out, sr, items, fps)
    # after the drift fix B is on its video timeline again (B[k] belongs at s1 + k - off ... then s1 + k)
    k = int(3.5 * sr)   # past the drift fix (quietest point within 1.5 s after the overlap)
    seg, ref = out[0, s1 + k:s1 + k + 9600], B[0, k:k + 9600]
    assert float(torch.dot(seg, ref) / (seg.norm() * ref.norm())) > 0.999


def test_stitch_audio_different_sound_crossfades(h3s):
    gen = h3s.h3s_gen
    sr, fps = 16000, 24
    g = torch.Generator().manual_seed(5)
    items = [{"start": 0, "end": 48, "overlap": 0}, {"start": 36, "end": 96, "overlap": 12}]
    A = 0.2 * torch.randn(1, 2 * sr, generator=g)
    B = 0.4 * torch.randn(1, int(60 / fps * sr), generator=g)
    info = []
    out, gains = gen.stitch_audio([A, B], sr, items, fps, 0.4, True, info=info)
    assert info[0]["mode"] == "crossfade" and abs(gains[1] - 0.5) < 0.1


def test_upscale_unavailable_is_a_clear_error(patcher, dirs, monkeypatch):
    """No learned upscaler and no RTX VSR: the final from the draft fails before any sampling with a clear
    message (no silent nearest-exact / Lanczos result)."""
    monkeypatch.setattr(upscale, "learned_models", lambda: [])
    monkeypatch.setattr(upscale, "learned_node", lambda: None)
    monkeypatch.setattr(upscale, "learned_upscale", lambda v, w, h: None)
    monkeypatch.setattr(upscale, "rtx_available", lambda: False)
    p = project(id="noup")
    p["settings"].update({"quality": "final", "final_mode": "refine"})
    with pytest.raises(upscale.UpscaleUnavailable, match="Апскейл недоступен"):
        gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), None)
    with pytest.raises(upscale.UpscaleUnavailable):
        upscale.upscale_input(FakeVAE(), torch.zeros(1, 24, 2, 4, 6), 192, 128)
    # rtx preferred, learned as its fallback (and vice versa)
    monkeypatch.setattr(upscale, "learned_models", lambda: ["m.safetensors"])
    monkeypatch.setattr(upscale, "learned_node", lambda: object)
    assert upscale.effective_input("rtx") == "learned" and upscale.effective_input("learned") == "learned"
    monkeypatch.setattr(upscale, "rtx_available", lambda: True)
    assert upscale.effective_input("rtx") == "rtx"


def test_rtx_center_crop_like_reference():
    """RTX VSR path = KJNodes «Resize Image v2» nvidia_rtx_vsr with keep_proportion crop / center."""
    fr = torch.zeros(2, 100, 200, 3)
    fr[:, :, 40:160] = 1.0
    c = upscale.center_crop_to_aspect(fr, 120, 100)   # 1.2 aspect from 2.0: width 120, centred
    assert c.shape == (2, 100, 120, 3) and bool((c == 1.0).all())
    assert upscale.center_crop_to_aspect(fr, 400, 200).shape == (2, 100, 200, 3)


def test_upscale_tile_size_and_progress_events(patcher, dirs, monkeypatch, capsys):
    crops = upscale.plan_crops(5, 8, 8, 12, "tiles", 4, 6, tile=[96, 64], tile_ov=2)
    assert len(crops) == 9, "tile 6x4 cells, overlap 2, on 12x8 -> 3 cols x 3 rows"
    assert core.normalize_upscale({"method": "tiles", "tile": [96, 64], "tile_ov": 2}) == {"method": "tiles", "scale": 2.0, "sigma": 0.35, "tile": [256, 256], "tile_ov": 2}
    clock_ev = []
    c = upscale.TileClock(crops, 2, 0, lambda **kw: clock_ev.append(kw), 8, 12)
    import time as _t
    for ci in range(len(crops)):
        c.tile(ci, _t.perf_counter())
    c.step_done()
    c.tile(0, _t.perf_counter())
    assert [e["tile"] for e in clock_ev[:8]] == list(range(1, 9)) and clock_ev[8]["tile"] == 9 and clock_ev[-1]["step"] == 2 and clock_ev[-1]["tile"] == 1
    assert clock_ev[0]["rows"] == 3 and clock_ev[0]["cols"] == 3 and clock_ev[0]["rect"] == [0, 4, 0, 6] and 0 < clock_ev[-1]["frac"] < 1
def test_stage_parameters_and_run_kind(patcher, dirs, monkeypatch):
    base = project(id="stg")
    base["settings"].update({"final_mode": "refine", "steps": 6, "cfg": 1.0, "sampler": "euler", "scheduler": "simple"})
    n = core.normalize_project(base)
    d, r = core.pass_params(n, 0, "draft"), core.pass_params(n, 0, "refine")
    assert d["sampler"] == "euler" and d["cfg"] == 1.0
    n2 = core.normalize_project({**base, "settings": {**base["settings"], "draft_sampler": "dpmpp_2m", "draft_cfg": 3, "refine_scheduler": "normal", "refine_cfg": 2}})
    d2, r2 = core.pass_params(n2, 0, "draft"), core.pass_params(n2, 0, "refine")
    assert (d2["sampler"], d2["cfg"], d2["scheduler"]) == ("dpmpp_2m", 3.0, "simple")
    assert (r2["scheduler"], r2["cfg"], r2["sampler"]) == ("normal", 2.0, "euler")
    assert core.pass_params(n2, 0, "full")["cfg"] == 1.0
    # keys: a draft-stage change touches only the draft keys; refine extras only when set (old keys unchanged)
    env = "e"
    k_d = core.segment_keys(n, {}, env, "draft"); k_d2 = core.segment_keys(n2, {}, env, "draft")
    assert k_d != k_d2
    assert core.segment_keys(n, {}, env, "full") == core.segment_keys(n2, {}, env, "full")
    assert core.refine_extra(n["settings"]) == [] and core.refine_extra(n2["settings"])
    # run.kind override: a one-clip draft in a 2-stage project runs the draft pass only
    seen = []
    real = gen.sample_segment
    monkeypatch.setattr(gen, "sample_segment", lambda *a, **k: seen.append(k.get("kind")) or real(*a, **k))
    p = project(id="stg2"); p["settings"]["final_mode"] = "refine"; p["run"] = {"upto": 0, "only": 0, "kind": "draft"}
    gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), None)
    assert seen and set(seen) == {"draft"}


def test_upscale_megapixel_target_keeps_old_keys():
    """A megapixel target equal to an old ×2 canvas keeps the old cache key; another target is a new key."""
    old = core.normalize_project(project(segments=[{"id": "s1", "frames": 39, "prompt": "one", "upscale": {"method": "latent", "scale": 2}}]))
    k_old = core.upscale_keys(old, core.segment_keys(old))[0]
    import copy
    same = copy.deepcopy(old); same["segments"][0]["upscale"] = {"method": "latent", "mp": 0.0246, "sigma": 0.4}
    assert core.upscale_keys(core.normalize_project(same), core.segment_keys(old))[0] == k_old
    other = copy.deepcopy(old); other["segments"][0]["upscale"] = {"method": "latent", "mp": 0.05, "sigma": 0.4}
    n = core.normalize_project(other)
    assert core.upscale_canvas(96, 64, n["segments"][0]["upscale"]) == (288, 192)
    assert core.upscale_keys(n, core.segment_keys(old))[0] != k_old


def test_upscale_temporal_chunks(patcher, dirs, monkeypatch, capsys):
    """Long clip + chunk length: upscale input + refine chunk by chunk (VRAM freed between), overlaps kept clean
    (continuation of the previous chunk), audio 1:1, progress with chunk i/N, chunked decode."""
    frees, ev, inputs = [], [], []
    monkeypatch.setattr(upscale.comfy.model_management, "soft_empty_cache", lambda *a, **k: frees.append(1))
    real_in = upscale.upscale_input
    monkeypatch.setattr(upscale, "upscale_input", lambda vae, v, *a, **k: (inputs.append(v.shape[2]), real_in(vae, v, *a, **k))[1])
    st = {"upscale_chunk_sec": 2.0, "upscale_chunk_overlap": 1}
    p = project(id="chk", segments=[{"id": "s1", "frames": 158, "prompt": "one", "upscale": {"method": "latent", "scale": 2}}])
    p["settings"].update(st)
    n = core.normalize_project(p)
    assert core.upscale_chunking(n["settings"], 158) == (4, 56, 1)
    assert upscale.chunk_plan(n["settings"], 47, 264) == [(0, 17, 0, 93), (10, 27, 57, 150), (20, 37, 113, 206), (30, 47, 170, 264)]
    est = core.estimate(n)
    assert est["steps_total"] == 2 + 4 * core.pass_params(n, 0, "refine")["steps"] and any("4 фрагм" in w for w in est["warnings"])
    images, _, lat, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), None, node_id="chk")
    log = capsys.readouterr().out
    v, a = lat["samples"].unbind()
    assert images.shape == (158, 128, 192, 3) and v.shape[2] == 47
    assert inputs == [17, 17, 17, 17], "each chunk gets its own upscale input"
    assert "4 temporal chunks" in log and "chunk 4/4" in log and "NOT KEPT" not in log and len(frees) >= 4
    for c in (2, 3, 4):
        line = [l for l in log.splitlines() if f"chunk {c}/4 overlap with chunk {c - 1}" in l][0]
        assert float(line.rsplit("max diff ", 1)[1].rstrip(")")) < 1e-4, line
    # the plain clip: same audio, all frames written
    p0 = project(id="chk", segments=[{"id": "s1", "frames": 158, "prompt": "one"}]); p0["settings"].update(st)
    _, _, lat0, info0 = gen.run_project(patcher, FakeClip(), FakeVAE(), p0, FakeAudioVAE(), None)
    assert torch.allclose(a, lat0["samples"].unbind()[1], atol=1e-6)
    assert float(v.abs().sum((0, 1, 3, 4)).min()) > 0, "no latent frame left empty"
    # key: chunking is part of it only for chunked clips
    p1 = copy_p = __import__("copy").deepcopy(p); copy_p["settings"]["upscale_chunk_sec"] = 0
    n1 = core.normalize_project(p1)
    assert core.upscale_keys(n1, core.segment_keys(n1))[0] != info["segments"][0]["key"]
    short = project(segments=[{"id": "s1", "frames": 56, "prompt": "one", "upscale": {"method": "latent", "scale": 2}}])
    ks = [core.upscale_keys(core.normalize_project(dict(short, settings=dict(short["settings"], upscale_chunk_sec=c))), core.segment_keys(core.normalize_project(short)))[0] for c in (0, 2.0, 5.0)]
    assert ks[0] == ks[2] and ks[0] == ks[1], "56 frames ≤ 56 + 2 blocks: one piece, key unchanged"
    # progress events carry the chunk
    st_ = gen.run_status("chk")
    assert st_ is not None


def test_upscale_profiles_per_method():
    """Regression: every upscale method keeps its own profile. Root cause was one shared seg_upscale: switching the method
    wrote that method's default σ and normalize_upscale dropped quality / tiles of the other method; chunks were global."""
    # migration: the flat values go into the selected method's profile, the others get their own defaults
    st = core.normalize_project({"settings": {"seg_upscale": {"method": "rtx", "mp": 3, "sigma": 0.33, "quality": "HIGH"},
                                              "upscale_chunk_sec": 6, "upscale_chunk_overlap": 2}})["settings"]
    pr = st["upscale_profiles"]
    assert pr["rtx"]["sigma"] == 0.33 and pr["rtx"]["quality"] == "HIGH" and pr["rtx"]["mp"] == 3 and pr["rtx"]["chunk"] is True
    assert pr["rtx"]["chunk_sec"] == 6 and pr["rtx"]["chunk_overlap"] == 2
    assert pr["latent"]["sigma"] == core.SEG_UPSCALE_SIGMA["latent"] and pr["latent"]["chunk"] is True
    assert pr["tiles"]["chunk"] is False                                   # defaults: chunks on for latent / RTX, off for tiles
    assert core.normalize_project({})["settings"]["upscale_profiles"]["tiles"]["chunk"] is False
    # switching the method only selects another profile: rtx σ / quality survive latent and back
    st["upscale_profiles"]["latent"]["sigma"] = 0.5
    st["seg_upscale"] = {"method": "latent"}
    s2 = core.normalize_project({"settings": st})["settings"]
    assert s2["seg_upscale"]["method"] == "latent" and s2["seg_upscale"]["sigma"] == 0.5
    s2["seg_upscale"] = {"method": "rtx", "sigma": 0.15}                  # a stale mirror never overwrites the profile
    s3 = core.normalize_project({"settings": s2})["settings"]
    assert s3["seg_upscale"]["sigma"] == 0.33 and s3["seg_upscale"]["quality"] == "HIGH" and s3["upscale_profiles"]["latent"]["sigma"] == 0.5
    # global settings round-trip keeps all profiles
    g = core.global_settings({"upscale_profiles": s3["upscale_profiles"], "seg_upscale": s3["seg_upscale"]})
    assert g["upscale_profiles"]["latent"]["sigma"] == 0.5 and g["upscale_profiles"]["rtx"]["quality"] == "HIGH"
    # the backend reads chunking / steps / sampler of the clip's method
    s3["upscale_profiles"]["tiles"].update(chunk=False)
    s3["upscale_profiles"]["latent"].update(chunk=True, chunk_sec=3, steps=7, sampler="euler")
    p = core.normalize_project({"settings": s3, "segments": [{"frames": 362, "upscale": {"method": "tiles", "mp": 3}},
                                                               {"frames": 362, "upscale": {"method": "latent", "mp": 2}}]})
    assert core.upscale_chunking(p["settings"], 362, "tiles") == (1, 0, 0)
    assert core.upscale_chunking(p["settings"], 362, "latent")[0] > 1
    pp = core.upscale_pass_params(p, 1, "latent")
    assert pp["steps"] == 7 and pp["sampler"] == "euler"
    assert core.upscale_pass_params(p, 0, "tiles")["steps"] == core.pass_params(p, 0, "refine")["steps"]
    keys = core.upscale_keys(p, core.segment_keys(p))
    p["settings"]["upscale_profiles"]["rtx"]["sigma"] = 0.2               # another method's profile: keys of these clips unchanged
    assert core.upscale_keys(core.normalize_project(p), core.segment_keys(p)) == keys

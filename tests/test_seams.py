"""Stage 1 of the obvpm-inspired quick wins: BT.709 tags, audio de-click, VRAM headroom, seam rating."""
import av
import torch

import comfy.model_management as mm
from h3s import h3s_core as core
from h3s import h3s_gen as gen
from h3s import h3s_media as media
from h3s import h3s_seams as seams


def test_write_mp4_is_bt709_tv_range(tmp_path):
    fr = torch.zeros(6, 32, 48, 3)
    fr[..., 1] = 0.7
    p = str(tmp_path / "x.mp4")
    media.write_mp4(p, fr, 24)
    with av.open(p) as c:
        cc = c.streams.video[0].codec_context
        assert (cc.color_primaries, cc.color_trc, cc.colorspace, cc.color_range) == (1, 1, 1, 1)
        f = next(c.decode(video=0)).to_ndarray(format="rgb24")
    assert abs(int(f[16, 24, 1]) - round(0.7 * 255)) <= 3 and int(f[16, 24, 0]) <= 4   # colours survive the round trip


def test_declick_tapers_hard_cut_only_locally():
    sr = 48000
    w = torch.ones(2, sr)
    seams.declick(w, sr, [sr // 2])
    T = int(0.005 * sr)
    assert float(w[0, sr // 2].abs()) < 1e-6 and float(w[0, sr // 2 - 1]) < 0.01
    assert float(w[0, sr // 2 - T - 1]) == 1.0 and float(w[0, sr // 2 + T]) == 1.0


def test_stitch_audio_declicks_new_scene_join():
    sr, fps = 48000, 24
    items = [{"start": 0, "end": 48, "overlap": 0}, {"start": 48, "end": 96, "overlap": 0}]
    waves = [torch.ones(1, 2 * sr), -torch.ones(1, 2 * sr)]
    out, _ = gen.stitch_audio(waves, sr, items, fps, 0.4, False)
    c = 2 * sr
    assert abs(float(out[0, c])) < 1e-6 and float(out[0, c - 2 * int(0.005 * sr)]) == 1.0
    raw, _ = gen.stitch_audio(waves, sr, items, fps, 0.4, False, declick=False)
    assert float(raw[0, c]) == -1.0


def test_taper_edges_numpy():
    import numpy as np
    a = np.ones((2, 4800), np.float32)
    seams.taper_edges(a, 48000)
    assert a[0, 0] == 0 and a[0, -1] < 0.02 and a[0, 2400] == 1


def test_rate_video_verdicts():
    torch.manual_seed(0)
    t = torch.linspace(0, 1, 40)
    smooth = (t[:, None, None, None] * torch.ones(40, 32, 32, 3)) * 0.5 + 0.2   # steady fade = steady motion
    r = seams.rate_video(smooth[:20], smooth[20:])
    assert r["verdict"] == "ok", r
    jump = smooth.clone()
    jump[20:] = jump[20:] + 0.25
    r = seams.rate_video(jump[:20], jump[20:])
    assert r["verdict"] == "hard" and r["ratio"] > 1.8, r


def test_rate_audio_flags_level_jump():
    sr = 16000
    w = torch.randn(1, 2 * sr) * 0.02
    w[:, sr:] *= 10
    r = seams.rate_audio(w, sr, sr)
    assert r["warn"] and r["db"] > 15


def test_vram_headroom_raises_and_restores(monkeypatch):
    monkeypatch.setattr(mm, "cpu_state", mm.CPUState.GPU)
    old = mm.EXTRA_RESERVED_VRAM
    with gen.vram_headroom(3):
        assert mm.EXTRA_RESERVED_VRAM == 3 * 1024 ** 3
    assert mm.EXTRA_RESERVED_VRAM == old
    with gen.vram_headroom(0.0001):   # never lowers a bigger reserve
        assert mm.EXTRA_RESERVED_VRAM == old


def test_settings_defaults_and_seam_params():
    p = core.normalize_project({})
    assert p["settings"]["audio_declick"] is True and p["settings"]["vram_headroom_gb"] == 0.0
    assert core.audio_seam_params(p)["declick"] is True
    assert "audio_declick" in core.GLOBAL_KEYS and "vram_headroom_gb" in core.GLOBAL_KEYS


def _drift_clip():
    torch.manual_seed(0)
    base = torch.rand(1, 64, 96, 3) * 0.6 + 0.2
    mv = torch.linspace(0, 0.02, 40)[:, None, None, None]
    return torch.cat([(base + mv[:20]).clamp(0, 1), (base + mv[20:] + 0.06).clamp(0, 1)])


def test_level_lock_matches_join_and_leaves_far_frames():
    f = _drift_clip()
    raw = f.clone()
    before = seams.rate_video(f[:20], f[20:])
    info = seams.level_lock(f, 20, n=8)
    after = seams.rate_video(f[:20], f[20:])
    assert before["verdict"] == "hard" and after["verdict"] == "ok"
    assert info["offset"][0] < -10 and all(abs(g - 1) < 0.05 for g in info["gain"])
    assert torch.equal(f[:12], raw[:12]) and torch.equal(f[28:], raw[28:])   # only the window each side
    assert (f[19] - raw[19]).mean() > 0 > (f[20] - raw[20]).mean()           # both sides meet in the middle
    # a real lighting change is softened, never flattened: the mean shift is limited
    g = raw.clone(); g[20:] = (g[20:] + 0.4).clamp(0, 1)
    seams.level_lock(g, 20)
    assert float(g[20].mean() - g[19].mean()) > 0.1
    assert seams.level_lock(f[:3], 1) is None and seams.level_lock(f, 20, n=0) is None


def test_level_lock_in_run_only_touches_decoded_frames(tmp_path, monkeypatch):
    import folder_paths
    import importlib, sys
    sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
    tg = importlib.import_module("test_gen")
    from fakes import tiny_patcher, FakeClip, FakeVAE
    out, inp = tmp_path / "out", tmp_path / "in"
    out.mkdir(); (inp / "h3zerostudio").mkdir(parents=True)
    from PIL import Image
    for n in ("hero.png", "city.png"):
        Image.new("RGB", (32, 32), (120, 80, 40)).save(inp / "h3zerostudio" / n)
    monkeypatch.setattr(folder_paths, "get_output_directory", lambda: str(out))
    monkeypatch.setattr(folder_paths, "get_input_directory", lambda: str(inp))
    pt = tiny_patcher()
    img1, _, lat1, info1 = gen.run_project(pt, FakeClip(), FakeVAE(), tg.project())
    s1 = info1["segments"][1]["seam"]
    assert s1["raw"]["ratio"] >= s1["ratio"] and "level" in s1
    p = tg.project(); p["settings"]["level_lock"] = False
    img2, _, lat2, info2 = gen.run_project(pt, FakeClip(), FakeVAE(), p)
    assert all(r["cached"] for r in info2["segments"])                      # not in the cache key
    assert "raw" not in info2["segments"][1]["seam"]
    assert torch.equal(lat1["samples"].tensors[0], lat2["samples"].tensors[0])
    assert info1["full"]["key"] != info2["full"]["key"] and not torch.equal(img1, img2)
    assert core.level_lock_frames(core.normalize_project({"settings": {"level_lock_frames": 999}})) == 48
    assert "level_lock" in core.GLOBAL_KEYS and "level_lock_frames" in core.GLOBAL_KEYS

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
    assert p["settings"]["audio_declick"] is True and p["settings"]["vram_headroom_gb"] == 1.0
    assert core.audio_seam_params(p)["declick"] is True
    assert "audio_declick" in core.GLOBAL_KEYS and "vram_headroom_gb" in core.GLOBAL_KEYS

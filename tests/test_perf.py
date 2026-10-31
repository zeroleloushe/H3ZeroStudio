"""Memory / time fixes: a run must not get slower as the project grows (chunked uint8 conversion, streaming mp4,
filmstrip of only the picked frames, stitching with a single copy, bounded cache-miss scan)."""
import json
import os
import time

import av
import numpy as np
import torch

from h3s import h3s_gen as gen
from h3s import h3s_media as media
from h3s import h3s_store as store


def _old_to_uint8(frames):
    return (frames[..., :3].clamp(0, 1) * 255.0 + 0.5).to("cpu").byte().numpy()


def test_to_uint8_chunked_equals_one_shot():
    torch.manual_seed(0)
    fr = torch.rand(37, 9, 13, 3) * 1.4 - 0.2   # out-of-range values are clamped the same way
    assert np.array_equal(media.to_uint8(fr, chunk=5), _old_to_uint8(fr))
    assert np.array_equal(media.to_uint8(fr), _old_to_uint8(fr))
    assert media.to_uint8(torch.zeros(0, 4, 4, 3)).shape == (0, 4, 4, 3)
    assert media.to_uint8(torch.rand(3, 4, 4, 4)).shape == (3, 4, 4, 3)   # alpha dropped, as before


def test_write_mp4_streams_frames_and_downscales(tmp_path):
    fr = torch.zeros(40, 48, 96, 3)   # more frames than one chunk
    fr[..., 0] = torch.linspace(0, 1, 40).view(40, 1, 1)
    p = str(tmp_path / "a.mp4")
    media.write_mp4(p, fr, 24)
    with av.open(p) as c:
        st = c.streams.video[0]
        assert (st.width, st.height) == (96, 48)
        n = sum(1 for _ in c.decode(st))
    assert n == 40
    q = str(tmp_path / "b.mp4")
    media.write_mp4(q, fr, 24, max_width=64)   # the preview path: resized chunk by chunk
    with av.open(q) as c:
        st = c.streams.video[0]
        assert (st.width, st.height) == (64, 32)
        assert sum(1 for _ in c.decode(st)) == 40


def test_write_strip_converts_only_picked_frames(tmp_path, monkeypatch):
    seen = []
    real = media.to_uint8
    monkeypatch.setattr(media, "to_uint8", lambda f, *a, **k: (seen.append(int(f.shape[0])), real(f, *a, **k))[1])
    fr = torch.rand(124, 16, 24, 3)
    p = str(tmp_path / "s.jpg")
    media.write_strip(p, fr)
    assert os.path.isfile(p) and seen == [media.STRIP_COUNT]   # 24 frames converted, not 124
    from PIL import Image
    assert Image.open(p).size[0] == max(8, round(24 * 72 / 16)) * media.STRIP_COUNT
    media.write_strip(str(tmp_path / "one.jpg"), fr[:1])        # a one-frame clip still works
    assert seen[-1] == 1


def test_cat_release_matches_cat_and_frees_parts():
    a, b, c = torch.rand(5, 4, 6, 3), torch.rand(2, 4, 6, 3), torch.rand(7, 4, 6, 3)
    want = torch.cat([a, b, c], dim=0)
    parts = [a[1:], b, c]
    out, lens = gen.cat_release(parts)
    assert torch.equal(out, torch.cat([a[1:], b, c], dim=0)) and lens == [4, 2, 7]
    assert parts == [None, None, None]   # nothing keeps the pieces alive
    assert out.shape[0] == want.shape[0] - 1


def test_level_lock_joins_accepts_lengths_like_tensors(monkeypatch):
    from h3s import h3s_seams
    seen = []
    monkeypatch.setattr(h3s_seams, "level_lock", lambda images, at, n: seen.append(at) or None)
    items = [{"link": "start", "overlap": 0}, {"link": "extend", "overlap": 22}, {"link": "extend", "overlap": 22}]
    imgs = torch.zeros(30, 2, 2, 3)
    gen.level_lock_joins(imgs, [torch.zeros(10, 2, 2, 3), torch.zeros(8, 2, 2, 3), torch.zeros(6, 2, 2, 3)], items, [{}, {}, {}], 12)
    by_tensor = list(seen)
    seen.clear()
    gen.level_lock_joins(imgs, [10, 8, 6], items, [{}, {}, {}], 12)
    assert seen == by_tensor == [10, 18]


def test_miss_reason_scans_only_the_newest_takes(tmp_path, monkeypatch):
    d = str(tmp_path)
    monkeypatch.setattr(store, "MISS_SCAN_MAX", 5)
    parts = {"prompt": "a", "wh": [1, 1]}
    base = time.time() - 1000
    for i in range(40):   # 40 takes of other clips + the newest ones
        td = store.take_dir(d, f"k{i}", True)
        with open(os.path.join(td, "recipe.json"), "w", encoding="utf-8") as f:
            json.dump({"seg_id": "A" if i == 39 else f"o{i}", "kind": "full", "parts": parts, "created": i}, f)
        os.utime(td, (base + i, base + i))
    reads = []
    real_open = open
    import builtins

    def spy(path, *a, **k):
        if str(path).endswith("recipe.json"):
            reads.append(path)
        return real_open(path, *a, **k)
    monkeypatch.setattr(builtins, "open", spy)
    assert store.miss_reason(d, "A", "full", dict(parts, prompt="b")).startswith("промпт")   # newest take is found
    assert len(reads) <= 5   # not all 40 recipes were opened
    reads.clear()
    assert "прежних дублей" in store.miss_reason(d, "o0", "full", parts)   # an old clip beyond the window: generic text
    assert store.miss_reason(str(tmp_path / "nothing"), "A", "full", parts).startswith("новый отрезок")

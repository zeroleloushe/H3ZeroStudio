"""AV latent safetensors sidecar: save/load, header peek, VAE mismatch."""
import os
import tempfile

import torch
import pytest

from h3s import h3s_av_latent as av


def test_save_load_roundtrip(tmp_path):
    v = torch.randn(1, 4, 5, 8, 12)
    a = torch.randn(1, 8, 20)
    path = tmp_path / "lat.safetensors"
    av.save(str(path), v, a, fps=24, vae="demo_vae.safetensors", extra={"kind": "full"})
    vv, aa, h = av.load(str(path), expect_vae="demo_vae.safetensors")
    assert torch.allclose(vv, v.float()) and torch.allclose(aa, a.float())
    assert h["ok"] and h["vae"] == "demo_vae.safetensors" and h["fps"] == 24


def test_peek_header_no_tensors(tmp_path):
    v = torch.randn(1, 4, 3, 4, 6)
    a = torch.zeros(1, 8, 5)
    path = str(tmp_path / "x.safetensors")
    av.save(path, v, a, fps=24, vae="v.safetensors")
    h = av.peek_header(path)
    assert h["ok"] and h["dims"]["width"] == 96 and h["dims"]["height"] == 64
    assert h["dims"]["tokens"] == 3


def test_vae_mismatch_rejects(tmp_path):
    path = str(tmp_path / "y.safetensors")
    av.save(path, torch.zeros(1, 4, 2, 2, 2), torch.zeros(1, 2, 2), vae="a.safetensors")
    bad = av.validate(path, expect_vae="b.safetensors")
    assert not bad["ok"] and "VAE" in bad["reason"]
    with pytest.raises(ValueError, match="VAE"):
        av.load(path, expect_vae="b.safetensors")


def test_companion_path():
    assert av.companion_path("/x/cache/seg_ab.pt").endswith("seg_ab.safetensors")

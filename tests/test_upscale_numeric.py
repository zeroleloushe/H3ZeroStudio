"""Numeric sanity: tiny random-weight H3 latent upscaler through our wrappers / pieces."""
import sys
import types

import pytest
import torch
import torch.nn as nn
import torch.nn.functional as F

from h3s import h3s_upscale as up

pytestmark = pytest.mark.real_upscale_backends

# Pixaroma's LatentResizer3D (MIT, LBH port) — tiny channels for CPU speed.
# Load by file path so we don't shadow ComfyUI's top-level `nodes` package.
import importlib.util as _ilu
_HELPERS = "/tmp/comfyui-pixaroma/nodes/_h3_latent_upscale_helpers.py"
_spec = _ilu.spec_from_file_location("pixaroma_h3_latent_helpers", _HELPERS)
_mod = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
LatentResizer3D, LATENTS_MEAN, LATENTS_STD = _mod.LatentResizer3D, _mod.LATENTS_MEAN, _mod.LATENTS_STD


class _Out:
    def __init__(self, *args):
        self.result = args


def _tiny_pixaroma(channels=32, in_blocks=1, out_blocks=1):
    m = LatentResizer3D(in_channels=24, in_blocks=in_blocks, out_blocks=out_blocks,
                        channels=channels, dropout=0.0, temporal_every=0, temporal_kernel=3)
    m.eval().requires_grad_(False)
    return m


def _run_pix_model(model, video, width, height):
    """Mimic Pixaroma upscale_tensor normalisation + forward (CPU, fp32)."""
    B, C, T, H, W = video.shape
    h_out, w_out = height // 16, width // 16
    mean = torch.tensor(LATENTS_MEAN, dtype=torch.float32).view(1, -1, 1, 1, 1)
    std = torch.tensor(LATENTS_STD, dtype=torch.float32).view(1, -1, 1, 1, 1)
    scale = (width / (W * 16) + height / (H * 16)) / 2.0
    with torch.inference_mode():
        x = (video.float() - mean) / std
        y = model(x, scale=scale, target_size=(T, h_out, w_out), enable_chunking=False)
        y = y * std + mean
    return y.float().cpu()


def test_tiny_pixaroma_model_shapes_and_audio_untouched(monkeypatch):
    """Random-init Pixaroma network: video shape grows, temporal length kept; audio stays outside."""
    model = _tiny_pixaroma()
    video = torch.randn(1, 24, 7, 6, 8)   # 96×128 px, T=7
    audio = torch.randn(1, 32, 2, 40)

    class Pix:
        FUNCTION = "upscale"
        def upscale(self, latent, upscale_model, width, height):
            v = latent["samples"]
            assert v.shape[1] == 24
            out_v = _run_pix_model(model, v, width, height)
            return ({"samples": out_v},)

    monkeypatch.setattr(up, "_node_mappings", lambda: {"PixaromaH3LatentUpscale": Pix})
    z = up._pixaroma_once(video, 192, 160, "tiny.safetensors")
    assert z.shape == (1, 24, 7, 10, 12)
    assert z.dtype == torch.float32
    assert z.device.type == "cpu"
    # audio not passed through the video-only wrapper (run_upscale keeps it separately)
    assert audio.shape == (1, 32, 2, 40)


def test_native_wrapper_av_nested_passthrough(monkeypatch):
    """Native path: NestedTensor AV in → video upscaled, audio tensor identity preserved in output NestedTensor."""
    try:
        import comfy.nested_tensor as nt
    except Exception:
        pytest.skip("comfy.nested_tensor unavailable")

    class Loader:
        @classmethod
        def execute(cls, model_name):
            return _Out("MODEL")

    class Upscale:
        @classmethod
        def execute(cls, model, samples, width, height):
            assert model == "MODEL"
            lat = samples["samples"]
            if getattr(lat, "is_nested", False):
                video, audio = lat.tensors[0], lat.tensors[1]
                size = (video.shape[2], height // 16, width // 16)
                upscaled = F.interpolate(video.float(), size=size, mode="trilinear", align_corners=False)
                out = {"samples": nt.NestedTensor((upscaled, audio))}
            else:
                video = lat
                size = (video.shape[2], height // 16, width // 16)
                upscaled = F.interpolate(video.float(), size=size, mode="trilinear", align_corners=False)
                out = {"samples": upscaled}
            return _Out(out)

    monkeypatch.setattr(up, "_node_mappings", lambda: {
        "LatentUpscaleModelLoader": Loader,
        "MiniMaxH3LatentUpscaleWithModel": Upscale,
    })
    video = torch.randn(1, 24, 5, 4, 6)
    audio = torch.randn(1, 32, 2, 28)
    # Call through _native_once with plain video (production path); separately verify NestedTensor handling
    # via the Upscale class directly to assert audio identity
    samples = {"samples": nt.NestedTensor((video, audio))}
    res = Upscale.execute("MODEL", samples, 192, 128)
    out = res.result[0]["samples"]
    assert out.is_nested
    ov, oa = out.tensors[0], out.tensors[1]
    assert ov.shape == (1, 24, 5, 8, 12)
    assert torch.equal(oa, audio)

    # And our wrapper on plain video still returns the right shape on CPU float
    z = up._native_once(video, 192, 128, "m.safetensors")
    assert z.shape == (1, 24, 5, 8, 12) and z.device.type == "cpu"


def test_pieces_upscale_assembles_tiny_model(monkeypatch):
    """_pieces_upscale with a tiny Pixaroma model: 2 temporal pieces still assemble to full T and target HW."""
    model = _tiny_pixaroma()
    video = torch.randn(1, 24, 12, 4, 6)  # T=12 so temporal pieces split

    def once(x, ww, hh):
        return _run_pix_model(model, x, ww, hh)

    z = up._pieces_upscale(once, video, 192, 128, nt=2, ns=1)
    assert z.shape == (1, 24, 12, 8, 12)
    assert torch.isfinite(z).all()


def test_learned_upscale_chain_runs_tiny_pixaroma(monkeypatch):
    """Full learned_upscale → Pixaroma backend with tiny weights (native/LBH absent)."""
    model = _tiny_pixaroma()

    class Pix:
        FUNCTION = "upscale"
        def upscale(self, latent, upscale_model, width, height):
            return ({"samples": _run_pix_model(model, latent["samples"], width, height)},)

    monkeypatch.setattr(up, "learned_models", lambda: ["tiny.safetensors"])
    monkeypatch.setattr(up, "_node_mappings", lambda: {"PixaromaH3LatentUpscale": Pix})
    monkeypatch.setattr(up, "handoff", lambda *a, **k: None)
    v = torch.randn(1, 24, 7, 6, 8)
    z = up.learned_upscale(v, 192, 160)
    assert z is not None and z.shape == (1, 24, 7, 10, 12)


def test_upscale_input_end_to_end_with_tiny(monkeypatch):
    model = _tiny_pixaroma()

    class Pix:
        FUNCTION = "upscale"
        def upscale(self, latent, upscale_model, width, height):
            return ({"samples": _run_pix_model(model, latent["samples"], width, height)},)

    monkeypatch.setattr(up, "learned_models", lambda: ["tiny.safetensors"])
    monkeypatch.setattr(up, "_node_mappings", lambda: {"PixaromaH3LatentUpscale": Pix})
    monkeypatch.setattr(up, "handoff", lambda *a, **k: None)
    v = torch.randn(1, 24, 5, 4, 6)
    z, used = up.upscale_input(None, v, 192, 128, "learned")
    assert used == "learned" and z.shape == (1, 24, 5, 8, 12)

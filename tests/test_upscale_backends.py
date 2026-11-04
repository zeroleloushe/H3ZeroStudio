"""Learned latent upscale backend chain: native → Pixaroma → LBH → stretch."""
import types

import pytest
import torch

from h3s import h3s_upscale as up

pytestmark = pytest.mark.real_upscale_backends


class _Out:
    """Minimal ComfyUI NodeOutput stand-in (.result tuple)."""
    def __init__(self, *args):
        self.result = args


def _patch_mappings(monkeypatch, mapping):
    """Install a fake nodes.NODE_CLASS_MAPPINGS dict used by up.node_class / backend_flags."""
    fake = types.SimpleNamespace(NODE_CLASS_MAPPINGS=dict(mapping))
    monkeypatch.setitem(__import__("sys").modules, "nodes", fake)
    # also clear any cached import side-effects by patching the helpers directly when needed
    monkeypatch.setattr(up, "_node_mappings", lambda: dict(mapping))


def test_align32():
    assert up.align32(100) == 96   # 3.125 → 3
    assert up.align32(96) == 96
    assert up.align32(97) == 96
    assert up.align32(112) == 128  # 3.5 → 4 (Py round half-even → 4)
    assert up.align32(31) == 32
    assert up.align32(0) == 32
    for n in (32, 64, 128, 768, 1344, 1920, 2560):
        assert up.align32(n) == n
    assert up.align32(50) == 64
    assert up.align32(40) == 32


def test_backend_flags_and_order(monkeypatch):
    _patch_mappings(monkeypatch, {
        "MiniMaxH3LatentUpscaleWithModel": object,
        "LatentUpscaleModelLoader": object,
        "PixaromaH3LatentUpscale": object,
        "MinimaxH3LatentUpscaler3D": object,
    })
    assert up.available_backends() == ["native", "pixaroma", "lbh"]
    _patch_mappings(monkeypatch, {"PixaromaH3LatentUpscale": object, "MinimaxH3LatentUpscaler3D": object})
    assert up.available_backends() == ["pixaroma", "lbh"]
    _patch_mappings(monkeypatch, {"MinimaxH3LatentUpscaler3D": object})
    assert up.available_backends() == ["lbh"]
    # native needs BOTH upscale node and loader
    _patch_mappings(monkeypatch, {"MiniMaxH3LatentUpscaleWithModel": object})
    assert up.available_backends() == []


def test_capabilities_learned_any_backend(monkeypatch):
    monkeypatch.setattr(up, "learned_models", lambda: ["m.safetensors"])
    _patch_mappings(monkeypatch, {"PixaromaH3LatentUpscale": object})
    caps = up.capabilities()
    assert caps["learned"] and caps["learned_node"] and caps["backend"] == "pixaroma"
    assert caps["backends"]["pixaroma"] and not caps["backends"]["native"]
    _patch_mappings(monkeypatch, {})
    caps = up.capabilities()
    assert not caps["learned"] and caps["input"] == "stretch"


def test_selection_order_prefers_native(monkeypatch):
    """First available backend that returns a shaped tensor wins; later ones are not called."""
    monkeypatch.setattr(up, "learned_models", lambda: ["m.safetensors"])
    called = []

    def make(tag, boom=False):
        def fn(x, ww, hh, name):
            called.append(tag)
            if boom:
                raise RuntimeError(f"{tag} boom")
            # return target latent size
            return torch.zeros(1, x.shape[1], x.shape[2], hh // 16, ww // 16)
        return fn

    _patch_mappings(monkeypatch, {
        "MiniMaxH3LatentUpscaleWithModel": object,
        "LatentUpscaleModelLoader": object,
        "PixaromaH3LatentUpscale": object,
        "MinimaxH3LatentUpscaler3D": object,
    })
    monkeypatch.setattr(up, "_BACKEND_CALL", {
        "native": make("native"),
        "pixaroma": make("pixaroma"),
        "lbh": make("lbh"),
    })
    monkeypatch.setattr(up, "handoff", lambda *a, **k: None)
    v = torch.randn(1, 24, 7, 4, 6)
    z = up.learned_upscale(v, 192, 128)
    assert z.shape == (1, 24, 7, 8, 12)
    assert called == ["native"]


def test_fallthrough_on_exception(monkeypatch):
    monkeypatch.setattr(up, "learned_models", lambda: ["m.safetensors"])
    called = []

    def make(tag, boom=False):
        def fn(x, ww, hh, name):
            called.append(tag)
            if boom:
                raise RuntimeError(f"{tag} boom")
            return torch.zeros(1, x.shape[1], x.shape[2], hh // 16, ww // 16)
        return fn

    _patch_mappings(monkeypatch, {
        "MiniMaxH3LatentUpscaleWithModel": object,
        "LatentUpscaleModelLoader": object,
        "PixaromaH3LatentUpscale": object,
        "MinimaxH3LatentUpscaler3D": object,
    })
    monkeypatch.setattr(up, "_BACKEND_CALL", {
        "native": make("native", boom=True),
        "pixaroma": make("pixaroma", boom=True),
        "lbh": make("lbh", boom=False),
    })
    v = torch.randn(1, 24, 5, 4, 6)
    z = up.learned_upscale(v, 192, 128)
    assert z.shape[-2:] == (8, 12)
    assert called == ["native", "pixaroma", "lbh"]


def test_all_backends_fail_returns_none(monkeypatch):
    monkeypatch.setattr(up, "learned_models", lambda: ["m.safetensors"])
    _patch_mappings(monkeypatch, {"MinimaxH3LatentUpscaler3D": object})
    monkeypatch.setattr(up, "_BACKEND_CALL", {
        "native": lambda *a, **k: (_ for _ in ()).throw(RuntimeError("n")),
        "pixaroma": lambda *a, **k: (_ for _ in ()).throw(RuntimeError("p")),
        "lbh": lambda *a, **k: (_ for _ in ()).throw(RuntimeError("l")),
    })
    v = torch.randn(1, 24, 5, 4, 6)
    assert up.learned_upscale(v, 192, 128) is None


def test_upscale_input_uses_chain_then_stretch(monkeypatch):
    monkeypatch.setattr(up, "available_backends", lambda: ["lbh"])
    monkeypatch.setattr(up, "learned_models", lambda: ["m.safetensors"])
    monkeypatch.setattr(up, "learned_upscale", lambda *a, **k: None)
    monkeypatch.setattr(up, "handoff", lambda *a, **k: None)
    v = torch.randn(1, 24, 5, 4, 6)
    z, used = up.upscale_input(None, v, 192, 128, "learned")
    assert used == "stretch" and z.shape == (1, 24, 5, 8, 12)


def test_native_wrapper_passes_model_samples_wh(monkeypatch):
    """_native_once loads via LatentUpscaleModelLoader then calls MiniMaxH3LatentUpscaleWithModel.execute."""
    seen = {}

    class Loader:
        @classmethod
        def execute(cls, model_name):
            seen["model_name"] = model_name
            return _Out({"fake_model": True})

    class Upscale:
        @classmethod
        def execute(cls, model, samples, width, height):
            seen["model"] = model
            seen["samples_shape"] = tuple(samples["samples"].shape)
            seen["wh"] = (width, height)
            B, C, T, H, W = samples["samples"].shape
            out = torch.zeros(B, C, T, height // 16, width // 16)
            return _Out({"samples": out})

    _patch_mappings(monkeypatch, {
        "LatentUpscaleModelLoader": Loader,
        "MiniMaxH3LatentUpscaleWithModel": Upscale,
    })
    v = torch.randn(1, 24, 7, 6, 8)  # 96x128 px
    z = up._native_once(v, 192, 160, "h3.safetensors")  # 160→160, 192→192
    assert seen["model_name"] == "h3.safetensors"
    assert seen["model"] == {"fake_model": True}
    assert seen["samples_shape"] == (1, 24, 7, 6, 8)
    assert seen["wh"] == (192, 160)
    assert z.shape == (1, 24, 7, 10, 12)


def test_pixaroma_wrapper_passes_latent_name_wh(monkeypatch):
    seen = {}

    class Pix:
        FUNCTION = "upscale"
        def upscale(self, latent, upscale_model, width, height):
            seen["name"] = upscale_model
            seen["wh"] = (width, height)
            seen["shape"] = tuple(latent["samples"].shape)
            B, C, T, H, W = latent["samples"].shape
            return ({"samples": torch.zeros(B, C, T, height // 16, width // 16)},)

    _patch_mappings(monkeypatch, {"PixaromaH3LatentUpscale": Pix})
    v = torch.randn(1, 24, 5, 4, 6)
    z = up._pixaroma_once(v, 192, 128, "m.safetensors")
    assert seen == {"name": "m.safetensors", "wh": (192, 128), "shape": (1, 24, 5, 4, 6)}
    assert z.shape == (1, 24, 5, 8, 12)


def test_stretch_warn_mentions_all_backends():
    w = up.STRETCH_WARN
    assert "trilinear" in w.lower() or "растянут" in w
    assert "MiniMaxH3LatentUpscaleWithModel" in w
    assert "PixaromaH3LatentUpscale" in w
    assert "MinimaxH3LatentUpscaler3D" in w


def test_learned_upscale_aligns_odd_sizes(monkeypatch):
    monkeypatch.setattr(up, "learned_models", lambda: ["m.safetensors"])
    got = {}

    def fn(x, ww, hh, name):
        got["wh"] = (ww, hh)
        return torch.zeros(1, x.shape[1], x.shape[2], hh // 16, ww // 16)

    _patch_mappings(monkeypatch, {"MinimaxH3LatentUpscaler3D": object})
    monkeypatch.setattr(up, "_BACKEND_CALL", {"native": fn, "pixaroma": fn, "lbh": fn})
    v = torch.randn(1, 24, 5, 4, 6)
    z = up.learned_upscale(v, 100, 50)  # → align32
    assert got["wh"][0] % 32 == 0 and got["wh"][1] % 32 == 0
    assert z.shape[-1] == got["wh"][0] // 16 and z.shape[-2] == got["wh"][1] // 16

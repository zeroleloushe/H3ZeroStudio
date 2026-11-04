"""Latent upscale without the learned model: spatial trilinear stretch, then refine continues."""
import torch
import pytest

from h3s import h3s_upscale as upscale


def test_latent_stretch_spatial_only():
    v = torch.randn(1, 4, 11, 8, 12)   # T=11, h=8, w=12 latent cells
    z = upscale.latent_stretch(v, 384, 256)   # 24×16 cells
    assert z.shape == (1, 4, 11, 16, 24)
    # temporal unchanged, spatial changed
    assert z.shape[2] == v.shape[2]


def test_upscale_input_falls_back_to_stretch(monkeypatch):
    monkeypatch.setattr(upscale, "available_backends", lambda: [])
    monkeypatch.setattr(upscale, "learned_models", lambda: [])
    v = torch.randn(1, 4, 5, 4, 6)
    z, used = upscale.upscale_input(None, v, 192, 128, "learned")
    assert used == "stretch" and z.shape[-2:] == (8, 12) and z.shape[2] == 5


def test_upscale_input_stretch_when_learned_fails(monkeypatch):
    monkeypatch.setattr(upscale, "available_backends", lambda: ["lbh"])
    monkeypatch.setattr(upscale, "learned_models", lambda: ["x.safetensors"])
    monkeypatch.setattr(upscale, "learned_upscale", lambda *a, **k: None)
    monkeypatch.setattr(upscale, "handoff", lambda *a, **k: None)
    v = torch.randn(1, 4, 5, 4, 6)
    z, used = upscale.upscale_input(None, v, 192, 128, "learned")
    assert used == "stretch" and z.shape == (1, 4, 5, 8, 12)


def test_effective_input_and_env_tag_stretch(monkeypatch):
    monkeypatch.setattr(upscale, "capabilities", lambda: {"learned": False, "learned_models": [], "learned_node": False})
    assert upscale.effective_input("latent") == "stretch"
    assert upscale.env_tag("latent") == "stretch"
    monkeypatch.setattr(upscale, "capabilities", lambda: {"learned": True, "learned_models": ["a.safetensors"], "learned_node": True})
    monkeypatch.setattr(upscale, "picked_learned_model", lambda m=None: "a.safetensors")
    assert upscale.effective_input("tiles") == "learned"
    assert upscale.env_tag("tiles").startswith("learned:")


def test_stretch_warn_constant_and_ui_wiring():
    assert "растянут" in upscale.STRETCH_WARN or "trilinear" in upscale.STRETCH_WARN.lower()
    assert "PixaromaH3LatentUpscale" in upscale.STRETCH_WARN
    assert "MiniMaxH3LatentUpscaleWithModel" in upscale.STRETCH_WARN
    import os
    root = os.path.join(os.path.dirname(__file__), "..", "web", "js")
    ed = open(os.path.join(root, "h3s_editor.js"), encoding="utf-8").read()
    assert 'd.event === "warn"' in ed and 'input === "stretch"' in ed
    assert 'upscale_stretch' in ed and '_stretchToast' in ed
    assert 'stretch: T("растяжение латента")' in ed
    assert "PixaromaH3LatentUpscale" in ed
    up = open(os.path.join(root, "h3s_upscale.js"), encoding="utf-8").read()
    assert "upStretchMode()" in up and "upStretchNote()" in up
    assert 'class: "h3z-note warn"' in up
    assert "upAvail() { return true; }" in up
    assert "PixaromaH3LatentUpscale" in up
    # methods: latent + tiles only (no RTX)
    core = open(os.path.join(root, "h3s_core.js"), encoding="utf-8").read()
    assert 'SEG_UPSCALE_METHODS = ["latent", "tiles"]' in core
    assert "rtx" not in core.lower() or 'method: "tiles"' in core  # migrate path ok

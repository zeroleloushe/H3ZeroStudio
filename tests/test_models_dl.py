"""Model downloads: presence-only status, alternatives, subfolders. No real downloads."""
import os
import pytest
from h3s import h3s_models_dl as mdl


def test_manifest_schema_and_alts():
    assert mdl.MANIFEST
    ids = set()
    for m in mdl.MANIFEST:
        for k in ("id", "group", "label", "folder", "filename", "url", "size_bytes", "size_label"):
            assert k in m
        assert isinstance(m.get("alternatives"), list)
        assert m["id"] not in ids; ids.add(m["id"])
        assert m.get("verified") is True
    up = mdl.by_id("latent_upscaler")
    assert "conv_v1_fp16" in up["filename"]
    assert "minimax_h3_latent_upscaler_3d_bf16.safetensors" in up["alternatives"]


def test_safe_target_path_rejects_traversal(tmp_path, monkeypatch):
    root = tmp_path / "diffusion_models"; root.mkdir()
    monkeypatch.setattr(mdl, "_folder_roots", lambda kind: [str(root)] if kind == "diffusion_models" else [])
    assert mdl.safe_target_path("diffusion_models", "a.safetensors").endswith("a.safetensors")
    with pytest.raises(ValueError):
        mdl.safe_target_path("diffusion_models", "../x.safetensors")


def test_status_presence_ignores_size_alts_subfolder(tmp_path, monkeypatch):
    roots = {}
    for folder in ("vae", "loras", "latent_upscale_models", "diffusion_models", "text_encoders", "vae_approx", "veda"):
        d = tmp_path / folder; d.mkdir(); roots[folder] = str(d)
    monkeypatch.setattr(mdl, "_folder_roots", lambda kind: [roots[kind]] if kind in roots else [])

    va = mdl.by_id("vae_video")
    with open(os.path.join(roots["vae"], va["filename"]), "wb") as f:
        f.write(b"x" * 100)  # tiny vs ~2.8GB — still installed
    scan = mdl.status_scan([va])
    assert scan["models"][0]["status"] == "installed"

    up = mdl.by_id("latent_upscaler")
    with open(os.path.join(roots["latent_upscale_models"], "MiniMax_H3_Latent_Upscaler_3D_BF16.safetensors"), "wb") as f:
        f.write(b"bf16")
    scan = mdl.status_scan([up])
    assert scan["models"][0]["status"] == "installed"
    assert scan["models"][0]["found_alt"] is True

    lo = mdl.by_id("lora_turbo")
    sub = os.path.join(roots["loras"], "Minimax H3"); os.makedirs(sub)
    with open(os.path.join(sub, lo["filename"]), "wb") as f:
        f.write(b"lora")
    scan = mdl.status_scan([lo])
    assert scan["models"][0]["status"] == "installed"


def test_start_rejects_unknown():
    assert mdl.start("no_such")["ok"] is False


def test_routes_wired():
    root = os.path.dirname(os.path.dirname(__file__))
    assert "/h3zero/models/downloads" in open(os.path.join(root, "routes.py"), encoding="utf-8").read()
    js = open(os.path.join(root, "web", "js", "h3s_settings.js"), encoding="utf-8").read()
    assert "mdlDownloadsPanel" in js

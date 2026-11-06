"""LoRA picker preview: resolve only under ComfyUI loras folders, no path traversal."""
import os
import json

import pytest

from h3s import h3s_models as hm


@pytest.fixture
def lora_tree(tmp_path, monkeypatch):
    root = tmp_path / "loras"
    root.mkdir()
    (root / "sub").mkdir()
    weight = root / "sub" / "cool.safetensors"
    weight.write_bytes(b"lora")
    prev = root / "sub" / "cool.png"
    prev.write_bytes(b"\x89PNG\r\n\x1a\n")  # tiny fake
    outside = tmp_path / "outside.png"
    outside.write_bytes(b"nope")
    # folder_paths stub
    class FP:
        @staticmethod
        def get_folder_paths(kind):
            assert kind == "loras"
            return [str(root)]
        @staticmethod
        def get_full_path(kind, name):
            assert kind == "loras"
            p = root / name.replace("\\", "/")
            return str(p) if p.is_file() else None
    import sys
    monkeypatch.setitem(sys.modules, "folder_paths", FP)
    return root, outside


def test_lora_preview_finds_sibling_png(lora_tree):
    root, _ = lora_tree
    p = hm.lora_preview_path("sub/cool.safetensors")
    assert p and os.path.basename(p) == "cool.png"
    assert os.path.realpath(p).startswith(os.path.realpath(str(root)))


def test_lora_preview_rejects_traversal_and_missing(lora_tree):
    assert hm.lora_preview_path("../outside.png") is None
    assert hm.lora_preview_path("sub/../../outside.png") is None
    assert hm.lora_preview_path("") is None
    assert hm.lora_preview_path(None) is None
    assert hm.lora_preview_path("sub/missing.safetensors") is None


def test_lora_preview_prefers_preview_png_and_civitai_local(lora_tree, tmp_path):
    root, _ = lora_tree
    # more specific .preview.png wins over .png in candidate order... actually
    # manager style cool.safetensors.preview.png is first; stem .preview.png next
    specific = root / "sub" / "cool.preview.png"
    specific.write_bytes(b"PREV")
    p = hm.lora_preview_path("sub/cool.safetensors")
    assert p.endswith("cool.preview.png") or p.endswith("cool.safetensors.preview.png") or p.endswith("cool.png")
    # civitai.info with local sibling name
    weight2 = root / "alt.safetensors"
    weight2.write_bytes(b"x")
    thumb = root / "thumb.webp"
    thumb.write_bytes(b"WEBP")
    (root / "alt.civitai.info").write_text(json.dumps({
        "preview": "https://example.com/ignored.png",
        "images": [{"url": "thumb.webp"}],
    }), encoding="utf-8")
    p2 = hm.lora_preview_path("alt.safetensors")
    assert p2 and os.path.basename(p2) == "thumb.webp"


def test_lora_preview_ignores_video_siblings(lora_tree):
    root, _ = lora_tree
    weight = root / "noisy.safetensors"
    weight.write_bytes(b"x")
    (root / "noisy.mp4").write_bytes(b"vid")
    (root / "noisy.webm").write_bytes(b"vid")
    (root / "noisy.preview.mp4").write_bytes(b"vid")
    (root / "noisy.safetensors.preview.mp4").write_bytes(b"vid")
    assert hm.lora_preview_path("noisy.safetensors") is None
    (root / "sub" / "cool.mp4").write_bytes(b"vid")
    (root / "sub" / "cool.preview.mp4").write_bytes(b"vid")
    p = hm.lora_preview_path("sub/cool.safetensors")
    assert p and os.path.basename(p) == "cool.png"


def test_lora_preview_skips_civitai_video_and_uses_image(lora_tree):
    root, _ = lora_tree
    weight = root / "mix.safetensors"
    weight.write_bytes(b"x")
    (root / "clip.mp4").write_bytes(b"vid")
    (root / "still.webp").write_bytes(b"WEBP")
    (root / "mix.civitai.info").write_text(json.dumps({
        "preview": "clip.mp4",
        "images": [
            {"url": "clip.mp4", "type": "video"},
            {"url": "still.webp", "type": "image"},
        ],
    }), encoding="utf-8")
    p = hm.lora_preview_path("mix.safetensors")
    assert p and os.path.basename(p) == "still.webp"


def test_lora_preview_route_registered():
    src = open(os.path.join(os.path.dirname(__file__), "..", "routes.py"), encoding="utf-8").read()
    assert '/h3zero/lora/preview' in src and "lora_preview_path" in src
    js = open(os.path.join(os.path.dirname(__file__), "..", "web", "js", "h3s_modeltab.js"), encoding="utf-8").read()
    assert "h3z-lp-prev" in js and "/h3zero/lora/preview?file=" in js
    assert 'h("video"' not in js
    assert "kind.startsWith(\"video/\")" in js

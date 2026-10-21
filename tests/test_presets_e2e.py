"""End to end on the box's tiny H3 model: a model & LoRA preset instead of wired inputs. The ComfyUI loaders are
pointed at the tiny model / fakes; the LoRA is a real one for the tiny model's weights (ComfyUI's LoRA path)."""
import os

import pytest
import torch

import folder_paths
from h3s import h3s_core as core
from h3s import h3s_gen as gen
from h3s import h3s_models as hm
from fakes import tiny_patcher, FakeClip, FakeVAE, FakeAudioVAE


@pytest.fixture()
def tiny_files(tmp_path, monkeypatch):
    import nodes
    import comfy.lora
    from safetensors.torch import save_file
    md = tmp_path / "models"
    for sub in ("diffusion_models", "text_encoders", "vae", "loras"):
        (md / sub).mkdir(parents=True)
        folder_paths.add_model_folder_path(sub, str(md / sub))
    for f in ("diffusion_models/tiny_h3.safetensors", "text_encoders/tiny_te.safetensors", "vae/tiny_vae.safetensors", "vae/tiny_audio_vae.safetensors"):
        save_file({"a": torch.zeros(1)}, str(md / f))
    pt = tiny_patcher()
    km = comfy.lora.model_lora_keys_unet(pt.model, {})
    sd = pt.model.state_dict()
    lk, tk = next((k, v) for k, v in km.items() if isinstance(v, str) and v in sd and sd[v].ndim == 2 and k.startswith("diffusion_model."))
    o, i = sd[tk].shape
    torch.manual_seed(1)
    save_file({f"{lk}.lora_up.weight": torch.randn(o, 4) * 0.5, f"{lk}.lora_down.weight": torch.randn(4, i) * 0.5}, str(md / "loras" / "tiny_style.safetensors"))
    loads = []

    class UNET:
        def load_unet(self, name, dtype):
            loads.append(name)
            return (tiny_patcher(),)

    class CLIPL:
        def load_clip(self, name, kind):
            return (FakeClip(),)

    class VAEL:
        def load_vae(self, name):
            return (FakeAudioVAE() if "audio" in name else FakeVAE(),)
    monkeypatch.setattr(nodes, "UNETLoader", UNET)
    monkeypatch.setattr(nodes, "CLIPLoader", CLIPL)
    monkeypatch.setattr(nodes, "VAELoader", VAEL)
    hm.release_all()
    yield loads
    hm.release_all()


def _preset(sm=0.5):
    return {"id": "tiny", "name": "Tiny", "base": "unet", "model": "tiny_h3.safetensors", "dtype": "default", "clip": "tiny_te.safetensors",
            "vae": "tiny_vae.safetensors", "audio_vae": "tiny_audio_vae.safetensors", "loras": [{"file": "tiny_style.safetensors", "sm": sm, "sc": 0}]}


def test_preset_run_cache_and_explained_miss(tiny_files, tmp_path, monkeypatch):
    out = tmp_path / "out"
    out.mkdir()
    folder_paths.set_output_directory(str(out))
    p = {"id": "e2e", "model_presets": {"tiny": _preset()},
         "settings": {"model_preset": "tiny", "prompt": "a cat", "res_mode": "custom", "width": 96, "height": 64, "steps": 2,
                      "cfg": 1.0, "sampler": "euler", "scheduler": "simple", "overlap_blocks": 1},
         "segments": [{"id": "s1", "frames": 39, "prompt": "walks"}, {"id": "s2", "frames": 56, "prompt": "runs"}]}
    logs = []
    real_log = gen.log
    monkeypatch.setattr(hm, "log", lambda s: logs.append(s))
    img1, aud, lat1, info = gen.run_project(None, None, None, p)   # nothing wired: everything from the preset
    k1 = info["keys"]
    assert img1.shape[0] == 73 and aud is not None and tiny_files == ["tiny_h3.safetensors"]
    assert info["segments"][0]["models"]["preset"] == "Tiny" and info["segments"][0]["models"]["loras"] == [["tiny_style.safetensors", 0.5, 0]]
    assert any("tiny_style.safetensors ×0.5" in s and ": 1/1 keys" in s for s in logs), logs   # the LoRA really patched the model
    # same preset: hits, no sampling and no VAE (take master + saved sound); the base stays cached
    boom = lambda *a, **k: (_ for _ in ()).throw(AssertionError("unexpected model / VAE call"))
    with monkeypatch.context() as m:
        m.setattr(gen, "sample_segment", boom)
        m.setattr(gen, "decode_video", boom)
        _, _, _, info2 = gen.run_project(None, None, None, p)
    assert info2["keys"] == k1 and all(r["cached"] for r in info2["segments"]) and tiny_files == ["tiny_h3.safetensors"]
    # LoRA strength changed: new keys, explained, the base is not loaded again, the result differs
    p["model_presets"]["tiny"] = _preset(0.8)
    glog = []
    monkeypatch.setattr(gen, "log", lambda s: (glog.append(s), real_log(s)))
    img3, _, lat3, info3 = gen.run_project(None, None, None, p)
    assert info3["keys"][0] != k1[0] and tiny_files == ["tiny_h3.safetensors"]
    miss = [s for s in glog if s.startswith("cache miss")]
    assert len(miss) == 2 and "LoRA tiny_style.safetensors: сила 0.5/0 → 0.8/0" in miss[0], miss
    v1, v3 = lat1["samples"].unbind()[0], lat3["samples"].unbind()[0]
    assert not torch.allclose(v3, v1, atol=1e-4)   # the LoRA strength reached the sampled latents


def test_no_preset_keeps_the_old_keys():
    """Without a preset the key environment is the wired signature, exactly as before the presets."""
    p = core.normalize_project({"segments": [{"frames": 39, "prompt": "x"}]})
    assert core.segment_keys(p, {}, "wired16charsig00") == core.segment_keys(p, {}, ["wired16charsig00"])
    assert core.preset_fingerprint(core.segment_preset(p, 0)) == ""

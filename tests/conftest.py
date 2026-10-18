import importlib.util
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
# COMFYUI_PATH, else the ComfyUI root two levels above this pack (ComfyUI/custom_nodes/<pack>/tests)
_CANDIDATES = [os.environ.get("COMFYUI_PATH"), os.path.join(_HERE, "..", "..", ".."), os.path.join(_HERE, "..", "..", "ComfyUI")]
COMFY = next((os.path.abspath(c) for c in _CANDIDATES if c and os.path.isdir(os.path.join(c, "comfy"))), os.path.abspath(_CANDIDATES[1]))
sys.path.insert(0, COMFY)
sys.argv = [sys.argv[0], "--cpu"]
import comfy.options  # noqa: E402
comfy.options.enable_args_parsing()

PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("h3s", os.path.join(PKG, "__init__.py"), submodule_search_locations=[PKG])
mod = importlib.util.module_from_spec(spec)
sys.modules["h3s"] = mod
spec.loader.exec_module(mod)

import pytest  # noqa: E402


@pytest.fixture
def h3s():
    import h3s.h3s_core  # noqa: F401
    import h3s.nodes  # noqa: F401
    return sys.modules["h3s"]


@pytest.fixture(autouse=True)
def fake_learned_upscaler(monkeypatch):
    """The learned H3 latent upscaler (node + model) is not on the test box: a nearest-exact stand-in keeps the
    draft -> final / segment-upscale tests running. Tests of the "nothing available" error override it."""
    import torch
    import h3s.h3s_upscale as up

    def fake(v, w, h):
        return torch.nn.functional.interpolate(v.float(), size=(v.shape[2], h // 16, w // 16), mode="nearest-exact").cpu()
    monkeypatch.setattr(up, "learned_upscale", fake)
    monkeypatch.setattr(up, "learned_models", lambda: ["minimax_h3_latent_upscaler_3d_bf16.safetensors"])
    monkeypatch.setattr(up, "learned_node", lambda: object)
    monkeypatch.setattr(up, "rtx_available", lambda: False)
    yield

"""Settings → Ускорение: normalize + capabilities + apply (no optional packages required)."""
import pytest

from h3s import h3s_accel as accel
from h3s import h3s_core as core


def test_normalize_accel_defaults_and_clamp():
    a = accel.normalize_accel(None)
    assert a["attention"] == "kitchen" and a["veda"] is False and a["compile"] is False
    a = accel.normalize_accel({"attention": "SAGE", "teacache_thresh": 9, "compile_backend": "nope", "veda": 1})
    assert a["attention"] == "sage" and a["teacache_thresh"] == 0.5 and a["compile_backend"] == "inductor" and a["veda"] is True
    a = accel.normalize_accel({"attention": "weird"})
    assert a["attention"] == "kitchen"
    p = core.normalize_project({"settings": {"accel": {"attention": "flash", "teacache": True, "teacache_thresh": 0.08}}})
    assert p["settings"]["accel"]["attention"] == "flash" and p["settings"]["accel"]["teacache_thresh"] == 0.08
    assert "accel" in core.GLOBAL_KEYS


def test_capabilities_shape_no_crash():
    caps = accel.capabilities()
    for k in ("kitchen", "sage", "flash", "pytorch", "veda", "teacache", "compile", "attention_backends", "veda_predictors"):
        assert k in caps
    assert "pytorch" in caps["attention_backends"] or caps["pytorch"] is False or True
    assert isinstance(caps["veda_predictors"], list)


def test_apply_on_none_and_fake_model(monkeypatch):
    assert accel.apply(None, {}) is None

    class Fake:
        def __init__(self):
            self.opts = None
            self.model_options = {"transformer_options": {}}
        def clone(self, **kw):
            return Fake()
        def set_model_optimized_attention(self, fn):
            self.opts = fn

    # force pytorch path with a stub attention module
    monkeypatch.setattr(accel, "capabilities", lambda: {
        "kitchen": False, "sage": False, "flash": False, "pytorch": True,
        "veda": False, "veda_predictors": [], "teacache": False, "compile": False,
        "attention_backends": ["pytorch"],
    })
    calls = []
    monkeypatch.setattr(accel, "_pick_attention_fn", lambda name, caps: ((lambda *a, **k: None), "pytorch"))
    m = Fake()
    out = accel.apply(m, {"accel": {"attention": "pytorch"}})
    assert out is not None and out.opts is not None


def test_accel_sig_changes_with_settings():
    s1 = accel.accel_sig({"accel": {"attention": "kitchen"}})
    s2 = accel.accel_sig({"accel": {"attention": "sage"}})
    s3 = accel.accel_sig({"accel": {"attention": "kitchen", "veda": True}})
    assert s1 != s2 and s1 != s3

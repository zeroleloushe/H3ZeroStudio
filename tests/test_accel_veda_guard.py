"""Veda dense-fallback guard helpers exist and min_tokens constant is set."""
from h3s import h3s_accel as accel


def test_veda_min_tokens_and_guard():
    assert accel.VEDA_MIN_TOKENS == 12288
    assert hasattr(accel, "_wrap_veda_dense_fallback")
    assert hasattr(accel, "_VedaGuard")
    g = accel._VedaGuard(100)
    g.log_once("a", "once")
    g.log_once("a", "once")  # no throw
    g.reset()

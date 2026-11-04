"""VRAM arbiter mutual exclusion + inflight journal."""
import time

import pytest

from h3s import h3s_vram as vram
from h3s import h3s_inflight as inflight


def setup_function():
    vram.release()
    inflight.clear()


def test_vram_acquire_release():
    st = vram.acquire("gen", wait_s=1, evict=False)
    assert st["holder"] == "gen"
    with pytest.raises(vram.VramBusy):
        vram.acquire("llm", wait_s=0.2, evict=False)
    vram.release("gen")
    st2 = vram.acquire("llm", wait_s=1, evict=False)
    assert st2["holder"] == "llm"
    vram.release("llm")
    assert vram.status()["holder"] is None


def test_vram_same_side_reentrant():
    vram.acquire("gen", wait_s=1, evict=False)
    vram.acquire("gen", wait_s=1, evict=False)  # same side ok
    vram.release("gen")


def test_inflight_record_lookup(tmp_path, monkeypatch):
    monkeypatch.setattr(inflight, "_path", lambda: str(tmp_path / "j.json"))
    assert inflight.lookup("nope") is None
    assert inflight.record("tok1", node="42", run="rabc", project="p1")
    hit = inflight.lookup("tok1")
    assert hit["node"] == "42" and hit["run"] == "rabc" and hit["project"] == "p1"
    inflight.clear("tok1")
    assert inflight.lookup("tok1") is None

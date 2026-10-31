"""Optional SAMPLER / SIGMAS inputs of the node: wired values win over the project's sampler / scheduler / steps."""
import pytest
import torch

import comfy.sample
import comfy.samplers
from h3s import h3s_core as core
from h3s import h3s_gen as gen
from fakes import FakeClip, FakeVAE
from test_gen import dirs, patcher, project  # noqa: F401  (fixtures + project builder of the main suite)

SIG = torch.tensor([1.0, 0.6, 0.25, 0.0])   # 3 steps; the project says 2


def _spy(monkeypatch):
    calls = {"sample": 0, "custom": []}
    real_sample, real_custom = comfy.sample.sample, comfy.sample.sample_custom

    def sample(*a, **k):
        calls["sample"] += 1
        return real_sample(*a, **k)

    def custom(model, noise, cfg, sampler, sigmas, *a, **k):
        calls["custom"].append({"sampler": sampler, "sigmas": [round(float(x), 4) for x in sigmas.tolist()]})
        return real_custom(model, noise, cfg, sampler, sigmas, *a, **k)
    monkeypatch.setattr(comfy.sample, "sample", sample)
    monkeypatch.setattr(comfy.sample, "sample_custom", custom)
    return calls


def _run(patcher, **kw):
    return gen.run_project(patcher, FakeClip(), FakeVAE(), project(), node_id="9", **kw)


def test_nothing_wired_is_exactly_the_old_path(patcher, dirs, monkeypatch):
    calls = _spy(monkeypatch)
    _run(patcher)
    assert calls["sample"] == 2 and calls["custom"] == []   # one pass per segment, comfy.sample.sample as before


def test_wired_sigmas_win_and_set_the_step_count(patcher, dirs, monkeypatch):
    calls = _spy(monkeypatch)
    base = _run(patcher)[3]["keys"]
    calls["sample"], calls["custom"] = 0, []
    steps = []
    orig = gen.Notifier.__call__
    monkeypatch.setattr(gen.Notifier, "__call__", lambda self, event, **d: (steps.append(d["steps"]) if event == "step" else None, orig(self, event, **d))[1])
    info = _run(patcher, sigmas=SIG)[3]
    assert calls["sample"] == 0 and len(calls["custom"]) == 2   # both segments sampled with the wired sigmas
    assert all(c["sigmas"] == [1.0, 0.6, 0.25, 0.0] for c in calls["custom"])
    assert set(steps) == {3}                                    # progress counts the wired schedule, not the project's 2 steps
    assert info["keys"] != base                                 # other sigmas -> other cache keys (no stale hit)
    assert gen.CUSTOM == {"sampler": None, "sigmas": None}     # reset after the run


def test_wired_sigmas_cache_hits_and_misses(patcher, dirs, monkeypatch):
    calls = _spy(monkeypatch)
    k1 = _run(patcher, sigmas=SIG)[3]["keys"]
    calls["custom"].clear()
    assert _run(patcher, sigmas=SIG)[3]["keys"] == k1 and calls["custom"] == []        # same sigmas: cache hit
    k3 = _run(patcher, sigmas=torch.tensor([1.0, 0.5, 0.2, 0.0]))[3]["keys"]
    assert k3 != k1 and len(calls["custom"]) == 2                                       # other sigmas: regenerated


def test_wired_sampler_only_uses_the_project_scheduler(patcher, dirs, monkeypatch):
    calls = _spy(monkeypatch)
    base = _run(patcher)[3]["keys"]
    calls["sample"] = 0
    smp = comfy.samplers.ksampler("euler_ancestral")
    info = _run(patcher, sampler=smp)[3]
    assert calls["sample"] == 0 and len(calls["custom"]) == 2
    assert all(c["sampler"] is smp and len(c["sigmas"]) == 3 for c in calls["custom"])   # project steps 2 -> 3 sigmas
    assert info["keys"] != base                                                           # another sampler -> other keys
    assert gen.sampler_signature(smp) != gen.sampler_signature(comfy.samplers.ksampler("euler"))
    assert gen.sampler_signature(smp) == gen.sampler_signature(comfy.samplers.ksampler("euler_ancestral"))   # stable


def test_wired_sampler_and_sigmas_together(patcher, dirs, monkeypatch):
    calls = _spy(monkeypatch)
    smp = comfy.samplers.ksampler("lcm")
    _run(patcher, sampler=smp, sigmas=SIG)
    assert len(calls["custom"]) == 2 and all(c["sampler"] is smp and c["sigmas"] == [1.0, 0.6, 0.25, 0.0] for c in calls["custom"])


@pytest.mark.parametrize("bad", [torch.tensor([1.0]), torch.tensor([1.0, float("nan"), 0.0]), torch.zeros(0)])
def test_bad_sigmas_fail_early_and_reset(patcher, dirs, bad):
    with pytest.raises(ValueError, match="sigmas"):
        _run(patcher, sigmas=bad)
    assert gen.CUSTOM == {"sampler": None, "sigmas": None}


def test_params_carry_steps_and_signature_only_when_wired():
    proj = core.normalize_project(project())
    plain = core.pass_params(proj, 0, "full")
    assert "custom" not in plain and plain["steps"] == 2
    proj["settings"]["_custom"] = gen.custom_info(None, SIG)
    full, draft, refine = (core.pass_params(proj, 0, k) for k in ("full", "draft", "refine"))
    assert full["steps"] == draft["steps"] == 3 and full["custom"]["sigmas"] == [1.0, 0.6, 0.25, 0.0]
    assert refine["steps"] != 3                      # the refine pass keeps its own schedule
    assert core.effective_params(proj, 0)["steps"] == 3

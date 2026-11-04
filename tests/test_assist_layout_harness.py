"""Playwright layout audit for the assistant panel (overflow / composer / empty state)."""
import json
import os
import shutil
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
HARNESS = os.path.join(ROOT, "tests", "harness", "assist_layout.mjs")
SHOTS = "/workspace/shots"
REPORT = os.path.join(SHOTS, "assist_layout_report.json")


def test_assist_layout_playwright():
    if not shutil.which("google-chrome") and not shutil.which("chromium"):
        import pytest
        pytest.skip("chrome/chromium not installed")
    env = os.environ.copy()
    node_path = "/tmp/pwdeps/node_modules"
    env["NODE_PATH"] = node_path + (os.pathsep + env["NODE_PATH"] if env.get("NODE_PATH") else "")
    r = subprocess.run(
        ["node", HARNESS],
        cwd=ROOT, env=env, capture_output=True, text=True, timeout=300,
    )
    assert os.path.isfile(REPORT), (
        f"missing {REPORT}\nexit={r.returncode}\nstdout={r.stdout[-2000:]!r}\nstderr={r.stderr[-2000:]!r}"
    )
    data = json.loads(open(REPORT, encoding="utf-8").read())
    assert data.get("ok") is True, (
        f"layout failures: {data.get('fail')}/{data.get('total')}\n"
        + json.dumps([x for x in data.get("results", []) if not x.get("ok")], ensure_ascii=False)[:2000]
    )
    assert r.returncode == 0, f"harness exit {r.returncode}\n{r.stderr[-1000:]}"

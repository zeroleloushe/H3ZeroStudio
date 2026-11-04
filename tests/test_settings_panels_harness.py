"""jsdom harness: Settings tabs / Studio / welcome must render without ReferenceError."""
import json
import os
import shutil
import subprocess

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE = shutil.which("node")
HARNESS = os.path.join(ROOT, "tests", "harness", "settings_panels.mjs")
# Prefer tests/harness/node_modules (symlink) then /tmp install
NODE_PATHS = [
    os.path.join(ROOT, "tests", "harness", "node_modules"),
    "/tmp/h3zs-jsdom/node_modules",
]


def _jsdom_ready():
    for p in NODE_PATHS:
        if os.path.isdir(os.path.join(p, "jsdom")):
            return p
    return None


need_node = pytest.mark.skipif(NODE is None, reason="node.js not found")
need_jsdom = pytest.mark.skipif(_jsdom_ready() is None, reason="jsdom not installed (npm i jsdom)")


@need_node
@need_jsdom
def test_settings_panels_jsdom_harness():
    env = os.environ.copy()
    env["NODE_PATH"] = _jsdom_ready()
    r = subprocess.run([NODE, HARNESS], capture_output=True, text=True, timeout=120, env=env, cwd=ROOT)
    # last JSON object in stdout
    lines = [ln for ln in (r.stdout or "").splitlines() if ln.strip().startswith("{")]
    assert lines, f"no JSON from harness\nstdout={r.stdout!r}\nstderr={r.stderr!r}"
    # parse from first { to end (pretty-printed)
    raw = (r.stdout or "")[ (r.stdout or "").find("{") :]
    out = json.loads(raw)
    if out.get("skipped"):
        pytest.skip(out.get("reason") or "skipped")
    assert r.returncode == 0, r.stderr or r.stdout
    assert out.get("ok") is True, out
    assert not out.get("errors"), out.get("errors")

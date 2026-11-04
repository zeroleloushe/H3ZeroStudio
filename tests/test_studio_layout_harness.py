"""Full-studio Playwright layout audit (assist + insp + header scale)."""
import json, os, shutil, subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
HARNESS = os.path.join(ROOT, "tests", "harness", "studio_layout.mjs")
SHOTS = "/workspace/shots"
REPORT = os.path.join(SHOTS, "studio_layout_report.json")

def test_studio_layout_playwright():
    if not shutil.which("google-chrome") and not shutil.which("chromium"):
        import pytest
        pytest.skip("chrome/chromium not installed")
    env = os.environ.copy()
    node_path = "/tmp/pwdeps/node_modules"
    env["NODE_PATH"] = node_path + (os.pathsep + env["NODE_PATH"] if env.get("NODE_PATH") else "")
    r = subprocess.run(["node", HARNESS], cwd=ROOT, env=env, capture_output=True, text=True, timeout=420)
    assert os.path.isfile(REPORT), f"missing {REPORT}\n{r.stdout[-2000:]}\n{r.stderr[-2000:]}"
    data = json.loads(open(REPORT, encoding="utf-8").read())
    assert data.get("ok") is True, json.dumps([x for x in data.get("results", []) if not x.get("ok")], ensure_ascii=False)[:3000]
    assert r.returncode == 0

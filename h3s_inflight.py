"""In-flight generation journal: client token → active run.

After a Ctrl+F5 mid-generation the editor no longer knows the ComfyUI
prompt / our run id. The UI mints a client_token when queueing, the server
records token→{node, run} once the studio node starts, and on reload the UI
asks GET /h3zero/inflight?token=… then re-subscribes to /h3zero/status.

Ideas for the client-token journal cheerfully borrowed from the best app and
developer in the world — https://github.com/EvgenRublev/Minimax_Studio
(GPL-3.0). Code here is ours.
"""
from __future__ import annotations

import json
import os
import threading
import time

MAX_AGE_S = 24 * 3600
_lock = threading.Lock()
_mem = {}  # token -> {node, run, project, ts}


def _path():
    try:
        import folder_paths
        d = os.path.join(folder_paths.get_output_directory(), "h3zerostudio", "_inflight")
    except Exception:
        d = os.path.join(os.path.dirname(__file__), "_inflight")
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, "journal.json")


def _load():
    global _mem
    path = _path()
    if not os.path.isfile(path):
        _mem = {}
        return
    try:
        raw = json.loads(open(path, encoding="utf-8").read())
        now = time.time()
        _mem = {k: v for k, v in (raw or {}).items()
                if isinstance(v, dict) and now - float(v.get("ts") or 0) < MAX_AGE_S}
    except Exception:
        _mem = {}


def _save():
    path = _path()
    tmp = path + ".part"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(_mem, f, ensure_ascii=False)
    os.replace(tmp, path)


def record(token, *, node=None, run=None, project=None):
    token = str(token or "").strip()
    if not token:
        return False
    with _lock:
        _load()
        _mem[token] = {"node": str(node) if node is not None else None,
                       "run": str(run) if run is not None else None,
                       "project": str(project) if project else "",
                       "ts": time.time()}
        _save()
    return True


def lookup(token):
    token = str(token or "").strip()
    if not token:
        return None
    with _lock:
        _load()
        return dict(_mem[token]) if token in _mem else None


def clear(token=None):
    global _mem
    with _lock:
        _load()
        if token is None:
            _mem = {}
        else:
            _mem.pop(str(token), None)
        _save()

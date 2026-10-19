"""Small HTTP API for the editor (prefix /h3zero)."""
import os
import re
import shutil


def model_paths():
    """Folders ComfyUI searches (incl. extra_model_paths.yaml) — shown in «Настройки» → «Модели»."""
    import folder_paths
    out = {}
    for k in ("latent_upscale_models", "vae_approx"):
        try:
            out[k] = list(folder_paths.get_folder_paths(k))
        except Exception:
            out[k] = []
    return out


def tiny_vaes():
    try:
        from . import h3s_preview
        return h3s_preview.tiny_vae_names()
    except Exception:
        return []


def upscale_caps():
    """What «Апскейл отрезка» can use on this machine (learned H3 latent upscaler, RTX VSR)."""
    try:
        from . import h3s_upscale
        return h3s_upscale.capabilities()
    except Exception as e:
        return {"learned": False, "learned_models": [], "learned_node": False, "rtx": False, "error": str(e)}


def register():
    try:
        from aiohttp import web
        from server import PromptServer
    except Exception:
        return False
    inst = getattr(PromptServer, "instance", None)
    if inst is None:
        return False
    routes = inst.routes

    @routes.get("/h3zero/options")
    async def options(request):
        import comfy.samplers
        return web.json_response({"samplers": list(comfy.samplers.KSampler.SAMPLERS),
                                  "schedulers": list(comfy.samplers.KSampler.SCHEDULERS),
                                  "tiny_vaes": tiny_vaes(), "upscale": upscale_caps(), "paths": model_paths()})

    @routes.get("/h3zero/settings")
    async def settings_get(request):
        from . import h3s_library as lib
        return await _json_call(lib.settings_get)

    @routes.post("/h3zero/settings")
    async def settings_set(request):
        from . import h3s_library as lib
        b = await request.json()
        return await _json_call(lib.settings_set, b.get("settings") or {}, bool(b.get("replace")))

    @routes.get("/h3zero/status")
    async def status(request):
        try:
            from . import h3s_gen
            return web.json_response({"status": h3s_gen.run_status(request.query.get("node", ""))})
        except Exception as e:
            return web.json_response({"status": None, "error": str(e)})

    @routes.post("/h3zero/clear_cache")
    async def clear_cache(request):
        import folder_paths
        body = await request.json()
        pid = re.sub(r"[^A-Za-z0-9_-]", "", str(body.get("id") or ""))
        if not pid:
            return web.json_response({"ok": False, "error": "no id"}, status=400)
        d = os.path.join(folder_paths.get_output_directory(), "h3zerostudio", pid)
        n = 0
        if os.path.isdir(d):
            for name in os.listdir(d):
                p = os.path.join(d, name)
                if os.path.isdir(p) and name == "frozen":   # frozen segments survive «Очистить кэш»
                    continue
                if os.path.isdir(p):
                    n += len(os.listdir(p))
                    shutil.rmtree(p, ignore_errors=True)
                elif name.startswith(("seg_", "full_")):
                    os.remove(p)
                    n += 1
        return web.json_response({"ok": True, "removed": n})

    @routes.post("/h3zero/freeze")
    async def freeze(request):
        from . import h3s_gen
        body = await request.json()
        try:
            return web.json_response({"ok": True, "freeze": h3s_gen.freeze_segment(body.get("id"), body.get("key"))})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    @routes.get("/h3zero/video_info")
    async def video_info(request):
        from . import h3s_gen
        q = request.rel_url.query
        ref = {"filename": q.get("filename", ""), "subfolder": q.get("subfolder", ""), "type": q.get("type", "input")}
        try:
            import asyncio
            info = await asyncio.get_running_loop().run_in_executor(None, h3s_gen.video_asset_info, ref, q.get("strip", "1") != "0")
            return web.json_response({"ok": True, "info": info})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    @routes.post("/h3zero/pick_folder")
    async def pick_folder(request):
        """Native «choose folder» dialog on the machine ComfyUI runs on (tkinter in a child process)."""
        body = await request.json()
        try:
            import asyncio
            path = await asyncio.get_running_loop().run_in_executor(None, _pick_folder, str(body.get("initial") or ""))
            return web.json_response({"ok": True, "path": path})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    @routes.post("/h3zero/export")
    async def export(request):
        from . import h3s_gen
        body = await request.json()
        try:
            import asyncio
            r = await asyncio.get_running_loop().run_in_executor(None, h3s_gen.export_video, body)
            return web.json_response({"ok": True, **r})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    @routes.post("/h3zero/asset_edit")
    async def asset_edit(request):
        from . import h3s_gen, h3s_assets
        body = await request.json()
        try:
            import asyncio
            r = await asyncio.get_running_loop().run_in_executor(None, h3s_assets.run, body, h3s_gen.asset_path)
            if r.get("file") and body.get("kind") == "video" and body.get("action", "edit") == "edit":
                r["info"].update({k: v for k, v in h3s_gen.video_asset_info(r["file"], strip=False).items() if k in ("poster", "strip", "strip_n")})
            return web.json_response({"ok": True, **r})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    @routes.get("/h3zero/peaks")
    async def peaks(request):
        """Waveform peaks of an audio file in input/output/temp (cached by size+mtime)."""
        from . import h3s_gen, h3s_media
        q = request.rel_url.query
        ref = {"file": q.get("filename", ""), "subfolder": q.get("subfolder", ""), "type": q.get("type", "input")}
        if not ref["file"]:
            return web.json_response({"error": "no filename"}, status=400)
        try:
            path = h3s_gen.asset_path(ref)
            bins = max(16, min(8000, int(q.get("bins", 2000))))
            key = (path, h3s_gen.file_sig(path), bins)
            if key not in _PEAKS:
                import asyncio
                _PEAKS.clear() if len(_PEAKS) > 64 else None
                _PEAKS[key] = await asyncio.get_running_loop().run_in_executor(None, h3s_media.audio_peaks, path, bins)
            return web.json_response(_PEAKS[key])
        except (ValueError, FileNotFoundError) as e:
            return web.json_response({"error": str(e)}, status=404)
        except Exception as e:
            return web.json_response({"error": f"не удалось прочитать аудио: {e}"}, status=500)

    # ---------------------------------------------------------------- «Галерея» / «Проекты»
    async def _json_call(fn, *args):
        import asyncio
        try:
            return web.json_response({"ok": True, "data": await asyncio.get_running_loop().run_in_executor(None, fn, *args)})
        except FileNotFoundError as e:
            return web.json_response({"ok": False, "error": str(e)}, status=404)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)

    @routes.get("/h3zero/gallery")
    async def gallery(request):
        from . import h3s_library as lib
        q = request.rel_url.query
        return await _json_call(lib.gallery_list, None if q.get("all") == "1" else q.get("id", ""))

    @routes.post("/h3zero/gallery/update")
    async def gallery_update(request):
        from . import h3s_library as lib
        b = await request.json()
        return await _json_call(lib.gallery_update, b.get("pid"), b.get("id"), b.get("fields") or {})

    @routes.post("/h3zero/gallery/delete")
    async def gallery_delete(request):
        from . import h3s_library as lib
        b = await request.json()
        return await _json_call(lib.gallery_delete, b.get("pid"), b.get("id"))

    @routes.get("/h3zero/projects")
    async def projects(request):
        from . import h3s_library as lib
        return await _json_call(lib.project_list)

    @routes.get("/h3zero/project")
    async def project_get(request):
        from . import h3s_library as lib
        return await _json_call(lib.project_get, request.rel_url.query.get("id", ""))

    @routes.post("/h3zero/project/save")
    async def project_save(request):
        from . import h3s_library as lib
        b = await request.json()
        return await _json_call(lib.project_save, b.get("project") or {}, b.get("meta") or {})

    @routes.post("/h3zero/project/rename")
    async def project_rename(request):
        from . import h3s_library as lib
        b = await request.json()
        return await _json_call(lib.project_rename, b.get("id"), b.get("name"))

    @routes.post("/h3zero/project/delete")
    async def project_delete(request):
        from . import h3s_library as lib
        b = await request.json()
        return await _json_call(lib.project_delete, b.get("id"), bool(b.get("files")))

    @routes.post("/h3zero/project/duplicate")
    async def project_duplicate(request):
        from . import h3s_library as lib
        b = await request.json()
        return await _json_call(lib.project_duplicate, b.get("project") or {}, b.get("new_id"), b.get("name"))

    @routes.post("/h3zero/project/export_zip")
    async def project_export_zip(request):
        from . import h3s_library as lib
        b = await request.json()
        return await _json_call(lib.export_zip, b.get("project") or {}, b.get("include_cache", True), b.get("folder") or "")

    @routes.post("/h3zero/project/import_zip")
    async def project_import_zip(request):
        """multipart: file (zip), new_id (used when the project id already exists here). Streamed to disk."""
        import tempfile
        from . import h3s_library as lib
        reader = await request.multipart()
        new_id, tmp = "", None
        try:
            while True:
                part = await reader.next()
                if part is None:
                    break
                if part.name == "new_id":
                    new_id = (await part.text()).strip()
                elif part.name == "file":
                    fd, tmp = tempfile.mkstemp(suffix=".zip")
                    with os.fdopen(fd, "wb") as f:
                        while True:
                            chunk = await part.read_chunk(1 << 20)
                            if not chunk:
                                break
                            f.write(chunk)
            if not tmp:
                return web.json_response({"ok": False, "error": "нет файла"}, status=400)
            return await _json_call(lib.import_zip, tmp, new_id)
        finally:
            if tmp and os.path.exists(tmp):
                try:
                    os.remove(tmp)
                except OSError:
                    pass

    return True


_PEAKS = {}

_PICK_SCRIPT = """
import sys
import tkinter as tk
from tkinter import filedialog
r = tk.Tk(); r.withdraw()
try:
    r.attributes("-topmost", True)
except Exception:
    pass
p = filedialog.askdirectory(title="Папка для сохранения", initialdir=sys.argv[1] or None, mustexist=False)
sys.stdout.write(p or "")
"""


_PS_SCRIPT = (
    "[Console]::OutputEncoding=[Text.Encoding]::UTF8;"
    "Add-Type -AssemblyName System.Windows.Forms;"
    "$o=New-Object System.Windows.Forms.Form;$o.TopMost=$true;$o.ShowInTaskbar=$false;$o.Opacity=0;"
    "$o.StartPosition='CenterScreen';$o.Show();"
    "$f=New-Object System.Windows.Forms.FolderBrowserDialog;$f.Description='Папка для сохранения';$f.ShowNewFolderButton=$true;"
    "if($env:H3_INIT){$f.SelectedPath=$env:H3_INIT};"
    "if($f.ShowDialog($o) -eq 'OK'){[Console]::Out.Write($f.SelectedPath)};$o.Close()")


def _pick_folder(initial):
    """tkinter (child process) -> on Windows PowerShell's folder dialog (portable ComfyUI's Python has no tkinter)
    -> macOS osascript -> zenity / kdialog."""
    import subprocess
    import sys
    import folder_paths
    ini = os.path.expanduser(initial.strip().strip('"')) if initial.strip() else ""
    if ini and not os.path.isabs(ini):
        ini = os.path.join(folder_paths.get_output_directory(), ini)
    while ini and not os.path.isdir(ini):
        ini = os.path.dirname(ini)
    ini = ini or folder_paths.get_output_directory()
    env = dict(os.environ, H3_INIT=ini)
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    attempts = [[sys.executable, "-c", _PICK_SCRIPT, ini]]
    if sys.platform == "win32":
        attempts.append(["powershell", "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", _PS_SCRIPT])
    elif sys.platform == "darwin":
        attempts.append(["osascript", "-e", 'POSIX path of (choose folder with prompt "Папка для сохранения")'])
    else:
        attempts += [["zenity", "--file-selection", "--directory", "--filename=" + ini + "/"], ["kdialog", "--getexistingdirectory", ini]]
    errs = []
    for cmd in attempts:
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=900, encoding="utf-8", errors="replace", env=env, creationflags=flags)
        except subprocess.TimeoutExpired:
            raise RuntimeError("диалог выбора папки не был закрыт")
        except OSError as e:
            errs.append(f"{os.path.basename(cmd[0])}: {e}")
            continue
        out = r.stdout.strip()
        if r.returncode == 0:
            return os.path.normpath(out) if out else ""   # empty = cancelled
        errs.append(f"{os.path.basename(cmd[0])}: {(r.stderr or '').strip().splitlines()[-1:] or r.returncode}")
    raise RuntimeError("не удалось открыть диалог выбора папки (" + "; ".join(errs)[:300] + ") — введите путь вручную")

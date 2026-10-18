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
            info = await asyncio.get_running_loop().run_in_executor(None, h3s_gen.video_asset_info, ref)
            return web.json_response({"ok": True, "info": info})
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
                r["info"]["poster"] = h3s_gen.video_asset_info(r["file"])["poster"]
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

"""OpenAI-compatible API backend for the H3ZeroStudio prompt assistant."""
import base64
import io
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_BASE = "http://127.0.0.1:1234/v1"
MAX_REFERENCE_IMAGES = 16


def _attachment_path(item):
    kind = item.get("kind")
    if kind == "card":
        from . import h3s_chars
        return h3s_chars.preview_path(str(item.get("id") or ""))
    if kind != "asset":
        return None
    import folder_paths
    ref = item.get("asset") if isinstance(item.get("asset"), dict) else {}
    roots = {"input": folder_paths.get_input_directory(),
             "output": folder_paths.get_output_directory(),
             "temp": folder_paths.get_temp_directory()}
    root = os.path.realpath(roots.get(ref.get("type") or "input", roots["input"]))
    path = os.path.realpath(os.path.join(root, str(ref.get("subfolder") or ""), str(ref.get("file") or "")))
    if os.path.commonpath([root, path]) != root or os.path.splitext(path)[1].lower() not in (".png", ".jpg", ".jpeg", ".webp"):
        return None
    return path if os.path.isfile(path) else None


def _image_data_url(path):
    from PIL import Image
    with Image.open(path) as source:
        image = source.convert("RGB")
        image.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        image.save(out, format="JPEG", quality=88, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode("ascii")


def _with_images(messages, attachments):
    images = []
    for item in (attachments or [])[:MAX_REFERENCE_IMAGES]:
        if not isinstance(item, dict):
            continue
        try:
            path = _attachment_path(item)
            if path:
                images.append((str(item.get("token") or "Reference"), str(item.get("label") or ""), _image_data_url(path)))
        except Exception:
            continue
    if not images:
        return messages
    out = [dict(m) for m in messages]
    index = next((i for i in range(len(out) - 1, -1, -1) if out[i].get("role") == "user"), -1)
    if index < 0:
        return messages
    content = out[index].get("content")
    text = content if isinstance(content, str) else "\n".join(str(p.get("text") or "") for p in content or [] if isinstance(p, dict))
    parts = [{"type": "text", "text": text}]
    for token, label, url in images:
        parts.append({"type": "text", "text": f"{token} — {label}"})
        parts.append({"type": "image_url", "image_url": {"url": url}})
    out[index]["content"] = parts
    return out


class ApiError(RuntimeError):
    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


def api_base(value):
    base = re.sub(r"//localhost(?=[:/]|$)", "//127.0.0.1", str(value or DEFAULT_BASE).strip().rstrip("/"))
    for suffix in ("/chat/completions", "/models"):
        if base.endswith(suffix):
            base = base[:-len(suffix)]
            break
    parts = urllib.parse.urlsplit(base)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise ApiError("Укажите адрес API, например http://127.0.0.1:1234/v1")
    return base


def _error_text(exc):
    try:
        raw = exc.read().decode("utf-8", "replace")
        data = json.loads(raw)
        error = data.get("error", data)
        if isinstance(error, dict):
            return str(error.get("message") or error.get("detail") or error)[:800]
        return str(error)[:800]
    except Exception:
        return ""


def _open(request, timeout):
    try:
        return urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request, timeout=timeout)
    except urllib.error.HTTPError as e:
        detail = _error_text(e)
        raise ApiError(f"API вернул HTTP {e.code}" + (f": {detail}" if detail else ""), status=e.code) from e
    except urllib.error.URLError as e:
        reason = getattr(e, "reason", e)
        raise ApiError(f"Не удалось подключиться к API: {reason}") from e
    except (TimeoutError, OSError) as e:
        raise ApiError(f"Не удалось подключиться к API: {e}") from e


def _request(base, path, api_key="", body=None, timeout=20):
    headers = {"Accept": "application/json", "User-Agent": "H3ZeroStudio/1.0"}
    if api_key:
        headers["Authorization"] = "Bearer " + api_key
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(base + path, data=data, headers=headers)
    return _open(req, timeout)


def connect(base, api_key=""):
    """Check GET /models and return the available model ids."""
    base = api_base(base)
    with _request(base, "/models", str(api_key or "").strip(), timeout=15) as resp:
        try:
            payload = json.loads(resp.read().decode("utf-8"))
        except (UnicodeError, ValueError) as e:
            raise ApiError("API /models вернул неверный JSON") from e
    rows = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        raise ApiError("API не поддерживает OpenAI-совместимый endpoint /models")
    models = []
    for row in rows:
        name = row if isinstance(row, str) else row.get("id") or row.get("name") or row.get("model") if isinstance(row, dict) else ""
        if name:
            models.append(str(name))
    return {"connected": True, "base": base, "models": sorted(set(models), key=str.lower)}


def release_comfy_models(wait_timeout=600):
    """Wait for the active H3 job, then free ComfyUI's models before an LLM request.
    Takes the VRAM arbiter as `llm` (mutual exclusion with generation)."""
    from . import h3s_gen, h3s_models, h3s_vram
    try:
        h3s_vram.acquire("llm", wait_s=min(float(wait_timeout), h3s_vram.LOCK_WAIT_S), evict=True)
    except h3s_vram.VramBusy as e:
        raise ApiError(f"VRAM занята генерацией ({e.holder}) — подождите или остановите ролик") from e
    deadline = time.monotonic() + max(0.0, float(wait_timeout))
    while any(st.get("active") for st in list(h3s_gen.STATUS.values())):
        if time.monotonic() >= deadline:
            h3s_vram.release("llm")
            raise ApiError("Видеогенерация не завершилась за отведённое время")
        time.sleep(0.5)
    h3s_models.release_all()
    import comfy.model_management as mm
    mm.unload_all_models()
    mm.soft_empty_cache()
    return {"released": True, "vram": h3s_vram.status(), "mem": h3s_vram.memory_snapshot()}


def release_llm_vram():
    """Drop the LLM side of the VRAM arbiter (call when the chat stream ends)."""
    try:
        from . import h3s_vram
        return h3s_vram.release("llm")
    except Exception:
        return None


def unload(base, api_key="", api_model="", unload_endpoint=""):

    """Unload through the selected engine's native API (not part of OpenAI compatibility)."""
    model = str(api_model or "").strip()
    if not model:
        raise ApiError("Выберите модель, которую нужно выгрузить")
    base = api_base(base)
    parsed = urllib.parse.urlsplit(base)
    root = f"{parsed.scheme}://{parsed.netloc}"
    key = str(api_key or "").strip()
    custom = str(unload_endpoint or "").strip()
    if custom:
        attempts = [("Custom API", custom, {"model": model, "instance_id": model})]
    else:
        attempts = [("LM Studio", "/api/v1/models/unload", {"instance_id": model}),
                    ("llama-server", "/models/unload", {"model": model}),
                    ("Ollama", "/api/generate", {"model": model, "prompt": "", "stream": False, "keep_alive": 0}),
                    ("OpenAI server", "/v1/models/unload", {"model": model}),
                    ("OpenAI server", "/unload", {"model": model}),
                    ("OpenAI server", "/api/unload", {"model": model})]
    last_error = None
    for backend, target, body in attempts:
        request_base, path = root, target if target.startswith("/") else "/" + target
        if target.startswith(("http://", "https://")):
            parts = urllib.parse.urlsplit(target)
            request_base = f"{parts.scheme}://{parts.netloc}"
            path = urllib.parse.urlunsplit(("", "", parts.path, parts.query, ""))
        try:
            with _request(request_base, path, key, body, timeout=30) as resp:
                resp.read()
            return {"unloaded": True, "backend": backend, "model": model}
        except ApiError as e:
            if e.status is None:
                raise
            last_error = e
    raise ApiError("Сервер не поддерживает выгрузку через API. Для llama-server нужен router mode; "
                   "для LM Studio — версия 0.4+. Для Ollama используется keep_alive=0. "
                   + (str(last_error) if last_error else ""))


def _content(part):
    choices = part.get("choices") if isinstance(part, dict) else None
    if not choices:
        if isinstance(part, dict) and part.get("error"):
            error = part["error"]
            raise ApiError(str(error.get("message") if isinstance(error, dict) else error))
        return ""
    choice = choices[0] or {}
    delta = choice.get("delta") or choice.get("message") or {}
    content = delta.get("content", "")
    if isinstance(content, list):
        return "".join(str(x.get("text") or "") for x in content if isinstance(x, dict))
    return str(content or "")


def _reasoning(part):
    choices = part.get("choices") if isinstance(part, dict) else None
    if not choices:
        return ""
    delta = choices[0].get("delta") or choices[0].get("message") or {}
    value = delta.get("reasoning_content") or delta.get("reasoning") or delta.get("thinking") or ""
    if isinstance(value, list):
        return "".join(str(x.get("text") or "") for x in value if isinstance(x, dict))
    if not value:
        details = delta.get("reasoning_details") or []
        return "".join(str(x.get("text") or "") for x in details if isinstance(x, dict))
    return str(value)


class ThinkFilter:
    OPEN, CLOSE = "<think>", "</think>"

    def __init__(self, on_think):
        self.inside = False
        self.carry = ""
        self.on_think = on_think

    def feed(self, text):
        buf = self.carry + text
        self.carry = ""
        out = []
        while buf:
            if self.inside:
                at = buf.find(self.CLOSE)
                if at < 0:
                    keep = self._tail(buf, self.CLOSE)
                    self.on_think(buf[:len(buf) - len(keep)])
                    self.carry = keep
                    break
                self.on_think(buf[:at])
                buf = buf[at + len(self.CLOSE):].lstrip("\n")
                self.inside = False
            else:
                at = buf.find(self.OPEN)
                if at < 0:
                    keep = self._tail(buf, self.OPEN)
                    out.append(buf[:len(buf) - len(keep)])
                    self.carry = keep
                    break
                out.append(buf[:at])
                buf = buf[at + len(self.OPEN):]
                self.inside = True
        return "".join(out)

    def flush(self):
        rest, self.carry = ("" if self.inside else self.carry), ""
        return rest

    @staticmethod
    def _tail(buf, tag):
        for n in range(min(len(tag) - 1, len(buf)), 0, -1):
            if tag.startswith(buf[-n:]):
                return buf[-n:]
        return ""


def _without_images(messages):
    out = []
    for message in messages:
        content = message.get("content")
        if isinstance(content, list):
            content = "\n".join(str(p.get("text") or "") for p in content if isinstance(p, dict) and p.get("type") == "text")
        out.append({**message, "content": content})
    return out


def _usage(part):
    usage, timings = part.get("usage") or {}, part.get("timings") or {}
    if not usage and not timings:
        return {}
    return {"prompt": int(usage.get("prompt_tokens") or timings.get("prompt_n") or 0),
            "completion": int(usage.get("completion_tokens") or timings.get("predicted_n") or 0),
            "tps": float(timings.get("predicted_per_second") or 0)}


def _finish(part):
    for choice in part.get("choices") or []:
        if choice.get("finish_reason"):
            return str(choice["finish_reason"])
    return ""


def _stats(usage, finish, started, chars, first_token_at=None):
    if not usage and not finish:
        return None
    elapsed = max(0.001, time.monotonic() - started)
    completion = usage.get("completion") or (max(1, int(chars / 3.2)) if chars else 0)
    out = {"prompt": usage.get("prompt", 0), "completion": completion,
           "tps": round(usage.get("tps") or completion / elapsed, 1), "elapsed": round(elapsed, 2), "finish": finish}
    if first_token_at is not None:
        out["ttft"] = round(max(0.0, first_token_at - started), 3)
    return out


def _stream_once(base, api_key, body, stream_timeout):
    started = time.monotonic()
    usage, finish, chars = {}, "", 0
    first_token_at = None
    think = ThinkFilter(lambda text: side.append(text))
    side = []
    with _request(base, "/chat/completions", api_key, body, timeout=stream_timeout) as resp:
        if "text/event-stream" not in resp.headers.get("Content-Type", ""):
            try:
                part = json.loads(resp.read().decode("utf-8"))
            except (UnicodeError, ValueError) as e:
                raise ApiError("API вернул неверный ответ на /chat/completions") from e
            reasoning = _reasoning(part)
            if reasoning:
                yield "reasoning", reasoning
            text = think.feed(_content(part)) + think.flush()
            for thought in side:
                yield "reasoning", thought
            if text:
                if first_token_at is None:
                    first_token_at = time.monotonic()
                chars += len(text)
                yield "token", text
            usage, finish = _usage(part), _finish(part)
        else:
            for raw in resp:
                line = raw.decode("utf-8", "replace").strip()
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    part = json.loads(data)
                except ValueError:
                    continue
                reasoning = _reasoning(part)
                if reasoning:
                    yield "reasoning", reasoning
                side.clear()
                text = think.feed(_content(part))
                for thought in side:
                    if thought:
                        yield "reasoning", thought
                if text:
                    if first_token_at is None:
                        first_token_at = time.monotonic()
                    chars += len(text)
                    yield "token", text
                usage.update(_usage(part))
                finish = _finish(part) or finish
            side.clear()
            text = think.flush()
            for thought in side:
                if thought:
                    yield "reasoning", thought
            if text:
                if first_token_at is None:
                    first_token_at = time.monotonic()
                chars += len(text)
                yield "token", text
    stats = _stats(usage, finish, started, chars, first_token_at)
    if stats:
        yield "stats", stats


def stream_chat(messages, temperature=0.7, top_p=0.9, max_tokens=32768,
                api_base_url="", api_key="", api_model="", attachments=None, engine_defaults=False,
                sampling=None, thinking=True, stream_timeout=600):
    """Yield tokens, reasoning, notices and response statistics from an OpenAI-compatible API."""
    if not messages:
        raise ValueError("H3ZeroStudio: пустой диалог")
    model = str(api_model or "").strip()
    if not model:
        raise ApiError("Выберите модель в настройках ассистента")
    base = api_base(api_base_url)
    try:
        stream_timeout = max(1.0, float(stream_timeout))
    except (TypeError, ValueError):
        stream_timeout = 600.0
    try:
        max_tokens = int(max_tokens)
    except (TypeError, ValueError):
        max_tokens = 32768
    max_tokens = max(16, min(32768, max_tokens))
    # Strata (and similar) derive a soft thinking budget from max_tokens (~75%). Keep headroom for the answer.
    think_budget = max(1024, min(24576, max_tokens - 4096)) if thinking and max_tokens > 4096 else 0
    body = {"model": model, "messages": _with_images(messages, attachments), "stream": True,
            "chat_template_kwargs": {"enable_thinking": bool(thinking)}, "think": bool(thinking),
            "stream_options": {"include_usage": True}}
    if thinking and think_budget:
        body["chat_template_kwargs"]["thinking_budget"] = think_budget
        body["thinking_budget"] = think_budget
    if not engine_defaults:
        params = sampling if isinstance(sampling, dict) else {"temperature": float(temperature), "top_p": float(top_p)}
        body.update(params)
        body["max_tokens"] = int(max_tokens)
    has_images = any(isinstance(m.get("content"), list) for m in body["messages"])
    dropped = set()
    for _ in range(6):
        emitted = False
        try:
            for kind, text in _stream_once(base, str(api_key or "").strip(), body, stream_timeout):
                emitted = emitted or kind in ("token", "reasoning")
                yield kind, text
            return
        except ApiError as e:
            if emitted or e.status not in (400, 415, 422):
                raise
            field = next((key for key in ("stream_options", "thinking_budget", "chat_template_kwargs", "think") if key in body and key not in dropped), None)
            if field == "thinking_budget" and isinstance(body.get("chat_template_kwargs"), dict):
                body["chat_template_kwargs"].pop("thinking_budget", None)
            if field:
                if field != "chat_template_kwargs":
                    body.pop(field, None)
                else:
                    body.pop(field, None)
                dropped.add(field)
                yield "notice", f"API не поддерживает {field}; запрос повторён без этого поля."
            elif has_images:
                body["messages"] = _without_images(body["messages"])
                has_images = False
                yield "notice", "API отклонил изображения; запрос повторён только с их подписями."
            else:
                raise


def sse_payload(kind, text):
    return ("data: " + json.dumps({"kind": kind, "text": text}, ensure_ascii=False) + "\n\n").encode("utf-8")

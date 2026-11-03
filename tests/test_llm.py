"""Live HTTP checks for the API-only assistant backend (unittest or pytest)."""
import importlib.util
import json
import os
import pathlib
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

if "h3s" not in sys.modules:
    pkg = pathlib.Path(__file__).resolve().parents[1]
    spec = importlib.util.spec_from_file_location("h3s", pkg / "__init__.py", submodule_search_locations=[str(pkg)])
    module = importlib.util.module_from_spec(spec)
    sys.modules["h3s"] = module
    spec.loader.exec_module(module)
from h3s import h3s_llm


class _Handler(BaseHTTPRequestHandler):
    def _json(self, status, payload):
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _authorized(self):
        if self.headers.get("Authorization") == "Bearer secret":
            return True
        self._json(401, {"error": {"message": "invalid api key"}})
        return False

    def do_GET(self):
        self.server.requests.append(("GET", self.path, self.headers.get("Authorization")))
        if self.path != "/v1/models":
            self._json(404, {"error": {"message": "not found"}})
        elif self._authorized():
            self._json(200, {"object": "list", "data": [{"id": "z-model"}, {"id": "a-model"}]})

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length))
        self.server.requests.append(("POST", self.path, self.headers.get("Authorization")))
        self.server.payload = body
        if self.path == "/api/v1/models/unload":
            if self._authorized():
                self._json(200 if body.get("instance_id") == "lm-model" else 404, {"status": "ok"})
            return
        if self.path == "/models/unload":
            if self._authorized():
                self._json(200 if body.get("model") == "llama-model" else 404, {"status": "ok"})
            return
        if self.path == "/api/generate":
            if self._authorized():
                self._json(200 if body.get("model") == "ollama-model" else 404, {"status": "ok"})
            return
        if self.path == "/custom/unload":
            if self._authorized():
                self._json(200 if body.get("model") == "custom-model" else 404, {"status": "ok"})
            return
        if self.path != "/v1/chat/completions" or not self._authorized():
            return
        if body.get("model") in ("strict", "no-vision"):
            field = next((key for key in ("stream_options", "chat_template_kwargs", "think") if key in body), None)
            if field:
                self._json(422, {"error": {"message": "unsupported field: " + field}})
                return
        if body.get("model") == "no-vision" and any(isinstance(m.get("content"), list) for m in body["messages"]):
            self._json(415, {"error": {"message": "vision is not supported"}})
            return
        if body.get("model") == "plain":
            self._json(200, {"choices": [{"message": {"content": "plain answer", "reasoning_content": "plain thought"}}]})
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        if body.get("model") == "reasoning":
            deltas = ({"reasoning_content": "Think"}, {"reasoning_content": "ing"}, {"content": "Done"})
        elif body.get("model") == "tagged":
            deltas = tuple({"content": text} for text in ("<th", "ink> idea", " </th", "ink>Ans", "wer"))
        else:
            deltas = tuple({"content": text} for text in ("Hello", ", H3"))
        for delta in deltas:
            part = {"choices": [{"delta": delta}]}
            self.wfile.write(("data: " + json.dumps(part) + "\n\n").encode("utf-8"))
            self.wfile.flush()
        if body.get("model") == "usage":
            part = {"choices": [{"delta": {}, "finish_reason": "stop"}],
                    "usage": {"prompt_tokens": 10, "completion_tokens": 2},
                    "timings": {"predicted_per_second": 12.5}}
            self.wfile.write(("data: " + json.dumps(part) + "\n\n").encode("utf-8"))
            self.wfile.flush()
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()

    def log_message(self, *args):
        pass


class ApiBackendTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        cls.server.requests = []
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}/v1"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def test_connect_normalizes_url_and_loads_models(self):
        result = h3s_llm.connect(self.base + "/chat/completions", "secret")
        self.assertTrue(result["connected"])
        self.assertEqual(result["base"], self.base)
        self.assertEqual(result["models"], ["a-model", "z-model"])
        self.assertEqual(self.server.requests[-1], ("GET", "/v1/models", "Bearer secret"))

    def test_auth_error_is_clear_and_does_not_leak_key(self):
        with self.assertRaisesRegex(h3s_llm.ApiError, "HTTP 401.*invalid api key") as caught:
            h3s_llm.connect(self.base, "wrong-key")
        self.assertNotIn("wrong-key", str(caught.exception))

    def test_stream_chat_sends_parameters_and_yields_tokens(self):
        events = list(h3s_llm.stream_chat([{"role": "user", "content": "Hi"}], 0, 0, 123,
                                         self.base, "secret", "a-model"))
        self.assertEqual(events, [("token", "Hello"), ("token", ", H3")])
        self.assertEqual(self.server.payload["temperature"], 0)
        self.assertEqual(self.server.payload["top_p"], 0)
        self.assertEqual(self.server.payload["max_tokens"], 123)
        self.assertTrue(self.server.payload["stream"])
        self.assertEqual(self.server.payload["chat_template_kwargs"], {"enable_thinking": True})
        self.assertIs(self.server.payload["think"], True)

    def test_sampling_profiles_and_thinking_flags(self):
        for thinking, temperature, top_p, min_p, presence in ((True, 1.0, 0.95, 0.05, 0.0),
                                                               (False, 0.7, 0.8, 0.0, 1.5)):
            with self.subTest(thinking=thinking):
                sampling = {"temperature": temperature, "top_p": top_p, "top_k": 20, "min_p": min_p,
                            "presence_penalty": presence, "repetition_penalty": 1.0}
                events = list(h3s_llm.stream_chat([{"role": "user", "content": "Hi"}], max_tokens=16000,
                                                 api_base_url=self.base, api_key="secret", api_model="a-model",
                                                 sampling=sampling, thinking=thinking))
                self.assertEqual(events, [("token", "Hello"), ("token", ", H3")])
                for key, value in sampling.items():
                    self.assertEqual(self.server.payload[key], value)
                self.assertEqual(self.server.payload["max_tokens"], 16000)
                self.assertEqual(self.server.payload["chat_template_kwargs"], {"enable_thinking": thinking})
                self.assertIs(self.server.payload["think"], thinking)

    def test_engine_defaults_omit_sampling_parameters(self):
        events = list(h3s_llm.stream_chat([{"role": "user", "content": "Hi"}], api_base_url=self.base,
                                         api_key="secret", api_model="a-model", engine_defaults=True,
                                         sampling={"temperature": 1.5}, thinking=False))
        self.assertEqual(events, [("token", "Hello"), ("token", ", H3")])
        for key in ("temperature", "top_p", "top_k", "min_p", "presence_penalty", "repetition_penalty", "max_tokens"):
            self.assertNotIn(key, self.server.payload)
        self.assertEqual(self.server.payload["chat_template_kwargs"], {"enable_thinking": False})
        self.assertIs(self.server.payload["think"], False)

    def test_unload_supports_lmstudio_llama_and_ollama(self):
        for model, backend in (("lm-model", "LM Studio"), ("llama-model", "llama-server"), ("ollama-model", "Ollama")):
            with self.subTest(backend=backend):
                result = h3s_llm.unload(self.base, "secret", model)
                self.assertEqual(result, {"unloaded": True, "backend": backend, "model": model})
                if backend == "Ollama":
                    self.assertEqual(self.server.payload["keep_alive"], 0)
                    self.assertFalse(self.server.payload["stream"])

    def test_release_comfy_models_uses_native_memory_management(self):
        from unittest import mock
        import comfy.model_management as mm
        from h3s import h3s_models
        with mock.patch.object(h3s_models, "release_all") as release, \
             mock.patch.object(mm, "unload_all_models") as unload, \
             mock.patch.object(mm, "soft_empty_cache") as clear:
            self.assertEqual(h3s_llm.release_comfy_models(), {"released": True})
        release.assert_called_once_with()
        unload.assert_called_once_with()
        clear.assert_called_once_with()

    def test_release_comfy_models_waits_for_active_generation(self):
        from unittest import mock
        import comfy.model_management as mm
        from h3s import h3s_gen, h3s_models
        status = {"job": {"active": True}}
        def finish(_):
            status["job"]["active"] = False
        with mock.patch.object(h3s_gen, "STATUS", status), \
             mock.patch.object(h3s_llm.time, "sleep", side_effect=finish) as sleep, \
             mock.patch.object(h3s_models, "release_all") as release, \
             mock.patch.object(mm, "unload_all_models"), mock.patch.object(mm, "soft_empty_cache"):
            self.assertEqual(h3s_llm.release_comfy_models(), {"released": True})
        sleep.assert_called_once_with(0.5)
        release.assert_called_once_with()

    def test_non_streaming_fallback(self):
        events = list(h3s_llm.stream_chat([{"role": "user", "content": "Hi"}], api_base_url=self.base,
                                         api_key="secret", api_model="plain"))
        self.assertEqual(events, [("reasoning", "plain thought"), ("token", "plain answer")])

    def test_reasoning_stream(self):
        events = list(h3s_llm.stream_chat([{"role": "user", "content": "Hi"}], api_base_url=self.base,
                                         api_key="secret", api_model="reasoning"))
        self.assertEqual(events, [("reasoning", "Think"), ("reasoning", "ing"), ("token", "Done")])

    def test_split_think_tags_are_filtered_into_reasoning(self):
        events = list(h3s_llm.stream_chat([{"role": "user", "content": "Hi"}], api_base_url=self.base,
                                         api_key="secret", api_model="tagged"))
        self.assertEqual(events, [("reasoning", " idea"), ("reasoning", " "), ("token", "Ans"), ("token", "wer")])

    def test_usage_finish_and_stats_are_streamed(self):
        events = list(h3s_llm.stream_chat([{"role": "user", "content": "Hi"}], api_base_url=self.base,
                                         api_key="secret", api_model="usage"))
        self.assertEqual([event[:2] for event in events[:-1]], [("token", "Hello"), ("token", ", H3")])
        kind, stats = events[-1]
        self.assertEqual(kind, "stats")
        self.assertEqual(stats["prompt"], 10)
        self.assertEqual(stats["completion"], 2)
        self.assertEqual(stats["tps"], 12.5)
        self.assertEqual(stats["finish"], "stop")
        self.assertGreaterEqual(stats["elapsed"], 0)

    def test_strict_api_retries_without_extension_fields(self):
        events = list(h3s_llm.stream_chat([{"role": "user", "content": "Hi"}], api_base_url=self.base,
                                         api_key="secret", api_model="strict"))
        self.assertEqual([event for event in events if event[0] == "token"], [("token", "Hello"), ("token", ", H3")])
        self.assertEqual(len([event for event in events if event[0] == "notice"]), 3)
        for key in ("stream_options", "chat_template_kwargs", "think"):
            self.assertNotIn(key, self.server.payload)

    def test_non_vision_api_retries_with_text_labels(self):
        from unittest import mock
        messages = [{"role": "user", "content": [{"type": "text", "text": "Describe"}, {"type": "text", "text": "<Picture 1> — Hero"},
                                                 {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,x"}}]}]
        with mock.patch.object(h3s_llm, "_with_images", return_value=messages):
            events = list(h3s_llm.stream_chat([{"role": "user", "content": "Describe"}], api_base_url=self.base,
                                             api_key="secret", api_model="no-vision"))
        self.assertEqual([event for event in events if event[0] == "token"], [("token", "Hello"), ("token", ", H3")])
        self.assertIn(("notice", "API отклонил изображения; запрос повторён только с их подписями."), events)
        self.assertEqual(self.server.payload["messages"], [{"role": "user", "content": "Describe\n<Picture 1> — Hero"}])

    def test_custom_unload_endpoint(self):
        result = h3s_llm.unload(self.base, "secret", "custom-model", "/custom/unload")
        self.assertEqual(result, {"unloaded": True, "backend": "Custom API", "model": "custom-model"})
        self.assertEqual(self.server.payload["instance_id"], "custom-model")

    def test_image_attachment_is_sent_to_vision_model(self):
        import tempfile
        import types
        from unittest import mock
        from PIL import Image
        with tempfile.TemporaryDirectory() as root:
            Image.new("RGB", (32, 24), (120, 40, 80)).save(os.path.join(root, "hero.png"))
            folders = types.SimpleNamespace(get_input_directory=lambda: root, get_output_directory=lambda: root,
                                            get_temp_directory=lambda: root)
            with mock.patch.dict(sys.modules, {"folder_paths": folders}):
                events = list(h3s_llm.stream_chat([{"role": "user", "content": "Describe the hero"}], api_base_url=self.base,
                                                 api_key="secret", api_model="a-model", attachments=[
                                                     {"kind": "asset", "token": "<Picture 1>", "label": "Hero",
                                                      "asset": {"file": "hero.png", "subfolder": "", "type": "input"}},
                                                     {"kind": "asset", "token": "bad", "asset": {"file": "../secret.png"}}]))
        self.assertEqual(events, [("token", "Hello"), ("token", ", H3")])
        content = self.server.payload["messages"][-1]["content"]
        self.assertEqual(content[0], {"type": "text", "text": "Describe the hero"})
        self.assertEqual(content[1]["text"], "<Picture 1> — Hero")
        self.assertEqual(content[2]["type"], "image_url")
        self.assertTrue(content[2]["image_url"]["url"].startswith("data:image/jpeg;base64,"))
        self.assertEqual(len(content), 3)

    def test_comfy_route_streams_chat(self):
        import asyncio
        import types
        from unittest import mock
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from h3s import routes as h3s_routes

        async def exercise():
            route_table = web.RouteTableDef()
            fake_server = types.SimpleNamespace(PromptServer=types.SimpleNamespace(
                instance=types.SimpleNamespace(routes=route_table)))
            with mock.patch.dict(sys.modules, {"server": fake_server}):
                self.assertTrue(h3s_routes.register())
            app = web.Application()
            app.add_routes(route_table)
            client = TestClient(TestServer(app))
            await client.start_server()
            try:
                async with client.post("/h3zero/llm/chat", json={
                    "messages": [{"role": "user", "content": "Hi"}],
                    "max_tokens": 1200, "thinking": False,
                    "sampling": {"temperature": 0.7, "top_p": 0.8, "top_k": 20, "min_p": 0.0,
                                 "presence_penalty": 1.5, "repetition_penalty": 1.0},
                    "api_base": self.base, "api_key": "secret", "api_model": "a-model",
                }) as response:
                    self.assertEqual(response.status, 200)
                    self.assertIn("text/event-stream", response.headers["Content-Type"])
                    events = [json.loads(line[6:]) for line in (await response.text()).splitlines() if line.startswith("data: ")]
                self.assertEqual([e["text"] for e in events if e["kind"] == "token"], ["Hello", ", H3"])
                self.assertEqual(events[-1]["kind"], "end")
                self.assertEqual(self.server.payload["top_k"], 20)
                self.assertEqual(self.server.payload["presence_penalty"], 1.5)
                self.assertEqual(self.server.payload["chat_template_kwargs"], {"enable_thinking": False})
                self.assertIs(self.server.payload["think"], False)
            finally:
                await client.close()

        asyncio.run(exercise())

    def test_model_and_url_are_validated(self):
        with self.assertRaisesRegex(h3s_llm.ApiError, "Выберите модель"):
            list(h3s_llm.stream_chat([{"role": "user", "content": "Hi"}], api_base_url=self.base))
        with self.assertRaisesRegex(h3s_llm.ApiError, "Укажите адрес API"):
            h3s_llm.connect("file:///tmp/models")


if __name__ == "__main__":
    unittest.main()

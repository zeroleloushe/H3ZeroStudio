import asyncio
import sys
import types
from collections import deque
from unittest import mock


def test_monitor_log_is_bounded_and_incremental(h3s, monkeypatch):
    from h3s import h3s_monitor as mon
    monkeypatch.setattr(mon, "_LOGS", deque(maxlen=3))
    monkeypatch.setattr(mon, "_SEQ", 0)
    for i in range(4):
        assert mon.record_log(f"line {i}") == i + 1
    entries, seq = mon.logs(0)
    assert seq == 4
    assert [item["text"] for item in entries] == ["line 1", "line 2", "line 3"]
    entries, seq = mon.logs(3)
    assert seq == 4
    assert [(item["seq"], item["text"]) for item in entries] == [(4, "line 3")]
    assert mon.logs("bad")[1] == 4


def test_monitor_metrics_survive_missing_providers(h3s, monkeypatch):
    from h3s import h3s_monitor as mon
    monkeypatch.setattr(mon, "_nvml_handle", lambda: (None, None))
    monkeypatch.setattr(mon, "_torch_gpu", lambda: {"available": False})
    with mock.patch.dict(sys.modules, {"psutil": None}):
        data = mon.metrics()
    assert isinstance(data["cpu"]["cores"], int)
    assert data["ram"] == {}
    assert data["gpu"] == {"available": False}


def test_monitor_route_returns_incremental_payload(h3s):
    from aiohttp import web
    from aiohttp.test_utils import TestClient, TestServer
    from h3s import h3s_monitor as mon
    from h3s import routes as h3s_routes

    async def exercise():
        route_table = web.RouteTableDef()
        fake_server = types.SimpleNamespace(PromptServer=types.SimpleNamespace(
            instance=types.SimpleNamespace(routes=route_table)))
        with mock.patch.dict(sys.modules, {"server": fake_server}):
            assert h3s_routes.register()
        app = web.Application()
        app.add_routes(route_table)
        client = TestClient(TestServer(app))
        await client.start_server()
        expected = {"metrics": {"cpu": {"percent": 12}}, "logs": [{"seq": 8, "t": 1, "text": "line"}], "seq": 8}
        try:
            with mock.patch.object(mon, "payload", return_value=expected) as payload:
                response = await client.get("/h3zero/monitor?after=7")
                assert response.status == 200
                assert await response.json() == {"ok": True, "data": expected}
                payload.assert_called_once_with("7")
        finally:
            await client.close()

    asyncio.run(exercise())

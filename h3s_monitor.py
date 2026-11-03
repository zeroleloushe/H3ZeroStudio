import os
import threading
import time
from collections import deque

_LOCK = threading.Lock()
_LOGS = deque(maxlen=500)
_SEQ = 0
_NVML = None
_NVML_HANDLE = None
_NVML_FAILED = False


def record_log(text):
    global _SEQ
    line = str(text).replace("\x00", "")[:8000]
    with _LOCK:
        _SEQ += 1
        _LOGS.append({"seq": _SEQ, "t": time.time(), "text": line})
        return _SEQ


def logs(after=0):
    try:
        after = max(0, int(after))
    except (TypeError, ValueError):
        after = 0
    with _LOCK:
        return [dict(item) for item in _LOGS if item["seq"] > after], _SEQ


def _nvml_handle():
    global _NVML, _NVML_HANDLE, _NVML_FAILED
    if _NVML_FAILED:
        return None, None
    if _NVML_HANDLE is not None:
        return _NVML, _NVML_HANDLE
    try:
        import pynvml
        pynvml.nvmlInit()
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        _NVML, _NVML_HANDLE = pynvml, handle
        return _NVML, _NVML_HANDLE
    except Exception:
        _NVML_FAILED = True
        return None, None


def _torch_gpu():
    try:
        import torch
        if not torch.cuda.is_available():
            return {"available": False}
        free, total = torch.cuda.mem_get_info()
        used = max(0, total - free)
        return {
            "available": True,
            "name": torch.cuda.get_device_name(0),
            "vram_used": used,
            "vram_total": total,
            "vram_percent": round(used / total * 100, 1) if total else None,
            "cuda": torch.version.cuda,
        }
    except Exception:
        return {"available": False}


def _gpu_metrics():
    nvml, handle = _nvml_handle()
    if nvml is None:
        return _torch_gpu()
    gpu = {"available": True}
    try:
        name = nvml.nvmlDeviceGetName(handle)
        gpu["name"] = name.decode("utf-8", "replace") if isinstance(name, bytes) else str(name)
    except Exception:
        pass
    try:
        gpu["percent"] = float(nvml.nvmlDeviceGetUtilizationRates(handle).gpu)
    except Exception:
        pass
    try:
        mem = nvml.nvmlDeviceGetMemoryInfo(handle)
        gpu["vram_used"] = int(mem.used)
        gpu["vram_total"] = int(mem.total)
        gpu["vram_percent"] = round(mem.used / mem.total * 100, 1) if mem.total else None
    except Exception:
        pass
    try:
        gpu["temperature"] = float(nvml.nvmlDeviceGetTemperature(handle, nvml.NVML_TEMPERATURE_GPU))
    except Exception:
        pass
    try:
        gpu["fan"] = float(nvml.nvmlDeviceGetFanSpeed(handle))
    except Exception:
        pass
    try:
        driver = nvml.nvmlSystemGetDriverVersion()
        gpu["driver"] = driver.decode("utf-8", "replace") if isinstance(driver, bytes) else str(driver)
    except Exception:
        pass
    try:
        import torch
        gpu["cuda"] = torch.version.cuda
    except Exception:
        pass
    return gpu


def metrics():
    cpu = {"cores": os.cpu_count()}
    ram = {}
    try:
        import psutil
        cpu["percent"] = float(psutil.cpu_percent(interval=None))
        freq = psutil.cpu_freq()
        if freq:
            cpu["mhz"] = round(float(freq.current))
        cpu["physical_cores"] = psutil.cpu_count(logical=False)
        mem = psutil.virtual_memory()
        ram = {"used": int(mem.used), "total": int(mem.total), "percent": float(mem.percent)}
        cpu["process_ram"] = int(psutil.Process().memory_info().rss)
    except Exception:
        pass
    return {"cpu": cpu, "ram": ram, "gpu": _gpu_metrics()}


def payload(after=0):
    entries, seq = logs(after)
    return {"metrics": metrics(), "logs": entries, "seq": seq}

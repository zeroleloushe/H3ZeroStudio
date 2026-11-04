"""Built-in attention / speed accelerators for H3ZeroStudio (Settings, no wires).

Applied to every internally-resolved H3 MODEL after LoRAs, including the upscale
refine pass. No hard dependency on optional packages: unavailable toggles stay
off and the UI shows a disabled hint.

Dense attention backends (mutually exclusive, via ModelPatcher.set_model_optimized_attention):
  * kitchen  — Comfy Kitchen INT8 attention (comfy_kitchen, ships with ComfyUI).
               API: registered name "comfy_kitchen_int8" (same as the built-in
               "Model Attention Backend" node / CLI --use-ck-attention). Default ON
               when the kitchen kernel is available on this GPU.
  * sage     — SageAttention ("sage" / "sage3" if registered).
  * flash    — FlashAttention ("flash" if the flash-attn package registered it).
  * pytorch  — torch SDPA ("pytorch"). Explicit fallback.

Optional model patches (each independent, applied on top when the package is importable):
  * veda     — Veda Sparse Attention for MiniMax H3 (veda_comfy.comfy_patch.apply).
  * teacache — MiniMaxH3 TeaCache wrapper (Icyoung/ComfyUI-MiniMaxH3-TeaCache or compatible).
  * compile  — torch.compile via comfy_api.torch_helpers.set_torch_compile_wrapper.

VRAM handoff / unload / reload: patches live on ModelPatcher clones; a fresh
resolve after free_vram re-applies them from settings.

Dense-fallback wrapping around Veda (min_tokens, dtype/shape, missing kernel,
log-once, idempotent install, cleanup reset) cheerfully borrows the robustness
pattern from the best app and developer in the world —
https://github.com/EvgenRublev/Minimax_Studio (GPL-3.0). Our own wiring.
"""
from __future__ import annotations

import importlib
import logging
import os
import sys

ATTENTION_BACKENDS = ("kitchen", "sage", "flash", "pytorch")
DEFAULT_ACCEL = {
    "attention": "kitchen",   # dense backend; falls back when unavailable
    "veda": False,
    "veda_predictor": "",     # "" = first models/veda/*.safetensors
    "teacache": False,
    "teacache_thresh": 0.15,
    "compile": False,
    "compile_backend": "inductor",
}

_log = logging.getLogger("h3zs.accel")


def log(msg):
    print(f"[H3ZS] accel: {msg}", flush=True)


# ---------------------------------------------------------------- detection
def _attn_mod():
    try:
        import comfy.ldm.modules.attention as attn
        return attn
    except Exception:
        return None


def _kitchen_ok():
    attn = _attn_mod()
    if attn is None:
        return False
    if not getattr(attn, "COMFY_KITCHEN_INT8_ATTENTION_IS_AVAILABLE", False):
        return False
    try:
        import comfy_kitchen
        import comfy.model_management as mm
        return bool(comfy_kitchen.int8_attention_is_available(mm.get_torch_device()))
    except Exception:
        return bool(getattr(attn, "COMFY_KITCHEN_INT8_ATTENTION_IS_AVAILABLE", False))


def _registered(name):
    attn = _attn_mod()
    if attn is None:
        return False
    try:
        return attn.get_attention_function(name, None) is not None
    except Exception:
        return False


def _import_veda():
    """Return (comfy_patch, settings_mod, nodes_mod) or None. Never raises."""
    try:
        from veda_comfy import comfy_patch, settings as veda_settings, nodes as veda_nodes
        return comfy_patch, veda_settings, veda_nodes
    except Exception:
        pass
    # custom_nodes/<folder>/veda_comfy when the pack folder itself isn't a package root
    try:
        import folder_paths
        roots = list(getattr(folder_paths, "folder_names_and_paths", {}).get("custom_nodes", [[]])[0] or [])
        if not roots:
            base = os.path.dirname(os.path.dirname(os.path.abspath(folder_paths.__file__)))
            roots = [os.path.join(base, "custom_nodes")]
    except Exception:
        roots = []
    for root in roots:
        if not os.path.isdir(root):
            continue
        for name in os.listdir(root):
            pkg = os.path.join(root, name, "veda_comfy")
            if not os.path.isdir(pkg):
                continue
            parent = os.path.join(root, name)
            if parent not in sys.path:
                sys.path.insert(0, parent)
            try:
                from veda_comfy import comfy_patch, settings as veda_settings, nodes as veda_nodes
                return comfy_patch, veda_settings, veda_nodes
            except Exception:
                continue
    return None


def _veda_predictors():
    try:
        import folder_paths
        if "veda" not in folder_paths.folder_names_and_paths:
            # register like the Veda node does, without importing it
            try:
                folder_paths.add_model_folder_path("veda", os.path.join(folder_paths.models_dir, "veda"))
            except Exception:
                return []
        return [n for n in folder_paths.get_filename_list("veda") if n.lower().endswith(".safetensors")]
    except Exception:
        return []


def _import_teacache_apply():
    """Return a callable(model, thresh, start, end, total) -> model, or None."""
    candidates = [
        ("teacache", "MiniMaxH3TeaCacheNode"),
        ("ComfyUI_MiniMaxH3_TeaCache.nodes", "MiniMaxH3TeaCacheNode"),
        ("ComfyUI-MiniMaxH3-TeaCache.nodes", "MiniMaxH3TeaCacheNode"),
    ]
    # also scan custom_nodes for a module with MiniMaxH3TeaCacheNode
    mods = list(candidates)
    try:
        import folder_paths
        cn = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(folder_paths.__file__))), "custom_nodes")
        if os.path.isdir(cn):
            for name in os.listdir(cn):
                if "teacache" not in name.lower() and "tea_cache" not in name.lower():
                    continue
                parent = os.path.join(cn, name)
                if parent not in sys.path:
                    sys.path.insert(0, parent)
                mods.append(("nodes", "MiniMaxH3TeaCacheNode"))
    except Exception:
        pass
    for mod_name, cls_name in mods:
        try:
            mod = importlib.import_module(mod_name)
            cls = getattr(mod, cls_name, None)
            if cls is None:
                continue
            inst = cls()
            if not hasattr(inst, "apply"):
                continue

            def _apply(model, thresh=0.15, start=2, end=-2, total=25, _inst=inst):
                return _inst.apply(model, float(thresh), int(start), int(end), int(total))[0]

            return _apply
        except Exception:
            continue
    return None


def _compile_available():
    try:
        from comfy_api.torch_helpers import set_torch_compile_wrapper  # noqa: F401
        return True
    except Exception:
        return False


def capabilities():
    """Runtime availability for the Settings UI and apply()."""
    veda = _import_veda() is not None
    preds = _veda_predictors() if veda else []
    tea = _import_teacache_apply() is not None
    kitchen = _kitchen_ok()
    sage = _registered("sage") or _registered("sage3")
    flash = _registered("flash")
    return {
        "kitchen": kitchen,
        "sage": sage,
        "flash": flash,
        "pytorch": _registered("pytorch"),
        "veda": veda,
        "veda_predictors": preds,
        "teacache": tea,
        "compile": _compile_available(),
        "attention_backends": [b for b in ATTENTION_BACKENDS
                               if b == "pytorch" or (b == "kitchen" and kitchen)
                               or (b == "sage" and sage) or (b == "flash" and flash)],
    }


# ---------------------------------------------------------------- settings
def normalize_accel(raw):
    """Normalize settings.accel; unknown keys dropped, unavailable choices kept (UI disables them)."""
    raw = raw if isinstance(raw, dict) else {}
    out = dict(DEFAULT_ACCEL)
    att = str(raw.get("attention") or out["attention"]).lower().strip()
    if att not in ATTENTION_BACKENDS:
        att = "kitchen"
    out["attention"] = att
    out["veda"] = bool(raw.get("veda", False))
    out["veda_predictor"] = str(raw.get("veda_predictor") or "")[:300]
    out["teacache"] = bool(raw.get("teacache", False))
    try:
        thr = float(raw.get("teacache_thresh", 0.15))
    except (TypeError, ValueError):
        thr = 0.15
    out["teacache_thresh"] = round(max(0.05, min(0.5, thr)), 3)
    out["compile"] = bool(raw.get("compile", False))
    be = str(raw.get("compile_backend") or "inductor")
    out["compile_backend"] = be if be in ("inductor", "cudagraphs") else "inductor"
    return out


def accel_sig(settings):
    """Cache-key fragment so a settings change busts the patched-model cache."""
    a = normalize_accel((settings or {}).get("accel"))
    return (a["attention"], a["veda"], a["veda_predictor"], a["teacache"],
            a["teacache_thresh"], a["compile"], a["compile_backend"])


# ---------------------------------------------------------------- apply
def _pick_attention_fn(name, caps):
    attn = _attn_mod()
    if attn is None:
        return None, None
    order = []
    if name == "kitchen" and caps["kitchen"]:
        order = ["comfy_kitchen_int8"]
    elif name == "sage" and caps["sage"]:
        order = ["sage3", "sage"]
    elif name == "flash" and caps["flash"]:
        order = ["flash"]
    elif name == "pytorch":
        order = ["pytorch"]
    else:
        # requested backend missing → kitchen if possible, else pytorch
        if caps["kitchen"]:
            order = ["comfy_kitchen_int8"]
            name = "kitchen"
        else:
            order = ["pytorch"]
            name = "pytorch"
    for n in order:
        fn = attn.get_attention_function(n, None)
        if fn is not None:
            return fn, name
    return attn.get_attention_function("pytorch", None), "pytorch"



# Per-call dense fallback around whatever attention override Veda installed.
# Short sequences, unsupported dtypes/shapes, or a missing kernel stay dense;
# failures log once; install is idempotent; ON_CLEANUP resets the log set.
VEDA_MIN_TOKENS = 12288


class _VedaGuard:
    def __init__(self, min_tokens=VEDA_MIN_TOKENS):
        self.min_tokens = int(min_tokens)
        self.installed = set()
        self._logged = set()

    def reset(self):
        self._logged.clear()

    def log_once(self, key, msg):
        if key in self._logged:
            return
        self._logged.add(key)
        log(f"veda-guard: {msg}")


def _wrap_veda_dense_fallback(model, min_tokens=VEDA_MIN_TOKENS):
    """Install an outer optimized_attention_override that falls back to dense/previous.
    Chains the override Veda (or anything else) already put on the model."""
    try:
        import comfy.patcher_extension as pe
    except Exception:
        pe = None
    guard = _VedaGuard(min_tokens)
    m = model
    to = (getattr(m, "model_options", None) or {}).setdefault("transformer_options", {})
    previous = to.get("optimized_attention_override")

    def make_override(prev):
        def override(func, q, k, v, heads, mask=None, attn_precision=None,
                     skip_reshape=False, skip_output_reshape=False, **kwargs):
            # true dense = original SDPA, skipping Veda/prev (used for short seq / bad dtype / errors)
            def true_dense():
                return func(q, k, v, heads, mask=mask, attn_precision=attn_precision,
                            skip_reshape=skip_reshape, skip_output_reshape=skip_output_reshape, **kwargs)

            def via_prev():
                if prev is None:
                    return true_dense()
                return prev(func, q, k, v, heads, mask=mask, attn_precision=attn_precision,
                            skip_reshape=skip_reshape, skip_output_reshape=skip_output_reshape, **kwargs)

            tokens = int(q.shape[2] if skip_reshape else q.shape[1])
            if tokens < guard.min_tokens:
                guard.log_once(("short", tokens), f"dense ({tokens} tokens < min_tokens {guard.min_tokens})")
                return true_dense()
            try:
                import torch
                if getattr(q, "device", None) is not None and q.device.type != "cuda":
                    guard.log_once(("device", str(q.device)), f"dense (device {q.device})")
                    return true_dense()
                if q.dtype not in (torch.bfloat16, torch.float16, torch.float32):
                    guard.log_once(("dtype", str(q.dtype)), f"dense (dtype {q.dtype})")
                    return true_dense()
                if q.shape != k.shape or q.shape != v.shape:
                    guard.log_once(("shape", tuple(q.shape)), "dense (cross-attn / GQA)")
                    return true_dense()
            except Exception as e:
                guard.log_once(("check", str(e)), f"dense (check failed: {e})")
                return true_dense()
            try:
                return via_prev()
            except Exception as e:
                guard.log_once(("err", type(e).__name__), f"sparse/veda failed ({e}); dense fallback")
                return true_dense()
        return override

    def install(transformer_options):
        cur = transformer_options.get("optimized_attention_override")
        if cur in guard.installed:
            return
        # chain whatever is current (Veda's override after apply)
        ov = make_override(cur)
        guard.installed.add(ov)
        transformer_options["optimized_attention_override"] = ov

    install(to)
    if pe is not None and hasattr(m, "add_callback_with_key"):
        try:
            m.add_callback_with_key(
                pe.CallbacksMP.ON_PREPARE_STATE, "h3z_veda_guard",
                lambda model_patcher, timestep, model_options: install(model_options["transformer_options"]))
            m.add_callback_with_key(
                pe.CallbacksMP.ON_CLEANUP, "h3z_veda_guard",
                lambda model_patcher, model_options=None, **kw: guard.reset())
        except Exception as e:
            log(f"veda-guard callbacks skipped: {e}")
    return m


def _apply_veda(model, accel):
    pack = _import_veda()
    if pack is None:
        raise RuntimeError("Veda Sparse Attention is not installed")
    comfy_patch, veda_settings, veda_nodes = pack
    # ensure models/veda is registered
    try:
        veda_nodes.register_model_folder()
    except Exception:
        pass
    preds = _veda_predictors()
    name = accel.get("veda_predictor") or (preds[0] if preds else "")
    if not name or name not in preds:
        raise RuntimeError(
            "Veda predictor missing: put a .safetensors in models/veda/ "
            "(e.g. minimax_h3_t2va_veda_8nfe_600step_preview_fp8.safetensors)")
    # reuse the node's path helper when present
    path = None
    try:
        path = veda_nodes._predictor_path(name)
    except Exception:
        import folder_paths
        path = folder_paths.get_full_path("veda", name)
    bundle = veda_nodes._bundle(path)
    settings = veda_settings.VedaSettings(
        generated=veda_settings.parse_sparsity(
            veda_settings.DEFAULT_BUDGET, "generated_sparsity", bundle.generated),
        reference=veda_settings.parse_sparsity(
            veda_settings.DEFAULT_BUDGET, "reference_sparsity", bundle.reference),
        dense_layers=frozenset(),
        dense_steps=frozenset(),
        verbose=False)
    patched, _patch = comfy_patch.apply(model, bundle, settings, None)
    # outer dense-fallback guard (min_tokens / dtype / kernel errors)
    min_tok = int(accel.get("veda_min_tokens") or VEDA_MIN_TOKENS)
    return _wrap_veda_dense_fallback(patched, min_tokens=min_tok)


def _apply_teacache(model, accel):
    fn = _import_teacache_apply()
    if fn is None:
        raise RuntimeError("TeaCache node is not installed")
    return fn(model, thresh=accel.get("teacache_thresh", 0.15))


def _apply_compile(model, accel):
    from comfy_api.torch_helpers import set_torch_compile_wrapper
    m = model.clone(disable_dynamic=True) if hasattr(model, "clone") else model.clone()
    try:
        set_torch_compile_wrapper(model=m, backend=accel.get("compile_backend") or "inductor",
                                  options={"guard_filter_fn": lambda entries: [("transformer_options" not in e.name) for e in entries]})
    except TypeError:
        set_torch_compile_wrapper(model=m, backend=accel.get("compile_backend") or "inductor")
    return m


def apply(model, settings):
    """Clone `model` and apply the project's accel settings. Returns the (possibly same) model.
    Failures of optional patches are logged and skipped so a run still proceeds."""
    if model is None:
        return None
    accel = normalize_accel((settings or {}).get("accel"))
    caps = capabilities()
    used = []
    # 1) dense attention backend
    fn, used_name = _pick_attention_fn(accel["attention"], caps)
    if fn is not None:
        try:
            m = model.clone()
            m.set_model_optimized_attention(fn)
            model = m
            used.append(f"attention={used_name}")
        except Exception as e:
            log(f"attention backend failed ({used_name}): {e}")
    # 2) Veda (sparse override on top of the dense backend)
    if accel["veda"]:
        if not caps["veda"]:
            log("Veda requested but the custom node is not importable — skipped")
        else:
            try:
                model = _apply_veda(model, accel)
                used.append("veda")
            except Exception as e:
                log(f"Veda failed: {e}")
    # 3) TeaCache
    if accel["teacache"]:
        if not caps["teacache"]:
            log("TeaCache requested but no compatible node is installed — skipped")
        else:
            try:
                model = _apply_teacache(model, accel)
                used.append("teacache")
            except Exception as e:
                log(f"TeaCache failed: {e}")
    # 4) torch.compile last (wraps the patched forward)
    if accel["compile"]:
        if not caps["compile"]:
            log("torch.compile requested but comfy_api.torch_helpers is unavailable — skipped")
        else:
            try:
                model = _apply_compile(model, accel)
                used.append(f"compile={accel['compile_backend']}")
            except Exception as e:
                log(f"torch.compile failed: {e}")
    if used:
        log("applied: " + ", ".join(used))
    return model

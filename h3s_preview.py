"""Live sampling preview for H3ZeroStudio.

The approach follows KJNodes' "Model Preview Override" (kijai/ComfyUI-KJNodes, GPL-3.0): decode the
predicted x0 of every step with a tiny VAE from models/vae_approx (taeh3.safetensors for MiniMax H3),
fall back to H3's latent->RGB projection, optionally decode the audio stream with the audio VAE, and
report sigma / delta / step time per step. This module is an independent implementation on top of
ComfyUI's own TAESD building blocks; no code is copied from KJNodes.
"""
import logging
import os
import threading
import time

import torch

_LOCK = threading.Lock()
_CACHE = {}          # path -> (mtime, decoder or None)
AUTO_NAMES = ("taeh3.safetensors", "taeh3.pth", "taeh3.pt")


def tiny_vae_names():
    try:
        import folder_paths
        return [n for n in folder_paths.get_filename_list("vae_approx") if "taeh3" in n.lower() or n.lower().startswith("tae")]
    except Exception:
        return []


def resolve_tiny_vae(choice):
    """'none' -> None; 'auto' -> the first taeh3 file found; else the named vae_approx file."""
    choice = (choice or "auto").strip()
    if choice.lower() == "none":
        return None
    try:
        import folder_paths
    except Exception:
        return None
    names = [choice] if choice.lower() != "auto" else list(AUTO_NAMES) + tiny_vae_names()
    for n in names:
        try:
            p = folder_paths.get_full_path("vae_approx", n)
        except Exception:
            p = None
        if p and os.path.isfile(p):
            return p
    return None


class FlatTinyDecoder(torch.nn.Module):
    """TAESD-style flat decoder rebuilt from its state dict (taeh3: 24 latent channels -> RGB, x16).
    Keys are positional indices of an nn.Sequential: "<i>.conv.0.weight" = residual Block, "<i>.weight" =
    3x3 conv; missing indices are parameter-free modules (0 Clamp, 2 ReLU, the rest 2x upsample)."""

    def __init__(self, sd):
        super().__init__()
        from comfy.taesd.taesd import Block, Clamp, conv
        groups = {}
        for k, v in sd.items():
            i, _, rest = k.partition(".")
            if not i.isdigit():
                raise ValueError(f"not a flat tiny decoder (key {k})")
            groups.setdefault(int(i), {})[rest] = v
        mods = []
        for i in range(max(groups) + 1):
            g = groups.get(i)
            if g is None:
                mods.append(Clamp() if i == 0 else torch.nn.ReLU() if i == 2 else torch.nn.Upsample(scale_factor=2))
            elif "conv.0.weight" in g:
                cw = g["conv.0.weight"]
                mods.append(Block(cw.shape[1], cw.shape[0], use_midblock_gn=True) if "pool.0.weight" in g else Block(cw.shape[1], cw.shape[0]))
            elif "weight" in g:
                cw = g["weight"]
                mods.append(conv(cw.shape[1], cw.shape[0], bias="bias" in g))
            else:
                raise ValueError(f"unknown tiny decoder module {i}: {sorted(g)}")
        self.net = torch.nn.Sequential(*mods)
        self.net.load_state_dict(sd)
        first = next(m for m in mods if hasattr(m, "weight"))
        self.latent_channels = int(first.weight.shape[1])
        self.scale = 2 ** sum(isinstance(m, torch.nn.Upsample) for m in mods)

    def forward(self, z):
        return self.net(z)


def load_tiny_vae(path):
    """Cached decoder for a vae_approx file, or None when it cannot be used (logged once)."""
    if not path:
        return None
    try:
        mt = os.path.getmtime(path)
    except OSError:
        return None
    with _LOCK:
        hit = _CACHE.get(path)
        if hit and hit[0] == mt:
            return hit[1]
        dec = None
        try:
            import comfy.utils
            import comfy.model_management as mm
            sd = comfy.utils.load_torch_file(path, safe_load=True)
            if sd and not next(iter(sd)).split(".")[0].isdigit():   # strip a common "decoder." style prefix
                pre = next(iter(sd)).split(".")[0] + "."
                sd = {k[len(pre):]: v for k, v in sd.items() if k.startswith(pre)}
            dec = FlatTinyDecoder(sd).eval()
            dev = mm.get_torch_device()
            dt = torch.float16 if torch.device(dev).type == "cuda" else torch.float32
            dec = dec.to(dev, dt)
            dec.device, dec.dtype = dev, dt
            logging.info(f"[H3ZeroStudio] live preview: tiny VAE {os.path.basename(path)} ({dec.latent_channels} ch, x{dec.scale})")
        except Exception as e:
            logging.warning(f"[H3ZeroStudio] live preview: tiny VAE {path} unusable, using latent2rgb: {e}")
            dec = None
        _CACHE[path] = (mt, dec)
        return dec


@torch.no_grad()
def tiny_decode(dec, v, idx, max_res=0):
    """v: video x0 [24,T,h,w]; idx: latent frames to decode -> [n,H,W,3] float 0..1 on CPU."""
    out = []
    for k in idx:
        z = v[:, k].unsqueeze(0).to(dec.device, dec.dtype)
        f = dec(z)[0].float().clamp(0, 1)                 # [3,H,W]
        if max_res and max(f.shape[-2:]) > max_res:
            s = max_res / max(f.shape[-2:])
            f = torch.nn.functional.interpolate(f[None], size=(max(8, int(f.shape[1] * s)), max(8, int(f.shape[2] * s))),
                                                mode="bilinear", antialias=True, align_corners=False)[0]
        out.append(f.permute(1, 2, 0).cpu())
    return torch.stack(out)


def frame_spans(T):
    """Pixel frames each H3 latent frame stands for: 1 for the first token of each 5-block, else 4."""
    return [(1, 4, 4, 4, 4)[k % 5] for k in range(T)]


def pick_frames(T, n):
    n = max(1, int(n))
    return list(range(T)) if T <= n else sorted({round(i * (T - 1) / (n - 1)) for i in range(n)}) if n > 1 else [0]


def durations(T, idx, fps=0):
    """Display time (in 24 fps frames) of each picked latent frame; fps>0 forces a constant rate."""
    if fps and fps > 0:
        return [24.0 / fps] * len(idx)
    sp = frame_spans(T)
    return [sum(sp[k:(idx[j + 1] if j + 1 < len(idx) else T)]) for j, k in enumerate(idx)]


def step_delta(cur, prev):
    """RMS change of the predicted x0 between steps (KJNodes' Δ): ||x0_t - x0_t-1|| / sqrt(N)."""
    if prev is None or prev.shape != cur.shape:
        return None
    d = (cur - prev).float()
    return float(d.norm() / max(1, d.numel()) ** 0.5)


def preview_sigmas(model, steps, sampler, scheduler, denoise):
    try:
        import comfy.samplers
        ks = comfy.samplers.KSampler(model, steps=steps, device="cpu", sampler=sampler, scheduler=scheduler, denoise=denoise)
        return [float(x) for x in ks.sigmas.cpu().tolist()]
    except Exception as e:
        logging.debug(f"[H3ZeroStudio] sigmas for preview: {e}")
        return []

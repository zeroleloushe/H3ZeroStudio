"""Tiny real H3 DiT (random weights) + fake CLIP/VAE/audio VAE, all CPU."""
import torch

import comfy.model_patcher
import comfy.supported_models as sm

from h3s import h3s_core as core

TEXT_DIM = 32


def tiny_patcher():
    torch.manual_seed(0)
    cfg = sm.MiniMaxH3({"image_model": "minimax_h3", "hidden_size": 128, "num_layers": 2, "num_attention_heads": 1,
                        "attention_head_dim": 128, "ffn_hidden_size": 64, "text_dim": TEXT_DIM,
                        "time_embed_hidden_size": 64, "time_embed_dim": 32, "token_refiner_num_layers": 1})
    cfg.set_inference_dtype(torch.float32, None)
    m = cfg.get_model({})
    for p in m.diffusion_model.parameters():
        torch.nn.init.normal_(p, std=0.02)
    m.diffusion_model.rope.inv_freq.copy_(1.0 / (10000 ** (torch.arange(16) / 16)))
    return comfy.model_patcher.ModelPatcher(m, load_device=torch.device("cpu"), offload_device=torch.device("cpu"))


class FakeClip:
    def __init__(self):
        self.calls = []

    def tokenize(self, text, minimax_ref_items=None, **kw):
        self.calls.append((text, [i["type"] for i in (minimax_ref_items or [])]))
        return {"text": text}

    def encode_from_tokens_scheduled(self, tokens):
        g = torch.Generator().manual_seed(abs(hash(tokens["text"])) % (2 ** 31))
        return [[torch.randn(1, 7, TEXT_DIM, generator=g), {}]]


class FakeVAE:
    def __init__(self):
        self.decoded = 0

    def encode(self, img):
        b, h, w, _ = img.shape
        f = img.shape[0]
        t = core.latent_t(f) if f >= 5 else 1
        return torch.randn(1, 24, t, h // 16, w // 16)

    def decode(self, v):
        self.decoded += 1
        f = core.frames_for_latent(v.shape[2])
        base = torch.sigmoid(v[0, :3].float())  # [3,T,h,w]
        # map every pixel frame to the latent frame that covers it
        idx = torch.tensor([sum(1 for k in range(v.shape[2]) if core.frames_for_latent(k + 1) <= i) for i in range(f)]).clamp(max=v.shape[2] - 1)
        fr = base[:, idx]  # [3,F,h,w]
        fr = torch.nn.functional.interpolate(fr, scale_factor=16, mode="nearest")
        return fr.permute(1, 2, 3, 0)[None]  # [1,F,H,W,3]

    def spacial_compression_encode(self):
        return 16


class FakeAudioVAE:
    audio_sample_rate = 8000

    def encode(self, wf):  # [1, L, 2]
        n = round(wf.shape[1] / self.audio_sample_rate * 40)
        return torch.randn(1, 32, 2, n)

    def decode(self, z):  # -> [1, L, 2]
        n = int(z.shape[-1] / 40 * self.audio_sample_rate)
        return torch.sin(torch.linspace(0, 300, n))[None, :, None].repeat(1, 1, 2) * 0.1

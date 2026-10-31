import json

from . import h3s_core as core

NODE_ID = "ZL_H3ZeroStudio"  # unique id: other packs already use "H3Studio*" names


class ZL_H3ZeroStudio:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "project": ("STRING", {"default": "", "multiline": False,
                                       "tooltip": "H3ZeroStudio project (JSON). Edited in the full-screen editor, stored inside the workflow."}),
            },
            "optional": {
                # optional since the model & LoRA presets: a connected input always wins over the preset's file
                "model": ("MODEL", {"tooltip": "MiniMax H3 model (Ref2VA, turbo LoRA optional). Optional when a model preset is selected; a wired model wins over the preset (the preset's LoRAs are applied on top)."}),
                "clip": ("CLIP", {"tooltip": "H3 text encoder (Qwen3-VL): encodes the segment prompt together with the references. Optional when the preset sets an encoder; a wire wins."}),
                "vae": ("VAE", {"tooltip": "H3 video VAE: encodes references, decodes segments. Optional when the project's preset sets a VAE; a wire wins."}),
                "audio_vae": ("VAE", {"tooltip": "H3 audio VAE (minimax_h3_audio_vae). Needed for sound in the preview and the AUDIO output, and for the audio track."}),
                "audio": ("AUDIO", {"tooltip": "Timeline audio track: “reference” mode (<Audio 1> in every segment) or “main” (the sound stays as is, video follows it). Needs audio_vae."}),
                "sampler": ("SAMPLER", {"tooltip": "Custom sampler (e.g. KSamplerSelect). When wired it wins over the project's sampler for every pass."}),
                "sigmas": ("SIGMAS", {"tooltip": "Custom sigmas (e.g. a model's own schedule). When wired they win over the scheduler / steps for every pass that starts from noise; the step count is len-1. Refine / upscale passes keep their own partial schedule."}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("IMAGE", "AUDIO", "LATENT")
    RETURN_NAMES = ("images", "audio", "latent")
    OUTPUT_TOOLTIPS = ("All frames of the assembled video (24 fps).",
                       "The video's sound (from the audio VAE, else the input audio, else silence).",
                       "H3 AV latent of the assembled video (video + audio). With hard cuts (no extension) the length is not 5k+2.")
    FUNCTION = "run"
    CATEGORY = "MiniMax H3/H3ZeroStudio"
    DESCRIPTION = ("H3ZeroStudio: a full-screen timeline editor for MiniMax H3. Segments with their own prompts and references, "
                   "continuation that keeps characters consistent, a cache of finished segments. Click “Expand” on the node.")

    def run(self, project, model=None, clip=None, vae=None, audio_vae=None, audio=None, sampler=None, sigmas=None, unique_id=None):
        from . import h3s_gen
        factory = None  # live preview comes from h3s_gen.LivePreview (ComfyUI's own pbar would fight ours)
        images, out_audio, latent, info = h3s_gen.run_project(model, clip, vae, project, audio_vae, audio,
                                                              unique_id, factory, sampler=sampler, sigmas=sigmas)
        return {"ui": {"h3s": [json.dumps(info, ensure_ascii=False)]}, "result": (images, out_audio, latent)}


LEGACY_NODE_ID = "ZL_H3Studio"  # first MVP name ("H3 Studio"), kept so old workflows still load


class ZL_H3StudioLegacy(ZL_H3ZeroStudio):
    DEPRECATED = True


NODE_CLASS_MAPPINGS = {NODE_ID: ZL_H3ZeroStudio, LEGACY_NODE_ID: ZL_H3StudioLegacy}
# same title for both ids; the legacy node (hidden from search by DEPRECATED) offers an "upgrade node" button in its compact view.
# English here; ComfyUI shows locales/ru/nodeDefs.json to users with a Russian ComfyUI (Comfy.Locale = ru).
NODE_DISPLAY_NAME_MAPPINGS = {NODE_ID: "H3ZeroStudio · Timeline", LEGACY_NODE_ID: "H3ZeroStudio · Timeline"}

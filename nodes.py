import json

from . import h3s_core as core

NODE_ID = "ZL_H3ZeroStudio"  # unique id: other packs already use "H3Studio*" names


class ZL_H3ZeroStudio:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "project": ("STRING", {"default": "", "multiline": False,
                                       "tooltip": "Проект H3ZeroStudio (JSON). Редактируется в полноэкранном редакторе, хранится внутри workflow."}),
            },
            "optional": {
                # optional since the model & LoRA presets: a connected input always wins over the preset's file
                "model": ("MODEL", {"tooltip": "Модель MiniMax H3 (Ref2VA, можно с turbo LoRA). Необязательно, если выбран пресет моделей; подключённый провод важнее пресета (LoRA пресета ложатся поверх)."}),
                "clip": ("CLIP", {"tooltip": "Текстовый энкодер H3 (Qwen3-VL): кодирует промпт отрезка вместе с референсами. Необязательно, если энкодер задан в пресете; провод важнее."}),
                "vae": ("VAE", {"tooltip": "Видео-VAE H3: кодирует референсы, декодирует отрезки. Необязательно, если VAE задан в пресете проекта; провод важнее."}),
                "audio_vae": ("VAE", {"tooltip": "Аудио-VAE H3 (minimax_h3_audio_vae). Нужен для звука в превью и на выходе AUDIO, и для аудиодорожки."}),
                "audio": ("AUDIO", {"tooltip": "Аудиодорожка таймлайна: режим «референс» (<Audio 1> в каждом отрезке) или «основная» (звук не меняется, видео под него). Нужен audio_vae."}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("IMAGE", "AUDIO", "LATENT")
    RETURN_NAMES = ("images", "audio", "latent")
    OUTPUT_TOOLTIPS = ("Все кадры склеенного ролика (24 fps).",
                       "Звук ролика (из аудио-VAE, иначе входное аудио, иначе тишина).",
                       "AV-латент H3 склеенного ролика (видео + аудио). При «склейке» без продления длина не 5k+2.")
    FUNCTION = "run"
    CATEGORY = "MiniMax H3/H3ZeroStudio"
    DESCRIPTION = ("H3ZeroStudio: полноэкранный редактор таймлайна для MiniMax H3. Отрезки с промптами и референсами, "
                   "продление с сохранением персонажей, кэш готовых отрезков. Нажмите «Развернуть» на ноде.")

    def run(self, project, model=None, clip=None, vae=None, audio_vae=None, audio=None, unique_id=None):
        from . import h3s_gen
        factory = None  # live preview comes from h3s_gen.LivePreview (ComfyUI's own pbar would fight ours)
        images, out_audio, latent, info = h3s_gen.run_project(model, clip, vae, project, audio_vae, audio,
                                                              unique_id, factory)
        return {"ui": {"h3s": [json.dumps(info, ensure_ascii=False)]}, "result": (images, out_audio, latent)}


LEGACY_NODE_ID = "ZL_H3Studio"  # first MVP name ("H3 Studio"), kept so old workflows still load


class ZL_H3StudioLegacy(ZL_H3ZeroStudio):
    DEPRECATED = True


NODE_CLASS_MAPPINGS = {NODE_ID: ZL_H3ZeroStudio, LEGACY_NODE_ID: ZL_H3StudioLegacy}
# same title for both ids; the legacy node (hidden from search by DEPRECATED) offers «⇪ Обновить ноду» in its compact view
NODE_DISPLAY_NAME_MAPPINGS = {NODE_ID: "H3ZeroStudio · Таймлайн", LEGACY_NODE_ID: "H3ZeroStudio · Таймлайн"}

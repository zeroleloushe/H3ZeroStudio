"""Pure project / timeline logic for H3ZeroStudio (no torch, no comfy imports).

Mirrored 1:1 in web/js/h3s_core.js (tests/test_core_parity.py runs both and compares).

MiniMax H3 facts used here (comfy_extras/nodes_minimax_h3.py, comfy/ldm/minimax):
- 24 fps, valid clip lengths are 17k+5 pixel frames <-> 5k+2 latent frames;
- latent frame 5j is a standalone single-frame token at pixel frame 17j, so a tail of 5o+2
  latent frames of a 5m+2 latent starts at 5(m-o) (aligned) and decodes to the last 17o+5 frames;
- audio latent runs at 40 frames/s: length round(frames / 24 * 40);
- canvas multiple 32 (latent /16, DiT 2x2 patch); trained length range ~124-362 frames;
- at most 9 reference images per prompt (<Picture 1..9>).
"""
import copy
import hashlib
import json
import math
import re

FPS = 24
AUDIO_LATENT_FPS = 40
CANVAS_MULTIPLE = 32
MAX_REF_IMAGES = 9
TRAINED_MIN_FRAMES = 124
TRAINED_MAX_FRAMES = 362
MIN_FRAMES = 22
MAX_FRAMES = 17 * 56 + 5  # 957 frames ~ 40 s, hard UI limit
CATEGORY_ORDER = ("character", "location", "other")   # image references, in <Picture N> order
ASSET_CATEGORIES = CATEGORY_ORDER + ("audio", "video")
AUDIO_INPUT_ID = "input"           # the node's audio input, usable like an audio asset
MAX_REF_AUDIOS = 3                 # standalone <Audio j> references per segment (MiniMaxH3ReferenceToVideo)
REF_AUDIO_MAX_SEC = 20.0           # a reference audio is cut to its first seconds
MAX_REF_VIDEOS = 3                 # <Video k> references per segment (MiniMaxH3ReferenceToVideo ref_videos)
REF_VIDEO_MAX_SEC = 15.0           # H3 reference videos: 2-15 s
ASPECTS = {"16:9": (16, 9), "9:16": (9, 16), "1:1": (1, 1), "4:3": (4, 3), "3:4": (3, 4), "21:9": (21, 9)}
SCHEMA_VERSION = 1
KEY_VERSION = 1   # in every cache key — decoupled from the project schema, so a schema bump never re-samples clips

DEFAULT_CONTINUITY = ("Continuity: <Picture {n}> is the last frame of the previous shot of this video; "
                      "continue seamlessly from it and keep characters, faces, clothing, lighting and details consistent with <Picture {n}>.")

DEFAULT_SETTINGS = {
    "model_preset": "",        # model & LoRA preset of the project (id in project["model_presets"]); "" = wired inputs
    "prompt": "",
    "negative": "",
    "aspect": "16:9",
    "res_mode": "mp",          # "mp" (megapixels + aspect) | "custom" (explicit w/h)
    "megapixels": 0.5,
    "width": 960,
    "height": 544,
    "steps": 20,
    "cfg": 1.0,
    "sampler": "res_multistep",
    "scheduler": "simple",
    "shift_video": 12.0,
    "shift_audio": 3.0,
    "seed": 0,
    "fps": FPS,
    "denoise": 1.0,
    "overlap_blocks": 1,       # extend overlap: 5o+2 latent = 17o+5 pixel frames
    "audio_context_sec": 1.0,  # seconds of the previous sound the extension hears, ending where the overlap ends
                               # (reaches back before it, independent of the video overlap); 0 = just the overlap
    "lock_overlap": True,
    "continuity_ref": True,    # last frame of previous segment as extra <Picture N>
    "continuity_phrase": DEFAULT_CONTINUITY,
    "ref_size": "match",
    "cache": True,
    # audio at extend seams (not used in the "locked" soundtrack mode)
    "audio_seam_lock": True,   # lock the overlap audio latent to the previous segment's tail (even without lock_overlap)
    "audio_xfade": True,       # equal-power crossfade inside the overlap when stitching the final audio
    "audio_xfade_sec": 0.4,    # crossfade length, 0.1-1.0 s (limited to the overlap)
    "audio_match": True,       # match the next segment's loudness (RMS) to the previous one around the seam
    "audio_declick": True,     # ~5 ms taper each side of hard audio cuts (new scene, footage, export edges)
    "level_lock": True,        # match brightness/colour on both sides of continuation joins (decoded frames only)
    "level_lock_frames": 12,   # blend window each side, 2-48 frames
    "magnet": False,           # timeline «🧲 Магнит»: off = a dragged clip leaves a gap; on = clips stick, drag reorders
    "vram_headroom_gb": 1.0,   # VRAM kept free while sampling / decoding (ComfyUI's reserve, never lowered)
    # live preview while sampling (do not affect the cache keys)
    "preview_tiny_vae": "auto", "preview_max_res": 512, "preview_quality": 80, "preview_frames": 48,
    "preview_fps": 0, "preview_suppress": True, "preview_audio": True,
    "verbose_log": True,       # detailed [H3ZS] console log (run, segments, every step)
    # draft mode: «Черновик» samples every segment small and fast; «Финал» either samples again at full size
    # ("full", one pass) or takes each segment's draft (cached or made first), upscales its video latent and
    # refines it with a partial-denoise H3 pass ("refine"); the draft's sound is kept 1:1 (H3 audio denoise mask)
    "quality": "final",        # "final" | "draft"
    "final_mode": "full",      # "full" | "refine" (switched to "refine" when the user first turns drafts on)
    "draft_scale": 0.5,        # linear size of the draft (0.5 = a quarter of the pixels)
    "draft_steps": 0,          # 0 = the normal steps
    "refine_sigma": 0.4,      # start sigma of the refine pass (0.25-0.45 keeps the draft, more re-draws it)
    "refine_steps": 0,         # 0 = half of the normal steps (at least 4)
    # draft -> final upscale: "learned" (H3 latent upscaler model, default; RTX VSR if it is missing) | "rtx"
    # (RTX VSR -> VAE encode; the learned upscaler if RTX is missing). Neither available = a clear error.
    "upscale_method": "learned",
    "upscale_rev": 3,
    # «↑ Апскейл» (header: the whole video, clip: one clip): method / scale / sigma / RTX quality
    "seg_upscale": {"method": "latent", "scale": 2.0},   # legacy multiplier, migrated to a megapixel target ("mp")
    # upscale in temporal chunks (sequential, like ComfyUI-H3-WindowedRefine): approximate chunk length in seconds
    # (snapped to 17k+5 frames; 0 = the whole clip in one piece) and the chunk overlap in H3 blocks (5o+2 latent frames)
    "upscale_chunk_sec": 5.0,      # legacy (one value for all methods): migrated into upscale_profiles
    "upscale_chunk_overlap": 1,
    "upscale_profiles": None,      # own settings per upscale method (normalize_upscale_profiles), see SEG_UPSCALE_METHODS
    # stage parameters ("" / 0 = as the main sampling parameters)
    "draft_sampler": "", "draft_scheduler": "", "draft_cfg": 0.0,
    "refine_sampler": "", "refine_scheduler": "", "refine_cfg": 0.0,
    # «Настройки»: "global" = follows the user's global settings, "project" = own settings (older projects)
    "settings_scope": "project",
}
STAGE_KEYS = ("draft_sampler", "draft_scheduler", "draft_cfg", "refine_sampler", "refine_scheduler", "refine_cfg")
RUN_KINDS = ("draft", "refine", "full")
# «Настройки»: set-once settings shared by all projects (unless a project keeps its own: settings_scope="project")
GLOBAL_KEYS = ("final_mode", "steps", "cfg", "denoise", "sampler", "scheduler", "shift_video", "shift_audio",
               "draft_scale", "draft_steps", "draft_sampler", "draft_scheduler", "draft_cfg",
               "refine_sigma", "refine_steps", "refine_sampler", "refine_scheduler", "refine_cfg",
               "upscale_method", "seg_upscale", "upscale_profiles", "upscale_chunk_sec", "upscale_chunk_overlap", "overlap_blocks", "audio_context_sec", "lock_overlap", "continuity_ref",
               "continuity_phrase", "ref_size", "cache", "audio_seam_lock", "audio_xfade", "audio_xfade_sec", "audio_match", "audio_declick", "level_lock", "level_lock_frames", "magnet", "vram_headroom_gb",
               "preview_tiny_vae", "preview_max_res", "preview_quality", "preview_frames", "preview_fps", "preview_suppress",
               "verbose_log")


def global_settings(values):
    """Normalized subset of the set-once settings (only the keys given)."""
    values = {k: v for k, v in (values or {}).items() if k in GLOBAL_KEYS}
    st = normalize_project({"settings": values, "segments": []})["settings"]
    return {k: st[k] for k in values}
DRAFT_SCALES = (0.5, 0.67, 0.75)
REFINE_SIGMA_RANGE = (0.15, 0.8)
UPSCALE_METHODS = ("learned", "rtx")   # nearest-exact / VAE-Lanczos were removed (garbage after the refine)
# «Апскейл отрезка»: per-segment upscale + low-strength refine (see h3s_upscale.py)
SEG_UPSCALE_METHODS = ("latent", "rtx", "tiles")
SEG_UPSCALE_SCALES = (1.5, 2.0)                       # legacy multipliers (older projects; migrated to "mp")
SEG_UPSCALE_MP_PRESETS = (1.0, 1.5, 2.0, 2.5, 3.0, 4.0)   # «Размер» presets, megapixels of the upscaled frame
SEG_UPSCALE_MP_RANGE = (0.01, 8.5)
UPSCALE_CHUNK_SEC_RANGE = (2.0, 30.0)
UPSCALE_CHUNK_OVERLAP_RANGE = (1, 3)
SEG_UPSCALE_SIGMA = {"latent": 0.4, "rtx": 0.25, "tiles": 0.35}   # default refine strength (start sigma) per method
SEG_UPSCALE_SIGMA_RANGE = (0.1, 0.7)
RTX_QUALITIES = ("LOW", "MEDIUM", "HIGH", "ULTRA")
# every upscale method keeps its own profile: switching the method in «Настройки» only selects another profile.
# The upscale fields (mp, sigma, quality, tile, tile_ov) are what a clip gets; steps / sampler / scheduler of the
# refine pass ("" / 0 = those of «Этап 2») and the temporal chunks are read by method when the upscale runs.
UPSCALE_CHUNK_DEFAULT = {"latent": True, "rtx": True, "tiles": False}
UPSCALE_UP_FIELDS = ("mp", "scale", "sigma", "quality", "tile", "tile_ov")
# tiled upscale: tile size in px (multiple of 32; absent = the clip's own canvas) and overlap in latent cells (×16 px;
# absent = auto, max(4, min(16, tile/3))) — stored only when set, so older upscale keys stay valid
TILE_PX_RANGE = (256, 2048)
TILE_OV_RANGE = (2, 32)
UPSCALE_LABELS_LOG = {"latent": "latent", "rtx": "RTX VSR", "tiles": "tiles"}
AUDIO_XFADE_RANGE = (0.1, 1.0)
AUDIO_MATCH_RANGE = (0.5, 2.0)    # gain limits of the loudness match (about +-6 dB)
AUDIO_MATCH_RELEASE = 2.0         # seconds over which the matching gain returns to 1

DEFAULT_SEGMENT = {
    "id": "",
    "name": "",
    "color": 0,
    "frames": 124,
    "prompt": "",
    "refs": [],
    "link": "extend",         # "extend": continue previous segment | "cut": new shot, no continuity
    "gap": 0,                 # empty frames before the clip (black + silence); a gap makes the clip a new shot
    "overlap_blocks": -1,      # per-segment extend overlap (blocks of 17 frames, 17o+5 frames); -1 = global setting
    "overrides": {},           # seed/steps/cfg/denoise/sampler/scheduler/shift_video/shift_audio
    # generated versions: [{id, key, sig, seed, created, snap{prompt,refs,frames,overrides,link}, result}]
    # choosing a take restores its snapshot, so the cache key matches again and the take's latent
    # is reused for the stitch and as the continuity source of the next segment
    "takes": [],
    "active_take": None,
    "locked": False,
    "freeze": None,   # «Зафиксировать»: {key, sig, frames, ...} -> never regenerated
    # footage clip: a video asset on the timeline. denoise 0 = used as is (VAE-encoded, continuity source of the
    # next segment), > 0 = regenerated from it (vid2vid with that denoise, prompt and refs apply)
    "source": None,   # {asset, in (frames into the file), denoise}
    # «Апскейл отрезка»: {method "latent"|"rtx"|"tiles", scale 1.5|2, sigma, quality (RTX)} or None
    "upscale": None,
    "approved": False,   # «Одобрен» (for «Апскейл: все одобренные»; a frozen segment counts as approved)
}

MAX_TAKES = 12

# «✂ Участок»: regenerate a time range in the middle of the video (generated clips and footage alike). The range is
# re-sampled inside a 17k+5 window of its scene with clean head/tail context frames on both sides (H3's native
# per-token video/audio denoise mask), then spliced back frame-exactly (video) and sample-exactly (audio).
DEFAULT_REGION = {
    "id": "",
    "name": "",
    "start": 0,          # timeline pixel frames of the range to regenerate (snapped to the scene's 17-frame grid)
    "end": 0,
    "head": -1,          # clean context blocks before the range (17 frames each); -1 = the global overlap setting
    "tail": -1,          # clean context after it (17·o + 5 frames); -1 = the global overlap setting
    "prompt": "",
    "refs": [],
    "seed": 0,
    "takes": [],         # [{id, key, sig, seed, created, snap{...}, result{...}}]
    "active_take": None, # take applied to the video; None = the original
}
MAX_REGIONS = 16

MARKER_EFFECTS = ("note", "prompt", "boost")
DEFAULT_MARKER = {
    "id": "",
    "frame": 0,                # timeline pixel frame
    "label": "",
    "color": 0,
    "effect": "note",          # "note": just a note | "prompt": event text added to the segment prompt at this time
    "text": "",                #  | "boost": stronger identity of a character reference in that segment (prompt emphasis)
    "asset": "",               # boost: asset id ("" = all characters of the segment)
}
MARKER_PROMPT = "At {t}s: {text}"
BOOST_PHRASE = ("Strictly preserve the identity of {pics} exactly as in the reference image: "
                "same face, hairstyle, body proportions and clothing in every frame.")

DEFAULT_AUDIO = {
    # Clips on the audio track are the main composition: their audio latent is locked on every step, the video
    # follows the sound. Where no clip lies H3 generates the sound itself. Audio assets in a segment's references
    # are <Audio j> references instead.
    "clips": [],
    "video_volume": 1.0,       # level of the video's own (generated) sound under the music, export/playback
    "input_ref": None,         # copy of the last connected input audio written by the node (for the waveform)
}
DEFAULT_AUDIO_CLIP = {
    "id": "",
    "asset": AUDIO_INPUT_ID,   # audio asset id, or "input" (the node's audio input)
    "lane": 0,                 # 0 / 1: lock lanes (mixed, locked); 2: music (overlay, never locked, not a reference)
    "volume": 1.0,             # clip level 0..2
    "fade_in": 0.0,            # seconds
    "fade_out": 0.0,
    "start": 0.0,              # timeline seconds where the clip begins
    "in": 0.0,                 # seconds into the source where the clip starts (trim in)
    "length": 0.0,             # clip length in seconds, 0 = until the end of the source
}

MUSIC_LANE = 2

AUDIO_REF_PHRASE = "Use {tags} as the sound reference of this shot."
VIDEO_REF_PHRASE = "Use {tags} as the motion reference of this shot."
OVERRIDE_KEYS = ("seed", "steps", "cfg", "denoise", "sampler", "scheduler", "shift_video", "shift_audio")


# ---------------------------------------------------------------- frame grid
def snap_frames(n, mode="nearest"):
    """Snap a pixel frame count to the H3 grid 17k+5 within [MIN_FRAMES, MAX_FRAMES]."""
    n = float(n)
    k = (n - 5) / 17.0
    k = math.floor(k) if mode == "down" else math.ceil(k) if mode == "up" else math.floor(k + 0.5)
    k = max((MIN_FRAMES - 5) // 17, min((MAX_FRAMES - 5) // 17, int(k)))
    return 17 * k + 5


def latent_t(frames):
    return 2 if frames <= 5 else ((frames - 5) // 17) * 5 + 2


def frames_for_latent(t):
    return sum((1, 4, 4, 4, 4)[k % 5] for k in range(t))


def audio_len(frames):
    return round(frames / FPS * AUDIO_LATENT_FPS)


def overlap_frames(o):
    return 17 * int(o) + 5


MAX_OVERLAP_BLOCKS = 8
MAX_GAP = 24 * 600   # longest empty stretch between clips (frames)
AUDIO_CONTEXT_MAX = 4.0


# The kept overlap audio ends with a hard 0/1 boundary of the audio denoise mask (as H3's native extension).
# A fractional "hand-off" ramp blended two differently noised latents there: the variance loss decoded as a
# ~60 ms dropout right after the overlap (measured in a user's final file). 0 = no ramp.
AUDIO_HANDOFF_TICKS = 0


def audio_context_extra(project, a_ov, available):
    """Audio latent frames of the previous segment given as context BEFORE the overlap (a multiple of 5 so the
    window sits exactly on the pixel-frame grid: 5 audio frames = 3 pixel frames), limited to what exists."""
    want = float(project["settings"].get("audio_context_sec", 0) or 0)
    want = min(want, AUDIO_CONTEXT_MAX)
    ext = int(round(want * AUDIO_LATENT_FPS)) - int(a_ov)
    if ext <= 0:
        return 0
    ext = ext // 5 * 5 + (5 if ext % 5 else 0)
    return max(0, min(ext, int(available) // 5 * 5))


def wanted_overlap(project, index):
    """Overlap blocks requested for segment `index` (before fitting): its own override or the global setting,
    0 = no overlap (last frame only)."""
    s = project["settings"]
    seg = project["segments"][index]
    o = int(seg.get("overlap_blocks", -1) if seg.get("overlap_blocks", -1) is not None else -1)
    if o < 0:
        o = int(s.get("overlap_blocks", 1) or 0)
    return max(0, min(MAX_OVERLAP_BLOCKS, o))


def snap32(x):
    return max(CANVAS_MULTIPLE, int(math.floor(float(x) / CANVAS_MULTIPLE + 0.5)) * CANVAS_MULTIPLE)


def run_kind(settings):
    """Kind of sampling pass a run does: "draft", "refine" (final from the draft) or "full" (one pass)."""
    if settings.get("quality") == "draft":
        return "draft"
    return "refine" if settings.get("final_mode") == "refine" else "full"


def work_resolution(settings, kind=None):
    """Canvas of a pass: the draft is resolution() scaled by draft_scale (snapped to 32), else resolution()."""
    w, h = resolution(settings)
    if (kind or run_kind(settings)) != "draft":
        return w, h
    k = float(settings.get("draft_scale") or 0.5)
    return snap32(w * k), snap32(h * k)


def pass_steps(settings, steps, kind):
    """Steps of a pass from the segment's normal steps."""
    if kind == "draft":
        return int(settings.get("draft_steps") or 0) or steps
    if kind == "refine":
        return int(settings.get("refine_steps") or 0) or max(4, steps // 2)
    return steps


def resolution(settings):
    """(width, height) snapped to 32. "mp": aspect + megapixels, "custom": explicit."""
    s = settings
    if s.get("res_mode") == "custom":
        return snap32(s.get("width", 960)), snap32(s.get("height", 544))
    a = ASPECTS.get(s.get("aspect"), (16, 9))
    mp = max(0.05, min(4.0, float(s.get("megapixels", 0.5))))
    px = mp * 1024 * 1024
    w = math.sqrt(px * a[0] / a[1])
    h = w * a[1] / a[0]
    # same as the template's ResolutionSelector table: 0.5 MP 16:9 -> 960x544, 0.98 -> 1344x768
    return snap32(w), snap32(h)


# ---------------------------------------------------------------- project
def _num(v, d):
    if isinstance(v, bool) or v is None or v == "":
        return d
    try:
        f = float(v)
        return f if math.isfinite(f) else d
    except (TypeError, ValueError):
        return d


# ------------------------------------------------------------------ model & LoRA presets (mirror of h3s_core.js)
PRESET_DTYPES = ("default", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2")
MAX_PRESET_LORAS = 16
MAX_PRESETS = 64


def _preset_id(x):
    return re.sub(r"[^A-Za-z0-9_-]", "", x if isinstance(x, str) else "")[:40]


def _r3(x):
    return math.floor(x * 1000 + 0.5) / 1000


def normalize_preset(p, pid=None):
    """Clean model preset; None when it is not one. base "unet" (diffusion_models + weight dtype) | "checkpoint";
    clip = text encoder (CLIPLoader type minimax); vae / audio_vae; loras = [{file, on, sm, sc}] in order."""
    if not isinstance(p, dict):
        return None
    pid = _preset_id(pid if pid is not None else p.get("id"))
    if not pid:
        return None
    sv = lambda k: str(p.get(k) or "")[:300] if isinstance(p.get(k), str) else ""
    loras = []
    for l in (p.get("loras") if isinstance(p.get("loras"), list) else [])[:MAX_PRESET_LORAS]:
        if not isinstance(l, dict) or not isinstance(l.get("file"), str) or not l["file"]:
            continue
        sm = _r3(max(-10.0, min(10.0, _num(l.get("sm"), 1.0))))
        sc = _r3(max(-10.0, min(10.0, _num(l.get("sc"), sm))))
        loras.append({"file": l["file"][:300], "on": l.get("on") is not False, "sm": sm, "sc": sc})
    return {"id": pid, "name": (sv("name") or pid)[:80], "base": p.get("base") if p.get("base") in ("unet", "checkpoint") else "unet",
            "model": sv("model"), "dtype": p.get("dtype") if p.get("dtype") in PRESET_DTYPES else "default",
            "clip": sv("clip"), "vae": sv("vae"), "audio_vae": sv("audio_vae"), "loras": loras, "note": sv("note")[:500]}


def segment_preset(project, i):
    """Effective preset of segment i: its own (if that preset exists), else the project's; None = wired inputs."""
    pr = project.get("model_presets") or {}
    segs = project.get("segments") or []
    own = segs[i].get("model_preset") if 0 <= i < len(segs) else ""
    return pr.get(own) if own in pr else pr.get((project.get("settings") or {}).get("model_preset") or "")


def preset_fingerprint(p):
    """What of a preset decides a clip's result (no name / note / VAE); "" = no preset."""
    if not p:
        return ""
    return json.dumps([p["base"], p["model"], p["dtype"], p["clip"],
                       [[l["file"], l["sm"], l["sc"]] for l in p["loras"] if l["on"] and (l["sm"] or l["sc"])]],
                      separators=(",", ":"), ensure_ascii=False)


def asset_kf(a):
    """(file, subfolder) of an asset as its cache keys know it: where it was when its clips were made. A moved
    asset (into the project folder, a duplicated / imported project) keeps the old pair in "kf", so no clip
    goes stale because its file changed place (the content is checked separately, by signature)."""
    kf = a.get("kf")
    if isinstance(kf, (list, tuple)) and len(kf) == 2 and all(isinstance(x, str) for x in kf):
        return kf[0], kf[1]
    return a.get("file"), a.get("subfolder")


def _merge(defaults, value):
    out = copy.deepcopy(defaults)
    if isinstance(value, dict):
        for k, v in value.items():
            out[k] = copy.deepcopy(v)
    return out


def normalize_project(p):
    """Fill defaults, snap lengths. Never raises on garbage input (returns an empty project)."""
    if isinstance(p, str):
        try:
            p = json.loads(p) if p.strip() else {}
        except ValueError:
            p = {}
    if not isinstance(p, dict):
        p = {}
    out = {
        "version": SCHEMA_VERSION,
        "id": re.sub(r"[^A-Za-z0-9_-]", "", str(p.get("id") or "")) or "project",
        "name": str(p.get("name") or "H3 проект"),
        "settings": _merge(DEFAULT_SETTINGS, p.get("settings")),
        "assets": [],
        "segments": [],
        "audio": _merge(DEFAULT_AUDIO, p.get("audio")),
        "markers": [],
        "end": max(0, int(_num(p.get("end"), 0))),   # video end marker (pixel frames), 0 = end of the last clip
        # «Длина: Фикс» (default): the marker stays where it was set, editing clips may leave an empty gap before
        # it; «Авто»: the marker follows the end of the last clip (end stays 0)
        "end_mode": "auto" if p.get("end_mode") == "auto" else "fixed",
        "run": {"upto": -1, "only": -1, "kind": "", "region": ""},
        "regions": [],
        "stats": copy.deepcopy(p.get("stats")) if isinstance(p.get("stats"), dict) else None,
        "result": p.get("result") if isinstance(p.get("result"), dict) else None,
    }
    if out["end_mode"] == "auto":
        out["end"] = 0
    out["model_presets"] = {}
    if isinstance(p.get("model_presets"), dict):
        for k, v in list(p["model_presets"].items())[:MAX_PRESETS]:
            q = normalize_preset(v, k)
            if q:
                out["model_presets"][q["id"]] = q
    st = out["settings"]
    st["model_preset"] = _preset_id(st.get("model_preset"))
    st["quality"] = "draft" if st.get("quality") == "draft" else "final"
    st["final_mode"] = "refine" if st.get("final_mode") == "refine" else "full"
    ds = _num(st.get("draft_scale"), 0.5)
    st["draft_scale"] = min(DRAFT_SCALES, key=lambda x: abs(x - ds))
    st["draft_steps"] = max(0, min(200, int(_num(st.get("draft_steps"), 0))))
    st["refine_steps"] = max(0, min(200, int(_num(st.get("refine_steps"), 0))))
    st["refine_sigma"] = round(max(REFINE_SIGMA_RANGE[0], min(REFINE_SIGMA_RANGE[1], _num(st.get("refine_sigma"), 0.4))), 2)
    st["upscale_method"] = st.get("upscale_method") if st.get("upscale_method") in UPSCALE_METHODS else "learned"
    st["upscale_rev"] = 3   # any older value ("vae", "latent" = nearest-exact, …) became "learned" above
    st["seg_upscale"] = normalize_upscale(st.get("seg_upscale")) or normalize_upscale({"method": "latent", "scale": 2.0})
    cs = _num(st.get("upscale_chunk_sec"), 5.0)
    st["upscale_chunk_sec"] = 0.0 if cs <= 0 else _round(min(UPSCALE_CHUNK_SEC_RANGE[1], max(UPSCALE_CHUNK_SEC_RANGE[0], cs)), 1)
    st["upscale_chunk_overlap"] = int(min(UPSCALE_CHUNK_OVERLAP_RANGE[1], max(UPSCALE_CHUNK_OVERLAP_RANGE[0], _num(st.get("upscale_chunk_overlap"), 1))))
    normalize_upscale_profiles(st)
    for k in ("draft", "refine"):
        st[k + "_sampler"] = str(st.get(k + "_sampler") or "")[:64]
        st[k + "_scheduler"] = str(st.get(k + "_scheduler") or "")[:64]
        st[k + "_cfg"] = round(max(0.0, min(30.0, _num(st.get(k + "_cfg"), 0.0))), 2)
    st["settings_scope"] = "global" if st.get("settings_scope") == "global" else "project"
    out["run"]["upto"] = int(_num((p.get("run") or {}).get("upto", -1) if isinstance(p.get("run"), dict) else -1, -1))
    out["run"]["only"] = int(_num((p.get("run") or {}).get("only", -1) if isinstance(p.get("run"), dict) else -1, -1))
    rk = (p.get("run") or {}).get("kind") if isinstance(p.get("run"), dict) else None
    out["run"]["kind"] = rk if rk in RUN_KINDS else ""
    rr = (p.get("run") or {}).get("region") if isinstance(p.get("run"), dict) else None
    out["run"]["region"] = str(rr) if isinstance(rr, str) else ""
    ra = (p.get("run") or {}).get("audio") if isinstance(p.get("run"), dict) else None
    if isinstance(ra, dict):   # «Улучшить звук»: audio-only refine pass over the cached segments
        out["run"]["audio"] = {"steps": int(max(1, min(50, _num(ra.get("steps"), 6)))),
                               "denoise": round(max(0.05, min(1.0, _num(ra.get("denoise"), 0.45))), 3),
                               "video_denoise": round(max(0.0, min(1.0, _num(ra.get("video_denoise"), 0.0))), 3)}
    for i, r in enumerate(p.get("regions") or [] if isinstance(p.get("regions"), list) else []):
        if not isinstance(r, dict):
            continue
        rg = normalize_region(r, i)
        if rg is not None and len(out["regions"]) < MAX_REGIONS:
            out["regions"].append(rg)
    for i, m in enumerate(p.get("markers") or []):
        if not isinstance(m, dict):
            continue
        mk = _merge(DEFAULT_MARKER, {k: v for k, v in m.items() if k in DEFAULT_MARKER})
        mk["id"] = str(mk["id"] or f"m{i + 1}")
        mk["frame"] = max(0, int(_num(mk["frame"], 0)))
        mk["color"] = max(0, int(_num(mk["color"], 0)))
        mk["effect"] = mk["effect"] if mk["effect"] in MARKER_EFFECTS else "note"
        for k in ("label", "text", "asset"):
            mk[k] = str(mk[k] or "")
        out["markers"].append(mk)
    out["markers"].sort(key=lambda m: m["frame"])
    for a in p.get("assets") or []:
        if not isinstance(a, dict) or not a.get("id") or not a.get("file"):
            continue
        cat = a.get("category") if a.get("category") in ASSET_CATEGORIES else "other"
        asset = {"id": str(a["id"]), "name": str(a.get("name") or a["file"]), "file": str(a["file"]),
                 "subfolder": str(a.get("subfolder") or ""), "type": str(a.get("type") or "input"), "category": cat}
        if cat == "audio":
            asset["duration"] = max(0.0, _num(a.get("duration"), 0.0))
        # content signature (sha256 + the size:mtime first seen for it): the cache key of a copied/re-saved file stays
        kf = a.get("kf")
        if isinstance(kf, (list, tuple)) and len(kf) == 2 and all(isinstance(x, str) for x in kf):
            asset["kf"] = [kf[0][:300], kf[1][:300]]
        fs = a.get("fsig")
        if isinstance(fs, dict) and isinstance(fs.get("sha"), str) and isinstance(fs.get("sig"), str):
            asset["fsig"] = {"sha": fs["sha"][:64], "sig": fs["sig"][:64]}
        # asset editor: the original file and the ops of the processed derivative now in file/subfolder
        if isinstance(a.get("orig"), dict) and a["orig"].get("filename") and isinstance(a.get("edit"), dict):
            asset["orig"] = {"filename": str(a["orig"]["filename"]), "subfolder": str(a["orig"].get("subfolder") or ""),
                             "type": str(a["orig"].get("type") or "input")}
            asset["edit"] = copy.deepcopy(a["edit"])
        if cat == "video":
            asset["duration"] = max(0.0, _num(a.get("duration"), 0.0))
            asset["frames"] = max(0, int(_num(a.get("frames"), 0)))
            asset["width"] = max(0, int(_num(a.get("width"), 0)))
            asset["height"] = max(0, int(_num(a.get("height"), 0)))
            asset["has_audio"] = bool(a.get("has_audio"))
            asset["poster"] = a["poster"] if isinstance(a.get("poster"), dict) and a["poster"].get("filename") else None
            asset["strip"] = a["strip"] if isinstance(a.get("strip"), dict) and a["strip"].get("filename") else None
            try:
                asset["strip_n"] = max(0, int(float(a.get("strip_n") or 0))) if asset["strip"] else 0
            except (TypeError, ValueError):
                asset["strip_n"] = 0
            asset["frozen"] = str(a.get("frozen") or "")
        out["assets"].append(asset)
    out["audio"] = _normalize_audio(p, out["assets"])
    video_ids = {a["id"] for a in out["assets"] if a["category"] == "video"}
    for i, s in enumerate(p.get("segments") or []):
        if not isinstance(s, dict):
            continue
        seg = _merge(DEFAULT_SEGMENT, s)
        seg["id"] = str(seg["id"] or f"s{i + 1}")
        seg["frames"] = snap_frames(seg.get("frames") or 124)
        seg["link"] = "cut" if seg.get("link") == "cut" else "extend"
        try:   # empty timeline before the clip (Ctrl+drag apart): black + silence, the clip starts a new shot
            seg["gap"] = max(0, min(MAX_GAP, int(float(seg.get("gap") or 0))))
        except (TypeError, ValueError):
            seg["gap"] = 0
        try:
            seg["overlap_blocks"] = max(-1, min(MAX_OVERLAP_BLOCKS, int(float(seg.get("overlap_blocks", -1)))))
        except (TypeError, ValueError):
            seg["overlap_blocks"] = -1
        try:
            seg["color"] = max(0, int(float(seg.get("color") or 0)))
        except (TypeError, ValueError):
            seg["color"] = 0
        seg["refs"] = [str(r) for r in (seg.get("refs") or [])]
        seg["overrides"] = {k: v for k, v in (seg.get("overrides") or {}).items()
                            if k in OVERRIDE_KEYS and v is not None and v != ""}
        seg["takes"] = [t for t in (seg.get("takes") or []) if isinstance(t, dict) and t.get("key")][-MAX_TAKES:]
        if seg.get("active_take") is not None:
            seg["active_take"] = str(seg["active_take"])
        seg["freeze"] = _normalize_freeze(seg.get("freeze"))
        seg["source"] = _normalize_source(seg.get("source"), video_ids)
        seg["upscale"] = normalize_upscale(seg.get("upscale"))
        seg["approved"] = bool(seg.get("approved"))
        seg["model_preset"] = _preset_id(seg.get("model_preset"))
        if seg["freeze"]:
            seg["frames"] = seg["freeze"]["frames"]
        out["segments"].append(seg)
    # legacy upscale multipliers -> megapixel targets with the same canvas (cache keys unchanged: upscale_key_form)
    rw, rh = resolution(out["settings"])
    for m, pr in out["settings"]["upscale_profiles"].items():
        mu = migrate_upscale(profile_upscale(out["settings"], m), rw, rh)
        for k in ("mp", "scale"):
            pr.pop(k, None)
        pr.update({k: mu[k] for k in ("mp", "scale") if k in mu})
    out["settings"]["seg_upscale"] = profile_upscale(out["settings"], out["settings"]["seg_upscale"]["method"])
    for seg in out["segments"]:
        seg["upscale"] = migrate_upscale(seg["upscale"], rw, rh)
    return out


def normalize_upscale(u):
    if not isinstance(u, dict) or u.get("method") not in SEG_UPSCALE_METHODS:
        return None
    m = u["method"]
    sg = round(min(SEG_UPSCALE_SIGMA_RANGE[1], max(SEG_UPSCALE_SIGMA_RANGE[0], _num(u.get("sigma"), SEG_UPSCALE_SIGMA[m]))), 3)
    mp = _num(u.get("mp"), 0)
    if mp > 0:   # megapixel target of the upscaled frame
        out = {"method": m, "mp": _round(min(SEG_UPSCALE_MP_RANGE[1], max(SEG_UPSCALE_MP_RANGE[0], mp)), 4), "sigma": sg}
    else:        # legacy multiplier (migrated by normalize_project, where the canvas is known)
        sc = _num(u.get("scale"), 2.0)
        out = {"method": m, "scale": min(SEG_UPSCALE_SCALES, key=lambda x: abs(x - sc)), "sigma": sg}
    if m == "rtx":
        q = str(u.get("quality") or "ULTRA").upper()
        out["quality"] = q if q in RTX_QUALITIES else "ULTRA"
    if m == "tiles":
        t = u.get("tile")
        if isinstance(t, (list, tuple)) and len(t) == 2 and _num(t[0], 0) > 0 and _num(t[1], 0) > 0:
            out["tile"] = [int(min(TILE_PX_RANGE[1], max(TILE_PX_RANGE[0], snap32(_num(x, 0))))) for x in t]
        ov = int(_num(u.get("tile_ov"), 0))
        if ov > 0:
            ov = min(TILE_OV_RANGE[1], max(TILE_OV_RANGE[0], ov))
            out["tile_ov"] = ov - ov % 2
    return out


def normalize_upscale_profile(m, p):
    """One method's profile: upscale fields + refine pass (steps 0 / sampler "" = «Этап 2») + temporal chunks."""
    p = p if isinstance(p, dict) else {}
    u = normalize_upscale({**{k: p[k] for k in UPSCALE_UP_FIELDS if k in p}, "method": m}) or normalize_upscale({"method": m, "scale": 2.0})
    out = {k: v for k, v in u.items() if k != "method"}
    out["steps"] = int(max(0, min(200, _num(p.get("steps"), 0))))
    out["sampler"] = str(p.get("sampler") or "")[:64]
    out["scheduler"] = str(p.get("scheduler") or "")[:64]
    out["chunk"] = bool(p["chunk"]) if "chunk" in p else UPSCALE_CHUNK_DEFAULT[m]
    cs = _num(p.get("chunk_sec"), 5.0)
    out["chunk_sec"] = _round(min(UPSCALE_CHUNK_SEC_RANGE[1], max(UPSCALE_CHUNK_SEC_RANGE[0], cs if cs > 0 else 5.0)), 1)
    out["chunk_overlap"] = int(min(UPSCALE_CHUNK_OVERLAP_RANGE[1], max(UPSCALE_CHUNK_OVERLAP_RANGE[0], _num(p.get("chunk_overlap"), 1))))
    return out


def normalize_upscale_profiles(st):
    """settings.upscale_profiles = {method: profile}; the selected method's profile is mirrored into seg_upscale
    (the profiles are the source: seg_upscale only selects the method). Older settings had one flat set
    (seg_upscale + upscale_chunk_sec / _overlap): it becomes the profile of the selected method, the other
    methods get their defaults (same size, own σ, chunks on for latent / RTX, off for tiles)."""
    su = st["seg_upscale"]
    raw = st.get("upscale_profiles")
    if not isinstance(raw, dict) or not any(isinstance(raw.get(m), dict) for m in SEG_UPSCALE_METHODS):
        cs, co = _num(st.get("upscale_chunk_sec"), 5.0), st.get("upscale_chunk_overlap", 1)
        size = {k: su[k] for k in ("mp", "scale") if k in su}
        raw = {}
        for m in SEG_UPSCALE_METHODS:
            base = {k: v for k, v in su.items() if k != "method"} if m == su["method"] else {**size, "sigma": SEG_UPSCALE_SIGMA[m]}
            on = cs > 0 if m == su["method"] else UPSCALE_CHUNK_DEFAULT[m]
            raw[m] = {**base, "chunk": on, "chunk_sec": cs if cs > 0 else 5.0, "chunk_overlap": co}
    st["upscale_profiles"] = {m: normalize_upscale_profile(m, raw.get(m)) for m in SEG_UPSCALE_METHODS}
    st["seg_upscale"] = profile_upscale(st, su["method"])


def upscale_profile(settings, method):
    """The profile of an upscale method (defaults when the settings have none)."""
    pr = (settings.get("upscale_profiles") or {}).get(method)
    return pr if isinstance(pr, dict) else normalize_upscale_profile(method, None)


def profile_upscale(settings, method):
    """The upscale a clip gets from the method's profile: {method, mp, sigma, [quality], [tile, tile_ov]}."""
    pr = upscale_profile(settings, method)
    return normalize_upscale({**{k: pr[k] for k in UPSCALE_UP_FIELDS if k in pr}, "method": method})


def upscale_pass_params(project, index, method):
    """pass_params of a clip's upscale refine: «Этап 2» with the method profile's own steps / sampler / scheduler."""
    p = pass_params(project, index, "refine")
    pr = upscale_profile(project["settings"], method)
    if pr.get("steps"):
        p["steps"] = int(pr["steps"])
    if pr.get("sampler"):
        p["sampler"] = pr["sampler"]
    if pr.get("scheduler"):
        p["scheduler"] = pr["scheduler"]
    return p


def upscalable(seg):
    """The segment's upscale applies: set, not footage as is, not a take frozen after its upscale (freeze.up)."""
    return bool(seg.get("upscale")) and not is_footage(seg) and not (seg.get("freeze") or {}).get("up")


def _round(x, d):
    """Half-up rounding (same as the editor's Math.round based rounding)."""
    return math.floor(float(x) * 10 ** d + 0.5) / 10 ** d


def upscale_canvas(w, h, up):
    """Target canvas of a segment upscale (snapped to 32). up: the upscale dict ({"mp"} megapixel target or a
    legacy {"scale"}) or a plain multiplier. Same aspect as the clip; a target below the clip size is a resize."""
    if isinstance(up, dict):
        if _num(up.get("mp"), 0) > 0:
            k = math.sqrt(float(up["mp"]) * 1e6 / (w * h))
            return snap32(w * k), snap32(h * k)
        up = _num(up.get("scale"), 2.0)
    return snap32(w * float(up)), snap32(h * float(up))


def mp_for_scale(w, h, scale):
    """Megapixel target that gives exactly the canvas of a legacy multiplier."""
    target = upscale_canvas(w, h, scale)
    for d in (2, 3, 4):
        mp = _round(w * h * scale * scale / 1e6, d)
        if upscale_canvas(w, h, {"mp": mp}) == target:
            return mp
    return _round(target[0] * target[1] / 1e6, 4)


def migrate_upscale(u, w, h):
    """Legacy {"scale": 1.5|2} -> {"mp": …} with the same canvas (key order kept: method, mp, sigma, …)."""
    if not u or "mp" in u or "scale" not in u:
        return u
    return {("mp" if k == "scale" else k): (mp_for_scale(w, h, v) if k == "scale" else v) for k, v in u.items()}


def upscale_key_form(up, w, h):
    """Cache-key form: an "mp" that reproduces an old ×1.5 / ×2 canvas hashes as that multiplier, so results made
    before the megapixel picker stay cached (and the editor does not mark them changed)."""
    if up and "mp" in up:
        c = upscale_canvas(w, h, up)
        for sc in SEG_UPSCALE_SCALES:
            if upscale_canvas(w, h, sc) == c:
                return {("scale" if k == "mp" else k): (sc if k == "mp" else v) for k, v in up.items()}
    return up


def chunk_starts(k, m, o):
    """Starts (in blocks) of temporal windows of m blocks over k blocks with >= o blocks overlap
    (plan_windows of ComfyUI-H3-WindowedRefine); [0] = one piece."""
    m = max(1, min(int(m), k))
    o = max(0, min(int(o), m - 1))
    last = k - m
    if last <= 0:
        return [0]
    n = max(2, min(math.ceil(last / (m - o)) + 1, last + 1))
    return sorted({int(_round(i * last / (n - 1), 0)) for i in range(n)})


def upscale_chunking(settings, frames, method=None):
    """Temporal chunks of a clip's upscale with `method` (its profile's chunks; no method = the legacy flat
    settings): (count, chunk frames 17k+5 or 0 = off, overlap blocks)."""
    if method:
        pr = upscale_profile(settings, method)
        sec, ov = (_num(pr.get("chunk_sec"), 5.0) if pr.get("chunk") else 0), pr.get("chunk_overlap", 1)
    else:
        sec, ov = _num(settings.get("upscale_chunk_sec"), 0), settings.get("upscale_chunk_overlap", 1)
    if sec <= 0:
        return 1, 0, 0
    cf = snap_frames(sec * FPS)
    m = (latent_t(cf) - 2) // 5
    o = max(1, min(int(_num(ov, 1)), m - 1))
    k = (latent_t(frames) - 2) // 5
    # approximate length: a clip up to 2 blocks (≈1.4 s) longer than a chunk stays one piece
    n = len(chunk_starts(k, m, o)) if frames > cf + 34 else 1
    return n, cf, o


def _normalize_freeze(f):
    """Frozen segment: its cached latent (by backend key) and the editor signature at freeze time."""
    if not isinstance(f, dict) or not f.get("key"):
        return None
    out = dict(f)
    out["key"] = str(f["key"])
    out["sig"] = str(f.get("sig") or "")
    out["frames"] = snap_frames(f.get("frames") or 124)
    return out


def _normalize_source(src, video_ids):
    if not isinstance(src, dict) or str(src.get("asset") or "") not in video_ids:
        return None
    return {"asset": str(src["asset"]), "in": max(0, int(_num(src.get("in"), 0))),
            "denoise": min(1.0, max(0.0, _num(src.get("denoise"), 0.0)))}


def is_footage(seg):
    """Footage used as is (no sampling)."""
    return bool(seg.get("source")) and not seg["source"]["denoise"]


def video_refs(project, seg):
    """Video references of a segment (<Video k> order = chip order)."""
    by_id = {a["id"]: a for a in project["assets"] if a["category"] == "video"}
    out, seen = [], set()
    for r in seg.get("refs", []):
        if r in by_id and r not in seen:
            seen.add(r)
            out.append(by_id[r])
    return out


def _normalize_audio(p, assets):
    pa = p.get("audio") if isinstance(p.get("audio"), dict) else {}
    au = {"clips": [], "video_volume": min(2.0, max(0.0, _num(pa.get("video_volume"), 1.0))), "input_ref": pa.get("input_ref")}
    if not (isinstance(au["input_ref"], dict) and au["input_ref"].get("filename")):
        au["input_ref"] = None
    src = pa.get("clips")
    if not isinstance(src, list):
        # projects before the audio track redesign: one source (input or an uploaded file) and a mode
        f = pa.get("file")
        asset_id = AUDIO_INPUT_ID
        if pa.get("source") == "file" and isinstance(f, dict) and f.get("filename"):
            asset_id = "au_" + re.sub(r"[^A-Za-z0-9]", "_", str(f["filename"]))[:48]
            if not any(a["id"] == asset_id for a in assets):
                assets.append({"id": asset_id, "name": str(f.get("name") or f["filename"]), "file": str(f["filename"]),
                               "subfolder": str(f.get("subfolder") or ""), "type": str(f.get("type") or "input"),
                               "category": "audio", "duration": max(0.0, _num(pa.get("duration"), 0.0))})
        src = []
        if pa.get("mode") == "locked":   # "reference" is now a per-segment reference, "none" has no track clip
            src = [{"id": "a1", "asset": asset_id, "start": pa.get("start"), "length": pa.get("length"),
                    "in": pa.get("in") if "in" in pa else pa.get("offset")}]
    audio_ids = {a["id"] for a in assets if a["category"] == "audio"} | {AUDIO_INPUT_ID}
    for i, c in enumerate(src):
        if not isinstance(c, dict):
            continue
        cl = _merge(DEFAULT_AUDIO_CLIP, {k: v for k, v in c.items() if k in DEFAULT_AUDIO_CLIP})
        cl["id"] = str(cl["id"] or f"a{i + 1}")
        cl["asset"] = str(cl["asset"] or AUDIO_INPUT_ID)
        if cl["asset"] not in audio_ids:
            continue
        ln = _num(cl["lane"], 0)
        cl["lane"] = MUSIC_LANE if ln >= MUSIC_LANE else 1 if ln >= 1 else 0
        for k in ("start", "in", "length", "fade_in", "fade_out"):
            cl[k] = max(0.0, _num(cl[k], 0.0))
        cl["volume"] = min(2.0, max(0.0, _num(cl["volume"], 1.0)))
        au["clips"].append(cl)
    au["clips"].sort(key=lambda c: (c["start"], c["lane"]))
    return au


def audio_refs(project, seg):
    """Audio references of a segment (<Audio j> order = chip order): audio assets and/or the node input."""
    by_id = {a["id"]: a for a in project["assets"] if a["category"] == "audio"}
    out, seen = [], set()
    for r in seg.get("refs", []):
        if r in seen:
            continue
        if r in by_id:
            out.append(by_id[r])
        elif r == AUDIO_INPUT_ID:
            out.append({"id": AUDIO_INPUT_ID, "name": "Вход audio ноды", "category": "audio"})
        else:
            continue
        seen.add(r)
    return out


def seg_param(project, seg, index, key):
    s = project["settings"]
    ov = seg.get("overrides") or {}
    if key in ov:
        return ov[key]
    if key == "seed":
        return int(s.get("seed", 0)) + index
    return s.get(key)


def effective_params(project, index):
    seg = project["segments"][index]
    keys = ("seed", "steps", "cfg", "denoise", "sampler", "scheduler", "shift_video", "shift_audio")
    p = {k: seg_param(project, seg, index, k) for k in keys}
    p["seed"] = int(p["seed"])
    p["steps"] = int(p["steps"])
    p["cfg"] = float(p["cfg"])
    p["denoise"] = float(p["denoise"])
    p["shift_video"] = float(p["shift_video"])
    p["shift_audio"] = float(p["shift_audio"])
    return p


def pass_params(project, index, kind=None):
    """effective_params of one sampling pass: the draft may use fewer steps, the refine pass its own steps and
    partial denoise."""
    s = project["settings"]
    kind = kind or run_kind(s)
    p = effective_params(project, index)
    p["steps"] = pass_steps(s, p["steps"], kind)
    if kind in ("draft", "refine"):   # stage parameters (empty = the main ones)
        if s.get(kind + "_sampler"):
            p["sampler"] = s[kind + "_sampler"]
        if s.get(kind + "_scheduler"):
            p["scheduler"] = s[kind + "_scheduler"]
        if float(s.get(kind + "_cfg") or 0) > 0:
            p["cfg"] = float(s[kind + "_cfg"])
    if kind == "refine":
        p["denoise"] = 1.0   # the refine pass runs its own schedule from refine_sigma (see h3s_gen.refine_sigmas)
        p["sigma0"] = float(s.get("refine_sigma") or 0.4)
    return p


def seg_steps(project, index):
    """Sampling steps of a segment in the project's run kind (footage used as is: none). A final from the draft
    counts the draft pass too (cached drafts make the run shorter than this)."""
    if is_footage(project["segments"][index]):
        return 0
    s = project["settings"]
    kind = run_kind(s)
    n = effective_params(project, index)["steps"]
    if kind == "refine":
        return pass_steps(s, n, "draft") + pass_steps(s, n, "refine")
    return pass_steps(s, n, kind)


def ordered_refs(project, seg):
    """Assets of a segment in <Picture N> order: characters, locations, other; chip order inside a category."""
    by_id = {a["id"]: a for a in project["assets"]}
    refs = [by_id[r] for r in seg.get("refs", []) if r in by_id and by_id[r]["category"] in CATEGORY_ORDER]
    seen, uniq = set(), []
    for a in refs:
        if a["id"] not in seen:
            seen.add(a["id"])
            uniq.append(a)
    return sorted(uniq, key=lambda a: CATEGORY_ORDER.index(a["category"]))


def uses_continuity(project, index):
    if index == 0:
        return False
    seg = project["segments"][index]
    return seg["link"] == "extend" and not is_footage(seg) and not seg.get("gap")


def compose_prompt(project, index, video=True):
    """Global prompt + segment prompt (+ continuity phrase for extended segments).
    video=False: the pass ignores video references (upscale / final-from-draft) — no <Video k> tags or phrase."""
    s = project["settings"]
    seg = project["segments"][index]
    parts = [t.strip() for t in (s.get("prompt") or "", seg.get("prompt") or "") if t and t.strip()]
    items = plan(project)
    it = items[index]
    pics = {a["id"]: n + 1 for n, a in enumerate(ordered_refs(project, seg))}
    boost = []
    for m in segment_markers(project, index, items):
        if m["effect"] == "prompt" and m["text"].strip():
            parts.append(MARKER_PROMPT.replace("{t}", fmt_sec10(m["frame"] - it["start"])).replace("{text}", m["text"].strip()))
        elif m["effect"] == "boost":
            ids = [m["asset"]] if m["asset"] else [a["id"] for a in ordered_refs(project, seg) if a["category"] == "character"]
            for aid in ids:
                if aid in pics and pics[aid] not in boost:
                    boost.append(pics[aid])
    if boost:
        parts.append(BOOST_PHRASE.replace("{pics}", ", ".join(f"<Picture {n}>" for n in sorted(boost))))
    text = "\n".join(parts)
    n = continuity_picture(project, index)
    if n:
        phrase = (s.get("continuity_phrase") or "").strip() or "<Picture {n}>"
        text = (text + "\n" if text else "") + phrase.replace("{n}", str(n))
    nv = min(MAX_REF_VIDEOS, len(video_refs(project, seg))) if video else 0
    if nv and "<Video" not in text:
        text = (text + "\n" if text else "") + VIDEO_REF_PHRASE.replace("{tags}", ", ".join(f"<Video {k + 1}>" for k in range(nv)))
    na = min(MAX_REF_AUDIOS, len(audio_refs(project, seg)))
    if na and "<Audio" not in text:
        text = (text + "\n" if text else "") + AUDIO_REF_PHRASE.replace("{tags}", ", ".join(f"<Audio {j + 1}>" for j in range(na)))
    if not video:
        text = re.sub(r"[ \t]*<Video\s*\d+>", "", text)
        text = re.sub(r"[ \t]+\n", "\n", text).strip()
    return text


def fmt_sec10(frames):
    """Frames -> seconds with one decimal, integer-exact (same result in JS)."""
    f = max(0, int(frames))
    t10 = (f * 20 + FPS) // (2 * FPS)
    return f"{t10 // 10}.{t10 % 10}"


def marker_segment(items, frame):
    """Index of the segment shown at a timeline frame (overlap zones belong to the later segment), or -1."""
    for it in items:
        if frame < it["end"]:
            return it["index"]
    return -1


def segment_markers(project, index, items=None):
    items = items if items is not None else plan(project)
    return [m for m in project.get("markers", []) if marker_segment(items, m["frame"]) == index]


def audio_windows(project):
    """[(asset, start, in, length)] in seconds for every audio track clip; length None = until source end."""
    out = []
    for c in lock_clips(project):
        ln = float(c.get("length") or 0.0)
        out.append((c["asset"], float(c.get("start") or 0.0), float(c.get("in") or 0.0), ln if ln > 0 else None))
    return out


def lock_clips(project):
    """Clips on the lock lanes (main composition, locked in the audio latent)."""
    return [c for c in project["audio"].get("clips") or [] if int(c.get("lane", 0)) < MUSIC_LANE]


def music_clips(project):
    """Clips on the music lane: mixed over the video's sound at export/playback only."""
    return [c for c in project["audio"].get("clips") or [] if int(c.get("lane", 0)) >= MUSIC_LANE]


def clip_gain(c):
    """(volume, fade_in, fade_out) of a clip, None when neutral (keeps old cache keys)."""
    g = (float(c.get("volume", 1.0)), float(c.get("fade_in", 0.0)), float(c.get("fade_out", 0.0)))
    return None if g == (1.0, 0.0, 0.0) else [round(x, 4) for x in g]


def segment_track(project, it):
    """Track clips overlapping a segment, relative to its start (part of the cache key: moving a clip elsewhere
    on the timeline does not invalidate this segment)."""
    t0, t1 = it["start"] / FPS, it["end"] / FPS
    out = []
    for c, (asset, start, t_in, ln) in zip(lock_clips(project), audio_windows(project)):
        if start < t1 and (ln is None or start + ln > t0):
            e = [asset, round(start - t0, 4), round(t_in, 4), None if ln is None else round(ln, 4)]
            g = clip_gain(c)
            out.append(e + [g] if g else e)
    return out


def content_end(items):
    return items[-1]["end"] if items else 0


def video_end(project, items=None):
    """Frame where the video ends: the end marker if set, else the end of the last clip."""
    items = items if items is not None else plan(project)
    e = int(project.get("end") or 0)
    return e if e > 0 else content_end(items)


def limited_project(project):
    """Project as generated with the video end marker: segments whose visible part starts at/after the end are
    dropped, the segment crossing the end is shortened to the grid length covering it (the stitch is cut exactly
    at the end). Segments before it are untouched, so their cache keys stay the same."""
    e = int(project.get("end") or 0)
    items = plan(project)
    if e <= 0 or e >= content_end(items):
        return project
    out = copy.deepcopy(project)
    keep = []
    for it in items:
        i, ov = it["index"], it["overlap"] if it["index"] else 0
        if it["start"] + ov >= e:
            break
        seg = out["segments"][i]
        if it["end"] > e and not seg.get("freeze"):   # a frozen clip keeps its length (the output is cut at the end)
            seg["frames"] = min(seg["frames"], snap_frames(e - it["start"], "up"))
        keep.append(seg)
    out["segments"] = keep
    return out


def audio_lock_overlap(project):
    """Is the overlap audio latent locked to the previous segment's tail?"""
    return bool(project["settings"].get("audio_seam_lock", True))


def level_lock_frames(project):
    """Blend window of the level lock at continuation joins (0 = off)."""
    s = project["settings"]
    if not s.get("level_lock", True):
        return 0
    return int(min(48, max(2, _num(s.get("level_lock_frames"), 12))))


def audio_seam_params(project):
    """Stitch parameters of the final audio at extend seams (seams covered by a track clip are skipped:
    the locked track is used as is)."""
    s = project["settings"]
    lo, hi = AUDIO_XFADE_RANGE
    xf = min(hi, max(lo, _num(s.get("audio_xfade_sec"), 0.4))) if s.get("audio_xfade", True) else 0.0
    return {"xfade": xf, "match": bool(s.get("audio_match", True)), "declick": bool(s.get("audio_declick", True))}


def run_items(project, items=None):
    """Items processed by a run: all, or 0..upto ("regenerate up to this segment")."""
    items = items if items is not None else plan(project)
    u = int((project.get("run") or {}).get("upto", -1))
    return items if u < 0 or u >= len(items) - 1 else items[:u + 1]


def continuity_picture(project, index):
    """Picture number of the previous segment's last frame, or 0."""
    if not uses_continuity(project, index) or not project["settings"].get("continuity_ref", True):
        return 0
    return len(ordered_refs(project, project["segments"][index])) + 1


def plan(project):
    """Timeline layout. Each item: start/end pixel frame on the stitched timeline, overlap frames shared
    with the previous segment, latent sizes."""
    items, cursor = [], 0
    for i, seg in enumerate(project["segments"]):
        f = seg["frames"]
        ov = 0
        if uses_continuity(project, i):
            prev = project["segments"][i - 1]["frames"]
            o = wanted_overlap(project, i)
            # overlap must leave at least one new block in both segments: shrink to the largest that fits
            while o > 0 and not (overlap_frames(o) < f and overlap_frames(o) < prev):
                o -= 1
            ov = overlap_frames(o) if o > 0 else 0
        gap = int(seg.get("gap") or 0)
        start = cursor - ov + gap
        items.append({"index": i, "id": seg["id"], "frames": f, "start": start, "end": start + f,
                      "overlap": ov, "overlap_blocks": (ov - 5) // 17 if ov else 0, "gap": gap,
                      "latent_t": latent_t(f), "audio_t": audio_len(f), "link": ("cut" if gap else seg["link"]) if i else "start"})
        cursor = start + f
    return items


def estimate(project):
    """Summary + warnings shown before a run (of the project limited by the video end marker)."""
    full_n = len(project["segments"])
    project = limited_project(project)
    items = plan(project)
    w, h = work_resolution(project["settings"])
    total = items[-1]["end"] if items else 0
    if int(project.get("end") or 0) > 0:
        total = min(total, int(project["end"]))
    warnings = []
    if len(items) < full_n:
        warnings.append(f"{full_n - len(items)} отр. за маркером конца ролика — не генерируются")
    gap = int(project.get("end") or 0) - content_end(items)
    if items and gap > 0:
        warnings.append(f"пусто {fmt_sec10(gap)} с между последним отрезком и маркером конца — ролик будет короче: "
                        f"заполните пустоту отрезком («Продлить») или растяните последний")
    for it in items:
        seg = project["segments"][it["index"]]
        name = seg.get("name") or f"#{it['index'] + 1}"
        if it["frames"] < TRAINED_MIN_FRAMES or it["frames"] > TRAINED_MAX_FRAMES:
            warnings.append(f"{name}: {it['frames']} кадров ({it['frames'] / FPS:.1f} с) — вне обучающего диапазона H3 "
                            f"{TRAINED_MIN_FRAMES}–{TRAINED_MAX_FRAMES} кадров")
        n_refs = len(ordered_refs(project, seg)) + (1 if continuity_picture(project, it["index"]) else 0)
        if n_refs > MAX_REF_IMAGES:
            warnings.append(f"{name}: {n_refs} референсов, максимум {MAX_REF_IMAGES}"
                            + (" (вместе с последним кадром прошлого отрезка)" if continuity_picture(project, it["index"]) else ""))
        na = len(audio_refs(project, seg))
        if na > MAX_REF_AUDIOS:
            warnings.append(f"{name}: {na} аудио-референса, максимум {MAX_REF_AUDIOS}")
        nv = len(video_refs(project, seg))
        if nv > MAX_REF_VIDEOS:
            warnings.append(f"{name}: {nv} видео-референса, максимум {MAX_REF_VIDEOS}")
        if is_footage(seg):
            continue
        if it["link"] == "extend" and it["index"] > 0 and it["overlap"] == 0 and wanted_overlap(project, it["index"]) > 0:
            warnings.append(f"{name}: перекрытие не помещается в отрезок — продление только по последнему кадру")
        if not (project["settings"].get("prompt") or "").strip() and not (seg.get("prompt") or "").strip():
            warnings.append(f"{name}: пустой промпт")
        ids = {a["id"] for a in ordered_refs(project, seg)}
        for m in segment_markers(project, it["index"], items):
            if m["effect"] == "boost" and m["asset"] and m["asset"] not in ids:
                warnings.append(f"{name}: маркер «{m['label'] or m['id']}» усиливает персонажа, которого нет в референсах отрезка")
    for m in project.get("markers", []):
        if m["effect"] != "note" and marker_segment(items, m["frame"]) < 0:
            warnings.append(f"маркер «{m['label'] or m['id']}» за концом ролика — не действует")
    if w * h > 1344 * 768 * 1.05:
        warnings.append(f"{w}×{h} больше официальных 1344×768 — дольше и больше VRAM")
    steps = sum(seg_steps(project, it["index"]) for it in items)
    ups = [it["index"] for it in items if upscalable(project["segments"][it["index"]])]
    fr = {it["index"]: it["frames"] for it in items}
    um = lambda i: project["segments"][i]["upscale"]["method"]
    steps += sum(upscale_pass_params(project, i, um(i))["steps"] * upscale_chunking(project["settings"], fr[i], um(i))[0] for i in ups)
    if ups:
        uw, uh = max((upscale_canvas(w, h, project["segments"][i]["upscale"]) for i in ups), key=lambda c: c[0] * c[1])
        nch = max(upscale_chunking(project["settings"], fr[i], um(i))[0] for i in ups)
        warnings.append(f"апскейл отрезков: {len(ups)} → до {uw}×{uh}" + (f" · до {nch} фрагм. по времени" if nch > 1 else ""))
    return {"segments": len(items), "frames": total, "seconds": round(total / FPS, 3), "width": w, "height": h,
            "steps_total": steps, "warnings": warnings, "kind": run_kind(project["settings"])}


# ---------------------------------------------------------------- cache keys
def _h(obj):
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")).hexdigest()


def segment_keys(project, ref_sigs=None, env_sig="", kind=None, up_env="", parts=None):
    """Chained cache key per segment: changing a segment invalidates it and every extended segment after it.
    ref_sigs: {asset_id: file signature} (images, audio assets and "input" for the node's audio).
    kind: pass kind (default: the project's run kind). "full" keys are the one-pass keys of older versions; a
    draft key differs by its size/steps; a "refine" key is the draft key + refine settings + previous final."""
    ref_sigs = ref_sigs or {}
    project = limited_project(project)
    kind = kind or run_kind(project["settings"])
    if kind == "refine":
        dparts = [] if parts is not None else None
        return _refine_keys(project, segment_keys(project, ref_sigs, env_sig, "draft", parts=dparts),
                            segment_keys(project, ref_sigs, env_sig, "full"), up_env, parts, dparts)
    items = plan(project)
    w, h = work_resolution(project["settings"], kind)
    s = project["settings"]
    keys, prev = [], ""
    for it in items:
        i = it["index"]
        seg = project["segments"][i]
        env_i = env_sig[i] if isinstance(env_sig, (list, tuple)) else env_sig   # per-clip model presets
        data = {
            "v": KEY_VERSION, "env": env_i, "wh": [w, h], "frames": it["frames"], "ov": it["overlap"],
            "prompt": compose_prompt(project, i), "neg": s.get("negative") or "",
            "refs": [[a["id"], *asset_kf(a), ref_sigs.get(a["id"], "")] for a in ordered_refs(project, seg)],
            "params": pass_params(project, i, kind), "lock": bool(s.get("lock_overlap", True)),
            "cref": continuity_picture(project, i), "ref_size": s.get("ref_size"),
            "audio": [[c + [ref_sigs.get(c[0], "")] for c in segment_track(project, it)],
                      [[a["id"], ref_sigs.get(a["id"], "")] for a in audio_refs(project, seg)][:MAX_REF_AUDIOS]]
            if segment_track(project, it) or audio_refs(project, seg) else None,
            "prev": prev if it["link"] == "extend" and i > 0 else "",
        }
        if it["link"] == "extend" and i > 0 and it["overlap"]:
            data["alock"] = [audio_lock_overlap(project), 4 if audio_lock_overlap(project) else 3,   # 4: hard mask boundary (no hand-off ramp)
                             round(min(float(s.get("audio_context_sec", 0) or 0), AUDIO_CONTEXT_MAX), 2)]
        elif data["audio"] and data["audio"][0]:
            data["alock"] = [False, 3]
        src = seg.get("source")
        if src:
            a = next((x for x in project["assets"] if x["id"] == src["asset"]), {})
            sd = [a.get("id"), *(asset_kf(a) if a else (None, None)), ref_sigs.get(src["asset"], ""), src["in"], src["denoise"]]
            if is_footage(seg):   # used as is: only the file range, size and VAE matter
                data = {"v": KEY_VERSION, "env": env_i, "wh": [w, h], "frames": it["frames"], "src": sd}
            else:
                data["src"] = sd
        vr = video_refs(project, seg)
        if vr and not is_footage(seg):
            data["vrefs"] = [[a["id"], *asset_kf(a), ref_sigs.get(a["id"], "")] for a in vr][:MAX_REF_VIDEOS]
        k = seg["freeze"]["key"] if seg.get("freeze") else _h(data)[:16]
        keys.append(k)
        if parts is not None:   # what went into the key (cache miss reasons, take recipes)
            parts.append(data)
        prev = k
    return keys


def upscale_keys(project, base_keys, kind=None, up_env=None):
    """Keys of the segment upscales: None where a segment has no upscale (or is frozen / footage as is).
    key = base key + upscale params + the previous segment's upscale key when this one continues it on the same
    canvas (its overlap is locked to the previous upscaled tail)."""
    project = limited_project(project)
    kind = kind or run_kind(project["settings"])
    w, h = work_resolution(project["settings"], kind)
    out, prev = [], None
    for it, bk in zip(plan(project), base_keys):
        seg = project["segments"][it["index"]]
        up = seg.get("upscale")
        if not upscalable(seg):
            out.append(None)
            prev = None
            continue
        cont = it["link"] == "extend" and it["index"] > 0 and it["overlap"]
        wh = list(upscale_canvas(w, h, up))
        chain = prev[0] if prev and cont and prev[1] == wh else ""
        nch, cf, co = upscale_chunking(project["settings"], it["frames"], up["method"])
        upp, pr = upscale_pass_params(project, it["index"], up["method"]), upscale_profile(project["settings"], up["method"])
        smp = [pr.get("sampler") or "", pr.get("scheduler") or ""]   # in the key only when the profile sets its own (old keys stay)
        k = _h({"v": KEY_VERSION, "up": bk, "p": upscale_key_form(up, w, h), "env": (up_env or {}).get(up["method"], ""), "wh": wh,
                "steps": upp["steps"], "prev": chain, **({"rx": refine_extra(project["settings"])} if refine_extra(project["settings"]) else {}),
                **({"ch": [cf, co]} if nch > 1 else {}), **({"smp": smp} if any(smp) else {})})[:16]
        out.append(k)
        prev = (k, wh)
    return out


def refine_extra(s):
    """Refine-stage sampler / scheduler / cfg in the keys — only when set (older keys stay valid)."""
    x = [s.get("refine_sampler") or "", s.get("refine_scheduler") or "", float(s.get("refine_cfg") or 0)]
    return [["rx"] + x] if any(x) else []


def _refine_keys(project, draft_keys, full_keys, up_env="", parts=None, dparts=None):
    """Keys of the final-from-draft pass: footage as is and frozen clips keep their one-pass key (no refine).
    up_env: what really upscales (backend: learned model name / rtx / vae fallback)."""
    s = project["settings"]
    items = plan(project)
    rp = [s.get("refine_sigma"), s.get("upscale_method"), list(resolution(s))] + ([up_env] if up_env else []) + refine_extra(s)
    keys, prev = [], ""
    for it, dk, fk in zip(items, draft_keys, full_keys):
        seg = project["segments"][it["index"]]
        if seg.get("freeze") or is_footage(seg):
            k = fk
        else:
            data = {"v": KEY_VERSION, "refine": dk, "rp": rp, "steps": pass_params(project, it["index"], "refine")["steps"],
                    "prev": prev if it["link"] == "extend" and it["index"] > 0 else ""}
            k = _h(data)[:16]
            if parts is not None:
                parts.append(dict(data, _draft=dparts[len(keys)] if dparts else None))
        if parts is not None and len(parts) == len(keys):
            parts.append({"v": KEY_VERSION, "full": k})
        keys.append(k)
        prev = k
    return keys


# ---------------------------------------------------------------- «✂ Участок» (middle regeneration)
def normalize_region(r, i=0):
    rg = _merge(DEFAULT_REGION, {k: v for k, v in r.items() if k in DEFAULT_REGION})
    rg["id"] = str(rg["id"] or f"r{i + 1}")
    rg["name"] = str(rg["name"] or "")
    rg["start"] = max(0, int(_num(rg["start"], 0)))
    rg["end"] = max(0, int(_num(rg["end"], 0)))
    if rg["end"] <= rg["start"]:
        return None
    for k in ("head", "tail"):
        try:
            rg[k] = max(-1, min(MAX_OVERLAP_BLOCKS, int(float(rg[k]))))
        except (TypeError, ValueError):
            rg[k] = -1
    rg["prompt"] = str(rg["prompt"] or "")
    rg["refs"] = [str(x) for x in (rg["refs"] if isinstance(rg["refs"], list) else [])]
    rg["seed"] = max(0, int(_num(rg["seed"], 0)))
    rg["takes"] = [t for t in (rg["takes"] if isinstance(rg["takes"], list) else []) if isinstance(t, dict) and t.get("key")][-MAX_TAKES:]
    rg["active_take"] = None if rg["active_take"] is None else str(rg["active_take"])
    return rg


def scene_chains(items):
    """Runs of items whose latents join into one valid 17k+5 / 5k+2 latent: a chain breaks where a clip does not
    continue the previous one through an overlap (new scene, footage, last-frame-only extend). [(start, end, i0, i1)]"""
    out = []
    for it in items:
        if not out or not (it["index"] and it["overlap"]):
            out.append([it["start"], it["end"], it["index"], it["index"]])
        else:
            out[-1][1], out[-1][3] = it["end"], it["index"]
    return [tuple(c) for c in out]


def region_blocks(project, region, key):
    v = int(region.get(key, -1))
    if v < 0:
        v = int(project["settings"].get("overlap_blocks", 1) or 0)
    return max(0, min(MAX_OVERLAP_BLOCKS, v))


def region_window(project, region, items=None):
    """Sampling window of a region. The range snaps to its scene's 17-frame grid (a latent block); the window adds
    `head` blocks of clean context before it and 17·tail + 5 clean frames after it (so it has 17k+5 frames and starts
    on a standalone latent frame). A range reaching the scene end regenerates to the end (no tail).
    Returns a dict (frames are timeline pixel frames) with "error" set when the range cannot be regenerated."""
    items = items if items is not None else plan(limited_project(project))
    out = {"error": "", "warnings": []}
    st, en = int(region["start"]), int(region["end"])
    ch = next((c for c in scene_chains(items) if c[0] <= st < c[1]), None)
    if ch is None or en > ch[1] + 8:   # starts in a gap or crosses a cut / gap: one span over the join
        return bridge_window(project, region, items)
    cs, ce, i0, i1 = ch
    K = (ce - cs - 5) // 17   # whole blocks of the scene
    a = cs + 17 * min(K, max(0, int(math.floor((st - cs) / 17.0 + 0.5))))
    to_end = en >= ce - 8
    if to_end:
        b = ce
        a = min(a, ce - 22)
    else:
        b = cs + 17 * min(K, max(0, int(math.floor((en - cs) / 17.0 + 0.5))))
        if b < a + 17:
            b = a + 17
        if b > cs + 17 * K:
            b = ce
            to_end = True
            a = min(a, ce - 22)
    a = max(cs, a)
    oh = min(region_blocks(project, region, "head"), (a - cs) // 17)
    ws = a - 17 * oh
    if to_end:
        ot, we = 0, ce
    else:
        ot = min(region_blocks(project, region, "tail"), (ce - 5 - b) // 17)
        we = b + 17 * ot + 5
    frames = we - ws
    out.update({"chain": [cs, ce], "i0": i0, "i1": i1, "ws": ws, "a": a, "b": b, "we": we, "frames": frames,
                "head": a - ws, "tail": we - b, "head_blocks": oh, "tail_blocks": ot, "to_end": to_end,
                "lat0": 5 * (ws - cs) // 17, "latent_t": latent_t(frames), "seg": marker_segment(items, a),
                "segs": [it["index"] for it in items if it["start"] < we and it["end"] > ws]})
    if frames > MAX_FRAMES:
        out["error"] = f"окно {frames} кадров длиннее максимума {MAX_FRAMES} — выделите участок короче"
    if oh == 0 and a > cs:
        pass
    if a == cs:
        out["warnings"].append("участок у начала сцены — без контекста до него")
    if to_end:
        out["warnings"].append("участок до конца сцены — без контекста после него")
    if frames < TRAINED_MIN_FRAMES or frames > TRAINED_MAX_FRAMES:
        out["warnings"].append(f"окно {frames} кадров ({frames / FPS:.1f} с) вне обучающего диапазона H3 {TRAINED_MIN_FRAMES}–{TRAINED_MAX_FRAMES}")
    return out


def span_kind(win):
    """The four faces of the one span engine: "region" (inside a shot), "bridge" (across a cut / gap),
    "prologue" (no context before), "extension" (no context after, past the end of a shot)."""
    if win.get("mode") != "bridge":
        return "region"
    if not win.get("head"):
        return "prologue"
    if win.get("to_end") and not win.get("tail_blocks"):
        return "extension"
    return "bridge"


def bridge_window(project, region, items=None):
    """A span over a join (cut / gap) — same engine as a region, but its source is the stitched picture and sound
    of the window, VAE-encoded (the two sides are separate latent chains). Clean head context = the end of the
    shot before (whole blocks, grid from the span start), clean tail = the start of the shot after; the middle —
    across the cut or the gap — is generated. Only a head: «продлить» into a gap; only a tail: «пролог» before a
    shot; neither: a fresh fill. Window frames are 17k+5 from ws; the head never contains a gap, the tail
    stays inside the next shot."""
    items = items if items is not None else plan(limited_project(project))
    out = {"error": "", "warnings": [], "mode": "bridge"}
    st, en = int(region["start"]), int(region["end"])
    chains = scene_chains(items)
    if not items or en <= st:
        out["error"] = "пустой участок"
        return out
    total = items[-1]["end"]
    chA = next((c for c in chains if c[0] <= st < c[1]), None)
    chB = next((c for c in chains if c[0] <= en < c[1]), None)
    if chA is not None and chB is not None and chA == chB:
        chB = None
    if chA is not None:
        a = chA[0] + 17 * max(0, (st - chA[0]) // 17)   # the span covers the whole selection (the join inside)
        a = min(a, chA[1])
        oh = min(region_blocks(project, region, "head"), (a - chA[0]) // 17)
    else:
        a, oh = max(0, st), 0
    ws = a - 17 * oh
    m = max(1, -(-(min(en, total) - a) // 17))
    b = a + 17 * m
    ot = 0
    if chB is not None and b >= chB[0]:
        ot = max(0, min(region_blocks(project, region, "tail"), (chB[1] - 5 - b) // 17))
    to_end = ot == 0
    we = b + 17 * ot + 5
    if we > total:
        out["error"] = "участок выходит за конец таймлайна — добавьте промежуток или отрезок после него"
        return out
    frames = we - ws
    segs = [it["index"] for it in items if it["start"] < we and it["end"] > ws]
    out.update({"chain": [ws, we], "i0": segs[0] if segs else 0, "i1": segs[-1] if segs else 0, "ws": ws, "a": a, "b": b, "we": we,
                "frames": frames, "head": a - ws, "tail": we - b, "head_blocks": oh, "tail_blocks": ot, "to_end": to_end, "lat0": 0,
                "latent_t": latent_t(frames), "seg": marker_segment(items, a) if marker_segment(items, a) >= 0 else (segs[0] if segs else 0),
                "segs": segs, "gaps": [[it["index"], it["gap"]] for it in items if it.get("gap") and ws < it["start"] <= we]})
    if not segs:
        out["error"] = "под участком нет отрезков"
    elif frames > MAX_FRAMES:
        out["error"] = f"окно {frames} кадров длиннее максимума {MAX_FRAMES} — выделите участок короче"
    if oh == 0:
        out["warnings"].append("без контекста до участка (пролог / заполнение)")
    if to_end:
        out["warnings"].append("без контекста после участка (продление)")
    if frames < TRAINED_MIN_FRAMES or frames > TRAINED_MAX_FRAMES:
        out["warnings"].append(f"окно {frames} кадров ({frames / FPS:.1f} с) вне обучающего диапазона H3 {TRAINED_MIN_FRAMES}–{TRAINED_MAX_FRAMES}")
    return out


def region_prompt(project, region):
    s = project["settings"]
    return "\n".join(t.strip() for t in (s.get("prompt") or "", region.get("prompt") or "") if t and t.strip())


def region_refs(project, region):
    return ordered_refs(project, {"refs": region.get("refs") or []})


def region_params(project, region, win, kind):
    """Sampling parameters of a region pass: those of the clip it starts in, with the region's own seed."""
    p = pass_params(project, max(0, win.get("seg", 0)), kind)
    p["seed"] = int(region.get("seed") or 0)
    return p


def region_key(project, region, win, seg_keys, ref_sigs=None, env_sig="", kind=None, wh=None):
    """Cache key of a region pass: the source latents (keys of the clips under its window, chained), the window,
    prompt, refs and parameters."""
    ref_sigs = ref_sigs or {}
    kind = kind or run_kind(project["settings"])
    s = project["settings"]
    cs = win["chain"][0]
    if win.get("mode") == "bridge":   # source = the stitched window (its clips, gaps, level lock), absolute place
        kind = "full" if kind == "refine" else kind
        env_sig = env_sig.split("|")[0]
    extra = {"bridge": [win["ws"], win["a"], win["b"], win["we"], win.get("gaps") or [], level_lock_frames(project)]} if win.get("mode") == "bridge" else {}
    return _h({"v": KEY_VERSION, "region": 1, **extra, "env": env_sig, "kind": kind, "wh": list(wh or []),
               "src": [seg_keys[i] for i in win["segs"] if i < len(seg_keys)],
               "win": [win["ws"] - cs, win["a"] - cs, win["b"] - cs, win["we"] - cs, win["to_end"]],
               "prompt": region_prompt(project, region), "neg": s.get("negative") or "",
               "refs": [[a["id"], *asset_kf(a), ref_sigs.get(a["id"], "")] for a in region_refs(project, region)],
               "params": region_params(project, region, win, kind), "ref_size": s.get("ref_size"),
               "actx": round(min(float(s.get("audio_context_sec", 0) or 0), AUDIO_CONTEXT_MAX), 2),
               "track": [c for c in lock_clips(project)] if lock_clips(project) else None})[:16]

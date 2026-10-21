import { T } from "./h3s_i18n.js";
// H3ZeroStudio: pure project/timeline logic. Mirror of h3s_core.py (tests/test_core_parity.py compares both).
export const FPS = 24;
export const AUDIO_LATENT_FPS = 40;
export const CANVAS_MULTIPLE = 32;
export const MAX_REF_IMAGES = 9;
export const TRAINED_MIN_FRAMES = 124;
export const TRAINED_MAX_FRAMES = 362;
export const MIN_FRAMES = 22;
export const MAX_FRAMES = 17 * 56 + 5;
export const CATEGORY_ORDER = ["character", "location", "other"]; // image references, in <Picture N> order
export const ASSET_CATEGORIES = [...CATEGORY_ORDER, "audio", "video"];
export const AUDIO_INPUT_ID = "input";
export const MAX_REF_AUDIOS = 3;
export const MAX_REF_VIDEOS = 3;
export const REF_VIDEO_MAX_SEC = 15;
export const ASPECTS = { "16:9": [16, 9], "9:16": [9, 16], "1:1": [1, 1], "4:3": [4, 3], "3:4": [3, 4], "21:9": [21, 9] };
export const SCHEMA_VERSION = 1;
export const DEFAULT_CONTINUITY = "Continuity: <Picture {n}> is the last frame of the previous shot of this video; " +
  "continue seamlessly from it and keep characters, faces, clothing, lighting and details consistent with <Picture {n}>.";
export const AUDIO_REF_PHRASE = "Use {tags} as the sound reference of this shot.";
export const VIDEO_REF_PHRASE = "Use {tags} as the motion reference of this shot.";
export const DEFAULT_SETTINGS = {
  model_preset: "", prompt: "", negative: "", aspect: "16:9", res_mode: "mp", megapixels: 0.5, width: 960, height: 544,
  steps: 20, cfg: 1.0, sampler: "res_multistep", scheduler: "simple", shift_video: 12.0, shift_audio: 3.0,
  seed: 0, fps: FPS, denoise: 1.0, overlap_blocks: 1, audio_context_sec: 1.0, lock_overlap: true, continuity_ref: true,
  continuity_phrase: DEFAULT_CONTINUITY, ref_size: "match", cache: true,
  audio_seam_lock: true, audio_xfade: true, audio_xfade_sec: 0.4, audio_match: true, audio_declick: true, level_lock: true, level_lock_frames: 12, magnet: false, vram_headroom_gb: 1.0,
  preview_tiny_vae: "auto", preview_max_res: 512, preview_quality: 80, preview_frames: 48,
  preview_fps: 0, preview_suppress: true, preview_audio: true,
  verbose_log: true,
  // draft mode (see h3s_core.py): quality "final" | "draft"; final_mode "full" | "refine" (final from the draft)
  quality: "final", final_mode: "full", draft_scale: 0.5, draft_steps: 0, refine_sigma: 0.4, refine_steps: 0, upscale_method: "learned", upscale_rev: 4, seg_upscale: { method: "latent", scale: 2 }, upscale_chunk_sec: 5.0, upscale_chunk_overlap: 1, upscale_profiles: null,
  draft_sampler: "", draft_scheduler: "", draft_cfg: 0, refine_sampler: "", refine_scheduler: "", refine_cfg: 0, settings_scope: "project",
};
export const DRAFT_SCALES = [0.5, 0.67, 0.75];
export const REFINE_SIGMA_RANGE = [0.15, 0.8];
export const UPSCALE_METHODS = ["learned", "rtx"];   // nearest-exact / VAE-Lanczos removed
// «Апскейл отрезка» (see h3s_upscale.py)
export const SEG_UPSCALE_METHODS = ["latent", "rtx", "tiles"];
export const SEG_UPSCALE_SCALES = [1.5, 2.0];   // legacy multipliers (migrated to "mp")
export const SEG_UPSCALE_MP_PRESETS = [1.0, 1.5, 2.0, 2.5, 3.0, 4.0];
export const SEG_UPSCALE_MP_RANGE = [0.01, 8.5];
export const UPSCALE_CHUNK_SEC_RANGE = [2.0, 30.0];
export const UPSCALE_CHUNK_OVERLAP_RANGE = [1, 3];
/** Half-up rounding (mirror of h3s_core._round). */
export const roundHalf = (x, d) => Math.floor(Number(x) * 10 ** d + 0.5) / 10 ** d;
export const SEG_UPSCALE_SIGMA = { latent: 0.4, rtx: 0.25, tiles: 0.6 };
export const SEG_UPSCALE_SIGMA_RANGE = [0.1, 1.0];
export const SEG_UPSCALE_SIGMA_OLD_TILES = 0.35;   // the tiles default before upscale_rev 4
export const UPSCALE_REV = 4;
// «Сила доработки» choices of the upscale profiles; RECOMMENDED marks the user-tested value of a method
export const SEG_UPSCALE_SIGMA_CHOICES = [0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 1.0];
export const SEG_UPSCALE_SIGMA_RECOMMENDED = { tiles: 0.6 };
export const RTX_QUALITIES = ["LOW", "MEDIUM", "HIGH", "ULTRA"];
export const UPSCALE_LABELS = { latent: T("Латент + доработка"), rtx: T("RTX VSR → доработка"), tiles: T("Плитки (SyncTile)") };
export function normalizeUpscale(u) {
  if (!u || typeof u !== "object" || !SEG_UPSCALE_METHODS.includes(u.method)) return null;
  const m = u.method;
  const sg = Math.round(Math.min(SEG_UPSCALE_SIGMA_RANGE[1], Math.max(SEG_UPSCALE_SIGMA_RANGE[0], num(u.sigma, SEG_UPSCALE_SIGMA[m]))) * 1000) / 1000;
  const mp = num(u.mp, 0);
  let out;
  if (mp > 0) out = { method: m, mp: roundHalf(Math.min(SEG_UPSCALE_MP_RANGE[1], Math.max(SEG_UPSCALE_MP_RANGE[0], mp)), 4), sigma: sg };
  else { const sc0 = num(u.scale, 2.0); out = { method: m, scale: SEG_UPSCALE_SCALES.reduce((a, b) => (Math.abs(b - sc0) < Math.abs(a - sc0) ? b : a)), sigma: sg }; }
  if (m === "rtx") { const q = String(u.quality || "ULTRA").toUpperCase(); out.quality = RTX_QUALITIES.includes(q) ? q : "ULTRA"; }
  if (m === "tiles") {
    const t = u.tile;
    if (Array.isArray(t) && t.length === 2 && num(t[0], 0) > 0 && num(t[1], 0) > 0) out.tile = t.map((x) => Math.trunc(Math.min(TILE_PX_RANGE[1], Math.max(TILE_PX_RANGE[0], snap32(num(x, 0))))));
    let ov = Math.trunc(num(u.tile_ov, 0));
    if (ov > 0) { ov = Math.min(TILE_OV_RANGE[1], Math.max(TILE_OV_RANGE[0], ov)); out.tile_ov = ov - (ov % 2); }
  }
  return out;
}
export const TILE_PX_RANGE = [256, 2048], TILE_OV_RANGE = [2, 32];
/** Tile starts (cells) covering `length` (mirror of h3s_upscale.tile_positions). */
export function tilePositions(length, tile, minOv) {
  if (tile >= length) return [0];
  minOv = Math.max(0, Math.min(minOv, tile - 2));
  const n = Math.max(2, Math.ceil((length - minOv) / (tile - minOv))), out = new Set();
  for (let i = 0; i < n; i++) { const s = Math.round(i * (length - tile) / (n - 1)); out.add(Math.min(length - tile, s - (s % 2))); }
  return [...out].sort((a, b) => a - b);
}
/** Tile grid of a tiled upscale (mirror of h3s_upscale.plan_crops): base canvas bw×bh px → target W×H px. */
export function tileGrid(bw, bh, W, H, up) {
  const lh = H / 16, lw = W / 16, t = up?.tile || [bw, bh];
  const th = Math.min(lh, Math.floor(t[1] / 16) - (Math.floor(t[1] / 16) % 2)), tw = Math.min(lw, Math.floor(t[0] / 16) - (Math.floor(t[0] / 16) % 2));
  const ovy = up?.tile_ov || Math.max(4, Math.min(16, Math.floor(th / 3))), ovx = up?.tile_ov || Math.max(4, Math.min(16, Math.floor(tw / 3)));
  const ys = tilePositions(lh, th, ovy), xs = tilePositions(lw, tw, ovx);
  return { rows: ys.length, cols: xs.length, tw: tw * 16, th: th * 16, ov: Math.min(ovx, ovy) * 16, ys, xs, lh, lw };
}
/** Target canvas of an upscale (mirror of h3s_core.upscale_canvas): {mp} megapixel target, legacy {scale} or a number. */
export function upscaleCanvas(w, h, up) {
  if (up && typeof up === "object") {
    if (num(up.mp, 0) > 0) { const k = Math.sqrt(Number(up.mp) * 1e6 / (w * h)); return [snap32(w * k), snap32(h * k)]; }
    up = num(up.scale, 2.0);
  }
  return [snap32(w * up), snap32(h * up)];
}
export function mpForScale(w, h, scale) {
  const t = upscaleCanvas(w, h, scale);
  for (const d of [2, 3, 4]) { const mp = roundHalf(w * h * scale * scale / 1e6, d), c = upscaleCanvas(w, h, { mp }); if (c[0] === t[0] && c[1] === t[1]) return mp; }
  return roundHalf(t[0] * t[1] / 1e6, 4);
}
export function migrateUpscale(u, w, h) {
  if (!u || "mp" in u || !("scale" in u)) return u;
  const out = {}; for (const [k, v] of Object.entries(u)) { if (k === "scale") out.mp = mpForScale(w, h, v); else out[k] = v; }
  return out;
}
/** Key / signature form: an mp reproducing an old ×1.5 / ×2 canvas hashes as that multiplier (mirror of upscale_key_form). */
export function upscaleKeyForm(up, w, h) {
  if (up && "mp" in up) {
    const c = upscaleCanvas(w, h, up);
    for (const sc of SEG_UPSCALE_SCALES) { const o = upscaleCanvas(w, h, sc); if (o[0] === c[0] && o[1] === c[1]) { const out = {}; for (const [k, v] of Object.entries(up)) { if (k === "mp") out.scale = sc; else out[k] = v; } return out; } }
  }
  return up;
}
/** Window starts (blocks) — plan_windows of ComfyUI-H3-WindowedRefine (mirror of h3s_core.chunk_starts). */
export function chunkStarts(k, m, o) {
  m = Math.max(1, Math.min(Math.trunc(m), k)); o = Math.max(0, Math.min(Math.trunc(o), m - 1));
  const last = k - m; if (last <= 0) return [0];
  const n = Math.max(2, Math.min(Math.ceil(last / (m - o)) + 1, last + 1)), out = new Set();
  for (let i = 0; i < n; i++) out.add(roundHalf(i * last / (n - 1), 0));
  return [...out].sort((a, b) => a - b);
}
/** Temporal chunks of a clip's upscale: [count, chunk frames (0 = off), overlap blocks] (mirror of upscale_chunking). */
export function upscaleChunking(s, frames, method = null) {
  let sec, ov;
  if (method) { const pr = upscaleProfile(s, method); sec = pr.chunk ? num(pr.chunk_sec, 5) : 0; ov = pr.chunk_overlap; }
  else { sec = num(s.upscale_chunk_sec, 0); ov = s.upscale_chunk_overlap; }
  if (sec <= 0) return [1, 0, 0];
  const cf = snapFrames(sec * FPS), m = (latentT(cf) - 2) / 5;
  const o = Math.max(1, Math.min(Math.trunc(num(ov, 1)), m - 1)), k = (latentT(frames) - 2) / 5;
  return [frames > cf + 34 ? chunkStarts(k, m, o).length : 1, cf, o];
}
// every upscale method keeps its own profile (mirror of h3s_core.normalize_upscale_profile & co)
export const UPSCALE_CHUNK_DEFAULT = { latent: true, rtx: true, tiles: false };
export const UPSCALE_UP_FIELDS = ["mp", "scale", "sigma", "quality", "tile", "tile_ov"];
const pick = (o, keys) => { const r = {}; for (const k of keys) if (o && k in o) r[k] = o[k]; return r; };
export function normalizeUpscaleProfile(m, p) {
  p = p && typeof p === "object" ? p : {};
  const u = normalizeUpscale({ ...pick(p, UPSCALE_UP_FIELDS), method: m }) || normalizeUpscale({ method: m, scale: 2 });
  const out = {}; for (const [k, v] of Object.entries(u)) if (k !== "method") out[k] = v;
  out.steps = Math.trunc(Math.max(0, Math.min(200, num(p.steps, 0))));
  out.sampler = String(p.sampler || "").slice(0, 64);
  out.scheduler = String(p.scheduler || "").slice(0, 64);
  out.chunk = "chunk" in p ? !!p.chunk : UPSCALE_CHUNK_DEFAULT[m];
  const cs = num(p.chunk_sec, 5.0);
  out.chunk_sec = roundHalf(Math.min(UPSCALE_CHUNK_SEC_RANGE[1], Math.max(UPSCALE_CHUNK_SEC_RANGE[0], cs > 0 ? cs : 5.0)), 1);
  out.chunk_overlap = Math.trunc(Math.min(UPSCALE_CHUNK_OVERLAP_RANGE[1], Math.max(UPSCALE_CHUNK_OVERLAP_RANGE[0], num(p.chunk_overlap, 1))));
  return out;
}
export function normalizeUpscaleProfiles(st) {
  const su = st.seg_upscale;
  let raw = st.upscale_profiles;
  if (!raw || typeof raw !== "object" || !SEG_UPSCALE_METHODS.some((m) => raw[m] && typeof raw[m] === "object")) {
    const cs = num(st.upscale_chunk_sec, 5.0), co = st.upscale_chunk_overlap ?? 1, size = pick(su, ["mp", "scale"]);
    raw = {};
    for (const m of SEG_UPSCALE_METHODS) {
      const base = m === su.method ? pick(su, UPSCALE_UP_FIELDS) : { ...size, sigma: SEG_UPSCALE_SIGMA[m] };
      raw[m] = { ...base, chunk: m === su.method ? cs > 0 : UPSCALE_CHUNK_DEFAULT[m], chunk_sec: cs > 0 ? cs : 5.0, chunk_overlap: co };
    }
  }
  const out = {}; for (const m of SEG_UPSCALE_METHODS) out[m] = normalizeUpscaleProfile(m, raw[m]);
  st.upscale_profiles = out;
  st.seg_upscale = profileUpscale(st, su.method);
}
export function upscaleProfile(s, method) { const pr = (s.upscale_profiles || {})[method]; return pr && typeof pr === "object" ? pr : normalizeUpscaleProfile(method, null); }
export function profileUpscale(s, method) { return normalizeUpscale({ ...pick(upscaleProfile(s, method), UPSCALE_UP_FIELDS), method }); }
export function upscalePassParams(project, index, method) {
  const p = passParams(project, index, "refine"), pr = upscaleProfile(project.settings, method);
  if (pr.steps) p.steps = pr.steps;
  if (pr.sampler) p.sampler = pr.sampler;
  if (pr.scheduler) p.scheduler = pr.scheduler;
  return p;
}
/** The segment's upscale applies: set and not a take frozen after its upscale (freeze.up). Footage as is too:
 *  its VAE-encoded frames go through the same mode; RTX VSR upscales the file's frames directly (no refine). */
export const upscalable = (seg) => !!seg.upscale && !(seg.freeze && seg.freeze.up);
export const footageDirect = (seg) => isFootage(seg) && seg.upscale?.method === "rtx";
export const STAGE_KEYS = ["draft_sampler", "draft_scheduler", "draft_cfg", "refine_sampler", "refine_scheduler", "refine_cfg"];
export const RUN_KINDS = ["draft", "refine", "full"];
/** «Настройки»: set-once settings shared by all projects (mirror of h3s_core.GLOBAL_KEYS). */
export const GLOBAL_KEYS = ["final_mode", "steps", "cfg", "denoise", "sampler", "scheduler", "shift_video", "shift_audio",
               "draft_scale", "draft_steps", "draft_sampler", "draft_scheduler", "draft_cfg",
               "refine_sigma", "refine_steps", "refine_sampler", "refine_scheduler", "refine_cfg",
               "upscale_method", "upscale_rev", "seg_upscale", "upscale_profiles", "upscale_chunk_sec", "upscale_chunk_overlap", "overlap_blocks", "audio_context_sec", "lock_overlap", "continuity_ref",
               "continuity_phrase", "ref_size", "cache", "audio_seam_lock", "audio_xfade", "audio_xfade_sec", "audio_match", "audio_declick", "level_lock", "level_lock_frames", "magnet", "vram_headroom_gb",
               "preview_tiny_vae", "preview_max_res", "preview_quality", "preview_frames", "preview_fps", "preview_suppress",
               "verbose_log"];
/** Refine-stage sampler / scheduler / cfg in the sigs — only when set (mirror of h3s_core.refine_extra). */
export function refineExtra(s) { const x = [s.refine_sampler || "", s.refine_scheduler || "", Number(s.refine_cfg || 0)]; return x.some(Boolean) ? [["rx", ...x]] : []; }
export const runKind = (s) => (s.quality === "draft" ? "draft" : s.final_mode === "refine" ? "refine" : "full");
export function workResolution(s, kind = null) {
  const [w, h] = resolution(s);
  if ((kind || runKind(s)) !== "draft") return [w, h];
  const k = Number(s.draft_scale || 0.5);
  return [snap32(w * k), snap32(h * k)];
}
export function passSteps(s, steps, kind) {
  if (kind === "draft") return Math.trunc(Number(s.draft_steps || 0)) || steps;
  if (kind === "refine") return Math.trunc(Number(s.refine_steps || 0)) || Math.max(4, Math.floor(steps / 2));
  return steps;
}
export const AUDIO_XFADE_RANGE = [0.1, 1.0];
export const DEFAULT_SEGMENT = {
  id: "", name: "", color: 0, frames: 124, prompt: "", refs: [], cards: [], link: "extend", gap: 0, overlap_blocks: -1, overrides: {},
  upscale: null, approved: false,
  takes: [], active_take: null, locked: false, freeze: null, model_preset: "",
};
export const MAX_TAKES = 12;
// «✂ Участок»: regenerate a time range in the middle of the video (mirror of h3s_core.DEFAULT_REGION)
export const DEFAULT_REGION = { id: "", name: "", start: 0, end: 0, head: -1, tail: -1, prompt: "", refs: [], cards: [], seed: 0, takes: [], active_take: null, upscale: null };
export const MAX_REGIONS = 16;
export const MARKER_EFFECTS = ["note", "prompt", "boost"];
export const DEFAULT_MARKER = { id: "", frame: 0, label: "", color: 0, effect: "note", text: "", asset: "" };
export const MARKER_PROMPT = "At {t}s: {text}";
export const BOOST_PHRASE = "Strictly preserve the identity of {pics} exactly as in the reference image: " +
  "same face, hairstyle, body proportions and clothing in every frame.";
export const DEFAULT_AUDIO = { clips: [], video_volume: 1.0, input_ref: null };
export const DEFAULT_AUDIO_CLIP = { id: "", asset: AUDIO_INPUT_ID, lane: 0, start: 0.0, in: 0.0, length: 0.0, volume: 1.0, fade_in: 0.0, fade_out: 0.0 };
export const MUSIC_LANE = 2;
export const OVERRIDE_KEYS = ["seed", "steps", "cfg", "denoise", "sampler", "scheduler", "shift_video", "shift_audio"];

const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

export function snapFrames(n, mode = "nearest") {
  n = Number(n);
  let k = (n - 5) / 17;
  k = mode === "down" ? Math.floor(k) : mode === "up" ? Math.ceil(k) : Math.floor(k + 0.5);
  k = Math.max(Math.floor((MIN_FRAMES - 5) / 17), Math.min(Math.floor((MAX_FRAMES - 5) / 17), k | 0));
  return 17 * k + 5;
}
export const latentT = (f) => (f <= 5 ? 2 : Math.floor((f - 5) / 17) * 5 + 2);
export const audioLen = (f) => Math.round(f / FPS * AUDIO_LATENT_FPS);
export const overlapFrames = (o) => 17 * (o | 0) + 5;
export const MAX_OVERLAP_BLOCKS = 8;
export const MAX_GAP = 24 * 600;   // mirror of h3s_core.MAX_GAP
export const AUDIO_CONTEXT_MAX = 4.0;
/** Requested overlap blocks of a segment: own override or the global setting. */
export function wantedOverlap(project, index) {
  const s = project.settings, seg = project.segments[index];
  let o = seg.overlap_blocks ?? -1;
  if (o < 0) o = s.overlap_blocks | 0;
  return Math.max(0, Math.min(MAX_OVERLAP_BLOCKS, o | 0));
}
export const snap32 = (x) => Math.max(CANVAS_MULTIPLE, Math.floor(Number(x) / CANVAS_MULTIPLE + 0.5) * CANVAS_MULTIPLE);

export function resolution(s) {
  if (s.res_mode === "custom") return [snap32(s.width ?? 960), snap32(s.height ?? 544)];
  const a = ASPECTS[s.aspect] || [16, 9];
  const mp = Math.max(0.05, Math.min(4.0, Number(s.megapixels ?? 0.5)));
  const px = mp * 1024 * 1024;
  const w = Math.sqrt(px * a[0] / a[1]);
  const h = w * a[1] / a[0];
  return [snap32(w), snap32(h)];
}

const num = (v, d) => { const f = typeof v === "boolean" || v === null || v === "" || v === undefined ? NaN : Number(v); return Number.isFinite(f) ? f : d; };

function merge(defaults, value) {
  const out = clone(defaults);
  if (value && typeof value === "object" && !Array.isArray(value)) for (const k of Object.keys(value)) out[k] = clone(value[k]);
  return out;
}

// ------------------------------------------------------------------ model & LoRA presets (mirror of h3s_core.py)
export const PRESET_DTYPES = ["default", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2"];
export const MAX_PRESET_LORAS = 16, MAX_PRESETS = 64;
export const presetId = (x) => (typeof x === "string" ? x : "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
const r3 = (x) => Math.floor(x * 1000 + 0.5) / 1000;
/** Clean model preset (null = not one): base "unet" | "checkpoint", model, dtype, clip, vae, audio_vae, loras [{file, on, sm, sc}]. */
export function normalizePreset(p, pid) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  pid = presetId(pid !== undefined && pid !== null ? pid : p.id);
  if (!pid) return null;
  const sv = (k) => (typeof p[k] === "string" ? p[k].slice(0, 300) : "");
  const loras = [];
  for (const l of (Array.isArray(p.loras) ? p.loras : []).slice(0, MAX_PRESET_LORAS)) {
    if (!l || typeof l !== "object" || Array.isArray(l) || typeof l.file !== "string" || !l.file) continue;
    const sm = r3(Math.max(-10, Math.min(10, num(l.sm, 1.0)))), sc = r3(Math.max(-10, Math.min(10, num(l.sc, sm))));
    loras.push({ file: l.file.slice(0, 300), on: l.on !== false, sm, sc });
  }
  return { id: pid, name: (sv("name") || pid).slice(0, 80), base: p.base === "checkpoint" ? "checkpoint" : "unet", model: sv("model"),
    dtype: PRESET_DTYPES.includes(p.dtype) ? p.dtype : "default", clip: sv("clip"), vae: sv("vae"), audio_vae: sv("audio_vae"), loras, note: sv("note").slice(0, 500) };
}
/** Effective preset of segment i (its own if it exists, else the project's); null = wired inputs. */
export function segmentPreset(project, i) {
  const pr = project.model_presets || {}, own = project.segments[i]?.model_preset || "";
  return (own && pr[own]) || pr[project.settings?.model_preset || ""] || null;
}
/** What of a preset decides a clip's result (mirror of h3s_core.preset_fingerprint, separators without spaces). */
export function presetFingerprint(p) {
  if (!p) return "";
  return JSON.stringify([p.base, p.model, p.dtype, p.clip, p.loras.filter((l) => l.on && (l.sm || l.sc)).map((l) => [l.file, l.sm, l.sc])]);
}

/** (file, subfolder) of an asset as the cache keys know it (mirror of h3s_core.asset_kf): a moved asset keeps the old pair. */
export const assetKf = (a) => (Array.isArray(a?.kf) && a.kf.length === 2 && a.kf.every((x) => typeof x === "string") ? a.kf : [a?.file, a?.subfolder]);

export function normalizeProject(p) {
  if (typeof p === "string") { try { p = p.trim() ? JSON.parse(p) : {}; } catch (e) { p = {}; } }
  if (!p || typeof p !== "object" || Array.isArray(p)) p = {};
  const out = {
    version: SCHEMA_VERSION,
    id: String(p.id || "").replace(/[^A-Za-z0-9_-]/g, "") || "project",
    name: String(p.name || T("H3 проект")),
    settings: merge(DEFAULT_SETTINGS, p.settings),
    assets: [],
    segments: [],
    audio: merge(DEFAULT_AUDIO, p.audio),
    markers: [],
    end: Math.max(0, Math.trunc(num(p.end, 0))),
    end_mode: p.end_mode === "auto" ? "auto" : "fixed",
    run: { upto: -1, only: -1, kind: "", region: "" },
    regions: [],
    stats: p.stats && typeof p.stats === "object" && !Array.isArray(p.stats) ? clone(p.stats) : null,
    result: p.result && typeof p.result === "object" && !Array.isArray(p.result) ? clone(p.result) : null,
  };
  if (out.end_mode === "auto") out.end = 0;
  out.cards = normalizeCardSnaps(p.cards);
  out.model_presets = {};
  if (p.model_presets && typeof p.model_presets === "object" && !Array.isArray(p.model_presets))
    for (const [k, v] of Object.entries(p.model_presets).slice(0, MAX_PRESETS)) { const q = normalizePreset(v, k); if (q) out.model_presets[q.id] = q; }
  out.settings.model_preset = presetId(out.settings.model_preset);
  { const st = out.settings;
    st.quality = st.quality === "draft" ? "draft" : "final";
    st.final_mode = st.final_mode === "refine" ? "refine" : "full";
    const ds = num(st.draft_scale, 0.5); st.draft_scale = DRAFT_SCALES.reduce((b, x) => (Math.abs(x - ds) < Math.abs(b - ds) ? x : b), DRAFT_SCALES[0]);
    st.draft_steps = Math.max(0, Math.min(200, Math.trunc(num(st.draft_steps, 0))));
    st.refine_steps = Math.max(0, Math.min(200, Math.trunc(num(st.refine_steps, 0))));
    st.refine_sigma = Math.round(Math.max(REFINE_SIGMA_RANGE[0], Math.min(REFINE_SIGMA_RANGE[1], num(st.refine_sigma, 0.4))) * 100) / 100;
    st.upscale_method = UPSCALE_METHODS.includes(st.upscale_method) ? st.upscale_method : "learned";
    const oldRev = num(p.settings && typeof p.settings === "object" ? p.settings.upscale_rev : 0, 0);   // as stored (the merged defaults already say 4)
    st.upscale_rev = UPSCALE_REV;
    st.seg_upscale = normalizeUpscale(st.seg_upscale) || normalizeUpscale({ method: "latent", scale: 2 });
    { const cs = num(st.upscale_chunk_sec, 5.0); st.upscale_chunk_sec = cs <= 0 ? 0 : roundHalf(Math.min(UPSCALE_CHUNK_SEC_RANGE[1], Math.max(UPSCALE_CHUNK_SEC_RANGE[0], cs)), 1);
      st.upscale_chunk_overlap = Math.trunc(Math.min(UPSCALE_CHUNK_OVERLAP_RANGE[1], Math.max(UPSCALE_CHUNK_OVERLAP_RANGE[0], num(st.upscale_chunk_overlap, 1)))); }
    normalizeUpscaleProfiles(st);
    if (oldRev < 4) {   // rev 4: tiles default σ 0.35 -> 0.60; a profile still at the old default follows (picked values stay)
      const tp = st.upscale_profiles.tiles;
      if (Math.abs(tp.sigma - SEG_UPSCALE_SIGMA_OLD_TILES) < 1e-6) { tp.sigma = SEG_UPSCALE_SIGMA.tiles; st.seg_upscale = profileUpscale(st, st.seg_upscale.method); }
    }
    for (const k of ["draft", "refine"]) {
      st[k + "_sampler"] = String(st[k + "_sampler"] || "").slice(0, 64);
      st[k + "_scheduler"] = String(st[k + "_scheduler"] || "").slice(0, 64);
      st[k + "_cfg"] = Math.round(Math.max(0, Math.min(30, num(st[k + "_cfg"], 0))) * 100) / 100;
    }
    st.settings_scope = st.settings_scope === "global" ? "global" : "project"; }   // older "vae" / "latent" (nearest-exact) → "learned"
  { const u = Math.trunc(num(p.run?.upto, -1)); out.run.upto = u; out.run.only = Math.trunc(num(p.run?.only, -1)); out.run.kind = RUN_KINDS.includes(p.run?.kind) ? p.run.kind : "";
    out.run.region = typeof p.run?.region === "string" ? p.run.region : "";
    if (p.run?.audio && typeof p.run.audio === "object") { const a = p.run.audio;   // «Улучшить звук»
      out.run.audio = { steps: Math.max(1, Math.min(50, Math.trunc(num(a.steps, 6)))), denoise: Math.max(0.05, Math.min(1, num(a.denoise, 0.45))), video_denoise: Math.max(0, Math.min(1, num(a.video_denoise, 0))) }; }
    (Array.isArray(p.regions) ? p.regions : []).forEach((r, i) => {
      if (!r || typeof r !== "object" || Array.isArray(r)) return;
      const rg = normalizeRegion(r, i); if (rg && out.regions.length < MAX_REGIONS) out.regions.push(rg);
    }); }
  (Array.isArray(p.markers) ? p.markers : []).forEach((m, i) => {
    if (!m || typeof m !== "object" || Array.isArray(m)) return;
    const src = {}; for (const k of Object.keys(DEFAULT_MARKER)) if (k in m) src[k] = m[k];
    const mk = merge(DEFAULT_MARKER, src);
    mk.id = String(mk.id || `m${i + 1}`);
    mk.frame = Math.max(0, Math.trunc(num(mk.frame, 0)));
    mk.color = Math.max(0, Math.trunc(num(mk.color, 0)));
    mk.effect = MARKER_EFFECTS.includes(mk.effect) ? mk.effect : "note";
    for (const k of ["label", "text", "asset"]) mk[k] = String(mk[k] || "");
    out.markers.push(mk);
  });
  out.markers.sort((a, b) => a.frame - b.frame);
  for (const a of p.assets || []) {
    if (!a || typeof a !== "object" || !a.id || !a.file) continue;
    const cat = ASSET_CATEGORIES.includes(a.category) ? a.category : "other";
    const asset = { id: String(a.id), name: String(a.name || a.file), file: String(a.file), subfolder: String(a.subfolder || ""), type: String(a.type || "input"), category: cat };
    if (cat === "audio") asset.duration = Math.max(0, num(a.duration, 0));
    // content signature (sha256 + the size:mtime first seen for it): the cache key of a copied/re-saved file stays
    if (Array.isArray(a.kf) && a.kf.length === 2 && a.kf.every((x) => typeof x === "string")) asset.kf = [a.kf[0].slice(0, 300), a.kf[1].slice(0, 300)];
    if (a.fsig && typeof a.fsig === "object" && typeof a.fsig.sha === "string" && typeof a.fsig.sig === "string") {
      asset.fsig = { sha: a.fsig.sha.slice(0, 64), sig: a.fsig.sig.slice(0, 64) };
    }
    // asset editor: the original file and the ops of the processed derivative now in file/subfolder
    if (a.orig && typeof a.orig === "object" && a.orig.filename && a.edit && typeof a.edit === "object" && !Array.isArray(a.edit)) {
      asset.orig = { filename: String(a.orig.filename), subfolder: String(a.orig.subfolder || ""), type: String(a.orig.type || "input") };
      asset.edit = clone(a.edit);
    }
    if (cat === "video") {
      asset.duration = Math.max(0, num(a.duration, 0));
      for (const k of ["frames", "width", "height"]) asset[k] = Math.max(0, Math.trunc(num(a[k], 0)));
      asset.has_audio = !!a.has_audio;
      asset.poster = a.poster && typeof a.poster === "object" && a.poster.filename ? clone(a.poster) : null;
      asset.strip = a.strip && typeof a.strip === "object" && a.strip.filename ? clone(a.strip) : null;
      asset.strip_n = asset.strip ? Math.max(0, Math.trunc(Number(a.strip_n)) || 0) : 0;
      asset.frozen = String(a.frozen || "");
    }
    out.assets.push(asset);
  }
  out.audio = normalizeAudio(p, out.assets);
  const videoIds = new Set(out.assets.filter((a) => a.category === "video").map((a) => a.id));
  (p.segments || []).forEach((s, i) => {
    if (!s || typeof s !== "object") return;
    const seg = merge(DEFAULT_SEGMENT, s);
    seg.id = String(seg.id || `s${i + 1}`);
    seg.frames = snapFrames(seg.frames || 124);
    seg.link = seg.link === "cut" ? "cut" : "extend";
    seg.gap = Math.max(0, Math.min(MAX_GAP, Math.round(Number(seg.gap) || 0)));
    { const o = seg.overlap_blocks == null ? NaN : Math.trunc(Number(seg.overlap_blocks)); seg.overlap_blocks = Number.isFinite(o) ? Math.max(-1, Math.min(MAX_OVERLAP_BLOCKS, o)) : -1; }
    seg.color = Math.max(0, Math.trunc(Number(seg.color)) || 0);
    seg.refs = (seg.refs || []).map(String);
    seg.cards = normalizeCardRefs(seg.cards);
    const ov = {};
    for (const [k, v] of Object.entries(seg.overrides || {})) if (OVERRIDE_KEYS.includes(k) && v !== null && v !== "" && v !== undefined) ov[k] = v;
    seg.overrides = ov;
    seg.takes = (Array.isArray(seg.takes) ? seg.takes : []).filter((t) => t && typeof t === "object" && t.key).slice(-MAX_TAKES);
    if (seg.active_take !== null && seg.active_take !== undefined) seg.active_take = String(seg.active_take);
    seg.freeze = normalizeFreeze(seg.freeze);
    seg.source = normalizeSource(seg.source, videoIds);
    seg.upscale = normalizeUpscale(seg.upscale);
    seg.approved = !!seg.approved;
    seg.model_preset = presetId(seg.model_preset);
    if (seg.freeze) seg.frames = seg.freeze.frames;
    out.segments.push(seg);
  });
  { // legacy upscale multipliers -> megapixel targets with the same canvas (keys unchanged: upscaleKeyForm)
    const [rw, rh] = resolution(out.settings);
    for (const [m, pr] of Object.entries(out.settings.upscale_profiles)) {
      const mu = migrateUpscale(profileUpscale(out.settings, m), rw, rh);
      delete pr.mp; delete pr.scale; for (const k of ["mp", "scale"]) if (k in mu) pr[k] = mu[k];
    }
    out.settings.seg_upscale = profileUpscale(out.settings, out.settings.seg_upscale.method);
    for (const seg of out.segments) seg.upscale = migrateUpscale(seg.upscale, rw, rh);
  }
  return out;
}

function normalizeSource(src, videoIds) {
  if (!src || typeof src !== "object" || !videoIds.has(String(src.asset || ""))) return null;
  return { asset: String(src.asset), in: Math.max(0, Math.trunc(num(src.in, 0))), denoise: Math.min(1, Math.max(0, num(src.denoise, 0))) };
}

/** Footage used as is (no sampling). */
export const isFootage = (seg) => !!seg.source && !seg.source.denoise;

/** Video references of a segment (<Video k> order = chip order). */
export function videoRefs(project, seg) {
  const byId = Object.fromEntries(project.assets.filter((a) => a.category === "video").map((a) => [a.id, a]));
  const out = [], seen = new Set();
  for (const r of seg.refs || []) if (byId[r] && !seen.has(r)) { seen.add(r); out.push(byId[r]); }
  return out;
}

export function passParams(project, index, kind = null) {
  const s = project.settings; kind = kind || runKind(s);
  const p = effectiveParams(project, index);
  p.steps = passSteps(s, p.steps, kind);
  if (kind === "draft" || kind === "refine") {   // stage parameters (empty = the main ones)
    if (s[kind + "_sampler"]) p.sampler = s[kind + "_sampler"];
    if (s[kind + "_scheduler"]) p.scheduler = s[kind + "_scheduler"];
    if (Number(s[kind + "_cfg"] || 0) > 0) p.cfg = Number(s[kind + "_cfg"]);
  }
  if (kind === "refine") { p.denoise = 1.0; p.sigma0 = Number(s.refine_sigma || 0.4); }
  return p;
}
export function segSteps(project, index) {
  if (isFootage(project.segments[index])) return 0;
  const s = project.settings, kind = runKind(s), n = effectiveParams(project, index).steps;
  return kind === "refine" ? passSteps(s, n, "draft") + passSteps(s, n, "refine") : passSteps(s, n, kind);
}

function normalizeFreeze(f) {
  if (!f || typeof f !== "object" || !f.key) return null;
  return { ...f, key: String(f.key), sig: String(f.sig || ""), frames: snapFrames(f.frames || 124) };
}

export function segParam(project, seg, index, key) {
  const ov = seg.overrides || {};
  if (key in ov) return ov[key];
  if (key === "seed") return (Number(project.settings.seed) || 0) + index;
  return project.settings[key];
}

export function effectiveParams(project, index) {
  const seg = project.segments[index];
  const p = {};
  for (const k of ["seed", "steps", "cfg", "denoise", "sampler", "scheduler", "shift_video", "shift_audio"]) p[k] = segParam(project, seg, index, k);
  p.seed = Math.trunc(Number(p.seed)); p.steps = Math.trunc(Number(p.steps));
  for (const k of ["cfg", "denoise", "shift_video", "shift_audio"]) p[k] = Number(p[k]);
  return p;
}

function normalizeAudio(p, assets) {
  const pa = p.audio && typeof p.audio === "object" && !Array.isArray(p.audio) ? p.audio : {};
  const au = { clips: [], video_volume: Math.min(2, Math.max(0, num(pa.video_volume, 1))), input_ref: pa.input_ref && typeof pa.input_ref === "object" && pa.input_ref.filename ? clone(pa.input_ref) : null };
  let src = pa.clips;
  if (!Array.isArray(src)) {
    // projects before the audio track redesign: one source (input or an uploaded file) and a mode
    const f = pa.file;
    let assetId = AUDIO_INPUT_ID;
    if (pa.source === "file" && f && typeof f === "object" && f.filename) {
      assetId = ("au_" + String(f.filename).replace(/[^A-Za-z0-9]/g, "_")).slice(0, 51);
      if (!assets.some((a) => a.id === assetId))
        assets.push({ id: assetId, name: String(f.name || f.filename), file: String(f.filename), subfolder: String(f.subfolder || ""), type: String(f.type || "input"), category: "audio", duration: Math.max(0, num(pa.duration, 0)) });
    }
    src = pa.mode === "locked" ? [{ id: "a1", asset: assetId, start: pa.start, length: pa.length, in: "in" in pa ? pa.in : pa.offset }] : [];
  }
  const ids = new Set([...assets.filter((a) => a.category === "audio").map((a) => a.id), AUDIO_INPUT_ID]);
  src.forEach((c, i) => {
    if (!c || typeof c !== "object" || Array.isArray(c)) return;
    const o = {}; for (const k of Object.keys(DEFAULT_AUDIO_CLIP)) if (k in c) o[k] = c[k];
    const cl = merge(DEFAULT_AUDIO_CLIP, o);
    cl.id = String(cl.id || `a${i + 1}`);
    cl.asset = String(cl.asset || AUDIO_INPUT_ID);
    if (!ids.has(cl.asset)) return;
    const ln = num(cl.lane, 0);
    cl.lane = ln >= MUSIC_LANE ? MUSIC_LANE : ln >= 1 ? 1 : 0;
    for (const k of ["start", "in", "length", "fade_in", "fade_out"]) cl[k] = Math.max(0, num(cl[k], 0));
    cl.volume = Math.min(2, Math.max(0, num(cl.volume, 1)));
    au.clips.push(cl);
  });
  au.clips.sort((a, b) => a.start - b.start || a.lane - b.lane);
  return au;
}

/** Audio references of a segment (<Audio j> order = chip order): audio assets and/or the node input. */
export function audioRefs(project, seg) {
  const byId = Object.fromEntries(project.assets.filter((a) => a.category === "audio").map((a) => [a.id, a]));
  const out = [], seen = new Set();
  for (const r of seg.refs || []) {
    if (seen.has(r)) continue;
    if (byId[r]) out.push(byId[r]);
    else if (r === AUDIO_INPUT_ID) out.push({ id: AUDIO_INPUT_ID, name: T("Вход audio ноды"), category: "audio" });
    else continue;
    seen.add(r);
  }
  return out;
}

export function orderedRefs(project, seg) {
  const byId = Object.fromEntries(project.assets.filter((a) => CATEGORY_ORDER.includes(a.category)).map((a) => [a.id, a]));
  const seen = new Set(), uniq = [];
  for (const r of seg.refs || []) { const a = byId[r]; if (a && !seen.has(a.id)) { seen.add(a.id); uniq.push(a); } }
  // stable sort by category (Array.prototype.sort is stable)
  return uniq.slice().sort((x, y) => CATEGORY_ORDER.indexOf(x.category) - CATEGORY_ORDER.indexOf(y.category));
}

export const usesContinuity = (project, index) => index > 0 && project.segments[index].link === "extend" && !isFootage(project.segments[index]) && !project.segments[index].gap;

export function continuityPicture(project, index) {
  if (!usesContinuity(project, index) || project.settings.continuity_ref === false) return 0;
  return orderedRefs(project, project.segments[index]).length + 1;
}

export function fmtSec10(frames) {
  const f = Math.max(0, Math.trunc(frames)), t10 = Math.floor((f * 20 + FPS) / (2 * FPS));
  return `${Math.floor(t10 / 10)}.${t10 % 10}`;
}

export function markerSegment(items, frame) {
  for (const it of items) if (frame < it.end) return it.index;
  return -1;
}

export function segmentMarkers(project, index, items = null) {
  items = items || plan(project);
  return (project.markers || []).filter((m) => markerSegment(items, m.frame) === index);
}

/** Clips on the lock lanes (main composition) / on the music lane (overlay at export/playback only). */
export const lockClips = (project) => (project.audio.clips || []).filter((c) => (c.lane | 0) < MUSIC_LANE);
export const musicClips = (project) => (project.audio.clips || []).filter((c) => (c.lane | 0) >= MUSIC_LANE);
/** (volume, fade_in, fade_out) of a clip, null when neutral. */
export function clipGain(c) {
  const g = [Number(c.volume ?? 1), Number(c.fade_in || 0), Number(c.fade_out || 0)];
  return g[0] === 1 && !g[1] && !g[2] ? null : g.map((x) => +x.toFixed(4));
}

export function audioWindows(project) {
  return lockClips(project).map((c) => { const ln = Number(c.length || 0); return [c.asset, Number(c.start || 0), Number(c.in || 0), ln > 0 ? ln : null]; });
}

/** Track clips overlapping a segment, relative to its start. */
export function segmentTrack(project, it) {
  const t0 = it.start / FPS, t1 = it.end / FPS, lc = lockClips(project);
  return audioWindows(project).map((w, k) => [w, lc[k]]).filter(([[, st, , ln]]) => st < t1 && (ln === null || st + ln > t0))
    .map(([[a, st, tin, ln], c]) => { const e = [a, +(st - t0).toFixed(4), +tin.toFixed(4), ln === null ? null : +ln.toFixed(4)]; const g = clipGain(c); return g ? [...e, g] : e; });
}

export const contentEnd = (items) => (items.length ? items[items.length - 1].end : 0);

/** Frame where the video ends: the end marker if set, else the end of the last clip. */
export function videoEnd(project, items = null) {
  items = items || plan(project);
  const e = Math.trunc(Number(project.end || 0));
  return e > 0 ? e : contentEnd(items);
}

/** Project as generated with the video end marker (see h3s_core.limited_project). */
export function limitedProject(project) {
  const e = Math.trunc(Number(project.end || 0)), items = plan(project);
  if (e <= 0 || e >= contentEnd(items)) return project;
  const out = clone(project), keep = [];
  for (const it of items) {
    const i = it.index, ov = i ? it.overlap : 0;
    if (it.start + ov >= e) break;
    const seg = out.segments[i];
    if (it.end > e && !seg.freeze) seg.frames = Math.min(seg.frames, snapFrames(e - it.start, "up"));
    keep.push(seg);
  }
  out.segments = keep;
  return out;
}

export function audioLockOverlap(project) { return !!(project.settings.audio_seam_lock ?? true); }

export function runItems(project, items = null) {
  items = items || plan(project);
  const u = Math.trunc(Number(project.run?.upto ?? -1));
  return u < 0 || u >= items.length - 1 ? items : items.slice(0, u + 1);
}

export function composePrompt(project, index) {
  const s = project.settings, seg = project.segments[index];
  const parts = [s.prompt || "", seg.prompt || ""].map((t) => t.trim()).filter(Boolean);
  const items = plan(project), it = items[index];
  const refs = orderedRefs(project, seg), pics = {};
  refs.forEach((a, n) => { pics[a.id] = n + 1; });
  const boost = [];
  for (const m of segmentMarkers(project, index, items)) {
    if (m.effect === "prompt" && m.text.trim()) parts.push(MARKER_PROMPT.split("{t}").join(fmtSec10(m.frame - it.start)).split("{text}").join(m.text.trim()));
    else if (m.effect === "boost") {
      const ids = m.asset ? [m.asset] : refs.filter((a) => a.category === "character").map((a) => a.id);
      for (const id of ids) if (id in pics && !boost.includes(pics[id])) boost.push(pics[id]);
    }
  }
  if (boost.length) parts.push(BOOST_PHRASE.split("{pics}").join(boost.sort((a, b) => a - b).map((n) => `<Picture ${n}>`).join(", ")));
  let text = parts.join("\n");
  const n = continuityPicture(project, index);
  if (n) {
    const phrase = (s.continuity_phrase || "").trim() || "<Picture {n}>";
    text = (text ? text + "\n" : "") + phrase.split("{n}").join(String(n));
  }
  const nv = Math.min(MAX_REF_VIDEOS, videoRefs(project, seg).length);
  if (nv && !text.includes("<Video")) text = (text ? text + "\n" : "") + VIDEO_REF_PHRASE.split("{tags}").join(Array.from({ length: nv }, (_, k) => `<Video ${k + 1}>`).join(", "));
  const na = Math.min(MAX_REF_AUDIOS, audioRefs(project, seg).length);
  if (na && !text.includes("<Audio")) text = (text ? text + "\n" : "") + AUDIO_REF_PHRASE.split("{tags}").join(Array.from({ length: na }, (_, j) => `<Audio ${j + 1}>`).join(", "));
  const cl = cardPhrases(cardLabels(project, seg, index), text);
  if (cl.length) text = (text ? text + "\n" : "") + cl.join("\n");
  return text;
}

// ---------------------------------------------------------------- «Персонажи» (mirror of h3s_core card_*)
export const MAX_CARDS = 8, CARD_W_MAX = 4;
export const CARD_CONCEPTS = ["identity", "background", "clothing", "style", "pose_motion", "voice", "generic"];
export const CARD_CONCEPT_NAMES = { identity: T("Персонаж"), background: T("Локация"), clothing: T("Одежда"), style: T("Стиль"), pose_motion: T("Движение"), voice: T("Голос"), generic: T("Другое") };
const CARD_LOOK_PHRASE = {
  identity: "{label} shows {who}; keep this identity and appearance.",
  background: "The location looks like {label}.",
  clothing: "The outfit is the one in {label}.",
  style: "The visual style follows {label}; its content is not copied.",
  pose_motion: "The motion follows {label}; its content is not copied.",
  generic: "Use {label} as a reference.",
  voice: "Use {label} as a reference.",
};
const CARD_VOICE_PHRASE = "{label} is {whose} voice timbre reference.";
const CARD_SNAP_KEYS = ["name", "sig", "concept", "vkind", "audio", "tokens", "subject_name", "appearance", "retained_attributes", "voice_description"];
export function normalizeCardRefs(v) {
  const out = [], seen = new Set();
  for (let e of Array.isArray(v) ? v : []) {
    if (typeof e === "string") e = { id: e };
    if (!e || typeof e !== "object" || !String(e.id || "") || seen.has(String(e.id))) continue;
    let w = Number(e.w ?? 1); if (!isFinite(w)) w = 1;
    seen.add(String(e.id));
    out.push({ id: String(e.id).slice(0, 200), w: Math.round(Math.max(0, Math.min(CARD_W_MAX, w)) * 100) / 100, on: e.on !== false, look: e.look !== false, voice: e.voice !== false });
  }
  return out.slice(0, MAX_CARDS);
}
export function normalizeCardSnaps(v) {
  const out = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [k, c] of Object.entries(v)) {
    if (!c || typeof c !== "object") continue;
    const q = {}; for (const x of CARD_SNAP_KEYS) if (c[x] != null && c[x] !== "") q[x] = c[x];
    q.concept = CARD_CONCEPTS.includes(q.concept) ? q.concept : "generic";
    q.vkind = ["image", "video"].includes(q.vkind) ? q.vkind : null;
    q.audio = !!q.audio;
    out[String(k).slice(0, 200)] = q;
  }
  return out;
}
/** Library card (GET /h3zero/chars) -> project snapshot (mirror of h3s_core.card_snap). */
export function cardSnap(card) {
  return normalizeCardSnaps({ x: { name: card.name, sig: card.sig, concept: card.concept, vkind: card.visual?.kind, audio: !!card.audio,
    tokens: (card.visual?.tokens || 0) + (card.audio?.tokens || 0), subject_name: card.subject_name, appearance: card.appearance,
    retained_attributes: card.retained_attributes, voice_description: card.voice_description } }).x;
}
export function cardCopies(w) {
  w = Number(w);
  if (!(w > 0)) return [0, 0];
  if (w < 1) return [1, Math.round(w * 1000) / 1000];
  return [Math.max(1, Math.min(8, Math.round(w))), 1];
}
/** Labels of the applied cards of a clip (index) / region, after the plain refs and the continuity picture. */
export function cardLabels(project, holder, index = null, video = true, region = false) {
  const snaps = project.cards || {};
  let ni, nv, na;
  if (region) { ni = orderedRefs(project, { refs: holder.refs || [] }).length; nv = 0; na = 0; }
  else {
    ni = orderedRefs(project, holder).length + (index != null && continuityPicture(project, index) ? 1 : 0);
    nv = video ? Math.min(MAX_REF_VIDEOS, videoRefs(project, holder).length) : 0;
    na = Math.min(MAX_REF_AUDIOS, audioRefs(project, holder).length);
  }
  const out = [], rng = (a, n) => Array.from({ length: n }, (_, k) => a + k + 1);
  for (const e of holder.cards || []) {
    const sn = snaps[e.id]; if (!sn || e.on === false) continue;
    const [copies] = cardCopies(e.w ?? 1); if (!copies) continue;
    const r = { id: e.id, snap: sn, image: [], video: [], audio: [] };
    const vk = sn.vkind;
    if (vk && e.look !== false && (video || vk === "image")) {
      if (vk === "image") { r.image = rng(ni, copies); ni += copies; } else { r.video = rng(nv, copies); nv += copies; }
    }
    if (sn.audio && e.voice !== false && !region) { r.audio = rng(na, copies); na += copies; }
    if (r.image.length || r.video.length || r.audio.length) out.push(r);
  }
  return out;
}
export function cardPhrases(labels, text) {
  const lines = [];
  for (const r of labels) {
    const sn = r.snap, name = (sn.subject_name || "").trim();
    const tags = [...r.image.slice(0, 1).map((n) => `<Picture ${n}>`), ...r.video.slice(0, 1).map((n) => `<Video ${n}>`)];
    const all = [...r.image.map((n) => `<Picture ${n}>`), ...r.video.map((n) => `<Video ${n}>`)];
    if (tags.length && !all.some((t) => text.includes(t))) {
      const who = name || (sn.concept === "identity" ? "the person" : "the subject");
      lines.push((CARD_LOOK_PHRASE[sn.concept] || CARD_LOOK_PHRASE.generic).split("{label}").join(tags[0]).split("{who}").join(who));
    }
    if (r.audio.length && !r.audio.some((n) => text.includes(`<Audio ${n}>`))) {
      const whose = name ? `${name}'s` : tags.length && sn.concept === "identity" ? "the person's" : "the";
      lines.push(CARD_VOICE_PHRASE.split("{label}").join(`<Audio ${r.audio[0]}>`).split("{whose}").join(whose).split("the the").join("the"));
    }
  }
  return lines;
}
// card creation preview (mirror of h3s_chars snap_clip_frames / canvas_for / aspect_grid / estimate)
const bankRound = (x) => { const f = Math.floor(x), d = x - f; return d > 0.5 + 1e-9 ? f + 1 : d < 0.5 - 1e-9 ? f : (f % 2 === 0 ? f : f + 1); };
export const CARD_AUDIO_TOKENS_PER_SEC = 80;
export function snapClipFrames(n) { n = Math.trunc(Number(n) || 0); if (n <= 1) return 1; if (n < 5) return n; return n - ((n - 5) % 17); }
export function cardCanvas(w, h, res) {
  const scale = Math.min(1, res / Math.max(1, Math.min(w, h)));
  let tw = Math.max(32, bankRound(w * scale / 32) * 32), th = Math.max(32, bankRound(h * scale / 32) * 32);
  if (Math.min(tw, th) < 320) { const k = 320 / Math.min(tw, th); tw = Math.max(320, bankRound(tw * k / 32) * 32); th = Math.max(320, bankRound(th * k / 32) * 32); }
  return [tw, th];
}
export function cardAspectGrid(grid, aspect) {
  const le = Math.trunc(grid); const [hh, ww] = aspect >= 1 ? [le, le / aspect] : [le * aspect, le];
  return [Math.max(2, bankRound(hh / 2) * 2), Math.max(2, bankRound(ww / 2) * 2)];
}
/** spec {res, mode, grid, photos, clip: {frames}}; sizes [[w, h]] of the photos + clip in source order (first one cropped). */
export function cardEstimate(spec, sizes) {
  const res = Math.trunc(Number(spec.res) || 768), srcs = sizes || [];
  if (!srcs.length) return { visual_tokens: 0 };
  const [cw, ch] = cardCanvas(srcs[0][0], srcs[0][1], res);
  const [gh, gw] = spec.mode === "compressed" ? cardAspectGrid(Math.trunc(Number(spec.grid) || 16), ch / cw) : [Math.floor(ch / 16), Math.floor(cw / 16)];
  let t = (spec.photos || []).length;
  if (spec.clip) { const n = snapClipFrames(Math.trunc(Number(spec.clip.frames) || 22)); t += n === 1 ? 1 : n >= 5 ? 2 + 5 * Math.floor((n - 5) / 17) : 1; }
  return { visual_tokens: t * Math.floor(gh / 2) * Math.floor(gw / 2), canvas: [cw, ch], latent: [t, gh, gw] };
}
/** What the applied cards add to a signature ([] when none). */
export function cardKey(project, holder) {
  const snaps = project.cards || {}, out = [];
  for (const e of holder.cards || []) {
    const sn = snaps[e.id]; if (!sn || e.on === false || !cardCopies(e.w ?? 1)[0]) continue;
    out.push([...cardCopies(e.w), sn.sig || "", e.look !== false, e.voice !== false]);   // no id: a rename keeps clips ready
  }
  return out;
}

export function plan(project) {
  const items = [];
  let cursor = 0;
  project.segments.forEach((seg, i) => {
    const f = seg.frames;
    let ov = 0;
    if (usesContinuity(project, i)) {
      const prev = project.segments[i - 1].frames;
      let o = wantedOverlap(project, i);
      while (o > 0 && !(overlapFrames(o) < f && overlapFrames(o) < prev)) o--;   // shrink to the largest that fits
      ov = o > 0 ? overlapFrames(o) : 0;
    }
    const gap = seg.gap || 0, start = cursor - ov + gap;
    items.push({ index: i, id: seg.id, frames: f, start, end: start + f, overlap: ov, overlap_blocks: ov ? (ov - 5) / 17 : 0, gap,
      latent_t: latentT(f), audio_t: audioLen(f), link: i ? (gap ? "cut" : seg.link) : "start" });
    cursor = start + f;
  });
  return items;
}

export function estimate(project) {
  const fullN = project.segments.length;
  project = limitedProject(project);
  const items = plan(project);
  const [w, h] = workResolution(project.settings);
  let total = items.length ? items[items.length - 1].end : 0;
  if (Math.trunc(Number(project.end || 0)) > 0) total = Math.min(total, Math.trunc(Number(project.end)));
  const warnings = [];
  if (items.length < fullN) warnings.push(T("{0} отр. за маркером конца ролика — не генерируются", fullN - items.length));
  const gap = Math.trunc(Number(project.end || 0)) - contentEnd(items);
  if (items.length && gap > 0) warnings.push(T("пусто {0} с между последним отрезком и маркером конца — ролик будет короче: заполните пустоту отрезком («Продлить») или растяните последний", fmtSec10(gap)));
  for (const it of items) {
    const seg = project.segments[it.index];
    const name = seg.name || `#${it.index + 1}`;
    if (it.frames < TRAINED_MIN_FRAMES || it.frames > TRAINED_MAX_FRAMES)
      warnings.push(T("{0}: {1} кадров ({2} с) — вне обучающего диапазона H3 {3}–{4} кадров", name, it.frames, (it.frames / FPS).toFixed(1), TRAINED_MIN_FRAMES, TRAINED_MAX_FRAMES));
    const cp = continuityPicture(project, it.index);
    const nRefs = orderedRefs(project, seg).length + (cp ? 1 : 0);
    if (nRefs > MAX_REF_IMAGES) warnings.push(T("{0}: {1} референсов, максимум {2}", name, nRefs, MAX_REF_IMAGES) + (cp ? T(" (вместе с последним кадром прошлого отрезка)") : ""));
    const na = audioRefs(project, seg).length;
    if (na > MAX_REF_AUDIOS) warnings.push(T("{0}: {1} аудио-референса, максимум {2}", name, na, MAX_REF_AUDIOS));
    const nv = videoRefs(project, seg).length;
    if (nv > MAX_REF_VIDEOS) warnings.push(T("{0}: {1} видео-референса, максимум {2}", name, nv, MAX_REF_VIDEOS));
    if (isFootage(seg)) continue;
    if (it.link === "extend" && it.index > 0 && it.overlap === 0 && wantedOverlap(project, it.index) > 0)
      warnings.push(T("{0}: перекрытие не помещается в отрезок — продление только по последнему кадру", name));
    if (!(project.settings.prompt || "").trim() && !(seg.prompt || "").trim()) warnings.push(T("{0}: пустой промпт", name));
    const ids = new Set(orderedRefs(project, seg).map((a) => a.id));
    for (const m of segmentMarkers(project, it.index, items))
      if (m.effect === "boost" && m.asset && !ids.has(m.asset)) warnings.push(T("{0}: маркер «{1}» усиливает персонажа, которого нет в референсах отрезка", name, m.label || m.id));
  }
  for (const m of project.markers || [])
    if (m.effect !== "note" && markerSegment(items, m.frame) < 0) warnings.push(T("маркер «{0}» за концом ролика — не действует", m.label || m.id));
  if (w * h > 1344 * 768 * 1.05) warnings.push(T("{0}×{1} больше официальных 1344×768 — дольше и больше VRAM", w, h));
  let steps = items.reduce((acc, it) => acc + segSteps(project, it.index), 0);
  const ups = items.map((it) => it.index).filter((i) => upscalable(project.segments[i]));
  const fr = Object.fromEntries(items.map((it) => [it.index, it.frames]));
  const um = (i) => project.segments[i].upscale.method;
  steps += ups.reduce((acc, i) => acc + upscalePassParams(project, i, um(i)).steps * upscaleChunking(project.settings, fr[i], um(i))[0], 0);
  if (ups.length) {
    const [uw, uh] = ups.map((i) => upscaleCanvas(w, h, project.segments[i].upscale)).reduce((a, b) => (b[0] * b[1] > a[0] * a[1] ? b : a));
    const nch = Math.max(...ups.map((i) => upscaleChunking(project.settings, fr[i], um(i))[0]));
    warnings.push(T("апскейл отрезков: {0} → до {1}×{2}", ups.length, uw, uh) + (nch > 1 ? T(" · до {0} фрагм. по времени", nch) : ""));
  }
  return { segments: items.length, frames: total, seconds: Math.round(total / FPS * 1000) / 1000, width: w, height: h, steps_total: steps, warnings, kind: runKind(project.settings) };
}

// ---- UI-side change signatures (not the backend cache key: that one also hashes model + files)
function fnv(str) {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/** UI change signatures of the generated (end-limited) segments; shorter than segments when clips lie past the end. */
export function segmentSigs(project, kind = null) {
  project = limitedProject(project);
  kind = kind || runKind(project.settings);
  return upscaleSigs(project, baseSigs(project, kind), kind);
}

/** Signatures of the segment upscales over the base sigs (mirror of h3s_core.upscale_keys); null = no upscale. */
export function upscaleSigList(project, base, kind) {
  const [w, h] = workResolution(project.settings, kind);
  const out = []; let prev = null;
  plan(project).forEach((it, j) => {
    const seg = project.segments[it.index], up = seg.upscale;
    if (!upscalable(seg)) { out.push(null); prev = null; return; }
    const cont = it.link === "extend" && it.index > 0 && it.overlap;
    const wh = upscaleCanvas(w, h, up), whs = wh.join("x");
    const chain = prev && cont && prev[1] === whs ? prev[0] : "";
    const [nch, cf, co] = upscaleChunking(project.settings, it.frames, up.method);
    const pr = upscaleProfile(project.settings, up.method), smp = [pr.sampler || "", pr.scheduler || ""];
    const sig = fnv(JSON.stringify(["up", base[j], upscaleKeyForm(up, w, h), wh, upscalePassParams(project, it.index, up.method).steps, chain].concat(refineExtra(project.settings), nch > 1 ? [["ch", cf, co]] : [], smp.some(Boolean) ? [["smp", ...smp]] : [])));
    out.push(sig); prev = [sig, whs];
  });
  return out;
}
/** «Апскейл участка»: signature of a span's upscale ("" = none; mirror of h3s_core.region_upscale_key's inputs). */
export function regionUpSig(project, region, items = null) {
  const up = region?.upscale; if (!up) return "";
  const [w, h] = workResolution(project.settings), win = regionWindow(project, region, items || plan(project));
  const [, cf, co] = upscaleChunking(project.settings, 17, up.method), pr = upscaleProfile(project.settings, up.method);
  const smp = [pr.sampler || "", pr.scheduler || ""];
  return fnv(JSON.stringify(["rup", upscaleKeyForm(up, w, h), upscaleCanvas(w, h, up), upscalePassParams(project, Math.max(0, win.seg ?? 0), up.method).steps, cf, co].concat(refineExtra(project.settings), smp.some(Boolean) ? [["smp", ...smp]] : [])));
}
function upscaleSigs(project, base, kind) {
  const up = upscaleSigList(project, base, kind);
  return base.map((b, j) => up[j] || b);
}

/** Pass sigs without the segment upscales (the generation chain). */
export function baseSigs(project, kind = null) {
  project = limitedProject(project);
  kind = kind || runKind(project.settings);
  if (kind === "refine") return refineSigs(project, baseSigs(project, "draft"), baseSigs(project, "full"));
  const items = plan(project), [w, h] = workResolution(project.settings, kind), s = project.settings;
  const out = []; let prev = "";
  for (const it of items) {
    const i = it.index, seg = project.segments[i];
    const src = seg.source, srcA = src ? project.assets.find((a) => a.id === src.asset) || {} : null;
    const sd = src ? [srcA.id, ...assetKf(srcA), src.in, src.denoise] : null;
    const vr = isFootage(seg) ? [] : videoRefs(project, seg).slice(0, MAX_REF_VIDEOS).map((a) => [a.id, ...assetKf(a)]);
    const sig = isFootage(seg) ? fnv(JSON.stringify(["footage", w, h, it.frames, sd])) : fnv(JSON.stringify([w, h, it.frames, it.overlap, composePrompt(project, i), s.negative || "",
      orderedRefs(project, seg).map((a) => [a.id, ...assetKf(a)]), passParams(project, i, kind), !!s.lock_overlap,
      continuityPicture(project, i), s.ref_size, segmentTrack(project, it), audioRefs(project, seg).map((a) => [a.id, assetKf(a)[0] || ""]).slice(0, MAX_REF_AUDIOS),
      it.link === "extend" && i > 0 ? prev : "", it.link === "extend" && i > 0 && it.overlap ? [audioLockOverlap(project), audioLockOverlap(project) ? 4 : 3, Math.round(Math.min(Number(s.audio_context_sec || 0), AUDIO_CONTEXT_MAX) * 100) / 100] : segmentTrack(project, it).length ? [false, 3] : 0].concat(sd ? [["src", sd]] : [], vr.length ? [["vrefs", vr]] : [], cardKey(project, seg).length ? [["cards", cardKey(project, seg)]] : [], presetFingerprint(segmentPreset(project, i)) ? [["mp", presetFingerprint(segmentPreset(project, i))]] : [])));
    const fsig = seg.freeze ? (seg.freeze.sig || "F" + seg.freeze.key) : sig;   // frozen: fixed, so what follows stays valid
    out.push(fsig); prev = fsig;
  }
  return out;
}

/** Final from the draft: draft sig + refine settings + previous final (footage as is / frozen: one-pass sig). */
function refineSigs(project, draft, full) {
  const s = project.settings, items = plan(project), rp = [s.refine_sigma, s.upscale_method, resolution(s)].concat(refineExtra(s));
  const out = []; let prev = "";
  items.forEach((it, j) => {
    const seg = project.segments[it.index];
    const sig = seg.freeze || isFootage(seg) ? full[j] : fnv(JSON.stringify(["refine", draft[j], rp, passParams(project, it.index, "refine").steps, it.link === "extend" && it.index > 0 ? prev : ""]));
    out.push(sig); prev = sig;
  });
  return out;
}

export function fmtTime(sec) {
  if (!isFinite(sec)) return "–";
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export function fmtDur(sec) {
  if (!isFinite(sec) || sec < 0) return "–";
  if (sec < 60) return T("{0} с", Math.round(sec));
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  if (m < 60) return T("{0} мин {1} с", m, s.toString().padStart(2, "0"));
  return T("{0} ч {1} мин", Math.floor(m / 60), m % 60);
}

export function newId(prefix = "") {
  return prefix + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);
}


// ---------------------------------------------------------------- «✂ Участок» (mirror of h3s_core)
export function normalizeRegion(r, i = 0) {
  const src = {}; for (const k of Object.keys(DEFAULT_REGION)) if (k in r) src[k] = r[k];
  const rg = merge(DEFAULT_REGION, src);
  rg.id = String(rg.id || `r${i + 1}`);
  rg.name = String(rg.name || "");
  rg.start = Math.max(0, Math.trunc(num(rg.start, 0)));
  rg.end = Math.max(0, Math.trunc(num(rg.end, 0)));
  if (rg.end <= rg.start) return null;
  for (const k of ["head", "tail"]) { const v = rg[k] == null ? NaN : Math.trunc(Number(rg[k])); rg[k] = Number.isFinite(v) ? Math.max(-1, Math.min(MAX_OVERLAP_BLOCKS, v)) : -1; }
  rg.prompt = String(rg.prompt || "");
  rg.refs = (Array.isArray(rg.refs) ? rg.refs : []).map(String);
  rg.cards = normalizeCardRefs(rg.cards);
  rg.seed = Math.max(0, Math.trunc(num(rg.seed, 0)));
  rg.takes = (Array.isArray(rg.takes) ? rg.takes : []).filter((t) => t && typeof t === "object" && !Array.isArray(t) && t.key).slice(-MAX_TAKES);
  rg.active_take = rg.active_take === null || rg.active_take === undefined ? null : String(rg.active_take);
  rg.upscale = normalizeUpscale(rg.upscale);
  return rg;
}

export function sceneChains(items) {
  const out = [];
  for (const it of items) {
    if (!out.length || !(it.index && it.overlap)) out.push([it.start, it.end, it.index, it.index]);
    else { out[out.length - 1][1] = it.end; out[out.length - 1][3] = it.index; }
  }
  return out;
}

export function regionBlocks(project, region, key) {
  let v = Math.trunc(Number(region[key] ?? -1));
  if (!(v >= 0)) v = Math.trunc(Number(project.settings.overlap_blocks || 0));
  return Math.max(0, Math.min(MAX_OVERLAP_BLOCKS, v));
}

const pyRound = (x) => Math.floor(x + 0.5);

/** Sampling window of a region (see h3s_core.region_window). */
export function regionWindow(project, region, items = null) {
  items = items || plan(limitedProject(project));
  const out = { error: "", warnings: [] };
  const st = Math.trunc(region.start), en = Math.trunc(region.end);
  const ch = sceneChains(items).find((c) => c[0] <= st && st < c[1]);
  if (!ch || en > ch[1] + 8) return bridgeWindow(project, region, items);   // starts in a gap / crosses a join
  const [cs, ce, i0, i1] = ch;
  const K = Math.floor((ce - cs - 5) / 17);
  let a = cs + 17 * Math.min(K, Math.max(0, pyRound((st - cs) / 17)));
  let toEnd = en >= ce - 8, b;
  if (toEnd) { b = ce; a = Math.min(a, ce - 22); }
  else {
    b = cs + 17 * Math.min(K, Math.max(0, pyRound((en - cs) / 17)));
    if (b < a + 17) b = a + 17;
    if (b > cs + 17 * K) { b = ce; toEnd = true; a = Math.min(a, ce - 22); }
  }
  a = Math.max(cs, a);
  const oh = Math.min(regionBlocks(project, region, "head"), Math.floor((a - cs) / 17));
  const ws = a - 17 * oh;
  let ot, we;
  if (toEnd) { ot = 0; we = ce; }
  else { ot = Math.min(regionBlocks(project, region, "tail"), Math.floor((ce - 5 - b) / 17)); we = b + 17 * ot + 5; }
  const frames = we - ws;
  Object.assign(out, { chain: [cs, ce], i0, i1, ws, a, b, we, frames, head: a - ws, tail: we - b, head_blocks: oh, tail_blocks: ot, to_end: toEnd,
    lat0: Math.floor(5 * (ws - cs) / 17), latent_t: latentT(frames), seg: markerSegment(items, a),
    segs: items.filter((it) => it.start < we && it.end > ws).map((it) => it.index) });
  if (frames > MAX_FRAMES) out.error = T("окно {0} кадров длиннее максимума {1} — выделите участок короче", frames, MAX_FRAMES);
  if (a === cs) out.warnings.push(T("участок у начала сцены — без контекста до него"));
  if (toEnd) out.warnings.push(T("участок до конца сцены — без контекста после него"));
  if (frames < TRAINED_MIN_FRAMES || frames > TRAINED_MAX_FRAMES) out.warnings.push(T("окно {0} кадров ({1} с) вне обучающего диапазона H3 {2}–{3}", frames, (frames / FPS).toFixed(1), TRAINED_MIN_FRAMES, TRAINED_MAX_FRAMES));
  return out;
}

/** Mirror of h3s_core.span_kind: region (inside a shot) · bridge (across a cut / gap) · prologue · extension. */
export function spanKind(w) {
  if (!w || w.mode !== "bridge") return "region";
  if (!w.head) return "prologue";
  if (w.to_end && !w.tail_blocks) return "extension";
  return "bridge";
}
export const SPAN_NAMES = { region: T("Участок"), bridge: T("Мост"), prologue: T("Пролог"), extension: T("Продолжение") };
export const SPAN_HELP = {
  region: T("перегенерация внутри сцены: контекст до и после — из той же сцены"),
  bridge: T("через склейку / промежуток: хвост сцены до и начало следующей — контекст, середина генерируется"),
  prologue: T("контекста до нет, только последующий — генерация подводит к следующей сцене"),
  extension: T("контекста после нет, только предыдущий — генерация продолжает сцену"),
};

/** Mirror of h3s_core.level_lock_frames (0 = off). */
export function levelLockFrames(project) {
  const s = project.settings;
  if (s.level_lock === false) return 0;
  return Math.round(Math.min(48, Math.max(2, Number(s.level_lock_frames ?? 12) || 12)));
}

/** Mirror of h3s_core.bridge_window: a span over a cut / gap (head = end of the shot before, tail = start of the next). */
export function bridgeWindow(project, region, items = null) {
  items = items || plan(limitedProject(project));
  const out = { error: "", warnings: [], mode: "bridge" };
  const st = Math.trunc(region.start), en = Math.trunc(region.end), chains = sceneChains(items);
  if (!items.length || en <= st) { out.error = T("пустой участок"); return out; }
  const total = items[items.length - 1].end;
  const chA = chains.find((c) => c[0] <= st && st < c[1]) || null;
  let chB = chains.find((c) => c[0] <= en && en < c[1]) || null;
  if (chA && chB && chA === chB) chB = null;
  let a, oh;
  if (chA) { a = Math.min(chA[0] + 17 * Math.max(0, Math.floor((st - chA[0]) / 17)), chA[1]); oh = Math.min(regionBlocks(project, region, "head"), Math.floor((a - chA[0]) / 17)); }
  else { a = Math.max(0, st); oh = 0; }
  const ws = a - 17 * oh;
  const m = Math.max(1, Math.ceil((Math.min(en, total) - a) / 17)), b = a + 17 * m;
  let ot = 0;
  if (chB && b >= chB[0]) ot = Math.max(0, Math.min(regionBlocks(project, region, "tail"), Math.floor((chB[1] - 5 - b) / 17)));
  const toEnd = ot === 0, we = b + 17 * ot + 5;
  if (we > total) { out.error = T("участок выходит за конец таймлайна — добавьте промежуток или отрезок после него"); return out; }
  const frames = we - ws, segs = items.filter((it) => it.start < we && it.end > ws).map((it) => it.index);
  const ms = markerSegment(items, a);
  Object.assign(out, { chain: [ws, we], i0: segs[0] ?? 0, i1: segs[segs.length - 1] ?? 0, ws, a, b, we, frames, head: a - ws, tail: we - b,
    head_blocks: oh, tail_blocks: ot, to_end: toEnd, lat0: 0, latent_t: latentT(frames), seg: ms >= 0 ? ms : (segs[0] ?? 0), segs,
    gaps: items.filter((it) => it.gap && ws < it.start && it.start <= we).map((it) => [it.index, it.gap]) });
  if (!segs.length) out.error = T("под участком нет отрезков");
  else if (frames > MAX_FRAMES) out.error = T("окно {0} кадров длиннее максимума {1} — выделите участок короче", frames, MAX_FRAMES);
  if (oh === 0) out.warnings.push(T("без контекста до участка (пролог / заполнение)"));
  if (toEnd) out.warnings.push(T("без контекста после участка (продление)"));
  if (frames < TRAINED_MIN_FRAMES || frames > TRAINED_MAX_FRAMES) out.warnings.push(T("окно {0} кадров ({1} с) вне обучающего диапазона H3 {2}–{3}", frames, (frames / FPS).toFixed(1), TRAINED_MIN_FRAMES, TRAINED_MAX_FRAMES));
  return out;
}

export function regionPrompt(project, region) {
  const text = [project.settings.prompt || "", region.prompt || ""].map((t) => t.trim()).filter(Boolean).join("\n");
  const cl = cardPhrases(cardLabels(project, region, null, true, true), text);
  return (text && cl.length ? text + "\n" : text) + cl.join("\n");
}

/** Editor signature of a region take (staleness): the window, its source clips' sigs, prompt, refs, params. */
export function regionSig(project, region, kind = null) {
  project = limitedProject(project);
  kind = kind || runKind(project.settings);
  const win = regionWindow(project, region); if (win.error) return "";
  const br = win.mode === "bridge";
  if (br && kind === "refine") kind = "full";
  const sigs = baseSigs(project, kind === "full" && br ? runKind(project.settings) : kind), cs = win.chain[0];
  const p = passParams(project, Math.max(0, win.seg), kind); p.seed = region.seed | 0;
  return fnv(JSON.stringify(["region", kind, br ? [win.ws, win.a, win.b, win.we, win.gaps, levelLockFrames(project)] : 0, win.ws - cs, win.a - cs, win.b - cs, win.we - cs, win.to_end, win.segs.map((i) => sigs[i] || ""),
    regionPrompt(project, region), project.settings.negative || "", orderedRefs(project, { refs: region.refs || [] }).map((a) => [a.id, ...assetKf(a)]), p,
    Math.round(Math.min(Number(project.settings.audio_context_sec || 0), AUDIO_CONTEXT_MAX) * 100) / 100, lockClips(project)].concat(cardKey(project, region).length ? [["cards", cardKey(project, region)]] : [])));
}

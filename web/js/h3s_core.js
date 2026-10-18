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
  prompt: "", negative: "", aspect: "16:9", res_mode: "mp", megapixels: 0.5, width: 960, height: 544,
  steps: 20, cfg: 1.0, sampler: "res_multistep", scheduler: "simple", shift_video: 12.0, shift_audio: 3.0,
  seed: 0, fps: FPS, denoise: 1.0, overlap_blocks: 1, audio_context_sec: 1.0, lock_overlap: true, continuity_ref: true,
  continuity_phrase: DEFAULT_CONTINUITY, ref_size: "match", cache: true,
  audio_seam_lock: true, audio_xfade: true, audio_xfade_sec: 0.4, audio_match: true,
  preview_tiny_vae: "auto", preview_max_res: 512, preview_quality: 80, preview_frames: 48,
  preview_fps: 0, preview_suppress: true, preview_audio: true,
  verbose_log: true,
  // draft mode (see h3s_core.py): quality "final" | "draft"; final_mode "full" | "refine" (final from the draft)
  quality: "final", final_mode: "full", draft_scale: 0.5, draft_steps: 0, refine_sigma: 0.4, refine_steps: 0, upscale_method: "learned", upscale_rev: 3, seg_upscale: { method: "latent", scale: 2 },
  draft_sampler: "", draft_scheduler: "", draft_cfg: 0, refine_sampler: "", refine_scheduler: "", refine_cfg: 0, settings_scope: "project",
};
export const DRAFT_SCALES = [0.5, 0.67, 0.75];
export const REFINE_SIGMA_RANGE = [0.15, 0.8];
export const UPSCALE_METHODS = ["learned", "rtx"];   // nearest-exact / VAE-Lanczos removed
// «Апскейл отрезка» (see h3s_upscale.py)
export const SEG_UPSCALE_METHODS = ["latent", "rtx", "tiles"];
export const SEG_UPSCALE_SCALES = [1.5, 2.0];
export const SEG_UPSCALE_SIGMA = { latent: 0.4, rtx: 0.25, tiles: 0.35 };
export const SEG_UPSCALE_SIGMA_RANGE = [0.1, 0.7];
export const RTX_QUALITIES = ["LOW", "MEDIUM", "HIGH", "ULTRA"];
export const UPSCALE_LABELS = { latent: "Латент + доработка", rtx: "RTX VSR → доработка", tiles: "Плитки (SyncTile)" };
export function normalizeUpscale(u) {
  if (!u || typeof u !== "object" || !SEG_UPSCALE_METHODS.includes(u.method)) return null;
  const m = u.method, sc0 = num(u.scale, 2.0);
  const sc = SEG_UPSCALE_SCALES.reduce((a, b) => (Math.abs(b - sc0) < Math.abs(a - sc0) ? b : a));
  const sg = Math.round(Math.min(SEG_UPSCALE_SIGMA_RANGE[1], Math.max(SEG_UPSCALE_SIGMA_RANGE[0], num(u.sigma, SEG_UPSCALE_SIGMA[m]))) * 1000) / 1000;
  const out = { method: m, scale: sc, sigma: sg };
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
export const upscaleCanvas = (w, h, scale) => [snap32(w * scale), snap32(h * scale)];
/** The segment's upscale applies: set, not footage as is, not a take frozen after its upscale (freeze.up). */
export const upscalable = (seg) => !!seg.upscale && !isFootage(seg) && !(seg.freeze && seg.freeze.up);
export const STAGE_KEYS = ["draft_sampler", "draft_scheduler", "draft_cfg", "refine_sampler", "refine_scheduler", "refine_cfg"];
export const RUN_KINDS = ["draft", "refine", "full"];
/** «Настройки»: set-once settings shared by all projects (mirror of h3s_core.GLOBAL_KEYS). */
export const GLOBAL_KEYS = ["final_mode", "steps", "cfg", "denoise", "sampler", "scheduler", "shift_video", "shift_audio",
               "draft_scale", "draft_steps", "draft_sampler", "draft_scheduler", "draft_cfg",
               "refine_sigma", "refine_steps", "refine_sampler", "refine_scheduler", "refine_cfg",
               "upscale_method", "seg_upscale", "overlap_blocks", "audio_context_sec", "lock_overlap", "continuity_ref",
               "continuity_phrase", "ref_size", "cache", "audio_seam_lock", "audio_xfade", "audio_xfade_sec", "audio_match",
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
  id: "", name: "", color: 0, frames: 124, prompt: "", refs: [], link: "extend", overlap_blocks: -1, overrides: {},
  upscale: null, approved: false,
  takes: [], active_take: null, locked: false, freeze: null,
};
export const MAX_TAKES = 12;
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

export function normalizeProject(p) {
  if (typeof p === "string") { try { p = p.trim() ? JSON.parse(p) : {}; } catch (e) { p = {}; } }
  if (!p || typeof p !== "object" || Array.isArray(p)) p = {};
  const out = {
    version: SCHEMA_VERSION,
    id: String(p.id || "").replace(/[^A-Za-z0-9_-]/g, "") || "project",
    name: String(p.name || "H3 проект"),
    settings: merge(DEFAULT_SETTINGS, p.settings),
    assets: [],
    segments: [],
    audio: merge(DEFAULT_AUDIO, p.audio),
    markers: [],
    end: Math.max(0, Math.trunc(num(p.end, 0))),
    end_mode: p.end_mode === "auto" ? "auto" : "fixed",
    run: { upto: -1, only: -1, kind: "" },
    stats: p.stats && typeof p.stats === "object" && !Array.isArray(p.stats) ? clone(p.stats) : null,
    result: p.result && typeof p.result === "object" && !Array.isArray(p.result) ? clone(p.result) : null,
  };
  if (out.end_mode === "auto") out.end = 0;
  { const st = out.settings;
    st.quality = st.quality === "draft" ? "draft" : "final";
    st.final_mode = st.final_mode === "refine" ? "refine" : "full";
    const ds = num(st.draft_scale, 0.5); st.draft_scale = DRAFT_SCALES.reduce((b, x) => (Math.abs(x - ds) < Math.abs(b - ds) ? x : b), DRAFT_SCALES[0]);
    st.draft_steps = Math.max(0, Math.min(200, Math.trunc(num(st.draft_steps, 0))));
    st.refine_steps = Math.max(0, Math.min(200, Math.trunc(num(st.refine_steps, 0))));
    st.refine_sigma = Math.round(Math.max(REFINE_SIGMA_RANGE[0], Math.min(REFINE_SIGMA_RANGE[1], num(st.refine_sigma, 0.4))) * 100) / 100;
    st.upscale_method = UPSCALE_METHODS.includes(st.upscale_method) ? st.upscale_method : "learned";
    st.upscale_rev = 3;
    st.seg_upscale = normalizeUpscale(st.seg_upscale) || normalizeUpscale({ method: "latent", scale: 2 });
    for (const k of ["draft", "refine"]) {
      st[k + "_sampler"] = String(st[k + "_sampler"] || "").slice(0, 64);
      st[k + "_scheduler"] = String(st[k + "_scheduler"] || "").slice(0, 64);
      st[k + "_cfg"] = Math.round(Math.max(0, Math.min(30, num(st[k + "_cfg"], 0))) * 100) / 100;
    }
    st.settings_scope = st.settings_scope === "global" ? "global" : "project"; }   // older "vae" / "latent" (nearest-exact) → "learned"
  { const u = Math.trunc(num(p.run?.upto, -1)); out.run.upto = u; out.run.only = Math.trunc(num(p.run?.only, -1)); out.run.kind = RUN_KINDS.includes(p.run?.kind) ? p.run.kind : ""; }
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
    { const o = seg.overlap_blocks == null ? NaN : Math.trunc(Number(seg.overlap_blocks)); seg.overlap_blocks = Number.isFinite(o) ? Math.max(-1, Math.min(MAX_OVERLAP_BLOCKS, o)) : -1; }
    seg.color = Math.max(0, Math.trunc(Number(seg.color)) || 0);
    seg.refs = (seg.refs || []).map(String);
    const ov = {};
    for (const [k, v] of Object.entries(seg.overrides || {})) if (OVERRIDE_KEYS.includes(k) && v !== null && v !== "" && v !== undefined) ov[k] = v;
    seg.overrides = ov;
    seg.takes = (Array.isArray(seg.takes) ? seg.takes : []).filter((t) => t && typeof t === "object" && t.key).slice(-MAX_TAKES);
    if (seg.active_take !== null && seg.active_take !== undefined) seg.active_take = String(seg.active_take);
    seg.freeze = normalizeFreeze(seg.freeze);
    seg.source = normalizeSource(seg.source, videoIds);
    seg.upscale = normalizeUpscale(seg.upscale);
    seg.approved = !!seg.approved;
    if (seg.freeze) seg.frames = seg.freeze.frames;
    out.segments.push(seg);
  });
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
    else if (r === AUDIO_INPUT_ID) out.push({ id: AUDIO_INPUT_ID, name: "Вход audio ноды", category: "audio" });
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

export const usesContinuity = (project, index) => index > 0 && project.segments[index].link === "extend" && !isFootage(project.segments[index]);

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
  return text;
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
    const start = cursor - ov;
    items.push({ index: i, id: seg.id, frames: f, start, end: start + f, overlap: ov, overlap_blocks: ov ? (ov - 5) / 17 : 0,
      latent_t: latentT(f), audio_t: audioLen(f), link: i ? seg.link : "start" });
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
  if (items.length < fullN) warnings.push(`${fullN - items.length} отр. за маркером конца ролика — не генерируются`);
  const gap = Math.trunc(Number(project.end || 0)) - contentEnd(items);
  if (items.length && gap > 0) warnings.push(`пусто ${fmtSec10(gap)} с между последним отрезком и маркером конца — ролик будет короче: заполните пустоту отрезком («Продлить») или растяните последний`);
  for (const it of items) {
    const seg = project.segments[it.index];
    const name = seg.name || `#${it.index + 1}`;
    if (it.frames < TRAINED_MIN_FRAMES || it.frames > TRAINED_MAX_FRAMES)
      warnings.push(`${name}: ${it.frames} кадров (${(it.frames / FPS).toFixed(1)} с) — вне обучающего диапазона H3 ${TRAINED_MIN_FRAMES}–${TRAINED_MAX_FRAMES} кадров`);
    const cp = continuityPicture(project, it.index);
    const nRefs = orderedRefs(project, seg).length + (cp ? 1 : 0);
    if (nRefs > MAX_REF_IMAGES) warnings.push(`${name}: ${nRefs} референсов, максимум ${MAX_REF_IMAGES}` + (cp ? " (вместе с последним кадром прошлого отрезка)" : ""));
    const na = audioRefs(project, seg).length;
    if (na > MAX_REF_AUDIOS) warnings.push(`${name}: ${na} аудио-референса, максимум ${MAX_REF_AUDIOS}`);
    const nv = videoRefs(project, seg).length;
    if (nv > MAX_REF_VIDEOS) warnings.push(`${name}: ${nv} видео-референса, максимум ${MAX_REF_VIDEOS}`);
    if (isFootage(seg)) continue;
    if (it.link === "extend" && it.index > 0 && it.overlap === 0 && wantedOverlap(project, it.index) > 0)
      warnings.push(`${name}: перекрытие не помещается в отрезок — продление только по последнему кадру`);
    if (!(project.settings.prompt || "").trim() && !(seg.prompt || "").trim()) warnings.push(`${name}: пустой промпт`);
    const ids = new Set(orderedRefs(project, seg).map((a) => a.id));
    for (const m of segmentMarkers(project, it.index, items))
      if (m.effect === "boost" && m.asset && !ids.has(m.asset)) warnings.push(`${name}: маркер «${m.label || m.id}» усиливает персонажа, которого нет в референсах отрезка`);
  }
  for (const m of project.markers || [])
    if (m.effect !== "note" && markerSegment(items, m.frame) < 0) warnings.push(`маркер «${m.label || m.id}» за концом ролика — не действует`);
  if (w * h > 1344 * 768 * 1.05) warnings.push(`${w}×${h} больше официальных 1344×768 — дольше и больше VRAM`);
  let steps = items.reduce((acc, it) => acc + segSteps(project, it.index), 0);
  const ups = items.map((it) => it.index).filter((i) => upscalable(project.segments[i]));
  steps += ups.reduce((acc, i) => acc + passParams(project, i, "refine").steps, 0);
  if (ups.length) {
    const sc = Math.max(...ups.map((i) => project.segments[i].upscale.scale)), [uw, uh] = upscaleCanvas(w, h, sc);
    warnings.push(`апскейл отрезков: ${ups.length} → до ${uw}×${uh}`);
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
    const chain = prev && cont && prev[1] === up.scale ? prev[0] : "";
    const sig = fnv(JSON.stringify(["up", base[j], up, upscaleCanvas(w, h, up.scale), passParams(project, it.index, "refine").steps, chain].concat(refineExtra(project.settings))));
    out.push(sig); prev = [sig, up.scale];
  });
  return out;
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
    const sd = src ? [srcA.id, srcA.file, srcA.subfolder, src.in, src.denoise] : null;
    const vr = isFootage(seg) ? [] : videoRefs(project, seg).slice(0, MAX_REF_VIDEOS).map((a) => [a.id, a.file, a.subfolder]);
    const sig = isFootage(seg) ? fnv(JSON.stringify(["footage", w, h, it.frames, sd])) : fnv(JSON.stringify([w, h, it.frames, it.overlap, composePrompt(project, i), s.negative || "",
      orderedRefs(project, seg).map((a) => [a.id, a.file, a.subfolder]), passParams(project, i, kind), !!s.lock_overlap,
      continuityPicture(project, i), s.ref_size, segmentTrack(project, it), audioRefs(project, seg).map((a) => [a.id, a.file || ""]).slice(0, MAX_REF_AUDIOS),
      it.link === "extend" && i > 0 ? prev : "", it.link === "extend" && i > 0 && it.overlap ? [audioLockOverlap(project), audioLockOverlap(project) ? 4 : 3, Math.round(Math.min(Number(s.audio_context_sec || 0), AUDIO_CONTEXT_MAX) * 100) / 100] : segmentTrack(project, it).length ? [false, 3] : 0].concat(sd ? [["src", sd]] : [], vr.length ? [["vrefs", vr]] : [])));
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
  if (sec < 60) return `${Math.round(sec)} с`;
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  if (m < 60) return `${m} мин ${s.toString().padStart(2, "0")} с`;
  return `${Math.floor(m / 60)} ч ${m % 60} мин`;
}

export function newId(prefix = "") {
  return prefix + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);
}

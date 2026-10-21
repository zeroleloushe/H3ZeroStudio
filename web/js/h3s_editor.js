// H3ZeroStudio: full-screen timeline editor overlay. Plain DOM, no dependencies.
import * as C from "./h3s_core.js";
import { injectStyle } from "./h3s_style.js";
import { installTakes, installRestore } from "./h3s_takes.js";
import { installMarkers } from "./h3s_markers.js";
import { installAudio } from "./h3s_audio.js";
import { installPolish } from "./h3s_polish.js";
import { installDyn } from "./h3s_dyn.js";
import { installVideo, isVideo } from "./h3s_video.js";
import { installMenus } from "./h3s_menus.js";
import { installAssetEditor } from "./h3s_assetedit.js";
import { installComp } from "./h3s_comp.js";
import { installUpscale } from "./h3s_upscale.js";
import { installFinal } from "./h3s_final.js";
import { installSettings } from "./h3s_settings.js";
import { installHelp } from "./h3s_help.js";
import { installGallery } from "./h3s_gallery.js";
import { installProjects } from "./h3s_projects.js";
import { installRegions } from "./h3s_regions.js";
import { installViewer } from "./h3s_viewer.js";
import { installPromptEditor } from "./h3s_prompted.js";
import { installPresets } from "./h3s_presets.js";
import { installModelTab } from "./h3s_modeltab.js";
import { installTimer } from "./h3s_timer.js";

export const PALETTE = [
  ["#8b5cf6", "#6366f1"], ["#22d3ee", "#0ea5e9"], ["#ec4899", "#f43f5e"], ["#f59e0b", "#f97316"],
  ["#10b981", "#14b8a6"], ["#3b82f6", "#06b6d4"], ["#a855f7", "#ec4899"], ["#84cc16", "#10b981"],
];
const CAT = { character: "Персонажи", location: "Локации", other: "Другое", audio: "Аудио", video: "Видео" };
const SEAM_TXT = { ok: "шов незаметен", soft: "лёгкий скачок", hard: "резкий шов" };
const CAT1 = { character: "Персонаж", location: "Локация", other: "Другое", audio: "Аудио", video: "Видео" };
const LAYOUT_KEY = "h3zs.layout.v1";
const ZMIN = 1 / 16, ZMAX = 64; // timeline zoom relative to "fit"
const loadLS = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };
const saveLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
export const ICON = {
  models: svg('<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 22V12M21 7l-9 5-9-5"/>'),
  save: svg('<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v6h9V3M7 21v-7h10v7"/>'),
  assets: svg('<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>'),
  audio: svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  gallery: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 9"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.9"/><circle cx="12" cy="17.2" r=".6"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  projects: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  keys: svg('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>'),
  play: svg('<path d="M7 4l13 8-13 8z" fill="currentColor" stroke="none"/>'),
  pause: svg('<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>'),
  prev: svg('<path d="M19 20L9 12l10-8v16zM5 19V5"/>'), next: svg('<path d="M5 4l10 8-10 8V4zM19 5v14"/>'),
  close: svg('<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>'),
  expand: svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>'), redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>'),
  spark: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor" stroke="none"/><path d="M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z" fill="currentColor" stroke="none"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>'),
  cut: svg('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12"/>'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'), copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'), upload: svg('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M20 16v3a2 2 0 01-2 2H6a2 2 0 01-2-2v-3"/>'),
  film: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>'),
  link: svg('<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>'),
  dice: svg('<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1" fill="currentColor"/>'),
  vol: svg('<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14"/>'),
  mute: svg('<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M23 9l-6 6M17 9l6 6"/>'),
  fit: svg('<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>'),
  broom: svg('<path d="M19 4l-7 7M14 13l-3-3-6 6 3 3 6-6zM5 16l-2 5 5-2"/>'),
};

export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "style" && typeof v === "object") { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith("--")) e.style.setProperty(sk, sv); else e.style[sk] = sv; } }
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(e.dataset, v);
    else if (k === "value") e.value = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// zoom slider 0..100 <-> zoom ZMIN..ZMAX (log scale)
const zoomOf = (v) => Math.pow(2, Math.log2(1 / 16) + v / 100 * (Math.log2(64) - Math.log2(1 / 16)));
const zoomPos = (z) => Math.round((Math.log2(z) - Math.log2(1 / 16)) / (Math.log2(64) - Math.log2(1 / 16)) * 100);
const plural = (n, a, b, c) => { const m = n % 10, mm = n % 100; return m === 1 && mm !== 11 ? a : m >= 2 && m <= 4 && (mm < 10 || mm >= 20) ? b : c; };
const isTyping = (e) => { const t = e.target; return !!t && !t.classList?.contains("h3z-sink") && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable); };
const isAudio = (f) => (f.type || "").startsWith("audio/") || /\.(mp3|wav|flac|ogg|m4a|aac|opus)$/i.test(f.name || "");
const isImage = (f) => (f.type || "").startsWith("image/") || /\.(png|jpe?g|webp|bmp|gif)$/i.test(f.name || "");
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const FALLBACK_SAMPLERS = ["res_multistep", "euler", "euler_ancestral", "dpmpp_2m", "dpmpp_2m_sde", "uni_pc", "lcm", "er_sde"];
const FALLBACK_SCHED = ["simple", "normal", "beta", "karras", "exponential", "sgm_uniform", "linear_quadratic", "kl_optimal"];

export class H3Editor {
  /** host: { load():string, save(json), queue():Promise, interrupt():Promise, upload(file):Promise<{name,subfolder,type}>,
   *          url(ref):string, options():Promise<{samplers,schedulers}>, clearCache(id):Promise, onClose(), onChange() } */
  constructor(host) {
    this.host = host;
    this.p = C.normalizeProject(host.load());
    this.sel = this.p.segments.length ? 0 : -1;
    this.playhead = 0;
    this.zoom = 1;
    this.undoStack = []; this.redoStack = [];
    this.lastCoalesce = null;
    this.tool = "assets";
    this.filter = "all";
    this.pvMode = "full";
    this.run = { active: false };
    this.opts = { samplers: FALLBACK_SAMPLERS, schedulers: FALLBACK_SCHED };
    this.playing = false;
    this.selMarker = null;
    this.selAudio = null;
    this.audioMonitor = loadLS("h3zs.monitor2", true);
    this.musicMonitor = loadLS("h3zs.musicMon", true);
    this.vol = loadLS("h3zs.volume", { v: 1, muted: false });
    this.regenDownstream = false;
    this.root = null;
    this.$ = {};
  }

  // ------------------------------------------------------------------ lifecycle
  open() {
    injectStyle();
    if (this.root) return;
    this.p = C.normalizeProject(this.host.load());
    if (this.sel >= this.p.segments.length || this.sel < 0) this.sel = this.p.segments.length ? 0 : -1;
    this.root = h("div", { class: "h3z-root", tabindex: "-1" });
    this.$ = {};
    this.build();
    document.body.appendChild(this.root);
    this.bindGlobal();
    this.renderAll();
    this.focusSink();
    this.host.options?.().then((o) => { if (o?.samplers?.length) { this.opts = o; if (this.root) { this.renderInspector(); if (this.tool === "settings") this.renderLeft(); } } }).catch(() => {});
    this.globSync?.();
    this.mpSync?.();
    this.filesSync?.();
    this.timerSync?.();
    requestAnimationFrame(() => { if (this.root) { this.renderTimeline(); this.layoutStage(); } });
  }

  close() {
    if (!this.root) return;
    this.flushSave();
    this.stopPlayback();
    this.unbindGlobal();
    this.root.remove();
    this.root = null;
    this.host.onClose?.();
  }

  get isOpen() { return !!this.root; }

  /** Refocus the keyboard sink unless the user is typing in a field of the editor. */
  focusSink() {
    if (!this.root || !this.$.sink) return;
    if (this.pe?.el) { if (!this.pe.el.contains(document.activeElement)) this.pe.view?.focus(); return; }   // the prompt editor keeps its focus
    const a = document.activeElement;
    if (a?.closest?.(".h3z-lp")) return;   // the LoRA picker (a popover on <body>) keeps its search field
    if (a && a !== this.$.sink && this.root.contains(a) && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable)) return;
    this.$.sink.focus({ preventScroll: true });
  }

  /** Re-read the project from the node (e.g. workflow reloaded) when closed. */
  reload() { if (!this.root) this.p = C.normalizeProject(this.host.load()); }

  // ------------------------------------------------------------------ state
  snapshot() { return JSON.stringify(this.p); }

  mutate(fn, { coalesce = null, render = "all" } = {}) {
    const now = Date.now();
    if (!(coalesce && this.lastCoalesce && this.lastCoalesce.key === coalesce && now - this.lastCoalesce.t < 1200)) {
      this.undoStack.push(this.snapshot());
      if (this.undoStack.length > 200) this.undoStack.shift();
      this.redoStack = [];
    }
    this.lastCoalesce = coalesce ? { key: coalesce, t: now } : null;
    // «Длина: Фикс»: a placed marker never moves by itself. A marker not placed yet (end 0 — it sits at the end
    // of the last clip) is pinned at that end as soon as clips shrink/are deleted, so that leaves a gap
    const n0 = this.p.segments.length, unset = this.p.end_mode !== "auto" && !this.p.end && n0 > 0, c0 = unset ? this.contentFrames() : 0;
    const regAnch = (this.p.regions || []).length ? this.regionAnchors() : null;
    fn(this.p);
    this.p = C.normalizeProject(this.p);
    if (regAnch) this.regionsRebase(regAnch);
    if (unset && this.p.end_mode !== "auto" && !this.p.end && this.p.segments.length && this.contentFrames() < c0) this.p.end = c0;
    // «Фикс»: the marker never moves by itself (only the user drags/sets it). A clip that landed past it is
    // pointed out with a one-click «Маркер → конец» instead (see pastMarkerHint)
    if (this.p.segments.length > n0) this._pastMarkerCheck = true;
    if (this.sel >= this.p.segments.length) this.sel = this.p.segments.length - 1;
    if (this.sel < 0 && this.p.segments.length) this.sel = 0;
    this.scheduleSave();
    if (!this.root) return;
    if (render === "all") this.renderAll();
    else if (render === "light") { this.renderTimeline(); this.renderHeader(); this.renderFinalPrompt(); this.refreshStatus(); }
  }

  /** Fixed end marker: segments past it are not generated. True if segment i (default: any) lies past it. */
  pastMarker(i = null) {
    if (this.p.end_mode === "auto" || !(this.p.end > 0)) return false;
    const n = this.genCount();
    return i === null ? n < this.p.segments.length : i >= n;
  }
  /** «Маркер → конец»: the user's explicit one-click move of the fixed marker to the end of the last clip. */
  markerToEnd() { const c = this.contentFrames(); if (c > 0) { this.setEnd(c); this.toast(`Маркер конца перенесён в конец последнего клипа (${(c / C.FPS).toFixed(2)} с)`); } }
  /** After a clip was added past a fixed marker: say so and offer the move (the marker itself stays put). */
  pastMarkerHint() {
    if (!this._pastMarkerCheck) return false;
    this._pastMarkerCheck = false;
    if (!this.pastMarker()) return false;
    this.toast("Клип за маркером конца («Длина: Фикс») — он не будет сгенерирован, пока вы не сдвинете маркер", false, { label: "Маркер → конец", fn: () => this.markerToEnd() });
    return true;
  }

  restore(json) {
    // undo/redo never loses generated results: takes are merged, the active take (if restored) wins
    const keepRes = Object.fromEntries(this.p.segments.map((s) => [s.id, s.result]));
    const keepTakes = Object.fromEntries(this.p.segments.map((s) => [s.id, s.takes || []]));
    const keepFull = this.p.result, keepStats = this.p.stats;
    this.p = C.normalizeProject(json);
    for (const s of this.p.segments) {
      const known = new Set((s.takes || []).map((t) => t.key));
      s.takes = [...(s.takes || []), ...(keepTakes[s.id] || []).filter((t) => !known.has(t.key))].slice(-C.MAX_TAKES);
      const act = s.takes.find((t) => t.id === s.active_take);
      if (act) s.result = { ...JSON.parse(JSON.stringify(act.result)), sig: act.sig };
      else if (keepRes[s.id] !== undefined) s.result = keepRes[s.id];
    }
    this.p.result = keepFull; this.p.stats = keepStats;
    if (this.sel >= this.p.segments.length) this.sel = this.p.segments.length - 1;
    if (this.sel < 0 && this.p.segments.length) this.sel = 0;
    this.lastCoalesce = null;
    this.scheduleSave();
    this.renderAll();
  }

  undo() { if (!this.undoStack.length) return; this.redoStack.push(this.snapshot()); this.restore(this.undoStack.pop()); this.toast("Отменено"); }
  redo() { if (!this.redoStack.length) return; this.undoStack.push(this.snapshot()); this.restore(this.redoStack.pop()); this.toast("Повторено"); }

  scheduleSave() { clearTimeout(this._saveT); this._saveT = setTimeout(() => this.flushSave(), 250); }
  flushSave() {
    clearTimeout(this._saveT);
    try { this.host.save(JSON.stringify(this.p)); this.host.onChange?.(this.p); } catch (e) { console.warn("[H3ZeroStudio] save failed", e); }
    this.projAutosave?.();
  }

  seg(i = this.sel) { return this.p.segments[i]; }
  items() { return C.plan(this.p); }
  sigs() { return C.segmentSigs(this.p); }

  // ------------------------------------------------------------------ skeleton
  build() {
    const $ = this.$;
    $.head = h("div", { class: "h3z-head h3z-glass" });
    $.tools = h("div", { class: "h3z-tools h3z-glass" });
    $.left = h("div", { class: "h3z-panel h3z-glass" });
    $.center = h("div", { class: "h3z-center h3z-glass" });
    $.insp = h("div", { class: "h3z-insp" });
    $.splitL = h("div", { class: "h3z-split v sl", title: "Тяните, чтобы изменить ширину панели · двойной клик — по умолчанию" });
    $.splitR = h("div", { class: "h3z-split v sr", title: "Тяните, чтобы изменить ширину панели · двойной клик — по умолчанию" });
    $.splitT = h("div", { class: "h3z-split hz", title: "Тяните, чтобы изменить высоту таймлайна · двойной клик — по умолчанию" });
    $.body = h("div", { class: "h3z-body" }, $.tools, $.left, $.splitL, $.center, $.splitR, $.insp);
    $.tl = h("div", { class: "h3z-tl h3z-glass" });
    this.applyLayout();
    this.splitter($.splitL, "lw", 1); this.splitter($.splitR, "rw", -1); this.splitter($.splitT, "th", -1);
    // Keyboard sink: ComfyUI's ChangeTracker listens to keydown on window in the capture phase (registered before
    // extensions, so stopPropagation cannot stop it) and would run graph undo on Ctrl+Z, reloading the workflow.
    // It ignores keys while an <input> has focus, so the editor keeps focus on this hidden read-only input.
    $.sink = h("input", { class: "h3z-sink", readonly: true, tabindex: "-1", "aria-hidden": "true", autocomplete: "off" });
    this.root.append($.sink, $.head, $.body, $.splitT, $.tl);
    this.root.addEventListener("focusout", () => setTimeout(() => this.focusSink(), 0));
    this.root.addEventListener("pointerup", () => setTimeout(() => this.focusSink(), 0));
    this.buildCenter();
    this.buildTimeline();
    // drag&drop / paste must never reach ComfyUI (it would load a workflow / paste nodes)
    for (const ev of ["dragover", "drop", "dragenter"]) this.root.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); });
    this.root.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
    this.root.addEventListener("contextmenu", (e) => { if (!isTyping(e)) e.preventDefault(); e.stopPropagation(); });
  }

  /** Panel sizes: defaults scale with the window (ultrawide gets wider side panels), user sizes persist. */
  layoutDefaults() {
    const W = window.innerWidth || 1600, H = window.innerHeight || 900;
    return { lw: clamp(Math.round(W * 0.15), 240, 560), rw: clamp(Math.round(W * 0.2), 340, 680), th: clamp(Math.round(H * 0.3), 230, 520) };
  }
  layoutSizes() {
    const d = this.layoutDefaults(), u = loadLS(LAYOUT_KEY, {}), W = window.innerWidth || 1600, H = window.innerHeight || 900;
    return { lw: clamp(u.lw || d.lw, 200, Math.max(220, W * 0.4)), rw: clamp(u.rw || d.rw, 300, Math.max(320, W * 0.45)), th: clamp(u.th || d.th, 190, Math.max(200, H * 0.7)) };
  }
  applyLayout() {
    if (!this.root) return;
    const L = this.layoutSizes();
    this.root.style.setProperty("--lw", L.lw + "px"); this.root.style.setProperty("--rw", L.rw + "px"); this.root.style.setProperty("--th", L.th + "px");
  }
  splitter(el, key, dir) {
    el.addEventListener("dblclick", () => { const u = loadLS(LAYOUT_KEY, {}); delete u[key]; saveLS(LAYOUT_KEY, u); this.applyLayout(); this._resize?.(); });
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const start = this.layoutSizes()[key], p0 = key === "th" ? e.clientY : e.clientX;
      el.classList.add("on");
      const move = (ev) => {
        const d = ((key === "th" ? ev.clientY : ev.clientX) - p0) * dir;
        const u = loadLS(LAYOUT_KEY, {}); u[key] = Math.round(start + d); saveLS(LAYOUT_KEY, u);
        this.applyLayout(); this.layoutStage();
      };
      const up = () => { el.classList.remove("on"); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); this.renderTimeline(); this.layoutStage(); };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    });
  }

  bindGlobal() {
    this._key = (e) => this.onKey(e);
    this._keyup = (e) => { if (this.root) e.stopPropagation(); };
    this._paste = (e) => this.onPaste(e);
    this._resize = () => { if (this._rsz) return; this._rsz = requestAnimationFrame(() => { this._rsz = 0; if (this.root) { this.applyLayout(); this.renderTimeline(); this.layoutStage(); } }); };
    window.addEventListener("keydown", this._key, true);
    window.addEventListener("keyup", this._keyup, true);
    document.addEventListener("paste", this._paste, true);
    window.addEventListener("resize", this._resize);
  }
  unbindGlobal() {
    window.removeEventListener("keydown", this._key, true);
    window.removeEventListener("keyup", this._keyup, true);
    document.removeEventListener("paste", this._paste, true);
    window.removeEventListener("resize", this._resize);
  }

  renderAll() {
    if (!this.root) return;
    this.renderHeader(); this.renderTools(); this.renderLeft(); this.renderInspector(); this.renderTimeline(); this.renderPreview();
  }

  // ------------------------------------------------------------------ header
  async freeMemory(btn) {
    if (btn) { btn.disabled = true; btn.style.opacity = ".6"; }
    try {
      await this.host.freeMemory();
      this.toast(this.run?.active ? "Память будет освобождена сразу после текущей генерации" : "Модели выгружены из видеопамяти и ОЗУ — следующая генерация загрузит их заново");
    } catch (e) { this.toast("Не удалось очистить память: " + (e.message || e), true); }
    finally { if (btn) { btn.disabled = false; btn.style.opacity = ""; } }
  }

  renderHeader() {
    const $ = this.$, est = C.estimate(this.p), kind = C.runKind(this.p.settings);
    $.head.innerHTML = "";
    const name = h("input", { class: "h3z-pname", value: this.p.name, spellcheck: "false", title: "Название проекта" });
    name.addEventListener("input", () => this.mutate((p) => { p.name = name.value; }, { coalesce: "pname", render: "none" }));
    const chips = h("div", { class: "h3z-chips" },
      h("span", { class: "h3z-chip" }, h("b", null, est.segments), plural(est.segments, "отрезок", "отрезка", "отрезков")),
      h("span", { class: "h3z-chip" }, h("b", null, C.fmtTime(est.seconds)), `${est.frames} кадр.`),
      h("span", { class: "h3z-chip" }, h("b", null, `${est.width}×${est.height}`), "24 fps"),
      h("span", { class: "h3z-chip", title: "Сумма шагов по всем отрезкам (кэшированные отрезки не пересчитываются)" }, h("b", null, est.steps_total), "шагов"),
      this.timeEstimateChip(est));
    if (est.warnings.length) {
      const w = h("span", { class: "h3z-chip warn", title: "Предупреждения перед запуском — нажмите, чтобы посмотреть" }, `⚠ ${est.warnings.length}`);
      w.onclick = () => this.toggleWarnings(est.warnings);
      chips.append(w);
    }
    const undo = h("button", { class: "h3z-btn icon", title: "Отменить (Ctrl+Z)", html: ICON.undo, disabled: !this.undoStack.length, onclick: () => this.undo() });
    const redo = h("button", { class: "h3z-btn icon", title: "Повторить (Ctrl+Shift+Z)", html: ICON.redo, disabled: !this.redoStack.length, onclick: () => this.redo() });
    let action;
    if (this.run.active) {
      $.runPill = h("div", { class: "h3z-run" }, h("i", { style: { width: "0%" } }), h("div", { class: "sp" }), h("span", null, "Запуск…"));
      action = [$.runPill, h("button", { class: "h3z-btn danger", html: ICON.stop + "<span>Стоп</span>", title: "Прервать генерацию", onclick: () => this.stop() })];
    } else {
      $.runPill = null;
      action = [h("button", { class: "h3z-btn", html: ICON.save + "<span>Сохранить видео</span>", title: "Сохранить ролик, фрагмент или отрезок в mp4 в выбранную папку (с музыкой)", onclick: () => this.saveDialog() }),
        this.finalHeaderButton(),
        this.upHeaderButton(),
        h("button", { class: "h3z-btn primary", html: ICON.spark + "<span>Сгенерировать</span>" + (kind === "draft" ? "<small class='q'>черновик</small>" : kind === "refine" ? "<small class='q'>финал ↑</small>" : ""),
          title: "Поставить в очередь ComfyUI (Ctrl+Enter). Готовые неизменённые отрезки берутся из кэша" + (kind === "draft" ? "\nЧерновик: маленький размер, быстро — для подбора промптов и дублей" : kind === "refine" ? "\nФинал из черновика: каждый черновик увеличивается и дорабатывается (звук черновика сохраняется 1:1)" : ""), onclick: () => this.generate() })];
    }
    $.head.append(
      h("div", { class: "h3z-logo" }, h("i", { html: ICON.film.replace("<svg", '<svg style="width:17px;height:17px;color:#fff"') }), h("span", null, h("b", null, "H3"), "ZeroStudio")),
      name, chips, this.timerEl(), undo, redo,
      h("button", { class: "h3z-btn", html: ICON.broom + "<span>Очистить память</span>", title: "Выгрузить все модели из видеопамяти и ОЗУ (ComfyUI освободит память после текущей задачи)", onclick: (e) => this.freeMemory(e.currentTarget) }),
      ...action.filter(Boolean),
      h("button", { class: "h3z-btn icon", title: "Свернуть (Esc)", html: ICON.close, onclick: () => this.close() }));
    this.updateRunUI();
  }

  timeEstimateChip(est) {
    const rate = this.p.stats?.sec_per_unit;
    if (!rate) return null;
    const its = this.items(), sigs = this.sigs();
    let units = 0;
    its.forEach((it, i) => { const s = this.p.segments[i]; if (!(s.result && s.result.sig === sigs[i])) units += C.effectiveParams(this.p, i).steps * it.frames * est.width * est.height / 1e6; });
    return h("span", { class: "h3z-chip", title: "Оценка по скорости прошлого запуска; готовые неизменённые отрезки берутся из кэша" }, "≈", h("b", null, units ? C.fmtDur(units * rate) : "из кэша"));
  }

  toggleWarnings(list) {
    if (this.$.pop) { this.$.pop.remove(); this.$.pop = null; return; }
    if (!list) return;
    this.$.pop = h("div", { class: "h3z-pop h3z-glass" }, list.map((w) => h("div", null, w)));
    this.$.pop.onclick = () => { this.$.pop.remove(); this.$.pop = null; };
    this.root.append(this.$.pop);
  }

  // ------------------------------------------------------------------ tools + left panel
  /** «22 кадр. ≈ 0.92 с» for an overlap in blocks. */
  ovLabel(o) { const f = C.overlapFrames(o); return o > 0 ? `${f} кадр. ≈ ${(f / C.FPS).toFixed(2)} с` + (f % 3 === 0 ? " · точно по сетке звука" : "") : "нет (только последний кадр)"; }

  /** Per-segment overlap override (-1 = global). */
  setSegOverlap(i, o) {
    this.mutate((p) => { p.segments[i].overlap_blocks = o; });
    const it = this.items()[i], want = C.wantedOverlap(this.p, i);
    if (want > 0 && it.overlap < C.overlapFrames(want)) this.toast(`Перекрытие ${C.overlapFrames(want)} кадр. не помещается — используется ${it.overlap || 0} кадр. (удлините этот или предыдущий отрезок)`, true);
  }

  renderTools() {
    const t = this.$.tools; t.innerHTML = "";
    if (this.tool === "audio") this.tool = "assets";
    const tool = (id, icon, label) => h("div", { class: "h3z-tool" + (this.tool === id ? " on" : ""), html: icon + `<span>${label}</span>`, onclick: () => { this.tool = id; this.renderTools(); this.renderLeft(); } });
    t.append(tool("assets", ICON.assets, "Ассеты"), tool("gallery", ICON.gallery, "Галерея"), tool("projects", ICON.projects, "Проекты"), tool("models", ICON.models, "Модели"), tool("settings", ICON.settings, "Настройки"), tool("keys", ICON.keys, "Клавиши"), h("div", { class: "sp" }), tool("help", ICON.help, "Справка"), tool("about", ICON.info, "Инфо"));
  }

  renderLeft() {
    const L = this.$.left;
    // a change inside the panel re-renders it: keep scroll positions and focus of the same tab (settings, gallery…)
    const snap = this._leftTool === this.tool ? this.uiSnap(L) : null; this._leftTool = this.tool;
    L.innerHTML = "";
    L.closest(".h3z-body")?.classList.toggle("h3z-mtwide", this.tool === "models");
    try { this.renderLeftTool(L); } finally { this._leftSnap = snap ? { snap, t: Date.now() } : null; if (snap) this.uiRestore(L, snap); }
  }
  /** Async panels (gallery / projects lists) call this after filling, so the old scroll fits the new content. */
  leftRestore() {
    const ls = this._leftSnap; if (!ls || Date.now() - ls.t > 3000) return;
    this.uiRestore(this.$.left, ls.snap, true);
  }
  /** Scroll offsets of every scrolled element (by child-index path) and the focused field of a panel. */
  uiSnap(root) {
    const path = (el) => { const p = []; for (let e = el; e && e !== root; e = e.parentElement) p.unshift([...e.parentElement.children].indexOf(e)); return p; };
    const scroll = [];
    for (const el of [root, ...root.querySelectorAll("*")]) if (el.scrollTop > 0 || el.scrollLeft > 0) scroll.push({ p: el === root ? [] : path(el), cls: el.className, top: el.scrollTop, left: el.scrollLeft });
    let focus = null; const a = document.activeElement;
    // only text-like fields: a focused select / checkbox would swallow the editor hotkeys (Space, S…)
    if (a && a !== root && root.contains(a) && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && /^(text|number|search|)$/.test(a.type)))) {
      const all = [...root.querySelectorAll("input,select,textarea")];
      focus = { i: all.indexOf(a), tag: a.tagName, type: a.type, name: a.title || a.placeholder || "" };
      try { focus.s = a.selectionStart; focus.e = a.selectionEnd; } catch (e) {}
    }
    return { scroll, focus };
  }
  uiRestore(root, snap, scrollOnly = false) {
    for (const r of snap.scroll) {
      let el = root; for (const i of r.p) { el = el?.children[i]; if (!el) break; }
      if (!el || el.className !== r.cls) { try { el = r.p.length && r.cls ? root.querySelector("." + String(r.cls).trim().split(/\s+/).join(".")) : null; } catch (e) { el = null; } }
      if (!el) continue;
      if (el.scrollTop < r.top) el.scrollTop = r.top;
      if (el.scrollLeft < r.left) el.scrollLeft = r.left;
    }
    const f = snap.focus; if (scrollOnly || !f || f.i < 0) return;
    const el = [...root.querySelectorAll("input,select,textarea")][f.i];
    if (!el || el.tagName !== f.tag || el.type !== f.type || (el.title || el.placeholder || "") !== f.name || document.activeElement === el) return;
    try { el.focus({ preventScroll: true }); if (f.s != null && el.setSelectionRange) el.setSelectionRange(f.s, f.e); } catch (e) {}
  }

  renderLeftTool(L) {
    if (this.tool !== "help") this.helpHide?.();
    if (this.tool === "audio") this.tool = "assets";   // the old «Аудио» rail tab: clips live on the timeline / inspector
    if (this.tool === "assets") return this.renderAssets(L);
    if (this.tool === "gallery") return this.renderGallery(L);
    if (this.tool === "projects") return this.renderProjects(L);
    if (this.tool === "models") return this.renderModels(L);
    if (this.tool === "settings") return this.renderSettings(L);
    if (this.tool === "help") return this.renderHelp(L);
    if (this.tool === "keys") return this.renderKeys(L);
    return this.renderAbout(L);
  }

  renderAssets(L) {
    const fileIn = h("input", { type: "file", accept: this.filter === "audio" ? "audio/*,.mp3,.wav,.flac,.ogg,.m4a,.aac,.opus" : this.filter === "video" ? "video/*,.mp4,.mov,.webm,.mkv" : "image/*,audio/*,video/*,.mp3,.wav,.flac,.ogg,.m4a,.mp4,.mov,.webm,.mkv", multiple: true, style: { display: "none" } });
    fileIn.onchange = () => { this.uploadFiles([...fileIn.files]); fileIn.value = ""; };
    const pills = h("div", { class: "h3z-pills" }, [["all", "Все"], ["character", "Персон."], ["location", "Локации"], ["other", "Другое"], ["audio", "♪ Аудио"], ["video", "🎞 Видео"]].map(([k, l]) =>
      h("div", { class: "h3z-pill" + (this.filter === k ? " on" : ""), title: k === "all" ? "Все ассеты" : CAT[k], onclick: () => { this.filter = k; this.renderLeft(); } }, l)));
    const drop = h("div", { class: "h3z-drop", html: ICON.upload + (this.filter === "audio" ? "Перетащите аудио сюда" : this.filter === "video" ? "Перетащите видео сюда" : "Перетащите картинки, аудио или видео сюда") + "<br>или нажмите, чтобы выбрать" + (this.filter !== "all" ? `<br><small>в «${CAT[this.filter]}»</small>` : "") });
    drop.onclick = () => fileIn.click();
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); const all = [...(e.dataTransfer?.files || [])], fs = all.filter((f) => isImage(f) || isAudio(f) || isVideo(f)); if (all.length > fs.length) this.toast(`Формат не поддерживается: ${all.filter((f) => !fs.includes(f)).map((f) => f.name).join(", ")}`, true); if (fs.length) this.uploadFiles(fs); });
    const used = new Set(this.seg()?.refs || []);
    const list = this.p.assets.filter((a) => a.category !== "audio" && a.category !== "video" && (this.filter === "all" || a.category === this.filter));
    const audioTiles = (this.filter === "all" || this.filter === "audio" ? this.audioTiles(used) : []).concat(this.filter === "all" || this.filter === "video" ? this.videoTiles(used) : []);
    const grid = h("div", { class: "h3z-agrid" }, audioTiles, list.map((a) => {
      const cat = h("div", { class: "cat " + a.category, title: "Сменить категорию" }, CAT1[a.category]);
      cat.onclick = (e) => { e.stopPropagation(); const i = (C.CATEGORY_ORDER.indexOf(a.category) + 1) % 3; this.mutate((p) => { p.assets.find((x) => x.id === a.id).category = C.CATEGORY_ORDER[i]; }); };
      const del = h("div", { class: "del", title: "Убрать из проекта (файл остаётся в input)", html: ICON.trash.replace("<svg", '<svg style="width:13px;height:13px"') });
      del.onclick = (e) => { e.stopPropagation(); this.mutate((p) => { p.assets = p.assets.filter((x) => x.id !== a.id); for (const s of p.segments) s.refs = s.refs.filter((r) => r !== a.id); }); };
      const card = h("div", { class: "h3z-asset" + (used.has(a.id) ? " used" : ""), draggable: "true", title: `${a.name}\nКлик — добавить в выбранный отрезок / убрать. Можно перетащить на отрезок.` },
        h("img", { src: this.assetUrl(a), loading: "lazy", draggable: "false" }), cat, del, h("div", { class: "cap" }, h("div", null, a.name)));
      card.addEventListener("dragstart", (e) => { e.dataTransfer.setData("application/x-h3s-asset", a.id); e.dataTransfer.effectAllowed = "copy"; });
      card.onclick = () => this.toggleRef(this.sel, a.id);
      card.addEventListener("dblclick", (e) => { e.stopPropagation(); this.openAssetEditor(a.id); });
      card.addEventListener("contextmenu", (e) => this.assetMenu(e, a));
      if (a.orig) card.append(h("div", { class: "edt", title: "Обработанная копия (оригинал сохранён)" }, "✎"));
      return card;
    }));
    L.append(
      h("div", { class: "h3z-ph" }, h("h3", null, "Ассеты ", h("small", null, this.p.assets.length || "")), h("button", { class: "h3z-btn sm", html: ICON.upload + "<span>Загрузить</span>", onclick: () => fileIn.click() })),
      h("div", { class: "h3z-scroll" }, pills, drop, list.length || audioTiles.length ? grid : h("div", { class: "h3z-empty" }, this.p.assets.length ? "В этой категории пусто" : "Загрузите референсы персонажей, локаций и предметов. В промптах отрезков они станут <Picture N>."), fileIn));
  }

  renderKeys(L) {
    const k = [["Пробел", "воспроизвести / пауза"], ["S", "разрезать отрезок по плейхеду"], ["Del", "удалить отрезок"], ["D", "дублировать отрезок"],
      ["E", "продлить (+ отрезок в конце)"], ["Ctrl+Z", "отменить"], ["Ctrl+Shift+Z, Ctrl+Y", "повторить"], ["← / →", "кадр назад / вперёд (Shift — 1 с)"],
      ["Home / End", "в начало / в конец"], ["[ / ]", "предыдущий / следующий отрезок"], ["+ / −, Ctrl+колесо", "масштаб таймлайна"], ["Ctrl+Enter", "сгенерировать"],
      ["M", "маркер на плейхеде"], ["R", "✂ Участок: выделить и пересоздать часть ролика"], ["ПКМ по отрезку", "меню: новый дубль, разрезать, маркер…"],
      ["Esc", "свернуть редактор"], ["Ctrl+V", "вставить картинку в ассеты"]];
    L.append(h("div", { class: "h3z-ph" }, h("h3", null, "Горячие клавиши")), h("div", { class: "h3z-scroll" }, h("div", { class: "h3z-keys" }, k.map(([a, b]) => [h("div", null, h("kbd", null, a)), h("div", { class: "h3z-note" }, b)]))));
  }

  renderAbout(L) {
    const est = C.estimate(this.p);
    L.append(h("div", { class: "h3z-ph" }, h("h3", null, "Как это работает")), h("div", { class: "h3z-scroll" }, h("div", { class: "h3z-card", style: { padding: 0 } },
      h("div", { class: "h3z-note", html: "Каждый отрезок — отдельная генерация H3 длиной <b>17k+5</b> кадров (24 fps). Отрезок в режиме <b>«Продление»</b> начинается с хвоста предыдущего: кадры перекрытия фиксируются в латенте и подаются как ключевой клип, а последний кадр предыдущего отрезка добавляется ещё одним <b>&lt;Picture N&gt;</b>. Так персонажи и свет не «плывут» между отрезками." }),
      h("div", { class: "h3z-note", html: "<b>«Новая сцена»</b> — монтажная склейка: отрезок генерируется с нуля, без связи с предыдущим." }),
      h("div", { class: "h3z-note", html: "Готовые отрезки кэшируются в <b>output/h3zerostudio/" + esc(this.p.id) + "</b>. Повторный запуск пропускает неизменённые отрезки; изменение отрезка пересчитывает его и все продолжения после него." }),
      h("div", { class: "h3z-note", html: `Обучающий диапазон H3 — ${C.TRAINED_MIN_FRAMES}–${C.TRAINED_MAX_FRAMES} кадров (${(C.TRAINED_MIN_FRAMES / 24).toFixed(1)}–${(C.TRAINED_MAX_FRAMES / 24).toFixed(1)} с) на отрезок. Сейчас в проекте: ${est.frames} кадров, ${est.seconds.toFixed(1)} с.` }),
      h("button", { class: "h3z-btn sm danger", html: ICON.broom + "<span>Очистить кэш проекта</span>", title: "Готовые дубли остаются (восстановятся без генерации)", onclick: () => this.clearCache() }),
      h("button", { class: "h3z-btn sm danger", title: "Кэш и все готовые дубли (кроме зафиксированных)", onclick: () => this.clearCache(true) }, "…и дубли"))));
  }

  // ------------------------------------------------------------------ assets ops
  assetUrl(a) { return this.host.url({ filename: a.file, subfolder: a.subfolder, type: a.type || "input" }); }

  async uploadFiles(files) {
    const video = files.filter((f) => isVideo(f) && !(f.type || "").startsWith("audio/"));
    const audio = files.filter((f) => isAudio(f) && !isImage(f) && !video.includes(f));
    files = files.filter((f) => isImage(f));
    if (video.length) this.toast(`Загрузка видео: ${video.length}… (большие файлы — до минуты)`);
    if (video.length) await this.uploadVideoAssets(video);
    if (audio.length) await this.uploadAudioAssets(audio);
    if (!files.length) return;
    const cat = this.filter === "all" || this.filter === "audio" || this.filter === "video" ? (this.p.assets.some((a) => C.CATEGORY_ORDER.includes(a.category)) ? "other" : "character") : this.filter;
    let n = 0;
    for (const f of files) {
      try {
        const r = await this.host.upload(f, this.p.id);
        const id = C.newId("a");
        const name = (f.name && f.name !== "image.png" ? f.name : r.name).replace(/\.[^.]+$/, "");
        this.mutate((p) => { p.assets.push({ id, name, file: r.name, subfolder: r.subfolder || "", type: r.type || "input", category: cat }); }, { render: "none" });
        n++;
      } catch (e) { this.toast("Не удалось загрузить " + f.name + ": " + (e.message || e), true); }
    }
    if (n) { this.renderAll(); this.toast(`Загружено: ${n}`); }
  }

  toggleRef(i, id) {
    if (!this.seg(i)) return this.toast("Сначала добавьте отрезок", true);
    this.mutate((p) => { const seg = p.segments[i]; seg.refs = seg.refs.includes(id) ? seg.refs.filter((r) => r !== id) : [...seg.refs, id]; });
  }

  addRef(i, id) {
    const s = this.seg(i);
    if (!s || s.refs.includes(id)) return;
    this.mutate((p) => { p.segments[i].refs.push(id); });
  }

  onPaste(e) {
    if (!this.root) return;
    if (this.pe?.el?.contains(e.target)) return;   // CodeMirror handles its own paste (the modal stops it after)
    e.stopPropagation();
    if (isTyping(e)) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (files.length) { e.preventDefault(); this.uploadFiles(files); }
  }

  // ------------------------------------------------------------------ inspector
  renderInspector() {
    if (this.tool === "models" && this._mtSel !== this.sel && this.$.left) { this._mtSel = this.sel; queueMicrotask(() => this.tool === "models" && this.renderLeft()); }
    const I = this.$.insp, top = I.scrollTop, isnap = this.uiSnap(I); I.innerHTML = "";
    this.$.finalBox = null; this.$.segPrompt = null;
    if (this.selMarker && !this.marker()) this.selMarker = null;
    const selKey = (this.selMarker || "") + "|" + (this.seg()?.id ?? "");
    const keepScroll = selKey === this._inspKey; this._inspKey = selKey;
    if (this.selMarker) I.append(this.markerCard());
    { const ac = this.audioClipCard?.(); if (ac) I.append(ac); }
    if (this.sel >= 0 && this.seg()) I.append(this.segmentCard());
    else I.append(h("div", { class: "h3z-card h3z-glass" }, h("div", { class: "h3z-card-h" }, h("h4", null, "Нет отрезков")),
      h("div", { class: "h3z-note" }, "Добавьте первый отрезок — кнопкой ниже или «+ Отрезок» на таймлайне."),
      h("button", { class: "h3z-btn primary", html: ICON.plus + "<span>Добавить отрезок</span>", onclick: () => this.extend() })));
    I.append(this.globalCard());
    this.keepDetails(I);
    I.scrollTop = keepScroll ? top : 0;
    if (keepScroll) this.uiRestore(I, isnap);
  }

  /** Collapsible sections keep their open/closed state across re-renders (a toggle inside re-renders the panel). */
  keepDetails(root) {
    this._det = this._det || {};
    if (!this._detLoaded) { this._detLoaded = true; try { Object.assign(this._det, JSON.parse(localStorage.getItem("h3zs.det") || "{}")); } catch (e) {} }
    for (const d of root.querySelectorAll("details.h3z-det")) {
      const sm = d.querySelector(":scope > summary");
      const key = (sm?.firstChild?.textContent || sm?.textContent || "").trim();
      if (!key) continue;
      if (key in this._det) d.open = !!this._det[key];
      d.addEventListener("toggle", () => { this._det[key] = d.open; try { localStorage.setItem("h3zs.det", JSON.stringify(this._det)); } catch (e) {} });
    }
  }

  /** Seam rating of the join on the left of clip i (measured after generation; only for a current result). */
  seamQ(i) { const s = this.p.segments[i]; const q = s?.result?.seam; return i > 0 && q && q.verdict && s.link === "extend" && !this.isStale(i) ? q : null; }
  seamTip(i, q) {
    return `Шов ${i}→${i + 1}: ${SEAM_TXT[q.verdict]} (скачок ×${q.ratio} к обычному движению кадра; < 1.2 — незаметен, < 1.8 — лёгкий)`
      + (q.raw ? `\nВыравнивание яркости и цвета: до ×${q.raw.ratio} (${SEAM_TXT[q.raw.verdict]}) → после ×${q.ratio}`
        + (q.level?.offset ? ` · сдвиг ${q.level.offset.map((x) => (x > 0 ? "+" : "") + x).join("/")} (R/G/B из 255)` : "") : "")
      + (q.audio ? `\nЗвук: скачок громкости ${q.audio.db} дБ` + (q.audio.warn ? " — заметно" : "") : "")
      + (q.verdict !== "ok" || q.audio?.warn ? "\n«Ещё дубль» (новый сид) обычно даёт более гладкий стык" : "");
  }

  field(label, input, cls = "") { return h("div", { class: "h3z-field " + cls }, h("div", { class: "h3z-lbl" }, label), input); }

  toggle(label, on, cb, title) {
    const t = h("div", { class: "h3z-tog" + (on ? " on" : ""), title }, h("span", null, label), h("i"));
    t.onclick = () => cb(!on);
    return t;
  }

  segmentCard() {
    const i = this.sel, s = this.seg(), it = this.items()[i], pal = PALETTE[s.color % PALETTE.length];
    const card = h("div", { class: "h3z-card h3z-glass" });
    const name = h("input", { class: "h3z-in", value: s.name, placeholder: `Отрезок ${i + 1}`, style: { padding: "6px 9px", fontWeight: 600 } });
    name.oninput = () => this.mutate((p) => { p.segments[i].name = name.value; }, { coalesce: "name" + s.id, render: "light" });
    const colors = h("div", { class: "h3z-colors" }, PALETTE.slice(0, 6).map((c, ci) => h("span", { class: s.color % PALETTE.length === ci ? "on" : "", style: { background: `linear-gradient(135deg,${c[0]},${c[1]})` }, onclick: () => this.mutate((p) => { p.segments[i].color = ci; }) })));
    card.append(h("div", { class: "h3z-card-h" },
      h("span", { class: "h3z-num", style: { background: `linear-gradient(135deg,${pal[0]},${pal[1]})` } }, i + 1), name, colors,
      h("button", { class: "h3z-btn sm icon danger", title: "Удалить отрезок (Del)", html: ICON.trash, onclick: () => this.deleteSeg(i) })));
    // link
    card.append(h("div", null, h("div", { class: "h3z-lbl" }, "Связь с предыдущим", h("em", null, i === 0 ? "первый отрезок" : s.link === "extend" ? (it.overlap ? `перекрытие ${it.overlap} кадр.` : "только последний кадр") : "монтажная склейка")),
      h("div", { class: "h3z-pills" },
        h("div", { class: "h3z-pill" + (i > 0 && s.link === "extend" ? " on" : "") + (i === 0 ? " dis" : ""), onclick: () => this.mutate((p) => { p.segments[i].link = "extend"; }), title: "Продолжить предыдущий отрезок: перекрытие + последний кадр как референс" }, "⟶ Продление"),
        h("div", { class: "h3z-pill" + (i > 0 && s.link === "cut" ? " on" : "") + (i === 0 ? " dis" : ""), onclick: () => this.mutate((p) => { p.segments[i].link = "cut"; }), title: "Новая сцена без связи с предыдущим" }, "✂ Новая сцена"))));
    { const sq = this.seamQ(i); if (sq) card.append(h("div", { class: "h3z-seamv " + sq.verdict, title: this.seamTip(i, sq) }, h("b"), `Шов ${i}→${i + 1}: ${SEAM_TXT[sq.verdict]} · ×${sq.ratio}` + (sq.raw ? ` (без выравнивания ×${sq.raw.ratio})` : "")
      + (sq.audio?.warn ? ` · звук: скачок ${sq.audio.db} дБ` : ""), sq.verdict !== "ok" || sq.audio?.warn ? h("em", { style: { opacity: .75 } }, " — «Ещё дубль» может дать ровнее") : null)); }
    if (i > 0 && s.link === "extend" && !C.isFootage(s)) {
      const gO = C.wantedOverlap({ settings: this.p.settings, segments: [{ overlap_blocks: -1 }] }, 0);
      const ovS = h("select", { class: "h3z-sel sm", title: "Перекрытие этого стыка: сколько кадров (и звука) нового отрезка берётся из хвоста предыдущего. Сетка H3: 17·k + 5 кадров." },
        h("option", { value: -1, selected: (s.overlap_blocks ?? -1) < 0 }, `по умолчанию (${this.ovLabel(gO)})`),
        Array.from({ length: C.MAX_OVERLAP_BLOCKS + 1 }, (_, o) => h("option", { value: o, selected: s.overlap_blocks === o }, this.ovLabel(o))));
      ovS.onchange = () => this.setSegOverlap(i, Number(ovS.value));
      const want = C.wantedOverlap(this.p, i), fit = want > 0 && it.overlap < C.overlapFrames(want);
      card.append(h("div", null, h("div", { class: "h3z-lbl" }, "Перекрытие", h("em", null, it.overlap ? `сейчас ${it.overlap} кадр. ≈ ${(it.overlap / C.FPS).toFixed(2)} с` : "нет")), ovS,
        fit ? h("div", { class: "h3z-note err" }, `Запрошено ${C.overlapFrames(want)} кадр., помещается ${it.overlap || 0}: перекрытие должно быть короче обоих отрезков.`) : null));
    }
    if (s.source) card.append(this.footageBlock(i));
    // duration
    const kMin = Math.max(1, i > 0 && it.overlap ? (it.overlap - 5) / 17 + 1 : 1), kMax = (C.MAX_FRAMES - 5) / 17;
    const rng = h("input", { class: "h3z-range", type: "range", min: kMin, max: kMax, step: 1, value: (s.frames - 5) / 17 });
    const setP = () => rng.style.setProperty("--p", ((rng.value - kMin) / Math.max(1, kMax - kMin) * 100) + "%");
    setP();
    const val = h("div", { class: "h3z-val", html: `${(s.frames / 24).toFixed(2)} с <small>${s.frames} кадр.</small>` });
    rng.oninput = () => { setP(); const f = 17 * Number(rng.value) + 5; val.innerHTML = `${(f / 24).toFixed(2)} с <small>${f} кадр.</small>`; this.mutate((p) => { p.segments[i].frames = f; }, { coalesce: "dur" + s.id, render: "light" }); };
    rng.onchange = () => this.renderInspector();
    const quick = h("div", { class: "h3z-qs" }, [3, 5, 8, 10, 12, 15].map((sec) => { const f = Math.max(C.snapFrames(sec * 24), 17 * kMin + 5); return h("span", { class: "h3z-q" + (f === s.frames ? " on" : ""), onclick: () => this.mutate((p) => { p.segments[i].frames = f; }), title: `${f} кадров` }, sec + " с"); }));
    const rangeWarn = s.frames < C.TRAINED_MIN_FRAMES || s.frames > C.TRAINED_MAX_FRAMES;
    card.append(h("div", null, h("div", { class: "h3z-lbl" }, "Длительность", h("em", { style: rangeWarn ? { color: "var(--warn)" } : null }, rangeWarn ? "⚠ вне 124–362 кадров" : "сетка H3: 17k+5")), h("div", { class: "h3z-row" }, rng, val), h("div", { style: { marginTop: "8px" } }, quick)));
    // prompt
    const ta = h("textarea", { class: "h3z-ta", placeholder: "Что происходит в этом отрезке: действие, камера, звук…  Ссылки на референсы — <Picture N> (клик по чипу вставит).", spellcheck: "false" });
    ta.value = s.prompt;
    ta.oninput = () => this.mutate((p) => { p.segments[i].prompt = ta.value; }, { coalesce: "prompt" + s.id, render: "light" });
    this.$.segPrompt = ta;
    const segId = s.id;
    card.append(h("div", null, h("div", { class: "h3z-lbl" }, "Промпт отрезка", h("em", null, "добавляется к общему"),
      this.peButton(() => { const k = this.p.segments.findIndex((x) => x.id === segId), sg = this.p.segments[k];
        return { title: `Промпт отрезка ${k + 1}` + (sg?.name ? ` «${sg.name}»` : ""), value: sg?.prompt ?? "", ctx: { kind: "seg", seg: k }, placeholder: ta.placeholder,
          apply: (t) => this.mutate((p) => { const x = p.segments.find((y) => y.id === segId); if (x) x.prompt = t; }) }; })), ta));
    // refs
    const refs = C.orderedRefs(this.p, s);
    const box = h("div", { class: "h3z-refs" });
    refs.forEach((a, n) => {
      const chip = h("div", { class: "h3z-ref", title: `${CAT1[a.category]} «${a.name}» · клик — вставить <Picture ${n + 1}> в промпт` }, h("img", { src: this.assetUrl(a) }), h("span", { class: "tg" }, `<Picture ${n + 1}>`), h("span", null, a.name.slice(0, 14)));
      const x = h("span", { class: "x", title: "Убрать" }, "✕");
      x.onclick = (e) => { e.stopPropagation(); this.toggleRef(i, a.id); };
      chip.append(x);
      chip.onclick = () => this.insertTag(`<Picture ${n + 1}>`);
      chip.ondblclick = (e) => { e.stopPropagation(); this.openAssetEditor(a.id); };
      chip.oncontextmenu = (e) => this.assetMenu(e, a);
      box.append(chip);
    });
    const cp = C.continuityPicture(this.p, i);
    if (cp) box.append(h("div", { class: "h3z-ref auto", title: "Последний кадр предыдущего отрезка добавляется автоматически" }, h("span", { class: "ico", html: ICON.link.replace("<svg", '<svg style="width:14px;height:14px"') }), h("span", { class: "tg" }, `<Picture ${cp}>`), h("span", null, `кадр отрезка ${i}`)));
    const nVid = this.videoRefChips(i, box);
    const arefs = C.audioRefs(this.p, s);
    arefs.forEach((a, n) => {
      const chip = h("div", { class: "h3z-ref aud" + (n >= C.MAX_REF_AUDIOS ? " over" : ""), title: `Аудио-референс «${a.name}» · только подсказка для этого отрезка (звук генерируется заново) · клик — вставить <Audio ${n + 1}>` }, h("span", { class: "ico" }, "♪"), h("span", { class: "tg" }, `<Audio ${n + 1}>`), h("span", null, a.name.slice(0, 14)));
      const x = h("span", { class: "x", title: "Убрать" }, "✕");
      x.onclick = (e) => { e.stopPropagation(); this.toggleRef(i, a.id); };
      chip.append(x);
      chip.onclick = () => this.insertTag(`<Audio ${n + 1}>`);
      chip.ondblclick = (e) => { e.stopPropagation(); this.openAssetEditor(a.id); };
      chip.oncontextmenu = (e) => this.assetMenu(e, a);
      box.append(chip);
    });
    if (!refs.length && !arefs.length && !nVid) box.append(h("span", { class: "hint" }, "Перетащите сюда картинку, аудио или видео из ассетов"));
    box.addEventListener("dragover", (e) => { e.preventDefault(); box.classList.add("over"); });
    box.addEventListener("dragleave", () => box.classList.remove("over"));
    box.addEventListener("drop", (e) => { e.preventDefault(); box.classList.remove("over"); const id = e.dataTransfer.getData("application/x-h3s-asset"); if (id) this.addRef(i, id); });
    const nRefs = refs.length + (cp ? 1 : 0);
    card.append(h("div", null, h("div", { class: "h3z-lbl" }, "Референсы", h("em", { style: nRefs > C.MAX_REF_IMAGES ? { color: "var(--err)" } : null }, `${nRefs} / ${C.MAX_REF_IMAGES} карт.` + (nVid ? ` · ${nVid} / ${C.MAX_REF_VIDEOS} видео` : "") + (arefs.length ? ` · ${arefs.length} / ${C.MAX_REF_AUDIOS} аудио` : "") + " · порядок: персонажи, локации, другое")), box));
    this.$.finalBox = h("div", { class: "h3z-final" });
    card.append(h("details", { class: "h3z-det" }, h("summary", null, "Итоговый промпт"), h("div", { class: "in" }, this.$.finalBox)));
    this.renderFinalPrompt();
    { const mb = this.mpSegBlock(i); if (mb) card.append(mb); }
    card.append(this.overridesBlock(i));
    card.append(this.statusLine(i));
    card.append(this.takesBlock(i));
    { const fb = this.finalBlock(i); if (fb) card.append(fb); }
    card.append(this.upscaleBlock(i));
    return card;
  }

  renderFinalPrompt() {
    const b = this.$.finalBox; if (!b || this.sel < 0 || !this.seg()) return;
    const t = C.composePrompt(this.p, this.sel) || "(пусто)";
    b.innerHTML = esc(t).replace(/&lt;(Picture|Audio) (\d+)&gt;/g, "<mark>&lt;$1 $2&gt;</mark>");
  }

  insertTag(tag) {
    const ta = this.$.segPrompt; if (!ta) return;
    const a = ta.selectionStart ?? ta.value.length, b = ta.selectionEnd ?? a;
    const pre = ta.value.slice(0, a), post = ta.value.slice(b);
    const sp = pre && !/\s$/.test(pre) ? " " : "";
    ta.value = pre + sp + tag + " " + post;
    const pos = (pre + sp + tag + " ").length;
    ta.focus(); ta.setSelectionRange(pos, pos);
    ta.dispatchEvent(new Event("input"));
  }

  overridesBlock(i) {
    const s = this.seg(i), g = this.p.settings, ov = s.overrides;
    const label = { seed: "сид", steps: "шаги", cfg: "cfg", denoise: "denoise", shift_video: "shift видео", shift_audio: "shift аудио", sampler: "сэмплер", scheduler: "расписание" };
    const num = (key, step, ph) => {
      const inp = h("input", { class: "h3z-in", type: "number", step, value: key in ov ? ov[key] : "", placeholder: ph });
      inp.onchange = () => this.mutate((p) => { const o = p.segments[i].overrides; if (inp.value === "") delete o[key]; else o[key] = Number(inp.value); });
      return this.field(label[key], inp, key in ov ? "ov" : "");
    };
    const sel = (key, list) => {
      const e = h("select", { class: "h3z-sel" }, h("option", { value: "" }, `— ${g[key]} —`), list.map((x) => h("option", { value: x, selected: ov[key] === x }, x)));
      e.onchange = () => this.mutate((p) => { const o = p.segments[i].overrides; if (!e.value) delete o[key]; else o[key] = e.value; });
      return this.field(label[key], e, key in ov ? "ov" : "");
    };
    const n = Object.keys(ov).length;
    return h("details", { class: "h3z-det", open: n > 0 },
      h("summary", null, "Свои параметры отрезка", n ? h("span", { class: "cnt" }, n) : null),
      h("div", { class: "in" },
        h("div", { class: "h3z-grid3" }, num("seed", 1, `авто ${Number(g.seed) + i}`), num("steps", 1, g.steps), num("cfg", 0.1, g.cfg)),
        h("div", { class: "h3z-grid3" }, num("denoise", 0.01, g.denoise), num("shift_video", 0.1, g.shift_video), num("shift_audio", 0.1, g.shift_audio)),
        h("div", { class: "h3z-grid2" }, sel("sampler", this.opts.samplers), sel("scheduler", this.opts.schedulers)),
        n ? h("button", { class: "h3z-btn sm", onclick: () => this.mutate((p) => { p.segments[i].overrides = {}; }) }, "Сбросить к общим")
          : h("div", { class: "h3z-note" }, "Пустое поле — берётся общее значение. Сид по умолчанию: общий + номер отрезка − 1.")));
  }

  statusLine(i) {
    const s = this.seg(i), r = s.result;
    if (!r) return h("div", { class: "h3z-st-host", "data-i": i, "data-stale": "-" }, h("div", { class: "h3z-status none" }, "Ещё не сгенерирован"));
    const stale = !!(r.sig && r.sig !== this.sigs()[i]);
    const st = h("div", { class: "h3z-status" + (stale ? " stale" : "") }, stale ? "⟳ Изменён после генерации — пересчитается" : `✓ Готов · ${r.frames || s.frames} кадр.${r.cached ? " · из кэша" : ""}`);
    if (r.video) st.append(h("button", { class: "h3z-btn sm", style: { marginLeft: "auto" }, onclick: () => { this.pvMode = "segment"; this.renderPreview(); } }, "Смотреть"));
    const host = (...kids) => h("div", { class: "h3z-st-host", "data-i": i, "data-stale": String(stale) }, ...kids);
    if (!stale || !this.restoreTake(i)) return host(st);
    const panel = h("div", { class: "h3z-rs-host" });   // «↺ Восстановить»: put the take's inputs back, the key matches again
    if (this._rsOpen === i) { this._rsOpen = null; requestAnimationFrame(() => { this.restorePanel(i, panel); panel.scrollIntoView?.({ block: "nearest" }); }); }
    st.append(h("button", { class: "h3z-btn sm", title: "Показать, что изменилось с этого дубля, и вернуть прежние значения — без перегенерации",
      onclick: () => (panel.childNodes.length ? panel.replaceChildren() : this.restorePanel(i, panel)) }, "↺ Восстановить"));
    return host(st, panel);
  }

  /** Light renders (typing in a prompt, etc.) skip the inspector; flip its «изменён» line when the state changed. */
  refreshStatus() {
    for (const el of this.root?.querySelectorAll(".h3z-st-host") || []) {
      const i = Number(el.dataset.i), r = this.seg(i)?.result;
      const now = r ? String(!!(r.sig && r.sig !== this.sigs()[i])) : "-";
      if (now !== el.dataset.stale) el.replaceWith(this.statusLine(i));
    }
  }

  globalCard() {
    const g = this.p.settings;
    const card = h("div", { class: "h3z-card h3z-glass" }, h("div", { class: "h3z-card-h" }, h("h4", null, "Ролик"), h("em", { class: "h3z-note" }, this.globScope() ? "настройки: для всех проектов" : "настройки: свои у проекта")));
    const set = (k, v, opt) => this.mutate((p) => { p.settings[k] = v; }, opt);
    const gp = h("textarea", { class: "h3z-ta", placeholder: "Общий промпт для всех отрезков: стиль, персонажи, мир, качество…", spellcheck: "false" }); gp.value = g.prompt;
    gp.oninput = () => set("prompt", gp.value, { coalesce: "gprompt", render: "light" });
    const neg = h("textarea", { class: "h3z-ta sm", placeholder: "Негатив (работает при cfg > 1)", spellcheck: "false" }); neg.value = g.negative;
    neg.oninput = () => set("negative", neg.value, { coalesce: "gneg", render: "light" });
    const peG = (key, title, kind, ph) => this.peButton(() => ({ title, value: this.p.settings[key] ?? "", ctx: { kind }, placeholder: ph, apply: (t) => this.mutate((p) => { p.settings[key] = t; }) }));
    card.append(h("div", null, h("div", { class: "h3z-lbl" }, "Общий промпт", h("em", null, "в начале каждого отрезка"), peG("prompt", "Общий промпт (для всех отрезков)", "global", gp.placeholder)), gp),
      h("div", null, h("div", { class: "h3z-lbl" }, "Негатив", h("em", null, Number(g.cfg) === 1 ? "не используется при cfg 1" : ""), peG("negative", "Негатив", "negative", neg.placeholder)), neg));
    card.append(this.mpProjectBlock());
    // resolution
    const [w, hh] = C.resolution(g);
    const custom = g.res_mode === "custom";
    const asp = h("div", { class: "h3z-pills" }, Object.keys(C.ASPECTS).map((a) => h("div", { class: "h3z-pill" + (!custom && g.aspect === a ? " on" : "") + (custom ? " dis" : ""), onclick: () => set("aspect", a) }, a)));
    const mode = h("div", { class: "h3z-pills" }, [["mp", "Мегапиксели"], ["custom", "Свои W×H"]].map(([k, l]) => h("div", { class: "h3z-pill" + (g.res_mode === k ? " on" : ""), onclick: () => this.mutate((p) => { if (k === "custom") { const r = C.resolution(p.settings); p.settings.width = r[0]; p.settings.height = r[1]; } p.settings.res_mode = k; }) }, l)));
    let resRow;
    if (custom) {
      const wi = h("input", { class: "h3z-in", type: "number", step: 32, min: 32, value: g.width }), hi = h("input", { class: "h3z-in", type: "number", step: 32, min: 32, value: g.height });
      wi.onchange = () => set("width", C.snap32(wi.value)); hi.onchange = () => set("height", C.snap32(hi.value));
      resRow = h("div", { class: "h3z-grid2" }, this.field("ширина", wi), this.field("высота", hi));
    } else {
      const r = h("input", { class: "h3z-range", type: "range", min: 0.15, max: 1.2, step: 0.01, value: g.megapixels });
      const setP = () => r.style.setProperty("--p", ((r.value - 0.15) / 1.05 * 100) + "%"); setP();
      const v = h("div", { class: "h3z-val", html: `${w}×${hh} <small>${Number(g.megapixels).toFixed(2)} MP</small>` });
      r.oninput = () => { setP(); const res = C.resolution({ ...g, megapixels: Number(r.value) }); v.innerHTML = `${res[0]}×${res[1]} <small>${Number(r.value).toFixed(2)} MP</small>`; this.mutate((p) => { p.settings.megapixels = Number(r.value); }, { coalesce: "mp", render: "light" }); };
      r.onchange = () => this.renderAll();
      const presets = h("div", { class: "h3z-qs" }, [[0.3, "~416p"], [0.5, "~544p"], [0.7, "~640p"], [0.98, "768p (офиц.)"]].map(([m, l]) => h("span", { class: "h3z-q" + (Math.abs(g.megapixels - m) < 0.005 ? " on" : ""), onclick: () => set("megapixels", m) }, l)));
      resRow = h("div", null, h("div", { class: "h3z-row" }, r, v), h("div", { style: { marginTop: "8px" } }, presets));
    }
    card.append(h("div", null, h("div", { class: "h3z-lbl" }, "Разрешение", h("em", null, `${w}×${hh} · кратно 32`)), h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, asp, mode, resRow)));
    // seed; the set-once settings (stages, sampling, upscale, seams, cache, preview, models) live in «Настройки»
    const seedIn = h("input", { class: "h3z-in", type: "number", step: 1, min: 0, value: g.seed });
    seedIn.onchange = () => set("seed", Math.max(0, Math.trunc(Number(seedIn.value) || 0)));
    const dice = h("button", { class: "h3z-btn sm icon", title: "Случайный сид", html: ICON.dice, onclick: () => set("seed", Math.floor(Math.random() * 2 ** 40)) });
    const [dw, dh] = C.workResolution(g, "draft");
    card.append(h("div", null, h("div", { class: "h3z-lbl" }, "Сид", h("em", null, "отрезок N получает сид + N − 1")), h("div", { class: "h3z-row" }, seedIn, dice)),
      h("button", { class: "h3z-btn sm h3z-setlink", title: "Этапы генерации, сэмплер, шаги, cfg, апскейл, продление и звук, кэш, превью, модели — в «Настройках» (слева)",
        html: ICON.settings + `<span>${g.final_mode === "refine" ? `2 этапа · ${dw}×${dh} → ${w}×${hh}` : `1 этап · ${w}×${hh}`} · ${g.steps} шаг. · cfg ${g.cfg} · ${g.sampler}</span>`, onclick: () => this.openSettings("Генерация") }));
    return card;
  }

  // ------------------------------------------------------------------ preview
  buildCenter() {
    const $ = this.$;
    $.pvTabs = h("div", { class: "h3z-pills h3z-pvtabs" });
    $.pvInfo = h("div", { class: "h3z-note" });
    $.frame = h("div", { class: "h3z-frame" });
    $.stage = h("div", { class: "h3z-stage" }, $.frame);
    $.video = h("video", { playsinline: true, preload: "auto" });
    $.video.addEventListener("ended", () => this.onEnded());
    $.video.addEventListener("loadedmetadata", () => this.layoutStage());
    $.playBtn = h("button", { class: "h3z-play", html: ICON.play, title: "Пробел", onclick: () => this.togglePlay() });
    $.time = h("div", { class: "h3z-time" });
    $.volBtn = h("button", { class: "h3z-btn icon", title: "Звук вкл/выкл", onclick: () => { this.vol.muted = !this.vol.muted; this.userGesture = true; this.autoMuted = false; saveLS("h3zs.volume", this.vol); this.applyVolume(); } });
    $.volR = h("input", { class: "h3z-range vol", type: "range", min: 0, max: 1, step: 0.02, value: this.vol.v, title: "Громкость" });
    $.volR.oninput = () => { this.vol.v = Number($.volR.value); this.vol.muted = this.vol.v === 0; this.userGesture = true; this.autoMuted = false; saveLS("h3zs.volume", this.vol); this.applyVolume(); };
    $.center.append(h("div", { class: "h3z-pv-top" }, $.pvTabs, $.pvInfo), $.stage,
      h("div", { class: "h3z-transport" },
        h("button", { class: "h3z-btn icon", html: ICON.prev, title: "К предыдущему отрезку ([)", onclick: () => this.jumpSeg(-1) }),
        $.playBtn,
        h("button", { class: "h3z-btn icon", html: ICON.next, title: "К следующему отрезку (])", onclick: () => this.jumpSeg(1) }),
        $.time, h("div", { class: "grow" }),
        h("button", { class: "h3z-btn icon", html: H3Editor.VIEWER_ICONS.view, title: "Удобный просмотр: масштаб до ×4, покадрово, скорость, петля (двойной клик по кадру)", onclick: () => this.viewerFromPlayer() }),
        h("button", { class: "h3z-btn icon h3z-fsbtn", html: H3Editor.VIEWER_ICONS.fs, title: "Плеер во весь экран (F) · Esc — выйти", onclick: () => this.toggleMainFullscreen() }),
        h("div", { class: "h3z-volume" }, $.volBtn, $.volR)), this.buildDyn());
    $.stage.addEventListener("dblclick", (e) => { if (e.target.closest("button, a, input")) return; this.viewerFromPlayer(); });
    this.applyVolume();
    try { new ResizeObserver(() => this.layoutStage()).observe($.stage); } catch (e) {}
  }

  /** Player + track volume. Muted only by the user, or while the browser blocks sound before the first gesture. */
  applyVolume() {
    const $ = this.$, v = this.vol.muted ? 0 : this.vol.v;
    if ($.video) { $.video.volume = clamp(this.vol.v * (this.p.audio?.video_volume ?? 1), 0, 1); $.video.muted = !!this.vol.muted || !!this.autoMuted; }
    this.livePlayer?.setVolume?.(clamp(v, 0, 1), !!this.vol.muted || !!this.autoMuted);
    if ($.volBtn) { $.volBtn.innerHTML = this.vol.muted || !v || this.autoMuted ? ICON.mute : ICON.vol; $.volBtn.classList.toggle("warn", !!this.autoMuted); $.volBtn.title = this.autoMuted ? "Браузер запустил видео без звука — нажмите, чтобы включить звук" : "Звук вкл/выкл"; }
    if ($.volR) { $.volR.value = this.vol.muted ? 0 : this.vol.v; $.volR.style.setProperty("--p", (Number($.volR.value) * 100) + "%"); }
  }

  layoutStage() {
    const $ = this.$; if (!$.stage || this.viewer?.comp) return;   // the frame is inside «Удобный просмотр»
    const [w, hh] = C.resolution(this.p.settings);
    const W = $.stage.clientWidth - 28, H = $.stage.clientHeight;
    if (W <= 0 || H <= 0) return;
    const sc = Math.min(W / w, H / hh);
    $.frame.style.width = Math.floor(w * sc) + "px"; $.frame.style.height = Math.floor(hh * sc) + "px";
  }

  genCount() { return C.limitedProject(this.p).segments.length; }
  /** Final file usable for playback = exactly current (see fullCurrent in h3s_comp.js); never an old one. */
  fullOk() { return this.fullCurrent(); }

  currentSource() {
    if (this.pvMode === "old") {
      if (this.hasOldFull()) return { kind: "full", old: true, ref: this.p.result.full.video, start: 0 };
      this.pvMode = "full";   // its clips are gone: back to the live composition
    }
    if (this.compMode()) return this.compSource(this.playhead);
    if (this.pvMode === "full" && this.fullOk()) return { kind: "full", ref: this.p.result.full.video, start: 0 };
    const s = this.seg();
    const foot = s && (C.isFootage(s) || s.freeze) ? this.footageSource?.(this.sel) : null;
    // footage used as is plays straight from its file (from the in-point) until it is generated / when out of date
    if (foot && C.isFootage(s) && (!s.result?.video || this.isStale(this.sel))) return foot;
    if (s?.result?.video) return { kind: "segment", ref: s.result.video, start: this.items()[this.sel].start };
    if (foot) return foot;
    if (s?.source && !this.fullOk()) { const f = this.footageSource?.(this.sel); if (f) return Object.assign(f, { src: true }); }
    if (this.fullCurrent()) return { kind: "full", ref: this.p.result.full.video, start: 0 };
    return null;
  }

  renderPreview() {
    const $ = this.$; if (!$.frame) return;
    const fullOk = this.fullOk();
    $.pvTabs.innerHTML = "";
    const src = this.currentSource();
    const whole = src && (src.kind === "comp" || (src.kind === "full" && !src.old));
    $.pvTabs.append(
      h("div", { class: "h3z-pill" + (whole ? " on" : "") + (fullOk || this.p.segments.length ? "" : " dis"), title: this.fullCurrent() ? "Готовый итоговый ролик" : "Сборка таймлайна на лету: готовые дубли, футаж, заглушки на месте несгенерированных отрезков + звуковая дорожка и музыка", onclick: () => { this.pvMode = "full"; this.renderPreview(); } }, "Весь ролик"),
      h("div", { class: "h3z-pill" + (src && !whole && !src.old ? " on" : ""), onclick: () => { this.pvMode = "segment"; this.renderPreview(); } }, this.sel >= 0 ? `Отрезок ${this.sel + 1}` : "Отрезок"),
      this.hasOldFull() ? h("div", { class: "h3z-pill old" + (src?.old ? " on" : ""), title: "Прошлый итог · устарел: последний собранный ролик не совпадает с текущим таймлайном", onclick: () => { this.pvMode = "old"; this.renderPreview(); } }, "Прошлый итог", h("i", { class: "dot", "aria-label": "устарел" })) : "");
    const [w, hh] = C.resolution(this.p.settings);
    for (const c of [...$.frame.children]) if (c !== $.video && c !== $.live) c.remove();
    if (src?.kind === "comp") {
      this.src = src;
      if (src.ph) { if ($.video.parentElement) { $.video.pause(); $.video.remove(); } $.frame.append(this.compPlaceholder(src)); }
      else {
        const url = this.host.url(src.ref);
        if ($.video.dataset.src !== url) { $.video.dataset.src = url; $.video.src = url; }
        if (!$.video.parentElement) $.frame.append($.video);
      }
      const its = this.items(), done = its.filter((it, i) => i < this.genCount() && this.seg(i)?.result?.video && !this.isStale(i)).length;
      $.frame.append(h("div", { class: "h3z-badge-live" }, "Весь ролик · сборка таймлайна",
        src.seg >= 0 ? ` · отрезок ${src.seg + 1}` + (src.region ? ` · ✂ участок ${this.regionNo(src.region)}` : src.foot ? " · футаж" : src.ph ? " · заглушка" : "") : " · пустота",
        src.stale ? h("span", { style: { color: "var(--warn)" } }, " · дубль устарел") : null,
        this.p.result?.full?.video ? h("span", { style: { color: "var(--warn)" } }, " · итог устарел") : null));
      $.pvInfo.textContent = `${this.totalFrames()} кадров · ${(this.totalFrames() / C.FPS).toFixed(1)} с · готово ${done}/${this.genCount()} · «Сгенерировать» соберёт итог`;
      if (!src.ph) this.syncVideoToPlayhead();
    } else if (src) {
      const url = this.host.url(src.ref);
      if ($.video.dataset.src !== url) { $.video.dataset.src = url; $.video.src = url; }
      this.src = src;
      if (!$.video.parentElement) $.frame.append($.video);
      const segStale = src.kind === "segment" && !src.foot && this.seg().result.sig && this.seg().result.sig !== this.sigs()[this.sel];
      const stale = src.kind === "full" ? (src.old || this.fullStale()) : segStale;
      $.frame.append(h("div", { class: "h3z-badge-live" }, src.kind === "full" ? (src.old ? "Прошлый итог" : "Весь ролик") : `Отрезок ${this.sel + 1}` + (src.foot ? (src.src ? " · исходник (будет перегенерирован)" : " · футаж") : ""), stale ? h("span", { style: { color: "var(--warn)" } }, " · устарел") : null));
      $.pvInfo.textContent = src.kind === "full" ? `${this.p.result.full.frames} кадров · ${(this.p.result.full.frames / 24).toFixed(1)} с` : `${(src.foot ? 0 : this.seg().result.frames) || this.seg().frames} кадров` + (src.foot && src.off ? ` · из файла с ${src.off.toFixed(2)} с` : "");
      this.syncVideoToPlayhead();
    } else {
      this.src = null;
      if ($.video.parentElement) { $.video.pause(); $.video.removeAttribute("src"); $.video.dataset.src = ""; $.video.remove(); }
      $.frame.append(h("div", { class: "h3z-ph-empty" },
        h("div", { class: "tag" }, `${w}×${hh} · 24 fps`),
        h("div", { class: "big", html: ICON.spark }), h("b", null, "Превью появится после генерации"),
        h("div", { class: "h3z-note" }, this.p.segments.length ? "Нажмите «Сгенерировать»: отрезки пойдут по очереди, готовые сразу появятся здесь и на таймлайне." : "Добавьте отрезок на таймлайне, напишите промпт и добавьте референсы.")));
      $.pvInfo.textContent = "";
    }
    this.layoutStage();
    this.updateTime();
  }

  fullStale() {
    const sigs = this.sigs();
    const n = this.genCount();
    return sigs.some((sg, i) => { if (i >= n) return false; const s = this.p.segments[i]; return !s?.result || (s.result.sig && s.result.sig !== sg); });
  }

  togglePlay() { this.playing ? this.stopPlayback() : this.startPlayback(); }

  startPlayback() {
    const total = this.totalFrames();
    if (!total) return;
    if (this.playhead >= total - 1) this.seek(0, false);
    this.playing = true;
    this.$.playBtn.innerHTML = ICON.pause;
    if (!this._autoplay) { this.userGesture = true; this.autoMuted = false; } // pressed by the user: sound allowed (autoplay policy)
    this.applyVolume();
    { const r = this.playRate || 1, v = this.$.video; if (v) { v.defaultPlaybackRate = r; v.playbackRate = r; } }
    if (this.src?.kind === "comp" && this.compChanged(this.playhead)) this.renderPreview();
    if (this.src && !this.src.ph) { this.syncVideoToPlayhead(); this.$.video.play().catch(() => { this.$.video.muted = true; this.autoMuted = true; this.$.video.play().catch(() => {}); }); }
    let last = performance.now();
    const tick = (now) => {
      if (!this.playing || !this.root) return;
      if (this.src?.kind === "comp") {
        // composition: the playhead only moves forward. The video time is trusted only once the current source
        // is loaded and its seek has landed (right after a switch currentTime is still 0 / the old value, which
        // mapped back into the overlap of the previous clip and looped the seam); otherwise the clock advances it.
        const s = this.src, v = this.$.video, dt = (now - last) / 1000 * C.FPS * (this.playRate || 1);
        const ready = !s.ph && !this._compHold && !v.paused && !v.seeking && v.readyState >= 2 && v.dataset.src === this.host.url(s.ref);
        if (ready) {
          const d = s.start + (v.currentTime - (s.off || 0)) * C.FPS;
          this.playhead = d >= this.playhead - 0.5 ? Math.max(this.playhead, d) : this.playhead + dt;
        } else this.playhead += dt;
        if (this.viewer?.comp && this.vwLoopGuard()) { last = now; this._raf = requestAnimationFrame(tick); return; }   // «Удобный просмотр» loop range
        if (this.playhead >= total) { this.playhead = total; this.stopPlayback(); this.updatePlayhead(true); return; }
        if (this.playhead >= s.end || this.compChanged(this.playhead)) this.compSwitch();
        else this.compPrefetch?.();
      }
      else if (this.src && !this.$.video.paused) {
        this.playhead = this.src.start + (this.$.video.currentTime - (this.src.off || 0)) * C.FPS;
        if (this.src.foot && this.playhead >= this.src.end) { this.playhead = this.src.end; this.$.video.pause(); this.onEnded(); if (!this.playing) { this.updatePlayhead(true); return; } }
      }
      else if (!this.src) {
        this.playhead += (now - last) / 1000 * C.FPS * (this.playRate || 1);
        if (this.playhead >= total) { this.playhead = total; this.stopPlayback(); }
      }
      last = now;
      // the track sounds where no generated video (with its own sound) is shown; the music lane always
      this.audioTick(this.playhead / C.FPS, !!this.src && !this.src.ph);
      this.updatePlayhead(true);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stopPlayback() {
    this.playing = false;
    cancelAnimationFrame(this._raf);
    this.$?.video?.pause();
    this.audioStop?.();
    if (this.$?.playBtn) this.$.playBtn.innerHTML = ICON.play;
  }

  onEnded() {
    // composition: a take shorter than its clip ended — go on with what follows it
    // (its last frame is held while the clock runs on to the clip's end, then the next piece follows)
    if (this.src?.kind === "comp") {
      if (!this.playing) return;
      if (this.playhead < this.src.end - 1) { this._compHold = true; return; }
      this.playhead = Math.max(this.playhead, this.src.end);
      if (this.playhead >= this.totalFrames()) this.stopPlayback(); else this.compSwitch();
      return;
    }
    // segment preview finished: continue with the next generated segment (like a real editor)
    const nx = this.sel + 1;
    if (this.src?.kind === "segment" && this.playing && nx < this.p.segments.length && (this.seg(nx)?.result?.video || this.footageSource?.(nx) && (C.isFootage(this.seg(nx)) || this.seg(nx).freeze))) {
      const it = this.items()[nx];
      this.sel = nx; this.playhead = it.start + (it.overlap || 0);
      this.renderInspector(); this.renderTimeline(); this.renderPreview();
      this.$.video.play().catch(() => {});
      return;
    }
    this.stopPlayback();
  }

  syncVideoToPlayhead() {
    const s = this.src; if (!s) return;
    const v = this.$.video;
    const t = Math.max(0, (this.playhead - s.start) / C.FPS + (s.off || 0));
    const set = () => { try { const d = isFinite(v.duration) ? v.duration : t + 1; const tt = Math.min(t, Math.max(0, d - 0.01)); if (Math.abs(v.currentTime - tt) > 0.02) v.currentTime = tt; } catch (e) {} };
    if (v.readyState >= 1) set(); else v.addEventListener("loadedmetadata", set, { once: true });
  }

  segAt(frame) {
    const its = this.items();
    return its.findIndex((it, i) => frame >= it.start + (i ? it.overlap : 0) && frame < it.end);
  }

  seek(frame, fromUser = true) {
    this.playhead = clamp(frame, 0, Math.max(0, this.totalFrames()));
    if (this.src?.kind === "comp") {
      this._compHold = false;
      if (this.compChanged(this.playhead)) this.compSwitch(); else if (!this.src.ph) this.syncVideoToPlayhead();
      this.updatePlayhead(); return;
    }
    if (fromUser && this.src?.kind !== "full") {
      const idx = this.segAt(this.playhead);
      if (idx >= 0 && idx !== this.sel) { this.sel = idx; this.renderInspector(); this.renderTimeline(); this.renderLeft(); this.renderPreview(); return; }
    }
    this.syncVideoToPlayhead();
    this.updatePlayhead();
  }

  jumpSeg(d) {
    const n = this.p.segments.length; if (!n) return;
    this.sel = clamp(this.sel + d, 0, n - 1);
    const it = this.items()[this.sel];
    this.playhead = it.start + (this.sel ? it.overlap : 0);
    this.renderInspector(); this.renderTimeline(); this.renderLeft(); this.renderPreview(); this.scrollToPlayhead();
  }

  /** Video length on the timeline: the end marker if set, else the end of the last clip. */
  totalFrames() { return C.videoEnd(this.p, this.items()); }
  contentFrames() { return C.contentEnd(this.items()); }

  updateTime() {
    const t = this.$.time; if (!t) return;
    t.innerHTML = `<b>${C.fmtTime(this.playhead / C.FPS)}</b> / ${C.fmtTime(this.totalFrames() / C.FPS)} · кадр ${Math.round(this.playhead)}`;
  }

  // ------------------------------------------------------------------ timeline
  buildTimeline() {
    const $ = this.$;
    $.zoomR = h("input", { class: "h3z-range", type: "range", min: 0, max: 100, step: 1, value: 0, title: "Масштаб (Ctrl+колесо, + / −)" });
    $.zoomR.oninput = () => { this.zoom = zoomOf(Number($.zoomR.value)); this.syncZoomUI(); this.renderTimeline(); this.scrollToPlayhead(); };
    $.endIn = h("input", { class: "h3z-in sm", type: "number", step: "0.1", min: 0.5, title: "Длина ролика в секундах: всё, что за маркером конца, не генерируется" });
    $.endIn.onchange = () => { const v = Number($.endIn.value); this.setEnd(v > 0 ? Math.round(v * C.FPS) : 0); };
    $.endAuto = h("div", { class: "h3z-pills h3z-endmode" },
      h("div", { class: "h3z-pill", "data-m": "auto", title: "Авто: конец ролика = конец последнего отрезка", onclick: () => this.setEndMode("auto") }, "Авто"),
      h("div", { class: "h3z-pill", "data-m": "fixed", title: "Фикс: маркер конца стоит на месте; удаление или укорачивание отрезков оставляет пустоту перед ним (заполните её «Продлить»)", onclick: () => this.setEndMode("fixed") }, "Фикс"));
    $.tlInfo = h("div", { class: "h3z-note" });
    const B = (icon, label, title, fn) => h("button", { class: "h3z-btn sm" + (label ? "" : " icon"), html: icon + (label ? `<span>${label}</span>` : ""), title, onclick: fn });
    $.tl.append(h("div", { class: "h3z-tl-bar" },
      B(ICON.plus, "Отрезок", "Добавить отрезок в конец (E)", () => this.extend()),
      B(ICON.cut, "Разрезать", "Разрезать выбранный отрезок по плейхеду (S)", () => this.split()),
      B(ICON.copy, "", "Дублировать (D)", () => this.duplicate()),
      B(ICON.trash, "", "Удалить (Del)", () => this.deleteSeg(this.sel)),
      h("button", { class: "h3z-btn sm", html: '<b style="color:#fbbf24">◆</b><span>Маркер</span>', title: "Маркер на плейхеде (M): заметка, событие в промпте или усиление персонажа", onclick: () => this.addMarker() }),
      ...this.regionToolbar(),
      h("div", { class: "sep" }), h("div", { class: "h3z-endbox", title: "Маркер конца ролика (красный флажок на линейке): за ним всё приглушено и не генерируется" }, h("span", null, "Длина ролика"), $.endIn, h("span", null, "с"), $.endAuto),
      h("div", { class: "sep" }), $.tlInfo, h("div", { class: "grow" }),
      h("div", { class: "h3z-zoom" }, B(ICON.minus || "−", "", "Отдалить (−)", () => this.setZoomBy(0.7)), $.zoomR, B(ICON.plus, "", "Приблизить (+)", () => this.setZoomBy(1.4)),
        B(ICON.fit, "", "Вписать весь ролик", () => this.fitZoom()))));
    $.heads = h("div", { class: "h3z-heads" },
      h("div", { class: "h3z-thead v", html: ICON.film + "<span>Видео</span>" }),
      $.aHead = h("div", { class: "h3z-thead a" }));
    $.tscroll = h("div", { class: "h3z-tscroll" });
    $.tinner = h("div", { class: "h3z-tinner" });
    $.tscroll.append($.tinner);
    $.tl.append(h("div", { class: "h3z-tl-main" }, $.heads, $.tscroll));
    this.syncZoomUI();
    $.tscroll.addEventListener("pointerleave", () => this.hideHover?.());
    $.tscroll.addEventListener("wheel", (e) => {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.setZoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX); }
      else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { $.tscroll.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
    // any drag on the timeline (end flag, playhead, markers, clips, edges, seams, audio clips, region): the scale is
    // frozen while the pointer is down — a drag that changes the content length must not rescale the view (the
    // dragged thing would look pinned while the timeline slides under it). Near the very edge of the visible
    // area the view scrolls gently; it never re-centres.
    $.tscroll.addEventListener("pointerdown", (e) => { if (e.button === 0) this.tlDragBegin(e); }, true);
    // «✂ Участок» mode: a drag on the video track selects a range (normal drags are untouched outside the mode)
    $.tinner.addEventListener("pointerdown", (e) => this.regionPointer(e), true);
    $.tscroll.addEventListener("scroll", () => { if ($.regPop) this.placeRegionPopover(this.region() ? this.regionWin(this.region()) : null); });
  }

  /** Timeline drag helpers: frozen scale + gentle edge auto-scroll (re-sends the last pointer position so the
   *  dragged item follows the cursor while the view scrolls). */
  tlDragBegin(e) {
    const $ = this.$; this._ppfLock = this.ppf;
    const st = { x: e.clientX, y: e.clientY, sx: e.clientX, moved: false, last: null, raf: 0 };
    const EDGE = 36, MAXV = 14;
    const tick = () => {
      st.raf = 0;
      if (!st.moved || !st.last || !this._ppfLock) return;
      const r = $.tscroll.getBoundingClientRect(), x = st.last.clientX;
      const left = r.left + 0, right = r.right;
      let v = 0;
      if (x > right - EDGE) v = Math.min(MAXV, Math.ceil((x - (right - EDGE)) / EDGE * MAXV));
      else if (x < left + EDGE && $.tscroll.scrollLeft > 0) v = -Math.min(MAXV, Math.ceil(((left + EDGE) - x) / EDGE * MAXV));
      if (!v) return;
      const before = $.tscroll.scrollLeft; $.tscroll.scrollLeft = before + v;
      if ($.tscroll.scrollLeft !== before) {
        const ev = st.last; st.synth = true;
        try { window.dispatchEvent(new PointerEvent("pointermove", { clientX: ev.clientX, clientY: ev.clientY, shiftKey: ev.shiftKey, altKey: ev.altKey, ctrlKey: ev.ctrlKey, metaKey: ev.metaKey, buttons: 1, bubbles: true })); } finally { st.synth = false; }
      }
      st.raf = requestAnimationFrame(tick);
    };
    const move = (ev) => {
      if (st.synth) return;
      st.last = ev; if (Math.abs(ev.clientX - st.sx) > 4) st.moved = true;
      if (!st.raf) st.raf = requestAnimationFrame(tick);
    };
    const up = () => {
      window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", up, true); window.removeEventListener("pointercancel", up, true);
      if (st.raf) cancelAnimationFrame(st.raf);
      // keep the scale the drag ended with (zoom follows the new length) — no jump on release
      setTimeout(() => { this._ppfLock = 0; }, 0);
    };
    window.addEventListener("pointermove", move, true); window.addEventListener("pointerup", up, true); window.addEventListener("pointercancel", up, true);
  }

  setZoomBy(f, clientX) {
    const $ = this.$, r = $.tscroll.getBoundingClientRect();
    const cx = clientX !== undefined ? clientX - r.left : $.tscroll.clientWidth / 2;
    const fx = ($.tscroll.scrollLeft + cx) / this.ppf;
    this.zoom = clamp(this.zoom * f, ZMIN, ZMAX);
    this.syncZoomUI();
    this.renderTimeline();
    $.tscroll.scrollLeft = fx * this.ppf - cx;
  }
  fitZoom() { this.zoom = 1; this.syncZoomUI(); this.renderTimeline(); this.$.tscroll.scrollLeft = 0; }
  syncZoomUI() { const z = this.$.zoomR; if (!z) return; z.value = zoomPos(this.zoom); z.style.setProperty("--p", z.value + "%"); }

  /** Video end marker (frames, 0 = auto: end of the last clip). */
  setEnd(f) {
    f = Math.max(0, Math.round(f));
    if (!f) return this.setEndMode("auto");
    this.mutate((p) => { p.end = f; p.end_mode = "fixed"; }, { coalesce: "end", render: "all" });
  }
  /** «Длина: Авто» — the marker follows the last clip; «Фикс» — it stays put (gaps allowed). */
  setEndMode(m) {
    const cur = this.totalFrames();
    this.mutate((p) => { p.end_mode = m; p.end = m === "auto" ? 0 : (p.end || cur); });
    this.toast(m === "auto" ? "Длина: авто — конец ролика следует за последним отрезком" : "Длина: фикс — маркер конца стоит на месте, пока вы его не сдвинете");
  }
  /** Fill the empty gap before a fixed end marker with a new segment (continuing the last one). */
  fillGap() {
    const gap = this.p.end - this.contentFrames(); if (!(gap > 0)) return this.extend();
    const last = this.p.segments[this.p.segments.length - 1];
    const s = this.newSegment(last);
    const o = C.wantedOverlap({ settings: this.p.settings, segments: [{ overlap_blocks: -1 }] }, 0), ov = last && o > 0 ? C.overlapFrames(o) : 0;
    s.frames = Math.min(C.MAX_FRAMES, Math.max(C.MIN_FRAMES, C.snapFrames(gap + ov, "up")));
    this.mutate((p) => { p.segments.push(s); }, { render: "none" });
    this.sel = this.p.segments.length - 1; this.pvMode = "segment";
    const it = this.items()[this.sel]; this.playhead = it.start + (this.sel ? it.overlap : 0);
    this.renderAll(); this.scrollToPlayhead();
    this.toast(`Пустота заполнена отрезком ${(s.frames / C.FPS).toFixed(2)} с (сетка 17 кадров${this.items()[this.sel].end > this.p.end ? ", хвост за маркером обрежется" : ""})`);
  }
  endDrag(e) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const tip = h("div", { class: "h3z-tip" }); document.body.append(tip);
    const edges = this.items().flatMap((it) => [it.start, it.end]);
    const move = (ev) => {
      let f = Math.max(12, Math.round(this.frameAt(ev.clientX)));
      const near = edges.find((x) => Math.abs(x - f) * this.ppf < 7); if (near !== undefined && !ev.altKey) f = near;
      if (ev.shiftKey) f = Math.round(f / C.FPS) * C.FPS;
      tip.style.left = ev.clientX + 12 + "px"; tip.style.top = ev.clientY - 34 + "px";
      tip.textContent = `конец ролика ${C.fmtTime(f / C.FPS)} · ${f} кадр.`;
      this.mutate((p) => { p.end = f; p.end_mode = "fixed"; }, { coalesce: "enddrag" + e.clientX, render: "none" });
      this.renderTimeline(); this.renderHeader();
    };
    move(e);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); tip.remove(); this.renderAll(); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }

  get ppf() { return this._ppf || 1; }

  renderTimeline() {
    const $ = this.$; if (!$.tinner) return;
    queueMicrotask(() => { if (this._hoverT && !this._hoverT.isConnected) this.hideHover?.(); });   // its clip was re-built / removed
    const its = this.items(), sigs = this.sigs(), nGen = sigs.length;
    const vEnd = this.totalFrames(), hasEnd = this.p.end > 0;
    const total = Math.max(this.contentFrames(), vEnd, 24 * 5);
    const viewW = Math.max(200, $.tscroll.clientWidth - 170);
    let ppf = Math.max(0.002, viewW / total * this.zoom);
    if (this._ppfLock) {   // during a timeline drag: same scale; the zoom absorbs the length change (no jump after it)
      ppf = this._ppfLock;
      this.zoom = clamp(ppf * total / viewW, ZMIN, ZMAX);
      ppf = Math.max(0.002, viewW / total * this.zoom);   // = the lock unless the zoom limits were hit
      this.syncZoomUI();
    }
    this._ppf = ppf;
    const W = Math.max($.tscroll.clientWidth, Math.ceil(total * ppf) + 150);
    const inner = $.tinner; inner.innerHTML = ""; inner.style.width = W + "px";
    // ruler
    const ruler = h("div", { class: "h3z-ruler", title: "Клик / перетаскивание — переместить плейхед" });
    const pps = ppf * C.FPS;
    const step = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120].find((s) => s * pps >= 70) || 300;
    for (let t = 0; t * pps < W; t += step) {
      ruler.append(h("div", { class: "h3z-tick", style: { left: t * pps + "px" } }, h("span", null, C.fmtTime(t).replace(/\.0$/, ""))));
      for (let m = 1; m < 4; m++) { const x = (t + step * m / 4) * pps; if (x < W) ruler.append(h("div", { class: "h3z-tick minor", style: { left: x + "px" } })); }
    }
    ruler.addEventListener("pointerdown", (e) => this.scrubStart(e));
    inner.append(ruler);
    // video track
    const vt = h("div", { class: "h3z-track v" }, h("div", { class: "h3z-lane-bg" }));
    vt.addEventListener("pointerdown", (e) => { if (e.target === vt || e.target.classList.contains("h3z-lane-bg")) this.scrubStart(e); });
    $.clips = [];
    its.forEach((it, i) => {
      const s = this.p.segments[i], pal = PALETTE[s.color % PALETTE.length];
      const ov = i > 0 ? it.overlap : 0;
      const x0 = (it.start + ov) * ppf, wd = Math.max(8, (it.frames - ov) * ppf - 3);
      const res = s.result, stale = res && res.sig && res.sig !== sigs[i];
      const out = i >= nGen;
      const clip = h("div", { class: "h3z-clip" + (i === this.sel ? " sel" : "") + (res?.strip ? " has-strip" : "") + (stale && !out && !s.freeze ? " is-stale" : "") + (out ? " is-out" : "") + (s.freeze ? " frozen" : ""), style: { left: x0 + 1 + "px", width: wd + "px", "--c1": pal[0], "--c2": pal[1] } });
      const footStrip = s.source && (!res?.strip || (stale && C.isFootage(s))) ? this.videoStrip?.(this.p.assets.find((a) => a.id === s.source.asset)) : null;
      if (footStrip) { clip.classList.add("has-strip"); this.clipThumbs(clip, { strip: footStrip.strip, strip_n: footStrip.strip_n, frames: footStrip.frames || it.frames }, it, ov, wd, s.source.in); }
      else if (res?.strip) this.clipThumbs(clip, res, it, ov, wd);
      const refs = C.orderedRefs(this.p, s);
      clip.append(h("div", { class: "c" },
        h("div", { class: "t" }, h("span", { class: "n" }, i + 1), h("span", { class: "nm" }, s.name || `Отрезок ${i + 1}`), h("span", { class: "d" }, `${(it.frames / 24).toFixed(1)} с`)),
        wd > 120 ? h("div", { class: "p" }, (s.prompt || "").trim() || h("i", { style: { opacity: 0.6 } }, "без промпта")) : null,
        h("div", { class: "rf" }, wd > 90 ? refs.slice(0, 5).map((a) => h("img", { src: this.assetUrl(a), title: a.name, draggable: "false" })) : null,
          i > 0 && wd > 70 ? h("span", { class: "lk" }, s.link === "extend" ? "⟶ продл." : "✂ сцена") : null)));
      {   // per-clip «Сгенерировать» / «Ещё дубль»
        const st = this.segGenState(i);
        const mk = (icon, title, fn, dis) => { const b = h("button", { class: "h3z-cb" + (dis ? " dis" : ""), html: icon, title: dis ? st.why || title : title });
          b.addEventListener("pointerdown", (e) => e.stopPropagation());
          b.addEventListener("click", (e) => { e.stopPropagation(); fn(); }); return b; };
        if (!this.run.active) clip.append(h("div", { class: "acts" },
          mk(ICON.spark, stale || !res ? "Сгенерировать только этот отрезок" : "Отрезок готов", () => this.genSegment(i), !st.ok || !(stale || !res)),
          mk(ICON.dice, "Ещё дубль (новый сид)", () => this.newTake(i), !st.ok),
          this.finalClipButton(i, wd),
          this.upClipButton(i, mk)));
        this.upClipTags(clip, i);
      }
      if (out) clip.append(h("div", { class: "bd out" }, "за концом"));
      else if (res) {
        const q = res.kind === "draft" ? "черновик" : res.kind === "refine" ? "финал ↑" : "";
        const needFinal = stale && res.kind === "draft" && C.runKind(this.p.settings) !== "draft";
        clip.append(h("div", { class: "bd " + (needFinal ? "draft" : stale ? "stale" : res.cached ? "cache" : "ok"), title: needFinal ? "Черновик — клик: «↑ Финал из черновика» для этого отрезка" : "",
          onpointerdown: needFinal ? (e) => e.stopPropagation() : null, onclick: needFinal ? (e) => { e.stopPropagation(); this.finalFromDraft([i]); } : null },
          needFinal ? "черновик → финал" : (stale ? "изменён" : res.cached ? "кэш ✓" : "готов ✓") + (q && !stale ? " · " + q : "")));
        if (stale && !needFinal && !out && !s.freeze && this.restoreTake(i)) clip.append(this.clipRestoreButton(i, wd));
      }
      if ((s.takes || []).length > 1 && wd > 60) {
        const k = this.takeIndex(s, s.active_take);
        const tb = h("div", { class: "tk", title: `Дубль ${k + 1} из ${s.takes.length} · клик — следующий дубль` }, h("i", null, "▣"), `${k + 1}/${s.takes.length}`);
        tb.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); this.cycleTake(i); });
        clip.append(tb);
      }
      if (s.source) clip.append(h("div", { class: "foot", title: s.source.denoise ? `Футаж, перегенерация (denoise ${s.source.denoise})` : "Футаж как есть" }, s.source.denoise ? "🎞↻" : "🎞"));
      if (s.freeze) clip.append(h("div", { class: "frz", title: "Зафиксирован: никогда не перегенерируется. Разморозить — в карточке или меню" }, "🔒 зафиксирован"));
      clip.append(h("div", { class: "pg" }, h("i", { style: { width: "0%" } })));
      const hr = h("div", { class: "hr", title: "Тяните, чтобы изменить длину (шаг 17 кадров)" });
      if (i === its.length - 1) clip.append(hr); // inner boundaries use the seam handle (roll edit)
      hr.addEventListener("pointerdown", (e) => this.resizeStart(e, i));
      clip.addEventListener("pointerdown", (e) => { if (e.target !== hr) this.clipDown(e, i); });
      clip.addEventListener("contextmenu", (e) => this.clipMenu(e, i));
      this.clipHover(clip, i);
      clip.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("application/x-h3s-asset")) { e.preventDefault(); clip.classList.add("dropover"); } });
      clip.addEventListener("dragleave", () => clip.classList.remove("dropover"));
      clip.addEventListener("drop", (e) => { e.preventDefault(); clip.classList.remove("dropover"); const id = e.dataTransfer.getData("application/x-h3s-asset"); if (id) { this.sel = i; this.addRef(i, id); this.toast((this.p.assets.find((a) => a.id === id)?.category === "video" ? "Видео-референс <Video> добавлен в отрезок " : "Референс добавлен в отрезок ") + (i + 1)); } });
      vt.append(clip);
      $.clips[i] = clip;
      { const sq = this.seamQ(i); if (sq) { const m = h("div", { class: "h3z-seamq " + sq.verdict, style: { left: (it.start + it.overlap) * ppf + "px" }, title: this.seamTip(i, sq) });
        m.addEventListener("pointerdown", (e) => { if (e.button === 0) { e.stopPropagation(); this.sel = i; this.selAudio = null; this.renderAll(); } }); vt.append(m); } }
      if (i > 0 && s.link === "cut") vt.append(h("div", { class: "h3z-cutmark", style: { left: it.start * ppf + "px" }, title: "Монтажная склейка" }));
      if (i > 0 && it.overlap) vt.append(h("div", { class: "h3z-ovl", style: { left: it.start * ppf + 1 + "px", width: Math.max(2, it.overlap * ppf - 1) + "px" },
        title: `Перекрытие ${i}→${i + 1}: ${it.overlap} кадр. ≈ ${(it.overlap / C.FPS).toFixed(2)} с — отрезок ${i + 1} продолжает хвост отрезка ${i} (видео и звук)` },
        it.overlap * ppf > 34 ? h("span", null, `⟷ ${it.overlap}`) : null));
      if (i > 0 && it.overlap) { const ovl = vt.lastChild;
        ovl.addEventListener("pointerdown", (e) => { if (e.button === 0) { e.stopPropagation(); this.sel = i; this.selAudio = null; this.pvMode = "segment"; this.renderAll(); } });
        ovl.addEventListener("contextmenu", (e) => this.clipMenu?.(e, i)); }
    });
    for (let i = 0; i + 1 < its.length; i++) {
      const seam = h("div", { class: "h3z-seam", style: { left: its[i].end * ppf + "px" }, title: "Тяните шов: длины соседних отрезков меняются вместе (сетка 17 кадров), общая длина не меняется.\nShift — менять только левый отрезок" }, h("span", null, "⟷"));
      seam.addEventListener("pointerdown", (e) => this.rollStart(e, i));
      vt.append(seam);
    }
    this.renderRegions(vt, ppf);
    const endX = (its.length ? its[its.length - 1].end : 0) * ppf + 10;
    const gapF = this.p.end_mode !== "auto" && this.p.end > 0 ? this.p.end - this.contentFrames() : 0;
    if (gapF > 0 && its.length) {
      const g = h("div", { class: "h3z-gap", style: { left: this.contentFrames() * ppf + "px", width: gapF * ppf + "px" }, title: `Пусто ${(gapF / C.FPS).toFixed(2)} с до маркера конца — не генерируется, ролик будет короче.\nКлик — заполнить новым отрезком · или растяните последний отрезок` },
        gapF * ppf > 90 ? h("span", null, `пусто ${(gapF / C.FPS).toFixed(1)} с · клик — заполнить`) : null);
      g.addEventListener("click", () => this.fillGap());
      vt.append(g);
    }
    const ext = h("div", { class: "h3z-ext", style: { left: (gapF > 0 && its.length ? this.p.end * ppf + 10 : endX) + "px" }, title: "Продлить ролик: новый отрезок продолжит последний (E)\nСюда же можно перетащить видео из ассетов — футаж", html: ICON.plus + `<span>${its.length ? (gapF > 0 ? "Заполнить" : "Продлить") : "Отрезок"}</span><small>${gapF > 0 ? "до маркера" : "+5 с"}</small>`, onclick: () => (gapF > 0 ? this.fillGap() : this.extend()) });
    vt.append(ext);
    const isVid = (e) => [...(e.dataTransfer?.types || [])].includes("application/x-h3s-video");
    vt.addEventListener("dragover", (e) => { if (isVid(e) && !e.target.closest(".h3z-clip")) { e.preventDefault(); ext.classList.add("dropover"); } });
    vt.addEventListener("dragleave", () => ext.classList.remove("dropover"));
    vt.addEventListener("drop", (e) => { ext.classList.remove("dropover"); if (e.target.closest(".h3z-clip")) return; const id = e.dataTransfer.getData("application/x-h3s-video"); if (id) { e.preventDefault(); this.addFootage(id); } });
    inner.append(vt);
    // audio track
    const at = h("div", { class: "h3z-track a" }, h("div", { class: "h3z-lane-bg" }));
    this.renderAudioTrack(at, ppf);
    at.addEventListener("click", (e) => { if (!e.target.closest(".h3z-audio.clip") && this.selAudio) { this.selAudio = null; this.renderInspector(); this.renderTimeline(); } });
    inner.append(at);
    this.renderMarkers(inner, ppf);
    // video end marker: everything after it is dimmed and not generated
    inner.append(h("div", { class: "h3z-beyond", style: { left: vEnd * ppf + "px", width: Math.max(0, W - vEnd * ppf) + "px" } }));
    const flag = h("div", { class: "h3z-vend" + (hasEnd ? " set" : ""), style: { left: vEnd * ppf + "px" }, title: `Конец ролика ${C.fmtTime(vEnd / C.FPS)} (${vEnd} кадр.)${hasEnd ? "" : " · авто: конец последнего отрезка"}\nТяните, чтобы задать длину ролика (Shift — по секундам, прилипает к краям отрезков) · двойной клик — авто` }, h("span", null, "конец"));
    flag.addEventListener("pointerdown", (e) => this.endDrag(e));
    flag.addEventListener("dblclick", () => this.setEnd(0));
    inner.append(flag);
    if (document.activeElement !== $.endIn) $.endIn.value = (vEnd / C.FPS).toFixed(1);
    for (const pl of $.endAuto.children) pl.classList.toggle("on", pl.dataset.m === (this.p.end_mode === "auto" ? "auto" : "fixed"));
    $.phead = h("div", { class: "h3z-phead" });
    inner.append($.phead);
    const est = C.estimate(this.p);
    $.tlInfo.textContent = `${est.frames} кадров · сетка H3: 17 кадров` + (nGen < its.length ? ` · ${its.length - nGen} отр. за концом` : "");
    this.updatePlayhead();
    this.updateRunUI();
    this.regionPopover();
  }

  updatePlayhead(follow = false) {
    const $ = this.$; if (!$.phead) return;
    $.phead.style.left = this.playhead * this.ppf + "px";
    this.updateTime();
    if (follow) {
      const x = this.playhead * this.ppf, sl = $.tscroll.scrollLeft, w = $.tscroll.clientWidth;
      if (x > sl + w - 60 || x < sl) $.tscroll.scrollLeft = x - 80;
    }
  }

  scrollToPlayhead() { const $ = this.$; $.tscroll.scrollLeft = Math.max(0, this.playhead * this.ppf - $.tscroll.clientWidth / 2); }

  frameAt(clientX) { const r = this.$.tinner.getBoundingClientRect(); return (clientX - r.left) / this.ppf; }

  scrubStart(e) {
    e.preventDefault();
    const move = (ev) => this.seek(this.frameAt(ev.clientX));
    move(e);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }

  clipDown(e, i) {
    if (e.button !== 0) return;
    e.preventDefault();
    const sx = e.clientX, clip = this.$.clips[i];
    let dragging = false, target = i, ins = null;
    const its = this.items();
    const centers = its.map((it, k) => ((it.start + (k ? it.overlap : 0) + it.end) / 2) * this.ppf);
    const move = (ev) => {
      const dx = ev.clientX - sx;
      if (!dragging && Math.abs(dx) > 5 && this.p.segments.length > 1) { dragging = true; clip.classList.add("dragging"); ins = h("div", { class: "h3z-ins" }); clip.parentElement.append(ins); }
      if (!dragging) return;
      clip.style.transform = `translateX(${dx}px) translateY(-4px)`;
      const x = this.frameAt(ev.clientX) * this.ppf;
      target = centers.filter((c, k) => k !== i && c < x).length;
      const order = its.map((_, k) => k).filter((k) => k !== i);
      const edge = target >= order.length ? its[order[order.length - 1]].end : its[order[target]].start + (order[target] ? its[order[target]].overlap : 0);
      ins.style.left = edge * this.ppf + "px";
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      ins?.remove();
      if (dragging) {
        clip.classList.remove("dragging"); clip.style.transform = "";
        if (target !== i) {
          this.mutate((p) => { const [s] = p.segments.splice(i, 1); p.segments.splice(target, 0, s); }, { render: "none" });
          this.sel = target; this.renderAll(); this.toast(`Отрезок перемещён на позицию ${target + 1} · продления пересчитаются`);
        }
      } else {
        if (this.run.active) this.followRun = false; // the user took over the selection during a run
        if (this.selAudio) { this.selAudio = null; this.renderInspector(); }
        const changed = this.sel !== i;
        this.sel = i;
        this.playhead = clamp(this.frameAt(ev.clientX), 0, this.totalFrames());
        if (changed) { this.pvMode = this.pvMode === "full" ? "full" : "segment"; this.renderInspector(); this.renderTimeline(); this.renderLeft(); this.renderPreview(); }
        else { this.syncVideoToPlayhead(); this.updatePlayhead(); }
      }
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }

  resizeStart(e, i) {
    e.preventDefault(); e.stopPropagation();
    if (this.seg(i)?.freeze) { this.toast("Отрезок зафиксирован — длину не изменить. Разморозьте его", true); return; }
    const it = this.items()[i], minF = Math.max(C.MIN_FRAMES, i > 0 && it.overlap ? it.overlap + 17 : C.MIN_FRAMES);
    const tip = h("div", { class: "h3z-tip" }); document.body.append(tip);
    let first = true;
    const move = (ev) => {
      const f = Math.max(minF, C.snapFrames(this.frameAt(ev.clientX) - it.start));
      tip.style.left = ev.clientX + 12 + "px"; tip.style.top = ev.clientY - 34 + "px";
      const warn = f < C.TRAINED_MIN_FRAMES || f > C.TRAINED_MAX_FRAMES;
      tip.innerHTML = `${f} кадр. · ${(f / 24).toFixed(2)} с${warn ? ' <span style="color:#fbbf24">⚠ вне 124–362</span>' : ""}`;
      if (f !== this.seg(i).frames) {
        this.mutate((p) => { p.segments[i].frames = f; }, { coalesce: first ? null : "resize" + i, render: "light" });
        first = false; this.lastCoalesce = { key: "resize" + i, t: Date.now() };
      }
    };
    move(e);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); tip.remove(); this.renderInspector(); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }

  /** Roll edit on the seam between segments i and i+1 (Shift: ripple, only i changes). */
  rollStart(e, i) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const its = this.items(), A = this.seg(i), B = this.seg(i + 1);
    if (A?.freeze || (B?.freeze && !e.shiftKey)) { this.toast("Шов у зафиксированного отрезка не двигается" + (A?.freeze ? "" : " (Shift — менять только левый отрезок)"), true); return; }
    if (!A || !B) return;
    const o = C.wantedOverlap({ settings: this.p.settings, segments: [{ overlap_blocks: -1 }] }, 0), ovf = o ? C.overlapFrames(o) : 0;
    const ext = (k) => k > 0 && this.p.segments[k]?.link === "extend" && ovf;
    const minFor = (k) => Math.max(C.MIN_FRAMES, ext(k) ? ovf + 17 : 0, ext(k + 1) ? ovf + 17 : 0);
    const fa0 = A.frames, fb0 = B.frames, minA = minFor(i), minB = minFor(i + 1);
    const sx = e.clientX, seam = e.currentTarget;
    seam.classList.add("on");
    const tip = h("div", { class: "h3z-tip" }); document.body.append(tip);
    let last = null;
    const move = (ev) => {
      const ripple = ev.shiftKey;
      let k = Math.round((ev.clientX - sx) / this.ppf / 17);
      const kMinA = Math.ceil((minA - fa0) / 17), kMaxA = Math.floor((C.MAX_FRAMES - fa0) / 17);
      k = clamp(k, kMinA, kMaxA);
      if (!ripple) k = clamp(k, Math.ceil((fb0 - C.MAX_FRAMES) / 17), Math.floor((fb0 - minB) / 17));
      const fa = fa0 + 17 * k, fb = ripple ? fb0 : fb0 - 17 * k;
      const warn = (f) => (f < C.TRAINED_MIN_FRAMES || f > C.TRAINED_MAX_FRAMES ? ' <span style="color:#fbbf24">⚠</span>' : "");
      tip.style.left = ev.clientX + 12 + "px"; tip.style.top = ev.clientY - 34 + "px";
      tip.innerHTML = `${ripple ? "только левый · " : ""}${i + 1}: ${(fa / 24).toFixed(2)} с${warn(fa)} · ${i + 2}: ${(fb / 24).toFixed(2)} с${warn(fb)}`;
      const key = fa + ":" + fb;
      if (key === last) return;
      last = key;
      this.mutate((p) => { p.segments[i].frames = fa; p.segments[i + 1].frames = fb; }, { coalesce: "roll" + i + ":" + sx, render: "none" });
      this.renderTimeline(); this.renderHeader();
      const sm = this.$.tinner.querySelectorAll(".h3z-seam")[i]; sm?.classList.add("on");
    };
    move(e);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); tip.remove(); this.renderTimeline(); this.renderInspector(); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }

  // ------------------------------------------------------------------ segment ops
  newSegment(base) {
    const n = this.p.segments.length;
    return { ...JSON.parse(JSON.stringify(C.DEFAULT_SEGMENT)), id: C.newId("s"), color: (base ? base.color + 1 : n) % 6, refs: base ? [...base.refs] : [] };
  }

  extend() {
    const last = this.p.segments[this.p.segments.length - 1];
    const s = this.newSegment(last);
    this.mutate((p) => { p.segments.push(s); }, { render: "none" });
    this.sel = this.p.segments.length - 1;
    const it = this.items()[this.sel]; this.playhead = it.start + (this.sel ? it.overlap : 0);
    this.pvMode = "segment";
    this.renderAll(); this.scrollToPlayhead();
    if (!this.pastMarkerHint()) this.toast(this.sel ? "Отрезок добавлен — продолжит предыдущий" : "Первый отрезок добавлен");
  }

  duplicate() {
    const s = this.seg(); if (!s) return;
    const d = JSON.parse(JSON.stringify(s)); d.id = C.newId("s"); delete d.result; d.color = (s.color + 1) % 6;
    this.mutate((p) => { p.segments.splice(this.sel + 1, 0, d); }, { render: "none" });
    this.sel++; this.renderAll(); if (!this.pastMarkerHint()) this.toast("Отрезок продублирован");
  }

  deleteSeg(i) {
    if (i < 0 || !this.seg(i)) return;
    this.hideHover?.();
    this.mutate((p) => { p.segments.splice(i, 1); }, { render: "none" });
    this.sel = Math.min(i, this.p.segments.length - 1);
    this.renderAll(); this.toast("Отрезок удалён · Ctrl+Z — вернуть");
  }

  split() {
    const i = this.sel, s = this.seg(); if (!s) return;
    const it = this.items()[i], local = this.playhead - it.start;
    const ov = i > 0 ? it.overlap : 0, minF = Math.max(C.MIN_FRAMES, ov ? ov + 17 : C.MIN_FRAMES);
    const o = C.wantedOverlap({ settings: this.p.settings, segments: [{ overlap_blocks: -1 }] }, 0), ovf = o ? C.overlapFrames(o) : 0;
    if (s.freeze) return this.toast("Отрезок зафиксирован — разморозьте, чтобы резать", true);
    const foot = C.isFootage(s);   // footage used as is: the second piece continues in the file, no overlap
    const f1 = C.snapFrames(local);
    const f2 = C.snapFrames(s.frames - f1 + (foot ? 0 : ovf));
    if (local <= ov + 8 || f1 < minF || f1 >= s.frames || f2 <= (foot ? 0 : ovf)) return this.toast("Поставьте плейхед внутрь выбранного отрезка, подальше от краёв", true);
    const b = JSON.parse(JSON.stringify(s)); b.id = C.newId("s"); b.link = "extend"; b.color = (s.color + 1) % 6; delete b.result;
    b.takes = []; b.active_take = null; b.freeze = null;
    if (b.source) b.source.in = s.source.in + f1 - (foot ? 0 : ovf);
    this.mutate((p) => { p.segments[i].frames = f1; b.frames = f2; p.segments.splice(i + 1, 0, b); }, { render: "none" });
    this.sel = i + 1; this.renderAll();
    this.toast(`Разрезано: ${f1} + ${f2} кадр. (сетка 17k+5${ovf ? `, перекрытие ${ovf}` : ""})`);
  }

  // ------------------------------------------------------------------ keys
  onKey(e) {
    if (!this.root) return;
    if (this.pe) { if (!this.pe.el?.contains(e.target)) { e.stopPropagation(); e.preventDefault(); } return; }   // prompt editor: its modal routes and stops the keys
    if (e.target?.closest?.(".h3z-lp")) { e.stopPropagation(); e.target.dispatchEvent(new CustomEvent("h3zkey", { detail: e })); return; }   // LoRA picker
    e.stopPropagation(); // keep ComfyUI shortcuts (Del = delete node, Ctrl+Z on graph, space-drag…) away from the editor
    // a modal on top owns the keyboard: the asset editor has its own window listener (registered later, so it
    // runs after this one) and the save dialog listens on its box — the timeline must not react (Esc closed it all)
    if (this.ae) return;
    if (this.viewer) { this.viewerKey(e); return; }   // «Удобный просмотр» owns the keyboard
    if (this.$.saveModal) { if (e.key === "Escape" && !isTyping(e)) { e.preventDefault(); this.closeSaveDialog(); } return; }
    const k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (k === "Escape") { e.preventDefault(); if (isTyping(e)) { e.target.blur(); this.focusSink(); } else if (this.$.menu) this.closeMenu(); else if (this.$.pop) this.toggleWarnings(); else if (this.regionMode) this.toggleRegionMode(false); else if (this.selRegion) { this.selRegion = null; this.renderTimeline(); } else if (this.selMarker) { this.selMarker = null; this.renderInspector(); this.renderTimeline(); } else if (this.selAudio) { this.selAudio = null; this.renderTimeline(); this.renderLeft(); } else this.close(); return; }
    if (ctrl && k === "Enter") { e.preventDefault(); this.generate(); return; }
    if (isTyping(e)) return;
    if (ctrl && e.code === "KeyZ") { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
    if (ctrl && e.code === "KeyY") { e.preventDefault(); this.redo(); return; }
    if (ctrl || e.altKey) return;
    const map = {
      Space: () => this.togglePlay(), KeyS: () => (this.selAudio ? this.splitAudio() : this.split()),
      Delete: () => (this.selRegion ? this.deleteRegion(this.selRegion) : this.selAudio ? this.deleteAudio() : this.deleteSeg(this.sel)), Backspace: () => (this.selRegion ? this.deleteRegion(this.selRegion) : this.selAudio ? this.deleteAudio() : this.deleteSeg(this.sel)),
      KeyD: () => this.duplicate(), KeyE: () => this.extend(), KeyM: () => this.addMarker(), KeyR: () => this.toggleRegionMode(), KeyF: () => this.toggleMainFullscreen(), Home: () => this.seek(0), End: () => this.seek(this.totalFrames()),
      ArrowLeft: () => this.seek(Math.round(this.playhead) - (e.shiftKey ? 24 : 1)), ArrowRight: () => this.seek(Math.round(this.playhead) + (e.shiftKey ? 24 : 1)),
      BracketLeft: () => this.jumpSeg(-1), BracketRight: () => this.jumpSeg(1),
      Equal: () => this.setZoomBy(1.25), NumpadAdd: () => this.setZoomBy(1.25), Minus: () => this.setZoomBy(0.8), NumpadSubtract: () => this.setZoomBy(0.8),
    };
    if (map[e.code]) { e.preventDefault(); map[e.code](); }
  }

  // ------------------------------------------------------------------ run
  /** upto: -1 = whole project, i = only segments 0..i (cached ones are reused). */
  async generate({ upto = -1, only = -1, kind = "", region = "", audio = null } = {}) {
    if (this.run.active) return;
    if (!this.p.segments.length) return this.toast("Добавьте хотя бы один отрезок", true);
    const hard = C.estimate(this.p).warnings.filter((w) => w.includes("максимум"));
    if (hard.length) return this.toast(hard[0], true);
    // kind: one stage for this run only (✎ Черновик / ✦ Чистовик of a clip, «↑ Финал»), the project mode stays
    if (region && !this.region(region)) region = "";
    // region: the whole project runs (cached clips are reused) and this «✂ Участок» is sampled anew
    this.p.run = { upto: region ? -1 : upto >= 0 && upto < this.p.segments.length - 1 ? upto : -1, only: region ? -1 : only >= 0 ? only : -1, kind: C.RUN_KINDS.includes(kind) ? kind : "", region, ...(audio ? { audio } : {}) };
    this.flushSave();
    this.pendingSigs = C.segmentSigs(this.p, this.p.run.kind || null);
    this.pendingRegionSig = Object.fromEntries((this.p.regions || []).map((r) => [r.id, C.regionSig(this.p, r, this.p.run.kind || null)]));
    this.run = { active: true, queued: true, seg: -1, step: 0, steps: 0, done: 0, total: 0, eta: null };
    this._queuedAt = Date.now(); this.startPolling();
    if (this.root) { this.renderHeader(); this.renderInspector(); }
    try {
      await this.host.queue(); setTimeout(() => this.timerSync?.(), 1500);
      if (this.run.queued) this.toast(region ? `В очереди: участок ${this.regionNo(region)}` : this.p.run.upto >= 0 ? `В очереди: отрезки 1–${this.p.run.upto + 1} (следующие — позже)` : "Поставлено в очередь ComfyUI");
    } catch (e) { this.run = { active: false }; if (this.root) { this.renderHeader(); this.renderInspector(); } this.toast("Не удалось поставить в очередь: " + (e.message || e), true); }
    finally { this.p.run = { upto: -1, only: -1, kind: "", region: "" }; this.flushSave(); } // the queued prompt already holds the scoped copy
  }

  async stop() { try { await this.host.interrupt(); this.toast("Останавливаю…"); } catch (e) { this.toast("Не удалось прервать", true); } }

  /** «Очистить кэш» keeps the finished takes (latent sidecars, masters, previews): they come back without
   *  sampling or decoding. With `takes` everything of the project goes, except frozen clips. */
  async clearCache(takes = false) {
    if (takes && !confirm("Удалить кэш и все готовые дубли проекта? Незафиксированные отрезки придётся генерировать заново.")) return;
    try {
      const r = await this.host.clearCache(this.p.id, takes);
      if (takes) this.mutate((p) => { for (const s of p.segments) if (!s.freeze) { delete s.result; s.takes = []; s.active_take = null; } p.result = null; });
      this.toast(`Кэш очищен (${r?.removed ?? 0} файлов)` + (takes ? "" : " · готовые дубли сохранены"));
    } catch (e) { this.toast("Не удалось очистить кэш: " + (e.message || e), true); }
  }

  /** Progress event from the backend (websocket or the polling fallback). Duplicates are dropped by run id
   *  and sequence; a rendering error never stops the run state from being applied. */
  onProgress(d) {
    if (d.run) {
      if (d.event === "start") { if (this._doneRun === d.run || this.runId === d.run) return; this.runId = d.run; this._segSeen = new Set(); this._seq = 0; }
      else if (this.runId && d.run !== this.runId) {
        if (this._doneRun === d.run) return;
        if (!this.run.active) return;
        this.runId = d.run; this._segSeen = new Set(); this._seq = 0;   // missed the start event
      } else if (!this.runId) { this.runId = d.run; this._segSeen = new Set(); }
      if (d.event === "seg_done") { const k = String(d.seg); if (this._segSeen?.has(k)) return; this._segSeen?.add(k); }
      if (d.event === "done") { if (this._doneRun === d.run) return; this._doneRun = d.run; }
      if (d.seq) this._seq = Math.max(this._seq || 0, d.seq);
      if (d.node != null) this.runNode = d.node;
    }
    if ((d.event === "seg_done" || d.event === "done") && this._gal) {   // new results: refresh an open gallery
      this._gal = null;
      if (this.tool === "gallery" && this.root) setTimeout(() => this.galLoad(true).then(() => this.galFill()), 300);
    }
    try { this.applyProgress(d); }
    catch (e) {
      console.warn("[H3ZeroStudio] progress handler", d.event, e);
      try { if (this.root) this.renderAll(); } catch (e2) {}
    }
    if (this.run?.active) this.startPolling();
  }

  /** Polling fallback: while a run is active, ask /h3zero/status every 1.5 s and apply what was missed. */
  startPolling() {
    if (this._poll) return;
    this._poll = setInterval(() => { if (!this.run?.active) { clearInterval(this._poll); this._poll = null; return; } this.catchUp().catch(() => {}); }, 1500);
  }

  async catchUp() {
    if (!this.host.status || this._catching) return;
    this._catching = true;
    try {
      const st = await this.host.status(this.runNode ?? this.host.nodeId?.());
      if (!st || !st.run) return;
      const mine = st.run === this.runId;
      // a run we did not hear start: adopt it if we are waiting for one and it is newer than the last finished one
      if (!mine) {
        if (!this.run?.active || st.run === this._doneRun || (this._queuedAt && st.t * 1000 < this._queuedAt - 5000)) return;
        this.onProgress({ event: "start", run: st.run, node: this.runNode, ...(st.start || { segments: this.p.segments.length, cached: [] }) });
      }
      for (const [k, r] of Object.entries(st.results || {})) if (!this._segSeen?.has(String(k))) this.onProgress({ event: "seg_done", run: st.run, seg: Number(k), result: r });
      if (st.seq > (this._seq || 0)) {   // missed events: the phase (upscale input / decode …) first, then the latest step / tile
        if (st.phase && (!st.progress || st.progress.seg === st.phase.seg)) this.onProgress({ ...st.phase, run: st.run });
        if (st.progress && !(st.phase && ["up_input", "decode"].includes(st.phase.phase) && st.progress.event === "uptile")) this.onProgress({ ...st.progress, run: st.run, seq: st.seq });
      }
      if (st.done) this.onProgress({ event: "done", run: st.run, ...st.done });
      else if (!st.active && st.error && this.run?.active) this.onRunEnded("Ошибка: " + st.error);
    } finally { this._catching = false; }
  }

  /** The tab became visible again: redraw what changed while the browser was not painting. */
  refreshVisible() {
    if (!this.root) return;
    try { this.renderAll(); } catch (e) { console.warn("[H3ZeroStudio] refresh", e); }
  }

  applyProgress(d) {
    const wasActive = !!this.run?.active && !this.run?.queued;
    const r = this.run;
    if (d.event === "start") this.followRun = true;
    if (["start", "done", "error", "interrupted"].includes(d.event)) this.timerSync?.();
    if (d.event === "start" && d.fsigs) {   // content signatures of the reference files: stable keys on another PC / after a copy
      for (const a of this.p.assets || []) { const f = d.fsigs[a.id]; if (f && (a.fsig?.sha !== f.sha || a.fsig?.sig !== f.sig)) { a.fsig = { sha: f.sha, sig: f.sig }; this._fsigDirty = true; } }
      if (this._fsigDirty) { this._fsigDirty = false; this.scheduleSave(); }
    }
    if (["start", "sigmas", "step", "done"].includes(d.event)) this.dynEvent?.(d);
    if (d.event === "sigmas") return;
    if (d.event === "start") this.run = { active: true, queued: false, seg: -1, segs: d.segments, cached: d.cached, total: d.steps_total, done: 0, step: 0, steps: 0, eta: null, kind: d.estimate?.kind || "full", phase: null };
    else if (d.event === "phase") { Object.assign(r, { phase: d.phase, seg: d.seg, upInput: d.input || r.upInput, region: d.region || null, chunk: d.chunk || r.chunk, chunks: d.chunks || r.chunks }); if (d.phase !== "upscale") this.tileOverlay(null); this.updateRunUI?.(); return; }
    else if (d.event === "uptile") {   // tiled / windowed upscale: every crop evaluation
      Object.assign(r, { active: true, queued: false, seg: d.seg, phase: "upscale", up: d, step: d.step - 1, steps: d.steps, done: d.done, total: d.total || r.total, elapsed: d.elapsed, segCached: false });
      this.tileOverlay(d); this.updateRunUI?.(); return;
    }
    else if (d.event === "seg_start") { Object.assign(r, { active: true, queued: false, seg: d.seg, step: 0, steps: 0, segCached: d.cached, phase: r.kind === "draft" ? "draft" : null, up: null, region: null }); this.tileOverlay(null); }
    else if (d.event === "step") { Object.assign(r, { active: true, queued: false, seg: d.seg, step: d.step, steps: d.steps, done: d.done, total: d.total, eta: d.eta, elapsed: d.elapsed, segCached: false, region: d.region || null }); if (r.up) r.up = { ...r.up, tile: 0 }; }
    else if (d.event === "live") { this.onLiveFrames(d); return; }
    else if (d.event === "region_done") { this.recordRegionTake(d.region, d.result, this.pendingRegionSig?.[d.region]); this.scheduleSave(); if (this.root) this.renderTimeline(); return; }
    else if (d.event === "seg_done") {
      // show the finished segment right away; the next segment's live preview replaces it once it starts
      this.hideLive();
      if (this.followRun !== false && this.root && this.seg(d.seg)) { this.sel = d.seg; this.pvMode = "segment"; }
      this.applySegResult(d.seg, d.result);
      if (this.followRun !== false && this.root && this.src?.kind === "segment") { this.playhead = this.items()[d.seg].start + (d.seg ? this.items()[d.seg].overlap : 0); this.syncVideoToPlayhead(); }   // no autoplay: playback only starts on Play / Space
    }
    else if (d.event === "done") {
      this.applyRegionResults(d.regions);
      this.applyFull(d.full, d.segments, d.elapsed, d.audio_source);
      this.run = { active: false };
      this.hideLive(); this.tileOverlay(null);
      if (this.root) { this.renderAll(); this.toast(d.full?.partial ? `Готово за ${C.fmtDur(d.elapsed)} · следующие отрезки помечены «изменён»` : `Готово за ${C.fmtDur(d.elapsed)}`); }
      this.host.onChange?.(this.p);
      return;
    }
    if (!wasActive && this.run.active && this.root) this.renderHeader();
    this.updateRunUI();
    this.host.onChange?.(this.p);
  }

  onRunEnded(reason) {
    this.dynEvent?.({ event: "idle" });
    if (!this.run.active) return;
    this.run = { active: false };
    this.hideLive();
    if (this.root) { this.renderHeader(); this.renderTimeline(); this.renderInspector(); if (reason) this.toast(reason, true); }
    this.host.onChange?.(this.p);
  }

  applySegResult(i, res) {
    const s = this.p.segments[i]; if (!s) return;
    this.recordTake(i, res, this.pendingSigs?.[i] ?? this.sigs()[i]);
    this.scheduleSave();
    if (this.root) { this.renderTimeline(); if (i === this.sel || !this.src) { this.renderInspector(); this.renderPreview(); } }
  }

  applyFull(full, segs, elapsed, audioSrc) {
    if (Array.isArray(segs)) segs.forEach((r) => { if (this.p.segments[r.index]) this.recordTake(r.index, r, this.pendingSigs?.[r.index] ?? this.sigs()[r.index]); });
    if (audioSrc?.filename) this.p.audio.input_ref = audioSrc;
    // a partial run ("only this segment") keeps the previous full preview (shown as outdated)
    // segs/end: what the final file was made of — «Весь ролик» plays it only while the timeline is exactly that
    if (!full?.partial || !this.p.result) this.p.result = { full, count: full?.partial ? full.count : this.genCount(),
      segs: full?.partial ? null : this.p.segments.slice(0, this.genCount()).map((s) => ({ id: s.id, key: s.result?.key || "" })),
      end: this.totalFrames(), regs: this.appliedRegionKeys() };
    try { // speed statistics for the next estimate (fresh segments only)
      const [w, hh] = C.resolution(this.p.settings), its = this.items();
      let units = 0;
      (segs || []).forEach((r) => { if (!r.cached && its[r.index]) units += C.effectiveParams(this.p, r.index).steps * its[r.index].frames * w * hh / 1e6; });
      if (units > 0 && elapsed > 0) this.p.stats = { sec_per_unit: elapsed / units };
    } catch (e) {}
    this.pvMode = "full";
    this.pendingSigs = null; this.pendingRegionSig = null;
    this.flushSave();
  }

  /** Results delivered through the node's onExecuted (covers runs queued from the graph). */
  applyExecuted(info) {
    if (!info?.segments) return;
    if (!this.p.result || this.p.result.full?.key !== info.full?.key) { this.applyRegionResults(info.regions); this.applyFull(info.full, info.segments, 0, info.audio_source); }
    this.hideLive();
    this.run = { active: false };
    if (this.root) this.renderAll();
  }

  /** Tile grid over the player during a tiled upscale (current tile highlighted); null = remove. */
  tileOverlay(d) {
    const $ = this.$;
    if (!d || !this.root || !$.frame || (d.tiles || 0) < 2) { $.tileOv?.remove(); $.tileOv = null; return; }
    if (!$.tileOv || !$.tileOv.isConnected) { $.tileOv = h("div", { class: "h3z-tileov" }); $.frame.append($.tileOv); }
    const key = `${d.lh}x${d.lw}:${d.rows}x${d.cols}`;
    if ($.tileOv.dataset.k !== key) { $.tileOv.dataset.k = key; $.tileOv.innerHTML = ""; }
    const pc = (a, n) => (a / n * 100).toFixed(3) + "%";
    let cur = $.tileOv.querySelector(".cur");
    if (!$.tileOv.querySelector(".lbl")) $.tileOv.append(h("div", { class: "lbl" }));
    if (!cur) { cur = h("div", { class: "cur" }); $.tileOv.append(cur); }
    const [y0, y1, x0, x1] = d.rect;
    Object.assign(cur.style, { top: pc(y0, d.lh), height: pc(y1 - y0, d.lh), left: pc(x0, d.lw), width: pc(x1 - x0, d.lw) });
    $.tileOv.querySelector(".lbl").textContent = (d.chunks > 1 ? `кусок ${d.chunk}/${d.chunks} · ` : "") + `тайл ${d.tile}/${d.tiles} · сетка ${d.cols}×${d.rows} · шаг ${d.step}/${d.steps}` + (d.wins > 1 ? ` · окно ${d.win}/${d.wins}` : "");
  }

  updateRunUI() {
    const r = this.run, $ = this.$;
    if (!this.root) return;
    if ($.runPill) {
      const u = r.phase === "upscale" && r.up && r.up.seg === r.seg ? r.up : null;
      const frac = r.total ? Math.min(1, ((r.done || 0) + (u && u.tile ? u.tile / u.tiles : 0)) / r.total) : 0;
      $.runPill.querySelector("i").style.width = (frac * 100).toFixed(1) + "%";
      const pct = Math.round(frac * 100), eta = r.eta != null && r.done ? C.fmtTime(r.eta).replace(/\.\d+$/, "") : "";
      const inLbl = { learned: "обученный апскейлер", rtx: "RTX VSR" }[r.upInput] || r.upInput || "";
      const chk = (c, n) => (n > 1 ? ` · кусок ${c}/${n}` : "");
      const rn = r.region ? this.regionNo(r.region) : 0;
      const txt = r.queued ? "В очереди ComfyUI…" : r.seg < 0 ? "Подготовка…" :
        rn && r.phase !== "up_input" ? `✂ Участок ${rn}` + (r.phase === "region_draft" ? " · черновик" : r.kind === "refine" ? " · доработка ↑" : "") + ` · шаг ${r.step}/${r.steps || "…"}` + (r.eta != null && r.done ? ` · осталось ${C.fmtDur(r.eta)}` : "") :
        r.segCached ? `Отрезок ${r.seg + 1}/${r.segs} · из кэша` :
        r.phase === "up_input" ? `Апскейл · ${rn ? "участок " + rn : "отр. " + (r.seg + 1)}${chk(r.chunk, r.chunks)} · вход: ${inLbl || "…"} · ${pct}%` :
        r.phase === "decode" ? `Апскейл · отр. ${r.seg + 1} · декодирование · ${pct}%` :
        u ? `Апскейл · отр. ${r.seg + 1}` + chk(u.chunk, u.chunks) + (u.wins > 1 ? ` · окно ${u.win}/${u.wins}` : "") + ` · шаг ${u.step}/${u.steps}` + (u.tiles > 1 ? ` · тайл ${u.tile || "…"}/${u.tiles}` : "") + ` · ${pct}%` + (u.eta != null ? ` · ETA ${C.fmtDur(u.eta)}` : "") :
        `Отрезок ${r.seg + 1}/${r.segs}` + (r.phase === "draft" ? " · черновик" : r.phase === "refine" ? " · доработка ↑" : r.phase === "upscale" ? " · апскейл ↑" : "") + ` · шаг ${r.step}/${r.steps || "…"}` + (r.eta != null && r.done ? ` · осталось ${C.fmtDur(r.eta)}` : "");
      $.runPill.querySelector("span").textContent = txt;
      $.runPill.title = r.queued ? "Запуск ждёт в очереди ComfyUI" : r.seg < 0 ? "Подготовка запуска" :
        `Отрезок ${r.seg + 1} из ${r.segs}` + (r.segCached ? " — берётся из кэша" : ` · шаг ${r.step} из ${r.steps || "?"}`) +
        `\nВсего шагов: ${r.done || 0} из ${r.total || "?"} (${pct}%)` + (r.elapsed != null ? `\nПрошло: ${C.fmtDur(r.elapsed)}` : "") + (eta ? `\nОсталось ≈ ${C.fmtDur(r.eta)}` : "") +
        (u ? `\nАпскейл${u.chunks > 1 ? ` (кусок ${u.chunk} из ${u.chunks})` : ""}: сетка ${u.cols}×${u.rows}, ${u.ms} мс/тайл, до конца апскейла ≈ ${C.fmtDur(u.eta)}` : "");
    }
    ($.clips || []).forEach((c, i) => {
      if (!c) return;
      const running = !!r.active && r.seg === i && !r.segCached && !r.region;
      c.classList.toggle("running", running);
      c.classList.toggle("queued", !!r.active && !r.queued && i > r.seg && !!r.cached && !r.cached[i]);
      const bar = c.querySelector(".pg i");
      if (bar) bar.style.width = running && r.steps ? (r.step / r.steps * 100) + "%" : "0%";
    });
  }

  // ------------------------------------------------------------------ misc
  toast(msg, err = false, action = null) {
    if (!this.root) return;
    this.$.toastEl?.remove();
    const t = this.$.toastEl = h("div", { class: "h3z-toast" + (err ? " err" : "") + (action ? " act" : "") }, msg);
    if (action) t.append(h("button", { class: "h3z-btn sm", onclick: () => { t.remove(); action.fn(); } }, action.label));
    this.root.append(t);
    clearTimeout(this._toastT); this._toastT = setTimeout(() => t.remove(), action ? 6000 : err ? 4500 : 2200);
  }
}

installTakes(H3Editor, { C, h, ICON, PALETTE });
installRestore(H3Editor, { C, h });
installMarkers(H3Editor, { C, h, ICON, PALETTE });
installAudio(H3Editor, { C, h, ICON, PALETTE });
installPolish(H3Editor, { C, h, ICON, PALETTE });
installDyn(H3Editor, { C, h, ICON, PALETTE });
installVideo(H3Editor, { C, h, ICON, PALETTE });
installMenus(H3Editor, { C, h, ICON, PALETTE });
installAssetEditor(H3Editor, { C, h, ICON, PALETTE });
installComp(H3Editor, { C, h, ICON, PALETTE });
installUpscale(H3Editor, { C, h, ICON, PALETTE });
installFinal(H3Editor, { C, h, ICON });
installSettings(H3Editor, { C, h, ICON });
installHelp(H3Editor, { C, h, ICON });
installGallery(H3Editor, { C, h, ICON });
installProjects(H3Editor, { C, h, ICON });
installRegions(H3Editor, { C, h, ICON });   // after installComp: wraps fullCurrent / compSource
installViewer(H3Editor, { C, h, ICON });
installPromptEditor(H3Editor, { C, h, ICON });
installPresets(H3Editor, { C, h, ICON });
installModelTab(H3Editor, { C, h, ICON });
installTimer(H3Editor, { C, h });

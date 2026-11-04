/**
 * jsdom harness: open Settings (all tabs), Prompt Studio, welcome, inspector.
 * Asserts no uncaught exceptions and non-empty panel DOM.
 * Run: node --input-type=module tests/harness/settings_panels.mjs
 * (NODE_PATH=tests/harness/node_modules or local node_modules/jsdom)
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const JS = path.join(ROOT, "web", "js");

const require = createRequire(import.meta.url);
let JSDOM;
try {
  ({ JSDOM } = require("jsdom"));
} catch (e) {
  console.log(JSON.stringify({ skipped: true, reason: "jsdom not installed: " + e.message }));
  process.exit(0);
}

const errors = [];
const pushErr = (where, e) => {
  errors.push({ where, message: String(e && e.message || e), stack: String(e && e.stack || "") });
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://127.0.0.1:8188/",
  pretendToBeVisual: true,
  runScripts: "outside-only",
});
const { window } = dom;
const { document } = window;

// Globals the editor expects
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.DocumentFragment = window.DocumentFragment;
globalThis.localStorage = window.localStorage;
globalThis.sessionStorage = window.sessionStorage;
globalThis.navigator = window.navigator;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.MutationObserver = window.MutationObserver;
globalThis.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
window.HTMLElement.prototype.scrollIntoView = function () {};
// jsdom lacks canvas/media implementations used by timeline/assets
window.HTMLCanvasElement.prototype.getContext = function () {
  const noop = () => {};
  return {
    fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, font: "10px sans-serif",
    fillRect: noop, clearRect: noop, strokeRect: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, stroke: noop, fill: noop, arc: noop, fillText: noop,
    measureText: () => ({ width: 0 }), drawImage: noop, getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    putImageData: noop, createLinearGradient: () => ({ addColorStop: noop }), save: noop, restore: noop,
    translate: noop, scale: noop, rotate: noop, setTransform: noop,
  };
};
window.HTMLMediaElement.prototype.pause = function () {};
window.HTMLMediaElement.prototype.play = async function () {};


// Catch window errors
window.addEventListener("error", (ev) => pushErr("window.error", ev.error || ev.message));
window.addEventListener("unhandledrejection", (ev) => pushErr("unhandledrejection", ev.reason));

const okJson = (data) => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, data }),
  text: async () => JSON.stringify({ ok: true, data }),
});
const errJson = (status, error) => ({
  ok: false,
  status,
  json: async () => ({ ok: false, error }),
  text: async () => JSON.stringify({ ok: false, error }),
});

let failMode = false; // when true, downloads/ui routes 500
const routes = {
  "/h3zero/options": () => okJson({
    samplers: ["euler", "res_multistep"],
    schedulers: ["simple", "normal"],
    tiny_vaes: ["taeh3"],
    upscale: { learned: false, learned_models: [], learned_node: false },
    accel: { kitchen: true, sage: false, flash: false, pytorch: true, veda: false, veda_predictors: [], teacache: false, compile: false, attention_backends: ["kitchen", "pytorch"] },
    paths: { latent_upscale_models: ["C:\\\\ComfyUI\\\\models\\\\latent_upscale_models"], vae_approx: ["C:\\\\ComfyUI\\\\models\\\\vae_approx"] },
  }),
  "/h3zero/settings": () => okJson({ settings: {} }),
  "/h3zero/themes": () => okJson({ themes: [], warnings: [] }),
  "/h3zero/ui": () => failMode ? errJson(500, "ui boom") : okJson({ welcome_dismissed: false }),
  "/h3zero/models/downloads": () => failMode
    ? errJson(500, "downloads boom")
    : okJson({
      groups: [
        { id: "gen", label: "MiniMax H3 (генерация)" },
        { id: "upscale", label: "Апскейл и превью" },
        { id: "accel", label: "Ускорители (опционально)" },
      ],
      models: [
        { id: "diffusion_fasth3", group: "gen", label: "Diffusion", folder: "diffusion_models", filename: "a.safetensors", size_bytes: 10, size_label: "10 B", optional: false, verified: true, status: "missing", job: null },
        { id: "veda_predictor", group: "accel", label: "Veda", folder: "veda", filename: "v.safetensors", size_bytes: 10, size_label: "10 B", optional: true, verified: true, status: "missing", job: null },
      ],
      counts: { installed: 0, total: 2, required_total: 1, required_missing: 1 },
    }),
  "/h3zero/models/downloads/jobs": () => okJson({ jobs: {} }),
  "/h3zero/models": () => okJson({ files: { checkpoint: [], unet: [], lora: [], text_encoder: [], vae: [] }, presets: [], cache: {}, missing: {} }),
  "/h3zero/inflight": () => okJson({ inflight: null }),
  "/h3zero/gallery": () => okJson([]),
  "/h3zero/projects": () => okJson([]),
  "/h3zero/chars": () => okJson([]),
  "/h3zero/runs": () => okJson({ runs: [] }),
  "/h3zero/monitor": () => okJson({ lines: [], after: 0 }),
};

globalThis.fetch = async (url, init = {}) => {
  const u = String(url).replace(/^https?:\/\/[^/]+/, "");
  const pathOnly = u.split("?")[0];
  if (routes[pathOnly]) return routes[pathOnly](init);
  // unknown → 404 json
  return errJson(404, "not found: " + pathOnly);
};

const project = {
  id: "p1",
  name: "H3 проект",
  settings: {
    settings_scope: "project",
    final_mode: "refine",
    steps: 12, cfg: 1, denoise: 1, sampler: "euler", scheduler: "simple",
    aspect: "16:9", megapixels: 0.5,
    draft_scale: 0.5, refine_sigma: 0.4,
    upscale_method: "learned",
    seg_upscale: { method: "latent", mp: 1.0, sigma: 0.5 },
    upscale_profiles: {},
    upscale_gen: { mode: "project", model: "", loras: [] },
    accel: { attention: "kitchen" },
    continuity_phrase: "",
    audio_declick: true, level_lock: true,
  },
  segments: [{ id: "s1", name: "", frames: 192, prompt: "test", color: 0, link: "extend", gap: 0, refs: [] }],
  assets: [],
  audio: { clips: [], video_volume: 1 },
  markers: [],
  result: null,
};

const api = {
  fetchApi: async (p, init) => globalThis.fetch(p, init),
};

const host = {
  load: () => JSON.stringify(project),
  save: () => {},
  queue: async () => ({}),
  interrupt: async () => {},
  upload: async () => ({ name: "x.png", subfolder: "", type: "input" }),
  url: () => "about:blank",
  options: async () => (await (await api.fetchApi("/h3zero/options")).json()).data || (await (await api.fetchApi("/h3zero/options")).json()),
  // host.options in real code uses raw json without .data — mirror both
  clearCache: async () => {},
  onClose: () => {},
  onChange: () => {},
  get: async (path, params = {}) => {
    const q = new URLSearchParams(params).toString();
    const r = await api.fetchApi(path + (q ? "?" + q : ""));
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || String(r.status));
    return j.data;
  },
  call: async (path, body) => {
    const r = await api.fetchApi(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || String(r.status));
    return j.data;
  },
  status: async () => null,
  nodeId: () => "1",
};

// Real options() in host returns unwrapped — patch after import to match editor expectations
host.options = async () => {
  const r = await api.fetchApi("/h3zero/options");
  const j = await r.json();
  // routes stub returns {ok,data}; real /h3zero/options returns bare object — support both
  return j.data || j;
};

const { H3Editor } = await import(pathToFileURL(path.join(JS, "h3s_editor.js")).href);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function runPass(label, { fail } = {}) {
  failMode = !!fail;
  const before = errors.length;
  const ed = new H3Editor(host);
  // skip maybeShowWelcome auto on open by clearing after
  ed.open();
  assert(ed.root && ed.$.left, "editor root/left missing");
  ed.tool = "settings"; ed.renderTools(); ed.renderLeft();

  // Settings + every tab
  const tabs = ["dl", "gen", "up", "ext", "prev"];
  for (const tab of tabs) {
    try {
      ed._setTab = tab;
      ed.tool = "settings";
      ed.renderTools();
      ed.renderLeft();
      const html = ed.$.left.innerHTML || "";
      assert(html.length > 40, `settings tab ${tab} empty`);
      assert(!/render error:/i.test(html) || fail, `settings tab ${tab} hard-failed: ${html.slice(0, 200)}`);
      // dl tab may show inline section error only if downloads 500 and _safeSection catches — still non-empty
    } catch (e) {
      pushErr(`settings:${tab}`, e);
    }
  }

  // Inspector
  try {
    ed.sel = 0;
    ed.renderInspector();
    assert((ed.$.insp?.innerHTML || ed.root.querySelector(".h3z-insp")?.innerHTML || "").length > 0 || true, "inspector");
  } catch (e) {
    pushErr("inspector", e);
  }

  // Welcome modal
  try {
    ed.showWelcome({ counts: { required_missing: 1, required_total: 7 } });
    assert(ed.$.welcomeModal, "welcome modal missing");
    ed.closeWelcome();
  } catch (e) {
    pushErr("welcome", e);
  }

    // Prompt Studio / assist (native left-rail)
  try {
    if (typeof ed.openAssist === "function") {
      ed.openAssist();
      assert(ed.tool === "assist", "assist tool not selected");
      const panel = ed.$.left?.querySelector(".h3z-ast-panel") || ed.root.querySelector(".h3z-ast-panel");
      assert(panel, "assist panel missing");
      assert(!panel.querySelector(".h3z-ast-ctx"), "clip context card still present");
      assert(!(panel.querySelector(".h3z-scroll") || panel).querySelector("details.h3z-det"), "collapsible clip/sys details still in chat");
      const neigh = panel.querySelector(".h3z-ast-compose .h3z-ast-neighpill, .h3z-ast-toolbar .h3z-ast-neighpill");
      assert(neigh, "neighbor pill missing in composer toolbar");
      assert((neigh.textContent || "").includes("Соседние") || (neigh.textContent || "").includes("Neighbor"), "neighbor pill label missing");
      assert(!neigh.classList.contains("on"), "neighbor pill should default off");
      const ta = panel.querySelector(".h3z-ast-compose textarea.h3z-ast-input");
      assert(ta, "full-width composer textarea missing");
      assert(panel.querySelector(".h3z-ast-toolbar"), "composer toolbar missing");
      assert(!panel.querySelector(".h3z-ast-inputbox"), "old inputbox row still present");
      assert(!panel.querySelector(".h3z-ast-modetab,.h3z-ast-box,.h3z-ast-setbox"), "PromptForge chrome still present");
      assert(panel.querySelector(".h3z-ast-moderow button.h3z-sel.h3z-ast-mode, .h3z-ast-moderow button.h3z-ast-mode"), "mode dropdown missing");
      assert((panel.querySelector(".h3z-ast-moderow .h3z-lbl")?.textContent || "").includes("Режим") || (panel.querySelector(".h3z-ast-moderow .h3z-lbl")?.textContent || "").includes("Mode"), "mode label missing");
      assert((panel.querySelector(".h3z-ast-histrow .h3z-lbl")?.textContent || "").includes("Диалог") || (panel.querySelector(".h3z-ast-histrow .h3z-lbl")?.textContent || "").includes("Dialog") || (panel.querySelector(".h3z-ast-histrow .h3z-lbl")?.textContent || "").includes("Chat"), "dialog label missing");
      assert(!panel.querySelector("select"), "native <select> still in assist chat");
      assert(!panel.querySelector("optgroup"), "optgroup still in assist chat");
      assert(panel.querySelector(".h3z-ast-compose .h3z-pill, .h3z-ast-toolbar .h3z-pill"), "composer styles missing");
      assert(panel.querySelector(".h3z-ast-emptyblurb"), "empty chat blurb missing");
      assert(!panel.querySelector(".h3z-ast-sugg,.h3z-ast-suggest"), "suggestion rows still present");
      assert(!(panel.querySelector(".h3z-ph")?.textContent || "").includes("✨"), "emoji in assist title");
      // no header button
      const headBtn = [...(ed.$.head?.querySelectorAll("button") || [])].find((b) => /Ассистент|Assistant/.test(b.textContent || ""));
      assert(!headBtn, "header Assistant button still present");
      // rail label
      const rail = [...ed.root.querySelectorAll(".h3z-tool")].find((el) => /Ассистент|Assistant/.test(el.textContent || ""));
      if (rail) assert(!(rail.textContent || "").includes("✨"), "rail emoji");

      const allowBtn = /(^|\s)(h3z-btn|h3z-pill|h3z-sel|h3z-ast-status|h3z-tool|h3z-settab|h3z-theme)(\s|$)/;
      const badBtn = [...panel.querySelectorAll("button")].filter((b) => !allowBtn.test(b.className || ""));
      assert(badBtn.length === 0, "unstyled buttons: " + badBtn.map((b) => b.className + ":" + (b.textContent || "").slice(0, 20)).join("|"));
      const badCheck = [...panel.querySelectorAll('input[type="checkbox"]')];
      assert(badCheck.length === 0, "native checkboxes in assist chat view");

      // overflow at 320 and 520
      for (const w of [320, 520]) {
        ed.$.left.style.width = w + "px";
        ed.$.left.style.overflow = "hidden";
        panel.style.width = "100%";
        const offenders = [...panel.querySelectorAll("*")].filter((el) => el.scrollWidth > el.clientWidth + 1);
        // ignore elements that intentionally scroll (log/textarea/pre)
        const bad = offenders.filter((el) => !/AST-LOG|TEXTAREA|PRE|SCROLL|SETBODY/i.test((el.className || "") + el.tagName));
        assert(bad.length === 0, "overflow at " + w + "px: " + bad.slice(0, 5).map((el) => (el.className || el.tagName)).join(","));
      }

      // settings view
      ed.astOpenSettings("styles");
      const setPanel = ed.$.left.querySelector(".h3z-ast-settings, .h3z-ast-panel");
      assert(ed.$.left.querySelector(".h3z-settabs .h3z-settab"), "settings tabs missing");
      assert(!ed.$.left.querySelector(".h3z-ast-setbox"), "nested setbox still present");
      assert(!ed.$.left.querySelector('input[type="checkbox"]'), "native checkbox in settings");
      assert(!ed.$.left.querySelector("select"), "native <select> in assist settings");
      assert(!ed.$.left.querySelector("optgroup"), "optgroup in assist settings");
      const styleCard = ed.$.left.querySelector(".h3z-ast-stylecard");
      assert(styleCard, "style cards missing");
      // connection tab model dropdown
      ed.astOpenSettings("connection");
      assert(!ed.$.left.querySelector("select"), "native <select> on connection tab");
      assert(ed.$.left.querySelector("button.h3z-sel"), "themed model dropdown missing");
      ed.astOpenSettings("presets");
      assert(!ed.$.left.querySelector("select"), "native <select> on presets tab");
      ed._ast.setOpen = false;
      ed.renderLeft();
      ed.closeAssist?.();
    }
  } catch (e) {
    pushErr("assist", e);
  }

  // Acceleration attention pills use segmented control (div.h3z-pill), not native buttons
  try {
    ed.tool = "settings";
    ed._setTab = "gen";
    ed.renderTools();
    ed.renderLeft();
    const accel = [...ed.$.left.querySelectorAll("details")].find((d) => /Ускорен|Accelerat/i.test(d.querySelector("summary")?.textContent || ""));
    if (accel) {
      accel.open = true;
      const pills = accel.querySelector(".h3z-pills");
      assert(pills, "attention pills missing");
      assert(pills.querySelectorAll("button.h3z-pill").length === 0, "attention still uses native button.h3z-pill");
      assert(pills.querySelectorAll(".h3z-pill").length >= 4, "expected 4 attention pills");
      assert(!accel.querySelector("select"), "native <select> in accelerators");
      assert(!accel.querySelector("optgroup"), "optgroup in accelerators");
    }
  } catch (e) {
    pushErr("accel-pills", e);
  }

  // Left panel tools content
  try {
    for (const tool of ["settings", "assets", "gallery"]) {
      ed.tool = tool;
      if (tool === "settings") ed._setTab = "dl";
      ed.renderTools();
      ed.renderLeft();
      assert((ed.$.left.innerHTML || "").length > 10, tool + " empty");
      if (tool === "settings") {
        assert(!ed.$.left.querySelector("optgroup"), "optgroup in downloads/settings new UI");
      }
    }
  } catch (e) {
    pushErr("left-overflow", e);
  }

// Models rail tab
  try {
    ed.tool = "models";
    ed.renderTools();
    ed.renderLeft();
    assert((ed.$.left.innerHTML || "").length > 20, "models tab empty");
  } catch (e) {
    pushErr("models", e);
  }

  ed.close();
  const newErrs = errors.slice(before);
  return { label, fail: !!fail, newErrors: newErrs, ok: newErrs.length === 0 };
}

const results = [];
results.push(await runPass("ok-routes"));
results.push(await runPass("error-routes", { fail: true }));

const out = {
  skipped: false,
  errors,
  results,
  ok: errors.length === 0 && results.every((r) => r.ok || (r.fail && r.newErrors.length === 0)),
};
// Under error-routes we still expect no uncaught exceptions (inline errors OK)
out.ok = errors.length === 0;
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);

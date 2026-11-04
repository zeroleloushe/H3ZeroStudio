import { H3Editor } from "../../web/js/h3s_editor.js";
import { applyTheme, loadPluginThemes } from "../../web/js/h3s_theme.js";

const params = new URLSearchParams(location.search);
const theme = params.get("theme") || "neon";
const W = Number(params.get("w") || 1600);
const H = Number(params.get("h") || 900);

const long = `subject_definitions:
<Picture 1> — Anna: young woman, dark hair, leather jacket.

summary:
[reference generation] Continuous shot of Anna walking a corridor.

retention_analysis:
<Picture 1>: fully_preserved

detailed_description:
Cinematic continuous shot, soft side light. [Shot 1] Anna walks slowly down a dim hallway. Camera follows from behind.

overall_soundscape:
Footsteps, distant HVAC hum, soft breath.

non_diegetic_music:
N/A
`;

const project = {
  id: "p1", name: "PE theme",
  settings: { settings_scope: "project", final_mode: "refine", steps: 12, cfg: 1, denoise: 1, sampler: "euler", scheduler: "simple",
    aspect: "16:9", megapixels: 0.5, draft_scale: 0.5, refine_sigma: 0.4, upscale_method: "learned",
    seg_upscale: { method: "latent", mp: 1.0, sigma: 0.5 }, upscale_profiles: {}, upscale_gen: { mode: "project", model: "", loras: [] },
    accel: { attention: "kitchen" }, continuity_phrase: "", audio_declick: true, level_lock: true },
  segments: [{ id: "s1", name: "Отрезок 1", frames: 192, prompt: long, color: 0, link: "extend", gap: 0, refs: [], takes: [], take: null }],
  assets: [], audio: { clips: [], video_volume: 1 }, markers: [], result: null,
  assistant: { active: null, chats: [], presets: [], style_defs: [], cfg: {} },
  chars: [{ id: "anna", name: "Анна", thumb: "" }],
};

const okJson = (data) => ({ ok: true, status: 200, json: async () => ({ ok: true, data }), text: async () => JSON.stringify({ ok: true, data }), arrayBuffer: async () => new ArrayBuffer(0) });
const routes = {
  "/h3zero/options": () => okJson({ samplers: ["euler"], schedulers: ["simple"], accel: {}, upscalers: {}, models: {} }),
  "/h3zero/models/downloads": () => okJson({ groups: [], models: [], counts: { installed: 0, total: 0, required_total: 0, required_missing: 0 } }),
  "/h3zero/models/downloads/jobs": () => okJson({ jobs: {} }),
  "/h3zero/models": () => okJson({ files: { checkpoint: [], unet: [], lora: [], text_encoder: [], vae: [] }, presets: [], cache: {}, missing: {} }),
  "/h3zero/inflight": () => okJson({ inflight: null }),
  "/h3zero/gallery": () => okJson([]),
  "/h3zero/projects": () => okJson([]),
  "/h3zero/chars": () => okJson(project.chars),
  "/h3zero/runs": () => okJson({ runs: [] }),
  "/h3zero/monitor": () => okJson({ lines: [], after: 0 }),
  "/h3zero/themes": () => okJson({
    themes: [{ id: "win98", name_ru: "Windows 98", name_en: "Windows 98", base: "light", swatches: ["#c0c0c0","#000080","#008080"], plugin: true, css: "/themes_user/win98/theme.css" }],
    warnings: [],
  }),
};
const _fetch = window.fetch.bind(window);
window.fetch = async (url, init = {}) => {
  const pathOnly = String(url).replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  if (routes[pathOnly]) return routes[pathOnly](init);
  return _fetch(url, init);
};

const host = {
  load: () => JSON.stringify(project), save: () => {}, queue: async () => ({}), interrupt: async () => {},
  upload: async () => ({ name: "x.png", subfolder: "", type: "input" }), url: () => "about:blank",
  options: async () => (await (await fetch("/h3zero/options")).json()).data,
  getRaw: async (path) => {
    const j = await (await fetch(path)).json();
    return (j && typeof j === "object" && "data" in j && "ok" in j) ? j.data : j;
  },
  clearCache: async () => {}, onClose: () => {}, onChange: () => {},
  get: async (path, params = {}) => {
    const q = new URLSearchParams(params).toString();
    const r = await fetch(path + (q ? "?" + q : ""));
    const j = await r.json(); if (!j.ok) throw new Error(j.error || String(r.status));
    return j.data;
  },
  call: async (path, body) => {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    const j = await r.json(); if (!j.ok) throw new Error(j.error || String(r.status));
    return j.data;
  },
  status: async () => null, nodeId: () => "1",
};

document.documentElement.style.cssText = "height:100%;margin:0;";
document.body.style.cssText = `margin:0;height:${H}px;width:${W}px;overflow:hidden;background:#111;`;

const win98Css = `:root[data-h3z-theme="win98"] :is(.h3z-root,.h3z-compact) {
  --bg0:#008080; --bg1:#c0c0c0; --bg2:#dfdfdf; --panel:#c0c0c0; --panel2:#dfdfdf;
  --line:#808080; --line2:#404040; --txt:#000000; --mut:#000080; --mut2:#808080;
  --a1:#000080; --a2:#008080; --a3:#800080; --ok:#008000; --warn:#808000; --err:#800000;
  --field:#ffffff; --control:#c0c0c0; --on-accent:#ffffff;
  --glow1:transparent; --glow2:transparent; --glow3:transparent;
  --grad:#000080; --grad2:#000080; --r:0px; --r2:0px; --r3:0px;
}`;
const themePayload = {
  themes: [{ id: "win98", name_ru: "Windows 98", name_en: "Windows 98", base: "light",
    swatches: ["#c0c0c0","#000080","#008080"], plugin: true, css: "/themes_user/win98/theme.css" }],
  warnings: [],
};
await loadPluginThemes(async () => themePayload);
// Ensure plugin CSS is present even if link fetch races
if (!document.getElementById("h3z-theme-win98-inline")) {
  const st = document.createElement("style");
  st.id = "h3z-theme-win98-inline";
  st.textContent = win98Css;
  document.documentElement.appendChild(st);
}
try { localStorage.setItem("h3zs.theme", theme); } catch {}
applyTheme(theme, true);

const ed = new H3Editor(host);
ed.open();
ed.closeWelcome?.();
applyTheme(theme, true); // editor open may re-apply saved theme
const link = document.getElementById("h3z-theme-" + theme);
if (link) await new Promise((r) => { if (link.sheet) r(); else { link.onload = () => r(); link.onerror = () => r(); setTimeout(r, 800); } });
await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

await new Promise((r) => setTimeout(r, 150));
applyTheme(theme, true);
document.documentElement.dataset.h3zTheme = theme;
await ed.openPromptEditor({
  title: "Промпт отрезка 1",
  value: long,
  placeholder: "Пишите промпт…",
  ctx: { kind: "segment", subjects: [] },
  onApply: () => {},
});
await new Promise((r) => setTimeout(r, 200));

function rgb(el, prop) {
  if (!el) return null;
  const v = getComputedStyle(el)[prop];
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function lum([r,g,b]) { return (0.2126*r + 0.7152*g + 0.0722*b) / 255; }

window.__H3_PE__ = {
  ed,
  measure() {
    const pe = document.querySelector(".h3z-pe");
    const edEl = document.querySelector(".h3z-pe .pe-ed");
    const gut = document.querySelector(".h3z-pe .cm-gutters");
    const side = document.querySelector(".h3z-pe .pe-side");
    const sec = document.querySelector(".h3z-pe .pe-sec");
    const content = document.querySelector(".h3z-pe .cm-content");
    const peBg = rgb(pe, "backgroundColor");
    const edBg = rgb(edEl, "backgroundColor");
    const gutBg = rgb(gut, "backgroundColor");
    const sideBg = rgb(side, "backgroundColor");
    const secBg = rgb(sec, "backgroundColor");
    const txt = rgb(content, "color");
    const root = ed.root;
    const panel2 = getComputedStyle(root).getPropertyValue("--panel2").trim();
    const field = getComputedStyle(root).getPropertyValue("--field").trim();
    const panel = getComputedStyle(root).getPropertyValue("--panel").trim();
    const peBgCss = getComputedStyle(pe).backgroundColor;
    const edBgCss = getComputedStyle(edEl).backgroundColor;
    // Contrast: text vs editor bg should be readable (diff in luminance)
    const contrastOk = txt && edBg ? Math.abs(lum(txt) - lum(edBg)) > 0.25 : false;
    // Surfaces must not be the old hardcoded navy rgba(12,16,32) / rgba(5,7,15)
    const notNavy = (c) => !(c && c[0] <= 20 && c[1] <= 24 && c[2] <= 40 && theme !== "neon" && theme !== "graphite");
    // For porcelain/win98 light: pe bg should be bright
    const isLight = theme === "porcelain" || theme === "win98";
    const lightOk = !isLight || (peBg && lum(peBg) > 0.55);
    const darkOk = isLight || (peBg && lum(peBg) < 0.45);
    return {
      theme, peBg, edBg, gutBg, sideBg, secBg, txt,
      panel2, field, panel, peBgCss, edBgCss,
      contrastOk, lightOk, darkOk,
      peUsesPanel: peBgCss.includes("rgb"),
      ok: !!(pe && edEl && side && contrastOk && lightOk && darkOk),
    };
  },
};
window.__H3_PE__.last = window.__H3_PE__.measure();
document.title = `pe ${theme} ${window.__H3_PE__.last.ok ? "OK" : "FAIL"}`;

import { H3Editor } from "../../web/js/h3s_editor.js";
import { applyTheme } from "../../web/js/h3s_theme.js";
import { applyUiScale, uiScaleSetting } from "../../web/js/h3s_ui_scale.js";

const params = new URLSearchParams(location.search);
const W = Number(params.get("w") || 1280);
const H = Number(params.get("h") || 800);
const scale = Number(params.get("scale") || 100);
const theme = params.get("theme") || "neon";

const project = {
  id: "p1", name: "Welcome",
  settings: { settings_scope: "project", final_mode: "refine", steps: 12, cfg: 1, denoise: 1, sampler: "euler", scheduler: "simple",
    aspect: "16:9", megapixels: 0.5, draft_scale: 0.5, refine_sigma: 0.4, upscale_method: "learned",
    seg_upscale: { method: "latent", mp: 1.0, sigma: 0.5 }, upscale_profiles: {}, upscale_gen: { mode: "project", model: "", loras: [] },
    accel: { attention: "kitchen" }, continuity_phrase: "", audio_declick: true, level_lock: true },
  segments: [{ id: "s1", name: "Отрезок 1", frames: 124, prompt: "hi", color: 0, link: "extend", gap: 0, refs: [], takes: [], take: null }],
  assets: [], audio: { clips: [], video_volume: 1 }, markers: [], result: null,
  assistant: { active: null, chats: [], presets: [], style_defs: [], cfg: {} }, chars: [],
};

const okJson = (data) => ({ ok: true, status: 200, json: async () => ({ ok: true, data }), text: async () => JSON.stringify({ ok: true, data }), arrayBuffer: async () => new ArrayBuffer(0) });
const routes = {
  "/h3zero/options": () => okJson({ samplers: ["euler"], schedulers: ["simple"], accel: {}, upscalers: {}, models: {} }),
  "/h3zero/models/downloads": () => okJson({ groups: [], models: [], counts: { installed: 0, total: 0, required_total: 2, required_missing: 1 } }),
  "/h3zero/models/downloads/jobs": () => okJson({ jobs: {} }),
  "/h3zero/models": () => okJson({ files: { checkpoint: [], unet: [], lora: [], text_encoder: [], vae: [] }, presets: [], cache: {}, missing: {} }),
  "/h3zero/inflight": () => okJson({ inflight: null }),
  "/h3zero/gallery": () => okJson([]),
  "/h3zero/projects": () => okJson([]),
  "/h3zero/chars": () => okJson([]),
  "/h3zero/runs": () => okJson({ runs: [] }),
  "/h3zero/monitor": () => okJson({ lines: [], after: 0 }),
  "/h3zero/themes": () => okJson({ themes: [], warnings: [] }),
  "/h3zero/ui": () => okJson({ welcome_dismissed: false }),
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
  getRaw: async (path) => { const j = await (await fetch(path)).json(); return (j && "data" in j && "ok" in j) ? j.data : j; },
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
document.body.style.cssText = `margin:0;height:${H}px;width:${W}px;overflow:hidden;background:#05070f;`;
try { localStorage.setItem("h3zs.uiScale", String(scale)); localStorage.setItem("h3zs.theme", theme); } catch {}
applyTheme(theme, true);

const ed = new H3Editor(host);
ed.open();
applyUiScale(scale, true, ed.root);
await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
ed.showWelcome({ counts: { required_missing: 1, required_total: 2, installed: 0, total: 0 } });
await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

window.__H3_WELCOME__ = {
  ed,
  measure() {
    const modal = ed.$.welcomeModal;
    const box = modal?.querySelector(".h3z-welcome");
    const wScale = modal?.querySelector(".h3z-welcome .h3z-ui-scale, .h3z-welcome-scale");
    const hScale = ed.root?.querySelector(".h3z-head .h3z-ui-scale");
    const stored = uiScaleSetting();
    const rootZoom = ed.root?.style.zoom || "";
    const boxR = box?.getBoundingClientRect();
    const modalR = modal?.getBoundingClientRect();
    const fits = !!(boxR && modalR && boxR.width <= modalR.width + 2 && boxR.height <= modalR.height + 2 && boxR.width > 40);
    // labels should match stored pct (header + welcome share one setting)
    const wLab = wScale?.querySelector(".h3z-dd-lab")?.textContent || wScale?.textContent || "";
    const hLab = hScale?.querySelector(".h3z-dd-lab")?.textContent || hScale?.textContent || "";
    const synced = wLab.includes(String(stored)) && hLab.includes(String(stored));
    const zoomOk = !rootZoom || Math.abs(Number(rootZoom) - stored / 100) < 0.001;
    return {
      w: W, h: H, scale: stored, rootZoom, hasWelcomeScale: !!wScale, hasHeaderScale: !!hScale,
      fits, synced, zoomOk, wLab, hLab,
      ok: !!(modal && box && wScale && hScale && fits && synced && zoomOk),
    };
  },
  async flipTo(pct) {
    ed.setUiScale(pct);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return this.measure();
  },
};
window.__H3_WELCOME__.last = window.__H3_WELCOME__.measure();
document.title = `welcome ${W}x${H}@${scale} ${window.__H3_WELCOME__.last.ok ? "OK" : "FAIL"}`;

/** Browser boot for assist layout audit. Served from repo root. */
import { H3Editor } from "../../web/js/h3s_editor.js";

const params = new URLSearchParams(location.search);
const panelW = Number(params.get("pw") || 360);
const panelH = Number(params.get("ph") || 700);
const view = params.get("view") || "chat";

const project = {
  id: "p1", name: "H3 проект",
  settings: {
    settings_scope: "project", final_mode: "refine",
    steps: 12, cfg: 1, denoise: 1, sampler: "euler", scheduler: "simple",
    aspect: "16:9", megapixels: 0.5, draft_scale: 0.5, refine_sigma: 0.4,
    upscale_method: "learned", seg_upscale: { method: "latent", mp: 1.0, sigma: 0.5 },
    upscale_profiles: {}, upscale_gen: { mode: "project", model: "", loras: [] },
    accel: { attention: "kitchen" }, continuity_phrase: "", audio_declick: true, level_lock: true,
  },
  segments: [{ id: "s1", name: "", frames: 192, prompt: "test scene", color: 0, link: "extend", gap: 0, refs: [] }],
  assets: [], audio: { clips: [], video_volume: 1 }, markers: [], result: null,
};
if (view === "chat-msgs") {
  project.assistant = {
    active: "c1",
    chats: [{ id: "c1", title: "Диалог", msgs: [
      { role: "user", text: "Сделай промпт для первого кадра" },
      { role: "assistant", text: "For the target video, at 0.00 seconds into the target video, <Picture 1> is fully referenced.\n\nintegrated_multimodal_description:\n[Shot 1] Soft morning light fills a quiet café as steam rises from a ceramic cup." },
    ]}],
    presets: [], style_defs: [], cfg: {},
  };
}

const okJson = (data) => ({ ok: true, status: 200, json: async () => ({ ok: true, data }), text: async () => JSON.stringify({ ok: true, data }),
  arrayBuffer: async () => new ArrayBuffer(0) });
const errJson = (status, error) => ({ ok: false, status, json: async () => ({ ok: false, error }), text: async () => JSON.stringify({ ok: false, error }) });
const routes = {
  "/h3zero/options": () => okJson({ samplers: ["euler"], schedulers: ["simple"], accel: { kitchen: true, sage: false, flash: false, veda: false, veda_predictors: [], teacache: false, compile: false }, upscalers: {}, models: {} }),
  "/h3zero/models/downloads": () => okJson({ groups: [], models: [], counts: { installed: 0, total: 0, required_total: 0, required_missing: 0 } }),
  "/h3zero/models/downloads/jobs": () => okJson({ jobs: {} }),
  "/h3zero/models": () => okJson({ files: { checkpoint: [], unet: [], lora: [], text_encoder: [], vae: [] }, presets: [], cache: {}, missing: {} }),
  "/h3zero/inflight": () => okJson({ inflight: null }),
  "/h3zero/gallery": () => okJson([]),
  "/h3zero/projects": () => okJson([]),
  "/h3zero/chars": () => okJson([]),
  "/h3zero/runs": () => okJson({ runs: [] }),
  "/h3zero/monitor": () => okJson({ lines: [], after: 0 }),
  "/h3zero/themes": () => okJson({ themes: [] }),
};
const _fetch = window.fetch.bind(window);
window.fetch = async (url, init = {}) => {
  const u = String(url);
  const pathOnly = u.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  if (routes[pathOnly]) return routes[pathOnly](init);
  return _fetch(url, init);
};

const host = {
  load: () => JSON.stringify(project),
  save: () => {},
  queue: async () => ({}),
  interrupt: async () => {},
  upload: async () => ({ name: "x.png", subfolder: "", type: "input" }),
  url: () => "about:blank",
  options: async () => (await (await fetch("/h3zero/options")).json()).data,
  getRaw: async (path) => (await (await fetch(path)).json()),
  clearCache: async () => {},
  onClose: () => {},
  onChange: () => {},
  get: async (path, params = {}) => {
    const q = new URLSearchParams(params).toString();
    const r = await fetch(path + (q ? "?" + q : ""));
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || String(r.status));
    return j.data;
  },
  call: async (path, body) => {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || String(r.status));
    return j.data;
  },
  status: async () => null,
  nodeId: () => "1",
};

document.documentElement.style.height = "100%";
document.body.style.cssText = "margin:0;height:100vh;background:#05070f;overflow:hidden;";

const ed = new H3Editor(host);
ed.open();
ed.closeWelcome?.();
if (ed.$.welcomeModal) ed.closeWelcome?.();

// Wait a couple frames for layout
await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

// Isolate left panel into a fixed shell
const shell = document.createElement("div");
shell.id = "layout-shell";
shell.style.cssText = `position:fixed;left:8px;top:8px;width:${panelW}px;height:${panelH}px;overflow:hidden;border:1px solid #334;box-sizing:border-box;background:#0a0e1c;z-index:9;`;
document.body.append(shell);

const L = ed.$.left;
const root = ed.root;
// Hide everything else
root.style.cssText = `position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;`;
L.style.cssText = `display:flex;flex-direction:column;width:${panelW}px;height:${panelH}px;min-width:0;min-height:0;max-width:${panelW}px;overflow:hidden;box-sizing:border-box;`;
shell.append(L);

ed.openAssist();
await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
if (view !== "chat" && view !== "chat-msgs") {
  ed.astOpenSettings(view);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

window.__H3_LAYOUT__ = {
  ed,
  panel: L,
  measure() {
    const panel = L;
    const panelBox = panel.getBoundingClientRect();
    const compose = panel.querySelector(".h3z-ast-compose");
    const scroll = panel.querySelector(".h3z-ast-panel .h3z-scroll, .h3z-setbody, .h3z-scroll");
    const offenders = [];
    const check = (el, label) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.right > panelBox.right + 1.5) offenders.push({ label, why: "right", over: +(r.right - panelBox.right).toFixed(1) });
      if (r.bottom > panelBox.bottom + 1.5) offenders.push({ label, why: "bottom", over: +(r.bottom - panelBox.bottom).toFixed(1) });
      if (el.scrollWidth > el.clientWidth + 1) offenders.push({ label, why: "scrollWidth", sw: el.scrollWidth, cw: el.clientWidth });
    };
    check(panel, "panel");
    check(panel.querySelector(".h3z-ast-panel"), "ast-panel");
    check(scroll, "scroll");
    check(compose, "compose");
    check(panel.querySelector("textarea.h3z-ast-input"), "textarea");
    check(panel.querySelector(".h3z-ast-toolbar"), "toolbar");
    check(panel.querySelector(".h3z-ast-histrow"), "histrow");
    const inYScroll = (el) => {
      let p = el;
      while (p && p !== panel) {
        if (p.classList && (p.classList.contains("h3z-scroll") || p.classList.contains("h3z-setbody"))) return true;
        p = p.parentElement;
      }
      return false;
    };
    for (const el of panel.querySelectorAll(".h3z-ast-panel *, .h3z-ph, .h3z-ast-compose, .h3z-ast-compose *")) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (r.right > panelBox.right + 1.5) {
        offenders.push({ label: String(el.className || el.tagName).slice(0, 48), why: "child-right", over: +(r.right - panelBox.right).toFixed(1) });
        break;
      }
      // vertical overflow inside a scroll region is expected; only non-scroll chrome must stay in bounds
      if (!inYScroll(el) && r.bottom > panelBox.bottom + 1.5) {
        offenders.push({ label: String(el.className || el.tagName).slice(0, 48), why: "child-bottom", over: +(r.bottom - panelBox.bottom).toFixed(1) });
        break;
      }
    }
    // scroll containers themselves must fit in the panel box
    for (const sc of panel.querySelectorAll(".h3z-scroll, .h3z-setbody")) {
      const r = sc.getBoundingClientRect();
      if (r.bottom > panelBox.bottom + 1.5) offenders.push({ label: "scroll-box", why: "bottom", over: +(r.bottom - panelBox.bottom).toFixed(1) });
      if (r.right > panelBox.right + 1.5) offenders.push({ label: "scroll-box", why: "right", over: +(r.right - panelBox.right).toFixed(1) });
      if (sc.scrollWidth > sc.clientWidth + 1) offenders.push({ label: "scroll-box", why: "scrollWidth", sw: sc.scrollWidth, cw: sc.clientWidth });
    }
    const ta = panel.querySelector("textarea.h3z-ast-input");
    const taBox = ta?.getBoundingClientRect();
    const composeBox = compose?.getBoundingClientRect();
    const chat = !String(view).includes("connection") && !["presets","styles","generation","context"].includes(view);
    const out = {
      view, panelW: +panelBox.width.toFixed(1), panelH: +panelBox.height.toFixed(1),
      composeInside: !compose || (composeBox.bottom <= panelBox.bottom + 1.5 && composeBox.right <= panelBox.right + 1.5),
      taFullWidth: !chat || !ta ? true : (taBox.width >= Math.min(panelBox.width - 40, panelBox.width * 0.82)),
      taWidth: taBox ? +taBox.width.toFixed(1) : 0,
      hasInputbox: !!panel.querySelector(".h3z-ast-inputbox"),
      hasCtx: !!panel.querySelector(".h3z-ast-ctx"),
      hasNeighPill: !!panel.querySelector(".h3z-ast-neighpill"),
      hasEmptyBlurb: !!panel.querySelector(".h3z-ast-emptyblurb"),
      hasModeLabel: !!(panel.querySelector(".h3z-ast-moderow .h3z-lbl")),
      hasDialogLabel: !!(panel.querySelector(".h3z-ast-histrow .h3z-lbl")),
      mainBgTransparent: (() => { const el = panel.querySelector(".h3z-ast-main"); if (!el) return true; const bg = getComputedStyle(el).backgroundColor; return !bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent"; })(),
      hasSuggest: !!panel.querySelector(".h3z-ast-sugg, .h3z-ast-suggest"),
      hasSelect: !!panel.querySelector("select"),
      offenders: offenders.slice(0, 15),
      ok: false,
    };
    const settings = ["connection","presets","styles","generation","context"].includes(view);
    const emptyChat = view === "chat";
    out.ok = out.offenders.length === 0 && out.composeInside && out.taFullWidth && !out.hasInputbox && !out.hasCtx && !out.hasSelect && !out.hasSuggest
      && (settings || out.hasNeighPill) && (!emptyChat || out.hasEmptyBlurb) && (view !== "chat-msgs" || !out.hasEmptyBlurb)
      && (settings || (out.hasModeLabel && out.hasDialogLabel && out.mainBgTransparent));
    return out;
  },
};

const m = window.__H3_LAYOUT__.measure();
window.__H3_LAYOUT__.last = m;
document.title = `assist ${view} ${panelW}x${panelH} ${m.ok ? "OK" : "FAIL"}`;

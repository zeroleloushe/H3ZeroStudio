/** Full studio layout audit with real H3 CSS. */
import { H3Editor } from "../../web/js/h3s_editor.js";
import { applyTheme } from "../../web/js/h3s_theme.js";
import { setLangForTests } from "../../web/js/h3s_i18n.js";
import { applyUiScale, uiScaleSetting } from "../../web/js/h3s_ui_scale.js";

const params = new URLSearchParams(location.search);
const W = Number(params.get("w") || 1920);
const H = Number(params.get("h") || 1080);
const scale = Number(params.get("scale") || 100);
const theme = params.get("theme") || "neon";

const longPrompt = "Сделай кинематографичный промпт: героиня Anna идёт по тёмному коридору, continuous shot, no cuts, мягкий боковой свет, камера медленно следует сзади, шаги и дыхание в overall_soundscape, без диалога. Сохрани внешность и одежду из референсов. Добавь Premium Cinema ощущение.";

const project = {
  id: "p1", name: "H3 проект layout",
  settings: {
    settings_scope: "project", final_mode: "refine",
    steps: 12, cfg: 1, denoise: 1, sampler: "euler", scheduler: "simple",
    aspect: "16:9", megapixels: 0.5, draft_scale: 0.5, refine_sigma: 0.4,
    upscale_method: "learned", seg_upscale: { method: "latent", mp: 1.0, sigma: 0.5 },
    upscale_profiles: {}, upscale_gen: { mode: "project", model: "", loras: [] },
    accel: { attention: "kitchen" }, continuity_phrase: "", audio_declick: true, level_lock: true,
  },
  segments: [{
    id: "s1", name: "Отрезок 1", frames: 192, prompt: longPrompt, color: 0, link: "extend", gap: 0, refs: [],
    takes: [
      { id: "t1", label: "1", thumb: "", prompt: "a" },
      { id: "t2", label: "2", thumb: "", prompt: "b" },
      { id: "t3", label: "3", thumb: "", prompt: "c" },
      { id: "t4", label: "4", thumb: "", prompt: "d" },
      { id: "t5", label: "5", thumb: "", prompt: "e" },
    ],
    take: "t5",
  }],
  assets: [], audio: { clips: [], video_volume: 1 }, markers: [], result: null,
  assistant: {
    active: "c1",
    chats: [{ id: "c1", title: "Привет, какая инфо о проекте у тебя есть?", msgs: [
      { role: "user", text: "Привет, какая инфо о проекте у тебя есть? Нужен long continuous shot без склеек." },
      { role: "assistant", text: "## Контекст\n\n- **Кадры**: 192\n- **Персонаж**: Anna\n- код `Ref2VA`\n\nUse `non_diegetic_music` and subject_definitions with retention_analysis. Keep non_diegetic_music literal; say _italic_ once.\n\nСоберу промпт.",
        reasoning: "Нужно описать: continuous shot. Я напишу. Нужно описать: no cuts." },
    ]}],
    presets: [], style_defs: [],
    cfg: { show_reasoning: true, thinking: true, styles: ["premium_cinema"], api_model: "swift-1.5-iq2_xs", api_base: "http://127.0.0.1:1234/v1" },
  },
  chars: [{ id: "anna", name: "Анна", thumb: "" }],
};

const okJson = (data) => ({ ok: true, status: 200, json: async () => ({ ok: true, data }), text: async () => JSON.stringify({ ok: true, data }),
  arrayBuffer: async () => new ArrayBuffer(0) });
const routes = {
  "/h3zero/options": () => okJson({ samplers: ["euler"], schedulers: ["simple"], accel: { kitchen: true, sage: false, flash: false, veda: false, veda_predictors: [], teacache: false, compile: false }, upscalers: {}, models: {} }),
  "/h3zero/models/downloads": () => okJson({ groups: [], models: [], counts: { installed: 0, total: 0, required_total: 0, required_missing: 0 } }),
  "/h3zero/models/downloads/jobs": () => okJson({ jobs: {} }),
  "/h3zero/models": () => okJson({ files: { checkpoint: [], unet: [], lora: [], text_encoder: [], vae: [] }, presets: [], cache: {}, missing: {} }),
  "/h3zero/inflight": () => okJson({ inflight: null }),
  "/h3zero/gallery": () => okJson([]),
  "/h3zero/projects": () => okJson([]),
  "/h3zero/chars": () => okJson(project.chars),
  "/h3zero/runs": () => okJson({ current: { status: "done", start: 1, end: 343, dur: 343, what: "gen" }, history: [{ status: "done", start: 1, end: 343, dur: 343, what: "gen" }], now: Date.now()/1000 }),
  "/h3zero/monitor": () => okJson({ lines: [], after: 0, metrics: { cpu: { percent: 8 }, ram: { percent: 28 }, gpu: { percent: 1, vram_percent: 19, temperature: 51, name: "RTX" } }, seq: 1 }),
  "/h3zero/themes": () => okJson({ themes: [] }),
  "/h3zero/llm/connect": () => okJson({ connected: true, models: ["swift-1.5-iq2_xs"], base: "http://127.0.0.1:1234/v1" }),
  "/h3zero/settings": () => okJson({ settings: {} }),
  "/h3zero/ui": () => okJson({ welcome_dismissed: true }),
};
const _fetch = window.fetch.bind(window);
window.fetch = async (url, init = {}) => {
  const pathOnly = String(url).replace(/^https?:\/\/[^/]+/, "").split("?")[0];
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

document.documentElement.style.cssText = "height:100%;margin:0;";
document.body.style.cssText = `margin:0;height:${H}px;width:${W}px;overflow:hidden;background:#05070f;`;
applyTheme(theme);
try { localStorage.setItem("h3zs.uiScale", String(scale)); } catch {}

const ed = new H3Editor(host);
ed.open();
ed.closeWelcome?.();
applyUiScale(scale, false, ed.root);
ed.openAssist();

// Seed composer with long text + style chip already in cfg; force layout
const ta = ed.root.querySelector("textarea.h3z-ast-input");
if (ta) { ta.value = longPrompt; ed.astAutoGrow(ta); }

await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
ed.applyLayout?.(); ed.renderTimeline?.(); ed.layoutStage?.();
await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

function outside(panel, el, pad = 1.5) {
  if (!panel || !el) return null;
  // Menus / portals intentionally escape panels
  if (el.closest?.(".h3z-menu,.h3z-dd,.h3z-toast,.h3z-modal,.h3z-pe-modal")) return null;
  const pb = panel.getBoundingClientRect(), r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  // Skip elements scrolled out of the visible viewport of a scrollable panel (vertical scroll is OK)
  const issues = [];
  if (r.right > pb.right + pad) issues.push({ why: "right", over: +(r.right - pb.right).toFixed(1) });
  if (r.left < pb.left - pad) issues.push({ why: "left", over: +(pb.left - r.left).toFixed(1) });
  return issues.length ? issues : null;
}

window.__H3_STUDIO__ = {
  ed,
  measure() {
    const root = ed.root;
    const left = ed.$.left, insp = ed.$.insp, head = ed.$.head;
    const send = left?.querySelector(".h3z-ast-send");
    const compose = left?.querySelector(".h3z-ast-compose");
    const ta = left?.querySelector("textarea.h3z-ast-input");
    const scroll = left?.querySelector(".h3z-ast-panel .h3z-scroll");
    const scaleBtn = head?.querySelector(".h3z-ui-scale");
    const offenders = [];
    const checkPanel = (panel, label) => {
      if (!panel) return;
      if (panel.scrollWidth > panel.clientWidth + 3) offenders.push({ label, why: "scrollWidth", sw: panel.scrollWidth, cw: panel.clientWidth });
      for (const el of panel.querySelectorAll("button, .h3z-pill, .h3z-sel, .h3z-card, .h3z-ast-compose, .h3z-ast-toolbar, textarea")) {
        if (el.closest?.(".h3z-menu,.h3z-dd")) continue;
        const iss = outside(panel, el, 3);
        if (iss) { offenders.push({ label: label + ":" + String(el.className || el.tagName).slice(0, 40), ...iss[0], cls: String(el.className).slice(0,60) }); break; }
      }
    };
    checkPanel(left, "left");
    checkPanel(insp, "insp");
    checkPanel(head, "head");
    const sendBox = send?.getBoundingClientRect();
    const leftBox = left?.getBoundingClientRect();
    const sendVisible = !!(send && leftBox && sendBox && sendBox.right <= leftBox.right + 1.5 && sendBox.width > 8);
    const composeH = compose?.getBoundingClientRect().height || 0;
    const leftH = leftBox?.height || 1;
    const composeShare = composeH / leftH;
    const scrollH = scroll?.getBoundingClientRect().height || 0;
    const taMax = ta ? parseFloat(getComputedStyle(ta).maxHeight) || 0 : 0;
    const out = {
      w: W, h: H, scale: uiScaleSetting(),
      sendVisible, composeShare: +composeShare.toFixed(3), scrollH: +scrollH.toFixed(1),
      taMaxH: taMax, hasScaleBtn: !!scaleBtn,
      leftOverflowX: left ? left.scrollWidth > left.clientWidth + 3 : false,
      inspOverflowX: insp ? insp.scrollWidth > insp.clientWidth + 3 : false,
      offenders: offenders.slice(0, 20),
      ok: false,
    };

    const tools = left?.querySelector(".h3z-ast-tools");
    const histrow = left?.querySelector(".h3z-ast-histrow");
    const histacts = left?.querySelector(".h3z-ast-histacts");
    const taEl = left?.querySelector("textarea.h3z-ast-input");
    const toolsH = tools ? tools.getBoundingClientRect().height : 0;
    const histH = histrow ? histrow.getBoundingClientRect().height : 0;
    const taH = taEl ? taEl.getBoundingClientRect().height : 0;
    // CSS zoom: heights from getBoundingClientRect are viewport px; local ≈ /scale
    const s = Math.max(0.5, (uiScaleSetting() || 100) / 100);
    out.toolbarOneRow = toolsH > 0 && toolsH / s <= 36;
    out.histOneRow = histH > 0 && histH / s <= 40;
    out.taLocalH = +(taH / s).toFixed(1);
    out.taOk = out.taLocalH <= 148;
    out.neighCompact = !!(left?.querySelector(".h3z-ast-neighpill"));
    out.styleCounter = !![...(left?.querySelectorAll(".h3z-ast-tools .h3z-pill") || [])].some((p) => /Стили/.test(p.textContent || ""));
    out.toastErr = !![...document.querySelectorAll(".h3z-toast.err")].length;

    // Browser-zoom-like root: layout box = viewport/scale, visual fills viewport.
    const zoom = parseFloat(root.style.zoom || "1") || 1;
    out.rootZoom = zoom;
    out.rootClientW = root.clientWidth;
    out.rootClientH = root.clientHeight;
    out.rootRectW = +root.getBoundingClientRect().width.toFixed(1);
    out.rootRectH = +root.getBoundingClientRect().height.toFixed(1);
    const expectW = Math.round(window.innerWidth / zoom);
    const expectH = Math.round(window.innerHeight / zoom);
    out.zoomBoxOk = Math.abs(zoom - s) < 0.02
      && Math.abs(out.rootClientW - expectW) <= 4
      && Math.abs(out.rootClientH - expectH) <= 4
      && Math.abs(out.rootRectW - window.innerWidth) <= 6
      && Math.abs(out.rootRectH - window.innerHeight) <= 6;

    // Header title + MODE + DIALOG + composer: fully inside panel, no overlaps, flex-none.
    const panel = left?.querySelector(".h3z-ast-panel");
    const panelBox = panel?.getBoundingClientRect();
    const title = panel?.querySelector(":scope > .h3z-ph") || left?.querySelector(".h3z-ph");
    const mode = panel?.querySelector(":scope > .h3z-ast-moderow") || left?.querySelector(".h3z-ast-moderow");
    const hist = panel?.querySelector(":scope > .h3z-ast-histrow") || left?.querySelector(".h3z-ast-histrow");
    const titleBox = title?.getBoundingClientRect();
    const modeBox = mode?.getBoundingClientRect();
    const histBox = hist?.getBoundingClientRect();
    const composeBox = compose?.getBoundingClientRect();
    const pad = 2.5;
    const inside = (box, host) => !!(box && host && box.height > 4
      && box.top >= host.top - pad && box.bottom <= host.bottom + pad
      && box.left >= host.left - pad && box.right <= host.right + pad);
    const host = panelBox || leftBox;
    out.titleInside = inside(titleBox, host);
    out.modeVisible = inside(modeBox, host) && (modeBox?.height || 0) > 8;
    out.histInside = inside(histBox, host) && (histBox?.height || 0) > 8;
    out.composeInside = inside(composeBox, host) && (composeBox?.height || 0) > 20;
    // Stacked without overlap (title → mode → dialog → … → composer)
    out.headerStackOk = !!(titleBox && modeBox && histBox && composeBox
      && titleBox.bottom <= modeBox.top + pad
      && modeBox.bottom <= histBox.top + pad
      && histBox.bottom <= composeBox.top + pad);
    const flexNone = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      return cs.flexGrow === "0" && cs.flexShrink === "0";
    };
    out.headerFlexNone = flexNone(title) && flexNone(mode) && flexNone(hist) && flexNone(compose);

    // Header popovers (timer + resources) must anchor under their triggers at every scale.
    out.headerPopOk = true;
    out.headerPops = [];
    const checkPop = (name, openFn, closeFn, triggerSel, popSel) => {
      try {
        closeFn?.();
        const trig = ed.root.querySelector(triggerSel);
        if (!trig) { out.headerPops.push({ name, ok: false, why: "no-trigger" }); out.headerPopOk = false; return; }
        openFn(trig);
        const pop = ed.root.querySelector(popSel);
        if (!pop) { out.headerPops.push({ name, ok: false, why: "no-pop" }); out.headerPopOk = false; return; }
        const tb = trig.getBoundingClientRect(), pb = pop.getBoundingClientRect();
        const rootBox = ed.root.getBoundingClientRect();
        const pad = 4;
        // horizontally overlapping trigger (center of pop near trigger) OR left edge within trigger width band
        const popMid = pb.left + pb.width / 2;
        const trigMid = tb.left + tb.width / 2;
        const dx = Math.abs(popMid - trigMid);
        const startDx = Math.abs(pb.left - tb.left);
        const anchored = Math.min(dx, startDx) <= Math.max(tb.width, 48) + pad || (pb.left <= tb.right + pad && pb.right >= tb.left - pad);
        const below = pb.top >= tb.bottom - pad;
        const inRoot = pb.left >= rootBox.left - pad && pb.right <= rootBox.right + pad + 2;
        const ok = anchored && below && inRoot && pb.width > 40;
        out.headerPops.push({ name, ok, dx: +dx.toFixed(1), startDx: +startDx.toFixed(1), below, inRoot, popW: +pb.width.toFixed(1) });
        if (!ok) out.headerPopOk = false;
        closeFn?.();
      } catch (e) {
        out.headerPops.push({ name, ok: false, why: String(e.message || e) });
        out.headerPopOk = false;
      }
    };
    // Ensure timer/monitor chips exist
    try { ed.timerEl?.(); ed.monitorEl?.(); ed.timerSync?.(); } catch {}
    checkPop("timer",
      () => { ed.$.tpop?.remove?.(); ed.$.tpop = null; ed.timerPopover?.(false); },
      () => { ed.$.tpop?.remove?.(); ed.$.tpop = null; },
      ".h3z-timer", ".h3z-tpop");
    checkPop("monitor",
      () => { if (!ed.$.monitorPop) ed.monitorOpen?.(); },
      () => ed.monitorClose?.(false),
      ".h3z-sysmon", ".h3z-monpop");


    // Title controls: status pill + gear equal height, centers ≤1px
    const statusEl = title?.querySelector?.(".h3z-ast-status") || left?.querySelector(".h3z-ast-status");
    const gearEl = title?.querySelector?.(".h3z-ast-gear") || left?.querySelector(".h3z-ast-gear");
    // title var is the ph row; h3 is inside it
    const h3el = title?.querySelector?.("h3");
    const sBox = statusEl?.getBoundingClientRect();
    const gBox = gearEl?.getBoundingClientRect();
    const h3Box = h3el?.getBoundingClientRect();
    const mid = (b) => (b.top + b.bottom) / 2;
    if (sBox && gBox && h3Box) {
      const sFac = Math.max(0.5, (uiScaleSetting() || 100) / 100);
      const loc = (v) => v / sFac;
      out.titleAlignOk = Math.abs(sBox.height - gBox.height) <= 1.01
        && Math.abs(mid(sBox) - mid(gBox)) <= 1.01
        && Math.abs(mid(h3Box) - mid(sBox)) <= 1.01
        && Math.abs(loc(sBox.height) - 28) <= 2.5
        && Math.abs(loc(gBox.width) - 28) <= 2.5
        && loc(sBox.width) >= 56;
    } else out.titleAlignOk = false;

    // Markdown: snake_case keys must survive (no intraword emphasis).
    const mdHtml = [...(left?.querySelectorAll(".h3z-ast-msg:not(.user) .h3z-ast-bubble") || [])]
      .map((b) => b.innerHTML || "").join("\n");
    out.mdSnakeOk = mdHtml.includes("non_diegetic_music") && mdHtml.includes("subject_definitions")
      && mdHtml.includes("retention_analysis") && /<em>italic<\/em>/.test(mdHtml)
      && !/nondiegeticmusic/.test(mdHtml)
      && !/<em>diegetic<\/em>/.test(mdHtml);

    out.ok = out.sendVisible && out.composeShare <= 0.36 && out.scrollH >= 80 && !out.leftOverflowX && !out.inspOverflowX
      && out.offenders.length === 0 && out.hasScaleBtn && out.toolbarOneRow && out.histOneRow && out.taOk && !out.toastErr
      && out.zoomBoxOk && out.titleInside && out.modeVisible && out.histInside && out.composeInside
      && out.headerStackOk && out.headerFlexNone && out.mdSnakeOk && out.titleAlignOk && out.headerPopOk;
    return out;
  },
};

window.__H3_STUDIO__.last = window.__H3_STUDIO__.measure();
document.title = `studio ${W}x${H} @${scale} ${window.__H3_STUDIO__.last.ok ? "OK" : "FAIL"}`;

/** Browser boot for assist layout audit. Served from repo root. */
import { H3Editor } from "../../web/js/h3s_editor.js";
import { applyTheme } from "../../web/js/h3s_theme.js";
import { applyUiScale } from "../../web/js/h3s_ui_scale.js";

const params = new URLSearchParams(location.search);
const panelW = Number(params.get("pw") || 360);
const panelH = Number(params.get("ph") || 700);
const view = params.get("view") || "chat";
const theme = params.get("theme") || "neon";
const scale = Number(params.get("scale") || 100);

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
if (view === "chat-msgs" || view === "chat-stream" || view === "chat-keys" || view === "chat-draft" || view === "chat-md") {
  project.assistant = {
    active: "c1",
    chats: [{ id: "c1", title: "Диалог", msgs: [
      { role: "user", text: "Привет, какая инфо о проекте у тебя есть?" },
      { role: "assistant", text: "В контексте есть:\n\n- **Кадры**: 192 (8 с)\n- **Персонаж**: Anna\n- код `Ref2VA`\n\n<script>x</script>",
        reasoning: "Пользователь спрашивает про контекст проекта. Нужно перечислить отрезок, референсы и режим." },
    ]}],
    presets: [], style_defs: [], cfg: { show_reasoning: true, thinking: true },
  };
}

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
  "/h3zero/chars": () => okJson([]),
  "/h3zero/runs": () => okJson({ runs: [] }),
  "/h3zero/monitor": () => okJson({ lines: [], after: 0 }),
  "/h3zero/themes": () => okJson({ themes: [] }),
  "/h3zero/llm/connect": () => okJson({ connected: true, models: ["swift-1.5-iq2_xs"], base: "http://127.0.0.1:1234/v1" }),
  "/h3zero/llm/models": () => okJson({ models: ["swift-1.5-iq2_xs"] }),
  "/h3zero/settings": () => okJson({ settings: {} }),
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
applyTheme(theme);

const ed = new H3Editor(host);
ed.open();
ed.closeWelcome?.();
if (ed.$.welcomeModal) ed.closeWelcome?.();

await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

const shell = document.createElement("div");
shell.id = "layout-shell";
shell.style.cssText = `position:fixed;left:8px;top:8px;width:${panelW}px;height:${panelH}px;overflow:hidden;border:1px solid #334;box-sizing:border-box;background:#0a0e1c;z-index:9;`;
document.body.append(shell);

const L = ed.$.left;
const root = ed.root;
root.style.cssText = `position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;`;
L.style.cssText = `display:flex;flex-direction:column;width:${panelW}px;height:${panelH}px;min-width:0;min-height:0;max-width:${panelW}px;overflow:hidden;box-sizing:border-box;`;
shell.append(L);

ed.openAssist();
if (!ed.p.assistant.cfg) ed.p.assistant.cfg = {};
ed.p.assistant.cfg.api_model = "swift-1.5-iq2_xs";
applyUiScale(scale, false, ed.root);
// Wait for async astConnect, then pin connected status + model for title-row checks.
await new Promise((r) => setTimeout(r, 80));
if (ed._ast) ed._ast.status = { state: "connected", models: ["swift-1.5-iq2_xs"], error: "" };
ed.renderAssist?.();
await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
if (scale !== 100) {
  shell.style.zoom = String(scale / 100);
}

if (view !== "chat" && view !== "chat-msgs" && view !== "chat-stream" && view !== "chat-keys" && view !== "chat-draft" && view !== "chat-md") {
  ed.astOpenSettings(view);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

function sampleBg(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return null;
  const x = Math.min(window.innerWidth - 1, Math.max(0, Math.floor(r.left + Math.min(24, r.width / 2))));
  const y = Math.min(window.innerHeight - 1, Math.max(0, Math.floor(r.top + Math.min(18, r.height / 2))));
  // Approximate via computed style — canvas pixel pick of glass/blur is noisy; compare declared backgrounds.
  const cs = getComputedStyle(el);
  return { bg: cs.backgroundColor, x, y, w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
}

function bgLooksTransparent(bg) {
  if (!bg) return true;
  const s = String(bg).replace(/\s+/g, "");
  return s === "transparent" || s === "rgba(0,0,0,0)" || s === "rgba(0,0,0,0.0)";
}

function colorClose(a, b, tol = 18) {
  const pa = parseColor(a), pb = parseColor(b);
  if (!pa || !pb) return a === b;
  return Math.abs(pa[0] - pb[0]) <= tol && Math.abs(pa[1] - pb[1]) <= tol && Math.abs(pa[2] - pb[2]) <= tol
    && Math.abs((pa[3] ?? 1) - (pb[3] ?? 1)) <= 0.15;
}

function parseColor(c) {
  if (!c) return null;
  const m = String(c).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/i);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] == null ? 1 : Number(m[4])];
}

async function runStreamSim() {
  // Build a pending assistant message and drive astPaintStream like SSE would.
  if (!ed.astChat()) ed.astNewChat(false);
  const cid = ed.p.assistant.active;
  ed.astSet((a) => {
    const c = a.chats.find((x) => x.id === cid);
    c.msgs = [
      { role: "user", text: "Привет" },
      { role: "assistant", text: "" },
    ];
  });
  ed._ast.busy = true;
  ed.renderAssist();
  await new Promise((r) => requestAnimationFrame(r));
  let reasoning = "", answer = "";
  const chunks = [
    { kind: "reasoning", text: "Сначала" },
    { kind: "reasoning", text: " **подумаю** о контексте…\n" },
    { kind: "reasoning", text: "У пользователя один отрезок." },
    { kind: "token", text: "В контексте есть:\n" },
    { kind: "token", text: "- **Кадры**: 192\n" },
    { kind: "token", text: "- `Ref2VA`\n" },
    { kind: "token", text: "<script>x</script>" },
  ];
  const mid = { open: false, live: false, body: "", answer: "" };
  for (const ch of chunks) {
    if (ch.kind === "reasoning") reasoning += ch.text;
    else answer += ch.text;
    ed.astPaintStream(answer, reasoning);
    await new Promise((r) => requestAnimationFrame(r));
    if (!answer && reasoning.length > 10 && !mid.open) {
      const d = L.querySelector(".h3z-ast-msg.pending .h3z-ast-reason");
      mid.open = !!(d && d.open);
      mid.live = !!(d && d.classList.contains("live"));
      mid.body = d?.querySelector(".h3z-ast-reasonbody")?.textContent || "";
      mid.answer = L.querySelector(".h3z-ast-msg.pending .tx")?.textContent || "";
      window.__H3_STREAM_MID__ = { ...mid, html: L.querySelector(".h3z-ast-msg.pending")?.outerHTML?.slice(0, 500) };
    }
  }
  const afterDetails = L.querySelector(".h3z-ast-msg.pending .h3z-ast-reason");
  const ansEl = L.querySelector(".h3z-ast-msg.pending .tx");
  window.__H3_STREAM_AFTER__ = {
    open: !!(afterDetails && afterDetails.open),
    live: !!(afterDetails && afterDetails.classList.contains("live")),
    body: afterDetails?.querySelector(".h3z-ast-reasonbody")?.textContent || "",
    answer: ansEl?.textContent || "",
    hasContentWrap: !!L.querySelector(".h3z-ast-msg.pending .h3z-ast-content"),
    hasStrong: !!ansEl?.querySelector("strong"),
    hasCode: !!ansEl?.querySelector("code"),
    noScript: !ansEl?.querySelector("script") && !(ansEl?.innerHTML || "").includes("<script"),
    escapedScript: (ansEl?.innerHTML || "").includes("&lt;script&gt;"),
  };
  return { mid: window.__H3_STREAM_MID__, after: window.__H3_STREAM_AFTER__ };
}

function runKeySim() {
  const ta = L.querySelector("textarea.h3z-ast-input");
  const out = { enter: false, ctrlEnter: false, shiftEnter: false, composing: false, busyBlocked: false, emptyBlocked: false };
  if (!ta) return { ...out, err: "no textarea" };
  let sendCount = 0;
  const orig = ed.astSend.bind(ed);
  ed.astSend = async () => { sendCount++; };
  ta.focus();
  ta.value = "hello";
  // Enter → send
  let before = sendCount;
  ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  // Also exercise capture path via editor.onKey
  ed.onKey(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  // Re-target: onKey checks e.target
  const enterEv = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  Object.defineProperty(enterEv, "target", { get: () => ta });
  ed.onKey(enterEv);
  out.enter = sendCount > before;

  // Ctrl+Enter → send
  before = sendCount;
  const ctrlEv = new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true });
  Object.defineProperty(ctrlEv, "target", { get: () => ta });
  ed.onKey(ctrlEv);
  out.ctrlEnter = sendCount > before;

  // Shift+Enter → no send
  before = sendCount;
  const shiftEv = new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true });
  Object.defineProperty(shiftEv, "target", { get: () => ta });
  ed.onKey(shiftEv);
  out.shiftEnter = sendCount === before;

  // IME composing → no send
  before = sendCount;
  const imeEv = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  Object.defineProperty(imeEv, "target", { get: () => ta });
  Object.defineProperty(imeEv, "isComposing", { get: () => true });
  ed.onKey(imeEv);
  out.composing = sendCount === before;

  // Busy → no send
  before = sendCount;
  ed._ast.busy = true;
  const busyEv = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  Object.defineProperty(busyEv, "target", { get: () => ta });
  ed.onKey(busyEv);
  out.busyBlocked = sendCount === before;
  ed._ast.busy = false;

  // Empty still calls astSend (which no-ops) — we stubbed astSend, so verify stub would be called;
  // for empty we check real astSend gates separately via source; here ensure Enter still routes.
  ta.value = "";
  before = sendCount;
  const emptyEv = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  Object.defineProperty(emptyEv, "target", { get: () => ta });
  ed.onKey(emptyEv);
  out.emptyBlocked = sendCount > before; // key path still invokes astSend; empty guard is inside astSend
  ed.astSend = orig;
  return out;
}


async function runDraftSim() {
  const ta = L.querySelector("textarea.h3z-ast-input");
  const out = { wrote: false, afterStyles: "", restored: false, ls: false, uploadsKept: false, stylesKept: false };
  if (!ta) return { ...out, err: "no textarea" };
  ta.value = "Черновик который не должен пропасть";
  ed.astAutoGrow(ta);
  ed.astRememberDraft(ta);
  ed.astPersistDrafts();
  out.wrote = true;
  // Attach a fake upload in memory
  ed._ast.uploads = [{ kind: "asset", token: "[User image 1]", label: "shot.png", asset: { file: "shot.png", subfolder: "", type: "input" } }];
  ed.p.assistant.cfg.styles = ["s_demo"];
  // Open styles (destroys composer) then come back
  ed.astOpenSettings("styles");
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const midGone = !L.querySelector("textarea.h3z-ast-input");
  ed._ast.setOpen = false;
  ed.renderLeft();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const next = L.querySelector("textarea.h3z-ast-input");
  out.afterStyles = next?.value || "";
  out.restored = out.afterStyles === "Черновик который не должен пропасть";
  out.uploadsKept = (ed._ast.uploads || []).length === 1;
  out.stylesKept = Array.isArray(ed.p.assistant.cfg.styles) && ed.p.assistant.cfg.styles.includes("s_demo");
  out.draftMap = ed._ast.drafts?.[ed.astDraftId()]?.text || "";
  try {
    const raw = localStorage.getItem("h3zs.ast.drafts");
    const data = raw ? JSON.parse(raw) : {};
    const id = ed.astDraftId();
    out.ls = !!(data[id] && data[id].text === "Черновик который не должен пропасть");
  } catch { out.ls = false; }
  out.midGone = midGone;

  // After send: composer must stay empty across re-render / Styles / draft reload
  const ta2 = L.querySelector("textarea.h3z-ast-input");
  if (ta2) {
    ta2.value = "Текст для отправки";
    ed.astRememberDraft(ta2);
    ed.astPersistDrafts();
  }
  // Stub network send path: emulate successful take of text without API
  const origSend = ed.astSend.bind(ed);
  ed.astSend = async function () {
    const A = this._ast; if (!A || A.busy) return;
    const ta = A.el.querySelector("textarea.h3z-ast-input");
    const text = ta?.value.trim(); if (!text) return;
    if (ta) { ta.value = ""; ta.style.height = "44px"; }
    this.astClearDraft(this.p.assistant.active);
    A.busy = true; this.astPaintComposer();
    if (!this.astChat()) this.astNewChat(false);
    const cid = this.p.assistant.active;
    this.astSet((a) => {
      const c = a.chats.find((x) => x.id === cid);
      c.msgs.push({ role: "user", text });
      c.msgs.push({ role: "assistant", text: "ok" });
    });
    this.astClearDraft(cid);
    A.busy = false;
    this.renderAssist();
  };
  await ed.astSend();
  ed.astSend = origSend;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const afterSend = L.querySelector("textarea.h3z-ast-input")?.value || "";
  ed.astOpenSettings("styles");
  await new Promise((r) => requestAnimationFrame(r));
  ed._ast.setOpen = false; ed.renderLeft();
  await new Promise((r) => requestAnimationFrame(r));
  // simulate reload of drafts from LS
  ed._ast.drafts = ed.astLoadDrafts();
  ed.renderLeft();
  await new Promise((r) => requestAnimationFrame(r));
  const afterReload = L.querySelector("textarea.h3z-ast-input")?.value || "";
  let lsAfter = false;
  try {
    const data = JSON.parse(localStorage.getItem("h3zs.ast.drafts") || "{}");
    lsAfter = !data[ed.astDraftId()]?.text;
  } catch { lsAfter = false; }
  out.sendCleared = afterSend === "" && afterReload === "" && lsAfter;
  return out;
}


async function runMdSim() {
  const { astMd } = await import("/web/js/h3s_assist.js");
  const samples = {
    bold: astMd("**x**"),
    xss: astMd("<img onerror=alert(1) src=x>"),
    partial: astMd("**open"),
    linkBad: astMd("[a](javascript:alert(1))"),
    linkOk: astMd("[a](https://ok.example/x)"),
  };
  // Also paint into a finished message
  if (!ed.astChat()) ed.astNewChat(false);
  ed.astSet((a) => {
    const c = a.chats.find((x) => x.id === a.active);
    c.msgs = [
      { role: "user", text: "show md" },
      { role: "assistant", text: "## Title\n\n- **bold** item\n- `code`\n\n```\nblock\n```\n\n<script>bad</script>\n\n[ok](https://example.com) and [bad](javascript:1)",
        reasoning: "Think **hard** about `<script>`" },
    ];
  });
  ed._ast.busy = false;
  ed.renderAssist();
  await new Promise((r) => requestAnimationFrame(r));
  const bubble = L.querySelector(".h3z-ast-msg:not(.user) .tx");
  const reason = L.querySelector(".h3z-ast-reasonbody");
  const copyBtn = [...L.querySelectorAll(".h3z-ast-msg:not(.user) .h3z-btn")].find((b) => /Копировать|Copy/i.test(b.textContent || ""));
  let copied = "";
  const orig = navigator.clipboard?.writeText;
  if (navigator.clipboard) navigator.clipboard.writeText = async (t) => { copied = t; };
  if (copyBtn) copyBtn.click();
  if (orig && navigator.clipboard) navigator.clipboard.writeText = orig;
  return {
    samples,
    hasStrong: !!bubble?.querySelector("strong"),
    hasCode: !!bubble?.querySelector("code"),
    hasPre: !!bubble?.querySelector("pre"),
    hasH: !!bubble?.querySelector(".h3z-ast-h"),
    noScript: !bubble?.querySelector("script") && !(bubble?.innerHTML || "").includes("<script"),
    hasSafeLink: !!bubble?.querySelector('a[href^="https://"]'),
    noJsLink: !bubble?.querySelector('a[href^="javascript:"]'),
    reasonHasStrong: !!reason?.querySelector("strong"),
    reasonEscaped: (reason?.innerHTML || "").includes("&lt;script&gt;"),
    copyIsRaw: copied.includes("**bold**") && copied.includes("<script>bad</script>"),
    sampleOk: /<strong>x<\/strong>/.test(samples.bold)
      && samples.xss.includes("&lt;img") && !samples.xss.includes("<img")
      && samples.partial.includes("**open")
      && !samples.linkBad.includes("href=")
      && samples.linkOk.includes("href=\"https://ok.example/x\""),
  };
}

window.__H3_LAYOUT__ = {
  ed,
  panel: L,
  async prepare() {
    if (view === "chat-stream") {
      this.stream = await runStreamSim();
    }
    if (view === "chat-keys") {
      this.keys = runKeySim();
    }
    if (view === "chat-draft") {
      this.draft = await runDraftSim();
    }
    if (view === "chat-md") {
      this.md = await runMdSim();
    }
  },
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
      if (!inYScroll(el) && r.bottom > panelBox.bottom + 1.5) {
        offenders.push({ label: String(el.className || el.tagName).slice(0, 48), why: "child-bottom", over: +(r.bottom - panelBox.bottom).toFixed(1) });
        break;
      }
    }
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

    // Bubble vs card background: bubble must be transparent (inherit card look)
    const userMsg = panel.querySelector(".h3z-ast-msg.user");
    const asstMsg = [...panel.querySelectorAll(".h3z-ast-msg")].find((el) => !el.classList.contains("user"));
    const userBubble = userMsg?.querySelector(".h3z-ast-bubble");
    const asstBubble = asstMsg?.querySelector(".h3z-ast-bubble");
    const userCardBg = userMsg ? getComputedStyle(userMsg).backgroundColor : null;
    const asstCardBg = asstMsg ? getComputedStyle(asstMsg).backgroundColor : null;
    const userBubbleBg = userBubble ? getComputedStyle(userBubble).backgroundColor : null;
    const asstBubbleBg = asstBubble ? getComputedStyle(asstBubble).backgroundColor : null;
    const bubbleBgOk = (!userBubble || bgLooksTransparent(userBubbleBg)) && (!asstBubble || bgLooksTransparent(asstBubbleBg));

    const stream = this.stream || window.__H3_STREAM_MID__ && { mid: window.__H3_STREAM_MID__, after: window.__H3_STREAM_AFTER__ };
    const keys = this.keys;
    const draft = this.draft;
    const md = this.md;
    const streamOk = view !== "chat-stream" || !!(stream?.mid?.open && stream?.mid?.live && stream?.mid?.body
      && stream?.after && stream.after.open === false && stream.after.live === false
      && stream.after.answer && stream.after.hasContentWrap
      && stream.after.hasStrong && stream.after.hasCode && stream.after.noScript && stream.after.escapedScript);
    const keysOk = view !== "chat-keys" || !!(keys && keys.enter && keys.ctrlEnter && keys.shiftEnter && keys.composing && keys.busyBlocked);
    const draftOk = view !== "chat-draft" || !!(draft && draft.restored && draft.ls && draft.uploadsKept && draft.stylesKept && draft.midGone && draft.sendCleared);
    const mdOk = view !== "chat-md" || !!(md && md.sampleOk && md.hasStrong && md.hasCode && md.hasPre && md.hasH && md.noScript && md.hasSafeLink && md.noJsLink && md.reasonHasStrong && md.reasonEscaped && md.copyIsRaw);

    const out = {
      view, theme, panelW: +panelBox.width.toFixed(1), panelH: +panelBox.height.toFixed(1),
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
      bubbleBgOk,
      userBubbleBg, asstBubbleBg, userCardBg, asstCardBg,
      hasReasoning: !!panel.querySelector(".h3z-ast-reason"),
      stream, keys, draft, md, streamOk, keysOk, draftOk, mdOk,
      offenders: offenders.slice(0, 15),
      ok: false,
    };
    const settings = ["connection","presets","styles","generation","context"].includes(view);
    const emptyChat = view === "chat";
    const msgsView = view === "chat-msgs" || view === "chat-stream" || view === "chat-keys" || view === "chat-draft" || view === "chat-md";
    // Title row: model pill + gear same height, centers within 1px of each other and title.
    const ph = panel.querySelector(".h3z-ast-panel > .h3z-ph, .h3z-ph");
    const titleEl = ph?.querySelector("h3");
    const statusEl = ph?.querySelector(".h3z-ast-status");
    const gearEl = ph?.querySelector(".h3z-ast-gear, .h3z-btn.sm.icon");
    const tBox = titleEl?.getBoundingClientRect();
    const sBox = statusEl?.getBoundingClientRect();
    const gBox = gearEl?.getBoundingClientRect();
    const mid = (b) => (b.top + b.bottom) / 2;
    out.titleAlign = null;
    out.titleAlignOk = true;
    if (!settings && titleEl && statusEl && gearEl && tBox && sBox && gBox) {
      const heightDiff = Math.abs(sBox.height - gBox.height);
      const centerSG = Math.abs(mid(sBox) - mid(gBox));
      const centerTS = Math.abs(mid(tBox) - mid(sBox));
      const centerTG = Math.abs(mid(tBox) - mid(gBox));
      const tip = statusEl.getAttribute("title") || "";
      const label = (statusEl.textContent || "").trim();
      out.titleAlign = {
        statusH: +sBox.height.toFixed(2), gearH: +gBox.height.toFixed(2), titleH: +tBox.height.toFixed(2),
        statusW: +sBox.width.toFixed(2), gearW: +gBox.width.toFixed(2),
        heightDiff: +heightDiff.toFixed(2),
        centerSG: +centerSG.toFixed(2), centerTS: +centerTS.toFixed(2), centerTG: +centerTG.toFixed(2),
        tip, label,
        tipOk: !!(tip && tip.length >= 3 && (!label || tip.includes(label.slice(0, Math.min(6, label.length))) || label.includes(tip.slice(0, Math.min(6, tip.length))))),
        modelOk: /swift|iq2|api_model|подключ|connect/i.test(label + " " + tip),
      };
      const sFac = Math.max(0.5, (scale || 100) / 100);
      const loc = (v) => v / sFac;
      out.titleAlignOk = heightDiff <= 1.01 && centerSG <= 1.01 && centerTS <= 1.01 && centerTG <= 1.01
        && Math.abs(loc(sBox.height) - 28) <= 2.5 && Math.abs(loc(gBox.height) - 28) <= 2.5
        && Math.abs(loc(gBox.width) - 28) <= 2.5
        && loc(sBox.width) >= 56 && out.titleAlign.tipOk && out.titleAlign.modelOk;
    }
    out.scale = scale;

    out.ok = out.offenders.length === 0 && out.composeInside && out.taFullWidth && !out.hasInputbox && !out.hasCtx && !out.hasSelect && !out.hasSuggest
      && (settings || out.hasNeighPill) && (!emptyChat || out.hasEmptyBlurb) && (!msgsView || !out.hasEmptyBlurb)
      && (settings || (out.hasModeLabel && out.hasDialogLabel && out.mainBgTransparent))
      && (view !== "chat-msgs" || (out.bubbleBgOk && out.hasReasoning && !!panel.querySelector(".h3z-ast-bubble strong") && !panel.querySelector(".h3z-ast-bubble script")))
      && streamOk && keysOk && draftOk && mdOk && out.titleAlignOk;
    return out;
  },
};

await window.__H3_LAYOUT__.prepare();
const m = window.__H3_LAYOUT__.measure();
window.__H3_LAYOUT__.last = m;
document.title = `assist ${view} ${panelW}x${panelH} ${m.ok ? "OK" : "FAIL"}`;

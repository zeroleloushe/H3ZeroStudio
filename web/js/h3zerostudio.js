// H3ZeroStudio: ComfyUI integration — compact node view + full-screen editor + progress events.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import * as C from "./h3s_core.js";
import { injectStyle } from "./h3s_style.js";
import { H3Editor, PALETTE, ICON, h } from "./h3s_editor.js";
import { SpritePlayer } from "./h3s_polish.js";

const NODES = new Set(["ZL_H3ZeroStudio", "ZL_H3Studio"]); // + legacy id of the first MVP
const COMPACT_H = 236;

function viewUrl(ref) {
  if (!ref?.filename) return "";
  const q = new URLSearchParams({ filename: ref.filename, type: ref.type || "output", subfolder: ref.subfolder || "" });
  return api.apiURL("/view?" + q.toString());
}

function projectWidget(node) { return node.widgets?.find((w) => w.name === "project"); }

function hideWidget(node, w) {
  if (!w || w.__h3zHidden) return;
  w.__h3zHidden = true;
  w.hidden = true;
  w.options = w.options || {};
  w.options.hidden = true;
  w.computeSize = () => [0, -4];
  w.draw = () => {};
  try { w.type = "hidden"; } catch (e) {}
  if (w.element) w.element.style.display = "none";
  // the widget may also expose an input socket in newer frontends — hide it from the slot list visually
  const inp = node.inputs?.find((i) => i.widget?.name === "project");
  if (inp) { inp.label = " "; }
}

function makeHost(node) {
  return {
    load: () => projectWidget(node)?.value || "",
    save: (json) => {
      const w = projectWidget(node);
      if (!w || w.value === json) return;
      w.value = json;
      try { w.callback?.(json); } catch (e) {}
      try { app.graph?.setDirtyCanvas?.(true, true); app.graph?.change?.(); } catch (e) {}
    },
    queue: async () => { await app.queuePrompt(0, 1); },
    interrupt: async () => { await api.fetchApi("/interrupt", { method: "POST" }); },
    upload: async (file) => {
      const body = new FormData();
      body.append("image", file, file.name || "pasted.png");
      body.append("subfolder", "h3zerostudio");
      body.append("type", "input");
      const r = await api.fetchApi("/upload/image", { method: "POST", body });
      if (r.status !== 200) throw new Error(r.status + " " + r.statusText);
      return await r.json();
    },
    url: viewUrl,
    peaks: async (ref) => {
      const q = new URLSearchParams({ filename: ref.filename, subfolder: ref.subfolder || "", type: ref.type || "input", bins: "4000" });
      const r = await api.fetchApi("/h3zero/peaks?" + q.toString());
      if (r.status !== 200) throw new Error(r.status + "");
      return r.json();
    },
    options: async () => (await api.fetchApi("/h3zero/options")).json(),
    status: async (id) => { const r = await api.fetchApi("/h3zero/status?node=" + encodeURIComponent(String(id ?? node.id))); if (r.status !== 200) throw new Error(r.status + ""); return (await r.json()).status; },
    nodeId: () => String(node.id),
    inputLinked: (name) => { const i = node.inputs?.find((x) => x.name === name); return i ? i.link != null : undefined; },
    videoInfo: async (ref, strip = true) => { const q = new URLSearchParams({ filename: ref.filename, subfolder: ref.subfolder || "", type: ref.type || "input", strip: strip ? "1" : "0" }); const r = await api.fetchApi("/h3zero/video_info?" + q.toString()); const j = await r.json(); if (!j.ok) throw new Error(j.error || r.status); return j.info; },
    pickFolder: async (initial) => { const r = await api.fetchApi("/h3zero/pick_folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initial: initial || "" }) }); const j = await r.json().catch(() => ({ ok: false, error: r.status + "" })); if (!j.ok) throw new Error(j.error || r.status); return j.path; },
    freeMemory: async () => { const r = await api.fetchApi("/free", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unload_models: true, free_memory: true }) }); if (r.status !== 200) throw new Error(r.status + " " + r.statusText); },
    exportVideo: async (body) => { const r = await api.fetchApi("/h3zero/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json(); if (!j.ok) throw new Error(j.error || r.status); return j; },
    assetEdit: async (body) => { const r = await api.fetchApi("/h3zero/asset_edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json(); if (!j.ok) throw new Error(j.error || r.status); return j; },
    freeze: async (id, key) => { const r = await api.fetchApi("/h3zero/freeze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, key }) }); const j = await r.json(); if (!j.ok) throw new Error(j.error || r.status); return j.freeze; },
    get: async (path, params = {}) => {
      const r = await api.fetchApi(path + "?" + new URLSearchParams(params).toString());
      const j = await r.json().catch(() => ({ ok: false, error: r.status + " " + r.statusText }));
      if (!j.ok) throw new Error(j.error || r.status);
      return j.data;
    },
    call: async (path, body) => {
      const r = await api.fetchApi(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
      const j = await r.json().catch(() => ({ ok: false, error: r.status + " " + r.statusText }));
      if (!j.ok) throw new Error(j.error || r.status);
      return j.data;
    },
    importZip: async (file, newId) => {
      const body = new FormData();
      body.append("new_id", newId || "");
      body.append("file", file, file.name || "project.zip");
      const r = await api.fetchApi("/h3zero/project/import_zip", { method: "POST", body });
      const j = await r.json().catch(() => ({ ok: false, error: r.status + " " + r.statusText }));
      if (!j.ok) throw new Error(j.error || r.status);
      return j.data;
    },
    clearCache: async (id) => {
      const r = await api.fetchApi("/h3zero/clear_cache", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (r.status !== 200) throw new Error(r.status + "");
      return r.json();
    },
    onClose: () => renderCompact(node),
    onChange: () => renderCompact(node),
  };
}

function defaultProject() {
  return { id: C.newId("p"), name: "H3 проект", settings: { settings_scope: "global" }, segments: [{ id: C.newId("s"), frames: 124, color: 0, link: "extend" }] };
}

function ensureProject(node) {
  const w = projectWidget(node);
  if (!w) return;
  const p = C.normalizeProject(w.value);
  if (!w.value || p.id === "project") {
    const fresh = C.normalizeProject(w.value ? { ...p, id: C.newId("p") } : defaultProject());
    w.value = JSON.stringify(fresh);
  }
}

const LEGACY_ID = "ZL_H3Studio", OLD_TITLE = /\s*\(старое имя H3 Studio\)\s*$/;
const linkOf = (g, id) => (g.links?.get ? g.links.get(id) : g.links?.[id]);

/** Replace a legacy ZL_H3Studio node with ZL_H3ZeroStudio in place. */
export function upgradeLegacy(old) {
  const g = old.graph; if (!g) return null;
  try { old.h3s?.close(); } catch (e) {}
  const n = LiteGraph.createNode("ZL_H3ZeroStudio"); if (!n) return null;
  n.pos = [...old.pos]; n.size = [...old.size];
  const title = String(old.title || "").replace(OLD_TITLE, "");
  if (title && title !== "H3ZeroStudio · Таймлайн") n.title = title;
  for (const w of old.widgets || []) { const nw = n.widgets?.find((x) => x.name === w.name); if (nw && w.value !== undefined) nw.value = w.value; }
  g.add(n);
  const ins = (old.inputs || []).map((inp) => { const l = inp.link != null ? linkOf(g, inp.link) : null; return l && { name: inp.name, from: l.origin_id, slot: l.origin_slot }; }).filter(Boolean);
  const outs = []; for (const o of old.outputs || []) for (const id of o.links || []) { const l = linkOf(g, id); if (l) outs.push({ name: o.name, to: l.target_id, slot: l.target_slot }); }
  g.remove(old);
  for (const c of ins) { const src = g.getNodeById(c.from), k = n.findInputSlot(c.name); if (src && k >= 0) src.connect(c.slot, n, k); }
  for (const c of outs) { const dst = g.getNodeById(c.to), k = n.findOutputSlot(c.name); if (dst && k >= 0) n.connect(k, dst, c.slot); }
  try { n.h3s?.reload(); renderCompact(n); } catch (e) {}
  g.setDirtyCanvas?.(true, true); app.canvas?.setDirty?.(true, true);
  return n;
}

function buildCompact(node) {
  injectStyle();
  const el = h("div", { class: "h3z-compact" });
  const st = (node.__h3z = { el });
  st.pv = h("div", { class: "pv" });
  st.mini = h("div", { class: "mini" });
  st.inf = h("div", { class: "inf" });
  st.prog = h("div", { class: "prog" }, h("i"));
  st.btn = h("button", { class: "open", html: ICON.expand + "<span>Развернуть</span>", title: "Открыть редактор на весь экран" });
  st.btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); openEditor(node); });
  for (const ev of ["pointerdown", "mousedown"]) st.btn.addEventListener(ev, (e) => e.stopPropagation());
  el.append(st.pv, st.mini, st.inf, st.prog, st.btn);
  if (node.type === LEGACY_ID) {   // node of the first MVP: one click swaps it for the current node (links, project, position kept)
    const up = h("button", { class: "open legacy", html: "<span>⇪ Обновить ноду</span>", title: "Это нода прежней версии (H3 Studio, значок [DEPR]). Заменить её текущей нодой H3ZeroStudio: связи, проект и положение сохранятся" });
    up.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); upgradeLegacy(node); });
    for (const ev of ["pointerdown", "mousedown"]) up.addEventListener(ev, (e) => e.stopPropagation());
    el.append(up);
  }
  el.addEventListener("dblclick", (e) => { e.stopPropagation(); openEditor(node); });
  return el;
}

function renderCompact(node) {
  const st = node.__h3z; if (!st) return;
  const ed = node.h3s;
  const p = ed && (ed.isOpen || ed.run.active) ? ed.p : C.normalizeProject(projectWidget(node)?.value || "");
  const est = C.estimate(p), its = C.plan(p), sigs = C.segmentSigs(p);
  const poster = p.result?.full ? p.segments[0]?.result?.poster : null;
  const live = ed?.run?.active && ed.lastLive ? ed.lastLive : null;
  if (live) { // animated latent preview of the segment being sampled, also when the editor is collapsed
    if (!st.liveCv) { st.liveCv = h("canvas", { class: "live" }); st.livePlayer = new SpritePlayer(st.liveCv); }
    if (st.liveCv.parentElement !== st.pv) { st.pv.innerHTML = ""; st.pv.append(st.liveCv, h("div", { class: "ttl live" }, h("i", null, "●"), h("span", null, `Отрезок ${live.seg + 1} · шаг ${live.step}/${live.steps}`))); }
    else st.pv.querySelector(".ttl span").textContent = `Отрезок ${live.seg + 1} · шаг ${live.step}/${live.steps}`;
    if (st.liveSent !== live) { st.liveSent = live; st.livePlayer.set(live); }
  } else {
  if (st.livePlayer) { st.livePlayer.stop(); st.liveCv = null; st.livePlayer = null; st.liveSent = null; }
  st.pv.innerHTML = "";
  if (poster) st.pv.append(h("img", { src: viewUrl(poster), draggable: "false" }));
  st.pv.append(h("div", { class: "ttl", style: poster ? { textShadow: "0 2px 10px #000" } : null }, h("i", null, "▶"), h("span", null, p.name || "H3ZeroStudio")));
  }
  st.mini.innerHTML = "";
  const total = Math.max(1, est.frames);
  its.forEach((it, i) => {
    const s = p.segments[i], pal = PALETTE[s.color % PALETTE.length];
    const done = s.result && (!s.result.sig || s.result.sig === sigs[i]);
    st.mini.append(h("span", { class: done ? "done" : "", style: { flex: String((it.frames - (i ? it.overlap : 0)) / total), "--c1": pal[0], "--c2": pal[1] }, title: `${i + 1}: ${(it.frames / 24).toFixed(1)} с` }));
  });
  const r = ed?.run || {};
  st.inf.innerHTML = "";
  st.inf.append(h("span", null, h("b", null, est.segments), " отр. · ", h("b", null, C.fmtTime(est.seconds))),
    h("span", null, r.active ? (r.seg >= 0 ? `отрезок ${r.seg + 1}/${r.segs} · шаг ${r.step}/${r.steps || "…"}` : "в очереди…") : `${est.width}×${est.height}` + (est.warnings.length ? ` · ⚠${est.warnings.length}` : "")));
  st.prog.classList.toggle("on", !!r.active);
  st.prog.firstChild.style.width = r.total ? (r.done / r.total * 100).toFixed(1) + "%" : "0%";
}

function openEditor(node) {
  if (!node.h3s) node.h3s = new H3Editor(makeHost(node));
  node.h3s.open();
}

function setup(node) {
  try {
    hideWidget(node, projectWidget(node));
    ensureProject(node);
    node.h3s = new H3Editor(makeHost(node));
    const el = buildCompact(node), CH = COMPACT_H + (node.type === LEGACY_ID ? 38 : 0);
    const opts = { serialize: false, hideOnZoom: false, getMinHeight: () => CH, getMaxHeight: () => CH + 260, getValue: () => undefined, setValue: () => {} };
    const w = node.addDOMWidget("h3s_compact", "h3s_compact", el, opts);
    if (w) { w.serialize = false; w.computeSize = (width) => [width, CH]; }
    node.color = "#2a1f4d"; node.bgcolor = "#0d1020";
    const sz = node.computeSize?.();
    node.setSize?.([Math.max(340, sz?.[0] || 0), Math.max(sz?.[1] || 0, CH + 110)]);
    renderCompact(node);
  } catch (e) { console.warn("[H3ZeroStudio] setup failed", e); }
}

function allStudioNodes() {
  const out = [];
  const walk = (g) => { for (const n of g?._nodes || g?.nodes || []) { if (NODES.has(n.type) || NODES.has(n.comfyClass)) out.push(n); if (n.subgraph) walk(n.subgraph); } };
  walk(app.graph);
  return out;
}

function findNode(id) {
  const n = app.graph?.getNodeById?.(Number(id)) ?? app.graph?.getNodeById?.(id);
  if (n?.h3s) return n;
  return allStudioNodes().find((x) => String(x.id) === String(id) || String(id).endsWith(":" + x.id)) || null;
}

app.registerExtension({
  name: "zl.h3zerostudio",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!NODES.has(nodeData?.name)) return;
    const onCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () { const r = onCreated?.apply(this, arguments); setup(this); return r; };
    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = onConfigure?.apply(this, arguments);
      try { hideWidget(this, projectWidget(this)); ensureProject(this); this.h3s?.reload(); renderCompact(this); } catch (e) {}
      return r;
    };
    const onExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (msg) {
      const r = onExecuted?.apply(this, arguments);
      try { const s = msg?.h3s?.[0]; if (s && this.h3s) { this.h3s.applyExecuted(JSON.parse(s)); renderCompact(this); } } catch (e) { console.warn("[H3ZeroStudio] result parse", e); }
      return r;
    };
    const onRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () { try { this.h3s?.close(); } catch (e) {} return onRemoved?.apply(this, arguments); };
  },
  async setup() {
    injectStyle();
    api.addEventListener("h3zero.progress", ({ detail: d }) => {
      try { const n = findNode(d.node); if (n?.h3s) { n.h3s.onProgress(d); renderCompact(n); } } catch (e) { console.warn("[H3ZeroStudio] progress", e); }
    });
    // run ended: catch up on anything missed (final segments, result), then close the run
    const end = (reason) => () => { for (const n of allStudioNodes()) { const e = n.h3s; if (!e) continue;
      Promise.resolve(e.catchUp?.()).catch(() => {}).finally(() => { try { e.onRunEnded(reason); renderCompact(n); } catch (err) {} }); } };
    // background tabs: no rAF and throttled timers -> catch up as soon as the tab is visible / focused again
    const wake = () => { for (const n of allStudioNodes()) { const e = n.h3s; if (!e) continue;
      Promise.resolve(e.run?.active ? e.catchUp?.() : null).catch(() => {}).finally(() => { try { e.refreshVisible?.(); renderCompact(n); } catch (err) {} }); } };
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") wake(); });
    window.addEventListener("focus", wake);
    api.addEventListener("executed", () => { for (const n of allStudioNodes()) if (n.h3s?.run?.active) n.h3s.catchUp?.().catch(() => {}); });
    api.addEventListener("execution_error", end("Ошибка выполнения — подробности в консоли ComfyUI"));
    api.addEventListener("execution_interrupted", end("Генерация прервана"));
    api.addEventListener("execution_success", end(null));

  },
});

// «Модели» rail tab: quick access to model presets, model files and the LoRA stack (rows with on/off, strength ▲▼,
// ⓘ details, drag to reorder) with a searchable folder picker for models/loras. Own code; the layout follows the
// idea of Pixaroma's LoRA Loader (ideas only).
const base = (f) => String(f || "").split(/[\\/]/).pop();
const stem = (f) => base(f).replace(/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i, "");
const parts = (f) => String(f || "").split(/[\\/]/);

export const MT_CSS = `
.h3z-body.h3z-mtwide{grid-template-columns:60px var(--h3z-gap,8px) min(max(var(--lw,272px),860px),44vw) var(--h3z-gap,8px) minmax(0,1fr) var(--h3z-gap,8px) min(var(--rw,372px),30vw)}
.h3z-mt-bar{padding:2px 0 10px;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:12px}
.h3z-mt-barrow{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.h3z-mt-cols{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:16px;align-items:start}
.h3z-mt-col{min-width:0}
.h3z-mt-scope{display:flex;gap:6px;margin:4px 0 10px}
.h3z-mt-scope .h3z-pill{flex:1;text-align:center}
.h3z-mt-note{font-size:11.5px;opacity:.75;margin:4px 0 8px;line-height:1.45}
.h3z-lr-add{width:100%;justify-content:center;font-weight:600;padding:8px 10px;background:var(--acc,#8b7bff);color:#fff;border:none}
.h3z-lr-add:disabled{opacity:.45}
.h3z-lr-bar{display:flex;align-items:center;gap:10px;margin:8px 0 6px;font-size:12px;opacity:.9}
.h3z-sw{position:relative;width:34px;height:18px;border-radius:9px;background:rgba(255,255,255,.14);cursor:pointer;flex:none;transition:background .15s}
.h3z-sw::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#cfd2dc;transition:left .15s}
.h3z-sw.on{background:var(--acc,#8b7bff)} .h3z-sw.on::after{left:18px;background:#fff}
.h3z-sw.mixed{background:rgba(139,123,255,.45)}
.h3z-lr{display:grid;grid-template-columns:14px minmax(0,1fr) auto 26px 34px 22px;gap:6px;align-items:center;padding:6px 8px;margin:4px 0;border-radius:10px;
  background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.06)}
.h3z-lr.off>:not(.h3z-sw):not(.x){opacity:.42}
.h3z-lr.drop{border-color:var(--acc,#8b7bff)}
.h3z-lr .grip{cursor:grab;opacity:.45;font-size:12px;user-select:none;text-align:center}
.h3z-lr .nm{display:flex;align-items:center;gap:6px;min-width:0;padding:5px 8px;border-radius:7px;background:rgba(0,0,0,.25);cursor:pointer;font-family:ui-monospace,Consolas,monospace;font-size:12px}
.h3z-lr .nm span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.h3z-lr .nm i{opacity:.5;font-style:normal;font-size:10px}
.h3z-lr .nm.miss{outline:1px solid var(--err,#ff5c7a)}
.h3z-lr .st{display:flex;align-items:stretch;border-radius:7px;background:rgba(0,0,0,.25);overflow:hidden}
.h3z-lr .st input{width:48px;border:none;background:transparent;color:inherit;text-align:center;font-size:12px;padding:4px 0;-moz-appearance:textfield}
.h3z-lr .st input::-webkit-inner-spin-button{display:none}
.h3z-lr .st .ud{display:flex;flex-direction:column}
.h3z-lr .st .ud button{border:none;background:transparent;color:inherit;font-size:8px;line-height:1;padding:2px 5px;cursor:pointer;opacity:.7}
.h3z-lr .st .ud button:hover{opacity:1;background:rgba(255,255,255,.08)}
.h3z-lr .inf{border:none;border-radius:6px;background:rgba(255,255,255,.07);color:inherit;font-style:italic;font-family:serif;cursor:pointer;height:24px}
.h3z-lr .inf.on{background:var(--acc,#8b7bff)}
.h3z-lr .x{border:none;background:transparent;color:inherit;opacity:.5;cursor:pointer}
.h3z-lr .x:hover{opacity:1;color:var(--err,#ff5c7a)}
.h3z-lr-info{grid-column:1/-1;font-size:11.5px;opacity:.85;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:4px 2px 0}
.h3z-lr-info code{opacity:.8;word-break:break-all}
.h3z-lr-info input{width:64px}
.h3z-lp{position:fixed;z-index:100000;display:flex;flex-direction:column;max-height:70vh;border-radius:10px;background:#1d1e24;border:1px solid var(--acc,#8b7bff);
  box-shadow:0 12px 40px rgba(0,0,0,.55);font-size:12.5px;overflow:hidden}
.h3z-lp input.q{margin:8px;padding:7px 10px;border-radius:7px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.3);color:inherit;outline:none}
.h3z-lp .crumbs{display:flex;flex-wrap:wrap;gap:4px;padding:2px 12px 6px;font-size:11.5px}
.h3z-lp .crumbs a{cursor:pointer;opacity:.75} .h3z-lp .crumbs a:hover{opacity:1;text-decoration:underline} .h3z-lp .crumbs b{opacity:.45}
.h3z-lp .ls{overflow:auto;padding:0 4px 6px}
.h3z-lp .row{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;cursor:pointer;white-space:nowrap}
.h3z-lp .row:hover,.h3z-lp .row.hi{background:rgba(255,255,255,.08)}
.h3z-lp .row.cur{color:var(--acc2,#b7acff);font-weight:600}
.h3z-lp .row .n{flex:1;overflow:hidden;text-overflow:ellipsis}
.h3z-lp .row small{opacity:.5}
.h3z-lp .row.fold .n::before{content:"📁 ";}
.h3z-lp .empty{padding:10px 12px;opacity:.6}
`;

export function installModelTab(Editor, { C, h }) {
  Object.assign(Editor.prototype, {
    /** The rail tab «Модели»: preset bar, LoRA stack (left column), model files (right column). */
    renderModels(L) {
      this.mpStyle();
      if (!document.getElementById("h3z-mt-style")) document.head.append(h("style", { id: "h3z-mt-style" }, MT_CSS));
      this._mtSel = this.sel;
      L.append(h("div", { class: "h3z-card h3z-glass h3z-mt" }, h("div", { class: "h3z-card-h" }, h("h4", null, "Модели и LoRA"),
        h("em", { class: "h3z-note" }, "библиотека пресетов — общая для всех проектов")), this.mpManager()));
    },
    /** LoRA stack of preset pr; ed(fn, msg) edits the library preset. */
    mpLoraStack(pr, ed, miss) {
      const files = this._mp?.files?.lora || [];
      const n = pr.loras.length, on = pr.loras.filter((l) => l.on).length;
      this._lrInfo = this._lrInfo || new Set();
      const box = h("div", { class: "h3z-lr-stack" });
      const add = h("button", { class: "h3z-btn h3z-lr-add", disabled: n >= C.MAX_PRESET_LORAS || !files.length || undefined,
        title: files.length ? `Добавить LoRA из models/loras (до ${C.MAX_PRESET_LORAS})` : "В models/loras нет файлов — «⟳ Обновить списки»" }, "＋ Добавить LoRA");
      add.onclick = () => this.mpLoraPicker(add, "", (f) => ed((p) => { p.loras.push({ file: f, on: true, sm: 1, sc: 1 }); }));
      const master = h("div", { class: "h3z-sw" + (on && on === n ? " on" : on ? " mixed" : ""), title: on ? "Выключить все LoRA" : "Включить все LoRA" });
      master.onclick = () => n && ed((p) => { const v = !p.loras.some((l) => l.on); p.loras.forEach((l) => { l.on = v; }); });
      box.append(add, h("div", { class: "h3z-lr-bar" }, master, h("span", null, `${on} / ${n} вкл.`),
        h("em", { class: "h3z-note", style: "margin-left:auto" }, n > 1 ? "порядок — перетаскиванием ⋮⋮" : "")));
      pr.loras.forEach((l, k) => {
        const row = h("div", { class: "h3z-lr" + (l.on ? "" : " off") });
        const grip = h("div", { class: "grip", draggable: "true", title: "Перетащите, чтобы поменять порядок" }, "⋮⋮");
        grip.addEventListener("dragstart", (e) => { this._lrDrag = k; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(k)); });
        row.addEventListener("dragover", (e) => { if (this._lrDrag == null) return; e.preventDefault(); row.classList.add("drop"); });
        row.addEventListener("dragleave", () => row.classList.remove("drop"));
        row.addEventListener("drop", (e) => { e.preventDefault(); row.classList.remove("drop"); const from = this._lrDrag; this._lrDrag = null;
          if (from == null || from === k) return; ed((p) => { const [x] = p.loras.splice(from, 1); p.loras.splice(k, 0, x); }); });
        grip.addEventListener("dragend", () => { this._lrDrag = null; });
        const nm = h("div", { class: "nm" + (miss?.has(l.file) ? " miss" : ""), title: l.file + (miss?.has(l.file) ? "\n⚠ нет файла" : "") }, h("span", null, stem(l.file) || "— выберите —"), h("i", null, "▾"));
        nm.onclick = () => this.mpLoraPicker(nm, l.file, (f) => ed((p) => { p.loras[k].file = f; }));
        const linked = l.sm === l.sc;
        const setS = (v) => ed((p) => { v = Math.round(Math.max(-10, Math.min(10, v)) * 100) / 100; const x = p.loras[k]; if (x.sm === x.sc) x.sc = v; x.sm = v; });
        const num = h("input", { type: "number", step: 0.05, min: -10, max: 10, value: Number(l.sm).toFixed(2),
          title: linked ? "Сила LoRA (модель и энкодер вместе); ⓘ — отдельно для энкодера" : `Сила для модели; энкодер ${l.sc} (ⓘ)` });
        num.onchange = () => setS(Number(num.value) || 0);
        num.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") num.blur(); });
        num.addEventListener("wheel", (e) => { if (document.activeElement !== num) return; e.preventDefault(); setS(Number(l.sm) + (e.deltaY < 0 ? 0.05 : -0.05)); }, { passive: false });
        const st = h("div", { class: "st" }, num, h("div", { class: "ud" },
          h("button", { title: "+0.05", onclick: () => setS(Number(l.sm) + 0.05) }, "▲"), h("button", { title: "−0.05", onclick: () => setS(Number(l.sm) - 0.05) }, "▼")));
        const key = pr.id + "|" + k;
        const inf = h("button", { class: "inf" + (this._lrInfo.has(key) ? " on" : ""), title: "Подробнее: путь, сила для энкодера" }, "i");
        inf.onclick = () => { this._lrInfo.has(key) ? this._lrInfo.delete(key) : this._lrInfo.add(key); this.mpRefreshManager(); };
        const sw = h("div", { class: "h3z-sw" + (l.on ? " on" : ""), title: l.on ? "Выключить (останется в списке, в ключ кэша не входит)" : "Включить" });
        sw.onclick = () => ed((p) => { p.loras[k].on = !p.loras[k].on; });
        const x = h("button", { class: "x", title: "Убрать LoRA из стека" }, "✕");
        x.onclick = () => ed((p) => { p.loras.splice(k, 1); });
        row.append(grip, nm, st, inf, sw, x);
        if (this._lrInfo.has(key)) {
          const sc = h("input", { class: "h3z-in", type: "number", step: 0.05, min: -10, max: 10, value: l.sc });
          sc.onchange = () => ed((p) => { p.loras[k].sc = Math.round((Number(sc.value) || 0) * 100) / 100; });
          sc.addEventListener("keydown", (e) => e.stopPropagation());
          const dir = parts(l.file).slice(0, -1).join("/");
          row.append(h("div", { class: "h3z-lr-info" }, h("code", null, "models/loras/" + l.file), dir ? h("span", null, "папка: " + dir) : null,
            h("label", null, "сила энкодера ", sc), h("span", { class: "h3z-note" }, linked ? "связана с силой модели" : "отдельно от модели"),
            linked ? null : h("button", { class: "h3z-btn sm", onclick: () => ed((p) => { p.loras[k].sc = p.loras[k].sm; }) }, "связать")));
        }
        box.append(row);
      });
      return box;
    },

    /** Searchable folder picker over models/loras. onPick(file). */
    mpLoraPicker(anchor, cur, onPick) {
      document.querySelector(".h3z-lp")?._close?.();
      const files = (this._mp?.files?.lora || []).slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      const curDir = parts(cur).slice(0, -1);
      let path = cur ? curDir : [], q = "", hi = 0, rows = [];
      const pop = h("div", { class: "h3z-lp" });
      const r = anchor.getBoundingClientRect(), W = Math.max(r.width, 440);
      pop.style.left = Math.max(8, Math.min(window.innerWidth - W - 8, r.left)) + "px";
      pop.style.width = W + "px";
      const below = window.innerHeight - r.bottom;
      if (below > 320) pop.style.top = r.bottom + 4 + "px"; else pop.style.bottom = window.innerHeight - r.top + 4 + "px";
      const inp = h("input", { class: "q", placeholder: "⌕ Поиск LoRA…", spellcheck: "false" });
      const crumbs = h("div", { class: "crumbs" }), ls = h("div", { class: "ls" });
      pop.append(inp, crumbs, ls);
      const pick = (f) => { close(); onPick(f); };
      const paint = () => {
        crumbs.replaceChildren(); ls.replaceChildren(); rows = [];
        const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
        if (terms.length) {
          crumbs.append(h("span", null, "Поиск во всех папках"));
          const hits = files.filter((f) => terms.every((t) => f.toLowerCase().includes(t)));
          for (const f of hits.slice(0, 400)) {
            const dir = parts(f).slice(0, -1).join(" / ");
            rows.push([h("div", { class: "row" + (f === cur ? " cur" : "") }, h("span", { class: "n" }, base(f)), dir ? h("small", null, dir) : null), () => pick(f)]);
          }
          if (!hits.length) ls.append(h("div", { class: "empty" }, "Ничего не найдено"));
        } else {
          const all = h("a", null, "Все"); all.onclick = () => { path = []; hi = 0; paint(); };
          crumbs.append(all);
          path.forEach((p, j) => { const a = h("a", null, p); a.onclick = () => { path = path.slice(0, j + 1); hi = 0; paint(); }; crumbs.append(h("b", null, "›"), a); });
          const pre = path.length ? path.join("/") + "/" : "";
          const inDir = files.filter((f) => f.replace(/\\/g, "/").startsWith(pre));
          const sub = new Map(), here = [];
          for (const f of inDir) {
            const rest = parts(f).slice(path.length);
            if (rest.length > 1) sub.set(rest[0], (sub.get(rest[0]) || 0) + 1); else here.push(f);
          }
          if (path.length) rows.push([h("div", { class: "row" }, h("span", { class: "n" }, "‹ Назад")), () => { path = path.slice(0, -1); hi = 0; paint(); }]);
          for (const [d, c] of [...sub].sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" })))
            rows.push([h("div", { class: "row fold" }, h("span", { class: "n" }, d), h("small", null, `${c} ›`)), () => { path = [...path, d]; hi = 0; paint(); }]);
          for (const f of here) rows.push([h("div", { class: "row" + (f === cur ? " cur" : "") }, h("span", { class: "n" }, base(f))), () => pick(f)]);
          if (!rows.length) ls.append(h("div", { class: "empty" }, "Пусто"));
        }
        hi = Math.min(hi, Math.max(0, rows.length - 1));
        rows.forEach(([el, fn], j) => { el.onclick = fn; if (j === hi) el.classList.add("hi"); ls.append(el); });
      };
      const close = () => { pop.remove(); document.removeEventListener("pointerdown", outside, true); setTimeout(() => this.focusSink?.(), 0); };
      const outside = (e) => { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) close(); };
      pop._close = close;
      inp.oninput = () => { q = inp.value; hi = 0; paint(); };
      // the editor's window-level key handler stops every key in capture; it hands the picker's keys over as "h3zkey"
      const onKey = (e) => {
        if (e.key === "Escape") close();
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); hi = Math.max(0, Math.min(rows.length - 1, hi + (e.key === "ArrowDown" ? 1 : -1))); paint(); ls.querySelector(".hi")?.scrollIntoView({ block: "nearest" }); }
        else if (e.key === "Enter") { e.preventDefault(); rows[hi]?.[1](); }
        else if (e.key === "Backspace" && !inp.value && path.length) { path = path.slice(0, -1); paint(); }
      };
      inp.addEventListener("h3zkey", (ev) => onKey(ev.detail));
      document.body.append(pop);
      document.addEventListener("pointerdown", outside, true);
      paint();
      inp.focus();
      setTimeout(() => pop.isConnected && inp.focus(), 40);   // the editor re-focuses its key sink after a click
      ls.querySelector(".cur")?.scrollIntoView({ block: "nearest" });
      return pop;
    },
  });
}

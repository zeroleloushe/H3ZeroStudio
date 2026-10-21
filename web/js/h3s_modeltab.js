// «Модели» rail tab: quick access to model presets, model files and the LoRA stack (rows with on/off, strength ▲▼,
// ⓘ details, drag to reorder) with a searchable folder picker for models/loras. Own code; the layout follows the
// idea of Pixaroma's LoRA Loader (ideas only).
const base = (f) => String(f || "").split(/[\\/]/).pop();
const stem = (f) => base(f).replace(/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i, "");
const parts = (f) => String(f || "").split(/[\\/]/);
const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const IC = {
  folder: svg('<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>'),
  file: svg('<path d="M12 3l7 4v10l-7 4-7-4V7z"/><path d="M12 12l7-4M12 12v9M12 12L5 8"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
};

export const MT_CSS = `
.h3z-body.h3z-mtwide{grid-template-columns:60px var(--h3z-gap,8px) min(max(var(--lw,272px),860px),44vw) var(--h3z-gap,8px) minmax(0,1fr) var(--h3z-gap,8px) min(var(--rw,372px),30vw)}
.h3z-mt-bar{padding:2px 0 10px;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:12px}
.h3z-mt-barrow{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.h3z-mt-cols{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:16px;align-items:start}
.h3z-mt-col{min-width:0}
.h3z-mt-scope{display:flex;gap:6px;margin:4px 0 10px}
.h3z-mt-scope .h3z-pill{flex:1;text-align:center}
.h3z-mt-note{font-size:11.5px;opacity:.75;margin:4px 0 8px;line-height:1.45}
.h3z-lr-add{width:100%;justify-content:center;gap:8px;font-weight:700;padding:9px 12px;border-radius:var(--r3,9px);background:var(--grad);color:#fff;border:none;box-shadow:0 4px 14px rgba(99,102,241,.3)}
.h3z-lr-add:hover{filter:brightness(1.08)} .h3z-lr-add:disabled{opacity:.4;box-shadow:none}
.h3z-lr-bar{display:flex;align-items:center;gap:10px;margin:10px 0 6px;font-size:12px;color:var(--mut)}
.h3z-lr-bar b{color:var(--txt);font-weight:700}
.h3z-sw{position:relative;width:34px;height:20px;border-radius:20px;background:rgba(148,163,255,.18);cursor:pointer;flex:none;transition:.15s}
.h3z-sw::after{content:"";position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#fff;transition:.15s}
.h3z-sw.on{background:var(--grad)} .h3z-sw.on::after{left:17px}
.h3z-sw.mixed{background:linear-gradient(90deg,rgba(139,92,246,.55),rgba(148,163,255,.18))} .h3z-sw.mixed::after{left:10px}
.h3z-lr{display:grid;grid-template-columns:12px minmax(0,1fr) auto 34px 24px 20px;gap:8px;align-items:center;padding:7px 9px;margin:5px 0;border-radius:var(--r2,12px);
  background:rgba(5,7,15,.42);border:1px solid var(--line);transition:border-color .12s,background .12s}
.h3z-lr:hover{border-color:var(--line2)}
.h3z-lr.on{background:linear-gradient(90deg,rgba(139,92,246,.10),rgba(34,211,238,.04) 60%,rgba(5,7,15,.42))}
.h3z-lr.off .nm,.h3z-lr.off .st,.h3z-lr.off .inf{opacity:.38}
.h3z-lr.drop{border-color:var(--a2);box-shadow:0 0 0 1px var(--a2) inset}
.h3z-lr .grip{cursor:grab;color:var(--mut2);font-size:11px;letter-spacing:-2px;user-select:none;text-align:center}
.h3z-lr .nm{display:flex;flex-direction:column;min-width:0;cursor:pointer;padding:1px 2px;border-radius:7px}
.h3z-lr .nm b{font-size:12.5px;font-weight:600;color:var(--txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.h3z-lr .nm small{font-size:10.5px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.h3z-lr .nm:hover b{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.h3z-lr .nm.miss b{color:var(--err)}
.h3z-lr .st{display:flex;align-items:center;gap:2px;padding:2px;border-radius:9px;background:rgba(5,7,15,.55);border:1px solid var(--line)}
.h3z-lr .st input{width:44px;border:none;background:transparent;color:var(--txt);text-align:center;font:600 12px/1 inherit;padding:4px 0;-moz-appearance:textfield}
.h3z-lr .st input::-webkit-inner-spin-button{display:none}
.h3z-lr .st .ud{display:flex;flex-direction:column;gap:1px}
.h3z-lr .st .ud button{border:none;border-radius:5px;background:rgba(148,163,255,.10);color:var(--mut);font-size:7px;line-height:1;padding:2px 5px;cursor:pointer}
.h3z-lr .st .ud button:hover{background:var(--grad);color:#fff}
.h3z-lr .inf{width:24px;height:24px;border:1px solid var(--line);border-radius:8px;background:transparent;color:var(--mut);cursor:pointer;display:grid;place-items:center;padding:0}
.h3z-lr .inf svg{width:13px;height:13px} .h3z-lr .inf:hover{color:var(--txt);border-color:var(--line2)}
.h3z-lr .inf.on{background:var(--grad);border-color:transparent;color:#fff}
.h3z-lr .x{border:none;background:transparent;color:var(--mut2);cursor:pointer;padding:0;font-size:12px}
.h3z-lr .x:hover{color:var(--err)}
.h3z-lr-info{grid-column:2/-1;font-size:11.5px;color:var(--mut);display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:6px 0 1px;border-top:1px dashed var(--line);margin-top:4px}
.h3z-lr-info code{color:#b9c0ea;word-break:break-all;font-size:11px}
.h3z-lr-info input{width:64px}
.h3z-lp{position:fixed;z-index:100005;display:flex;flex-direction:column;max-height:70vh;border-radius:var(--r2,12px);background:var(--panel2);
  border:1px solid var(--line2);backdrop-filter:blur(18px) saturate(140%);box-shadow:0 18px 48px rgba(0,0,0,.6);font-size:12.5px;overflow:hidden;color:var(--txt)}
.h3z-lp::before{content:"";position:absolute;inset:0 0 auto 0;height:2px;background:var(--grad);opacity:.9}
.h3z-lp .top{display:flex;align-items:center;gap:8px;margin:10px 10px 6px;padding:0 10px;border-radius:10px;background:rgba(5,7,15,.55);border:1px solid var(--line)}
.h3z-lp .top:focus-within{border-color:var(--a1);box-shadow:0 0 0 3px rgba(139,92,246,.18)}
.h3z-lp .top svg{width:14px;height:14px;color:var(--mut);flex:none}
.h3z-lp input.q{flex:1;padding:8px 0;border:none;background:transparent;color:inherit;outline:none;font:inherit}
.h3z-lp .crumbs{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:0 10px 8px;font-size:11.5px}
.h3z-lp .crumbs a{cursor:pointer;padding:2px 9px;border-radius:20px;border:1px solid var(--line);color:var(--mut);background:rgba(148,163,255,.06)}
.h3z-lp .crumbs a:hover{color:var(--txt);border-color:var(--line2)}
.h3z-lp .crumbs a.on{color:#fff;background:var(--grad);border-color:transparent}
.h3z-lp .crumbs i{color:var(--mut2);font-style:normal}
.h3z-lp .crumbs span{color:var(--mut)}
.h3z-lp .ls{overflow:auto;padding:0 6px 8px;scrollbar-width:thin;scrollbar-color:rgba(148,163,255,.18) transparent}
.h3z-lp .ls::-webkit-scrollbar{width:8px} .h3z-lp .ls::-webkit-scrollbar-thumb{background:rgba(148,163,255,.18);border-radius:8px}
.h3z-lp .row{position:relative;display:flex;align-items:center;gap:9px;padding:6px 10px;border-radius:9px;cursor:pointer;white-space:nowrap;color:#cfd4f6}
.h3z-lp .row svg{width:15px;height:15px;flex:none;color:var(--mut2)}
.h3z-lp .row.fold svg{color:var(--a2)}
.h3z-lp .row.fold .n{font-weight:600;color:var(--txt)}
.h3z-lp .row:hover,.h3z-lp .row.hi{background:rgba(139,92,246,.14)}
.h3z-lp .row.hi::before{content:"";position:absolute;left:0;top:6px;bottom:6px;width:3px;border-radius:3px;background:var(--grad)}
.h3z-lp .row.cur .n{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:700}
.h3z-lp .row .n{flex:1;overflow:hidden;text-overflow:ellipsis}
.h3z-lp .row .c{font-size:10.5px;font-weight:700;padding:1px 8px;border-radius:20px;background:rgba(148,163,255,.10);border:1px solid var(--line);color:var(--mut)}
.h3z-lp .row .d{font-size:10.5px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;max-width:45%}
.h3z-lp .row.back{color:var(--mut)}
.h3z-lp .empty{padding:12px;color:var(--mut)}
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
      box.append(add, h("div", { class: "h3z-lr-bar" }, master, h("span", null, h("b", null, `${on} / ${n}`), " вкл."),
        h("em", { class: "h3z-note", style: "margin-left:auto" }, n > 1 ? "порядок — перетаскиванием ⋮⋮" : "")));
      pr.loras.forEach((l, k) => {
        const row = h("div", { class: "h3z-lr" + (l.on ? " on" : " off") });
        const grip = h("div", { class: "grip", draggable: "true", title: "Перетащите, чтобы поменять порядок" }, "⋮⋮");
        grip.addEventListener("dragstart", (e) => { this._lrDrag = k; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(k)); });
        row.addEventListener("dragover", (e) => { if (this._lrDrag == null) return; e.preventDefault(); row.classList.add("drop"); });
        row.addEventListener("dragleave", () => row.classList.remove("drop"));
        row.addEventListener("drop", (e) => { e.preventDefault(); row.classList.remove("drop"); const from = this._lrDrag; this._lrDrag = null;
          if (from == null || from === k) return; ed((p) => { const [x] = p.loras.splice(from, 1); p.loras.splice(k, 0, x); }); });
        grip.addEventListener("dragend", () => { this._lrDrag = null; });
        const dir = parts(l.file).slice(0, -1).join(" / ");
        const nm = h("div", { class: "nm" + (miss?.has(l.file) ? " miss" : ""), title: l.file + (miss?.has(l.file) ? "\n⚠ нет файла" : "") + "\nКлик — выбрать другую LoRA" },
          h("b", null, stem(l.file) || "— выберите —"), h("small", null, (miss?.has(l.file) ? "⚠ нет файла · " : "") + (dir || "models/loras")));
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
        const inf = h("button", { class: "inf" + (this._lrInfo.has(key) ? " on" : ""), title: "Подробнее: путь, сила для энкодера", html: IC.info });
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
          row.append(h("div", { class: "h3z-lr-info" }, h("code", null, "models/loras/" + l.file),
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
      const inp = h("input", { class: "q", placeholder: "Поиск по всем папкам…", spellcheck: "false" });
      const crumbs = h("div", { class: "crumbs" }), ls = h("div", { class: "ls" });
      pop.append(h("div", { class: "top", html: IC.search }, inp), crumbs, ls);
      const row = (cls, icon, name, ...tail) => { const r = h("div", { class: "row " + cls }, name); r.insertAdjacentHTML("afterbegin", icon); tail.forEach((t) => t && r.append(t)); return r; };
      const pick = (f) => { close(); onPick(f); };
      const paint = () => {
        crumbs.replaceChildren(); ls.replaceChildren(); rows = [];
        const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
        if (terms.length) {
          crumbs.append(h("span", null, `Найдено во всех папках`));
          const hits = files.filter((f) => terms.every((t) => f.toLowerCase().includes(t)));
          for (const f of hits.slice(0, 400)) {
            const dir = parts(f).slice(0, -1).join(" / ");
            rows.push([row(f === cur ? "cur" : "", IC.file, h("span", { class: "n" }, stem(f)), dir ? h("span", { class: "d" }, dir) : null), () => pick(f)]);
          }
          if (!hits.length) ls.append(h("div", { class: "empty" }, "Ничего не найдено"));
        } else {
          const all = h("a", { class: path.length ? "" : "on" }, "Все LoRA"); all.onclick = () => { path = []; hi = 0; paint(); };
          crumbs.append(all);
          path.forEach((p, j) => { const a = h("a", { class: j === path.length - 1 ? "on" : "" }, p); a.onclick = () => { path = path.slice(0, j + 1); hi = 0; paint(); }; crumbs.append(h("i", null, "/"), a); });
          const pre = path.length ? path.join("/") + "/" : "";
          const inDir = files.filter((f) => f.replace(/\\/g, "/").startsWith(pre));
          const sub = new Map(), here = [];
          for (const f of inDir) {
            const rest = parts(f).slice(path.length);
            if (rest.length > 1) sub.set(rest[0], (sub.get(rest[0]) || 0) + 1); else here.push(f);
          }
          if (path.length) rows.push([row("back", IC.back, h("span", { class: "n" }, "Назад")), () => { path = path.slice(0, -1); hi = 0; paint(); }]);
          for (const [d, c] of [...sub].sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" })))
            rows.push([row("fold", IC.folder, h("span", { class: "n" }, d), h("span", { class: "c", title: `${c} файл.` }, String(c))), () => { path = [...path, d]; hi = 0; paint(); }]);
          for (const f of here) rows.push([row(f === cur ? "cur" : "", IC.file, h("span", { class: "n" }, stem(f))), () => pick(f)]);
          if (!rows.length) ls.append(h("div", { class: "empty" }, "Пусто"));
        }
        hi = Math.min(hi, Math.max(0, rows.length - 1));
        rows.forEach(([el, fn], j) => { el.onclick = fn; if (j === hi) el.classList.add("hi"); ls.append(el); });
      };
      const close = () => { pop.remove(); document.removeEventListener("pointerdown", outside, true); setTimeout(() => this.focusSink?.(), 0); };
      const outside = (e) => { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) close(); };
      pop._close = close;
      pop.addEventListener("mousedown", (e) => { if (e.target !== inp) e.preventDefault(); });   // clicks keep the search field focused
      inp.oninput = () => { q = inp.value; hi = 0; paint(); };
      // the editor's window-level key handler stops every key in capture; it hands the picker's keys over as "h3zkey"
      const onKey = (e) => {
        if (e.key === "Escape") close();
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); hi = Math.max(0, Math.min(rows.length - 1, hi + (e.key === "ArrowDown" ? 1 : -1))); paint(); ls.querySelector(".hi")?.scrollIntoView({ block: "nearest" }); }
        else if (e.key === "Enter") { e.preventDefault(); rows[hi]?.[1](); }
        else if (e.key === "Backspace" && !inp.value && path.length) { path = path.slice(0, -1); paint(); }
      };
      inp.addEventListener("h3zkey", (ev) => onKey(ev.detail));
      (this.root || document.body).append(pop);   // inside the editor root: the studio's theme variables apply
      document.addEventListener("pointerdown", outside, true);
      paint();
      inp.focus();
      setTimeout(() => pop.isConnected && inp.focus(), 40);   // the editor re-focuses its key sink after a click
      ls.querySelector(".cur")?.scrollIntoView({ block: "nearest" });
      return pop;
    },
  });
}

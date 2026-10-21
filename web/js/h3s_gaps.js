// Gaps on the timeline: with «🧲 Магнит» off (default) a plain drag moves a clip (and everything after it) apart from the previous one. A gap is
// stored on the clip after it (segment.gap, frames); it is black + silence in the result, makes that clip a new
// shot, survives delete / reload / save, can be selected (Del removes it) and filled by generation: a ✂ span from
// the end of the shot before over the gap into the next one (h3s_core.bridge_window).
export const GAP_CSS = `
.h3z-tgap{position:absolute;top:6px;bottom:6px;z-index:2;border-radius:10px;border:1px dashed var(--line2);cursor:pointer;
  background:repeating-linear-gradient(135deg,rgba(148,163,255,.05) 0 8px,rgba(148,163,255,.015) 8px 16px);display:flex;align-items:center;justify-content:center;overflow:hidden}
.h3z-tgap:hover{border-color:var(--a2)}
.h3z-tgap.sel{border:1px solid transparent;background:linear-gradient(rgba(10,14,28,.92),rgba(10,14,28,.92)) padding-box,var(--grad) border-box}
.h3z-tgap{flex-direction:column;gap:4px}
.h3z-tgap .dur{font-size:10.5px;font-weight:700;color:var(--mut);white-space:nowrap;pointer-events:none}
.h3z-tgap.sel .dur{color:var(--txt)}
.h3z-tgap .acts{display:flex;gap:4px;align-items:center}
.h3z-tgap .gb{height:24px;border-radius:8px;border:1px solid var(--line2);background:rgba(10,14,28,.85);color:var(--txt);font:700 11px/1 inherit;cursor:pointer;display:inline-flex;align-items:center;gap:5px;padding:0 9px;white-space:nowrap}
.h3z-tgap .gb.fill{background:var(--grad);border-color:transparent;color:#fff;box-shadow:0 3px 10px rgba(99,102,241,.35)}
.h3z-tgap .gb.fill.icon{width:26px;padding:0;justify-content:center}
.h3z-tgap .gb.del{width:24px;padding:0;justify-content:center;color:var(--mut)} .h3z-tgap .gb.del:hover{color:var(--err);border-color:var(--err)}
.h3z-tgap .gb:hover{filter:brightness(1.12)}
.h3z-magbtn.on{background:var(--grad);color:#fff;border-color:transparent}
`;

export function installGaps(Editor, { C, h }) {
  Object.assign(Editor.prototype, {
    gapStyle() { if (!document.getElementById("h3z-tgap-style")) document.head.append(h("style", { id: "h3z-tgap-style" }, GAP_CSS)); },
    /** (legacy, unused) drag on clip i: its gap (the space before it) follows the mouse; everything after moves along. */
    gapDrag(e, i) {
      e.preventDefault();
      if (this.run?.active) { this.toast("Идёт генерация — промежутки меняются после неё", true); return; }
      const sx = e.clientX, g0 = this.seg(i).gap || 0, was = this.seg(i).link === "extend" && i > 0 && !g0;
      const tip = h("div", { class: "h3z-tip" }); document.body.append(tip);
      let first = true, cur = g0;
      const move = (ev) => {
        const g = Math.max(0, Math.min(C.MAX_GAP, g0 + Math.round((ev.clientX - sx) / this.ppf)));
        tip.style.left = ev.clientX + 12 + "px"; tip.style.top = ev.clientY - 34 + "px";
        tip.textContent = g ? `промежуток ${g} кадр. · ${(g / C.FPS).toFixed(2)} с` : "без промежутка";
        if (g === cur) return;
        cur = g;
        this.mutate((p) => { p.segments[i].gap = g; }, { coalesce: first ? null : "gap" + i, render: "light" });
        first = false; this.lastCoalesce = { key: "gap" + i, t: Date.now() };
      };
      const up = () => {
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); tip.remove();
        if (cur !== g0) {
          this.selGap = cur ? this.seg(i).id : null;
          this.renderAll();
          this.toast(cur ? `Промежуток ${(cur / C.FPS).toFixed(2)} с перед отрезком ${i + 1}` + (was ? " — он больше не продолжает предыдущий (новая сцена)" : "") + " · Ctrl+Z — вернуть"
            : `Промежуток перед отрезком ${i + 1} убран`);
        }
      };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    },
    /** «🧲 Магнит» (settings.magnet, default off): effective state for a pointer event — Alt / Ctrl / ⌘ invert it. */
    magnetOn(e) { return !!this.p.settings.magnet !== !!(e && (e.altKey || e.ctrlKey || e.metaKey)); },
    magnetButton() {
      const b = this.$.magBtn = h("button", { class: "h3z-btn sm h3z-magbtn", html: "<b>🧲</b><span>Магнит</span>" });
      const paint = () => {
        const on = !!this.p.settings.magnet;
        b.classList.toggle("on", on);
        b.title = on ? "Магнит включён: клипы прилипают друг к другу, перетаскивание клипа меняет порядок.\nAlt (или Ctrl) при перетаскивании — свободно, с промежутком. Клик — выключить"
          : "Магнит выключен: перетаскивание клипа сдвигает его (и всё после него) и оставляет промежуток;\nближе 10 px к предыдущему клипу — прилипает. Бросьте на предыдущий клип — порядок поменяется.\nAlt (или Ctrl) при перетаскивании — магнит. Клик — включить";
      };
      b.onclick = () => {
        const on = !this.p.settings.magnet;           // read now: the toolbar is not rebuilt on every change
        this.setOnce("magnet", on, { render: "none" }); paint(); this.renderTimeline();
        this.toast(on ? "🧲 Магнит включён: клипы прилипают, перетаскивание меняет порядок" : "🧲 Магнит выключен: перетаскивание оставляет промежуток");
      };
      paint(); b._paint = paint;
      return b;
    },
    /** Free placement: dx -> the gap before clip i (snaps to 0 within 8 px); pulled further left over an earlier clip,
     *  the drop there reorders (insertion marker shown). A click without movement selects, as before. */
    freeDrag(e, i) {
      e.preventDefault();
      const sx = e.clientX, clip = this.$.clips[i], g0 = this.seg(i).gap || 0, wasExt = this.seg(i).link === "extend" && i > 0 && !g0;
      const its = this.items(), it0 = its[i];
      const centers = its.map((it, k) => ((it.start + (k ? it.overlap : 0) + it.end) / 2) * this.ppf);
      let dragging = false, cur = g0, first = true, target = i, ins = null, tip = null;
      const move = (ev) => {
        const dx = ev.clientX - sx;
        if (!dragging && Math.abs(dx) < 5) return;
        if (!dragging) {
          if (this.run?.active) { this.toast("Идёт генерация — клипы двигаются после неё", true); window.removeEventListener("pointermove", move); return; }
          dragging = true; tip = h("div", { class: "h3z-tip" }); document.body.append(tip); clip?.classList.add("dragging");
        }
        let want = g0 + Math.round(dx / this.ppf);
        if (g0 * this.ppf + dx < 10) want = Math.min(want, 0);       // sticks to the previous clip only within 10 px
        const g = Math.max(0, Math.min(C.MAX_GAP, want));
        // pulled past the previous clip: reorder target (only when it lands on an earlier clip)
        target = i;
        const x = it0.start - g0 + Math.round(dx / this.ppf);        // where the clip's left edge would be
        if (want < 0 && i > 0 && x < its[i - 1].end - (its[i - 1].end - its[i - 1].start) / 2) {
          const px = x * this.ppf;                                    // the dragged clip's left edge decides the slot
          target = Math.min(i, centers.filter((c, k) => k !== i && c < px).length);
        }
        if (target !== i) {
          if (!ins) { ins = h("div", { class: "h3z-ins" }); clip?.parentElement?.append(ins); }
          const order = its.map((_, k) => k).filter((k) => k !== i);
          ins.style.left = (its[order[target]].start + (order[target] ? its[order[target]].overlap : 0) - (its[order[target]].gap || 0)) * this.ppf + "px";
          const ce = this.$.clips[i]; if (ce) { ce.classList.add("dragging"); ce.style.transform = `translateX(${dx}px) translateY(-4px)`; }
          tip.textContent = `↔ поставить на место ${target + 1}`;
        } else {
          ins?.remove(); ins = null;
          if (this.$.clips[i]) this.$.clips[i].style.transform = "";
          tip.textContent = g ? `промежуток ${g} кадр. · ${(g / C.FPS).toFixed(2)} с` + (this.p.settings.magnet ? "" : " · Alt — магнит") : "вплотную к предыдущему";
          if (g !== cur) {
            cur = g;
            this.mutate((p) => { p.segments[i].gap = g; }, { coalesce: first ? null : "gap" + i, render: "light" });
            first = false; this.lastCoalesce = { key: "gap" + i, t: Date.now() };
            const c2 = this.$.clips[i]; if (c2) c2.classList.add("dragging");
          }
        }
        tip.style.left = ev.clientX + 12 + "px"; tip.style.top = ev.clientY - 34 + "px";
      };
      const up = (ev) => {
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
        tip?.remove(); ins?.remove();
        if (!dragging) return this.clipClick(ev, i);
        if (target !== i) {
          this.mutate((p) => { const [s] = p.segments.splice(i, 1); s.gap = g0; p.segments.splice(target, 0, s); if (cur !== g0) { /* gap edits of this drag are undone by the reorder */ } }, { render: "none" });
          this.sel = target; this.renderAll(); this.toast(`Отрезок перемещён на позицию ${target + 1} · Ctrl+Z — вернуть`);
          return;
        }
        this.renderAll();
        if (cur !== g0) this.toast(cur ? `Промежуток ${(cur / C.FPS).toFixed(2)} с перед отрезком ${i + 1}` + (wasExt ? " — он больше не продолжает предыдущий (новая сцена)" : "") + " · Ctrl+Z — вернуть"
          : `Отрезок ${i + 1} вплотную к предыдущему` + (this.seg(i).link === "extend" && i > 0 ? " — снова продолжение" : ""));
      };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    },

    /** Hatched gap blocks on the video track (select / Del / menu: remove, fill). */
    renderGaps(vt, its, ppf) {
      this.gapStyle();
      const spans = (this.p.regions || []).map((rg) => { const w = C.regionWindow(this.p, rg, its); return w.error ? null : { rg, a: w.a, b: w.b, take: !!this.regionTake(rg)?.take.result?.strip }; }).filter(Boolean);
      for (const it of its) {
        if (!it.gap) continue;
        const g0 = it.start - it.gap, over = spans.filter((x) => x.a < it.start && x.b > g0);
        if (over.some((x) => x.take)) continue;      // filled: the span draws its frames there (menu: «Убрать заполнение»)
        const id = this.p.segments[it.index].id, w = it.gap * ppf;
        const el = h("div", { class: "h3z-tgap" + (this.selGap === id ? " sel" : ""), style: { left: (it.start - it.gap) * ppf + "px", width: Math.max(3, w) + "px" },
          title: `Промежуток ${it.gap} кадр. (${(it.gap / C.FPS).toFixed(2)} с): чёрный кадр и тишина.\n«✂ Заполнить» — мост/пролог поверх него · клик — выбрать (Del — убрать) · правый клик — меню.\nПеретаскивание клипа (магнит выключен) — изменить` },
          w > 150 ? h("span", { class: "dur" }, `⟷ ${(it.gap / C.FPS).toFixed(1)} с`) : null);
        // always-visible actions: «✂ Заполнить» (bridge / prologue span, its card opens) and ✕ remove
        const fill = h("button", { class: "gb fill" + (w < 104 ? " icon" : ""), title: it.index > 0 ? `Заполнить промежуток генерацией: мост ${it.index} → ${it.index + 1} (конец сцены до и начало следующей — контекст)` : "Заполнить промежуток генерацией: пролог перед отрезком 1 (контекст — начало отрезка)",
          html: w < 104 ? "✂" : "✂ <span>Заполнить</span>" });
        fill.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); });
        fill.addEventListener("click", (e) => { e.stopPropagation(); this.selGap = null; if (over.length) { this.selRegion = over[0].rg.id; this.renderTimeline(); } else this.fillGap(it.index); });
        const del = w >= 46 ? h("button", { class: "gb del", title: "Убрать промежуток (Del)", html: "✕" }) : null;
        del?.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); });
        del?.addEventListener("click", (e) => { e.stopPropagation(); this.removeGap(it.index); });
        el.append(h("div", { class: "acts" }, fill, del));
        el.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; e.stopPropagation(); this.selGap = id; this.selRegion = null; this.selAudio = null; this.renderTimeline(); });
        el.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); this.selGap = id; this.renderTimeline(); this.gapMenu(e, it.index); });
        vt.append(el);
      }
    },
    gapMenu(e, i) {
      const g = this.seg(i)?.gap || 0;
      this.openMenu(e, `Промежуток ${g} кадр. · ${(g / C.FPS).toFixed(2)} с`, [
        { label: i > 0 ? `✂ Заполнить генерацией (мост ${i} → ${i + 1})` : "✂ Заполнить генерацией (пролог)", fn: () => this.fillGap(i),
          title: "Участок поверх промежутка: конец предыдущей сцены и начало следующей — контекст, середина генерируется" },
        { label: "✕ Убрать промежуток", hint: "Del", fn: () => this.removeGap(i), danger: true },
      ]);
    },
    removeGap(i) {
      if (!this.seg(i)?.gap) return;
      this.mutate((p) => { p.segments[i].gap = 0; }, { render: "none" });
      this.selGap = null; this.renderAll(); this.toast("Промежуток убран · Ctrl+Z — вернуть");
    },
    /** A ✂ span over the gap with clean context on both sides: the end of the shot before and the start of the next. */
    fillGap(i) {
      const it = this.items()[i]; if (!it?.gap) return;
      const s0 = it.start - it.gap;
      const id = this.addRegion(Math.max(0, s0 - (i > 0 ? 8 : 0)), it.start + 8);
      if (id) { this.selRegion = id; this.renderTimeline(); }
      return id;
    },
    selectedGapIndex() { return this.selGap ? this.p.segments.findIndex((s) => s.id === this.selGap && s.gap) : -1; },
  });
}

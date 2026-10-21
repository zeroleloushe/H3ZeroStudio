// Gaps on the timeline: Ctrl+drag a clip to move it (and everything after it) apart from the previous one. A gap is
// stored on the clip after it (segment.gap, frames); it is black + silence in the result, makes that clip a new
// shot, survives delete / reload / save, can be selected (Del removes it) and filled by generation: a ✂ span from
// the end of the shot before over the gap into the next one (h3s_core.bridge_window).
export const GAP_CSS = `
.h3z-tgap{position:absolute;top:6px;bottom:6px;z-index:2;border-radius:10px;border:1px dashed var(--line2);cursor:pointer;
  background:repeating-linear-gradient(135deg,rgba(148,163,255,.05) 0 8px,rgba(148,163,255,.015) 8px 16px);display:flex;align-items:center;justify-content:center;overflow:hidden}
.h3z-tgap:hover{border-color:var(--a2)}
.h3z-tgap.sel{border:1px solid transparent;background:linear-gradient(rgba(10,14,28,.92),rgba(10,14,28,.92)) padding-box,var(--grad) border-box}
.h3z-tgap span{font-size:10.5px;font-weight:700;color:var(--mut);white-space:nowrap;pointer-events:none}
.h3z-tgap.sel span{color:var(--txt)}
`;

export function installGaps(Editor, { C, h }) {
  Object.assign(Editor.prototype, {
    gapStyle() { if (!document.getElementById("h3z-tgap-style")) document.head.append(h("style", { id: "h3z-tgap-style" }, GAP_CSS)); },
    /** Ctrl+drag on clip i: its gap (the space before it) follows the mouse; everything after moves along. */
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
    /** Hatched gap blocks on the video track (select / Del / menu: remove, fill). */
    renderGaps(vt, its, ppf) {
      this.gapStyle();
      for (const it of its) {
        if (!it.gap) continue;
        const id = this.p.segments[it.index].id, w = it.gap * ppf;
        const el = h("div", { class: "h3z-tgap" + (this.selGap === id ? " sel" : ""), style: { left: (it.start - it.gap) * ppf + "px", width: Math.max(3, w) + "px" },
          title: `Промежуток ${it.gap} кадр. (${(it.gap / C.FPS).toFixed(2)} с): чёрный кадр и тишина.\nКлик — выбрать (Del — убрать), правый клик — меню («Заполнить генерацией»).\nCtrl+перетаскивание клипа — изменить` },
          w > 60 ? h("span", null, `⟷ ${(it.gap / C.FPS).toFixed(1)} с`) : null);
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
      return this.addRegion(Math.max(0, s0 - (i > 0 ? 8 : 0)), it.start + 8);
    },
    selectedGapIndex() { return this.selGap ? this.p.segments.findIndex((s) => s.id === this.selGap && s.gap) : -1; },
  });
}

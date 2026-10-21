import { T } from "./h3s_i18n.js";
// «↑ Финал из черновика»: explicit, discoverable draft → final actions (clip button, card block, context menu,
// header button). A final from a draft = the chosen draft take is upscaled (learned H3 latent upscaler by
// default) and refined by a short H3 pass; the draft's sound is kept 1:1. Technically it is the project mode
// a run of kind "refine" for the chosen segments (run.kind override; the project mode is not changed).
export function installFinal(Editor, { C, h }) {
  const TIP = T("Финал из черновика: выбранный дубль-черновик увеличивается до финального размера (обученный латентный апскейлер H3; без модели — RTX VSR) и дорабатывается коротким проходом H3 с тем же промптом и референсами. Композиция, движение и звук черновика сохраняются.");
  Object.assign(Editor.prototype, {
    /** Segment i has a draft take (active or among its takes). */
    hasDraft(i) {
      const s = this.seg(i);
      return !!(s && !C.isFootage(s) && (s.result?.kind === "draft" || (s.takes || []).some((t) => t.result?.kind === "draft")));
    },
    /** Segment i already shows a current final made from its draft. */
    finalDone(i) { const s = this.seg(i); return !!(s?.result?.kind === "refine" && !this.isStale(i)); },
    /** Segments that can get a final from their draft (before the end marker, not frozen, not done yet). */
    finalCandidates() {
      const out = [];
      for (let i = 0; i < this.genCount(); i++) if (this.hasDraft(i) && !this.finalDone(i) && !this.seg(i).freeze) out.push(i);
      return out;
    },

    /** Start «final from draft» for the given segments (null = all with a draft). */
    finalFromDraft(list = null) {
      if (this.run.active) { this.toast(T("Сейчас идёт генерация — дождитесь окончания"), true); return; }
      if (this.upAvail && !this.upAvail()) { this.toast(this.upUnavailText(), true); return; }
      const todo = (list || this.finalCandidates()).filter((i) => this.hasDraft(i) && !this.finalDone(i));
      if (!todo.length) { this.toast(list && list.length === 1 && this.finalDone(list[0]) ? T("Отрезок {0}: финал уже готов", list[0] + 1) : T("Нет черновиков для финала — сначала сделайте черновик (кнопка «✎ Черновик» вверху)"), true); return; }
      // the draft the final is made from: the active take if it is a draft, else the newest draft take
      for (const i of todo) {
        const s = this.seg(i);
        if (s.result?.kind !== "draft") {
          const t = [...(s.takes || [])].reverse().find((x) => x.result?.kind === "draft");
          if (t) this.selectTake(i, t.id, true);
        }
      }
      // a per-run override: the project mode («1 этап / 2 этапа», header «✎ Черновик») is not changed
      const [w, hh] = C.resolution(this.p.settings);
      this.renderAll();
      if (todo.length === 1 && list) {
        this.sel = todo[0];
        this.generate({ upto: todo[0], only: todo[0], kind: "refine" });
        this.toast(T("Отрезок {0}: финал из черновика → {1}×{2} (апскейл + доработка, звук черновика сохраняется)", todo[0] + 1, w, hh));
      } else {
        this.generate({ upto: Math.max(...todo), kind: "refine" });
        this.toast(T("Финал из черновиков: {0} отр. → {1}×{2}", todo.length, w, hh));
      }
    },

    /** Small clip button «↑ Финал» (only on clips with a draft). */
    finalClipButton(i, wd) {
      if (!this.hasDraft(i) || this.finalDone(i) || this.seg(i).freeze || i >= this.genCount()) return null;
      const b = h("button", { class: "h3z-cb txt fin", title: T("↑ Финал из черновика\n") + TIP, html: wd > 150 ? T("<b>↑</b>Финал") : T("<b>↑Ф</b>") });
      b.addEventListener("pointerdown", (e) => e.stopPropagation());
      b.addEventListener("click", (e) => { e.stopPropagation(); this.finalFromDraft([i]); });
      return b;
    },

    finalMenuEntries(i) {
      if (!this.hasDraft(i) || this.seg(i).freeze) return [];
      const done = this.finalDone(i);
      return [{ label: done ? T("↑ Финал из черновика (готов)") : T("↑ Финал из черновика"), title: TIP, fn: () => this.finalFromDraft([i]), dis: done || this.run.active || i >= this.genCount() }];
    },

    /** Card block for the selected segment. */
    finalBlock(i) {
      if (!this.hasDraft(i) || this.seg(i).freeze) return null;
      const done = this.finalDone(i), [w, hh] = C.resolution(this.p.settings);
      const n = this.finalCandidates().length;
      return h("div", { class: "h3z-finblock" },
        h("div", { class: "hd" }, h("b", null, T("↑ Финал из черновика")), done ? h("span", { class: "h3z-note ok" }, T("готов ✓")) : h("span", { class: "h3z-note" }, `→ ${w}×${hh}`)),
        h("div", { class: "h3z-note" }, TIP),
        h("div", { class: "row" },
          h("button", { class: "h3z-btn primary sm", title: TIP, disabled: done || this.run.active || i >= this.genCount() || undefined, onclick: () => this.finalFromDraft([i]) }, T("↑ Финал отрезка {0}", i + 1)),
          n > 1 || (n === 1 && done) ? h("button", { class: "h3z-btn sm", title: T("Сделать финал из черновиков всех отрезков, где он ещё не сделан"), disabled: this.run.active || undefined, onclick: () => this.finalFromDraft(null) }, T("Все черновики · {0}", n)) : null),
        h("div", { class: "h3z-note" }, T("Метод апскейла и сила доработки — Настройки → «Черновик и финал».")));
    },

    /** Header button «↑ Финал из черновиков» (menu: all / selected). */
    finalHeaderButton() {
      const n = this.finalCandidates().length;
      if (!n && !(this.p.segments || []).some((s, i) => this.hasDraft(i))) return null;
      return h("button", { class: "h3z-btn h3z-finall" + (n ? "" : " dis"), title: T("↑ Финал из черновиков ({0})\n{1}\nКлик — выбрать: все отрезки или только выбранный", n, TIP),
        html: T("<b>↑</b><span>Финал из черновиков{0}</span>", n ? " · " + n : ""),
        onclick: (e) => {
          const sel = this.sel >= 0 && this.hasDraft(this.sel) && !this.finalDone(this.sel) ? this.sel : -1;
          this.openMenu(e, T("↑ Финал из черновиков"), [
            { label: T("Все отрезки с черновиком ({0})", n), title: TIP, fn: () => this.finalFromDraft(null), dis: !n || this.run.active },
            { label: sel >= 0 ? T("Только выбранный — отрезок {0}", sel + 1) : T("Только выбранный (выберите клип с черновиком)"), fn: () => this.finalFromDraft([sel]), dis: sel < 0 || this.run.active },
            { why: T("Черновик увеличивается и дорабатывается; звук сохраняется 1:1") },
          ]);
        } });
    },
  });
}

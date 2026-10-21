import { T } from "./h3s_i18n.js";
// H3ZeroStudio: generation timer in the header + history of the last runs.
// Based on the server's run record (/h3zero/runs: start / end / status), so a reload or a background tab keeps the
// right time. Ticks every second while running; afterwards it keeps the final time, coloured by the result.
const ST = { running: T("идёт"), done: T("готово"), error: T("ошибка"), interrupted: T("прервано") };
const ICONS = { running: "●", done: "✓", error: "✕", interrupted: "■" };

export const TIMER_CSS = `
.h3z-timer{display:inline-flex;align-items:center;gap:6px;margin:0 12px;padding:5px 12px;border-radius:999px;border:1px solid var(--line);background:rgba(148,163,255,.07);
  font:600 12.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;color:inherit;cursor:pointer;white-space:nowrap;flex:none}
.h3z-timer:hover{background:rgba(148,163,255,.14)}
.h3z-timer i{font-style:normal;font-size:10px;opacity:.9}
.h3z-timer.running{border-color:rgba(139,123,255,.55);color:#c9c1ff}.h3z-timer.running i{animation:h3zPulse 1.2s ease-in-out infinite;color:#8b7bff}
.h3z-timer.done{color:var(--ok,#5fd38d);border-color:rgba(95,211,141,.35)}
.h3z-timer.error{color:var(--err,#ff5c7a);border-color:rgba(255,92,122,.4)}
.h3z-timer.interrupted{color:var(--warn,#ffb547);border-color:rgba(255,181,71,.4)}
.h3z-timer.idle{opacity:.55}
@keyframes h3zPulse{50%{opacity:.25}}
.h3z-tpop{position:absolute;z-index:50;min-width:440px;max-width:560px;padding:12px;border-radius:12px;display:flex;flex-direction:column;gap:8px;font-size:12px}
.h3z-tpop .row{display:grid;grid-template-columns:18px 1fr auto;gap:4px 12px;align-items:baseline;padding:8px 10px;border-radius:9px;background:rgba(255,255,255,.03)}
.h3z-tpop .row b{font-variant-numeric:tabular-nums}
.h3z-tpop .row small{grid-column:2/4;opacity:.65}
.h3z-tpop .row .running{color:#8b7bff}.h3z-tpop .row .done{color:var(--ok,#5fd38d)}.h3z-tpop .row .error{color:var(--err,#ff5c7a)}.h3z-tpop .row .interrupted{color:var(--warn,#ffb547)}
`;

export const fmtClock = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60, p = (x) => String(x).padStart(2, "0");
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
};
const msk = (t) => new Date(t * 1000).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function installTimer(Editor, { h }) {
  Object.assign(Editor.prototype, {
    /** The persistent header element (the header is re-rendered often; the timer keeps its state). */
    timerEl() {
      if (!document.getElementById("h3z-timer-style")) document.head.append(h("style", { id: "h3z-timer-style" }, TIMER_CSS));
      if (!this.$.timer) {
        this.$.timer = h("button", { class: "h3z-timer idle", title: T("Время генерации · клик — последние запуски") }, h("i", null, "◷"), h("span", null, "--:--"));
        this.$.timer.onclick = (e) => { e.stopPropagation(); this.timerPopover(); };
      }
      this.timerPaint();
      return this.$.timer;
    },

    /** Server state -> local; ticking while a run is going, polling now and then (reload / missed events). */
    async timerSync() {
      try {
        const d = await this.host.get("/h3zero/runs");
        this._tm = { cur: d.current || d.history?.[0] || null, hist: d.history || [], off: d.now * 1000 - Date.now() };
      } catch (e) { return; }
      this.timerPaint();
      const running = this._tm.cur?.status === "running";
      clearInterval(this._tmTick); clearTimeout(this._tmPoll);
      if (running) {
        this._tmTick = setInterval(() => (this.root ? this.timerPaint() : clearInterval(this._tmTick)), 1000);
        this._tmPoll = setTimeout(() => this.root && this.timerSync(), 5000);
      } else if (this.run?.active) this._tmPoll = setTimeout(() => this.root && this.timerSync(), 2000);   // queued: not started yet
      if (this.$.tpop) this.timerPopover(true);
    },

    timerPaint() {
      const el = this.$.timer, r = this._tm?.cur; if (!el) return;
      if (!r) { el.className = "h3z-timer idle"; el.lastChild.textContent = "--:--"; return; }
      const sec = r.status === "running" ? (Date.now() + (this._tm.off || 0)) / 1000 - r.start : r.dur ?? (r.end - r.start);
      el.className = "h3z-timer " + r.status;
      el.firstChild.textContent = ICONS[r.status] || "◷";
      el.lastChild.textContent = fmtClock(sec);
      el.title = `${r.what || T("запуск")} · ${r.stage || ""} · ${ST[r.status] || r.status}` + (r.error ? `\n${r.error}` : "") + T("\nКлик — последние запуски");
    },

    timerPopover(refresh = false) {
      const old = this.$.tpop;
      if (old && !refresh) { old.remove(); this.$.tpop = null; return; }
      const hist = this._tm?.hist || [];
      const rows = hist.length ? hist.map((r) => {
        const sec = r.status === "running" ? (Date.now() + (this._tm.off || 0)) / 1000 - r.start : r.dur ?? 0;
        const res = r.status === "done" && (r.generated != null) ? T(" · сгенерировано {0}, из кэша {1}", r.generated, r.cached) : r.error ? ` · ${r.error}` : "";
        return h("div", { class: "row" }, h("span", { class: r.status }, ICONS[r.status] || "·"),
          h("span", null, `${r.what || T("запуск")} · ${r.stage || ""}` + (r.segments ? T(" · {0} отр.", r.segments) : "") + (r.wh ? ` · ${r.wh[0]}×${r.wh[1]}` : "")),
          h("b", { class: r.status }, fmtClock(sec)),
          h("small", null, T("{0} МСК · {1}{2}", msk(r.start), ST[r.status] || r.status, res) + (r.project ? ` · «${r.project}»` : "")));
      }) : [h("div", { class: "h3z-note" }, T("Запусков пока не было."))];
      const pop = h("div", { class: "h3z-tpop h3z-glass" }, h("b", null, T("Последние запуски")), ...rows);
      const b = this.$.timer.getBoundingClientRect(), rb = this.root.getBoundingClientRect();
      pop.style.top = (b.bottom - rb.top + 8) + "px";
      pop.style.left = Math.max(12, Math.min(b.left - rb.left, rb.width - 572)) + "px";
      old?.remove();
      this.root.append(pop); this.$.tpop = pop;
      if (!refresh) {
        const off = (e) => { if (!pop.contains(e.target) && e.target !== this.$.timer) { pop.remove(); if (this.$.tpop === pop) this.$.tpop = null; document.removeEventListener("pointerdown", off, true); } };
        setTimeout(() => document.addEventListener("pointerdown", off, true));
      }
    },
  });
}

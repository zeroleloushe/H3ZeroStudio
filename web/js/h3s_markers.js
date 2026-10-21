import { T } from "./h3s_i18n.js";
// H3ZeroStudio: timeline markers (flags on the ruler). Effects: note / prompt event / character identity boost.
const EFFECTS = [["note", T("✎ Заметка"), T("Только заметка для себя, на генерацию не влияет")],
  ["prompt", T("✦ Событие"), T("Текст попадёт в промпт отрезка под маркером: «At 2.5s: …»")],
  ["boost", T("★ Персонаж"), T("Усилить сходство персонажа в отрезке под маркером. У H3 нет параметра силы референса, поэтому усиление делается акцентом в промпте")]];
const MCOLORS = ["#fbbf24", "#22d3ee", "#ec4899", "#a78bfa", "#34d399", "#f97316"];

export function installMarkers(Editor, { C, h, ICON }) {
  Object.assign(Editor.prototype, {
    markerColor(m) { return MCOLORS[(m.color || 0) % MCOLORS.length]; },

    addMarker(frame = Math.round(this.playhead)) {
      const id = C.newId("m");
      const n = this.p.markers.length + 1;
      this.mutate((p) => { p.markers.push({ id, frame: Math.max(0, Math.round(frame)), label: T("Маркер {0}", n), color: (n - 1) % MCOLORS.length, effect: "note", text: "", asset: "" }); }, { render: "none" });
      this.selMarker = id; this.renderAll();
      this.toast(T("Маркер добавлен · M — ещё один"));
    },

    marker(id = this.selMarker) { return this.p.markers.find((m) => m.id === id); },

    updateMarker(id, fn, opt = {}) { this.mutate((p) => { const m = p.markers.find((x) => x.id === id); if (m) fn(m); }, opt); },

    deleteMarker(id) {
      this.mutate((p) => { p.markers = p.markers.filter((m) => m.id !== id); }, { render: "none" });
      if (this.selMarker === id) this.selMarker = null;
      this.renderAll(); this.toast(T("Маркер удалён · Ctrl+Z — вернуть"));
    },

    /** Flags drawn on the ruler + a thin guide line through the tracks. */
    renderMarkers(inner, ppf) {
      const its = this.items();
      for (const m of this.p.markers) {
        const col = this.markerColor(m), x = m.frame * ppf;
        const segI = C.markerSegment(its, m.frame);
        const ico = m.effect === "prompt" ? "✦" : m.effect === "boost" ? "★" : "✎";
        const flag = h("div", { class: "h3z-mk" + (m.id === this.selMarker ? " sel" : "") + (m.effect !== "note" && segI < 0 ? " off" : ""), style: { left: x + "px", "--mc": col },
          title: T("{0} · {1}{2}{3}\nТяните — переместить, двойной клик — плейхед сюда", m.label || T("Маркер"), C.fmtTime(m.frame / C.FPS), m.effect !== "note" ? ` · ${EFFECTS.find((e) => e[0] === m.effect)[1]}` : "", m.text ? "\n" + m.text : "") },
          h("span", { class: "f" }, ico), ppf * 24 > 30 && m.label ? h("span", { class: "lb" }, m.label) : null);
        flag.addEventListener("pointerdown", (e) => this.markerDown(e, m.id));
        flag.addEventListener("dblclick", (e) => { e.stopPropagation(); this.seek(m.frame); });
        inner.append(flag, h("div", { class: "h3z-mk-line" + (m.id === this.selMarker ? " sel" : ""), style: { left: x + "px", "--mc": col } }));
      }
    },

    markerDown(e, id) {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const m0 = this.marker(id); if (!m0) return;
      const sx = e.clientX, f0 = m0.frame;
      let moved = false;
      const move = (ev) => {
        const dx = ev.clientX - sx;
        if (!moved && Math.abs(dx) < 3) return;
        const f = Math.max(0, Math.round(f0 + dx / this.ppf));
        if (!moved || this.marker(id)?.frame !== f) {
          this.updateMarker(id, (m) => { m.frame = f; }, { coalesce: "mk" + id, render: "none" });
          this.renderTimeline();
        }
        moved = true;
      };
      const up = () => {
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
        const was = this.selMarker; this.selMarker = id;
        if (moved || was !== id) { this.renderTimeline(); this.renderInspector(); this.renderHeader(); }
      };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    },

    markerCard() {
      const m = this.marker(); if (!m) return null;
      const id = m.id, its = this.items(), segI = C.markerSegment(its, m.frame);
      const card = h("div", { class: "h3z-card h3z-glass h3z-mcard", style: { "--mc": this.markerColor(m) } });
      const name = h("input", { class: "h3z-in", value: m.label, placeholder: T("Название маркера"), style: { padding: "6px 9px", fontWeight: 600 } });
      name.oninput = () => this.updateMarker(id, (x) => { x.label = name.value; }, { coalesce: "mkl" + id, render: "none" });
      name.onchange = () => this.renderTimeline();
      const colors = h("div", { class: "h3z-colors" }, MCOLORS.map((c, ci) => h("span", { class: (m.color % MCOLORS.length) === ci ? "on" : "", style: { background: c }, onclick: () => this.updateMarker(id, (x) => { x.color = ci; }) })));
      card.append(h("div", { class: "h3z-card-h" }, h("span", { class: "h3z-num mk" }, "◆"), name, colors,
        h("button", { class: "h3z-btn sm icon", title: T("Закрыть карточку маркера"), html: "✕", onclick: () => { this.selMarker = null; this.renderInspector(); this.renderTimeline(); } }),
        h("button", { class: "h3z-btn sm icon danger", title: T("Удалить маркер"), html: ICON.trash, onclick: () => this.deleteMarker(id) })));
      const t = C.fmtTime(m.frame / C.FPS);
      card.append(h("div", { class: "h3z-row" }, h("div", { class: "h3z-val", html: T("{0} <small>кадр {1}{2}</small>", t, m.frame, segI >= 0 ? T(" · отрезок {0}", segI + 1) : T(" · за концом ролика")) }),
        h("button", { class: "h3z-btn sm", style: { marginLeft: "auto" }, title: T("Переместить маркер на плейхед"), onclick: () => this.updateMarker(id, (x) => { x.frame = Math.round(this.playhead); }) }, T("К плейхеду")),
        h("button", { class: "h3z-btn sm", title: T("Плейхед к маркеру"), onclick: () => this.seek(m.frame) }, T("Перейти"))));
      card.append(h("div", null, h("div", { class: "h3z-lbl" }, T("Действие")), h("div", { class: "h3z-pills" },
        EFFECTS.map(([k, l, tip]) => h("div", { class: "h3z-pill" + (m.effect === k ? " on" : ""), title: tip, onclick: () => this.updateMarker(id, (x) => { x.effect = k; }) }, l)))));
      if (m.effect !== "boost") {
        const ta = h("textarea", { class: "h3z-ta sm", placeholder: m.effect === "prompt" ? T("Что происходит в этот момент: she turns to the camera and smiles…") : T("Заметка: что поправить, идея для монтажа…"), spellcheck: "false" });
        ta.value = m.text;
        ta.oninput = () => this.updateMarker(id, (x) => { x.text = ta.value; }, { coalesce: "mkt" + id, render: "light" });
        card.append(h("div", null, h("div", { class: "h3z-lbl" }, m.effect === "prompt" ? T("Событие") : T("Заметка"), m.effect === "prompt" ? h("em", null, T("лучше по-английски, как основной промпт")) : null,
          m.effect !== "prompt" ? null : this.peButton(() => { const mm = (this.p.markers || []).find((x) => x.id === id) || m;
            return { title: (mm.effect === "prompt" ? T("Событие маркера") : T("Заметка маркера")) + (mm.label ? ` «${mm.label}»` : ""), value: mm.text ?? "", placeholder: ta.placeholder,
              ctx: { kind: "marker", seg: C.markerSegment(this.items(), mm.frame) },
              apply: (t) => this.updateMarker(id, (x) => { x.text = t; }) }; })), ta));
      } else {
        const chars = this.p.assets.filter((a) => a.category === "character");
        const sel = h("select", { class: "h3z-sel" }, h("option", { value: "" }, T("Все персонажи отрезка")), chars.map((a) => h("option", { value: a.id, selected: m.asset === a.id }, a.name)));
        sel.onchange = () => this.updateMarker(id, (x) => { x.asset = sel.value; });
        card.append(this.field(T("Кого усилить"), sel));
      }
      if (m.effect !== "note") {
        const seg = segI >= 0 ? this.p.segments[segI] : null;
        let txt = T("Маркер за концом ролика — не действует.");
        if (seg) {
          const full = C.composePrompt(this.p, segI).split("\n").filter((l) => l.startsWith("At ") || l.startsWith("Strictly preserve"));
          txt = full.length ? T("Добавит в промпт отрезка {0}:\n{1}", segI + 1, full.join("\n")) : T("В отрезке {0} нет такого персонажа среди референсов — усиливать некого.", segI + 1);
        }
        card.append(h("div", { class: "h3z-final", style: { whiteSpace: "pre-wrap" } }, txt));
      }
      return card;
    },
  });
}

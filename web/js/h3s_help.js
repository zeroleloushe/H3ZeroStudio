import { T, lang } from "./h3s_i18n.js";
import { HELP_RU } from "./h3s_help_ru.js";
import { HELP_EN } from "./h3s_help_en.js";
// «Справка»: a beginner's manual inside the studio. The left panel holds search + table of contents, the
// content opens wide over the player and the right panel (collapsible sections, several columns on wide
// screens). Only features that exist in the code are described.
/** Help sections [id, title, html] in the UI language. */
export const HELP = () => (lang() === "en" ? HELP_EN : HELP_RU);

export function installHelp(Editor, { h }) {
  Object.assign(Editor.prototype, {
    /** Left panel: search + table of contents; the content opens over the player and the right panel. */
    renderHelp(L) {
      const $ = this.$;
      const q = h("input", { class: "h3z-in", type: "search", placeholder: T("Поиск по справке…"), value: this._helpQ || "", spellcheck: "false" });
      q.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") { q.value = ""; this.helpFilter(""); q.blur(); } });
      q.addEventListener("input", () => this.helpFilter(q.value));
      $.helpToc = h("div", { class: "h3z-helptoc" }, HELP().map(([id, title], k) => h("a", { class: "it", "data-id": id, onclick: () => this.helpGo(id) }, h("span", { class: "n" }, String(k + 1)), h("span", null, title))));
      const all = h("div", { class: "h3z-row" },
        h("button", { class: "h3z-btn sm", onclick: () => this.helpOpenAll(true) }, T("Развернуть все")),
        h("button", { class: "h3z-btn sm", onclick: () => this.helpOpenAll(false) }, T("Свернуть все")));
      L.append(h("div", { class: "h3z-ph" }, h("h3", null, T("Справка"))), h("div", { class: "h3z-scroll h3z-helpnav" }, q, all, $.helpToc));
      this.helpShow();
      if (this._helpQ) this.helpFilter(this._helpQ);
    },
    helpShow() {
      const $ = this.$;
      if ($.helpView && $.helpView.isConnected) return;
      $.helpSecs = {};
      const cols = h("div", { class: "h3z-helpcols" });
      for (const [id, title, html] of HELP()) {
        const body = h("div", { class: "hb", html });
        const d = h("details", { class: "h3z-helpsec", open: true, "data-id": id }, h("summary", null, title), body);
        $.helpSecs[id] = { d, body, html, text: (title + " " + body.textContent).toLowerCase() };
        cols.append(d);
      }
      $.helpView = h("div", { class: "h3z-helpview" },
        h("div", { class: "h3z-helphd" }, h("h2", null, T("Справка H3ZeroStudio")), h("span", { class: "h3z-note" }, T("Для новичков: что есть в студии и как этим пользоваться. Слева — оглавление и поиск.")), h("i", { class: "grow" }),
          h("button", { class: "h3z-btn sm icon", title: T("Закрыть справку"), onclick: () => { this.tool = "assets"; this.renderTools(); this.renderLeft(); } }, "✕")),
        h("div", { class: "h3z-helpscroll" }, cols));
      $.body.append($.helpView);
    },
    helpHide() { const $ = this.$; if ($.helpView) { $.helpView.remove(); $.helpView = null; } },
    helpGo(id) {
      const s = this.$.helpSecs?.[id]; if (!s) return;
      s.d.open = true; s.d.hidden = false;
      s.d.scrollIntoView({ block: "start", behavior: "smooth" });
      s.d.classList.remove("flash"); void s.d.offsetWidth; s.d.classList.add("flash");
      for (const a of this.$.helpToc?.querySelectorAll(".it") || []) a.classList.toggle("on", a.dataset.id === id);
    },
    helpOpenAll(open) { for (const s of Object.values(this.$.helpSecs || {})) s.d.open = open; },
    /** Search: sections without the words are hidden, matches are highlighted. */
    helpFilter(v) {
      this._helpQ = v;
      const words = String(v || "").toLowerCase().split(/\s+/).filter(Boolean).map((w) => (w.length > 5 && /[а-яё]$/.test(w) ? w.slice(0, -1) : w));   // «перекрытие» also finds «перекрытия»
      let n = 0;
      for (const [id, s] of Object.entries(this.$.helpSecs || {})) {
        s.body.innerHTML = s.html;
        const hit = words.every((w) => s.text.includes(w));
        s.d.hidden = !hit; if (hit) n++;
        if (hit && words.length) { s.d.open = true; this.helpMark(s.body, words); }
        const a = this.$.helpToc?.querySelector(`.it[data-id="${id}"]`); if (a) a.classList.toggle("dim", !hit);
      }
      let none = this.$.helpView?.querySelector(".h3z-helpnone");
      if (!n) { if (!none) { none = h("div", { class: "h3z-helpnone h3z-note" }, T("Ничего не найдено")); this.$.helpView?.querySelector(".h3z-helpscroll")?.prepend(none); } }
      else none?.remove();
    },
    helpMark(root, words) {
      const re = new RegExp("(" + words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const nodes = []; let x;
      while ((x = w.nextNode())) if (re.test(x.textContent)) nodes.push(x);
      for (const t of nodes) {
        const frag = document.createDocumentFragment();
        for (const part of t.textContent.split(re)) {
          if (!part) continue;
          if (words.some((w) => part.toLowerCase() === w.toLowerCase())) frag.append(h("mark", null, part)); else frag.append(document.createTextNode(part));
        }
        t.replaceWith(frag);
      }
    },
  });
}

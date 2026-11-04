import { T } from "./h3s_i18n.js";
import { uiLocalPoint, uiLocalDelta, uiLocalSize, uiLocalBounds } from "./h3s_ui_scale.js";
// Context menus (clips, audio clips, assets) and «Сохранить видео» (server-side export to a chosen folder).
// labels are text, never HTML: "<Video>" in a label used to become a real <video> element (a big blurred block)
// a leading glyph/emoji of a label («✎ Черновик», «🔒 Зафиксировать») goes into the icon slot, so all labels line up
const GLYPH = /^((?:\p{Extended_Pictographic}|\p{S}|\uFE0F|\u200D)+)\s+(.+)$/u;
export const splitGlyph = (icon, label) => { if (icon) return [icon, String(label ?? "")]; const g = GLYPH.exec(String(label ?? "")); return g ? [g[1], g[2]] : ["", String(label ?? "")]; };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function installMenus(Editor, { C, h, ICON }) {
  Object.assign(Editor.prototype, {
    /** Generic menu: entries = {icon, label, fn, dis, danger, hint, why, sub:[entries]} | "sep" | {el} | null. */
    /** Folder input + «📁 Обзор…' (native dialog on the ComfyUI computer). */
    folderPicker(input) {
      const btn = h("button", { class: "h3z-btn sm", type: "button", title: T("Выбрать папку в окне проводника (на компьютере, где запущен ComfyUI)"), html: T("<span>📁 Обзор…</span>") });
      btn.onclick = async () => {
        btn.disabled = true; btn.style.opacity = ".6";
        try { const p = await this.host.pickFolder(input.value); if (p) { input.value = p; input.dispatchEvent(new Event("change")); } }
        catch (e) { this.toast(String(e.message || e), true); }
        finally { btn.disabled = false; btn.style.opacity = ""; }
      };
      input.style.flex = "1 1 auto"; input.style.minWidth = "0";
      return h("div", { class: "h3z-row", style: { gap: "6px" } }, input, btn);
    },

    /** Dropdown anchored under a control; matches width; keyboard arrows/Enter/Esc. */
    openAnchoredMenu(anchor, title, entries, opts = {}) {
      const r = anchor.getBoundingClientRect();
      // Pass viewport coords into openMenu; it converts for the zoomed root.
      const fake = { clientX: r.left, clientY: r.bottom + 4, preventDefault() {}, stopPropagation() {} };
      const m = this.openMenu(fake, title, entries);
      const matchW = opts.matchWidth !== false;
      const localW = uiLocalSize(r.width);
      if (matchW) {
        const w = Math.max(localW, 160);
        m.style.minWidth = w + "px";
        m.style.width = w + "px";
      }
      const bounds = uiLocalBounds(this.root);
      const mr = m.getBoundingClientRect();
      const mw = uiLocalSize(mr.width), mh = uiLocalSize(mr.height);
      const below = uiLocalPoint(r.left, r.bottom + 4, this.root);
      const above = uiLocalPoint(r.left, r.top - 4, this.root);
      let left = below.x, top = below.y;
      if (left + mw > bounds.w - 8) left = Math.max(8, bounds.w - mw - 8);
      if (top + mh > bounds.h - 8) top = Math.max(8, above.y - mh);
      m.style.left = left + "px";
      m.style.top = top + "px";
      const items = [...m.querySelectorAll(":scope > .it:not(.dis)")];
      let idx = Math.max(0, items.findIndex((el) => el.classList.contains("on")));
      const focusItem = (i) => {
        items.forEach((el) => el.classList.remove("kb"));
        if (!items.length) return;
        idx = (i + items.length) % items.length;
        items[idx].classList.add("kb");
        items[idx].scrollIntoView({ block: "nearest" });
      };
      if (items.length) focusItem(idx);
      const onKey = (e) => {
        if (!this.$.menu) { window.removeEventListener("keydown", onKey, true); return; }
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); this.closeMenu(); return; }
        if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); focusItem(idx + 1); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); focusItem(idx - 1); return; }
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); items[idx]?.click(); }
      };
      this._menuKeyOff = onKey;
      window.addEventListener("keydown", onKey, true);
      return m;
    },

    /** Themed select: button.h3z-sel opening h3z-menu (groups via .hd, check via .on). */
    themedSelect({ value, options, groups, title, className, sm, disabled, emptyLabel, onChange } = {}) {
      const flat = groups
        ? groups.flatMap((g) => (g.options || []).map((o) => ({ ...o, _g: g.label })))
        : (options || []);
      const cur = flat.find((o) => String(o.value) === String(value));
      const lab = cur ? cur.label : (emptyLabel != null ? emptyLabel : (flat[0]?.label ?? "—"));
      const cls = "h3z-sel" + (sm ? " sm" : "") + (className ? " " + className : "");
      const btn = h("button", { type: "button", class: cls, title: title || "", disabled: disabled || undefined },
        h("span", { class: "h3z-dd-lab" }, lab));
      const open = (e) => {
        if (disabled) return;
        e?.preventDefault?.(); e?.stopPropagation?.();
        if (this.$.menu && this._ddAnchor === btn) { this.closeMenu(); return; }
        this._ddAnchor = btn;
        const entries = [];
        const pushOpt = (o) => entries.push({
          label: o.label, on: String(o.value) === String(value), dis: !!o.dis,
          fn: () => { onChange?.(o.value); },
        });
        if (groups) {
          for (const g of groups) {
            if (g.label) entries.push({ el: h("div", { class: "hd" }, g.label) });
            for (const o of (g.options || [])) pushOpt(o);
          }
        } else {
          for (const o of (options || [])) pushOpt(o);
        }
        this.openAnchoredMenu(btn, null, entries);
      };
      btn.onclick = open;
      btn.onkeydown = (e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") { e.preventDefault(); open(e); }
      };
      return btn;
    },

    openMenu(e, title, entries) {
      e.preventDefault(); e.stopPropagation();
      this.closeMenu();
      const build = (list, isSub = false) => {
        // a submenu lives inside its parent menu, whose backdrop-filter makes a nested one transparent → solid
        const m = h("div", { class: "h3z-menu" + (isSub ? " sub solid" : " h3z-glass") }, !isSub && title ? h("div", { class: "hd" }, title) : null);
        for (const it of list) {
          if (!it) continue;
          if (it === "sep") { m.append(h("div", { class: "sep" })); continue; }
          if (it.el) { m.append(it.el); continue; }
          if (it.why) { m.append(h("div", { class: "why" }, it.why)); continue; }
          const el = h("div", { class: "it" + (it.dis ? " dis" : "") + (it.danger ? " danger" : "") + (it.sub ? " has-sub" : "") + (it.on ? " on" : ""), title: it.title || null,
            html: (() => { const [ic, lb] = splitGlyph(it.icon ? it.icon : "", it.label); return `<i class="ic">${it.icon ? ic : esc(ic)}</i>` + `<span class="lb">${esc(lb)}</span>`; })() + (it.hint ? `<kbd>${esc(it.hint)}</kbd>` : "") + (it.sub ? "<b class='ar'>›</b>" : "") });
          if (it.sub) {
            let sm = null;
            el.addEventListener("pointerenter", () => {
              m.querySelectorAll(":scope > .h3z-menu.sub").forEach((x) => x.remove());
              if (it.dis) return;
              sm = build(it.sub, true); m.append(sm);
              const r = el.getBoundingClientRect(), mr = m.getBoundingClientRect(), sr = sm.getBoundingClientRect();
              const dRight = uiLocalDelta(r.right - mr.left, 0).x;
              const dTop = uiLocalDelta(0, r.top - mr.top).y;
              const sw = uiLocalSize(sr.width), sh = uiLocalSize(sr.height);
              const bounds = uiLocalBounds(this.root);
              const menuLocal = uiLocalPoint(mr.left, mr.top, this.root);
              const left = (uiLocalPoint(r.right, 0, this.root).x + sw + 8 > bounds.w) ? (-sw + 2) : (uiLocalSize(mr.width) - 2);
              sm.style.left = left + "px";
              sm.style.top = Math.min(dTop - 6, bounds.h - menuLocal.y - sh - 8) + "px";
            });
          } else if (!it.dis) el.onclick = (ev) => { ev.stopPropagation(); if (!it.keep) this.closeMenu(); it.fn?.(); };
          if (!it.sub) el.addEventListener("pointerenter", () => m.querySelectorAll(":scope > .h3z-menu.sub").forEach((x) => x.remove()));
          if (!it.title) el.addEventListener("pointerenter", () => {   // native tooltip only for a cut-off label
            const lb = el.querySelector(".lb");
            if (lb && lb.scrollWidth > lb.clientWidth + 1) el.title = String(it.label ?? ""); else el.removeAttribute("title");
          });
          m.append(el);
        }
        return m;
      };
      const m = this.$.menu = build(entries);
      this.root.append(m);
      const bounds = uiLocalBounds(this.root);
      const r = m.getBoundingClientRect();
      const mw = uiLocalSize(r.width), mh = uiLocalSize(r.height);
      const pt = uiLocalPoint(e.clientX, e.clientY, this.root);
      m.style.left = Math.min(pt.x, bounds.w - mw - 8) + "px";
      m.style.top = Math.max(8, Math.min(pt.y, bounds.h - mh - 8)) + "px";
      this._menuOff = (ev) => { if (!m.contains(ev.target)) this.closeMenu(); };
      setTimeout(() => window.addEventListener("pointerdown", this._menuOff, true), 0);
      return m;
    },

    /** Inline slider row for a menu (applies live). */
    menuSlider(label, val, min, max, step, fmt, onInput) {
      const r = h("input", { class: "h3z-range", type: "range", min, max, step, value: val });
      const v = h("span", { class: "v" }, fmt(val));
      const sp = () => r.style.setProperty("--p", ((r.value - min) / (max - min) * 100) + "%"); sp();
      r.oninput = () => { sp(); v.textContent = fmt(Number(r.value)); onInput(Number(r.value)); };
      r.addEventListener("pointerdown", (e) => e.stopPropagation());
      return { el: h("div", { class: "ctl" }, h("span", { class: "l" }, label), r, v) };
    },

    // ---------------------------------------------------------------- clip menu
    clipMenu(e, i) {
      if (this.sel !== i) { this.sel = i; this.renderInspector(); this.renderTimeline(); this.renderPreview(); }
      const s = this.seg(i), stale = this.isStale(i), busy = !!this.run.active, st = this.segGenState(i);
      const f = Math.round(this.frameAt(e.clientX)), it = this.items()[i];
      const takes = (s.takes || []).map((t, k) => ({ label: T("Дубль {0} · сид {1}", k + 1, t.seed ?? "?") + (t.created ? ` · ${new Date(t.created * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : ""),
        on: t.id === s.active_take, fn: () => this.selectTake(i, t.id), dis: busy || !!s.freeze }));
      this.openMenu(e, s.name || T("Отрезок {0}", i + 1), [
        { icon: ICON.spark, label: stale ? T("Сгенерировать") : T("Сгенерировать (уже готов)"), fn: () => this.genSegment(i), dis: !st.ok || !stale },
        { icon: ICON.dice, label: T("Ещё дубль (новый сид)"), fn: () => this.newTake(i), dis: !st.ok },
        stale && s.result && this.restoreTake?.(i) ? { label: T("↺ Восстановить входы дубля"), title: T("Вернуть всё, что изменилось с этого дубля (один шаг отмены) — без перегенерации"), fn: () => this.restoreAll(i), dis: busy } : null,
        stale && s.result && this.restoreTake?.(i) ? { label: T("↺ Восстановить… (выбрать поля)"), fn: () => this.openRestorePanel(i) } : null,
        s.gap ? { label: T("✕ Убрать промежуток перед отрезком"), fn: () => this.removeGap(i) } : null,
        !st.ok && !busy && !s.freeze ? { why: st.why } : null,
        takes.length > 1 ? { label: T("Дубли ({0}/{1})", this.takeIndex(s, s.active_take) + 1, takes.length), sub: takes } : null,
        { icon: this.constructor.VIEWER_ICONS?.view || "", label: T("Удобный просмотр"), title: T("Этот клип во весь экран: масштаб до ×4, покадрово, скорость, петля"), fn: () => this.viewerForClip(i), dis: !this.viewerClipSpec(i) },
        { label: T("↻ Перегенерировать участок…"), title: T("Выделить часть ролика вокруг этого места и пересоздать только её (контекст до и после сохраняется). Основной способ — кнопка «✂ Участок» над таймлайном"), fn: () => this.regionAt(f), dis: busy || !s.result?.video && !C.isFootage(s) },
        s.freeze ? { label: T("🔓 Разморозить"), fn: () => this.unfreezeSeg(i) } : { label: T("🔒 Зафиксировать"), fn: () => this.freezeSeg(i), dis: busy || stale },
        ...this.stageMenuEntries(i),
        ...this.finalMenuEntries(i),
        ...this.upMenuEntries(i),
        "sep",
        { label: T("💾 Сохранить фрагмент (этот отрезок)…"), fn: () => this.saveDialog({ mode: "clip", i }), dis: !s.result?.video },
        { label: T("▶ Открыть в плеере"), fn: () => { this.sel = i; this.pvMode = "segment"; this.playhead = it.start + (i ? it.overlap : 0); this.renderAll(); this.scrollToPlayhead?.(); } },
        "sep",
        s.result || (s.takes || []).length ? { label: T("ℹ Параметры генерации"), title: T("Промпт, модель, LoRA, сид, шаги, апскейл — как было при генерации"), fn: () => this.openGenMeta({ segIndex: i }) } : null,
        s.result || (s.takes || []).length ? { label: T("↺ Повторить"), title: T("Восстановить промпт, референсы, пресет и настройки этого дубля"), fn: () => this.repeatFromMeta(this.genMetaOf(i)) } : null,
        { icon: ICON.copy, label: T("Копировать промпт и референсы"), fn: () => this.copySegSpec(i) },
        { label: T("📋 Вставить промпт и референсы"), fn: () => this.pasteSegSpec(i), dis: !this._segClip, title: this._segClip ? T("Из «{0}»", this._segClip.from) : T("Сначала скопируйте у другого отрезка") },
        "sep",
        { icon: ICON.plus, label: T("Продлить отсюда"), title: T("Новый отрезок сразу после этого, продолжает его"), fn: () => this.insertAfter(i, "extend") },
        { label: T("✂ Новая сцена после"), title: T("Новый отрезок после этого — монтажная склейка, без продолжения"), fn: () => this.insertAfter(i, "cut") },
        i > 0 && s.link === "extend" && !C.isFootage(s) ? { label: T("⟷ Перекрытие ({0} кадр.)", it.overlap || 0), dis: !!s.freeze, sub: [{ label: T("По умолчанию (из настроек)"), on: (s.overlap_blocks ?? -1) < 0, fn: () => this.setSegOverlap(i, -1) }]
          .concat(Array.from({ length: C.MAX_OVERLAP_BLOCKS + 1 }, (_, o) => ({ label: this.ovLabel(o), on: s.overlap_blocks === o, fn: () => this.setSegOverlap(i, o) }))) } : null,
        i > 0 ? { label: s.link === "cut" ? T("⟶ Сделать продолжением предыдущего") : T("✂ Сделать новой сценой"), fn: () => this.mutate((p) => { p.segments[i].link = s.link === "cut" ? "extend" : "cut"; }), dis: !!s.freeze } : null,
        { icon: ICON.cut, label: T("Разрезать здесь"), fn: () => { this.playhead = f; this.split(); }, hint: "S", dis: !!s.freeze },
        { icon: ICON.copy, label: T("Дублировать"), fn: () => this.duplicate(), hint: "D" },
        { label: T("◆ Маркер здесь"), fn: () => this.addMarker(f), hint: "M" },
        (s.takes || []).length > 1 ? { label: T("🧹 Удалить другие дубли"), fn: () => this.clearTakes(i), dis: busy } : null,
        "sep",
        { icon: ICON.trash, label: T("Удалить"), fn: () => this.deleteSeg(i), danger: true, hint: "Del" },
      ]);
    },

    copySegSpec(i) {
      const s = this.seg(i);
      this._segClip = { prompt: s.prompt, refs: [...s.refs], overrides: JSON.parse(JSON.stringify(s.overrides || {})), from: s.name || T("Отрезок {0}", i + 1) };
      this.toast(T("Промпт и референсы скопированы · правый клик по другому отрезку → «Вставить»"));
    },
    pasteSegSpec(i) {
      const c = this._segClip; if (!c) return;
      if (this.seg(i)?.freeze) return this.toast(T("Отрезок зафиксирован — разморозьте, чтобы менять"), true);
      this.mutate((p) => { const s = p.segments[i]; s.prompt = c.prompt; s.refs = [...c.refs]; s.overrides = JSON.parse(JSON.stringify(c.overrides)); });
      this.toast(T("Вставлено из «{0}» в отрезок {1}", c.from, i + 1));
    },
    insertAfter(i, link) {
      const base = this.seg(i), s = this.newSegment(base);
      s.link = link; if (link === "cut") s.refs = base.refs.filter((r) => this.p.assets.find((a) => a.id === r)?.category === "character");
      this.mutate((p) => { p.segments.splice(i + 1, 0, s); }, { render: "none" });
      this.sel = i + 1; this.pvMode = "segment";
      const it = this.items()[this.sel]; this.playhead = it.start + it.overlap;
      this.renderAll(); this.scrollToPlayhead?.();
      if (!this.pastMarkerHint()) this.toast(link === "cut" ? T("Новая сцена вставлена") : T("Отрезок вставлен — продолжит предыдущий"));
    },
    clearTakes(i) {
      const s = this.seg(i); if (!s) return;
      if (!confirm(T("Удалить {0} дубл(я/ей) отрезка {1}, кроме текущего?", s.takes.length - 1, i + 1))) return;
      this.mutate((p) => { const x = p.segments[i]; x.takes = x.takes.filter((t) => t.id === x.active_take).slice(-1); });
      this.toast(T("Остался только текущий дубль"));
    },

    // ---------------------------------------------------------------- audio clip menu
    audioMenu(e, id) {
      const c = this.audioClipById(id); if (!c) return;
      const a = this.audioAsset(c.asset), sp = this.clipSpan(c), music = (c.lane | 0) >= C.MUSIC_LANE;
      const set = (fn, co) => this.mutate((p) => { const x = p.audio.clips.find((k) => k.id === id); if (x) fn(x); }, { coalesce: co, render: "none" });
      const relayout = () => { this.renderTimeline(); this.audioPanelRefresh(); };
      const t = this.frameAt(e.clientX) / C.FPS;
      this.openMenu(e, (music ? "♫ " : "🔒 ") + (a?.name || c.asset), [
        this.menuSlider(T("Громкость"), c.volume ?? 1, 0, 2, 0.05, (v) => Math.round(v * 100) + "%", (v) => { set((x) => { x.volume = v; }, "avol" + id); relayout(); }),
        this.menuSlider(T("Фейд in"), c.fade_in || 0, 0, Math.min(10, sp.len), 0.1, (v) => v.toFixed(1) + T(" с"), (v) => { set((x) => { x.fade_in = v; }, "afi" + id); relayout(); }),
        this.menuSlider(T("Фейд out"), c.fade_out || 0, 0, Math.min(10, sp.len), 0.1, (v) => v.toFixed(1) + T(" с"), (v) => { set((x) => { x.fade_out = v; }, "afo" + id); relayout(); }),
        !music ? { why: T("Громкость и фейды на дорожках 1–2 меняют фиксируемый звук (отрезки под клипом перегенерируются)") } : null,
        "sep",
        { label: T("Дорожка"), sub: [[0, T("🔒 Дорожка 1 (фиксация)")], [1, T("🔒 Дорожка 2 (фиксация)")], [2, T("♫ Музыка (поверх видео)")]].map(([l, lb]) => ({ label: lb, on: c.lane === l, fn: () => { this.ensureAudioLane(l); this.mutate((p) => { p.audio.clips.find((k) => k.id === id).lane = l; }); } })) },
        { icon: ICON.cut, label: T("Разрезать здесь"), hint: "S", fn: () => { this.playhead = Math.round(t * C.FPS); this.selAudio = id; this.splitAudio(); } },
        { icon: ICON.copy, label: T("Дублировать"), fn: () => { const nid = C.newId("ac"); this.mutate((p) => { p.audio.clips.push({ ...JSON.parse(JSON.stringify(c)), id: nid, start: Math.round((sp.end) * 1000) / 1000 }); p.audio.clips.sort((x, y) => x.start - y.start || x.lane - y.lane); }); this.selAudio = nid; } },
        { label: T("✎ Посмотреть / изменить файл…"), fn: () => this.openAssetEditor(c.asset), dis: c.asset === C.AUDIO_INPUT_ID },
        { label: T("⚙ Параметры клипа"), fn: () => this.selectAudio(id) },
        "sep",
        { icon: ICON.trash, label: T("Удалить"), hint: "Del", danger: true, fn: () => this.deleteAudio(id) },
      ]);
    },

    // ---------------------------------------------------------------- asset menu
    assetMenu(e, a) {
      const kind = a.category === "video" ? "video" : a.category === "audio" ? "audio" : "image";
      const seg = this.seg(), inSeg = !!seg?.refs.includes(a.id);
      const pics = ["character", "location", "other"];
      this.openMenu(e, a.name, [
        { label: T("✎ Посмотреть / изменить…"), title: kind === "image" ? T("Обрезка, поворот, зеркало, уменьшение") : kind === "audio" ? T("Обрезка, громкость, нормализация, фейды") : T("Обрезка по времени, уменьшение, кадрирование, кадр/звук в ассеты"), fn: () => this.openAssetEditor(a.id), dis: !!a.virtual, hint: T("2×клик") },
        seg ? { icon: inSeg ? ICON.minus || "" : ICON.plus, label: inSeg ? T("Убрать из референсов отрезка {0}", this.sel + 1) : T("В референсы отрезка {0}", this.sel + 1) + (kind === "video" ? ` (<Video ${C.videoRefs(this.p, seg).length + 1}>)` : kind === "audio" ? ` (<Audio ${C.audioRefs(this.p, seg).length + 1}>)` : " (<Picture>)"),
          title: (seg.name ? `«${seg.name}»: ` : "") + (inSeg ? T("убрать этот ассет из референсов выбранного отрезка") : T("добавить ассет в референсы выбранного отрезка")), fn: () => this.toggleRef(this.sel, a.id) } : null,
        kind === "video" ? { icon: ICON.film || "", label: T("На таймлайн (футаж)"), fn: () => this.addFootage(a.id) } : null,
        kind === "audio" ? { label: T("🔒 На аудиодорожку (фиксация)"), fn: () => this.addAudioClip(a.id, this.playhead / C.FPS, 0) } : null,
        kind === "audio" ? { label: T("♫ На дорожку музыки"), fn: () => this.addAudioClip(a.id, this.playhead / C.FPS, C.MUSIC_LANE) } : null,
        kind === "image" ? { label: T("Категория"), sub: pics.map((k) => ({ label: { character: T("Персонаж"), location: T("Локация"), other: T("Другое") }[k], on: a.category === k, fn: () => this.mutate((p) => { p.assets.find((x) => x.id === a.id).category = k; }) })) } : null,
        "sep",
        a.orig ? { label: T("↺ Вернуть оригинал"), fn: () => this.mutate((p) => { const x = p.assets.find((y) => y.id === a.id); x.file = x.orig.filename; x.subfolder = x.orig.subfolder; x.type = x.orig.type; x.orig = null; x.edit = null; }) } : null,
        { label: T("Переименовать…"), fn: () => { const n = prompt(T("Имя ассета"), a.name); if (n && n.trim()) this.mutate((p) => { p.assets.find((x) => x.id === a.id).name = n.trim(); }); }, dis: !!a.virtual },
        { icon: ICON.trash, label: T("Убрать из проекта"), danger: true, dis: !!a.virtual, fn: () => {
          if (kind === "video") return this.removeVideoAsset(a.id);
          this.mutate((p) => { p.assets = p.assets.filter((x) => x.id !== a.id); p.audio.clips = p.audio.clips.filter((c) => c.asset !== a.id); for (const s of p.segments) s.refs = s.refs.filter((r) => r !== a.id); });
        } },
      ]);
    },

    // ---------------------------------------------------------------- «Сохранить видео»
    /** Newest gallery final for this project (kind=final with a video), or null. */
    async latestGalleryFinal() {
      try {
        const items = await this.host.get("/h3zero/gallery", { id: this.p.id });
        const list = Array.isArray(items) ? items : [];
        return list.find((e) => e && e.kind === "final" && e.video) || null;
      } catch (_) { return null; }
    },
    /** opt.mode: "all" | "range" | "clip" (opt.i). */
    saveDialog(opt = {}) {
      this.closeSaveDialog();
      const full = this.p.result?.full, fullOk = this.fullCurrent();
      let mode = opt.mode || (fullOk ? "all" : this.seg()?.result?.video ? "clip" : "all");
      const its = this.items();
      let ci = opt.i ?? Math.max(0, this.sel);
      let galleryFinal = null;   // filled async: last stitched timeline mp4 when result.full is stale
      const ld = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } };
      const folder = h("input", { class: "h3z-in", value: ld("h3zs.exportDir", ""), placeholder: T("по умолчанию: ComfyUI/output/h3zerostudio/export"), title: T("Папка на компьютере, где запущен ComfyUI (например D:\\Видео\\H3). Относительный путь — внутри ComfyUI/output") });
      const d = new Date(), z = (x) => String(x).padStart(2, "0");   // local time (toISOString would be UTC)
      const stamp = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}-${z(d.getMinutes())}`;
      const name = h("input", { class: "h3z-in", value: `${(this.p.name || "h3").replace(/[\\/:*?"<>|]/g, "_")}_${stamp}` });
      const vEnd = this.totalFrames();
      const fIn = h("input", { class: "h3z-in sm", type: "number", step: "0.1", min: 0, value: ((this._rangeIn ?? 0) / C.FPS).toFixed(2) });
      const fOut = h("input", { class: "h3z-in sm", type: "number", step: "0.1", min: 0, value: ((this._rangeOut ?? vEnd) / C.FPS).toFixed(2) });
      const phBtn = (inp, title) => h("button", { class: "h3z-btn sm", title, onclick: () => { inp.value = (this.playhead / C.FPS).toFixed(2); upd(); } }, T("⌖ плейхед"));
      const music = C.musicClips(this.p).length > 0 || (this.p.audio.video_volume ?? 1) !== 1;
      const mixT = this.toggle(T("Микс: музыка + звук видео ") + Math.round((this.p.audio.video_volume ?? 1) * 100) + "%", this._exportMix !== false, (v) => { this._exportMix = v; mixT.classList.toggle("on", v); }, T("Дорожка «Музыка» и громкость звука видео применяются к файлу"));
      mixT.onclick = () => { this._exportMix = this._exportMix === false; mixT.classList.toggle("on", this._exportMix !== false); };
      const info = h("div", { class: "h3z-note" });
      const pills = h("div", { class: "h3z-pills" });
      const segSel = h("select", { class: "h3z-sel sm" }, its.map((it, k) => h("option", { value: k, selected: k === ci }, `${k + 1}. ${this.p.segments[k].name || T("Отрезок ") + (k + 1)}`)));
      segSel.onchange = () => { ci = Number(segSel.value); upd(); };
      const rowR = h("div", { class: "h3z-row" }, h("span", null, T("с")), fIn, phBtn(fIn, T("Начало = плейхед")), h("span", null, T("по")), fOut, phBtn(fOut, T("Конец = плейхед")));
      const rowC = h("div", { class: "h3z-row" }, segSel);
      const go = h("button", { class: "h3z-btn primary", html: (ICON.save || "💾") + T("<span>Сохранить</span>") });
      /** Prefer the live current final; else the newest gallery final; else the on-project full file. */
      const timelineSource = () => {
        if (fullOk && full?.video) return { video: full.video, frames: full.frames || 0, via: "current" };
        if (galleryFinal?.video) return { video: galleryFinal.video, frames: galleryFinal.frames || full?.frames || 0, via: "gallery" };
        if (full?.video) return { video: full.video, frames: full.frames || 0, via: "stored" };
        return null;
      };
      const src = () => {
        if (mode === "clip") {
          const s = this.p.segments[ci], it = its[ci];
          const tl = timelineSource();
          if (tl && fullOk && it) { const ov = ci ? it.overlap : 0; return { source: tl.video, range: [it.start + ov, Math.min(it.end, vEnd)], tl: 0, why: "", via: tl.via }; }
          if (s?.result?.video && !this.isStale(ci)) return { source: s.result.video, range: null, tl: it?.start || 0, why: "" };
          return { why: T("Отрезок не сгенерирован (или изменён) — сначала «Сгенерировать»") };
        }
        const tl = timelineSource();
        if (!tl) return { why: T("Ролик ещё не сгенерирован") };
        if (mode === "all") return { source: tl.video, range: null, tl: 0, why: "", via: tl.via, frames: tl.frames };
        const a = Math.round(Number(fIn.value) * C.FPS), b = Math.round(Number(fOut.value) * C.FPS);
        if (!(b > a)) return { why: T("Конец фрагмента должен быть позже начала") };
        return { source: tl.video, range: [Math.max(0, a), Math.min(b, tl.frames || b)], tl: 0, why: "", via: tl.via };
      };
      const upd = () => {
        pills.innerHTML = "";
        for (const [k, l] of [["all", T("Весь ролик")], ["range", T("Фрагмент (с – по)")], ["clip", T("Отрезок")]]) pills.append(h("div", { class: "h3z-pill" + (mode === k ? " on" : ""), onclick: () => { mode = k; upd(); } }, l));
        rowR.style.display = mode === "range" ? "" : "none"; rowC.style.display = mode === "clip" ? "" : "none";
        const x = src();
        go.disabled = !!x.why;
        const len = x.range ? (x.range[1] - x.range[0]) / C.FPS : mode === "all" ? (x.frames || full?.frames || galleryFinal?.frames || 0) / C.FPS : (its[ci]?.frames || 0) / C.FPS;
        const note = x.via === "gallery" ? T(" · из галереи (последний итог; текущий ролик помечен устаревшим)") : x.via === "stored" ? T(" · прошлый итог проекта (таймлайн изменился)") : "";
        info.textContent = x.why || T("≈ {0} с · mp4 H.264 + AAC · файл не перезаписывается (добавится _2, _3…)", len.toFixed(2)) + note;
        info.classList.toggle("err", !!x.why);
      };
      go.onclick = async () => {
        const x = src(); if (x.why) return;
        go.disabled = true; go.classList.add("busy");
        try { localStorage.setItem("h3zs.exportDir", folder.value.trim()); } catch (e) {}
        try {
          const body = { source: x.source, range: x.range, folder: folder.value.trim(),
            name: name.value.trim() + (mode === "clip" ? T("_отрезок{0}", ci + 1) : mode === "range" ? `_${fIn.value}-${fOut.value}s` : ""),
            timeline_start: x.tl };
          if (music && this._exportMix !== false) body.project = this.p;
          else body.project = this.p.id;
          const r = await this.host.exportVideo(body);
          this.lastExport = r;
          this.toast(T("Сохранено: {0} ({1} с)", r.path, r.seconds.toFixed(2)));
          info.textContent = `✓ ${r.path}`; info.classList.remove("err");
          const cp = h("button", { class: "h3z-btn sm", onclick: () => { navigator.clipboard?.writeText(r.path); this.toast(T("Путь скопирован")); } }, T("Скопировать путь"));
          info.append(" ", cp);
        } catch (e) { this.toast(T("Не удалось сохранить: ") + (e.message || e), true); info.textContent = T("Ошибка: ") + (e.message || e); info.classList.add("err"); }
        finally { go.disabled = false; go.classList.remove("busy"); }
      };
      fIn.onchange = upd; fOut.onchange = upd;
      const box = h("div", { class: "h3z-save h3z-glass" },
        h("div", { class: "hd" }, h("b", null, T("💾 Сохранить видео")), h("i", { class: "grow" }), h("button", { class: "h3z-btn sm icon", onclick: () => this.closeSaveDialog() }, "✕")),
        this.field(T("Что сохранить"), pills), rowR, rowC,
        this.field(T("Папка"), this.folderPicker(folder)), this.field(T("Имя файла (.mp4)"), name),
        music ? mixT : null, info,
        h("div", { class: "h3z-row" }, h("i", { class: "grow" }), h("button", { class: "h3z-btn", onclick: () => this.closeSaveDialog() }, T("Закрыть")), go));
      if (this._exportMix !== false) mixT.classList.add("on");
      const modal = this.$.saveModal = h("div", { class: "h3z-modal" }, box);
      modal.addEventListener("pointerdown", (e) => { if (e.target === modal) this.closeSaveDialog(); });
      box.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") this.closeSaveDialog(); if (e.key === "Enter" && !go.disabled) go.click(); });
      this.root.append(modal);
      upd();
      name.focus(); name.select();
      if (!fullOk) {
        this.latestGalleryFinal().then((e) => {
          if (!this.$?.saveModal) return;
          galleryFinal = e;
          upd();
        });
      }
    },
    closeSaveDialog() { if (this.$?.saveModal) { this.$.saveModal.remove(); this.$.saveModal = null; this.focusSink?.(); } },
  });
}

// H3ZeroStudio: takes (generated versions) per segment + single-segment regeneration.
// A take = one generated result of a segment + the snapshot of the segment fields that produced it.
// Choosing a take restores that snapshot, so the backend cache key matches again: the take's latent is
// reused in the final stitch and as the continuity source of the next segment (no re-sampling).
const SNAP_KEYS = ["prompt", "refs", "frames", "overrides", "link", "upscale"];
const clone = (o) => JSON.parse(JSON.stringify(o));

export function installTakes(Editor, { C, h, ICON }) {
  Object.assign(Editor.prototype, {
    snapOf(s) { const o = {}; for (const k of SNAP_KEYS) o[k] = clone(s[k]); return o; },

    /** Store a backend result as a take of segment i and make it active (no undo entry: results are not edits). */
    recordTake(i, res, sig) {
      const s = this.p.segments[i]; if (!s || !res) return;
      s.takes = Array.isArray(s.takes) ? s.takes : [];
      let t = s.takes.find((x) => x.key === res.key);
      const result = { ...res };
      if (!t) {
        // + the project inputs and the previous clip's key it was made with («↺ Восстановить» puts them back)
        const k = C.RUN_KINDS.includes(res.kind) ? res.kind : C.runKind(this.p.settings);
        const psnap = { settings: clone(this.p.settings), prev: i > 0 ? (this.pendingSigs?.[i - 1] ?? C.segmentSigs(this.p, k)[i - 1]) : null };
        t = { id: C.newId("t"), key: res.key, sig, seed: res.seed, created: res.created || Math.floor(Date.now() / 1000), snap: this.snapOf(s), psnap, result };
        s.takes.push(t);
        if (s.takes.length > C.MAX_TAKES) s.takes.splice(0, s.takes.length - C.MAX_TAKES);
      } else { t.result = result; t.sig = sig; if (res.seed !== undefined) t.seed = res.seed; }
      s.active_take = t.id;
      s.result = { ...result, sig };
    },

    takeIndex(s, id) { return (s.takes || []).findIndex((t) => t.id === id); },

    selectTake(i, id, quiet = false) {
      const s = this.seg(i); if (!s) return;
      const t = (s.takes || []).find((x) => x.id === id); if (!t) return;
      this.mutate((p) => {
        const seg = p.segments[i];
        Object.assign(seg, clone(t.snap || {}));
        if (!t.snap || !("upscale" in t.snap)) seg.upscale = null;   // takes from before «Апскейл отрезка»
        seg.active_take = t.id;
        seg.result = { ...clone(t.result), sig: t.sig };
        this.relinkDownstream(p, i);
      }, { render: "none" });
      this.renderAll();
      if (!quiet) this.toast(`Дубль ${this.takeIndex(this.seg(i), id) + 1} выбран` + (this.p.segments.slice(i + 1).some((x, k) => this.isStale(i + 1 + k)) ? " · следующие отрезки изменены" : ""));
    },

    /** After switching a take upstream, re-attach downstream takes generated from exactly this chain. */
    relinkDownstream(p, from) {
      const sigs = C.segmentSigs(C.normalizeProject(p));
      for (let j = from + 1; j < p.segments.length; j++) {
        const s = p.segments[j];
        if (s.result?.sig === sigs[j]) continue;
        const t = (s.takes || []).find((x) => x.sig === sigs[j]);
        if (t) { s.active_take = t.id; s.result = { ...clone(t.result), sig: t.sig }; }
      }
    },

    cycleTake(i, d = 1) {
      const s = this.seg(i); if (!s?.takes?.length) return;
      const k = this.takeIndex(s, s.active_take);
      const n = s.takes.length, nx = ((k < 0 ? 0 : k + d) % n + n) % n;
      this.selectTake(i, s.takes[nx].id);
    },

    deleteTake(i, id) {
      this.mutate((p) => { const s = p.segments[i]; s.takes = s.takes.filter((t) => t.id !== id); }, { render: "none" });
      this.renderInspector(); this.renderTimeline();
      this.toast("Дубль убран из списка (файлы остаются в кэше)");
    },

    /** Out of date = the take no longer matches the settings of ITS pass kind (a valid draft stays a
     *  current draft in a final project, and the other way round). Takes of older versions: the project kind. */
    isStale(i) {
      const s = this.seg(i); if (!s?.result) return true;
      if (!s.result.sig) return false;
      const k = C.RUN_KINDS.includes(s.result.kind) ? s.result.kind : C.runKind(this.p.settings);
      return s.result.sig !== (k === C.runKind(this.p.settings) ? this.sigs() : C.segmentSigs(this.p, k))[i];
    },

    /** Can segment i be generated on its own? Continuations need a ready (or chosen) take of the previous
     *  segment, as its tail is the start of this one. The first segment and new scenes are always allowed. */
    segGenState(i) {
      const it = this.items()[i];
      if (!it) return { ok: false, why: "Нет такого отрезка" };
      if (this.run.active) return { ok: false, why: "Идёт генерация" };
      if (this.seg(i)?.freeze) return { ok: false, why: "Отрезок зафиксирован — разморозьте, чтобы перегенерировать" };
      if (i >= this.genCount()) return { ok: false, marker: true, why: "Отрезок за маркером конца ролика («Длина: Фикс») — не генерируется. Сдвиньте маркер или нажмите «Маркер → конец»" };
      const pr = this.seg(i - 1);
      // footage used as is is encoded on the fly (no sampling) and a frozen segment is final: both are ready tails
      if (C.usesContinuity(this.p, i) && !(pr && (C.isFootage(pr) || pr.freeze)) && this.isStale(i - 1))
        return { ok: false, why: `Продление: сначала сгенерируйте отрезок ${i} или выберите его дубль — нужен его хвост. Или переключите этот отрезок на «Новая сцена»` };
      return { ok: true, why: "" };
    },

    /** «Сгенерировать»: only this segment, current seed (needs to be out of date). */
    genSegment(i) {
      const st = this.segGenState(i); if (!st.ok) { this.toast(st.why, true); return; }
      if (!this.isStale(i)) { this.toast("Отрезок уже готов. «Ещё дубль» — вариант с новым сидом"); return; }
      this.regenerate(i, { newSeed: false, downstream: false });
    },

    /** «Ещё дубль»: only this segment with a new seed; the previous takes stay. */
    newTake(i) {
      const st = this.segGenState(i); if (!st.ok) { this.toast(st.why, true); return; }
      this.regenerate(i, { newSeed: true, downstream: false });
    },

    /** «Зафиксировать»: the current take becomes immutable (latent + previews copied to <project>/frozen/). */
    async freezeSeg(i) {
      const s = this.seg(i); if (!s) return;
      if (s.freeze) return;
      if (this.isStale(i) || !s.result?.key) { this.toast("Сначала сгенерируйте отрезок или выберите готовый дубль", true); return; }
      try {
        const r = await this.host.freeze(this.p.id, s.result.key);
        const sig = this.sigs()[i];
        const up = !!(s.result?.upscale && s.result?.base_key);   // a frozen upscale: never upscaled again
        this.mutate((p) => { p.segments[i].freeze = { ...r, sig, ...(up ? { up: true } : {}) }; }, { render: "none" });
        this.registerFrozenAsset(i, r); this.renderAll();
        this.toast(`Отрезок ${i + 1} зафиксирован: он больше не перегенерируется и переживает «Очистить кэш»`);
      } catch (e) { this.toast("Не удалось зафиксировать: " + (e.message || e), true); }
    },

    unfreezeSeg(i) {
      if (!this.seg(i)?.freeze) return;
      this.mutate((p) => { p.segments[i].freeze = null; }, { render: "all" });
      this.toast(`Отрезок ${i + 1} разморожен: снова зависит от промпта и референсов`);
    },

    /** Regenerate one segment: new seed (new take) or only what changed; optionally everything after it. */
    regenerate(i, { newSeed = null, downstream = this.regenDownstream } = {}) {
      const s = this.seg(i); if (!s) return;
      const fresh = !this.isStale(i);
      if (newSeed === null) newSeed = fresh;
      if (newSeed) this.mutate((p) => { p.segments[i].overrides.seed = Math.floor(Math.random() * 2147483647); }, { render: "none" });
      this.sel = i;
      this.generate({ upto: downstream ? -1 : i, only: downstream ? -1 : i });
    },

    takesBlock(i) {
      const s = this.seg(i), takes = s.takes || [];
      const stale = this.isStale(i);
      const wrap = h("div", { class: "h3z-takes" });
      const head = h("div", { class: "h3z-lbl" }, "Дубли", h("em", null, takes.length ? `${takes.length} / ${C.MAX_TAKES} · клик — выбрать` : "появятся после генерации"));
      const row = h("div", { class: "h3z-take-row" });
      takes.forEach((t, k) => {
        const on = t.id === s.active_take && !!s.result && s.result.key === t.key;
        const when = t.created ? new Date(t.created * 1000).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
        const el = h("div", { class: "h3z-take" + (on ? " on" : ""), title: `Дубль ${k + 1} · сид ${t.seed ?? "?"}${when ? " · " + when : ""}\n${on ? "Используется в ролике" : "Клик — использовать этот дубль"}` },
          t.result?.poster ? h("img", { src: this.host.url(t.result.poster), draggable: "false" }) : h("div", { class: "ph" }),
          h("span", { class: "k" }, k + 1), h("span", { class: "sd" }, `сид ${t.seed ?? "?"}`));
        el.onclick = () => { if (!on) this.selectTake(i, t.id); else { this.pvMode = "segment"; this.renderPreview(); } };
        if (!on) { const x = h("span", { class: "x", title: "Убрать дубль из списка" }, "✕"); x.onclick = (e) => { e.stopPropagation(); this.deleteTake(i, t.id); }; el.append(x); }
        row.append(el);
      });
      const st = this.segGenState(i);
      const btnGen = h("button", { class: "h3z-btn sm primary", disabled: !st.ok || !stale, html: ICON.spark + "<span>Сгенерировать</span>",
        title: !st.ok ? st.why : stale ? "Сгенерировать только этот отрезок (текущий сид)" : "Отрезок уже готов. «Ещё дубль» — вариант с новым сидом",
        onclick: () => this.genSegment(i) });
      const btnNew = h("button", { class: "h3z-btn sm", disabled: !st.ok, html: ICON.dice + "<span>Ещё дубль</span>",
        title: st.ok ? "Сгенерировать этот отрезок ещё раз с новым сидом. Прошлые дубли сохраняются" : st.why,
        onclick: () => this.newTake(i) });
      const why = !st.ok && !this.run.active ? h("div", { class: "h3z-note warn" }, st.why,
        st.marker ? h("button", { class: "h3z-btn sm", style: { marginLeft: "8px" }, title: "Перенести маркер конца в конец последнего клипа", onclick: () => this.markerToEnd() }, "Маркер → конец") : null) : null;
      const btnFrz = s.freeze
        ? h("button", { class: "h3z-btn sm", html: "<span>🔓 Разморозить</span>", title: "Отрезок снова будет зависеть от промпта, референсов и длины", onclick: () => this.unfreezeSeg(i) })
        : h("button", { class: "h3z-btn sm", disabled: stale || !!this.run.active, html: "<span>🔒 Зафиксировать</span>", title: stale ? "Сначала сгенерируйте отрезок" : "Сделать текущий дубль неизменяемым: никогда не перегенерируется, переживает «Очистить кэш»", onclick: () => this.freezeSeg(i) });
      const frzNote = s.freeze ? h("div", { class: "h3z-note" }, "🔒 Зафиксирован" + (s.freeze.created ? " " + new Date(s.freeze.created * 1000).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "") + ": промпт, референсы и параметры на него не влияют, длина закреплена.") : null;
      wrap.append(...[head, takes.length && !s.freeze ? row : null, frzNote, h("div", { class: "h3z-row wrap" }, btnGen, btnNew, btnFrz), !s.freeze && !C.isFootage(s) ? this.stageButtons(i) : null, why].filter(Boolean));
      return wrap;
    },
  });
}

// ---------------------------------------------------------------- «↺ Восстановить»: what changed since a take
const SEG_LBL = { prompt: "промпт отрезка", refs: "референсы отрезка", frames: "длина", overrides: "параметры отрезка (сид, шаги…)",
  link: "связь (продление / новая сцена)", upscale: "апскейл отрезка" };
const SET_LBL = { prompt: "общий промпт", negative: "негатив", seed: "общий сид", steps: "шаги", cfg: "cfg", sampler: "сэмплер",
  scheduler: "шедулер", shift_video: "shift видео", shift_audio: "shift звука", denoise: "denoise", aspect: "соотношение сторон",
  res_mode: "режим размера", megapixels: "мегапиксели", width: "ширина", height: "высота", overlap_blocks: "перекрытие",
  lock_overlap: "фиксация перекрытия", continuity_ref: "кадр-продолжение", ref_size: "размер референсов", run_kind: "черновик / финал" };
const short = (v) => { const t = typeof v === "string" ? v : JSON.stringify(v); return t === undefined ? "—" : t.length > 48 ? t.slice(0, 46) + "…" : t; };

export function installRestore(Editor, { C, h }) {
  Object.assign(Editor.prototype, {
    /** The take shown on clip i (its active take) and the pass kind its key was made for. */
    restoreTake(i) {
      const s = this.seg(i); if (!s?.result) return null;
      const t = (s.takes || []).find((x) => x.id === s.active_take) || (s.takes || []).find((x) => x.sig && x.sig === s.result.sig);
      if (!t?.snap) return null;
      const k = C.RUN_KINDS.includes(t.result?.kind) ? t.result.kind : C.runKind(this.p.settings);
      return { s, t, k };
    },

    /** Fields whose current value differs from the take's inputs AND feed its key (checked one by one). */
    takeDiff(i) {
      const r = this.restoreTake(i); if (!r) return null;
      const { t, k } = r;
      const sigOf = (p) => C.segmentSigs(p, k)[i];
      const now = sigOf(this.p), out = [];
      const test = (label, scope, apply, from, to) => {
        const p2 = clone(this.p); apply(p2);
        if (sigOf(p2) !== now) out.push({ id: scope + ":" + label, label, scope, apply, from: short(from), to: short(to) });
      };
      for (const key of Object.keys(t.snap)) {
        const cur = this.p.segments[i][key];
        if (JSON.stringify(cur ?? null) !== JSON.stringify(t.snap[key] ?? null))
          test(SEG_LBL[key] || key, "seg", (p) => { p.segments[i][key] = clone(t.snap[key]); }, t.snap[key], cur);
      }
      const ps = t.psnap?.settings;
      if (ps) for (const key of new Set([...Object.keys(ps), ...Object.keys(this.p.settings)])) {
        const was = ps[key], cur = this.p.settings[key];
        if (JSON.stringify(was ?? null) === JSON.stringify(cur ?? null)) continue;
        test(SET_LBL[key] || `настройка «${key}»`, "proj", (p) => { if (was === undefined) delete p.settings[key]; else p.settings[key] = clone(was); }, was, cur);
      }
      if (i > 0 && t.psnap?.prev) {
        const p3 = clone(this.p); for (const it of out) if (it.scope === "proj") it.apply(p3);   // project fields restored first
        const pk = C.segmentSigs(p3, k)[i - 1];
        if (pk !== t.psnap.prev) {
          const prev = this.p.segments[i - 1], pt = (prev.takes || []).find((x) => x.sig === t.psnap.prev);
          if (pt) out.push({ id: "prev", label: `предыдущий отрезок: вернуть дубль ${this.takeIndex(prev, pt.id) + 1}`, scope: "prev",
            apply: (p) => { const q = p.segments[i - 1]; Object.assign(q, clone(pt.snap || {})); q.active_take = pt.id; q.result = { ...clone(pt.result), sig: pt.sig }; } });
          else out.push({ id: "prev", label: "предыдущий отрезок изменён (его дубль для этого ключа не найден)", scope: "prev", apply: null });
        }
      }
      return { take: t, kind: k, items: out, match: now === t.sig };
    },

    /** Put the checked inputs back (one undo step); the key matches again when everything was restored. */
    applyRestore(i, items) {
      const r = this.restoreTake(i); if (!r || !items.length) return;
      this.mutate((p) => { for (const it of items) it.apply?.(p); this.relinkDownstream(p, i - (items.some((x) => x.scope === "prev") ? 1 : 0)); }, { render: "none" });
      const s = this.seg(i);
      if (s.result) s.result = { ...clone(r.t.result), sig: r.t.sig };
      this.renderAll();
      const left = this.takeDiff(i);
      this.toast(left?.match ? "Входы восстановлены — дубль снова актуален, перегенерации не будет"
        : "Восстановлено частично" + (left?.items.length ? ": ещё отличается — " + left.items.map((x) => x.label).join(", ") : ""));
    },

    /** The panel under the card status of a stale clip. */
    restorePanel(i, host) {
      const d = this.takeDiff(i);
      host.replaceChildren();
      if (!d) { host.append(h("div", { class: "h3z-note" }, "У этого дубля нет сохранённых входов (сделан старой версией).")); return; }
      if (!d.items.length) {
        host.append(h("div", { class: "h3z-note" }, d.match ? "Входы совпадают." : "Поля отрезка и проекта совпадают; изменились файлы референсов или ассеты — их не вернуть отсюда."));
        return;
      }
      const boxes = d.items.map((it) => {
        const cb = h("input", { type: "checkbox" }); cb.checked = !!it.apply; cb.disabled = !it.apply;
        cb.onchange = () => warn();
        return { it, cb, row: h("label", { class: "h3z-rs-row" + (it.scope === "proj" ? " proj" : "") }, cb, h("span", null, it.label),
          it.from !== undefined ? h("em", null, `${it.to} → ${it.from}`) : null) };
      });
      const wn = h("div", { class: "h3z-note h3z-rs-warn" });
      const warn = () => { wn.textContent = boxes.some((b) => b.cb.checked && b.it.scope === "proj")
        ? "Поля проекта влияют на все клипы" + (this.globScope?.() ? " и, при общих настройках, на другие проекты" : "") : ""; };
      warn();
      host.append(h("div", { class: "h3z-rs h3z-glass" }, h("b", null, "Что изменилось с этого дубля"), ...boxes.map((b) => b.row), wn,
        h("div", { class: "h3z-rs-btns" },
          h("button", { class: "h3z-btn sm primary", onclick: () => this.applyRestore(i, boxes.filter((b) => b.cb.checked).map((b) => b.it)) }, "↺ Восстановить выбранное"),
          h("button", { class: "h3z-btn sm", onclick: () => host.replaceChildren() }, "Отмена"))));
    },
  });
}

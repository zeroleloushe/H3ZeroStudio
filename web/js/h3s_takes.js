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
        t = { id: C.newId("t"), key: res.key, sig, seed: res.seed, created: res.created || Math.floor(Date.now() / 1000), snap: this.snapOf(s), result };
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

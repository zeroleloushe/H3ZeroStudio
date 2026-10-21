import { T, langSetting, setLangSetting } from "./h3s_i18n.js";
// «Настройки»: the rarely changed, set-once settings in their own rail tab — generation stages (1 / 2) with the
// parameters of each stage, upscale, extension and audio seams, cache, live preview, logging and the status of
// the models. They are global (stored by the server in output/h3zerostudio/_settings.json and shared by all
// projects); a project can keep its own instead (settings_scope = "project", the default of older projects so
// that opening them never changes their clips). Per-clip ✎ Черновик / ✦ Чистовик run one stage for one clip.
export function installSettings(Editor, { C, h, ICON }) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  Object.assign(Editor.prototype, {
    /** Shared leftovers of older versions: preview (count, size, examples), then confirm. */
    async cleanUnused() {
      try {
        this.toast(T("Ищу неиспользуемые файлы…"));
        const r = await this.host.get("/h3zero/unused");
        if (!r.files) { this.toast(T("Неиспользуемых общих файлов нет")); return; }
        const mb = (r.bytes / 1048576).toFixed(1);
        if (!confirm(T("Удалить {0} общих файлов ({1} МБ) из input/h3zerostudio и _thumbs?\nНи один сохранённый проект на них не ссылается.", r.files, mb)
          + T("\nПроекты, которые есть только внутри workflow (не в списке «Проекты»), не учитываются — откройте их сначала.\n\n") + r.sample.join("\n") + (r.files > r.sample.length ? "\n…" : ""))) return;
        const d = await this.host.call("/h3zero/unused/clean", {});
        this.toast(T("Удалено файлов: {0} ({1} МБ)", d.files, (d.bytes / 1048576).toFixed(1)));
      } catch (e) { this.toast(T("Не удалось: ") + (e.message || e), true); }
    },
    // ---------------------------------------------------------------- global settings
    async globLoad(force = false) {
      if (this._glob && !force) return this._glob;
      try { this._glob = (await this.host.get("/h3zero/settings"))?.settings || {}; } catch (e) { this._glob = this._glob || {}; }
      return this._glob;
    },
    globScope() { return this.p.settings.settings_scope === "global"; },
    globVals(st = this.p.settings) { const o = {}; for (const k of C.GLOBAL_KEYS) o[k] = st[k]; return o; },
    /** Silent settings change (no undo step): following the global settings is not an edit of the project. */
    setSettingsQuiet(vals) {
      this.p = C.normalizeProject({ ...this.p, settings: { ...this.p.settings, ...vals } });
      this.flushSave();
      if (this.root) this.renderAll();
    },
    /** On open / project switch: a «global» project takes the global values. The very first time (no global
     *  settings yet) the open project's settings become the global ones. */
    async globSync() {
      // the global draft mode is gone (stages replace it): a project saved in it opens as «2 этапа»
      if (this.p.settings.quality === "draft") this.setSettingsQuiet({ quality: "final", final_mode: "refine" });
      const pid = this.p.id, g = await this.globLoad();
      if (!this.root || this.p.id !== pid) return;
      if (!Object.keys(g).length) {
        if (this._globSeeded) return;
        this._globSeeded = true;
        await this.globPut(this.globVals(), true);
        if (!this.globScope()) this.setSettingsQuiet({ settings_scope: "global" });
        return;
      }
      if (!this.globScope()) return;
      const diff = {};
      for (const k of C.GLOBAL_KEYS) if (k in g && !same(g[k], this.p.settings[k])) diff[k] = g[k];
      if (!Object.keys(diff).length) return;
      const before = this.p.segments.map((_, i) => this.isStale(i));
      this.setSettingsQuiet(diff);
      const nowStale = this.p.segments.filter((s, i) => s.result && !before[i] && this.isStale(i)).length;
      if (nowStale) this.toast(T("Применены глобальные настройки ({0} парам.) — {1} клип(ов) устарели. «Только этот проект» в «Настройках» — оставить проекту свои", Object.keys(diff).length, nowStale), true,
        { label: T("Настройки"), fn: () => this.openSettings() });
    },
    async globPut(vals, replace = false) {
      this._glob = { ...(replace ? {} : this._glob || {}), ...vals };
      clearTimeout(this._globT);
      const send = async () => { try { const r = await this.host.call("/h3zero/settings", { settings: this._glob, replace: true }); if (r?.settings) this._glob = r.settings; } catch (e) { this.toast(T("Не удалось сохранить глобальные настройки: ") + (e.message || e), true); } };
      if (replace) return send();
      this._globT = setTimeout(send, 400);
    },
    /** A set-once setting changed in «Настройки»: the project, and the global settings if it follows them. */
    setOnce(k, v, opt) {
      this.mutate((p) => { p.settings[k] = v; }, opt);
      if (this.globScope() && C.GLOBAL_KEYS.includes(k)) this.globPut({ [k]: this.p.settings[k] });
    },
    async setScope(scope) {
      if (scope === "project") { this.mutate((p) => { p.settings.settings_scope = "project"; }); this.toast(T("Проект хранит свои настройки: их изменения не затрагивают другие проекты")); return; }
      const g = await this.globLoad(true);
      if (!Object.keys(g).length) { await this.globPut(this.globVals(), true); this.mutate((p) => { p.settings.settings_scope = "global"; }); this.toast(T("Настройки этого проекта стали глобальными")); return; }
      const diff = C.GLOBAL_KEYS.filter((k) => k in g && !same(g[k], this.p.settings[k]));
      this.mutate((p) => { p.settings.settings_scope = "global"; for (const k of diff) p.settings[k] = g[k]; });
      this.toast(diff.length ? T("Проект следует глобальным настройкам: изменено {0} парам. (часть клипов может устареть; Ctrl+Z — вернуть)", diff.length) : T("Проект следует глобальным настройкам"));
    },
    async projToGlobal() {
      if (!confirm(T("Сделать настройки этого проекта глобальными? Проекты с «Для всех проектов» получат их при открытии."))) return;
      await this.globPut(this.globVals(), true);
      this.toast(T("Глобальные настройки = настройки этого проекта"));
      this.renderLeft();
    },
    openSettings(section) {
      this.tool = "settings"; if (section) this._setOpen = section;
      this.renderTools(); this.renderLeft();
    },

    // ---------------------------------------------------------------- stages per clip
    stagesTwo() { return this.p.settings.final_mode === "refine"; },
    /** ✎ Черновик / ✦ Чистовик for one clip — the stage settings of «Настройки», whatever the project mode. */
    stageClip(i, which) {
      const st = this.segGenState(i); if (!st.ok) { this.toast(st.why, true); return; }
      const two = this.stagesTwo();
      if (which === "final" && two && this.hasDraft(i) && !this.finalDone(i)) return this.finalFromDraft([i]);
      const kind = which === "draft" ? "draft" : two ? "refine" : "full", s = this.seg(i);
      if (s.result && (s.result.kind || C.runKind(this.p.settings)) === kind && !this.isStale(i)) {
        this.toast(T("Отрезок {0}: {1} уже готов. «Ещё дубль» — вариант с новым сидом", i + 1, which === "draft" ? T("черновик") : T("чистовик"))); return;
      }
      this.sel = i;
      this.generate({ upto: i, only: i, kind });
      const [dw, dh] = C.workResolution(this.p.settings, "draft"), [w, hh] = C.resolution(this.p.settings);
      this.toast(which === "draft" ? T("Отрезок {0}: черновик {1}×{2}", i + 1, dw, dh) : two ? T("Отрезок {0}: черновик → чистовик {1}×{2}", i + 1, w, hh) : T("Отрезок {0}: чистовик {1}×{2}", i + 1, w, hh));
    },
    stageTip(which) {
      const g = this.p.settings, two = this.stagesTwo();
      const pp = (k) => { const x = C.passParams(this.p, Math.max(0, this.sel), k); return T("{0} шаг., cfg {1}, {2}/{3}", x.steps, x.cfg, x.sampler, x.scheduler); };
      if (which === "draft") { const [a, b] = C.workResolution(g, "draft"); return T("✎ Черновик только этого клипа: {0}×{1}, {2} («Настройки» → «Этап 1»)", a, b, pp("draft")); }
      const [w, hh] = C.resolution(g);
      return two ? T("✦ Чистовик только этого клипа: черновик (если нет) → апскейл → доработка σ {0} до {1}×{2}, {3} («Настройки» → «Этап 2»)", g.refine_sigma, w, hh, pp("refine"))
        : T("✦ Чистовик только этого клипа: сразу {0}×{1}, {2} («Настройки» → «Генерация: 1 этап»)", w, hh, pp("full"));
    },
    stageButtons(i) {
      const st = this.segGenState(i);
      return h("div", { class: "h3z-row h3z-stagebtns" },
        h("button", { class: "h3z-btn sm", disabled: !st.ok || undefined, title: st.ok ? this.stageTip("draft") : st.why, onclick: () => this.stageClip(i, "draft") }, T("✎ Черновик")),
        h("button", { class: "h3z-btn sm", disabled: !st.ok || undefined, title: st.ok ? this.stageTip("final") : st.why, onclick: () => this.stageClip(i, "final") }, T("✦ Чистовик")));
    },
    /** ♪ Улучшить звук: extra sampler steps over the sound of a ready clip only (video frozen by the noise mask). */
    audioRefine(i) {
      const s = this.seg(i);
      if (this.run.active) { this.toast(T("Сейчас идёт генерация — дождитесь окончания"), true); return; }
      if (!s?.result?.video || this.isStale(i)) { this.toast(T("Отрезок {0}: сначала сгенерируйте клип (результат должен быть актуальным)", i + 1), true); return; }
      let sv = {}; try { sv = JSON.parse(localStorage.getItem("h3z_audio_refine") || "{}"); } catch (e) { /* ignore */ }
      const v = { steps: sv.steps ?? 6, denoise: sv.denoise ?? 0.45, video_denoise: sv.video_denoise ?? 0 };
      const inp = (key, min, max, step, tip) => h("input", { type: "number", min, max, step, value: v[key], title: tip, class: "h3z-num", style: "width:90px",
        oninput: (e) => { v[key] = parseFloat(e.target.value); } });
      const row = (label, el, tip) => h("div", { class: "h3z-row", title: tip, style: "justify-content:space-between;gap:12px;margin:6px 0" }, h("span", {}, label), el);
      const close = () => modal.remove();
      const go = () => {
        v.steps = Math.max(1, Math.min(50, Math.trunc(v.steps) || 6)); v.denoise = Math.max(0.05, Math.min(1, v.denoise || 0.45)); v.video_denoise = Math.max(0, Math.min(1, v.video_denoise || 0));
        try { localStorage.setItem("h3z_audio_refine", JSON.stringify(v)); } catch (e) { /* ignore */ }
        close(); this.sel = i;
        this.generate({ upto: i, only: i, audio: { ...v } });
        this.toast(T("Отрезок {0}: улучшение звука · {1} шаг., сила {2}{3}", i + 1, v.steps, v.denoise, v.video_denoise ? T(", видео {0}", v.video_denoise) : T(", видео заморожено")));
      };
      const box = h("div", { class: "h3z-glass", style: "padding:16px 18px;min-width:340px;max-width:440px" },
        h("div", { style: "font-weight:600;margin-bottom:8px" }, T("♪ Улучшить звук — отрезок {0}", i + 1)),
        row(T("Шаги"), inp("steps", 1, 50, 1, T("Число шагов уточнения звука (по умолчанию 6)")), T("Число шагов уточнения звука (по умолчанию 6)")),
        row(T("Сила звука"), inp("denoise", 0.05, 1, 0.05, T("0.3–0.6: сохраняет звук и добавляет детали; 1.0: звук с нуля")), T("0.3–0.6: сохраняет почти весь звук и добавляет детали; 1.0: звук генерируется с нуля")),
        row(T("Сила видео"), inp("video_denoise", 0, 1, 0.05, T("0 — картинка не меняется")), T("0 — видео заморожено (картинка остаётся такой же); больше нуля разрешает частично менять видео")),
        h("div", { class: "hint", style: "margin:8px 0" }, T("Сэмплер, cfg, расписание, промпт и референсы — как у отрезка. Нужен вход audio_vae. Исходный клип не затирается: звук сохраняется отдельной копией.")),
        h("div", { class: "h3z-row", style: "justify-content:flex-end;gap:8px" },
          h("button", { class: "h3z-btn sm", onclick: close }, T("Отмена")), h("button", { class: "h3z-btn primary sm", onclick: go }, T("Улучшить"))));
      const modal = h("div", { class: "h3z-modal" }, box);
      modal.addEventListener("pointerdown", (e) => { if (e.target === modal) close(); });
      this.root.append(modal);
    },
    stageMenuEntries(i) {
      const st = this.segGenState(i);
      return [{ label: T("✎ Черновик этого клипа"), title: this.stageTip("draft"), fn: () => this.stageClip(i, "draft"), dis: !st.ok },
        { label: T("✦ Чистовик этого клипа"), title: this.stageTip("final"), fn: () => this.stageClip(i, "final"), dis: !st.ok },
        { label: T("♪ Улучшить звук"), title: T("Дополнительные шаги семплера только по звуку клипа; картинка не меняется"), fn: () => this.audioRefine(i), dis: !st.ok || this.run.active || !this.seg(i)?.result?.video || this.isStale(i) }];
    },

    // ---------------------------------------------------------------- the tab
    renderSettings(L) {
      const g = this.p.settings, set = (k, v, opt) => this.setOnce(k, v, opt), glob = this.globScope();
      const det = (title, ...kids) => { const d = h("details", { class: "h3z-det" }, h("summary", null, title), h("div", { class: "in" }, ...kids)); if (this._setOpen === title) d.open = true; return d; };
      const num = (k, label, step, min, max, ph) => { const e = h("input", { class: "h3z-in", type: "number", step, min, max, value: g[k] || (ph ? "" : g[k]), placeholder: ph || "" });
        e.onchange = () => set(k, e.value === "" ? (ph ? 0 : C.DEFAULT_SETTINGS[k]) : Math.max(min, Math.min(max, Number(e.value)))); return this.field(label, e); };
      const sel = (k, label, list, empty) => { const opts = empty ? ["", ...list] : list;
        const e = h("select", { class: "h3z-sel" }, (opts.includes(g[k]) ? opts : [g[k], ...opts]).map((x) => h("option", { value: x, selected: x === g[k] }, x === "" ? T("как основной · {0}", empty) : x)));
        e.onchange = () => set(k, e.value); return this.field(label, e); };
      const pill = (on, label, title, fn) => h("div", { class: "h3z-pill" + (on ? " on" : ""), title, onclick: fn }, label);
      const [w, hh] = C.resolution(g), [dw, dh] = C.workResolution(g, "draft"), two = g.final_mode === "refine";
      const head = h("div", { class: "h3z-ph" }, h("h3", null, T("Настройки")));
      const scope = h("div", { class: "h3z-setscope" },
        h("div", { class: "h3z-pills" }, pill(glob, T("Для всех проектов"), T("Глобальные настройки: общие для всех проектов, которые им следуют"), () => !glob && this.setScope("global")),
          pill(!glob, T("Только этот проект"), T("Свои настройки проекта: изменения не затрагивают другие проекты"), () => glob && this.setScope("project"))),
        h("div", { class: "h3z-note" }, glob ? T("Изменения здесь сохраняются глобально и применяются ко всем проектам с «Для всех проектов».") : T("Этот проект хранит свои настройки (так открываются проекты прошлых версий, чтобы их клипы не устарели).")),
        !glob ? h("button", { class: "h3z-btn sm", title: T("Записать настройки этого проекта как глобальные"), onclick: () => this.projToGlobal() }, T("Сделать глобальными")) : null);
      // generation stages
      const smp = this.opts.samplers, sch = this.opts.schedulers;
      const stages = det(T("Генерация"),
        h("div", { class: "h3z-pills" }, pill(!two, T("1 этап"), T("«Сгенерировать» сразу делает {0}×{1}", w, hh), () => set("final_mode", "full")),
          pill(two, T("2 этапа"), T("«Сгенерировать»: черновик {0}×{1} → сразу чистовик {2}×{3} по каждому отрезку", dw, dh, w, hh), () => set("final_mode", "refine"))),
        h("div", { class: "h3z-note" }, two ? T("2 этапа: каждый отрезок сначала черновиком {0}×{1}, затем сразу чистовик — апскейл и доработка до {2}×{3} (композиция, движение и звук черновика сохраняются).", dw, dh, w, hh)
          : T("1 этап: каждый отрезок сразу в {0}×{1}.", w, hh)),
        h("div", { class: "h3z-lbl" }, T("Основной проход"), h("em", null, two ? T("по умолчанию для этапов") : T("единственный этап"))),
        h("div", { class: "h3z-grid3" }, num("steps", T("шаги"), 1, 1, 200), num("cfg", "cfg", 0.1, 0, 30), num("denoise", "denoise", 0.01, 0, 1)),
        h("div", { class: "h3z-grid2" }, sel("sampler", T("сэмплер"), smp), sel("scheduler", T("расписание"), sch)),
        h("div", { class: "h3z-grid2" }, num("shift_video", T("shift видео"), 0.1, 0, 100), num("shift_audio", T("shift аудио"), 0.1, 0.01, 100)),
        h("div", { class: "h3z-note" }, T("Turbo LoRA Ref2VA: 4 шага, cfg 1. Без LoRA — ~20 шагов. shift видео 0 — расписание модели. fps — всегда 24 (H3).")));
      const scale = h("select", { class: "h3z-sel" }, C.DRAFT_SCALES.map((k) => { const [a, b] = C.workResolution({ ...g, quality: "draft", draft_scale: k }, "draft"); return h("option", { value: k, selected: Number(g.draft_scale) === k }, T("{0} Мп · {1}×{2} ({3}%)", (a * b / 1e6).toFixed(2), a, b, Math.round(k * 100))); }));
      scale.onchange = () => set("draft_scale", Number(scale.value));
      const st1 = det(T("Этап 1 · Черновик"),
        this.field(T("Размер"), scale),
        h("div", { class: "h3z-grid2" }, num("draft_steps", T("шаги"), 1, 0, 200, String(g.steps)), num("draft_cfg", "cfg", 0.1, 0, 30, String(g.cfg))),
        h("div", { class: "h3z-grid2" }, sel("draft_sampler", T("сэмплер"), smp, g.sampler), sel("draft_scheduler", T("расписание"), sch, g.scheduler)),
        h("div", { class: "h3z-note" }, T("Пусто — как в основном проходе. Используется вторым режимом, «✎ Черновик» в шапке и «✎ Черновик» клипа.")));
      const sig = h("select", { class: "h3z-sel", title: T("σ старта доработки: 0.25–0.45 сохраняет черновик и добавляет детали") },
        [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7].map((v) => h("option", { value: v, selected: Math.abs(Number(g.refine_sigma) - v) < 1e-6 }, `σ ${v.toFixed(2)}` + (v === 0.4 ? T(" · рекоменд.") : v > 0.45 ? T(" · сильно") : ""))));
      sig.onchange = () => set("refine_sigma", Number(sig.value));
      const uc = this.upCaps();
      const up = h("select", { class: "h3z-sel" }, [["learned", T("Обученный латентный апскейлер H3") + (!this.upKnown() || uc.learned ? "" : T(" (нет)"))], ["rtx", T("RTX VSR → VAE энкод (качество)") + (!this.upKnown() || uc.rtx ? "" : T(" (нет)"))]]
        .map(([v, l]) => h("option", { value: v, selected: g.upscale_method === v }, l)));
      up.onchange = () => set("upscale_method", up.value);
      const st2 = det(T("Этап 2 · Чистовик"),
        h("div", { class: "h3z-grid2" }, this.field(T("сила доработки"), sig), num("refine_steps", T("шаги"), 1, 0, 200, String(C.passSteps({ ...g, refine_steps: 0 }, Number(g.steps), "refine")))),
        h("div", { class: "h3z-grid2" }, sel("refine_sampler", T("сэмплер"), smp, g.sampler), sel("refine_scheduler", T("расписание"), sch, g.scheduler)),
        h("div", { class: "h3z-grid2" }, num("refine_cfg", "cfg", 0.1, 0, 30, String(g.cfg)), h("div")),
        this.field(T("Апскейл черновика"), up),
        !this.upAvail() ? h("div", { class: "h3z-note err" }, this.upUnavailText()) : null,
        h("div", { class: "h3z-note" }, two ? T("Чистовик = апскейл черновика + доработка этим проходом (звук черновика 1:1).") : T("В режиме «1 этап» используется кнопками «✦ Чистовик» / «↑ Финал» на клипах с черновиком.")));
      // extension & audio
      const ovSel = h("select", { class: "h3z-sel" }, Array.from({ length: C.MAX_OVERLAP_BLOCKS + 1 }, (_, o) => h("option", { value: o, selected: Number(g.overlap_blocks) === o }, this.ovLabel(o))));
      ovSel.onchange = () => set("overlap_blocks", Number(ovSel.value));
      const acSel = h("select", { class: "h3z-sel" }, [0, 1, 1.5, 2, 3, 4].map((v) => h("option", { value: v, selected: Number(g.audio_context_sec || 0) === v }, v ? T("{0} с прошлого звука", v) : T("только перекрытие"))));
      acSel.onchange = () => set("audio_context_sec", Number(acSel.value));
      const phrase = h("textarea", { class: "h3z-ta sm", spellcheck: "false" }); phrase.value = g.continuity_phrase;
      phrase.oninput = () => set("continuity_phrase", phrase.value, { coalesce: "phrase", render: "none" });
      const xf = (() => { if (!g.audio_xfade) return null; const r = h("input", { class: "h3z-range", type: "range", min: 0.1, max: 1, step: 0.05, value: g.audio_xfade_sec }); const v = h("div", { class: "h3z-val" }, T("{0} с", Number(g.audio_xfade_sec).toFixed(2)));
        const sp = () => r.style.setProperty("--p", ((r.value - 0.1) / 0.9 * 100) + "%"); sp();
        r.oninput = () => { sp(); v.textContent = T("{0} с", Number(r.value).toFixed(2)); set("audio_xfade_sec", Number(r.value), { coalesce: "xf", render: "none" }); };
        return h("div", { class: "h3z-row" }, r, v); })();
      const ext = det(T("Продление и звук"),
        this.field(T("Перекрытие при продлении (по умолчанию)"), ovSel),
        this.field(T("Звук: контекст прошлого отрезка"), acSel),
        this.toggle(T("Фиксировать перекрытие"), g.lock_overlap, (v) => set("lock_overlap", v), T("Кадры перекрытия берутся из готового предыдущего отрезка")),
        this.toggle(T("Последний кадр как <Picture N>"), g.continuity_ref, (v) => set("continuity_ref", v), T("Последний кадр предыдущего отрезка — референс")),
        h("div", null, h("div", { class: "h3z-lbl" }, T("Фраза-продолжение"), h("em", null, T("{n} — номер картинки")),
          this.peButton(() => ({ title: T("Фраза-продолжение (последний кадр прошлого отрезка)"), value: this.p.settings.continuity_phrase ?? "", ctx: { kind: "phrase" }, apply: (t) => { phrase.value = t; set("continuity_phrase", t); } }))), phrase),
        this.field(T("Размер референсов"), h("div", { class: "h3z-pills" }, pill(g.ref_size === "match", "match", T("быстрее"), () => set("ref_size", "match")), pill(g.ref_size === "max", "max 2048", T("точнее"), () => set("ref_size", "max")))),
        h("div", { class: "h3z-lbl" }, T("Звук на стыках"), h("em", null, T("под клипами дорожки не применяется"))),
        this.toggle(T("Продолжать звук прошлого отрезка"), g.audio_seam_lock, (v) => set("audio_seam_lock", v), T("Аудио-латент перекрытия фиксируется хвостом предыдущего отрезка")),
        this.toggle(T("Кроссфейд на стыке"), g.audio_xfade, (v) => set("audio_xfade", v), T("Различный звук — плавный переход внутри перекрытия; тот же звук — короткая склейка без провала")),
        xf,
        this.toggle(T("Выравнивать громкость на стыке"), g.audio_match, (v) => set("audio_match", v), T("RMS у стыка, до ±6 дБ, возврат за 2 с")),
        this.toggle(T("Убирать щелчки на склейках"), g.audio_declick !== false, (v) => set("audio_declick", v), T("Жёсткие склейки звука (новая сцена, футаж, края экспорта и обрезки): плавное затухание ~5 мс с каждой стороны вместо щелчка")),
        h("div", { class: "h3z-lbl" }, T("Картинка на стыках"), h("em", null, T("только готовые кадры — кэш и дубли не меняются"))),
        this.toggle(T("Выравнивать яркость и цвет"), g.level_lock !== false, (v) => set("level_lock", v),
          T("На стыках-продолжениях яркость, контраст и цвет обеих сторон плавно сводятся к общему среднему (не больше ±20/255), без перегенерации")),
        g.level_lock !== false ? (() => { const r = h("input", { class: "h3z-range", type: "range", min: 2, max: 48, step: 1, value: g.level_lock_frames ?? 12 });
          const v = h("div", { class: "h3z-val" }, T("{0} кадр.", g.level_lock_frames ?? 12));
          r.oninput = () => { v.textContent = T("{0} кадр.", r.value); set("level_lock_frames", Number(r.value), { coalesce: "lvl", render: "none" }); };
          return this.field(T("Окно перехода (каждая сторона)"), h("div", { class: "h3z-row" }, r, v)); })() : null);
      const cache = det(T("Кэш"),
        this.toggle(T("Кэш готовых отрезков"), g.cache, (v) => set("cache", v), T("Пропускать неизменённые отрезки")),
        h("button", { class: "h3z-btn sm danger", html: ICON.broom + T("<span>Очистить кэш проекта</span>"), title: T("Готовые дубли остаются (восстановятся без генерации)"), onclick: () => this.clearCache() }),
        h("button", { class: "h3z-btn sm danger", title: T("Кэш и все готовые дубли (кроме зафиксированных)"), onclick: () => this.clearCache(true) }, T("…и дубли")),
        h("button", { class: "h3z-btn sm", title: T("Общие файлы старых версий (input/h3zerostudio, _thumbs), на которые не ссылается ни один сохранённый проект"), onclick: () => this.cleanUnused() }, T("Очистить неиспользуемое")));
      const taes = ["auto", "none", ...((this.opts.tiny_vaes || []).filter((x) => x !== "auto" && x !== "none"))];
      const taeSel = h("select", { class: "h3z-sel" }, (taes.includes(g.preview_tiny_vae) ? taes : [g.preview_tiny_vae, ...taes]).map((x) => h("option", { value: x, selected: x === g.preview_tiny_vae }, x === "auto" ? T("авто (taeh3, если есть)") : x === "none" ? T("нет — latent2rgb") : x)));
      taeSel.onchange = () => set("preview_tiny_vae", taeSel.value);
      const pv = det(T("Живое превью и лог"),
        this.field("tiny VAE (models/vae_approx)", taeSel),
        h("div", { class: "h3z-grid2" }, num("preview_max_res", T("max_res (0 = полное)"), 8, 0, 4096), num("preview_quality", "jpeg", 1, 30, 100)),
        h("div", { class: "h3z-grid2" }, num("preview_frames", T("кадров"), 1, 1, 240), num("preview_fps", T("fps (0 = реал.)"), 1, 0, 60)),
        this.toggle(T("Скрыть стандартное превью ComfyUI"), g.preview_suppress, (v) => set("preview_suppress", v), T("Только превью редактора")),
        this.toggle(T("Подробный лог в консоли"), g.verbose_log, (v) => set("verbose_log", v), T("[H3ZS] в консоли ComfyUI: запуск, отрезки, шаги, стыки и звук")));
      // models
      const known = this.upKnown(), paths = this.opts.paths || {};
      const taeh3 = (this.opts.tiny_vaes || []).some((x) => /taeh3/i.test(x));
      const row = (ok, name, detail) => h("div", { class: "h3z-modrow" + (ok === null ? "" : ok ? " ok" : " bad") }, h("b", null, ok === null ? "…" : ok ? "✓" : "✕"), h("div", null, h("div", null, name), detail ? h("small", null, detail) : null));
      const presetsDet = h("div", { class: "h3z-note" }, T("Пресеты моделей и стек LoRA — во вкладке "), h("a", { href: "#", onclick: (e) => { e.preventDefault(); this.tool = "models"; this.renderTools(); this.renderLeft(); } }, T("«Модели»")), T(" слева (быстрый доступ)."));
      const models = det(T("Компоненты и VRAM"),
        row(known ? uc.learned : null, T("Обученный латентный апскейлер H3"), known ? (uc.learned ? uc.learned_models.join(", ") : !uc.learned_node ? T("нет ноды MinimaxH3LatentUpscaler3D") : T("нет модели minimax_h3_latent_upscaler_3d_bf16.safetensors")) : T("проверка…")),
        (paths.latent_upscale_models || []).length ? h("div", { class: "h3z-note mono" }, (paths.latent_upscale_models || []).join("\n")) : null,
        row(known ? uc.rtx : null, "RTX VSR (nvidia-vfx)", known ? (uc.rtx ? T("доступен · ULTRA, как KJNodes Resize v2") : T("нет пакета nvidia-vfx или видеокарты RTX")) : ""),
        row(this.opts.tiny_vaes ? taeh3 : null, T("taeh3 — живое превью"), taeh3 ? (this.opts.tiny_vaes || []).filter((x) => /taeh3/i.test(x)).join(", ") : T("нет — превью latent2rgb")),
        (paths.vae_approx || []).length ? h("div", { class: "h3z-note mono" }, (paths.vae_approx || []).join("\n")) : null,
        h("div", { class: "h3z-note" }, T("Папки — стандартные ComfyUI (и extra_model_paths.yaml). После установки модели перезапустите ComfyUI.")),
        num("vram_headroom_gb", T("Запас VRAM во время генерации, ГБ"), 0.25, 0, 8),
        h("div", { class: "h3z-note" }, T("Столько видеопамяти ComfyUI оставляет свободной, пока идёт генерация (штатный резерв --reserve-vram, поднимается только на время запуска и никогда не уменьшается). Помогает, когда открыт браузер / запись: иначе Windows выгружает VRAM в RAM и шаги идут в разы медленнее. 1 ГБ — голый рабочий стол, 2–3 ГБ — с браузером. 0 — выключено.")));
      const upS = this.upscaleSection(g, set);
      const TABS = [["gen", T("⚙ Генерация"), [stages, st1, st2, upS, models, presetsDet]], ["ext", T("🔗 Продление и звук"), [ext]], ["prev", T("👁 Превью и кэш"), [pv, cache]]];
      const titleOf = (d) => (d.querySelector(":scope > summary")?.firstChild?.textContent || "").trim();
      if (this._setOpen) { const t = TABS.find(([, , ds]) => ds.some((d) => titleOf(d) === this._setOpen)); if (t) this._setTab = t[0]; }
      const cur = TABS.find((t) => t[0] === this._setTab) || TABS[0];
      this._setTab = cur[0];
      const tabs = h("div", { class: "h3z-settabs" }, ...TABS.map(([id, label]) => h("div", { class: "h3z-settab" + (id === cur[0] ? " on" : ""), onclick: () => { if (this._setTab === id) return; this._setTab = id; this.renderLeft(); } }, label)));
      cur[2].forEach((d) => { d.open = true; });   // inside a tab the sections start open (a stored collapse still wins)
      // UI language (global, every project): Auto follows ComfyUI's language (Comfy.Locale); a switch reloads the page
      const lsel = h("select", { class: "h3z-sel sm" }, [["auto", T("Авто (как в ComfyUI)")], ["ru", T("Русский")], ["en", "English"]].map(([v, l]) => h("option", { value: v, selected: langSetting() === v }, l)));
      lsel.onchange = () => { if (setLangSetting(lsel.value)) this.toast(T("Язык сменится после перезагрузки страницы"), false, { label: T("Перезагрузить"), fn: () => location.reload() }); };
      const langRow = h("div", { class: "h3z-langrow" }, h("span", { class: "h3z-lbl" }, "🌐 " + T("Язык интерфейса")), lsel);
      const body = h("div", { class: "h3z-scroll h3z-setbody" }, langRow, scope, tabs, ...cur[2]);
      L.append(head, body);
      this._setOpen = null;
      this.keepDetails(L);
    },
  });
}

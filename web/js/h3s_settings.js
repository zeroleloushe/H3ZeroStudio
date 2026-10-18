// «Настройки»: the rarely changed, set-once settings in their own rail tab — generation stages (1 / 2) with the
// parameters of each stage, upscale, extension and audio seams, cache, live preview, logging and the status of
// the models. They are global (stored by the server in output/h3zerostudio/_settings.json and shared by all
// projects); a project can keep its own instead (settings_scope = "project", the default of older projects so
// that opening them never changes their clips). Per-clip ✎ Черновик / ✦ Чистовик run one stage for one clip.
export function installSettings(Editor, { C, h, ICON }) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  Object.assign(Editor.prototype, {
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
      if (nowStale) this.toast(`Применены глобальные настройки (${Object.keys(diff).length} парам.) — ${nowStale} клип(ов) устарели. «Только этот проект» в «Настройках» — оставить проекту свои`, true,
        { label: "Настройки", fn: () => this.openSettings() });
    },
    async globPut(vals, replace = false) {
      this._glob = { ...(replace ? {} : this._glob || {}), ...vals };
      clearTimeout(this._globT);
      const send = async () => { try { const r = await this.host.call("/h3zero/settings", { settings: this._glob, replace: true }); if (r?.settings) this._glob = r.settings; } catch (e) { this.toast("Не удалось сохранить глобальные настройки: " + (e.message || e), true); } };
      if (replace) return send();
      this._globT = setTimeout(send, 400);
    },
    /** A set-once setting changed in «Настройки»: the project, and the global settings if it follows them. */
    setOnce(k, v, opt) {
      this.mutate((p) => { p.settings[k] = v; }, opt);
      if (this.globScope() && C.GLOBAL_KEYS.includes(k)) this.globPut({ [k]: this.p.settings[k] });
    },
    async setScope(scope) {
      if (scope === "project") { this.mutate((p) => { p.settings.settings_scope = "project"; }); this.toast("Проект хранит свои настройки: их изменения не затрагивают другие проекты"); return; }
      const g = await this.globLoad(true);
      if (!Object.keys(g).length) { await this.globPut(this.globVals(), true); this.mutate((p) => { p.settings.settings_scope = "global"; }); this.toast("Настройки этого проекта стали глобальными"); return; }
      const diff = C.GLOBAL_KEYS.filter((k) => k in g && !same(g[k], this.p.settings[k]));
      this.mutate((p) => { p.settings.settings_scope = "global"; for (const k of diff) p.settings[k] = g[k]; });
      this.toast(diff.length ? `Проект следует глобальным настройкам: изменено ${diff.length} парам. (часть клипов может устареть; Ctrl+Z — вернуть)` : "Проект следует глобальным настройкам");
    },
    async projToGlobal() {
      if (!confirm("Сделать настройки этого проекта глобальными? Проекты с «Для всех проектов» получат их при открытии.")) return;
      await this.globPut(this.globVals(), true);
      this.toast("Глобальные настройки = настройки этого проекта");
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
        this.toast(`Отрезок ${i + 1}: ${which === "draft" ? "черновик" : "чистовик"} уже готов. «Ещё дубль» — вариант с новым сидом`); return;
      }
      this.sel = i;
      this.generate({ upto: i, only: i, kind });
      const [dw, dh] = C.workResolution(this.p.settings, "draft"), [w, hh] = C.resolution(this.p.settings);
      this.toast(which === "draft" ? `Отрезок ${i + 1}: черновик ${dw}×${dh}` : two ? `Отрезок ${i + 1}: черновик → чистовик ${w}×${hh}` : `Отрезок ${i + 1}: чистовик ${w}×${hh}`);
    },
    stageTip(which) {
      const g = this.p.settings, two = this.stagesTwo();
      const pp = (k) => { const x = C.passParams(this.p, Math.max(0, this.sel), k); return `${x.steps} шаг., cfg ${x.cfg}, ${x.sampler}/${x.scheduler}`; };
      if (which === "draft") { const [a, b] = C.workResolution(g, "draft"); return `✎ Черновик только этого клипа: ${a}×${b}, ${pp("draft")} («Настройки» → «Этап 1»)`; }
      const [w, hh] = C.resolution(g);
      return two ? `✦ Чистовик только этого клипа: черновик (если нет) → апскейл → доработка σ ${g.refine_sigma} до ${w}×${hh}, ${pp("refine")} («Настройки» → «Этап 2»)`
        : `✦ Чистовик только этого клипа: сразу ${w}×${hh}, ${pp("full")} («Настройки» → «Генерация: 1 этап»)`;
    },
    stageButtons(i) {
      const st = this.segGenState(i);
      return h("div", { class: "h3z-row h3z-stagebtns" },
        h("button", { class: "h3z-btn sm", disabled: !st.ok || undefined, title: st.ok ? this.stageTip("draft") : st.why, onclick: () => this.stageClip(i, "draft") }, "✎ Черновик"),
        h("button", { class: "h3z-btn sm", disabled: !st.ok || undefined, title: st.ok ? this.stageTip("final") : st.why, onclick: () => this.stageClip(i, "final") }, "✦ Чистовик"));
    },
    stageMenuEntries(i) {
      const st = this.segGenState(i);
      return [{ label: "✎ Черновик этого клипа", title: this.stageTip("draft"), fn: () => this.stageClip(i, "draft"), dis: !st.ok },
        { label: "✦ Чистовик этого клипа", title: this.stageTip("final"), fn: () => this.stageClip(i, "final"), dis: !st.ok }];
    },

    // ---------------------------------------------------------------- the tab
    renderSettings(L) {
      const g = this.p.settings, set = (k, v, opt) => this.setOnce(k, v, opt), glob = this.globScope();
      const det = (title, ...kids) => { const d = h("details", { class: "h3z-det" }, h("summary", null, title), h("div", { class: "in" }, ...kids)); if (this._setOpen === title) d.open = true; return d; };
      const num = (k, label, step, min, max, ph) => { const e = h("input", { class: "h3z-in", type: "number", step, min, max, value: g[k] || (ph ? "" : g[k]), placeholder: ph || "" });
        e.onchange = () => set(k, e.value === "" ? (ph ? 0 : C.DEFAULT_SETTINGS[k]) : Math.max(min, Math.min(max, Number(e.value)))); return this.field(label, e); };
      const sel = (k, label, list, empty) => { const opts = empty ? ["", ...list] : list;
        const e = h("select", { class: "h3z-sel" }, (opts.includes(g[k]) ? opts : [g[k], ...opts]).map((x) => h("option", { value: x, selected: x === g[k] }, x === "" ? `как основной · ${empty}` : x)));
        e.onchange = () => set(k, e.value); return this.field(label, e); };
      const pill = (on, label, title, fn) => h("div", { class: "h3z-pill" + (on ? " on" : ""), title, onclick: fn }, label);
      const [w, hh] = C.resolution(g), [dw, dh] = C.workResolution(g, "draft"), two = g.final_mode === "refine";
      const head = h("div", { class: "h3z-ph" }, h("h3", null, "Настройки"));
      const scope = h("div", { class: "h3z-setscope" },
        h("div", { class: "h3z-pills" }, pill(glob, "Для всех проектов", "Глобальные настройки: общие для всех проектов, которые им следуют", () => !glob && this.setScope("global")),
          pill(!glob, "Только этот проект", "Свои настройки проекта: изменения не затрагивают другие проекты", () => glob && this.setScope("project"))),
        h("div", { class: "h3z-note" }, glob ? "Изменения здесь сохраняются глобально и применяются ко всем проектам с «Для всех проектов»." : "Этот проект хранит свои настройки (так открываются проекты прошлых версий, чтобы их клипы не устарели)."),
        !glob ? h("button", { class: "h3z-btn sm", title: "Записать настройки этого проекта как глобальные", onclick: () => this.projToGlobal() }, "Сделать глобальными") : null);
      // generation stages
      const smp = this.opts.samplers, sch = this.opts.schedulers;
      const stages = det("Генерация",
        h("div", { class: "h3z-pills" }, pill(!two, "1 этап", `«Сгенерировать» сразу делает ${w}×${hh}`, () => set("final_mode", "full")),
          pill(two, "2 этапа", `«Сгенерировать»: черновик ${dw}×${dh} → сразу чистовик ${w}×${hh} по каждому отрезку`, () => set("final_mode", "refine"))),
        h("div", { class: "h3z-note" }, two ? `2 этапа: каждый отрезок сначала черновиком ${dw}×${dh}, затем сразу чистовик — апскейл и доработка до ${w}×${hh} (композиция, движение и звук черновика сохраняются).`
          : `1 этап: каждый отрезок сразу в ${w}×${hh}.`),
        h("div", { class: "h3z-lbl" }, "Основной проход", h("em", null, two ? "по умолчанию для этапов" : "единственный этап")),
        h("div", { class: "h3z-grid3" }, num("steps", "шаги", 1, 1, 200), num("cfg", "cfg", 0.1, 0, 30), num("denoise", "denoise", 0.01, 0, 1)),
        h("div", { class: "h3z-grid2" }, sel("sampler", "сэмплер", smp), sel("scheduler", "расписание", sch)),
        h("div", { class: "h3z-grid2" }, num("shift_video", "shift видео", 0.1, 0, 100), num("shift_audio", "shift аудио", 0.1, 0.01, 100)),
        h("div", { class: "h3z-note" }, "Turbo LoRA Ref2VA: 4 шага, cfg 1. Без LoRA — ~20 шагов. shift видео 0 — расписание модели. fps — всегда 24 (H3)."));
      const scale = h("select", { class: "h3z-sel" }, C.DRAFT_SCALES.map((k) => { const [a, b] = C.workResolution({ ...g, quality: "draft", draft_scale: k }, "draft"); return h("option", { value: k, selected: Number(g.draft_scale) === k }, `${(a * b / 1e6).toFixed(2)} Мп · ${a}×${b} (${Math.round(k * 100)}%)`); }));
      scale.onchange = () => set("draft_scale", Number(scale.value));
      const st1 = det("Этап 1 · Черновик",
        this.field("Размер", scale),
        h("div", { class: "h3z-grid2" }, num("draft_steps", "шаги", 1, 0, 200, String(g.steps)), num("draft_cfg", "cfg", 0.1, 0, 30, String(g.cfg))),
        h("div", { class: "h3z-grid2" }, sel("draft_sampler", "сэмплер", smp, g.sampler), sel("draft_scheduler", "расписание", sch, g.scheduler)),
        h("div", { class: "h3z-note" }, "Пусто — как в основном проходе. Используется вторым режимом, «✎ Черновик» в шапке и «✎ Черновик» клипа."));
      const sig = h("select", { class: "h3z-sel", title: "σ старта доработки: 0.25–0.45 сохраняет черновик и добавляет детали" },
        [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7].map((v) => h("option", { value: v, selected: Math.abs(Number(g.refine_sigma) - v) < 1e-6 }, `σ ${v.toFixed(2)}` + (v === 0.4 ? " · рекоменд." : v > 0.45 ? " · сильно" : ""))));
      sig.onchange = () => set("refine_sigma", Number(sig.value));
      const uc = this.upCaps();
      const up = h("select", { class: "h3z-sel" }, [["learned", "Обученный латентный апскейлер H3" + (!this.upKnown() || uc.learned ? "" : " (нет)")], ["rtx", "RTX VSR → VAE энкод (качество)" + (!this.upKnown() || uc.rtx ? "" : " (нет)")]]
        .map(([v, l]) => h("option", { value: v, selected: g.upscale_method === v }, l)));
      up.onchange = () => set("upscale_method", up.value);
      const st2 = det("Этап 2 · Чистовик",
        h("div", { class: "h3z-grid2" }, this.field("сила доработки", sig), num("refine_steps", "шаги", 1, 0, 200, String(C.passSteps({ ...g, refine_steps: 0 }, Number(g.steps), "refine")))),
        h("div", { class: "h3z-grid2" }, sel("refine_sampler", "сэмплер", smp, g.sampler), sel("refine_scheduler", "расписание", sch, g.scheduler)),
        h("div", { class: "h3z-grid2" }, num("refine_cfg", "cfg", 0.1, 0, 30, String(g.cfg)), h("div")),
        this.field("Апскейл черновика", up),
        !this.upAvail() ? h("div", { class: "h3z-note err" }, this.upUnavailText()) : null,
        h("div", { class: "h3z-note" }, two ? "Чистовик = апскейл черновика + доработка этим проходом (звук черновика 1:1)." : "В режиме «1 этап» используется кнопками «✦ Чистовик» / «↑ Финал» на клипах с черновиком."));
      // extension & audio
      const ovSel = h("select", { class: "h3z-sel" }, Array.from({ length: C.MAX_OVERLAP_BLOCKS + 1 }, (_, o) => h("option", { value: o, selected: Number(g.overlap_blocks) === o }, this.ovLabel(o))));
      ovSel.onchange = () => set("overlap_blocks", Number(ovSel.value));
      const acSel = h("select", { class: "h3z-sel" }, [0, 1, 1.5, 2, 3, 4].map((v) => h("option", { value: v, selected: Number(g.audio_context_sec || 0) === v }, v ? `${v} с прошлого звука` : "только перекрытие")));
      acSel.onchange = () => set("audio_context_sec", Number(acSel.value));
      const phrase = h("textarea", { class: "h3z-ta sm", spellcheck: "false" }); phrase.value = g.continuity_phrase;
      phrase.oninput = () => set("continuity_phrase", phrase.value, { coalesce: "phrase", render: "none" });
      const xf = (() => { if (!g.audio_xfade) return null; const r = h("input", { class: "h3z-range", type: "range", min: 0.1, max: 1, step: 0.05, value: g.audio_xfade_sec }); const v = h("div", { class: "h3z-val" }, `${Number(g.audio_xfade_sec).toFixed(2)} с`);
        const sp = () => r.style.setProperty("--p", ((r.value - 0.1) / 0.9 * 100) + "%"); sp();
        r.oninput = () => { sp(); v.textContent = `${Number(r.value).toFixed(2)} с`; set("audio_xfade_sec", Number(r.value), { coalesce: "xf", render: "none" }); };
        return h("div", { class: "h3z-row" }, r, v); })();
      const ext = det("Продление и звук",
        this.field("Перекрытие при продлении (по умолчанию)", ovSel),
        this.field("Звук: контекст прошлого отрезка", acSel),
        this.toggle("Фиксировать перекрытие", g.lock_overlap, (v) => set("lock_overlap", v), "Кадры перекрытия берутся из готового предыдущего отрезка"),
        this.toggle("Последний кадр как <Picture N>", g.continuity_ref, (v) => set("continuity_ref", v), "Последний кадр предыдущего отрезка — референс"),
        h("div", null, h("div", { class: "h3z-lbl" }, "Фраза-продолжение", h("em", null, "{n} — номер картинки")), phrase),
        this.field("Размер референсов", h("div", { class: "h3z-pills" }, pill(g.ref_size === "match", "match", "быстрее", () => set("ref_size", "match")), pill(g.ref_size === "max", "max 2048", "точнее", () => set("ref_size", "max")))),
        h("div", { class: "h3z-lbl" }, "Звук на стыках", h("em", null, "под клипами дорожки не применяется")),
        this.toggle("Продолжать звук прошлого отрезка", g.audio_seam_lock, (v) => set("audio_seam_lock", v), "Аудио-латент перекрытия фиксируется хвостом предыдущего отрезка"),
        this.toggle("Кроссфейд на стыке", g.audio_xfade, (v) => set("audio_xfade", v), "Различный звук — плавный переход внутри перекрытия; тот же звук — короткая склейка без провала"),
        xf,
        this.toggle("Выравнивать громкость на стыке", g.audio_match, (v) => set("audio_match", v), "RMS у стыка, до ±6 дБ, возврат за 2 с"));
      const cache = det("Кэш",
        this.toggle("Кэш готовых отрезков", g.cache, (v) => set("cache", v), "Пропускать неизменённые отрезки"),
        h("button", { class: "h3z-btn sm danger", html: ICON.broom + "<span>Очистить кэш проекта</span>", onclick: () => this.clearCache() }));
      const taes = ["auto", "none", ...((this.opts.tiny_vaes || []).filter((x) => x !== "auto" && x !== "none"))];
      const taeSel = h("select", { class: "h3z-sel" }, (taes.includes(g.preview_tiny_vae) ? taes : [g.preview_tiny_vae, ...taes]).map((x) => h("option", { value: x, selected: x === g.preview_tiny_vae }, x === "auto" ? "авто (taeh3, если есть)" : x === "none" ? "нет — latent2rgb" : x)));
      taeSel.onchange = () => set("preview_tiny_vae", taeSel.value);
      const pv = det("Живое превью и лог",
        this.field("tiny VAE (models/vae_approx)", taeSel),
        h("div", { class: "h3z-grid2" }, num("preview_max_res", "max_res (0 = полное)", 8, 0, 4096), num("preview_quality", "jpeg", 1, 30, 100)),
        h("div", { class: "h3z-grid2" }, num("preview_frames", "кадров", 1, 1, 240), num("preview_fps", "fps (0 = реал.)", 1, 0, 60)),
        this.toggle("Скрыть стандартное превью ComfyUI", g.preview_suppress, (v) => set("preview_suppress", v), "Только превью редактора"),
        this.toggle("Подробный лог в консоли", g.verbose_log, (v) => set("verbose_log", v), "[H3ZS] в консоли ComfyUI: запуск, отрезки, шаги, стыки и звук"));
      // models
      const known = this.upKnown(), paths = this.opts.paths || {};
      const taeh3 = (this.opts.tiny_vaes || []).some((x) => /taeh3/i.test(x));
      const row = (ok, name, detail) => h("div", { class: "h3z-modrow" + (ok === null ? "" : ok ? " ok" : " bad") }, h("b", null, ok === null ? "…" : ok ? "✓" : "✕"), h("div", null, h("div", null, name), detail ? h("small", null, detail) : null));
      const models = det("Модели",
        row(known ? uc.learned : null, "Обученный латентный апскейлер H3", known ? (uc.learned ? uc.learned_models.join(", ") : !uc.learned_node ? "нет ноды MinimaxH3LatentUpscaler3D" : "нет модели minimax_h3_latent_upscaler_3d_bf16.safetensors") : "проверка…"),
        (paths.latent_upscale_models || []).length ? h("div", { class: "h3z-note mono" }, (paths.latent_upscale_models || []).join("\n")) : null,
        row(known ? uc.rtx : null, "RTX VSR (nvidia-vfx)", known ? (uc.rtx ? "доступен · ULTRA, как KJNodes Resize v2" : "нет пакета nvidia-vfx или видеокарты RTX") : ""),
        row(this.opts.tiny_vaes ? taeh3 : null, "taeh3 — живое превью", taeh3 ? (this.opts.tiny_vaes || []).filter((x) => /taeh3/i.test(x)).join(", ") : "нет — превью latent2rgb"),
        (paths.vae_approx || []).length ? h("div", { class: "h3z-note mono" }, (paths.vae_approx || []).join("\n")) : null,
        h("div", { class: "h3z-note" }, "Папки — стандартные ComfyUI (и extra_model_paths.yaml). После установки модели перезапустите ComfyUI."));
      const body = h("div", { class: "h3z-scroll h3z-setbody" }, scope, stages, st1, st2, this.upscaleSection(g, set), ext, cache, pv, models);
      L.append(head, body);
      this._setOpen = null;
      this.keepDetails(L);
      if (!L.querySelector("details.h3z-det[open]")) stages.open = true;
    },
  });
}

// H3ZeroStudio: «Апскейл отрезка» — per-segment upscale + low-strength refine (backend: h3s_upscale.py).
// The upscale is a segment field ({method, mp, sigma, quality}; mp = megapixels of the upscaled frame, older
// projects stored a ×1.5/×2 multiplier — migrated to the mp with the same canvas); it is part of the take snapshot, so an upscaled
// result is a new take and choosing an older take brings back its state. Header «↑ Апскейл» = the whole video,
// the clip menu / button = this clip; method and size come from «Настройки» → «Апскейл».
export function installUpscale(Editor, { C, h, ICON }) {
  const LBL = C.UPSCALE_LABELS;
  Object.assign(Editor.prototype, {
    upCaps() { return this.opts?.upscale || { learned: false, rtx: false, learned_models: [], learned_node: false }; },
    upKnown() { return !!this.opts?.upscale; },
    /** The learned upscaler or RTX VSR is available (unknown before /h3zero/options answered: assume yes). */
    upAvail() { const c = this.upCaps(); return !this.upKnown() || !!(c.learned || c.rtx); },
    upUnavailText() {
      return "Апскейл недоступен: нет ни обученного латентного апскейлера H3 (нода MinimaxH3LatentUpscaler3D + модель minimax_h3_latent_upscaler_3d_bf16.safetensors в models/latent_upscale_models), ни RTX VSR (nvidia-vfx). Установите одно из них и перезапустите ComfyUI.";
    },

    /** What really makes the start latent for a method on this machine (mirror of h3s_upscale.effective_input). */
    upInputLabel(method) {
      const c = this.upCaps();
      if (!this.upKnown()) return method === "rtx" ? "RTX VSR" : "обученный латентный апскейлер";
      if (method === "rtx") return c.rtx ? "RTX VSR" : c.learned ? "нет RTX VSR → обученный апскейлер" : "недоступен: нет RTX VSR и модели апскейлера";
      return c.learned ? "обученный латентный апскейлер" : c.rtx ? "нет модели апскейлера → RTX VSR" : "недоступен: нет модели апскейлера и RTX VSR";
    },

    upDefault() { return C.normalizeUpscale(this.p.settings.seg_upscale) || C.normalizeUpscale({ method: "latent", scale: 2 }); },
    upText(u) { return u ? `${LBL[u.method]} · ${this.upMpVal(u)} Мп` : ""; },
    /** Megapixels of the upscaled frame (the real snapped canvas). */
    upMpVal(u) { const [w, hh] = this.upCanvas(u); return (w * hh / 1e6).toFixed(1); },
    upCanvas(u) { const [w, hh] = C.workResolution(this.p.settings); return C.upscaleCanvas(w, hh, u); },
    /** Size choices (the same everywhere: settings, header and clip menus): MP presets + own value. */
    upSizeChoices(u) {
      const [bw, bh] = C.workResolution(this.p.settings), base = bw * bh / 1e6;
      return C.SEG_UPSCALE_MP_PRESETS.map((mp) => { const c = C.upscaleCanvas(bw, bh, { mp }); return { mp, w: c[0], h: c[1], small: c[0] * c[1] <= bw * bh, on: !!u && Math.abs((u.mp || 0) - mp) < 1e-9 }; }).concat([{ base }]);
    },
    upAskMp(cur) {
      const [bw, bh] = C.workResolution(this.p.settings);
      const v = prompt(`Размер после апскейла в мегапикселях (сейчас кадр ${bw}×${bh} = ${(bw * bh / 1e6).toFixed(2)} Мп; итог кратен 32, пропорции те же)`, String(cur?.mp ?? 2));
      const x = Number(String(v ?? "").replace(",", "."));
      return v != null && x > 0 ? Math.min(C.SEG_UPSCALE_MP_RANGE[1], Math.max(C.SEG_UPSCALE_MP_RANGE[0], x)) : null;
    },

    /** Why segment i cannot be upscaled ("" = it can). */
    upWhy(i) {
      const s = this.seg(i); if (!s) return "Нет отрезка";
      if (C.isFootage(s)) return "Футаж «как есть» не апскейлится (переключите его на перегенерацию)";
      if (s.freeze?.up) return "Зафиксирован уже после апскейла";
      if (i >= this.genCount()) return "Отрезок за маркером конца";
      if (this.run.active) return "Идёт генерация";
      return "";
    },

    /** Upscale segment i with `up` (a take with exactly this state is reused, else only this segment runs). */
    upscaleSeg(i, up) {
      const why = this.upWhy(i); if (why) { this.toast(why, true); return; }
      if (!this.upAvail()) { this.toast(this.upUnavailText(), true); return; }
      const st = this.segGenState(i);
      const s = this.seg(i);
      if (!st.ok && !s.freeze) { this.toast(st.why, true); return; }
      up = C.normalizeUpscale(up); if (!up) return;
      this.mutate((p) => { p.segments[i].upscale = up; }, { render: "none" });
      const sig = this.sigs()[i], t = (s.takes || []).find((x) => x.sig === sig);
      if (t) { this.selectTake(i, t.id, true); this.toast(`Отрезок ${i + 1}: апскейл ${this.upText(up)} уже есть — выбран его дубль`); return; }
      this.renderAll();
      this.sel = i;
      this.generate({ upto: i, only: i });
      this.toast(`Отрезок ${i + 1}: апскейл ${this.upText(up)} → ${this.upCanvas(up).join("×")} · ${this.upInputLabel(up.method)}`);
    },

    removeUpscale(i) {
      const s = this.seg(i); if (!s?.upscale) return;
      this.mutate((p) => { p.segments[i].upscale = null; }, { render: "none" });
      const sig = this.sigs()[i], t = (s.takes || []).find((x) => x.sig === sig);
      if (t) this.selectTake(i, t.id, true); else this.renderAll();
      this.toast(`Отрезок ${i + 1}: апскейл убран` + (t ? " — выбран дубль без апскейла" : ""));
    },

    /** Segments «↑ Апскейл» (header) covers: generated part of the timeline, not footage as is, not frozen after an upscale. */
    upList() {
      const out = [];
      for (let i = 0; i < this.genCount(); i++) { const s = this.seg(i); if (!C.isFootage(s) && !s.freeze?.up) out.push(i); }
      return out;
    },
    upMp(u) { const [w, hh] = this.upCanvas(u); return `${w}×${hh}`; },   // the Мп are in upText
    /** «≈N фрагм. по времени» note for a clip length (temporal chunks of the upscale). */
    upChunkNote(frames, method = this.upDefault().method) { const [n] = C.upscaleChunking(this.p.settings, frames, method); return n > 1 ? `${n} фрагм. по времени` : ""; },

    /** Header «↑ Апскейл»: the whole video — every clip upscaled with the settings (or `up`), one run; per-segment
     *  windows and keys, so ready clips come from the cache and an interrupted run resumes. */
    upscaleAll(up = this.upDefault()) {
      if (!this.upAvail()) { this.toast(this.upUnavailText(), true); return; }
      if (this.run.active) { this.toast("Идёт генерация", true); return; }
      const list = this.upList();
      if (!list.length) { this.toast("Нечего увеличивать: на таймлайне только футаж «как есть» или зафиксированные после апскейла клипы", true); return; }
      up = C.normalizeUpscale(up);
      this.mutate((p) => { list.forEach((i) => { p.segments[i].upscale = up; }); }, { render: "all" });
      this.generate({});
      this.toast(`↑ Апскейл всего ролика: ${list.length} отр. · ${this.upText(up)} → ${this.upMp(up)} · ${this.upInputLabel(up.method)} · готовые берутся из кэша`);
    },
    upOverrideSub(fn) {
      const d = this.upDefault(), sub = [{ label: `По настройкам: ${this.upText(d)} → ${this.upMp(d)}`, fn: () => fn(d) }, "sep"];
      for (const m of C.SEG_UPSCALE_METHODS) {
        const pm = C.profileUpscale(this.p.settings, m);   // the method's own profile (σ, quality, tiles…), only the size chosen here
        const mk = (mp) => C.normalizeUpscale({ ...pm, method: m, mp });
        const items = this.upSizeChoices(pm).filter((c) => c.mp).map((c) => ({ label: `${c.mp.toFixed(1)} Мп → ${c.w}×${c.h}` + (c.small ? " · не больше кадра" : ""), dis: c.small, fn: () => fn(mk(c.mp)) }));
        items.push("sep", { label: "Свой размер, Мп…", fn: () => { const x = this.upAskMp(pm); if (x) fn(mk(x)); } });
        sub.push({ label: LBL[m], title: this.upInputLabel(m), sub: items });
      }
      return sub;
    },

    // ------------------------------------------------------------ UI pieces
    upMenuEntries(i) {
      const s = this.seg(i), why = this.upWhy(i), cur = s.upscale && C.upscalable(s) ? s.upscale : null;
      return [
        { label: cur ? `↑ Апскейл отрезка (${this.upText(cur)})` : "↑ Апскейл отрезка", dis: !!why, title: why || `Только этот клип: ${this.upText(this.upDefault())} → ${this.upMp(this.upDefault())} (метод и размер — Настройки → «Апскейл»)`,
          sub: [...this.upOverrideSub((u) => this.upscaleSeg(i, u)), "sep", { label: "Убрать апскейл", fn: () => this.removeUpscale(i), dis: !cur }] },
      ];
    },

    /** ↑ button on a clip: upscale only this clip with the settings. */
    upClipButton(i, mk) {
      const s = this.seg(i), why = this.upWhy(i), u = this.upDefault();
      const done = !!(s.result?.upscale && !this.isStale(i));
      return mk("<b style='font-size:13px'>↑</b>", done ? `Апскейл готов: ${this.upText(s.upscale)} · правый клик по клипу — другой метод или «Убрать апскейл»` : `↑ Апскейл этого клипа: ${this.upText(u)} → ${this.upMp(u)} (${this.upInputLabel(u.method)})`,
        () => this.upscaleSeg(i, u), !!why || done);
    },

    upClipTags(clip, i) {
      const s = this.seg(i);
      const box = h("div", { class: "h3z-uptags" });
      if (s.upscale && C.upscalable(s)) box.append(h("span", { class: "up" + (s.result?.upscale && !this.isStale(i) ? " done" : ""), title: `Апскейл: ${this.upText(s.upscale)}` + (s.result?.upscale && !this.isStale(i) ? " · готов" : " · будет сделан при генерации") }, `↑${this.upMpVal(s.upscale)}Мп`));
      else if (s.freeze?.up) box.append(h("span", { class: "up done", title: "Зафиксирован после апскейла" }, "↑"));
      if (box.children.length) clip.append(box);
    },

    /** Tiled upscale: tile size (presets / own W×H, multiple of 32) + overlap, and the resulting grid. */
    upTileSettings(f, put) {
      const [bw, bh] = C.workResolution(this.p.settings), [W, H] = this.upCanvas(f);
      const g = C.tileGrid(bw, bh, W, H, f);
      const PRE = [[768, 448], [960, 544], [1152, 640], [1280, 704]];
      const cur = f.tile ? f.tile.join("x") : "";
      const custom = !!f.tile && !PRE.some((p) => p.join("x") === cur);
      const sz = h("select", { class: "h3z-sel", title: "Размер плитки. Больше — меньше плиток и быстрее, но больше VRAM; меньше — больше деталей на плитку, дольше. Кратно 32." },
        h("option", { value: "", selected: !f.tile }, `как кадр отрезка · ${bw}×${bh}`),
        ...PRE.map((p) => h("option", { value: p.join("x"), selected: cur === p.join("x") }, `${p[0]}×${p[1]}` + (p[1] === 448 ? " (≈768×432)" : p[1] === 704 ? " (≈1280×720)" : ""))),
        h("option", { value: "custom", selected: custom }, custom ? `свой · ${f.tile[0]}×${f.tile[1]}` : "свой W×H…"));
      sz.onchange = () => {
        if (sz.value === "") return put({ tile: null });
        if (sz.value !== "custom") return put({ tile: sz.value.split("x").map(Number) });
        const v = prompt("Размер плитки, W×H (кратно 32, 256–2048)", f.tile ? f.tile.join("x") : `${bw}x${bh}`);
        const m = v && v.match(/(\d+)\D+(\d+)/); if (m) put({ tile: [Number(m[1]), Number(m[2])] }); else put({});
      };
      const autoOv = Math.max(4, Math.min(16, Math.floor(Math.min(g.tw, g.th) / 16 / 3)));
      const ov = h("select", { class: "h3z-sel", title: "Перекрытие плиток (в латентных клетках по 16 px): больше — мягче швы, больше плиток" },
        h("option", { value: 0, selected: !f.tile_ov }, `перекрытие авто · ${autoOv * 16} px`),
        ...[4, 8, 12, 16, 24, 32].map((c) => h("option", { value: c, selected: f.tile_ov === c }, `${c * 16} px · ${c} кл.`)));
      ov.onchange = () => put({ tile_ov: Number(ov.value) || null });
      return h("div", { class: "h3z-tileset" }, h("div", { class: "h3z-row wrap" }, sz, ov),
        h("div", { class: "h3z-note" }, `Сетка ${g.cols}×${g.rows} = ${g.cols * g.rows} плит. · плитка ${g.tw}×${g.th} · перекрытие ${g.ov} px → ${W}×${H}. Каждый шаг считает все плитки.`));
    },

    /** Card block: status + «↑ Апскейл отрезка» / «Убрать апскейл» (method and size live in the settings). */
    upscaleBlock(i) {
      const s = this.seg(i), why = this.upWhy(i), u = this.upDefault();
      const res = s.result?.upscale && !this.isStale(i) ? s.result : null;
      const status = res ? h("div", { class: "h3z-note ok" }, `↑ Готов: ${(res.wh || []).join("×")} · ${this.upText(res.upscale)}` + (res.up_input ? ` · вход: ${{ learned: "обученный апскейлер", rtx: "RTX VSR", resize: "уменьшение (VAE)" }[res.up_input] || res.up_input}` : ""))
        : s.upscale && C.upscalable(s) ? h("div", { class: "h3z-note warn" }, `↑ ${this.upText(s.upscale)} задан — будет сделан при генерации`) : null;
      return h("div", { class: "h3z-upblock" },
        h("div", { class: "h3z-lbl" }, "Апскейл отрезка", h("em", null, why || `${this.upText(u)} → ${this.upMp(u)}`)),
        status, !this.upAvail() ? h("div", { class: "h3z-note err" }, this.upUnavailText()) : null,
        h("div", { class: "h3z-row wrap" },
          h("button", { class: "h3z-btn sm primary", disabled: !!why || undefined, title: why || "Только этот клип (результат — новый дубль, звук 1:1)", html: "<b>↑</b><span>Апскейл отрезка</span>", onclick: () => this.upscaleSeg(i, u) }),
          s.upscale ? h("button", { class: "h3z-btn sm", onclick: () => this.removeUpscale(i) }, "Убрать апскейл") : null),
        h("div", { class: "h3z-note" }, "Метод и размер — Настройки → «Апскейл». Весь ролик — кнопка «↑ Апскейл» в шапке."));
    },

    /** Header «↑ Апскейл» (whole video); right click — another method / size for this run. */
    upHeaderButton() {
      const u = this.upDefault(), n = this.upList().length;
      const b = h("button", { class: "h3z-btn h3z-upall", title: `↑ Апскейл всего ролика: ${n} отр. · ${this.upText(u)} → ${this.upMp(u)} (${this.upInputLabel(u.method)})\nКаждый отрезок увеличивается своим окном и дорабатывается коротким проходом H3, звук 1:1; готовые берутся из кэша.\nПравый клик — другой метод или размер`,
        html: "<b>↑</b><span>Апскейл</span>", onclick: () => this.upscaleAll() });
      b.addEventListener("contextmenu", (e) => this.openMenu(e, "↑ Апскейл всего ролика", this.upOverrideSub((x) => this.upscaleAll(x))));
      return b;
    },

    /** Settings section «Апскейл»: method, target size, strength, RTX quality. */
    /** Change the profile of upscale method m (and select it): the other methods' profiles are never touched. */
    upSetProfile(m, patch = {}, select = false) {
      const pr0 = C.upscaleProfile(this.p.settings, m);
      this.mutate((p) => {
        const st = p.settings;
        st.upscale_profiles = { ...(st.upscale_profiles || {}), [m]: C.normalizeUpscaleProfile(m, { ...pr0, ...patch }) };
        const sel = select ? m : (st.seg_upscale || {}).method || m;
        st.seg_upscale = C.profileUpscale(st, sel);
      });
      if (this.globScope()) this.globPut({ upscale_profiles: this.p.settings.upscale_profiles, seg_upscale: this.p.settings.seg_upscale });
    },
    upscaleSection(g, set) {
      // every method has its own profile (C.normalizeUpscaleProfiles): the pills only select one, nothing is reset
      const m0 = (C.normalizeUpscale(g.seg_upscale) || this.upDefault()).method;
      const pr = C.upscaleProfile(g, m0), f = C.profileUpscale(g, m0);
      const put = (x) => this.upSetProfile(m0, x);
      const pill = (on, label, title, fn) => h("div", { class: "h3z-pill" + (on ? " on" : ""), title, onclick: fn }, label);
      const methods = h("div", { class: "h3z-pills h3z-upmethods" }, ...C.SEG_UPSCALE_METHODS.map((m) => pill(m === m0, LBL[m],
        { latent: "Обученный латентный апскейлер H3 (быстро, без декода/энкода) → доработка", rtx: "RTX VSR по кадрам → VAE энкод → бережная доработка (качество)", tiles: "Апскейл → синхронные плитки (SyncTile): каждая плитка видит промпт и референсы отрезка" }[m] + ` · вход: ${this.upInputLabel(m)} · у метода свои настройки`,
        () => { if (m !== m0) this.upSetProfile(m, {}, true); })));
      const [bw, bh] = C.workResolution(g), [cw, chh] = this.upCanvas(f);
      const choices = this.upSizeChoices(f).filter((c) => c.mp), custom = !choices.some((c) => c.on);
      const size = h("select", { class: "h3z-sel up-mp", title: "Размер кадра после апскейла в мегапикселях. Пропорции — как у проекта, стороны кратны 32" },
        choices.map((c) => h("option", { value: c.mp, selected: c.on, disabled: c.small || undefined }, `${c.mp.toFixed(1)} Мп → ${c.w}×${c.h}` + (c.small ? " (не больше кадра)" : ""))),
        h("option", { value: "custom", selected: custom }, custom ? `свой · ${f.mp} Мп → ${cw}×${chh}` : "свой размер, Мп…"));
      size.onchange = () => {
        if (size.value !== "custom") return put({ mp: Number(size.value) });
        const x = this.upAskMp(f); if (x) put({ mp: x }); else put({});
      };
      const scales = h("div", null, size, h("div", { class: "h3z-note" }, `Кадр проекта ${bw}×${bh} (${(bw * bh / 1e6).toFixed(2)} Мп) → `, h("b", null, `${cw}×${chh}`), ` (${(cw * chh / 1e6).toFixed(2)} Мп, ×${(cw / bw).toFixed(2)})`));
      // temporal chunks of this method (sequential, like ComfyUI-H3-WindowedRefine): on/off + approximate length + overlap
      const on = !!pr.chunk, cs = Number(pr.chunk_sec) || 5, co = Number(pr.chunk_overlap) || 1;
      const SECS = [3, 4, 5, 6, 8, 10, 15];
      const chk = h("input", { type: "checkbox", class: "up-chunk", checked: on || undefined });
      chk.onchange = () => put({ chunk: chk.checked });
      const chunkSel = h("select", { class: "h3z-sel up-chunksec", title: "Длинный клип увеличивается по кускам: каждый кусок — свой апскейл и доработка, затем VRAM освобождается. Меньше кусок — меньше VRAM, но больше перекрытий (дольше). Длина прилипает к сетке H3 (17k+5 кадров)" },
        SECS.concat(SECS.includes(cs) ? [] : [cs]).sort((a, b) => a - b).map((x) => h("option", { value: x, selected: x === cs }, `≈${x} с → ${C.snapFrames(x * C.FPS)} кадр. (${(C.snapFrames(x * C.FPS) / C.FPS).toFixed(2)} с)` + (x === 5 ? " · по умолчанию" : ""))));
      chunkSel.onchange = () => put({ chunk_sec: Number(chunkSel.value) });
      const ovSel = h("select", { class: "h3z-sel up-chunkov", title: "Перекрытие соседних кусков: следующий кусок продолжает чистый хвост предыдущего (как продление), стык смешивается при декодировании" },
        [1, 2, 3].map((o) => h("option", { value: o, selected: o === co }, `${17 * o + 5} кадр. ≈ ${((17 * o + 5) / C.FPS).toFixed(2)} с` + (o === 1 ? " · по умолчанию" : ""))));
      chunkSel.disabled = ovSel.disabled = !on;
      ovSel.onchange = () => put({ chunk_overlap: Number(ovSel.value) });
      const ex = on ? [124, 241, 362].map((fr) => `${(fr / C.FPS).toFixed(0)} с → ${C.upscaleChunking(g, fr, m0)[0]}`).join(" · ") : "";
      const chunks = h("div", null, h("label", { class: "h3z-row", style: { gap: "6px", alignItems: "center" } }, chk, h("span", null, `По кускам (${LBL[m0]})`)),
        h("div", { class: "h3z-grid2" }, chunkSel, ovSel),
        h("div", { class: "h3z-note" }, on ? `Кусков на клип: ${ex}.` + (m0 === "tiles" ? " Плитки работают внутри каждого куска." : "") : "Клип целиком за один проход — нужно больше VRAM."));
      const sig = h("select", { class: "h3z-sel up-sigma", title: "Сила доработки (σ старта): меньше — бережнее, больше — больше новых деталей" },
        [0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6].concat([0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6].some((v) => Math.abs(f.sigma - v) < 1e-6) ? [] : [f.sigma]).sort((a, b) => a - b)
          .map((v) => h("option", { value: v, selected: Math.abs(f.sigma - v) < 1e-6 }, `σ ${v.toFixed(2)}` + (Math.abs(C.SEG_UPSCALE_SIGMA[m0] - v) < 1e-6 ? " · по умолчанию" : ""))));
      sig.onchange = () => put({ sigma: Number(sig.value) });
      const st2 = C.passParams(this.p, Math.max(0, this.sel), "refine");
      const steps = h("select", { class: "h3z-sel up-steps", title: "Шаги доработки после апскейла (для этого метода)" },
        [0, 3, 4, 5, 6, 8, 10, 12, 16, 20].concat([0, 3, 4, 5, 6, 8, 10, 12, 16, 20].includes(pr.steps) ? [] : [pr.steps]).sort((a, b) => a - b)
          .map((x) => h("option", { value: x, selected: x === pr.steps }, x ? `${x} шаг.` : `как «Этап 2» · ${st2.steps} шаг.`)));
      steps.onchange = () => put({ steps: Number(steps.value) });
      const opt = (k, list, base) => { const e = h("select", { class: "h3z-sel up-" + k }, ["", ...list.filter((x) => x !== pr[k])].concat(pr[k] ? [pr[k]] : []).map((x) => h("option", { value: x, selected: x === (pr[k] || "") }, x || `как «Этап 2» · ${base}`))); e.onchange = () => put({ [k]: e.value }); return e; };
      const smp = opt("sampler", this.opts?.samplers || [], st2.sampler), sch = opt("scheduler", this.opts?.schedulers || [], st2.scheduler);
      const q = m0 === "rtx" ? h("select", { class: "h3z-sel up-quality", title: "Качество RTX VSR" }, C.RTX_QUALITIES.map((x) => h("option", { value: x, selected: f.quality === x }, x))) : null;
      if (q) q.onchange = () => put({ quality: q.value });
      return h("details", { class: "h3z-det" }, h("summary", null, "Апскейл"), h("div", { class: "in" },
        this.field("Метод", methods), h("div", { class: "h3z-note" }, `Ниже — настройки метода «${LBL[m0]}». У каждого метода свои: переключение их не сбрасывает.`),
        this.field("Размер", scales), this.field("Куски по времени", chunks),
        h("div", { class: "h3z-grid2" }, this.field("Сила доработки", sig), this.field("Шаги доработки", steps)),
        h("div", { class: "h3z-grid2" }, this.field("Сэмплер", smp), this.field("Расписание", sch)),
        q ? this.field("RTX VSR", q) : null,
        m0 === "tiles" ? this.field("Плитки", this.upTileSettings(f, put)) : null,
        !this.upAvail() ? h("div", { class: "h3z-note err" }, this.upUnavailText()) : null,
        h("div", { class: "h3z-note" }, "«↑ Апскейл» в шапке — весь ролик (каждый отрезок своим окном, длинные — по кускам, звук 1:1, готовые из кэша). ↑ на клипе или в его меню — только этот клип. Результат — новый дубль, старый можно вернуть.")));
    },
  });
}

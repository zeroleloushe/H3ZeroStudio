// H3ZeroStudio: «Апскейл отрезка» — per-segment upscale + low-strength refine (backend: h3s_upscale.py).
// The upscale is a segment field ({method, scale, sigma, quality}); it is part of the take snapshot, so an upscaled
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
    upText(u) { return u ? `${LBL[u.method]} ×${u.scale}` : ""; },
    upCanvas(u) { const [w, hh] = C.workResolution(this.p.settings); return C.upscaleCanvas(w, hh, u.scale); },

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
    upMp(u) { const [w, hh] = this.upCanvas(u); return `${w}×${hh} · ${(w * hh / 1e6).toFixed(1)} Мп`; },

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
      for (const m of C.SEG_UPSCALE_METHODS) for (const sc of C.SEG_UPSCALE_SCALES) {
        const u = C.normalizeUpscale({ method: m, scale: sc });
        sub.push({ label: `${LBL[m]} ×${sc} → ${this.upMp(u)}`, title: this.upInputLabel(m), fn: () => fn(u) });
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
      if (s.upscale && C.upscalable(s)) box.append(h("span", { class: "up" + (s.result?.upscale && !this.isStale(i) ? " done" : ""), title: `Апскейл: ${this.upText(s.upscale)}` + (s.result?.upscale && !this.isStale(i) ? " · готов" : " · будет сделан при генерации") }, `↑×${s.upscale.scale}`));
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
    upscaleSection(g, set) {
      const f = C.normalizeUpscale(g.seg_upscale) || this.upDefault();
      const put = (x) => set("seg_upscale", C.normalizeUpscale({ ...f, ...x }));
      const pill = (on, label, title, fn) => h("div", { class: "h3z-pill" + (on ? " on" : ""), title, onclick: fn }, label);
      const methods = h("div", { class: "h3z-pills" }, ...C.SEG_UPSCALE_METHODS.map((m) => pill(f.method === m, LBL[m],
        { latent: "Обученный латентный апскейлер H3 (быстро, без декода/энкода) → доработка σ 0.4", rtx: "RTX VSR по кадрам → VAE энкод → бережная доработка σ 0.25 (качество)", tiles: "Апскейл → синхронные плитки (SyncTile): каждая плитка видит промпт и референсы отрезка" }[m] + ` · вход: ${this.upInputLabel(m)}`,
        () => put({ method: m, sigma: C.SEG_UPSCALE_SIGMA[m] }))));
      const scales = h("div", { class: "h3z-pills" }, ...C.SEG_UPSCALE_SCALES.map((sc) => pill(f.scale === sc, (() => { const [w, hh] = this.upCanvas({ scale: sc }); return `${(w * hh / 1e6).toFixed(1)} Мп · ${w}×${hh} (×${sc})`; })(), "Итоговый размер (мегапиксели кадра)", () => put({ scale: sc }))));
      const sig = h("select", { class: "h3z-sel", title: "Сила доработки (σ старта): меньше — бережнее, больше — больше новых деталей" },
        [0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6].map((v) => h("option", { value: v, selected: Math.abs(f.sigma - v) < 1e-6 }, `σ ${v.toFixed(2)}` + (Math.abs(C.SEG_UPSCALE_SIGMA[f.method] - v) < 1e-6 ? " · по умолчанию" : ""))));
      sig.onchange = () => put({ sigma: Number(sig.value) });
      const q = f.method === "rtx" ? h("select", { class: "h3z-sel", title: "Качество RTX VSR" }, C.RTX_QUALITIES.map((x) => h("option", { value: x, selected: f.quality === x }, x))) : null;
      if (q) q.onchange = () => put({ quality: q.value });
      return h("details", { class: "h3z-det" }, h("summary", null, "Апскейл"), h("div", { class: "in" },
        this.field("Метод", methods), this.field("Размер", scales), h("div", { class: "h3z-grid2" }, this.field("Сила доработки", sig), q ? this.field("RTX VSR", q) : h("div")),
        f.method === "tiles" ? this.field("Плитки", this.upTileSettings(f, put)) : null,
        !this.upAvail() ? h("div", { class: "h3z-note err" }, this.upUnavailText()) : null,
        h("div", { class: "h3z-note" }, "«↑ Апскейл» в шапке — весь ролик (каждый отрезок своим окном, звук 1:1, готовые из кэша). ↑ на клипе или в его меню — только этот клип. Результат — новый дубль, старый можно вернуть.")));
    },
  });
}

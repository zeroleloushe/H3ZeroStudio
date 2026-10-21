import { T } from "./h3s_i18n.js";
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
      return T("Апскейл недоступен: нет ни обученного латентного апскейлера H3 (нода MinimaxH3LatentUpscaler3D + модель minimax_h3_latent_upscaler_3d_bf16.safetensors в models/latent_upscale_models), ни RTX VSR (nvidia-vfx). Установите одно из них и перезапустите ComfyUI.");
    },

    /** What really makes the start latent for a method on this machine (mirror of h3s_upscale.effective_input). */
    upInputLabel(method) {
      const c = this.upCaps();
      if (!this.upKnown()) return method === "rtx" ? "RTX VSR" : T("обученный латентный апскейлер");
      if (method === "rtx") return c.rtx ? "RTX VSR" : c.learned ? T("нет RTX VSR → обученный апскейлер") : T("недоступен: нет RTX VSR и модели апскейлера");
      return c.learned ? T("обученный латентный апскейлер") : c.rtx ? T("нет модели апскейлера → RTX VSR") : T("недоступен: нет модели апскейлера и RTX VSR");
    },

    upDefault() { return C.normalizeUpscale(this.p.settings.seg_upscale) || C.normalizeUpscale({ method: "latent", scale: 2 }); },
    upText(u) { return u ? T("{0} · {1} Мп", LBL[u.method], this.upMpVal(u)) : ""; },
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
      const v = prompt(T("Размер после апскейла в мегапикселях (сейчас кадр {0}×{1} = {2} Мп; итог кратен 32, пропорции те же)", bw, bh, (bw * bh / 1e6).toFixed(2)), String(cur?.mp ?? 2));
      const x = Number(String(v ?? "").replace(",", "."));
      return v != null && x > 0 ? Math.min(C.SEG_UPSCALE_MP_RANGE[1], Math.max(C.SEG_UPSCALE_MP_RANGE[0], x)) : null;
    },

    /** Why segment i cannot be upscaled ("" = it can). */
    upWhy(i) {
      const s = this.seg(i); if (!s) return T("Нет отрезка");
      if (s.freeze?.up) return T("Зафиксирован уже после апскейла");
      if (i >= this.genCount()) return T("Отрезок за маркером конца");
      if (this.run.active) return T("Идёт генерация");
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
      if (t) { this.selectTake(i, t.id, true); this.toast(T("Отрезок {0}: апскейл {1} уже есть — выбран его дубль", i + 1, this.upText(up))); return; }
      this.renderAll();
      this.sel = i;
      this.generate({ upto: i, only: i });
      this.toast(T("Отрезок {0}: апскейл {1} → {2} · {3}", i + 1, this.upText(up), this.upCanvas(up).join("×"), this.upInputLabel(up.method)));
    },

    removeUpscale(i) {
      const s = this.seg(i); if (!s?.upscale) return;
      this.mutate((p) => { p.segments[i].upscale = null; }, { render: "none" });
      const sig = this.sigs()[i], t = (s.takes || []).find((x) => x.sig === sig);
      if (t) this.selectTake(i, t.id, true); else this.renderAll();
      this.toast(T("Отрезок {0}: апскейл убран", i + 1) + (t ? T(" — выбран дубль без апскейла") : ""));
    },

    /** Segments «↑ Апскейл» (header) covers: generated part of the timeline, not footage as is, not frozen after an upscale. */
    upList() {
      const out = [];
      for (let i = 0; i < this.genCount(); i++) { const s = this.seg(i); if (!s.freeze?.up) out.push(i); }
      return out;
    },
    upMp(u) { const [w, hh] = this.upCanvas(u); return `${w}×${hh}`; },   // the Мп are in upText
    /** «≈N фрагм. по времени» note for a clip length (temporal chunks of the upscale). */
    upChunkNote(frames, method = this.upDefault().method) { const [n] = C.upscaleChunking(this.p.settings, frames, method); return n > 1 ? T("{0} фрагм. по времени", n) : ""; },

    /** Header «↑ Апскейл»: the whole video — every clip upscaled with the settings (or `up`), one run; per-segment
     *  windows and keys, so ready clips come from the cache and an interrupted run resumes. */
    upscaleAll(up = this.upDefault()) {
      if (!this.upAvail()) { this.toast(this.upUnavailText(), true); return; }
      if (this.run.active) { this.toast(T("Идёт генерация"), true); return; }
      const list = this.upList();
      const spans = (this.p.regions || []).filter((rg) => this.regionTake(rg)?.fresh).map((rg) => rg.id);   // applied ✂ spans too
      if (!list.length && !spans.length) { this.toast(T("Нечего увеличивать: все клипы зафиксированы после апскейла"), true); return; }
      up = C.normalizeUpscale(up);
      this.mutate((p) => { list.forEach((i) => { p.segments[i].upscale = up; }); for (const r of p.regions || []) if (spans.includes(r.id)) r.upscale = up; }, { render: "all" });
      this.generate({});
      this.toast(T("↑ Апскейл всего ролика: {0} отр.", list.length) + (spans.length ? T(" + {0} участк.", spans.length) : "") + T(" · {0} → {1} · {2} · готовые берутся из кэша", this.upText(up), this.upMp(up), this.upInputLabel(up.method)));
    },
    upOverrideSub(fn) {
      const d = this.upDefault(), sub = [{ label: T("По настройкам: {0} → {1}", this.upText(d), this.upMp(d)), fn: () => fn(d) }, "sep"];
      for (const m of C.SEG_UPSCALE_METHODS) {
        const pm = C.profileUpscale(this.p.settings, m);   // the method's own profile (σ, quality, tiles…), only the size chosen here
        const mk = (mp) => C.normalizeUpscale({ ...pm, method: m, mp });
        const items = this.upSizeChoices(pm).filter((c) => c.mp).map((c) => ({ label: T("{0} Мп → {1}×{2}", c.mp.toFixed(1), c.w, c.h) + (c.small ? T(" · не больше кадра") : ""), dis: c.small, fn: () => fn(mk(c.mp)) }));
        items.push("sep", { label: T("Свой размер, Мп…"), fn: () => { const x = this.upAskMp(pm); if (x) fn(mk(x)); } });
        sub.push({ label: LBL[m], title: this.upInputLabel(m), sub: items });
      }
      return sub;
    },

    // ------------------------------------------------------------ UI pieces
    upMenuEntries(i) {
      const s = this.seg(i), why = this.upWhy(i), cur = s.upscale && C.upscalable(s) ? s.upscale : null;
      return [
        { label: cur ? T("↑ Апскейл отрезка ({0})", this.upText(cur)) : T("↑ Апскейл отрезка"), dis: !!why, title: why || T("Только этот клип: {0} → {1} (метод и размер — Настройки → «Апскейл»)", this.upText(this.upDefault()), this.upMp(this.upDefault())),
          sub: [...this.upOverrideSub((u) => this.upscaleSeg(i, u)), "sep", { label: T("Убрать апскейл"), fn: () => this.removeUpscale(i), dis: !cur }] },
      ];
    },

    /** ↑ button on a clip: upscale only this clip with the settings. */
    upClipButton(i, mk) {
      const s = this.seg(i), why = this.upWhy(i), u = this.upDefault();
      const done = !!(s.result?.upscale && !this.isStale(i));
      return mk("<b style='font-size:13px'>↑</b>", done ? T("Апскейл готов: {0} · правый клик по клипу — другой метод или «Убрать апскейл»", this.upText(s.upscale)) : T("↑ Апскейл этого клипа: {0} → {1} ({2})", this.upText(u), this.upMp(u), this.upInputLabel(u.method)),
        () => this.upscaleSeg(i, u), !!why || done);
    },

    upClipTags(clip, i) {
      const s = this.seg(i);
      const box = h("div", { class: "h3z-uptags" });
      if (s.upscale && C.upscalable(s)) box.append(h("span", { class: "up" + (s.result?.upscale && !this.isStale(i) ? " done" : ""), title: T("Апскейл: {0}", this.upText(s.upscale)) + (s.result?.upscale && !this.isStale(i) ? T(" · готов") : T(" · будет сделан при генерации")) }, T("↑{0}Мп", this.upMpVal(s.upscale))));
      else if (s.freeze?.up) box.append(h("span", { class: "up done", title: T("Зафиксирован после апскейла") }, "↑"));
      if (box.children.length) clip.append(box);
    },

    /** Tiled upscale: tile size (presets / own W×H, multiple of 32) + overlap, and the resulting grid. */
    upTileSettings(f, put) {
      const [bw, bh] = C.workResolution(this.p.settings), [W, H] = this.upCanvas(f);
      const g = C.tileGrid(bw, bh, W, H, f);
      const PRE = [[768, 448], [960, 544], [1152, 640], [1280, 704]];
      const cur = f.tile ? f.tile.join("x") : "";
      const custom = !!f.tile && !PRE.some((p) => p.join("x") === cur);
      const sz = h("select", { class: "h3z-sel", title: T("Размер плитки. Больше — меньше плиток и быстрее, но больше VRAM; меньше — больше деталей на плитку, дольше. Кратно 32.") },
        h("option", { value: "", selected: !f.tile }, T("как кадр отрезка · {0}×{1}", bw, bh)),
        ...PRE.map((p) => h("option", { value: p.join("x"), selected: cur === p.join("x") }, `${p[0]}×${p[1]}` + (p[1] === 448 ? " (≈768×432)" : p[1] === 704 ? " (≈1280×720)" : ""))),
        h("option", { value: "custom", selected: custom }, custom ? T("свой · {0}×{1}", f.tile[0], f.tile[1]) : T("свой W×H…")));
      sz.onchange = () => {
        if (sz.value === "") return put({ tile: null });
        if (sz.value !== "custom") return put({ tile: sz.value.split("x").map(Number) });
        const v = prompt(T("Размер плитки, W×H (кратно 32, 256–2048)"), f.tile ? f.tile.join("x") : `${bw}x${bh}`);
        const m = v && v.match(/(\d+)\D+(\d+)/); if (m) put({ tile: [Number(m[1]), Number(m[2])] }); else put({});
      };
      const autoOv = Math.max(4, Math.min(16, Math.floor(Math.min(g.tw, g.th) / 16 / 3)));
      const ov = h("select", { class: "h3z-sel", title: T("Перекрытие плиток (в латентных клетках по 16 px): больше — мягче швы, больше плиток") },
        h("option", { value: 0, selected: !f.tile_ov }, T("перекрытие авто · {0} px", autoOv * 16)),
        ...[4, 8, 12, 16, 24, 32].map((c) => h("option", { value: c, selected: f.tile_ov === c }, T("{0} px · {1} кл.", c * 16, c))));
      ov.onchange = () => put({ tile_ov: Number(ov.value) || null });
      return h("div", { class: "h3z-tileset" }, h("div", { class: "h3z-row wrap" }, sz, ov),
        h("div", { class: "h3z-note" }, T("Сетка {0}×{1} = {2} плит. · плитка {3}×{4} · перекрытие {5} px → {6}×{7}. Каждый шаг считает все плитки.", g.cols, g.rows, g.cols * g.rows, g.tw, g.th, g.ov, W, H)));
    },

    /** Card block: status + «↑ Апскейл отрезка» / «Убрать апскейл» (method and size live in the settings). */
    upscaleBlock(i) {
      const s = this.seg(i), why = this.upWhy(i), u = this.upDefault();
      const res = s.result?.upscale && !this.isStale(i) ? s.result : null;
      const status = res ? h("div", { class: "h3z-note ok" }, T("↑ Готов: {0} · {1}", (res.wh || []).join("×"), this.upText(res.upscale)) + (res.up_input ? T(" · вход: {0}", { learned: T("обученный апскейлер"), rtx: "RTX VSR", resize: T("уменьшение (VAE)") }[res.up_input] || res.up_input) : ""))
        : s.upscale && C.upscalable(s) ? h("div", { class: "h3z-note warn" }, T("↑ {0} задан — будет сделан при генерации", this.upText(s.upscale))) : null;
      return h("div", { class: "h3z-upblock" },
        h("div", { class: "h3z-lbl" }, T("Апскейл отрезка"), h("em", null, why || `${this.upText(u)} → ${this.upMp(u)}`)),
        status, !this.upAvail() ? h("div", { class: "h3z-note err" }, this.upUnavailText()) : null,
        h("div", { class: "h3z-row wrap" },
          h("button", { class: "h3z-btn sm primary", disabled: !!why || undefined, title: why || T("Только этот клип (результат — новый дубль, звук 1:1)"), html: T("<b>↑</b><span>Апскейл отрезка</span>"), onclick: () => this.upscaleSeg(i, u) }),
          s.upscale ? h("button", { class: "h3z-btn sm", onclick: () => this.removeUpscale(i) }, T("Убрать апскейл")) : null),
        C.isFootage(s) ? h("div", { class: "h3z-note" }, (s.upscale?.method || u.method) === "rtx"
          ? T("Футаж «как есть» + RTX VSR: кадры файла увеличиваются напрямую (без VAE и без доработки) — содержимое не меняется.")
          : T("Футаж «как есть»: его кадры кодируются VAE и проходят тот же апскейл + доработку (σ {0}) — мелкие детали могут слегка измениться. Без изменений — метод RTX VSR. Звук не трогается.", (s.upscale || u).sigma)) : null,
        h("div", { class: "h3z-note" }, T("Метод и размер — Настройки → «Апскейл». Весь ролик — кнопка «↑ Апскейл» в шапке.")));
    },

    // ------------------------------------------------------------ «Апскейл участка» (✂ spans: bridge / prologue / extension / region)
    /** null = no upscale set; done = the applied take carries exactly this upscale. */
    regionUpState(rg) {
      if (!rg?.upscale) return null;
      const tk = this.regionTake(rg), sig = C.regionUpSig(this.p, rg);
      return { done: !!(tk?.fresh && tk.take.result?.up && tk.take.result.upSig === sig), sig };
    },
    upRegionWhy(rg) {
      if (this.run.active) return T("Идёт генерация");
      if (!this.regionTake(rg)?.fresh) return T("Сначала сгенерируйте участок (↻ Пересоздать): апскейл делается из его дубля");
      return "";
    },
    upscaleRegion(id, up) {
      const rg = this.region(id); if (!rg) return;
      const why = this.upRegionWhy(rg); if (why) { this.toast(why, true); return; }
      if (!this.upAvail()) { this.toast(this.upUnavailText(), true); return; }
      up = C.normalizeUpscale(up); if (!up) return;
      this.updateRegion(id, (r) => { r.upscale = up; }, { render: "none" });
      const st = this.regionUpState(this.region(id));
      this.renderAll();
      if (st?.done) { this.toast(T("Участок {0}: апскейл {1} уже есть", this.regionNo(id), this.upText(up))); return; }
      this.generate({ region: id });
      this.toast(T("Участок {0}: апскейл {1} → {2} · {3} (дубль из кэша, звук 1:1)", this.regionNo(id), this.upText(up), this.upCanvas(up).join("×"), this.upInputLabel(up.method)));
    },
    removeRegionUpscale(id) {
      const rg = this.region(id); if (!rg?.upscale) return;
      this.updateRegion(id, (r) => { r.upscale = null; }, { render: "none" });
      this.renderAll(); this.toast(T("Участок {0}: апскейл убран · Ctrl+Z — вернуть", this.regionNo(id)));
    },
    upRegionMenuEntries(id) {
      const rg = this.region(id), why = this.upRegionWhy(rg), cur = rg.upscale;
      return [{ label: cur ? T("↑ Апскейл участка ({0})", this.upText(cur)) : T("↑ Апскейл участка"), dis: !!why, title: why || T("Дубль участка: {0} → {1} (метод и размер — Настройки → «Апскейл»)", this.upText(this.upDefault()), this.upMp(this.upDefault())),
        sub: [...this.upOverrideSub((u) => this.upscaleRegion(id, u)), "sep", { label: T("Убрать апскейл"), fn: () => this.removeRegionUpscale(id), dis: !cur }] }];
    },
    upRegionBlock(rg) {
      const why = this.upRegionWhy(rg), st = this.regionUpState(rg), u = this.upDefault(), res = this.regionTake(rg)?.take.result;
      const status = st?.done ? h("span", { class: "h3z-note ok" }, T("↑ Готов: {0} · {1}", (res.up?.wh || []).join("×"), this.upText(rg.upscale)))
        : st ? h("span", { class: "h3z-note warn" }, T("↑ {0} задан — будет сделан при генерации", this.upText(rg.upscale))) : h("span", { class: "h3z-note" }, `${this.upText(u)} → ${this.upMp(u)}`);
      return h("div", { class: "upr" }, h("div", { class: "h3z-lbl" }, T("Апскейл участка")), h("div", { class: "h3z-row wrap", style: { gap: "8px", alignItems: "center" } },
        h("button", { class: "h3z-btn sm", disabled: !!why || !!st?.done || undefined, title: why || T("Апскейл дубля участка (его окно + доработка, звук 1:1); правый клик по участку — другой метод / размер"), html: T("<b>↑</b><span>Апскейл</span>"), onclick: () => this.upscaleRegion(rg.id, u) }),
        rg.upscale ? h("button", { class: "h3z-btn sm", onclick: () => this.removeRegionUpscale(rg.id) }, T("Убрать")) : null, status));
    },

    /** Header «↑ Апскейл» (whole video); right click — another method / size for this run. */
    upHeaderButton() {
      const u = this.upDefault(), n = this.upList().length;
      const b = h("button", { class: "h3z-btn h3z-upall", title: T("↑ Апскейл всего ролика: {0} отр. · {1} → {2} ({3})\nКаждый отрезок увеличивается своим окном и дорабатывается коротким проходом H3, звук 1:1; готовые берутся из кэша.\nПравый клик — другой метод или размер", n, this.upText(u), this.upMp(u), this.upInputLabel(u.method)),
        html: T("<b>↑</b><span>Апскейл</span>"), onclick: () => this.upscaleAll() });
      b.addEventListener("contextmenu", (e) => this.openMenu(e, T("↑ Апскейл всего ролика"), this.upOverrideSub((x) => this.upscaleAll(x))));
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
        { latent: T("Обученный латентный апскейлер H3 (быстро, без декода/энкода) → доработка"), rtx: T("RTX VSR по кадрам → VAE энкод → бережная доработка (качество)"), tiles: T("Апскейл → синхронные плитки (SyncTile): каждая плитка видит промпт и референсы отрезка") }[m] + T(" · вход: {0} · у метода свои настройки", this.upInputLabel(m)),
        () => { if (m !== m0) this.upSetProfile(m, {}, true); })));
      const [bw, bh] = C.workResolution(g), [cw, chh] = this.upCanvas(f);
      const choices = this.upSizeChoices(f).filter((c) => c.mp), custom = !choices.some((c) => c.on);
      const size = h("select", { class: "h3z-sel up-mp", title: T("Размер кадра после апскейла в мегапикселях. Пропорции — как у проекта, стороны кратны 32") },
        choices.map((c) => h("option", { value: c.mp, selected: c.on, disabled: c.small || undefined }, T("{0} Мп → {1}×{2}", c.mp.toFixed(1), c.w, c.h) + (c.small ? T(" (не больше кадра)") : ""))),
        h("option", { value: "custom", selected: custom }, custom ? T("свой · {0} Мп → {1}×{2}", f.mp, cw, chh) : T("свой размер, Мп…")));
      size.onchange = () => {
        if (size.value !== "custom") return put({ mp: Number(size.value) });
        const x = this.upAskMp(f); if (x) put({ mp: x }); else put({});
      };
      const scales = h("div", null, size, h("div", { class: "h3z-note" }, T("Кадр проекта {0}×{1} ({2} Мп) → ", bw, bh, (bw * bh / 1e6).toFixed(2)), h("b", null, `${cw}×${chh}`), T(" ({0} Мп, ×{1})", (cw * chh / 1e6).toFixed(2), (cw / bw).toFixed(2))));
      // temporal chunks of this method (sequential, like ComfyUI-H3-WindowedRefine): on/off + approximate length + overlap
      const on = !!pr.chunk, cs = Number(pr.chunk_sec) || 5, co = Number(pr.chunk_overlap) || 1;
      const SECS = [3, 4, 5, 6, 8, 10, 15];
      const chk = h("input", { type: "checkbox", class: "up-chunk", checked: on || undefined });
      chk.onchange = () => put({ chunk: chk.checked });
      const chunkSel = h("select", { class: "h3z-sel up-chunksec", title: T("Длинный клип увеличивается по кускам: каждый кусок — свой апскейл и доработка, затем VRAM освобождается. Меньше кусок — меньше VRAM, но больше перекрытий (дольше). Длина прилипает к сетке H3 (17k+5 кадров)") },
        SECS.concat(SECS.includes(cs) ? [] : [cs]).sort((a, b) => a - b).map((x) => h("option", { value: x, selected: x === cs }, T("≈{0} с → {1} кадр. ({2} с)", x, C.snapFrames(x * C.FPS), (C.snapFrames(x * C.FPS) / C.FPS).toFixed(2)) + (x === 5 ? T(" · по умолчанию") : ""))));
      chunkSel.onchange = () => put({ chunk_sec: Number(chunkSel.value) });
      const ovSel = h("select", { class: "h3z-sel up-chunkov", title: T("Перекрытие соседних кусков: следующий кусок продолжает чистый хвост предыдущего (как продление), стык смешивается при декодировании") },
        [1, 2, 3].map((o) => h("option", { value: o, selected: o === co }, T("{0} кадр. ≈ {1} с", 17 * o + 5, ((17 * o + 5) / C.FPS).toFixed(2)) + (o === 1 ? T(" · по умолчанию") : ""))));
      chunkSel.disabled = ovSel.disabled = !on;
      ovSel.onchange = () => put({ chunk_overlap: Number(ovSel.value) });
      const ex = on ? [124, 241, 362].map((fr) => T("{0} с → {1}", (fr / C.FPS).toFixed(0), C.upscaleChunking(g, fr, m0)[0])).join(" · ") : "";
      const chunks = h("div", null, h("label", { class: "h3z-row", style: { gap: "6px", alignItems: "center" } }, chk, h("span", null, T("По кускам ({0})", LBL[m0]))),
        h("div", { class: "h3z-grid2" }, chunkSel, ovSel),
        h("div", { class: "h3z-note" }, on ? T("Кусков на клип: {0}.", ex) + (m0 === "tiles" ? T(" Плитки работают внутри каждого куска.") : "") : T("Клип целиком за один проход — нужно больше VRAM.")));
      const rec = C.SEG_UPSCALE_SIGMA_RECOMMENDED[m0], near = (a, b) => b != null && Math.abs(a - b) < 1e-6;
      const sig = h("select", { class: "h3z-sel up-sigma", title: T("Сила доработки (σ старта): меньше — бережнее, больше — больше новых деталей")
          + (rec ? T(". Для плиток рекомендуется σ {0}: отлично держит согласованность, детали почти не меняются; ниже почти не влияет на картинку.", rec.toFixed(2)) : "") },
        C.SEG_UPSCALE_SIGMA_CHOICES.concat(C.SEG_UPSCALE_SIGMA_CHOICES.some((v) => near(f.sigma, v)) ? [] : [f.sigma]).sort((a, b) => a - b)
          .map((v) => h("option", { value: v, selected: near(f.sigma, v) }, `σ ${v.toFixed(2)}`
            + (near(v, rec) ? T(" · рекомендуется") : "") + (near(C.SEG_UPSCALE_SIGMA[m0], v) ? T(" · по умолчанию") : ""))));
      sig.onchange = () => put({ sigma: Number(sig.value) });
      const st2 = C.passParams(this.p, Math.max(0, this.sel), "refine");
      const steps = h("select", { class: "h3z-sel up-steps", title: T("Шаги доработки после апскейла (для этого метода)") },
        [0, 3, 4, 5, 6, 8, 10, 12, 16, 20].concat([0, 3, 4, 5, 6, 8, 10, 12, 16, 20].includes(pr.steps) ? [] : [pr.steps]).sort((a, b) => a - b)
          .map((x) => h("option", { value: x, selected: x === pr.steps }, x ? T("{0} шаг.", x) : T("как «Этап 2» · {0} шаг.", st2.steps))));
      steps.onchange = () => put({ steps: Number(steps.value) });
      const opt = (k, list, base) => { const e = h("select", { class: "h3z-sel up-" + k }, ["", ...list.filter((x) => x !== pr[k])].concat(pr[k] ? [pr[k]] : []).map((x) => h("option", { value: x, selected: x === (pr[k] || "") }, x || T("как «Этап 2» · {0}", base)))); e.onchange = () => put({ [k]: e.value }); return e; };
      const smp = opt("sampler", this.opts?.samplers || [], st2.sampler), sch = opt("scheduler", this.opts?.schedulers || [], st2.scheduler);
      const q = m0 === "rtx" ? h("select", { class: "h3z-sel up-quality", title: T("Качество RTX VSR") }, C.RTX_QUALITIES.map((x) => h("option", { value: x, selected: f.quality === x }, x))) : null;
      if (q) q.onchange = () => put({ quality: q.value });
      return h("details", { class: "h3z-det" }, h("summary", null, T("Апскейл")), h("div", { class: "in" },
        this.field(T("Метод"), methods), h("div", { class: "h3z-note" }, T("Ниже — настройки метода «{0}». У каждого метода свои: переключение их не сбрасывает.", LBL[m0])),
        this.field(T("Размер"), scales), this.field(T("Куски по времени"), chunks),
        h("div", { class: "h3z-grid2" }, this.field(T("Сила доработки"), sig), this.field(T("Шаги доработки"), steps)),
        h("div", { class: "h3z-grid2" }, this.field(T("Сэмплер"), smp), this.field(T("Расписание"), sch)),
        q ? this.field("RTX VSR", q) : null,
        m0 === "tiles" ? this.field(T("Плитки"), this.upTileSettings(f, put)) : null,
        !this.upAvail() ? h("div", { class: "h3z-note err" }, this.upUnavailText()) : null,
        h("div", { class: "h3z-note" }, T("«↑ Апскейл» в шапке — весь ролик (каждый отрезок своим окном, длинные — по кускам, звук 1:1, готовые из кэша). ↑ на клипе или в его меню — только этот клип. Результат — новый дубль, старый можно вернуть."))));
    },
  });
}

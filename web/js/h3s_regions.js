// H3ZeroStudio: «✂ Участок» — regenerate a time range in the MIDDLE of the video (generated clips or footage).
// The range is snapped to the 17-frame block grid of its scene; H3 samples a window [ws, we) with clean head and
// tail context (native per-modality noise mask: the context latents are kept, only the middle is noised) and the
// backend splices [a, b) back frame-exactly (video) and sample-exactly (sound: correlation offset + short fades at
// the quietest points). Each result is a take of the region («Оригинал» = the clips as they are).
// Stage 5: the same engine regenerates a span ACROSS a cut or a gap (bridge: tail of the shot before + head of the next
// as context), before the first clip (prologue: following context only) and past the end of a shot (extension:
// preceding context only); both seams of a span are level-locked and rated (h3s_seams.span_seams).
// Entry points: the «✂ Участок» toggle on the timeline toolbar (drag on the timeline) and the clip menu.
const SNAP = ["start", "end", "head", "tail", "prompt", "refs", "seed", "upscale"];
const clone = (o) => JSON.parse(JSON.stringify(o));
const rnd = () => Math.floor(Math.random() * 2 ** 31);
const SEAM_TXT = { ok: "шов незаметен", soft: "лёгкий скачок", hard: "резкий шов" };

export function installRegions(Editor, { C, h, ICON }) {
  const proto = Editor.prototype;
  const baseFullCurrent = proto.fullCurrent, baseCompSource = proto.compSource;

  Object.assign(proto, {
    region(id = this.selRegion) { return (this.p.regions || []).find((r) => r.id === id) || null; },
    regionNo(id) { return (this.p.regions || []).findIndex((r) => r.id === id) + 1; },
    regionWin(rg) { return C.regionWindow(this.p, rg, this.items()); },
    updateRegion(id, fn, opt = {}) { this.mutate((p) => { const r = (p.regions || []).find((x) => x.id === id); if (r) fn(r); }, opt); },

    /** The take that is applied right now (fresh = made from exactly the current clips/settings), else null. */
    regionTake(rg) {
      const t = rg?.active_take ? (rg.takes || []).find((x) => x.id === rg.active_take) : null;
      if (!t) return null;
      const sig = C.regionSig(this.p, rg);
      return { take: t, fresh: !!sig && t.sig === sig };
    },
    /** Keys of the region takes the backend applies (the final video is current only with exactly these). */
    appliedRegionKeys() {
      // an upscaled span is another final video: its upscale signature is part of the entry
      return (this.p.regions || []).map((rg) => [rg, this.regionTake(rg)]).filter(([, x]) => x?.fresh).map(([rg, x]) => x.take.key + (rg.upscale ? "^" + C.regionUpSig(this.p, rg) : "")).sort().join(",");
    },

    // ------------------------------------------------------------ mode
    toggleRegionMode(on = !this.regionMode) {
      this.regionMode = !!on;
      this.root?.classList.toggle("h3z-regmode", this.regionMode);
      this.$.regBtn?.classList.toggle("on", this.regionMode);
      if (this.$.regHint) this.$.regHint.style.display = this.regionMode ? "" : "none";
      if (this.regionMode) this.toast("✂ Участок: тяните по видеодорожке — внутри сцены, через склейку / промежуток (мост), в промежутке до сцены (пролог) или за её конец · Esc — выход");
      this.renderTimeline();
    },

    regionToolbar() {
      const $ = this.$;
      $.regBtn = h("button", { class: "h3z-btn sm h3z-regbtn" + (this.regionMode ? " on" : ""), html: "<b>✂</b><span>Участок</span>",
        title: "Пересоздать участок (R): включите и тяните по таймлайну — выделенная часть ролика перегенерируется,\nа видео и звук до и после неё остаются и служат контекстом.\nВыделение может пересекать склейку или промежуток (мост), начинаться в промежутке до сцены (пролог)\nили заходить за её конец (продолжение). Повторное нажатие или Esc — выход",
        onclick: () => this.toggleRegionMode() });
      $.regHint = h("div", { class: "h3z-reghint", style: { display: this.regionMode ? "" : "none" } }, "тяните по видеодорожке — можно через склейку или промежуток · Esc — выход");
      return [$.regBtn, $.regHint];
    },

    /** Capture-phase pointerdown on the tracks while the mode is on: a drag selects a new range. */
    regionPointer(e) {
      if (!this.regionMode || e.button !== 0) return;
      const t = e.target;
      if (t.closest(".h3z-region .eg, .h3z-region .tab, .h3z-ruler, .h3z-vend, .h3z-mk, .h3z-cb, .h3z-ext, .h3z-track.a")) return;
      if (!t.closest(".h3z-track.v")) return;
      e.preventDefault(); e.stopPropagation();
      const f0 = Math.max(0, Math.round(this.frameAt(e.clientX)));
      const sx = e.clientX;
      let moved = false;
      const move = (ev) => {
        if (!moved && Math.abs(ev.clientX - sx) < 4) return;
        moved = true;
        const f = Math.max(0, Math.round(this.frameAt(ev.clientX)));
        this._regDraft = { start: Math.min(f0, f), end: Math.max(f0, f) + 1 };
        this.renderTimeline();
      };
      const up = () => {
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
        const d = moved ? this._regDraft : { start: f0 - 17, end: f0 + 17 };
        this._regDraft = null;
        if (d && this.addRegion(Math.max(0, d.start), d.end)) this.toggleRegionMode(false);   // one range per «✂» press
        else this.renderTimeline();
      };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    },

    addRegion(start, end) {
      const its = this.items();
      const w = C.regionWindow(this.p, { start, end, head: -1, tail: -1 }, its);
      // outside the clips: nothing to regenerate. Crossing a cut is created (shown red) so the edges can be fixed.
      if (!C.sceneChains(its).some((c) => c[0] <= start && start < c[1]) && !(w.mode === "bridge" && !w.error)) { this.toast("Выделите участок на отрезках таймлайна", true); this.renderTimeline(); return null; }
      if ((this.p.regions || []).length >= C.MAX_REGIONS) { this.toast(`Не больше ${C.MAX_REGIONS} участков`, true); return null; }
      const segI = Math.max(0, w.seg ?? C.markerSegment(its, start)), s = this.seg(segI) || {};
      const rg = { id: C.newId("r"), name: "", start, end, head: -1, tail: -1, prompt: s.prompt || "", refs: [...(s.refs || [])].filter((r) => this.p.assets.find((a) => a.id === r && a.category !== "audio")), seed: rnd(), takes: [], active_take: null };
      this.mutate((p) => { p.regions = p.regions || []; p.regions.push(rg); }, { render: "none" });
      this.selRegion = rg.id;
      this.renderTimeline();
      const w2 = this.regionWin(this.region(rg.id));
      const kn = C.spanKind(w2);
      this.toast(w2.error ? "Участок: " + w2.error : (kn !== "region" ? C.SPAN_NAMES[kn] + " · " : "") + `Участок ${(w2.a / C.FPS).toFixed(2)}–${(w2.b / C.FPS).toFixed(2)} с (сетка H3: 17 кадров) · допишите промпт и нажмите «↻ Пересоздать»`, !!w2.error);
      return rg.id;
    },
    /** Clip menu «↻ Перегенерировать участок»: a range around the clicked frame. */
    regionAt(f) { return this.addRegion(Math.max(0, f - 17), f + 17); },

    /** Regions are stored in absolute frames; when clips are deleted / resized / reordered they must follow the clip
     *  they were made on (by segment id + offset), and vanish together with it. */
    regionAnchors() {
      const its = this.items(), layout = its.map((it) => ({ id: this.p.segments[it.index]?.id, start: it.start, end: it.end }));
      const regs = (this.p.regions || []).map((r) => { const l = layout.find((x) => x.start <= r.start && r.start < x.end) || layout.find((x) => x.start > r.start); return { id: r.id, sid: l?.id, off: l ? r.start - l.start : 0, start: r.start }; });
      return { key: JSON.stringify(layout), layout, regs };
    },
    regionsRebase(a) {
      const its = this.items(), layout = its.map((it) => ({ id: this.p.segments[it.index]?.id, start: it.start, end: it.end }));
      if (JSON.stringify(layout) === a.key) return;
      let gone = 0;
      for (const x of a.regs) {
        const r = (this.p.regions || []).find((q) => q.id === x.id); if (!r || !x.sid) continue;
        const l = layout.find((q) => q.id === x.sid);
        if (!l) { this.p.regions = this.p.regions.filter((q) => q.id !== x.id); gone++; continue; }
        const d = l.start + Math.min(x.off, Math.max(0, l.end - l.start - 1)) - x.start;
        if (d) { r.start += d; r.end += d; }
      }
      if (this.selRegion && !(this.p.regions || []).some((q) => q.id === this.selRegion)) this.selRegion = null;
      if (gone) setTimeout(() => this.toast(`Удалено участков: ${gone} (их клип убран)`), 0);
    },

    deleteRegion(id) {
      this.mutate((p) => { p.regions = (p.regions || []).filter((r) => r.id !== id); }, { render: "none" });
      if (this.selRegion === id) this.selRegion = null;
      this.renderAll(); this.toast("Участок удалён · Ctrl+Z — вернуть");
    },

    // ------------------------------------------------------------ timeline overlay
    renderRegions(vt, ppf) {
      const its = this.items();
      const r = this.run || {};
      if (this._regDraft) {
        const w = C.regionWindow(this.p, { ...this._regDraft, head: -1, tail: -1 }, its);
        vt.append(this.regionEl(null, w, ppf, this._regDraft));
      }
      for (const rg of this.p.regions || []) {
        const w = C.regionWindow(this.p, rg, its);
        const el = this.regionEl(rg, w, ppf, rg);
        if (r.active && r.region === rg.id) el.classList.add("running");
        vt.append(el);
      }
    },

    regionEl(rg, w, ppf, raw) {
      const sel = rg && rg.id === this.selRegion;
      const ok = !w.error && w.chain;
      const ws = ok ? w.ws : raw.start, we = ok ? w.we : raw.end, a = ok ? w.a : raw.start, b = ok ? w.b : raw.end;
      const tk = rg ? this.regionTake(rg) : null;
      const el = h("div", { class: "h3z-region" + (sel ? " sel" : "") + (rg ? "" : " draft") + (ok ? "" : " bad") + (tk && !tk.fresh ? " stale" : "") + (tk?.fresh ? " applied" : ""),
        style: { left: ws * ppf + "px", width: Math.max(4, (we - ws) * ppf) + "px" } });
      const px = (f) => (f - ws) * ppf + "px";
      if (ok && a > ws) el.append(h("div", { class: "zh", style: { left: 0, width: px(a) }, title: `Контекст до: ${a - ws} кадр. — остаётся как есть и задаёт начало` }));
      const core = h("div", { class: "core", style: { left: px(a), width: Math.max(3, (b - a) * ppf) + "px" } });
      el.append(core);
      if (ok && we > b) el.append(h("div", { class: "zt", style: { left: px(b), width: (we - b) * ppf + "px" }, title: `Контекст после: ${we - b} кадр. — остаётся как есть и задаёт конец` }));
      if (!rg) return el;
      const n = this.regionNo(rg.id), k = tk ? (rg.takes || []).findIndex((t) => t.id === rg.active_take) + 1 : 0;
      const kn = ok ? C.spanKind(w) : "region";
      if (kn !== "region") el.classList.add("span-" + kn);
      const lbl = `✂ ${n}` + (kn !== "region" ? " · " + C.SPAN_NAMES[kn].toLowerCase() : "") + ((b - a) * ppf > 70 ? ` · ${((b - a) / C.FPS).toFixed(1)} с` : "") + (k ? ` · дубль ${k}` : rg.takes?.length ? " · оригинал" : "") + (tk && !tk.fresh ? " · устарел" : "") + (rg.upscale ? ` · ↑${this.upMpVal(rg.upscale)}Мп` + (this.regionUpState(rg)?.done ? "" : "…") : "");
      const tab = h("div", { class: "tab", style: { left: px(a) }, title: (ok ? `Участок ${n}: пересоздаётся ${C.fmtTime(a / C.FPS)}–${C.fmtTime(b / C.FPS)} (${b - a} кадр.)\nКонтекст: ${a - ws} кадр. до · ${we - b} кадр. после · окно H3 ${we - ws} кадр.` : `Участок ${n}: ${w.error}`) +
        (tk && !tk.fresh ? "\nДубль устарел: отрезки под ним или настройки изменились — пересоздайте" : "") + "\nКлик — карточка участка · тяните — сдвинуть" }, lbl);
      tab.addEventListener("pointerdown", (e) => this.regionDrag(e, rg.id, "move"));
      if (tk?.fresh && ok) for (const [sd, sq] of Object.entries(tk.take.result?.seams || {})) {   // both seams of the applied take
        const m = h("div", { class: "h3z-seamq rs " + sq.verdict, style: { left: px(sq.at ?? (sd === "head" ? a : b)) }, title: this.spanSeamTip(rg, sd, sq) });
        m.addEventListener("pointerdown", (e) => { if (e.button === 0) { e.stopPropagation(); this.selRegion = rg.id; this.renderTimeline(); } });
        el.append(m);
      }
      tab.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); this.selRegion = rg.id; this.renderTimeline(); this.spanMenu(e, rg.id); });
      if (ok && tk?.take.result?.strip) this.spanFill(el, core, rg, w, tk, kn, ppf);
      el.append(tab);
      for (const side of ["start", "end"]) {
        const eg = h("div", { class: "eg " + side, style: { left: px(side === "start" ? a : b) }, title: `Тяните ${side === "start" ? "начало" : "конец"} участка (прилипает к сетке H3, 17 кадров)` });
        eg.addEventListener("pointerdown", (e) => this.regionDrag(e, rg.id, side));
        el.append(eg);
      }
      return el;
    },

    regionDrag(e, id, what) {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const rg0 = this.region(id); if (!rg0) return;
      const sx = e.clientX, s0 = rg0.start, e0 = rg0.end;
      const tip = h("div", { class: "h3z-tip" }); let moved = false;
      const move = (ev) => {
        const dx = (ev.clientX - sx) / this.ppf;
        if (!moved && Math.abs(ev.clientX - sx) < 3) return;
        if (!moved) document.body.append(tip);
        moved = true;
        this.updateRegion(id, (r) => {
          if (what === "move") { const d = Math.max(-s0, Math.round(dx)); r.start = s0 + d; r.end = e0 + d; }
          else if (what === "start") r.start = Math.max(0, Math.min(e0 - 1, Math.round(s0 + dx)));
          else r.end = Math.max(s0 + 1, Math.round(e0 + dx));
        }, { coalesce: "rg" + id + what + sx, render: "none" });
        const w = this.regionWin(this.region(id));
        tip.style.left = ev.clientX + 12 + "px"; tip.style.top = ev.clientY - 34 + "px";
        tip.textContent = w.error ? w.error : `${C.fmtTime(w.a / C.FPS)}–${C.fmtTime(w.b / C.FPS)} · ${w.b - w.a} кадр. (сетка 17)`;
        this.renderTimeline();
      };
      const up = () => {
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); tip.remove();
        this.selRegion = id; this.renderTimeline();
      };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    },

    /** A span with a take shows ITS frames over [a, b) — over the gap it fills and over the parts of the neighbour
     *  clips it regenerated — like a clip: filmstrip, «✂ Мост / Пролог» label, hover frames; a stale take dimmed + ↺. */
    spanFill(el, core, rg, w, tk, kn, ppf) {
      const res = tk.take.result, n = res.strip_n || 0, frames = res.frames || (w.we - w.ws);
      const off = (res.a ?? w.a) - (res.ws ?? w.ws);                 // window frame of the span start (take's own geometry)
      const len = Math.min(w.b - w.a, Math.max(1, frames - off)), wd = Math.max(3, len * ppf);
      core.classList.add("filled"); if (!tk.fresh) core.classList.add("stale");
      const box = h("div", { class: "fillstrip" });
      const [vw, vh] = C.resolution(this.p.settings), H = 92, tw = Math.max(24, H * vw / vh), url = this.host.url(res.strip);
      if (!n) box.style.backgroundImage = `url("${url}")`;
      else for (let k = 0, cnt = Math.min(200, Math.ceil(wd / tw)); k < cnt; k++) {
        const f = off + (k * tw + tw / 2) / ppf, idx = Math.max(0, Math.min(n - 1, Math.floor(f / frames * n)));
        box.append(h("i", { style: { left: k * tw + "px", width: tw + "px", backgroundImage: `url("${url}")`, backgroundSize: `${n * tw}px ${H}px`, backgroundPosition: `${-idx * tw}px 0` } }));
      }
      core.append(box);
      const name = kn === "region" ? "Участок" : C.SPAN_NAMES[kn];
      const us = this.regionUpState(rg);
      const upTag = us ? h("i", { class: "up" + (us.done ? " done" : ""), title: us.done ? `Апскейл готов: ${(res.up?.wh || []).join("×")} · ${this.upText(rg.upscale)}` : `Апскейл ${this.upText(rg.upscale)} задан — будет сделан при генерации` }, `↑${this.upMpVal(rg.upscale)}Мп`) : null;
      if (wd > 46) core.append(h("div", { class: "flbl" }, h("b", null, wd > 120 ? `✂ ${name}` : "✂"), wd > 200 ? h("span", null, `${((w.b - w.a) / C.FPS).toFixed(1)} с · дубль ${(rg.takes || []).findIndex((t) => t.id === rg.active_take) + 1}`) : null, wd > 90 ? upTag : null));
      if (!tk.fresh) {
        const can = this.regionRestorable(rg);
        const rb = h("button", { class: "h3z-btn sm rbadge", title: can ? "Дубль устарел: вы изменили участок (границы, промпт, рефы, сид). ↺ — вернуть входы дубля, и он снова применится"
          : "Дубль устарел: изменились клипы или настройки под участком — в ролике сейчас пусто/старое. ↻ Пересоздать — в карточке участка или в меню (правый клик)",
          html: wd > 170 ? "↺ Восстановить" : "↺" });
        rb.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); });
        rb.addEventListener("click", (e) => { e.stopPropagation(); if (can) this.restoreRegionTake(rg.id); else { this.selRegion = rg.id; this.renderTimeline(); } });
        core.append(rb);
      }
      core.title = `${name} ${this.regionNo(rg.id)}: кадры дубля ${C.fmtTime(w.a / C.FPS)}–${C.fmtTime(w.b / C.FPS)}` + (tk.fresh ? " — в ролике, просмотре и экспорте" : " — устарел, не применяется") + "\nКлик — карточка участка · правый клик — меню";
      core.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; e.stopPropagation(); this.selGap = null; this.selAudio = null; this.selRegion = rg.id; this.playhead = Math.max(0, Math.min(this.totalFrames(), this.frameAt(e.clientX))); this.renderTimeline(); this.updatePlayhead?.(); });
      core.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); this.selRegion = rg.id; this.renderTimeline(); this.spanMenu(e, rg.id); });
      core.addEventListener("pointermove", (e) => {                     // hover: the take's frame under the cursor
        if (e.buttons || !n) return this.hideHover?.();
        const r = core.getBoundingClientRect(), f = off + (e.clientX - r.left) / ppf, idx = Math.max(0, Math.min(n - 1, Math.floor(f / frames * n)));
        const W = 176, HH = Math.round(W * vh / vw);
        let hv = this.$.hover;
        if (!hv) { hv = this.$.hover = h("div", { class: "h3z-hover" }, h("div", { class: "im" }), h("span")); this.root.append(hv); }
        const im = hv.firstChild; im.style.width = W + "px"; im.style.height = HH + "px";
        im.style.backgroundImage = `url("${url}")`; im.style.backgroundSize = `${n * W}px ${HH}px`; im.style.backgroundPosition = `${-idx * W}px 0`;
        hv.lastChild.textContent = `${C.fmtTime((w.a + (e.clientX - r.left) / ppf) / C.FPS)} · ${name.toLowerCase()} ${this.regionNo(rg.id)}` + (tk.fresh ? "" : " · устарел");
        hv.style.left = Math.max(8, Math.min(window.innerWidth - W - 16, e.clientX - W / 2)) + "px"; hv.style.top = r.top - HH - 34 + "px";
        this.showHover(hv, core);
      });
      core.addEventListener("pointerleave", () => this.hideHover?.());
    },
    /** Right click on a span (its tab or its frames): regenerate / restore / remove the filling. */
    spanMenu(e, id) {
      const rg = this.region(id); if (!rg) return;
      const w = this.regionWin(rg), kn = w.error ? "region" : C.spanKind(w), name = kn === "region" ? "Участок" : C.SPAN_NAMES[kn];
      const gi = this.p.segments.findIndex((s, k) => s.gap && (() => { const it = this.items()[k]; return it && it.start - it.gap < w.b && it.start > w.a; })());
      this.openMenu(e, `✂ ${name} ${this.regionNo(id)}`, [
        { label: "↻ Пересоздать", fn: () => this.regenRegion(id), title: "Новый дубль (новый сид, если такой уже есть)" },
        ...this.upRegionMenuEntries(id),
        this.regionRestorable(rg) ? { label: "↺ Восстановить входы дубля", fn: () => this.restoreRegionTake(id) } : null,
        { label: kn === "bridge" || kn === "prologue" ? "✕ Убрать заполнение" : "✕ Удалить участок", fn: () => this.deleteRegion(id), danger: true,
          title: "Участок и его дубли убираются (Ctrl+Z — вернуть); промежуток снова пустой" },
        gi >= 0 ? { label: "✕ Убрать промежуток", fn: () => this.removeGap(gi), danger: true } : null,
      ].filter(Boolean));
    },

    spanSeamTip(rg, sd, sq) {
      return `Участок ${this.regionNo(rg.id)}: шов в ${sd === "head" ? "начале" : "конце"} — ${SEAM_TXT[sq.verdict] || sq.verdict} (×${sq.ratio})`
        + (sq.raw ? `\nбез выравнивания яркости и цвета: ${SEAM_TXT[sq.raw.verdict] || ""} (×${sq.raw.ratio})` : "")
        + (sq.audio ? `\nзвук: скачок ${sq.audio.db} дБ${sq.audio.warn ? " — заметный" : ""}` : "")
        + (sq.verdict !== "ok" ? "\n«↻ Пересоздать» (новый сид) может дать ровнее" : "");
    },
    /** ↺: the inputs the active take was made with (start/end, context, prompt, refs, seed). */
    regionRestorable(rg) {
      const tk = this.regionTake(rg); if (!tk || tk.fresh || !tk.take.snap) return false;
      return SNAP.some((k) => k in tk.take.snap && JSON.stringify(tk.take.snap[k]) !== JSON.stringify(rg[k]));
    },
    restoreRegionTake(id) {
      const rg = this.region(id), tk = rg && this.regionTake(rg); if (!tk?.take.snap) return;
      this.updateRegion(id, (r) => Object.assign(r, clone(tk.take.snap)), { render: "none" });
      this.renderAll();
      const t2 = this.regionTake(this.region(id));
      this.toast(t2?.fresh ? `Участок ${this.regionNo(id)}: входы дубля восстановлены — дубль снова применён` : `Входы участка восстановлены, но изменились клипы или настройки под ним — пересоздайте`, !t2?.fresh);
    },

    // ------------------------------------------------------------ card (popover above the timeline)
    regionPopover() {
      const $ = this.$;
      const rg = this.region();
      if (!rg || !this.root) { $.regPop?.remove(); $.regPop = null; return; }
      const w = this.regionWin(rg);
      if ($.regPop && $.regPop.isConnected && $.regPop.dataset.id === rg.id && $.regPop.contains(document.activeElement) && document.activeElement !== document.body) {
        this.placeRegionPopover(w); this.fillRegionInfo(rg, w); return;   // typing inside: keep the inputs
      }
      $.regPop?.remove();
      const pop = $.regPop = h("div", { class: "h3z-regpop h3z-glass", dataset: { id: rg.id } });
      ["pointerdown", "keydown", "wheel"].forEach((ev) => pop.addEventListener(ev, (e) => e.stopPropagation()));
      const busy = !!this.run?.active, n = this.regionNo(rg.id);
      const kn = w.error ? "region" : C.spanKind(w);
      pop.append(h("div", { class: "hd" }, h("b", null, `✂ ${kn === "region" ? "Участок" : C.SPAN_NAMES[kn]} ${n}`), $.regTime = h("span", { class: "tm" }),
        h("div", { class: "grow" }),
        h("button", { class: "h3z-btn sm icon", title: "Плейхед к началу участка", html: ICON.play, onclick: () => { this.pvMode = "full"; this.seek(Math.max(0, w.ws ?? rg.start)); this.renderPreview(); } }),
        h("button", { class: "h3z-btn sm icon danger", title: "Удалить участок", html: ICON.trash, onclick: () => this.deleteRegion(rg.id) }),
        h("button", { class: "h3z-btn sm icon", title: "Закрыть (Esc)", html: "✕", onclick: () => { this.selRegion = null; this.renderTimeline(); } })));
      pop.append($.regInfo = h("div", { class: "info" }));
      const ta = h("textarea", { class: "h3z-ta sm", spellcheck: "false", placeholder: "Что происходит в этом участке: she turns to the camera and laughs…" });
      ta.value = rg.prompt;
      ta.oninput = () => this.updateRegion(rg.id, (r) => { r.prompt = ta.value; }, { coalesce: "rgp" + rg.id, render: "none" });
      ta.onchange = () => this.renderTimeline();
      pop.append(h("div", null, h("div", { class: "h3z-lbl" }, "Промпт участка", h("em", null, "к нему добавится общий промпт · по-английски"),
        this.peButton(() => { const r = (this.p.regions || []).find((x) => x.id === rg.id) || rg;
          return { title: `Промпт участка ${this.regionNo(rg.id)}`, value: r.prompt ?? "", ctx: { kind: "region", region: r }, placeholder: ta.placeholder,
            apply: (t) => { this.updateRegion(rg.id, (x) => { x.prompt = t; }); this.renderTimeline(); } }; })), ta));
      // references
      const refs = h("div", { class: "refs" });
      for (const id of rg.refs) {
        const a = this.p.assets.find((x) => x.id === id); if (!a) continue;
        refs.append(h("span", { class: "rf", title: a.name },
          a.category === "video" ? h("span", { class: "vd" }, "🎞") : h("img", { src: this.assetUrl(a), draggable: "false" }),
          h("i", { title: "Убрать", onclick: () => this.updateRegion(rg.id, (r) => { r.refs = r.refs.filter((x) => x !== id); }) }, "×")));
      }
      const pick = h("select", { class: "h3z-sel sm", title: "Добавить референс (или перетащите ассет сюда)" }, h("option", { value: "" }, "+ референс"),
        this.p.assets.filter((a) => a.category !== "audio" && !rg.refs.includes(a.id)).map((a) => h("option", { value: a.id }, a.name || a.file)));
      pick.onchange = () => { const v = pick.value; if (v) this.updateRegion(rg.id, (r) => { r.refs.push(v); }); };
      refs.append(pick);
      pop.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("application/x-h3s-asset")) { e.preventDefault(); pop.classList.add("dropover"); } });
      pop.addEventListener("dragleave", () => pop.classList.remove("dropover"));
      pop.addEventListener("drop", (e) => { pop.classList.remove("dropover"); const id = e.dataTransfer.getData("application/x-h3s-asset"); if (id) { e.preventDefault(); this.updateRegion(rg.id, (r) => { if (!r.refs.includes(id)) r.refs.push(id); }); } });
      pop.append(h("div", null, h("div", { class: "h3z-lbl" }, "Референсы"), refs));
      // seed + context
      const seed = h("input", { class: "h3z-in sm", type: "number", min: 0, value: rg.seed });
      seed.onchange = () => this.updateRegion(rg.id, (r) => { r.seed = Math.max(0, Math.trunc(Number(seed.value) || 0)); });
      const ctxSel = (key, label) => {
        const def = C.regionBlocks(this.p, { [key]: -1 }, key);
        const s = h("select", { class: "h3z-sel sm", title: key === "head" ? "Сколько кадров ДО участка H3 видит чистыми (они не меняются и задают, откуда продолжать)" : "Сколько кадров ПОСЛЕ участка H3 видит чистыми (они не меняются и задают, куда прийти)" },
          h("option", { value: -1, selected: rg[key] < 0 }, `Как в настройках (${def ? 17 * def + (key === "tail" ? 5 : 0) : 0} кадр.)`),
          Array.from({ length: C.MAX_OVERLAP_BLOCKS + 1 }, (_, o) => h("option", { value: o, selected: rg[key] === o }, o ? `${17 * o + (key === "tail" ? 5 : 0)} кадр. ≈ ${((17 * o + (key === "tail" ? 5 : 0)) / C.FPS).toFixed(2)} с` : "без контекста")));
        s.onchange = () => this.updateRegion(rg.id, (r) => { r[key] = Number(s.value); });
        return h("div", { class: "h3z-field" }, h("div", { class: "h3z-lbl" }, label), s);
      };
      pop.append(h("div", { class: "row" },
        h("div", { class: "h3z-field" }, h("div", { class: "h3z-lbl" }, "Сид"), h("div", { class: "sd" }, seed,
          h("button", { class: "h3z-btn sm icon", html: ICON.dice, title: "Новый сид", onclick: () => this.updateRegion(rg.id, (r) => { r.seed = rnd(); }) }))),
        ctxSel("head", "Контекст до"), ctxSel("tail", "Контекст после")));
      // takes
      if ((rg.takes || []).length) {
        const tk = this.regionTake(rg);
        pop.append(h("div", null, h("div", { class: "h3z-lbl" }, "Дубли участка", tk && !tk.fresh ? h("em", { style: { color: "var(--warn)" } }, "выбранный дубль устарел — пересоздайте") : h("em", null, "клик — сравнить / вернуть"),
          this.regionRestorable(rg) ? h("button", { class: "h3z-btn sm", style: { marginLeft: "auto" }, title: "Вернуть входы, с которыми сделан выбранный дубль (границы, контекст, промпт, референсы, сид)", onclick: () => this.restoreRegionTake(rg.id) }, "↺ Восстановить") : null),
          h("div", { class: "h3z-pills takes" },
            h("div", { class: "h3z-pill" + (!rg.active_take ? " on" : ""), title: "Без перегенерации: отрезки как есть", onclick: () => this.selectRegionTake(rg.id, null) }, "Оригинал"),
            rg.takes.map((t, k) => h("div", { class: "h3z-pill" + (t.id === rg.active_take ? " on" : ""), title: `Дубль ${k + 1} · сид ${t.seed ?? "?"}` + (t.created ? ` · ${new Date(t.created * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : ""), onclick: () => this.selectRegionTake(rg.id, t.id) }, `${k + 1}`)))));
      }
      { const ub = this.upRegionBlock(rg); if (ub) pop.append(ub); }
      const stageTxt = (kn !== "region" && C.runKind(this.p.settings) === "refine") ? "сразу финал (мост/пролог/продолжение — один проход по склеенному видео)"
        : { draft: "черновик", refine: "финал из черновика: окно черновика → апскейл → доработка", full: "сразу финал" }[C.runKind(this.p.settings)] || "";
      $.regGo = h("button", { class: "h3z-btn primary", html: "<span>↻ Пересоздать</span>", disabled: busy || !!w.error, title: w.error || "Сгенерировать новый вариант участка (новый дубль). Несгенерированные отрезки сцены будут сгенерированы в том же запуске", onclick: () => this.regenRegion(rg.id) });
      pop.append(h("div", { class: "ft" }, h("span", { class: "h3z-note" }, "Режим: " + stageTxt), h("div", { class: "grow" }), $.regGo));
      this.root.append(pop);
      this.fillRegionInfo(rg, w);
      this.placeRegionPopover(w);
    },

    fillRegionInfo(rg, w) {
      const $ = this.$; if (!$.regInfo) return;
      if (w.error) { $.regInfo.innerHTML = ""; $.regInfo.append(h("div", { class: "err" }, "⛔ " + w.error)); if ($.regTime) $.regTime.textContent = ""; if ($.regGo) $.regGo.disabled = true; return; }
      if ($.regTime) $.regTime.textContent = `${C.fmtTime(w.a / C.FPS)} – ${C.fmtTime(w.b / C.FPS)}`;
      const moved = Math.abs(w.a - rg.start) > 0 || Math.abs(w.b - rg.end) > 0;
      $.regInfo.innerHTML = "";
      $.regInfo.append(...[
        h("div", null, h("b", null, `${w.b - w.a} кадр. ≈ ${((w.b - w.a) / C.FPS).toFixed(2)} с`), " пересоздаётся",
          moved ? h("span", { class: "snap", title: `Выделено ${rg.start}–${rg.end}; H3 режет ролик блоками по 17 кадров (≈0.71 с), края прилипли к ближайшим границам блоков` }, ` · прилипло к сетке 17 кадр.`) : null),
        C.spanKind(w) !== "region" ? h("div", { class: "kd" }, h("b", null, C.SPAN_NAMES[C.spanKind(w)]), " — " + C.SPAN_HELP[C.spanKind(w)] + ((w.gaps || []).length ? ` · промежутков внутри: ${w.gaps.length}` : "")) : null,
        h("div", null, `Контекст: ${w.head} кадр. до · ${w.tail} кадр. после · окно H3 ${w.frames} кадр. (17·${(w.frames - 5) / 17}+5)` + (w.segs.length > 1 ? ` · отрезки ${w.segs.map((i) => i + 1).join(", ")}` : ` · отрезок ${w.segs[0] + 1}`)),
        this.spanSeamsLine(rg),
        ...w.warnings.map((x) => h("div", { class: "wr" }, "⚠ " + x))].filter(Boolean));
      if ($.regGo) $.regGo.disabled = !!this.run?.active;
    },

    spanSeamsLine(rg) {
      const tk = this.regionTake(rg), sm = tk?.fresh ? tk.take.result?.seams : null;
      if (!sm || !Object.keys(sm).length) return null;
      const lock = C.levelLockFrames(this.p);
      return h("div", { class: "sq" }, "Швы: ", ["head", "tail"].filter((sd) => sm[sd]).map((sd) => h("span", { class: "h3z-seamv " + sm[sd].verdict, title: this.spanSeamTip(rg, sd, sm[sd]) }, h("b"),
        `${sd === "head" ? "начало" : "конец"} ×${sm[sd].ratio}` + (sm[sd].raw ? ` (было ×${sm[sd].raw.ratio})` : "") + (sm[sd].audio?.warn ? ` · звук ${sm[sd].audio.db} дБ` : ""))),
        lock ? h("em", null, ` · выравнивание яркости ${lock} кадр.`) : null);
    },

    placeRegionPopover(w) {
      const $ = this.$, pop = $.regPop; if (!pop || !$.tscroll) return;
      const r = $.tscroll.getBoundingClientRect(), root = this.root.getBoundingClientRect();
      const ir = $.tinner.getBoundingClientRect();
      const fx = w && !w.error ? (w.a + w.b) / 2 : (this.region()?.start || 0);
      const x = ir.left + fx * this.ppf;
      const pw = pop.offsetWidth || 520;
      pop.style.left = Math.round(Math.max(root.left + 8, Math.min(root.right - pw - 8, x - pw / 2)) - root.left) + "px";
      pop.style.bottom = Math.round(root.bottom - r.top + 8) + "px";
    },

    selectRegionTake(id, tid) {
      const rg = this.region(id); if (!rg) return;
      const t = tid ? (rg.takes || []).find((x) => x.id === tid) : null;
      this.updateRegion(id, (r) => { if (t) Object.assign(r, clone(t.snap || {})); r.active_take = t ? t.id : null; }, { render: "none" });
      this.renderAll();
      this.toast(t ? `Участок ${this.regionNo(id)}: дубль ${(rg.takes.findIndex((x) => x.id === tid)) + 1}` : `Участок ${this.regionNo(id)}: оригинал`);
    },

    /** «↻ Пересоздать»: one run; a take with the same settings already exists → a new seed (a new take). */
    regenRegion(id) {
      const rg = this.region(id); if (!rg || this.run?.active) return;
      const w = this.regionWin(rg); if (w.error) return this.toast(w.error, true);
      if ((rg.takes || []).some((t) => t.sig === C.regionSig(this.p, rg))) this.updateRegion(id, (r) => { r.seed = rnd(); }, { render: "none" });
      this.generate({ region: id });
    },

    recordRegionTake(id, res, sig) {
      const rg = (this.p.regions || []).find((r) => r.id === id); if (!rg || !res?.key) return;
      rg.takes = Array.isArray(rg.takes) ? rg.takes : [];
      let t = rg.takes.find((x) => x.key === res.key);
      const snap = {}; for (const k of SNAP) snap[k] = clone(rg[k]);
      if (!t) {
        t = { id: C.newId("t"), key: res.key, sig: sig || C.regionSig(this.p, rg), seed: res.seed, created: res.created || Math.floor(Date.now() / 1000), snap, result: { ...res } };
        rg.takes.push(t);
        if (rg.takes.length > C.MAX_TAKES) rg.takes.splice(0, rg.takes.length - C.MAX_TAKES);
      } else { t.result = { ...res }; if (sig) t.sig = sig; if (t.snap) t.snap.upscale = clone(rg.upscale ?? null); }
      t.result.upSig = res.up ? C.regionUpSig(this.p, rg) : null;   // which «Апскейл участка» the result carries
      rg.active_take = t.id;
    },

    applyRegionResults(list) {
      for (const r of list || []) {
        const rg = r?.region && this.region(r.region); if (!rg) continue;
        const t = rg.takes?.find((x) => x.key === r.key);
        if (r.generated || !t || (r.up?.key || "") !== (t.result?.up?.key || "")) this.recordRegionTake(r.region, r, this.pendingRegionSig?.[r.region]);   // + an upscale made / dropped in a whole run
      }
    },

    // ------------------------------------------------------------ playback: the composition plays applied takes
    fullCurrent() {
      if (!baseFullCurrent.call(this)) return false;
      return (this.p.result?.regs || "") === this.appliedRegionKeys();
    },
    compSource(f) {
      const src = baseCompSource.call(this, f);
      if (!(this.p.regions || []).length) return src;
      const its = this.items();
      let next = Infinity;
      for (const rg of this.p.regions) {
        const tk = this.regionTake(rg); if (!tk?.fresh || !tk.take.result?.video) continue;
        const w = C.regionWindow(this.p, rg, its); if (w.error) continue;
        if (f >= w.a && f < w.b) return { kind: "comp", seg: this.compIndexAt(f), region: rg.id, ref: tk.take.result.video, start: w.ws, off: 0, end: w.b };
        if (w.a > f) next = Math.min(next, w.a);
      }
      if (next < src.end) src.end = next;   // switch to the region take exactly at its start
      return src;
    },
    /** The composition must switch when the piece under the playhead changes (clip or region take). */
    compChanged(f) {
      const s = this.src; if (!s || s.kind !== "comp") return true;
      if (this.compIndexAt(f) !== s.seg) return true;
      if (!(this.p.regions || []).length) return false;
      return (this.compSource(f).region || "") !== (s.region || "");
    },
  });
}

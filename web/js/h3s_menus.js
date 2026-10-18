// Context menus (clips, audio clips, assets) and «Сохранить видео» (server-side export to a chosen folder).
// labels are text, never HTML: "<Video>" in a label used to become a real <video> element (a big blurred block)
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function installMenus(Editor, { C, h, ICON }) {
  Object.assign(Editor.prototype, {
    /** Generic menu: entries = {icon, label, fn, dis, danger, hint, why, sub:[entries]} | "sep" | {el} | null. */
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
            html: `<i class="ic">${it.icon || ""}</i>` + `<span class="lb">${esc(it.label)}</span>` + (it.hint ? `<kbd>${esc(it.hint)}</kbd>` : "") + (it.sub ? "<b class='ar'>›</b>" : "") });
          if (it.sub) {
            let sm = null;
            el.addEventListener("pointerenter", () => {
              m.querySelectorAll(":scope > .h3z-menu.sub").forEach((x) => x.remove());
              if (it.dis) return;
              sm = build(it.sub, true); m.append(sm);
              const r = el.getBoundingClientRect(), mr = m.getBoundingClientRect(), sr = sm.getBoundingClientRect();
              const left = r.right + sr.width + 8 > window.innerWidth ? -sr.width + 2 : mr.width - 2;
              sm.style.left = left + "px"; sm.style.top = Math.min(r.top - mr.top - 6, window.innerHeight - mr.top - sr.height - 8) + "px";
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
      const r = m.getBoundingClientRect();
      m.style.left = Math.min(e.clientX, window.innerWidth - r.width - 8) + "px";
      m.style.top = Math.max(8, Math.min(e.clientY, window.innerHeight - r.height - 8)) + "px";
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
      const takes = (s.takes || []).map((t, k) => ({ label: `Дубль ${k + 1} · сид ${t.seed ?? "?"}` + (t.created ? ` · ${new Date(t.created * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : ""),
        on: t.id === s.active_take, fn: () => this.selectTake(i, t.id), dis: busy || !!s.freeze }));
      this.openMenu(e, s.name || `Отрезок ${i + 1}`, [
        { icon: ICON.spark, label: stale ? "Сгенерировать" : "Сгенерировать (уже готов)", fn: () => this.genSegment(i), dis: !st.ok || !stale },
        { icon: ICON.dice, label: "Ещё дубль (новый сид)", fn: () => this.newTake(i), dis: !st.ok },
        !st.ok && !busy && !s.freeze ? { why: st.why } : null,
        takes.length > 1 ? { label: `Дубли (${this.takeIndex(s, s.active_take) + 1}/${takes.length})`, sub: takes } : null,
        { icon: this.constructor.VIEWER_ICONS?.view || "", label: "Удобный просмотр", title: "Этот клип во весь экран: масштаб до ×4, покадрово, скорость, петля", fn: () => this.viewerForClip(i), dis: !this.viewerClipSpec(i) },
        { label: "↻ Перегенерировать участок…", title: "Выделить часть ролика вокруг этого места и пересоздать только её (контекст до и после сохраняется). Основной способ — кнопка «✂ Участок» над таймлайном", fn: () => this.regionAt(f), dis: busy || !s.result?.video && !C.isFootage(s) },
        s.freeze ? { label: "🔓 Разморозить", fn: () => this.unfreezeSeg(i) } : { label: "🔒 Зафиксировать", fn: () => this.freezeSeg(i), dis: busy || stale },
        ...this.stageMenuEntries(i),
        ...this.finalMenuEntries(i),
        ...this.upMenuEntries(i),
        "sep",
        { label: "💾 Сохранить фрагмент (этот отрезок)…", fn: () => this.saveDialog({ mode: "clip", i }), dis: !s.result?.video },
        { label: "▶ Открыть в плеере", fn: () => { this.sel = i; this.pvMode = "segment"; this.playhead = it.start + (i ? it.overlap : 0); this.renderAll(); this.scrollToPlayhead?.(); } },
        "sep",
        { icon: ICON.copy, label: "Копировать промпт и референсы", fn: () => this.copySegSpec(i) },
        { label: "📋 Вставить промпт и референсы", fn: () => this.pasteSegSpec(i), dis: !this._segClip, title: this._segClip ? `Из «${this._segClip.from}»` : "Сначала скопируйте у другого отрезка" },
        "sep",
        { icon: ICON.plus, label: "Продлить отсюда", title: "Новый отрезок сразу после этого, продолжает его", fn: () => this.insertAfter(i, "extend") },
        { label: "✂ Новая сцена после", title: "Новый отрезок после этого — монтажная склейка, без продолжения", fn: () => this.insertAfter(i, "cut") },
        i > 0 && s.link === "extend" && !C.isFootage(s) ? { label: `⟷ Перекрытие (${it.overlap || 0} кадр.)`, dis: !!s.freeze, sub: [{ label: "По умолчанию (из настроек)", on: (s.overlap_blocks ?? -1) < 0, fn: () => this.setSegOverlap(i, -1) }]
          .concat(Array.from({ length: C.MAX_OVERLAP_BLOCKS + 1 }, (_, o) => ({ label: this.ovLabel(o), on: s.overlap_blocks === o, fn: () => this.setSegOverlap(i, o) }))) } : null,
        i > 0 ? { label: s.link === "cut" ? "⟶ Сделать продолжением предыдущего" : "✂ Сделать новой сценой", fn: () => this.mutate((p) => { p.segments[i].link = s.link === "cut" ? "extend" : "cut"; }), dis: !!s.freeze } : null,
        { icon: ICON.cut, label: "Разрезать здесь", fn: () => { this.playhead = f; this.split(); }, hint: "S", dis: !!s.freeze },
        { icon: ICON.copy, label: "Дублировать", fn: () => this.duplicate(), hint: "D" },
        { label: "◆ Маркер здесь", fn: () => this.addMarker(f), hint: "M" },
        (s.takes || []).length > 1 ? { label: "🧹 Удалить другие дубли", fn: () => this.clearTakes(i), dis: busy } : null,
        "sep",
        { icon: ICON.trash, label: "Удалить", fn: () => this.deleteSeg(i), danger: true, hint: "Del" },
      ]);
    },

    copySegSpec(i) {
      const s = this.seg(i);
      this._segClip = { prompt: s.prompt, refs: [...s.refs], overrides: JSON.parse(JSON.stringify(s.overrides || {})), from: s.name || `Отрезок ${i + 1}` };
      this.toast("Промпт и референсы скопированы · правый клик по другому отрезку → «Вставить»");
    },
    pasteSegSpec(i) {
      const c = this._segClip; if (!c) return;
      if (this.seg(i)?.freeze) return this.toast("Отрезок зафиксирован — разморозьте, чтобы менять", true);
      this.mutate((p) => { const s = p.segments[i]; s.prompt = c.prompt; s.refs = [...c.refs]; s.overrides = JSON.parse(JSON.stringify(c.overrides)); });
      this.toast(`Вставлено из «${c.from}» в отрезок ${i + 1}`);
    },
    insertAfter(i, link) {
      const base = this.seg(i), s = this.newSegment(base);
      s.link = link; if (link === "cut") s.refs = base.refs.filter((r) => this.p.assets.find((a) => a.id === r)?.category === "character");
      this.mutate((p) => { p.segments.splice(i + 1, 0, s); }, { render: "none" });
      this.sel = i + 1; this.pvMode = "segment";
      const it = this.items()[this.sel]; this.playhead = it.start + it.overlap;
      this.renderAll(); this.scrollToPlayhead?.();
      if (!this.pastMarkerHint()) this.toast(link === "cut" ? "Новая сцена вставлена" : "Отрезок вставлен — продолжит предыдущий");
    },
    clearTakes(i) {
      const s = this.seg(i); if (!s) return;
      if (!confirm(`Удалить ${s.takes.length - 1} дубл(я/ей) отрезка ${i + 1}, кроме текущего?`)) return;
      this.mutate((p) => { const x = p.segments[i]; x.takes = x.takes.filter((t) => t.id === x.active_take).slice(-1); });
      this.toast("Остался только текущий дубль");
    },

    // ---------------------------------------------------------------- audio clip menu
    audioMenu(e, id) {
      const c = this.audioClipById(id); if (!c) return;
      const a = this.audioAsset(c.asset), sp = this.clipSpan(c), music = (c.lane | 0) >= C.MUSIC_LANE;
      const set = (fn, co) => this.mutate((p) => { const x = p.audio.clips.find((k) => k.id === id); if (x) fn(x); }, { coalesce: co, render: "none" });
      const relayout = () => { this.renderTimeline(); this.audioPanelRefresh(); };
      const t = this.frameAt(e.clientX) / C.FPS;
      this.openMenu(e, (music ? "♫ " : "🔒 ") + (a?.name || c.asset), [
        this.menuSlider("Громкость", c.volume ?? 1, 0, 2, 0.05, (v) => Math.round(v * 100) + "%", (v) => { set((x) => { x.volume = v; }, "avol" + id); relayout(); }),
        this.menuSlider("Фейд in", c.fade_in || 0, 0, Math.min(10, sp.len), 0.1, (v) => v.toFixed(1) + " с", (v) => { set((x) => { x.fade_in = v; }, "afi" + id); relayout(); }),
        this.menuSlider("Фейд out", c.fade_out || 0, 0, Math.min(10, sp.len), 0.1, (v) => v.toFixed(1) + " с", (v) => { set((x) => { x.fade_out = v; }, "afo" + id); relayout(); }),
        !music ? { why: "Громкость и фейды на дорожках 1–2 меняют фиксируемый звук (отрезки под клипом перегенерируются)" } : null,
        "sep",
        { label: "Дорожка", sub: [[0, "🔒 Дорожка 1 (фиксация)"], [1, "🔒 Дорожка 2 (фиксация)"], [2, "♫ Музыка (поверх видео)"]].map(([l, lb]) => ({ label: lb, on: c.lane === l, fn: () => { this.mutate((p) => { p.audio.clips.find((k) => k.id === id).lane = l; }); } })) },
        { icon: ICON.cut, label: "Разрезать здесь", hint: "S", fn: () => { this.playhead = Math.round(t * C.FPS); this.selAudio = id; this.splitAudio(); } },
        { icon: ICON.copy, label: "Дублировать", fn: () => { const nid = C.newId("ac"); this.mutate((p) => { p.audio.clips.push({ ...JSON.parse(JSON.stringify(c)), id: nid, start: Math.round((sp.end) * 1000) / 1000 }); p.audio.clips.sort((x, y) => x.start - y.start || x.lane - y.lane); }); this.selAudio = nid; } },
        { label: "✎ Редактировать файл…", fn: () => this.openAssetEditor(c.asset), dis: c.asset === C.AUDIO_INPUT_ID },
        { label: "⚙ Параметры клипа", fn: () => this.selectAudio(id) },
        "sep",
        { icon: ICON.trash, label: "Удалить", hint: "Del", danger: true, fn: () => this.deleteAudio(id) },
      ]);
    },

    // ---------------------------------------------------------------- asset menu
    assetMenu(e, a) {
      const kind = a.category === "video" ? "video" : a.category === "audio" ? "audio" : "image";
      const seg = this.seg(), inSeg = !!seg?.refs.includes(a.id);
      const pics = ["character", "location", "other"];
      this.openMenu(e, a.name, [
        { label: "✎ Редактировать…", title: kind === "image" ? "Обрезка, поворот, зеркало, уменьшение" : kind === "audio" ? "Обрезка, громкость, нормализация, фейды" : "Обрезка по времени, уменьшение, кадрирование, кадр/звук в ассеты", fn: () => this.openAssetEditor(a.id), dis: !!a.virtual, hint: "2×клик" },
        seg ? { icon: inSeg ? ICON.minus || "" : ICON.plus, label: inSeg ? `Убрать из референсов отрезка ${this.sel + 1}` : `В референсы отрезка ${this.sel + 1}` + (kind === "video" ? ` (<Video ${C.videoRefs(this.p, seg).length + 1}>)` : kind === "audio" ? ` (<Audio ${C.audioRefs(this.p, seg).length + 1}>)` : " (<Picture>)"),
          title: (seg.name ? `«${seg.name}»: ` : "") + (inSeg ? "убрать этот ассет из референсов выбранного отрезка" : "добавить ассет в референсы выбранного отрезка"), fn: () => this.toggleRef(this.sel, a.id) } : null,
        kind === "video" ? { icon: ICON.film || "", label: "На таймлайн (футаж)", fn: () => this.addFootage(a.id) } : null,
        kind === "audio" ? { label: "🔒 На аудиодорожку (фиксация)", fn: () => this.addAudioClip(a.id, this.playhead / C.FPS, 0) } : null,
        kind === "audio" ? { label: "♫ На дорожку музыки", fn: () => this.addAudioClip(a.id, this.playhead / C.FPS, C.MUSIC_LANE) } : null,
        kind === "image" ? { label: "Категория", sub: pics.map((k) => ({ label: { character: "Персонаж", location: "Локация", other: "Другое" }[k], on: a.category === k, fn: () => this.mutate((p) => { p.assets.find((x) => x.id === a.id).category = k; }) })) } : null,
        "sep",
        a.orig ? { label: "↺ Вернуть оригинал", fn: () => this.mutate((p) => { const x = p.assets.find((y) => y.id === a.id); x.file = x.orig.filename; x.subfolder = x.orig.subfolder; x.type = x.orig.type; x.orig = null; x.edit = null; }) } : null,
        { label: "Переименовать…", fn: () => { const n = prompt("Имя ассета", a.name); if (n && n.trim()) this.mutate((p) => { p.assets.find((x) => x.id === a.id).name = n.trim(); }); }, dis: !!a.virtual },
        { icon: ICON.trash, label: "Убрать из проекта", danger: true, dis: !!a.virtual, fn: () => {
          if (kind === "video") return this.removeVideoAsset(a.id);
          this.mutate((p) => { p.assets = p.assets.filter((x) => x.id !== a.id); p.audio.clips = p.audio.clips.filter((c) => c.asset !== a.id); for (const s of p.segments) s.refs = s.refs.filter((r) => r !== a.id); });
        } },
      ]);
    },

    // ---------------------------------------------------------------- «Сохранить видео»
    /** opt.mode: "all" | "range" | "clip" (opt.i). */
    saveDialog(opt = {}) {
      this.closeSaveDialog();
      const full = this.p.result?.full, fullOk = this.fullCurrent();
      let mode = opt.mode || (fullOk ? "all" : this.seg()?.result?.video ? "clip" : "all");
      const its = this.items();
      let ci = opt.i ?? Math.max(0, this.sel);
      const ld = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } };
      const folder = h("input", { class: "h3z-in", value: ld("h3zs.exportDir", ""), placeholder: "по умолчанию: ComfyUI/output/h3zerostudio/export", title: "Папка на компьютере, где запущен ComfyUI (например D:\\\\Видео\\\\H3). Относительный путь — внутри ComfyUI/output" });
      const d = new Date(), z = (x) => String(x).padStart(2, "0");   // local time (toISOString would be UTC)
      const stamp = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}-${z(d.getMinutes())}`;
      const name = h("input", { class: "h3z-in", value: `${(this.p.name || "h3").replace(/[\\\\/:*?"<>|]/g, "_")}_${stamp}` });
      const vEnd = this.totalFrames();
      const fIn = h("input", { class: "h3z-in sm", type: "number", step: "0.1", min: 0, value: ((this._rangeIn ?? 0) / C.FPS).toFixed(2) });
      const fOut = h("input", { class: "h3z-in sm", type: "number", step: "0.1", min: 0, value: ((this._rangeOut ?? vEnd) / C.FPS).toFixed(2) });
      const phBtn = (inp, title) => h("button", { class: "h3z-btn sm", title, onclick: () => { inp.value = (this.playhead / C.FPS).toFixed(2); upd(); } }, "⌖ плейхед");
      const music = C.musicClips(this.p).length > 0 || (this.p.audio.video_volume ?? 1) !== 1;
      const mixT = this.toggle("Микс: музыка + звук видео " + Math.round((this.p.audio.video_volume ?? 1) * 100) + "%", this._exportMix !== false, (v) => { this._exportMix = v; mixT.classList.toggle("on", v); }, "Дорожка «Музыка» и громкость звука видео применяются к файлу");
      mixT.onclick = () => { this._exportMix = this._exportMix === false; mixT.classList.toggle("on", this._exportMix !== false); };
      const info = h("div", { class: "h3z-note" });
      const pills = h("div", { class: "h3z-pills" });
      const segSel = h("select", { class: "h3z-sel sm" }, its.map((it, k) => h("option", { value: k, selected: k === ci }, `${k + 1}. ${this.p.segments[k].name || "Отрезок " + (k + 1)}`)));
      segSel.onchange = () => { ci = Number(segSel.value); upd(); };
      const rowR = h("div", { class: "h3z-row" }, h("span", null, "с"), fIn, phBtn(fIn, "Начало = плейхед"), h("span", null, "по"), fOut, phBtn(fOut, "Конец = плейхед"));
      const rowC = h("div", { class: "h3z-row" }, segSel);
      const go = h("button", { class: "h3z-btn primary", html: (ICON.save || "💾") + "<span>Сохранить</span>" });
      const src = () => {
        if (mode === "clip") {
          const s = this.p.segments[ci], it = its[ci];
          if (fullOk && it) { const ov = ci ? it.overlap : 0; return { source: full.video, range: [it.start + ov, Math.min(it.end, vEnd)], tl: 0, why: "" }; }
          if (s?.result?.video && !this.isStale(ci)) return { source: s.result.video, range: null, tl: it?.start || 0, why: "" };
          return { why: "Отрезок не сгенерирован (или изменён) — сначала «Сгенерировать»" };
        }
        if (!fullOk) return { why: full?.video ? "Итоговое видео устарело или неполное — запустите «Сгенерировать» для всего ролика" : "Ролик ещё не сгенерирован" };
        if (mode === "all") return { source: full.video, range: null, tl: 0, why: "" };
        const a = Math.round(Number(fIn.value) * C.FPS), b = Math.round(Number(fOut.value) * C.FPS);
        if (!(b > a)) return { why: "Конец фрагмента должен быть позже начала" };
        return { source: full.video, range: [Math.max(0, a), Math.min(b, full.frames || b)], tl: 0, why: "" };
      };
      const upd = () => {
        pills.innerHTML = "";
        for (const [k, l] of [["all", "Весь ролик"], ["range", "Фрагмент (с – по)"], ["clip", "Отрезок"]]) pills.append(h("div", { class: "h3z-pill" + (mode === k ? " on" : ""), onclick: () => { mode = k; upd(); } }, l));
        rowR.style.display = mode === "range" ? "" : "none"; rowC.style.display = mode === "clip" ? "" : "none";
        const x = src();
        go.disabled = !!x.why;
        const len = x.range ? (x.range[1] - x.range[0]) / C.FPS : mode === "all" ? (full?.frames || 0) / C.FPS : (its[ci]?.frames || 0) / C.FPS;
        info.textContent = x.why || `≈ ${len.toFixed(2)} с · mp4 H.264 + AAC · файл не перезаписывается (добавится _2, _3…)`;
        info.classList.toggle("err", !!x.why);
      };
      go.onclick = async () => {
        const x = src(); if (x.why) return;
        go.disabled = true; go.classList.add("busy");
        try { localStorage.setItem("h3zs.exportDir", folder.value.trim()); } catch (e) {}
        try {
          const r = await this.host.exportVideo({ source: x.source, range: x.range, folder: folder.value.trim(), name: name.value.trim() + (mode === "clip" ? `_отрезок${ci + 1}` : mode === "range" ? `_${fIn.value}-${fOut.value}s` : ""),
            project: music && this._exportMix !== false ? this.p : null, timeline_start: x.tl });
          this.lastExport = r;
          this.toast(`Сохранено: ${r.path} (${r.seconds.toFixed(2)} с)`);
          info.textContent = `✓ ${r.path}`; info.classList.remove("err");
          const cp = h("button", { class: "h3z-btn sm", onclick: () => { navigator.clipboard?.writeText(r.path); this.toast("Путь скопирован"); } }, "Скопировать путь");
          info.append(" ", cp);
        } catch (e) { this.toast("Не удалось сохранить: " + (e.message || e), true); info.textContent = "Ошибка: " + (e.message || e); info.classList.add("err"); }
        finally { go.disabled = false; go.classList.remove("busy"); }
      };
      fIn.onchange = upd; fOut.onchange = upd;
      const box = h("div", { class: "h3z-save h3z-glass" },
        h("div", { class: "hd" }, h("b", null, "💾 Сохранить видео"), h("i", { class: "grow" }), h("button", { class: "h3z-btn sm icon", onclick: () => this.closeSaveDialog() }, "✕")),
        this.field("Что сохранить", pills), rowR, rowC,
        this.field("Папка", folder), this.field("Имя файла (.mp4)", name),
        music ? mixT : null, info,
        h("div", { class: "h3z-row" }, h("i", { class: "grow" }), h("button", { class: "h3z-btn", onclick: () => this.closeSaveDialog() }, "Закрыть"), go));
      if (this._exportMix !== false) mixT.classList.add("on");
      const modal = this.$.saveModal = h("div", { class: "h3z-modal" }, box);
      modal.addEventListener("pointerdown", (e) => { if (e.target === modal) this.closeSaveDialog(); });
      box.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") this.closeSaveDialog(); if (e.key === "Enter" && !go.disabled) go.click(); });
      this.root.append(modal);
      upd();
      name.focus(); name.select();
    },
    closeSaveDialog() { if (this.$?.saveModal) { this.$.saveModal.remove(); this.$.saveModal = null; this.focusSink?.(); } },
  });
}

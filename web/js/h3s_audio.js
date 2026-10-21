import { T } from "./h3s_i18n.js";
// H3ZeroStudio: audio. Audio files are assets (category "audio", plus the node's audio input as a virtual asset).
// Clips on the audio track (two lanes, mixed) are the main composition: their audio latent is locked, the video
// follows the sound. An audio asset in a segment's references is an <Audio j> reference for that segment only.
// The track plays in sync with the player (before generation too).
// Lane 3 (index 2) is the music track: never locked, not a reference — mixed over the video's own sound at
// playback and in «Сохранить видео», with per-clip volume and fades.
const LANES = 3, MUSIC = 2;
const LANE_H = 34, LANE_GAP = 4;
const isMusic = (c) => (c.lane | 0) >= MUSIC;
const envAt = (c, local, len) => { let g = Number(c.volume ?? 1); if (c.fade_in > 0 && local < c.fade_in) g *= local / c.fade_in; if (c.fade_out > 0 && len - local < c.fade_out) g *= Math.max(0, len - local) / c.fade_out; return g; };

export function installAudio(Editor, { C, h, ICON }) {
  Object.assign(Editor.prototype, {
    /** Audio assets + the node input (virtual, id "input"). */
    audioAssets() {
      const ir = this.p.audio.input_ref;
      return [...this.p.assets.filter((a) => a.category === "audio"),
        { id: C.AUDIO_INPUT_ID, name: T("Вход audio ноды"), category: "audio", virtual: true, duration: ir?.duration || 0 }];
    },
    audioAsset(id) { return this.audioAssets().find((a) => a.id === id) || null; },
    audioRefOf(id) {
      if (id === C.AUDIO_INPUT_ID) return this.p.audio.input_ref;
      const a = this.p.assets.find((x) => x.id === id);
      return a ? { filename: a.file, subfolder: a.subfolder, type: a.type || "input" } : null;
    },
    assetDuration(id) {
      const pk = this.peaksFor(this.audioRefOf(id));
      return pk?.duration || this.audioAsset(id)?.duration || 0;
    },
    /** Effective clip on the timeline in seconds: {start, in, len, end, known}. */
    clipSpan(c) {
      const dur = this.assetDuration(c.asset);
      let len = c.length > 0 ? c.length : dur ? Math.max(0, dur - c.in) : 5;
      if (dur && c.length > 0) len = Math.min(len, Math.max(0, dur - c.in));
      return { start: c.start, in: c.in, len, end: c.start + len, known: !!dur };
    },
    audioClipById(id) { return this.p.audio.clips.find((c) => c.id === id) || null; },

    peaksFor(ref) {
      if (!ref?.filename) return null;
      this._peaks = this._peaks || {};
      const key = `${ref.type}/${ref.subfolder}/${ref.filename}`;
      const v = this._peaks[key];
      if (v === undefined) {
        this._peaks[key] = null;
        this.host.peaks?.(ref).then((r) => {
          this._peaks[key] = r?.peaks ? r : false;
          const a = this.p.assets.find((x) => x.category === "audio" && x.file === ref.filename && x.subfolder === (ref.subfolder || ""));
          if (r?.duration && a && Math.abs((a.duration || 0) - r.duration) > 1e-3) { a.duration = r.duration; this.scheduleSave(); }
          if (this.root) { this.renderTimeline(); if (this.tool === "assets") this.renderLeft(); }
        }).catch(() => { this._peaks[key] = false; });
      }
      return v || null;
    },

    async uploadAudioAssets(files) {
      let n = 0, last = null;
      for (const f of files) {
        try {
          const r = await this.host.upload(f, this.p.id);
          const id = C.newId("au");
          this.mutate((p) => { p.assets.push({ id, name: (f.name || r.name).replace(/\.[^.]+$/, ""), file: r.name, subfolder: r.subfolder || "", type: r.type || "input", category: "audio", duration: 0 }); }, { render: "none" });
          n++; last = id;
        } catch (e) { this.toast(T("Не удалось загрузить ") + f.name + ": " + (e.message || e), true); }
      }
      if (n) { this.renderAll(); this.toast(T("Аудио загружено: {0} · перетащите его на аудиодорожку или в референсы отрезка", n)); }
      return last;
    },

    addAudioClip(asset, start = 0, lane = 0) {
      const id = C.newId("ac");
      lane = Math.max(0, Math.min(LANES - 1, lane));
      this.mutate((p) => { p.audio.clips.push({ id, asset, lane, start: Math.max(0, Math.round(start * C.FPS) / C.FPS), in: 0, length: 0, volume: lane >= MUSIC ? 0.8 : 1, fade_in: 0, fade_out: 0 }); p.audio.clips.sort((a, b) => a.start - b.start || a.lane - b.lane); });
      this.selAudio = id; this.selMarker = null; this.audioPanelRefresh(); this.renderTimeline();
      this.toast(lane >= MUSIC ? T("Музыка: играет поверх звука видео (не фиксируется, не референс) · громкость и фейды — правый клик") : T("Клип на аудиодорожке: звук зафиксирован, видео подстроится под него"));
    },

    /** S on a selected audio clip: split it at the playhead. */
    splitAudio() {
      const c = this.audioClipById(this.selAudio); if (!c) return false;
      const sp = this.clipSpan(c), t = this.playhead / C.FPS, local = t - sp.start;
      if (local <= 0.05 || local >= sp.len - 0.05) { this.toast(T("Поставьте плейхед внутрь выбранного аудиоклипа"), true); return true; }
      const id = C.newId("ac");
      this.mutate((p) => {
        const x = p.audio.clips.find((k) => k.id === c.id);
        const rest = sp.len - local;
        x.length = Math.round(local * 1000) / 1000;
        const fo = x.fade_out; x.fade_out = 0;
        p.audio.clips.push({ id, asset: c.asset, lane: c.lane, start: Math.round(t * 1000) / 1000, in: Math.round((c.in + local) * 1000) / 1000, length: c.length > 0 || sp.known ? Math.round(rest * 1000) / 1000 : 0, volume: c.volume ?? 1, fade_in: 0, fade_out: fo || 0 });
        p.audio.clips.sort((a, b) => a.start - b.start || a.lane - b.lane);
      });
      this.selAudio = id; this.audioPanelRefresh();
      this.toast(T("Аудиоклип разрезан · Del — удалить выбранный кусок"));
      return true;
    },

    deleteAudio(id = this.selAudio) {
      if (!this.audioClipById(id)) return false;
      this.mutate((p) => { p.audio.clips = p.audio.clips.filter((c) => c.id !== id); });
      this.selAudio = null; this.audioStop(); this.audioPanelRefresh();
      this.toast(T("Аудиоклип удалён · Ctrl+Z — вернуть"));
      return true;
    },

    audioPanelRefresh() { if (this.tool === "assets") this.renderLeft(); if (this.root) this.renderInspector(); },

    selectAudio(id) {
      this.selAudio = id; this.selMarker = null;
      this.renderInspector(); this.renderTimeline();
    },

    /** Speaker toggles: lanes 1-2 (lock, «Слышать дорожку») and the music lane. */
    setMonitor(kind, v) {
      const k = kind === "music" ? "musicMonitor" : "audioMonitor";
      this[k] = v;
      try { localStorage.setItem(kind === "music" ? "h3zs.musicMon" : "h3zs.monitor2", JSON.stringify(v)); } catch (e) {}
      if (!v) this.audioStop();
      this.renderAudioHead();
    },

    /** Audio track header (left column): label, per-track speaker toggles, audio_vae warning. */
    renderAudioHead() {
      const H = this.$.aHead; if (!H) return;
      H.innerHTML = "";
      const clips = this.p.audio.clips, lock = clips.some((c) => !isMusic(c)), music = clips.some(isMusic);
      const linked = this.host.inputLinked?.("audio_vae");
      const spk = (kind, on, title) => {
        const b = h("button", { class: "h3z-spk" + (on ? " on" : " off"), title: (on ? T("Звук включён") : T("Звук выключен")) + " — " + title });
        b.textContent = on ? "🔊" : "🔇";
        b.addEventListener("pointerdown", (e) => e.stopPropagation());
        b.onclick = (e) => { e.stopPropagation(); this.setMonitor(kind, !on); };
        return b;
      };
      const row = (top, ...kids) => h("div", { class: "h3z-arow", style: { top: top + "px", height: LANE_H + "px" } }, ...kids);
      const tip = T("Клипы на дорожках 1–2 — основная композиция: звук фиксируется, видео генерируется под него (ритм, липсинк). ") +
        T("Аудио в референсах отрезка — только подсказка <Audio N>. Дорожка «Музыка» не фиксируется: микшируется поверх звука видео при воспроизведении и сохранении.");
      H.title = tip;
      H.append(
        row(0, h("i", { html: ICON.audio }), h("span", { class: "nm" }, T("Аудио")),
          lock && linked === false ? h("span", { class: "h3z-warn", title: T("Не подключён вход audio_vae (minimax_h3_audio_vae): без него звук дорожки не фиксируется в генерации, а просто идёт на выход audio.") }, "⚠") : null,
          spk("lock", this.audioMonitor !== false, T("слышать дорожку при воспроизведении (звук готового видео при этом приглушается)"))),
        row(LANE_H + LANE_GAP, h("span", { class: "sub" }, "🔒 2")),
        row(2 * (LANE_H + LANE_GAP), h("span", { class: "nm music" }, T("♫ Музыка")),
          spk("music", this.musicMonitor !== false, T("слышать музыку при воспроизведении") + (music ? "" : T(" (дорожка пуста)")))));
    },

    /** Inspector card of the selected audio clip (replaces the old left «Аудио» panel). */
    audioClipCard() {
      const c = this.audioClipById(this.selAudio);
      if (!c) return null;
      const card = h("div", { class: "h3z-card h3z-glass" });
      const a = this.audioAsset(c.asset), sp = this.clipSpan(c);
      const num = (label, val, set, hint) => {
        const inp = h("input", { class: "h3z-in", type: "number", step: "0.05", min: 0, value: val.toFixed(2) });
        inp.onchange = () => { const v = Math.max(0, Number(inp.value) || 0); this.mutate((p) => set(p.audio.clips.find((k) => k.id === c.id), v)); };
        return h("div", { class: "h3z-field" }, h("div", { class: "h3z-lbl" }, label, hint ? h("em", null, hint) : null), inp);
      };
      const vv = (() => { const r = h("input", { class: "h3z-range", type: "range", min: 0, max: 2, step: 0.05, value: this.p.audio.video_volume ?? 1 });
        const v = h("div", { class: "h3z-val" }, Math.round((this.p.audio.video_volume ?? 1) * 100) + "%");
        const spf = () => r.style.setProperty("--p", (r.value / 2 * 100) + "%"); spf();
        r.oninput = () => { spf(); v.textContent = Math.round(r.value * 100) + "%"; this.mutate((p) => { p.audio.video_volume = Number(r.value); }, { coalesce: "vvol", render: "none" }); this.applyVolume(); };
        return h("div", null, h("div", { class: "h3z-lbl", title: T("Громкость сгенерированного звука под дорожкой «Музыка» — в плеере и в «Сохранить видео»") }, T("Звук видео под музыкой"), h("em", null, T("весь ролик"))), h("div", { class: "h3z-row" }, r, v)); })();
      card.append(h("div", { class: "h3z-card-h" }, h("h4", null, (isMusic(c) ? "♫ " : "🔒 ") + T("Аудиоклип")),
          h("button", { class: "h3z-btn sm icon", title: T("Закрыть"), onclick: () => { this.selAudio = null; this.renderInspector(); this.renderTimeline(); } }, "✕")),
        h("div", { class: "h3z-afile" }, h("i", { html: ICON.audio }), h("div", null, h("b", null, a?.name || c.asset), h("small", null, `${isMusic(c) ? T("музыка") : T("дорожка ") + (c.lane + 1)} · ${sp.known ? T("файл {0} с", this.assetDuration(c.asset).toFixed(2)) : T("длина файла неизвестна")}`))),
        h("div", { class: "h3z-arows" },
          h("div", { class: "h3z-field" }, h("div", { class: "h3z-lbl" }, T("Дорожка")), h("div", { class: "h3z-pills" },
            [[0, "🔒 1"], [1, "🔒 2"], [2, T("♫ Музыка")]].map(([l, t]) => h("div", { class: "h3z-pill" + (c.lane === l ? " on" : ""), title: l >= MUSIC ? T("Музыка поверх видео: не фиксируется, только микс при воспроизведении и сохранении") : T("Основная композиция: звук фиксируется в генерации"), onclick: () => this.mutate((p) => { p.audio.clips.find((k) => k.id === c.id).lane = l; }) }, t)))),
          num(T("Громкость, %"), (c.volume ?? 1) * 100, (x, v) => { x.volume = Math.min(2, v / 100); }, isMusic(c) ? "0–200" : T("меняет фиксируемый звук")),
          num(T("Фейд в начале"), c.fade_in || 0, (x, v) => { x.fade_in = v; }, T("с")),
          num(T("Фейд в конце"), c.fade_out || 0, (x, v) => { x.fade_out = v; }, T("с")),
          num(T("Старт на таймлайне"), sp.start, (x, v) => { x.start = v; }, T("с")),
          num(T("Начало в файле"), sp.in, (x, v) => { x.in = v; }, T("с")),
          num(T("Длина"), sp.len, (x, v) => { x.length = v; }, c.length > 0 ? T("с") : T("с · до конца файла")),
          h("div", { class: "h3z-field" }, h("div", { class: "h3z-lbl" }, T("Конец на таймлайне"), h("em", null, T("с"))), h("div", { class: "h3z-in ro" }, sp.end.toFixed(2)))),
        isMusic(c) || this.p.audio.clips.some(isMusic) ? vv : "",
        h("div", { class: "h3z-row" },
          h("button", { class: "h3z-btn sm", html: ICON.cut + T("<span>Разрезать (S)</span>"), onclick: () => this.splitAudio() }),
          a && !a.virtual ? h("button", { class: "h3z-btn sm", html: T("<span>✎ Файл…</span>"), title: T("Открыть файл в редакторе ассета"), onclick: () => this.openAssetEditor?.(a.id) }) : null,
          h("button", { class: "h3z-btn sm danger", html: ICON.trash + T("<span>Удалить (Del)</span>"), onclick: () => this.deleteAudio() })));
      return card;
    },

    /** Audio tiles of the asset panel. */
    audioTiles(used = new Set()) {
      return this.audioAssets().map((a) => {
        const ref = this.audioRefOf(a.id), pk = this.peaksFor(ref), dur = this.assetDuration(a.id);
        const card = h("div", { class: "h3z-asset audio" + (a.virtual ? " virtual" : "") + (used.has(a.id) ? " used" : ""), draggable: "true", title: T("{0}\nПеретащите на аудиодорожку (основная композиция) или на отрезок (референс <Audio N>).", a.name) });
        const cv = h("canvas", { class: "wf", width: 240, height: 70 });
        drawPeaks(cv, pk, 0, pk?.duration || 1, "rgba(251,191,36,.9)");
        const play = h("button", { class: "h3z-btn sm icon play", title: ref ? T("Прослушать") : T("Файл появится после первого запуска"), html: this._previewId === a.id ? ICON.pause : ICON.play });
        play.onclick = (e) => { e.stopPropagation(); this.previewAsset(a.id); };
        if (!ref) play.disabled = true;
        card.append(h("div", { class: "cat audio" }, a.virtual ? T("Вход") : T("Аудио")), cv, play,
          h("div", { class: "cap" }, h("div", null, a.name), h("small", null, dur ? C.fmtTime(dur) : a.virtual ? T("после запуска") : "…")));
        if (!a.virtual) {
          const del = h("div", { class: "del", title: T("Убрать из проекта (файл остаётся в input)"), html: ICON.trash.replace("<svg", '<svg style="width:13px;height:13px"') });
          del.onclick = (e) => { e.stopPropagation(); this.mutate((p) => { p.assets = p.assets.filter((x) => x.id !== a.id); p.audio.clips = p.audio.clips.filter((c) => c.asset !== a.id); for (const s of p.segments) s.refs = s.refs.filter((r) => r !== a.id); }); };
          card.append(del);
        }
        card.addEventListener("dragstart", (e) => { e.dataTransfer.setData("application/x-h3s-asset", a.id); e.dataTransfer.setData("application/x-h3s-audio", a.id); e.dataTransfer.effectAllowed = "copy"; });
        card.onclick = () => this.toggleRef(this.sel, a.id);
        if (!a.virtual) card.addEventListener("dblclick", (e) => { e.stopPropagation(); this.openAssetEditor(a.id); });
        card.addEventListener("contextmenu", (e) => this.assetMenu?.(e, a));
        if (a.orig) card.append(h("div", { class: "edt", title: T("Обработанная копия (оригинал сохранён)") }, "✎"));
        return card;
      });
    },

    previewAsset(id) {
      const ref = this.audioRefOf(id);
      if (this._previewEl) { this._previewEl.pause(); this._previewEl = null; }
      if (this._previewId === id || !ref) { this._previewId = null; this.renderLeft(); return; }
      const el = new Audio(this.host.url(ref));
      el.onended = () => { this._previewId = null; this.renderLeft(); };
      el.play().catch(() => {});
      this._previewEl = el; this._previewId = id; this.renderLeft();
    },

    // ---------------------------------------------------------------- track
    renderAudioTrack(at, ppf) {
      const pps = ppf * C.FPS, clips = this.p.audio.clips;
      this.renderAudioHead();
      for (let l = 0; l < LANES; l++) at.append(h("div", { class: "h3z-alane" + (l >= MUSIC ? " music" : ""), style: { top: l * (LANE_H + LANE_GAP) + "px", height: LANE_H + "px" } }, l >= MUSIC && !clips.some(isMusic) ? h("span", null, T("♫ Музыка — перетащите аудио сюда: играет поверх звука видео, не фиксируется")) : null));
      if (!clips.length) at.append(h("div", { class: "h3z-audio none", style: { left: "1px", width: Math.max(260, this.totalFrames() * ppf - 3) + "px", height: LANE_H + "px" } },
        h("span", null, T("Звук генерирует H3 · перетащите сюда аудио из ассетов — оно станет основной композицией (звук фиксируется)"))));
      for (const c of clips) {
        const sp = this.clipSpan(c), a = this.audioAsset(c.asset);
        const x0 = sp.start * pps, wd = Math.max(16, sp.len * pps - 2);
        const el = h("div", { class: "h3z-audio clip " + (isMusic(c) ? "music" : "locked") + (c.id === this.selAudio ? " sel" : "") + (sp.known ? "" : " unknown"), style: { left: x0 + 1 + "px", width: wd + "px", top: c.lane * (LANE_H + LANE_GAP) + "px", height: LANE_H + "px" } });
        const pk = this.peaksFor(this.audioRefOf(c.asset));
        const cw = Math.min(Math.ceil(wd), 16000);
        if (pk?.peaks?.length && pk.duration) {
          const cv = h("canvas", { class: "wf" });
          sizeCanvas(cv, cw, LANE_H - 8);
          drawPeaks(cv, pk, sp.in, sp.in + cw / pps, "rgba(255,255,255,.85)");
          el.append(cv);
        } else el.append(h("div", { class: "wv" }));
        el.append(h("span", { class: "lbl" }, (isMusic(c) ? "♫ " : "🔒 ") + (a?.name || c.asset), h("small", null, (sp.in ? T(" · с {0} с", sp.in.toFixed(1)) : "") + ((c.volume ?? 1) !== 1 ? ` · ${Math.round(c.volume * 100)}%` : ""))));
        if (c.fade_in > 0) el.append(h("div", { class: "fd in", style: { width: Math.min(wd, c.fade_in * pps) + "px" } }));
        if (c.fade_out > 0) el.append(h("div", { class: "fd out", style: { width: Math.min(wd, c.fade_out * pps) + "px" } }));
        const hl = h("div", { class: "th l", title: T("Подрезать начало") }), hr = h("div", { class: "th r", title: T("Подрезать конец") });
        el.append(hl, hr);
        el.addEventListener("pointerdown", (e) => this.audioDrag(e, c.id, e.target === hl ? "l" : e.target === hr ? "r" : "move"));
        el.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); this.selAudio = c.id; this.renderTimeline(); this.audioMenu ? this.audioMenu(e, c.id) : this.selectAudio(c.id); });
        at.append(el);
      }
      at.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("application/x-h3s-audio")) { e.preventDefault(); at.classList.add("dropover"); } });
      at.addEventListener("dragleave", () => at.classList.remove("dropover"));
      at.addEventListener("drop", (e) => {
        at.classList.remove("dropover");
        const id = e.dataTransfer.getData("application/x-h3s-audio"); if (!id) return;
        e.preventDefault(); e.stopPropagation();
        const r = at.getBoundingClientRect();
        this.addAudioClip(id, Math.max(0, this.frameAt(e.clientX) / C.FPS), Math.max(0, Math.min(LANES - 1, Math.floor((e.clientY - r.top) / (LANE_H + LANE_GAP)))));
      });
    },

    audioDrag(e, id, kind) {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const c0 = { ...this.audioClipById(id) }, sp0 = this.clipSpan(c0), dur = this.assetDuration(c0.asset);
      const sx = e.clientX, sy = e.clientY, pps = this.ppf * C.FPS;
      const snap = (t) => Math.round(t * C.FPS) / C.FPS;
      let moved = false;
      const tip = h("div", { class: "h3z-tip" }); document.body.append(tip);
      const move = (ev) => {
        const dt = (ev.clientX - sx) / pps;
        if (!moved && Math.abs(ev.clientX - sx) < 3 && Math.abs(ev.clientY - sy) < 6) return;
        moved = true;
        let st = c0.start, tin = c0.in, len = sp0.len, lane = c0.lane;
        if (kind === "move") {
          st = Math.max(0, snap(c0.start + dt));
          lane = Math.max(0, Math.min(LANES - 1, c0.lane + Math.round((ev.clientY - sy) / (LANE_H + LANE_GAP))));
        } else if (kind === "l") {
          const d = Math.max(-Math.min(c0.in, c0.start), Math.min(dt, sp0.len - 0.2));
          st = snap(c0.start + d); tin = Math.max(0, snap(c0.in + d)); len = sp0.len - (st - c0.start);
        } else len = Math.max(0.2, snap(sp0.len + dt));
        if (dur) len = Math.min(len, Math.max(0.2, dur - tin));
        tip.style.left = ev.clientX + 12 + "px"; tip.style.top = ev.clientY - 34 + "px";
        tip.textContent = kind === "move" ? T("старт {0} с · дорожка {1}", st.toFixed(2), lane + 1) : T("с {0} с · длина {1} с", tin.toFixed(2), len.toFixed(2));
        this.mutate((p) => {
          const x = p.audio.clips.find((k) => k.id === id); if (!x) return;
          x.start = st; x.in = tin; x.lane = lane;
          if (kind !== "move") x.length = Math.round(len * 1000) / 1000;
        }, { coalesce: "aud" + kind + id + sx, render: "none" });
        this.selAudio = id;
        this.renderTimeline();
      };
      const up = () => {
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); tip.remove();
        if (moved) this.p.audio.clips.sort((a, b) => a.start - b.start || a.lane - b.lane);
        this.selectAudio(id); this.renderHeader();
      };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    },

    // ---------------------------------------------------------------- playback in sync with the player
    audioActive() { return this.p.audio.clips.length > 0; },

    /** Play the clips under the playhead. musicOnly: a generated video with its own sound is shown — only the
     * music lane plays over it (lock clips are already in that sound). The monitor switch mutes the lock lanes. */
    audioTick(t, musicOnly = false) {
      if (!this.audioActive()) return this.audioStop();
      this._aud = this._aud || {};
      const live = new Set();
      for (const c of this.p.audio.clips) {
        if (!isMusic(c) && (musicOnly || this.audioMonitor === false)) continue;
        if (isMusic(c) && this.musicMonitor === false) continue;
        const ref = this.audioRefOf(c.asset); if (!ref) continue;
        const sp = this.clipSpan(c);
        if (t < sp.start || t >= sp.end) continue;
        live.add(c.id);
        const url = this.host.url(ref);
        let el = this._aud[c.id];
        if (!el || el.dataset.src !== url) { el?.pause(); el = this._aud[c.id] = new Audio(url); el.dataset.src = url; el.preload = "auto"; }
        el.volume = this.vol?.muted ? 0 : Math.max(0, Math.min(1, (this.vol?.v ?? 1) * envAt(c, t - sp.start, sp.len)));
        const rate = this.playRate || 1;   // «Удобный просмотр» speed
        if (el.playbackRate !== rate) { el.defaultPlaybackRate = rate; el.playbackRate = rate; }
        const want = sp.in + (t - sp.start);
        if (el.paused) { try { el.currentTime = want; } catch (e) {} el.play().catch(() => {}); }
        else if (Math.abs(el.currentTime - want) > 0.25 * Math.max(1, rate)) { try { el.currentTime = want; } catch (e) {} }
      }
      for (const [id, el] of Object.entries(this._aud)) if (!live.has(id) && !el.paused) el.pause();
    },

    audioStop() { for (const el of Object.values(this._aud || {})) { try { el.pause(); } catch (e) {} } },
  });
}

function sizeCanvas(cv, w, hh) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.ceil(w * dpr); cv.height = Math.ceil(hh * dpr);
  cv.style.width = w + "px"; cv.style.height = hh + "px";
  cv.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** Draw min/max peaks of the source time range [t0, t1) across the canvas width. */
export function drawPeaks(cv, pk, t0, t1, color) {
  const g = cv.getContext("2d");
  const W = parseFloat(cv.style.width) || cv.width, H = parseFloat(cv.style.height) || cv.height, mid = H / 2;
  g.fillStyle = color;
  if (!pk?.peaks?.length || !pk.duration) { for (let x = 0; x < W; x += 4) g.fillRect(x, mid - 1, 2, 2); return; }
  const n = pk.peaks.length, spp = (t1 - t0) / W;
  for (let x = 0; x < W; x += 2) {
    const a = t0 + x * spp, b = a + 2 * spp;
    const b0 = Math.floor(a / pk.duration * n), b1 = Math.max(b0 + 1, Math.ceil(b / pk.duration * n));
    if (b0 >= n) break;
    let lo = 0, hi = 0;
    for (let k = b0; k < Math.min(n, b1); k++) { lo = Math.min(lo, pk.peaks[k][0]); hi = Math.max(hi, pk.peaks[k][1]); }
    const y0 = mid - Math.min(1, hi) * mid * 0.95, y1 = mid - Math.max(-1, lo) * mid * 0.95;
    g.fillRect(x, y0, 1.4, Math.max(1, y1 - y0));
  }
}

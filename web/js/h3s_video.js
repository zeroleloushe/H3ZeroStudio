// Video assets: uploaded video files and frozen segments.
//  * on the timeline (drag onto the empty part of the video track / «Продлить»): a footage clip. «Как есть» —
//    VAE-encoded and used unchanged; the next segment continues from its tail. «Перегенерировать» — vid2vid from
//    the footage with partial denoise (prompt and refs apply). Split a long file into clips to regenerate only part.
//  * in a segment's references (drag onto a clip / its refs): <Video k> motion reference (H3 ref_videos, max 3, 2-15 s).
export const isVideo = (f) => (f.type || "").startsWith("video/") || /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(f.name || "");

export function installVideo(Editor, { C, h, ICON }) {
  Object.assign(Editor.prototype, {
    videoAssets() { return this.p.assets.filter((a) => a.category === "video"); },

    posterUrl(a) { return a.poster ? this.host.url(a.poster) : ""; },

    /** Filmstrip of a video asset (older projects: fetched once on demand). */
    videoStrip(a) {
      if (!a) return null;
      if (a.strip && a.strip_n) return a;
      this._stripReq = this._stripReq || {};
      const rk = a.id + "|" + a.file;
      if (!this._stripReq[rk] && a.file && this.host.videoInfo) {
        this._stripReq[rk] = true;
        this.host.videoInfo({ filename: a.file, subfolder: a.subfolder, type: a.type || "input" }, true).then((inf) => {
          if (!inf?.strip) return;
          const x = this.p.assets.find((k) => k.id === a.id); if (!x) return;
          x.strip = inf.strip; x.strip_n = inf.strip_n; if (!x.frames) x.frames = inf.frames; if (!x.poster) x.poster = inf.poster;
          this.scheduleSave?.(); if (this.root) this.renderTimeline();
        }).catch(() => {});
      }
      return null;
    },

    /** Footage segment (or frozen one without its preview) playable straight from the source file. */
    footageSource(i) {
      const s = this.seg(i), it = this.items()[i]; if (!s || !it) return null;
      let a = null, off = 0;
      if (s.source) { a = this.p.assets.find((x) => x.id === s.source.asset); off = s.source.in / C.FPS; }
      else if (s.freeze) { a = this.p.assets.find((x) => x.category === "video" && x.frozen === s.id); }
      if (!a?.file) return null;
      return { kind: "segment", ref: { filename: a.file, subfolder: a.subfolder, type: a.type || "input" }, start: it.start, off, end: it.end, foot: true, asset: a };
    },

    async uploadVideoAssets(files) {
      let n = 0;
      for (const f of files) {
        try {
          const r = await this.host.upload(f);
          const ref = { filename: r.name, subfolder: r.subfolder || "", type: r.type || "input" };
          let info = {};
          try { info = await this.host.videoInfo(ref, false); } catch (e) { this.toast(`${f.name}: не удалось прочитать видео (${e.message || e})`, true); continue; }
          const id = C.newId("vd");
          this.mutate((p) => { p.assets.push({ id, name: (f.name || r.name).replace(/\.[^.]+$/, ""), file: r.name, subfolder: ref.subfolder, type: ref.type, category: "video",
            duration: info.duration, frames: info.frames, width: info.width, height: info.height, has_audio: info.has_audio, poster: info.poster, strip: info.strip || null, strip_n: info.strip_n || 0, frozen: "" }); }, { render: "none" });
          n++;
        } catch (e) { this.toast("Не удалось загрузить " + f.name + ": " + (e.message || e), true); }
      }
      if (n) { this.renderAll(); this.toast(`Видео загружено: ${n} · перетащите на дорожку (футаж) или на отрезок (референс <Video>)`); }
    },

    /** A frozen segment becomes a video asset (its preview mp4 with sound). */
    registerFrozenAsset(i, fr) {
      if (!fr?.video) return;
      const id = "fz_" + fr.key, s = this.p.segments[i];
      this.mutate((p) => {
        if (p.assets.some((a) => a.id === id)) return;
        p.assets.push({ id, name: `${s.name || "Отрезок " + (i + 1)} · зафикс.`, file: fr.video.filename, subfolder: fr.video.subfolder, type: fr.video.type || "output",
          category: "video", duration: fr.frames / C.FPS, frames: fr.frames, width: 0, height: 0, has_audio: true, poster: fr.poster || null, frozen: s.id });
      }, { render: "none" });
    },

    videoTiles(used) {
      const list = this.videoAssets();
      return list.map((a) => {
        const del = h("div", { class: "del", title: "Убрать из проекта (файл остаётся)", html: ICON.trash.replace("<svg", '<svg style="width:13px;height:13px"') });
        del.onclick = (e) => { e.stopPropagation(); this.removeVideoAsset(a.id); };
        const card = h("div", { class: "h3z-asset video" + (used?.has(a.id) ? " used" : ""), draggable: "true",
          title: `${a.name}\n${C.fmtTime(a.duration || 0)}${a.width ? ` · ${a.width}×${a.height}` : ""}${a.has_audio ? " · со звуком" : ""}\nПеретащите на пустую часть видеодорожки — футаж (продолжить / перегенерировать часть).\nНа отрезок или клик — референс <Video> выбранного отрезка.` },
          a.poster ? h("img", { src: this.posterUrl(a), loading: "lazy", draggable: "false" }) : h("div", { class: "ph" }, "🎞"),
          h("div", { class: "cat video" }, a.frozen ? "🔒 Фикс" : "Видео"), del,
          h("div", { class: "dur" }, C.fmtTime(a.duration || 0)),
          h("div", { class: "cap" }, h("div", null, a.name)));
        card.addEventListener("dragstart", (e) => { e.dataTransfer.setData("application/x-h3s-asset", a.id); e.dataTransfer.setData("application/x-h3s-video", a.id); e.dataTransfer.effectAllowed = "copy"; });
        card.onclick = () => this.toggleRef(this.sel, a.id);
        card.addEventListener("dblclick", (e) => { e.stopPropagation(); this.openAssetEditor(a.id); });
        card.addEventListener("contextmenu", (e) => this.assetMenu?.(e, a));
        if (a.orig) card.append(h("div", { class: "edt", title: "Обработанная копия (оригинал сохранён)" }, "✎"));
        return card;
      });
    },

    removeVideoAsset(id) {
      const used = this.p.segments.some((s) => s.source?.asset === id);
      if (used && !confirm("Этот файл лежит на таймлайне как футаж. Убрать ассет и превратить эти клипы в обычные отрезки?")) return;
      this.mutate((p) => { p.assets = p.assets.filter((x) => x.id !== id); for (const s of p.segments) { s.refs = s.refs.filter((r) => r !== id); if (s.source?.asset === id) s.source = null; } });
    },

    /** Footage clip from a video asset, appended at the end (or after segment `after`). */
    addFootage(id, after = null) {
      const a = this.p.assets.find((x) => x.id === id && x.category === "video"); if (!a) return;
      const avail = a.frames || Math.round((a.duration || 5) * C.FPS);
      const frames = Math.max(C.MIN_FRAMES, Math.min(C.MAX_FRAMES, C.snapFrames(avail, "down")));
      const s = this.newSegment(null);
      Object.assign(s, { name: a.name.slice(0, 40), frames, source: { asset: id, in: 0, denoise: 0 }, link: "extend" });
      const at = after === null ? this.p.segments.length : after + 1;
      this.mutate((p) => { p.segments.splice(at, 0, s); }, { render: "none" });
      this.sel = at; this.pvMode = "segment";
      const it = this.items()[at]; if (it) this.playhead = it.start;
      this.renderAll(); this.scrollToPlayhead?.();
      if (!this.pastMarkerHint()) this.toast(`Футаж «${a.name}» на таймлайне (${(frames / C.FPS).toFixed(1)} с${avail < frames ? "" : avail > frames ? `, из ${(avail / C.FPS).toFixed(1)} с` : ""}). Следующий отрезок продолжит его`);
    },

    /** Segment-card block of a footage clip: file range and mode (as is / vid2vid). */
    footageBlock(i) {
      const s = this.seg(i), src = s.source, a = this.p.assets.find((x) => x.id === src.asset) || {};
      const avail = a.frames || 0, set = (fn, opt) => this.mutate((p) => fn(p.segments[i].source), opt);
      const inIn = h("input", { class: "h3z-in", type: "number", min: 0, step: 0.1, value: (src.in / C.FPS).toFixed(2), title: "С какого места файла начинается клип (секунды)" });
      inIn.onchange = () => set((x) => { x.in = Math.max(0, Math.round(Number(inIn.value) * C.FPS) || 0); });
      const end = src.in + s.frames, short = avail && end > avail;
      const mode = h("div", { class: "h3z-pills" },
        h("div", { class: "h3z-pill" + (!src.denoise ? " on" : ""), title: "Кадры и звук файла без изменений (VAE). Следующие отрезки продолжают их", onclick: () => set((x) => { x.denoise = 0; }) }, "▶ Как есть"),
        h("div", { class: "h3z-pill" + (src.denoise ? " on" : ""), title: "vid2vid: H3 перерисовывает этот кусок по промпту, сохраняя движение/композицию файла (denoise)", onclick: () => set((x) => { x.denoise = x.denoise || 0.6; }) }, "↻ Перегенерировать"));
      const box = h("div", { class: "h3z-foot" },
        h("div", { class: "h3z-lbl" }, "🎞 Футаж", h("em", null, a.name || "файл не найден")),
        h("div", { class: "h3z-grid2" }, this.field("начало в файле, с", inIn),
          h("div", { class: "h3z-field" }, h("div", { class: "h3z-lbl" }, "фрагмент"), h("div", { class: "h3z-val" + (short ? " warn" : "") }, `${C.fmtTime(src.in / C.FPS)}–${C.fmtTime(end / C.FPS)}` + (avail ? ` из ${C.fmtTime(avail / C.FPS)}` : "")))),
        mode);
      if (src.denoise) {
        const r = h("input", { class: "h3z-range", type: "range", min: 0.1, max: 1, step: 0.05, value: src.denoise });
        const v = h("div", { class: "h3z-val" }, Number(src.denoise).toFixed(2));
        const sp = () => r.style.setProperty("--p", ((r.value - 0.1) / 0.9 * 100) + "%"); sp();
        r.oninput = () => { sp(); v.textContent = Number(r.value).toFixed(2); set((x) => { x.denoise = Number(r.value); }, { coalesce: "fdn" + s.id, render: "light" }); };
        box.append(h("div", null, h("div", { class: "h3z-lbl" }, "Сила перерисовки (denoise)", h("em", null, "0.3 — лёгкая правка · 0.6 — новая картинка, то же движение · 1 — с нуля")), h("div", { class: "h3z-row" }, r, v)));
      }
      box.append(h("div", { class: "h3z-note" }, src.denoise
        ? "Промпт и референсы ниже применяются. Чтобы перегенерировать только часть файла — разрежьте футаж (S) и включите «Перегенерировать» у нужного куска."
        : "Промпт не используется. Отрезок после футажа продолжит его с перекрытием, как обычное продление." + (short ? " ⚠ Файл короче клипа — последний кадр держится." : "")));
      return box;
    },

    videoRefChips(i, box) {
      const s = this.seg(i);
      C.videoRefs(this.p, s).forEach((a, k) => {
        const chip = h("div", { class: "h3z-ref vid" + (k >= C.MAX_REF_VIDEOS ? " over" : ""), title: `Видео-референс «${a.name}» (движение/стиль; первые ${Math.min(15, a.duration || 15).toFixed(0)} с) · клик — вставить <Video ${k + 1}>` },
          a.poster ? h("img", { src: this.posterUrl(a) }) : h("span", { class: "ico" }, "🎞"), h("span", { class: "tg" }, `<Video ${k + 1}>`), h("span", null, a.name.slice(0, 14)));
        const x = h("span", { class: "x", title: "Убрать" }, "✕");
        x.onclick = (e) => { e.stopPropagation(); this.toggleRef(i, a.id); };
        chip.append(x);
        chip.onclick = () => this.insertTag(`<Video ${k + 1}>`);
        chip.ondblclick = (e) => { e.stopPropagation(); this.openAssetEditor(a.id); };
        chip.oncontextmenu = (e) => this.assetMenu(e, a);
        box.append(chip);
      });
      return C.videoRefs(this.p, s).length;
    },
  });
}

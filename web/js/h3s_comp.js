import { T } from "./h3s_i18n.js";
// «Весь ролик» as a live timeline composition.
// The final stitched video is played only while it matches the timeline (all segments up to the end marker
// generated with their current settings). Otherwise the player assembles the timeline on the fly: the active
// take of each segment (marked «устарел» if its settings changed), footage/frozen clips straight from their
// files, and a placeholder frame for segments not generated yet / gaps before a fixed end marker. Under
// placeholders the audio track sounds; the music lane always (via audioTick). The old final video stays
// viewable under «Прошлый итог».
export function installComp(Editor, { C, h, PALETTE }) {
  Object.assign(Editor.prototype, {
    /** The stitched final video matches the timeline EXACTLY: same segments (ids, in order) with the same
     *  cache keys (active takes, none out of date) and the same video end. Results of older versions (no
     *  segment list) never count as current. Only then «Весь ролик» plays the final file. */
    fullCurrent() {
      const r = this.p.result, n = this.genCount();
      if (!r?.full?.video || r.full.partial || !Array.isArray(r.segs) || r.segs.length !== n || !n) return false;
      for (let i = 0; i < n; i++) {
        const s = this.p.segments[i], x = r.segs[i];
        if (!s || s.id !== x.id || !s.result?.key || s.result.key !== x.key || this.isStale(i)) return false;
      }
      return r.end === this.totalFrames();
    },
    /** «Весь ролик» = the live timeline composition unless the final file is exactly current. */
    compMode() { return this.pvMode === "full" && this.p.segments.length > 0 && !this.fullCurrent(); },
    /** «Прошлый итог» (explicit tab only): an old final whose segments all still exist on the timeline. */
    hasOldFull() {
      const r = this.p.result;
      if (!r?.full?.video || this.fullCurrent()) return false;
      if (!Array.isArray(r.segs)) return false;   // a result of an older version: its segments cannot be verified
      return r.segs.length > 0 && r.segs.every((x) => this.p.segments.some((s) => s.id === x.id));
    },

    /** Segment shown at a timeline frame (a frame in an overlap belongs to the earlier clip), -1 = gap. */
    compIndexAt(f) {
      const its = this.items();
      for (let i = 0; i < its.length; i++) { const it = its[i]; if (f >= it.start + (i ? it.overlap : 0) && f < it.end) return i; }
      return -1;
    },

    /** What the composition shows at frame f. */
    compSource(f) {
      const its = this.items(), i = this.compIndexAt(f);
      if (i < 0) {
        const nx = its.find((it) => it.start > f);
        return { kind: "comp", seg: -1, ph: true, start: f, end: nx ? nx.start : this.totalFrames() };
      }
      const s = this.seg(i), it = its[i];
      const foot = s && (C.isFootage(s) || s.freeze) ? this.footageSource?.(i) : null;
      let src = null;
      if (foot && C.isFootage(s) && (!s.result?.video || this.isStale(i))) src = foot;
      else if (s?.result?.video) src = { ref: s.result.video, start: it.start, off: 0, stale: this.isStale(i) };
      else if (foot) src = foot;
      if (!src) return { kind: "comp", seg: i, ph: true, start: it.start, end: it.end };
      return { ...src, kind: "comp", seg: i, end: it.end };
    },

    /** Placeholder frame of a segment without video (or of a gap). */
    compPlaceholder(src) {
      const s = src.seg >= 0 ? this.seg(src.seg) : null;
      const col = s ? PALETTE[s.color % PALETTE.length][0] : "#1f2440";
      const ref = s?.refs?.map((r) => this.p.assets.find((a) => a.id === r)).find((a) => a && a.category !== "video" && a.category !== "audio" && a.file);
      const bg = ref ? `url("${this.host.url({ filename: ref.file, subfolder: ref.subfolder, type: ref.type || "input" })}")` : "none";
      return h("div", { class: "h3z-comp-ph" + (s ? "" : " gap"), style: { "--c": col, backgroundImage: bg } },
        h("div", { class: "in" },
          h("b", null, s ? T("Отрезок {0}{1}", src.seg + 1, s.name ? " · " + s.name : "") : src.start < this.contentFrames() ? T("Промежуток") : T("Пустота до маркера конца")),
          h("span", null, s ? (src.seg >= this.genCount() ? T("за маркером конца — не генерируется") : T("ещё не сгенерирован — здесь будет видео")) : src.start < this.contentFrames() ? T("чёрный кадр и тишина · «✂ Заполнить» на таймлайне — мост или пролог") : T("заполните её отрезком или сдвиньте маркер")),
          s?.prompt ? h("small", null, s.prompt.replace(/\s+/g, " ").slice(0, 140)) : null));
    },

    /** ~2 s before a clip boundary: a hidden muted video loads the next take, so the switch plays from the
     *  browser cache (the seam gap was the network/decoder start of the next file). */
    compPrefetch() {
      const s = this.src;
      if (!s || s.end - this.playhead > 2 * C.FPS || s.end >= this.totalFrames()) return;
      const nx = this.compSource(s.end + 0.01);
      if (!nx || nx.ph || !nx.ref) return;
      const url = this.host.url(nx.ref);
      if (url === this.$.video.dataset.src || this._pre?.dataset.src === url) return;
      const v = this._pre || (this._pre = document.createElement("video"));
      v.muted = true; v.preload = "auto"; v.playsInline = true; v.dataset.src = url; v.src = url;
      try { v.load(); v.currentTime = Math.max(0, (s.end - nx.start) / C.FPS + (nx.off || 0)); } catch (e) {}
    },

    /** Called at a clip boundary while playing the composition: show the next piece. */
    compSwitch() {
      this._compHold = false;
      this.renderPreview();
      const v = this.$.video;
      if (this.playing && this.src && !this.src.ph) v.play().catch(() => { v.muted = true; this.autoMuted = true; v.play().catch(() => {}); });
    },
  });
}

// H3ZeroStudio: CapCut-style frame thumbnails on clips, hover scrubbing, clip context menu, live sampling preview.
export function installPolish(Editor, { C, h, ICON }) {
  const CLIP_H = 110;
  Object.assign(Editor.prototype, {
    /** Tile the generated sprite over the clip: as many thumbnails as fit, each showing the frame under it. */
    clipThumbs(clip, res, it, ov, wd, fileOff = 0) {   // fileOff: footage in-point (frames into the file)
      const box = h("div", { class: "strip" });
      if (!res.strip_n) { box.style.backgroundImage = `url("${this.host.url(res.strip)}")`; clip.append(box); return; }
      const [w, hh] = C.resolution(this.p.settings), tw = Math.max(24, CLIP_H * w / hh), n = res.strip_n;
      const url = this.host.url(res.strip), frames = res.frames || it.frames;
      box.classList.add("tiles");
      const count = Math.min(200, Math.ceil(wd / tw));
      for (let k = 0; k < count; k++) {
        const f = fileOff + ov + (k * tw + tw / 2) / this.ppf;
        const idx = Math.max(0, Math.min(n - 1, Math.floor(f / frames * n)));
        box.append(h("i", { style: { left: k * tw + "px", width: tw + "px", backgroundImage: `url("${url}")`, backgroundSize: `${n * tw}px ${CLIP_H}px`, backgroundPosition: `${-idx * tw}px 0` } }));
      }
      clip.append(box);
    },

    clipHover(clip, i) {
      clip.addEventListener("pointermove", (e) => {
        if (e.buttons) return this.hideHover();
        const s = this.p.segments[i], res = s?.result, it = this.items()[i];
        if (!res?.strip_n || !it) return this.hideHover();
        const r = clip.getBoundingClientRect(), ov = i > 0 ? it.overlap : 0;
        const f = ov + (e.clientX - r.left) / this.ppf, n = res.strip_n, frames = res.frames || it.frames;
        const idx = Math.max(0, Math.min(n - 1, Math.floor(f / frames * n)));
        const [w, hh] = C.resolution(this.p.settings), W = 176, H = Math.round(W * hh / w);
        let hv = this.$.hover;
        if (!hv) { hv = this.$.hover = h("div", { class: "h3z-hover" }, h("div", { class: "im" }), h("span")); this.root.append(hv); }
        const im = hv.firstChild;
        im.style.width = W + "px"; im.style.height = H + "px";
        im.style.backgroundImage = `url("${this.host.url(res.strip)}")`;
        im.style.backgroundSize = `${n * W}px ${H}px`; im.style.backgroundPosition = `${-idx * W}px 0`;
        hv.lastChild.textContent = `${C.fmtTime((it.start + f) / C.FPS)} · отрезок ${i + 1}`;
        hv.style.left = Math.max(8, Math.min(window.innerWidth - W - 16, e.clientX - W / 2)) + "px";
        hv.style.top = r.top - H - 34 + "px";
        hv.style.display = "block";
      });
      clip.addEventListener("pointerleave", () => this.hideHover());
    },

    hideHover() { if (this.$.hover) this.$.hover.style.display = "none"; },

    clipMenu(e, i) {
      e.preventDefault(); e.stopPropagation();
      this.closeMenu();
      if (this.sel !== i) { this.sel = i; this.renderInspector(); this.renderTimeline(); this.renderPreview(); }
      const s = this.seg(i), stale = this.isStale(i), busy = !!this.run.active;
      const f = Math.round(this.frameAt(e.clientX));
      const item = (icon, label, fn, { dis = false, danger = false, hint = "" } = {}) => {
        const el = h("div", { class: "it" + (dis ? " dis" : "") + (danger ? " danger" : ""), html: (icon || "") + `<span>${String(label).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))}</span>` + (hint ? `<kbd>${hint}</kbd>` : "") });
        if (!dis) el.onclick = () => { this.closeMenu(); fn(); };
        return el;
      };
      const m = this.$.menu = h("div", { class: "h3z-menu h3z-glass" },
        h("div", { class: "hd" }, s.name || `Отрезок ${i + 1}`),
        ...(() => { const st = this.segGenState(i); return [
          item(ICON.spark, stale ? "Сгенерировать" : "Сгенерировать (уже готов)", () => this.genSegment(i), { dis: !st.ok || !stale }),
          item(ICON.dice, "Ещё дубль (новый сид)", () => this.newTake(i), { dis: !st.ok }),
          !st.ok && !busy && !s.freeze ? h("div", { class: "why" }, st.why) : null,
          s.freeze ? item(null, "🔓 Разморозить", () => this.unfreezeSeg(i)) : item(null, "🔒 Зафиксировать", () => this.freezeSeg(i), { dis: busy || stale })]; })(),
        s.takes?.length > 1 ? item(null, `Следующий дубль (${this.takeIndex(s, s.active_take) + 1}/${s.takes.length})`, () => this.cycleTake(i)) : null,
        h("div", { class: "sep" }),
        item(ICON.cut, "Разрезать здесь", () => { this.playhead = f; this.split(); }, { hint: "S" }),
        item(ICON.copy, "Дублировать", () => this.duplicate(), { hint: "D" }),
        item(null, "◆ Маркер здесь", () => this.addMarker(f), { hint: "M" }),
        h("div", { class: "sep" }),
        item(ICON.trash, "Удалить", () => this.deleteSeg(i), { danger: true, hint: "Del" }));
      this.root.append(m);
      const r = m.getBoundingClientRect();
      m.style.left = Math.min(e.clientX, window.innerWidth - r.width - 8) + "px";
      m.style.top = Math.max(8, Math.min(e.clientY, window.innerHeight - r.height - 8)) + "px";
      this._menuOff = (ev) => { if (!m.contains(ev.target)) this.closeMenu(); };
      setTimeout(() => window.addEventListener("pointerdown", this._menuOff, true), 0);
    },

    closeMenu() {
      if (this.$.menu) { this.$.menu.remove(); this.$.menu = null; }
      if (this._menuOff) { window.removeEventListener("pointerdown", this._menuOff, true); this._menuOff = null; }
    },

    /** Live per-step preview from the backend ("live" event): animated latent->RGB frames over the player. */
    onLiveFrames(d) {
      if (!this.run.active) return;
      this.lastLive = d;
      if (!this.root) return;
      const $ = this.$;
      if (this.followRun !== false && d.seg !== this.sel && this.seg(d.seg)) {
        this.sel = d.seg; this.pvMode = "segment";
        this.renderInspector(); this.renderTimeline(); this.renderPreview();
      }
      if (!$.live || !$.live.isConnected) {
        const cv = h("canvas");
        $.live = h("div", { class: "h3z-live" }, cv,
          h("div", { class: "h3z-badge-live rec" }, h("i"), h("span")),
          h("div", { class: "h3z-live-pg" }, h("i")));
        $.frame.append($.live);
        this.livePlayer = new SpritePlayer(cv);
      }
      d.audio = null;   // live preview is silent
      this.livePlayer.setVolume(this.vol?.v ?? 1, !!this.vol?.muted || !this.userGesture);
      this.livePlayer.set(d);
      $.live.querySelector(".h3z-badge-live span").textContent = `Генерация · отрезок ${d.seg + 1}${this.run?.phase === "draft" ? " · черновик" : this.run?.phase === "refine" ? " · доработка ↑" : this.run?.phase === "upscale" ? " · апскейл ↑ (смешанный кадр)" : ""} · шаг ${d.step}/${d.steps} · ` + (d.mode === "taeh3" ? "tiny VAE taeh3" : "превью латента");
      $.live.querySelector(".h3z-live-pg i").style.width = (d.step / d.steps * 100).toFixed(1) + "%";
    },

    hideLive() {
      this.livePlayer?.stop(); this.livePlayer = null;
      if (this.$.live) { this.$.live.remove(); this.$.live = null; }
      this.$.tileOv?.remove(); this.$.tileOv = null;
    },
  });
}

/** Plays a horizontal JPEG sprite of N frames (each shown dur[k]/24 s) on a canvas, looping. */
export class SpritePlayer {
  /** Plays a live-preview sprite (grid of tiles, `cols` per row) on a canvas on a wall clock, so a new
   *  sprite continues at the same moment; an optional audio URL (decoded audio of the step) plays in sync. */
  constructor(canvas) { this.cv = canvas; this.img = new Image(); this.d = null; this.k = 0; this.t0 = 0; this._raf = 0; this.audio = null; this.url = null; this.volume = 1; this.muted = false; }
  set(d) {
    const img = new Image();
    img.onload = () => {
      const fresh = !this.d;
      this.img = img; this.d = d;
      this.starts = []; let acc = 0; for (let j = 0; j < d.n; j++) { this.starts.push(acc); acc += (d.dur?.[j] || 4); }
      this.total = Math.max(1, acc) / 24 * 1000;
      if (fresh) { this.t0 = performance.now(); this.loop(); }
    };
    img.src = d.img;
  }
  setVolume(v, muted) { this.volume = v; this.muted = muted; if (this.audio) this.audio.volume = muted ? 0 : v; }
  clock() { return ((performance.now() - this.t0) % (this.total || 1000) + (this.total || 1000)) % (this.total || 1000); }
  frameAt(ms) { const f = ms / 1000 * 24, st = this.starts || [0]; let k = 0; while (k + 1 < st.length && st[k + 1] <= f) k++; return k; }
  loop() {
    cancelAnimationFrame(this._raf);
    const tick = () => {
      const d = this.d; if (!d || !this.cv.isConnected) { this.audio?.pause(); return; }
      const cv = this.cv, W = cv.clientWidth || d.tw, H = cv.clientHeight || d.th, dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const t = this.clock();
      if (this.audio && !this.audio.paused && Math.abs(this.audio.currentTime * 1000 - t) > 250 && this.audio.duration) { try { this.audio.currentTime = t / 1000; } catch (e) {} }
      this.k = Math.min(d.n - 1, this.frameAt(t));
      const cols = d.cols || d.n, sx = (this.k % cols) * d.tw, sy = Math.floor(this.k / cols) * d.th;
      const g = cv.getContext("2d");
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
      const sc = Math.min(cv.width / d.tw, cv.height / d.th), w = d.tw * sc, hh = d.th * sc;
      g.fillStyle = "#000"; g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(this.img, sx, sy, d.tw, d.th, (cv.width - w) / 2, (cv.height - hh) / 2, w, hh);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }
  stop() { cancelAnimationFrame(this._raf); this.d = null; this.audio?.pause(); this.audio = null; this.audioSrc = null; }
}

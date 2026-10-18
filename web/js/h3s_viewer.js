// «Удобный просмотр»: a full-window viewer for the live «Весь ролик» composition or one file (a clip's take,
// footage, a gallery item, the final). Zoom fit / ×1 (one video pixel = one screen pixel) / ×2 / ×4, wheel zoom
// at the cursor, drag to pan (the A/B compare zoom, generalised to free scales), scrub bar with timecode and
// frame number, frame stepping, speed, loop range, volume, sharp pixels, browser fullscreen. Never autoplays.
// Composition: the editor's own player frame is moved into the viewer and driven through the editor's
// playhead (stepping follows the timeline); it goes back on close, the rest of the editor state is untouched.
// Also: ⛶ / F = browser fullscreen of the main player.
export function installViewer(Editor, { C, h, ICON }) {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const SPEEDS = [0.25, 0.5, 1, 2];
  const ZOOMS = [["fit", "Вписать"], [1, "×1"], [2, "×2"], [4, "×4"]];
  const MAXS = 16;
  const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const IC = {
    fs: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    view: svg('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.2-4.2M11 8v6M8 11h6"/>'),
    stepB: svg('<path d="M18 6l-8 6 8 6V6z"/><path d="M6 6v12"/>'),
    stepF: svg('<path d="M6 6l8 6-8 6V6z"/><path d="M18 6v12"/>'),
  };
  const FPS = C.FPS;
  /** m:ss:ff timecode */
  const tc = (f) => { f = Math.max(0, Math.round(f)); const s = Math.floor(f / FPS); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}:${String(f % FPS).padStart(2, "0")}`; };
  Editor.VIEWER_ICONS = IC;

  Object.assign(Editor.prototype, {
    /** ⛶ / F: the main player area in browser fullscreen (again / Esc — back). */
    toggleMainFullscreen() {
      const el = this.$?.center; if (!el) return;
      if (document.fullscreenElement) { document.exitFullscreen?.().catch(() => {}); return; }
      const p = el.requestFullscreen?.();
      if (!p) return this.toast("Браузер не поддерживает полноэкранный режим", true);
      p.catch((e) => this.toast("Полноэкранный режим недоступен: " + (e.message || e), true));
    },

    /** «Удобный просмотр» of what the main player shows. */
    viewerFromPlayer() {
      const s = this.src;
      if (!s && !this.totalFrames()) return this.toast("Нечего показывать: сначала сгенерируйте отрезок или добавьте футаж", true);
      if (!s || s.kind === "comp") return this.openViewer({ comp: true });
      if (s.kind === "full") return this.openViewer({ ref: s.ref, title: s.old ? "Прошлый итог (устарел)" : "Весь ролик · итоговый файл", t: this.playhead / FPS });
      return this.openViewer({ ref: s.ref, title: `Отрезок ${this.sel + 1}` + (s.foot ? " · футаж" : ""), t: Math.max(0, (this.playhead - s.start) / FPS + (s.off || 0)) });
    },
    /** What a clip can show in the viewer: its active take, else its footage file. */
    viewerClipSpec(i) {
      const s = this.seg(i); if (!s) return null;
      const nm = `Отрезок ${i + 1}` + (s.name ? ` «${s.name}»` : "");
      const foot = C.isFootage(s) || s.freeze ? this.footageSource?.(i) : null;
      if (s.result?.video && !(foot && C.isFootage(s) && this.isStale(i))) {
        const n = (s.takes || []).length, k = this.takeIndex ? this.takeIndex(s, s.active_take) + 1 : 0;
        return { ref: s.result.video, title: nm + (n > 1 && k > 0 ? ` · дубль ${k}/${n}` : "") };
      }
      if (foot) return { ref: foot.ref, title: nm + " · футаж", t: foot.off || 0 };
      return null;
    },
    viewerForClip(i) { const sp = this.viewerClipSpec(i); if (sp) this.openViewer(sp); else this.toast("У отрезка ещё нет видео", true); },

    /** spec: {comp: true} | {ref, title, t (s)} */
    openViewer(spec) {
      this.closeViewer();
      this.galClose?.();
      this.closeMenu?.();
      this.stopPlayback();                                   // never autoplay: the viewer opens paused
      const V = this.viewer = { spec, comp: !!spec.comp, z: "fit", s: 1, tx: 0, ty: 0, px: !!this._vwPx, loop: { on: false, a: 0, b: -1 }, rate: 1, want: false };
      const vp = h("div", { class: "vvp" }), cont = h("div", { class: "vct" });
      vp.append(cont);
      let d;
      if (V.comp) {
        const fr = this.$.frame;
        V.home = { parent: fr.parentElement, next: fr.nextSibling, css: fr.style.cssText };
        cont.append(fr); fr.style.width = "100%"; fr.style.height = "100%";
        const n = () => Math.max(1, this.totalFrames());
        d = {
          nat: () => C.resolution(this.p.settings), n,
          f: () => clamp(Math.floor(this.playhead + 1e-3), 0, n() - 1),
          seek: (f) => this.seek(clamp(Math.round(f), 0, n() - 1), false),
          playing: () => !!this.playing,
          play: () => { if (this.playhead >= n() - 1) this.seek(0, false); this.startPlayback(); },
          pause: () => this.stopPlayback(),
          rate: (r) => { this.playRate = r; const v = this.$.video; if (v) { v.defaultPlaybackRate = r; v.playbackRate = r; } },
          vol: () => this.applyVolume(),
          info: () => { const s = this.src; return "Весь ролик · сборка таймлайна" + (s && s.seg >= 0 ? ` · отрезок ${s.seg + 1}` + (s.region ? " · ✂ участок" : s.foot ? " · футаж" : s.ph ? " · заглушка (не сгенерирован)" : "") : ""); },
        };
      } else {
        const v = V.video = h("video", { src: this.host.url(spec.ref), preload: "auto", playsinline: true, draggable: "false" });
        cont.append(v);
        v.addEventListener("loadedmetadata", () => { if (spec.t) { try { v.currentTime = Math.min(spec.t, Math.max(0, v.duration - 0.5 / FPS)); } catch (e) {} } this.vwApply(); });
        const vfc = () => { if (this.viewer !== V) return; this.vwLoopGuard(); v.requestVideoFrameCallback(vfc); };
        if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(vfc);
        v.addEventListener("ended", () => { if (V.loop.on && V.want) { d.seek(V.loop.a); v.play().catch(() => {}); } else V.want = false; });
        const n = () => Math.max(1, Math.round((isFinite(v.duration) ? v.duration : 0) * FPS));
        d = {
          nat: () => [v.videoWidth || C.resolution(this.p.settings)[0], v.videoHeight || C.resolution(this.p.settings)[1]], n,
          f: () => clamp(Math.floor(v.currentTime * FPS + 1e-3), 0, n() - 1),
          seek: (f) => { try { v.currentTime = (clamp(Math.round(f), 0, n() - 1) + 0.5) / FPS; } catch (e) {} },
          playing: () => !v.paused && !v.ended,
          play: () => { if (d.f() >= n() - 1) d.seek(0); v.playbackRate = V.rate; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); },
          pause: () => v.pause(),
          rate: (r) => { v.defaultPlaybackRate = r; v.playbackRate = r; },
          vol: () => { v.volume = clamp(this.vol.v, 0, 1); v.muted = !!this.vol.muted; },
          info: () => spec.title || "Видео",
        };
        d.vol();
      }
      V.d = d;
      // ---- controls
      const B = (html, title, fn, cls = "") => h("button", { class: "h3z-btn sm " + cls, html, title, onclick: (e) => { e.stopPropagation(); fn(); } });
      const playB = h("button", { class: "h3z-play", html: ICON.play, title: "Воспроизвести / пауза (Пробел)", onclick: () => this.vwToggle() });
      const scrub = h("input", { class: "h3z-range scrub", type: "range", min: 0, max: 1, step: 1, value: 0, title: "Перемотка по кадрам" });
      scrub.addEventListener("input", () => d.seek(Number(scrub.value)));
      const band = h("div", { class: "loopband" });
      const time = h("div", { class: "vtime" });
      const speeds = h("div", { class: "h3z-pills vspeed", title: "Скорость воспроизведения" }, SPEEDS.map((r) => h("div", { class: "h3z-pill" + (r === 1 ? " on" : ""), "data-r": r, onclick: () => this.vwRate(r) }, r === 1 ? "1×" : r + "×")));
      const zoomB = ZOOMS.map(([z, l]) => h("button", { class: "h3z-btn sm", "data-z": z, title: z === "fit" ? "Вписать кадр в окно (0)" : z === 1 ? "1:1 — один пиксель видео = один пиксель экрана (1)" : `Увеличить в ${z} раза (${z})`, onclick: () => this.vwZoom(z) }, l));
      const zl = h("span", { class: "h3z-note zl" }, "");
      const pxB = B("▦", "Чёткие пиксели без сглаживания (P)", () => this.vwPx(), "px");
      const loopB = B("⟲ Петля", "Повторять участок между входом и выходом (L)", () => this.vwLoop());
      const inB = B("[ Вход", "Начало петли на текущем кадре (I)", () => this.vwMark("a"));
      const outB = B("Выход ]", "Конец петли на текущем кадре (O)", () => this.vwMark("b"));
      const volB = h("button", { class: "h3z-btn icon sm", title: "Звук вкл/выкл (M)", onclick: () => this.vwMute() });
      const volR = h("input", { class: "h3z-range vol", type: "range", min: 0, max: 1, step: 0.02, value: this.vol.muted ? 0 : this.vol.v, title: "Громкость" });
      volR.addEventListener("input", () => { this.vol.v = Number(volR.value); this.vol.muted = this.vol.v === 0; this.userGesture = true; this.autoMuted = false; this.vwSaveVol(); });
      const title = h("b", { class: "vtitle" }, d.info()), sub = h("span", { class: "h3z-note vsub" }, "");
      const el = h("div", { class: "h3z-viewer", tabindex: "-1" },
        h("div", { class: "vhd" }, h("span", { class: "vtag" }, "Удобный просмотр"), title, sub, h("i", { class: "grow" }),
          h("div", { class: "vzoom" }, zoomB, zl, pxB),
          B(IC.fs, "Во весь экран (F)", () => this.vwFullscreen(), "icon"), B("✕", "Закрыть (Esc)", () => this.closeViewer(), "icon")),
        vp,
        h("div", { class: "vbar" }, h("div", { class: "scrubw" }, band, scrub)),
        h("div", { class: "vctr" },
          B(IC.stepB, "Кадр назад (← или ,) · с Shift — на 1 с", () => this.vwStep(-1), "icon"), playB, B(IC.stepF, "Кадр вперёд (→ или .) · с Shift — на 1 с", () => this.vwStep(1), "icon"),
          time, h("i", { class: "grow" }), speeds, h("span", { class: "sep" }), inB, outB, loopB, h("span", { class: "sep" }), h("div", { class: "h3z-volume" }, volB, volR)),
        h("div", { class: "vkeys h3z-note" }, "Пробел — пуск/пауза · ← → или , . — кадр (Shift — 1 с) · колесо — масштаб у курсора · тянуть — двигать · 0/1/2/4 — масштаб · I / O / L — петля · F — во весь экран · Esc — закрыть"));
      Object.assign(V, { el, vp, cont, playB, scrub, band, time, speeds, zoomB, zl, pxB, loopB, inB, outB, volB, volR, title, sub });
      // ---- zoom / pan (same model as the A/B compare: one transform, clamped so the frame never leaves the window)
      vp.addEventListener("wheel", (ev) => {
        ev.preventDefault();
        const r = vp.getBoundingClientRect();
        this.vwScaleAt(V.s * Math.exp(-ev.deltaY * 0.0015), ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2));
      }, { passive: false });
      vp.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault(); el.focus();
        const x0 = ev.clientX, y0 = ev.clientY, t0 = [V.tx, V.ty];
        vp.setPointerCapture?.(ev.pointerId); vp.classList.add("drag");
        const mv = (m) => { V.tx = t0[0] + m.clientX - x0; V.ty = t0[1] + m.clientY - y0; this.vwApply(); };
        const up = () => { vp.classList.remove("drag"); vp.removeEventListener("pointermove", mv); vp.removeEventListener("pointerup", up); vp.removeEventListener("pointercancel", up); };
        vp.addEventListener("pointermove", mv); vp.addEventListener("pointerup", up); vp.addEventListener("pointercancel", up);
      });
      vp.addEventListener("dblclick", (ev) => { const r = vp.getBoundingClientRect(); if (V.z === "fit") this.vwScaleAt(this.vwFit() * 2, ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2)); else this.vwZoom("fit"); });
      try { V.ro = new ResizeObserver(() => this.vwApply()); V.ro.observe(vp); } catch (e) {}
      (this.root || document.body).append(el);
      el.focus();
      this.vwApply(); this.vwVolUI();
      const loop = () => { if (this.viewer !== V) return; this.vwTick(); V.raf = requestAnimationFrame(loop); };
      V.raf = requestAnimationFrame(loop);
    },

    closeViewer() {
      const V = this.viewer; if (!V) return;
      cancelAnimationFrame(V.raf); V.ro?.disconnect();
      try { V.d.pause(); } catch (e) {}
      if (document.fullscreenElement === V.el) document.exitFullscreen?.().catch(() => {});
      this.viewer = null;
      if (V.comp) {
        V.d.rate(1); this.playRate = 1;
        const fr = this.$.frame; fr.style.cssText = V.home.css;
        if (V.home.parent?.isConnected) V.home.parent.insertBefore(fr, V.home.next && V.home.next.parentElement === V.home.parent ? V.home.next : null);
        else this.$.stage?.prepend(fr);
        this.layoutStage(); this.renderPreview(); this.updatePlayhead?.();
      } else if (V.video) { V.video.removeAttribute("src"); V.video.load?.(); }
      V.el.remove();
      this.focusSink?.();
    },

    vwFit() { const V = this.viewer; const [w, hh] = V.d.nat(); const r = V.vp.getBoundingClientRect(); return Math.min((r.width || 1) / (w || 1), (r.height || 1) / (hh || 1)); },
    /** New scale keeping the point (cx, cy) — offsets from the window centre — in place. */
    vwScaleAt(s, cx = 0, cy = 0) {
      const V = this.viewer; if (!V) return;
      const fit = this.vwFit(); s = clamp(s, fit, Math.max(MAXS, fit));
      if (s <= fit * 1.0001) { V.z = "fit"; V.tx = V.ty = 0; this.vwApply(); return; }
      V.tx = cx - (cx - V.tx) * s / V.s; V.ty = cy - (cy - V.ty) * s / V.s;
      V.s = s; V.z = ZOOMS.some(([z]) => z === s) ? s : "free"; this.vwApply();
    },
    vwZoom(z) {
      const V = this.viewer; if (!V) return;
      if (z === "fit") { V.z = "fit"; V.tx = V.ty = 0; this.vwApply(); return; }
      const ns = Number(z), k = ns / V.s; V.tx *= k; V.ty *= k; V.s = ns; V.z = ns; this.vwApply();
    },
    vwApply() {
      const V = this.viewer; if (!V) return;
      const [w, hh] = V.d.nat(), r = V.vp.getBoundingClientRect();
      if (V.z === "fit") V.s = this.vwFit(); else if (V.z !== "free") V.s = Number(V.z);
      const mx = Math.max(0, (w * V.s - r.width) / 2), my = Math.max(0, (hh * V.s - r.height) / 2);
      V.tx = clamp(V.tx, -mx, mx); V.ty = clamp(V.ty, -my, my);
      Object.assign(V.cont.style, { width: w + "px", height: hh + "px", transform: `translate(-50%, -50%) translate(${V.tx.toFixed(1)}px, ${V.ty.toFixed(1)}px) scale(${+V.s.toFixed(4)})` });
      V.vp.classList.toggle("zoomed", mx > 0 || my > 0);
      V.cont.classList.toggle("px", V.px);
      V.zoomB.forEach((b) => b.classList.toggle("on", String(b.dataset.z) === String(V.z)));
      V.pxB.classList.toggle("on", V.px);
      V.zl.textContent = Math.round(V.s * 100) + "%";
      V.sub.textContent = `${w}×${hh} · ${FPS} к/с`;
    },
    vwToggle() { const V = this.viewer; if (!V) return; if (V.d.playing()) { V.want = false; V.d.pause(); } else { V.want = true; this.userGesture = true; this.autoMuted = false; V.d.rate(V.rate); V.d.play(); } },
    vwStep(k) { const V = this.viewer; if (!V) return; V.want = false; V.d.pause(); V.d.seek(V.d.f() + k); },
    vwRate(r) { const V = this.viewer; if (!V) return; V.rate = r; V.d.rate(r); V.speeds.querySelectorAll(".h3z-pill").forEach((p) => p.classList.toggle("on", Number(p.dataset.r) === r)); },
    vwPx() { const V = this.viewer; if (!V) return; V.px = this._vwPx = !V.px; this.vwApply(); },
    vwMark(which) {
      const V = this.viewer; if (!V) return; const f = V.d.f(), n = V.d.n(), L = V.loop;
      if (L.b < 0) L.b = n - 1;
      if (which === "a") { L.a = f; if (L.b <= L.a) L.b = n - 1; } else { L.b = f; if (L.b <= L.a) L.a = 0; }
      L.on = true;
    },
    vwLoop() { const V = this.viewer; if (!V) return; const L = V.loop; if (L.b < 0) L.b = V.d.n() - 1; L.on = !L.on; },
    vwMute() { this.vol.muted = !this.vol.muted; if (!this.vol.muted && !this.vol.v) this.vol.v = 1; this.userGesture = true; this.autoMuted = false; this.vwSaveVol(); },
    vwSaveVol() { try { localStorage.setItem("h3zs.volume", JSON.stringify(this.vol)); } catch (e) {} this.viewer?.d.vol(); this.applyVolume(); this.vwVolUI(); },
    vwVolUI() {
      const V = this.viewer; if (!V) return; const v = this.vol.muted ? 0 : this.vol.v;
      V.volB.innerHTML = this.vol.muted || !v ? ICON.mute : ICON.vol; V.volR.value = v; V.volR.style.setProperty("--p", v * 100 + "%");
    },
    vwFullscreen() {
      const V = this.viewer; if (!V) return;
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      else V.el.requestFullscreen?.().catch((e) => this.toast("Полноэкранный режим недоступен: " + (e.message || e), true));
    },
    /** Loop range: back to the in-point as soon as the out-point is reached (true = it jumped). Runs in the editor's
     *  playback tick (composition) and per presented video frame (file), so it does not overshoot by a repaint. */
    vwLoopGuard() {
      const V = this.viewer; if (!V || !V.loop.on || !V.want) return false;
      const n = V.d.n(), a = clamp(V.loop.a, 0, n - 1), b = clamp(V.loop.b < 0 ? n - 1 : V.loop.b, a, n - 1);
      const f = V.d.f();
      if (f < b && f >= a) return false;
      V.d.seek(a); return true;
    },
    /** Every animation frame: loop range, scrub bar, timecode, play button. */
    vwTick() {
      const V = this.viewer, d = V.d, n = d.n(), L = V.loop;
      let f = d.f();
      if (L.on) {
        const a = clamp(L.a, 0, n - 1), b = clamp(L.b < 0 ? n - 1 : L.b, a, n - 1);
        if (V.want && (f >= b || f < a)) { d.seek(a); f = a; if (!d.playing()) d.play(); }
        else if (V.want && !d.playing() && f >= b - 1) { d.seek(a); d.play(); f = a; }
      } else if (V.want && !d.playing() && f >= n - 1) V.want = false;
      if (V.comp && V.want && !this.playing && !L.on) V.want = false;
      if (Number(V.scrub.max) !== n - 1) V.scrub.max = Math.max(1, n - 1);
      if (document.activeElement !== V.scrub || d.playing()) V.scrub.value = f;
      V.scrub.style.setProperty("--p", (f / Math.max(1, n - 1) * 100) + "%");
      const a = clamp(L.a, 0, n - 1), b = clamp(L.b < 0 ? n - 1 : L.b, 0, n - 1);
      V.band.style.left = (a / Math.max(1, n - 1) * 100) + "%"; V.band.style.width = ((b - a) / Math.max(1, n - 1) * 100) + "%";
      V.band.classList.toggle("on", L.on);
      V.loopB.classList.toggle("on", L.on);
      const tt = `<b>${tc(f)}</b> / ${tc(n - 1)} · кадр <b>${f}</b> / ${n - 1}` + (L.on ? ` · петля ${a}–${b}` : "") + (V.rate !== 1 ? ` · ${V.rate}×` : "");
      if (V._tt !== tt) { V.time.innerHTML = tt; V._tt = tt; }
      const pl = d.playing(); if (V._pl !== pl) { V.playB.innerHTML = pl ? ICON.pause : ICON.play; V._pl = pl; }
      const info = d.info(); if (V._info !== info) { V.title.textContent = info; V._info = info; }
    },
    /** Keys while the viewer is open (called from the editor's key handler). */
    viewerKey(e) {
      const V = this.viewer; if (!V) return;
      const k = e.code, sh = e.shiftKey;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const st = sh ? FPS : 1;
      const map = {
        Escape: () => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); else this.closeViewer(); },
        Space: () => this.vwToggle(), KeyK: () => this.vwToggle(),
        ArrowLeft: () => this.vwStep(-st), Comma: () => this.vwStep(-st), ArrowRight: () => this.vwStep(st), Period: () => this.vwStep(st),
        Home: () => { V.want = false; V.d.pause(); V.d.seek(0); }, End: () => { V.want = false; V.d.pause(); V.d.seek(V.d.n() - 1); },
        KeyF: () => this.vwFullscreen(), KeyM: () => this.vwMute(), KeyP: () => this.vwPx(),
        KeyI: () => this.vwMark("a"), KeyO: () => this.vwMark("b"), KeyL: () => this.vwLoop(),
        Digit0: () => this.vwZoom("fit"), Digit1: () => this.vwZoom(1), Digit2: () => this.vwZoom(2), Digit4: () => this.vwZoom(4),
        Numpad0: () => this.vwZoom("fit"), Numpad1: () => this.vwZoom(1), Numpad2: () => this.vwZoom(2), Numpad4: () => this.vwZoom(4),
      };
      if (map[k]) { e.preventDefault(); map[k](); }
    },
  });
}

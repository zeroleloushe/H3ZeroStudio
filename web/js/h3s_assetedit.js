// Unified asset editor (non-destructive): image — crop (free / aspect presets), rotate, mirror, downscale;
// audio — trim on the waveform, gain / normalize, fades; video — trim, downscale, crop, rotate, mirror,
// «Use frame» (-> image asset), «Use audio» (-> audio asset). Apply writes a derivative next to the original
// (input/h3zerostudio/derived) and points the asset at it; the original is kept (asset.orig) and reopened for
// further edits, «Reset» returns to it. Downscaled references make H3 generation faster.
import { drawPeaks } from "./h3s_audio.js";

const SIZES = [0, 2048, 1920, 1600, 1280, 1024, 832, 768, 640, 512];
const ASPECTS = [["free", "свободно"], ["16:9", "16:9"], ["9:16", "9:16"], ["1:1", "1:1"], ["4:3", "4:3"], ["3:4", "3:4"], ["21:9", "21:9"], ["project", "как проект"]];
const STEP = 1 / 24;

/** Same as h3s_assets.out_size. */
export function outSize(w, h, ops) {
  if (ops.rotate === 90 || ops.rotate === 270) [w, h] = [h, w];
  const c = ops.crop;
  if (c) { w = Math.max(2, Math.round(w * c[2])); h = Math.max(2, Math.round(h * c[3])); }
  const m = ops.max_side || 0;
  if (m && Math.max(w, h) > m) { const k = m / Math.max(w, h); w = Math.max(2, Math.round(w * k)); h = Math.max(2, Math.round(h * k)); }
  return [w - (w % 2), h - (h % 2)];
}

export function installAssetEditor(Editor, { C, h, ICON }) {
  Object.assign(Editor.prototype, {
    assetKind(a) { return a.category === "video" ? "video" : a.category === "audio" ? "audio" : "image"; },

    openAssetEditor(id) {
      const a = this.p.assets.find((x) => x.id === id);
      if (!a) return id === C.AUDIO_INPUT_ID ? this.toast("Вход audio ноды редактируется в графе ComfyUI", true) : null;
      this.closeAssetEditor();
      const kind = this.assetKind(a), orig = a.orig || { filename: a.file, subfolder: a.subfolder, type: a.type || "input" };
      const url = this.host.url(orig);
      const st = this.ae = { id, kind, orig, ops: JSON.parse(JSON.stringify(a.edit || {})), t: 0, dur: 0, sw: 0, sh: 0, crop: false, aspect: "free", playing: false, muted: false };
      const $ = {};
      const close = () => this.closeAssetEditor();
      // ---- media element
      if (kind === "video") { $.media = h("video", { src: url, preload: "auto", playsinline: true }); }
      else if (kind === "audio") { $.media = h("audio", { src: url, preload: "auto" }); }
      else { $.media = h("img", { src: url }); }
      const media = $.media;
      // ---- header
      const btn = (html, title, fn, cls = "") => { const b = h("button", { class: "h3z-btn sm " + cls, html, title }); b.onclick = (e) => { e.stopPropagation(); fn(b); }; return b; };
      $.size = h("select", { class: "h3z-sel sm", title: "Уменьшить: длинная сторона не больше … px (меньше референс — быстрее генерация H3)" }, SIZES.map((s) => h("option", { value: s }, s ? `max ${s}px` : "размер: полный")));
      $.size.value = String(st.ops.max_side || 0);
      $.size.onchange = () => { st.ops.max_side = Number($.size.value) || 0; if (!st.ops.max_side) delete st.ops.max_side; this.aeUpdate(); };
      $.aspect = h("select", { class: "h3z-sel sm", title: "Пропорции рамки обрезки" }, ASPECTS.map(([k, l]) => h("option", { value: k }, l)));
      $.aspect.onchange = () => { st.aspect = $.aspect.value; if (st.ops.crop) { st.ops.crop = this.aeFitAspect(st.ops.crop); } this.aeUpdate(); };
      $.dims = h("span", { class: "dims" });
      const pic = kind !== "audio";
      $.rot = btn("↻", "Повернуть на 90° (R)", () => { st.ops.rotate = ((st.ops.rotate || 0) + 90) % 360; if (!st.ops.rotate) delete st.ops.rotate; delete st.ops.crop; this.aeUpdate(); });
      $.mir = btn("⇄ Зеркало", "Отразить по горизонтали", () => { st.ops.mirror = !st.ops.mirror; if (!st.ops.mirror) delete st.ops.mirror; this.aeUpdate(); });
      $.cropB = btn("⌗ Обрезка", "Рамка обрезки: тяните углы и саму рамку (двойной клик — сбросить)", () => { st.crop = !st.crop; if (st.crop && !st.ops.crop) st.ops.crop = this.aeFitAspect([0.1, 0.1, 0.8, 0.8]); this.aeUpdate(); });
      const head = h("div", { class: "hd" }, h("b", { html: (ICON.cut || "✂") + `<span>${a.name}</span>` }), h("i", { class: "grow" }),
        pic ? $.rot : null, pic ? $.mir : null, pic ? $.cropB : null, pic ? $.aspect : null, pic ? $.size : null, pic ? $.dims : null,
        btn("✕", "Закрыть (Esc)", close, "icon"));
      // ---- stage
      $.cv = h("canvas", { class: "cv" });
      $.stage = h("div", { class: "stage" + (kind === "audio" ? " audio" : "") }, $.cv, kind !== "image" ? media : null);
      if (kind !== "image") media.style.display = "none";
      // ---- range timeline (video / audio)
      const timed = kind !== "image";
      $.bar = h("div", { class: "bar" }, h("div", { class: "rng" }), h("div", { class: "hl l" }), h("div", { class: "hl r" }), h("div", { class: "ph" }));
      $.ticks = h("div", { class: "ticks" });
      $.phT = h("span", { class: "pht" });
      // ---- controls
      const num = (v, title, fn) => { const n = h("input", { class: "h3z-in sm", type: "number", step: "0.01", min: 0, value: v, title }); n.onchange = () => fn(Number(n.value)); return n; };
      $.sIn = num(0, "Начало, с", (v) => { st.ops.start = Math.max(0, Math.min(v, this.aeEnd() - 0.1)); this.aeUpdate(); });
      $.eIn = num(0, "Конец, с", (v) => { st.ops.end = Math.min(st.dur, Math.max(v, (st.ops.start || 0) + 0.1)); this.aeUpdate(); });
      $.kept = h("span", { class: "kept" });
      $.play = btn("▶", "Играть / пауза (Пробел)", () => this.aeTogglePlay());
      $.mute = btn("🔊", "Звук (M)", () => this.aeMute());
      const rowT = timed ? h("div", { class: "row" },
        btn("◀|", "Кадр назад (←, Shift — 10)", () => this.aeStep(-1)), $.play, $.mute, btn("|▶", "Кадр вперёд (→, Shift — 10)", () => this.aeStep(1)),
        h("i", { class: "sp" }),
        btn("⇤ начало", "Начало здесь ([)", () => this.aeMark("start")), $.sIn, h("span", null, "–"), $.eIn, btn("конец ⇥", "Конец здесь (])", () => this.aeMark("end")), $.kept,
        h("i", { class: "grow" }), btn("⏮ Первый", "К началу диапазона (Home)", () => this.aeSeek(st.ops.start || 0)), btn("Последний ⏭", "К концу диапазона (End)", () => this.aeSeek(this.aeEnd() - STEP))) : null;
      // audio processing (audio and the sound of a video)
      const aud = kind !== "image";
      const gain = num(st.ops.gain_db || 0, "Усиление, дБ (−24…+24)", (v) => { st.ops.gain_db = Math.max(-24, Math.min(24, v)) || 0; if (!st.ops.gain_db) delete st.ops.gain_db; this.aeUpdate(); });
      gain.step = "0.5"; gain.min = -24; gain.max = 24;
      const fi = num(st.ops.fade_in || 0, "Фейд в начале, с", (v) => { st.ops.fade_in = Math.max(0, v) || 0; if (!st.ops.fade_in) delete st.ops.fade_in; this.aeUpdate(); });
      const fo = num(st.ops.fade_out || 0, "Фейд в конце, с", (v) => { st.ops.fade_out = Math.max(0, v) || 0; if (!st.ops.fade_out) delete st.ops.fade_out; this.aeUpdate(); });
      $.norm = btn("Нормализовать", "Пик громкости до −1 дБ", (b) => { st.ops.normalize = !st.ops.normalize; if (!st.ops.normalize) delete st.ops.normalize; this.aeUpdate(); });
      const rowB = h("div", { class: "row" },
        timed ? btn("посл. 2 с", "Оставить последние 2 секунды", () => this.aeLast(2)) : null,
        timed ? btn("посл. 3 с", "Оставить последние 3 секунды", () => this.aeLast(3)) : null,
        kind === "video" ? btn("🖼 Взять кадр", "Кадр под плейхедом -> новый ассет-картинка (C)", () => this.aeUseFrame()) : null,
        kind === "video" ? btn("♪ Взять звук", "Звук выбранного диапазона -> новый аудио-ассет (A)", () => this.aeUseAudio()) : null,
        aud ? h("span", { class: "lb" }, "дБ") : null, aud ? gain : null, aud ? $.norm : null,
        aud ? h("span", { class: "lb" }, "фейд") : null, aud ? fi : null, aud ? fo : null,
        h("i", { class: "grow" }),
        btn("↺ Сброс", "Вернуть оригинал (без правок)", () => { st.ops = {}; st.crop = false; $.size.value = "0"; gain.value = 0; fi.value = 0; fo.value = 0; this.aeUpdate(); }),
        btn("Применить", "Создать обработанную копию и использовать её (Enter)", () => this.aeApply(), "primary"),
        btn("Отмена", "Закрыть без изменений (Esc)", close));
      const hint = h("div", { class: "hint" }, timed
        ? "← → кадр (Shift — 10) · Пробел — играть · [ ] — начало/конец здесь · Home/End — к краям · M — звук" + (kind === "video" ? " · A — взять звук · C — взять кадр · R — повернуть" : "")
        : "Тяните рамку обрезки и её углы · R — повернуть · Enter — применить · Esc — отмена");
      const box = h("div", { class: "h3z-ae h3z-glass" }, head, $.stage, timed ? $.ticks : null, timed ? $.bar : null, timed ? h("div", { class: "phl" }, "ПЛЕЙХЕД ", $.phT) : null, rowT, rowB, hint);
      const modal = h("div", { class: "h3z-modal" }, box);
      modal.addEventListener("pointerdown", (e) => { if (e.target === modal) close(); });
      st.$ = $; st.modal = modal; st.gainIn = gain;
      this.root.append(modal);
      // ---- events
      const loaded = () => {
        st.sw = media.videoWidth || media.naturalWidth || 0; st.sh = media.videoHeight || media.naturalHeight || 0;
        st.dur = media.duration && isFinite(media.duration) ? media.duration : (a.duration || 0);
        if (timed && st.ops.end === undefined) st.endDefault = true;
        this.aeUpdate();
      };
      if (kind === "image") { if (media.complete && media.naturalWidth) loaded(); else media.onload = loaded; }
      else media.addEventListener("loadedmetadata", loaded);
      if (kind !== "image") {
        media.addEventListener("timeupdate", () => this.aeTick());
        media.addEventListener("seeked", () => this.aeDraw());
        media.addEventListener("loadeddata", () => this.aeDraw());
      }
      if (kind === "audio") {
        const pk = this.peaksFor(orig); st.peaks = pk;
        if (!pk) setTimeout(() => { if (this.ae === st) { st.peaks = this.peaksFor(orig); this.aeDraw(); } }, 800);
      }
      this.aeBindStage(); this.aeBindBar();
      st.onKey = (e) => this.aeKey(e);
      window.addEventListener("keydown", st.onKey, true);
      st.ro = new ResizeObserver(() => this.aeDraw()); st.ro.observe($.stage);
    },

    closeAssetEditor() {
      const st = this.ae; if (!st) return;
      try { st.$.media.pause?.(); } catch (e) {}
      cancelAnimationFrame(st.raf);
      window.removeEventListener("keydown", st.onKey, true);
      st.ro?.disconnect();
      st.modal.remove(); this.ae = null;
      this.focusSink?.();
    },

    aeEnd() { const st = this.ae; return st.ops.end ?? st.dur; },

    aeFitAspect(c) {
      const st = this.ae, asp = st.aspect;
      if (asp === "free") return c;
      let r;
      if (asp === "project") { const [w, hh] = C.resolution(this.p.settings); r = w / hh; } else { const [x, y] = asp.split(":").map(Number); r = x / y; }
      const [dw, dh] = this.aeDisp(), cur = (c[2] * dw) / (c[3] * dh);
      let [x, y, w, hh] = c;
      if (cur > r) w = hh * dh * r / dw; else hh = w * dw / r / dh;
      if (w > 1) { hh /= w; w = 1; } if (hh > 1) { w /= hh; hh = 1; }
      x = Math.min(Math.max(0, x + (c[2] - w) / 2), 1 - w); y = Math.min(Math.max(0, y + (c[3] - hh) / 2), 1 - hh);
      return [x, y, w, hh];
    },

    /** Displayed (rotated) source size. */
    aeDisp() { const st = this.ae, r = st.ops.rotate || 0; return r === 90 || r === 270 ? [st.sh, st.sw] : [st.sw, st.sh]; },

    aeUpdate() {
      const st = this.ae; if (!st) return;
      const $ = st.$;
      if (st.kind !== "image") {
        if (st.ops.start !== undefined && st.ops.start <= 0) delete st.ops.start;
        if (st.ops.end !== undefined && st.dur && st.ops.end >= st.dur - 1e-3) delete st.ops.end;
        $.sIn.value = (st.ops.start || 0).toFixed(2); $.eIn.value = this.aeEnd().toFixed(2);
        $.kept.textContent = `${Math.max(0, this.aeEnd() - (st.ops.start || 0)).toFixed(2)} с из ${st.dur.toFixed(2)}`;
        $.norm.classList.toggle("on", !!st.ops.normalize);
      }
      if (st.kind !== "audio") {
        $.mir.classList.toggle("on", !!st.ops.mirror); $.cropB.classList.toggle("on", st.crop || !!st.ops.crop);
        const [dw, dh] = outSize(st.sw, st.sh, st.ops);
        $.dims.textContent = st.sw ? `${st.sw}×${st.sh} → ${dw}×${dh}` : "";
      }
      this.aeTicks(); this.aeDraw(); this.aeTick();
    },

    aeDraw() {
      const st = this.ae; if (!st) return;
      const $ = st.$, cv = $.cv, box = $.stage.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.max(50, box.width), H = Math.max(50, box.height);
      cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px";
      const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      if (st.kind === "audio") {
        g.fillStyle = "rgba(56,189,248,.08)"; g.fillRect(0, 0, W, H);
        const tmp = h("canvas"); tmp.width = W * dpr; tmp.height = H * dpr; tmp.style.width = W + "px"; tmp.style.height = H + "px";
        const tg = tmp.getContext("2d"); tg.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawPeaks(tmp, st.peaks, 0, st.dur || st.peaks?.duration || 1, "rgba(125,211,252,.9)");
        g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(tmp, 0, 0); g.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (st.dur) { const x0 = (st.ops.start || 0) / st.dur * W, x1 = this.aeEnd() / st.dur * W; g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, 0, x0, H); g.fillRect(x1, 0, W - x1, H); }
        return;
      }
      if (!st.sw) return;
      const [dw, dh] = this.aeDisp(), k = Math.min(W / dw, H / dh), w = dw * k, hh = dh * k, ox = (W - w) / 2, oy = (H - hh) / 2;
      st.view = { ox, oy, w, hh };
      g.save(); g.translate(ox + w / 2, oy + hh / 2);
      g.rotate((st.ops.rotate || 0) * Math.PI / 180);
      if (st.ops.mirror) g.scale(st.ops.rotate === 90 || st.ops.rotate === 270 ? 1 : -1, st.ops.rotate === 90 || st.ops.rotate === 270 ? -1 : 1);
      const sw = st.sw * k, sh = st.sh * k;
      try { g.drawImage(st.$.media, -sw / 2, -sh / 2, sw, sh); } catch (e) {}
      g.restore();
      const c = st.ops.crop;
      if (c) {
        const x = ox + c[0] * w, y = oy + c[1] * hh, cw = c[2] * w, ch = c[3] * hh;
        g.fillStyle = "rgba(0,0,0,.55)";
        g.fillRect(ox, oy, w, y - oy); g.fillRect(ox, y + ch, w, oy + hh - y - ch); g.fillRect(ox, y, x - ox, ch); g.fillRect(x + cw, y, ox + w - x - cw, ch);
        g.strokeStyle = st.crop ? "#38bdf8" : "rgba(56,189,248,.6)"; g.lineWidth = 1.5; g.strokeRect(x, y, cw, ch);
        if (st.crop) { g.fillStyle = "#38bdf8"; for (const [px, py] of [[x, y], [x + cw, y], [x, y + ch], [x + cw, y + ch]]) g.fillRect(px - 5, py - 5, 10, 10);
          g.strokeStyle = "rgba(255,255,255,.25)"; g.lineWidth = 1; for (const f of [1 / 3, 2 / 3]) { g.beginPath(); g.moveTo(x + cw * f, y); g.lineTo(x + cw * f, y + ch); g.moveTo(x, y + ch * f); g.lineTo(x + cw, y + ch * f); g.stroke(); } }
      }
    },

    aeBindStage() {
      const st = this.ae, cv = st.$.cv;
      cv.addEventListener("dblclick", () => { if (st.kind !== "audio") { delete st.ops.crop; st.crop = false; this.aeUpdate(); } });
      cv.addEventListener("pointerdown", (e) => {
        if (st.kind === "audio") { const r = cv.getBoundingClientRect(); this.aeSeek((e.clientX - r.left) / r.width * st.dur); return; }
        if (!st.crop || !st.ops.crop || !st.view) return;
        e.preventDefault();
        const v = st.view, r = cv.getBoundingClientRect(), c0 = [...st.ops.crop];
        const px = (ev) => [(ev.clientX - r.left - v.ox) / v.w, (ev.clientY - r.top - v.oy) / v.hh];
        const [sx, sy] = px(e), near = (a, b) => Math.abs(a - b) * Math.min(v.w, v.hh) < 12;
        let mode = "move";
        const L = near(sx, c0[0]), R = near(sx, c0[0] + c0[2]), T = near(sy, c0[1]), B = near(sy, c0[1] + c0[3]);
        if ((L || R) && (T || B)) mode = (L ? "l" : "r") + (T ? "t" : "b");
        else if (!(sx > c0[0] && sx < c0[0] + c0[2] && sy > c0[1] && sy < c0[1] + c0[3])) mode = "new";
        const move = (ev) => {
          const [mx, my] = px(ev), cl = (x) => Math.min(1, Math.max(0, x));
          let [x, y, w, hh] = c0;
          if (mode === "move") { x = Math.min(1 - w, Math.max(0, c0[0] + mx - sx)); y = Math.min(1 - hh, Math.max(0, c0[1] + my - sy)); }
          else if (mode === "new") { x = Math.min(cl(sx), cl(mx)); y = Math.min(cl(sy), cl(my)); w = Math.abs(cl(mx) - cl(sx)); hh = Math.abs(cl(my) - cl(sy)); }
          else {
            let x1 = c0[0] + c0[2], y1 = c0[1] + c0[3];
            if (mode[0] === "l") x = cl(mx); else x1 = cl(mx);
            if (mode[1] === "t") y = cl(my); else y1 = cl(my);
            [x, x1] = [Math.min(x, x1), Math.max(x, x1)]; [y, y1] = [Math.min(y, y1), Math.max(y, y1)]; w = x1 - x; hh = y1 - y;
          }
          if (w > 0.02 && hh > 0.02) { st.ops.crop = mode === "move" ? [x, y, w, hh] : this.aeFitAspect([x, y, w, hh]); this.aeUpdate(); }
        };
        const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
      });
    },

    aeBindBar() {
      const st = this.ae; if (st.kind === "image") return;
      const bar = st.$.bar;
      bar.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        const r = bar.getBoundingClientRect(), tAt = (ev) => Math.max(0, Math.min(st.dur, (ev.clientX - r.left) / r.width * st.dur));
        const t = tAt(e), px = (x) => Math.abs(x - t) / st.dur * r.width;
        const which = e.target.classList.contains("l") || px(st.ops.start || 0) < 8 ? "start" : e.target.classList.contains("r") || px(this.aeEnd()) < 8 ? "end" : "seek";
        const move = (ev) => {
          const v = tAt(ev);
          if (which === "start") st.ops.start = Math.min(v, this.aeEnd() - 0.1);
          else if (which === "end") st.ops.end = Math.max(v, (st.ops.start || 0) + 0.1);
          if (which !== "seek") this.aeUpdate();
          this.aeSeek(which === "end" ? Math.max(0, (st.ops.end ?? v) - STEP) : which === "start" ? st.ops.start || 0 : v);
        };
        move(e);
        const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
      });
    },

    aeTicks() {
      const st = this.ae; if (!st || st.kind === "image" || !st.dur) return;
      const tk = st.$.ticks; tk.innerHTML = "";
      for (let k = 0; k <= 8; k++) tk.append(h("span", { style: { left: k / 8 * 100 + "%" } }, C.fmtTime(k / 8 * st.dur)));
      const b = st.$.bar, s = (st.ops.start || 0) / st.dur * 100, e = this.aeEnd() / st.dur * 100;
      b.querySelector(".rng").style.cssText = `left:${s}%;width:${Math.max(0, e - s)}%`;
      b.querySelector(".hl.l").style.left = s + "%"; b.querySelector(".hl.r").style.left = e + "%";
    },

    aeTick() {
      const st = this.ae; if (!st || st.kind === "image") return;
      const m = st.$.media, t = m.currentTime || 0;
      st.t = t;
      if (st.dur) st.$.bar.querySelector(".ph").style.left = t / st.dur * 100 + "%";
      st.$.phT.textContent = `${C.fmtTime(t)} · кадр ${Math.round(t * 24)}`;
      if (st.playing && t >= this.aeEnd() - 0.01) { try { m.currentTime = st.ops.start || 0; } catch (e) {} }
      if (st.kind === "audio") this.aeDraw();
    },

    aeLoop() {
      const st = this.ae; if (!st || !st.playing) return;
      this.aeTick(); if (st.kind === "video") this.aeDraw();
      st.raf = requestAnimationFrame(() => this.aeLoop());
    },

    aeTogglePlay() {
      const st = this.ae, m = st.$.media;
      if (st.playing) { m.pause(); st.playing = false; st.$.play.textContent = "▶"; return; }
      if (m.currentTime < (st.ops.start || 0) || m.currentTime >= this.aeEnd() - 0.02) { try { m.currentTime = st.ops.start || 0; } catch (e) {} }
      m.muted = st.muted; m.play().catch(() => {}); st.playing = true; st.$.play.textContent = "❚❚"; this.aeLoop();
    },

    aeMute() { const st = this.ae; st.muted = !st.muted; st.$.media.muted = st.muted; st.$.mute.textContent = st.muted ? "🔇" : "🔊"; },
    aeSeek(t) { const st = this.ae; if (st.kind === "image") return; try { st.$.media.currentTime = Math.max(0, Math.min(st.dur, t)); } catch (e) {} this.aeTick(); },
    aeStep(n) { const st = this.ae; if (st.playing) this.aeTogglePlay(); this.aeSeek((st.$.media.currentTime || 0) + n * STEP); },
    aeMark(which) {
      const st = this.ae, t = st.$.media.currentTime || 0;
      if (which === "start") st.ops.start = Math.min(t, this.aeEnd() - 0.1); else st.ops.end = Math.max(t + STEP, (st.ops.start || 0) + 0.1);
      this.aeUpdate();
    },
    aeLast(sec) { const st = this.ae, e = this.aeEnd(); st.ops.start = Math.max(0, e - sec); this.aeUpdate(); this.aeSeek(st.ops.start); },

    aeKey(e) {
      const st = this.ae; if (!st) return;
      if (e.target?.tagName === "INPUT" && e.key !== "Escape" && e.key !== "Enter") return;
      const k = e.key, timed = st.kind !== "image";
      const map = {
        Escape: () => this.closeAssetEditor(), Enter: () => this.aeApply(),
        " ": () => timed && this.aeTogglePlay(), ArrowLeft: () => timed && this.aeStep(e.shiftKey ? -10 : -1), ArrowRight: () => timed && this.aeStep(e.shiftKey ? 10 : 1),
        "[": () => timed && this.aeMark("start"), "]": () => timed && this.aeMark("end"),
        Home: () => timed && this.aeSeek(st.ops.start || 0), End: () => timed && this.aeSeek(this.aeEnd() - STEP),
        m: () => timed && this.aeMute(), a: () => st.kind === "video" && this.aeUseAudio(), c: () => st.kind === "video" && this.aeUseFrame(),
        r: () => st.kind !== "audio" && st.$.rot.click(),
      };
      const fn = map[k] || map[k.toLowerCase?.()] || (e.code === "KeyM" ? map.m : e.code === "KeyA" ? map.a : e.code === "KeyC" ? map.c : e.code === "KeyR" ? map.r : null);
      if (!fn || e.ctrlKey || e.metaKey || e.altKey) { e.stopPropagation(); return; }
      e.preventDefault(); e.stopPropagation(); fn();
    },

    async aeApply() {
      const st = this.ae; if (!st || st.busy) return;
      const a = this.p.assets.find((x) => x.id === st.id); if (!a) return this.closeAssetEditor();
      const ops = JSON.parse(JSON.stringify(st.ops));
      if (ops.crop) ops.crop = ops.crop.map((x) => +x.toFixed(5));
      st.busy = true; st.modal.classList.add("busy");
      try {
        const r = await this.host.assetEdit({ action: "edit", kind: st.kind, source: st.orig, ops });
        this.mutate((p) => {
          const x = p.assets.find((y) => y.id === st.id); if (!x) return;
          if (!r.file) {   // nothing to do: back to the original
            if (x.orig) { x.file = x.orig.filename; x.subfolder = x.orig.subfolder || ""; x.type = x.orig.type || "input"; }
            x.orig = null; x.edit = null;
          } else {
            x.orig = st.orig; x.edit = r.ops; x.file = r.file.filename; x.subfolder = r.file.subfolder; x.type = r.file.type || "input";
          }
          const inf = r.info || {};
          for (const k of ["duration", "frames", "width", "height", "has_audio", "poster", "strip", "strip_n"]) if (k in inf) x[k] = inf[k];
        });
        this._peaks && delete this._peaks;
        this.toast(r.file ? "Готово: используется обработанная копия (оригинал сохранён — «Сброс» вернёт его)" : "Оригинал восстановлен");
        this.closeAssetEditor();
      } catch (e) { this.toast("Не удалось обработать: " + (e.message || e), true); }
      finally { if (this.ae === st) { st.busy = false; st.modal.classList.remove("busy"); } }
    },

    async aeUseFrame() {
      const st = this.ae, a = this.p.assets.find((x) => x.id === st.id), t = st.$.media.currentTime || 0;
      try {
        const r = await this.host.assetEdit({ action: "frame", kind: "video", source: st.orig, t, ops: st.ops });
        const id = C.newId("a");
        this.mutate((p) => { p.assets.push({ id, name: `${a.name} · кадр ${t.toFixed(2)} с`, file: r.file.filename, subfolder: r.file.subfolder, type: r.file.type || "input", category: "other" }); });
        this.toast(`Кадр ${t.toFixed(2)} с добавлен в ассеты (категория «Другое»)`);
      } catch (e) { this.toast("Не удалось взять кадр: " + (e.message || e), true); }
    },

    async aeUseAudio() {
      const st = this.ae, a = this.p.assets.find((x) => x.id === st.id);
      if (a && !a.has_audio) return this.toast("В этом видео нет звуковой дорожки", true);
      try {
        const r = await this.host.assetEdit({ action: "audio", kind: "video", source: st.orig, ops: st.ops });
        const id = C.newId("au");
        this.mutate((p) => { p.assets.push({ id, name: `${a.name} · звук`, file: r.file.filename, subfolder: r.file.subfolder, type: r.file.type || "input", category: "audio", duration: r.info?.duration || 0 }); });
        this.toast(`Звук (${(r.info?.duration || 0).toFixed(1)} с) добавлен в аудио-ассеты`);
      } catch (e) { this.toast("Не удалось взять звук: " + (e.message || e), true); }
    },
  });
}

// Sampling dynamics panel under the player (like KJNodes' Model Preview Override): sigma / delta per step,
// step time (ms), status idle / running.
export function installDyn(Editor, { h }) {
  Object.assign(Editor.prototype, {
    buildDyn() {
      const $ = this.$;
      this.dyn = this.dyn || { seg: -1, sigmas: [], delta: [], ms: [], step: 0, steps: 0 };
      $.dynSt = h("span", { class: "st" }, "ожидание");
      $.dynSig = h("canvas"); $.dynMs = h("canvas");
      $.dynInfo = h("span", { class: "nf" });
      $.dyn = h("div", { class: "h3z-dyn" + (this.dynOpen === false ? " closed" : "") },
        h("div", { class: "hd", onclick: () => { this.dynOpen = this.dynOpen === false; try { localStorage.setItem("h3zs.dyn", this.dynOpen ? "1" : "0"); } catch (e) {} $.dyn.classList.toggle("closed", !this.dynOpen); this.drawDyn(); } },
          h("b", null, "Динамика сэмплирования"), $.dynInfo, h("i", { class: "grow" }), $.dynSt),
        h("div", { class: "bd" },
          h("div", { class: "ch" }, h("div", { class: "lb", html: "<b>σ</b> / <em>Δ</em>" }), $.dynSig),
          h("div", { class: "ch" }, h("div", { class: "lb" }, "время шага (мс)"), $.dynMs)));
      try { this.dynOpen = localStorage.getItem("h3zs.dyn") !== "0"; } catch (e) { this.dynOpen = true; }
      $.dyn.classList.toggle("closed", !this.dynOpen);
      try { new ResizeObserver(() => this.drawDyn()).observe($.dyn); } catch (e) {}
      return $.dyn;
    },

    dynEvent(d) {
      const y = this.dyn = this.dyn || { seg: -1, sigmas: [], delta: [], ms: [] };
      if (d.event === "start") Object.assign(y, { seg: -1, sigmas: [], delta: [], ms: [], step: 0, steps: 0, running: true });
      else if (d.event === "sigmas") Object.assign(y, { seg: d.seg, sigmas: d.sigmas || [], delta: [], ms: [], step: 0, steps: Math.max(0, (d.sigmas || []).length - 1), running: true });
      else if (d.event === "step") {
        if (d.seg !== y.seg) Object.assign(y, { seg: d.seg, sigmas: [], delta: [], ms: [] });
        y.step = d.step; y.steps = d.steps; y.running = true;
        y.delta[d.step - 1] = d.delta ?? null; y.ms[d.step - 1] = d.ms ?? null;
      } else if (d.event === "done" || d.event === "idle") y.running = false;
      this.drawDyn();
    },

    drawDyn() {
      const $ = this.$, y = this.dyn; if (!$?.dyn || !y) return;
      $.dynSt.textContent = y.running ? `идёт · отрезок ${y.seg + 1} · шаг ${y.step}/${y.steps}` : "ожидание";
      $.dynSt.classList.toggle("on", !!y.running);
      const ms = y.ms.filter((x) => x != null), avg = ms.length ? ms.slice(-8).reduce((a, b) => a + b, 0) / Math.min(8, ms.length) : null;
      const last = y.step ? y.sigmas[y.step - 1] : null;
      $.dynInfo.textContent = [last != null ? `σ ${last.toFixed(3)}` : "", y.delta[y.step - 1] != null ? `Δ ${y.delta[y.step - 1].toFixed(4)}` : "", avg != null ? `${(avg / 1000).toFixed(2)} с/шаг` : ""].filter(Boolean).join(" · ");
      if (this.dynOpen === false) return;
      const n = Math.max(y.steps || 0, y.sigmas.length - 1, y.ms.length, 1);
      chart($.dynSig, n, [{ v: y.sigmas.slice(0, n + 1), color: "#e5e7ff", dots: true, x0: 0 }, { v: y.delta, color: "#fb923c", x0: 1 }], y.step);
      chart($.dynMs, n, [{ v: y.ms, color: "#22d3ee", bars: true, x0: 1 }], y.step);
    },
  });
}

function chart(cv, n, series, step) {
  const W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(W * dpr)) cv.width = Math.round(W * dpr);
  if (cv.height !== Math.round(H * dpr)) cv.height = Math.round(H * dpr);
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const pad = 6, xs = (i) => pad + (W - 2 * pad) * (n ? i / n : 0);
  g.strokeStyle = "rgba(148,163,255,.10)"; g.lineWidth = 1;
  for (let i = 0; i <= n; i++) { const x = Math.round(xs(i)) + 0.5; g.beginPath(); g.moveTo(x, pad); g.lineTo(x, H - pad); g.stroke(); }
  if (step) { g.fillStyle = "rgba(139,92,246,.12)"; g.fillRect(xs(step - 1), 0, xs(step) - xs(step - 1), H); }
  for (const s of series) {
    const pts = s.v.map((v, i) => [i + (s.x0 || 0), v]).filter((p) => p[1] != null && isFinite(p[1]));
    if (!pts.length) continue;
    const mx = Math.max(...pts.map((p) => p[1]), 1e-9), ys = (v) => H - pad - (H - 2 * pad) * (v / mx);
    g.strokeStyle = g.fillStyle = s.color;
    if (s.bars) { const bw = Math.max(2, (W - 2 * pad) / n * 0.6); for (const [i, v] of pts) g.fillRect(xs(i - 0.5) - bw / 2, ys(v), bw, H - pad - ys(v)); continue; }
    g.lineWidth = 1.6; g.beginPath(); pts.forEach(([i, v], j) => (j ? g.lineTo(xs(i), ys(v)) : g.moveTo(xs(i), ys(v)))); g.stroke();
    if (s.dots) for (const [i, v] of pts) { g.beginPath(); g.arc(xs(i), ys(v), 2, 0, 7); g.fill(); }
  }
}

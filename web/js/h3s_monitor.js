import { T, tServer } from "./h3s_i18n.js";

export const MONITOR_CSS = `
.h3z-sysmon{display:inline-flex;align-items:center;gap:10px;height:34px;padding:0 11px;border:1px solid var(--line);border-radius:10px;background:var(--control);color:var(--txt);font:inherit;font-size:11px;cursor:pointer;white-space:nowrap;flex:none}
.h3z-sysmon:hover{border-color:var(--line2);background:color-mix(in srgb,var(--a1) 8%,var(--control))}
.h3z-sysmon:focus-visible,.h3z-monpop button:focus-visible{outline:2px solid var(--a2);outline-offset:2px}
.h3z-sysmon .dot{width:6px;height:6px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 3px color-mix(in srgb,var(--ok) 12%,transparent)}
.h3z-sysmon.off .dot{background:var(--mut2);box-shadow:none}.h3z-sysmon.err .dot{background:var(--err)}
.h3z-sysmon .m{display:flex;align-items:baseline;gap:4px;font-variant-numeric:tabular-nums}
.h3z-sysmon small{font-size:9px;color:var(--mut)}.h3z-sysmon b{font-size:11px;font-weight:650;min-width:25px}
.h3z-sysmon .temp{color:var(--warn)}
.h3z-monpop{position:absolute;z-index:100003;width:min(820px,calc(100vw - 24px));max-height:calc(100vh - 86px);overflow:auto;padding:18px;display:flex;flex-direction:column;gap:16px;background:var(--bg1);box-shadow:0 24px 80px rgba(0,0,0,.42)}
.h3z-monpop .hd{display:flex;align-items:center;gap:10px}.h3z-monpop .hd .ttl{font-size:16px;font-weight:750}.h3z-monpop .hd .sub{font-size:11px;color:var(--mut);margin-top:2px}.h3z-monpop .hd .grow{flex:1}
.h3z-monmetrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.h3z-moncard{min-width:0;padding:12px;border:1px solid var(--line);border-radius:11px;background:var(--field);color:var(--txt);font:inherit;text-align:left;cursor:pointer}
.h3z-moncard:hover{border-color:var(--line2)}.h3z-moncard.on{border-color:var(--a1);background:color-mix(in srgb,var(--a1) 9%,var(--field))}
.h3z-moncard .lbl{display:block;color:var(--mut);font-size:11px}.h3z-moncard .val{display:block;margin-top:6px;font-size:23px;line-height:1.1;font-weight:720;font-variant-numeric:tabular-nums}
.h3z-moncard .det{display:block;min-height:30px;margin-top:7px;color:var(--mut);font-size:10.5px;line-height:1.4;overflow-wrap:anywhere}
.h3z-moncard .h3z-moncard-meter{display:block;position:relative;width:100%;height:3px;margin-top:10px;overflow:hidden;border-radius:3px;background:var(--control)}.h3z-moncard .h3z-moncard-meter i{position:absolute;left:0;top:0;display:block;height:100%;width:0;background:var(--a1);transition:width .2s}
.h3z-monchart{padding:12px 14px;border:1px solid var(--line);border-radius:11px;background:var(--field)}
.h3z-monchart .chd{display:flex;align-items:baseline;gap:8px;margin-bottom:8px}.h3z-monchart .chd b{font-size:12px}.h3z-monchart .chd strong{margin-left:auto;font-size:13px;font-variant-numeric:tabular-nums}.h3z-monchart .chd span{color:var(--mut);font-size:10px}
.h3z-monchart svg{display:block;width:100%;height:112px;overflow:visible}.h3z-monchart .grid{stroke:var(--line2);stroke-width:1;vector-effect:non-scaling-stroke}.h3z-monchart .area{fill:var(--a1);opacity:.1}.h3z-monchart .line{fill:none;stroke:var(--a1);stroke-width:2;vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round}
.h3z-mondevice{display:flex;flex-wrap:wrap;gap:5px 16px;margin-top:9px;color:var(--mut);font-size:10.5px}
.h3z-monsection{padding-top:14px;border-top:1px solid var(--line)}.h3z-monsection .shd{display:flex;align-items:center;gap:8px;margin-bottom:10px}.h3z-monsection .shd b{font-size:13px}.h3z-monsection .shd .grow{flex:1}
.h3z-monstate{padding:3px 8px;border-radius:999px;background:var(--control);color:var(--mut);font-size:10px}.h3z-monstate.on{color:var(--ok);background:color-mix(in srgb,var(--ok) 10%,transparent)}
.h3z-mongenstage{font-size:12px;line-height:1.5;overflow-wrap:anywhere}.h3z-mongenbar{height:5px;margin:10px 0 8px;overflow:hidden;border-radius:5px;background:var(--control)}.h3z-mongenbar i{display:block;width:0;height:100%;background:var(--grad)}
.h3z-mongenmeta{display:flex;flex-wrap:wrap;gap:6px 18px;color:var(--mut);font-size:11px;font-variant-numeric:tabular-nums}
.h3z-monlog{height:190px;overflow:auto;padding:4px 10px;border:1px solid var(--line);border-radius:10px;background:var(--field);user-select:text;-webkit-user-select:text;cursor:text;font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.h3z-monlog:empty::before{content:"${T("Сообщения появятся после запуска генерации")}";display:block;padding:12px 2px;color:var(--mut);font-family:inherit}
.h3z-monlogrow{display:grid;grid-template-columns:58px minmax(0,1fr);gap:8px;padding:3px 0;user-select:text}.h3z-monlogrow time{color:var(--mut2);font-variant-numeric:tabular-nums}.h3z-monlogrow span{white-space:pre-wrap;overflow-wrap:anywhere;user-select:text}
.h3z-monerror{color:var(--err);font-size:11px}.h3z-monerror:empty{display:none}
@media(max-width:1800px){.h3z-sysmon .temp{display:none}}@media(max-width:1450px){.h3z-sysmon .gpuload{display:none}}
@media(max-width:700px){.h3z-monmetrics{grid-template-columns:repeat(2,minmax(0,1fr))}.h3z-monpop{padding:12px}}
@media(prefers-reduced-motion:reduce){.h3z-moncard .h3z-moncard-meter i{transition:none}}
`;

const number = (v) => v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : null;
const percent = (v) => number(v) === null ? "—" : `${Math.round(number(v))}%`;
const clamp = (v) => Math.max(0, Math.min(100, number(v) || 0));

export function formatBytes(v) {
  const n = number(v);
  if (n === null) return "—";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} ${T("ГБ")}`;
  return `${Math.round(n / 1024 ** 2)} ${T("МБ")}`;
}

export function sparkPath(values, width = 640, height = 100) {
  let vals = (values || []).map((v) => clamp(v));
  if (!vals.length) return "";
  if (vals.length === 1) vals = [vals[0], vals[0]];
  return vals.map((v, i) => `${i ? "L" : "M"}${(i / (vals.length - 1) * width).toFixed(1)},${(height - v / 100 * height).toFixed(1)}`).join(" ");
}

function chart(values) {
  const line = sparkPath(values);
  if (!line) return `<svg viewBox="0 0 640 100" preserveAspectRatio="none" aria-hidden="true"><path class="grid" d="M0 50H640"/></svg>`;
  return `<svg viewBox="0 0 640 100" preserveAspectRatio="none" aria-hidden="true"><path class="grid" d="M0 0H640M0 50H640M0 100H640"/><path class="area" d="${line}L640,100L0,100Z"/><path class="line" d="${line}"/></svg>`;
}

export function installMonitor(Editor, { C, h }) {
  Object.assign(Editor.prototype, {
    monitorState() {
      if (!this._mon) this._mon = { active: false, busy: false, request: 0, seq: 0, metrics: null, history: [], logs: [], chart: "gpu", error: "" };
      return this._mon;
    },

    monitorEl() {
      if (!document.getElementById("h3z-monitor-style")) document.head.append(h("style", { id: "h3z-monitor-style" }, MONITOR_CSS));
      const $ = this.$;
      if (!$.monitor) {
        const refs = {};
        const metric = (key, label, cls = "") => {
          const value = h("b", null, "—");
          refs[key] = value;
          return h("span", { class: `m ${cls}` }, h("small", null, label), value);
        };
        $.monitor = h("button", { class: "h3z-sysmon off", type: "button", title: T("Ресурсы и ход генерации"), "aria-haspopup": "true", "aria-expanded": "false", onclick: () => this.monitorToggle() },
          h("i", { class: "dot" }), metric("cpu", "CPU"), metric("ram", "RAM"), metric("gpu", "GPU", "gpuload"), metric("vram", "VRAM"), metric("temp", "", "temp"));
        $.monitor._refs = refs;
      }
      this.monitorPaint();
      return $.monitor;
    },

    monitorStart() {
      const st = this.monitorState();
      st.active = true;
      clearInterval(this._monTimer);
      this.monitorSync();
      this._monTimer = setInterval(() => this.monitorSync(), 2000);
    },

    monitorStop() {
      const st = this.monitorState();
      st.active = false;
      st.busy = false;
      st.request++;
      clearInterval(this._monTimer);
      this._monTimer = null;
      this.monitorClose(false);
    },

    async monitorSync() {
      const st = this.monitorState();
      if (!this.root || !st.active || st.busy || !this.host.get) return;
      const root = this.root, request = ++st.request;
      st.busy = true;
      try {
        const data = await this.host.get("/h3zero/monitor", { after: st.seq });
        if (!this.root || this.root !== root || request !== st.request || !st.active) return;
        if (number(data?.seq) !== null && data.seq < st.seq) {
          st.seq = 0;
          st.logs = [];
          if (this.$.monitorPop) { this.$.monitorPop._logSeq = 0; this.$.monitorPop._refs.log.innerHTML = ""; }
        }
        st.metrics = data?.metrics || {};
        st.error = "";
        st.seq = Math.max(st.seq, number(data?.seq) || 0);
        st.history.push({ cpu: number(st.metrics.cpu?.percent), ram: number(st.metrics.ram?.percent), gpu: number(st.metrics.gpu?.percent), vram: number(st.metrics.gpu?.vram_percent), temp: number(st.metrics.gpu?.temperature) });
        st.history = st.history.slice(-120);
        st.logs.push(...(data?.logs || []).filter((item) => item.seq > 0));
        st.logs = st.logs.slice(-500);
        this.monitorPaint();
        this.monitorPaintPop();
      } catch (e) {
        if (request !== st.request || !st.active) return;
        st.error = tServer(e?.message || String(e));
        this.monitorPaint();
        this.monitorPaintPop();
      } finally {
        if (request === st.request) st.busy = false;
      }
    },

    monitorPaint() {
      const el = this.$.monitor;
      if (!el) return;
      const st = this.monitorState(), m = st.metrics || {}, gpu = m.gpu || {}, refs = el._refs;
      refs.cpu.textContent = percent(m.cpu?.percent);
      refs.ram.textContent = percent(m.ram?.percent);
      refs.gpu.textContent = percent(gpu.percent);
      refs.vram.textContent = percent(gpu.vram_percent);
      refs.temp.textContent = number(gpu.temperature) === null ? "—" : `${Math.round(gpu.temperature)}°`;
      el.classList.toggle("off", !st.metrics);
      el.classList.toggle("err", !!st.error);
      el.title = (st.error ? T("Мониторинг недоступен: ") + st.error : T("Ресурсы и ход генерации")) + T("\nНажмите для подробной статистики и журнала");
    },

    monitorToggle() {
      if (this.$.monitorPop) this.monitorClose();
      else this.monitorOpen();
    },

    monitorOpen() {
      if (!this.root || this.$.monitorPop) return;
      const st = this.monitorState();
      const refs = { cards: {} };
      const card = (id, label) => {
        const r = refs.cards[id] = { value: h("b", { class: "val" }, "—"), detail: h("span", { class: "det" }, "—"), bar: h("i") };
        r.button = h("button", { class: "h3z-moncard", type: "button", "aria-pressed": st.chart === id, onclick: () => { st.chart = id; this.monitorPaintPop(); } },
          h("span", { class: "lbl" }, label), r.value, r.detail, h("span", { class: "h3z-moncard-meter" }, r.bar));
        return r.button;
      };
      refs.chartTitle = h("b");
      refs.chartNow = h("strong");
      refs.chart = h("div");
      refs.device = h("div", { class: "h3z-mondevice" });
      refs.genState = h("span", { class: "h3z-monstate" });
      refs.genStage = h("div", { class: "h3z-mongenstage" });
      refs.genBar = h("i");
      refs.genMeta = h("div", { class: "h3z-mongenmeta" });
      refs.log = h("div", { class: "h3z-monlog", role: "log", "aria-live": "off", tabindex: "0" });
      refs.error = h("div", { class: "h3z-monerror" });
      const close = h("button", { class: "h3z-btn sm icon", type: "button", html: "✕", title: T("Закрыть (Esc)"), onclick: () => this.monitorClose() });
      const pop = h("section", { class: "h3z-monpop h3z-glass", role: "region", "aria-label": T("Ресурсы и генерация") },
        h("div", { class: "hd" }, h("div", null, h("div", { class: "ttl" }, T("Ресурсы")), h("div", { class: "sub" }, T("Обновление каждые 2 секунды"))), h("i", { class: "grow" }), close),
        refs.error,
        h("div", { class: "h3z-monmetrics" }, card("cpu", T("Процессор")), card("ram", T("Оперативная память")), card("gpu", T("Видеокарта")), card("vram", "VRAM")),
        h("div", { class: "h3z-monchart" }, h("div", { class: "chd" }, refs.chartTitle, h("span", null, T("последние 4 минуты")), refs.chartNow), refs.chart, refs.device),
        h("div", { class: "h3z-monsection" }, h("div", { class: "shd" }, h("b", null, T("Генерация")), h("i", { class: "grow" }), refs.genState), refs.genStage, h("div", { class: "h3z-mongenbar" }, refs.genBar), refs.genMeta),
        h("div", { class: "h3z-monsection" }, h("div", { class: "shd" }, h("b", null, T("Журнал генерации")), h("i", { class: "grow" }),
          h("button", { class: "h3z-btn sm", type: "button", onclick: () => this.monitorCopyLogs() }, T("Копировать")),
          h("button", { class: "h3z-btn sm", type: "button", title: T("Очищает только этот список, не консоль ComfyUI"), onclick: () => this.monitorClearLogs() }, T("Очистить"))), refs.log));
      pop._refs = refs;
      pop._logSeq = 0;
      this.root.append(pop);
      this.$.monitorPop = pop;
      this.$.monitor?.setAttribute("aria-expanded", "true");
      const b = this.$.monitor?.getBoundingClientRect(), rb = this.root.getBoundingClientRect();
      if (b && rb) {
        pop.style.top = `${Math.max(8, b.bottom - rb.top + 8)}px`;
        pop.style.left = `${Math.max(12, Math.min(b.left - rb.left + b.width / 2 - pop.offsetWidth / 2, rb.width - pop.offsetWidth - 12))}px`;
      }
      const off = (e) => {
        if (!pop.contains(e.target) && !this.$.monitor?.contains(e.target)) this.monitorClose(false);
      };
      pop._off = off;
      setTimeout(() => document.addEventListener("pointerdown", off, true));
      this.monitorPaintPop();
      this.monitorRun();
      close.focus({ preventScroll: true });
    },

    monitorClose(focus = true) {
      const pop = this.$.monitorPop;
      if (!pop) return;
      document.removeEventListener("pointerdown", pop._off, true);
      pop.remove();
      this.$.monitorPop = null;
      this.$.monitor?.setAttribute("aria-expanded", "false");
      if (focus && this.$.monitor?.isConnected) this.$.monitor.focus({ preventScroll: true });
    },

    monitorPaintPop() {
      const pop = this.$.monitorPop;
      if (!pop) return;
      const st = this.monitorState(), m = st.metrics || {}, cpu = m.cpu || {}, ram = m.ram || {}, gpu = m.gpu || {}, refs = pop._refs;
      refs.error.textContent = st.error ? T("Не удалось обновить показатели: ") + st.error : "";
      const values = {
        cpu: { value: percent(cpu.percent), detail: T("{0} потоков{1}", cpu.cores || "—", cpu.mhz ? ` · ${(cpu.mhz / 1000).toFixed(1)} GHz` : ""), pct: cpu.percent },
        ram: { value: percent(ram.percent), detail: `${formatBytes(ram.used)} / ${formatBytes(ram.total)}`, pct: ram.percent },
        gpu: { value: percent(gpu.percent), detail: number(gpu.temperature) === null ? (gpu.name || "—") : `${Math.round(gpu.temperature)}°C${gpu.fan != null ? ` · ${Math.round(gpu.fan)}% ${T("вентилятор")}` : ""}`, pct: gpu.percent },
        vram: { value: percent(gpu.vram_percent), detail: `${formatBytes(gpu.vram_used)} / ${formatBytes(gpu.vram_total)}`, pct: gpu.vram_percent },
      };
      for (const [id, r] of Object.entries(refs.cards)) {
        r.value.textContent = values[id].value;
        r.detail.textContent = values[id].detail;
        r.bar.style.width = `${clamp(values[id].pct)}%`;
        const on = st.chart === id;
        r.button.classList.toggle("on", on);
        r.button.setAttribute("aria-pressed", String(on));
      }
      const labels = { cpu: T("Загрузка процессора"), ram: T("Оперативная память"), gpu: T("Загрузка видеокарты"), vram: "VRAM" };
      refs.chartTitle.textContent = labels[st.chart] || labels.gpu;
      refs.chartNow.textContent = values[st.chart]?.value || "—";
      refs.chart.innerHTML = chart(st.history.map((item) => item[st.chart]).filter((v) => v !== null));
      refs.device.innerHTML = "";
      if (gpu.name) refs.device.append(h("span", null, gpu.name));
      if (gpu.driver) refs.device.append(h("span", null, `Driver ${gpu.driver}`));
      if (gpu.cuda) refs.device.append(h("span", null, `CUDA ${gpu.cuda}`));
      if (cpu.process_ram != null) refs.device.append(h("span", null, T("ComfyUI в ОЗУ: {0}", formatBytes(cpu.process_ram))));
      const log = refs.log, follow = log.scrollHeight - log.scrollTop - log.clientHeight < 32;
      for (const item of st.logs) {
        if (item.seq <= (pop._logSeq || 0)) continue;
        const time = new Date((item.t || 0) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        log.append(h("div", { class: "h3z-monlogrow" }, h("time", null, time), h("span", null, item.text || "")));
        pop._logSeq = item.seq;
      }
      if (follow) log.scrollTop = log.scrollHeight;
    },

    monitorRun() {
      const pop = this.$.monitorPop;
      if (!pop) return;
      const refs = pop._refs, r = this.run || {}, active = !!r.active;
      const u = r.phase === "upscale" && r.up && r.up.seg === r.seg ? r.up : null;
      const frac = active && r.total ? Math.min(1, ((r.done || 0) + (u?.tile ? u.tile / u.tiles : 0)) / r.total) : 0;
      refs.genState.textContent = active ? T("Выполняется") : T("Не активна");
      refs.genState.classList.toggle("on", active);
      refs.genStage.textContent = active ? (this.$.runPill?.querySelector("span")?.textContent || T("Подготовка…")) : T("Сейчас генерация не выполняется. Здесь появятся текущий этап, прогресс и оставшееся время.");
      refs.genBar.style.width = `${(frac * 100).toFixed(1)}%`;
      refs.genMeta.innerHTML = "";
      if (active) {
        refs.genMeta.append(h("span", null, T("Шаги: {0} / {1}", r.done || 0, r.total || "…")), h("span", null, `${Math.round(frac * 100)}%`),
          h("span", null, T("Прошло: {0}", r.elapsed != null ? C.fmtDur(r.elapsed) : "—")),
          h("span", null, T("Осталось: {0}", r.eta != null && r.done ? `≈ ${C.fmtDur(r.eta)}` : "—")));
      }
    },

    async monitorCopyLogs() {
      const text = this.monitorState().logs.map((item) => item.text).join("\n");
      if (!text) { this.toast(T("Журнал пока пуст")); return; }
      try {
        await navigator.clipboard.writeText(text);
        this.toast(T("Журнал скопирован"));
      } catch (e) {
        this.toast(T("Не удалось скопировать журнал"), true);
      }
    },

    monitorClearLogs() {
      const st = this.monitorState();
      st.logs = [];
      const pop = this.$.monitorPop;
      if (pop) { pop._logSeq = st.seq; pop._refs.log.innerHTML = ""; }
    },
  });
}

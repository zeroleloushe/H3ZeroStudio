// H3ZeroStudio: model & LoRA presets inside the studio.
// A preset = base model (diffusion model with weight dtype, or a checkpoint) + text encoder + video VAE + audio VAE
// + an ordered LoRA list (on/off, model / clip strength). The library is global (server:
// output/h3zerostudio/_presets/presets.json, shared by all projects); a project keeps a copy of the presets it uses
// (project.model_presets) so it runs the same anywhere and the editor knows when a clip went stale. Project preset
// in «Ролик», per-clip override in the clip card, the manager in «Настройки» → «📦 Модели». A wired node input
// (model / clip / vae / audio_vae) always wins over the preset's file; the preset's LoRAs go on top of either base.
const clone = (o) => JSON.parse(JSON.stringify(o));
const newPid = () => "mp" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const base = (f) => String(f || "").split(/[\\/]/).pop();
const PART = { model: "модель", clip: "текстовый энкодер", vae: "VAE", audio_vae: "аудио VAE", lora: "LoRA" };

export const MP_CSS = `
.h3z-mp-list{display:flex;flex-direction:column;gap:4px;margin:6px 0 10px}
.h3z-mp-item{display:flex;align-items:center;gap:8px;padding:6px 9px;border-radius:9px;cursor:pointer;border:1px solid transparent;background:rgba(255,255,255,.03)}
.h3z-mp-item:hover{background:rgba(255,255,255,.06)}
.h3z-mp-item.on{border-color:var(--acc,#8b7bff);background:rgba(139,123,255,.12)}
.h3z-mp-item b{flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.h3z-mp-item small{opacity:.65;white-space:nowrap}
.h3z-mp-item .w{color:var(--warn,#ffb547)}
.h3z-mp-lora{display:grid;grid-template-columns:22px 1fr 64px 64px auto;gap:6px;align-items:center;margin:4px 0}
.h3z-mp-lora.off{opacity:.5}
.h3z-mp-lora .mv{display:flex;gap:2px}
.h3z-mp-lora .mv button{padding:2px 6px;min-width:0}
.h3z-mp-lora select.miss,.h3z-mp-sel.miss{border-color:var(--err,#ff5c7a)}
.h3z-mp-head{display:grid;grid-template-columns:22px 1fr 64px 64px auto;gap:6px;font-size:11px;opacity:.6;margin-top:6px}
.h3z-mp-wired{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:11.5px;opacity:.85;margin-top:6px}
.h3z-mp-wired span.on{color:var(--ok,#5fd38d)} .h3z-mp-wired span.off{opacity:.55}
.h3z-mp-btns{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.h3z-mp-cache{font-size:11.5px;opacity:.8;margin-top:6px;line-height:1.5}
`;

export function installPresets(Editor, { C, h, ICON }) {
  Object.assign(Editor.prototype, {
    mpStyle() {
      if (document.getElementById("h3z-mp-style")) return;
      document.head.append(h("style", { id: "h3z-mp-style" }, MP_CSS));
    },
    /** Library + file lists + cache state from the server. */
    async mpLoad(refresh = false) {
      if (this._mpP && !refresh) return this._mpP;
      this._mpP = (async () => {
        try {
          const d = await this.host.get("/h3zero/models", refresh ? { refresh: "1" } : {});
          this._mp = { files: d.files || {}, presets: (d.presets || []).map((p) => C.normalizePreset(p)).filter(Boolean), cache: d.cache || {}, missing: d.missing || {}, ok: true };
        } catch (e) { this._mp = { ...(this._mp || { files: {}, presets: [], cache: {}, missing: {} }), ok: false, err: String(e.message || e) }; }
        return this._mp;
      })();
      const r = await this._mpP; this._mpP = r ? Promise.resolve(r) : null;
      return r;
    },
    mpLib() { return this._mp?.presets || []; },
    /** Preset by id: the library version, else the project's copy (a project from another machine). */
    mpGet(id) { return id ? (this.mpLib().find((p) => p.id === id) || this.p.model_presets?.[id] || null) : null; },
    mpUsed(p = this.p) { return [...new Set([p.settings.model_preset, ...p.segments.map((s) => s.model_preset)].filter(Boolean))]; },
    /** Inside a mutate: project.model_presets = copies of exactly the presets it uses (library version wins). */
    mpEmbed(p) {
      const lib = this.mpLib(), out = {};
      for (const id of this.mpUsed(p)) { const q = lib.find((x) => x.id === id) || p.model_presets?.[id]; if (q) out[id] = clone(q); }
      p.model_presets = out;
    },
    /** Missing files of a preset ([[part, file]]): the server's check for library presets, else by the file lists. */
    mpMissing(pr) {
      if (!pr) return [];
      if (this._mp?.missing?.[pr.id] && this.mpLib().some((x) => x.id === pr.id && C.presetFingerprint(x) === C.presetFingerprint(pr) && x.vae === pr.vae && x.audio_vae === pr.audio_vae)) return this._mp.missing[pr.id];
      const f = this._mp?.files; if (!f || !this._mp.ok) return [];
      const has = (k, n) => (f[k] || []).includes(n), out = [];
      if (pr.model && !has(pr.base, pr.model)) out.push(["model", pr.model]);
      for (const k of ["clip", "vae", "audio_vae"]) if (pr[k] && !has(k, pr[k])) out.push([k, pr[k]]);
      for (const l of pr.loras) if (l.on && !has("lora", l.file)) out.push(["lora", l.file]);
      return out;
    },
    mpShort(pr) {
      if (!pr) return "";
      const n = pr.loras.filter((l) => l.on && (l.sm || l.sc)).length;
      return [base(pr.model) || "модель с провода", n ? `${n} LoRA` : ""].filter(Boolean).join(" · ");
    },
    /** On open: copies of presets changed in the library (another project, another tab) are refreshed quietly. */
    async mpSync() {
      const pid = this.p.id, mp = await this.mpLoad();
      if (!this.root || this.p.id !== pid || !mp.ok) return;
      const changed = this.mpUsed().filter((id) => { const a = this.mpLib().find((x) => x.id === id), b = this.p.model_presets?.[id]; return a && (!b || JSON.stringify(a) !== JSON.stringify(b)); });
      if (!changed.length) { if (this.tool === "settings") this.renderLeft(); return; }
      const before = this.p.segments.map((_, i) => this.isStale(i));
      const p = clone(this.p); this.mpEmbed(p);
      this.p = C.normalizeProject(p); this.flushSave(); this.renderAll();
      const n = this.p.segments.filter((s, i) => s.result && !before[i] && this.isStale(i)).length;
      this.toast(`Пресет моделей обновлён из библиотеки: ${changed.map((id) => "«" + (this.mpGet(id)?.name || id) + "»").join(", ")}` + (n ? ` — ${n} клип(ов) устарели` : ""), !!n);
    },
    setProjPreset(id) {
      this.mutate((p) => { p.settings.model_preset = id || ""; this.mpEmbed(p); });
      const pr = this.mpGet(id), miss = this.mpMissing(pr);
      if (miss.length) this.toast(`Пресет «${pr.name}»: нет файлов — ${miss.map((m) => base(m[1])).join(", ")}`, true);
    },
    setSegPreset(i, id) {
      this.mutate((p) => { if (p.segments[i]) p.segments[i].model_preset = id || ""; this.mpEmbed(p); });
    },
    /** Wired inputs of the node (true / false / undefined = unknown). */
    mpWired() { const o = {}; for (const k of ["model", "clip", "vae", "audio_vae"]) o[k] = this.host.inputLinked?.(k); return o; },

    /** <select> of presets. inherit = label of the "as the project" entry (per clip). */
    mpSelect(value, onchange, inherit) {
      const lib = this.mpLib(), opts = [...lib];
      const own = this.p.model_presets || {};
      for (const id of Object.keys(own)) if (!lib.some((x) => x.id === id)) opts.push({ ...own[id], _proj: true });
      if (value && !opts.some((x) => x.id === value)) opts.push({ id: value, name: `${value} (нет)`, loras: [], _gone: true });
      const miss = this.mpMissing(this.mpGet(value)).length;
      const s = h("select", { class: "h3z-sel h3z-mp-sel" + (miss ? " miss" : ""), title: "Пресет моделей: базовая модель, текстовый энкодер, VAE, аудио VAE и LoRA. Подключённый провод ноды важнее файла пресета." },
        h("option", { value: "", selected: !value }, inherit || "— провода ноды (без пресета) —"),
        opts.map((pr) => h("option", { value: pr.id, selected: pr.id === value }, `${pr.name}${pr._proj ? " · только в проекте" : ""}${this.mpMissing(pr).length ? " ⚠" : ""}`)));
      s.onchange = () => onchange(s.value);
      s.addEventListener("keydown", (e) => e.stopPropagation());
      return s;
    },
    /** «Модели» in the «Ролик» card: project preset + what the node's wires give. */
    mpProjectBlock() {
      this.mpStyle();
      if (!this._mp) this.mpLoad().then(() => this.root && this.renderInspector());
      const id = this.p.settings.model_preset, pr = this.mpGet(id), w = this.mpWired(), miss = this.mpMissing(pr);
      const manage = h("button", { class: "h3z-btn sm", title: "Менеджер пресетов: «Настройки» → «📦 Модели»", onclick: () => { this._mpSel = id || this._mpSel; this.openSettings("Пресеты моделей"); } }, "⚙ Пресеты");
      const wires = h("div", { class: "h3z-mp-wired", title: "Входы ноды H3ZeroStudio. Подключённый вход важнее файла пресета (LoRA пресета ложатся поверх подключённой модели)." },
        ...["model", "clip", "vae", "audio_vae"].map((k) => h("span", { class: w[k] ? "on" : "off" }, `${w[k] ? "⚡" : "○"} ${k}`)));
      const noModel = !pr && w.model === false;
      return h("div", null, h("div", { class: "h3z-lbl" }, "Модели", h("em", null, pr ? this.mpShort(pr) : "провода ноды")),
        h("div", { class: "h3z-row", style: "gap:6px" }, this.mpSelect(id, (v) => this.setProjPreset(v)), manage),
        miss.length ? h("div", { class: "h3z-note err" }, "Нет файлов: " + miss.map((m) => `${PART[m[0]] || m[0]} ${base(m[1])}`).join(", ")) : null,
        noModel ? h("div", { class: "h3z-note warn" }, "Вход model не подключён: выберите пресет моделей или подключите модель к ноде.") : null,
        wires);
    },
    /** Per-clip override (model + LoRAs + text encoder; the VAEs stay the project's). */
    mpSegBlock(i) {
      const s = this.seg(i); if (!s || C.isFootage(s)) return null;
      const pp = this.mpGet(this.p.settings.model_preset), own = s.model_preset, pr = this.mpGet(own), miss = this.mpMissing(pr);
      const sel = this.mpSelect(own, (v) => this.setSegPreset(i, v), `как у ролика (${pp ? pp.name : "провода"})`);
      const d = h("details", { class: "h3z-det" }, h("summary", null, "Модели клипа", own ? h("em", { style: "margin-left:8px;opacity:.75" }, pr?.name || own) : null),
        h("div", { class: "in" }, sel,
          miss.length ? h("div", { class: "h3z-note err" }, "Нет файлов: " + miss.map((m) => base(m[1])).join(", ")) : null,
          h("div", { class: "h3z-note" }, "Свой пресет клипа меняет модель, LoRA и текстовый энкодер этого отрезка; VAE и аудио VAE — всегда пресета ролика. Разные базовые модели в одном запуске загружаются по очереди (на 12 ГБ одна база за раз).")));
      if (own) d.open = true;
      return d;
    },
    /** Gallery / takes label of a result's models record. */
    mpLabel(m) {
      if (!m) return "";
      const n = (m.loras || []).length;
      return `⚙ ${m.preset}${n ? ` · ${n} LoRA` : ""}`;
    },
    mpTip(m) {
      if (!m) return "";
      return `Пресет «${m.preset}»\nмодель: ${base(m.base)}\nэнкодер: ${base(m.clip)}` + ((m.loras || []).length ? "\nLoRA: " + m.loras.map((l) => `${base(l[0])} ×${l[1]}${l[2] !== l[1] ? "/" + l[2] : ""}`).join(", ") : "");
    },

    // ---------------------------------------------------------------- library editing
    async mpSave(list, msg) {
      this._mp.presets = list.map((p) => C.normalizePreset(p)).filter(Boolean);
      clearTimeout(this._mpT);
      const used = this.mpUsed();
      // the open project's copies follow the library at once (undo step: the project changes)
      if (used.some((id) => { const a = this._mp.presets.find((x) => x.id === id), b = this.p.model_presets?.[id]; return a && JSON.stringify(a) !== JSON.stringify(b); }))
        this.mutate((p) => this.mpEmbed(p), { coalesce: "mpedit", render: "none" });
      return new Promise((res) => {
        this._mpT = setTimeout(async () => {
          try {
            const r = await this.host.call("/h3zero/models/presets", { presets: this._mp.presets });
            if (r?.missing) this._mp.missing = r.missing;
            if (msg) this.toast(msg);
          } catch (e) { this.toast("Не удалось сохранить пресеты: " + (e.message || e), true); }
          if (this.root) { this.renderInspector(); if (this.tool === "settings") this.mpRefreshManager(); }
          res();
        }, msg ? 0 : 450);
      });
    },
    mpEdit(id, fn, msg) {
      const list = clone(this.mpLib()), k = list.findIndex((x) => x.id === id); if (k < 0) return;
      fn(list[k], list, k);
      this.mpSave(list, msg);
      this.mpRefreshManager();
    },
    mpNew(from) {
      const lib = this.mpLib(); if (lib.length >= C.MAX_PRESETS) { this.toast(`Не больше ${C.MAX_PRESETS} пресетов`, true); return; }
      const f = this._mp.files || {};
      const pick = (list, re) => (list || []).find((x) => re.test(x)) || "";
      const p = from ? { ...clone(from), id: newPid(), name: (from.name + " копия").slice(0, 80) } : {
        id: newPid(), name: `Пресет ${lib.length + 1}`, base: "unet", dtype: "default",
        model: pick(f.unet, /minimax.?h3/i), clip: pick(f.clip, /minimax.?h3|qwen3.?vl/i),
        vae: pick(f.vae, /h3.*video.*vae|minimax.*video/i), audio_vae: pick(f.audio_vae, /h3.*audio.*vae|minimax.*audio/i), loras: [] };
      this._mpSel = p.id;
      this.mpSave([...clone(lib), p], from ? `Пресет «${from.name}» продублирован` : "Новый пресет создан");
      this.mpRefreshManager();
    },
    mpDelete(id) {
      const pr = this.mpGet(id); if (!pr) return;
      const inUse = this.mpUsed().includes(id);
      if (!confirm(`Удалить пресет «${pr.name}» из библиотеки?` + (inUse ? "\nЭтот проект его использует — его копия останется в проекте." : ""))) return;
      this.mpSave(this.mpLib().filter((x) => x.id !== id), `Пресет «${pr.name}» удалён`);
      this._mpSel = null;
      this.mpRefreshManager();
    },
    mpExport(all) {
      const list = all ? this.mpLib() : [this.mpGet(this._mpSel)].filter(Boolean);
      if (!list.length) return;
      const blob = new Blob([JSON.stringify({ h3zerostudio_presets: 1, presets: list }, null, 1)], { type: "application/json" });
      const a = h("a", { href: URL.createObjectURL(blob), download: all ? "h3zs_presets.json" : `h3zs_preset_${list[0].name.replace(/[^\p{L}\p{N}_-]+/gu, "_")}.json` });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    },
    mpImport() {
      const inp = h("input", { type: "file", accept: ".json,application/json", style: "display:none" });
      inp.onchange = async () => {
        const file = inp.files?.[0]; inp.remove(); if (!file) return;
        let data; try { data = JSON.parse(await file.text()); } catch (e) { this.toast("Не JSON: " + file.name, true); return; }
        const src = Array.isArray(data) ? data : Array.isArray(data?.presets) ? data.presets : data && typeof data === "object" ? [data] : [];
        const list = clone(this.mpLib()); let n = 0, ren = 0;
        for (const raw of src) {
          let q = C.normalizePreset(raw, raw?.id || newPid()); if (!q) continue;
          const same = list.find((x) => x.id === q.id);
          if (same && JSON.stringify(same) === JSON.stringify(q)) continue;
          if (same) { q = { ...q, id: newPid() }; ren++; }
          if (list.some((x) => x.name === q.name)) q.name = (q.name + " (импорт)").slice(0, 80);
          if (list.length >= C.MAX_PRESETS) break;
          list.push(q); n++;
        }
        if (!n) { this.toast("Новых пресетов в файле нет", true); return; }
        this.mpSave(list, `Импортировано пресетов: ${n}` + (ren ? ` (${ren} с новым id)` : ""));
        this.mpRefreshManager();
      };
      document.body.append(inp); inp.click();
    },
    async mpRelease() {
      try { const r = await this.host.call("/h3zero/models/release", {}); this._mp.cache = r || {}; this.toast("Модели пресетов выгружены, память освобождена"); }
      catch (e) { this.toast("Не удалось выгрузить: " + (e.message || e), true); }
      this.mpRefreshManager();
    },
    mpRefreshManager() {
      const old = this.$.mpMgr; if (!old?.isConnected) return;
      const nu = this.mpManager(); old.replaceWith(nu);
    },

    /** «Настройки» → «📦 Модели» → «Пресеты моделей». */
    mpManager() {
      this.mpStyle();
      const mp = this._mp;
      const box = h("div", { class: "h3z-mp" }); this.$.mpMgr = box;
      if (!mp) { box.append(h("div", { class: "h3z-note" }, "Загрузка списка моделей…")); this.mpLoad().then(() => this.mpRefreshManager()); return box; }
      if (!mp.ok) box.append(h("div", { class: "h3z-note err" }, "Сервер не отдал список моделей (" + (mp.err || "ошибка") + "). Перезапустите ComfyUI после обновления H3ZeroStudio."));
      const lib = this.mpLib();
      if (!lib.some((x) => x.id === this._mpSel)) this._mpSel = this.p.settings.model_preset && lib.some((x) => x.id === this.p.settings.model_preset) ? this.p.settings.model_preset : lib[0]?.id || null;
      const projId = this.p.settings.model_preset;
      // list
      const list = h("div", { class: "h3z-mp-list" }, lib.length ? lib.map((pr) => {
        const miss = this.mpMissing(pr).length, use = this.p.segments.filter((s) => s.model_preset === pr.id).length;
        const it = h("div", { class: "h3z-mp-item" + (pr.id === this._mpSel ? " on" : ""), onclick: () => { this._mpSel = pr.id; this.mpRefreshManager(); } },
          h("b", null, pr.name), miss ? h("span", { class: "w", title: "Нет файлов: " + this.mpMissing(pr).map((m) => base(m[1])).join(", ") }, "⚠") : null,
          h("small", null, (pr.id === projId ? "● ролик · " : "") + (use ? `${use} клип. · ` : "") + this.mpShort(pr)));
        return it;
      }) : h("div", { class: "h3z-note" }, "Пресетов пока нет. «＋ Новый» — модель, энкодер, VAE и LoRA из папок ComfyUI."));
      const btn = (label, title, fn, dis) => h("button", { class: "h3z-btn sm", title, disabled: dis || undefined, onclick: fn }, label);
      const sel = lib.find((x) => x.id === this._mpSel);
      box.append(list, h("div", { class: "h3z-mp-btns" },
        btn("＋ Новый", "Новый пресет (подставит найденные файлы H3)", () => this.mpNew()),
        btn("⧉ Дублировать", "Копия выбранного пресета", () => this.mpNew(sel), !sel),
        btn("✕ Удалить", "Удалить выбранный пресет из библиотеки", () => this.mpDelete(sel.id), !sel),
        btn("⇩ Экспорт", "Скачать выбранный пресет как JSON (Shift+клик — все)", (e) => this.mpExport(e.shiftKey), !sel),
        btn("⇩ Все", "Скачать все пресеты одним JSON", () => this.mpExport(true), !lib.length),
        btn("⇧ Импорт", "Загрузить пресеты из JSON (совпадающие id получат новые)", () => this.mpImport()),
        btn("⟳ Обновить списки", "Перечитать папки моделей ComfyUI (новые файлы без перезапуска)", async () => { await this.mpLoad(true); this.mpRefreshManager(); this.renderInspector(); this.toast("Списки моделей обновлены"); })));
      if (sel) box.append(this.mpEditor(sel));
      // cache
      const c = mp.cache || {};
      box.append(h("div", { class: "h3z-lbl", style: "margin-top:12px" }, "Загружено пресетами", h("em", null, "кэш между запусками")),
        h("div", { class: "h3z-mp-cache" }, [`модель: ${(c.base || []).map(base).join(", ") || "—"}`, `энкодер: ${(c.clip || []).map(base).join(", ") || "—"}`, `VAE: ${(c.vae || []).map(base).join(", ") || "—"}`, `LoRA в памяти: ${c.loras || 0} (${c.lora_mb || 0} МБ)`].map((x) => h("div", null, x))),
        h("div", { class: "h3z-mp-btns" }, btn("⏏ Выгрузить модели пресетов", "Освободить VRAM и RAM: выгрузить модели, загруженные пресетами (модели с проводов ноды не трогает)", () => this.mpRelease())),
        h("div", { class: "h3z-note" }, "Смена только LoRA не перезагружает базовую модель: LoRA накладываются патчами на её копию. При смене базы старая выгружается до загрузки новой."));
      return box;
    },
    mpEditor(pr) {
      const f = this._mp.files || {}, id = pr.id;
      const miss = new Set(this.mpMissing(pr).map((m) => m[1]));
      const ed = (fn, msg) => this.mpEdit(id, fn, msg);
      const fileSel = (kind, val, onch, empty) => {
        const list = f[kind] || [], opts = val && !list.includes(val) ? [val, ...list] : list;
        const s = h("select", { class: "h3z-sel" + (val && miss.has(val) ? " miss" : ""), title: val || empty || "" },
          empty !== undefined ? h("option", { value: "", selected: !val }, empty) : null,
          opts.map((x) => h("option", { value: x, selected: x === val }, x + (x === val && miss.has(x) ? "  ⚠ нет файла" : ""))));
        s.onchange = () => onch(s.value);
        s.addEventListener("keydown", (e) => e.stopPropagation());
        return s;
      };
      const name = h("input", { class: "h3z-in", value: pr.name, maxlength: 80 });
      name.onchange = () => ed((p) => { p.name = name.value.trim() || p.name; });
      name.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") name.blur(); });
      const baseP = h("div", { class: "h3z-pills" }, [["unet", "Diffusion model"], ["checkpoint", "Checkpoint"]].map(([k, l]) =>
        h("div", { class: "h3z-pill" + (pr.base === k ? " on" : ""), title: k === "unet" ? "models/diffusion_models (UNETLoader)" : "models/checkpoints (CheckpointLoaderSimple: модель, энкодер и VAE в одном файле)", onclick: () => ed((p) => { p.base = k; p.model = ""; }) }, l)));
      const dtype = h("select", { class: "h3z-sel", title: "weight_dtype как в UNETLoader: default — как в файле; fp8 — меньше VRAM" }, C.PRESET_DTYPES.map((x) => h("option", { value: x, selected: x === pr.dtype }, x)));
      dtype.onchange = () => ed((p) => { p.dtype = dtype.value; });
      const ck = pr.base === "checkpoint";
      const loras = h("div", null, pr.loras.length ? h("div", { class: "h3z-mp-head" }, h("span"), h("span", null, "LoRA (по порядку)"), h("span", null, "модель"), h("span", null, "энкодер"), h("span")) : null,
        ...pr.loras.map((l, k) => {
          const on = h("input", { type: "checkbox", checked: l.on, title: "Вкл / выкл без удаления" });
          on.onchange = () => ed((p) => { p.loras[k].on = on.checked; });
          const numIn = (key) => { const e = h("input", { class: "h3z-in", type: "number", step: 0.05, min: -10, max: 10, value: l[key], title: key === "sm" ? "Сила для модели (strength_model)" : "Сила для текстового энкодера (strength_clip)" });
            e.onchange = () => ed((p) => { p.loras[k][key] = Number(e.value) || 0; }); e.addEventListener("keydown", (x) => x.stopPropagation()); return e; };
          const mv = (d) => ed((p) => { const j = k + d; if (j < 0 || j >= p.loras.length) return; [p.loras[k], p.loras[j]] = [p.loras[j], p.loras[k]]; });
          return h("div", { class: "h3z-mp-lora" + (l.on ? "" : " off") }, on, fileSel("lora", l.file, (v) => ed((p) => { p.loras[k].file = v; })), numIn("sm"), numIn("sc"),
            h("div", { class: "mv" }, h("button", { class: "h3z-btn sm", title: "Выше", disabled: k === 0 || undefined, onclick: () => mv(-1) }, "↑"), h("button", { class: "h3z-btn sm", title: "Ниже", disabled: k === pr.loras.length - 1 || undefined, onclick: () => mv(1) }, "↓"),
              h("button", { class: "h3z-btn sm danger", title: "Убрать LoRA", onclick: () => ed((p) => { p.loras.splice(k, 1); }) }, "✕")));
        }),
        h("button", { class: "h3z-btn sm", disabled: pr.loras.length >= C.MAX_PRESET_LORAS || !(f.lora || []).length || undefined, title: (f.lora || []).length ? "Добавить LoRA (models/loras)" : "В models/loras нет файлов",
          onclick: () => ed((p) => { p.loras.push({ file: (f.lora || [])[0], on: true, sm: 1, sc: 1 }); }) }, "＋ LoRA"));
      const note = h("textarea", { class: "h3z-ta sm", placeholder: "Заметка (для чего пресет)", spellcheck: "false" }); note.value = pr.note || "";
      note.onchange = () => ed((p) => { p.note = note.value; });
      note.addEventListener("keydown", (e) => e.stopPropagation());
      const isProj = this.p.settings.model_preset === id;
      return h("div", { class: "h3z-mp-ed" },
        this.field("Название", name),
        h("div", { class: "h3z-lbl" }, "Базовая модель"), baseP,
        h("div", { class: "h3z-grid2", style: "grid-template-columns:1fr auto" }, fileSel(pr.base, pr.model, (v) => ed((p) => { p.model = v; }), "— нет (модель с провода) —"), ck ? h("span") : dtype),
        this.field("Текстовый энкодер (CLIPLoader · minimax)", fileSel("clip", pr.clip, (v) => ed((p) => { p.clip = v; }), ck ? "— из чекпойнта / провод —" : "— с провода clip —")),
        h("div", { class: "h3z-grid2" }, this.field("VAE видео", fileSel("vae", pr.vae, (v) => ed((p) => { p.vae = v; }), ck ? "— из чекпойнта / провод —" : "— с провода vae —")),
          this.field("Аудио VAE", fileSel("audio_vae", pr.audio_vae, (v) => ed((p) => { p.audio_vae = v; }), "— с провода audio_vae —"))),
        h("div", { class: "h3z-lbl", style: "margin-top:8px" }, "LoRA", h("em", null, `${pr.loras.filter((l) => l.on).length} вкл. из ${pr.loras.length} · до ${C.MAX_PRESET_LORAS}`)), loras,
        note,
        miss.size ? h("div", { class: "h3z-note err" }, "Нет файлов: " + [...miss].map(base).join(", ") + ". Положите их в папки ComfyUI и нажмите «⟳ Обновить списки».") : null,
        h("div", { class: "h3z-mp-btns" }, h("button", { class: "h3z-btn sm" + (isProj ? "" : " primary"), disabled: isProj || undefined, onclick: () => { this.setProjPreset(id); this.mpRefreshManager(); } }, isProj ? "● Пресет этого ролика" : "Использовать в ролике")),
        h("div", { class: "h3z-note" }, "Пустое поле — берётся вход ноды. Подключённый провод всегда важнее файла пресета; LoRA пресета накладываются и на модель с провода."));
    },
  });
}

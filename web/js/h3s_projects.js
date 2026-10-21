import { T } from "./h3s_i18n.js";
// «Проекты»: the open project is autosaved to the project list (output/h3zerostudio/_projects) a few seconds
// after every change; open / new / duplicate / rename / delete; zip export (project + assets + generations)
// and import. The live copy of the open project stays in the workflow node as before.
const fmtMB = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(2) + T(" ГБ") : (b / 1048576).toFixed(1) + T(" МБ"));

export function installProjects(Editor, { C, h, ICON }) {
  const fmtDate = (t) => (t ? new Date(t * 1000).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
  Object.assign(Editor.prototype, {
    projMeta(p = this.p) {
      const items = C.plan(p), frames = items.length ? items[items.length - 1].end : 0;
      const poster = p.segments.map((s) => s.result?.poster).find(Boolean) || null;
      const [w, hh] = C.resolution(p.settings);
      return { name: p.name || T("H3 проект"), seconds: Math.round(frames / C.FPS * 10) / 10, segments: p.segments.length,
        done: p.segments.filter((s) => s.result?.video).length, poster, wh: [w, hh], assets: p.assets.length };
    },
    /** Autosave of the open project to the list (debounced; called after every save to the node). */
    projAutosave(now = false) {
      clearTimeout(this._projT);
      const go = async () => {
        if (!this.p?.id || !this.host.call) return;
        const json = JSON.stringify(this.p);
        if (json === this._projSaved) return;
        try { await this.host.call("/h3zero/project/save", { project: this.p, meta: this.projMeta() }); this._projSaved = json; this._projAt = Date.now(); }
        catch (e) { console.warn("[H3ZeroStudio] project autosave", e); }
      };
      if (now) return go();
      this._projT = setTimeout(go, 3000);
    },

    async projList(force = false) {
      if (!force && this._projs && Date.now() - this._projs.t < 3000) return this._projs;
      let items = [], err = "";
      try { items = await this.host.get("/h3zero/projects"); } catch (e) { err = e.message || String(e); }
      this._projs = { t: Date.now(), items: items || [], err };
      return this._projs;
    },

    renderProjects(L) {
      const fileIn = h("input", { type: "file", accept: ".zip,application/zip", style: { display: "none" } });
      fileIn.onchange = () => { const f = fileIn.files?.[0]; fileIn.value = ""; if (f) this.projImport(f); };
      const m = this.projMeta();
      const name = h("input", { class: "h3z-in", value: this.p.name || "", title: T("Имя проекта") });
      name.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") name.blur(); });
      name.onchange = () => { const n = name.value.trim() || T("H3 проект"); this.mutate((p) => { p.name = n; }, { render: "light" }); this.projAutosave(true).then(() => this.projFill(true)); };
      const saved = this._projAt ? T("сохранён {0}", new Date(this._projAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })) : T("автосохранение через 3 с после изменений");
      const cur = h("div", { class: "h3z-pcur" },
        h("div", { class: "pv" }, m.poster ? h("img", { src: this.host.url(m.poster), draggable: "false" }) : h("div", { class: "noimg" }, "🎬"), h("span", { class: "k" }, T("открыт"))),
        name,
        h("div", { class: "h3z-note" }, T("{0} отр. · {1} с · {2} · готово {3}/{4} · {5}", m.segments, m.seconds, m.wh.join("×"), m.done, m.segments, saved)),
        h("div", { class: "h3z-row wrap" },
          h("button", { class: "h3z-btn sm", title: T("Сохранить в список проектов сейчас"), onclick: async () => { await this.projAutosave(true); this.toast(T("Проект сохранён в «Проекты»")); this.projFill(true); } }, T("💾 Сохранить")),
          h("button", { class: "h3z-btn sm", title: T("Копия проекта со всеми ассетами, дублями и таймлайном (файлы генераций — жёсткими ссылками, без лишнего места)"), onclick: () => this.projDuplicate(this.p) }, T("⧉ Дублировать")),
          h("button", { class: "h3z-btn sm", title: T("Проект + ассеты + генерации в один zip — для бэкапа или переноса"), onclick: () => this.projExportDialog(this.p) }, T("⇩ Экспорт zip"))));
      const head = h("div", { class: "h3z-ghead" }, h("b", null, T("Проекты")), h("i", { class: "grow" }),
        h("button", { class: "h3z-btn sm", title: T("Начать новый проект (текущий сохранится)"), onclick: () => this.projNew() }, T("+ Новый")),
        h("button", { class: "h3z-btn sm", title: T("Открыть проект из zip (экспорт H3ZeroStudio)"), onclick: () => fileIn.click() }, T("⇪ Импорт")));
      this.$.projGrid = h("div", { class: "h3z-plist" }, h("div", { class: "h3z-note" }, T("Загрузка…")));
      L.append(h("div", { class: "h3z-gal" }, head, cur, h("div", { class: "h3z-lbl" }, T("Все проекты")), this.$.projGrid, fileIn));
      this.projAutosave(true).then(() => this.projFill(true));
    },

    async projFill(force = false) {
      const g = await this.projList(force), grid = this.$.projGrid;
      if (!grid || !grid.isConnected) return;
      const snap = this.uiSnap(this.$.left);   // refills (save / rename / delete) keep the list scroll
      grid.innerHTML = "";
      if (g.err) grid.append(h("div", { class: "h3z-note err" }, T("Не удалось загрузить список: ") + g.err));
      if (!g.items.length) grid.append(h("div", { class: "h3z-gempty" }, T("Сохранённых проектов пока нет.")));
      for (const m of g.items) {
        const open = m.id === this.p.id;
        const card = h("div", { class: "h3z-pcard" + (open ? " open" : ""), title: open ? T("Открыт сейчас") : T("Клик — открыть · правый клик — действия") },
          h("div", { class: "pv" }, m.poster ? h("img", { src: this.host.url(m.poster), loading: "lazy", draggable: "false" }) : h("div", { class: "noimg" }, "🎬")),
          h("div", { class: "in" }, h("b", null, m.name || m.id), h("span", null, [m.seconds != null ? m.seconds + T(" с") : "", m.segments != null ? m.segments + T(" отр.") : "", open ? T("открыт") : ""].filter(Boolean).join(" · ")),
            h("small", null, fmtDate(m.updated))),
          h("button", { class: "h3z-btn sm icon more", title: T("Действия"), html: "⋯" }));
        card.onclick = (e) => { if (e.target.closest(".more")) return this.projMenu(e, m); if (!open) this.projOpen(m.id); };
        card.addEventListener("contextmenu", (e) => this.projMenu(e, m));
        grid.append(card);
      }
      this.uiRestore(this.$.left, snap, true); this.leftRestore?.();
    },

    projMenu(e, m) {
      const open = m.id === this.p.id;
      this.openMenu(e, m.name || m.id, [
        { label: open ? T("Открыт") : T("Открыть"), fn: () => this.projOpen(m.id), dis: open || this.run.active },
        { label: T("⧉ Дублировать"), fn: async () => this.projDuplicate(open ? this.p : await this.host.get("/h3zero/project", { id: m.id })) },
        { label: T("Переименовать…"), fn: () => this.projRename(m) },
        { label: T("⇩ Экспорт zip…"), fn: async () => this.projExportDialog(open ? this.p : await this.host.get("/h3zero/project", { id: m.id })) },
        "sep",
        open ? { why: T("Открытый проект нельзя удалить — сначала откройте другой") } : null,
        { icon: ICON.trash, label: T("Удалить…"), danger: true, dis: open, fn: () => this.projDelete(m) },
      ]);
    },

    /** Replace the open project (the node's copy) with p. */
    loadProject(p, msg) {
      this.stopPlayback?.();
      this.galClose?.(); this.closeSaveDialog?.();
      this.p = C.normalizeProject(p);
      this.undoStack = []; this.redoStack = []; this.lastCoalesce = null;
      this.sel = this.p.segments.length ? 0 : -1; this.playhead = 0; this.pvMode = "full";
      this._gal = null; this.galSel = []; this._projSaved = JSON.stringify(this.p);
      this.flushSave();
      this.renderAll();
      if (msg) this.toast(msg);
      this.globSync?.();
      this.mpSync?.();
      this.filesSync?.();
    },
    async projOpen(id) {
      if (this.run.active) { this.toast(T("Идёт генерация — откройте проект после неё"), true); return; }
      try {
        await this.projAutosave(true);
        const p = await this.host.get("/h3zero/project", { id });
        this.loadProject(p, T("Открыт проект «{0}»", p.name || id));
      } catch (e) { this.toast(T("Не удалось открыть: ") + (e.message || e), true); }
    },
    async projNew() {
      if (this.run.active) { this.toast(T("Идёт генерация — дождитесь окончания"), true); return; }
      await this.projAutosave(true);
      const p = { id: C.newId("p"), name: T("H3 проект"), settings: { aspect: this.p.settings.aspect, megapixels: this.p.settings.megapixels, settings_scope: "global", ...(this._glob || {}) },
        segments: [{ id: C.newId("s"), frames: 124, color: 0, link: "extend" }] };
      this.loadProject(p, T("Новый проект · прошлый сохранён в «Проекты»"));
      this.projAutosave(true).then(() => this.projFill(true));
    },
    async projDuplicate(p) {
      try {
        const name = prompt(T("Имя копии"), (p.name || T("H3 проект")) + T(" (копия)")); if (name === null) return;
        if (p.id === this.p.id) await this.projAutosave(true);
        const copy = await this.host.call("/h3zero/project/duplicate", { project: p, new_id: C.newId("p"), name: name.trim() || undefined });
        await this.host.call("/h3zero/project/save", { project: copy, meta: this.projMeta(C.normalizeProject(copy)) });
        this.toast(T("Копия «{0}» сохранена в «Проекты»", copy.name), false, { label: T("Открыть"), fn: () => this.projOpen(copy.id) });
        this.projFill(true);
      } catch (e) { this.toast(T("Не удалось дублировать: ") + (e.message || e), true); }
    },
    async projRename(m) {
      const n = prompt(T("Имя проекта"), m.name || ""); if (n === null || !n.trim()) return;
      try {
        if (m.id === this.p.id) { this.mutate((p) => { p.name = n.trim(); }, { render: "light" }); await this.projAutosave(true); }
        else await this.host.call("/h3zero/project/rename", { id: m.id, name: n.trim() });
        this.projFill(true); if (m.id === this.p.id) this.renderLeft();
      } catch (e) { this.toast(T("Не удалось переименовать: ") + (e.message || e), true); }
    },
    /** Delete dialog: the project from the list, and (default) its whole folder — assets, generations, cache,
     *  takes, exports. Shared files of older versions are never touched here («Очистить неиспользуемое»). */
    async projDelete(m) {
      if (m.id === this.p.id) return;
      this.closeSaveDialog?.();
      let files = true;
      const sz = h("em", { class: "h3z-note" }, T("считаю…"));
      const ft = this.toggle(T("Удалить все файлы проекта"), files, (v) => { files = v; });
      ft.onclick = () => { files = !files; ft.classList.toggle("on", files); };
      ft.classList.add("on"); ft.classList.add("h3z-del-files");
      const go = h("button", { class: "h3z-btn danger" }, T("Удалить"));
      const close = () => this.closeSaveDialog();
      this.host.get("/h3zero/project/size", { id: m.id })
        .then((r) => { sz.textContent = r.files ? T("освободится {0} · файлов: {1} (ассеты, генерации, кэш, дубли, экспорт)", fmtMB(r.bytes), r.files) : T("файлов на диске нет"); })
        .catch(() => { sz.textContent = ""; });
      go.onclick = async () => {
        go.disabled = true;
        try {
          await this.host.call("/h3zero/project/delete", { id: m.id, files });
          this.toast(T("Проект «{0}» удалён", m.name || m.id) + (files ? T(" вместе с файлами") : T(" (файлы оставлены)"))); close(); this.projFill(true);
        } catch (e) { this.toast(T("Не удалось удалить: ") + (e.message || e), true); go.disabled = false; }
      };
      const box = h("div", { class: "h3z-save h3z-glass h3z-del" }, h("div", { class: "hd" }, h("b", null, T("🗑 Удалить проект «{0}»?", m.name || m.id)), h("i", { class: "grow" }), h("button", { class: "h3z-btn sm icon", onclick: close }, "✕")),
        h("div", { class: "h3z-note" }, T("Проект исчезнет из списка. Отменить это нельзя.")), ft, sz,
        h("div", { class: "h3z-row" }, h("i", { class: "grow" }), h("button", { class: "h3z-btn", onclick: close }, T("Отмена")), go));
      const modal = this.$.saveModal = h("div", { class: "h3z-modal" }, box);
      modal.addEventListener("pointerdown", (x) => { if (x.target === modal) close(); });
      box.addEventListener("keydown", (x) => { x.stopPropagation(); if (x.key === "Escape") close(); });
      this.root.append(modal);
      go.focus();
    },

    /** Older projects point into the shared input/h3zerostudio folder: copy what this one uses into its own folder
     *  (originals untouched) and relink. Quiet, no undo step; cache keys stay (assets keep their old place in kf). */
    async filesSync() {
      const pid = this.p.id;
      const ext = (this.p.assets || []).some((a) => !String(a.subfolder || "").startsWith(`h3zerostudio/${pid}/`) || (a.type || "input") !== "output");
      if (!ext || this._filesSyncing === pid) return;
      this._filesSyncing = pid;
      try {
        const r = await this.host.call("/h3zero/project/localize", { project: this.p });
        if (!this.root || this.p.id !== pid || !r?.moved) return;
        const byId = Object.fromEntries(r.assets.map((a) => [a.id, a]));
        this.p.assets = this.p.assets.map((a) => byId[a.id] ? { ...a, ...byId[a.id] } : a);
        this.p = C.normalizeProject(this.p); this.flushSave?.(); this.renderAll();
        this.toast(T("Файлы проекта собраны в его папку: {0}", r.moved) + (r.missing?.length ? T(" · не найдено: {0}", r.missing.length) : ""));
      } catch (e) { console.warn("[H3ZS] localize", e); }
      finally { this._filesSyncing = null; }
    },

    projExportDialog(p) {
      this.closeSaveDialog?.();
      const ld = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (x) { return d; } };
      const folder = h("input", { class: "h3z-in", value: ld("h3zs.zipDir", ""), placeholder: T("по умолчанию: папка проекта / export") });
      let cache = ld("h3zs.zipCache", "1") === "1";
      const ct = this.toggle(T("С кэшем латентов (большой архив: продолжение и апскейл без перегенерации)"), cache, (v) => { cache = v; });
      ct.onclick = () => { cache = !cache; ct.classList.toggle("on", cache); };
      if (cache) ct.classList.add("on");
      const info = h("div", { class: "h3z-note" }, T("В архив попадут проект, все его ассеты (картинки, аудио, видео) и папка генераций: дубли, финалы, зафиксированные отрезки."));
      const go = h("button", { class: "h3z-btn primary" }, T("Экспорт"));
      const close = () => this.closeSaveDialog();
      go.onclick = async () => {
        go.disabled = true; info.textContent = T("Собираю архив…"); info.classList.remove("err");
        try { localStorage.setItem("h3zs.zipDir", folder.value.trim()); localStorage.setItem("h3zs.zipCache", cache ? "1" : "0"); } catch (x) {}
        try {
          if (p.id === this.p.id) await this.projAutosave(true);
          const r = await this.host.call("/h3zero/project/export_zip", { project: p.id === this.p.id ? this.p : p, include_cache: cache, folder: folder.value.trim() });
          info.textContent = T("✓ {0} · {1} МБ · файлов {2} ", r.path, (r.size / 1048576).toFixed(1), r.files);
          if (r.ref) info.append(h("a", { href: this.host.url(r.ref), download: r.ref.filename, class: "h3z-btn sm" }, T("Скачать")));
          info.append(" ", h("button", { class: "h3z-btn sm", onclick: () => { navigator.clipboard?.writeText(r.path); this.toast(T("Путь скопирован")); } }, T("Скопировать путь")));
          this.toast(T("Экспортировано: ") + r.path);
        } catch (e) { info.textContent = T("Ошибка: ") + (e.message || e); info.classList.add("err"); }
        finally { go.disabled = false; }
      };
      const box = h("div", { class: "h3z-save h3z-glass" }, h("div", { class: "hd" }, h("b", null, T("⇩ Экспорт «{0}» в zip", p.name || p.id)), h("i", { class: "grow" }), h("button", { class: "h3z-btn sm icon", onclick: close }, "✕")),
        this.field(T("Папка"), this.folderPicker(folder)), ct, info, h("div", { class: "h3z-row" }, h("i", { class: "grow" }), h("button", { class: "h3z-btn", onclick: close }, T("Закрыть")), go));
      const modal = this.$.saveModal = h("div", { class: "h3z-modal" }, box);
      modal.addEventListener("pointerdown", (x) => { if (x.target === modal) close(); });
      box.addEventListener("keydown", (x) => { x.stopPropagation(); if (x.key === "Escape") close(); });
      this.root.append(modal);
    },

    async projImport(file) {
      if (this.run.active) { this.toast(T("Идёт генерация — дождитесь окончания"), true); return; }
      this.toast(T("Импорт «{0}»…", file.name));
      try {
        await this.projAutosave(true);
        const p = await this.host.importZip(file, C.newId("p"));
        this.loadProject(p, T("Импортирован и открыт проект «{0}»", p.name || p.id));
        this.projFill(true);
      } catch (e) { this.toast(T("Не удалось импортировать: ") + (e.message || e), true); }
    },
  });
}

// «Галерея»: everything generated in the project (or in all projects) — takes, drafts, finals from drafts,
// segment upscales, frozen segments and stitched videos. Search by prompt, filters, favourites, viewer,
// side-by-side comparison; to the timeline / refs, upscale, final from draft, save to a folder, delete.
// Backend: /h3zero/gallery (h3s_library.py), entries are recorded when each result is produced.
export function installGallery(Editor, { C, h, ICON }) {
  const KIND = { take: "Дубль", draft: "Черновик", refine: "Финал ↑", upscale: "Апскейл", final: "Ролик" };
  const FILTERS = [["all", "Все"], ["take", "Дубли"], ["draft", "Черновики"], ["refine", "Финал ↑"], ["upscale", "Апскейл"], ["frozen", "🔒 Зафикс."], ["final", "Ролики"], ["fav", "★"]];
  const ago = (t) => {
    if (!t) return "";
    const d = new Date(t * 1000), now = new Date();
    const hm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    return d.toDateString() === now.toDateString() ? hm : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) + " " + hm;
  };
  Object.assign(Editor.prototype, {
    /** Gallery entries (cached for a few seconds), merged with what the current project knows about them. */
    async galLoad(force = false) {
      const scope = this.galScope || "project", key = scope + ":" + this.p.id;
      if (!force && this._gal && this._gal.key === key && Date.now() - this._gal.t < 4000) return this._gal;
      let items = [], err = "";
      try { items = await this.host.get("/h3zero/gallery", scope === "all" ? { all: "1" } : { id: this.p.id }); }
      catch (e) { err = e.message || String(e); }
      this._gal = { key, t: Date.now(), items: this.galEnrich(items || []), err };
      return this._gal;
    },
    galEnrich(items) {
      const byKey = {};
      this.p.segments.forEach((s, i) => (s.takes || []).forEach((t) => { byKey[t.key] = { i, s, t }; }));
      return items.map((e) => {
        const r = e.pid === this.p.id ? byKey[e.key] : null;
        const x = { ...e };
        if (r) {
          x.seg_index = r.i; x.seg_id = r.s.id; x.take_id = r.t.id;
          if (!x.prompt) x.prompt = r.t.snap?.prompt || r.s.prompt || "";
          if (!x.seed && r.t.seed != null) x.seed = r.t.seed;
          if (x.scanned && r.t.result?.kind) x.kind = r.t.result.kind === "full" ? (r.t.result.upscale ? "upscale" : "take") : r.t.result.kind;
          x.active = r.s.active_take === r.t.id;
        }
        if (e.kind === "final" && e.pid === this.p.id && this.p.result?.full?.key === e.key) x.current = this.fullCurrent();
        return x;
      });
    },
    galRef(e) {
      if (e.pid !== this.p.id) return null;
      for (let i = 0; i < this.p.segments.length; i++) { const t = (this.p.segments[i].takes || []).find((x) => x.key === e.key); if (t) return { i, take: t }; }
      return null;
    },
    galMatches(e) {
      const f = this.galFilter || "all", q = (this.galQ || "").trim().toLowerCase();
      if (f === "fav" && !e.fav) return false;
      if (f === "frozen" && !e.frozen) return false;
      if (!["all", "fav", "frozen"].includes(f) && e.kind !== f) return false;
      if (q && !`${e.prompt || ""} ${e.seg_name || ""} ${e.project || ""} ${e.seed ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    },
    /** Why a gallery item cannot be deleted ("" = it can). */
    galInUse(e) {
      if (e.pid !== this.p.id) return "";
      if (e.active) return "Это активный дубль на таймлайне — сначала выберите другой дубль";
      if (e.kind === "final" && e.current) return "Это текущий итоговый ролик";
      const fn = e.video?.filename;
      if (this.p.assets.some((a) => a.file === fn && a.subfolder === e.video?.subfolder)) return "Видео используется как ассет проекта";
      return "";
    },

    renderGallery(L) {
      const head = h("div", { class: "h3z-ghead" }, h("b", null, "Галерея"), h("span", { class: "h3z-note gcount" }, ""), h("i", { class: "grow" }),
        h("button", { class: "h3z-btn sm icon", title: "Обновить", html: "↻", onclick: () => { this.galLoad(true).then(() => this.galFill()); } }));
      const scope = h("div", { class: "h3z-pills" }, [["project", "Этот проект"], ["all", "Все проекты"]].map(([k, l]) =>
        h("div", { class: "h3z-pill" + ((this.galScope || "project") === k ? " on" : ""), onclick: () => { this.galScope = k; this.galSel = []; this.renderLeft(); } }, l)));
      const q = h("input", { class: "h3z-in", placeholder: "Поиск по промпту, имени, сиду…", value: this.galQ || "" });
      q.addEventListener("input", () => { this.galQ = q.value; clearTimeout(this._galQT); this._galQT = setTimeout(() => this.galFill(), 120); });
      q.addEventListener("keydown", (e) => e.stopPropagation());
      const filters = h("div", { class: "h3z-pills wrap" }, FILTERS.map(([k, l]) =>
        h("div", { class: "h3z-pill" + ((this.galFilter || "all") === k ? " on" : ""), title: k === "fav" ? "Избранное" : "", onclick: () => { this.galFilter = k; this.renderLeft(); } }, l)));
      this.$.galBar = h("div", { class: "h3z-gbar" });
      this.$.galGrid = h("div", { class: "h3z-ggrid" }, h("div", { class: "h3z-note" }, "Загрузка…"));
      L.append(h("div", { class: "h3z-gal" }, head, scope, q, filters, this.$.galBar, this.$.galGrid));
      this.galLoad().then(() => this.galFill());
    },

    galFill() {
      const grid = this.$.galGrid; if (!grid || !grid.isConnected) return;
      const snap = this.uiSnap(this.$.left);   // refills (★, delete, search) keep the list scroll
      const g = this._gal || { items: [] };
      const list = g.items.filter((e) => this.galMatches(e));
      this.galSel = (this.galSel || []).filter((id) => g.items.some((e) => e.id + e.pid === id));
      const cnt = grid.parentElement.querySelector(".gcount"); if (cnt) cnt.textContent = `${list.length}${list.length !== g.items.length ? " из " + g.items.length : ""}`;
      // selection bar (compare)
      const bar = this.$.galBar; bar.innerHTML = "";
      const sel = this.galSel.map((id) => g.items.find((e) => e.id + e.pid === id)).filter(Boolean);
      if (sel.length === 2) bar.append(h("button", { class: "h3z-btn sm primary", onclick: () => this.galView(sel) }, "⇄ Сравнить выбранные"), h("button", { class: "h3z-btn sm", onclick: () => { this.galSel = []; this.galFill(); } }, "Снять выбор"));
      else if (sel.length === 1) bar.append(h("span", { class: "h3z-note" }, "Ctrl+клик по второму — сравнить"), h("button", { class: "h3z-btn sm", onclick: () => { this.galSel = []; this.galFill(); } }, "✕"));
      grid.innerHTML = "";
      if (g.err) grid.append(h("div", { class: "h3z-note err" }, "Не удалось загрузить галерею: " + g.err));
      if (!list.length) {
        grid.append(h("div", { class: "h3z-gempty" }, g.items.length ? "Ничего не найдено — измените фильтр или поиск" : "Здесь появится всё сгенерированное: дубли, черновики, финалы, апскейлы, зафиксированные отрезки и готовые ролики."));
        this.uiRestore(this.$.left, snap, true); return;
      }
      for (const e of list.slice(0, 400)) grid.append(this.galCard(e));
      this.uiRestore(this.$.left, snap, true); this.leftRestore?.();   // the list arrives after the re-render: put the scroll back
    },

    galCard(e) {
      const sid = e.id + e.pid, on = (this.galSel || []).includes(sid);
      const img = e.poster ? h("img", { src: this.host.url(e.poster), loading: "lazy", draggable: "false" })
        : e.video ? h("video", { src: this.host.url(e.video) + "#t=0.1", muted: true, preload: "metadata", playsinline: true, draggable: "false" }) : h("div", { class: "noimg" }, "🎞");
      const star = h("div", { class: "star" + (e.fav ? " on" : ""), title: e.fav ? "Убрать из избранного" : "В избранное" }, e.fav ? "★" : "☆");
      star.addEventListener("click", (ev) => { ev.stopPropagation(); this.galFav(e); });
      const tags = h("div", { class: "tags" }, h("span", { class: "k " + e.kind }, KIND[e.kind] || e.kind),
        e.frozen ? h("span", { class: "k fz" }, "🔒") : null, e.active ? h("span", { class: "k on", title: "Активный дубль на таймлайне" }, "✓") : null,
        e.kind === "final" && e.current ? h("span", { class: "k on" }, "итог") : null);
      const line1 = [e.seg_index != null ? `Отр. ${e.seg_index + 1}` : e.kind === "final" ? `${e.count || ""} отр.` : "", e.frames ? `${(e.frames / C.FPS).toFixed(1)} с` : "", e.seed != null ? `сид ${e.seed}` : "", ago(e.created)].filter(Boolean).join(" · ");
      const card = h("div", { class: "h3z-gcard" + (on ? " sel" : ""), title: (e.prompt || "").slice(0, 400) + "\n\nДвойной клик — смотреть · Ctrl+клик — выбрать для сравнения · правый клик — действия" },
        h("div", { class: "pv" }, img, tags, star),
        h("div", { class: "cap" }, h("div", { class: "l1" }, line1), h("div", { class: "l2" }, (e.prompt || "").replace(/\s+/g, " ").slice(0, 90) || (e.project && (this.galScope === "all") ? e.project : "")),
          this.galScope === "all" && e.project ? h("div", { class: "l3" }, e.project) : null));
      const pv = card.querySelector(".pv");
      card.addEventListener("pointerenter", () => {   // muted hover preview (not playback of the project)
        if (!e.video || pv.querySelector("video")) return;
        const v = h("video", { src: this.host.url(e.video), muted: true, loop: true, playsinline: true, preload: "auto" });
        v.muted = true; pv.append(v); v.play().catch(() => {});
      });
      card.addEventListener("pointerleave", () => { const v = pv.querySelector("video"); if (v) { v.pause(); v.remove(); } });
      card.addEventListener("click", (ev) => {
        const cur = this.galSel || [];
        if (ev.ctrlKey || ev.metaKey || ev.shiftKey) this.galSel = cur.includes(sid) ? cur.filter((x) => x !== sid) : [...cur, sid].slice(-2);
        else this.galSel = cur.length === 1 && cur[0] === sid ? [] : [sid];
        this.galFill();
      });
      card.addEventListener("dblclick", (ev) => { ev.stopPropagation(); this.galView([e]); });
      card.addEventListener("contextmenu", (ev) => this.galMenu(ev, e));
      return card;
    },

    galMenu(ev, e) {
      const ref = this.galRef(e), g = this._gal || { items: [] }, busy = this.run.active;
      const other = (this.galSel || []).map((id) => g.items.find((x) => x.id + x.pid === id)).find((x) => x && x.id + x.pid !== e.id + e.pid);
      const seg = this.seg(), why = this.galInUse(e);
      const isSeg = e.kind !== "final";
      this.openMenu(ev, (KIND[e.kind] || "Видео") + (e.seg_index != null ? ` · отрезок ${e.seg_index + 1}` : ""), [
        { label: "▶ Смотреть", hint: "2×клик", fn: () => this.galView([e]) },
        other ? { label: "⇄ Сравнить с выбранным", fn: () => this.galView([other, e]) } : null,
        "sep",
        ref ? { label: e.active ? "✓ Активный дубль на таймлайне" : `✓ Выбрать этот дубль (отрезок ${ref.i + 1})`, fn: () => this.selectTake(ref.i, ref.take.id), dis: e.active || busy || !!this.seg(ref.i)?.freeze } : null,
        { icon: ICON.film || "", label: "На таймлайн (футаж)", title: "Добавить видео в конец таймлайна как футаж (как есть)", fn: () => { const id = this.galAsset(e); if (id) this.addFootage(id); }, dis: !e.video },
        seg ? { label: `В референсы отрезка ${this.sel + 1} (<Video>)`, fn: () => { const id = this.galAsset(e); if (id && !this.seg().refs.includes(id)) this.toggleRef(this.sel, id); }, dis: !e.video } : null,
        ref && isSeg && e.kind !== "upscale" ? { label: "↑ Апскейл отрезка", title: "Выбрать этот дубль и увеличить отрезок (метод по умолчанию)", fn: () => { if (!e.active) this.selectTake(ref.i, ref.take.id, true); this.upscaleSeg(ref.i, this.upDefault()); }, dis: busy } : null,
        ref && e.kind === "draft" ? { label: "↑ Финал из черновика", fn: () => { if (!e.active) this.selectTake(ref.i, ref.take.id, true); this.finalFromDraft([ref.i]); }, dis: busy } : null,
        "sep",
        { label: "💾 Сохранить в папку…", fn: () => this.galSave(e), dis: !e.video },
        { label: e.fav ? "☆ Убрать из избранного" : "★ В избранное", fn: () => this.galFav(e) },
        "sep",
        why ? { why } : null,
        { icon: ICON.trash, label: "Удалить…", danger: true, dis: !!why || busy, fn: () => this.galDelete(e) },
      ]);
    },

    /** A gallery video as a project video asset (reused if it is already one). Returns the asset id. */
    galAsset(e) {
      const v = e.video; if (!v) return null;
      const have = this.p.assets.find((a) => a.category === "video" && a.file === v.filename && a.subfolder === v.subfolder);
      if (have) return have.id;
      const id = "gl_" + (e.key || C.newId("g")).slice(0, 16);
      const name = (KIND[e.kind] || "Видео") + (e.seg_index != null ? ` отр. ${e.seg_index + 1}` : "") + (e.seed != null ? ` · ${e.seed}` : "");
      this.mutate((p) => { if (!p.assets.some((a) => a.id === id)) p.assets.push({ id, name, file: v.filename, subfolder: v.subfolder, type: v.type || "output", category: "video",
        duration: (e.frames || 0) / C.FPS, frames: e.frames || 0, width: (e.wh || [])[0] || 0, height: (e.wh || [])[1] || 0, has_audio: true, poster: e.poster || null, strip: e.strip || null, strip_n: e.strip ? 10 : 0, frozen: "" }); }, { render: "none" });
      this.renderAll();
      this.toast(`«${name}» добавлено в ассеты (видео)`);
      return id;
    },

    async galFav(e) {
      try {
        await this.host.call("/h3zero/gallery/update", { pid: e.pid, id: e.id, fields: { fav: !e.fav } });
        for (const x of this._gal?.items || []) if (x.id === e.id && x.pid === e.pid) x.fav = !e.fav;
        this.galFill();
      } catch (err) { this.toast("Не удалось: " + (err.message || err), true); }
    },

    async galDelete(e) {
      const why = this.galInUse(e); if (why) { this.toast(why, true); return; }
      const other = e.pid !== this.p.id ? `\nЭто элемент другого проекта («${e.project || e.pid}»): его дубль там пропадёт.` : "";
      if (!confirm(`Удалить «${KIND[e.kind] || "видео"}${e.seg_index != null ? " · отрезок " + (e.seg_index + 1) : ""}» из галереи?\nФайлы видео и кэш латента будут удалены с диска.${e.frozen ? "\nЗафиксированная копия останется." : ""}${other}`)) return;
      try {
        await this.host.call("/h3zero/gallery/delete", { pid: e.pid, id: e.id });
        const ref = this.galRef(e);
        if (ref && !e.frozen) this.mutate((p) => { const s = p.segments[ref.i]; s.takes = (s.takes || []).filter((t) => t.id !== ref.take.id); }, { render: "none" });
        await this.galLoad(true);
        this.renderAll();
        this.toast("Удалено из галереи");
      } catch (err) { this.toast("Не удалось удалить: " + (err.message || err), true); }
    },

    /** «Сохранить в папку»: a copy of the item's mp4 (as is) in a folder on the ComfyUI computer. */
    galSave(e) {
      this.closeSaveDialog?.();
      const ld = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (x) { return d; } };
      const folder = h("input", { class: "h3z-in", value: ld("h3zs.exportDir", ""), placeholder: "по умолчанию: ComfyUI/output/h3zerostudio/export" });
      const name = h("input", { class: "h3z-in", value: `${(e.project || this.p.name || "h3").replace(/[\\/:*?"<>|]/g, "_")}_${(KIND[e.kind] || "video").replace(/\W+/g, "")}${e.seg_index != null ? "_otr" + (e.seg_index + 1) : ""}${e.seed != null ? "_" + e.seed : ""}` });
      const info = h("div", { class: "h3z-note" }, "mp4 сохраняется как есть · файл не перезаписывается (добавится _2, _3…)");
      const go = h("button", { class: "h3z-btn primary" }, "Сохранить");
      const close = () => this.closeSaveDialog();
      go.onclick = async () => {
        go.disabled = true;
        try { localStorage.setItem("h3zs.exportDir", folder.value.trim()); } catch (x) {}
        try { const r = await this.host.exportVideo({ source: e.video, folder: folder.value.trim(), name: name.value.trim() }); info.textContent = "✓ " + r.path; this.toast("Сохранено: " + r.path); }
        catch (err) { info.textContent = "Ошибка: " + (err.message || err); info.classList.add("err"); }
        finally { go.disabled = false; }
      };
      const box = h("div", { class: "h3z-save h3z-glass" }, h("div", { class: "hd" }, h("b", null, "💾 Сохранить из галереи"), h("i", { class: "grow" }), h("button", { class: "h3z-btn sm icon", onclick: close }, "✕")),
        this.field("Папка", folder), this.field("Имя файла (.mp4)", name), info, h("div", { class: "h3z-row" }, h("i", { class: "grow" }), h("button", { class: "h3z-btn", onclick: close }, "Закрыть"), go));
      const modal = this.$.saveModal = h("div", { class: "h3z-modal" }, box);
      modal.addEventListener("pointerdown", (x) => { if (x.target === modal) close(); });
      box.addEventListener("keydown", (x) => { x.stopPropagation(); if (x.key === "Escape") close(); if (x.key === "Enter") go.click(); });
      this.root.append(modal); name.focus(); name.select();
    },

    /** Viewer: one video, or two side by side with shared controls (synchronised play / pause / seek). No autoplay. */
    galView(list) {
      this.galClose();
      this.stopPlayback?.();
      const vids = list.map((e) => h("video", { src: this.host.url(e.video), preload: "auto", playsinline: true, controls: list.length === 1 }));
      const cols = list.map((e, k) => h("div", { class: "col" }, vids[k], h("div", { class: "lbl" }, h("b", null, (list.length > 1 ? "AB"[k] + " · " : "") + (KIND[e.kind] || "") + (e.seg_index != null ? ` · отрезок ${e.seg_index + 1}` : "")),
        h("span", null, [e.wh ? e.wh.join("×") : "", e.frames ? (e.frames / C.FPS).toFixed(2) + " с" : "", e.seed != null ? "сид " + e.seed : "", ago(e.created)].filter(Boolean).join(" · ")),
        e.prompt ? h("small", null, e.prompt.replace(/\s+/g, " ").slice(0, 220)) : null)));
      let ctr = null;
      if (list.length === 2) {
        const [a, b] = vids;
        b.muted = true;
        const play = h("button", { class: "h3z-btn sm", html: ICON.play }), seek = h("input", { type: "range", min: 0, max: 1000, value: 0, class: "h3z-range" }), t = h("span", { class: "h3z-note" }, "0.00 с");
        const snd = h("button", { class: "h3z-btn sm", title: "Чей звук слышно" }, "Звук: A");
        snd.onclick = () => { const toB = !a.muted; a.muted = toB; b.muted = !toB; snd.textContent = "Звук: " + (toB ? "B" : "A"); };
        const dur = () => Math.max(a.duration || 0, b.duration || 0) || 1;
        play.onclick = () => { if (a.paused) { b.currentTime = a.currentTime; a.play().catch(() => {}); b.play().catch(() => {}); play.innerHTML = ICON.pause; } else { a.pause(); b.pause(); play.innerHTML = ICON.play; } };
        seek.oninput = () => { const x = seek.value / 1000 * dur(); a.currentTime = Math.min(x, (a.duration || x) - 0.01); b.currentTime = Math.min(x, (b.duration || x) - 0.01); };
        a.ontimeupdate = () => { seek.value = Math.round(a.currentTime / dur() * 1000); t.textContent = a.currentTime.toFixed(2) + " с"; if (!b.paused && Math.abs(b.currentTime - a.currentTime) > 0.08) b.currentTime = a.currentTime; };
        a.onended = () => { b.pause(); play.innerHTML = ICON.play; };
        ctr = h("div", { class: "h3z-row ctr" }, play, seek, t, snd);
      }
      const box = h("div", { class: "h3z-gview h3z-glass" + (list.length === 2 ? " two" : "") },
        h("div", { class: "hd" }, h("b", null, list.length === 2 ? "⇄ Сравнение" : "▶ Просмотр"), h("i", { class: "grow" }), h("button", { class: "h3z-btn sm icon", onclick: () => this.galClose() }, "✕")),
        h("div", { class: "vids" }, cols), ctr);
      const modal = this.$.galModal = h("div", { class: "h3z-modal" }, box);
      modal.addEventListener("pointerdown", (x) => { if (x.target === modal) this.galClose(); });
      modal.addEventListener("keydown", (x) => { x.stopPropagation(); if (x.key === "Escape") this.galClose(); });
      modal.tabIndex = -1;
      this.root.append(modal); modal.focus();
    },
    galClose() { if (this.$?.galModal) { this.$.galModal.querySelectorAll("video").forEach((v) => v.pause()); this.$.galModal.remove(); this.$.galModal = null; this.focusSink?.(); } },
  });
}

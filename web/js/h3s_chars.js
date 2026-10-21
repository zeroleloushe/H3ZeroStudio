// «Персонажи»: a library of pre-encoded reference cards (character / location / outfit / style / voice) in the
// RefMod .safetensors format (MiniMaxH3Mod, MIT), stored in our library folder with a thumbnail.
// Left rail tab: library grid (search, type filter, folders), create / edit / delete. A card is built from
// project assets: photos (reorder, crop — the first one sets the aspect), an optional clip (17-frame rule) and an
// optional voice sample (trim, ~80 tokens/s). Full = every latent token, Compressed = pooled to a small grid.
// Applying: drop a card on a clip / into a clip card or a ✂ span card — the whole set goes in after the plain
// refs (C.cardLabels numbers <Picture N> / <Video N> / <Audio N>); weight > 1 = copies, < 1 = weaker; on / off.
// Backend: /h3zero/chars (h3s_chars.py, routes.py).
export function installChars(Editor, { C, h, ICON }) {
  const CN = C.CARD_CONCEPT_NAMES;
  const GLYPH = { identity: "👤", background: "🏞", clothing: "👗", style: "🎨", pose_motion: "🏃", voice: "🎙", generic: "◈" };
  const WEIGHTS = [0.25, 0.5, 0.75, 1, 2, 3, 4];
  const RES = [512, 768, 1024];
  const SUBJECT_RE = /^[\p{L}\p{N}_\-']+$/u;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ref = (a) => a && { file: a.file, subfolder: a.subfolder || "", type: a.type || "input" };
  const blankForm = () => ({ edit: null, name: "", folder: "", concept: "identity", mode: "full", res: 768, grid: 16,
    subject_name: "", appearance: "", retained_attributes: "", voice_description: "", photos: [], clip: null, voice: null, busy: false });

  Object.assign(Editor.prototype, {
    // ------------------------------------------------------------------ library
    async charsLoad(force = false) {
      const c = this._chars;
      if (!force && c && (c.loading || Date.now() - c.t < 15000)) return c.loading || c;
      const job = (async () => {
        let d = null, err = "";
        try { d = await this.host.get("/h3zero/chars"); } catch (e) { err = e.message || String(e); }
        this._chars = { cards: d?.cards || [], roots: d?.roots || [], vae: !!d?.vae, audio_vae: !!d?.audio_vae, busy: !!d?.busy, err, t: Date.now() };
        return this._chars;
      })();
      this._chars = { ...(c || { cards: [], roots: [] }), loading: job, t: c?.t || 0 };
      return job;
    },
    /** Load once, then repaint whatever shows cards. */
    charsEnsure() {
      if (this._chars && !this._chars.loading && this._chars.t) return true;
      if (!this._chars?.loading) this.charsLoad().then(() => { if (!this.root) return; if (this.tool === "chars") this.renderLeft(); this.renderInspector(); if (this.selRegion) this.renderTimeline?.(); });
      return false;
    },
    charCard(id) { return (this._chars?.cards || []).find((c) => c.id === id) || null; },
    charThumb(card) {
      if (!card?.preview) return null;
      const u = `/h3zero/chars/preview?id=${encodeURIComponent(card.id)}&s=${encodeURIComponent(card.sig || "")}`;
      return this.host.apiURL ? this.host.apiURL(u) : u;
    },
    charKinds(card) {
      const v = card.visual, out = [];
      if (v) out.push(v.kind === "image" ? "фото" : v.frames && card.sources?.some?.((s) => s.kind === "clip") ? "клип" : "стопка");
      if (card.audio) out.push(`голос ${card.audio.seconds} с`);
      return out.join(" · ");
    },
    charTokens(card) { return (card.visual?.tokens || 0) + (card.audio?.tokens || 0); },
    /** Where a click on a library card goes: the selected ✂ span, else the selected clip. */
    charTarget() {
      if (this.selRegion && this.region?.(this.selRegion)) return { region: this.selRegion };
      if (this.sel >= 0 && this.seg(this.sel)) return { seg: this.sel };
      return null;
    },
    charHolder(t, p = this.p) { return t?.region ? (p.regions || []).find((r) => r.id === t.region) : t?.seg != null ? p.segments[t.seg] : null; },
    charAdd(t, id) {
      const card = this.charCard(id);
      if (!t) return this.toast("Выберите клип или ✂ участок, к которому добавить карточку", true);
      if (!card) return this.toast("Карточки нет в библиотеке", true);
      const cur = this.charHolder(t);
      if (!cur) return;
      if ((cur.cards || []).some((e) => e.id === id)) return this.toast(`«${card.name}» уже в ${t.region ? "участке" : "отрезке"}`);
      if ((cur.cards || []).length >= C.MAX_CARDS) return this.toast(`Не больше ${C.MAX_CARDS} карточек`, true);
      if (!card.visual && t.region) this.toast("У участка голоса не используются — карточка только с голосом ничего не добавит", true);
      this.mutate((p) => {
        const x = this.charHolder(t, p); if (!x) return;
        x.cards = [...(x.cards || []), { id, w: 1, on: true, look: true, voice: true }];
        p.cards = { ...(p.cards || {}), [id]: C.cardSnap(card) };
      });
      this.toast(`${GLYPH[card.concept] || "◈"} «${card.name}» → ${t.region ? "участок" : `отрезок ${t.seg + 1}`}`);
    },
    charEdit(t, id, fn) {
      this.mutate((p) => { const x = this.charHolder(t, p); const e = x && (x.cards || []).find((c) => c.id === id); if (e) fn(e, x); }, { coalesce: "card:" + id });
    },
    charRemove(t, id) { this.mutate((p) => { const x = this.charHolder(t, p); if (x) x.cards = (x.cards || []).filter((e) => e.id !== id); }); },
    charUsedIn(id) {
      const out = [];
      this.p.segments.forEach((s, i) => { if ((s.cards || []).some((e) => e.id === id)) out.push(`отрезок ${i + 1}`); });
      (this.p.regions || []).forEach((r) => { if ((r.cards || []).some((e) => e.id === id)) out.push(`участок ${this.regionNo?.(r.id) || ""}`.trim()); });
      return out;
    },

    renderChars(L) {
      if (this.cf) return this.charForm(L);
      const lib = this._chars;
      if (!this.charsEnsure() && !lib?.cards?.length) { L.append(h("div", { class: "h3z-chars" }, h("div", { class: "h3z-note" }, "Загрузка библиотеки…"))); return; }
      const q = (this.charQ || "").trim().toLowerCase(), cf = this.charFilter || "all";
      const target = this.charTarget(), holder = this.charHolder(target);
      const usedHere = new Set((holder?.cards || []).map((e) => e.id));
      const cards = lib.cards.filter((c) => (cf === "all" || c.concept === cf)
        && (!q || [c.name, c.folder, c.subject_name, c.appearance].some((x) => String(x || "").toLowerCase().includes(q))));
      const search = h("input", { class: "h3z-in sm", type: "search", placeholder: "Поиск: имя, папка, описание", value: this.charQ || "" });
      search.oninput = () => { this.charQ = search.value; clearTimeout(this._charQT); this._charQT = setTimeout(() => this.renderLeft(), 200); };
      const present = new Set(lib.cards.map((c) => c.concept));
      const pills = h("div", { class: "h3z-pills" }, [["all", "Все"], ...C.CARD_CONCEPTS.filter((k) => present.has(k)).map((k) => [k, GLYPH[k] + " " + CN[k]])].map(([k, l]) =>
        h("div", { class: "h3z-pill" + (cf === k ? " on" : ""), onclick: () => { this.charFilter = k; this.renderLeft(); } }, l)));
      const groups = new Map();
      for (const c of cards) { const g = (c.root === "s" ? "" : (c.root_label || c.root) + " · ") + (c.folder || ""); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); }
      const grid = h("div", { class: "h3z-cgrid-wrap" });
      for (const [g, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (g) grid.append(h("div", { class: "h3z-cfold" }, "📁 " + g));
        grid.append(h("div", { class: "h3z-cgrid" }, list.map((c) => this.charTile(c, usedHere.has(c.id), target))));
      }
      const st = lib.err ? h("div", { class: "h3z-note err" }, "Библиотека недоступна: " + lib.err) : null;
      const pr = this.mpGet?.(this.p.settings.model_preset);
      const vaeNote = !lib.vae && !pr?.vae ? h("div", { class: "h3z-note" }, "Для «Создать» нужен VAE: выберите его в пресете моделей проекта или запустите генерацию один раз.") : null;
      L.append(h("div", { class: "h3z-chars" },
        h("div", { class: "h3z-row hd" }, h("div", { class: "h3z-lbl" }, "Персонажи", h("em", null, `${lib.cards.length} карт.`)), h("i", { class: "grow" }),
          h("button", { class: "h3z-btn sm", title: "Перечитать папку библиотеки", onclick: () => this.charsLoad(true).then(() => this.renderLeft()) }, "↻"),
          h("button", { class: "h3z-btn sm primary", title: "Новая карточка из ассетов проекта", onclick: () => this.charOpenForm() }, "+ Создать")),
        h("div", { class: "h3z-note tgt" }, target ? `Клик по карточке — добавить в ${target.region ? `✂ участок ${this.regionNo?.(target.region) || ""}` : `отрезок ${target.seg + 1}`}; или перетащите на клип.` : "Выберите клип или ✂ участок — клик по карточке добавит её туда; или перетащите на клип."),
        search, pills, st, vaeNote,
        cards.length ? grid : h("div", { class: "h3z-cempty" }, lib.cards.length ? "Ничего не найдено" : "Карточек пока нет. «+ Создать» — из фото, клипа и голоса ассетов проекта. Готовые RefMod-файлы (.safetensors) можно положить в models/refmods.")));
    },
    charTile(c, used, target) {
      const th = this.charThumb(c);
      const el = h("div", { class: "h3z-ccard" + (used ? " used" : ""), draggable: "true",
        title: `${c.name} · ${CN[c.concept]}${c.subject_name ? ` · субъект «${c.subject_name}»` : ""}\n${this.charKinds(c)} · ≈${this.charTokens(c)} ток. · ${c.mode === "compressed" ? "Compressed" : "Full"}${c.appearance ? "\n" + c.appearance : ""}\nКлик — добавить в выбранный клип / участок · перетащите на клип · правый клик — меню` },
        th ? h("img", { src: th, loading: "lazy", draggable: "false" }) : h("div", { class: "gl" }, GLYPH[c.concept] || "◈"),
        h("div", { class: "cc" }, GLYPH[c.concept] || "◈"),
        c.audio ? h("div", { class: "vo", title: `Голос ${c.audio.seconds} с` }, "🎙") : null,
        h("div", { class: "cap" }, h("b", null, c.name), h("span", null, `${this.charKinds(c)} · ${this.charTokens(c)} ток.`)));
      el.addEventListener("dragstart", (e) => { e.dataTransfer.setData("application/x-h3s-card", c.id); e.dataTransfer.effectAllowed = "copy"; });
      el.onclick = () => used && target ? this.charRemove(target, c.id) : this.charAdd(target, c.id);
      el.oncontextmenu = (e) => this.charMenu(e, c);
      return el;
    },
    charMenu(e, c) {
      const t = this.charTarget(), used = this.charUsedIn(c.id);
      this.openMenu(e, `${GLYPH[c.concept] || "◈"} ${c.name}`, [
        { label: t ? `+ Добавить в ${t.region ? "участок" : `отрезок ${t.seg + 1}`}` : "+ Добавить (выберите клип)", fn: () => this.charAdd(t, c.id), dis: !t },
        c.editable ? { label: "✎ Изменить имя / папку / описание", fn: () => this.charOpenForm(c) } : { why: c.bundle ? "Бандл — только чтение" : "Из models/refmods — только чтение" },
        c.editable ? { label: "✕ Удалить карточку", danger: true, fn: () => this.charDelete(c) } : null,
        used.length ? { why: "Используется: " + used.join(", ") } : null,
      ]);
    },
    async charDelete(c) {
      const used = this.charUsedIn(c.id);
      if (!confirm(`Удалить карточку «${c.name}» (файлы .safetensors и превью)?` + (used.length ? `\nОна используется: ${used.join(", ")} — там она станет недоступной.` : ""))) return;
      try { await this.host.call("/h3zero/chars/delete", { id: c.id }); this.toast(`Карточка «${c.name}» удалена`); }
      catch (err) { this.toast("Не удалось удалить: " + (err.message || err), true); }
      await this.charsLoad(true); this.renderLeft(); this.renderInspector();
    },

    // ------------------------------------------------------------------ chips in clip / span cards
    /** «Персонажи» block of a clip (t = {seg}) or a ✂ span (t = {region}). */
    charChips(t) {
      const x = this.charHolder(t); if (!x) return null;
      this.charsEnsure();
      const labels = t.region ? C.cardLabels(this.p, x, null, true, true) : C.cardLabels(this.p, x, t.seg);
      const byId = Object.fromEntries(labels.map((r) => [r.id, r]));
      const box = h("div", { class: "h3z-crefs" });
      let tok = 0;
      for (const e of x.cards || []) {
        const sn = this.p.cards?.[e.id] || {}, lib = this.charCard(e.id), r = byId[e.id];
        const gone = this._chars?.t && !this._chars.loading && !lib;
        const [copies] = C.cardCopies(e.w ?? 1);
        if (e.on !== false && r) tok += (sn.tokens || 0) * copies;
        const tags = r ? [...r.image.map((n) => `<Picture ${n}>`), ...r.video.map((n) => `<Video ${n}>`), ...r.audio.map((n) => `<Audio ${n}>`)] : [];
        const th = lib && this.charThumb(lib);
        const wsel = h("select", { class: "w", title: "Вес: 2–4 = карточка подаётся 2–4 раза (сильнее), < 1 — ослабленная копия" },
          WEIGHTS.map((w) => h("option", { value: w, selected: Math.abs((e.w ?? 1) - w) < 1e-6 }, w >= 1 ? `×${w}` : `${w}`)));
        wsel.onchange = () => wsel.blur() || this.charEdit(t, e.id, (c) => { c.w = Number(wsel.value); });
        wsel.addEventListener("click", (ev) => ev.stopPropagation());
        const tog = (on, glyph, title, fn) => h("span", { class: "tg2" + (on ? " on" : ""), title, onclick: (ev) => { ev.stopPropagation(); fn(); } }, glyph);
        const chip = h("div", { class: "h3z-cref" + (e.on === false ? " off" : "") + (gone ? " gone" : ""),
          title: `${sn.name || e.id} · ${CN[sn.concept] || ""}${gone ? "\n⚠ Нет в библиотеке — генерация остановится с ошибкой" : ""}${tags.length ? "\n" + tags.join(" ") + " · клик — вставить метку в промпт" : ""}` },
          th ? h("img", { src: th, draggable: "false" }) : h("span", { class: "gl" }, GLYPH[sn.concept] || "◈"),
          h("span", { class: "nm" }, sn.name || e.id),
          tags.length ? h("span", { class: "tg" }, tags[0] + (tags.length > 1 ? ` +${tags.length - 1}` : "")) : h("span", { class: "tg dim" }, e.on === false ? "выкл." : t.region && !sn.vkind ? "голос не в участке" : "—"),
          wsel,
          sn.vkind && sn.audio && !t.region ? [tog(e.look !== false, "👁", "Внешность (картинка / клип карточки)", () => this.charEdit(t, e.id, (c) => { c.look = c.look === false; })),
            tog(e.voice !== false, "🎙", "Голос карточки", () => this.charEdit(t, e.id, (c) => { c.voice = c.voice === false; }))] : null,
          tog(e.on !== false, e.on !== false ? "●" : "○", e.on !== false ? "Выключить (не подавать, но оставить)" : "Включить", () => this.charEdit(t, e.id, (c) => { c.on = c.on === false; })),
          h("span", { class: "x", title: "Убрать", onclick: (ev) => { ev.stopPropagation(); this.charRemove(t, e.id); } }, "✕"));
        chip.onclick = () => { if (tags.length && !t.region) this.insertTag(tags[0]); };
        box.append(chip);
      }
      const lib = this._chars?.cards || [], have = new Set((x.cards || []).map((e) => e.id));
      const pick = h("select", { class: "h3z-sel sm", title: "Добавить карточку из библиотеки «Персонажи» (или перетащите её сюда)" },
        h("option", { value: "" }, lib.length ? "+ персонаж" : this._chars?.loading ? "загрузка…" : "+ персонаж (библиотека пуста)"),
        lib.filter((c) => !have.has(c.id)).map((c) => h("option", { value: c.id }, `${GLYPH[c.concept] || "◈"} ${c.folder ? c.folder + "/" : ""}${c.name}`)));
      pick.onchange = () => { const v = pick.value; pick.blur(); if (v) this.charAdd(t, v); };
      box.append(pick);
      box.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("application/x-h3s-card")) { e.preventDefault(); box.classList.add("over"); } });
      box.addEventListener("dragleave", () => box.classList.remove("over"));
      box.addEventListener("drop", (e) => { const id = e.dataTransfer.getData("application/x-h3s-card"); box.classList.remove("over"); if (id) { e.preventDefault(); e.stopPropagation(); this.charAdd(t, id); } });
      const n = (x.cards || []).length;
      return h("div", { class: "h3z-cblock" }, h("div", { class: "h3z-lbl" }, "Персонажи", n ? h("em", null, `${n} / ${C.MAX_CARDS} · ≈${tok} ток.`) : h("em", null, "карточки из вкладки «Персонажи»")), box);
    },

    // ------------------------------------------------------------------ create / edit form
    charOpenForm(card = null) {
      if (card) this.cf = { ...blankForm(), edit: card.id, name: card.name, folder: card.folder || "", concept: card.concept,
        subject_name: card.subject_name || "", appearance: card.appearance || "", retained_attributes: card.retained_attributes || "", voice_description: card.voice_description || "", card };
      else this.cf = blankForm();
      this.tool = "chars"; this.renderTools(); this.renderLeft();
    },
    charCloseForm() { this.cf = null; this.cropM?.close?.(); this.renderLeft(); },
    /** Clip / voice sources: video assets, generated clips (and audio assets for a voice). */
    charSources(voice) {
      const out = [];
      for (const a of this.p.assets) {
        if (a.category === "video" && (!voice || a.has_audio)) out.push({ v: "a:" + a.id, label: "🎞 " + a.name, ref: ref(a), w: a.width, h: a.height, frames: a.frames, dur: a.duration, url: this.assetUrl(a) });
        if (voice && a.category === "audio") out.push({ v: "a:" + a.id, label: "♪ " + a.name, ref: ref(a), dur: a.duration, url: this.assetUrl(a) });
      }
      const [W, H] = C.resolution(this.p.settings);
      this.p.segments.forEach((s, i) => {
        const v = s.result?.video; if (!v?.filename) return;
        out.push({ v: "s:" + s.id, label: `▣ Отрезок ${i + 1}${s.name ? " · " + s.name : ""}`, ref: { file: v.filename, subfolder: v.subfolder || "", type: v.type || "output" },
          w: s.result.width || W, h: s.result.height || H, frames: s.result.frames || s.frames, dur: (s.result.frames || s.frames) / 24, url: this.host.url(v) });
      });
      return out;
    },
    /** Natural size of an image asset (async, cached); repaints the form once known. */
    charImgSize(a) {
      const m = this._imgSz || (this._imgSz = {}), k = a.file + "|" + a.subfolder;
      if (m[k]) return m[k] === "…" ? null : m[k];
      m[k] = "…";
      const im = new Image(); im.onload = () => { m[k] = [im.naturalWidth, im.naturalHeight]; if (this.cf && this.tool === "chars") this.charFormEst?.(); };
      im.onerror = () => { m[k] = [0, 0]; }; im.src = this.assetUrl(a);
      return null;
    },
    charPhotoAspect(i = 0) {
      const f = this.cf, ph = f?.photos[i]; const a = ph && this.p.assets.find((x) => x.id === ph.id); if (!a) return null;
      const sz = this.charImgSize(a); if (!sz || !sz[0]) return null;
      const c = ph.crop; return c ? (sz[0] * c[2]) / (sz[1] * c[3]) : sz[0] / sz[1];
    },
    charSpec() {
      const f = this.cf, srcs = this.charSources(false), vsrcs = this.charSources(true);
      const photos = f.photos.map((p) => { const a = this.p.assets.find((x) => x.id === p.id); return a && { asset: ref(a), crop: p.crop || null }; }).filter(Boolean);
      const cs = f.clip && srcs.find((s) => s.v === f.clip.src), vs = f.voice && vsrcs.find((s) => s.v === f.voice.src);
      return { name: f.name.trim(), folder: f.folder.trim(), concept: f.concept, mode: f.mode, res: f.res, grid: f.grid,
        subject_name: f.subject_name.trim(), appearance: f.appearance.trim(), retained_attributes: f.retained_attributes.trim(), voice_description: f.voice_description.trim(),
        photos, clip: cs ? { asset: cs.ref, start: f.clip.start, frames: C.snapClipFrames(f.clip.frames), crop: null } : null,
        voice: vs ? { asset: vs.ref, start: f.voice.start, end: f.voice.end || null } : null };
    },
    charEstimate() {
      const f = this.cf; if (!f) return null;
      const sizes = [];
      for (let i = 0; i < f.photos.length; i++) {
        const a = this.p.assets.find((x) => x.id === f.photos[i].id); const sz = a && this.charImgSize(a); if (!sz) return null;
        const c = f.photos[i].crop; sizes.push(c ? [Math.max(2, Math.round(sz[0] * c[2])), Math.max(2, Math.round(sz[1] * c[3]))] : sz);
      }
      const cs = f.clip && this.charSources(false).find((s) => s.v === f.clip.src);
      if (cs) sizes.push([cs.w || 0, cs.h || 0]);
      const spec = { res: f.res, mode: f.mode, grid: f.grid, photos: f.photos, clip: cs ? { frames: f.clip.frames } : null };
      const e = sizes.length && sizes[0][0] ? C.cardEstimate(spec, sizes) : { visual_tokens: 0 };
      const vsec = f.voice ? Math.max(0, (f.voice.end || this.charVoiceDur() || 0) - (f.voice.start || 0)) : 0;
      return { ...e, voice_tokens: Math.round(vsec * C.CARD_AUDIO_TOKENS_PER_SEC), voice_sec: vsec };
    },
    charVoiceDur() { const f = this.cf; const s = f?.voice && this.charSources(true).find((x) => x.v === f.voice.src); return s?.dur || 0; },
    charFormEst() {
      const el = this.$.cfEst; if (!el) return;
      const e = this.charEstimate();
      el.textContent = !e ? "Считаю размеры…" : (e.visual_tokens ? `Внешность: кадр ${e.canvas[0]}×${e.canvas[1]} → латент ${e.latent.join("×")} · ≈${e.visual_tokens} ток.` : "Внешность: нет фото и клипа")
        + (e?.voice_sec ? ` · голос ${e.voice_sec.toFixed(1)} с ≈${e.voice_tokens} ток.` : "")
        + (e ? ` · всего ≈${(e.visual_tokens || 0) + (e.voice_tokens || 0)} ток. на копию` : "");
    },
    charForm(L) {
      const f = this.cf, edit = !!f.edit;
      const re = () => this.renderLeft();
      const txt = (key, ph, area = false, title = "") => {
        const e = h(area ? "textarea" : "input", { class: area ? "h3z-ta sm" : "h3z-in sm", placeholder: ph, title, rows: area ? 2 : undefined });
        e.value = f[key] || ""; e.oninput = () => { f[key] = e.value; if (key === "subject_name") e.classList.toggle("bad", !!e.value.trim() && !SUBJECT_RE.test(e.value.trim())); };
        return e;
      };
      const folders = [...new Set((this._chars?.cards || []).filter((c) => c.root === "s").map((c) => c.folder).filter(Boolean))];
      const folder = txt("folder", "папка (необязательно)"); folder.setAttribute("list", "h3z-cfolders");
      const concept = h("select", { class: "h3z-sel sm" }, C.CARD_CONCEPTS.map((k) => h("option", { value: k, selected: f.concept === k }, `${GLYPH[k]} ${CN[k]}`)));
      concept.onchange = () => { f.concept = concept.value; };
      const parts = [
        h("div", { class: "h3z-row hd" }, h("div", { class: "h3z-lbl" }, edit ? "Изменить карточку" : "Новая карточка"), h("i", { class: "grow" }),
          h("button", { class: "h3z-btn sm", onclick: () => this.charCloseForm() }, "← К библиотеке")),
        h("div", { class: "h3z-grid2" }, this.field("Имя", txt("name", "Анна")), this.field("Тип", concept)),
        this.field("Папка", h("div", null, folder, h("datalist", { id: "h3z-cfolders" }, folders.map((x) => h("option", { value: x }))))),
      ];
      if (!edit) {
        const seg = (val, opts, set) => h("div", { class: "h3z-cseg" }, opts.map(([v, l, t]) => h("div", { class: "it" + (val === v ? " on" : ""), title: t, onclick: () => { set(v); re(); } }, l)));
        parts.push(h("div", { class: "h3z-grid2" },
          this.field("Режим", seg(f.mode, [["full", "Full", "Все токены латента: точнее, дороже"], ["compressed", "Compressed", "Латент сжат до сетки: дешевле, общий образ"]], (v) => { f.mode = v; })),
          this.field("Кадр", (() => { const s = h("select", { class: "h3z-sel sm", title: "Короткая сторона кадра карточки (не увеличивается)" }, RES.map((r) => h("option", { value: r, selected: f.res === r }, `${r} px`))); s.onchange = () => { f.res = Number(s.value); this.charFormEst(); }; return s; })())));
        if (f.mode === "compressed") {
          const g = h("select", { class: "h3z-sel sm" }, [8, 12, 16, 24, 32].map((n) => h("option", { value: n, selected: f.grid === n }, `${n} по длинной стороне`)));
          g.onchange = () => { f.grid = Number(g.value); this.charFormEst(); };
          parts.push(this.field("Сетка", g));
        }
        parts.push(this.charPhotosBlock(), this.charClipBlock(), this.charVoiceBlock());
      } else {
        const c = f.card || {};
        parts.push(h("div", { class: "h3z-note" }, `Источники не меняются (${this.charKinds(c) || "—"}, ${c.mode === "compressed" ? "Compressed" : "Full"}) — для других фото создайте новую карточку.`));
      }
      parts.push(h("div", { class: "h3z-lbl" }, "Описание", h("em", null, "по-английски — идёт в промпт")),
        this.field("Имя субъекта", txt("subject_name", "Anna — одно слово", false, "Как субъект зовётся в промпте; одно слово")),
        this.field("Внешность", txt("appearance", "auburn hair, green coat…", true)),
        this.field("Сохранять", txt("retained_attributes", "freckles, scar over the left brow…", true, "Что модель должна сохранить")),
        this.field("Голос", txt("voice_description", "low husky voice…", true)));
      const est = this.$.cfEst = h("div", { class: "h3z-note est" });
      const st = this._chars || {}, pr = this.mpGet?.(this.p.settings.model_preset);
      const noVae = !edit && !st.vae && !pr?.vae && (f.photos.length || f.clip);
      const noAvae = !edit && !st.audio_vae && !pr?.audio_vae && f.voice;
      const go = h("button", { class: "h3z-btn primary" + (f.busy ? " dis" : ""), onclick: () => this.charSubmit() }, f.busy ? (edit ? "Сохраняю…" : "Кодирую…") : edit ? "Сохранить" : "◈ Создать карточку");
      parts.push(edit ? null : est,
        noVae ? h("div", { class: "h3z-note err" }, "Нет VAE: выберите VAE в пресете моделей проекта или запустите генерацию один раз.") : null,
        noAvae ? h("div", { class: "h3z-note err" }, "Нет аудио-VAE для голоса: выберите его в пресете моделей проекта или запустите генерацию.") : null,
        h("div", { class: "h3z-row ft" }, go, h("button", { class: "h3z-btn", onclick: () => this.charCloseForm() }, "Отмена")));
      L.append(h("div", { class: "h3z-chars form" + (f.busy ? " busy" : "") }, parts));
      if (!edit) this.charFormEst();
    },
    charPhotosBlock() {
      const f = this.cf, re = () => this.renderLeft();
      const list = h("div", { class: "h3z-cphotos" });
      f.photos.forEach((p, i) => {
        const a = this.p.assets.find((x) => x.id === p.id); if (!a) return;
        const mv = (d) => { const j = i + d; if (j < 0 || j >= f.photos.length) return; const arr = f.photos; [arr[i], arr[j]] = [arr[j], arr[i]];
          if (i === 0 || j === 0) { let n = 0; arr.forEach((q, k) => { if (k && q.crop) { q.crop = null; n++; } }); if (n) this.toast("Первое фото сменилось — кадрирование остальных сброшено (их пропорции задаёт первое)"); } re(); };
        list.append(h("div", { class: "ph" + (i ? "" : " first"), title: a.name },
          h("img", { src: this.assetUrl(a), draggable: "false" }),
          h("span", { class: "n", title: i ? "" : "Первое фото задаёт пропорции карточки" }, i ? String(i + 1) : "1 ⤢"),
          p.crop ? h("span", { class: "cr", title: "Кадрировано" }, "✂") : null,
          h("div", { class: "bt" },
            h("span", { title: "Раньше", onclick: () => mv(-1) }, "←"), h("span", { title: "Позже", onclick: () => mv(1) }, "→"),
            h("span", { title: i ? "Кадрировать (пропорции первого фото)" : "Кадрировать (свободно — задаёт пропорции карточки)", onclick: () => this.charCrop(i) }, "✂"),
            h("span", { title: "Убрать", onclick: () => { f.photos.splice(i, 1); if (i === 0) f.photos.forEach((q) => { q.crop = null; }); re(); } }, "✕"))));
      });
      const imgs = this.p.assets.filter((a) => a.category !== "audio" && a.category !== "video" && !f.photos.some((p) => p.id === a.id));
      const pick = h("select", { class: "h3z-sel sm" }, h("option", { value: "" }, imgs.length ? "+ фото из ассетов" : "нет картинок в ассетах"), imgs.map((a) => h("option", { value: a.id }, a.name)));
      pick.onchange = () => { if (pick.value) { f.photos.push({ id: pick.value, crop: null }); re(); } };
      list.append(pick);
      list.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("application/x-h3s-asset")) { e.preventDefault(); list.classList.add("over"); } });
      list.addEventListener("dragleave", () => list.classList.remove("over"));
      list.addEventListener("drop", (e) => { list.classList.remove("over"); const id = e.dataTransfer.getData("application/x-h3s-asset"); const a = this.p.assets.find((x) => x.id === id);
        if (a && a.category !== "audio" && a.category !== "video") { e.preventDefault(); if (!f.photos.some((p) => p.id === id)) { f.photos.push({ id, crop: null }); re(); } } });
      return h("div", null, h("div", { class: "h3z-lbl" }, "Фото", h("em", null, f.photos.length ? `${f.photos.length} · первое задаёт пропорции` : "перетащите картинки из «Ассетов»")), list);
    },
    charClipBlock() {
      const f = this.cf, re = () => this.renderLeft(), srcs = this.charSources(false);
      const sel = h("select", { class: "h3z-sel sm" }, h("option", { value: "" }, srcs.length ? "— без клипа —" : "нет видео / готовых клипов"), srcs.map((s) => h("option", { value: s.v, selected: f.clip?.src === s.v }, s.label)));
      sel.onchange = () => { f.clip = sel.value ? { src: sel.value, start: 0, frames: 22 } : null; re(); };
      const out = [sel];
      if (f.clip) {
        const s = srcs.find((x) => x.v === f.clip.src), maxF = Math.max(1, s?.frames || 9999);
        const st = h("input", { class: "h3z-in sm", type: "number", min: 0, max: Math.max(0, maxF - 1), value: f.clip.start, title: "Первый кадр" });
        const nf = h("input", { class: "h3z-in sm", type: "number", min: 1, max: 225, value: f.clip.frames, title: "Кадров: 1–4 как есть, иначе 5, 22, 39, 56… (правило 17 кадров)" });
        const note = h("span", { class: "h3z-note" });
        const upd = () => {
          f.clip.start = clamp(Math.trunc(Number(st.value) || 0), 0, Math.max(0, maxF - 1));
          f.clip.frames = clamp(Math.trunc(Number(nf.value) || 1), 1, Math.min(225, maxF - f.clip.start));
          const n = C.snapClipFrames(f.clip.frames);
          note.textContent = `→ ${n} кадр.${n !== f.clip.frames ? ` (кратно 17 + 5: ${f.clip.frames} → ${n})` : ""} · ${(n / 24).toFixed(2)} с`;
          this.charFormEst();
        };
        st.onchange = upd; nf.onchange = () => { upd(); nf.value = C.snapClipFrames(f.clip.frames); f.clip.frames = Number(nf.value); };
        upd();
        out.push(h("div", { class: "h3z-grid2" }, this.field("С кадра", st), this.field("Кадров", nf)), note);
      }
      return h("div", null, h("div", { class: "h3z-lbl" }, "Клип", h("em", null, "необязательно · движение / мимика")), out);
    },
    charVoiceBlock() {
      const f = this.cf, re = () => this.renderLeft(), srcs = this.charSources(true);
      const sel = h("select", { class: "h3z-sel sm" }, h("option", { value: "" }, srcs.length ? "— без голоса —" : "нет аудио / видео со звуком"), srcs.map((s) => h("option", { value: s.v, selected: f.voice?.src === s.v }, s.label)));
      sel.onchange = () => { const s = srcs.find((x) => x.v === sel.value); f.voice = s ? { src: s.v, start: 0, end: Math.round(Math.min(s.dur || 8, 8) * 10) / 10 || null } : null; re(); };
      const out = [sel];
      if (f.voice) {
        const s = srcs.find((x) => x.v === f.voice.src), dur = s?.dur || 0;
        const a = h("input", { class: "h3z-in sm", type: "number", step: 0.1, min: 0, value: f.voice.start, title: "Начало, с" });
        const b = h("input", { class: "h3z-in sm", type: "number", step: 0.1, min: 0, value: f.voice.end ?? "", placeholder: dur ? dur.toFixed(1) : "до конца", title: "Конец, с (пусто — до конца)" });
        const upd = () => { f.voice.start = Math.max(0, Number(a.value) || 0); f.voice.end = b.value === "" ? null : Math.max(f.voice.start + 0.5, Number(b.value) || 0); this.charFormEst(); };
        a.onchange = upd; b.onchange = upd;
        const play = h("button", { class: "h3z-btn sm", title: "Прослушать обрезку" }, "▶");
        play.onclick = () => {
          this._cfAudio?.pause?.();
          if (play.textContent === "■") { play.textContent = "▶"; return; }
          const au = this._cfAudio = new Audio(s.url); au.currentTime = f.voice.start; play.textContent = "■";
          au.ontimeupdate = () => { if (f.voice?.end && au.currentTime >= f.voice.end) { au.pause(); play.textContent = "▶"; } };
          au.onended = () => { play.textContent = "▶"; };
          au.play().catch(() => { play.textContent = "▶"; });
        };
        out.push(h("div", { class: "h3z-grid3" }, this.field("С, с", a), this.field("По, с", b), this.field("", play)));
      }
      return h("div", null, h("div", { class: "h3z-lbl" }, "Голос", h("em", null, "≈80 ток./с · 3–10 с чистой речи")), out);
    },
    async charSubmit() {
      const f = this.cf; if (!f || f.busy) return;
      const name = f.name.trim(), sub = f.subject_name.trim();
      if (!name) return this.toast("Дайте карточке имя", true);
      if (sub && !SUBJECT_RE.test(sub)) return this.toast("Имя субъекта — одно слово (буквы, цифры, - и ')", true);
      f.busy = true; this.renderLeft();
      try {
        if (f.edit) {
          const old = f.edit;
          const fields = { name, folder: f.folder.trim(), concept: f.concept, subject_name: sub, appearance: f.appearance, retained_attributes: f.retained_attributes, voice_description: f.voice_description };
          const d = await this.host.call("/h3zero/chars/update", { id: old, fields });
          await this.charsLoad(true);
          const card = d?.card || null;
          if (card) this.charRelink(old, card);
          this.toast(`Карточка «${name}» сохранена`);
        } else {
          const spec = this.charSpec();
          if (!spec.photos.length && !spec.clip && !spec.voice) { f.busy = false; this.renderLeft(); return this.toast("Добавьте фото, клип или голос", true); }
          const pr = this.mpGet?.(this.p.settings.model_preset);
          const d = await this.host.call("/h3zero/chars/create", { spec, vae: pr?.vae || "", audio_vae: pr?.audio_vae || "" });
          await this.charsLoad(true);
          this.toast(`◈ Карточка «${d?.card?.name || name}» создана`);
        }
        this.cf = null;
      } catch (err) {
        f.busy = false; this.toast((f.edit ? "Не сохранилось: " : "Не создалась: ") + (err.message || err), true);
      }
      this.renderLeft(); this.renderInspector();
    },
    /** After a rename / move the card id changes: the clips and spans of this project follow it. */
    charRelink(old, card) {
      const touched = this.charUsedIn(old).length || this.p.cards?.[old];
      if (!touched) return;
      this.mutate((p) => {
        for (const x of [...p.segments, ...(p.regions || [])]) for (const e of x.cards || []) if (e.id === old) e.id = card.id;
        const cs = { ...(p.cards || {}) }; delete cs[old]; cs[card.id] = C.cardSnap(card); p.cards = cs;
      });
    },

    // ------------------------------------------------------------------ crop modal
    charCrop(i) {
      const f = this.cf, p = f?.photos[i]; const a = p && this.p.assets.find((x) => x.id === p.id); if (!a) return;
      const aspect = i ? this.charPhotoAspect(0) : null;
      if (i && !aspect) return this.toast("Подождите — размер первого фото ещё не известен", true);
      const img = h("img", { src: this.assetUrl(a), draggable: "false" });
      const box = h("div", { class: "rect" }, h("i", { class: "hd" }));
      const stage = h("div", { class: "stage" }, img, box);
      const st = { i, aspect, r: p.crop ? [...p.crop] : null, img, box };
      const apply = () => { f.photos[i].crop = st.r && !(st.r[0] <= 0.001 && st.r[1] <= 0.001 && st.r[2] >= 0.999 && st.r[3] >= 0.999) ? st.r.map((v) => Math.round(v * 10000) / 10000) : null;
        if (i === 0) { let n = 0; f.photos.forEach((q, k) => { if (k && q.crop) { q.crop = null; n++; } }); if (n) this.toast("Пропорции первого фото сменились — кадрирование остальных сброшено"); }
        close(); this.renderLeft(); };
      const close = () => { modal.remove(); this.cropM = null; };
      const reset = () => { st.r = this.charCropFit(st, null); paint(); };
      const paint = () => {
        const W = img.clientWidth, H = img.clientHeight; if (!W || !st.r) return;
        Object.assign(box.style, { left: img.offsetLeft + st.r[0] * W + "px", top: img.offsetTop + st.r[1] * H + "px", width: st.r[2] * W + "px", height: st.r[3] * H + "px" });
      };
      img.onload = () => { if (!st.r) st.r = this.charCropFit(st, null); else if (aspect) st.r = this.charCropFit(st, st.r); paint(); };
      let drag = null;
      stage.addEventListener("pointerdown", (e) => {
        if (!st.r) return; e.preventDefault(); stage.setPointerCapture(e.pointerId);
        drag = { x: e.clientX, y: e.clientY, r: [...st.r], res: e.target.classList.contains("hd") };
      });
      stage.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const W = img.clientWidth, H = img.clientHeight, dx = (e.clientX - drag.x) / W, dy = (e.clientY - drag.y) / H, r = [...drag.r];
        if (drag.res) {
          let w = clamp(r[2] + dx, 0.05, 1 - r[0]), hh = clamp(r[3] + dy, 0.05, 1 - r[1]);
          if (aspect) { const k = (img.naturalWidth / img.naturalHeight) / aspect; hh = w * k; if (r[1] + hh > 1) { hh = 1 - r[1]; w = hh / k; } }
          r[2] = w; r[3] = hh;
        } else { r[0] = clamp(r[0] + dx, 0, 1 - r[2]); r[1] = clamp(r[1] + dy, 0, 1 - r[3]); }
        st.r = r; paint();
      });
      stage.addEventListener("pointerup", () => { drag = null; });
      const info = h("div", { class: "h3z-note" }, aspect ? `Пропорции заданы первым фото (${aspect.toFixed(3)}). Тяните рамку, угол — размер.` : "Первое фото: рамка свободная и задаёт пропорции карточки. Тяните рамку, угол — размер.");
      const modal = h("div", { class: "h3z-modal" }, h("div", { class: "h3z-ccrop h3z-glass" },
        h("div", { class: "h3z-lbl" }, `Кадрирование · фото ${i + 1} · ${a.name}`), stage, info,
        h("div", { class: "h3z-row" }, h("button", { class: "h3z-btn sm", onclick: reset }, "↺ Всё фото"), h("i", { class: "grow" }),
          h("button", { class: "h3z-btn primary sm", title: "Enter", onclick: apply }, "Применить"), h("button", { class: "h3z-btn sm", title: "Esc", onclick: close }, "Отмена")),
        h("div", { class: "hint" }, "Enter — применить · Esc — отмена")));
      modal.addEventListener("pointerdown", (e) => { if (e.target === modal) close(); });
      this.cropM = { apply, close, st };
      this.root.append(modal);
    },
    /** Largest centred box of the locked aspect (or the whole picture), or `r` fitted to the aspect. */
    charCropFit(st, r) {
      const iw = st.img.naturalWidth || 1, ih = st.img.naturalHeight || 1;
      if (!st.aspect) return r || [0, 0, 1, 1];
      const k = (iw / ih) / st.aspect;   // h_n = w_n * k
      let w = r ? r[2] : 1, hh = w * k;
      if (hh > (r ? 1 - r[1] : 1)) { hh = r ? 1 - r[1] : 1; w = hh / k; }
      if (w > 1) { w = 1; hh = k; }
      return r ? [clamp(r[0], 0, 1 - w), clamp(r[1], 0, 1 - hh), w, hh] : [(1 - w) / 2, (1 - hh) / 2, w, hh];
    },
    cropKey(e) {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "") && !e.target.classList?.contains("h3z-sink");   // the editor's focus sink is a read-only input
      if (e.key === "Escape") { e.preventDefault(); this.cropM.close(); }
      else if (e.key === "Enter" && !typing) { e.preventDefault(); this.cropM.apply(); }
    },
  });
}

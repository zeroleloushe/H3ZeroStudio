// «Персонажи»: a library of pre-encoded reference cards (character / location / outfit / style / voice) in the
// RefMod .safetensors format (MiniMaxH3Mod, MIT), stored in our library folder with a thumbnail.
// Left rail tab: library grid (search, type filter, folders), create / edit / delete. A card is built from
// project assets: photos (reorder, crop — the first one sets the aspect), an optional clip (17-frame rule) and an
// optional voice sample (trim, ~80 tokens/s). Full = every latent token, Compressed = pooled to a small grid.
// Applying: drop a card on a clip / into a clip card or a ✂ span card — the whole set goes in after the plain
// refs (C.cardLabels numbers <Picture N> / <Video N> / <Audio N>); weight > 1 = copies, < 1 = weaker; on / off.
// Backend: /h3zero/chars (h3s_chars.py, routes.py).
import { parseSections, promptTemplate } from "./h3s_prompted.js";
import { T } from "./h3s_i18n.js";

export function installChars(Editor, { C, h, ICON }) {
  const CN = C.CARD_CONCEPT_NAMES;
  const GLYPH = { identity: "👤", background: "🏞", clothing: "👗", style: "🎨", pose_motion: "🏃", voice: "🎙", generic: "◈" };
  const WEIGHTS = [0.25, 0.5, 0.75, 1, 2, 3, 4];
  const RES = [512, 768, 1024];
  const SUBJECT_RE = /^[\p{L}\p{N}_\-']+$/u;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ref = (a) => a && { file: a.file, subfolder: a.subfolder || "", type: a.type || "input" };
  const IMG_RE = /^image\//, VID_RE = /^video\//, AUD_RE = /^audio\//;
  const blankForm = () => ({ uploads: [],  edit: null, name: "", folder: "", concept: "identity", mode: "full", res: 768, grid: 16,
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
        this.charFollowAliases();
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
      if (v) out.push(v.kind === "image" ? T("фото") : v.frames && card.sources?.some?.((s) => s.kind === "clip") ? T("клип") : T("стопка"));
      if (card.audio) out.push(T("голос {0} с", card.audio.seconds));
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
      if (!t) return this.toast(T("Выберите клип или ✂ участок, к которому добавить карточку"), true);
      if (!card) return this.toast(T("Карточки нет в библиотеке"), true);
      const cur = this.charHolder(t);
      if (!cur) return;
      if ((cur.cards || []).some((e) => e.id === id)) return this.toast(T("«{0}» уже в {1}", card.name, t.region ? T("участке") : T("отрезке")));
      if ((cur.cards || []).length >= C.MAX_CARDS) return this.toast(T("Не больше {0} карточек", C.MAX_CARDS), true);
      if (!card.visual && t.region) this.toast(T("У участка голоса не используются — карточка только с голосом ничего не добавит"), true);
      this.mutate((p) => {
        const x = this.charHolder(t, p); if (!x) return;
        x.cards = [...(x.cards || []), { id, w: 1, on: true, look: true, voice: true }];
        p.cards = { ...(p.cards || {}), [id]: C.cardSnap(card) };
      });
      this.toast(`${GLYPH[card.concept] || "◈"} «${card.name}» → ${t.region ? T("участок") : T("отрезок {0}", t.seg + 1)}`);
    },
    charEdit(t, id, fn) {
      this.mutate((p) => { const x = this.charHolder(t, p); const e = x && (x.cards || []).find((c) => c.id === id); if (e) fn(e, x); }, { coalesce: "card:" + id });
    },
    charRemove(t, id) { this.mutate((p) => { const x = this.charHolder(t, p); if (x) x.cards = (x.cards || []).filter((e) => e.id !== id); }); },
    charUsedIn(id) {
      const out = [];
      this.p.segments.forEach((s, i) => { if ((s.cards || []).some((e) => e.id === id)) out.push(T("отрезок {0}", i + 1)); });
      (this.p.regions || []).forEach((r) => { if ((r.cards || []).some((e) => e.id === id)) out.push(T("участок {0}", this.regionNo?.(r.id) || "").trim()); });
      return out;
    },

    renderChars(L) {
      if (this.cf) return this.charForm(L);
      const lib = this._chars;
      if (!this.charsEnsure() && !lib?.cards?.length) { L.append(h("div", { class: "h3z-chars" }, h("div", { class: "h3z-note" }, T("Загрузка библиотеки…")))); return; }
      const q = (this.charQ || "").trim().toLowerCase(), cf = this.charFilter || "all";
      const target = this.charTarget(), holder = this.charHolder(target);
      const usedHere = new Set((holder?.cards || []).map((e) => e.id));
      const cards = lib.cards.filter((c) => (cf === "all" || c.concept === cf)
        && (!q || [c.name, c.folder, c.subject_name, c.appearance].some((x) => String(x || "").toLowerCase().includes(q))));
      const search = h("input", { class: "h3z-in sm", type: "search", placeholder: T("Поиск: имя, папка, описание"), value: this.charQ || "" });
      search.oninput = () => { this.charQ = search.value; clearTimeout(this._charQT); this._charQT = setTimeout(() => this.renderLeft(), 200); };
      const present = new Set(lib.cards.map((c) => c.concept));
      const pills = h("div", { class: "h3z-pills" }, [["all", T("Все")], ...C.CARD_CONCEPTS.filter((k) => present.has(k)).map((k) => [k, GLYPH[k] + " " + CN[k]])].map(([k, l]) =>
        h("div", { class: "h3z-pill" + (cf === k ? " on" : ""), onclick: () => { this.charFilter = k; this.renderLeft(); } }, l)));
      const groups = new Map();
      for (const c of cards) { const g = (c.root === "s" ? "" : (c.root_label || c.root) + " · ") + (c.folder || ""); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); }
      const grid = h("div", { class: "h3z-cgrid-wrap" });
      for (const [g, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (g) grid.append(h("div", { class: "h3z-cfold" }, "📁 " + g));
        grid.append(h("div", { class: "h3z-cgrid" }, list.map((c) => this.charTile(c, usedHere.has(c.id), target))));
      }
      const st = lib.err ? h("div", { class: "h3z-note err" }, T("Библиотека недоступна: ") + lib.err) : null;
      const pr = this.mpGet?.(this.p.settings.model_preset);
      const vaeNote = !lib.vae && !pr?.vae && !this.host.inputLinked?.("vae") ? h("div", { class: "h3z-note" }, T("Для «Создать» нужен VAE: подключите его проводом к узлу студии или выберите в пресете моделей проекта.")) : null;
      L.append(h("div", { class: "h3z-chars" },
        h("div", { class: "h3z-row hd" }, h("div", { class: "h3z-lbl" }, T("Персонажи"), h("em", null, T("{0} карт.", lib.cards.length))), h("i", { class: "grow" }),
          h("button", { class: "h3z-btn sm", title: T("Перечитать папку библиотеки"), onclick: () => this.charsLoad(true).then(() => this.renderLeft()) }, "↻"),
          h("button", { class: "h3z-btn sm primary", title: T("Новая карточка из ассетов проекта"), onclick: () => this.charOpenForm() }, T("+ Создать"))),
        h("div", { class: "h3z-note tgt" }, target ? T("Клик по карточке — добавить в {0}; или перетащите на клип.", target.region ? T("✂ участок {0}", this.regionNo?.(target.region) || "") : T("отрезок {0}", target.seg + 1)) : T("Выберите клип или ✂ участок — клик по карточке добавит её туда; или перетащите на клип.")),
        search, pills, st, vaeNote,
        cards.length ? grid : h("div", { class: "h3z-cempty" }, lib.cards.length ? T("Ничего не найдено") : T("Карточек пока нет. «+ Создать» — из фото, клипа и голоса ассетов проекта. Готовые RefMod-файлы (.safetensors) можно положить в models/refmods."))));
    },
    charTile(c, used, target) {
      const th = this.charThumb(c);
      const el = h("div", { class: "h3z-ccard" + (used ? " used" : ""), draggable: "true",
        title: T("{0} · {1}{2}\n{3} · ≈{4} ток. · {5}{6}\nКлик — добавить в выбранный клип / участок · перетащите на клип · правый клик — меню", c.name, CN[c.concept], c.subject_name ? T(" · субъект «{0}»", c.subject_name) : "", this.charKinds(c), this.charTokens(c), c.mode === "compressed" ? "Compressed" : "Full", c.appearance ? "\n" + c.appearance : "") },
        th ? h("img", { src: th, loading: "lazy", draggable: "false" }) : h("div", { class: "gl" }, GLYPH[c.concept] || "◈"),
        h("div", { class: "cc" }, GLYPH[c.concept] || "◈"),
        c.audio ? h("div", { class: "vo", title: T("Голос {0} с", c.audio.seconds) }, "🎙") : null,
        h("div", { class: "cap" }, h("b", null, c.name), h("span", null, T("{0} · {1} ток.", this.charKinds(c), this.charTokens(c)))));
      el.addEventListener("dragstart", (e) => { e.dataTransfer.setData("application/x-h3s-card", c.id); e.dataTransfer.effectAllowed = "copy"; });
      el.onclick = () => used && target ? this.charRemove(target, c.id) : this.charAdd(target, c.id);
      el.oncontextmenu = (e) => this.charMenu(e, c);
      return el;
    },
    charMenu(e, c) {
      const t = this.charTarget(), used = this.charUsedIn(c.id);
      this.openMenu(e, `${GLYPH[c.concept] || "◈"} ${c.name}`, [
        { label: t ? T("+ Добавить в {0}", t.region ? T("участок") : T("отрезок {0}", t.seg + 1)) : T("+ Добавить (выберите клип)"), fn: () => this.charAdd(t, c.id), dis: !t },
        c.editable ? { label: T("✎ Изменить имя / папку / описание"), fn: () => this.charOpenForm(c) } : { why: c.bundle ? T("Бандл — только чтение") : T("Из models/refmods — только чтение") },
        c.editable ? { label: T("✕ Удалить карточку"), danger: true, fn: () => this.charDelete(c) } : null,
        used.length ? { why: T("Используется: ") + used.join(", ") } : null,
      ]);
    },
    async charDelete(c) {
      const used = this.charUsedIn(c.id);
      if (!confirm(T("Удалить карточку «{0}» (файлы .safetensors и превью)?", c.name) + (used.length ? T("\nОна используется: {0} — там она станет недоступной.", used.join(", ")) : ""))) return;
      try { await this.host.call("/h3zero/chars/delete", { id: c.id }); this.toast(T("Карточка «{0}» удалена", c.name)); }
      catch (err) { this.toast(T("Не удалось удалить: ") + (err.message || err), true); }
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
        const wsel = h("select", { class: "w", title: T("Вес: 2–4 = карточка подаётся 2–4 раза (сильнее), < 1 — ослабленная копия") },
          WEIGHTS.map((w) => h("option", { value: w, selected: Math.abs((e.w ?? 1) - w) < 1e-6 }, w >= 1 ? `×${w}` : `${w}`)));
        wsel.onchange = () => wsel.blur() || this.charEdit(t, e.id, (c) => { c.w = Number(wsel.value); });
        wsel.addEventListener("click", (ev) => ev.stopPropagation());
        const tog = (on, glyph, title, fn) => h("span", { class: "tg2" + (on ? " on" : ""), title, onclick: (ev) => { ev.stopPropagation(); fn(); } }, glyph);
        const chip = h("div", { class: "h3z-cref" + (e.on === false ? " off" : "") + (gone ? " gone" : ""),
          title: `${sn.name || e.id} · ${CN[sn.concept] || ""}${gone ? T("\n⚠ Нет в библиотеке — генерация остановится с ошибкой") : ""}${tags.length ? "\n" + tags.join(" ") + T(" · клик — вставить метку в промпт") : ""}` },
          th ? h("img", { src: th, draggable: "false" }) : h("span", { class: "gl" }, GLYPH[sn.concept] || "◈"),
          h("span", { class: "nm" }, sn.name || e.id),
          tags.length ? h("span", { class: "tg" }, tags[0] + (tags.length > 1 ? ` +${tags.length - 1}` : "")) : h("span", { class: "tg dim" }, e.on === false ? T("выкл.") : t.region && !sn.vkind ? T("голос не в участке") : "—"),
          wsel,
          sn.vkind && sn.audio && !t.region ? [tog(e.look !== false, "👁", T("Внешность (картинка / клип карточки)"), () => this.charEdit(t, e.id, (c) => { c.look = c.look === false; })),
            tog(e.voice !== false, "🎙", T("Голос карточки"), () => this.charEdit(t, e.id, (c) => { c.voice = c.voice === false; }))] : null,
          tog(e.on !== false, e.on !== false ? "●" : "○", e.on !== false ? T("Выключить (не подавать, но оставить)") : T("Включить"), () => this.charEdit(t, e.id, (c) => { c.on = c.on === false; })),
          h("span", { class: "x", title: T("Убрать"), onclick: (ev) => { ev.stopPropagation(); this.charRemove(t, e.id); } }, "✕"));
        chip.onclick = () => { if (tags.length && !t.region) this.insertTag(tags[0]); };
        box.append(chip);
      }
      const lib = this._chars?.cards || [], have = new Set((x.cards || []).map((e) => e.id));
      const pick = h("select", { class: "h3z-sel sm", title: T("Добавить карточку из библиотеки «Персонажи» (или перетащите её сюда)") },
        h("option", { value: "" }, lib.length ? T("+ персонаж") : this._chars?.loading ? T("загрузка…") : T("+ персонаж (библиотека пуста)")),
        lib.filter((c) => !have.has(c.id)).map((c) => h("option", { value: c.id }, `${GLYPH[c.concept] || "◈"} ${c.folder ? c.folder + "/" : ""}${c.name}`)));
      pick.onchange = () => { const v = pick.value; pick.blur(); if (v) this.charAdd(t, v); };
      box.append(pick);
      box.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("application/x-h3s-card")) { e.preventDefault(); box.classList.add("over"); } });
      box.addEventListener("dragleave", () => box.classList.remove("over"));
      box.addEventListener("drop", (e) => { const id = e.dataTransfer.getData("application/x-h3s-card"); box.classList.remove("over"); if (id) { e.preventDefault(); e.stopPropagation(); this.charAdd(t, id); } });
      const n = (x.cards || []).length;
      return h("div", { class: "h3z-cblock" }, h("div", { class: "h3z-lbl" }, T("Персонажи"), n ? h("em", null, T("{0} / {1} · ≈{2} ток.", n, C.MAX_CARDS, tok)) : h("em", null, T("карточки из вкладки «Персонажи»"))), box);
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
      for (const u of this.cf?.uploads || []) if (voice ? u.kind !== "image" && (u.kind === "audio" || u.has_audio !== false) : u.kind === "video") out.push(u);
      const [W, H] = C.resolution(this.p.settings);
      this.p.segments.forEach((s, i) => {
        const v = s.result?.video; if (!v?.filename) return;
        out.push({ v: "s:" + s.id, label: T("▣ Отрезок {0}{1}", i + 1, s.name ? " · " + s.name : ""), ref: { file: v.filename, subfolder: v.subfolder || "", type: v.type || "output" },
          w: s.result.width || W, h: s.result.height || H, frames: s.result.frames || s.frames, dur: (s.result.frames || s.frames) / 24, url: this.host.url(v) });
      });
      return out;
    },
    /** Natural size of an image asset (async, cached); repaints the form once known. */
    /** A form photo: {key, ref {file, subfolder, type}, name, url, crop}; from a project asset or a file from disk. */
    charPhotoOf(a) { return { key: "a:" + a.id, ref: ref(a), name: a.name, url: this.assetUrl(a), crop: null }; },
    charImgSize(a) {
      const m = this._imgSz || (this._imgSz = {}), k = (a.ref || a).file + "|" + (a.ref || a).subfolder;
      if (m[k]) return m[k] === "…" ? null : m[k];
      m[k] = "…";
      const im = new Image(); im.onload = () => { m[k] = [im.naturalWidth, im.naturalHeight]; if (this.cf && this.tool === "chars") this.charFormEst?.(); };
      im.onerror = () => { m[k] = [0, 0]; }; im.src = a.url || this.assetUrl(a);
      return null;
    },
    charPhotoAspect(i = 0) {
      const f = this.cf, ph = f?.photos[i]; if (!ph) return null;
      const sz = this.charImgSize(ph); if (!sz || !sz[0]) return null;
      const c = ph.crop; return c ? (sz[0] * c[2]) / (sz[1] * c[3]) : sz[0] / sz[1];
    },
    charSpec() {
      const f = this.cf, srcs = this.charSources(false), vsrcs = this.charSources(true);
      const photos = f.photos.map((p) => ({ asset: p.ref, crop: p.crop || null }));
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
        const sz = this.charImgSize(f.photos[i]); if (!sz) return null;
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
      el.textContent = !e ? T("Считаю размеры…") : (e.visual_tokens ? T("Внешность: кадр {0}×{1} → латент {2} · ≈{3} ток.", e.canvas[0], e.canvas[1], e.latent.join("×"), e.visual_tokens) : T("Внешность: нет фото и клипа"))
        + (e?.voice_sec ? T(" · голос {0} с ≈{1} ток.", e.voice_sec.toFixed(1), e.voice_tokens) : "")
        + (e ? T(" · всего ≈{0} ток. на копию", (e.visual_tokens || 0) + (e.voice_tokens || 0)) : "");
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
      const folder = txt("folder", T("папка (необязательно)")); folder.setAttribute("list", "h3z-cfolders");
      const concept = h("select", { class: "h3z-sel sm" }, C.CARD_CONCEPTS.map((k) => h("option", { value: k, selected: f.concept === k }, `${GLYPH[k]} ${CN[k]}`)));
      concept.onchange = () => { f.concept = concept.value; };
      const head = h("div", { class: "h3z-row hd" }, h("div", { class: "h3z-lbl" }, edit ? T("Изменить карточку") : T("Новая карточка")), h("i", { class: "grow" }),
          h("button", { class: "h3z-btn sm", onclick: () => this.charCloseForm() }, T("← К библиотеке")));
      const parts = [
        h("div", { class: "h3z-grid2" }, this.field(T("Имя"), txt("name", T("Анна"))), this.field(T("Тип"), concept)),
        this.field(T("Папка"), h("div", null, folder, h("datalist", { id: "h3z-cfolders" }, folders.map((x) => h("option", { value: x }))))),
      ];
      if (!edit) {
        const seg = (val, opts, set) => h("div", { class: "h3z-cseg" }, opts.map(([v, l, t]) => h("div", { class: "it" + (val === v ? " on" : ""), title: t, onclick: () => { set(v); re(); } }, l)));
        parts.push(h("div", { class: "h3z-grid2" },
          this.field(T("Режим"), seg(f.mode, [["full", "Full", T("Все токены латента: точнее, дороже")], ["compressed", "Compressed", T("Латент сжат до сетки: дешевле, общий образ")]], (v) => { f.mode = v; })),
          this.field(T("Кадр"), (() => { const s = h("select", { class: "h3z-sel sm", title: T("Короткая сторона кадра карточки (не увеличивается)") }, RES.map((r) => h("option", { value: r, selected: f.res === r }, `${r} px`))); s.onchange = () => { f.res = Number(s.value); this.charFormEst(); }; return s; })())));
        if (f.mode === "compressed") {
          const g = h("select", { class: "h3z-sel sm" }, [8, 12, 16, 24, 32].map((n) => h("option", { value: n, selected: f.grid === n }, T("{0} по длинной стороне", n))));
          g.onchange = () => { f.grid = Number(g.value); this.charFormEst(); };
          parts.push(this.field(T("Сетка"), g));
        }
        parts.push(this.charPhotosBlock(), this.charClipBlock(), this.charVoiceBlock());
      } else {
        const c = f.card || {};
        parts.push(h("div", { class: "h3z-note" }, T("Источники не меняются ({0}, {1}) — для других фото создайте новую карточку.", this.charKinds(c) || "—", c.mode === "compressed" ? "Compressed" : "Full")));
      }
      parts.push(h("div", { class: "h3z-lbl" }, T("Описание"), h("em", null, T("по-английски — идёт в промпт"))),
        this.field(T("Имя субъекта"), txt("subject_name", T("Anna — одно слово"), false, T("Как субъект зовётся в промпте; одно слово"))),
        this.field(T("Внешность"), txt("appearance", "auburn hair, green coat…", true)),
        this.field(T("Сохранять"), txt("retained_attributes", "freckles, scar over the left brow…", true, T("Что модель должна сохранить"))),
        this.field(T("Голос"), txt("voice_description", "low husky voice…", true)));
      const est = this.$.cfEst = h("div", { class: "h3z-note est" });
      const st = this._chars || {}, pr = this.mpGet?.(this.p.settings.model_preset);
      const noVae = !edit && !st.vae && !pr?.vae && !this.host.inputLinked?.("vae") && (f.photos.length || f.clip);
      const noAvae = !edit && !st.audio_vae && !pr?.audio_vae && !this.host.inputLinked?.("audio_vae") && f.voice;
      const go = h("button", { class: "h3z-btn primary" + (f.busy ? " dis" : ""), onclick: () => this.charSubmit() }, f.busy ? (edit ? T("Сохраняю…") : T("Кодирую…")) : edit ? T("Сохранить") : T("◈ Создать карточку"));
      // scrolling body + a footer that always stays in view (estimate, warnings, «Создать»)
      const foot = h("div", { class: "cf-ft" }, edit ? null : est,
        noVae ? h("div", { class: "h3z-note err" }, T("Нет VAE: подключите VAE проводом к узлу студии или выберите в пресете моделей проекта.")) : null,
        noAvae ? h("div", { class: "h3z-note err" }, T("Нет аудио-VAE для голоса: подключите его ко входу audio_vae узла студии или выберите в пресете.")) : null,
        f.uploading ? h("div", { class: "h3z-note" }, T("Загрузка файлов: {0}…", f.uploading)) : null,
        h("div", { class: "h3z-row ft" }, go, h("button", { class: "h3z-btn", onclick: () => this.charCloseForm() }, T("Отмена"))));
      const form = h("div", { class: "h3z-chars form" + (f.busy ? " busy" : "") }, head, h("div", { class: "cf-body" }, parts), foot);
      if (!edit) {   // files from Explorer anywhere on the form: images → photos, video → clip, audio → voice
        form.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); form.classList.add("over"); } });
        form.addEventListener("dragleave", (e) => { if (!form.contains(e.relatedTarget)) form.classList.remove("over"); });
        form.addEventListener("drop", (e) => { form.classList.remove("over"); if (e.dataTransfer.files?.length) { e.preventDefault(); e.stopPropagation(); this.charAddFiles([...e.dataTransfer.files]); } });
      }
      L.append(form);
      if (!edit) this.charFormEst();
    },
    charPhotosBlock() {
      const f = this.cf, re = () => this.renderLeft();
      const list = h("div", { class: "h3z-cphotos" });
      f.photos.forEach((p, i) => {
        const a = p;
        const mv = (d) => { const j = i + d; if (j < 0 || j >= f.photos.length) return; const arr = f.photos; [arr[i], arr[j]] = [arr[j], arr[i]];
          if (i === 0 || j === 0) { let n = 0; arr.forEach((q, k) => { if (k && q.crop) { q.crop = null; n++; } }); if (n) this.toast(T("Первое фото сменилось — кадрирование остальных сброшено (их пропорции задаёт первое)")); } re(); };
        list.append(h("div", { class: "ph" + (i ? "" : " first"), title: a.name },
          h("img", { src: a.url, draggable: "false" }),
          h("span", { class: "n", title: i ? "" : T("Первое фото задаёт пропорции карточки") }, i ? String(i + 1) : "1 ⤢"),
          p.crop ? h("span", { class: "cr", title: T("Кадрировано") }, "✂") : null,
          h("div", { class: "bt" },
            h("span", { title: T("Раньше"), onclick: () => mv(-1) }, "←"), h("span", { title: T("Позже"), onclick: () => mv(1) }, "→"),
            h("span", { title: i ? T("Кадрировать (пропорции первого фото)") : T("Кадрировать (свободно — задаёт пропорции карточки)"), onclick: () => this.charCrop(i) }, "✂"),
            h("span", { title: T("Убрать"), onclick: () => { f.photos.splice(i, 1); if (i === 0) f.photos.forEach((q) => { q.crop = null; }); re(); } }, "✕"))));
      });
      const imgs = this.p.assets.filter((a) => a.category !== "audio" && a.category !== "video" && !f.photos.some((p) => p.key === "a:" + a.id));
      const pick = h("select", { class: "h3z-sel sm" }, h("option", { value: "" }, imgs.length ? T("+ фото из ассетов") : T("нет картинок в ассетах")), imgs.map((a) => h("option", { value: a.id }, a.name)));
      pick.onchange = () => { const a = this.p.assets.find((x) => x.id === pick.value); if (a) { f.photos.push(this.charPhotoOf(a)); re(); } };
      list.append(h("div", { class: "add" }, pick, this.charFileBtn("image/*", true, T("Фото с диска (можно несколько) · или перетащите файлы сюда · Ctrl+V — вставить картинку"))));
      list.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].some((t) => t === "application/x-h3s-asset" || t === "Files")) { e.preventDefault(); list.classList.add("over"); } });
      list.addEventListener("dragleave", () => list.classList.remove("over"));
      list.addEventListener("drop", (e) => { list.classList.remove("over"); if (e.dataTransfer.files?.length) { e.preventDefault(); e.stopPropagation(); this.charAddFiles([...e.dataTransfer.files], "photo"); return; } const id = e.dataTransfer.getData("application/x-h3s-asset"); const a = this.p.assets.find((x) => x.id === id);
        if (a && a.category !== "audio" && a.category !== "video") { e.preventDefault(); if (!f.photos.some((p) => p.key === "a:" + id)) { f.photos.push(this.charPhotoOf(a)); re(); } } });
      return h("div", null, h("div", { class: "h3z-lbl" }, T("Фото"), h("em", null, f.photos.length ? T("{0} · первое задаёт пропорции", f.photos.length) : T("из ассетов, с диска, перетаскиванием или Ctrl+V"))), list);
    },
    charClipBlock() {
      const f = this.cf, re = () => this.renderLeft(), srcs = this.charSources(false);
      const sel = h("select", { class: "h3z-sel sm" }, h("option", { value: "" }, srcs.length ? T("— без клипа —") : T("нет видео / готовых клипов")), srcs.map((s) => h("option", { value: s.v, selected: f.clip?.src === s.v }, s.label)));
      sel.onchange = () => { f.clip = sel.value ? { src: sel.value, start: 0, frames: 22 } : null; re(); };
      const out = [h("div", { class: "add" }, sel, this.charFileBtn("video/*,.mp4,.mov,.webm,.mkv", false, T("Клип с диска · или перетащите видеофайл на форму")))];
      if (f.clip) {
        const s = srcs.find((x) => x.v === f.clip.src), maxF = Math.max(1, s?.frames || 9999);
        const st = h("input", { class: "h3z-in sm", type: "number", min: 0, max: Math.max(0, maxF - 1), value: f.clip.start, title: T("Первый кадр") });
        const nf = h("input", { class: "h3z-in sm", type: "number", min: 1, max: 225, value: f.clip.frames, title: T("Кадров: 1–4 как есть, иначе 5, 22, 39, 56… (правило 17 кадров)") });
        const note = h("span", { class: "h3z-note" });
        const upd = () => {
          f.clip.start = clamp(Math.trunc(Number(st.value) || 0), 0, Math.max(0, maxF - 1));
          f.clip.frames = clamp(Math.trunc(Number(nf.value) || 1), 1, Math.min(225, maxF - f.clip.start));
          const n = C.snapClipFrames(f.clip.frames);
          note.textContent = T("→ {0} кадр.{1} · {2} с", n, n !== f.clip.frames ? T(" (кратно 17 + 5: {0} → {1})", f.clip.frames, n) : "", (n / 24).toFixed(2));
          this.charFormEst();
        };
        st.onchange = upd; nf.onchange = () => { upd(); nf.value = C.snapClipFrames(f.clip.frames); f.clip.frames = Number(nf.value); };
        upd();
        out.push(h("div", { class: "h3z-grid2" }, this.field(T("С кадра"), st), this.field(T("Кадров"), nf)), note);
      }
      return h("div", null, h("div", { class: "h3z-lbl" }, T("Клип"), h("em", null, T("необязательно · движение / мимика"))), out);
    },
    charVoiceBlock() {
      const f = this.cf, re = () => this.renderLeft(), srcs = this.charSources(true);
      const sel = h("select", { class: "h3z-sel sm" }, h("option", { value: "" }, srcs.length ? T("— без голоса —") : T("нет аудио / видео со звуком")), srcs.map((s) => h("option", { value: s.v, selected: f.voice?.src === s.v }, s.label)));
      sel.onchange = () => { const s = srcs.find((x) => x.v === sel.value); f.voice = s ? { src: s.v, start: 0, end: Math.round(Math.min(s.dur || 8, 8) * 10) / 10 || null } : null; re(); };
      const out = [h("div", { class: "add" }, sel, this.charFileBtn("audio/*,video/*,.mp3,.wav,.flac,.ogg,.m4a,.mp4,.mov,.webm", false, T("Голос с диска (аудио или видео со звуком) · или перетащите файл на форму")))];
      if (f.voice) {
        const s = srcs.find((x) => x.v === f.voice.src), dur = s?.dur || 0;
        const a = h("input", { class: "h3z-in sm", type: "number", step: 0.1, min: 0, value: f.voice.start, title: T("Начало, с") });
        const b = h("input", { class: "h3z-in sm", type: "number", step: 0.1, min: 0, value: f.voice.end ?? "", placeholder: dur ? dur.toFixed(1) : T("до конца"), title: T("Конец, с (пусто — до конца)") });
        const upd = () => { f.voice.start = Math.max(0, Number(a.value) || 0); f.voice.end = b.value === "" ? null : Math.max(f.voice.start + 0.5, Number(b.value) || 0); this.charFormEst(); };
        a.onchange = upd; b.onchange = upd;
        const play = h("button", { class: "h3z-btn sm", title: T("Прослушать обрезку") }, "▶");
        play.onclick = () => {
          this._cfAudio?.pause?.();
          if (play.textContent === "■") { play.textContent = "▶"; return; }
          const au = this._cfAudio = new Audio(s.url); au.currentTime = f.voice.start; play.textContent = "■";
          au.ontimeupdate = () => { if (f.voice?.end && au.currentTime >= f.voice.end) { au.pause(); play.textContent = "▶"; } };
          au.onended = () => { play.textContent = "▶"; };
          au.play().catch(() => { play.textContent = "▶"; });
        };
        out.push(h("div", { class: "h3z-grid3" }, this.field(T("С, с"), a), this.field(T("По, с"), b), this.field("", play)));
      }
      return h("div", null, h("div", { class: "h3z-lbl" }, T("Голос"), h("em", null, T("≈80 ток./с · 3–10 с чистой речи"))), out);
    },
    async charSubmit() {
      const f = this.cf; if (!f || f.busy) return;
      const name = f.name.trim(), sub = f.subject_name.trim();
      if (!name) return this.toast(T("Дайте карточке имя"), true);
      if (sub && !SUBJECT_RE.test(sub)) return this.toast(T("Имя субъекта — одно слово (буквы, цифры, - и ')"), true);
      f.busy = true; this.renderLeft();
      try {
        if (f.edit) {
          const old = f.edit;
          const fields = { name, folder: f.folder.trim(), concept: f.concept, subject_name: sub, appearance: f.appearance, retained_attributes: f.retained_attributes, voice_description: f.voice_description };
          const d = await this.host.call("/h3zero/chars/update", { id: old, fields });
          await this.charsLoad(true);
          const card = d?.card || null;
          if (!card) throw new Error(T("сервер не вернул карточку — обновите библиотеку (↻)"));
          this.charRelink(old, card);
          this.toast(card.name === name ? T("Карточка «{0}» сохранена", name) : T("Сохранено, но имя на диске «{0}»", card.name), card.name !== name);
        } else {
          const spec = this.charSpec();
          if (!spec.photos.length && !spec.clip && !spec.voice) { f.busy = false; this.renderLeft(); return this.toast(T("Добавьте фото, клип или голос"), true); }
          const pr = this.mpGet?.(this.p.settings.model_preset);
          const wired = {};
          for (const k of ["vae", "audio_vae"]) { const w = await this.host.wiredUpstream?.(k); if (w) wired[k] = w; }
          const d = await this.host.call("/h3zero/chars/create", { spec, wired, vae: pr?.vae || "", audio_vae: pr?.audio_vae || "" });
          await this.charsLoad(true);
          this.toast(T("◈ Карточка «{0}» создана", d?.card?.name || name));
        }
        this.cf = null;
      } catch (err) {
        f.busy = false; this.toast((f.edit ? T("Не сохранилось: ") : T("Не создалась: ")) + (err.message || err), true);
      }
      this.renderLeft(); this.renderInspector();
    },
    /** A card renamed / moved (here, in another project or another tab) keeps its old ids as aliases: follow them. */
    charFollowAliases() {
      const cards = this._chars?.cards || [];
      if (!this.p || !cards.some((c) => c.aliases?.length)) return;
      const ids = new Set(cards.map((c) => c.id)), used = new Set();
      for (const x of [...(this.p.segments || []), ...(this.p.regions || [])]) for (const e of x.cards || []) used.add(e.id);
      for (const id of used) {
        if (ids.has(id)) continue;
        const card = cards.find((c) => c.aliases?.includes(id));
        if (card) this.charRelink(id, card);
      }
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

    // ------------------------------------------------------------------ files from disk (picker, drop, paste)
    charFileBtn(accept, multiple, title) {
      const inp = h("input", { type: "file", accept, multiple: multiple || undefined, style: { display: "none" } });
      inp.onchange = () => { const fs = [...inp.files]; inp.value = ""; if (fs.length) this.charAddFiles(fs, accept.startsWith("image") ? "photo" : accept.startsWith("video") ? "clip" : "voice"); };
      return h("span", { class: "fb" }, h("button", { class: "h3z-btn sm", type: "button", title, onclick: () => inp.click() }, T("📁 С диска")), inp);
    },
    /** Files from the PC → the global card library's temp folder (output/h3zerostudio/_characters/.uploads, one copy
     *  per content; removed after «Создать» or after a day) — never a project folder and never the asset list.
     *  want: "photo" | "clip" | "voice" | undefined (by file type: images → photos, video → clip, audio → voice). */
    async charAddFiles(files, want) {
      const f = this.cf; if (!f || f.edit) return;
      const kind = (x) => IMG_RE.test(x.type) || /\.(png|jpe?g|webp|bmp|gif)$/i.test(x.name) ? "image" : VID_RE.test(x.type) || /\.(mp4|mov|webm|mkv)$/i.test(x.name) ? "video" : AUD_RE.test(x.type) || /\.(mp3|wav|flac|ogg|m4a|aac|opus)$/i.test(x.name) ? "audio" : "";
      const list = files.filter((x) => kind(x));
      if (list.length < files.length) this.toast(T("Пропущено файлов: {0} (нужны картинки, видео или аудио)", files.length - list.length), true);
      if (!list.length) return;
      f.uploading = (f.uploading || 0) + list.length; this.renderLeft();
      let ok = 0;
      for (const x of list) {
        const k = kind(x);
        try {
          const r = await this.host.charsUpload(x);
          const rf = { file: r.name, subfolder: r.subfolder || "", type: r.type || "output" };
          const url = this.host.url({ filename: rf.file, subfolder: rf.subfolder, type: rf.type });
          const name = (x.name && x.name !== "image.png" ? x.name : r.name.replace(/^[0-9a-f]{12}_/, "")).replace(/\.[^.]+$/, "");
          if (this.cf !== f) return;
          if (k === "image" && want !== "clip" && want !== "voice") {
            if (!f.photos.some((p) => p.key === "u:" + rf.subfolder + "/" + rf.file)) f.photos.push({ key: "u:" + rf.subfolder + "/" + rf.file, ref: rf, name, url, crop: null });
          } else if (k === "video" || k === "audio") {
            const u = { v: "u:" + rf.subfolder + "/" + rf.file, kind: k, label: (k === "video" ? "📁🎞 " : "📁♪ ") + name, ref: rf, url };
            if (k === "video") {
              try { const info = await this.host.videoInfo({ filename: rf.file, subfolder: rf.subfolder, type: rf.type }, false); Object.assign(u, { w: info.width, h: info.height, frames: info.frames, dur: info.duration, has_audio: !!info.has_audio }); }
              catch (e) { this.toast(T("{0}: не удалось прочитать видео ({1})", x.name, e.message || e), true); continue; }
            } else u.dur = await new Promise((res) => { const a = new Audio(); a.preload = "metadata"; a.onloadedmetadata = () => res(isFinite(a.duration) ? a.duration : 0); a.onerror = () => res(0); a.src = url; });
            if (!f.uploads.some((q) => q.v === u.v)) f.uploads.push(u);
            const asVoice = want === "voice" || (want !== "clip" && k === "audio");
            if (asVoice && (k === "audio" || u.has_audio)) f.voice = { src: u.v, start: 0, end: Math.round(Math.min(u.dur || 8, 8) * 10) / 10 || null };
            else if (k === "video") f.clip = { src: u.v, start: 0, frames: Math.min(22, Math.max(1, u.frames || 22)) };
            else this.toast(T("{0}: в видео нет звука — для голоса не подходит", x.name), true);
          } else this.toast(T("{0}: сюда нужна {1}-запись", x.name, want === "clip" ? T("видео") : T("аудио")), true);
          ok++;
        } catch (e) { this.toast(T("Не удалось загрузить ") + x.name + ": " + (e.message || e), true); }
      }
      f.uploading = Math.max(0, (f.uploading || 0) - list.length);
      if (this.cf === f) { this.renderLeft(); if (ok) this.toast(T("Загружено: {0} — временно, для этой карточки (в проект и «Ассеты» не попадают)", ok)); }
    },
    // ------------------------------------------------------------------ prompt editor (increment 2)
    /** The card labels of a clip / span as prompt-editor reference items (after the plain refs). */
    peCardItems(holder, index, region) {
      const labels = region ? C.cardLabels(this.p, holder, null, true, true) : C.cardLabels(this.p, holder, index);
      const out = [];
      for (const r of labels) {
        const lib = this.charCard(r.id), th = lib && this.charThumb(lib), sn = r.snap;
        const all = r.image.length + r.video.length + r.audio.length;
        const mk = (kind, tag, nums) => nums.forEach((n, k) => out.push({ token: `<${tag} ${n}>`, kind, card: r.id, name: sn.name || r.id,
          sub: `◈ ${CN[sn.concept] || T("карточка")}` + (nums.length > 1 ? T(" · копия {0}/{1}", k + 1, nums.length) : "") + (sn.subject_name ? ` · ${sn.subject_name}` : ""),
          thumb: kind === "audio" ? "" : th || "", icon: kind === "audio" ? "🎙" : GLYPH[sn.concept] || "◈", over: false }));
        mk("picture", "Picture", r.image); mk("video", "Video", r.video); mk("audio", "Audio", r.audio);
        if (!all) continue;
      }
      return out;
    },
    /** <Subject N> of the applied cards that name someone (characters, voices, «Другое», or any card with a subject name). */
    peSubjects(holder, index, region) {
      const labels = region ? C.cardLabels(this.p, holder, null, true, true) : C.cardLabels(this.p, holder, index);
      const out = [];
      for (const r of labels) {
        const sn = r.snap;
        if (!sn.subject_name && !["identity", "voice", "generic"].includes(sn.concept)) continue;
        const name = (sn.subject_name || String(sn.name || "").trim().split(/\s+/).join("_")).replace(/[^\p{L}\p{N}_'-]/gu, "") || `S${out.length + 1}`;
        out.push({ n: out.length + 1, id: r.id, name, snap: sn, image: r.image, video: r.video, audio: r.audio });
      }
      return out;
    },
    peHolder() {
      const ctx = this.pe?.spec?.ctx || {};
      if (ctx.kind === "seg" && ctx.seg >= 0) return { holder: this.p.segments[ctx.seg], index: ctx.seg, region: false };
      if (ctx.kind === "region" && ctx.region) return { holder: (this.p.regions || []).find((r) => r.id === ctx.region.id) || ctx.region, index: null, region: true };
      return null;
    },
    peSubjectCompletion(m, cx) {
      const pe = this.pe, q = m.text.slice(1).toLowerCase();
      const subs = pe.refs.subjects.filter((x) => !q || x.name.toLowerCase().includes(q) || String(x.snap.name || "").toLowerCase().includes(q));
      const options = subs.map((x, k) => ({ label: `<Subject ${x.n}> ${x.name}`, detail: x.snap.name, info: `◈ ${CN[x.snap.concept]}` + (x.snap.appearance ? " · " + x.snap.appearance : ""), type: "subject", boost: -k,
        _r: { kind: "picture", thumb: this.charThumb(this.charCard(x.id)) || "" },
        apply: (view, c, from, to) => {
          const after = view.state.sliceDoc(to, to + 1), ins = `<Subject ${x.n}> ${x.name}` + (after && /\s/.test(after) ? "" : " ");
          view.dispatch({ changes: { from, to, insert: ins }, selection: { anchor: from + ins.length }, userEvent: "input.complete" });
        } }));
      if (!options.length) return null;
      return { from: m.from, to: cx.pos, options, filter: false };
    },
    /** On «Применить»: !Name of a known card → <Subject N> Name. */
    peExpandBangs(text) {
      const subs = this.pe?.refs?.subjects || []; if (!subs.length) return text;
      const by = new Map(); for (const x of subs) { by.set(x.name.toLowerCase(), x); const nm = String(x.snap.name || "").replace(/\s+/g, "_").toLowerCase(); if (nm && !by.has(nm)) by.set(nm, x); }
      return text.replace(/(^|[\s(\[])!([\p{L}\p{N}_'-]+)/gu, (all, pre, nm) => { const x = by.get(nm.toLowerCase()); return x ? `${pre}<Subject ${x.n}> ${x.name}` : all; });
    },
    peCardTools(B) {
      const pe = this.pe, cards = pe.refs.items.filter((r) => r.card);
      if (!cards.length) return [];
      const voiced = (pe.refs.subjects || []).filter((x) => x.audio.length).slice(0, 4);
      return [h("span", { class: "sep" }),
        B(T("◈ Набросать из персонажей"), T("Заполнить subject_definitions и retention_analysis по карточкам «Персонажей» этого промпта (их метки, имена, внешность, что сохранить, голос). Ctrl+Z — отменить"), () => this.peDraftFromCards()),
        ...voiced.map((x) => B(`🎙 ${x.name}`, T("Реплика: <Subject {0}> {1} says: <d>[English] …</d> (голос — <Audio {2}>)", x.n, x.name, x.audio[0]), () => this.peSpeaker(x)))];
    },
    peSpeaker(x) {
      const v = this.pe?.view; if (!v) return;
      const pre = `<Subject ${x.n}> ${x.name} says:\n<d>[English] `, post = "</d>";
      const r = v.state.selection.main, ln = v.state.doc.lineAt(r.from), lead = ln.text.trim() && r.from !== ln.from ? "\n" : "";
      const nx = v.state.sliceDoc(r.to, r.to + 1), tail = nx && nx !== "\n" ? "\n" : "";
      v.dispatch({ changes: { from: r.from, to: r.to, insert: lead + pre + post + tail }, selection: { anchor: r.from + lead.length + pre.length }, scrollIntoView: true, userEvent: "input" });
      v.focus();
    },
    peDraftLines() {
      const pe = this.pe, ph = this.peHolder(); if (!ph) return { defs: [], ret: [] };
      const labels = ph.region ? C.cardLabels(this.p, ph.holder, null, true, true) : C.cardLabels(this.p, ph.holder, ph.index);
      const subs = new Map((pe.refs.subjects || []).map((x) => [x.id, x]));
      const EN = { identity: "character", background: "location", clothing: "outfit", style: "visual style", pose_motion: "motion", voice: "voice", generic: "reference" };
      const RET = { identity: "fully_preserved", clothing: "fully_preserved", generic: "fully_preserved", background: "partially_preserved", style: "attribute_transfer", pose_motion: "attribute_transfer", voice: "reference" };
      const defs = [], ret = [];
      for (const r of labels) {
        const sn = r.snap, sub = subs.get(r.id);
        const look = [...r.image.map((n) => `<Picture ${n}>`), ...r.video.map((n) => `<Video ${n}>`)], aud = r.audio.map((n) => `<Audio ${n}>`);
        const desc = [sn.appearance, sn.retained_attributes ? "keep " + sn.retained_attributes : "", aud.length && sn.voice_description ? "voice: " + sn.voice_description : ""].filter(Boolean).join("; ");
        const toks = [...look, ...aud].join(", ");
        const head = sub ? `<Subject ${sub.n}> ${sub.name} — ${toks}` : `${toks} — ${sn.name || r.id}`;
        const what = sub ? (look.length ? EN[sn.concept] === "voice" ? "speaker" : EN[sn.concept] : "speaker (voice only)") : EN[sn.concept] || "reference";
        defs.push({ toks: [...look, ...aud], line: `${head}: ${what}${look.length && aud.length ? ` (${look.length > 1 ? "looks" : "look"} ${look.join(", ")}, voice ${aud.join(", ")})` : ""}${desc ? ". " + desc : ""}` });
        for (const t of look) ret.push({ tok: t, line: `${t}: ${RET[sn.concept] || "fully_preserved"}` });
        for (const t of aud) ret.push({ tok: t, line: `${t}: reference` });
      }
      return { defs, ret };
    },
    peDraftFromCards() {
      const pe = this.pe, v = pe.view; if (!v) return;
      const { defs, ret } = this.peDraftLines();
      if (!defs.length) return this.toast(T("У этого промпта нет карточек «Персонажей»"), true);
      const t = v.state.doc.toString(), secs = parseSections(t);
      if (!secs.length) {   // no structure yet: the H3 skeleton with the plain refs + the card lines, the old text into detailed_description
        const plain = pe.refs.items.filter((r) => !r.card && r.kind !== "var").map((r) => ({ token: r.token, name: r.kind === "auto" ? "last frame of the previous shot" : r.name, kind: r.kind }));
        const isCont = pe.refs.items.some((r) => r.kind === "auto");
        let tpl = promptTemplate(plain, { task: pe.spec.ctx.kind === "region" ? "[video editing]" : isCont ? "[video continuation]" : "[reference generation]" });
        if (!plain.length) tpl = tpl.replace("subject_definitions:\n<Picture 1> — \n", "subject_definitions:\n").replace("retention_analysis:\n<Picture 1>: fully_preserved\n", "retention_analysis:\n");
        tpl = tpl.replace("\n\nsummary:", (plain.length ? "\n" : "") + defs.map((d) => d.line).join("\n") + "\n\nsummary:");
        tpl = tpl.replace("\n\ndetailed_description:", (plain.length ? "\n" : "") + ret.map((d) => d.line).join("\n") + "\n\ndetailed_description:");
        const at = tpl.indexOf("[Shot 1] ") + "[Shot 1] ".length, full = t.trim() ? tpl.slice(0, at) + t.trim() + tpl.slice(at) : tpl;
        v.dispatch({ changes: { from: 0, to: t.length, insert: full }, selection: { anchor: full.indexOf("[Shot 1] ") + 9 }, scrollIntoView: true });
        this.toast(t.trim() ? T("Набросок из персонажей вставлен, прежний текст — в detailed_description (Ctrl+Z — отменить)") : T("Набросок из персонажей вставлен"));
        v.focus(); return;
      }
      // structured: add what is missing to subject_definitions / retention_analysis (creating them in order if absent)
      const changes = [];
      const put = (key, lines, before) => {
        const s = secs.find((x) => x.key === key);
        if (s) {
          const L = lines.filter((d) => !d.toks.some((tk) => s.body.includes(tk))).map((d) => d.line);
          if (!L.length) return 0;
          let at = s.to; while (at > s.from && /\s/.test(t[at - 1])) at--;
          changes.push({ from: at, insert: "\n" + L.join("\n") }); return L.length;
        }
        const nxt = secs.find((x) => before.includes(x.key));
        const at = nxt ? nxt.at : t.length;
        changes.push({ from: at, insert: (at && t[at - 1] !== "\n" ? "\n\n" : "") + `${key}:\n${lines.map((d) => d.line).join("\n")}\n\n` }); return lines.length;
      };
      const n1 = put("subject_definitions", defs, ["summary", "retention_analysis", "detailed_description", "overall_soundscape", "non_diegetic_music"]);
      const n2 = put("retention_analysis", ret.map((d) => ({ toks: [d.tok], line: d.line })), ["detailed_description", "overall_soundscape", "non_diegetic_music"]);
      if (!changes.length) return this.toast(T("Все карточки уже описаны в subject_definitions и retention_analysis"));
      v.dispatch({ changes, scrollIntoView: true });
      this.toast(T("◈ Добавлено: {0} в subject_definitions, {1} в retention_analysis (Ctrl+Z — отменить)", n1, n2));
      v.focus();
    },
    /** Status bar: cards the prompt never cites (an auto line is added), unknown <Subject N> / !Name, cards switched off but named. */
    peCardStatus(t) {
      const pe = this.pe, ph = this.peHolder(); if (!ph || !ph.holder) return "";
      const e2 = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
      const subs = pe.refs.subjects || [], out = [];
      const items = pe.refs.items.filter((r) => r.card);
      const byCard = new Map(); for (const r of items) { if (!byCard.has(r.card)) byCard.set(r.card, []); byCard.get(r.card).push(r.token); }
      const silent = [];
      for (const [id, toks] of byCard) {
        if (!toks.some((tk) => t.includes(tk))) silent.push(this.p.cards?.[id]?.name || id);   // same rule as C.cardPhrases
      }
      if (silent.length) out.push(T("<span class=\"warn\" title=\"Метки этих карточек в промпте не упомянуты — при генерации добавится строка по типу карточки (например «&lt;Picture N&gt; shows Anna…»). «◈ Набросать из персонажей» опишет их явно.\">◈ не упомянуты: {0}</span>", e2(silent.join(", "))));
      const badS = [...new Set([...t.matchAll(/<Subject\s*(\d+)>/g)].map((m) => +m[1]).filter((n) => n < 1 || n > subs.length))];
      if (badS.length && subs.length) out.push(T("<span class=\"bad\" title=\"Персонажей с такими номерами у этого промпта нет (всего {0})\">✕ {1}</span>", subs.length, badS.map((n) => `&lt;Subject ${n}&gt;`).join(", ")));
      const known = new Set(subs.flatMap((x) => [x.name.toLowerCase(), String(x.snap.name || "").replace(/\s+/g, "_").toLowerCase()]));
      const bangs = [...new Set([...t.matchAll(/(?:^|[\s(\[])!([\p{L}\p{N}_'-]+)/gu)].map((m) => m[1]))];
      const unk = bangs.filter((b) => !known.has(b.toLowerCase())), ok = bangs.filter((b) => known.has(b.toLowerCase()));
      if (ok.length) out.push(T("<span title=\"При «Применить» станут &lt;Subject N&gt; Имя\">!→ {0}</span>", e2(ok.join(", "))));
      if (unk.length) out.push(T("<span class=\"bad\" title=\"Нет такой карточки у этого промпта — останется как текст\">✕ !{0}</span>", e2(unk.join(", !"))));
      const off = (ph.holder.cards || []).filter((e) => e.on === false || !C.cardCopies(e.w ?? 1)[0]).map((e) => this.p.cards?.[e.id]).filter(Boolean)
        .filter((sn) => [sn.subject_name, sn.name].some((nm) => nm && new RegExp(`(^|[^\\p{L}])!?${String(nm).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "iu").test(t)));
      if (off.length) out.push(T("<span class=\"warn\" title=\"Карточка выключена — в генерацию не подаётся, хотя промпт её называет\">◈ выключены: {0}</span>", e2(off.map((x) => x.name).join(", "))));
      if (ph.region) {
        const vo = (ph.holder.cards || []).map((e) => this.p.cards?.[e.id]).filter((sn) => sn && sn.audio && !sn.vkind);
        if (vo.length) out.push(T("<span class=\"warn\" title=\"Участок не подаёт голоса карточек\">◈ голос в участке не идёт: {0}</span>", e2(vo.map((x) => x.name).join(", "))));
      }
      return out.join("");
    },

    // ------------------------------------------------------------------ crop modal
    charCrop(i) {
      const f = this.cf, p = f?.photos[i], a = p; if (!a) return;
      const aspect = i ? this.charPhotoAspect(0) : null;
      if (i && !aspect) return this.toast(T("Подождите — размер первого фото ещё не известен"), true);
      const img = h("img", { src: a.url, draggable: "false" });
      const box = h("div", { class: "rect" }, h("i", { class: "hd" }));
      const stage = h("div", { class: "stage" }, img, box);
      const st = { i, aspect, r: p.crop ? [...p.crop] : null, img, box };
      const apply = () => { f.photos[i].crop = st.r && !(st.r[0] <= 0.001 && st.r[1] <= 0.001 && st.r[2] >= 0.999 && st.r[3] >= 0.999) ? st.r.map((v) => Math.round(v * 10000) / 10000) : null;
        if (i === 0) { let n = 0; f.photos.forEach((q, k) => { if (k && q.crop) { q.crop = null; n++; } }); if (n) this.toast(T("Пропорции первого фото сменились — кадрирование остальных сброшено")); }
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
      const info = h("div", { class: "h3z-note" }, aspect ? T("Пропорции заданы первым фото ({0}). Тяните рамку, угол — размер.", aspect.toFixed(3)) : T("Первое фото: рамка свободная и задаёт пропорции карточки. Тяните рамку, угол — размер."));
      const modal = h("div", { class: "h3z-modal" }, h("div", { class: "h3z-ccrop h3z-glass" },
        h("div", { class: "h3z-lbl" }, T("Кадрирование · фото {0} · {1}", i + 1, a.name)), stage, info,
        h("div", { class: "h3z-row" }, h("button", { class: "h3z-btn sm", onclick: reset }, T("↺ Всё фото")), h("i", { class: "grow" }),
          h("button", { class: "h3z-btn primary sm", title: "Enter", onclick: apply }, T("Применить")), h("button", { class: "h3z-btn sm", title: "Esc", onclick: close }, T("Отмена"))),
        h("div", { class: "hint" }, T("Enter — применить · Esc — отмена"))));
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

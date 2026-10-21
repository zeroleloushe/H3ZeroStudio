// H3ZeroStudio: «✎ Редактировать» — a comfortable full-window prompt editor for every prompt field.
// CodeMirror 6 (MIT, vendored as one ES module in ./vendor, loaded on first use): undo/redo, find/replace,
// line numbers, wrap, auto-indent, multi-cursor. Typing @ lists the references of this prompt (images
// <Picture N>, video <Video N>, audio <Audio N>, the auto last-frame picture) with thumbnails; tokens are
// highlighted, tokens that point to no reference are flagged. A side panel shows the recommended H3 prompt
// structure (subject_definitions … non_diegetic_music) with Russian notes, live section status and the
// detailed_description word count vs the 350–500 target; «Вставить шаблон» inserts the skeleton.
const SECTIONS = [
  ["subject_definitions", "Кто есть кто", "what each referenced item is and what it contributes",
    "Каждая метка с новой строки: <Picture N>, <Video N>, <Audio N> (или своя <Subject N>) — что это (персонаж, предмет, локация, стиль, движение, голос) и что именно берётся из референса: внешность, одежда, детали, роль в ролике."],
  ["summary", "Кратко", "[task type] one paragraph",
    "Один абзац. Начинается с типа задачи в квадратных скобках: [reference generation], [keyframe completion], [video editing], [video continuation], [audio reuse], [audio reference] (можно сочетать через +). Что за ролик, главные герои, как используются референсы."],
  ["retention_analysis", "Что сохранить", "per-label fidelity markers",
    "Для каждой метки — насколько точно её сохранить: fully_preserved (почти без изменений), partially_preserved (часть черт меняется), attribute_transfer (черты переносятся на другой объект), weak_reference (только стиль/атмосфера). Для аудио: fully_copy, partially_copy, reference, weak_reference."],
  ["detailed_description", "Основное описание", "shot-by-shot body, normally 350–500 words",
    "Главная часть промпта. 1–2 предложения про стиль, реализм, свет, палитру и атмосферу, затем кадры по порядку: [Shot 1], [Shot 2] At 00:03.500 … В каждом: композиция, персонаж (по референсам), действие, камера (ракурс, объектив, движение), свет, звук. Реплики: <Subject 1> (S1) says: <d>[Russian] текст</d>. Обычно 350–500 слов."],
  ["overall_soundscape", "Звуковая среда", "ambience and physical sound",
    "Фон и физические звуки сцены: эмбиент, шаги, ветер, ткань, предметы. Без диалогов."],
  ["non_diegetic_music", "Закадровая музыка", "audience-only score, or N/A",
    "Музыка, которую слышит только зритель: инструменты, темп, настроение, развитие. Если музыки нет — N/A."],
];
const KEYS = SECTIONS.map((s) => s[0]);
const TASKS = ["[reference generation]", "[keyframe completion]", "[video editing]", "[video continuation]", "[audio reuse]", "[audio reference]"];
const RETAIN = ["fully_preserved", "partially_preserved", "attribute_transfer", "weak_reference", "fully_copy", "partially_copy", "reference"];
const DESC_MIN = 350, DESC_MAX = 500;
const LS = "h3zs.prompted.v1";
const TOKEN_RE = /<(Picture|Video|Audio|Image)\s*(\d+)>/g;
const words = (t) => (String(t).match(/[\p{L}\p{N}][\p{L}\p{N}'’_/-]*/gu) || []).length;
/** Rough token estimate for an English-ish prompt (≈ 1.3 tokens per word, ≈ 4 chars per token; Cyrillic denser). */
const approxTokens = (t) => { t = String(t); if (!t.trim()) return 0; const cyr = (t.match(/[\u0400-\u04FF]/g) || []).length; return Math.round(Math.max(words(t) * 1.3, (t.length - cyr) / 4 + cyr / 2.2)); };

/** Sections of a prompt: [{key, line (1-based), from, to (doc offsets of the body), body}] in document order. */
export function parseSections(text) {
  const out = [], re = new RegExp(`^[ \\t]*(${KEYS.join("|")})[ \\t]*:`, "gm");
  let m;
  while ((m = re.exec(text))) out.push({ key: m[1], at: m.index, from: m.index + m[0].length });
  out.forEach((s, i) => { s.to = i + 1 < out.length ? out[i + 1].at : text.length; s.body = text.slice(s.from, s.to); s.words = words(s.body); });
  return out;
}

/** Skeleton of the recommended structure; refs = [{token, name, kind}] fill subject_definitions / retention_analysis. */
export function promptTemplate(refs = [], { task = "[reference generation]" } = {}) {
  const defs = refs.length ? refs.map((r) => `${r.token} — ${r.name ? r.name + ": " : ""}`).join("\n") : "<Picture 1> — ";
  const ret = refs.length ? refs.map((r) => `${r.token}: ${r.kind === "audio" ? "reference" : "fully_preserved"}`).join("\n") : "<Picture 1>: fully_preserved";
  return `subject_definitions:\n${defs}\n\nsummary:\n${task} \n\nretention_analysis:\n${ret}\n\ndetailed_description:\n\n[Shot 1] \n\noverall_soundscape:\n\n\nnon_diegetic_music:\nN/A\n`;
}

export function installPromptEditor(Editor, { C, h, ICON }) {
  let CM = null;
  const loadCM = async () => CM || (CM = await import("./vendor/codemirror.js"));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const loadPrefs = () => { try { return { wrap: true, lines: true, mono: false, size: 15, side: true, ...JSON.parse(localStorage.getItem(LS) || "{}") }; } catch (e) { return { wrap: true, lines: true, mono: false, size: 15, side: true }; } };
  const savePrefs = (p) => { try { localStorage.setItem(LS, JSON.stringify(p)); } catch (e) {} };
  const KIND_RU = { picture: "картинка", video: "видео", audio: "аудио", auto: "авто-кадр", var: "подстановка" };
  const PHRASES = {
    "Find": "Найти", "Replace": "Заменить на", "next": "дальше", "previous": "назад", "all": "все", "match case": "регистр",
    "by word": "слово целиком", "regexp": "рег. выражение", "replace": "заменить", "replace all": "заменить все", "close": "закрыть",
    "current match": "текущее совпадение", "replaced $ matches": "заменено: $", "replaced match on line $": "заменено в строке $", "on line": "в строке",
    "Go to line": "К строке", "go": "перейти",
  };

  Object.assign(Editor.prototype, {
    /** The references a prompt can point at. ctx: {kind: "seg"|"marker", seg} | {kind: "region", region} | {kind: "global"|"negative"} | {kind: "phrase"}.
     *  → {items: [{token, kind, name, sub, thumb, icon, over}], valid: Map(token → note|null), note} */
    promptRefs(ctx) {
      const p = this.p;
      const segList = (i) => {
        const s = p.segments[i]; if (!s) return [];
        const out = [];
        C.orderedRefs(p, s).forEach((a, n) => out.push({ token: `<Picture ${n + 1}>`, kind: "picture", name: a.name, sub: { character: "персонаж", location: "локация", other: "другое" }[a.category] || "картинка", thumb: this.assetUrl(a), over: n >= C.MAX_REF_IMAGES }));
        const cp = C.continuityPicture(p, i);
        if (cp) out.push({ token: `<Picture ${cp}>`, kind: "auto", name: `последний кадр отрезка ${i}`, sub: "добавляется автоматически", icon: "⟶", over: cp > C.MAX_REF_IMAGES });
        if (!C.isFootage(s)) C.videoRefs(p, s).forEach((a, k) => out.push({ token: `<Video ${k + 1}>`, kind: "video", name: a.name, sub: `видео${a.duration ? " · " + Number(a.duration).toFixed(1) + " с" : ""}`, thumb: a.poster ? this.posterUrl(a) : "", icon: "🎞", over: k >= C.MAX_REF_VIDEOS }));
        C.audioRefs(p, s).forEach((a, k) => out.push({ token: `<Audio ${k + 1}>`, kind: "audio", name: a.name, sub: "аудио", icon: "♪", over: k >= C.MAX_REF_AUDIOS }));
        out.push(...(this.peCardItems?.(s, i, false) || []));   // «Персонажи»: after the plain refs
        return out;
      };
      if (ctx.kind === "seg" || ctx.kind === "marker") {
        const i = ctx.seg ?? -1, items = i >= 0 ? segList(i) : [];
        return { items, valid: new Map(items.map((r) => [r.token, null])), note: i >= 0 ? `Референсы отрезка ${i + 1}` : "Маркер за концом ролика — референсов нет",
          subjects: i >= 0 && ctx.kind === "seg" ? this.peSubjects?.(p.segments[i], i, false) || [] : [] };
      }
      if (ctx.kind === "region") {
        const rg = ctx.region || {};
        const items = C.orderedRefs(p, { refs: rg.refs || [] }).map((a, n) => ({ token: `<Picture ${n + 1}>`, kind: "picture", name: a.name, sub: "картинка участка", thumb: this.assetUrl(a), over: n >= C.MAX_REF_IMAGES }));
        items.push(...(this.peCardItems?.(rg, null, true) || []));
        return { items, valid: new Map(items.map((r) => [r.token, null])), note: "Референсы участка (картинки)", subjects: this.peSubjects?.(rg, null, true) || [] };
      }
      if (ctx.kind === "phrase") {
        const items = [{ token: "{n}", kind: "var", name: "номер последнего кадра", sub: "станет <Picture N>", icon: "#" }, { token: "<Picture {n}>", kind: "var", name: "последний кадр прошлого отрезка", sub: "как метка H3", icon: "⟶" }];
        return { items, valid: new Map(), note: "Фраза продления: {n} заменяется номером картинки последнего кадра" };
      }
      // global prompt / negative: added to every clip, so a token means a different reference per clip
      const by = new Map(), n = p.segments.length;
      p.segments.forEach((s, i) => { if (C.isFootage(s)) return; for (const r of segList(i)) { if (!by.has(r.token)) by.set(r.token, { ...r, per: [] }); by.get(r.token).per.push(`${i + 1}: ${r.name}`); } });
      const gen = p.segments.map((s, i) => i).filter((i) => !C.isFootage(p.segments[i]));
      const items = [...by.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.token.localeCompare(b.token, "en", { numeric: true }))
        .map((r) => ({ ...r, name: r.per.length === 1 ? `отрезок ${r.per[0]}` : `в ${r.per.length} отр.: ` + r.per.slice(0, 3).join(" · ") + (r.per.length > 3 ? " …" : ""), sub: KIND_RU[r.kind === "auto" ? "picture" : r.kind] }));
      const valid = new Map(items.map((r) => { const miss = gen.length - r.per.length; return [r.token, miss > 0 ? `есть только в ${r.per.length} из ${gen.length} отрезков` : null]; }));
      return { items, valid, global: true, note: `Общий промпт добавляется к каждому отрезку: номер метки у каждого отрезка свой (${n} отр.)` };
    },

    /** «✎ Редактировать» button for a prompt field. spec() → {title, ctx, value, apply(text)} (read at click time). */
    peButton(spec, extra = "") {
      if (!document.getElementById("h3z-pe-style")) { const st = document.createElement("style"); st.id = "h3z-pe-style"; st.textContent = PE_CSS; document.head.appendChild(st); }
      return h("button", { class: "h3z-btn sm h3z-pe-btn " + extra, type: "button", title: "Открыть удобный редактор промпта: поиск/замена, @ — ссылки на референсы, подсказка по структуре H3", html: "<span>✎ Редактировать</span>",
        onpointerdown: (e) => e.stopPropagation(), onclick: (e) => { e.preventDefault(); e.stopPropagation(); this.openPromptEditor(spec()); } });
    },

    async openPromptEditor(spec) {
      if (this.pe) return;
      this.closeMenu?.();
      const pe = this.pe = { spec, orig: String(spec.value ?? ""), prefs: loadPrefs(), loading: true };
      let cm;
      try { cm = await loadCM(); }
      catch (e) { this.pe = null; return this.toast("Не удалось загрузить редактор: " + (e.message || e), true); }
      if (this.pe !== pe || !this.root) return;
      this.peBuild(cm);
    },

    peBuild(cm) {
      const pe = this.pe, spec = pe.spec, prefs = pe.prefs;
      const { EditorState, EditorSelection, Compartment, Prec, RangeSetBuilder } = cm;
      const { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, highlightSpecialChars, Decoration, ViewPlugin, placeholder, rectangularSelection, crosshairCursor, dropCursor } = cm;
      const refs = () => (pe.refs = this.promptRefs(spec.ctx));
      refs();
      // ---- highlighting: ref tokens (ok / missing / over limit), section keys, [Shot N], <d>…</d>, retention markers
      const deco = (cls) => Decoration.mark({ class: cls });
      const D = { ok: deco("pe-tok"), vid: deco("pe-tok vid"), aud: deco("pe-tok aud"), warn: deco("pe-tok warn"), bad: deco("pe-tok bad"), subj: deco("pe-subj"), key: deco("pe-key"), shot: deco("pe-shot"), dlg: deco("pe-dlg"), ret: deco("pe-ret"), task: deco("pe-task"), var: deco("pe-tok") };
      const HL = new RegExp([
        "<(?:Picture|Video|Audio|Image)\\s*\\d+>", "<Subject\\s*\\d+>", `^[ \\t]*(?:${KEYS.join("|")})(?=[ \\t]*:)`, "\\[Shot\\s*\\d+\\]", "</?d>",
        `\\b(?:${RETAIN.join("|")})\\b`, "\\[(?:reference generation|keyframe completion|video editing|video continuation|audio reuse|audio reference)\\]", "\\{n\\}",
      ].join("|"), "gm");
      const tokClass = (t) => {
        const m = /^<(Picture|Video|Audio|Image)\s*(\d+)>$/.exec(t); if (!m) return null;
        const norm = `<${m[1]} ${m[2]}>`;
        if (m[1] === "Image" || !pe.refs.valid.has(norm)) return spec.ctx.kind === "phrase" ? D.ok : D.bad;
        const it = pe.refs.items.find((r) => r.token === norm);
        if (pe.refs.valid.get(norm) || it?.over) return D.warn;
        return m[1] === "Video" ? D.vid : m[1] === "Audio" ? D.aud : D.ok;
      };
      const build = (view) => {
        const b = new RangeSetBuilder();
        for (const { from, to } of view.visibleRanges) {
          let pos = from;
          while (pos <= to) {
            const line = view.state.doc.lineAt(pos);
            HL.lastIndex = 0; let m;
            while ((m = HL.exec(line.text))) {
              if (!m[0].length) { HL.lastIndex++; continue; }
              const t = m[0], s = line.from + m.index, e = s + t.length;
              let d = tokClass(t);
              if (!d) d = t.startsWith("<Subject") ? D.subj : t.startsWith("[Shot") ? D.shot : /^<\/?d>$/.test(t) ? D.dlg : t === "{n}" ? D.var : t.startsWith("[") ? D.task : RETAIN.includes(t) ? D.ret : D.key;
              const lead = d === D.key ? t.length - t.trimStart().length : 0;
              b.add(s + lead, e, d);
            }
            pos = line.to + 1;
          }
        }
        return b.finish();
      };
      const hl = ViewPlugin.fromClass(class { constructor(v) { this.decorations = build(v); } update(u) { if (u.docChanged || u.viewportChanged || u.transactions.some((t) => t.reconfigured)) this.decorations = build(u.view); } }, { decorations: (v) => v.decorations });
      // ---- @ autocomplete
      const kindIcon = { picture: "▣", auto: "⟶", video: "🎞", audio: "♪", var: "#" };
      const source = (cx) => {
        const bang = pe.refs.subjects?.length ? cx.matchBefore(/(?:^|(?<=[\s(\[]))![\p{L}\p{N}_'-]*/u) : null;
        if (bang) return this.peSubjectCompletion(bang, cx);
        const m = cx.matchBefore(/@[^\s@<>]*/);
        if (!m || (m.from === m.to && !cx.explicit)) return null;
        const q = m.text.slice(1).toLowerCase();
        const items = pe.refs.items.filter((r) => !q || [r.token, r.name, r.sub, KIND_RU[r.kind] || "", r.token.replace(/[<>]/g, "")].some((x) => String(x || "").toLowerCase().includes(q)));
        const opts = items.map((r, k) => ({
          label: r.token, detail: r.name, info: r.sub + (pe.refs.valid.get(r.token) ? " · ⚠ " + pe.refs.valid.get(r.token) : "") + (r.over ? " · ⚠ сверх лимита H3 — не попадёт в генерацию" : ""),
          type: r.kind, boost: -k, _r: r,
          apply: (view, c, from, to) => {
            const before = view.state.sliceDoc(Math.max(0, from - 1), from), after = view.state.sliceDoc(to, to + 1);
            const ins = (before && !/\s/.test(before) ? " " : "") + r.token + (after && /\s/.test(after) ? "" : " ");
            view.dispatch({ changes: { from, to, insert: ins }, selection: { anchor: from + ins.length }, userEvent: "input.complete" });
          },
        }));
        if (!opts.length) opts.push({ label: pe.refs.items.length ? "Ничего не найдено" : "Нет прикреплённых референсов", detail: pe.refs.items.length ? "" : "перетащите ассет в «Референсы»", type: "none", apply: () => {} });
        return { from: m.from, to: cx.pos, options: opts, filter: false };
      };
      const thumbRender = {
        render: (c) => {
          const r = c._r, el = document.createElement("span"); el.className = "pe-ac-th";
          if (r?.thumb) { const im = document.createElement("img"); im.src = r.thumb; im.draggable = false; el.append(im); }
          else el.textContent = r ? kindIcon[r.kind] || "•" : "–";
          return el;
        }, position: 20,
      };
      // ---- compartments for the toggles
      const cWrap = new Compartment(), cLines = new Compartment(), cTheme = new Compartment();
      const theme = () => EditorView.theme({ "&": { fontSize: prefs.size + "px" }, ".cm-content, .cm-gutters": { fontFamily: prefs.mono ? '"JetBrains Mono", "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace' : 'Inter, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif' } });
      const apply = () => { this.closePromptEditor(true); return true; };
      const view = pe.view = new EditorView({
        state: EditorState.create({
          doc: pe.orig,
          extensions: [
            EditorState.phrases.of(PHRASES), EditorState.allowMultipleSelections.of(true), EditorState.tabSize.of(2),
            cm.history(), drawSelection(), dropCursor(), rectangularSelection(), crosshairCursor(), highlightSpecialChars(), highlightActiveLine(), highlightActiveLineGutter(),
            cm.highlightSelectionMatches(), cm.search({ top: true }), cm.closeBrackets(), EditorState.languageData.of(() => [{ closeBrackets: { brackets: ["(", "[", "{"] } }]),
            cm.autocompletion({ override: [source], activateOnTyping: false, icons: false, addToOptions: [thumbRender], closeOnBlur: false, maxRenderedOptions: 60 }),
            Prec.highest(keymap.of([
              { key: "Mod-Enter", run: apply }, { key: "Mod-s", run: apply },
              { key: "Mod-h", run: (v) => { cm.openSearchPanel(v); setTimeout(() => pe.el?.querySelector(".cm-search input[name=replace]")?.focus(), 0); return true; } },
              { key: "Tab", run: (v) => cm.acceptCompletion(v) },
            ])),
            keymap.of([...cm.closeBracketsKeymap, ...cm.completionKeymap, ...cm.searchKeymap, ...cm.historyKeymap, ...cm.defaultKeymap, cm.indentWithTab]),
            placeholder(spec.placeholder || "Пишите промпт… @ — ссылка на референс"),
            cWrap.of(prefs.wrap ? EditorView.lineWrapping : []), cLines.of(prefs.lines ? [lineNumbers()] : []), cTheme.of(theme()),
            hl,
            EditorView.updateListener.of((u) => {
              if (u.docChanged || u.selectionSet) this.peStatus();
              // the list opens on «@» only (activate-on-typing would swallow a quick Esc after any keystroke)
              if (u.docChanged && u.transactions.some((t) => t.isUserEvent("input.type"))) {
                let at = false; u.changes.iterChanges((a, b, c, d, ins) => { const x = ins.toString(); if (x.endsWith("@") || (x.endsWith("!") && pe.refs.subjects?.length)) at = true; });
                if (at) setTimeout(() => cm.startCompletion(u.view), 0);
              }
            }),
            EditorView.contentAttributes.of({ spellcheck: "false", autocorrect: "off", autocapitalize: "off" }),
          ],
        }),
      });
      const recfg = (c, ext) => view.dispatch({ effects: c.reconfigure(ext) });
      // ---- chrome
      const B = (html, title, fn, cls = "") => h("button", { class: "h3z-btn sm " + cls, type: "button", html, title,
        onmousedown: (e) => e.preventDefault(),   // keep the caret (and focus) in the editor
        onclick: (e) => { e.preventDefault(); fn(e); if (!pe.confirm) view.focus(); } });
      const tog = (key, label, title, fn) => { const b = B(label, title, () => { prefs[key] = !prefs[key]; savePrefs(prefs); b.classList.toggle("on", !!prefs[key]); fn(); }); b.classList.toggle("on", !!prefs[key]); return b; };
      const sizeL = h("span", { class: "h3z-note pe-size" }, prefs.size + " px");
      const fsz = (d) => { prefs.size = Math.max(11, Math.min(28, prefs.size + d)); savePrefs(prefs); sizeL.textContent = prefs.size + " px"; recfg(cTheme, theme()); };
      const sel = () => view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
      const tools = h("div", { class: "pe-tools" },
        B("↶", "Отменить (Ctrl+Z)", () => cm.undo(view), "icon"), B("↷", "Повторить (Ctrl+Y / Ctrl+Shift+Z)", () => cm.redo(view), "icon"),
        h("span", { class: "sep" }),
        B("⌕ Найти", "Найти (Ctrl+F)", () => cm.openSearchPanel(view)),
        B("⇄ Заменить", "Найти и заменить (Ctrl+H)", () => { cm.openSearchPanel(view); setTimeout(() => pe.el?.querySelector(".cm-search input[name=replace]")?.focus(), 0); }),
        h("span", { class: "sep" }),
        tog("wrap", "↩ Перенос", "Перенос длинных строк", () => recfg(cWrap, prefs.wrap ? EditorView.lineWrapping : [])),
        tog("lines", "# Строки", "Номера строк", () => recfg(cLines, prefs.lines ? [lineNumbers()] : [])),
        tog("mono", "Моно", "Моноширинный шрифт", () => recfg(cTheme, theme())),
        B("A−", "Шрифт меньше (Ctrl+−)", () => fsz(-1)), sizeL, B("A+", "Шрифт больше (Ctrl+=)", () => fsz(1)),
        h("span", { class: "sep" }),
        B("⧉ Копировать", "Скопировать выделение (или весь текст, если ничего не выделено)", async () => {
          const t = sel() || view.state.doc.toString();
          try { await navigator.clipboard.writeText(t); this.toast(`Скопировано: ${t.length} симв.`); } catch (e) { this.toast("Буфер обмена недоступен: " + (e.message || e), true); }
        }),
        B("⎘ Вставить", "Вставить из буфера обмена (Ctrl+V)", async () => {
          try { const t = await navigator.clipboard.readText(); view.dispatch(view.state.replaceSelection(t)); } catch (e) { this.toast("Браузер не дал прочитать буфер — нажмите Ctrl+V", true); }
          view.focus();
        }),
        B("⌫ Очистить", "Очистить весь текст (отменяется Ctrl+Z)", () => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "" } }), "danger"),
        h("span", { class: "sep" }),
        B("@ Референс", "Вставить ссылку на референс (или наберите @ в тексте)", () => { const r = view.state.selection.main; view.dispatch({ changes: { from: r.from, to: r.to, insert: "@" }, selection: { anchor: r.from + 1 } }); view.focus(); cm.startCompletion(view); }),
        ...(this.peCardTools?.(B) || []),
        h("i", { class: "grow" }),
        tog("side", "☰ Структура H3", "Подсказка по структуре промпта H3", () => pe.el.classList.toggle("noside", !prefs.side)));
      // reference chips (click = insert at the caret)
      const chips = h("div", { class: "pe-refs" }, h("span", { class: "h3z-note" }, pe.refs.note + (pe.refs.items.length ? " · клик — вставить" : "")),
        pe.refs.items.map((r) => h("span", { class: "pe-chip " + r.kind + (pe.refs.valid.get(r.token) || r.over ? " warn" : ""), title: `${r.token} — ${r.name} (${r.sub})` + (pe.refs.valid.get(r.token) ? `\n⚠ ${pe.refs.valid.get(r.token)}` : "") + (r.over ? "\n⚠ сверх лимита H3" : ""),
          onmousedown: (e) => e.preventDefault(), onclick: () => this.peInsert(r.token) },
          r.thumb ? h("img", { src: r.thumb, draggable: "false" }) : h("span", { class: "ic" }, kindIcon[r.kind] || "•"), h("b", null, r.token), h("span", { class: "nm" }, String(r.name || "").slice(0, 28)))),
        !pe.refs.items.length && spec.ctx.kind !== "phrase" ? h("span", { class: "h3z-note" }, "— пока нет: перетащите ассет в «Референсы»") : null);
      // side panel
      const side = h("div", { class: "pe-side" });
      pe.side = side;
      const status = h("div", { class: "pe-status" });
      pe.statusEl = status;
      const el = pe.el = h("div", { class: "h3z-pe-modal" + (prefs.side ? "" : " noside") },
        h("div", { class: "h3z-pe h3z-glass" },
          h("div", { class: "pe-hd" }, h("span", { class: "vtag" }, "Промпт"), h("b", { class: "pe-title" }, spec.title || "Промпт"), h("i", { class: "grow" }),
            h("span", { class: "h3z-note" }, "Ctrl+Enter — применить · Esc — отмена"), B("✕", "Закрыть (Esc)", () => this.closePromptEditor(false), "icon")),
          tools, chips,
          h("div", { class: "pe-body" }, h("div", { class: "pe-ed" }, view.dom), side),
          h("div", { class: "pe-ft" }, status, h("i", { class: "grow" }),
            B("Отмена", "Закрыть без изменений (Esc)", () => this.closePromptEditor(false)),
            B("✓ Применить", "Сохранить текст в поле (Ctrl+Enter)", () => this.closePromptEditor(true), "pri"))));
      // the modal owns the keyboard: keys reach CodeMirror (the editor's window handler steps aside while this.pe
      // is set) and stop here, so ComfyUI shortcuts never see them
      el.addEventListener("keydown", (e) => {
        const ctrl = e.ctrlKey || e.metaKey;
        if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); if (pe.confirm) this.peConfirmClose(false); else this.closePromptEditor(false); }
        else if (ctrl && (e.key === "=" || e.key === "+")) { e.preventDefault(); fsz(1); }
        else if (ctrl && e.key === "-") { e.preventDefault(); fsz(-1); }
        e.stopPropagation();
      });
      for (const ev of ["keyup", "keypress", "paste", "copy", "cut", "wheel", "contextmenu"]) el.addEventListener(ev, (e) => e.stopPropagation(), ev === "wheel" ? { passive: true } : undefined);
      el.addEventListener("pointerdown", (e) => { e.stopPropagation(); if (e.target === el) e.preventDefault(); });
      (this.root || document.body).append(el);
      pe.loading = false;
      this.peSide(); this.peStatus();
      view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length), scrollIntoView: true });
      view.focus();
    },

    peInsert(text, { line = false } = {}) {
      const v = this.pe?.view; if (!v) return;
      const r = v.state.selection.main, st = v.state;
      let ins = text;
      if (line) { const ln = st.doc.lineAt(r.from); if (ln.text.trim() && r.from !== ln.from) ins = "\n" + ins; }
      else {
        const before = st.sliceDoc(Math.max(0, r.from - 1), r.from), after = st.sliceDoc(r.to, r.to + 1);
        ins = (before && !/\s/.test(before) ? " " : "") + ins + (after && /\s/.test(after) ? "" : " ");
      }
      v.dispatch({ changes: { from: r.from, to: r.to, insert: ins }, selection: { anchor: r.from + ins.length }, scrollIntoView: true, userEvent: "input" });
      v.focus();
    },

    /** Words, chars, tokens, cursor, missing refs. */
    peStatus() {
      const pe = this.pe; if (!pe?.view || !pe.statusEl) return;
      const st = pe.view.state, t = st.doc.toString(), c = st.selection.main.head, ln = st.doc.lineAt(c);
      const bad = [], warn = [];
      if (pe.spec.ctx.kind !== "phrase") for (const m of t.matchAll(TOKEN_RE)) {
        const k = `<${m[1]} ${m[2]}>`;
        if (m[1] === "Image") { if (!bad.includes(m[0])) bad.push(m[0]); continue; }
        if (!pe.refs.valid.has(k)) { if (!bad.includes(k)) bad.push(k); }
        else if (pe.refs.valid.get(k) && !warn.includes(k)) warn.push(k);
      }
      const sl = st.selection.main.empty ? "" : ` · выделено ${st.selection.main.to - st.selection.main.from}`;
      pe.statusEl.innerHTML = `<span><b>${words(t)}</b> слов</span><span><b>${t.length}</b> симв.</span><span>≈ <b>${approxTokens(t)}</b> токенов</span><span>строка ${ln.number}, столбец ${c - ln.from + 1}${sl}</span>`
        + (t !== pe.orig ? `<span class="chg">● изменён</span>` : "")
        + (bad.length ? `<span class="bad" title="${esc(bad.some((x) => x.startsWith("<Image")) ? "H3 ждёт <Picture N>, а не <Image N>. " : "")}Такой метки нет среди референсов — H3 получит ссылку в никуда">⚠ нет референса: ${esc(bad.join(", "))}</span>` : "")
        + (this.peCardStatus?.(t) || "")
        + (warn.length ? `<span class="warn" title="${esc(warn.map((k) => k + " — " + pe.refs.valid.get(k)).join("\n"))}">⚠ ${esc(warn.join(", "))}: не во всех отрезках</span>` : "");
      clearTimeout(pe._sideT); pe._sideT = setTimeout(() => this.peSide(), 120);
    },

    /** Structure panel: Russian notes, section status, detailed_description words vs 350–500, template buttons. */
    peSide() {
      const pe = this.pe; if (!pe?.side) return;
      const t = pe.view.state.doc.toString(), secs = parseSections(t);
      const has = new Map(); for (const s of secs) if (!has.has(s.key)) has.set(s.key, s);
      const open = pe.sideOpen || (pe.sideOpen = new Set());
      const sideTop = pe.side.scrollTop;
      pe.side.innerHTML = "";
      const refsForTpl = pe.refs.items.filter((r) => r.kind !== "var");
      const B = (label, title, fn, cls = "") => h("button", { class: "h3z-btn sm " + cls, type: "button", title, onmousedown: (e) => e.preventDefault(), onclick: (e) => { e.preventDefault(); fn(); } }, label);
      pe.side.append(h("div", { class: "pe-sh" }, h("b", null, "Структура промпта H3"), h("span", { class: "h3z-note" }, "Рекомендуемый формат (Full-Reference): разделы по порядку, ключ с двоеточием в начале строки, текст — по-английски.")));
      pe.side.append(h("div", { class: "pe-row" },
        B("⊕ Вставить шаблон", "Вставить скелет всех разделов" + (refsForTpl.length ? " (subject_definitions и retention_analysis заполнятся метками референсов)" : ""), () => this.peTemplate(), "pri"),
        refsForTpl.length ? B("⇣ Метки → subject_definitions", "Добавить в subject_definitions по строке на каждую метку референса, которой там ещё нет", () => this.peFillSubjects()) : null));
      for (const [key, ru, en, help] of SECTIONS) {
        const s = has.get(key);
        let stat;
        if (key === "detailed_description" && s) {
          const w = s.words, cls = w < DESC_MIN ? (w < DESC_MIN * 0.5 ? "bad" : "warn") : w > DESC_MAX ? "warn" : "ok";
          stat = h("span", { class: "pe-wc " + cls, title: "Слов в detailed_description · рекомендуется 350–500" }, h("i", { style: { width: Math.min(100, w / DESC_MAX * 100) + "%" } }), h("b", null, `${w} / ${DESC_MIN}–${DESC_MAX}`));
        } else stat = h("span", { class: "pe-st " + (s ? (s.words ? "ok" : "warn") : "no") }, s ? (s.words ? `✓ ${s.words} сл.` : "пусто") : "нет");
        const row = h("div", { class: "pe-sec" + (open.has(key) ? " open" : "") },
          h("div", { class: "pe-sec-h", title: s ? "Перейти к разделу" : "Вставить раздел у курсора", onmousedown: (e) => e.preventDefault(),
            onclick: () => { if (s) { const v = pe.view; v.dispatch({ selection: { anchor: Math.min(s.from + (t[s.from] === "\n" ? 1 : 0), t.length) }, scrollIntoView: true }); v.focus(); } else this.peInsert(`${key}:\n`, { line: true }); } },
            h("code", null, key + ":"), h("span", { class: "ru" }, ru), h("i", { class: "grow" }), stat,
            h("span", { class: "tg", title: "Подробнее", onmousedown: (e) => e.preventDefault(), onclick: (e) => { e.stopPropagation(); if (open.has(key)) open.delete(key); else open.add(key); this.peSide(); } }, open.has(key) ? "▾" : "▸")),
          h("div", { class: "pe-sec-en h3z-note" }, en),
          open.has(key) ? h("div", { class: "pe-sec-b" }, help,
            key === "summary" ? h("div", { class: "pe-ins" }, TASKS.map((x) => h("span", { class: "pe-mini", title: "Вставить у курсора", onmousedown: (e) => e.preventDefault(), onclick: () => this.peInsert(x) }, x))) : null,
            key === "retention_analysis" ? h("div", { class: "pe-ins" }, RETAIN.map((x) => h("span", { class: "pe-mini", title: "Вставить у курсора", onmousedown: (e) => e.preventDefault(), onclick: () => this.peInsert(x) }, x))) : null,
            key === "detailed_description" ? h("div", { class: "pe-ins" }, ["[Shot 1]", "[Shot 2] At 00:03.000", "<Subject 1> (S1) says:\n<d>[English] </d>"].map((x) => h("span", { class: "pe-mini", title: "Вставить у курсора", onmousedown: (e) => e.preventDefault(), onclick: () => this.peInsert(x) }, x.split("\n")[0]))) : null) : null);
        pe.side.append(row);
      }
      const order = secs.map((s) => KEYS.indexOf(s.key)), unordered = order.some((x, i) => i && x < order[i - 1]);
      const dup = KEYS.filter((k) => secs.filter((s) => s.key === k).length > 1);
      if (unordered || dup.length) pe.side.append(h("div", { class: "h3z-note warn" }, unordered ? "⚠ Разделы не по порядку — H3 обучен на порядке сверху вниз. " : "", dup.length ? `⚠ Повтор: ${dup.join(", ")}` : ""));
      pe.side.append(h("div", { class: "pe-sh" }, h("b", null, "Метки"), h("span", { class: "h3z-note" },
        "<Picture N>, <Video N>, <Audio N> — номера идут в порядке референсов (картинки: персонажи → локации → другое). <Subject N> — своя метка персонажа/объекта: опишите её в subject_definitions. Наберите @, чтобы выбрать референс из списка.")));
      pe.side.scrollTop = sideTop;
    },

    peTemplate() {
      const pe = this.pe, v = pe.view, t = v.state.doc.toString();
      const refs = pe.refs.items.filter((r) => r.kind !== "var").map((r) => ({ token: r.token, name: r.kind === "auto" ? "last frame of the previous shot" : pe.refs.global ? "" : r.name, kind: r.kind }));
      const isCont = pe.refs.items.some((r) => r.kind === "auto"), hasVid = pe.refs.items.some((r) => r.kind === "video");
      const task = pe.spec.ctx.kind === "region" ? "[video editing]" : isCont ? "[video continuation]" : hasVid ? "[reference generation]" : "[reference generation]";
      const tpl = promptTemplate(refs, { task });
      if (!t.trim()) v.dispatch({ changes: { from: 0, to: t.length, insert: tpl }, selection: { anchor: tpl.indexOf("—") + 2 } });
      else {
        // keep the existing text: it goes into detailed_description of the skeleton, nothing is lost
        const at = tpl.indexOf("[Shot 1] ") + "[Shot 1] ".length, full = tpl.slice(0, at) + t.trim() + tpl.slice(at);
        v.dispatch({ changes: { from: 0, to: t.length, insert: full }, selection: { anchor: full.indexOf("—") + 2 } });
        this.toast("Шаблон вставлен, прежний текст перенесён в detailed_description (Ctrl+Z — отменить)");
      }
      v.focus();
    },

    peFillSubjects() {
      const pe = this.pe, v = pe.view, t = v.state.doc.toString();
      const s = parseSections(t).find((x) => x.key === "subject_definitions");
      const items = pe.refs.items.filter((r) => r.kind !== "var");
      const lines = (body) => items.filter((r) => !body.includes(r.token)).map((r) => `${r.token} — ${r.kind === "auto" ? "last frame of the previous shot: " : pe.refs.global || !r.name ? "" : r.name + ": "}`);
      if (!s) {
        const add = `subject_definitions:\n${lines("").join("\n")}\n\n`;
        v.dispatch({ changes: { from: 0, insert: add }, selection: { anchor: add.indexOf("—") + 2 }, scrollIntoView: true });
      } else {
        const L = lines(s.body); if (!L.length) { this.toast("Все метки уже есть в subject_definitions"); return; }
        let at = s.to; while (at > s.from && /\s/.test(t[at - 1])) at--;
        const ins = (at > s.from ? "\n" : "\n") + L.join("\n");
        v.dispatch({ changes: { from: at, insert: ins }, selection: { anchor: at + ins.length }, scrollIntoView: true });
      }
      v.focus();
    },

    /** ok = apply. A changed text closed without applying asks first. */
    closePromptEditor(ok) {
      const pe = this.pe; if (!pe) return;
      if (pe.loading) { this.pe = null; return; }
      let text = pe.view.state.doc.toString();
      if (ok && this.peExpandBangs) text = this.peExpandBangs(text);
      if (!ok && text !== pe.orig && !pe.confirm) return this.peAskClose();
      if (ok && text !== pe.orig) { try { pe.spec.apply(text); } catch (e) { this.toast("Не удалось сохранить промпт: " + (e.message || e), true); return; } }
      pe.view.destroy(); pe.el.remove(); this.pe = null;
      this.focusSink?.();
    },
    peAskClose() {
      const pe = this.pe;
      const bar = pe.confirm = h("div", { class: "pe-confirm h3z-glass" }, h("b", null, "Текст изменён. Закрыть без сохранения?"),
        h("button", { class: "h3z-btn sm pri", onclick: () => this.peConfirmClose("save") }, "✓ Применить"),
        h("button", { class: "h3z-btn sm danger", onclick: () => this.peConfirmClose("drop") }, "Не сохранять"),
        h("button", { class: "h3z-btn sm", onclick: () => this.peConfirmClose(false) }, "Вернуться (Esc)"));
      pe.el.querySelector(".h3z-pe").append(bar);
      bar.querySelector(".pri").focus();
    },
    peConfirmClose(what) {
      const pe = this.pe; if (!pe?.confirm) return;
      pe.confirm.remove(); pe.confirm = null;
      if (what === "save") this.closePromptEditor(true);
      else if (what === "drop") { pe.view.destroy(); pe.el.remove(); this.pe = null; this.focusSink?.(); }
      else pe.view.focus();
    },
  });
}

export const PE_CSS = String.raw`
.h3z-pe-btn { height:24px !important; padding:0 9px !important; font-size:11.5px !important; margin-left:auto; }
.h3z-lbl .h3z-pe-btn { margin-left:8px; text-transform:none; letter-spacing:0; flex:none; }
.h3z-lbl:has(.h3z-pe-btn) { justify-content:flex-start; } .h3z-lbl:has(.h3z-pe-btn) em { margin-left:auto; }
.h3z-pe-modal { position:fixed; inset:0; z-index:100500; display:flex; align-items:center; justify-content:center; background:rgba(2,6,23,.62); backdrop-filter:blur(4px); padding:24px; }
.h3z-pe { position:relative; width:min(2300px, 100%); height:100%; display:flex; flex-direction:column; gap:12px; padding:14px 16px; border-radius:18px; min-height:0; background:rgba(12,16,32,.96); }
.h3z-pe .grow { flex:1; }
.h3z-pe .pe-hd { display:flex; align-items:center; gap:12px; min-width:0; }
.h3z-pe .vtag { font-size:10.5px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; padding:2px 8px; border-radius:6px; background:var(--grad); color:#fff; }
.h3z-pe .pe-title { font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.h3z-pe .pe-tools { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.h3z-pe .pe-tools .sep { width:1px; height:22px; background:var(--line2); margin:0 6px; }
.h3z-pe .h3z-btn.on { background:var(--grad); color:#fff; border-color:transparent; }
.h3z-pe .h3z-btn.pri { background:var(--grad); color:#fff; border-color:transparent; }
.h3z-pe .h3z-btn.danger:hover { color:var(--err); border-color:rgba(251,113,133,.5); }
.h3z-pe .pe-size { min-width:40px; text-align:center; font-variant-numeric:tabular-nums; }
.h3z-pe .pe-refs { display:flex; align-items:center; gap:8px; flex-wrap:wrap; min-height:34px; }
.h3z-pe .pe-chip { display:inline-flex; align-items:center; gap:7px; height:32px; padding:0 10px 0 3px; border-radius:10px; border:1px solid var(--line2); background:rgba(148,163,255,.06); cursor:pointer; font-size:12px; transition:.12s; }
.h3z-pe .pe-chip:hover { border-color:var(--a2); background:rgba(34,211,238,.08); }
.h3z-pe .pe-chip img, .h3z-pe .pe-chip .ic { width:26px; height:26px; border-radius:7px; object-fit:cover; display:inline-flex; align-items:center; justify-content:center; background:rgba(5,7,15,.6); }
.h3z-pe .pe-chip b { color:#c4b5fd; font-family:"JetBrains Mono", Consolas, monospace; font-size:11.5px; }
.h3z-pe .pe-chip.video b { color:#67e8f9; } .h3z-pe .pe-chip.audio b { color:#f9a8d4; } .h3z-pe .pe-chip.warn { border-color:rgba(251,191,36,.5); }
.h3z-pe .pe-chip .nm { color:var(--mut); max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.h3z-pe .pe-body { flex:1; min-height:0; display:grid; grid-template-columns:minmax(0,1fr) 440px; gap:12px; }
.h3z-pe-modal.noside .pe-body { grid-template-columns:minmax(0,1fr); } .h3z-pe-modal.noside .pe-side { display:none; }
.h3z-pe .pe-ed { min-height:0; min-width:0; border:1px solid var(--line2); border-radius:12px; overflow:hidden; background:rgba(5,7,15,.6); display:flex; }
.h3z-pe .pe-ed:focus-within { border-color:var(--a1); box-shadow:0 0 0 3px rgba(139,92,246,.16); }
.h3z-pe .cm-editor { flex:1; height:100%; color:var(--txt); background:transparent; }
.h3z-pe .cm-editor.cm-focused { outline:none; }
.h3z-pe .cm-scroller { line-height:1.6; }
.h3z-pe .cm-content { padding:12px 0; caret-color:#fff; }
.h3z-pe .cm-line { padding:0 14px; }
.h3z-pe .cm-gutters { background:rgba(5,7,15,.5); color:var(--mut2); border-right:1px solid var(--line); }
.h3z-pe .cm-activeLineGutter { background:rgba(139,92,246,.14); color:var(--txt); }
.h3z-pe .cm-activeLine { background:rgba(148,163,255,.045); }
.h3z-pe .cm-cursor { border-left:2px solid #fff; }
.h3z-pe .cm-selectionBackground, .h3z-pe .cm-focused .cm-selectionBackground, .h3z-pe .cm-content ::selection { background:rgba(139,92,246,.38) !important; }
.h3z-pe .cm-selectionMatch { background:rgba(34,211,238,.16); }
.h3z-pe .cm-searchMatch { background:rgba(251,191,36,.25); outline:1px solid rgba(251,191,36,.5); } .h3z-pe .cm-searchMatch-selected { background:rgba(251,191,36,.5); }
.h3z-pe .cm-placeholder { color:var(--mut2); }
.h3z-pe .cm-panels { background:rgba(17,22,42,.98); color:var(--txt); border-color:var(--line2) !important; }
.h3z-pe .cm-search { display:flex; flex-wrap:wrap; align-items:center; gap:6px; padding:8px 12px !important; font-size:12px; }
.h3z-pe .cm-search br { display:none; }
.h3z-pe .cm-search input.cm-textfield { background:rgba(5,7,15,.7); border:1px solid var(--line2); color:var(--txt); border-radius:8px; padding:5px 9px; font:inherit; min-width:240px; }
.h3z-pe .cm-search input.cm-textfield:focus { outline:none; border-color:var(--a1); }
.h3z-pe .cm-search .cm-button { background:rgba(148,163,255,.08); background-image:none; border:1px solid var(--line2); color:var(--txt); border-radius:8px; padding:4px 10px; font:inherit; cursor:pointer; }
.h3z-pe .cm-search label { display:inline-flex; align-items:center; gap:4px; color:var(--mut); }
.h3z-pe .cm-panel.cm-search [name=close] { color:var(--mut); font-size:18px; position:static; margin-left:auto; }
.h3z-pe .pe-tok { color:#c4b5fd; background:rgba(139,92,246,.18); border-radius:5px; padding:0 2px; font-weight:600; }
.h3z-pe .pe-tok.vid { color:#67e8f9; background:rgba(34,211,238,.14); } .h3z-pe .pe-tok.aud { color:#f9a8d4; background:rgba(236,72,153,.14); }
.h3z-pe .pe-tok.warn { color:var(--warn); background:rgba(251,191,36,.14); text-decoration:underline dotted; }
.h3z-pe .pe-tok.bad { color:var(--err); background:rgba(251,113,133,.14); text-decoration:underline wavy var(--err); }
.h3z-pe .pe-subj { color:#a7f3d0; font-weight:600; }
.h3z-pe .pe-key { color:#fbbf24; font-weight:800; }
.h3z-pe .pe-shot { color:#22d3ee; font-weight:700; }
.h3z-pe .pe-dlg { color:#f472b6; font-weight:700; }
.h3z-pe .pe-ret { color:#34d399; } .h3z-pe .pe-task { color:#a78bfa; font-weight:700; }
.h3z-pe .cm-tooltip { background:rgba(12,16,32,.98); border:1px solid var(--line2); border-radius:10px; color:var(--txt); box-shadow:0 14px 40px rgba(0,0,0,.55); overflow:hidden; }
.h3z-pe .cm-tooltip-autocomplete > ul { font-family:inherit !important; max-height:340px !important; min-width:420px; }
.h3z-pe .cm-tooltip-autocomplete > ul > li { display:flex; align-items:center; gap:10px; padding:5px 10px !important; line-height:1.3; }
.h3z-pe .cm-tooltip-autocomplete > ul > li[aria-selected] { background:var(--grad) !important; color:#fff !important; }
.h3z-pe .pe-ac-th { width:36px; height:36px; flex:none; border-radius:8px; overflow:hidden; display:inline-flex; align-items:center; justify-content:center; background:rgba(5,7,15,.6); font-size:16px; }
.h3z-pe .pe-ac-th img { width:100%; height:100%; object-fit:cover; }
.h3z-pe .cm-completionLabel { font-family:"JetBrains Mono", Consolas, monospace; font-weight:700; font-size:12.5px; }
.h3z-pe .cm-completionDetail { margin-left:4px; font-style:normal; opacity:.8; max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.h3z-pe .cm-completionInfo { background:rgba(12,16,32,.98); border:1px solid var(--line2); border-radius:8px; padding:6px 10px; color:var(--mut); max-width:340px; }
.h3z-pe .pe-side { min-height:0; overflow:auto; display:flex; flex-direction:column; gap:10px; padding:12px; border:1px solid var(--line); border-radius:12px; background:rgba(5,7,15,.35); scrollbar-width:thin; }
.h3z-pe .pe-sh { display:flex; flex-direction:column; gap:4px; } .h3z-pe .pe-sh b { font-size:13px; }
.h3z-pe .pe-row { display:flex; gap:8px; flex-wrap:wrap; }
.h3z-pe .pe-sec { border:1px solid var(--line); border-radius:10px; background:rgba(148,163,255,.035); }
.h3z-pe .pe-sec-h { display:flex; align-items:center; gap:8px; padding:7px 10px 2px; cursor:pointer; }
.h3z-pe .pe-sec-h:hover code { text-decoration:underline; }
.h3z-pe .pe-sec code { color:#fbbf24; font-weight:800; font-family:"JetBrains Mono", Consolas, monospace; font-size:12px; }
.h3z-pe .pe-sec .ru { color:var(--txt); font-size:12px; }
.h3z-pe .pe-sec .tg { width:20px; text-align:center; color:var(--mut); cursor:pointer; }
.h3z-pe .pe-sec-en { padding:0 10px 7px; font-size:11.5px; font-style:italic; }
.h3z-pe .pe-sec-b { padding:0 10px 10px; font-size:12px; line-height:1.5; color:#cdd3f5; }
.h3z-pe .pe-ins { display:flex; flex-wrap:wrap; gap:5px; margin-top:7px; }
.h3z-pe .pe-mini { font-family:"JetBrains Mono", Consolas, monospace; font-size:11px; padding:2px 7px; border-radius:6px; border:1px solid var(--line2); cursor:pointer; color:#c4b5fd; }
.h3z-pe .pe-mini:hover { border-color:var(--a2); }
.h3z-pe .pe-st { font-size:11px; font-weight:700; padding:1px 7px; border-radius:999px; white-space:nowrap; }
.h3z-pe .pe-st.ok { color:var(--ok); background:rgba(52,211,153,.1); } .h3z-pe .pe-st.warn { color:var(--warn); background:rgba(251,191,36,.1); } .h3z-pe .pe-st.no { color:var(--mut2); background:rgba(148,163,255,.06); }
.h3z-pe .pe-wc { position:relative; width:118px; height:20px; border-radius:999px; background:rgba(148,163,255,.08); overflow:hidden; display:inline-flex; align-items:center; justify-content:center; }
.h3z-pe .pe-wc i { position:absolute; left:0; top:0; bottom:0; background:rgba(52,211,153,.35); }
.h3z-pe .pe-wc.warn i { background:rgba(251,191,36,.35); } .h3z-pe .pe-wc.bad i { background:rgba(251,113,133,.35); }
.h3z-pe .pe-wc b { position:relative; font-size:11px; font-variant-numeric:tabular-nums; }
.h3z-pe .h3z-note.warn { color:var(--warn); }
.h3z-pe .pe-ft { display:flex; align-items:center; gap:10px; }
.h3z-pe .pe-status { display:flex; align-items:center; gap:16px; flex-wrap:wrap; color:var(--mut); font-size:12px; font-variant-numeric:tabular-nums; }
.h3z-pe .pe-status b { color:var(--txt); } .h3z-pe .pe-status .bad { color:var(--err); } .h3z-pe .pe-status .warn { color:var(--warn); } .h3z-pe .pe-status .chg { color:var(--a2); }
.h3z-pe .pe-confirm { position:absolute; left:50%; bottom:64px; transform:translateX(-50%); display:flex; align-items:center; gap:10px; padding:12px 14px; border-radius:12px; border:1px solid rgba(251,191,36,.45); box-shadow:0 18px 50px rgba(0,0,0,.6); z-index:5; }
`;

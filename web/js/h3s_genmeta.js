import { T } from "./h3s_i18n.js";
// Generation params dialog + «Повторить»: show stored take/gallery metadata and restore inputs.
// Ideas for «Повторить» / params peek cheerfully borrowed from the best app and developer
// in the world — https://github.com/EvgenRublev/Minimax_Studio (GPL-3.0). Own UI code.

/** Build a displayable meta object from a take (or gallery entry + optional take). */
export function buildGenMeta(editor, { segIndex = null, take = null, gallery = null, region = null } = {}) {
  const s = segIndex != null ? editor.seg(segIndex) : null;
  const t = take || (s && (s.takes || []).find((x) => x.id === s.active_take)) || null;
  const r = t?.result || s?.result || gallery || null;
  const snap = t?.snap || (region ? region : s) || {};
  const psnap = t?.psnap || {};
  const st = psnap.settings || editor.p.settings || {};
  const models = r?.models || gallery?.models || null;
  const mp = psnap.mp || null;
  const prompt = (snap.prompt != null ? snap.prompt : s?.prompt) || gallery?.prompt || "";
  const seed = t?.seed ?? r?.seed ?? gallery?.seed;
  const frames = r?.frames ?? snap.frames ?? s?.frames;
  const wh = r?.wh || gallery?.wh || null;
  const up = snap.upscale || r?.upscale || gallery?.upscale || null;
  const kind = r?.kind || gallery?.kind || "";
  const created = t?.created || r?.created || gallery?.created || null;
  const refs = snap.refs || s?.refs || [];
  const cards = snap.cards || s?.cards || [];
  const accel = st.accel || null;
  const ov = snap.overrides || {};
  return {
    prompt, seed, frames, wh, kind, created, models, mp, up, refs, cards, accel, ov, st,
    sampler: ov.sampler || st.sampler, scheduler: ov.scheduler || st.scheduler,
    steps: ov.steps || st.steps, cfg: ov.cfg || st.cfg, denoise: ov.denoise || st.denoise,
    fps: 24, segIndex, takeId: t?.id || null, galleryId: gallery?.id || null,
    regionId: region?.id || null, up_input: r?.up_input || gallery?.up_input || null,
  };
}

export function installGenMeta(Editor, { C, h, ICON }) {
  Object.assign(Editor.prototype, {
    genMetaOf(i) {
      const s = this.seg(i); if (!s?.result && !(s?.takes || []).length) return null;
      return buildGenMeta(this, { segIndex: i });
    },

    /** Right-click → «ℹ Параметры генерации» */
    openGenMeta(opts) {
      const meta = opts.meta || buildGenMeta(this, opts);
      if (!meta) { this.toast(T("Нет сохранённых параметров генерации"), true); return; }
      this._genMetaModal?.remove();
      const close = () => { this._genMetaModal?.remove(); this._genMetaModal = null; };
      const row = (lab, val) => val == null || val === "" ? null
        : h("div", { class: "h3z-gm-row" }, h("div", { class: "h3z-gm-k" }, lab), h("div", { class: "h3z-gm-v" }, val));
      const promptBox = h("textarea", { class: "h3z-ta", readonly: "readonly", spellcheck: "false", style: { minHeight: "110px" } });
      promptBox.value = meta.prompt || "";
      const refThumbs = h("div", { class: "h3z-gm-refs" });
      for (const id of meta.refs || []) {
        const a = this.p.assets.find((x) => x.id === id);
        if (!a) continue;
        refThumbs.append(h("div", { class: "h3z-gm-thumb", title: a.name },
          a.category === "audio" ? h("span", null, "♪") : h("img", { src: this.assetUrl(a) }),
          h("em", null, a.name.slice(0, 18))));
      }
      const loras = (meta.models?.loras || []).map((l) => Array.isArray(l)
        ? `${l[0]} · m${l[1] ?? 1} / c${l[2] ?? 1}` : String(l));
      const upTxt = meta.up ? (C.UPSCALE_LABELS?.[meta.up.method] || meta.up.method) + (meta.up.mp != null ? T(" · {0} Мп", meta.up.mp) : "") + (meta.up.sigma != null ? ` · σ ${meta.up.sigma}` : "") : "";
      const accelTxt = meta.accel ? [
        meta.accel.attention && meta.accel.attention !== "auto" ? meta.accel.attention : null,
        meta.accel.veda ? "Veda" : null,
        meta.accel.teacache ? "TeaCache" : null,
        meta.accel.compile ? "torch.compile" : null,
      ].filter(Boolean).join(", ") : "";
      const when = meta.created ? new Date(meta.created * 1000).toLocaleString() : "";
      const box = h("div", { class: "h3z-save h3z-glass h3z-gm" },
        h("div", { class: "hd" }, h("b", null, T("ℹ Параметры генерации")),
          h("div", { class: "grow" }),
          h("button", { class: "h3z-btn sm icon", onclick: close }, "✕")),
        h("div", { class: "h3z-gm-body" },
          h("div", { class: "h3z-lbl" }, T("Промпт")), promptBox,
          row(T("Режим"), meta.kind || "—"),
          row(T("Пресет / модель"), meta.models ? `${meta.models.preset || "—"} · ${meta.models.base || ""}` : (meta.mp?.name || "—")),
          loras.length ? row("LoRA", loras.join("\n")) : null,
          refThumbs.childNodes.length ? h("div", null, h("div", { class: "h3z-lbl" }, T("Референсы")), refThumbs) : null,
          row(T("Сид"), meta.seed != null ? String(meta.seed) : "—"),
          row(T("Шаги / сэмплер"), `${meta.steps ?? "—"} · ${meta.sampler || "—"} / ${meta.scheduler || "—"}`),
          row(T("Длина / fps / разрешение"), T("{0} кадр. · {1} fps", meta.frames ?? "—", meta.fps) + (meta.wh ? ` · ${meta.wh[0]}×${meta.wh[1]}` : "")),
          upTxt ? row(T("Апскейл"), upTxt + (meta.up_input ? ` · ${meta.up_input}` : "")) : null,
          accelTxt ? row(T("Ускорители"), accelTxt) : null,
          when ? row(T("Время"), when) : null),
        h("div", { class: "h3z-row wrap", style: { justifyContent: "flex-end", gap: "8px" } },
          h("button", { class: "h3z-btn sm", onclick: async () => {
            try { await navigator.clipboard.writeText(meta.prompt || ""); this.toast(T("Промпт скопирован")); }
            catch (e) { this.toast(T("Не удалось скопировать"), true); }
          } }, T("📋 Копировать промпт")),
          h("button", { class: "h3z-btn sm primary", onclick: () => { this.repeatFromMeta(meta); close(); } }, T("↺ Повторить")),
          h("button", { class: "h3z-btn sm", onclick: close }, T("Закрыть"))));
      const modal = this._genMetaModal = h("div", { class: "h3z-modal" }, box);
      modal.addEventListener("pointerdown", (e) => { if (e.target === modal) close(); });
      box.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") close(); });
      (this.root || document.body).append(modal);
      box.tabIndex = -1; box.focus?.();
    },

    /** Restore prompt/refs/mode/preset/settings from meta onto the target clip (or selected). */
    repeatFromMeta(meta) {
      const i = meta.segIndex != null ? meta.segIndex : this.sel;
      if (i == null || i < 0 || !this.seg(i)) { this.toast(T("Нет отрезка для «Повторить»"), true); return; }
      if (this.seg(i)?.freeze) { this.toast(T("Отрезок зафиксирован — разморозьте, чтобы менять"), true); return; }
      this.mutate((p) => {
        const s = p.segments[i];
        if (meta.prompt != null) s.prompt = meta.prompt;
        if (Array.isArray(meta.refs)) s.refs = [...meta.refs];
        if (Array.isArray(meta.cards)) s.cards = JSON.parse(JSON.stringify(meta.cards));
        if (meta.up) s.upscale = JSON.parse(JSON.stringify(meta.up));
        if (meta.ov && typeof meta.ov === "object") s.overrides = JSON.parse(JSON.stringify(meta.ov));
        if (meta.mp?.id) s.model_preset = meta.mp.id;
        // project-level bits the take was made with (mode / seed base / accel) — soft apply
        if (meta.st && typeof meta.st === "object") {
          for (const k of ["final_mode", "steps", "cfg", "denoise", "sampler", "scheduler", "accel", "seed"]) {
            if (meta.st[k] != null) p.settings[k] = JSON.parse(JSON.stringify(meta.st[k]));
          }
        }
      });
      this.toast(T("Параметры генерации восстановлены · отрезок {0}", i + 1));
    },
  });
}

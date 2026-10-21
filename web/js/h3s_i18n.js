// H3ZeroStudio UI language. The Russian source string is the key: t("Текст {0}", x) → EN from h3s_i18n_en.js, else
// the Russian text (fallback). Pure module (no DOM needed) so node tests and h3s_core.js can use it.
import EN from "./h3s_i18n_en.js";

const KEY = "h3zs.lang";          // "auto" | "ru" | "en" (global, every project)
const AUTO = "h3zs.lang.auto";    // the ComfyUI locale seen last time (Comfy.Locale), for «Авто» before settings load
const ls = () => { try { return globalThis.localStorage || null; } catch { return null; } };

export const LANGS = ["auto", "ru", "en"];
export function langSetting() { const v = ls()?.getItem(KEY); return LANGS.includes(v) ? v : "auto"; }
function resolve(set) {
  if (set === "ru" || set === "en") return set;
  if (!ls()) return "ru";   // node (tests, core parity): the Russian source
  const loc = ls()?.getItem(AUTO) || globalThis.navigator?.language || "ru";
  return /^ru\b/i.test(loc) ? "ru" : "en";
}
let LANG = resolve(langSetting());
export const lang = () => LANG;
/** Persist the choice; returns true when the UI language actually changed (the editor then rebuilds / asks to reload). */
export function setLangSetting(v) { ls()?.setItem(KEY, LANGS.includes(v) ? v : "auto"); return resolve(langSetting()) !== LANG; }   // applies on reload (texts built at load)
/** ComfyUI's own locale (Comfy.Locale), read once the app settings are loaded; used by «Авто». */
export function noteComfyLocale(loc) {   // the page keeps its language; «Авто» follows it from the next load on
  if (!loc) return false; ls()?.setItem(AUTO, String(loc)); return langSetting() === "auto" && resolve("auto") !== LANG;
}
export function setLangForTests(l) { LANG = l; }

const fill = (s, a) => (a.length ? s.replace(/\{(\d+)\}/g, (m, i) => (a[i] === undefined ? m : a[i])) : s);
/** Translate a Russian source string; {0}, {1}… are filled from the arguments. */
export function t(ru, ...a) {
  const s = LANG === "en" ? (EN[ru] ?? ru) : ru;
  return fill(s, a);
}
/** Plural: Russian 3 forms (1 / 2–4 / 5+); English uses the first and the third translated. */
export function plural(n, one, few, many) {
  n = Math.abs(Number(n) || 0);
  if (LANG === "en") return n === 1 ? one : many;
  const m = n % 10, mm = n % 100;
  return m === 1 && mm !== 11 ? one : m >= 2 && m <= 4 && (mm < 10 || mm >= 20) ? few : many;
}

const SRV_FIELDS = new Set(["error", "message", "what", "stage", "label", "text", "err", "note", "msg", "reason", "status_text", "detail", "hint"]);
/** Translate the human-readable fields of a server payload (progress / run status) in place. */
export function tDeep(o, depth = 3) {
  if (LANG !== "en" || !o || typeof o !== "object" || depth < 0) return o;
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === "string") { if (SRV_FIELDS.has(k)) o[k] = tServer(v); }
    else if (v && typeof v === "object") tDeep(v, depth - 1);
  }
  return o;
}
// Server messages arrive in Russian (h3s_*.py): exact keys, or keys with {0}… holes matched as patterns.
let PAT = null;
const esc = (s) => s.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
export function tServer(msg) {
  if (LANG !== "en" || !msg || !/[А-Яа-яЁё]/.test(msg)) return msg;
  msg = String(msg);
  if (EN[msg] !== undefined) return EN[msg];
  if (!PAT) PAT = Object.keys(EN).filter((k) => /\{\d+\}/.test(k) && /[А-Яа-яЁё]{3}/.test(k.replace(/\{\d+\}/g, ""))).sort((a, b) => b.replace(/\{\d+\}/g, "").length - a.replace(/\{\d+\}/g, "").length).map((k) => {
    const parts = k.split(/(\{\d+\})/), idx = [];
    const re = parts.map((p) => { const m = /^\{(\d+)\}$/.exec(p); if (m) { idx.push(+m[1]); return "([\\s\\S]*?)"; } return esc(p).replace(/\{/g, "\\{").replace(/\}/g, "\\}"); }).join("");
    return { re: new RegExp("^" + re + "$"), idx, en: EN[k] };
  });
  // longest literal parts first: the most specific pattern wins
  for (const p of PAT) { const m = p.re.exec(msg); if (m) { const a = []; p.idx.forEach((i, j) => { a[i] = tServer(m[j + 1]); }); return fill(p.en, a); } }
  // composite messages ("Не создалась: <server text>") — translate the pieces around ": "
  const i = msg.indexOf(": ");
  if (i > 0) { const h = msg.slice(0, i + 2), r = msg.slice(i + 2); const th = EN[h] ?? EN[h.trim()], tr = tServer(r); if (th !== undefined || tr !== r) return (th !== undefined ? th + (th.endsWith(" ") ? "" : " ") : h) + tr; }
  return msg;
}
export const T = t;

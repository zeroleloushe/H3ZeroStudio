import { T, lang } from "./h3s_i18n.js";

const KEY = "h3zs.theme";

export const UI_THEMES = [
  { id: "neon", name: T("Неон"), description: T("Фирменная фиолетово-голубая тема"), swatches: ["#8b5cf6", "#22d3ee", "#0a0e1c"] },
  { id: "graphite", name: T("Графит"), description: T("Нейтральный серый со спокойным синим акцентом"), swatches: ["#7aa2f7", "#a0a8ff", "#11151c"] },
  { id: "ocean", name: T("Океан"), description: T("Глубокий синий с бирюзовыми акцентами"), swatches: ["#2dd4bf", "#38bdf8", "#0b2025"] },
  { id: "porcelain", name: T("Фарфор"), description: T("Светлая тема для яркого окружения"), swatches: ["#5b5bd6", "#0284c7", "#f4f6fa"] },
  { id: "sunset", name: T("Закат"), description: T("Тёплый графит с янтарными акцентами"), swatches: ["#fb923c", "#f472b6", "#1d1212"] },
];

/** Extra themes loaded from /h3zero/themes (drop-in packs). */
let _plugins = [];
let _warnings = [];

export function pluginThemes() { return _plugins; }
export function themeWarnings() { return _warnings; }

export function allThemes() {
  return UI_THEMES.concat(_plugins.map((p) => ({
    id: p.id,
    name: (lang() === "en" ? (p.name_en || p.name_ru) : (p.name_ru || p.name_en)) || p.id,
    description: (lang() === "en" ? (p.description_en || p.description_ru) : (p.description_ru || p.description_en)) || "",
    swatches: p.swatches || ["#c0c0c0", "#000080", "#008080"],
    plugin: true,
    base: p.base || "dark",
    css: p.css,
  })));
}

export function themeSetting() {
  try {
    const value = localStorage.getItem(KEY);
    if (allThemes().some((theme) => theme.id === value)) return value;
  } catch {}
  return "neon";
}

function _ensurePluginCss(theme) {
  if (!theme?.plugin || !theme.css) return;
  const id = "h3z-theme-" + theme.id;
  let link = document.getElementById(id);
  if (!link) {
    link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    document.documentElement.appendChild(link);
  }
  if (link.getAttribute("href") !== theme.css) link.setAttribute("href", theme.css);
}

export function applyTheme(value, save = false) {
  const themes = allThemes();
  const id = value === undefined ? themeSetting() : themes.some((theme) => theme.id === value) ? value : "neon";
  if (save) { try { localStorage.setItem(KEY, id); } catch {} }
  const theme = themes.find((t) => t.id === id) || themes[0];
  if (typeof document !== "undefined") {
    document.documentElement.dataset.h3zTheme = id;
    const scheme = theme.base === "light" || id === "porcelain" ? "light" : "dark";
    document.documentElement.style.colorScheme = scheme;
    // drop CSS of other plugins; keep the active one
    const qsa = document.querySelectorAll?.bind(document);
    if (qsa) {
      for (const el of [...qsa("link[id^='h3z-theme-']")]) {
        if (el.id !== "h3z-theme-" + id) el.remove();
      }
    }
    _ensurePluginCss(theme);
  }
  return id;
}

/** Fetch drop-in packs; call once after the editor host is ready (and after Ctrl+F5). */
export async function loadPluginThemes(fetcher) {
  try {
    const data = typeof fetcher === "function" ? await fetcher() : null;
    const body = data || {};
    _plugins = Array.isArray(body.themes) ? body.themes.filter((t) => t && t.id && t.css) : [];
    _warnings = Array.isArray(body.warnings) ? body.warnings : [];
  } catch (e) {
    _plugins = [];
    _warnings = [String(e?.message || e)];
  }
  // re-apply so a previously saved plugin theme gets its CSS after reload
  applyTheme(themeSetting(), false);
  return { themes: _plugins, warnings: _warnings };
}

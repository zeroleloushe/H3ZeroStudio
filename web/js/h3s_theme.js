import { T } from "./h3s_i18n.js";

const KEY = "h3zs.theme";

export const UI_THEMES = [
  { id: "neon", name: T("Неон"), description: T("Фирменная фиолетово-голубая тема"), swatches: ["#8b5cf6", "#22d3ee", "#0a0e1c"] },
  { id: "graphite", name: T("Графит"), description: T("Нейтральный серый со спокойным синим акцентом"), swatches: ["#7aa2f7", "#a0a8ff", "#11151c"] },
  { id: "ocean", name: T("Океан"), description: T("Глубокий синий с бирюзовыми акцентами"), swatches: ["#2dd4bf", "#38bdf8", "#0b2025"] },
  { id: "porcelain", name: T("Фарфор"), description: T("Светлая тема для яркого окружения"), swatches: ["#5b5bd6", "#0284c7", "#f4f6fa"] },
  { id: "sunset", name: T("Закат"), description: T("Тёплый графит с янтарными акцентами"), swatches: ["#fb923c", "#f472b6", "#1d1212"] },
];

export function themeSetting() {
  try {
    const value = localStorage.getItem(KEY);
    if (UI_THEMES.some((theme) => theme.id === value)) return value;
  } catch {}
  return "neon";
}

export function applyTheme(value, save = false) {
  const id = value === undefined ? themeSetting() : UI_THEMES.some((theme) => theme.id === value) ? value : "neon";
  if (save) { try { localStorage.setItem(KEY, id); } catch {} }
  if (typeof document !== "undefined") {
    document.documentElement.dataset.h3zTheme = id;
    document.documentElement.style.colorScheme = id === "porcelain" ? "light" : "dark";
  }
  return id;
}

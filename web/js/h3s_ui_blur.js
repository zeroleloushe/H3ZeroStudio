const KEY = "h3zs.uiBlur";
/** Panel blur of a fresh install (and of «Вернуть настройки по умолчанию»). */
export const DEFAULT_UI_BLUR = true;

export function uiBlurEnabled() {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "0" || v === "off" || v === "false") return false;
    if (v === "1" || v === "on" || v === "true") return true;
  } catch {}
  return DEFAULT_UI_BLUR;
}

export function applyUiBlur(on, save = false) {
  const enabled = on === undefined ? uiBlurEnabled() : !!on;
  if (save) {
    try { localStorage.setItem(KEY, enabled ? "on" : "off"); } catch {}
  }
  try {
    document.documentElement.dataset.h3zUiBlur = enabled ? "on" : "off";
  } catch {}
  return enabled;
}

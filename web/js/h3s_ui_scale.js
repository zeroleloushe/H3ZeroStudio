import { T } from "./h3s_i18n.js";

const KEY = "h3zs.uiScale";
export const UI_SCALES = [75, 80, 90, 100, 110, 125];
/** Studio scale of a fresh install (and of «Вернуть настройки по умолчанию»). */
export const DEFAULT_UI_SCALE = 100;

export function uiScaleSetting() {
  try {
    const n = Number(localStorage.getItem(KEY));
    if (UI_SCALES.includes(n)) return n;
  } catch {}
  return DEFAULT_UI_SCALE;
}

export function uiScaleFactor() {
  return uiScaleSetting() / 100;
}

/**
 * Apply scale like browser zoom: CSS zoom + expanded layout box
 * (width/height = 100vw/scale, 100vh/scale) so the visual fills the
 * viewport and layout has more CSS pixels at <100%.
 */
export function applyUiScale(value, save = false, root = null) {
  const pct = UI_SCALES.includes(Number(value)) ? Number(value) : uiScaleSetting();
  if (save) {
    try { localStorage.setItem(KEY, String(pct)); } catch {}
  }
  const el = root || document.querySelector(".h3z-root");
  const s = pct / 100;
  if (el) {
    el.style.zoom = String(s);
    try { el.dataset.h3zUiScale = String(pct); } catch {}
    if (Math.abs(s - 1) < 1e-6) {
      el.style.inset = el.style.top = el.style.left = el.style.right = el.style.bottom = "";
      el.style.width = el.style.height = "";
      el.style.boxSizing = "";
    } else {
      // Pre-zoom box is larger so post-zoom visual == viewport (browser-zoom-like).
      // Clear inset so explicit width/height are not overridden by inset:0.
      el.style.boxSizing = "border-box";
      el.style.inset = "auto";
      el.style.top = "0";
      el.style.left = "0";
      el.style.right = "auto";
      el.style.bottom = "auto";
      // Layout box = viewport/scale so post-zoom visual fills the window (like browser zoom).
      el.style.width = "calc(100vw / " + s + ")";
      el.style.height = "calc(100vh / " + s + ")";
    }
  }
  try { document.documentElement.dataset.h3zUiScale = String(pct); } catch {}
  return pct;
}

export function uiScaleLabel(pct = uiScaleSetting()) {
  return T("{0}%", pct);
}

export function uiScaleRoot(root = null) {
  return root || document.querySelector(".h3z-root");
}

/** Layout viewport in local CSS px (root.client* after browser-like zoom expand). */
export function uiLayoutViewport(root = null) {
  const el = uiScaleRoot(root);
  const s = uiScaleFactor() || 1;
  if (el && el.clientWidth > 0 && el.clientHeight > 0) {
    return { W: el.clientWidth, H: el.clientHeight, s };
  }
  return {
    W: Math.round((window.innerWidth || 1600) / s),
    H: Math.round((window.innerHeight || 900) / s),
    s,
  };
}

export function uiLocalPoint(clientX, clientY, root = null) {
  const el = uiScaleRoot(root);
  const s = uiScaleFactor() || 1;
  if (!el || Math.abs(s - 1) < 1e-6) return { x: clientX, y: clientY, s: 1 };
  const rr = el.getBoundingClientRect();
  return { x: (clientX - rr.left) / s, y: (clientY - rr.top) / s, s };
}

export function uiLocalDelta(dx, dy) {
  const s = uiScaleFactor() || 1;
  return { x: dx / s, y: dy / s, s };
}

export function uiLocalSize(viewportPx) {
  const s = uiScaleFactor() || 1;
  return viewportPx / (s || 1);
}

export function uiLocalBounds(root = null) {
  const vp = uiLayoutViewport(root);
  return { w: vp.W, h: vp.H, s: vp.s };
}


/**
 * Place an absolutely-positioned element under an anchor inside the zoomed root.
 * Uses layout CSS px (browser-zoom-like). align: "center" | "start".
 */
export function uiPlaceBelow(anchor, el, root = null, opts = {}) {
  if (!anchor || !el) return null;
  const pad = opts.pad ?? 8;
  const gap = opts.gap ?? 8;
  const align = opts.align || "center";
  const r = anchor.getBoundingClientRect();
  const bounds = uiLocalBounds(root);
  const anchorPt = uiLocalPoint(
    align === "start" ? r.left : (r.left + r.width / 2),
    r.bottom,
    root,
  );
  // offsetWidth is pre-zoom layout size (correct for style.left inside zoomed root)
  const w = el.offsetWidth || Math.round(uiLocalSize(el.getBoundingClientRect().width));
  const h = el.offsetHeight || Math.round(uiLocalSize(el.getBoundingClientRect().height));
  let left = align === "start" ? anchorPt.x : (anchorPt.x - w / 2);
  left = Math.max(pad, Math.min(left, bounds.w - w - pad));
  let top = anchorPt.y + gap;
  if (opts.flip && top + h > bounds.h - pad) {
    const above = uiLocalPoint(r.left, r.top, root);
    top = Math.max(pad, above.y - h - gap);
  } else {
    top = Math.max(pad, Math.min(top, Math.max(pad, bounds.h - h - pad)));
  }
  el.style.left = left + "px";
  el.style.top = top + "px";
  el.style.right = "auto";
  el.style.bottom = "auto";
  return { left, top, w, h, bounds };
}

/** Place near a clientX/clientY point (tooltips) in local root coords. */
export function uiPlaceAtClient(clientX, clientY, el, root = null, opts = {}) {
  if (!el) return null;
  const pad = opts.pad ?? 8;
  const ox = opts.offsetX ?? 12;
  const oy = opts.offsetY ?? -34;
  // An element that lives OUTSIDE the zoomed root (e.g. a drag tip appended to <body>) is not zoomed itself:
  // it must be placed in plain viewport px, not in the root's local (pre-zoom) px.
  const zroot = uiScaleRoot(root);
  if (zroot && !zroot.contains(el)) {
    const bw = window.innerWidth || 1600, bh = window.innerHeight || 900;
    const w0 = el.offsetWidth || 0, h0 = el.offsetHeight || 0;
    const l0 = Math.max(pad, Math.min(clientX + ox, bw - w0 - pad));
    const t0 = Math.max(pad, Math.min(clientY + oy, bh - h0 - pad));
    el.style.left = l0 + "px"; el.style.top = t0 + "px"; el.style.right = "auto"; el.style.bottom = "auto";
    return { left: l0, top: t0, w: w0, h: h0 };
  }
  const bounds = uiLocalBounds(root);
  const pt = uiLocalPoint(clientX + ox, clientY + oy, root);
  const w = el.offsetWidth || Math.round(uiLocalSize(el.getBoundingClientRect().width));
  const h = el.offsetHeight || Math.round(uiLocalSize(el.getBoundingClientRect().height));
  const left = Math.max(pad, Math.min(pt.x, bounds.w - w - pad));
  const top = Math.max(pad, Math.min(pt.y, bounds.h - h - pad));
  el.style.left = left + "px";
  el.style.top = top + "px";
  el.style.right = "auto";
  el.style.bottom = "auto";
  return { left, top, w, h };
}

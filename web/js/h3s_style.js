// H3ZeroStudio styles (CapCut-like: deep navy-black, purple→cyan gradients, glassy rounded panels).
export const CSS = String.raw`
.h3z-root, .h3z-compact { --bg0:#05070f; --bg1:#0a0e1c; --bg2:#10152a; --panel:rgba(17,22,42,.72); --panel2:rgba(24,30,56,.78);
  --line:rgba(148,163,255,.10); --line2:rgba(148,163,255,.18); --txt:#e8ebff; --mut:#8d94bd; --mut2:#5c6390;
  --a1:#8b5cf6; --a2:#22d3ee; --a3:#ec4899; --ok:#34d399; --warn:#fbbf24; --err:#fb7185;
  --grad:linear-gradient(135deg,#8b5cf6 0%,#6366f1 45%,#22d3ee 100%);
  --grad2:linear-gradient(135deg,#ec4899 0%,#8b5cf6 55%,#22d3ee 100%);
  --r:16px; --r2:12px; --r3:9px;
  font-family: Inter, "Segoe UI Variable", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; color:var(--txt);
  font-size:13px; line-height:1.35; -webkit-font-smoothing:antialiased; }
.h3z-root *, .h3z-compact * { box-sizing:border-box; }
.h3z-root { position:fixed; inset:0; z-index:100000; display:grid; grid-template-rows:56px minmax(0,1fr) auto; gap:10px; padding:10px;
  background: radial-gradient(1200px 600px at 12% -10%, rgba(139,92,246,.22), transparent 60%),
              radial-gradient(900px 500px at 95% 0%, rgba(34,211,238,.14), transparent 60%),
              radial-gradient(800px 600px at 50% 120%, rgba(236,72,153,.10), transparent 60%), var(--bg0);
  animation: h3z-in .18s ease-out; user-select:none; }
@keyframes h3z-in { from { opacity:0; transform:scale(.985); } to { opacity:1; transform:none; } }
.h3z-root ::-webkit-scrollbar { width:8px; height:8px; } .h3z-root ::-webkit-scrollbar-thumb { background:rgba(148,163,255,.18); border-radius:8px; }
.h3z-root ::-webkit-scrollbar-track { background:transparent; }
.h3z-glass { background:var(--panel); border:1px solid var(--line); border-radius:var(--r); backdrop-filter:blur(18px) saturate(140%);
  box-shadow:0 10px 40px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.04); }
/* ---------- header */
.h3z-head { display:flex; align-items:center; gap:12px; padding:0 10px 0 14px; }
.h3z-logo { display:flex; align-items:center; gap:10px; font-weight:800; font-size:16px; letter-spacing:.2px; white-space:nowrap; }
.h3z-logo i { width:30px; height:30px; border-radius:10px; background:var(--grad); display:grid; place-items:center; box-shadow:0 6px 18px rgba(139,92,246,.45); font-style:normal; }
.h3z-logo b { background:var(--grad); -webkit-background-clip:text; background-clip:text; color:transparent; }
.h3z-pname { background:transparent; border:1px solid transparent; color:var(--txt); font:inherit; font-weight:600; padding:6px 10px; border-radius:10px; width:220px; }
.h3z-pname:hover { border-color:var(--line2); } .h3z-pname:focus { outline:none; border-color:var(--a1); background:rgba(139,92,246,.08); }
.h3z-chips { display:flex; gap:6px; flex:1; min-width:0; overflow:hidden; }
.h3z-chip { display:inline-flex; align-items:center; gap:6px; padding:5px 10px; border-radius:999px; background:rgba(148,163,255,.07); border:1px solid var(--line);
  color:var(--mut); font-size:12px; white-space:nowrap; }
.h3z-chip b { color:var(--txt); font-weight:600; }
.h3z-chip.warn { color:var(--warn); border-color:rgba(251,191,36,.35); background:rgba(251,191,36,.08); cursor:pointer; }
.h3z-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; height:34px; padding:0 14px; border-radius:11px; border:1px solid var(--line2);
  background:rgba(148,163,255,.07); color:var(--txt); font:inherit; font-weight:600; cursor:pointer; transition:.15s; white-space:nowrap; }
.h3z-btn:hover { background:rgba(148,163,255,.14); border-color:rgba(148,163,255,.3); }
.h3z-btn:disabled { opacity:.4; cursor:default; }
.h3z-btn.icon { width:34px; padding:0; }
.h3z-btn.sm { height:28px; padding:0 10px; border-radius:9px; font-size:12px; }
.h3z-btn.sm.icon { width:28px; padding:0; }
.h3z-btn.primary { background:var(--grad); border:none; box-shadow:0 8px 24px rgba(99,102,241,.45), inset 0 1px 0 rgba(255,255,255,.25); padding:0 18px; }
.h3z-btn.primary:hover { filter:brightness(1.1); }
.h3z-btn.danger:hover { background:rgba(251,113,133,.16); border-color:rgba(251,113,133,.45); color:#ffd1da; }
.h3z-btn svg { width:16px; height:16px; }
.h3z-run { position:relative; overflow:hidden; display:flex; align-items:center; gap:10px; height:34px; padding:0 14px; border-radius:11px; min-width:280px;
  background:rgba(139,92,246,.12); border:1px solid rgba(139,92,246,.4); font-weight:600; font-size:12px; }
.h3z-run > i { position:absolute; left:0; top:0; bottom:0; background:var(--grad); opacity:.35; transition:width .3s; }
.h3z-run > span { position:relative; white-space:nowrap; }
.h3z-run .sp { width:14px; height:14px; border-radius:50%; border:2px solid rgba(255,255,255,.25); border-top-color:#fff; animation:h3z-spin .8s linear infinite; position:relative; }
@keyframes h3z-spin { to { transform:rotate(360deg); } }
/* ---------- body */
.h3z-body { display:grid; grid-template-columns:60px 272px minmax(0,1fr) 372px; gap:10px; min-height:0; }
.h3z-tools { display:flex; flex-direction:column; align-items:center; gap:6px; padding:10px 0; }
.h3z-tool { width:44px; height:52px; border-radius:12px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; color:var(--mut);
  cursor:pointer; font-size:9.5px; transition:.15s; border:1px solid transparent; }
.h3z-tool svg { width:20px; height:20px; }
.h3z-tool:hover { color:var(--txt); background:rgba(148,163,255,.07); }
.h3z-tool.on { color:#fff; background:linear-gradient(160deg,rgba(139,92,246,.35),rgba(34,211,238,.18)); border-color:rgba(139,92,246,.45); box-shadow:0 6px 18px rgba(139,92,246,.25); }
.h3z-tools .sp { flex:1; }
.h3z-panel { display:flex; flex-direction:column; min-height:0; overflow:hidden; }
.h3z-ph { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:14px 14px 10px; }
.h3z-ph h3 { margin:0; font-size:14px; font-weight:700; letter-spacing:.2px; }
.h3z-ph small { color:var(--mut); font-weight:500; }
.h3z-scroll { overflow:auto; min-height:0; flex:1; padding:0 14px 14px; }
.h3z-pills { display:flex; gap:4px; padding:3px; background:rgba(5,7,15,.5); border:1px solid var(--line); border-radius:11px; }
.h3z-pill { flex:1; text-align:center; padding:5px 8px; border-radius:8px; color:var(--mut); cursor:pointer; font-size:12px; font-weight:600; white-space:nowrap; transition:.15s; }
.h3z-pill:hover { color:var(--txt); }
.h3z-pill.on { color:#fff; background:var(--grad); box-shadow:0 4px 14px rgba(99,102,241,.35); }
.h3z-pill.dis { opacity:.35; pointer-events:none; }
/* ---------- assets */
.h3z-drop { margin:10px 0; border:1.5px dashed rgba(148,163,255,.25); border-radius:14px; padding:16px 10px; text-align:center; color:var(--mut); cursor:pointer; transition:.15s;
  background:rgba(148,163,255,.03); font-size:12px; }
.h3z-drop:hover, .h3z-drop.over { border-color:var(--a2); color:var(--txt); background:rgba(34,211,238,.06); }
.h3z-drop svg { width:24px; height:24px; display:block; margin:0 auto 6px; color:var(--a2); }
.h3z-agrid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.h3z-asset { position:relative; border-radius:12px; overflow:hidden; background:var(--bg2); border:1px solid var(--line); cursor:grab; transition:.15s; aspect-ratio:1/1.12; }
.h3z-asset:hover { border-color:rgba(139,92,246,.6); transform:translateY(-1px); box-shadow:0 8px 22px rgba(0,0,0,.35); }
.h3z-asset img { width:100%; height:100%; object-fit:cover; display:block; pointer-events:none; }
.h3z-asset .cap { position:absolute; left:0; right:0; bottom:0; padding:18px 8px 6px; background:linear-gradient(transparent,rgba(5,7,15,.92)); font-size:11px; }
.h3z-asset .cap div { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:600; }
.h3z-asset .cat { position:absolute; top:6px; left:6px; font-size:9.5px; font-weight:700; padding:2px 7px; border-radius:999px; background:rgba(5,7,15,.7); border:1px solid var(--line2); cursor:pointer; }
.h3z-asset .cat.character { color:#c4b5fd; } .h3z-asset .cat.location { color:#67e8f9; } .h3z-asset .cat.other { color:#f9a8d4; }
.h3z-asset .del { position:absolute; top:6px; right:6px; width:22px; height:22px; border-radius:7px; display:none; place-items:center; background:rgba(5,7,15,.75); color:#fda4af; cursor:pointer; }
.h3z-asset:hover .del { display:grid; }
.h3z-asset.used::after { content:"✓"; position:absolute; right:6px; bottom:6px; width:20px; height:20px; border-radius:50%; display:grid; place-items:center; background:var(--grad); font-size:11px; font-weight:800; }
.h3z-empty { color:var(--mut2); text-align:center; padding:26px 8px; font-size:12px; }
/* ---------- preview */
.h3z-center { display:flex; flex-direction:column; min-height:0; min-width:0; }
.h3z-pv-top { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 14px; }
.h3z-stage { flex:1; min-height:0; display:grid; place-items:center; padding:0 14px; position:relative; }
.h3z-frame { position:relative; max-width:100%; max-height:100%; border-radius:14px; overflow:hidden; background:#000; box-shadow:0 20px 60px rgba(0,0,0,.6), 0 0 0 1px var(--line);
  display:grid; place-items:center; }
.h3z-frame video, .h3z-frame img.poster { width:100%; height:100%; object-fit:contain; display:block; background:#000; }
.h3z-ph-empty { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; color:var(--mut); text-align:center; padding:20px;
  background: radial-gradient(400px 260px at 30% 30%, rgba(139,92,246,.22), transparent 70%), radial-gradient(400px 260px at 75% 70%, rgba(34,211,238,.16), transparent 70%), #070a16; }
.h3z-ph-empty .big { width:64px; height:64px; border-radius:20px; background:var(--grad); display:grid; place-items:center; box-shadow:0 10px 30px rgba(99,102,241,.5); }
.h3z-ph-empty .big svg { width:30px; height:30px; color:#fff; }
.h3z-ph-empty b { color:var(--txt); font-size:15px; }
.h3z-ph-empty .tag { position:absolute; left:14px; top:12px; font-size:11px; color:var(--mut); }
.h3z-comp-ph { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background-size:cover; background-position:center;
  background-color:#0b0f20; }
.h3z-comp-ph::before { content:""; position:absolute; inset:0; background:linear-gradient(135deg, color-mix(in srgb, var(--c) 55%, transparent), rgba(5,7,15,.88));
  backdrop-filter:blur(6px) saturate(.6); }
.h3z-comp-ph.gap::before { background:repeating-linear-gradient(45deg, rgba(255,255,255,.03) 0 12px, rgba(0,0,0,.25) 12px 24px), rgba(5,7,15,.92); }
.h3z-comp-ph .in { position:relative; display:flex; flex-direction:column; gap:6px; align-items:center; text-align:center; max-width:70%; }
.h3z-comp-ph b { font-size:17px; color:#fff; } .h3z-comp-ph span { color:var(--mut); font-size:12px; }
.h3z-comp-ph small { color:rgba(255,255,255,.55); font-size:11px; font-style:italic; }
.h3z-btn.h3z-draft.on { background:rgba(250,204,21,.16); border-color:rgba(250,204,21,.55); color:#fde68a; }
.h3z-btn small.q { margin-left:6px; padding:1px 6px; border-radius:999px; background:rgba(255,255,255,.18); font-size:10px; font-weight:700; }
.h3z-clip .bd.draft { background:rgba(250,204,21,.2); color:#fde68a; }
.h3z-pill.old { color:var(--warn); }
.h3z-uptags { position:absolute; right:8px; top:6px; z-index:4; display:flex; gap:4px; pointer-events:auto; }
.h3z-clip .foot ~ .h3z-uptags, .h3z-uptags:has(~ .foot) { right:40px; }
.h3z-uptags span { font-size:10px; font-weight:800; padding:1px 6px; border-radius:999px; background:rgba(5,7,15,.7); color:#c4b5fd; border:1px solid rgba(167,139,250,.5); }
.h3z-uptags span.done { background:linear-gradient(90deg,#7c3aed,#2563eb); color:#fff; border-color:transparent; }
.h3z-uptags span.ok { color:#4ade80; border-color:rgba(74,222,128,.55); }
.h3z-upblock { display:flex; flex-direction:column; gap:8px; margin-top:12px; padding-top:10px; border-top:1px solid var(--line); }
.h3z-upblock .h3z-pills { flex-wrap:wrap; }
.h3z-upblock .h3z-pill.dis { opacity:.4; cursor:not-allowed; }
.h3z-btn.on { border-color:#4ade80; color:#4ade80; }
.h3z-note.ok { color:#86efac; }
.h3z-pvtabs { display:inline-flex; flex:none; width:auto; max-width:100%; flex-wrap:nowrap; }
.h3z-pvtabs .h3z-pill { flex:0 0 auto; }
.h3z-pill .dot { display:inline-block; width:7px; height:7px; margin-left:6px; border-radius:50%; background:var(--warn); box-shadow:0 0 6px rgba(251,191,36,.7); vertical-align:middle; }
.h3z-badge-live { position:absolute; left:12px; top:12px; padding:4px 9px; border-radius:999px; font-size:11px; font-weight:700; background:rgba(5,7,15,.7); border:1px solid var(--line2); }
.h3z-transport { display:flex; align-items:center; justify-content:center; gap:8px; padding:12px 14px; }
.h3z-play { width:44px; height:44px; border-radius:50%; background:var(--grad); border:none; color:#fff; display:grid; place-items:center; cursor:pointer; box-shadow:0 8px 22px rgba(99,102,241,.45); }
.h3z-play svg { width:18px; height:18px; }
/* main player in browser fullscreen (⛶ / F) */
.h3z-center:fullscreen { background:#05070f; border-radius:0; padding:8px 0 0; }
.h3z-center:fullscreen .h3z-dyn { display:none; }
.h3z-center:fullscreen .h3z-frame { border-radius:4px; }
/* «Удобный просмотр» */
.h3z-viewer { position:fixed; inset:0; z-index:100000; display:flex; flex-direction:column; background:#03040a; color:var(--txt, #e7e9ff); outline:none; }
.h3z-viewer .vhd { display:flex; align-items:center; gap:10px; padding:10px 14px; border-bottom:1px solid var(--line); min-width:0; }
.h3z-viewer .vtag { font-size:10.5px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; padding:2px 8px; border-radius:6px; background:var(--grad); color:#fff; white-space:nowrap; }
.h3z-viewer .vtitle { font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; } .h3z-viewer .vsub { white-space:nowrap; }
.h3z-viewer .grow { flex:1; }
.h3z-viewer .vzoom { display:flex; align-items:center; gap:4px; } .h3z-viewer .vzoom .zl { min-width:46px; text-align:right; font-variant-numeric:tabular-nums; }
.h3z-viewer .on { background:var(--grad) !important; color:#fff !important; border-color:transparent !important; }
.h3z-viewer .vvp { position:relative; flex:1; min-height:0; overflow:hidden; background:#000; touch-action:none; user-select:none; }
.h3z-viewer .vvp.zoomed { cursor:grab; } .h3z-viewer .vvp.drag { cursor:grabbing; }
.h3z-viewer .vct { position:absolute; left:50%; top:50%; transform-origin:50% 50%; will-change:transform; }
.h3z-viewer .vct > video { width:100%; height:100%; display:block; object-fit:contain; background:#000; pointer-events:none; }
.h3z-viewer .vct > .h3z-frame { border-radius:0; box-shadow:none; max-width:none; max-height:none; pointer-events:none; }
.h3z-viewer .vct .h3z-badge-live { display:none; }
.h3z-viewer .vct.px video, .h3z-viewer .vct.px img, .h3z-viewer .vct.px canvas { image-rendering:pixelated; }
.h3z-viewer .vbar { padding:8px 14px 0; }
.h3z-viewer .scrubw { position:relative; } .h3z-viewer .scrubw .scrub { width:100%; position:relative; z-index:1; }
.h3z-viewer .loopband { position:absolute; top:50%; height:14px; transform:translateY(-50%); border-radius:4px; background:rgba(34,211,238,.18); border:1px solid rgba(34,211,238,.45); display:none; pointer-events:none; }
.h3z-viewer .loopband.on { display:block; }
.h3z-viewer .vctr { display:flex; align-items:center; gap:8px; padding:8px 14px; flex-wrap:wrap; }
.h3z-viewer .vtime { font-variant-numeric:tabular-nums; font-size:12.5px; color:var(--mut); white-space:nowrap; } .h3z-viewer .vtime b { color:var(--txt, #fff); }
.h3z-viewer .sep { width:1px; height:20px; background:var(--line); margin:0 2px; }
.h3z-viewer .vkeys { padding:0 14px 8px; font-size:11px; opacity:.75; }
.h3z-time { font-variant-numeric:tabular-nums; color:var(--mut); font-size:12px; min-width:150px; text-align:center; }
.h3z-time b { color:var(--txt); }
/* ---------- inspector */
.h3z-insp { display:flex; flex-direction:column; gap:10px; min-height:0; overflow:auto; padding-right:2px; }
.h3z-card { padding:14px; display:flex; flex-direction:column; gap:12px; }
.h3z-card-h { display:flex; align-items:center; gap:8px; }
.h3z-card-h h4 { margin:0; font-size:13px; font-weight:700; flex:1; display:flex; align-items:center; gap:8px; }
.h3z-num { min-width:24px; height:24px; padding:0 6px; border-radius:8px; display:grid; place-items:center; font-weight:800; font-size:12px; color:#fff; }
.h3z-lbl { font-size:11px; font-weight:600; color:var(--mut); text-transform:uppercase; letter-spacing:.6px; display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:6px; }
.h3z-lbl em { font-style:normal; text-transform:none; letter-spacing:0; color:var(--mut2); font-weight:500; }
.h3z-in, .h3z-ta, .h3z-sel { width:100%; background:rgba(5,7,15,.55); border:1px solid var(--line2); color:var(--txt); border-radius:10px; font:inherit; padding:8px 10px; transition:.15s; user-select:text; }
.h3z-in::placeholder, .h3z-ta::placeholder { color:var(--mut2); }
.h3z-in:focus, .h3z-ta:focus, .h3z-sel:focus { outline:none; border-color:var(--a1); box-shadow:0 0 0 3px rgba(139,92,246,.18); }
.h3z-ta { resize:vertical; min-height:84px; line-height:1.45; }
.h3z-ta.sm { min-height:54px; }
.h3z-sel { appearance:none; padding-right:26px; background-image:linear-gradient(45deg,transparent 50%,var(--mut) 50%),linear-gradient(135deg,var(--mut) 50%,transparent 50%);
  background-position:calc(100% - 14px) 52%, calc(100% - 9px) 52%; background-size:5px 5px; background-repeat:no-repeat; }
.h3z-sel option { background:#11152a; }
.h3z-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.h3z-grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
.h3z-field .h3z-in, .h3z-field .h3z-sel { padding:7px 9px; }
.h3z-field.ov .h3z-in, .h3z-field.ov .h3z-sel { border-color:rgba(34,211,238,.55); background:rgba(34,211,238,.06); }
.h3z-row { display:flex; align-items:center; gap:8px; }
.h3z-range { -webkit-appearance:none; appearance:none; flex:1; height:6px; border-radius:6px; background:linear-gradient(90deg,var(--a1) var(--p,50%), rgba(148,163,255,.15) var(--p,50%)); outline:none; }
.h3z-range::-webkit-slider-thumb { -webkit-appearance:none; width:16px; height:16px; border-radius:50%; background:#fff; box-shadow:0 0 0 4px rgba(139,92,246,.35); cursor:pointer; }
.h3z-val { font-variant-numeric:tabular-nums; font-weight:700; min-width:92px; text-align:right; font-size:12px; }
.h3z-val small { color:var(--mut); font-weight:500; }
.h3z-qs { display:flex; gap:6px; flex-wrap:wrap; }
.h3z-q { padding:3px 9px; border-radius:999px; border:1px solid var(--line2); color:var(--mut); font-size:11px; cursor:pointer; font-weight:600; }
.h3z-q:hover { color:var(--txt); border-color:var(--a2); } .h3z-q.on { color:#fff; border-color:transparent; background:var(--grad); }
.h3z-refs { display:flex; flex-wrap:wrap; gap:6px; min-height:40px; padding:6px; border-radius:12px; border:1.5px dashed rgba(148,163,255,.2); transition:.15s; }
.h3z-refs.over { border-color:var(--a2); background:rgba(34,211,238,.06); }
.h3z-ref { display:flex; align-items:center; gap:6px; padding:3px 6px 3px 3px; border-radius:10px; background:var(--panel2); border:1px solid var(--line2); cursor:pointer; font-size:11.5px; transition:.12s; }
.h3z-ref:hover { border-color:var(--a1); }
.h3z-ref img { width:26px; height:26px; border-radius:7px; object-fit:cover; }
.h3z-ref .tg { font-weight:700; background:var(--grad); -webkit-background-clip:text; background-clip:text; color:transparent; }
.h3z-ref .x { color:var(--mut2); padding:0 2px; } .h3z-ref .x:hover { color:var(--err); }
.h3z-ref.auto { border-style:dashed; cursor:default; } .h3z-ref.auto .ico { width:26px; height:26px; border-radius:7px; display:grid; place-items:center; background:rgba(34,211,238,.12); color:var(--a2); }
.h3z-refs .hint { color:var(--mut2); font-size:11.5px; align-self:center; padding:0 6px; }
.h3z-final { font-family:ui-monospace, "Cascadia Code", Consolas, monospace; font-size:11px; color:#b9c0ea; white-space:pre-wrap; background:rgba(5,7,15,.55); border:1px solid var(--line); border-radius:10px; padding:8px 10px; max-height:140px; overflow:auto; user-select:text; }
.h3z-final mark { background:rgba(139,92,246,.25); color:#e9d5ff; border-radius:4px; padding:0 2px; }
details.h3z-det > summary { cursor:pointer; list-style:none; display:flex; align-items:center; gap:6px; color:var(--mut); font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.6px; }
details.h3z-det > summary::-webkit-details-marker { display:none; }
details.h3z-det > summary::before { content:"›"; display:inline-block; transition:.15s; font-size:14px; }
details.h3z-det[open] > summary::before { transform:rotate(90deg); }
details.h3z-det > summary .cnt { background:var(--grad); color:#fff; border-radius:999px; padding:0 7px; font-size:10px; text-transform:none; }
details.h3z-det > .in { margin-top:10px; display:flex; flex-direction:column; gap:10px; }
.h3z-tog { display:flex; align-items:center; justify-content:space-between; gap:10px; cursor:pointer; font-size:12.5px; }
.h3z-tog i { width:34px; height:20px; border-radius:20px; background:rgba(148,163,255,.18); position:relative; transition:.15s; flex:none; }
.h3z-tog i::after { content:""; position:absolute; top:3px; left:3px; width:14px; height:14px; border-radius:50%; background:#fff; transition:.15s; }
.h3z-tog.on i { background:var(--grad); } .h3z-tog.on i::after { left:17px; }
.h3z-note { font-size:11.5px; color:var(--mut); line-height:1.45; }
.h3z-note b { color:var(--txt); }
.h3z-colors { display:flex; gap:5px; }
.h3z-colors span { width:14px; height:14px; border-radius:50%; cursor:pointer; box-shadow:0 0 0 2px transparent; }
.h3z-colors span.on { box-shadow:0 0 0 2px #fff; }
.h3z-status { display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:10px; font-size:12px; background:rgba(52,211,153,.08); border:1px solid rgba(52,211,153,.25); color:#a7f3d0; }
.h3z-status.stale { background:rgba(251,191,36,.08); border-color:rgba(251,191,36,.3); color:#fde68a; }
.h3z-status.none { background:rgba(148,163,255,.06); border-color:var(--line); color:var(--mut); }
/* ---------- timeline */
.h3z-tl { display:flex; flex-direction:column; height:268px; min-height:0; }
.h3z-tl-bar { display:flex; align-items:center; gap:8px; padding:10px 12px 8px; }
.h3z-tl-bar .sep { width:1px; height:20px; background:var(--line2); margin:0 4px; }
.h3z-tl-bar .grow { flex:1; }
.h3z-zoom { display:flex; align-items:center; gap:8px; color:var(--mut); font-size:11px; }
.h3z-zoom .h3z-range { width:120px; flex:none; }
.h3z-tl-main { flex:1; display:grid; grid-template-columns:118px minmax(0,1fr); min-height:0; }
.h3z-heads { display:flex; flex-direction:column; padding-top:30px; }
.h3z-thead { display:flex; align-items:center; gap:7px; padding:0 12px; color:var(--mut); font-size:11.5px; font-weight:600; }
.h3z-thead svg { width:15px; height:15px; }
.h3z-thead.v { height:118px; } .h3z-thead.a { height:46px; }
.h3z-tscroll { position:relative; overflow-x:auto; overflow-y:hidden; min-height:0; }
.h3z-tinner { position:relative; height:100%; min-width:100%; }
.h3z-ruler { position:absolute; left:0; right:0; top:0; height:28px; cursor:pointer; border-bottom:1px solid var(--line); }
.h3z-tick { position:absolute; top:0; bottom:0; border-left:1px solid rgba(148,163,255,.16); }
.h3z-tick span { position:absolute; left:5px; top:6px; font-size:10.5px; color:var(--mut); font-variant-numeric:tabular-nums; white-space:nowrap; }
.h3z-tick.minor { top:20px; border-left-color:rgba(148,163,255,.10); }
.h3z-track { position:absolute; left:0; right:0; }
.h3z-track.v { top:36px; height:110px; } .h3z-track.a { top:154px; height:38px; }
.h3z-lane-bg { position:absolute; inset:0; border-radius:12px; background:rgba(148,163,255,.03); border:1px solid rgba(148,163,255,.05); }
.h3z-clip { position:absolute; top:0; bottom:0; border-radius:12px; overflow:hidden; cursor:pointer; color:#fff;
  background:linear-gradient(135deg,var(--c1),var(--c2)); box-shadow:0 6px 20px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.25); transition:box-shadow .15s, transform .15s, opacity .15s; }
.h3z-clip:hover { box-shadow:0 10px 26px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.3); }
.h3z-clip.sel { box-shadow:0 0 0 2px #fff, 0 0 0 5px rgba(139,92,246,.55), 0 12px 30px rgba(0,0,0,.5); z-index:3; }
.h3z-clip.dragging { opacity:.85; z-index:10; transform:translateY(-4px) scale(1.01); cursor:grabbing; transition:none; }
.h3z-clip.dropover { box-shadow:0 0 0 2px var(--a2), 0 0 26px rgba(34,211,238,.6); }
.h3z-clip .strip { position:absolute; inset:0; background-size:100% 100%; opacity:.62; mix-blend-mode:luminosity; }
.h3z-clip.has-strip .strip { mix-blend-mode:normal; opacity:.9; }
.h3z-clip.has-strip::before { content:""; position:absolute; inset:0; background:linear-gradient(180deg, rgba(5,7,15,.72) 0%, rgba(5,7,15,.1) 45%, rgba(5,7,15,.75) 100%); z-index:1; }
.h3z-clip.has-strip { background:linear-gradient(135deg,var(--c1),var(--c2)); }
.h3z-clip.has-strip::after { content:""; position:absolute; left:0; right:0; top:0; height:3px; background:linear-gradient(90deg,var(--c1),var(--c2)); z-index:2; }
.h3z-clip > .c { position:absolute; inset:0; padding:8px 10px; display:flex; flex-direction:column; gap:4px; z-index:2; }
.h3z-clip .t { display:flex; align-items:center; gap:6px; font-weight:700; font-size:12px; white-space:nowrap; }
.h3z-clip .t .n { width:20px; height:20px; border-radius:7px; background:rgba(0,0,0,.28); display:grid; place-items:center; font-size:11px; flex:none; }
.h3z-clip .t .nm { overflow:hidden; text-overflow:ellipsis; }
.h3z-clip .t .d { margin-left:auto; font-size:10.5px; font-weight:600; background:rgba(0,0,0,.28); padding:1px 6px; border-radius:6px; flex:none; }
.h3z-clip .p { font-size:11px; opacity:.85; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; line-height:1.3; }
.h3z-clip .rf { display:flex; gap:-4px; margin-top:auto; align-items:center; }
.h3z-clip .rf img { width:20px; height:20px; border-radius:50%; object-fit:cover; border:2px solid rgba(255,255,255,.85); margin-right:-6px; }
.h3z-clip .rf .lk { margin-left:12px; font-size:10px; font-weight:700; background:rgba(0,0,0,.3); padding:1px 6px; border-radius:6px; }
.h3z-clip .bd { position:absolute; right:8px; bottom:7px; z-index:3; font-size:10px; font-weight:800; padding:2px 7px; border-radius:999px; background:rgba(5,7,15,.6); }
.h3z-clip .bd.ok { color:#6ee7b7; } .h3z-clip .bd.stale { color:#fde68a; } .h3z-clip .bd.cache { color:#93c5fd; }
.h3z-clip .hr { position:absolute; right:0; top:0; bottom:0; width:10px; cursor:ew-resize; z-index:4; }
.h3z-clip .hr::after { content:""; position:absolute; right:3px; top:50%; width:3px; height:28px; margin-top:-14px; border-radius:3px; background:rgba(255,255,255,.7); opacity:0; transition:.15s; }
.h3z-clip:hover .hr::after, .h3z-clip.sel .hr::after { opacity:1; }
.h3z-clip .pg { position:absolute; left:0; right:0; bottom:0; height:100%; z-index:1; pointer-events:none; display:none; }
.h3z-clip.running .pg { display:block; }
.h3z-clip .pg i { position:absolute; left:0; top:0; bottom:0; background:linear-gradient(90deg, rgba(255,255,255,.0), rgba(255,255,255,.28)); border-right:2px solid #fff; transition:width .3s; }
.h3z-clip.running { animation:h3z-pulse 1.6s ease-in-out infinite; }
@keyframes h3z-pulse { 0%,100% { box-shadow:0 0 0 2px rgba(255,255,255,.7), 0 0 18px rgba(139,92,246,.5); } 50% { box-shadow:0 0 0 2px #fff, 0 0 34px rgba(34,211,238,.75); } }
.h3z-clip.queued { opacity:.75; }
.h3z-blend { position:absolute; top:6px; bottom:6px; z-index:5; border-radius:9px; pointer-events:auto;
  background:repeating-linear-gradient(-45deg, rgba(255,255,255,.28) 0 6px, rgba(255,255,255,.06) 6px 12px); border:1.5px solid rgba(255,255,255,.65);
  box-shadow:0 0 18px rgba(34,211,238,.35); display:grid; place-items:center; }
.h3z-blend span { font-size:10px; font-weight:800; background:rgba(5,7,15,.75); padding:2px 6px; border-radius:6px; white-space:nowrap; }
.h3z-seamq { position:absolute; top:3px; width:10px; height:10px; margin-left:-5px; border-radius:50%; z-index:7; cursor:pointer; border:2px solid rgba(0,0,0,.55); }
.h3z-seamq.ok { background:#5fd38d; } .h3z-seamq.soft { background:#ffb547; box-shadow:0 0 8px #ffb547; } .h3z-seamq.hard { background:#ff5c7a; box-shadow:0 0 10px #ff5c7a; }
.h3z-seamv { display:inline-flex; align-items:center; gap:6px; font-size:11.5px; margin-top:6px; padding:3px 8px; border-radius:8px; background:rgba(255,255,255,.05); }
.h3z-seamv b { width:8px; height:8px; border-radius:50%; display:inline-block; } .h3z-seamv.ok b { background:#5fd38d; } .h3z-seamv.soft b { background:#ffb547; } .h3z-seamv.hard b { background:#ff5c7a; }
.h3z-cutmark { position:absolute; top:10px; bottom:10px; width:3px; margin-left:-1.5px; border-radius:3px; background:var(--a3); z-index:5; box-shadow:0 0 12px var(--a3); }
.h3z-ext { position:absolute; top:0; bottom:0; width:116px; border-radius:12px; border:1.5px dashed rgba(148,163,255,.35); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px;
  color:var(--mut); cursor:pointer; font-weight:700; font-size:12px; transition:.15s; background:rgba(148,163,255,.03); }
.h3z-ext:hover { color:#fff; border-color:transparent; background:var(--grad); box-shadow:0 8px 24px rgba(99,102,241,.45); }
.h3z-ext svg { width:22px; height:22px; }
.h3z-ext small { font-weight:500; font-size:10px; opacity:.8; }
.h3z-ins { position:absolute; top:-4px; bottom:-4px; width:4px; margin-left:-2px; border-radius:4px; background:var(--a2); box-shadow:0 0 14px var(--a2); z-index:12; }
.h3z-audio { position:absolute; top:0; bottom:0; border-radius:10px; overflow:hidden; display:flex; align-items:center; padding:0 12px; font-size:11px; font-weight:600; gap:8px; }
.h3z-audio.none { background:rgba(148,163,255,.05); color:var(--mut2); border:1px dashed rgba(148,163,255,.15); }
.h3z-audio.reference { background:linear-gradient(90deg,rgba(139,92,246,.45),rgba(236,72,153,.35)); color:#fff; }
.h3z-audio.locked { background:linear-gradient(90deg,rgba(34,211,238,.45),rgba(16,185,129,.35)); color:#fff; }
.h3z-audio .wv { position:absolute; inset:6px 0; opacity:.35; background:repeating-linear-gradient(90deg, rgba(255,255,255,.9) 0 2px, transparent 2px 5px);
  -webkit-mask:linear-gradient(180deg,transparent 0,#000 30%,#000 70%,transparent 100%); }
.h3z-audio span { position:relative; }
.h3z-phead { position:absolute; top:0; bottom:0; width:0; z-index:20; pointer-events:none; }
.h3z-phead::before { content:""; position:absolute; top:0; bottom:0; left:-1px; width:2px; background:#fff; box-shadow:0 0 10px rgba(255,255,255,.6); }
.h3z-phead::after { content:""; position:absolute; top:0; left:-7px; width:14px; height:16px; background:#fff; clip-path:polygon(0 0,100% 0,100% 60%,50% 100%,0 60%); border-radius:3px; }
.h3z-tip { position:fixed; z-index:100002; pointer-events:none; padding:5px 9px; border-radius:8px; background:#0b0f20; border:1px solid var(--line2); font-size:11.5px; font-weight:600; color:#fff; box-shadow:0 8px 20px rgba(0,0,0,.5); }
.h3z-pop { position:absolute; z-index:100003; top:62px; right:220px; width:440px; max-height:50vh; overflow:auto; padding:12px 14px; display:flex; flex-direction:column; gap:8px; }
.h3z-pop div { font-size:12px; color:#fde68a; display:flex; gap:8px; } .h3z-pop div::before { content:"⚠"; }
.h3z-toast { position:fixed; left:50%; bottom:300px; transform:translateX(-50%); z-index:100004; padding:10px 16px; border-radius:12px; background:#11162c; border:1px solid var(--line2);
  box-shadow:0 12px 30px rgba(0,0,0,.5); font-weight:600; font-size:12.5px; animation:h3z-in .15s ease-out; }
.h3z-toast.act { display:flex; align-items:center; gap:12px; }
.h3z-toast.err { border-color:rgba(251,113,133,.5); color:#fecdd3; }
.h3z-keys { display:grid; grid-template-columns:auto 1fr; gap:8px 12px; font-size:12px; }
.h3z-keys kbd { font-family:inherit; font-size:11px; font-weight:700; padding:2px 7px; border-radius:6px; background:rgba(148,163,255,.1); border:1px solid var(--line2); border-bottom-width:2px; white-space:nowrap; }
/* ---------- compact node view */
.h3z-compact { display:flex; flex-direction:column; gap:8px; padding:8px; border-radius:14px; height:100%; overflow:hidden;
  background: radial-gradient(300px 140px at 10% 0%, rgba(139,92,246,.25), transparent 70%), radial-gradient(260px 140px at 100% 100%, rgba(34,211,238,.16), transparent 70%), #070a14;
  border:1px solid rgba(148,163,255,.14); }
.h3z-compact .pv { position:relative; flex:1; min-height:70px; border-radius:10px; overflow:hidden; background:#05070f; display:grid; place-items:center; color:var(--mut); font-size:11px; }
.h3z-compact .pv img { width:100%; height:100%; object-fit:cover; position:absolute; inset:0; }
.h3z-compact .pv .ttl { position:relative; display:flex; align-items:center; gap:8px; font-weight:800; font-size:14px; color:#fff; }
.h3z-compact .pv .ttl i { width:26px; height:26px; border-radius:9px; background:var(--grad); display:grid; place-items:center; font-style:normal; font-size:13px; }
.h3z-compact .mini { display:flex; gap:3px; height:12px; }
.h3z-compact .mini span { border-radius:4px; background:linear-gradient(135deg,var(--c1),var(--c2)); min-width:4px; }
.h3z-compact .mini span.done { box-shadow:inset 0 -3px 0 rgba(255,255,255,.65); }
.h3z-compact .inf { display:flex; justify-content:space-between; gap:6px; color:var(--mut); font-size:11px; white-space:nowrap; overflow:hidden; }
.h3z-compact .inf b { color:var(--txt); }
.h3z-compact .prog { height:4px; border-radius:4px; background:rgba(148,163,255,.12); overflow:hidden; display:none; }
.h3z-compact .prog.on { display:block; } .h3z-compact .prog i { display:block; height:100%; background:var(--grad); width:0; transition:width .3s; }
.h3z-compact .open { height:38px; border:none; border-radius:11px; background:var(--grad); color:#fff; font:inherit; font-weight:800; font-size:13.5px; cursor:pointer;
  display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 6px 18px rgba(99,102,241,.45), inset 0 1px 0 rgba(255,255,255,.25); }
.h3z-compact .open:hover { filter:brightness(1.12); }
.h3z-compact .open svg { width:16px; height:16px; }
.h3z-compact .open.legacy { height:30px; font-size:12.5px; background:rgba(251,191,36,.16); color:#fde68a; box-shadow:inset 0 0 0 1px rgba(251,191,36,.45); }
/* ---------------- v2: takes, markers, audio clip, thumbnails, menus, live preview ---------------- */
.h3z-tl { height:282px; }
.h3z-thead.a { height:56px; }
.h3z-track.a { top:154px; height:48px; }
.h3z-row.wrap { flex-wrap:wrap; gap:8px; }
.h3z-takes { display:flex; flex-direction:column; gap:8px; padding-top:2px; }
.h3z-take-row { display:flex; gap:8px; overflow-x:auto; padding:2px 2px 6px; scrollbar-width:thin; }
.h3z-take { position:relative; flex:none; width:84px; height:52px; border-radius:10px; overflow:hidden; cursor:pointer; border:1.5px solid var(--line2);
  background:var(--bg2); transition:transform .12s, border-color .12s, box-shadow .12s; }
.h3z-take:hover { transform:translateY(-2px); border-color:var(--a2); }
.h3z-take.on { border-color:transparent; box-shadow:0 0 0 2px #fff, 0 0 0 4px rgba(139,92,246,.6), 0 6px 18px rgba(0,0,0,.45); }
.h3z-take img, .h3z-take .ph { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.h3z-take .ph { background:linear-gradient(135deg,rgba(139,92,246,.35),rgba(34,211,238,.25)); }
.h3z-take .k { position:absolute; left:5px; top:4px; font-size:10px; font-weight:800; background:rgba(5,7,15,.72); padding:1px 6px; border-radius:6px; }
.h3z-take.on .k { background:var(--grad); }
.h3z-take .sd { position:absolute; left:0; right:0; bottom:0; font-size:9.5px; padding:8px 5px 3px; background:linear-gradient(180deg,transparent,rgba(5,7,15,.85)); color:#cbd5ff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.h3z-take .x { position:absolute; right:3px; top:2px; font-size:10px; color:#fff; background:rgba(5,7,15,.6); border-radius:6px; padding:0 4px; opacity:0; transition:.12s; }
.h3z-take:hover .x { opacity:1; } .h3z-take .x:hover { color:var(--err); }
.h3z-clip .tk { position:absolute; left:8px; bottom:7px; z-index:4; font-size:10px; font-weight:800; padding:2px 7px 2px 5px; border-radius:999px; background:rgba(5,7,15,.68);
  color:#e9d5ff; display:flex; gap:4px; align-items:center; cursor:pointer; border:1px solid rgba(167,139,250,.45); }
.h3z-clip .tk:hover { background:var(--grad); color:#fff; }
.h3z-clip .tk i { font-style:normal; opacity:.85; }
.h3z-clip .rf { margin-left:0; }
.h3z-clip:has(.tk) .rf { padding-left:54px; }
.h3z-clip .strip.tiles { background:#000; opacity:1; mix-blend-mode:normal; }
.h3z-clip .strip.tiles i { position:absolute; top:0; bottom:0; background-repeat:no-repeat; border-right:1px solid rgba(0,0,0,.55); }
.h3z-clip.is-stale .strip { filter:saturate(.35) brightness(.8); }
.h3z-clip.is-stale::after { background:repeating-linear-gradient(90deg,var(--warn) 0 8px,transparent 8px 14px) !important; }
.h3z-mk { position:absolute; top:2px; height:24px; z-index:22; transform:translateX(-1px); display:flex; align-items:center; gap:3px; cursor:grab; pointer-events:auto; }
.h3z-mk .f { width:18px; height:18px; display:grid; place-items:center; font-size:10px; color:#05070f; font-weight:900; background:var(--mc);
  clip-path:polygon(0 0,100% 0,100% 72%,50% 100%,0 72%); border-radius:3px; box-shadow:0 0 10px var(--mc); margin-left:-9px; }
.h3z-mk .lb { font-size:10px; font-weight:700; color:var(--mc); white-space:nowrap; max-width:120px; overflow:hidden; text-overflow:ellipsis; text-shadow:0 1px 4px #000; }
.h3z-mk.sel .f { outline:2px solid #fff; outline-offset:1px; }
.h3z-mk.off { opacity:.45; }
.h3z-mk-line { position:absolute; top:26px; bottom:0; width:0; border-left:1px dashed var(--mc); opacity:.38; z-index:6; pointer-events:none; }
.h3z-mk-line.sel { opacity:.9; }
.h3z-mcard { border-color:color-mix(in srgb, var(--mc) 45%, transparent) !important; box-shadow:0 0 0 1px color-mix(in srgb, var(--mc) 25%, transparent), 0 12px 32px rgba(0,0,0,.35); }
.h3z-num.mk { background:var(--mc) !important; color:#05070f; }
.h3z-audio.clip { padding:0; cursor:grab; border:1px solid rgba(255,255,255,.18); }
.h3z-audio.clip.reference { background:linear-gradient(90deg,rgba(34,211,238,.30),rgba(59,130,246,.22)); border:1.5px dashed rgba(34,211,238,.8); }
.h3z-audio.clip.locked { background:linear-gradient(90deg,rgba(245,158,11,.42),rgba(249,115,22,.30)); border:1.5px solid rgba(251,191,36,.9); box-shadow:0 0 16px rgba(251,191,36,.25); }
.h3z-audio.clip.none { background:rgba(148,163,255,.07); border:1px dashed rgba(148,163,255,.25); }
.h3z-audio.clip .wf { position:absolute; left:0; top:4px; pointer-events:none; }
.h3z-audio.clip .lbl { position:absolute; left:10px; top:3px; font-size:10.5px; font-weight:800; color:#fff; text-shadow:0 1px 4px #000; white-space:nowrap; pointer-events:none; z-index:2; }
.h3z-audio.clip .lbl small { font-weight:500; opacity:.8; }
.h3z-audio.clip .th { position:absolute; top:0; bottom:0; width:9px; cursor:ew-resize; z-index:3; }
.h3z-audio.clip .th.l { left:0; } .h3z-audio.clip .th.r { right:0; }
.h3z-audio.clip .th::after { content:""; position:absolute; top:50%; width:3px; height:22px; margin-top:-11px; border-radius:3px; background:rgba(255,255,255,.85); opacity:0; transition:.12s; }
.h3z-audio.clip .th.l::after { left:3px; } .h3z-audio.clip .th.r::after { right:3px; }
.h3z-audio.clip:hover .th::after { opacity:1; }
.h3z-aend { position:absolute; top:-3px; bottom:-3px; width:2px; background:var(--err); opacity:.7; border-radius:2px; z-index:3; }
.h3z-afile { display:flex; align-items:center; gap:10px; padding:9px 10px; border-radius:12px; background:rgba(34,211,238,.07); border:1px solid rgba(34,211,238,.25); }
.h3z-afile > i { width:30px; height:30px; border-radius:9px; display:grid; place-items:center; background:var(--grad); color:#fff; flex:none; }
.h3z-afile > i svg { width:16px; height:16px; }
.h3z-afile > div { min-width:0; flex:1; display:flex; flex-direction:column; }
.h3z-afile b { font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .h3z-afile small { color:var(--mut); font-size:11px; }
.h3z-pill.lk.on { background:linear-gradient(135deg,#f59e0b,#f97316); }
.h3z-hover { position:fixed; z-index:100003; display:none; pointer-events:none; padding:5px; border-radius:12px; background:rgba(10,14,28,.92);
  border:1px solid var(--line2); box-shadow:0 14px 40px rgba(0,0,0,.6); backdrop-filter:blur(10px); }
.h3z-hover .im { border-radius:8px; background-repeat:no-repeat; }
.h3z-hover span { display:block; text-align:center; font-size:11px; font-weight:700; padding:4px 0 1px; color:var(--txt); font-variant-numeric:tabular-nums; }
.h3z-menu { position:fixed; z-index:100004; min-width:250px; padding:6px; border-radius:14px; box-shadow:0 18px 48px rgba(0,0,0,.6); }
.h3z-menu .hd { font-size:11px; color:var(--mut); font-weight:700; padding:6px 10px 4px; text-transform:uppercase; letter-spacing:.04em; }
.h3z-menu { max-width:440px; }
.h3z-menu .it { display:flex; align-items:center; gap:10px; padding:0 10px; height:32px; min-height:32px; border-radius:9px; cursor:pointer; font-size:12.5px; white-space:nowrap; overflow:hidden; }
.h3z-menu .it .ic { width:16px; height:16px; flex:none; display:grid; place-items:center; font-style:normal; font-size:13px; line-height:1; color:var(--a2); }
.h3z-menu .it .lb { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.h3z-menu .it img, .h3z-menu .it video, .h3z-menu .it audio { display:none !important; }
.h3z-menu .it svg { width:15px; height:15px; color:var(--a2); flex:none; }
.h3z-menu .it:hover { background:rgba(139,92,246,.18); }
.h3z-menu .it.dis { opacity:.4; cursor:default; } .h3z-menu .it.dis:hover { background:none; }
.h3z-menu .it.danger, .h3z-menu .it.danger svg, .h3z-menu .it.danger .ic { color:var(--err); }
.h3z-menu .it kbd { margin-left:auto; font-size:10px; color:var(--mut); border:1px solid var(--line2); border-radius:5px; padding:0 5px; }
.h3z-menu .sep { height:1px; margin:4px 6px; background:var(--line); }
.h3z-live { position:absolute; inset:0; z-index:6; background:#000; }
.h3z-tileov { position:absolute; inset:0; z-index:7; pointer-events:none; background-image:linear-gradient(rgba(255,255,255,.0),rgba(255,255,255,0)); }
.h3z-tileov .cur { position:absolute; border:2px solid #a78bfa; background:rgba(167,139,250,.14); box-shadow:0 0 0 1px rgba(0,0,0,.5), 0 0 18px rgba(167,139,250,.5); border-radius:4px; transition:all .25s; }
.h3z-tileov .lbl { position:absolute; right:10px; top:10px; padding:4px 9px; border-radius:999px; font-size:11px; font-weight:700; background:rgba(5,7,15,.75); border:1px solid var(--line2); color:#e9e5ff; }
.h3z-tileset { display:flex; flex-direction:column; gap:6px; }
.h3z-live img { width:100%; height:100%; object-fit:contain; image-rendering:auto; filter:saturate(1.05); }
.h3z-badge-live.rec i { display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--err); margin-right:6px; box-shadow:0 0 8px var(--err); animation:h3z-blink 1s infinite; }
@keyframes h3z-blink { 50% { opacity:.25; } }
.h3z-ruler { background:linear-gradient(180deg,rgba(148,163,255,.05),transparent); }
.h3z-clip .t .n { background:rgba(0,0,0,.38); box-shadow:inset 0 0 0 1px rgba(255,255,255,.18); }

.h3z-live canvas { position:absolute; inset:0; width:100%; height:100%; }
.h3z-live .h3z-badge-live { z-index:2; }
.h3z-live-pg { position:absolute; left:0; right:0; bottom:0; height:3px; background:rgba(255,255,255,.12); z-index:2; }
.h3z-live-pg i { display:block; height:100%; background:var(--grad); transition:width .3s; }
.h3z-compact canvas.live { position:absolute; inset:0; width:100%; height:100%; }
.h3z-compact .ttl.live i { color:#fb7185; background:none; animation:h3z-blink 1s infinite; }
.h3z-seam { position:absolute; top:-2px; bottom:-2px; width:14px; margin-left:-7px; z-index:8; cursor:col-resize; display:grid; place-items:center; }
.h3z-seam::before { content:""; width:4px; height:46px; border-radius:4px; background:#fff; opacity:0; box-shadow:0 0 12px rgba(34,211,238,.9); transition:opacity .12s, height .12s; }
.h3z-seam:hover::before, .h3z-seam.on::before { opacity:1; height:70px; }
.h3z-seam span { position:absolute; top:50%; margin-top:-9px; width:18px; height:18px; border-radius:50%; background:var(--grad); color:#fff; font-size:10px; display:grid; place-items:center; opacity:0; transition:.12s; pointer-events:none; }
.h3z-seam:hover span, .h3z-seam.on span { opacity:1; }

.h3z-compact .pv .ttl.live { position:absolute; left:8px; bottom:6px; font-size:11px; gap:4px; text-shadow:0 1px 6px #000; }
.h3z-compact .pv .ttl.live i { width:auto; height:auto; }

.h3z-sink { position:fixed; left:-9999px; top:0; width:1px; height:1px; opacity:0; pointer-events:none; }
.h3z-arows { display:flex; flex-direction:column; gap:6px; }
.h3z-arows .h3z-field { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.h3z-arows .h3z-lbl { margin:0; align-items:flex-start; text-align:left; text-transform:none; letter-spacing:0; font-size:12px; display:flex; flex-direction:row; justify-content:flex-start; align-items:baseline; gap:6px; }
.h3z-arows .h3z-lbl em { font-style:normal; opacity:.6; font-size:10.5px; }
.h3z-arows input { width:92px; flex:none; text-align:right; }

/* ---- v3: resizable panels, video end marker, audio assets + 2-lane track, volume */
.h3z-root { grid-template-rows:56px minmax(0,1fr) 8px var(--th,282px); row-gap:3px; }
.h3z-body { grid-template-columns:60px var(--lw,272px) 8px minmax(0,1fr) 8px var(--rw,372px); column-gap:2px; }
.h3z-tl { height:auto; min-height:0; }
.h3z-split { position:relative; z-index:5; border-radius:6px; transition:background .12s; }
.h3z-split.v { cursor:col-resize; } .h3z-split.hz { cursor:row-resize; }
.h3z-split::after { content:""; position:absolute; border-radius:3px; background:rgba(148,163,255,.18); transition:.12s; }
.h3z-split.v::after { top:50%; left:3px; width:2px; height:44px; margin-top:-22px; }
.h3z-split.hz::after { left:50%; top:3px; height:2px; width:64px; margin-left:-32px; }
.h3z-split:hover, .h3z-split.on { background:rgba(139,92,246,.16); }
.h3z-split:hover::after, .h3z-split.on::after { background:var(--a1); }
.h3z-split.v:hover::after, .h3z-split.v.on::after { top:0; height:100%; margin-top:0; }
.h3z-split.hz:hover::after, .h3z-split.hz.on::after { left:0; width:100%; margin-left:0; }
.h3z-agrid { grid-template-columns:repeat(auto-fill, minmax(118px, 1fr)); }
.h3z-tscroll { overflow-y:auto; }
.h3z-tinner { min-height:214px; }
.h3z-thead.a { height:92px; align-items:flex-start; padding-top:12px; }
.h3z-track.a { top:154px; height:84px; }
.h3z-track.a.dropover .h3z-alane { background:rgba(251,191,36,.12); border-color:rgba(251,191,36,.6); }
.h3z-alane { position:absolute; left:0; right:0; border-radius:10px; background:rgba(148,163,255,.035); border:1px dashed rgba(148,163,255,.08); }
.h3z-audio.none { top:0; }
.h3z-audio.clip.sel { box-shadow:0 0 0 2px #fff, 0 0 18px rgba(251,191,36,.45); z-index:4; }
.h3z-audio.clip.unknown { border-style:dashed; }
/* video end */
.h3z-beyond { position:absolute; top:26px; bottom:0; z-index:15; pointer-events:none;
  background:repeating-linear-gradient(135deg, rgba(5,7,15,.62) 0 10px, rgba(5,7,15,.74) 10px 20px); border-left:2px solid rgba(244,63,94,.85); }
.h3z-vend { position:absolute; top:2px; z-index:22; transform:translateX(-1px); cursor:ew-resize; }
.h3z-vend span { display:block; padding:2px 8px; border-radius:0 7px 7px 0; font-size:10px; font-weight:800; color:#fff; background:rgba(244,63,94,.55); border:1px dashed rgba(255,255,255,.6); white-space:nowrap; }
.h3z-vend.set span { background:linear-gradient(90deg,#f43f5e,#ec4899); border:none; box-shadow:0 2px 10px rgba(244,63,94,.45); }
.h3z-clip.is-out { filter:grayscale(.85) brightness(.55); }
.h3z-clip .bd.out { background:rgba(244,63,94,.85); color:#fff; }
.h3z-endbox { display:flex; align-items:center; gap:6px; font-size:11px; color:var(--mut); }
.h3z-endbox .h3z-in { width:74px; padding:4px 6px; text-align:right; }
.h3z-endbox .h3z-btn.on { background:rgba(139,92,246,.25); border-color:rgba(139,92,246,.6); color:#fff; }
.h3z-zoom .h3z-range { width:160px; }
/* audio assets */
.h3z-asset.audio { background:linear-gradient(160deg,rgba(245,158,11,.20),rgba(17,22,42,.9) 60%); display:flex; flex-direction:column; }
.h3z-asset.audio.virtual { background:linear-gradient(160deg,rgba(34,211,238,.16),rgba(17,22,42,.9) 60%); border-style:dashed; }
.h3z-asset.audio canvas.wf { position:absolute; left:8px; right:8px; top:34%; width:calc(100% - 16px); height:30%; pointer-events:none; }
.h3z-asset.audio .play { position:absolute; right:6px; bottom:30px; width:28px; height:28px; padding:0; z-index:3; }
.h3z-asset.audio .cap small { opacity:.7; font-size:10px; }
.h3z-asset .cat.audio { color:#fcd34d; }
.h3z-ref.aud .ico { width:26px; height:26px; border-radius:7px; display:grid; place-items:center; background:rgba(251,191,36,.16); color:#fcd34d; font-weight:800; }
.h3z-ref.aud.over { border-color:var(--err); opacity:.6; }
.h3z-alist { display:flex; flex-direction:column; gap:4px; }
.h3z-alist .it { display:flex; justify-content:space-between; gap:8px; padding:6px 9px; border-radius:9px; background:var(--panel2); border:1px solid var(--line2); cursor:pointer; font-size:11.5px; }
.h3z-alist .it span { color:var(--mut); white-space:nowrap; } .h3z-alist .it b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.h3z-alist .it.on { border-color:rgba(251,191,36,.8); background:rgba(251,191,36,.12); }
.h3z-in.ro { color:var(--mut); width:92px; text-align:right; }
/* player volume */
.h3z-transport .grow { flex:1; }
.h3z-volume { display:flex; align-items:center; gap:6px; }
.h3z-volume .h3z-range { width:96px; flex:none; }
.h3z-volume .h3z-btn.warn { color:#fbbf24; border-color:rgba(251,191,36,.7); animation:h3zpulse 1.2s ease-in-out infinite; }
@keyframes h3zpulse { 50% { box-shadow:0 0 0 4px rgba(251,191,36,.25); } }

/* ---- sampling dynamics under the player */
.h3z-dyn { margin:0 14px 12px; border-radius:12px; background:rgba(5,7,15,.55); border:1px solid var(--line2); font-size:11px; color:var(--mut); flex:none; }
.h3z-dyn .hd { display:flex; align-items:center; gap:10px; padding:7px 12px; cursor:pointer; user-select:none; }
.h3z-dyn .hd b { color:var(--txt,#e5e7ff); font-weight:700; letter-spacing:.02em; }
.h3z-dyn .hd .grow { flex:1; }
.h3z-dyn .hd .nf { font-variant-numeric:tabular-nums; }
.h3z-dyn .st { padding:2px 8px; border-radius:7px; background:rgba(148,163,255,.10); font-family:ui-monospace,monospace; }
.h3z-dyn .st.on { background:rgba(34,197,94,.16); color:#86efac; }
.h3z-dyn .bd { display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:0 10px 10px; }
.h3z-dyn.closed .bd { display:none; }
.h3z-dyn .ch { position:relative; height:84px; border-radius:9px; background:rgba(0,0,0,.35); border:1px solid rgba(148,163,255,.08); }
.h3z-dyn .ch canvas { position:absolute; inset:18px 0 0 0; width:100%; height:calc(100% - 18px); }
.h3z-dyn .lb { position:absolute; left:9px; top:4px; font-family:ui-monospace,monospace; font-size:10px; }
.h3z-dyn .lb b { color:#e5e7ff; } .h3z-dyn .lb em { color:#fb923c; font-style:normal; }

.h3z-panel .h3z-pills { flex-wrap:wrap; height:auto; }
.h3z-panel .h3z-pills .h3z-pill { flex:1 0 auto; }

/* per-clip generate / new take */
.h3z-clip .acts { position:absolute; right:6px; bottom:6px; display:flex; gap:4px; z-index:5; opacity:0; transition:opacity .12s; }
.h3z-clip:hover .acts, .h3z-clip.sel .acts { opacity:1; }
.h3z-cb { width:24px; height:24px; padding:0; display:grid; place-items:center; border-radius:7px; border:1px solid rgba(255,255,255,.25); background:rgba(10,12,24,.78); color:#fff; cursor:pointer; }
.h3z-cb svg { width:13px; height:13px; }
.h3z-cb:hover { background:var(--grad); border-color:transparent; }
.h3z-cb.dis { opacity:.35; cursor:not-allowed; }
.h3z-cb.dis:hover { background:rgba(10,12,24,.78); border-color:rgba(255,255,255,.25); }
.h3z-note.warn { color:#fbbf24; }
.h3z-menu .why { padding:4px 12px 8px; font-size:11px; color:#fbbf24; max-width:280px; line-height:1.35; }

/* frozen segment */
.h3z-clip.frozen { box-shadow:inset 0 0 0 2px rgba(148,163,184,.75); }
.h3z-clip.frozen::after { content:""; position:absolute; inset:0; pointer-events:none; border-radius:inherit; background:repeating-linear-gradient(135deg, rgba(148,163,184,.10) 0 6px, transparent 6px 14px); }
.h3z-clip .frz { position:absolute; left:8px; bottom:6px; z-index:4; padding:1px 7px; border-radius:6px; font-size:10px; font-weight:700; color:#e2e8f0; background:rgba(15,23,42,.85); border:1px solid rgba(148,163,184,.6); }

/* video assets / footage */
.h3z-asset.video .ph { height:100%; display:flex; align-items:center; justify-content:center; font-size:28px; background:linear-gradient(135deg,#1e293b,#0f172a); }
.h3z-asset.video .dur { position:absolute; right:6px; bottom:26px; padding:1px 6px; border-radius:5px; font-size:10px; font-weight:700; background:rgba(0,0,0,.65); color:#fff; }
.h3z-asset .cat.video { background:rgba(14,165,233,.85); }
.h3z-ref.vid img { width:26px; height:18px; object-fit:cover; border-radius:4px; }
.h3z-ref.vid.over { opacity:.45; text-decoration:line-through; }
.h3z-clip .foot { position:absolute; right:8px; top:6px; z-index:4; padding:0 6px; border-radius:6px; font-size:11px; background:rgba(14,165,233,.85); color:#fff; }
.h3z-foot { display:flex; flex-direction:column; gap:8px; padding:10px; border-radius:10px; background:rgba(14,165,233,.08); border:1px solid rgba(14,165,233,.35); }
.h3z-foot .h3z-val.warn { color:var(--warn); }
.h3z-ext.dropover { outline:2px dashed #38bdf8; background:rgba(56,189,248,.18); }

/* empty gap before a fixed end marker */
.h3z-gap { position:absolute; top:6px; bottom:6px; z-index:1; border-radius:8px; border:1.5px dashed rgba(251,191,36,.7); background:repeating-linear-gradient(135deg, rgba(251,191,36,.10) 0 8px, transparent 8px 16px); display:flex; align-items:center; justify-content:center; cursor:pointer; color:#fbbf24; font-size:11px; font-weight:600; }
.h3z-gap:hover { background:rgba(251,191,36,.18); }
.h3z-endmode { display:inline-flex; gap:2px; margin-left:4px; }
.h3z-endmode .h3z-pill { padding:2px 8px; font-size:11px; }

/* run pill: flexible width, never truncated */
.h3z-run { min-width:360px; width:max-content; max-width:none; flex:0 0 auto; }
.h3z-run > span { overflow:visible; font-variant-numeric:tabular-nums; }

/* three audio lanes: 1-2 lock, 3 music */
.h3z-thead.a { height:126px; }
.h3z-track.a { height:118px; }
.h3z-alane.music { background:rgba(52,211,153,.05); border-color:rgba(52,211,153,.25); }
.h3z-alane > span { position:absolute; left:10px; top:50%; transform:translateY(-50%); font-size:11px; color:rgba(110,231,183,.7); white-space:nowrap; pointer-events:none; }
.h3z-audio.clip.music { background:linear-gradient(135deg, rgba(16,185,129,.55), rgba(5,150,105,.45)); border-color:rgba(52,211,153,.8); }
.h3z-audio.clip .fd { position:absolute; top:0; bottom:0; pointer-events:none; z-index:2; }
.h3z-audio.clip .fd.in { left:0; background:linear-gradient(to top right, rgba(0,0,0,.55) 50%, transparent 50%); }
.h3z-audio.clip .fd.out { right:0; background:linear-gradient(to top left, rgba(0,0,0,.55) 50%, transparent 50%); }

/* menus: submenus + inline controls */
.h3z-menu .it.has-sub { position:relative; }
.h3z-menu .it .ar { margin-left:auto; opacity:.7; }
.h3z-menu .it.on span::before { content:"✓ "; color:#38bdf8; }
.h3z-menu.sub { position:absolute; z-index:2; }
.h3z-menu .ctl { display:flex; align-items:center; gap:8px; padding:4px 10px; font-size:12px; }
.h3z-menu .ctl .l { width:64px; color:var(--mut); }
.h3z-menu .ctl .h3z-range { width:120px; }
.h3z-menu .ctl .v { width:46px; text-align:right; font-variant-numeric:tabular-nums; }
.h3z-asset .edt { position:absolute; left:6px; bottom:26px; width:18px; height:18px; display:grid; place-items:center; border-radius:5px; font-size:11px; background:rgba(56,189,248,.9); color:#fff; }
/* modal dialogs */
.h3z-modal { position:fixed; inset:0; z-index:300; background:rgba(2,6,23,.6); display:flex; align-items:center; justify-content:center; backdrop-filter:blur(3px); }
.h3z-modal.busy { cursor:progress; }
.h3z-modal.busy .h3z-ae::after { content:"Обработка… не закрывайте окно"; position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); padding:10px 18px; border-radius:10px; background:rgba(0,0,0,.75); color:#fff; font-size:13px; z-index:5; pointer-events:none; }
.h3z-modal.busy .h3z-ae, .h3z-modal.busy .h3z-save { opacity:.75; pointer-events:none; }
.h3z-save { width:min(620px, 94vw); display:flex; flex-direction:column; gap:12px; padding:16px; border-radius:16px; }
.h3z-save .hd, .h3z-ae .hd { display:flex; align-items:center; gap:8px; }
.h3z-save .h3z-note.err { color:var(--err); }
.h3z-btn.busy { opacity:.6; cursor:progress; }
/* asset editor */
.h3z-ae { width:min(1100px, 96vw); height:min(820px, 94vh); display:flex; position:relative; flex-direction:column; gap:8px; padding:12px 14px; border-radius:16px; }
.h3z-ae .hd b { display:flex; align-items:center; gap:6px; font-size:14px; max-width:40%; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.h3z-ae .hd svg { width:15px; height:15px; }
.h3z-ae .hd .dims { font-size:11.5px; color:#7dd3fc; font-variant-numeric:tabular-nums; white-space:nowrap; }
.h3z-ae .h3z-btn.on { background:rgba(56,189,248,.25); border-color:#38bdf8; }
.h3z-ae .stage { flex:1; min-height:120px; position:relative; background:#000; border-radius:10px; overflow:hidden; }
.h3z-ae .stage.audio { flex:0 0 220px; }
.h3z-ae .stage .cv { position:absolute; inset:0; cursor:crosshair; }
.h3z-ae .ticks { position:relative; height:14px; font-size:10px; color:var(--mut); }
.h3z-ae .ticks span { position:absolute; transform:translateX(-50%); font-variant-numeric:tabular-nums; }
.h3z-ae .ticks span:first-child { transform:none; } .h3z-ae .ticks span:last-child { transform:translateX(-100%); }
.h3z-ae .bar { position:relative; height:26px; border-radius:6px; background:rgba(255,255,255,.06); cursor:pointer; touch-action:none; }
.h3z-ae .bar .rng { position:absolute; top:4px; bottom:4px; background:rgba(14,165,233,.55); border-radius:4px; }
.h3z-ae .bar .hl { position:absolute; top:0; bottom:0; width:10px; margin-left:-5px; border-radius:4px; background:#38bdf8; cursor:ew-resize; }
.h3z-ae .bar .ph { position:absolute; top:-4px; bottom:-4px; width:2px; margin-left:-1px; background:#f59e0b; pointer-events:none; }
.h3z-ae .phl { text-align:right; font-size:10.5px; color:var(--mut); letter-spacing:.06em; } .h3z-ae .phl .pht { color:#f59e0b; font-variant-numeric:tabular-nums; }
.h3z-ae .row { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.h3z-ae .row .h3z-in.sm { width:76px; } .h3z-ae .row .sp { width:10px; } .h3z-ae .row .lb { font-size:11px; color:var(--mut); margin-left:6px; }
.h3z-ae .row .kept { font-size:11.5px; color:var(--mut); font-variant-numeric:tabular-nums; margin-left:4px; }
.h3z-ae .hint { font-size:10.5px; color:var(--mut); }

.h3z-sel.sm { width:auto; padding:4px 26px 4px 9px; font-size:12px; border-radius:8px; }


/* overlap zone at the start of an extension (shared with the previous segment's tail) */
.h3z-ovl { position:absolute; top:4px; bottom:4px; z-index:4; pointer-events:auto; border-radius:6px;
  background:repeating-linear-gradient(135deg, rgba(56,189,248,.28) 0 5px, rgba(56,189,248,.10) 5px 10px);
  border:1px solid rgba(56,189,248,.65); box-shadow:inset 0 0 0 1px rgba(0,0,0,.25); }
.h3z-ovl > span { position:absolute; left:50%; top:50%; margin-top:-8px; padding:1px 6px; border-radius:6px; background:rgba(8,47,73,.85); transform:translateX(-50%); font-size:10px; font-weight:700; color:#e0f2fe; text-shadow:0 1px 2px #000; white-space:nowrap; pointer-events:none; }
/* audio track header: one row per lane */
.h3z-thead.a { position:relative; display:block; padding:0; }
.h3z-arow { position:absolute; left:0; right:0; display:flex; align-items:center; gap:4px; padding:0 6px 0 10px; white-space:nowrap; font-size:11px; }
.h3z-arow .nm { overflow:hidden; text-overflow:ellipsis; min-width:0; }
.h3z-arow i svg { width:15px; height:15px; display:block; }
.h3z-arow .nm { font-weight:600; } .h3z-arow .nm.music { color:rgba(110,231,183,.85); }
.h3z-arow .sub { font-size:10.5px; opacity:.6; font-weight:500; }
.h3z-spk { margin-left:auto; border:1px solid rgba(148,163,255,.25); background:rgba(148,163,255,.08); color:inherit; border-radius:7px; width:26px; height:22px; font-size:12px; line-height:1; cursor:pointer; padding:0; }
.h3z-spk.off { opacity:.55; background:rgba(239,68,68,.12); border-color:rgba(239,68,68,.45); }
.h3z-spk:hover { filter:brightness(1.3); }
.h3z-warn { color:#fbbf24; font-size:14px; cursor:help; }
.h3z-note.err { color:#fca5a5; }

/* ---- v4: one spacing system. Same outer padding, the same gap between ALL panels (header, rail, assets, player,
   right panel, timeline), splitters sit inside the gap, one panel radius. */
.h3z-root { --h3z-pad:12px; --h3z-gap:12px; --h3z-r:14px; --r:var(--h3z-r); padding:var(--h3z-pad);
  grid-template-rows:56px var(--h3z-gap) minmax(0,1fr) var(--h3z-gap) var(--th,282px); gap:0; row-gap:0; }
.h3z-root > .h3z-head { grid-row:1; } .h3z-root > .h3z-body { grid-row:3; } .h3z-root > .h3z-split.hz { grid-row:4; } .h3z-root > .h3z-tl { grid-row:5; }
.h3z-root > .h3z-head::before { display:none; }
.h3z-head { padding:0 var(--h3z-gap); gap:var(--h3z-gap); }
.h3z-body { grid-template-columns:60px var(--h3z-gap) var(--lw,272px) var(--h3z-gap) minmax(0,1fr) var(--h3z-gap) var(--rw,372px); column-gap:0; gap:0; }
.h3z-body > .h3z-tools { grid-column:1; } .h3z-body > .h3z-panel { grid-column:3; } .h3z-body > .h3z-split.sl { grid-column:4; } .h3z-body > .h3z-split.sr { grid-column:6; }
.h3z-body > .h3z-center { grid-column:5; } .h3z-body > .h3z-insp { grid-column:7; }
.h3z-insp { gap:var(--h3z-gap); padding-right:0; }
.h3z-glass, .h3z-head, .h3z-tools, .h3z-panel, .h3z-center, .h3z-tl, .h3z-insp > .h3z-card { border-radius:var(--h3z-r); }
.h3z-split.v::after { left:50%; margin-left:-1px; } .h3z-split.hz::after { top:50%; margin-top:-1px; }
/* submenus: solid (a nested backdrop-filter shows the timeline through) */
.h3z-body > * { grid-row:1; }
.h3z-body > .h3z-helpview { grid-column:5 / 8; grid-row:1; z-index:20; display:flex; flex-direction:column; min-height:0; border-radius:var(--h3z-r); overflow:hidden; background:#0b1024; border:1px solid var(--line); }
.h3z-helphd { display:flex; align-items:center; gap:var(--h3z-gap); padding:var(--h3z-gap) calc(var(--h3z-gap) * 1.5); border-bottom:1px solid var(--line); }
.h3z-helphd h2 { margin:0; font-size:17px; font-weight:800; background:var(--grad); -webkit-background-clip:text; background-clip:text; color:transparent; white-space:nowrap; }
.h3z-helphd .grow { flex:1; }
.h3z-helpscroll { overflow:auto; min-height:0; flex:1; padding:var(--h3z-gap); }
.h3z-helpcols { columns:3 600px; column-gap:var(--h3z-gap); }
.h3z-helpsec { break-inside:avoid; margin:0 0 var(--h3z-gap); border:1px solid var(--line); border-radius:12px; background:rgba(148,163,255,.045); scroll-margin-top:var(--h3z-gap); transition:box-shadow .4s; }
.h3z-helpsec.flash { box-shadow:0 0 0 2px rgba(139,92,246,.6); }
.h3z-helpsec > summary { cursor:pointer; list-style:none; padding:10px 14px; font-weight:800; font-size:14px; color:#eef0ff; display:flex; align-items:center; gap:8px; }
.h3z-helpsec > summary::-webkit-details-marker { display:none; }
.h3z-helpsec > summary::before { content:"›"; display:inline-block; transition:transform .15s; color:var(--a2); font-size:16px; }
.h3z-helpsec[open] > summary::before { transform:rotate(90deg); }
.h3z-helpsec .hb { padding:0 16px 12px; font-size:13px; line-height:1.6; color:#cfd4f6; }
.h3z-helpsec .hb p { margin:6px 0; } .h3z-helpsec .hb ul, .h3z-helpsec .hb ol { margin:6px 0; padding-left:20px; } .h3z-helpsec .hb li { margin:3px 0; }
.h3z-helpsec .hb b { color:#fff; } .h3z-helpsec .hb code { font-family:ui-monospace,Consolas,monospace; font-size:12px; background:rgba(255,255,255,.07); padding:1px 5px; border-radius:5px; color:#c4b5fd; word-break:break-all; }
.h3z-helpsec kbd, .h3z-hkeys kbd { font-family:inherit; font-size:11.5px; padding:1px 6px; border-radius:6px; background:rgba(255,255,255,.09); border:1px solid var(--line2); box-shadow:0 1px 0 rgba(0,0,0,.5); color:#fff; white-space:nowrap; }
.h3z-helpsec dt { font-weight:700; color:#fff; margin-top:9px; } .h3z-helpsec dd { margin:3px 0 0 0; }
.h3z-hkeys { border-collapse:collapse; width:100%; } .h3z-hkeys td { padding:4px 6px; border-bottom:1px solid var(--line); vertical-align:top; } .h3z-hkeys td:first-child { white-space:nowrap; width:1%; }
.h3z-helpsec mark { background:rgba(251,191,36,.35); color:#fff; border-radius:3px; padding:0 1px; }
.h3z-helpnav { display:flex; flex-direction:column; gap:var(--h3z-gap); }
.h3z-helptoc { display:flex; flex-direction:column; gap:2px; }
.h3z-helptoc .it { display:flex; gap:8px; align-items:center; padding:6px 8px; border-radius:8px; cursor:pointer; color:#d6dafa; font-size:12.5px; }
.h3z-helptoc .it:hover { background:rgba(148,163,255,.1); } .h3z-helptoc .it.on { background:rgba(139,92,246,.22); color:#fff; }
.h3z-helptoc .it.dim { opacity:.35; }
.h3z-helptoc .n { width:20px; text-align:right; color:var(--mut); font-variant-numeric:tabular-nums; flex:none; }
.h3z-helpnone { padding:20px; text-align:center; }
.h3z-setbody { display:flex; flex-direction:column; gap:10px; padding-bottom:12px; }
.h3z-setbody .h3z-det .in { display:flex; flex-direction:column; gap:9px; }
.h3z-setscope { display:flex; flex-direction:column; gap:8px; padding:10px; border:1px solid var(--line); border-radius:10px; background:rgba(255,255,255,.025); }
.h3z-setscope .h3z-btn { align-self:flex-start; }
.h3z-settabs { display:flex; flex-wrap:wrap; gap:4px; position:sticky; top:0; z-index:3; padding:6px 0; background:var(--bg1); }
.h3z-settab { flex:1 1 auto; text-align:center; padding:7px 10px; border-radius:8px; cursor:pointer; font-size:12px; white-space:nowrap; color:#d6dafa; border:1px solid var(--line); background:rgba(255,255,255,.03); user-select:none; }
.h3z-settab:hover { background:rgba(148,163,255,.12); } .h3z-settab.on { background:rgba(139,92,246,.28); color:#fff; border-color:rgba(139,92,246,.6); }
.h3z-modrow { display:flex; gap:9px; align-items:flex-start; font-size:12px; }
.h3z-modrow > b { width:18px; height:18px; border-radius:50%; display:grid; place-items:center; font-size:11px; background:rgba(255,255,255,.08); flex:none; }
.h3z-modrow.ok > b { background:rgba(60,200,120,.22); color:#7ee2a8; }
.h3z-modrow.bad > b { background:rgba(240,80,90,.2); color:#ff9aa2; }
.h3z-modrow small { color:var(--mut); display:block; word-break:break-all; }
.h3z-note.mono { font-family:ui-monospace,Consolas,monospace; font-size:10.5px; white-space:pre-wrap; word-break:break-all; opacity:.8; }
.h3z-stagebtns { gap:6px; margin-top:6px; }
.h3z-stagebtns .h3z-btn { flex:1; }
.h3z-setlink { width:100%; justify-content:flex-start; margin-top:4px; }
.h3z-setlink span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.h3z-card-h > em.h3z-note { margin-left:auto; font-style:normal; font-size:11px; }
.h3z-menu.sub.solid { background:#141a33; border:1px solid var(--line2); border-radius:12px; backdrop-filter:none; box-shadow:0 18px 48px rgba(0,0,0,.7); }
/* ↑ Финал из черновика */
.h3z-cb.txt { width:auto; padding:0 7px; gap:3px; display:inline-flex; align-items:center; font:inherit; font-size:11px; font-weight:700; white-space:nowrap; }
.h3z-cb.fin { background:linear-gradient(135deg,rgba(139,92,246,.92),rgba(34,211,238,.85)); border-color:rgba(255,255,255,.35); }
.h3z-cb.fin b { font-size:12px; }
.h3z-finall { background:linear-gradient(135deg,rgba(139,92,246,.22),rgba(34,211,238,.14)); border-color:rgba(139,92,246,.5); }
.h3z-finall b { color:var(--a2); font-size:14px; }
.h3z-finall.dis { opacity:.5; }
.h3z-finblock { display:flex; flex-direction:column; gap:8px; padding:12px; border-radius:var(--r2); border:1px solid rgba(139,92,246,.35); background:linear-gradient(135deg,rgba(139,92,246,.10),rgba(34,211,238,.06)); }
.h3z-finblock .hd { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.h3z-finblock .row { display:flex; gap:8px; flex-wrap:wrap; }
.h3z-root .bd.draft { cursor:pointer; }

/* ---- «Галерея» / «Проекты» */
.h3z-gal { display:flex; flex-direction:column; gap:10px; padding:12px; min-height:0; flex:1; overflow:hidden; }
.h3z-ghead { display:flex; align-items:center; gap:8px; } .h3z-ghead b { font-size:14px; } .h3z-ghead .grow, .h3z-row .grow { flex:1; }
.h3z-pills.wrap { flex-wrap:wrap; } .h3z-pills.wrap .h3z-pill { flex:0 0 auto; }
.h3z-gbar { display:flex; gap:6px; align-items:center; } .h3z-gbar:empty { display:none; }
.h3z-ggrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(168px,1fr)); grid-auto-rows:max-content; gap:10px; overflow-x:hidden; overflow-y:auto; flex:1 1 0; min-height:0; align-content:start; padding:2px 4px 8px 2px; scrollbar-gutter:stable; }
.h3z-ggrid > .h3z-gcard { min-height:max-content; }
.h3z-ghead .gmode { flex:0 0 auto; padding:2px; } .h3z-ghead .gmode .h3z-pill { padding:3px 9px; font-size:11px; white-space:nowrap; }
.h3z-gcrumbs:empty { display:none; }
.h3z-gcrumb { display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:var(--r3); background:rgba(139,92,246,.10); border:1px solid rgba(139,92,246,.28); font-size:12px; min-width:0; }
.h3z-gcrumb b { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .h3z-gcrumb .sep { color:var(--mut); }
.h3z-gcard.stack { position:relative; margin:0 6px 6px 0; overflow:visible; }
.h3z-gcard.stack::before, .h3z-gcard.stack::after { content:""; position:absolute; inset:0; border-radius:var(--r3); border:1px solid var(--line); background:rgba(28,32,58,.92); z-index:-1; pointer-events:none; }
.h3z-gcard.stack::before { transform:translate(3px,3px); } .h3z-gcard.stack::after { transform:translate(6px,6px); opacity:.6; z-index:-2; }
.h3z-gcard.stack .pv { border-radius:var(--r3) var(--r3) 0 0; overflow:hidden; }
.h3z-gcard .chips { position:absolute; left:4px; bottom:4px; display:flex; flex-wrap:wrap; gap:3px; z-index:2; max-width:calc(100% - 50px); }
.h3z-gcard .cnt { position:absolute; right:4px; bottom:4px; z-index:2; font-size:10.5px; font-weight:800; padding:1px 6px; border-radius:6px; background:var(--grad); color:#fff; box-shadow:0 1px 6px rgba(0,0,0,.5); }
.h3z-gempty { grid-column:1/-1; color:var(--mut); font-size:12px; text-align:center; padding:24px 8px; border:1.5px dashed var(--line2); border-radius:var(--r2); }
.h3z-gcard { border-radius:var(--r3); overflow:hidden; background:rgba(148,163,255,.06); border:1px solid var(--line); cursor:pointer; transition:.12s; }
.h3z-gcard:hover { border-color:rgba(139,92,246,.5); } .h3z-gcard.sel { border-color:var(--a2); box-shadow:0 0 0 2px rgba(34,211,238,.35); }
.h3z-gcard .pv { position:relative; aspect-ratio:16/9; background:#05070f; }
.h3z-gcard .pv img, .h3z-gcard .pv video { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.h3z-gcard .noimg, .h3z-pcard .noimg, .h3z-pcur .noimg { position:absolute; inset:0; display:grid; place-items:center; font-size:22px; opacity:.5; }
.h3z-gcard .tags { position:absolute; left:4px; top:4px; display:flex; gap:3px; z-index:2; }
.h3z-gcard .k { font-size:9.5px; font-weight:700; padding:1px 5px; border-radius:5px; background:rgba(5,7,15,.78); color:#cdd3ff; }
.h3z-gcard .k.draft { color:#fbbf24; } .h3z-gcard .k.refine { color:#67e8f9; } .h3z-gcard .k.upscale { color:#c4b5fd; } .h3z-gcard .k.final { color:#86efac; } .h3z-gcard .k.region { color:#f9a8d4; } .h3z-gcard .k.on { background:var(--grad); color:#fff; }
.h3z-gcard .star { position:absolute; right:4px; top:2px; z-index:2; font-size:15px; color:rgba(255,255,255,.7); text-shadow:0 1px 4px #000; }
.h3z-gcard .star.on { color:#fbbf24; }
.h3z-gcard .cap { padding:5px 7px 6px; display:flex; flex-direction:column; gap:2px; min-width:0; }
.h3z-gcard .l1 { font-size:10.5px; color:var(--mut); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.h3z-gcard .l2 { font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .h3z-gcard .l3 { font-size:10px; color:var(--a2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.h3z-gview { width:min(1500px,94vw); max-height:92vh; padding:14px; display:flex; flex-direction:column; gap:10px; }
.h3z-gview .hd { display:flex; align-items:center; gap:8px; }
.h3z-gview .vids { display:grid; grid-template-columns:1fr; gap:12px; min-height:0; } .h3z-gview.two .vids { grid-template-columns:1fr 1fr; }
.h3z-gview .col { display:flex; flex-direction:column; gap:6px; min-width:0; }
.h3z-gview video { width:100%; max-height:70vh; background:#000; border-radius:var(--r3); }
.h3z-gview .vp { position:relative; overflow:hidden; border-radius:var(--r3); background:#000; touch-action:none; }
.h3z-gview .vp video { display:block; border-radius:0; transform-origin:50% 50%; will-change:transform; }
.h3z-gview .vp video.px { image-rendering:pixelated; }
.h3z-gview .vp.zoomed { cursor:grab; } .h3z-gview .vp.zoomed.drag { cursor:grabbing; }
.h3z-gview .zoom { display:flex; gap:3px; } .h3z-gview .zoom .on, .h3z-gview .ctr .on { background:var(--grad); color:#fff; border-color:transparent; }
.h3z-gview .lbl select { max-width:100%; }
.h3z-gview .lbl { display:flex; flex-direction:column; gap:2px; font-size:12px; } .h3z-gview .lbl span { color:var(--mut); } .h3z-gview .lbl small { color:var(--mut); opacity:.8; }
.h3z-gview .ctr { display:flex; align-items:center; gap:10px; } .h3z-gview .ctr .h3z-range { flex:1; }
.h3z-pcur { display:flex; flex-direction:column; gap:8px; padding:10px; border-radius:var(--r2); border:1px solid rgba(139,92,246,.35); background:linear-gradient(135deg,rgba(139,92,246,.10),rgba(34,211,238,.05)); }
.h3z-pcur .pv { position:relative; aspect-ratio:16/9; border-radius:var(--r3); overflow:hidden; background:#05070f; }
.h3z-pcur .pv img { width:100%; height:100%; object-fit:cover; display:block; }
.h3z-pcur .pv .k { position:absolute; left:6px; top:6px; font-size:10px; font-weight:700; padding:2px 6px; border-radius:6px; background:var(--grad); }
.h3z-row.wrap { flex-wrap:wrap; }
.h3z-plist { display:flex; flex-direction:column; gap:6px; overflow:auto; min-height:0; }
.h3z-pcard { display:flex; align-items:center; gap:10px; padding:6px; border-radius:var(--r3); border:1px solid var(--line); background:rgba(148,163,255,.05); cursor:pointer; }
.h3z-pcard:hover { border-color:rgba(139,92,246,.5); } .h3z-pcard.open { border-color:var(--a2); cursor:default; }
.h3z-pcard .pv { position:relative; width:84px; flex:none; aspect-ratio:16/9; border-radius:7px; overflow:hidden; background:#05070f; }
.h3z-pcard .pv img { width:100%; height:100%; object-fit:cover; display:block; }
.h3z-pcard .in { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
.h3z-pcard .in b { font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .h3z-pcard .in span, .h3z-pcard .in small { font-size:11px; color:var(--mut); }

/* «✂ Участок»: middle regeneration */
.h3z-btn.h3z-regbtn b { color:#f472b6; font-size:13px; }
.h3z-btn.h3z-regbtn.on { background:rgba(236,72,153,.18); border-color:rgba(236,72,153,.7); color:#fff; box-shadow:0 0 0 2px rgba(236,72,153,.18), 0 6px 18px rgba(236,72,153,.25); }
.h3z-reghint { font-size:11.5px; color:#f9a8d4; padding:3px 9px; border-radius:999px; border:1px dashed rgba(236,72,153,.45); background:rgba(236,72,153,.07); white-space:nowrap; }
.h3z-regmode .h3z-track.v, .h3z-regmode .h3z-track.v .h3z-clip { cursor:crosshair; }
.h3z-region { position:absolute; top:-3px; bottom:-3px; z-index:14; pointer-events:none; }
.h3z-region .core { position:absolute; top:0; bottom:0; border-radius:8px; background:rgba(236,72,153,.16); border:2px solid rgba(244,114,182,.95); box-shadow:0 0 0 1px rgba(0,0,0,.35), 0 0 18px rgba(236,72,153,.35); }
.h3z-region .zh, .h3z-region .zt { position:absolute; top:6px; bottom:6px; background:repeating-linear-gradient(135deg, rgba(34,211,238,.20) 0 6px, rgba(34,211,238,.05) 6px 12px); border:1px dashed rgba(34,211,238,.7); }
.h3z-region .zh { border-right:none; border-radius:7px 0 0 7px; } .h3z-region .zt { border-left:none; border-radius:0 7px 7px 0; }
.h3z-region .zh, .h3z-region .zt { pointer-events:auto; }
.h3z-region .tab { position:absolute; top:-1px; transform:translateY(-100%); padding:2px 8px; border-radius:7px 7px 0 0; background:linear-gradient(135deg,#ec4899,#a855f7); color:#fff; font-size:11px; font-weight:700; white-space:nowrap; pointer-events:auto; cursor:grab; box-shadow:0 -2px 10px rgba(236,72,153,.35); }
.h3z-region .eg { position:absolute; top:0; bottom:0; width:12px; margin-left:-6px; cursor:ew-resize; pointer-events:auto; z-index:2; }
.h3z-region .eg::after { content:""; position:absolute; left:4px; top:28%; bottom:28%; width:4px; border-radius:3px; background:#fff; box-shadow:0 0 8px rgba(236,72,153,.9); }
.h3z-region.sel .core { border-color:#fff; background:rgba(236,72,153,.24); }
.h3z-region.sel .tab { box-shadow:0 0 0 2px #fff; }
.h3z-region.draft .core { border-style:dashed; background:rgba(236,72,153,.10); }
.h3z-region.bad .core { border-color:var(--err); background:rgba(251,113,133,.14); }
.h3z-region.stale .tab { background:linear-gradient(135deg,#b45309,#f59e0b); }
.h3z-region.applied .core { background:rgba(236,72,153,.10); }
.h3z-region.running .core { animation:h3z-pulse 1.6s ease-in-out infinite; }
.h3z-regpop { position:absolute; z-index:100001; width:560px; padding:12px 14px; display:flex; flex-direction:column; gap:9px; border-color:rgba(236,72,153,.45); box-shadow:0 18px 50px rgba(0,0,0,.6), 0 0 0 1px rgba(236,72,153,.2); }
.h3z-regpop.dropover { border-color:var(--a2); }
.h3z-regpop .hd { display:flex; align-items:center; gap:8px; } .h3z-regpop .hd b { font-size:13.5px; color:#f9a8d4; } .h3z-regpop .tm { font-size:12px; color:var(--mut); font-variant-numeric:tabular-nums; }
.h3z-regpop .grow { flex:1; }
.h3z-regpop .info { display:flex; flex-direction:column; gap:3px; font-size:11.5px; color:var(--mut); line-height:1.4; }
.h3z-regpop .info b { color:var(--txt); } .h3z-regpop .info .snap { color:#67e8f9; } .h3z-regpop .info .wr { color:var(--warn); } .h3z-regpop .info .err { color:var(--err); font-weight:600; }
.h3z-regpop .refs { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.h3z-regpop .refs .rf { position:relative; width:38px; height:38px; border-radius:9px; overflow:hidden; border:1px solid var(--line2); background:var(--bg2); display:grid; place-items:center; }
.h3z-regpop .refs .rf img { width:100%; height:100%; object-fit:cover; }
.h3z-regpop .refs .rf i { position:absolute; top:0; right:0; width:15px; height:15px; line-height:14px; text-align:center; font-style:normal; font-size:12px; background:rgba(5,7,15,.8); border-radius:0 0 0 6px; cursor:pointer; color:#fff; }
.h3z-regpop .h3z-sel.sm, .h3z-regpop .h3z-in.sm { padding:5px 26px 5px 8px; font-size:12px; height:30px; }
.h3z-regpop .h3z-in.sm { padding-right:8px; width:120px; }
.h3z-regpop .row { display:grid; grid-template-columns:auto 1fr 1fr; gap:10px; align-items:end; }
.h3z-regpop .row .h3z-lbl { margin-bottom:4px; }
.h3z-regpop .sd { display:flex; gap:5px; }
.h3z-regpop .takes { flex-wrap:wrap; } .h3z-regpop .takes .h3z-pill { flex:0 0 auto; min-width:34px; }
.h3z-regpop .ft { display:flex; align-items:center; gap:10px; }
/* ---- fit-to-screen: the grid column must never grow past the window (wide header / long text pushed the UI off the right edge) ---- */
.h3z-root { grid-template-columns:minmax(0,1fr); }
.h3z-root > * { min-width:0; }
.h3z-head { overflow-x:auto; overflow-y:hidden; scrollbar-width:none; }
.h3z-head::-webkit-scrollbar { display:none; }
.h3z-body { grid-template-columns:60px var(--h3z-gap) min(var(--lw,272px),26vw) var(--h3z-gap) minmax(0,1fr) var(--h3z-gap) min(var(--rw,372px),30vw); }
.h3z-body > *, .h3z-insp, .h3z-insp > .h3z-card, .h3z-center, .h3z-panel { min-width:0; }
.h3z-insp { overflow-x:hidden; }
@media (max-width:1700px) { .h3z-run { min-width:240px; } .h3z-head { gap:8px; } .h3z-head .h3z-chip { padding:5px 8px; } }
.h3z-rs{margin-top:6px;padding:8px 10px;border-radius:10px;display:flex;flex-direction:column;gap:4px;font-size:12px}
.h3z-rs-row{display:flex;gap:6px;align-items:baseline;cursor:pointer}.h3z-rs-row em{opacity:.6;font-style:normal;margin-left:auto;max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.h3z-rs-row.proj span::after{content:" · проект";opacity:.55}.h3z-rs-warn{color:var(--warn)}.h3z-rs-warn:empty{display:none}.h3z-rs-btns{display:flex;gap:6px;margin-top:4px}
`;

export function injectStyle() {
  if (document.getElementById("h3z-style")) return;
  const s = document.createElement("style");
  s.id = "h3z-style";
  s.textContent = CSS;
  document.head.appendChild(s);
}

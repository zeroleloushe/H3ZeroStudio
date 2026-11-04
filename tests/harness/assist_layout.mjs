/**
 * Headless Chromium layout audit for the assistant panel.
 * Run: node tests/harness/assist_layout.mjs
 * Screenshots → /workspace/shots/
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SHOTS = "/workspace/shots";
fs.mkdirSync(SHOTS, { recursive: true });

const require = createRequire("/tmp/pwdeps/package.json");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: "playwright missing: " + e.message }));
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function serve(root) {
  return http.createServer((req, res) => {
    try {
      let u = decodeURIComponent((req.url || "/").split("?")[0]);
      if (u === "/") u = "/tests/harness/assist_layout.html";
      const fp = path.normalize(path.join(root, u.replace(/^\//, "")));
      if (!fp.startsWith(root)) { res.writeHead(403); res.end("forbidden"); return; }
      if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end("missing " + u); return; }
      const ext = path.extname(fp);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(fp).pipe(res);
    } catch (e) {
      res.writeHead(500); res.end(String(e));
    }
  });
}

const VIEWPORTS = [
  { name: "720p", width: 1280, height: 720 },
  { name: "1366", width: 1366, height: 768 },
  { name: "1080p", width: 1920, height: 1080 },
  { name: "1440p", width: 2560, height: 1440 },
  { name: "short", width: 1280, height: 600 },
];
const PANEL_WS = [300, 360, 420, 520, 700];
const VIEWS = ["chat", "chat-msgs", "connection", "presets", "styles", "generation", "context"];
const THEMES = ["neon", "graphite", "ocean"];

const CASES = [];
for (const vp of VIEWPORTS) {
  for (const pw of PANEL_WS) {
    const ph = Math.max(480, vp.height - 80);
    CASES.push({ vp, pw, ph, view: "chat", theme: "neon" });
  }
}
for (const view of VIEWS) {
  CASES.push({ vp: VIEWPORTS[0], pw: 360, ph: 640, view, theme: "neon" });
  CASES.push({ vp: VIEWPORTS[4], pw: 320, ph: 520, view, theme: "neon" });
}
// Message bg + reasoning across themes / widths
for (const theme of THEMES) {
  for (const pw of [320, 420, 700]) {
    CASES.push({ vp: VIEWPORTS[0], pw, ph: 640, view: "chat-msgs", theme });
  }
}
// Stream + keys (functional)
CASES.push({ vp: VIEWPORTS[0], pw: 420, ph: 640, view: "chat-stream", theme: "neon", shot: "assist_stream_mid" });
CASES.push({ vp: VIEWPORTS[0], pw: 420, ph: 640, view: "chat-keys", theme: "neon" });
CASES.push({ vp: VIEWPORTS[0], pw: 360, ph: 640, view: "chat-stream", theme: "graphite", shot: "assist_stream_graphite" });
CASES.push({ vp: VIEWPORTS[0], pw: 420, ph: 640, view: "chat-draft", theme: "neon" });
CASES.push({ vp: VIEWPORTS[0], pw: 420, ph: 640, view: "chat-md", theme: "neon", shot: "assist_markdown" });
// Title row alignment: model pill + gear at key panel widths × scales
for (const pw of [300, 360, 420, 700]) {
  for (const scale of [75, 100, 125]) {
    CASES.push({ vp: VIEWPORTS[0], pw, ph: 640, view: "chat", theme: "neon", scale, shot: scale === 100 ? `assist_title_${pw}` : undefined });
  }
}


const server = serve(ROOT);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--disable-dev-shm-usage"],
});

const results = [];
let fail = 0;
const shotKeep = new Set();

for (const c of CASES) {
  const id = `${c.view}_w${c.pw}_h${c.ph}_${c.vp.name}_${c.theme || "neon"}` + (c.scale != null && c.scale !== 100 ? `_s${c.scale}` : "");
  const page = await browser.newPage({ viewport: { width: c.vp.width, height: c.vp.height } });
  const url = `${base}/tests/harness/assist_layout.html?pw=${c.pw}&ph=${c.ph}&view=${encodeURIComponent(c.view)}&theme=${encodeURIComponent(c.theme || "neon")}` + (c.scale != null ? `&scale=${c.scale}` : "");
  let m = null; let err = null;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForFunction(() => window.__H3_LAYOUT__?.last, null, { timeout: 20000 });
    m = await page.evaluate(() => window.__H3_LAYOUT__.measure());
    const keepChat = m.view === "chat" && [300, 360, 420, 700].includes(c.pw) && (c.vp.name === "720p" || c.vp.name === "short") && c.theme === "neon";
    const keepMsgs = m.view === "chat-msgs" && ((c.theme === "neon" && c.pw === 420) || (c.theme === "graphite" && c.pw === 420) || (c.theme === "ocean" && c.pw === 420));
    const keepStream = m.view === "chat-stream";
    if (keepChat || keepMsgs || keepStream || !m.ok) {
      const shot = path.join(SHOTS, `${c.shot || id}.png`);
      await page.locator("#layout-shell").screenshot({ path: shot });
      shotKeep.add(shot);
      // Explicit mid/after names for stream
      if (m.view === "chat-stream") {
        const midShot = path.join(SHOTS, "assist_stream_thinking.png");
        await page.locator("#layout-shell").screenshot({ path: midShot });
        shotKeep.add(midShot);
      }
    }
  } catch (e) {
    err = String(e && e.message || e);
    try {
      const shot = path.join(SHOTS, `${id}_ERR.png`);
      await page.screenshot({ path: shot, fullPage: true });
      shotKeep.add(shot);
    } catch {}
  }
  await page.close();
  const row = { id, view: c.view, pw: c.pw, ph: c.ph, vp: c.vp.name, theme: c.theme, ok: !!(m && m.ok) && !err, err, measure: m };
  results.push(row);
  if (!row.ok) fail++;
  const mark = row.ok ? "PASS" : "FAIL";
  const extra = m?.view === "chat-stream" ? ` streamOk=${m.streamOk}` : m?.view === "chat-keys" ? ` keysOk=${m.keysOk}` : m?.view === "chat-md" ? ` mdOk=${m.mdOk}` : m?.view === "chat-draft" ? ` draftOk=${m.draftOk}` : m?.view === "chat-msgs" ? ` bubbleBgOk=${m.bubbleBgOk}` : "";
  console.log(`${mark} ${id}` + (m ? ` ta=${m.taWidth} offenders=${m.offenders.length} titleAlign=${m.titleAlignOk}${extra}` : "") + (m?.titleAlign ? ` h=${m.titleAlign.statusH}/${m.titleAlign.gearH} dH=${m.titleAlign.heightDiff} cSG=${m.titleAlign.centerSG} w=${m.titleAlign.statusW}` : "") + (err ? ` err=${err.slice(0, 120)}` : ""));
}

await browser.close();
server.close();

const summary = { ok: fail === 0, fail, total: results.length, shots: [...shotKeep], results: results.map((r) => ({
  id: r.id, ok: r.ok, err: r.err, offenders: r.measure?.offenders, taWidth: r.measure?.taWidth, composeInside: r.measure?.composeInside,
  bubbleBgOk: r.measure?.bubbleBgOk, streamOk: r.measure?.streamOk, keysOk: r.measure?.keysOk, draftOk: r.measure?.draftOk, stream: r.measure?.stream, keys: r.measure?.keys, draft: r.measure?.draft,
})) };
fs.writeFileSync(path.join(SHOTS, "assist_layout_report.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ok: summary.ok, fail, total: results.length, shots: summary.shots }, null, 2));
process.exit(fail ? 1 : 0);

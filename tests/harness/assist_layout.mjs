/**
 * Headless Chromium layout audit for the assistant panel.
 * Run: node tests/harness/assist_layout.mjs
 * Screenshots → /workspace/shots/
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
// Full matrix is large — sample strategically + always cover critical chat widths
const CASES = [];
for (const vp of VIEWPORTS) {
  for (const pw of PANEL_WS) {
    const ph = Math.max(480, vp.height - 80);
    CASES.push({ vp, pw, ph, view: "chat" });
  }
}
for (const view of VIEWS) {
  CASES.push({ vp: VIEWPORTS[0], pw: 360, ph: 640, view });
  CASES.push({ vp: VIEWPORTS[4], pw: 320, ph: 520, view });
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
  const id = `${c.view}_w${c.pw}_h${c.ph}_${c.vp.name}`;
  const page = await browser.newPage({ viewport: { width: c.vp.width, height: c.vp.height } });
  const url = `${base}/tests/harness/assist_layout.html?pw=${c.pw}&ph=${c.ph}&view=${encodeURIComponent(c.view)}`;
  let m = null; let err = null;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForFunction(() => window.__H3_LAYOUT__?.last, null, { timeout: 20000 });
    m = await page.evaluate(() => window.__H3_LAYOUT__.measure());
    const shot = path.join(SHOTS, `${id}.png`);
    // always keep chat at key widths + any failures
    if (m.view === "chat" && [300, 360, 420, 700].includes(c.pw) && (c.vp.name === "720p" || c.vp.name === "short")) {
      await page.locator("#layout-shell").screenshot({ path: shot });
      shotKeep.add(shot);
    } else if (!m.ok) {
      await page.locator("#layout-shell").screenshot({ path: shot });
      shotKeep.add(shot);
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
  const row = { id, view: c.view, pw: c.pw, ph: c.ph, vp: c.vp.name, ok: !!(m && m.ok) && !err, err, measure: m };
  results.push(row);
  if (!row.ok) fail++;
  const mark = row.ok ? "PASS" : "FAIL";
  console.log(`${mark} ${id}` + (m ? ` ta=${m.taWidth} offenders=${m.offenders.length}` : "") + (err ? ` err=${err.slice(0, 120)}` : ""));
}

await browser.close();
server.close();

const summary = { ok: fail === 0, fail, total: results.length, shots: [...shotKeep], results: results.map((r) => ({
  id: r.id, ok: r.ok, err: r.err, offenders: r.measure?.offenders, taWidth: r.measure?.taWidth, composeInside: r.measure?.composeInside,
})) };
fs.writeFileSync(path.join(SHOTS, "assist_layout_report.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ok: summary.ok, fail, total: results.length, shots: summary.shots }, null, 2));
process.exit(fail ? 1 : 0);

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
const { chromium } = require("playwright");

const MIME = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".mjs":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8" };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") u = "/tests/harness/welcome_scale.html";
  const fp = path.normalize(path.join(ROOT, u.replace(/^\//, "")));
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end("missing"); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(fp).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();

const CASES = [
  { w: 1920, h: 1080, scale: 100 },
  { w: 1366, h: 768, scale: 100 },
  { w: 1280, h: 800, scale: 80 },
  { w: 1920, h: 1080, scale: 125 },
  { w: 1600, h: 900, scale: 90 },
  { w: 2560, h: 1440, scale: 110 },
];

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-dev-shm-usage"] });
const results = [];
let fail = 0;
const shots = [];

for (const c of CASES) {
  const id = `welcome_${c.w}x${c.h}_s${c.scale}`;
  const page = await browser.newPage({ viewport: { width: c.w, height: c.h } });
  page.on("pageerror", (e) => console.log("PAGEERR", id, e.message));
  let m = null, err = null, flip = null;
  try {
    await page.goto(`http://127.0.0.1:${port}/tests/harness/welcome_scale.html?w=${c.w}&h=${c.h}&scale=${c.scale}&theme=neon`, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForFunction(() => window.__H3_WELCOME__?.last, null, { timeout: 25000 });
    await page.waitForSelector(".h3z-welcome .h3z-ui-scale", { timeout: 10000 });
    m = await page.evaluate(() => window.__H3_WELCOME__.measure());
    // flip scale via shared setter and ensure header+welcome stay synced
    const next = c.scale === 100 ? 125 : 100;
    flip = await page.evaluate(async (pct) => window.__H3_WELCOME__.flipTo(pct), next);
    const shot = path.join(SHOTS, `${id}.png`);
    await page.locator(".h3z-welcome").screenshot({ path: shot });
    shots.push(shot);
    if (!m.ok || !flip?.ok || flip.scale !== next) fail++;
  } catch (e) {
    err = String(e.message || e); fail++;
    try { const shot = path.join(SHOTS, `${id}_ERR.png`); await page.screenshot({ path: shot, fullPage: true }); shots.push(shot); } catch {}
  }
  results.push({ id, ok: !!(m && m.ok && flip?.ok && !err), err, measure: m, flip });
  console.log(`${(m?.ok && flip?.ok) ? "PASS" : "FAIL"} ${id}` + (m ? ` synced=${m.synced} fits=${m.fits}` : "") + (flip ? ` flip=${flip.scale}` : "") + (err ? ` err=${err.slice(0,120)}` : ""));
  await page.close();
}

await browser.close(); server.close();
const summary = { ok: fail === 0, fail, total: results.length, shots, results };
fs.writeFileSync(path.join(SHOTS, "welcome_scale_report.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ok: summary.ok, fail, total: results.length }, null, 2));
process.exit(fail ? 1 : 0);

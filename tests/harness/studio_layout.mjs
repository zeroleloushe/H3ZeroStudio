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
  if (u === "/") u = "/tests/harness/studio_layout.html";
  const fp = path.normalize(path.join(ROOT, u.replace(/^\//, "")));
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end("missing"); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(fp).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();

const CASES = [
  { w: 1920, h: 1080, scale: 100 },
  { w: 1920, h: 1080, scale: 75 },
  { w: 1920, h: 1080, scale: 90 },
  { w: 1920, h: 1080, scale: 125 },
  { w: 1920, h: 1080, scale: 80 },
  { w: 1600, h: 900, scale: 100 },
  { w: 1366, h: 768, scale: 100 },
  { w: 2560, h: 1440, scale: 100 },
  { w: 1366, h: 768, scale: 90 },
];

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-dev-shm-usage"] });
const results = [];
let fail = 0;
const shots = [];

for (const c of CASES) {
  const id = `studio_${c.w}x${c.h}_s${c.scale}`;
  const page = await browser.newPage({ viewport: { width: c.w, height: c.h } });
  page.on("pageerror", (e) => console.log("PAGEERR", id, e.message));
  let m = null, err = null;
  try {
    await page.goto(`http://127.0.0.1:${port}/tests/harness/studio_layout.html?w=${c.w}&h=${c.h}&scale=${c.scale}&theme=neon`, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForFunction(() => window.__H3_STUDIO__?.last, null, { timeout: 25000 });
    // ensure assist open + grow
    await page.evaluate(async () => {
      const ed = window.__H3_STUDIO__.ed;
      ed.openAssist();
      const ta = ed.root.querySelector("textarea.h3z-ast-input");
      if (ta) { ta.value = "Сделай кинематографичный промпт: героиня Anna идёт по тёмному коридору, continuous shot, no cuts. ".repeat(3); ed.astAutoGrow(ta); }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      window.__H3_STUDIO__.last = window.__H3_STUDIO__.measure();
    });
    m = await page.evaluate(() => window.__H3_STUDIO__.measure());
    const shot = path.join(SHOTS, `${id}.png`);
    await page.locator(".h3z-root").screenshot({ path: shot });
    shots.push(shot);
    if (!m.ok) fail++;
  } catch (e) {
    err = String(e.message || e); fail++;
    try { const shot = path.join(SHOTS, `${id}_ERR.png`); await page.screenshot({ path: shot, fullPage: true }); shots.push(shot); } catch {}
  }
  results.push({ id, ok: !!(m && m.ok) && !err, err, measure: m });
  console.log(`${m?.ok ? "PASS" : "FAIL"} ${id}` + (m ? ` send=${m.sendVisible} zoomBox=${m.zoomBoxOk} title=${m.titleInside} mode=${m.modeVisible} hist=${m.histInside} stack=${m.headerStackOk} flexNone=${m.headerFlexNone} composeIn=${m.composeInside} md=${m.mdSnakeOk} pops=${m.headerPopOk} scrollH=${m.scrollH} off=${m.offenders.length}` : "") + (err ? ` err=${err.slice(0,120)}` : ""));
  await page.close();
}

await browser.close(); server.close();
const summary = { ok: fail === 0, fail, total: results.length, shots, results };
fs.writeFileSync(path.join(SHOTS, "studio_layout_report.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ok: summary.ok, fail, total: results.length, shots }, null, 2));
process.exit(fail ? 1 : 0);

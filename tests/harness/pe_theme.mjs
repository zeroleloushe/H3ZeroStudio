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

const MIME = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".mjs":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".woff2":"font/woff2" };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") u = "/tests/harness/pe_theme.html";
  const fp = path.normalize(path.join(ROOT, u.replace(/^\//, "")));
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end("missing "+u); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(fp).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();

const THEMES = ["neon", "ocean", "porcelain", "sunset", "win98"];
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-dev-shm-usage"] });
const results = [];
let fail = 0;
const shots = [];

for (const theme of THEMES) {
  const id = `pe_${theme}`;
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("pageerror", (e) => console.log("PAGEERR", id, e.message));
  let m = null, err = null;
  try {
    await page.goto(`http://127.0.0.1:${port}/tests/harness/pe_theme.html?theme=${theme}&w=1600&h=900`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForFunction(() => window.__H3_PE__?.last, null, { timeout: 45000 });
    await page.waitForSelector(".h3z-pe .cm-content", { timeout: 30000 });
    await page.waitForTimeout(300);
    m = await page.evaluate(() => window.__H3_PE__.measure());
    const shot = path.join(SHOTS, `${id}.png`);
    await page.locator(".h3z-pe").screenshot({ path: shot });
    shots.push(shot);
    if (!m.ok) fail++;
  } catch (e) {
    err = String(e.message || e); fail++;
    try { const shot = path.join(SHOTS, `${id}_ERR.png`); await page.screenshot({ path: shot, fullPage: true }); shots.push(shot); } catch {}
  }
  results.push({ id, ok: !!(m && m.ok) && !err, err, measure: m });
  console.log(`${m?.ok ? "PASS" : "FAIL"} ${id}` + (m ? ` contrast=${m.contrastOk} light=${m.lightOk} dark=${m.darkOk} pe=${JSON.stringify(m.peBg)} ed=${JSON.stringify(m.edBg)}` : "") + (err ? ` err=${err.slice(0,160)}` : ""));
  await page.close();
}

await browser.close(); server.close();
const summary = { ok: fail === 0, fail, total: results.length, shots, results };
fs.writeFileSync(path.join(SHOTS, "pe_theme_report.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ok: summary.ok, fail, total: results.length }, null, 2));
process.exit(fail ? 1 : 0);

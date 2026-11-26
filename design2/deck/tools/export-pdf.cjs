#!/usr/bin/env node
// PDF деки: по странице 1920×1080 на слайд, последний шаг.
//   cd design2 && python3 -m http.server 8080
//   NODE_PATH=<папка с node_modules/playwright-core> node deck/tools/export-pdf.cjs [--base http://localhost:8080] [--chrome путь]
// Пишет deck/deck.pdf (?track=all&print, все слайды и приложения) и deck/deck-3.pdf (?track=3&print).
const fs = require("fs");
const path = require("path");
let pw;
try { pw = require("playwright-core"); } catch (e) { pw = require("playwright"); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; };
const DECK = path.resolve(__dirname, "..");

function findChrome() {
  if (opt("chrome")) return opt("chrome");
  const root = path.join(process.env.HOME || "", ".cache", "ms-playwright");
  if (!fs.existsSync(root)) return undefined;
  const dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => +b.split("-")[1] - +a.split("-")[1]);
  for (const d of dirs) for (const sub of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
    const p = path.join(root, d, sub); if (fs.existsSync(p)) return p;
  }
  return undefined;
}

(async () => {
  const base = opt("base", "http://localhost:8080").replace(/\/$/, "");
  const b = await pw.chromium.launch({ executablePath: findChrome() });
  for (const [q, out] of [["track=all&print", "deck.pdf"], ["track=3&print", "deck-3.pdf"]]) {
    const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
    await p.goto(`${base}/deck/index.html?${q}`);
    await p.waitForFunction(() => document.documentElement.dataset.ready === "1");
    await p.waitForTimeout(1500);   // свежий numbers.json и картинки
    await p.pdf({ path: path.join(DECK, out), width: "1920px", height: "1080px", printBackground: true, preferCSSPageSize: true });
    const n = await p.evaluate(() => document.querySelectorAll(".slide:not(.off-track)").length);
    console.log(out, n, "стр.");
    await p.close();
  }
  await b.close();
})();

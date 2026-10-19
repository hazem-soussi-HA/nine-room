/**
 * Nine Room — CI smoke test.
 * Serves the game, boots it in Chromium, starts a match, plays a break and
 * fails the build if the page throws or the game never leaves the menu.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import playwright from "playwright";
const { chromium } = playwright;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8099;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

const problems = [];

await new Promise((resolve) => server.listen(PORT, resolve));

const browser = await chromium.launch({
  args: ["--no-sandbox", "--disable-gpu", "--mute-audio"],
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  const text = message.text();
  if (message.type() !== "error") return;
  if (text.includes("favicon")) return;
  if (text.includes("net::ERR_FAILED") || text.includes("fonts.")) return; // web fonts are blocked on purpose
  problems.push(`console: ${text}`);
});

try {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#gameCanvas", { state: "attached" });
  await page.waitForTimeout(1200);

  const state = await page.evaluate(() => document.body.className);
  if (!state.includes("state-menu")) problems.push(`expected the menu on boot, got "${state}"`);

  await page.click('[data-start="ai"]');
  await page.waitForTimeout(1200);

  const inGame = await page.evaluate(() => document.body.className);
  if (!inGame.includes("in-game")) problems.push(`expected an active match, got "${inGame}"`);

  const box = await page.locator("#gameCanvas").boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx + 80, cy - 20);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await page.waitForTimeout(1500);

  const shooting = await page.evaluate(() => document.body.className);
  if (!shooting.includes("state-shooting")) problems.push(`expected the break to be in motion, got "${shooting}"`);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const paused = await page.evaluate(() => document.body.className);
  if (!paused.includes("state-paused")) problems.push(`expected the pause overlay, got "${paused}"`);
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.error("Smoke test failed:\n- " + problems.join("\n- "));
  process.exit(1);
}

console.log("Smoke test passed: menu -> match -> break -> pause, no console errors.");

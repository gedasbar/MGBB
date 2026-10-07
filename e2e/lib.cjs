// Shared helpers for the browser end-to-end scripts. Requires the Vite dev server (`npm run dev`).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const URL = process.env.GAME_URL || 'http://localhost:5173';
const OUT = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const VIEW = { W: 540, H: 960 };

let failures = 0;
let passes = 0;
function check(cond, msg) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${msg}\n`);
  if (cond) passes++; else failures++;
}
const counts = () => ({ passes, failures });

/** Same maths as src/input.ts clientToGame, inverted: game coordinates -> client coordinates of the canvas. */
async function gameToClient(page, gx, gy) {
  const box = await page.locator('canvas').boundingBox();
  const s = Math.min(box.width / VIEW.W, box.height / VIEW.H);
  return {
    x: box.x + (box.width - VIEW.W * s) / 2 + gx * s,
    y: box.y + (box.height - VIEW.H * s) / 2 + gy * s,
  };
}

async function tap(page, gx, gy, { pause = 120 } = {}) {
  const p = await gameToClient(page, gx, gy);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(30);
  await page.mouse.up();
  await page.waitForTimeout(pause);
}

/** Two quick taps (a double tap). */
async function doubleTap(page, gx, gy, { pause = 200 } = {}) {
  const p = await gameToClient(page, gx, gy);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(25);
  await page.mouse.up();
  await page.waitForTimeout(70);
  await page.mouse.down();
  await page.waitForTimeout(25);
  await page.mouse.up();
  await page.waitForTimeout(pause);
}

async function drag(page, gx0, gy0, gx1, gy1, steps = 12) {
  const a = await gameToClient(page, gx0, gy0);
  const b = await gameToClient(page, gx1, gy1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
  await page.waitForTimeout(150);
}

async function wheel(page, gx, gy, deltaY) {
  const p = await gameToClient(page, gx, gy);
  await page.mouse.move(p.x, p.y);
  await page.mouse.wheel(0, deltaY);
  await page.waitForTimeout(150);
}

/** RGB of one screen pixel of the page, read back from a screenshot. */
async function pixelAtClient(page, x, y) {
  const png = await page.screenshot({ clip: { x: Math.round(x) - 1, y: Math.round(y) - 1, width: 3, height: 3 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(1, 1, 1, 1).data;
    return [d[0], d[1], d[2]];
  }, png.toString('base64'));
}

/** Reads many pixels from one screenshot. points: [{x,y}] in client px. */
async function pixelsAtClient(page, points) {
  const png = await page.screenshot();
  return page.evaluate(async ({ b64, points }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return points.map(p => {
      const d = ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data;
      return [d[0], d[1], d[2]];
    });
  }, { b64: png.toString('base64'), points });
}

/** "Red line" pixels: strongly red, little green/blue. */
const isRedLine = ([r, g, b]) => r > 200 && g < 110 && b < 110;

async function openGame(browser, { viewport = { width: 540, height: 960 }, clearStorage = true, permissions = [] } = {}) {
  const context = await browser.newContext({ viewport, permissions });
  const page = await context.newPage();
  page.on('pageerror', (err) => check(false, `page error: ${err.message}`));
  page.on('console', (m) => { if (m.type() === 'error') process.stdout.write(`console.error: ${m.text()}\n`); });
  if (clearStorage) await page.addInitScript(() => { if (!sessionStorage.getItem('__cleared')) { localStorage.clear(); sessionStorage.setItem('__cleared', '1'); } });
  await page.goto(URL);
  await page.waitForFunction(() => !!window.__mgbm);
  await page.waitForTimeout(400);
  return { page, context };
}

const state = (page) => page.evaluate(() => window.__mgbm.state());

async function shot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file });
  return file;
}

module.exports = {
  chromium, URL, OUT, VIEW, check, counts, gameToClient, tap, doubleTap, drag, wheel,
  pixelAtClient, pixelsAtClient, isRedLine, openGame, state, shot,
};

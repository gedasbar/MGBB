// Shared helpers for the browser end-to-end scripts. Requires the Vite dev server (`npm run dev`).
const { chromium: pwChromium } = require('playwright');

// CHROMIUM_PATH (or a pre-installed /opt/pw-browsers/chromium) is used when Playwright's own browser download is missing.
const EXEC = process.env.CHROMIUM_PATH || (require('fs').existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const chromium = {
  launch: (opts = {}) => pwChromium.launch(EXEC && !opts.executablePath ? { ...opts, executablePath: EXEC } : opts),
};
const path = require('path');
const fs = require('fs');

// The stats overlay is on by default in dev; screenshots and pixel checks want it off unless a script asks (stats=1 in GAME_URL).
const BASE_URL = process.env.GAME_URL || 'http://localhost:5173';
// Backgrounds are off for the same reason (the headless software renderer pays for every full-screen layer): bg=<id> in GAME_URL
// turns one on. Pixel checks and timings of the older scripts see the plain dark screen as before.
const withParam = (u, k, v) => (new RegExp(`[?&]${k}=`).test(u) ? u : u + (u.includes('?') ? '&' : '?') + `${k}=${v}`);
const URL = withParam(withParam(BASE_URL, 'stats', 0), 'bg', 'off');
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

/** Moves the mouse somewhere neutral (the title bar) so a hover tooltip never lingers over the grid. */
async function park(page) {
  const p = await gameToClient(page, 270, 8);
  await page.mouse.move(p.x, p.y);
}

async function tap(page, gx, gy, { pause = 120 } = {}) {
  const p = await gameToClient(page, gx, gy);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(30);
  await page.mouse.up();
  await park(page);
  await page.waitForTimeout(pause);
}

async function drag(page, gx0, gy0, gx1, gy1, steps = 12) {
  const a = await gameToClient(page, gx0, gy0);
  const b = await gameToClient(page, gx1, gy1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
  await park(page);
  await page.waitForTimeout(150);
}

async function wheel(page, gx, gy, deltaY) {
  const p = await gameToClient(page, gx, gy);
  await page.mouse.move(p.x, p.y);
  await page.mouse.wheel(0, deltaY);
  await park(page);
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

/** Counts pixels in a square region (game coords, +-half game px) whose colour satisfies `pred` (a function source string `([r,g,b]) => bool`). */
async function countInRegion(page, gx, gy, half, predSrc) {
  const a = await gameToClient(page, gx - half, gy - half);
  const b = await gameToClient(page, gx + half, gy + half);
  const png = await page.screenshot({ clip: { x: a.x, y: a.y, width: Math.max(1, b.x - a.x), height: Math.max(1, b.y - a.y) } });
  return page.evaluate(async ({ b64, predSrc }) => {
    const pred = eval(predSrc);
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (pred([d[i], d[i + 1], d[i + 2]])) n++;
    return n;
  }, { b64: png.toString('base64'), predSrc });
}

/** Colour tests (function-source strings, see countInRegion) for the marks that were removed in chunk 1. */
const AUTO_BADGE_PRED = '([r,g,b]) => g > 90 && r < 60 && b < 80'; // the old green "A" disc, rgb(15,110,42)
const PADLOCK_PRED = '([r,g,b]) => r > 220 && g > 180 && b < 120'; // the old yellow padlock, rgb(255,211,77)
const NO_SIGNAL_PRED = '([r,g,b]) => r > 235 && g > 70 && g < 112 && b > 70 && b < 112'; // the old red ring, rgb(255,90,90)

/** Same as countInRegion, but over a PNG buffer whose pixels are 1:1 with game px (a 540x960 screenshot). */
async function countInImage(page, png, x0, y0, x1, y1, predSrc) {
  return page.evaluate(async ({ b64, x0, y0, x1, y1, predSrc }) => {
    const pred = eval(predSrc);
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const w = Math.max(1, Math.round(x1 - x0)), h = Math.max(1, Math.round(y1 - y0));
    const d = ctx.getImageData(Math.round(x0), Math.round(y0), w, h).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (pred([d[i], d[i + 1], d[i + 2]])) n++;
    return n;
  }, { b64: png.toString('base64'), x0, y0, x1, y1, predSrc });
}

/** Counts matching pixels in many regions of one PNG at once. regions: [{x0,y0,x1,y1,pred}] (pred = function source). */
async function scanImage(page, png, regions) {
  return page.evaluate(async ({ b64, regions }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return regions.map(r => {
      const pred = eval(r.pred);
      const w = Math.max(1, Math.round(r.x1 - r.x0)), h = Math.max(1, Math.round(r.y1 - r.y0));
      const d = ctx.getImageData(Math.round(r.x0), Math.round(r.y0), w, h).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (pred([d[i], d[i + 1], d[i + 2]])) n++;
      return n;
    });
  }, { b64: png.toString('base64'), regions });
}

/** "Red line" pixels: strongly red, little green/blue. */
const isRedLine = ([r, g, b]) => r > 200 && g < 110 && b < 110;

const SHOWN_BLOCKS = ['turn_l', 'turn_r', 'splitter_2', 'splitter_3', 'flat_plus', 'percent_mult', 'lucky_strike', 'jackpot', 'gamblers_gate', 'piercing', 'bouncing', 'aoe_circle', 'shield_breaker', 'pure_converter', 'curving_right', 'random_curve', 'homing', 'aoe_rect', 'fork_impact', 'armor_piercer'];

/** Progress with 20 of every block and every hull: the pre-economy starting state the older scripts were written for. */
function richProgressJson() {
  const owned = {}, levels = {};
  for (const id of SHOWN_BLOCKS) { owned[id] = 20; levels[id] = 1; }
  return JSON.stringify({ version: 1, credits: 0, owned, levels, ownedHulls: ['shuttle', 'fan'], bestTier: 0, bestTime: 0, totalKills: 0, runs: 0 });
}

// `dart: true` keeps the truly fresh save (the free one-slot Dart). Otherwise the save starts on the Shuttle, which the older
// scripts were written for (the hull ladder came later): the Shuttle is owned and selected, everything else is new-game.
async function openGame(browser, { viewport = { width: 540, height: 960 }, clearStorage = true, permissions = [], rich = true, dart = false } = {}) {
  const context = await browser.newContext({ viewport, permissions });
  const page = await context.newPage();
  page.on('pageerror', (err) => check(false, `page error: ${err.message}`));
  page.on('console', (m) => { if (m.type() === 'error') process.stdout.write(`console.error: ${m.text()}\n`); });
  if (clearStorage) {
    const progress = rich ? richProgressJson() : (dart ? null : '{"ownedHulls":["shuttle"]}');
    const builder = dart ? null : '{"version":2,"activeHull":"shuttle","hulls":{}}';
    await page.addInitScript(([progress, builder]) => {
      if (!sessionStorage.getItem('__cleared')) {
        localStorage.clear();
        if (progress) localStorage.setItem('mgbm.progress.v1', progress);
        if (builder) localStorage.setItem('mgbm.builder.v2', builder);
        sessionStorage.setItem('__cleared', '1');
      }
    }, [progress, builder]);
  }
  await page.goto(URL);
  await page.waitForFunction(() => !!window.__mgbm);
  // The debug cheat panel is a lazy import: with ?debug=1 wait (up to 8 s) until it is there, so a cold dev server does not break scripts that click its buttons.
  if (/[?&]debug=1/.test(URL)) await page.waitForFunction(() => !!document.getElementById('dbg-fr-unlock'), null, { timeout: 8000 }).catch(() => {});
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
  chromium, URL, OUT, VIEW, check, counts, gameToClient, park, tap, drag, wheel,
  pixelAtClient, pixelsAtClient, countInRegion, countInImage, scanImage, isRedLine, AUTO_BADGE_PRED, PADLOCK_PRED, NO_SIGNAL_PRED, openGame, state, shot,
};

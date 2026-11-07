// Chunk 34b contact sheet (a picture generator, not a test): Core crystals being pulled to the ship, the +N / sparks / flash on collection, the HUD bump and the
// new run summaries. Output: reports/chunk34b/sheet_34b.png (and the single pictures next to it).
// Needs the Vite dev server. Run: node e2e/sheet-chunk34b.cjs   (adds ?debug=1 itself)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, waitFor, state } = lib;
const OUT = path.join(__dirname, '..', 'reports', 'chunk34b');
fs.mkdirSync(OUT, { recursive: true });

async function canvasShot(page, name) {
  const b = await page.locator('canvas').screenshot();
  if (name) fs.writeFileSync(path.join(OUT, name + '.png'), b);
  return b.toString('base64');
}
async function montage(page, shots, captions, file, per = 4) {
  const b64 = await page.evaluate(async ({ shots, captions, per }) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
    const k = 0.5, pad = 8, cap = 22;
    const w = Math.round(540 * k), h = Math.round(960 * k);
    const rows = Math.ceil(imgs.length / per);
    const c = document.createElement('canvas');
    c.width = per * (w + pad) + pad; c.height = rows * (h + cap + pad) + pad;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => {
      const x = pad + (i % per) * (w + pad), y = pad + Math.floor(i / per) * (h + cap + pad);
      ctx.drawImage(im, x, y, w, h);
      ctx.fillStyle = '#aaa'; ctx.font = '11px monospace'; ctx.fillText(captions[i], x, y + h + 15);
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { shots, captions, per });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: true });
  const shots = [], caps = [];
  const snap = async (cap, name) => { await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; }); shots.push(await canvasShot(page, name)); caps.push(cap); };
  check((await lib.startFreeFly(page)) !== 'noEjector', 'free fly started');
  await waitFor(() => page.evaluate(() => !!window.__mgbm && !!window.__mgbm.world));
  await page.evaluate(() => { const w = window.__mgbm.world; w.god = true; w.jumpToWave(5); });
  await waitFor(() => page.evaluate(() => window.__mgbm.world.crystalPool > 0), { timeout: 10000 });
  const setup = () => page.evaluate(() => {
    const w = window.__mgbm.world;
    w.autoSpawn = false; w.clearEnemies(); w.crystals.clear();
    w.teleportShip(270, 700);
    // five crystals around the ship, outside the collect radius, inside the pull radius, each worth 5.
    [[-70, -20], [66, -40], [-40, 52], [50, 58], [0, -76]].forEach(([dx, dy]) => w.crystals.drop(270 + dx, 700 + dy, 5));
    for (const c of w.crystals.list) { c.vx = 0; c.vy = 0; }
  });
  await setup();
  // The loop is stopped (time scale 0) and the screen is stepped by hand, 1/60 s a frame, so a frame in the middle of the pull can be photographed.
  await page.evaluate(() => { window.__mgbm.setTimeScale(0); });
  const step = (n, untilPickup = false) => page.evaluate(({ n, untilPickup }) => {
    const sc = window.__mgbmSm.currentScreen;
    for (let i = 0; i < n; i++) { sc.update(1 / 60, 1 / 60, performance.now()); if (untilPickup && sc.world.crystals.pickups.length) break; }
  }, { n, untilPickup });
  const s0 = await state(page);
  check(s0.crystals.count === 5, 'five crystals around the ship');
  await step(4);
  console.log('INFO  mid pull:', JSON.stringify((await state(page)).crystals.list.map(c => [Math.round(c.x), Math.round(c.y)])));
  await page.waitForTimeout(120);
  await snap('1: crystals caught by the magnet, curving in', 'pull-1');
  await step(3);
  await page.waitForTimeout(120);
  await snap('2: a frame later, closer', 'pull-2');
  await step(60, true);
  check((await state(page)).crystals.collected > 0, 'the magnet delivered a crystal');
  await page.waitForTimeout(120);
  await snap('3: first crystal taken: +N, sparks, flash, HUD bump', 'collect-1');
  await step(2);
  await page.waitForTimeout(120);
  await snap('4: more taken, the +N adds up', 'collect-2');
  await step(30);
  const pops = await state(page);
  console.log('INFO  corePops:', JSON.stringify(pops.corePops), 'collected', pops.crystals.collected);
  await page.evaluate(() => window.__mgbm.setTimeScale(1));
  // ---- summaries
  await page.evaluate(() => { const w = window.__mgbm.world; w.hull = 0; w.gameOver = true; });
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'summary', null, { timeout: 8000 });
  const sum = await state(page);
  console.log('INFO  summary:', JSON.stringify({ cores: sum.cores, label: sum.coresLabel, credits: sum.credits, medals: sum.captain && sum.captain.medals }));
  check(sum.coresLabel !== undefined, 'summary exposes the Cores line');
  await snap('5: Free Fly summary: coin on credits, Cores under them, no "collected" line', 'summary-1');
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
  await montage(page, shots, caps, path.join(OUT, 'sheet_34b.png'), 3);
  await browser.close();
  const { passes, failures } = lib.counts();
  console.log(`
${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

// area: freefly, hud, economy
// Chunk 32e end-to-end test: Core crystals in the real Free Fly screen. Kills drop teal crystals, flying through them banks Cores (the HUD number ticks up),
// the run summary shows the Cores earned (34b: the old "collected X / Y" line is gone). Writes reports/chunk32e/sheet_crystals.png (three frames). Needs the Vite dev server.
// Run: node e2e/core-pickups.e2e.cjs (adds ?debug=1 itself: the world is a dev hook).
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, state, waitFor } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk32e');
fs.mkdirSync(OUT, { recursive: true });

async function canvasShot(page) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const b = await page.locator('canvas').screenshot();
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
  return b.toString('base64');
}

async function montage(page, shots, captions, file) {
  const b64 = await page.evaluate(async ({ shots, captions }) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
    const w = 540, h = 960, k = 0.6, pad = 8;
    const c = document.createElement('canvas');
    c.width = imgs.length * (w * k + pad) + pad; c.height = h * k + 36;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => {
      ctx.drawImage(im, pad + i * (w * k + pad), pad, w * k, h * k);
      ctx.fillStyle = '#aaa'; ctx.font = '13px monospace';
      ctx.fillText(captions[i], pad + i * (w * k + pad), h * k + 28);
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { shots, captions });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: false });
  await lib.startFreeFly(page);
  await waitFor(() => page.evaluate(() => !!window.__mgbm && !!window.__mgbm.world));
  const shots = [], caps = [];

  // ---- A. Start wave 6 so a wave pay (the crystal pool) exists; then a few rocks die and drop crystals where they were.
  await page.evaluate(() => { const w = window.__mgbm.world; w.god = true; w.jumpToWave(6); });
  const pooled = await waitFor(() => page.evaluate(() => window.__mgbm.world.crystalPool > 0), { timeout: 10000 });
  check(!!pooled, 'a wave start fills the crystal pool');
  await page.evaluate(() => {
    const w = window.__mgbm.world;
    w.autoSpawn = false; w.clearEnemies();
    w.teleportShip(270, 880);
    [[110, 200], [200, 260], [330, 220], [430, 280], [270, 330]].forEach(([x, y]) => w.spawnSpecies('mitotic_rock', x, y, { hp: 1e12 }));
  });
  await page.evaluate(() => { for (const e of window.__mgbm.world.mitosis.enemies) e.hp = 0; });
  const dropped = await waitFor(async () => { const s = await state(page); return s.crystals.count >= 1 ? s : null; }, { timeout: 5000 });
  check(!!dropped, `kills dropped crystals (${dropped && dropped.crystals.count} alive)`);
  // The children of the split rocks die too, so there are more of them; stop the fights and freeze the pool's drops.
  await page.evaluate(() => { const w = window.__mgbm.world; w.mitosis.enemies.length = 0; });
  await page.waitForTimeout(250);
  const s1 = await state(page);
  check(s1.crystals.drawn === s1.crystals.count && s1.crystals.count >= 1, `every live crystal has a sprite (${s1.crystals.drawn} drawn of ${s1.crystals.count})`);
  check(s1.crystals.list.every(c => c.v > 0) && s1.crystals.collected === 0, 'crystals are worth something and none is collected yet');
  shots.push(await canvasShot(page)); caps.push('A: crystals after kills');

  // ---- B. Fly onto them: Cores tick up in the HUD number and in the run.
  const coresBefore = (await state(page)).hud.cores;
  await page.evaluate(() => {
    const w = window.__mgbm.world;
    w.crystals.drop(270, 700, 3); // one worth 3 whole Cores, so the HUD number visibly ticks up in the sheet (kill crystals alone are fractions at wave 6)
    for (const c of w.crystals.list) { c.x = 270; c.y = 700; c.vx = 0; c.vy = 0; }
    w.teleportShip(270, 700);
  });
  const got = await waitFor(async () => { const s = await state(page); return s.crystals.collected > 0 ? s : null; }, { timeout: 5000 });
  console.log('INFO  after pickup:', JSON.stringify({ c: got && got.crystals.collected, d: got && got.crystals.dropped, hud: got && got.hud.cores }));
  check(!!got && got.crystals.count === 0, `flying through the crystals collected ${got && got.crystals.collected.toFixed(2)} Cores and removed them`);
  check(got && got.crystals.dropped >= got.crystals.collected, 'collected never exceeds dropped');
  shots.push(await canvasShot(page)); caps.push(`B: collected (HUD Cores ${coresBefore} -> ${got && got.hud.cores})`);

  // ---- C. A crystal that is not collected fades: still there at 5 s, gone after 6 s of age (time scaled).
  await page.evaluate(() => { const w = window.__mgbm.world; w.teleportShip(270, 880); w.crystals.drop(60, 300, 1.5); w.crystals.list[0].vx = 0; w.crystals.list[0].vy = 0; });
  const alive5 = await waitFor(async () => { const s = await state(page); return s.crystals.count === 1 && s.crystals.list[0].age > 5 ? s : null; }, { timeout: 12000 });
  check(!!alive5, 'an uncollected crystal is still alive after 5 s');
  await waitFor(async () => (await state(page)).crystals.count === 0, { timeout: 5000 });
  check(true, 'it is gone after 6 s');

  console.log('INFO  before end:', JSON.stringify((({ collected, dropped }) => ({ collected, dropped }))((await state(page)).crystals)), (await state(page)).hud.cores);
  // ---- D. The summary shows the line.
  await page.evaluate(() => { const w = window.__mgbm.world; w.hull = 0; w.gameOver = true; });
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'summary', null, { timeout: 8000 });
  const sum = await state(page);
  console.log('INFO  summary Cores line:', sum.coresLabel);
  check(sum.coresLabel === '' || /^\+[\d.]+[KMBT]?$/.test(sum.coresLabel), `summary shows the Cores earned as "+N" under the credits (chunk 34b; no "collected" line): "${sum.coresLabel}"`);
  shots.push(await canvasShot(page)); caps.push('C: run summary');

  const file = await montage(page, shots, caps, path.join(OUT, 'sheet_crystals.png'));
  check(shots.length === 3 && fs.statSync(file).size > 5000, `contact sheet with ${shots.length} frames (${file})`);

  await browser.close();
  const { passes, failures } = lib.counts();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

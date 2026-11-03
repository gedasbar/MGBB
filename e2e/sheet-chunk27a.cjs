// Chunk 27a contact sheet of the two new backgrounds in flight (not part of the suite). Needs the Vite dev server.
// Run: GAME_URL="http://localhost:5173/?debug=1&bg=galaxy_teal" node e2e/sheet-chunk27a.cjs   (the bg of tier 120 is set by the tier, bg=<id> forces one for all)
// Starts tier 120 (galaxy_teal band) and tier 160 (cave_ash band) with the backgrounds ON (the suite runs with bg=off), takes one picture of each and puts them side by side in
// reports/chunk27a/backgrounds.png. The ship waits at the bottom, the wall's lowest rows hang above it.
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
if (!/[?&]bg=/.test(url)) url += '&bg=auto';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { tap } = lib;
const OUT = path.join(__dirname, '..', 'reports', 'chunk27a');
fs.mkdirSync(OUT, { recursive: true });
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const shots = [];
  for (const tier of [120, 160]) {
    const { page, context } = await lib.openGame(browser, { rich: true });
    await lib.openCampaign(page);
    await page.evaluate((tier) => {
      const s = window.__mgbm.progress;
      s.data.clearedTiers = Array.from({ length: 100 }, (_, i) => i + 1);
      s.data.passedTiers = Array.from({ length: tier - 1 }, (_, i) => i + 1);
      s.commit();
    }, tier);
    for (let attempt = 0; attempt < 6; attempt++) {
      await tap(page, 54, 930, { pause: 200 });
      await tap(page, 486, 930, { pause: 200 });
      if (await lib.waitFor(() => page.evaluate(() => window.__mgbm.screen === 'map'), { timeout: 1500 })) break;
    }
    await page.evaluate((tier) => { const m = window.__mgbm; m.scrollTo(0); const r = m.tileScreenRect(tier); m.scrollTo(Math.max(0, r.y - 300)); }, tier);
    for (let attempt = 0; attempt < 5; attempt++) {
      const r = await page.evaluate((tier) => window.__mgbm.tileScreenRect(tier), tier);
      await tap(page, r.x + r.w / 2, r.y + r.h / 2, { pause: 200 });
      if (await lib.waitFor(async () => (await lib.state(page)).selected === tier, { timeout: 1500 })) break;
    }
    await tap(page, 451, 862, { pause: 300 });
    await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'wall', null, { timeout: 8000 });
    await page.evaluate(() => { const g = document.getElementById('dbg-god'); g.checked = true; g.dispatchEvent(new Event('change')); });
    const bottom = await lib.gameToClient(page, 270, 880);
    await page.mouse.move(bottom.x, bottom.y);
    await lib.waitFor(() => page.evaluate(() => !!window.__mgbm.wall && window.__mgbm.wall.shipY > 800), { timeout: 4000 });
    await page.evaluate(() => { const w = window.__mgbm.wall; w.autoFire = false; w.setWallOffset(520); });
    await page.waitForTimeout(500); // lets the background draw its first frames before the picture
    await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
    shots.push((await page.locator('canvas').screenshot()).toString('base64'));
    await context.close();
  }
  const { page } = await lib.openGame(browser, { rich: true });
  const b64 = await page.evaluate(async (shots) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
    const pad = 8, cap = 22, w = 540, h = 960;
    const c = document.createElement('canvas');
    c.width = imgs.length * (w + pad) + pad; c.height = h + cap + 2 * pad;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => { ctx.drawImage(im, pad + i * (w + pad), pad, w, h); ctx.fillStyle = '#aaa'; ctx.font = '14px monospace'; ctx.fillText(['tier 120 (galaxy_teal)', 'tier 160 (cave_ash)'][i], pad + i * (w + pad), h + pad + 16); });
    return c.toDataURL('image/png').split(',')[1];
  }, shots);
  fs.writeFileSync(path.join(OUT, 'backgrounds.png'), Buffer.from(b64, 'base64'));
  await browser.close();
  console.log('wrote reports/chunk27a/backgrounds.png');
})().catch((e) => { console.error(e); process.exit(1); });

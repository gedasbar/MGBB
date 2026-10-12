// Chunk 11b: the ship stays fully on screen and the edge push reaches its maximum at the clamp edge.
// Pointer goes far outside the canvas (blank side areas) during a wall. Needs the Vite dev server. Run: node e2e/edge11b.e2e.cjs
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, state, gameToClient } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk11b');
fs.mkdirSync(OUT, { recursive: true });
const M = 13, W = 540, MAX = 420;
const move = async (page, gx, gy) => { const p = await gameToClient(page, gx, gy); await page.mouse.move(p.x, p.y); };

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 1400, height: 960 }, rich: false });
  await move(page, 270, 800);
  await page.evaluate(() => document.getElementById('dbg-wall-start').click());
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'wall', null, { timeout: 5000 });
  await move(page, 270, 760);
  await page.waitForTimeout(400);
  await page.evaluate(() => { const w = window.__mgbm.wall; w.invuln = 1e9; w.level.approachSpeed = 0; });

  for (const side of ['left', 'right']) {
    const far = side === 'left' ? -400 : W + 400;   // 400 game px beyond the canvas edge, in the blank area
    await move(page, far, 700);
    await page.waitForTimeout(1500);
    const s = await state(page);
    const want = side === 'left' ? M : W - M;
    check(Math.abs(s.shipScreenX - want) < 0.01, `${side}: ship screen x ${s.shipScreenX.toFixed(2)} == ${want}`);
    check(Math.abs(s.cameraSpeed) > MAX - 0.5 && Math.abs(s.cameraSpeed) <= MAX + 1e-6 && Math.sign(s.cameraSpeed) === (side === 'left' ? -1 : 1),
      `${side}: camera speed ${s.cameraSpeed.toFixed(2)} is the max (${MAX})`);
    await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
    await page.locator('canvas').screenshot({ path: path.join(OUT, `edge_${side}.png`) });
    await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
  }
  await browser.close();
  const c = lib.counts();
  console.log(`${c.passes} passed, ${c.failures} failed`);
  process.exit(c.failures ? 1 : 0);
})();

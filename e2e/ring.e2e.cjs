// Chunk 8a end-to-end test: ring walls (the camera goes round, the ship never jumps at the seam) and Free Fly (still one
// fixed screen). Needs the Vite dev server. Run: node e2e/ring.e2e.cjs   (adds ?debug=1 itself)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
if (!/[?&]bg=/.test(url)) url += '&bg=galaxy';   // a real background in the screenshots
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, state, gameToClient } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk8a');
fs.mkdirSync(OUT, { recursive: true });
const move = async (page, gx, gy) => { const p = await gameToClient(page, gx, gy); await page.mouse.move(p.x, p.y); };
async function snap(page, name) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  await page.locator('canvas').screenshot({ path: path.join(OUT, name) });
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });

  // ---- the wall (a test wall, tier 1: a ring of 21 columns)
  const { page } = await lib.openGame(browser, { viewport: { width: 900, height: 960 }, rich: false });
  await move(page, 270, 800);
  await page.evaluate(() => document.getElementById('dbg-wall-start').click());
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'wall', null, { timeout: 5000 });
  await move(page, 270, 760);
  await page.waitForTimeout(500);
  let s = await state(page);
  const ringW = s.worldW;
  check(s.ring === true && ringW === 21 * 54, `wall is a ring ${ringW} px around`);
  await page.evaluate(() => {
    const w = window.__mgbm.wall;
    w.invuln = 1e9;                 // the wall must not end the run
    w.level.approachSpeed = 0;      // keep it from scrolling away; the ring is about sideways travel
    window.__frames = [];
    const tick = () => {
      const st = window.__mgbm.state();
      window.__frames.push({ sx: st.shipScreenX, wx: st.shipWorldX, travel: st.camTravel, cam: st.cameraX });
      window.__raf = requestAnimationFrame(tick);
    };
    window.__raf = requestAnimationFrame(tick);
  });
  await move(page, 538, 760);       // the pointer rests at the right edge: the camera keeps going
  let shot = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    await page.waitForTimeout(200);
    s = await state(page);
    if (!shot && s.camTravel > ringW * 0.45) {  // first poll past 45% of the ring: a narrow 45-55% window was missed when frames were slow
      await snap(page, 'wall_ring.png'); shot = true; }
    if (s.camTravel > ringW * 1.3) break;
  }
  const fr = await page.evaluate(() => { cancelAnimationFrame(window.__raf); window.__mgbm.setTimeScale(1); return window.__frames; });
  s = await state(page);
  check(s.camTravel > ringW, `camera travelled ${s.camTravel.toFixed(0)} px = ${(s.camTravel / ringW).toFixed(2)} ring widths (needs more than ${ringW})`);
  check(s.cameraX >= 0 && s.cameraX < ringW, `camera x wrapped into [0, ${ringW}) (${s.cameraX.toFixed(1)})`);
  const first = fr.findIndex(f => Math.abs(f.sx - 527) < 1.5);   // after the ship has eased onto the pointer
  const steady = fr.slice(Math.max(0, first));
  let maxJump = 0, wraps = 0;
  for (let i = 1; i < steady.length; i++) {
    maxJump = Math.max(maxJump, Math.abs(steady[i].sx - steady[i - 1].sx));
    if (Math.abs(steady[i].wx - steady[i - 1].wx) > ringW / 2) wraps++;
  }
  check(steady.length > 30, `${steady.length} frames sampled`);
  check(wraps >= 1, `the ship's world x wrapped ${wraps} time(s) at the seam`);
  check(maxJump < 4, `ship screen x never jumped (largest frame-to-frame change ${maxJump.toFixed(2)} px) and never left the pointer (${steady[steady.length - 1].sx.toFixed(1)})`);
  check(shot, 'a ring screenshot was taken mid-trip');
  // A second frame with the seam in view: bring the wall down onto the screen, run on until the seam is just right of the centre, then centre the pointer (the camera drifts on and the seam ends mid-screen).
  await page.evaluate(() => window.__mgbm.wall.setWallOffset(560));
  const t2 = Date.now();
  while (Date.now() - t2 < 30000) {
    const st = await state(page);
    const d = ((0 - (st.cameraX + 270)) % ringW + ringW * 1.5) % ringW - ringW / 2;   // seam relative to the view centre
    if (d > 80 && d < 220) break;   // the seam is still right of the centre: the camera drifts about 250 px while the ship eases back to the pointer (a +-25 px window was missed)
    await page.waitForTimeout(40);
  }
  await move(page, 270, 760);
  await page.waitForTimeout(500);
  const seam = await page.evaluate(() => { const c = window.__mgbm.camera, W = window.__mgbm.state().worldW; const d = (0 - (c.x + 270)); return { x: 270 + d - W * Math.round(d / W), line: window.__mgbm.buildScreen ? null : null }; });
  check(seam.x > 20 && seam.x < 520, `the seam is on screen at x ${seam.x.toFixed(0)} in wall_ring_seam.png`);
  await snap(page, 'wall_ring_seam.png');

  // ---- Free Fly is still one fixed screen: no camera, enemies inside the width
  await page.close();
  const { page: p2 } = await lib.openGame(browser, { viewport: { width: 900, height: 960 }, rich: false });
  await p2.evaluate(() => window.__mgbm.buildScreen.fly());
  await p2.waitForFunction(() => window.__mgbm && window.__mgbm.world && window.__mgbm.state().viewW, null, { timeout: 5000 });
  await move(p2, 100, 700);
  await p2.evaluate(() => { window.__mgbm.setTimeScale(4); window.__keep = setInterval(() => { const w = window.__mgbm.world; w.hull = 100; w.invuln = 1e9; }, 30); });
  let minX = 1e9, maxX = -1e9, shot2 = false;
  const t1 = Date.now();
  let fs2 = await state(p2);
  while (fs2.time < 40 && Date.now() - t1 < 60000) {
    await p2.waitForTimeout(250);
    fs2 = await state(p2);
    for (const e of fs2.enemies) { minX = Math.min(minX, e.x); maxX = Math.max(maxX, e.x); }
    if (!shot2 && fs2.time > 25 && fs2.enemies.some(e => e.hp < 100)) { await snap(p2, 'freefly_rocks.png'); shot2 = true; }
  }
  await p2.evaluate(() => { clearInterval(window.__keep); window.__mgbm.setTimeScale(1); });
  check(fs2.viewW === 540 && !('camX' in fs2) && !('worldW' in fs2), 'Free Fly state has a fixed 540 px view and no camera');
  check(minX >= 0 && maxX <= 540, `enemies stayed inside the screen: x in [${minX.toFixed(1)}, ${maxX.toFixed(1)}]`);
  check(shot2, 'a Free Fly screenshot with damaged rocks was taken');

  await browser.close();
  const c = lib.counts();
  process.stdout.write(`\n${c.passes} passed, ${c.failures} failed\n`);
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

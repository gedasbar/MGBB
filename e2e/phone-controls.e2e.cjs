// Chunk 24a: phone controls on a 360 x 740 touch screen, with real touch events through the browser's input pipeline.
// The ship moves by the finger's movement (never jumps to it), keeps the wall scrolling at a side after the finger lifts, ignores a press on the
// pause button, the pause button is there from the start, and "Direct" in Settings brings the old behaviour back (with the speed cap).
// Needs the Vite dev server. Run: node e2e/phone-controls.e2e.cjs
const path = require('path');
let url = process.env.GAME_URL || 'http://localhost:5173/';
for (const [k, v] of [['debug', 1], ['stats', 0], ['bg', 'off']]) if (!new RegExp(`[?&]${k}=`).test(url)) url += (url.includes('?') ? '&' : '?') + `${k}=${v}`;
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, gameToClient } = lib;

const PHONE = { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const wallState = (page) => page.evaluate(() => window.__mgbm.state());

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  page.on('pageerror', (err) => check(false, `page error: ${err.message}`));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__cleared')) {
      localStorage.clear();
      localStorage.setItem('mgbm.progress.v1', JSON.stringify({ version: 12, ownedHulls: ['dart'] }));
      sessionStorage.setItem('__cleared', '1');
    }
  });
  await page.goto(lib.URL);
  await page.waitForFunction(() => !!window.__mgbmSm && !!document.getElementById('dbg-start-tier'), null, { timeout: 10000 });
  const cdp = await context.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) });
  const scale = await page.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return Math.min(r.width / 540, r.height / 960); });
  const at = (gx, gy) => gameToClient(page, gx, gy);

  // The pause menu's settings need the sound engine; hide the debug panel, it covers a phone screen.
  await page.evaluate(() => { document.getElementById('debug-panel').style.display = 'none'; });

  // ---- a tier-5 wall, nothing touched yet
  await page.evaluate(() => { document.getElementById('dbg-tier-n').value = '5'; document.getElementById('dbg-start-tier').click(); });
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'wall', null, { timeout: 8000 });
  await page.waitForTimeout(300);
  let s = await wallState(page);
  const pauseVisible = () => page.evaluate(() => window.__mgbmSm.overlays.pauseBtn.visible);
  check(!s.controlStarted && (await pauseVisible()), 'the pause button is there from the start, before any touch');

  // ---- relative drag: a finger far from the ship moves it by the finger's movement, and does not make it jump
  const x0 = s.shipScreenX, y0 = s.shipY;
  const a = await at(60, 300); // far from the ship (bottom centre)
  await touch('touchStart', [a]);
  await page.waitForTimeout(250);
  s = await wallState(page);
  check(s.controlStarted && Math.abs(s.shipScreenX - x0) < 3 && Math.abs(s.shipY - y0) < 3, `a press far from the ship does not move it (${s.shipScreenX.toFixed(0)}, ${s.shipY.toFixed(0)} vs ${x0.toFixed(0)}, ${y0.toFixed(0)})`);
  const dxGame = 80, dyGame = -120;
  for (let i = 1; i <= 8; i++) await touch('touchMove', [{ x: a.x + (dxGame * scale * i) / 8, y: a.y + (dyGame * scale * i) / 8 }]);
  await page.waitForTimeout(500);
  s = await wallState(page);
  check(Math.abs(s.shipScreenX - (x0 + dxGame)) < 4 && Math.abs(s.shipY - (y0 + dyGame)) < 4, `dragging the finger 80 right and 120 up moves the ship the same (now ${s.shipScreenX.toFixed(0)}, ${s.shipY.toFixed(0)}; expected ${(x0 + dxGame).toFixed(0)}, ${(y0 + dyGame).toFixed(0)})`);
  await touch('touchEnd', []);
  await page.waitForTimeout(300);
  const lifted = await wallState(page);
  check(Math.abs(lifted.shipScreenX - s.shipScreenX) < 2 && Math.abs(lifted.shipY - s.shipY) < 2, 'lifting the finger leaves the ship where it is');

  // ---- speed cap: the ship takes time to fly a long way (never a jump)
  const b = await at(270, 400);
  await touch('touchStart', [b]);
  const t0 = Date.now();
  await touch('touchMove', [{ x: b.x - 150 * scale, y: b.y }]); // 150 game px at once
  const near = await wallState(page);
  check(Math.abs(near.shipScreenX - lifted.shipScreenX) < 150, `after one 150 px finger jump the ship has not arrived yet (moved ${Math.abs(near.shipScreenX - lifted.shipScreenX).toFixed(0)} px after ${Date.now() - t0} ms)`);
  await page.waitForTimeout(400);
  const arrived = await wallState(page);
  check(Math.abs(arrived.shipScreenX - (lifted.shipScreenX - 150)) < 4, `and it arrives a moment later (${arrived.shipScreenX.toFixed(0)} vs ${(lifted.shipScreenX - 150).toFixed(0)})`);
  await touch('touchEnd', []);

  // ---- edge push follows the ship: drag to the left side, lift, the wall keeps scrolling and the ship does not slide back
  await page.evaluate(() => { const w = window.__mgbm.wall; w.setWallOffset(-3000); }); // keep the wall clear while we sit at the side
  const c = await at(300, 500);
  await touch('touchStart', [c]);
  for (let i = 1; i <= 10; i++) await touch('touchMove', [{ x: c.x - 40 * scale * i, y: c.y }]);
  await page.waitForTimeout(700);
  const held = await wallState(page);
  check(held.cameraSpeed < -300, `the finger drags the ship to the left side and the camera scrolls (speed ${held.cameraSpeed.toFixed(0)} px/s)`);
  await touch('touchEnd', []);
  await page.waitForTimeout(150);
  const afterLift1 = await wallState(page);
  await page.waitForTimeout(700);
  const afterLift2 = await wallState(page);
  check(afterLift2.cameraSpeed < -300 && afterLift2.camTravel < afterLift1.camTravel - 150, `the finger is up and the wall keeps scrolling sideways (speed ${afterLift2.cameraSpeed.toFixed(0)} px/s)`);
  check(Math.abs(afterLift2.shipScreenX - afterLift1.shipScreenX) < 2, `the ship stays against the side, it does not bounce back (x ${afterLift1.shipScreenX.toFixed(1)} then ${afterLift2.shipScreenX.toFixed(1)})`);
  // The ship moves off the side again with a drag to the right; the scrolling stops.
  const d = await at(100, 500);
  await touch('touchStart', [d]);
  for (let i = 1; i <= 8; i++) await touch('touchMove', [{ x: d.x + 30 * scale * i, y: d.y }]);
  await touch('touchEnd', []);
  await page.waitForTimeout(900);
  const off = await wallState(page);
  check(Math.abs(off.cameraSpeed) < 5 && off.shipScreenX > 150, `dragged away from the side, the wall stops scrolling (speed ${off.cameraSpeed.toFixed(1)}, ship x ${off.shipScreenX.toFixed(0)})`);

  // ---- a tap on the pause button never moves the ship and pauses the game
  const before = await wallState(page);
  const pb = await at(540 - 46 + 19, 8 + 19);
  await touch('touchStart', [pb]);
  await touch('touchMove', [{ x: pb.x - 5, y: pb.y + 3 }]);
  await touch('touchEnd', []);
  await page.waitForTimeout(300);
  const paused = await page.evaluate(() => window.__mgbmSm.paused);
  const afterTap = await wallState(page);
  check(paused, 'tapping the pause button pauses the run');
  check(Math.abs(afterTap.shipScreenX - before.shipScreenX) < 1.5 && Math.abs(afterTap.shipY - before.shipY) < 1.5, `and the ship stayed (${before.shipScreenX.toFixed(0)}, ${before.shipY.toFixed(0)} -> ${afterTap.shipScreenX.toFixed(0)}, ${afterTap.shipY.toFixed(0)})`);
  // Resume through the menu button: the tap is the button's, the ship does not go there.
  const rb = await page.evaluate(() => window.__mgbmSm.overlays.buttonCenter('pauseResume'));
  const rp = await at(rb.x, rb.y);
  await touch('touchStart', [rp]);
  await touch('touchEnd', []);
  await page.waitForTimeout(400);
  const resumed = await wallState(page);
  check(!(await page.evaluate(() => window.__mgbmSm.paused)) && Math.abs(resumed.shipScreenX - before.shipScreenX) < 2 && Math.abs(resumed.shipY - before.shipY) < 2, `Resume works and the ship is still where it was (${resumed.shipScreenX.toFixed(0)}, ${resumed.shipY.toFixed(0)})`);

  // ---- the Settings choice: Direct puts the ship back at the finger (40 px above it), still flying there at the capped speed
  await page.evaluate(() => window.__mgbmSfx.setTouchControl('direct'));
  const e = await at(400, 600);
  await touch('touchStart', [e]);
  await page.waitForTimeout(500);
  const direct = await wallState(page);
  check(Math.abs(direct.shipScreenX - 400) < 4 && Math.abs(direct.shipY - 560) < 4, `Direct: the ship goes to the finger, 40 px above it (${direct.shipScreenX.toFixed(0)}, ${direct.shipY.toFixed(0)})`);
  await touch('touchEnd', []);
  await page.evaluate(() => window.__mgbmSfx.setTouchControl('relative'));

  // ---- Settings shows the setting and the time played
  await page.evaluate(() => window.__mgbmSm.overlays.openSettings(false));
  await page.waitForTimeout(200);
  const hasToggle = await page.evaluate(() => !!window.__mgbmSm.overlays.buttonCenter('touchControl'));
  check(hasToggle, 'Settings has the "Touch control" button');

  await browser.close();
  const { passes, failures } = lib.counts();
  console.log(`${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

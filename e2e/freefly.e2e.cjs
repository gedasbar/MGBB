// Chunk 7a end-to-end test: Free Fly as a cylinder world, enemy leash, spawn safety. Real pointer events, real time.
// Needs the Vite dev server. Run: node e2e/freefly.e2e.cjs   (the script adds ?debug=1 itself: the seam line needs it)
const path = require('path');
const fs = require('fs');
const base = process.env.GAME_URL || 'http://localhost:5173/';
process.env.GAME_URL = base.includes('debug=1') ? base : base + (base.includes('?') ? '&' : '?') + 'debug=1';
const lib = require('./lib.cjs');
const { check, state, gameToClient } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk7a');
fs.mkdirSync(OUT, { recursive: true });
const RUN_SECONDS = 25;

async function snap(page, name) {
  await page.evaluate(() => { document.getElementById('debug-panel').style.display = 'none'; });
  await page.locator('canvas').screenshot({ path: path.join(OUT, name) });
  await page.evaluate(() => { document.getElementById('debug-panel').style.display = 'flex'; });
  return path.join(OUT, name);
}
const move = async (page, gx, gy) => { const p = await gameToClient(page, gx, gy); await page.mouse.move(p.x, p.y); };

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 900, height: 960 }, rich: false });

  // ---- Start Free Fly with the real pointer parked at the top edge of the canvas (the worst case for the old behaviour:
  // the ship used to jump to the pointer at once). A tap on the FLY button always moves the pointer, so the run is started
  // through the Build screen's own fly() with the mouse already resting at the top.
  await move(page, 270, 6);
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__mgbm.buildScreen.fly());
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.world && window.__mgbm.state().worldW, null, { timeout: 5000 });
  let s = await state(page);
  check(s.worldW === 1620, `Free Fly world is 3 viewports wide (${s.worldW})`);

  // ---- E4: a parked pointer (top edge) moves nothing until the first move
  await page.waitForTimeout(1500);
  s = await state(page);
  check(!s.controlStarted && Math.abs(s.shipY - 768) < 0.5 && s.camX === 0, `pointer parked at the top edge for 1.5 s: ship stays at y ${s.shipY.toFixed(1)}, camera ${s.camX}, control ${s.controlStarted}`);
  check(s.hull === 100, `no damage while parked (hull ${s.hull})`);
  await move(page, 270, 700);
  await page.waitForTimeout(150);
  s = await state(page);
  check(s.controlStarted && s.invuln > 0.5 && s.invuln <= 1, `first move starts control with the grace running (invuln ${s.invuln.toFixed(2)} s)`);
  await page.waitForTimeout(700);
  s = await state(page);
  check(Math.abs(s.shipY - 700) < 1 && Math.abs(s.shipScreenX - 270) < 1, `ship has eased onto the pointer (${s.shipScreenX.toFixed(1)}, ${s.shipY.toFixed(1)})`);
  await page.waitForTimeout(500);
  s = await state(page);
  check(s.invuln === 0 || s.invuln < 0, `grace is over about 1 s after the first move (invuln ${s.invuln.toFixed(2)})`);

  // ---- E5: hold the pointer at the right edge for 25 s of sim time; watch the leash from outside the sim
  await page.evaluate(() => {
    const W = window.__mgbm.state().worldW;
    const dx = (a, b) => { const d = a - b; return d - W * Math.round(d / W); };
    window.__watch = { since: {}, longest: 0, worstDist: 0, samples: 0 };
    window.__watchTimer = setInterval(() => {
      const w = window.__mgbm.world, wt = window.__watch;
      const seen = new Set();
      for (const e of w.mitosis.enemies) {
        seen.add(e.id);
        const d = Math.hypot(dx(e.x, w.shipX), e.y - w.shipY);
        wt.worstDist = Math.max(wt.worstDist, d);
        if (d > 1.5 * 540) { if (wt.since[e.id] === undefined) wt.since[e.id] = w.time; wt.longest = Math.max(wt.longest, w.time - wt.since[e.id]); }
        else delete wt.since[e.id];
      }
      for (const id of Object.keys(wt.since)) if (!seen.has(+id)) delete wt.since[id];
      wt.samples++;
    }, 50);
  });
  const t0 = (await state(page)).time;
  const kills0 = (await state(page)).kills;
  const travel0 = (await state(page)).camTravel;
  await move(page, 539, 700);
  let normalShot = false;
  let last = t0;
  const deadline = Date.now() + 90000;
  while (last - t0 < RUN_SECONDS && Date.now() < deadline) {
    await page.waitForTimeout(250);
    s = await state(page);
    last = s.time;
    if (!s.enemies) { check(false, 'the run ended early (summary screen)'); break; }
    if (!normalShot && last - t0 > 10 && s.enemies.length > 0) { await snap(page, 'freefly_normal.png'); normalShot = true; }
  }
  s = await state(page);
  const watch = await page.evaluate(() => window.__watch);
  const travel = s.camTravel - travel0;
  check(travel > s.worldW, `camera travelled ${travel.toFixed(0)} px = ${(travel / s.worldW).toFixed(1)} world widths (wrapped at least once)`);
  check(s.camX >= 0 && s.camX < s.worldW, `camera x stays inside the world (${s.camX.toFixed(1)})`);
  check(s.kills > kills0, `kills rose from ${kills0} to ${s.kills} while the camera ran`);
  check(watch.samples > 100 && watch.longest <= 10.4, `no enemy stayed beyond 1.5 widths for more than 10 s (longest ${watch.longest.toFixed(2)} s, farthest ${watch.worstDist.toFixed(0)} px, ${watch.samples} samples, ${s.respawns} sent back to the ring)`);
  check(s.hull > 0 && s.enemies.length > 0, `run still going: hull ${s.hull}, ${s.enemies.length} enemies, ${s.time.toFixed(1)} s of sim`);
  await page.evaluate(() => clearInterval(window.__watchTimer));

  // ---- Seam screenshot. Staged: rocks are placed on both sides of the seam through the debug hook and the camera is put
  // so the seam is mid-screen with the ship (pointer at screen x 270) exactly on it.
  await move(page, 270, 700);
  await page.evaluate(() => {
    const w = window.__mgbm.world, W = window.__mgbm.state().worldW;
    const wrap = (x) => ((x % W) + W) % W;
    w.camera.x = wrap(-270); w.camera.speed = 0;
    w.mitosis.enemies.length = 0;
    for (const [x, y] of [[W - 170, 230], [W - 80, 400], [W - 30, 560], [60, 300], [150, 470], [210, 190]]) w.spawnRock(x, y, 250);
  });
  await page.waitForTimeout(250);
  s = await state(page);
  const sideOf = await page.evaluate(() => {
    const w = window.__mgbm.world;
    const seamSx = w.screenX(0);
    const on = w.mitosis.enemies.map(e => w.screenX(e.x)).filter(x => x > 0 && x < 540);
    return { seamSx, leftOfSeam: on.filter(x => x < seamSx).length, rightOfSeam: on.filter(x => x > seamSx).length, ship: w.screenX(w.shipX), shipWorldX: w.shipX };
  });
  check(Math.abs(sideOf.seamSx - 270) < 3 && sideOf.leftOfSeam >= 2 && sideOf.rightOfSeam >= 2, `seam at screen x ${sideOf.seamSx.toFixed(1)}, rocks on screen: ${sideOf.leftOfSeam} left of it, ${sideOf.rightOfSeam} right of it`);
  check(sideOf.shipWorldX < 6 || sideOf.shipWorldX > 1620 - 6, `ship is on the seam (world x ${sideOf.shipWorldX.toFixed(1)})`);
  const file = await snap(page, 'freefly_seam.png');
  // The debug seam line is a 2 px rose line at the seam column; read a pixel of it from the screenshot (sky-high, away from sprites).
  const px = await lib.pixelsAtClient(page, [await gameToClient(page, sideOf.seamSx, 90), await gameToClient(page, sideOf.seamSx + 40, 90)]);
  check(px[0][0] > 70 && px[0][0] > px[0][1] * 2 && px[1][0] < 40, `seam line pixel is rose (${px[0]}) and the pixel 40 px beside it is not (${px[1]})`);
  check(fs.existsSync(file), `screenshots written to ${OUT}`);

  // ---- Perf probe: many enemies and a full projectile pool, against the same screen with only a few rocks
  const perf = await page.evaluate(async () => {
    const w = window.__mgbm.world, W = window.__mgbm.state().worldW;
    w.hull = 1e9;                       // the probe must not end the run
    const measure = async (ms) => {
      let frames = 0, maxProj = 0, maxEn = 0;
      const t0 = performance.now();
      await new Promise(res => { const f = () => { frames++; maxProj = Math.max(maxProj, w.pool.count); maxEn = Math.max(maxEn, w.mitosis.enemies.length); if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      return { fps: frames / ((performance.now() - t0) / 1000), projectiles: maxProj, enemies: maxEn };
    };
    const idle = await measure(3000);
    for (let i = 0; i < 380; i++) w.spawnRock((i * 97.3) % W, 40 + ((i * 53) % 700), 1e12);
    const feed = setInterval(() => { for (let k = 0; k < 200; k++) w.pool.spawn(Math.random() * W, 900, 0, -300, 1, 0, 0); }, 16);
    await new Promise(r => setTimeout(r, 1500));      // fill up
    const load = await measure(4000);
    clearInterval(feed);
    // Pure sim cost of a step with the load in place (projectiles from the last fill are still alive).
    for (let k = 0; k < 4000; k++) w.pool.spawn(Math.random() * W, 900, 0, -300, 1, 0, 0);
    const p = { x: 270, y: 700, active: false, type: 'mouse', seen: true };
    const n = w.pool.count, e = w.mitosis.enemies.length;
    const s0 = performance.now();
    for (let i = 0; i < 60; i++) w.update(1 / 60, p);
    return { idle, load, msStep: (performance.now() - s0) / 60, simProjectiles: n, simEnemies: e };
  });
  process.stdout.write(`      idle: ${perf.idle.fps.toFixed(1)} fps (${perf.idle.enemies} enemies, ${perf.idle.projectiles} projectiles); loaded: ${perf.load.fps.toFixed(1)} fps (${perf.load.enemies} enemies, ${perf.load.projectiles} projectiles at peak); sim step ${perf.msStep.toFixed(2)} ms with ${perf.simEnemies} enemies and ${perf.simProjectiles} projectiles\n`);
  // Headless Chromium renders with a software GL, so the loaded frame rate is limited by drawing ~2400 sprites, not by the sim.
  // The gate is the sim step (budget 16.7 ms at 60 fps) and an idle Free Fly at ~60 fps; the loaded fps is reported, not asserted.
  check(perf.msStep < 4 && perf.idle.fps >= 55, `perf probe: sim ${perf.msStep.toFixed(2)} ms/step with ${perf.simEnemies} enemies and ${perf.simProjectiles} projectiles; idle ${perf.idle.fps.toFixed(1)} fps, loaded ${perf.load.fps.toFixed(1)} fps (software GL)`);

  await browser.close();
  const c = lib.counts();
  process.stdout.write(`\n${c.passes} passed, ${c.failures} failed\n`);
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

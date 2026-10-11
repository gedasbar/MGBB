// Wall engine end-to-end test (debug test walls, carve-a-path rules): camera, boost, damage art, crash.
// Needs the Vite dev server. Run: GAME_URL="http://localhost:5173/?debug=1" node e2e/wall.e2e.cjs
const path = require('path');
const URL_DEBUG = process.env.GAME_URL || 'http://localhost:5173/?debug=1';
process.env.GAME_URL = URL_DEBUG.includes('debug=1') ? URL_DEBUG : URL_DEBUG + (URL_DEBUG.includes('?') ? '&' : '?') + 'debug=1';
const lib = require('./lib.cjs'); // reads GAME_URL when loaded
const { check, tap, state, gameToClient } = lib;
const OUT = path.join(__dirname, '..', 'reports', 'chunk6c');
require('fs').mkdirSync(OUT, { recursive: true });

async function snap(page, name) {
  await page.evaluate(() => { document.getElementById('debug-panel').style.display = 'none'; });
  await page.locator('canvas').screenshot({ path: path.join(OUT, name) });
  await page.evaluate(() => { document.getElementById('debug-panel').style.display = 'flex'; });
}
const progress = async (page) => (await page.evaluate(() => JSON.parse(localStorage.getItem('mgbm.progress.v1')))) || { runs: 0, credits: 0 };
const moveTo = async (page, gx, gy) => { const p = await gameToClient(page, gx, gy); await page.mouse.move(p.x, p.y); };

async function startWall(page, { tier = 1, armor = 0, shield = 0, rows = 8 } = {}) {
  await page.fill('#dbg-wall-tier', String(tier));
  await page.fill('#dbg-wall-armor', String(armor));
  await page.fill('#dbg-wall-shield', String(shield));
  await page.fill('#dbg-wall-rows', String(rows));
  // Start without moving the real mouse: the debug panel sits left of the canvas and a pointer there pushes the camera left.
  await moveTo(page, 270, 800);
  await page.evaluate(() => document.getElementById('dbg-wall-start').click());
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'wall', null, { timeout: 5000 });
}
const setScale = async (page, n) => { await page.fill('#dbg-time-scale', String(n)); await page.dispatchEvent('#dbg-time-scale', 'change'); };

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 900, height: 960 }, rich: false });

  // ---- 1. Debug wall: starts above the screen, no hull bar, HUD shows the destroyed share
  await startWall(page, { tier: 1 });
  let s = await state(page);
  check(s.state === 'playing' && s.total === 162 && s.alive === 162, `test wall has 21 x 8 - 6 gaps = 162 blocks (${s.total})`);
  check(s.wallOffsetY < 10 && Math.abs(s.cameraX - 297) < 1, `wall starts above the screen (bottom edge ${s.wallOffsetY.toFixed(1)}), camera centred (${s.cameraX.toFixed(1)})`);
  check(/Tier 1/.test(s.hud.tier) && /Destroyed 0%/.test(s.hud.blocks), `HUD shows "${s.hud.tier}" and "${s.hud.blocks}"`);
  check(s.hull === undefined && s.touching === undefined, 'no hull and no stop line in the state any more');
  check(s.finishY < 0 && s.progress < 0.01, `pass line is far above the screen (y ${s.finishY.toFixed(0)}), progress ${s.progress}`);

  // ---- 2. Speed boost: the wall scrolls faster with the ship near the top of the screen
  await moveTo(page, 270, 800);
  await page.waitForTimeout(150);
  const low = await state(page);
  check(Math.abs(low.scrollSpeed - 26) < 0.01, `ship low on the screen: wall speed ${low.scrollSpeed.toFixed(1)} px/s (base 26)`);
  await page.evaluate(() => window.__mgbm.wall.setWallOffset(-400)); // keep the wall clear of the ship while it sits at the top
  await moveTo(page, 270, 4);
  await page.waitForTimeout(450); // the ship eases to the pointer over 0.25 s after the first move
  const top1 = await state(page);
  await page.waitForTimeout(500);
  const top2 = await state(page);
  check(top1.scrollSpeed > 90, `ship at the top edge: wall speed ${top1.scrollSpeed.toFixed(1)} px/s (about 4x)`);
  const measured = (top2.wallOffsetY - top1.wallOffsetY) / (top2.time - top1.time);
  check(measured > 85, `measured wall speed with the ship at the top: ${measured.toFixed(0)} px/s`);
  await moveTo(page, 270, 800);

  // ---- 3. Edge push: pointer to the right edge pans the camera; the ship follows the pointer in screen space
  await page.waitForTimeout(300);
  const mid = await state(page);
  check(Math.abs(mid.shipScreenX - 270) < 2 && Math.abs(mid.cameraSpeed) < 1, `ship follows the pointer (screen x ${mid.shipScreenX.toFixed(1)}), camera still`);
  await moveTo(page, 535, 800);
  await page.waitForTimeout(2600);
  const right = await state(page);
  check(Math.abs(right.cameraX - 594) < 0.5 && Math.abs(right.shipScreenX - 535) < 2, `camera clamps at the right end (x ${right.cameraX.toFixed(1)}), ship screen x ${right.shipScreenX.toFixed(1)}`);
  await moveTo(page, 5, 800);
  await page.waitForTimeout(3200);
  const left = await state(page);
  check(Math.abs(left.cameraX) < 0.5, `camera clamps at the left end (x ${left.cameraX.toFixed(1)}), ship world x ${left.shipWorldX.toFixed(1)}`);
  await moveTo(page, 270, 800);

  // ---- 4. Armored + shielded wall being hit: blocks lose HP and the green squares shrink
  await page.evaluate(() => { window.__mgbm.wall.state = 'crashed'; }); // leave the first wall quietly
  await page.waitForFunction(() => window.__mgbm.screen === 'summary', null, { timeout: 5000 });
  await tap(page, 145, 672); // Build
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.buildScreen, null, { timeout: 5000 });
  await startWall(page, { tier: 1, armor: 0.5, shield: 0.4 });
  await setScale(page, 4);
  await page.waitForTimeout(2600);
  await setScale(page, 2);
  let shot = false;
  for (let i = 0; i < 60; i++) {
    await moveTo(page, 60 + ((i * 37) % 420), 800);
    await page.waitForTimeout(40);
    s = await state(page);
    if (!shot && s.destroyed >= 3) { await snap(page, 'wall_armor_shield_hits.png'); shot = true; }
  }
  await setScale(page, 1);
  const sizes = await page.evaluate(() => {
    const w = window.__mgbm.wall;
    return window.__mgbm.sampleBlocks().map(d => {
      const b = w.blocks[d.row * 21 + d.col];
      return { inner: d.inner, full: b.armor > 0 ? 36 : 42, hpFrac: b.hp / b.maxHp };
    });
  });
  const hurt = sizes.filter(d => d.hpFrac < 1);
  check(hurt.length > 0 && hurt.every(d => d.inner < d.full), `green squares of damaged blocks are smaller (${hurt.length} damaged drawn)`);
  check(sizes.filter(d => d.hpFrac === 1).every(d => d.inner === d.full), 'undamaged blocks draw the full green square');

  // ---- 5. Crash: touching a live block ends the run at once
  await page.evaluate(() => window.__mgbm.wall.setWallOffset(560));
  await page.waitForTimeout(100);
  const before = await progress(page);
  const target = await page.evaluate(() => {
    const w = window.__mgbm.wall;
    const cam = window.__mgbm.camera.x;
    const b = w.all.find(x => w.blocks[x.id] === x && x.x - cam > 80 && x.x - cam < 460 && x.y > 100 && x.y < 540);
    return { x: b.x - cam, y: b.y };
  });
  await moveTo(page, target.x, target.y);
  await page.waitForFunction(() => window.__mgbm.screen === 'summary', null, { timeout: 5000 });
  s = await state(page);
  check(s.title === 'Crashed' && s.wall.result === 'crashed', `touching a block: summary "${s.title}"`);
  check(s.rows.some(r => r.label === 'Result' && r.value === 'Not passed'), `rows: ${s.rows.map(r => r.label + ' ' + r.value).join(' | ')}`);
  const after = await progress(page);
  check(after.runs === (before.runs || 0) + 1, `crashed run banked once (runs ${before.runs} -> ${after.runs})`);
  check(!(after.passedTiers || []).length && !(after.clearedTiers || []).length, 'a debug wall never touches the campaign progress');

  // ---- 6. Retry starts a fresh wall; clearing it with the helper shows "Tier cleared"
  await tap(page, 395, 672); // Retry
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'wall', null, { timeout: 5000 });
  s = await state(page);
  check(s.alive === s.total && s.time < 3, 'Retry starts the same wall again');
  await page.evaluate(() => window.__mgbm.wall.destroyAll());
  await page.waitForFunction(() => window.__mgbm.screen === 'summary', null, { timeout: 8000 });
  s = await state(page);
  check(s.title === 'Tier cleared' && /^100% /.test(s.rows[0].value), `clearing shows "${s.title}", ${s.rows[0].label} ${s.rows[0].value}`);

  // ---- 7. Free Fly still works
  await tap(page, 145, 672);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.buildScreen, null, { timeout: 5000 });
  await tap(page, 478, 789, { pause: 400 });
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.world, null, { timeout: 5000 });
  await page.waitForTimeout(1500);
  s = await state(page);
  check(s.tier === 1 && s.recipes >= 1 && typeof s.hull === 'number', `FLY button still starts Free Fly (hull ${s.hull})`);

  const c = lib.counts();
  console.log(`\n${c.passes} passed, ${c.failures} failed`);
  await browser.close();
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

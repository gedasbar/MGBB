// Chunk 6a end-to-end test: the campaign wall engine with real pointer events.
// Needs the Vite dev server. Run: GAME_URL="http://localhost:5173/?debug=1" node e2e/wall.e2e.cjs
const path = require('path');
const URL_DEBUG = process.env.GAME_URL || 'http://localhost:5173/?debug=1';
process.env.GAME_URL = URL_DEBUG.includes('debug=1') ? URL_DEBUG : URL_DEBUG + (URL_DEBUG.includes('?') ? '&' : '?') + 'debug=1';
const lib = require('./lib.cjs'); // reads GAME_URL when loaded
const { check, tap, state, gameToClient } = lib;
const OUT = path.join(__dirname, '..', 'reports', 'chunk6a');
require('fs').mkdirSync(OUT, { recursive: true });

async function snap(page, name) {
  await page.evaluate(() => { document.getElementById('debug-panel').style.display = 'none'; });
  await page.locator('canvas').screenshot({ path: path.join(OUT, name) });
  await page.evaluate(() => { document.getElementById('debug-panel').style.display = 'flex'; });
}

const progress = async (page) => (await page.evaluate(() => JSON.parse(localStorage.getItem('mgbm.progress.v1')))) || { runs: 0, credits: 0 };
const mgbm = (page, fn) => page.evaluate(fn);
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
  const p0 = await progress(page).catch(() => null);

  // ---- 1. Plain tier-1 wall: starts above the screen and enters from the top
  await startWall(page, { tier: 1 });
  let s = await state(page);
  check(s.state === 'playing' && s.total === 162 && s.alive === 162, `tier-1 wall has 21 x 8 - 6 gaps = 162 blocks (${s.total})`);
  check(s.wallOffsetY < 10, `wall starts fully above the screen (bottom edge at y ${s.wallOffsetY.toFixed(1)})`);
  check(Math.abs(s.cameraX - 297) < 1, `camera starts centred (x ${s.cameraX.toFixed(1)}, expected 297)`);
  check(/Tier 1/.test(s.hud.tier) && /Blocks 0 \/ 162/.test(s.hud.blocks), `HUD shows "${s.hud.tier}" and "${s.hud.blocks}"`);
  await setScale(page, 4);
  await page.waitForTimeout(2500);
  await setScale(page, 1);
  s = await state(page);
  check(s.wallOffsetY > 200 && s.drawn > 0, `wall entered from the top (offset ${s.wallOffsetY.toFixed(0)}, ${s.drawn} blocks drawn)`);
  await snap(page, 'wall_start.png');

  // ---- 2. Edge push: pointer to the right edge pans the camera; the ship follows the pointer in screen space
  await moveTo(page, 270, 800);
  await page.waitForTimeout(300);
  const mid = await state(page);
  check(Math.abs(mid.shipScreenX - 270) < 2, `ship follows the pointer on screen (ship screen x ${mid.shipScreenX.toFixed(1)} for pointer 270)`);
  check(Math.abs(mid.cameraSpeed) < 1, 'no camera movement with the pointer in the middle');
  await moveTo(page, 535, 800);
  await page.waitForTimeout(1400);
  const right = await state(page);
  check(right.cameraX > mid.cameraX + 150, `camera moved right (${mid.cameraX.toFixed(0)} -> ${right.cameraX.toFixed(0)})`);
  check(right.shipWorldX > mid.shipWorldX + 150, `ship world x increased (${mid.shipWorldX.toFixed(0)} -> ${right.shipWorldX.toFixed(0)})`);
  check(Math.abs(right.shipScreenX - 535) < 2, `ship screen x still follows the pointer (${right.shipScreenX.toFixed(1)} for pointer 535)`);
  await page.waitForTimeout(1200);
  const clamp = await state(page);
  check(Math.abs(clamp.cameraX - 594) < 0.5, `camera clamps at the right end (x ${clamp.cameraX.toFixed(1)}, max 594)`);
  await snap(page, 'wall_camera_right.png');
  await moveTo(page, 270, 800);
  await page.waitForTimeout(700);
  const stopA = await state(page);
  await page.waitForTimeout(400);
  const stopB = await state(page);
  check(stopA.cameraX === stopB.cameraX, 'moving the pointer back out of the zone stops the scroll');
  await moveTo(page, 5, 800);
  await page.waitForTimeout(900);
  const left = await state(page);
  check(left.cameraX < stopB.cameraX - 100, `pointer at the left edge scrolls left (${stopB.cameraX.toFixed(0)} -> ${left.cameraX.toFixed(0)})`);

  // ---- 3. Armored + shielded test wall, being hit; blocks shrink
  await tap(page, 270, 8);
  await page.evaluate(() => window.__mgbm.wall.hull = 100);
  await startWall(page, { tier: 1, armor: 0.5, shield: 0.4 });
  await setScale(page, 4);
  await page.waitForTimeout(2600);
  await setScale(page, 2);
  let swept = 0;
  let shot = false;
  for (let i = 0; i < 80; i++) {
    await moveTo(page, 60 + ((i * 37) % 420), 790);
    await page.waitForTimeout(40);
    swept++;
    s = await state(page);
    if (!shot && s.destroyed >= 3) { await snap(page, 'wall_armor_shield_hits.png'); shot = true; }
  }
  await setScale(page, 1);
  const damaged = await page.evaluate(() => {
    const w = window.__mgbm.wall;
    return {
      hurt: w.all.filter(b => w.blocks[b.id] === b && b.hp < b.maxHp).length,
      shieldHurt: w.all.filter(b => w.blocks[b.id] === b && b.maxShield > 0 && b.shield < b.maxShield).length,
      armored: w.all.filter(b => b.armor > 0).length,
      shielded: w.all.filter(b => b.maxShield > 0).length,
      samples: window.__mgbm.sampleBlocks(),
    };
  });
  check(damaged.armored > 40 && damaged.shielded > 40, `test wall has armored (${damaged.armored}) and shielded (${damaged.shielded}) blocks`);
  check(damaged.hurt > 0 || damaged.shieldHurt > 0, `blocks lost HP/shield after hits (${damaged.hurt} hurt, ${damaged.shieldHurt} with shield down)`);
  // Each drawn green square: full size (42 px plain, 36 px armored) when undamaged, smaller when the block has lost HP.
  const sizes = await page.evaluate(() => {
    const w = window.__mgbm.wall;
    return window.__mgbm.sampleBlocks().map(d => {
      const b = w.blocks[d.row * 21 + d.col];
      return { inner: d.inner, full: b.armor > 0 ? 36 : 42, hpFrac: b.hp / b.maxHp };
    });
  });
  const hurtDrawn = sizes.filter(d => d.hpFrac < 1);
  check(hurtDrawn.length > 0 && hurtDrawn.every(d => d.inner < d.full), `green squares of damaged blocks are smaller (${hurtDrawn.length} damaged drawn: ${JSON.stringify(hurtDrawn.slice(0, 3))})`);
  check(sizes.filter(d => d.hpFrac === 1).every(d => d.inner === d.full), 'undamaged blocks draw the full green square');

  // ---- 4. Wall reaches the stop line: the hull drains; fail the tier
  await tap(page, 270, 8);
  await startWall(page, { tier: 1 });
  await moveTo(page, 270, 900); // ship parked well below the line, shots only straight up
  const before = (await progress(page));
  await setScale(page, 10);
  await page.waitForFunction(() => window.__mgbm.state().touching, null, { timeout: 20000 });
  s = await state(page);
  const h0 = s.hull;
  check(s.touching && Math.abs(s.bottomEdge - 748.8) < 0.5, `wall stopped at the stop line (bottom edge ${s.bottomEdge.toFixed(1)}, line 748.8)`);
  await setScale(page, 1);
  const off0 = s.wallOffsetY;
  await page.waitForTimeout(1200);
  s = await state(page);
  check(s.hull < h0 - 5 && s.wallOffsetY === off0, `hull drains while the wall touches the line (${h0.toFixed(1)} -> ${s.hull.toFixed(1)}), wall holds still`);
  const drainPerSec = (h0 - s.hull) / 1.2;
  check(drainPerSec > 9 && drainPerSec < 15, `drain is about 12 per second (measured ${drainPerSec.toFixed(1)})`);
  await snap(page, 'wall_stop_line_draining.png');
  await setScale(page, 10);
  await page.waitForFunction(() => window.__mgbm.screen === 'summary', null, { timeout: 20000 });
  await setScale(page, 1);
  s = await state(page);
  check(s.title === 'Tier failed', `failing shows "${s.title}"`);
  check(s.rows[0].label === 'Blocks destroyed' && /\/ 162/.test(s.rows[0].value), `summary rows: ${s.rows.map(r => r.label + ' ' + r.value).join(' | ')}`);
  await snap(page, 'wall_summary_failed.png');
  const afterFail = await progress(page);
  check(afterFail.runs === (before.runs ?? 0) + 1, `failed level banked exactly once (runs ${before.runs} -> ${afterFail.runs})`);
  check(afterFail.credits === (before.credits ?? 0) + s.result.credits, `credits banked (${before.credits} + ${s.result.credits} = ${afterFail.credits})`);

  // ---- 5. Retry, then clear the whole wall with the debug helper
  await tap(page, 395, 672); // Retry
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'wall', null, { timeout: 5000 });
  s = await state(page);
  check(s.alive === s.total && s.hull === 100 && s.wallOffsetY < 5, 'Retry starts the same tier again with a full hull');
  const before2 = await progress(page);
  await setScale(page, 4);
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__mgbm.wall.destroyAll());
  await page.waitForFunction(() => window.__mgbm.screen === 'summary', null, { timeout: 8000 });
  await setScale(page, 1);
  s = await state(page);
  check(s.title === 'Tier cleared', `clearing shows "${s.title}"`);
  check(/162 \/ 162 \(100%\)/.test(s.rows[0].value), `blocks destroyed row: "${s.rows[0].value}"`);
  await snap(page, 'wall_summary_cleared.png');
  const afterWin = await progress(page);
  check(afterWin.runs === before2.runs + 1 && afterWin.credits === before2.credits + s.result.credits, `cleared level banked once (credits ${before2.credits} -> ${afterWin.credits}, +${s.result.credits})`);
  await page.waitForTimeout(1000);
  check((await progress(page)).runs === afterWin.runs, 'nothing is banked a second time while the summary stays open');

  // ---- 6. Build button goes back; Free Fly (FLY button) still starts an endless run
  await tap(page, 145, 672);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.buildScreen, null, { timeout: 5000 });
  await tap(page, 478, 789, { pause: 400 });
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.world, null, { timeout: 5000 });
  await page.waitForTimeout(2500);
  s = await state(page);
  check(s.tier === 1 && s.recipes >= 1 && typeof s.hull === 'number', `FLY button still starts Free Fly (tier ${s.tier}, hull ${s.hull}, ${s.enemies.length} rocks)`);

  const c = lib.counts();
  console.log(`\n${c.passes} passed, ${c.failures} failed`);
  await browser.close();
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

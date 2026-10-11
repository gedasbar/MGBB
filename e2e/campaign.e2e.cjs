// Campaign end-to-end test (carve-a-path rules): Build -> CAMPAIGN -> Map -> tier 1 passed with a lane carved by real shots
// and real pointer moves -> crash -> cleared with a Medal -> tier 2 passed -> Map showing both pip types.
// Needs the Vite dev server. Run: GAME_URL="http://localhost:5173/?debug=1" node e2e/campaign.e2e.cjs
const path = require('path');
const URL_DEBUG = process.env.GAME_URL || 'http://localhost:5173/?debug=1';
process.env.GAME_URL = URL_DEBUG.includes('debug=1') ? URL_DEBUG : URL_DEBUG + (URL_DEBUG.includes('?') ? '&' : '?') + 'debug=1';
const lib = require('./lib.cjs'); // reads GAME_URL when loaded
const { check, tap, state, gameToClient } = lib;
const OUT = path.join(__dirname, '..', 'reports', 'chunk6c');
require('fs').mkdirSync(OUT, { recursive: true });

async function snap(page, name) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  await page.locator('canvas').screenshot({ path: path.join(OUT, name) });
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
}
async function press(page, gx, gy, pause = 150) {
  const p = await gameToClient(page, gx, gy);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(30);
  await page.mouse.up();
  await page.waitForTimeout(pause);
}
const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const progress = async (page) => (await page.evaluate(() => JSON.parse(localStorage.getItem('mgbm.progress.v1')))) || {};
const rect = (page, tier) => page.evaluate((t) => window.__mgbm.tileScreenRect(t), tier);
const waitScreen = (page, name, ms = 8000) => page.waitForFunction((n) => window.__mgbm && window.__mgbm.screen === n, name, { timeout: ms });
const START = [451, 862];

// Where the pilot wants the ship, computed from the live wall: the cheapest column in view, then just under its lowest block.
const PILOT = () => {
  const w = window.__mgbm.wall;
  const cam = window.__mgbm.camera.x;
  const off = w.spawnOffsets[0].x;
  const cost = (c) => { let s = 0; for (let r = 0; r < w.level.rows; r++) { const b = w.blocks[r * 21 + c]; if (b) s += b.shield + b.hp * (1 + b.armor / 10); } return s; };
  if (window.__lane === undefined || w.wallOffsetY < 150 || window.__laneWall !== w) {
    window.__laneWall = w;
    let best = Infinity;
    for (let c = 0; c < 21; c++) {
      const x = c * 54 + 27 - off - cam;
      if (x < 110 || x > 430) continue; // inside the camera's no-scroll zone
      if (cost(c) < best) { best = cost(c); window.__lane = c; }
    }
  }
  const c = window.__lane;
  let bottom = null;
  for (let r = w.level.rows - 1; r >= 0; r--) if (w.blocks[r * 21 + c]) { bottom = w.blockTop(r) + 54; break; }
  let y = bottom === null ? 5 : bottom + 30;
  // Hold at 300 px until the finish line shows, so it can be seen; then fly up and across it.
  if (w.finishY < 150) y = Math.max(y, 300);
  return { x: c * 54 + 27 - off - cam, y: Math.min(y, 900), finishY: w.finishY, shipY: w.shipY, offset: w.wallOffsetY, alive: w.alive, state: w.state };
};

async function flyLane(page, { shots = false } = {}) {
  const got = { lane: false, finish: false };
  let cur = await page.evaluate(() => ({ x: window.__mgbm.wall.shipX - window.__mgbm.camera.x, y: window.__mgbm.wall.shipY }));
  await page.evaluate(() => { window.__lane = undefined; window.__mgbm.setTimeScale(3); });
  for (let i = 0; i < (process.env.DBG ? 400 : 2000); i++) {
    const t = await page.evaluate(`(${PILOT.toString()})()`).catch(() => null);
    if (!t || (await page.evaluate(() => window.__mgbm.screen)) !== 'wall') break;
    // The pointer glides (at most 25 px per step), like a hand, instead of jumping next to a block.
    const dx = t.x - cur.x; const dy = t.y - cur.y; const d = Math.hypot(dx, dy) || 1; const k = Math.min(1, 25 / d);
    cur = { x: cur.x + dx * k, y: cur.y + dy * k };
    const p = await gameToClient(page, cur.x, cur.y);
    await page.mouse.move(p.x, p.y);
    if (shots && !got.lane && t.shipY < t.offset - 120 && t.shipY > 120 && t.alive > 0 && t.offset > 400) { await snap(page, 'ship_in_lane.png'); got.lane = true; }
    if (shots && !got.finish && t.finishY > 60 && t.finishY < 600 && t.state === 'playing') { await snap(page, 'finish_line.png'); got.finish = true; }
    if (process.env.DBG && i % 40 === 0) console.log('pilot', i, JSON.stringify(t), JSON.stringify(cur));
    await page.waitForTimeout(25);
  }
  await page.evaluate(() => window.__mgbm.setTimeScale && window.__mgbm.setTimeScale(1)).catch(() => {});
  return got;
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 900, height: 960 } });
  const mv = async (gx, gy) => { const p = await gameToClient(page, gx, gy); await page.mouse.move(p.x, p.y); };

  // ---- Build screen: CAMPAIGN opens the map
  await tap(page, 468, 735, { pause: 300 });
  await waitScreen(page, 'map');
  let s = await state(page);
  check(s.tiles.length === 100 && s.tiles[0].state === 'open' && s.tiles[0].next, `map shows ${s.tiles.length} tiles, tier 1 open and next`);
  check(s.tiles.slice(1).every(t => t.state === 'locked'), 'every other tier is locked on a fresh save');
  check(s.medals === 0 && /Not passed/.test(s.sheet.best), `fresh inspector: "${s.sheet.title}", ${s.sheet.best}`);
  await snap(page, 'map_fresh.png');

  // ---- Tier 1: carve a lane with real shots, fly up it, cross the finish line
  await press(page, ...START, 300);
  await waitScreen(page, 'wall');
  s = await state(page);
  check(s.hud.name === 'Slab' && /Destroyed 0%/.test(s.hud.blocks) && s.hud.spike === false, `campaign HUD: ${s.hud.tier} / ${s.hud.name} / ${s.hud.blocks}`);
  const shots = await flyLane(page, { shots: true });
  await waitScreen(page, 'summary', 15000);
  s = await state(page);
  check(s.title === 'Tier passed' && s.wall.result === 'passed' && s.wall.medal === false, `summary "${s.title}", medal ${s.wall.medal}`);
  check(JSON.stringify(s.wall.buttons.map(b => b.label)) === JSON.stringify(['Next tier', 'Map', 'Build']), `buttons: ${s.wall.buttons.map(b => b.label)}`);
  check(s.rows.some(r => r.label === 'Result' && r.value === 'Passed') && s.wall.destroyed > 0 && s.wall.destroyed < s.wall.total, `rows: ${s.rows.map(r => r.label + ' ' + r.value).join(' | ')}`);
  check(shots.lane && shots.finish, `screenshots taken in the lane: ${shots.lane}, with the finish line: ${shots.finish}`);
  await snap(page, 'summary_passed.png');
  let p = await progress(page);
  check(JSON.stringify(p.passedTiers) === '[1]' && p.medals === 0 && (p.clearedTiers || []).length === 0, `progress: passed ${JSON.stringify(p.passedTiers)}, medals ${p.medals}`);
  check(p.credits > 0, `credits paid for the blocks destroyed (${p.credits})`);

  // ---- Map: tier 1 passed (hollow pip), tier 2 open
  await tap(page, 270, 672);
  await waitScreen(page, 'map');
  s = await state(page);
  check(s.tiles[0].state === 'passed' && s.tiles[1].state === 'open' && s.tiles[2].state === 'locked', `map: tier 1 ${s.tiles[0].state}, tier 2 ${s.tiles[1].state}, tier 3 ${s.tiles[2].state}`);
  await tap(page, ...centre(await rect(page, 1)));
  s = await state(page);
  check(/^Best destroyed \d+%  ·  Passed \d+:\d\d$/.test(s.sheet.best), `inspector of tier 1: "${s.sheet.best}"`);

  // ---- Crash: touching a live block ends the run at once; credits for the blocks destroyed so far
  await press(page, ...START, 300);
  await waitScreen(page, 'wall');
  await page.evaluate(() => window.__mgbm.wall.setWallOffset(560));
  await page.waitForTimeout(100);
  const c0 = (await progress(page)).credits;
  const target = await page.evaluate(() => {
    const w = window.__mgbm.wall;
    const cam = window.__mgbm.camera.x;
    const b = w.all.find(x => w.blocks[x.id] === x && x.x - cam > 80 && x.x - cam < 460 && x.y > 300 && x.y < 540);
    return { x: b.x - cam, y: b.y };
  });
  await mv(target.x, target.y);
  // The first move starts the 1 s spawn grace (unit-tested in tests/spawnSafety.test.ts); skip it here so the crash is immediate.
  await page.waitForTimeout(60);
  await page.evaluate(() => { window.__mgbm.wall.invuln = 0; });
  await waitScreen(page, 'summary', 5000);
  s = await state(page);
  check(s.title === 'Crashed' && JSON.stringify(s.wall.buttons.map(b => b.label)) === JSON.stringify(['Retry', 'Map', 'Build']), `touching a block: "${s.title}", buttons ${s.wall.buttons.map(b => b.label)}`);
  p = await progress(page);
  check(JSON.stringify(p.passedTiers) === '[1]' && p.medals === 0, 'a crash changes no unlock and gives no medal');
  check(p.credits >= c0, `credits after the crash ${c0} -> ${p.credits}`);
  await snap(page, 'summary_crashed.png');

  // ---- Retry, destroy every block: Tier cleared with the first Medal
  await press(page, 100, 672, 300);
  await waitScreen(page, 'wall');
  s = await state(page);
  check(s.alive === s.total && s.time < 3, 'Retry restarts the tier straight away');
  await page.evaluate(() => window.__mgbm.wall.destroyAll());
  await waitScreen(page, 'summary', 8000);
  s = await state(page);
  check(s.title === 'Tier cleared' && s.wall.medal === true && /Cleared/.test(s.rows[2].value), `summary "${s.title}", medal ${s.wall.medal}`);
  await snap(page, 'summary_cleared.png');
  p = await progress(page);
  check(p.medals === 1 && JSON.stringify(p.clearedTiers) === '[1]' && JSON.stringify(p.passedTiers) === '[1]', `medals ${p.medals}, cleared ${JSON.stringify(p.clearedTiers)}`);

  // ---- Replays never give another Medal
  await tap(page, 270, 672);
  await waitScreen(page, 'map');
  await tap(page, ...centre(await rect(page, 1)));
  await press(page, ...START, 300);
  await waitScreen(page, 'wall');
  await page.evaluate(() => window.__mgbm.wall.destroyAll());
  await waitScreen(page, 'summary', 8000);
  s = await state(page);
  p = await progress(page);
  check(s.wall.medal === false && p.medals === 1, `replay clear: medal ${s.wall.medal}, medals ${p.medals}`);

  // ---- Tier 2 passed (no medal) -> the map shows both pip types
  await tap(page, 270, 672);
  await waitScreen(page, 'map');
  await tap(page, ...centre(await rect(page, 2)));
  await press(page, ...START, 300);
  await waitScreen(page, 'wall');
  await flyLane(page);
  await waitScreen(page, 'summary', 20000);
  s = await state(page);
  check(s.title === 'Tier passed' && s.wall.medal === false, `tier 2: "${s.title}", medal ${s.wall.medal}`);
  await tap(page, 270, 672);
  await waitScreen(page, 'map');
  s = await state(page);
  check(s.tiles[0].state === 'cleared' && s.tiles[1].state === 'passed' && s.tiles[2].state === 'open' && s.medals === 1, `map: tier 1 ${s.tiles[0].state}, tier 2 ${s.tiles[1].state}, tier 3 ${s.tiles[2].state}, medals ${s.medals}`);
  await snap(page, 'map_pips.png');
  await tap(page, ...centre(await rect(page, 1)));
  s = await state(page);
  check(/Cleared \d+:\d\d$/.test(s.sheet.best), `inspector of the cleared tier: "${s.sheet.best}"`);

  // ---- Free Fly is still separate: Build -> FLY
  await tap(page, 30, 26); // back
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.buildScreen, null, { timeout: 5000 });
  await tap(page, 478, 789, { pause: 400 });
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.world, null, { timeout: 5000 });
  s = await state(page);
  check(s.tier === 1 && typeof s.hull === 'number', `FLY still starts Free Fly (tier ${s.tier}, hull ${s.hull})`);

  const c = lib.counts();
  console.log(`\n${c.passes} passed, ${c.failures} failed`);
  await browser.close();
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

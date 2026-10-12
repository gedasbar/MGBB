// Chunk 11a end-to-end test: buy the new blocks in the Shop with real taps, place them with real taps, fly at a Mother wave
// (the cheat panel starts Free Fly at wave 10, god mode keeps the run going) and confirm through the debug counters that every
// effect fired. Then the screenshots: the Mitosis picker section, two inspectors, a staged Free Fly frame (Residue Seed ring and a
// Gravity Well pulling rocks) and a staged wall frame (a bouncing shot leaving a plain block at a new angle).
// Needs the Vite dev server. Run: node e2e/blocks11a.e2e.cjs   (adds ?debug=1&stats=0 itself)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
for (const [k, v] of [['debug', 1], ['stats', 0]]) {
  if (!new RegExp(`[?&]${k}=`).test(url)) url += (url.includes('?') ? '&' : '?') + `${k}=${v}`;
}
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, tap, state, gameToClient } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk11a');
fs.mkdirSync(OUT, { recursive: true });
const TAB = { build: [54, 932], shop: [162, 932] };
const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];

async function snap(page, name) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const file = path.join(OUT, name);
  await page.locator('canvas').screenshot({ path: file });
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
  return file;
}
const move = async (page, gx, gy) => { const p = await gameToClient(page, gx, gy); await page.mouse.move(p.x, p.y); };

async function buy(page, id) {
  const idx = await page.evaluate((id) => window.__mgbm.state().rows.findIndex(r => r.key === id), id);
  if (idx < 0) throw new Error(`no shop row for ${id}`);
  await page.evaluate((y) => { const s = window.__mgbm.shopScreen; s.scrollBy(y - s.scrollY); }, idx * 90);
  const st = await state(page);
  const btn = st.rows.find(r => r.key === id).buttons.find(b => b.kind === 'buy');
  await tap(page, ...centre(btn.rect));
}
async function place(page, x, y, id) {
  const c = await page.evaluate(({ x, y }) => { const v = window.__mgbm.buildScreen.view; return { x: v.ox + (x + 0.5) * v.scale, y: v.oy + (y + 0.5) * v.scale }; }, { x, y });
  await tap(page, c.x, c.y);
  await tap(page, c.x, c.y);
  await page.evaluate((id) => window.__mgbm.buildScreen.picker.reveal(id), id);
  const r = await page.evaluate((id) => window.__mgbm.buildScreen.picker.tileScreenRect(id), id);
  await tap(page, ...centre(r));
  await tap(page, ...centre(r));
}
const circuit = (page) => page.evaluate(() => window.__mgbm.model.grid.cells.filter(c => c.blockId).map(c => `${c.blockId}@${c.x + 1},${c.y + 1}`));
async function reloadToBuild(page) {
  await page.goto(url);
  await page.waitForFunction(() => !!window.__mgbm);
  await page.waitForTimeout(400);
  await tap(page, ...TAB.build);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.buildScreen);
}

/** Starts Free Fly at wave 10 (the cheat panel), god mode on, and flies for `seconds` at 6x with the pointer under the lowest rock. */
async function flyWave10(page, seconds) {
  await page.evaluate(() => { document.getElementById('dbg-wave-n').value = '10'; document.getElementById('dbg-start-wave').click(); });
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.world && window.__mgbm.state().viewW, null, { timeout: 5000 });
  await page.evaluate(() => { const g = document.getElementById('dbg-god'); if (!g.checked) g.click(); });
  await move(page, 270, 700);
  await page.evaluate(() => window.__mgbm.setTimeScale(6));
  const t0 = Date.now();
  let last = null, mothers = 0;
  while (Date.now() - t0 < seconds * 1000) {
    const s = await state(page);
    if (!s.enemies) break;
    const rocks = s.enemies.filter(e => e.y < 740).sort((a, b) => b.y - a.y);
    await move(page, Math.max(24, Math.min(516, rocks.length ? rocks[0].x - 5 : 270)), 740);
    last = s;
    if (s.species.includes('mother')) mothers++;
    await page.waitForTimeout(80);
  }
  await page.evaluate(() => window.__mgbm.setTimeScale && window.__mgbm.setTimeScale(1));
  return { fx: last.effects, wave: last.wave, mothers };
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 900, height: 960 }, rich: true });

  // ---- Shop: the 9 new blocks, bought with real taps (credits from the debug button).
  for (let k = 0; k < 3; k++) await page.click('#dbg-credits');
  await tap(page, ...TAB.shop);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.shopScreen);
  const keys = await page.evaluate(() => window.__mgbm.state().rows.map(r => r.key));
  const NEW = ['fission_catalyst', 'cauterize', 'cleaver', 'culling_bolt', 'residue_seed', 'overkill_spill', 'gravity_well', 'static_charge', 'random_router'];
  check(keys.length === 41 && NEW.every(id => keys.includes(id)), `the Shop lists 41 blocks including the 9 new ones (${keys.length})`);
  for (const id of NEW) await buy(page, id);
  const owned = await page.evaluate(() => JSON.parse(localStorage.getItem('mgbm.progress.v1')).owned);
  check(NEW.every(id => owned[id] === 1), `bought one copy of each new block: ${NEW.map(id => owned[id]).join('')}`);

  // ---- Build: picker with the Mitosis section, then Flight A on the Shuttle.
  await tap(page, ...TAB.build);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.buildScreen);
  const e0 = await page.evaluate(() => { const v = window.__mgbm.buildScreen.view; return { x: v.ox + 3.5 * v.scale, y: v.oy + 5.5 * v.scale }; });
  await tap(page, e0.x, e0.y); await tap(page, e0.x, e0.y);
  const pk = await page.evaluate((NEW) => { const p = window.__mgbm.buildScreen.picker; return { tiles: p.tiles.length, max: p.maxScrollValue, has: NEW.every(id => p.tiles.some(t => t.id === id)) }; }, NEW);
  check(pk.has && pk.max > 0, `the picker has ${pk.tiles} tiles (all 41 blocks) including the 9 new ones, and scrolls (max ${pk.max})`);
  await page.evaluate(() => window.__mgbm.buildScreen.picker.reveal('fission_catalyst'));
  await page.waitForTimeout(250);
  const rect = await page.evaluate(() => window.__mgbm.buildScreen.picker.tileScreenRect('fission_catalyst'));
  const list = await page.evaluate(() => window.__mgbm.buildScreen.picker.listRect);
  check(rect.y >= list.y - 1 && rect.y + rect.h <= list.y + list.h + 1, `the Mitosis section's first tile is inside the list (tile y ${rect.y.toFixed(0)}, list ${list.y.toFixed(0)}..${(list.y + list.h).toFixed(0)})`);
  // Scroll to the end with the real wheel: the whole Mitosis section (two rows of tiles) must be reachable and unclipped.
  const lc = await gameToClient(page, list.x + list.w / 2, list.y + list.h / 2);
  await page.mouse.move(lc.x, lc.y);
  await page.mouse.wheel(0, 5000);
  await page.waitForTimeout(250);
  const end = await page.evaluate(() => { const p = window.__mgbm.buildScreen.picker; return { y: p.scrollY, max: p.maxScrollValue, last: p.tileScreenRect('overkill_spill'), first: p.tileScreenRect('fission_catalyst'), list: p.listRect }; });
  check(Math.abs(end.y - end.max) < 1 && end.last.y >= end.list.y - 1 && end.last.y + end.last.h <= end.list.y + end.list.h + 1 && end.first.y >= end.list.y - 1,
    `scrolled to the end (${end.y.toFixed(0)} of ${end.max.toFixed(0)}): both Mitosis rows are inside the list (last tile ${end.last.y.toFixed(0)}..${(end.last.y + end.last.h).toFixed(0)} of ${(end.list.y + end.list.h).toFixed(0)})`);
  const pickerShot = await snap(page, 'picker_mitosis.png');
  await tap(page, 516, 492);

  // The Shuttle's classic circuit keeps its Flat+ at (8,5); the new blocks go on the other cells of the column-9 run.
  const runA = [['culling_bolt', 8, 7], ['residue_seed', 8, 6], ['static_charge', 8, 4], ['cleaver', 8, 3], ['overkill_spill', 8, 2]];
  for (const [id, x, y] of runA) await place(page, x, y, id);
  let cc = await circuit(page);
  check(runA.every(([id, x, y]) => cc.includes(`${id}@${x + 1},${y + 1}`)), `five new blocks placed by taps: ${cc.length} blocks on the circuit`);
  // Two inspector shots: select a placed block with a single tap.
  const inspectors = [];
  for (const [id, x, y] of [runA[1], runA[3]]) {
    const c = await page.evaluate(({ x, y }) => { const v = window.__mgbm.buildScreen.view; return { x: v.ox + (x + 0.5) * v.scale, y: v.oy + (y + 0.5) * v.scale }; }, { x, y });
    await tap(page, c.x, c.y);
    const st = await state(page);
    inspectors.push({ id, shot: (await page.locator('canvas').screenshot()).toString('base64'), text: JSON.stringify(st).slice(0, 0) });
  }
  const strip = (await state(page)).statsStrip;
  check(strip.length >= 4, `stats strip with the new blocks: ${strip.slice(0, 4).join(' | ')}`);
  let r = await flyWave10(page, 22);
  const fxA = r.fx;
  check(r.wave >= 10 && r.mothers > 0, `Free Fly ran at wave ${r.wave}, a Mother was on screen in ${r.mothers} polls`);
  check(fxA.cullingHits > 0, `Culling Bolt added damage ${fxA.cullingHits} times`);
  check(fxA.residueClouds > 0 && fxA.residueTicks > 0, `Residue Seed left ${fxA.residueClouds} clouds that ticked ${fxA.residueTicks} times`);
  check(fxA.staticPulses > 0, `Static Charge released ${fxA.staticPulses} pulses`);
  check(fxA.cleaverHits > 0, `Cleaver changed ${fxA.cleaverHits} hits`);
  check(fxA.spillMarks > 0 && fxA.spillChildren > 0, `Overkill Spill marked ${fxA.spillMarks} kills, ${fxA.spillChildren} children took the extra`);

  // ---- Flight B: Fission Catalyst, Gravity Well and Bouncing.
  await reloadToBuild(page);
  await page.evaluate(() => { const m = window.__mgbm.model; for (const c of m.grid.cells.filter(c => c.blockId && !['turn_l', 'turn_r', 'flat_plus'].includes(c.blockId))) m.remove(c.x, c.y); window.__mgbm.buildScreen.refresh(); });
  const runB = [['fission_catalyst', 8, 7], ['gravity_well', 8, 6], ['bouncing', 8, 4]];
  for (const [id, x, y] of runB) await place(page, x, y, id);
  r = await flyWave10(page, 20);
  const fxB = r.fx;
  check(fxB.fissionSplits > 0, `Fission Catalyst forced ${fxB.fissionSplits} splits (${fxB.fissionBlocked} blocked by cooldown or cap)`);
  check(fxB.wellsMade > 0 && fxB.wellPulls > 0, `Gravity Well made ${fxB.wellsMade} wells that pulled ${fxB.wellPulls} times`);
  check(fxB.bounces > 0, `Bouncing bounced ${fxB.bounces} times (${fxB.edgeBounces} off screen edges)`);

  // ---- Flight C: Cauterize on the Shuttle.
  await reloadToBuild(page);
  await page.evaluate(() => { const m = window.__mgbm.model; for (const c of m.grid.cells.filter(c => c.blockId && !['turn_l', 'turn_r', 'flat_plus'].includes(c.blockId))) m.remove(c.x, c.y); window.__mgbm.buildScreen.refresh(); });
  await place(page, 8, 6, 'cauterize');
  r = await flyWave10(page, 20);
  check(r.fx.cauterizeMarks > 0 && r.fx.cauterizedKills > 0, `Cauterize marked ${r.fx.cauterizeMarks} hits; ${r.fx.cauterizedKills} kills left no children`);

  // ---- Flight D on the Fan: Random Router (+ a Flat+ on each branch).
  await reloadToBuild(page);
  await page.evaluate(() => {
    const m = window.__mgbm.model;
    m.switchHull('fan');
    for (const c of m.grid.cells.filter(c => c.blockId)) m.remove(c.x, c.y);
    window.__mgbm.buildScreen.fit(); window.__mgbm.buildScreen.refresh();
  });
  await page.waitForTimeout(200);
  const runD = [['random_router', 4, 8], ['turn_r', 1, 8], ['turn_l', 7, 8], ['flat_plus', 1, 4], ['flat_plus', 7, 4]];
  for (const [id, x, y] of runD) await place(page, x, y, id);
  cc = await circuit(page);
  check(runD.every(([id, x, y]) => cc.includes(`${id}@${x + 1},${y + 1}`)), `Fan circuit with the Random Router placed: ${cc.length} blocks`);
  r = await flyWave10(page, 14);
  check(r.fx.routerSingle > 20 && r.fx.routerBoth === 0, `Random Router picked a single output on ${r.fx.routerSingle} pulses, both on ${r.fx.routerBoth} (level 1)`);

  // ---- Screenshot: a staged Free Fly frame. Real engine code; only the rocks and shots are placed.
  await reloadToBuild(page);
  await page.evaluate(() => window.__mgbm.buildScreen.fly());
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.world && window.__mgbm.state().viewW, null, { timeout: 5000 });
  await move(page, 270, 760);
  const staged = await page.evaluate(() => {
    const w = window.__mgbm.world;
    w.autoSpawn = false; w.mitosis.enemies.length = 0; w.pool.active.fill(0); w.pool.count = 0; w.hull = 100; w.invuln = 100;
    w.shipX = 270; w.shipY = 820;
    const A = w.spawnRock(130, 430, 1e7);
    for (const [x, y] of [[230, 370], [235, 480], [70, 380], [180, 540], [90, 520], [250, 430]]) w.spawnRock(x, y, 1e7);
    const R = w.spawnRock(410, 300, 400); R.maxHp = 400;
    const far = w.spawnRock(470, 560, 1e7);
    const table = w.projSys.modifiersTable;
    table.push([{ type: 'gravity_well', level: 3 }]); const gi = table.length - 1;
    table.push([{ type: 'residue_seed', level: 1 }]); const ri = table.length - 1;
    for (const [e, mi, dmg] of [[A, gi, 5], [R, ri, 400]]) { const i = w.pool.spawn(e.x, e.y, 0, 0, dmg, 0, mi); w.projSys.init(i); }
    return { far: far.x };
  });
  await page.waitForTimeout(150);
  // Hold the well and the cloud on screen for the screenshot (they live 1.5 s and 2.5 s in play).
  await page.evaluate(() => { const ps = window.__mgbm.world.projSys; for (let k = 0; k < ps.wellT.length; k++) if (ps.wellT[k] > 0) ps.wellT[k] = 1.2; for (let k = 0; k < ps.cloudT.length; k++) if (ps.cloudT[k] > 0) ps.cloudT[k] = 2.4; });
  await page.waitForTimeout(500);
  const stg = await page.evaluate(() => {
    const w = window.__mgbm.world, ps = w.projSys;
    return { wells: Array.from(ps.wellT).filter(t => t > 0).length, clouds: Array.from(ps.cloudT).filter(t => t > 0).length, pulls: w.fx.wellPulls,
      near: w.mitosis.enemies.filter(e => Math.hypot(e.x - 130, e.y - 430) < 80).length, total: w.mitosis.enemies.length };
  });
  check(stg.wells === 1 && stg.clouds === 1 && stg.pulls > 0, `staged frame: ${stg.wells} well, ${stg.clouds} cloud, ${stg.pulls} pulls, ${stg.near} of ${stg.total} rocks gathered round the well`);
  // Refresh the timers right before the shot so the shrinking well ring is at full size and the cloud at full strength.
  await page.evaluate(() => { const ps = window.__mgbm.world.projSys; for (let k = 0; k < ps.wellT.length; k++) if (ps.wellT[k] > 0) ps.wellT[k] = 1.45; for (let k = 0; k < ps.cloudT.length; k++) if (ps.cloudT[k] > 0) ps.cloudT[k] = 2.5; });
  await page.waitForTimeout(160);                                   // one frame draws the rings
  await page.evaluate(() => window.__mgbm.setTimeScale(0));         // then freeze the sim: the screenshot is slow, the well lives 1.5 s
  const frozen = await page.evaluate(() => { const ps = window.__mgbm.world.projSys; return { well: Math.max(...ps.wellT), cloud: Math.max(...ps.cloudT) }; });
  check(frozen.well > 0.5 && frozen.cloud > 1, `frozen for the shot: well ${frozen.well.toFixed(2)} s and cloud ${frozen.cloud.toFixed(2)} s left`);
  const ffShot = await snap(page, 'freefly_residue_well.png');
  await page.evaluate(() => window.__mgbm.setTimeScale(1));

  // ---- Screenshot: a staged wall frame: three bouncing shots leave plain blocks at new angles.
  await reloadToBuild(page);
  await page.fill('#dbg-wall-tier', '1'); await page.fill('#dbg-wall-armor', '0'); await page.fill('#dbg-wall-shield', '0'); await page.fill('#dbg-wall-rows', '6');
  await move(page, 270, 800);
  await page.evaluate(() => document.getElementById('dbg-wall-start').click());
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'wall', null, { timeout: 5000 });
  const wi = await page.evaluate(() => {
    const w = window.__mgbm.wall;
    w.autoFire = false; w.level.approachSpeed = 0; w.setWallOffset(480);
    w.pool.active.fill(0); w.pool.count = 0;
    const table = w.projSys.modifiersTable;
    table.push([{ type: 'bouncing', level: 3 }]); const mi = table.length - 1;
    const row = w.level.rows - 1;
    const cols = [];
    for (let c = 4; c < 13 && cols.length < 3; c += 3) if (w.blocks[row * w.level.cols + c]) cols.push(c);
    cols.forEach((c, n) => {
      const b = w.blocks[row * w.level.cols + c];
      b.hp = b.maxHp = 1e6;
      const i = w.pool.spawn(b.x + [-14, 0, 14][n], 480 + 70, [-60, 0, 60][n], -150, 10, 0, mi); w.projSys.init(i);
    });
    return { shots: cols.length };
  });
  // Freeze the sim a moment after the third bounce so the shots are still next to the wall.
  await page.waitForFunction(() => window.__mgbm.wall.projSys.fx.bounces >= 3, null, { timeout: 8000, polling: 20 });
  await page.evaluate(() => window.__mgbm.setTimeScale(0));
  const bw = await page.evaluate(() => { const w = window.__mgbm.wall, ps = w.projSys; const out = []; for (let i = 0; i < w.pool.max; i++) if (w.pool.active[i]) out.push({ vx: +w.pool.vx[i].toFixed(0), vy: +w.pool.vy[i].toFixed(0), b: w.pool.bounces[i] }); return { bounces: ps.fx.bounces, shots: out }; });
  check(wi.shots === 3 && bw.bounces >= 3 && bw.shots.every(s => s.vy > 0), `wall frame: ${bw.bounces} bounces off plain blocks, shots now heading ${JSON.stringify(bw.shots)}`);
  const wallShot = await snap(page, 'wall_bounce.png');
  await page.evaluate(() => window.__mgbm.setTimeScale(1));

  // ---- Contact sheet of the two inspectors (top of the Build screen).
  const sheet = await page.evaluate(async (shots) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
    const c = document.createElement('canvas'); c.width = 540 * imgs.length + 8 * (imgs.length + 1); c.height = 330 + 16;
    const g = c.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, k) => g.drawImage(im, 0, 0, im.width, 330 * (im.width / 540), 8 + k * 548, 8, 540, 330));
    return c.toDataURL('image/png').split(',')[1];
  }, inspectors.map(x => x.shot));
  fs.writeFileSync(path.join(OUT, 'inspectors.png'), Buffer.from(sheet, 'base64'));
  console.log('INFO  files:', [pickerShot, ffShot, wallShot, path.join(OUT, 'inspectors.png')].map(f => path.basename(f)).join(', '));

  await browser.close();
  const { passes, failures } = lib.counts();
  process.stdout.write(`\n${passes} passed, ${failures} failed\n`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

// Chunk 9a end-to-end test: buy the new blocks in the Shop with real taps, place them in the Build screen with real taps, fly,
// and confirm through the debug hook counters that each effect happened at least once in Free Fly. Then three staged
// screenshots (picker, a Free Fly frame with an arc and status tints, a Wall frame with a corroded block and a mine).
// Needs the Vite dev server. Run: node e2e/blocks9a.e2e.cjs   (adds ?debug=1&stats=0 itself)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
for (const [k, v] of [['debug', 1], ['stats', 0]]) {
  if (!new RegExp(`[?&]${k}=`).test(url)) url += (url.includes('?') ? '&' : '?') + `${k}=${v}`;
}
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, tap, state, gameToClient } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk9a');
fs.mkdirSync(OUT, { recursive: true });
const TAB = { build: [54, 932], shop: [162, 932] };
const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];

async function snap(page, name) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  await page.locator('canvas').screenshot({ path: path.join(OUT, name) });
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
}
const move = async (page, gx, gy) => { const p = await gameToClient(page, gx, gy); await page.mouse.move(p.x, p.y); };

/** Shop: scroll the row for `id` to the top of the list and press its Buy button with a real tap. */
async function buy(page, id) {
  // Chunk 16b-fix: the Shop is a tile grid. Select the tile, then press Buy in its info sheet.
  await page.evaluate((id) => { const p = window.__mgbm.shopScreen.palette; p.reveal(id); }, id);
  const tile = await page.evaluate((id) => window.__mgbm.shopScreen.palette.tileScreenRect(id), id);
  if (!tile) throw new Error(`no shop tile for ${id}`);
  await tap(page, ...centre(tile));
  const st = await state(page);
  const btn = st.rows.find(r => r.key === id).buttons.find(b => b.kind === 'buy');
  await tap(page, ...centre(btn.rect));
}

/** Build: open the picker on cell (x, y) (0-indexed) with two taps and place `id` with two taps on its tile. */
async function place(page, x, y, id) {
  const c = await page.evaluate(({ x, y }) => { const v = window.__mgbm.buildScreen.view; return { x: v.ox + (x + 0.5) * v.scale, y: v.oy + (y + 0.5) * v.scale }; }, { x, y });
  await tap(page, c.x, c.y);
  await tap(page, c.x, c.y);
  await page.evaluate((id) => window.__mgbm.buildScreen.picker.reveal(id), id);
  const r = await page.evaluate((id) => window.__mgbm.buildScreen.picker.tileScreenRect(id), id);
  await tap(page, ...centre(r));
  // The first tap opens the info sheet, which can scroll the list: read the tile position again.
  const r2 = await page.evaluate((id) => window.__mgbm.buildScreen.picker.tileScreenRect(id), id);
  await tap(page, ...centre(r2));
}

const circuit = (page) => page.evaluate(() => window.__mgbm.model.grid.cells.filter(c => c.blockId).map(c => `${c.blockId}@${c.x + 1},${c.y + 1}`));
const effects = (page) => page.evaluate(() => window.__mgbm.state().effects);

/** Fly with the pointer chasing the lowest rock; `onTick` may stage things in the world. */
async function fly(page, seconds, onTick) {
  await page.evaluate(() => window.__mgbm.buildScreen.fly());
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.world && window.__mgbm.state().viewW, null, { timeout: 5000 });
  await move(page, 270, 700);
  await page.evaluate(() => window.__mgbm.setTimeScale(6));
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < seconds * 1000) {
    const s = await state(page);
    if (!s.enemies) { console.log('INFO  run ended (state keys: ' + Object.keys(s).slice(0, 6).join(',') + ')'); break; }
    const rocks = s.enemies.filter(e => e.y < 740).sort((a, b) => b.y - a.y);
    const gx = rocks.length ? rocks[0].x - 5 : 270;
    await move(page, Math.max(24, Math.min(516, gx)), 740);
    last = s.effects;
    if (onTick) await onTick(page, s);
    if (s.hull <= 0) break;
    await page.waitForTimeout(80);
  }
  await page.evaluate(() => { if (window.__mgbm.setTimeScale) window.__mgbm.setTimeScale(1); });
  return last; // the counters as of the last poll (the run may have ended and replaced the hook)
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 900, height: 960 }, rich: true });

  // ---- Shop: buy a copy of each block we will use (credits come from the debug button; the buys are real taps).
  await page.click('#dbg-credits');
  await page.click('#dbg-credits');
  // Chunk 15b gates these blocks behind Frontier directions: reach them all first (dev cheat).
  await page.evaluate(() => document.getElementById('dbg-fr-reach-all').click());
  await tap(page, ...TAB.shop);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.shopScreen);
  const rowsKeys = await page.evaluate(() => window.__mgbm.state().rows.map(r => r.key));
  check(rowsKeys.length === 41, `the Shop lists 41 blocks (${rowsKeys.length})`);
  const wanted = ['overclock', 'executioner', 'chain_lightning', 'ignite', 'frostbite', 'capacitor', 'delay_line', 'orbit', 'boomerang', 'corrosion', 'alternator', 'mine'];
  for (const id of wanted) await buy(page, id);
  const ownedNow = await page.evaluate(() => JSON.parse(localStorage.getItem('mgbm.progress.v1')).owned);
  check(wanted.every(id => ownedNow[id] === 1), `bought one copy of each of ${wanted.length} new blocks: ${wanted.map(id => ownedNow[id]).join('')}`);
  const credits = (await state(page)).credits;
  check(credits > 0 && credits < 20000, `credits were spent (${credits} left of 20000)`);

  // ---- Build (Shuttle): picker screenshots, then place five blocks on the column-9 run.
  await tap(page, ...TAB.build);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.buildScreen);
  check((await state(page)).hull === 'shuttle', 'the Build screen is on the Shuttle');
  // Picker shot: open on an empty cell, then show the top and the scrolled part.
  const e0 = await page.evaluate(() => { const v = window.__mgbm.buildScreen.view; return { x: v.ox + 3.5 * v.scale, y: v.oy + 5.5 * v.scale }; });
  await tap(page, e0.x, e0.y);
  await tap(page, e0.x, e0.y);
  check((await state(page)).pickerOpen, 'picker opens');
  const pk = await page.evaluate(() => {
    const p = window.__mgbm.buildScreen.picker;
    return { tiles: p.tiles.length, max: p.maxScrollValue, headers: p.tiles.map(t => t.id).filter(id => id !== '__remove').length };
  });
  check(pk.tiles === 41 && pk.max > 0, `picker has ${pk.tiles} tiles and scrolls (max scroll ${pk.max})`);
  await snap(page, 'picker_top.png');
  // Scroll with the real wheel until Modifiers and Status are showing.
  const sheet = await page.evaluate(() => { const r = window.__mgbm.buildScreen.picker.listRect; return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; });
  const pxp = await gameToClient(page, sheet.x, sheet.y);
  await page.mouse.move(pxp.x, pxp.y);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(200);
  const sc = await page.evaluate(() => window.__mgbm.buildScreen.picker.scrollY);
  check(sc > 300, `the wheel scrolled the picker (scrollY ${sc.toFixed(0)})`);
  await snap(page, 'picker_scrolled.png');
  await page.mouse.wheel(0, 2000);
  await page.waitForTimeout(200);
  const scMax = await page.evaluate(() => { const p = window.__mgbm.buildScreen.picker; return { y: p.scrollY, max: p.maxScrollValue }; });
  check(Math.abs(scMax.y - scMax.max) < 1, `scrolled to the end (${scMax.y.toFixed(0)} of ${scMax.max.toFixed(0)}): the Status section is fully visible`);
  await snap(page, 'picker_status.png');
  await tap(page, 516, 492); // close the sheet
  check(!(await state(page)).pickerOpen, 'sheet closes');

  // Flight A: Overclock, Executioner, Chain Lightning, Ignite, Frostbite on the run into the ejector.
  const runA = [['overclock', 8, 6], ['executioner', 8, 7], ['chain_lightning', 8, 4], ['ignite', 8, 3], ['frostbite', 8, 2]];
  for (const [id, x, y] of runA) await place(page, x, y, id);
  let cc = await circuit(page);
  check(runA.every(([id, x, y]) => cc.includes(`${id}@${x + 1},${y + 1}`)), `five new blocks placed by tapping: ${cc.join(' ')}`);
  const stripA = (await state(page)).statsStrip;
  check(stripA.length >= 4, `the stats strip shows ${stripA.slice(0, 4).join(' | ')}`);
  let fx = await fly(page, 20);
  check(fx.overclockPeak > 1.05, `Overclock ramped the damage (peak x${fx.overclockPeak.toFixed(2)})`);
  check(fx.executionerHits > 0, `Executioner hit weak rocks ${fx.executionerHits} times`);
  check(fx.chainJumps > 0, `Chain Lightning jumped ${fx.chainJumps} times`);
  check(fx.igniteApplied > 0 && fx.burnTicks > 0, `Ignite applied ${fx.igniteApplied} times, ${fx.burnTicks} burn ticks`);
  check(fx.freezeApplied > 0 && fx.frozenBonusHits > 0, `Frostbite froze ${fx.freezeApplied} times, ${fx.frozenBonusHits} hits took the frozen bonus`);

  // ---- back to Build (a reload: the saved circuit and the bought blocks must come back): Flight B on the same hull
  await page.goto(url);
  await page.waitForFunction(() => !!window.__mgbm);
  await page.waitForTimeout(400);
  await tap(page, ...TAB.build);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.buildScreen);
  cc = await circuit(page);
  check(runA.every(([id, x, y]) => cc.includes(`${id}@${x + 1},${y + 1}`)), `the saved circuit came back after a reload: ${cc.length} blocks`);
  // remove the five (set via the model's remove through taps is covered by earlier scripts; use the model here)
  await page.evaluate(() => { const m = window.__mgbm.model; for (const c of m.grid.cells.filter(c => c.blockId && !['turn_l', 'turn_r', 'flat_plus'].includes(c.blockId))) m.remove(c.x, c.y); window.__mgbm.buildScreen.refresh(); });
  const runB = [['capacitor', 8, 6], ['delay_line', 8, 7], ['orbit', 8, 4], ['boomerang', 8, 3], ['corrosion', 8, 2]];
  for (const [id, x, y] of runB) await place(page, x, y, id);
  cc = await circuit(page);
  check(runB.every(([id, x, y]) => cc.includes(`${id}@${x + 1},${y + 1}`)), `second set placed: ${cc.join(' ')}`);
  fx = await fly(page, 22, async (p) => {
    // Rocks have no armor; give them some so Corrosion has something to strip (staging, not a game rule).
    await p.evaluate(() => { const w = window.__mgbm.world; if (w) for (const e of w.mitosis.enemies) if (e.armor < 10) e.armor = 10; });
  });
  check(fx.capacitorEmits > 0, `Capacitor emitted ${fx.capacitorEmits} summed shots (${fx.capacitorAbsorbed} packets absorbed)`);
  check(fx.delayReleases > 0, `Delay Line released ${fx.delayReleases} shots`);
  check(fx.orbitLaunches > 0, `Orbit launched ${fx.orbitLaunches} projectiles after circling`);
  check(fx.boomerangReturns > 0, `Boomerang returned to the ship ${fx.boomerangReturns} times`);
  check(fx.corrosionStrips > 0, `Corrosion stripped armor ${fx.corrosionStrips} times`);

  // ---- Flight C on the Fan: Alternator + Mine
  await page.goto(url);
  await page.waitForFunction(() => !!window.__mgbm);
  await page.waitForTimeout(400);
  await tap(page, ...TAB.build);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.buildScreen);
  await page.evaluate(() => {
    const m = window.__mgbm.model;
    m.switchHull('fan');
    for (const c of m.grid.cells.filter(c => c.blockId)) m.remove(c.x, c.y);
    window.__mgbm.buildScreen.fit(); window.__mgbm.buildScreen.refresh();
  });
  await page.waitForTimeout(200);
  const runC = [['alternator', 4, 8], ['turn_r', 1, 8], ['turn_l', 7, 8], ['mine', 1, 4]];
  for (const [id, x, y] of runC) await place(page, x, y, id);
  cc = await circuit(page);
  check(runC.every(([id, x, y]) => cc.includes(`${id}@${x + 1},${y + 1}`)), `Fan circuit placed: ${cc.join(' ')}`);
  const recipes = await page.evaluate(() => window.__mgbm.model.compiled.recipes.length);
  check(recipes === 2, `the Alternator feeds two ejectors (${recipes} recipes)`);
  fx = await fly(page, 24, async (p) => {
    // A waiting mine only goes off when something touches it: drop a rock just above each one (staging).
    await p.evaluate(() => {
      const w = window.__mgbm.world;
      if (!w) return;
      for (let i = 0; i < w.pool.max; i++) {
        if (w.pool.active[i] && w.pool.phase[i] === 5) { w.spawnRock(w.pool.x[i], w.pool.y[i] - 50, 1e6); }
      }
    });
  });
  check(fx.alternations > 0, `Alternator switched branches ${fx.alternations} times`);
  check(fx.mineDetonations > 0, `Mines detonated ${fx.mineDetonations} times`);

  // ---- Screenshot 2: a staged Free Fly frame. Everything below is produced by the real engine code; only the rocks are placed.
  // A fresh run (the flight above ended with the ship destroyed at 6x speed).
  await page.goto(url);
  await page.waitForFunction(() => !!window.__mgbm);
  await page.waitForTimeout(400);
  await tap(page, ...TAB.build);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.buildScreen);
  await page.evaluate(() => window.__mgbm.buildScreen.fly());
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.world && window.__mgbm.state().viewW, null, { timeout: 5000 });
  await page.evaluate(() => {
    const w = window.__mgbm.world;
    w.autoSpawn = false;
    w.mitosis.enemies.length = 0;
    w.pool.active.fill(0);
    w.pool.count = 0;
    w.hull = 100;
    w.invuln = 100;
  });
  await move(page, 270, 760);
  const staged = await page.evaluate(async () => {
    const w = window.__mgbm.world;
    const A = w.spawnRock(130, 330, 1e6), B = w.spawnRock(215, 345, 1e6), C = w.spawnRock(300, 325, 1e6);
    const D = w.spawnRock(430, 420, 1e6), E = w.spawnRock(95, 520, 1e6), F = w.spawnRock(340, 560, 1e6);
    const table = w.projSys.modifiersTable;
    table.push([{ type: 'chain_lightning', level: 1 }, { type: 'ignite', level: 1 }]);
    table.push([{ type: 'frostbite', level: 1 }]);
    const shoot = (r, mi) => { const i = w.pool.spawn(r.x, r.y, 0, 0, 100, 0, mi); w.projSys.init(i); };
    shoot(A, table.length - 2);
    shoot(D, table.length - 1);
    shoot(E, table.length - 1);
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    // Hold the arcs on screen for the screenshot (they live 0.12 s in play).
    let held = 0;
    for (let k = 0; k < w.projSys.arcT.length; k++) if (w.projSys.arcT[k] > 0) { w.projSys.arcT[k] = 5; held++; }
    void F; // F is left untouched: a plain rock for comparison
    return { held, burning: [A, B, C].filter(r => (r.burnT || 0) > 0).length, frozen: [D, E].filter(r => (r.freezeT || 0) > 0).length };
  });
  check(staged.held === 2, `chain lightning drew ${staged.held} arcs (A to B to C)`);
  check(staged.burning === 3, `${staged.burning} rocks are burning (the hit one and both jumped to)`);
  check(staged.frozen === 2, `${staged.frozen} rocks are frozen`);
  await page.waitForTimeout(250);
  await snap(page, 'freefly_arc_ignite_frozen.png');

  // ---- Screenshot 3: a staged Wall frame: corroded armored blocks and a mine in the lane
  await page.goto(url);
  await page.waitForFunction(() => !!window.__mgbm);
  await page.waitForTimeout(400);
  await tap(page, ...TAB.build);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.buildScreen);
  await page.evaluate(() => {
    const m = window.__mgbm.model;
    m.switchHull('shuttle');
    window.__mgbm.buildScreen.fit(); window.__mgbm.buildScreen.refresh();
  });
  await page.fill('#dbg-wall-tier', '12');
  await page.fill('#dbg-wall-armor', '1');
  await page.fill('#dbg-wall-shield', '0');
  await page.fill('#dbg-wall-rows', '6');
  await move(page, 270, 800);
  await page.evaluate(() => document.getElementById('dbg-wall-start').click());
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'wall', null, { timeout: 5000 });
  const wallInfo = await page.evaluate(async () => {
    const w = window.__mgbm.wall;
    w.autoFire = false;
    w.level.approachSpeed = 0;
    w.setWallOffset(480); // the wall's bottom edge at y 480; the ship waits at 768
    w.pool.active.fill(0); w.pool.count = 0;
    // Corrode every block of the bottom row that is on screen, a different number of times each (real corrosion code).
    const table = w.projSys.modifiersTable;
    table.push([{ type: 'corrosion', level: 5 }]);
    const mi = table.length - 1;
    const row = w.level.rows - 1;
    let touched = 0;
    for (let c = 0; c < w.level.cols; c++) {
      const b = w.blocks[row * w.level.cols + c];
      if (!b) continue;
      const shots = (c % 5) * 10; // 0, 10, 20, 30, 40 corrosive hits (level 5: down to 10% of the armor)
      b.hp = b.maxHp * 1000; b.maxHp = b.hp; // keep the blocks alive while they are corroded
      for (let k = 0; k < shots; k++) {
        const i = w.pool.spawn(b.x, b.y, 0, 0, 1, 0, mi);
        w.projSys.init(i);
        w.projSys.processField(w.field, w.level.tier);
      }
      if (shots > 0) touched++;
    }
    // A mine out of the ship: spawn it moving up and let the real loop stop it after 220 px.
    const mineMi = (table.push([{ type: 'mine', level: 1 }]), table.length - 1);
    const i = w.pool.spawn(w.shipX, w.shipY, 0, -600, 100, 0, mineMi);
    w.projSys.init(i);
    const sample = w.all.filter(b => w.blocks[b.row * w.level.cols + b.col] === b && b.row === row && b.armor0 !== undefined).map(b => +(b.armor / b.armor0).toFixed(2));
    return { touched, sample: [...new Set(sample)].sort() };
  });
  await page.waitForTimeout(900);
  const wst = await page.evaluate(() => {
    const w = window.__mgbm.wall;
    let mines = 0;
    for (let i = 0; i < w.pool.max; i++) if (w.pool.active[i] && w.pool.phase[i] === 5) mines++;
    return { mines, y: w.pool.y.find((_, i) => w.pool.active[i] && w.pool.phase[i] === 5), cam: window.__mgbm.camera.x };
  });
  check(wallInfo.touched >= 8 && wallInfo.sample.length >= 3, `corroded armor fractions on the bottom row: ${wallInfo.sample.join(', ')}`);
  check(wst.mines === 1 && Math.abs(wst.y - 548) < 12, `one mine waits in the lane at y ${wst.y && wst.y.toFixed(0)} (ship y 768, 220 px up)`);
  await snap(page, 'wall_corroded_blocks_and_mine.png');
  // A 3x zoom of the bottom row (the frame width differences are a few pixels at 1x).
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const box = await page.locator('canvas').boundingBox();
  const clip = await page.screenshot({ clip: { x: box.x + (box.width - 540) / 2 + 108, y: box.y + (box.height - 960) / 2 + 420, width: 270, height: 66 } });
  await page.evaluate((b64) => {
    const d = document.createElement('div');
    d.id = 'zoom-overlay';
    d.style.cssText = 'position:fixed;inset:0;background:#000;z-index:99999;display:flex;align-items:center;justify-content:center';
    d.innerHTML = '<img style="width:810px;image-rendering:pixelated" src="data:image/png;base64,' + b64 + '">';
    document.body.appendChild(d);
  }, clip.toString('base64'));
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, 'wall_corroded_zoom.png') });
  await page.evaluate(() => document.getElementById('zoom-overlay').remove());

  await browser.close();
  const { passes, failures } = lib.counts();
  process.stdout.write(`\n${passes} passed, ${failures} failed\n`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

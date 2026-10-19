// Chunk 16a end-to-end test: instant results (wall CLEARED / PASSED / CRASHED, Frontier wall and Free Fly squares: wall-clock time
// from the moment of the result to the result screen), Frontier holes cannot be selected, the builder keeps orientations when a
// path-changing block is placed and has no warning triangles / warnings cell / orientation text.
// Contact sheet: reports/chunk16a/sheet_polish16a.png. Needs the Vite dev server. Run: node e2e/polish16a.e2e.cjs
// The timing part also runs on the old code (it only uses generic hooks): MEASURE_ONLY=1 skips the 16a-only checks.
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, state, tap, gameToClient } = lib;
const MEASURE_ONLY = !!process.env.MEASURE_ONLY;

const OUT = path.join(__dirname, '..', 'reports', 'chunk16a');
fs.mkdirSync(OUT, { recursive: true });
const waitScreen = (page, name, timeout = 8000) => page.waitForFunction((n) => window.__mgbm && window.__mgbm.screen === n, name, { timeout });
const START = [451, 862];

async function canvasShot(page) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const b = await page.locator('canvas').screenshot();
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
  return b.toString('base64');
}
async function montage(page, shots, captions, file) {
  const b64 = await page.evaluate(async ({ shots, captions }) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
    const w = 540, h = 960, k = 0.5, pad = 8;
    const c = document.createElement('canvas');
    c.width = imgs.length * (w * k + pad) + pad; c.height = h * k + 40;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => {
      ctx.drawImage(im, pad + i * (w * k + pad), pad, w * k, h * k);
      ctx.fillStyle = '#aaa'; ctx.font = '12px monospace';
      ctx.fillText(captions[i], pad + i * (w * k + pad), h * k + 28);
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { shots, captions });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
}

/** Runs `action` in the page and returns the milliseconds until the screen is 'summary'. */
const timeToSummary = (page, action, limitMs = 60000) => page.evaluate(({ action, limitMs }) => new Promise((resolve) => {
  const t0 = performance.now();
  // eslint-disable-next-line no-new-func
  new Function(action)();
  const poll = () => {
    if (window.__mgbm && window.__mgbm.screen === 'summary') return resolve(performance.now() - t0);
    if (performance.now() - t0 > limitMs) return resolve(-1);
    requestAnimationFrame(poll);
  };
  poll();
}), { action, limitMs });

const times = {};

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: true });
  const shots = [];
  const caps = [];

  // ------------------------------------------------------------------ builder
  if (!MEASURE_ONLY) {
    let st = await state(page);
    check(st.statsStrip.length === 4, `stats strip has 4 cells (no Warnings cell): ${JSON.stringify(st.statsStrip)}`);
    shots.push(await canvasShot(page)); caps.push('builder: default circuit');
    const rots = () => page.evaluate(() => window.__mgbm.model.grid.cells.filter(c => c.blockId).map(c => `${c.x},${c.y}:${c.blockId}:${c.rotation}`));
    const before = await rots();
    check(JSON.stringify(before) === JSON.stringify(['8,5:flat_plus:0', '5,8:turn_r:0', '8,8:turn_l:90']), `default circuit orientations: ${before}`);
    // A block that changes the path: a Turn Left right above the generator.
    await page.evaluate(() => window.__mgbm.model.place(5, 9, 'turn_l'));
    await page.waitForTimeout(300);
    const after = await rots();
    check(after.filter(s => !s.startsWith('5,9:')).join('|') === before.join('|'), `no other block changed orientation: ${after}`);
    check(after.includes('5,9:turn_l:0'), 'the new block faces the way the signal reaches it (up)');
    st = await state(page);
    check(st.recipes === 0 && st.statsStrip.length === 4, `the path is cut and nothing was re-oriented to repair it (recipes ${st.recipes})`);
    // Select the new block: the info line is the block name and its description only.
    await page.evaluate(() => { const b = window.__mgbm.buildScreen; b.selected = { x: 5, y: 9 }; b.refresh(); });
    await page.waitForTimeout(200);
    st = await state(page);
    check(st.selected && st.selected.x === 5 && st.selected.y === 9, `block selected: ${JSON.stringify(st.selected)}`);
    check(!/rientation|auto|manual/i.test(st.inspector.title + ' ' + st.inspector.body) && st.inspector.title.length > 0, `info line "${st.inspector.title}" / "${st.inspector.body}" has no orientation text`);
    check(!/auto/i.test(st.toast || ''), `no auto-rotate toast: "${st.toast}"`);
    shots.push(await canvasShot(page)); caps.push('builder: Turn Left placed above generator, selected');
    await page.evaluate(() => window.__mgbm.model.undo());
    await page.waitForTimeout(200);
    check((await rots()).join('|') === before.join('|'), 'undo restores every orientation');
    // The toolbar: Rotate right on the Flat+ (8,5) stops the line, Auto-orient on it (and only it) turns it back.
    await page.evaluate(() => { const b = window.__mgbm.buildScreen; b.selected = { x: 8, y: 5 }; b.refresh(); });
    await page.waitForTimeout(200);
    await tap(page, 378, 880); // Rotate right
    st = await state(page);
    check(st.recipes === 0 && (await rots()).includes('8,5:flat_plus:90'), `Rotate right turns only the selected block (recipes ${st.recipes})`);
    await tap(page, 270, 880); // Auto-orient
    st = await state(page);
    check(st.recipes === 1 && (await rots()).join('|') === before.join('|'), `Auto-orient turns it back and nothing else changes (recipes ${st.recipes})`);
  }

  // ------------------------------------------------------------------ campaign tier 1: CLEARED / PASSED / CRASHED timing
  await tap(page, 468, 735, { pause: 300 });
  await waitScreen(page, 'map');
  await tap(page, ...START, { pause: 300 });
  await waitScreen(page, 'wall');
  times.cleared = await timeToSummary(page, 'window.__mgbm.wall.destroyAll()');
  let s = await state(page);
  check(s.title === 'Tier cleared', `CLEARED summary: "${s.title}"`);
  shots.push(await canvasShot(page)); caps.push(`wall CLEARED: summary ${(times.cleared / 1000).toFixed(2)} s after the last block`);
  times.clearedAlive = times.cleared;

  await tap(page, 270, 672); // Map
  await waitScreen(page, 'map');
  await tap(page, ...START, { pause: 300 });
  await waitScreen(page, 'wall');
  // PASSED: the pointer rests at the top of the screen (the e2e tap helper parks it there), so the ship is held at the top and the wall is boosted; park the wall so the last row's top edge is just past the ship, then let it scroll.
  await page.evaluate(() => {
    const w = window.__mgbm.wall;
    w.invuln = 999;
    const topOfWall = () => w.wallOffsetY - w.level.rows * 54;
    w.setWallOffset(w.wallOffsetY + (w.shipY + 1 - topOfWall()));
  });
  times.passed = await timeToSummary(page, '0', 90000);
  s = await state(page);
  check(s.title === 'Tier passed', `PASSED summary: "${s.title}" after ${(times.passed / 1000).toFixed(2)} s from "the last row just passed the ship" (ship held at the top, wall boosted)`);
  // The same, but with the ship at the pass line already: only the result delay is left.
  await tap(page, 270, 672);
  await waitScreen(page, 'map');
  await tap(page, ...START, { pause: 300 });
  await waitScreen(page, 'wall');
  await page.evaluate(() => { const w = window.__mgbm.wall; w.setWallOffset(w.wallOffsetY + (w.shipY + 5 - w.finishY)); });
  times.passedDelay = await timeToSummary(page, '0', 20000);
  check(times.passedDelay > 0, `PASSED, ship already at the pass line: summary after ${(times.passedDelay / 1000).toFixed(2)} s`);

  // CRASHED: a live block on the ship.
  await tap(page, 270, 672);
  await waitScreen(page, 'map');
  await tap(page, ...START, { pause: 300 });
  await waitScreen(page, 'wall');
  times.crashed = await timeToSummary(page, `const w = window.__mgbm.wall; let b = null; for (const x of w.all) { if (w.blocks[x.id] !== x) continue; if (!b || Math.abs(w.dxw(x.x, w.shipX)) < Math.abs(w.dxw(b.x, w.shipX))) b = x; } w.invuln = 0; w.setWallOffset(w.wallOffsetY + (w.shipY - b.y)); w.shipX = b.x;`, 20000);
  s = await state(page);
  check(s.title === 'Tier crashed' || /crash/i.test(s.title), `CRASHED summary: "${s.title}" after ${(times.crashed / 1000).toFixed(2)} s`);

  // ------------------------------------------------------------------ Frontier: holes, wall square, Free Fly square
  await page.evaluate(() => { const b = document.getElementById('dbg-fr-unlock'); if (b) b.click(); });
  await tap(page, 270, 672); // summary -> Map
  await waitScreen(page, 'map');
  await page.evaluate(() => window.__mgbm.openFrontier());
  await waitScreen(page, 'frontier');
  const setup = await page.evaluate(() => {
    const m = window.__mgbm;
    m.clearRing(2);
    let hole = null;
    for (let r = 1; r <= 12 && !hole; r++) for (let y = -r; y <= r && !hole; y++) for (let x = -r; x <= r && !hole; x++) if (m.stateAt(x, y) === 'hole') hole = { x, y };
    let wallSq = null, ffSq = null;
    for (let r = 1; r <= 8; r++) for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (m.stateAt(x, y) !== 'available') continue;
      if (m.kindAt(x, y) === 'wall' && !wallSq) wallSq = { x, y };
      if (m.kindAt(x, y) === 'freefly' && !ffSq) ffSq = { x, y };
    }
    m.jump(hole.x, hole.y, 44);
    return { hole, wallSq, ffSq };
  });
  await page.waitForTimeout(300);
  if (!MEASURE_ONLY) {
    await page.evaluate(() => window.__mgbm.select(0, 0));
    let fs1 = await state(page);
    check(fs1.selected && fs1.selected.x === 0 && fs1.panel.play === true, 'a real square can be selected (Play enabled)');
    const hp = await page.evaluate((h) => window.__mgbm.squareScreen(h.x, h.y), setup.hole);
    await tap(page, hp.x, hp.y);
    fs1 = await state(page);
    check(fs1.selected === null, `tapping empty space at (${setup.hole.x}, ${setup.hole.y}) clears the selection: ${JSON.stringify(fs1.selected)}`);
    check(fs1.panel.line1 === 'Select a square' && fs1.panel.play === false && !/unlock/i.test(fs1.panel.note) && fs1.panel.state === '', `neutral hint, no Play, no unlock line: ${JSON.stringify(fs1.panel)}`);
    shots.push(await canvasShot(page)); caps.push('Frontier: empty space tapped');
    await page.evaluate(() => window.__mgbm.select(0, 0));
    await page.evaluate((h) => window.__mgbm.select(h.x, h.y), setup.hole);
    fs1 = await state(page);
    check(fs1.selected === null, 'select() on a hole also leaves nothing selected');
  }

  // Wall square: clear.
  await page.evaluate((q) => { window.__mgbm.jump(q.x, q.y, 44); window.__mgbm.select(q.x, q.y); }, setup.wallSq);
  await tap(page, 451, 864); // PLAY
  await waitScreen(page, 'wall');
  times.sqWallCleared = await timeToSummary(page, 'window.__mgbm.wall.destroyAll()');
  s = await state(page);
  check(s.wall && s.wall.result === 'cleared', `Frontier wall square CLEARED: summary after ${(times.sqWallCleared / 1000).toFixed(2)} s`);
  await tap(page, 100, 672); // Frontier
  await waitScreen(page, 'frontier');

  // Free Fly square: reaching the full time, then a death.
  await page.evaluate((q) => { window.__mgbm.jump(q.x, q.y, 44); window.__mgbm.select(q.x, q.y); }, setup.ffSq);
  await tap(page, 451, 864);
  await waitScreen(page, 'fly');
  const c = await gameToClient(page, 270, 820);
  await page.mouse.move(c.x, c.y);
  await page.mouse.move(c.x + 20, c.y, { steps: 3 });
  await page.waitForTimeout(800);
  times.ffCleared = await timeToSummary(page, 'const w = window.__mgbm.world; w.god = true; w.time = w.encounter.duration - 0.02;');
  s = await state(page);
  check(s.wall && s.wall.result === 'cleared', `Free Fly square reaching the full time: "${s.title}" after ${(times.ffCleared / 1000).toFixed(2)} s`);
  await tap(page, 100, 672);
  await waitScreen(page, 'frontier');
  await page.evaluate((q) => { window.__mgbm.jump(q.x, q.y, 44); window.__mgbm.select(q.x, q.y); }, setup.ffSq);
  await tap(page, 451, 864);
  await waitScreen(page, 'fly');
  await page.mouse.move(c.x, c.y);
  await page.mouse.move(c.x + 20, c.y, { steps: 3 });
  await page.waitForTimeout(800);
  times.ffFailed = await timeToSummary(page, 'const w = window.__mgbm.world; w.invuln = 0; w.hull = 1; w.knockX = 0; const e = w.mitosis.enemies[0]; if (e) { e.x = w.shipX; e.y = w.shipY; }', 15000);
  s = await state(page);
  check(times.ffFailed > 0, `Free Fly square death: "${s.title}" ${(times.ffFailed / 1000).toFixed(2)} s from putting a rock on the ship (hull 1)`);

  console.log('\nTIMES (ms): ' + JSON.stringify(Object.fromEntries(Object.entries(times).map(([k, v]) => [k, Math.round(v)]))));
  if (!MEASURE_ONLY) {
    const sheet = await montage(page, shots, caps, path.join(OUT, 'sheet_polish16a.png'));
    check(fs.statSync(sheet).size > 20000, `contact sheet written (${sheet})`);
  }
  const { passes, failures } = lib.counts();
  console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'} (${passes} checks)`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });

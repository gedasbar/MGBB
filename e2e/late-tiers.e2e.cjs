// area: late-tiers, wall, map
// Chunk 27a end-to-end test: the locked "What happens after 100?" entry with its progress count, tiers 101-200 appearing in the
// list once every tier 1-100 is cleared (type name on the tile, name + line in the panel), and one tier of each layout type
// (Monolith, Maze, Fortress, Drift) in flight on the real wall screen. Contact sheet: reports/chunk27a/sheet_27a.png.
// Needs the Vite dev server. Run: node e2e/late-tiers.e2e.cjs   (adds ?debug=1 itself)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, state, tap } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk27a');
fs.mkdirSync(OUT, { recursive: true });
const waitScreen = (page, name, timeout = 8000) => page.waitForFunction((n) => window.__mgbm && window.__mgbm.screen === n, name, { timeout });
const MAP_TAB = [486, 930];
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
    const k = 0.5, pad = 8, cap = 22, per = 3;
    const w = Math.round(540 * k), h = Math.round(960 * k);
    const rows = Math.ceil(imgs.length / per);
    const c = document.createElement('canvas');
    c.width = per * (w + pad) + pad; c.height = rows * (h + cap + pad) + pad;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => {
      const x = pad + (i % per) * (w + pad), y = pad + Math.floor(i / per) * (h + cap + pad);
      ctx.drawImage(im, x, y, w, h);
      ctx.fillStyle = '#aaa'; ctx.font = '12px monospace'; ctx.fillText(captions[i], x, y + h + 16);
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { shots, captions });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}

/** Seeds the campaign progress through the Map screen's own store (a second copy of the module would be invisible to the app). */
const seed = (page, cleared, passed) => page.evaluate(({ cleared, passed }) => {
  const s = window.__mgbm.progress;
  s.data.clearedTiers = cleared;
  s.data.passedTiers = passed;
  s.commit();
}, { cleared, passed });
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: true });
  const shots = [];
  const caps = [];

  const onScreen = (name) => page.evaluate((n) => !!window.__mgbm && window.__mgbm.screen === n, name);
  // A tap before a screen is ready is lost: tap again until the screen shows (24d).
  const goTab = async (xy, name) => {
    for (let attempt = 0; attempt < 6; attempt++) {
      await tap(page, ...xy, { pause: 150 });
      if (await lib.waitFor(() => onScreen(name), { timeout: 2000 })) return;
    }
    await waitScreen(page, name, 1000);
  };
  const openMap = () => lib.openCampaign(page);
  const reopenMap = async () => { await goTab([54, 930], 'build'); await openMap(); }; // Build tab, then Map tab: the Map is rebuilt from the seeded progress
  const selectTier = async (t) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      // scroll so the tile is mid-screen, then tap it
      await page.evaluate((t) => { const m = window.__mgbm; m.scrollTo(0); const r0 = m.tileScreenRect(t); m.scrollTo(Math.max(0, r0.y - 300)); }, t);
      const rr = await page.evaluate((t) => window.__mgbm.tileScreenRect(t), t);
      await tap(page, rr.x + rr.w / 2, rr.y + rr.h / 2, { pause: 200 });
      if (await lib.waitFor(async () => (await state(page)).selected === t, { timeout: 1500 })) break;
    }
    return state(page);
  };

  // ---- 1. Tiers 1-99 cleared, tier 100 only passed: the list ends with the locked entry
  await openMap();
  await seed(page, range(1, 99), range(1, 100));
  await reopenMap();
  let st = await state(page);
  check(st.tiles.length === 100, `only tiers 1-100 are listed while 101-200 are closed (${st.tiles.length})`);
  check(!!st.lockedEntry && st.lockedEntry.cleared === 99 && st.lockedEntry.of === 100, `the locked entry counts 99 / 100 cleared (${JSON.stringify(st.lockedEntry && { c: st.lockedEntry.cleared, of: st.lockedEntry.of })})`);
  await page.evaluate(() => { const m = window.__mgbm; m.scrollTo(100000); });
  st = await state(page);
  const r = st.lockedEntry.rect;
  await tap(page, r.x + r.w / 2, r.y + r.h / 2, { pause: 250 });
  st = await state(page);
  check(st.sheet.title === 'What happens after 100?', `tapping the entry opens its panel ("${st.sheet.title}")`);
  check(st.sheet.best === '99 / 100 cleared', `the panel shows the count ("${st.sheet.best}")`);
  check(st.sheet.startEnabled === false && st.sheet.startLabel === 'Locked', `START is locked ("${st.sheet.startLabel}")`);
  shots.push(await canvasShot(page)); caps.push('Locked entry, 99 / 100');

  // ---- 2. Every tier cleared: tiers 101-200 join the list
  await seed(page, range(1, 100), range(1, 100));
  await reopenMap();
  st = await state(page);
  check(st.tiles.length === 200 && st.lockedEntry === null, `all 200 tiers are listed and the locked entry is gone (${st.tiles.length}, ${st.lockedEntry})`);
  check(st.tiles[100].state === 'open' && st.tiles[101].state === 'locked', `tier 101 is open, 102 locked (${st.tiles[100].state}, ${st.tiles[101].state})`);
  check(st.tiles[102].type === 'monolith' && st.tiles[105].type === 'maze' && st.tiles[108].type === 'fortress' && st.tiles[111].type === 'drift', 'tiers 103 / 106 / 109 / 112 are Monolith / Maze / Fortress / Drift');
  check(st.tiles.filter(t => t.type).length === 38, `38 type tiers are marked (${st.tiles.filter(t => t.type).length})`);
  st = await selectTier(103);
  check(st.sheet.title === 'Tier 103 · Monolith', `panel title: "${st.sheet.title}"`);
  check(/one row of huge blocks/i.test(st.sheet.typeLine), `panel type line: "${st.sheet.typeLine}"`);
  shots.push(await canvasShot(page)); caps.push('List past 100, Monolith tier');
  st = await selectTier(118); // (a tile in the right-hand column would be under the debug panel)
  check(/Crosswind/.test(st.sheet.typeLine) && !/not active yet/.test(st.sheet.typeLine), `a built effect type has its own line, no "not active yet": "${st.sheet.typeLine}"`);
  st = await selectTier(101);
  check(st.sheet.typeLine === '', `an ordinary tier has no type line ("${st.sheet.typeLine}")`);

  // ---- 3. One tier of each layout type in flight (a page reload between them keeps the saved progress)
  const flights = [
    { tier: 103, name: 'Monolith', view: (w) => ({ rows: w.level.rows, alive: w.alive, ok: w.level.rows === 1 && w.alive === 21 }), offset: 560 },
    { tier: 106, name: 'Maze', view: (w) => ({ rows: w.level.rows, alive: w.alive, ok: !!w.level.mazePath && w.level.mazePath.length === w.level.rows && w.level.mazeWidth >= 2 }), offset: 560 },
    { tier: 109, name: 'Fortress', view: (w) => ({ rows: w.level.rows, alive: w.alive, ok: w.all.every(b => b.armor > 0 && b.maxShield > 0) }), offset: 560 },
    { tier: 112, name: 'Drift', view: (w) => ({ rows: w.level.rows, alive: w.alive, ok: w.rowShift.some(v => v > 1) && w.level.drift.variant === 'same' }), offset: 560 },
  ];
  for (let i = 0; i < flights.length; i++) {
    const f = flights[i];
    if (i > 0) { await page.reload(); await page.waitForFunction(() => !!window.__mgbm); await page.waitForTimeout(300); }
    await openMap();
    // God mode (the debug panel's box): the wall is moved over the ship below, and a crash would end the run before the shot.
    await lib.waitFor(() => page.evaluate(() => !!document.getElementById('dbg-god')), { timeout: 8000 }); // the cheat panel is loaded lazily
    await page.evaluate(() => { const g = document.getElementById('dbg-god'); g.checked = true; g.dispatchEvent(new Event('change')); });
    await seed(page, range(1, 100), range(1, f.tier - 1)); // strict order: everything before the tier is passed
    await reopenMap();
    await selectTier(f.tier);
    await tap(page, ...START, { pause: 300 });
    await waitScreen(page, 'wall');
    // The ship waits at the bottom (the pointer there) and the wall's lowest rows hang above it; nothing is fired. The ship goes down FIRST: with the
    // wall already moved down the ship (parked at the top by the tap that pressed START) would be past its end and the run would be passed.
    const bottom = await lib.gameToClient(page, 270, 880);
    await page.mouse.move(bottom.x, bottom.y);
    check(await lib.waitFor(() => page.evaluate(() => !!window.__mgbm.wall && window.__mgbm.wall.shipY > 800), { timeout: 4000 }), `${f.name}: the ship is at the bottom of the screen`);
    await page.evaluate((offset) => { const w = window.__mgbm.wall; w.autoFire = false; w.setWallOffset(offset); }, f.offset);
    if (f.name === 'Drift') await lib.waitFor(() => page.evaluate(() => window.__mgbm.wall.rowShift.some(v => v > 1)), { timeout: 5000 });
    const v = await page.evaluate(`(${f.view.toString()})(window.__mgbm.wall)`);
    check(v.ok, `${f.name} (tier ${f.tier}) in flight: ${JSON.stringify(v)}`);
    check((await page.evaluate(() => window.__mgbm.wall.state)) === 'playing', `${f.name}: the run is still on for the picture`);
    await page.evaluate(() => { window.__mgbm.timeScale = 0.0001; });
    await page.waitForTimeout(250);
    shots.push(await canvasShot(page)); caps.push(`${f.name}, tier ${f.tier}`);
  }

  await montage(page, shots, caps, path.join(OUT, 'sheet_27a.png'));
  await browser.close();
  const c = lib.counts();
  process.stdout.write(`${c.failures ? 'FAIL' : 'DONE'} ${c.passes} passed, ${c.failures} failed\n`);
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { process.stdout.write(`FAIL  ${e.stack}\n`); process.exit(1); });

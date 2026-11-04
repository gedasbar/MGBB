// Chunk 31b end-to-end test (the Shipyard screen): the locked entry in the hub's Ships tab, the debug cheats that open it, building a small ship from chunks by tapping
// (slot -> palette -> tile -> tile again), the live status (an error, then VALID), undo / redo, designs, renaming, "Use this ship", flying the custom ship in Free Fly, and
// the debug Cell mode (cycling cells, the export text, the fly test). Needs the Vite dev server. Run: node e2e/shipyard.e2e.cjs   (adds ?debug=1 itself)
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, tap, waitFor } = lib;

const SHIP_BTN = [28, 26];
const st = (page) => page.evaluate(() => window.__mgbm.state());
const onScreen = (page, name) => waitFor(() => page.evaluate((n) => window.__mgbm.screen === n, name), { timeout: 6000 });
const click = (page, id) => page.evaluate((i) => document.getElementById(i).click(), id);
const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];

async function openHubShips(page) {
  for (let i = 0; i < 4 && !(await page.evaluate(() => window.__mgbm.buildScreen && window.__mgbm.buildScreen.hubTab === 'ships')); i++) {
    await tap(page, ...SHIP_BTN, { pause: 150 });
    await waitFor(() => page.evaluate(() => window.__mgbm.buildScreen.hubTab === 'ships'), { timeout: 1200 });
  }
}
const tapButton = async (page, id) => { const r = await page.evaluate((i) => window.__mgbm.buttonRect(i), id); await tap(page, ...center(r), { pause: 150 }); };
const entryOf = (page) => page.evaluate(() => window.__mgbm.buildScreen.hullPicker.entryView());

/** Puts a chunk in a grid slot by tapping: the slot, the tile (selects), the tile again (places). */
async function place(page, slot, chunk) {
  await tap(page, ...center(await page.evaluate((i) => window.__mgbm.slotRect(i), slot)), { pause: 150 });
  check(await waitFor(async () => (await st(page)).paletteOpen && (await st(page)).selectedSlot === slot, { timeout: 2000 }), `tapping slot ${slot} opens the palette for it`);
  await page.evaluate((c) => window.__mgbm.shipyard.palette.reveal(c), chunk);
  let placed = false;
  for (let i = 0; i < 4 && !placed; i++) {
    const r = await page.evaluate((c) => window.__mgbm.tileRect(c), chunk);
    await tap(page, ...center(r), { pause: 150 });
    placed = await waitFor(async () => (await st(page)).design.slots[slot] === chunk, { timeout: 700 });
  }
  check(placed, `${chunk} placed in slot ${slot} by tapping its tile twice`);
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: true });

  // ---- the locked entry
  await openHubShips(page);
  let entry = await entryOf(page);
  check(!entry.open && /ring 150/.test(entry.text), `before ring 150 the Shipyard entry is locked: "${entry.text}"`);
  await tap(page, ...center(entry.rect), { pause: 200 });
  check(await waitFor(async () => /ring 150/.test((await st(page)).toast || ''), { timeout: 2000 }), 'tapping the locked entry says when it opens');
  check(await page.evaluate(() => window.__mgbm.screen === 'build'), 'and stays in the builder');
  await page.keyboard.press('Escape');

  // ---- open it with the debug cheats (ring 300 everywhere, Cores, one of every chunk), then through the hub
  await click(page, 'dbg-fr-reach-all');
  await click(page, 'dbg-cores-1000');
  await click(page, 'dbg-own-chunks');
  await openHubShips(page);
  entry = await entryOf(page);
  check(entry.open && entry.cores >= 1000, `after ring 150 the entry is open and shows the Cores (${entry.cores})`);
  await tap(page, ...center(entry.rect), { pause: 250 });
  check(await onScreen(page, 'shipyard'), 'tapping the entry opens the Shipyard screen');

  // ---- build a small ship: Front Gun, Corridor, Generator in the second column (slots 5, 9, 13)
  let s = await st(page);
  check(/Generator/.test(s.status) && !s.canUse, `an empty design says what it needs: "${s.status}"`);
  await place(page, 5, 'front_gun');
  await place(page, 9, 'corridor');
  s = await st(page);
  check(/Generator/.test(s.status) && !s.canUse, `still no generator: "${s.status}", Use is not allowed`);
  await tapButton(page, 'use');
  check(await waitFor(async () => /Generator/.test((await st(page)).toast || ''), { timeout: 2000 }) && (await page.evaluate(() => window.__mgbm.screen)) === 'shipyard', 'tapping the greyed Use button says why and stays');
  await place(page, 13, 'generator');
  s = await st(page);
  check(s.status === 'VALID' && s.canUse, `the finished design reads VALID (${s.status})`);
  check(/cells/.test(s.stats) && /ejector/.test(s.stats), `and shows its stats: "${s.stats}"`);

  // ---- undo / redo
  await tapButton(page, 'undo');
  check(await waitFor(async () => (await st(page)).design.slots[13] === null, { timeout: 2000 }), 'Undo takes the generator out again');
  await tapButton(page, 'redo');
  check(await waitFor(async () => (await st(page)).design.slots[13] === 'generator', { timeout: 2000 }), 'Redo puts it back');

  // ---- a placed chunk is removed from the palette (the Remove tile), and Undo brings it back
  await tap(page, ...center(await page.evaluate(() => window.__mgbm.slotRect(9))), { pause: 150 });
  await page.evaluate(() => window.__mgbm.shipyard.palette.reveal('__remove'));
  for (let i = 0; i < 4 && (await st(page)).design.slots[9] !== null; i++) {
    await tap(page, ...center(await page.evaluate(() => window.__mgbm.tileRect('__remove'))), { pause: 150 });
    await waitFor(async () => (await st(page)).design.slots[9] === null, { timeout: 700 });
  }
  check((await st(page)).design.slots[9] === null, 'the Remove tile takes the Corridor out of its slot');
  await tapButton(page, 'undo');
  check(await waitFor(async () => (await st(page)).design.slots[9] === 'corridor' && (await st(page)).canUse, { timeout: 2000 }), 'Undo brings it back and the ship is VALID again');

  // ---- designs and the name
  await tapButton(page, 'design2');
  check(await waitFor(async () => (await st(page)).slot === 1 && (await st(page)).design.slots.every(x => x === null), { timeout: 2000 }), 'design 2 is a separate, empty design');
  await tapButton(page, 'design1');
  check(await waitFor(async () => (await st(page)).slot === 0 && (await st(page)).design.slots[5] === 'front_gun', { timeout: 2000 }), 'design 1 is still there');
  await tap(page, ...center(await page.evaluate(() => window.__mgbm.nameBoxRect())), { pause: 200 });
  await page.waitForSelector('#shipyard-name', { timeout: 3000 });
  await page.fill('#shipyard-name', 'Spear');
  await click(page, 'shipyard-name-ok');
  check(await waitFor(async () => (await st(page)).name === 'Spear', { timeout: 2000 }), 'the design can be renamed');

  // ---- use it, fly it
  await tapButton(page, 'use');
  check(await onScreen(page, 'build'), 'Use this ship returns to the builder');
  check((await page.evaluate(() => window.__mgbm.state().hull)) === 'custom1', 'with the custom design as the hull');
  const sz = await page.evaluate(() => window.__mgbm.model.grid.w + 'x' + window.__mgbm.model.grid.h);
  check(/^\d+x\d+$/.test(sz) && sz !== '0x0', `the builder shows the custom hull's grid (${sz})`);
  const r = await lib.startFreeFly(page);
  check(r === 'ok', `Free Fly starts with the custom ship (${r})`);
  const t0 = (await st(page)).time;
  await waitFor(async () => (await st(page)).time > t0 + 3, { timeout: 15000 });
  s = await st(page);
  // The ship's hit radius comes from its size class: this design has 3 chunks = medium = 9 (the Shuttle the save started on is big = 10).
  const w = await page.evaluate(() => ({ hitR: window.__mgbm.world.hitR, rate: window.__mgbm.world.fireRateMul }));
  check(w.hitR === 9 && s.recipes >= 1 && w.rate > 0, `the run flies the custom ship: hit radius ${w.hitR}, ${s.recipes} gun(s), rate x${w.rate.toFixed(2)}, ${s.time.toFixed(1)} s in, alive`);

  // ---- debug cell mode (a fresh session)
  const { page: p2 } = await lib.openGame(browser, { rich: true });
  await click(p2, 'dbg-fr-reach-all');
  await openHubShips(p2);
  await tap(p2, ...center((await entryOf(p2)).rect), { pause: 250 });
  check(await onScreen(p2, 'shipyard'), 'a second session opens the Shipyard');
  await tapButton(p2, 'cellMode');
  check(await waitFor(async () => (await st(p2)).cellMode, { timeout: 2000 }), 'the Cell mode button switches the grid to single cells');
  const cellTap = async (x, y, n = 1) => {
    for (let i = 0; i < n; i++) await tap(p2, ...center(await p2.evaluate(([a, b]) => window.__mgbm.cellRect(a, b), [x, y])), { pause: 80 });
  };
  await cellTap(2, 1, 3); // ejector
  await cellTap(2, 2); await cellTap(2, 3);
  await cellTap(2, 5, 2); // generator on the bottom row
  s = await st(p2);
  check(s.status !== 'VALID' && s.status.length > 0, `an unfinished layout explains itself: "${s.status}"`);
  await cellTap(2, 4);
  s = await st(p2);
  check(s.status === 'VALID' && JSON.stringify(s.cell.rows) === JSON.stringify(['E', '_', '_', '_', 'G']), `cycling cells draws a valid hull: ${JSON.stringify(s.cell.rows)} (${s.status})`);
  await tapButton(p2, 'cellExport');
  await p2.waitForSelector('#shipyard-export-text', { timeout: 3000 });
  const text = await p2.inputValue('#shipyard-export-text');
  check(/const \w+_ROWS = \[\n  'E',\n  '_',\n  '_',\n  '_',\n  'G',\n\];/.test(text), 'Export shows ROWS text ready for hullLayouts.ts');
  await click(p2, 'shipyard-export-close');
  await tapButton(p2, 'cellFly');
  check(await waitFor(() => p2.evaluate(() => !!window.__mgbm.world && window.__mgbm.world.recipes.length === 1 && window.__mgbm.world.hitR === 8), { timeout: 8000 }), 'Fly test flies the drawn layout in Free Fly (one gun, small hit radius)');

  await browser.close();
  const c = lib.counts();
  process.stdout.write(`\n${c.passes} passed, ${c.failures} failed\n`);
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { process.stdout.write(`FAIL  script error: ${e.stack || e}\n`); process.exit(1); });

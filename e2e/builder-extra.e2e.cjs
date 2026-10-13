// Second builder end-to-end script: ledger tooltip, hull picker, multi-stream flight, picker details.
// Same rules as builder.e2e.cjs: real pointer events, positions computed here. Requires `npm run dev`.
const lib = require('./lib.cjs');
const { check, tap, state, shot } = lib;

/** Select a cell and tap it again to open its picker. */
async function openPicker(page, at) {
  await tap(page, ...at);
  if (!(await state(page)).pickerOpen) await tap(page, ...at); // the cell may already have been selected
}

const CELL = 48, OX = 6, OY = 204;
const cell = (col, row) => [OX + (col - 0.5) * CELL, OY + (row - 0.5) * CELL];
// Fan hull (9 x 10) fitted into the grid area (y 116..820): cell 528/9, grid origin (6, 116 + (704 - 10*cell)/2).
const FAN_CELL = 528 / 9;
const FAN_OY = 116 + (704 - 10 * FAN_CELL) / 2;
const fanCell = (col, row) => [6 + (col - 0.5) * FAN_CELL, FAN_OY + (row - 0.5) * FAN_CELL];
const TB = { clearAll: 486, y: 880 };
const SHIP = [28, 28];
const FLY = [468, 789];
const tileCentre = (col, contentY) => [8 + col * 133 + 62.5, 514 + contentY + 52];
const TILE = { turn_l: [0, 34], turn_r: [1, 34], splitter_3: [3, 34], flat_plus: [0, 284], piercing: [0, 534] };

const redish = (p) => p[0] > 190 && p[1] < 130 && p[2] < 130;

async function lineAt(page, [cx, cy], axis) {
  const pts = await Promise.all([-12, 0, 12].map(o => lib.gameToClient(page, axis === 'V' ? cx : cx + o, axis === 'V' ? cy + o : cy)));
  return (await lib.pixelsAtClient(page, pts)).some(redish);
}

async function place(page, at, tileKey) {
  await openPicker(page, at);
  const [c, y] = TILE[tileKey];
  await tap(page, ...tileCentre(c, y));
  await tap(page, ...tileCentre(c, y));
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser);

  // ------------------------------------------------------------------ ledger: hover
  await page.mouse.move(...Object.values(await lib.gameToClient(page, ...cell(9, 6))));
  await page.waitForTimeout(1300);
  let st = await state(page);
  check(!!st.ledger && /Damage 2\b/.test(st.ledger) && /Modifiers: none/.test(st.ledger), `hover over Flat+ shows the packet after it: ${JSON.stringify(st.ledger)}`);
  await shot(page, 'b30_ledger_hover.png');
  await page.mouse.move(...Object.values(await lib.gameToClient(page, ...cell(9, 8))));
  await page.waitForTimeout(1300);
  st = await state(page);
  check(!!st.ledger && /Damage 1\n/.test(st.ledger.replace(/\r/g, '')), `hover before Flat+ shows damage 1: ${JSON.stringify(st.ledger)}`);
  await page.mouse.move(...Object.values(await lib.gameToClient(page, ...cell(4, 5))));
  await page.waitForTimeout(1300);
  check((await state(page)).ledger === null, 'hover over a cell with no signal shows no ledger');
  await page.mouse.move(...Object.values(await lib.gameToClient(page, ...cell(9, 6))));
  await page.waitForTimeout(1300);
  await page.mouse.move(...Object.values(await lib.gameToClient(page, 270, 8)));
  await page.waitForTimeout(150);
  check((await state(page)).ledger === null, 'the tooltip hides when the pointer leaves the grid');

  // ------------------------------------------------------------------ ledger: long press
  const lp = await lib.gameToClient(page, ...cell(9, 3));
  await page.mouse.move(lp.x, lp.y);
  await page.mouse.down();
  await page.waitForTimeout(800);
  st = await state(page);
  check(!!st.ledger && /Damage 2\b/.test(st.ledger), `long press on (9,3) shows the ledger: ${JSON.stringify(st.ledger)}`);
  await page.mouse.up();
  await lib.park(page);
  await page.waitForTimeout(150);
  st = await state(page);
  check(st.ledger === null, 'releasing hides the ledger');
  check(st.selected === null, 'a long press does not select the cell');

  // ------------------------------------------------------------------ picker details on an occupied cell
  await openPicker(page, cell(9, 6));
  const pk = await page.evaluate(() => { const p = window.__mgbm.buildScreen.picker; return { open: p.isOpen, first: p.tiles[0].id, selected: p.selected }; });
  check(pk.open && pk.first === '__remove' && pk.selected === 'flat_plus', `occupied cell: Remove tile first, current block highlighted (${JSON.stringify(pk)})`);
  await shot(page, 'b31_picker_occupied_cell.png');
  await tap(page, ...tileCentre(0, 34)); // the Remove tile is the first tile (its section header is 26 px tall)
  st = await state(page);
  check(/Remove/.test(st.inspector.title), `tapping the Remove tile explains it: "${st.inspector.title}: ${st.inspector.body}"`);
  check(st.statsStrip[0].startsWith('1') && /−1\b/.test(st.statsStrip[0]), `preview shows the delta against the current circuit: ${JSON.stringify(st.statsStrip[0])}`);
  await shot(page, 'b32_preview_remove_delta.png');
  // Closing without changes: the X button.
  const beforeClose = await page.evaluate(() => JSON.stringify(window.__mgbm.model.grid.cells.filter(c => c.blockId)));
  await tap(page, 516, 492);
  st = await state(page);
  check(!st.pickerOpen && (await page.evaluate(() => JSON.stringify(window.__mgbm.model.grid.cells.filter(c => c.blockId)))) === beforeClose, 'the X button closes the sheet without changes');
  check(st.view.scale === CELL && st.view.ox === OX && st.view.oy === OY, 'closing restores the view');
  // Closing without changes: tap on the dimmed area.
  await openPicker(page, cell(3, 5));
  check((await state(page)).pickerOpen, 'picker opened again');
  await tap(page, 270, 250);
  check(!(await state(page)).pickerOpen, 'tapping the dimmed area closes the sheet');
  check((await page.evaluate(() => JSON.stringify(window.__mgbm.model.grid.cells.filter(c => c.blockId)))) === beforeClose, 'nothing changed');

  // Remove through the picker returns the block to the inventory.
  await openPicker(page, cell(9, 6));
  await tap(page, ...tileCentre(0, 34));
  await tap(page, ...tileCentre(0, 34));
  st = await state(page);
  const inv = await page.evaluate(() => ({ placed: window.__mgbm.model.placedCount('flat_plus'), avail: window.__mgbm.model.available('flat_plus'), owned: window.__mgbm.model.owned.flat_plus }));
  check(!st.pickerOpen && st.stats.damagePerShot === 1 && inv.placed === 0 && inv.avail === inv.owned, `Remove tile removes the block and returns it: ${JSON.stringify(inv)}`);

  // Live preview delta on the line.
  await openPicker(page, cell(9, 6));
  await tap(page, ...tileCentre(...TILE.flat_plus));
  st = await state(page);
  check(st.statsStrip[0] === '2 +1' && st.statsStrip[3] === '10 +5', `preview of Flat+ shows the new numbers with deltas: ${JSON.stringify(st.statsStrip)}`);
  await shot(page, 'b33_preview_flat_plus_delta.png');
  await tap(page, 516, 492);

  // ------------------------------------------------------------------ hull picker + multi-stream flight on the Fan hull
  await tap(page, ...SHIP);
  check((await state(page)).hullPanelOpen, 'ship button opens the hull picker');
  await shot(page, 'b34_hull_panel.png');
  await tap(page, 270, 492);
  st = await state(page);
  check(st.hull === 'fan' && !st.hullPanelOpen, `choosing Fan switches the hull: ${st.hull}`);
  check(Math.abs(st.view.scale - FAN_CELL) < 0.01 && Math.abs(st.view.oy - FAN_OY) < 0.01, `Fan hull is fitted to the screen (cell ${st.view.scale.toFixed(2)})`);
  await shot(page, 'b35_fan_hull_empty.png');

  // ------------------------------------------------------------------ crossing: the line hops over the other one
  await tap(page, 486, 880); // clear all
  await place(page, fanCell(5, 8), 'splitter_3');
  await place(page, fanCell(2, 8), 'turn_r');
  await place(page, fanCell(2, 5), 'turn_r');
  await place(page, fanCell(8, 5), 'turn_l');
  st = await state(page);
  check(st.stats.projectilesPerPulse === 2, `crossing circuit reaches two ejectors: ${st.stats.projectilesPerPulse}`);
  await shot(page, 'b38_crossing_hop.png');
  const [cx, cy] = fanCell(5, 5);
  const sc = FAN_CELL / 64; // content units -> game px
  const samples = async (pts) => lib.pixelsAtClient(page, await Promise.all(pts.map(([x, y]) => lib.gameToClient(page, x, y))));
  const vertical = await samples([-14, -7, 0, 7, 14].map(o => [cx, cy + o]));
  check(vertical.filter(redish).length >= 2, 'the vertical line runs straight through the crossing cell');
  const apex = await samples([[cx - 1, cy - 11 * sc], [cx, cy - 11 * sc], [cx + 1, cy - 11 * sc]]);
  check(apex.some(redish), 'the horizontal line hops over it (arc above the crossing)');
  const gap = await samples([[cx + 6.5, cy], [cx - 6.5, cy]]);
  check(!gap.some(px => px[0] > 200), `the horizontal line has a gap under the hop (no red or dash pixels there): ${JSON.stringify(gap)}`);
  const beyond = await samples([20, 24, 28, 32].flatMap(o => [[cx + o, cy], [cx - o, cy]]));
  check(beyond.filter(redish).length >= 3, 'the horizontal line continues on both sides of the crossing');
  await tap(page, 486, 880); // clear all, then build the three-branch circuit

  await place(page, fanCell(5, 6), 'splitter_3');
  await place(page, fanCell(2, 6), 'turn_r');
  await place(page, fanCell(8, 6), 'turn_l');
  st = await state(page);
  check(st.stats.projectilesPerPulse === 3 && st.recipes === 3, `Splitter 3 with two turns reaches all three ejectors: ${st.stats.projectilesPerPulse} projectiles per pulse`);
  check(st.statsStrip[1] === '3', `stats strip shows 3 projectiles per pulse: ${JSON.stringify(st.statsStrip)}`);
  await shot(page, 'b36_fan_three_branches.png');
  const branches = [
    [fanCell(5, 9), 'V'], [fanCell(5, 4), 'V'], [fanCell(5, 2), 'V'], // generator -> splitter -> forward branch
    [fanCell(3, 6), 'H'], [fanCell(4, 6), 'H'], [fanCell(2, 4), 'V'], [fanCell(2, 2), 'V'], // left branch
    [fanCell(6, 6), 'H'], [fanCell(7, 6), 'H'], [fanCell(8, 4), 'V'], [fanCell(8, 2), 'V'], // right branch
  ];
  const missing = [];
  for (const [pt, axis] of branches) if (!(await lineAt(page, pt, axis))) missing.push(pt.map(Math.round).join(','));
  check(missing.length === 0, `red line pixels along all three branches${missing.length ? ' - missing at ' + missing.join(' ') : ''}`);

  const expected = st.stats;
  await tap(page, ...FLY);
  await page.mouse.move(...Object.values(await lib.gameToClient(page, 270, 800)));
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const w = window.__mgbm.world;
    w.autoSpawn = false;
    window.__pulses = [];
    const f = w.fire.bind(w);
    w.fire = () => { const before = w.pool.count; f(); window.__pulses.push(w.pool.count - before); };
  });
  await page.waitForTimeout(1600);
  const pulses = await page.evaluate(() => window.__pulses);
  check(pulses.length >= 5 && pulses.every(n => n === expected.projectilesPerPulse), `every one of ${pulses.length} pulses fired ${expected.projectilesPerPulse} projectiles: ${JSON.stringify(pulses)}`);
  const rate = pulses.length / 1.6;
  check(Math.abs(rate - expected.pulsesPerSecond) < 1.2, `pulse rate ${rate.toFixed(1)}/s matches the strip (${expected.pulsesPerSecond}/s)`);
  await shot(page, 'b37_fan_flying.png');

  await browser.close();
  const { passes, failures } = lib.counts();
  process.stdout.write(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'}  (${passes} passed, ${failures} failed)\n`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });

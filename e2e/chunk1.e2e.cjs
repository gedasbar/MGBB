// Chunk 1 end-to-end test: re-tap to open the picker, re-tap to place, badges/marks gone, "blocked" cell gone.
// Real pointer events on the real canvas; positions are computed here from the documented layout
// (540x960, fit view: cell 48 px, grid origin (6,204)). Requires the Vite dev server: `npm run dev`.
// Run: node e2e/chunk1.e2e.cjs
const fs = require('fs');
const path = require('path');
const lib = require('./lib.cjs');
const { check, tap, drag, wheel, state, shot, isRedLine } = lib;

const CELL = 48, OX = 6, OY = 204;
const cell = (col, row) => [OX + (col - 0.5) * CELL, OY + (row - 0.5) * CELL];
const TB = { rotCW: 378, clearAll: 486, y: 880 };
const CLOSE_X = [270, 250]; // the X button is gone: a tap on the dimmed circuit area closes the sheet
// Picker tiles (see builder.e2e.cjs for the layout): tileCentre(column, row) in the single category-ordered list.
const tileCentre = (col, row) => [8 + col * 106 + 49, 470 + 8 + row * 96 + 44];
const TILE = { turn_l: [0, 0], turn_r: [1, 0], splitter_2: [2, 0], flat_plus: [2, 1], percent_mult: [3, 1] };
const REMOVE_TILE = tileCentre(0, 0); // first tile on an occupied cell

const redish = (p) => p[0] > 190 && p[1] < 130 && p[2] < 130;
const redishDimmed = (p) => p[0] > 140 && p[1] < 100 && p[2] < 100 && p[0] > 2 * p[1];

const blocks = (page) => page.evaluate(() => window.__mgbm.model.grid.cells.filter(c => c.blockId).map(c => `${c.x + 1},${c.y + 1}:${c.blockId}:${c.rotation}`));
const picker = (page) => page.evaluate(() => { const p = window.__mgbm.buildScreen.picker; return { open: p.isOpen, selected: p.selected, armed: p.armed, scroll: p.scrollY }; });
const undoDepth = (page) => page.evaluate(() => { const m = window.__mgbm.model; const s = m.slots[m.active]; return s.undo.length; });
const opens = (page) => page.evaluate(() => window.__opens);

async function lineAt(page, col, row, axis, ok = redish) {
  const [cx, cy] = cell(col, row);
  const pts = await Promise.all([-14, 0, 14].map(o => lib.gameToClient(page, axis === 'V' ? cx : cx + o, axis === 'V' ? cy + o : cy)));
  return (await lib.pixelsAtClient(page, pts)).some(ok);
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page, context } = await lib.openGame(browser);

  // Count every call of openPicker so "nothing may open twice" is observable.
  await page.evaluate(() => {
    const bs = window.__mgbm.buildScreen;
    window.__opens = 0;
    const o = bs.openPicker.bind(bs);
    bs.openPicker = (t) => { window.__opens++; return o(t); };
  });
  await tap(page, TB.clearAll, TB.y); // empty Shuttle; nothing selected

  // ================================================================== 1. Re-tap a cell to open the picker
  await tap(page, ...cell(3, 5));
  let st = await state(page);
  check(JSON.stringify(st.selected) === '{"x":2,"y":4}' && !st.pickerOpen && st.inspector.title === 'Empty cell',
    `1: single tap on an empty cell selects it, picker stays closed ("${st.inspector.title}")`);
  await shot(page, 'c1_01_cell_selected.png');
  await tap(page, ...cell(3, 5));
  st = await state(page);
  check(st.pickerOpen && (await opens(page)) === 1, `1: second tap on the selected cell opens the picker exactly once (opens=${await opens(page)})`);
  await shot(page, 'c1_02_picker_opened_by_retap.png');
  await tap(page, ...CLOSE_X);
  check(!(await state(page)).pickerOpen && (await opens(page)) === 1, '1: the close button closes it; still one open');

  // A fast double tap (two presses within a few ms) still works and opens once.
  const p4 = await lib.gameToClient(page, ...cell(4, 5));
  await page.mouse.move(p4.x, p4.y);
  await page.mouse.click(p4.x, p4.y, { clickCount: 2 });
  await lib.park(page);
  await page.waitForTimeout(250);
  st = await state(page);
  check(st.pickerOpen && (await opens(page)) === 2, `1: a fast double tap on a fresh cell selects then opens, once (opens=${await opens(page)})`);
  await tap(page, ...CLOSE_X);

  // Selecting a different cell clears the "already selected" state of the old one.
  await tap(page, ...cell(3, 5)); // (4,5) was selected -> this selects (3,5), no open
  const before = await opens(page);
  await tap(page, ...cell(6, 6)); // different cell: selects it
  await tap(page, ...cell(3, 5)); // (3,5) was deselected in between, so this only selects it again
  st = await state(page);
  check(!st.pickerOpen && (await opens(page)) === before && JSON.stringify(st.selected) === '{"x":2,"y":4}',
    `1: tapping A, B, A opens nothing (A's selected state was cleared by B), selected=${JSON.stringify(st.selected)}`);

  // Generator, ejector and void: selecting (or not) only, the picker never opens.
  for (const [name, col, row, title] of [['generator', 6, 11, 'Generator'], ['ejector', 9, 2, 'Ejector']]) {
    await tap(page, ...cell(col, row));
    await tap(page, ...cell(col, row));
    await tap(page, ...cell(col, row));
    st = await state(page);
    check(!st.pickerOpen && st.inspector.title === title && st.selected && st.selected.x === col - 1,
      `1: three taps on the ${name} only select it ("${st.inspector.title}"), picker never opens`);
  }
  await tap(page, ...cell(6, 1));
  await tap(page, ...cell(6, 1));
  st = await state(page);
  check(!st.pickerOpen && st.selected === null, `1: void cell (6,1) is not selectable and never opens a picker (selected=${JSON.stringify(st.selected)})`);
  check((await opens(page)) === before, '1: the picker was opened only by the buildable-cell re-taps');

  // Drag, pan and wheel zoom are never taps: even starting on the selected cell.
  await tap(page, ...cell(3, 5)); // select (3,5)
  const sel0 = (await state(page)).selected;
  await drag(page, ...cell(3, 5), cell(3, 5)[0] + 70, cell(3, 5)[1] + 30);
  st = await state(page);
  check(!st.pickerOpen && JSON.stringify(st.selected) === JSON.stringify(sel0) && st.view.ox !== OX, `1: dragging from the selected cell pans the view and opens nothing (ox=${st.view.ox.toFixed(0)})`);
  await wheel(page, 270, 500, -300);
  check(!(await state(page)).pickerOpen, '1: wheel zoom does not open the picker');
  // Two-finger pinch with real touch events through the browser's input pipeline.
  const cdp = await context.newCDPSession(page);
  const a = await lib.gameToClient(page, 220, 500);
  const b = await lib.gameToClient(page, 320, 500);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) });
  const scaleBefore = (await state(page)).view.scale;
  await touch('touchStart', [a, b]);
  for (let i = 1; i <= 6; i++) await touch('touchMove', [{ x: a.x - i * 8, y: a.y }, { x: b.x + i * 8, y: b.y }]);
  await touch('touchEnd', []);
  await page.waitForTimeout(250);
  st = await state(page);
  check(!st.pickerOpen && st.view.scale > scaleBefore * 1.1, `1: a two-finger pinch zooms (scale ${scaleBefore.toFixed(1)} -> ${st.view.scale.toFixed(1)}) and does not count as a tap (pickerOpen=${st.pickerOpen})`);
  await tap(page, 28, 144); // Fit

  // ================================================================== 2. Re-tap a tile to place it (whole flow)
  await tap(page, ...cell(6, 9));
  await tap(page, ...cell(6, 9));
  check((await state(page)).pickerOpen, '2: tap, tap on (6,9) opens the picker');
  await tap(page, ...tileCentre(...TILE.turn_r));
  st = await state(page);
  const pk1 = await picker(page);
  check(st.pickerOpen && (await blocks(page)).length === 0 && pk1.armed === 'turn_r' && st.inspector.title.startsWith('Turn Right'),
    `2: first tap on a tile previews it and places nothing ("${st.inspector.title}", blocks=${(await blocks(page)).length})`);
  const v = st.view;
  const pcell = (col, row) => [v.ox + (col - 0.5) * v.scale, v.oy + (row - 0.5) * v.scale];
  const dimmedLine = async (col, row, axis) => {
    const [cx, cy] = pcell(col, row);
    const pts = await Promise.all([-14, 0, 14].map(o => lib.gameToClient(page, axis === 'V' ? cx : cx + o, axis === 'V' ? cy + o : cy)));
    return (await lib.pixelsAtClient(page, pts)).some(redishDimmed);
  };
  check((await dimmedLine(7, 9, 'H')) && (await dimmedLine(8, 9, 'H')), '2: the preview already re-routes the line east along row 9');
  await shot(page, 'c1_03_tile_previewed.png');
  await tap(page, ...tileCentre(...TILE.turn_r));
  st = await state(page);
  check(!st.pickerOpen && JSON.stringify(await blocks(page)) === JSON.stringify(['6,9:turn_r:0:false']), `2: second tap on the same tile places Turn Right (auto) and closes the sheet: ${JSON.stringify(await blocks(page))}`);
  const route = [[6, 10, 'V'], [7, 9, 'H'], [8, 9, 'H']];
  const missing = [];
  for (const [c, r, ax] of route) if (!(await lineAt(page, c, r, ax))) missing.push(`(${c},${r})`);
  check(missing.length === 0 && !(await lineAt(page, 6, 8, 'V')), `2: after placing, the red line runs up col 6 and turns east along row 9; nothing continues up col 6${missing.length ? ' - MISSING ' + missing : ''}`);
  await shot(page, 'c1_04_turn_right_placed.png');

  // Another tile first: tile A then tile B previews B only; A again previews A only.
  await tap(page, ...cell(6, 9)); // (6,9) is still selected -> this opens the picker
  check((await state(page)).pickerOpen, '2: the placed cell stays selected, so one more tap opens its picker');
  const nBefore = (await blocks(page)).length;
  const depth0 = await undoDepth(page);
  // With 32 tiles the Damage section is below the fold of the sheet: reveal each tile with the picker's own scroll, then tap its real rectangle.
  for (const id of ['flat_plus', 'percent_mult']) {
    await page.evaluate((id) => window.__mgbm.buildScreen.picker.reveal(id), id);
    const r = await page.evaluate((id) => window.__mgbm.buildScreen.picker.tileScreenRect(id), id);
    await tap(page, r.x + r.w / 2, r.y + r.h / 2);
  }
  await page.evaluate(() => window.__mgbm.buildScreen.picker.scrollBy(-10000)); // back to the top for the fixed Remove-tile position
  const pk2 = await picker(page);
  check(pk2.open && pk2.armed === 'percent_mult' && (await blocks(page)).length === nBefore, `2: tapping a different tile moves the selection and places nothing (armed=${pk2.armed})`);
  // Remove tile: first tap previews, second removes.
  await tap(page, ...REMOVE_TILE);
  st = await state(page);
  check(st.pickerOpen && (await blocks(page)).length === 1 && /Remove/.test(st.inspector.title), `2: first tap on Remove previews the removal, the block is still there ("${st.inspector.title}")`);
  await tap(page, ...REMOVE_TILE);
  check(!(await state(page)).pickerOpen && (await blocks(page)).length === 0, '2: second tap on Remove removes the block and closes the sheet');
  // Re-placing the same block id: the second tap just closes, no undo entry.
  await tap(page, ...cell(6, 9)); // selected after the remove -> opens
  await tap(page, ...tileCentre(...TILE.turn_r));
  await tap(page, ...tileCentre(...TILE.turn_r));
  check((await blocks(page)).length === 1, '2: Turn Right placed again at (6,9)');
  await tap(page, ...cell(6, 9)); // open on the occupied cell
  const depth1 = await undoDepth(page);
  const same = await page.evaluate(() => { const r = window.__mgbm.buildScreen.picker.tileScreenRect('turn_r'); return [r.x + r.w / 2, r.y + r.h / 2]; });
  await tap(page, ...same);
  await tap(page, ...same);
  check(!(await state(page)).pickerOpen && JSON.stringify(await blocks(page)) === JSON.stringify(['6,9:turn_r:0:false']) && (await undoDepth(page)) === depth1,
    `2: on the block already in the cell, the second tap only closes the sheet: same block, undo depth ${depth1} -> ${await undoDepth(page)}`);
  void depth0;

  // Scrolling or dragging the tile list never selects or places.
  await tap(page, ...cell(6, 9));
  check((await state(page)).pickerOpen, '2: picker open again for the scroll test');
  const nb = JSON.stringify(await blocks(page));
  await drag(page, ...tileCentre(1, 2), tileCentre(1, 2)[0], 560);
  let pk = await picker(page);
  check(pk.open && pk.scroll > 40 && pk.armed === null && JSON.stringify(await blocks(page)) === nb, `2: dragging the list from a tile scrolls it (scrollY ${pk.scroll.toFixed(0)}) and selects/places nothing (armed=${pk.armed})`);
  await shot(page, 'c1_05_list_scrolled.png');
  // Armed tile + drag starting on it: still not placed.
  await wheel(page, 270, 700, -3000);
  const [tx, ty] = await page.evaluate(() => { const r = window.__mgbm.buildScreen.picker.tileScreenRect('splitter_2'); return [r.x + r.w / 2, r.y + r.h / 2]; });
  await tap(page, tx, ty);
  check((await picker(page)).armed === 'splitter_2', '2: Splitter 2 tile is armed');
  await drag(page, tx, ty, tx, ty - 60);
  pk = await picker(page);
  check(pk.open && JSON.stringify(await blocks(page)) === nb, `2: dragging from the armed tile does not place it (blocks unchanged, picker open)`);
  // Closing paths.
  await tap(page, 270, 250); // dimmed area
  check(!(await state(page)).pickerOpen && JSON.stringify(await blocks(page)) === nb, '2: tapping the dimmed area closes the sheet without changes');
  await tap(page, ...cell(6, 9));
  await tap(page, ...CLOSE_X);
  check(!(await state(page)).pickerOpen && JSON.stringify(await blocks(page)) === nb, '2: the close button closes the sheet without changes');

  // ================================================================== 3. Badges and marks are gone
  // Build a circuit: Turn Right (6,9), Turn Left (9,9), Flat+ (9,6) on the line, Flat+ (3,5) off the line.
  async function place(col, row, key) {
    await tap(page, ...cell(col, row));
    if (!(await state(page)).pickerOpen) await tap(page, ...cell(col, row));
    await tap(page, ...tileCentre(...TILE[key]));
    await tap(page, ...tileCentre(...TILE[key]));
  }
  await place(9, 9, 'turn_l');
  await place(9, 6, 'flat_plus');
  await place(3, 5, 'flat_plus');
  st = await state(page);
  check(st.recipes === 1 && st.stats.damagePerShot === 2, `3: built circuit reaches the ejector with ${st.stats.damagePerShot} damage`);
  check(!(await state(page)).pickerOpen && JSON.stringify((await state(page)).selected) === '{"x":2,"y":4}', '3: the off-line block is selected and the picker is closed');
  await lib.park(page);
  await page.waitForTimeout(150);
  const png = await page.screenshot();
  await shot(page, 'c1_06_built_circuit_no_marks.png');
  // Scan every cell of the grid for the three old marks.
  const found = { badge: [], lock: [], nosignal: [] };
  const regions = [];
  for (let col = 1; col <= 11; col++) for (let row = 1; row <= 11; row++) {
    const x0 = OX + (col - 1) * CELL, y0 = OY + (row - 1) * CELL;
    regions.push({ x0: x0 + 35, y0: y0 + 5, x1: x0 + 44, y1: y0 + 14, pred: lib.AUTO_BADGE_PRED, k: 'badge', cell: `(${col},${row})` });
    regions.push({ x0: x0 + 35, y0: y0 + 6, x1: x0 + 44, y1: y0 + 15, pred: lib.PADLOCK_PRED, k: 'lock', cell: `(${col},${row})` });
    regions.push({ x0: x0 + 2, y0: y0 + 32, x1: x0 + 16, y1: y0 + 46, pred: lib.NO_SIGNAL_PRED, k: 'nosignal', cell: `(${col},${row})` });
  }
  const counts = await lib.scanImage(page, png, regions);
  regions.forEach((rg, i) => { if (counts[i] > 0) found[rg.k].push(rg.cell); });
  check(found.badge.length === 0, `3: no green "A" badge pixels in any cell${found.badge.length ? ': ' + found.badge : ''}`);
  check(found.lock.length === 0, `3: no padlock pixels in any cell${found.lock.length ? ': ' + found.lock : ''}`);
  check(found.nosignal.length === 0, `3: no red "no signal" mark in any cell${found.nosignal.length ? ': ' + found.nosignal : ''}`);

  // The detectors can fail: run them on the screenshots taken before this chunk (badges, padlock and no-signal mark present).
  const beforeDir = path.join(__dirname, '..', 'reports', 'chunk1');
  const old10 = fs.readFileSync(path.join(beforeDir, 'before_b10_off_line_block.png'));
  const old11 = fs.readFileSync(path.join(beforeDir, 'before_b11_rotated_blocked.png'));
  const cx = (col) => OX + (col - 1) * CELL, cy = (row) => OY + (row - 1) * CELL;
  const oldBadge = await lib.countInImage(page, old10, cx(9) + 35, cy(6) + 5, cx(9) + 44, cy(6) + 14, lib.AUTO_BADGE_PRED);
  const oldNoSig = await lib.countInImage(page, old10, cx(3) + 2, cy(5) + 32, cx(3) + 16, cy(5) + 46, lib.NO_SIGNAL_PRED);
  const oldLock = await lib.countInImage(page, old11, cx(9) + 35, cy(6) + 6, cx(9) + 44, cy(6) + 15, lib.PADLOCK_PRED);
  check(oldBadge > 0 && oldNoSig > 0 && oldLock > 0, `3: detector self-test on the old screenshots finds the marks (badge ${oldBadge}, no-signal ${oldNoSig}, padlock ${oldLock} pixels)`);

  // Off-path block is dimmed: compare the brightest border pixel of the same block type on and off the line.
  const border = async (col, row) => {
    const px = await lib.pixelsAtClient(page, await Promise.all([-18, -17, -16].map(o => lib.gameToClient(page, cx(col) + 24 + o, cy(row) + 30))));
    return Math.max(...px.map(p => p[0]));
  };
  const onB = await border(9, 6), offB = await border(3, 5);
  check(onB > 80 && offB < onB * 0.9, `3: the off-path Flat+ is dimmed (border red channel ${offB}) against the on-path one (${onB})`);
  st = await state(page);
  check(/No signal reaches this block\./.test(st.inspector.body) && !/rientation/.test(st.inspector.title), `3: inspector keeps its text: "${st.inspector.title}" / "${st.inspector.body}"`);

  // A hand-rotated block that stops the line keeps its warning triangle (and no padlock).
  await tap(page, ...cell(9, 6));
  await tap(page, TB.rotCW, TB.y);
  st = await state(page);
  check(st.recipes === 0, `3: rotating Flat+ right stops the line; inspector "${st.inspector.title}"`);
  const warn = await lib.pixelsAtClient(page, await Promise.all([[0, 0], [-4, 3], [4, 3], [0, -3]].map(([dx, dy]) => lib.gameToClient(page, OX + 8.5 * CELL + dx, OY + 5 * CELL + 48 - 6 + dy))));
  check(!warn.some(p => p[0] > 200 && p[1] > 130 && p[1] < 190 && p[2] < 90), `3: no warning triangle on the stopping block's edge (chunk 16a): ${JSON.stringify(warn[0])}`);
  const lock2 = await lib.countInRegion(page, OX + 8 * CELL + 39, OY + 5 * CELL + 10, 4, lib.PADLOCK_PRED);
  check(lock2 === 0, `3: the rotated block has no padlock (${lock2} pixels)`);
  await shot(page, 'c1_07_rotated_blocker_warning_only.png');

  // ================================================================== 4. No blocked cell
  await tap(page, TB.clearAll, TB.y);
  await tap(page, 5, 700);
  await lib.park(page);
  await page.waitForTimeout(150);
  st = await state(page);
  const types = await page.evaluate(() => [...new Set(window.__mgbm.model.grid.cells.map(c => c.type))].sort());
  check(JSON.stringify(types) === '["ejector","empty","generator","void"]', `4: the Shuttle only has void, empty, generator and ejector cells: ${JSON.stringify(types)}`);
  const emptyLine = [];
  for (const [c, r] of [[6, 10], [6, 8], [6, 5], [6, 3], [6, 2]]) if (!(await lineAt(page, c, r, 'V'))) emptyLine.push(`(${c},${r})`);
  check(emptyLine.length === 0, `4: the empty Shuttle's line runs up column 6 to (6,2)${emptyLine.length ? ' - MISSING ' + emptyLine : ''}`);
  const capPx = await lib.countInRegion(page, OX + 5.5 * CELL, OY + 1 * CELL, 5, '([r,g,b]) => r > 200 && g < 110 && b < 110');
  const capDark = await lib.countInRegion(page, OX + 5.5 * CELL, OY + 1 * CELL, 5, '([r,g,b]) => r < 50 && g < 50 && b < 50');
  check(capPx >= 3 && capDark >= 3, `4: the line dead-ends at the void cell (6,1) with its cap (red X pixels ${capPx}, dark disc pixels ${capDark})`);
  const reason = await page.evaluate(() => window.__mgbm.model.compiled.segments.map(s => `${s.kind}:${s.reason ?? ''}`));
  check(JSON.stringify(reason) === '["live:","dead-end:void"]', `4: segments are ${JSON.stringify(reason)}`);
  check(/outside the hull/.test((await page.evaluate(() => window.__mgbm.model.compiled.warnings[0]))), '4: the dead end has a plain reason');
  await shot(page, 'c1_08_empty_shuttle_void_deadend.png');
  // Only an ejector may be a red hatched X: the old blocked cells are plain void now, the ejector is the control.
  const redHatch = '([r,g,b]) => r > 200 && g < 90 && b < 90';
  const voidReds = [];
  for (const [c, r] of [[6, 1], [3, 2], [5, 2], [7, 2]]) {
    const n = await lib.countInRegion(page, OX + (c - 0.5) * CELL, OY + (r - 0.5) * CELL - (c === 6 && r === 1 ? 6 : 0), 14, redHatch);
    if (n > 0) voidReds.push(`(${c},${r}):${n}`);
  }
  check(voidReds.length === 0, `4: the former blocked cells (6,1) (3,2) (5,2) (7,2) show no red${voidReds.length ? ': ' + voidReds : ''}`);
  const ejRed = await lib.countInRegion(page, OX + 8.5 * CELL, OY + 1.5 * CELL, 14, '([r,g,b]) => r > 200 && g > 200 && b > 200');
  check(ejRed > 20, `4: positive control: the ejector at (9,2) is the light-grey bullet (casing pixels) (${ejRed})`);

  // Old save in the browser: a legacy grid with blocked cells and blocks loads, keeps the blocks, and nothing is blocked.
  const legacy = { w: 11, h: 11, cells: [
    { x: 5, y: 0, type: 'blocked', blockId: null, level: 1, rotation: 0 },
    { x: 2, y: 1, type: 'blocked', blockId: null, level: 1, rotation: 0 },
    { x: 5, y: 8, type: 'empty', blockId: 'turn_r', level: 1, rotation: 0 },
    { x: 8, y: 8, type: 'empty', blockId: 'turn_l', level: 1, rotation: 0 },
    { x: 8, y: 5, type: 'empty', blockId: 'flat_plus', level: 1, rotation: 0 },
  ] };
  const ctx2 = await browser.newContext({ viewport: { width: 540, height: 960 } });
  const pg2 = await ctx2.newPage();
  const errors = [];
  pg2.on('pageerror', (e) => errors.push(e.message));
  await pg2.addInitScript((raw) => { if (!sessionStorage.getItem('__seeded')) { localStorage.clear(); localStorage.setItem('mgbm_grid', raw); sessionStorage.setItem('__seeded', '1'); } }, JSON.stringify(legacy));
  await pg2.goto(lib.URL);
  await pg2.waitForFunction(() => !!window.__mgbm);
  await pg2.waitForTimeout(400);
  const loaded = await pg2.evaluate(() => ({
    blocks: window.__mgbm.model.grid.cells.filter(c => c.blockId).map(c => `${c.x + 1},${c.y + 1}:${c.blockId}`).sort(),
    types: [...new Set(window.__mgbm.model.grid.cells.map(c => c.type))].sort(),
    c61: window.__mgbm.model.grid.cells[5].type,
    recipes: window.__mgbm.state().recipes,
  }));
  check(errors.length === 0 && JSON.stringify(loaded.blocks) === JSON.stringify(['6,9:turn_r', '9,6:flat_plus', '9,9:turn_l']) && loaded.c61 === 'void' && !loaded.types.includes('blocked') && loaded.recipes === 1,
    `4: an old save with blocked cells loads without errors, keeps its blocks and has (6,1) as void: ${JSON.stringify(loaded)}`);
  await ctx2.close();

  await browser.close();
  const { passes, failures } = lib.counts();
  process.stdout.write(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'}  (${passes} passed, ${failures} failed)\n`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });

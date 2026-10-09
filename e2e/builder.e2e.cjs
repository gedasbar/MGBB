// Builder end-to-end test. Real pointer events on the real canvas; positions are computed here from the
// documented layout (540x960, fit view: cell 48 px, grid origin (6,204)) and never read back from game code.
// Requires the Vite dev server: `npm run dev`.   Run: node e2e/builder.e2e.cjs
const lib = require('./lib.cjs');
const { check, tap, drag, wheel, state, shot, isRedLine } = lib;

// ---- layout constants (duplicated on purpose; if the layout changes this test must be updated) ----
const CELL = 48, OX = 6, OY = 204;
const cell = (col, row) => [OX + (col - 0.5) * CELL, OY + (row - 0.5) * CELL];
const TB = { clearCell: 54, rotCCW: 162, auto: 270, rotCW: 378, clearAll: 486, y: 880 };
const CORNER = { fit: [28, 144], undo: [76, 144], redo: [124, 144], ab: [512, 144], paste: [464, 144], copy: [416, 144] };
const FLY = [468, 789];
const STATS_STRIP = [270, 837];
// Picker sheet (y 470..960): header 44 px, list from y 514; 4 columns of 125 px tiles with 8 px gaps; each category has a
// 26 px header above its tile rows (tiles 104 px tall, rows 112 px apart): pathing tiles start 34 px into the list,
// damage tiles 172 px, modifier tiles 422 px.
const tileCentre = (col, contentY, scroll = 0) => [8 + col * 133 + 62.5, 514 + contentY + 52 - scroll];
const TILE = { turn_l: [0, 34], turn_r: [1, 34], splitter_2: [2, 34], splitter_3: [3, 34], flat_plus: [0, 172], percent_mult: [1, 172] };

const redish = (p) => p[0] > 190 && p[1] < 130 && p[2] < 130;
// The picker dims the grid by 28%, which pulls the red channel down to about 184.
const redishDimmed = (p) => p[0] > 140 && p[1] < 100 && p[2] < 100 && p[0] > 2 * p[1];

/** True when at least one of three samples along the line axis is red. */
async function lineThroughCell(page, col, row, axis) {
  const [cx, cy] = cell(col, row);
  const offs = [-14, 0, 14];
  const pts = [];
  for (const o of offs) {
    const p = await lib.gameToClient(page, axis === 'V' ? cx : cx + o, axis === 'V' ? cy + o : cy);
    pts.push(p);
  }
  const px = await lib.pixelsAtClient(page, pts);
  return px.some(redish);
}

async function expectLine(page, cells, label) {
  const bad = [];
  for (const [col, row, axis] of cells) if (!(await lineThroughCell(page, col, row, axis))) bad.push(`(${col},${row})`);
  check(bad.length === 0, `${label}: red line pixels at every expected cell centre${bad.length ? ' - MISSING at ' + bad.join(' ') : ''}`);
}

async function expectNoLine(page, cells, label) {
  const bad = [];
  for (const [col, row, axis] of cells) if (await lineThroughCell(page, col, row, axis)) bad.push(`(${col},${row})`);
  check(bad.length === 0, `${label}: no red where there should be no line${bad.length ? ' - UNEXPECTED at ' + bad.join(' ') : ''}`);
}

const gridBlocks = (page) => page.evaluate(() => window.__mgbm.model.grid.cells.filter(c => c.blockId).map(c => ({ col: c.x + 1, row: c.y + 1, id: c.blockId, rotation: c.rotation, manual: c.manual })));
const cellState = (page, col, row) => page.evaluate(([c, r]) => { const m = window.__mgbm.model; const k = m.grid.cells[(r - 1) * m.grid.w + (c - 1)]; return { id: k.blockId, rotation: k.rotation, manual: k.manual }; }, [col, row]);

const ROUTE_EMPTY = [[6, 10, 'V'], [7, 9, 'H'], [8, 9, 'H'], [9, 8, 'V'], [9, 7, 'V'], [9, 5, 'V'], [9, 4, 'V'], [9, 3, 'V']];

/** Makes (col,row) the selected cell without opening its picker (a tap on an already selected cell would open it). */
async function select(page, col, row) {
  const is = async () => { const s = (await state(page)).selected; return !!s && s.x === col - 1 && s.y === row - 1; };
  if ((await state(page)).pickerOpen) await tap(page, 516, 492);
  if (!(await is())) await tap(page, ...cell(col, row));
}

/** Select the cell, tap it again to open the picker, tap the tile to preview it, tap it again to place it. */
async function placeViaPicker(page, col, row, tileKey) {
  await tap(page, ...cell(col, row));
  if (!(await state(page)).pickerOpen) await tap(page, ...cell(col, row)); // the cell may already be selected
  const open = (await state(page)).pickerOpen;
  const [tc, tr] = TILE[tileKey];
  await tap(page, ...tileCentre(tc, tr));
  await tap(page, ...tileCentre(tc, tr));
  return open;
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { permissions: ['clipboard-read', 'clipboard-write'] });

  // ------------------------------------------------------------------ 1. Default build screen
  let st = await state(page);
  check(st.view.scale === CELL && st.view.ox === OX && st.view.oy === OY, `fit view is the documented one: ${JSON.stringify(st.view)}`);
  check(st.recipes === 1 && st.stats.damagePerShot === 101, `default circuit reaches the ejector with ${st.stats.damagePerShot} damage`);
  check(JSON.stringify(st.statsStrip) === JSON.stringify(['101', '1', '4', '404', '0']), `stats strip reads ${JSON.stringify(st.statsStrip)}`);
  check(await page.evaluate(() => !('selectedPalette' in window.__mgbm.buildScreen)), 'there is no palette on the Build screen');
  await shot(page, 'b01_default_build.png');
  await expectLine(page, ROUTE_EMPTY, 'default circuit');
  await expectNoLine(page, [[5, 9, 'H'], [4, 9, 'H'], [6, 8, 'V'], [6, 5, 'V'], [3, 6, 'V']], 'default circuit (off-route cells)');

  // Tap targets, legibility, nothing off screen.
  const ui = await page.evaluate(() => {
    const bs = window.__mgbm.buildScreen;
    const small = bs.buttons.filter(b => b.rect.w < 44 || b.rect.h < 44).map(b => b.id);
    const off = bs.buttons.filter(b => b.rect.x < 0 || b.rect.y < 0 || b.rect.x + b.rect.w > 540 || b.rect.y + b.rect.h > 960).map(b => b.id);
    const tiny = [];
    const walk = (n) => { if (n.style && n.style.fontSize && n.style.fontSize < 11 && n.visible !== false) tiny.push(n.text); (n.children || []).forEach(walk); };
    walk(bs.container);
    return { small, off, tiny, buttons: bs.buttons.length };
  });
  check(ui.small.length === 0, `all ${ui.buttons} buttons are at least 44x44 game px${ui.small.length ? ': ' + ui.small : ''}`);
  check(ui.off.length === 0, `no button is clipped off screen${ui.off.length ? ': ' + ui.off : ''}`);
  check(ui.tiny.length === 0, `no text smaller than 11px${ui.tiny.length ? ': ' + ui.tiny : ''}`);

  // ------------------------------------------------------------------ 2. Taps on fixed cells and void
  await tap(page, ...cell(6, 1));
  st = await state(page);
  check(st.selected === null && !st.pickerOpen, `tap the void cell (6,1) -> nothing is selected (selected=${JSON.stringify(st.selected)})`);
  await shot(page, 'b02_void_cell_not_selectable.png');
  await tap(page, ...cell(6, 11));
  st = await state(page);
  check(st.inspector.title === 'Generator' && /Projectile dispenser/.test(st.inspector.body), `tap generator -> "${st.inspector.title}: ${st.inspector.body}"`);
  await tap(page, ...cell(9, 2));
  st = await state(page);
  check(st.inspector.title === 'Ejector' && st.inspector.body === 'Ejector. Projectiles leave the ship here.', `tap ejector -> "${st.inspector.title}: ${st.inspector.body}"`);
  const before = JSON.stringify(await gridBlocks(page));
  await tap(page, ...cell(6, 1));
  await tap(page, ...cell(6, 1));
  check(!(await state(page)).pickerOpen && JSON.stringify(await gridBlocks(page)) === before, 'tapping the void cell twice opens nothing and changes nothing');
  await tap(page, ...cell(1, 1));
  await tap(page, ...cell(1, 1));
  check(!(await state(page)).pickerOpen, 'tapping outside the hull twice opens nothing');

  // ------------------------------------------------------------------ 3. Clear all -> empty line, dead end
  await tap(page, TB.clearAll, TB.y);
  st = await state(page);
  check(st.recipes === 0 && (await gridBlocks(page)).length === 0, 'Clear all empties the grid');
  await shot(page, 'b03_empty_grid_dead_end.png');
  await expectLine(page, [[6, 10, 'V'], [6, 8, 'V'], [6, 5, 'V'], [6, 3, 'V']], 'empty Shuttle');
  check(st.stats.warnings.length >= 1 && st.statsStrip[4] === String(st.stats.warnings.length), `warning counted in the strip: ${st.statsStrip[4]}`);

  // ------------------------------------------------------------------ 4. Picker
  await tap(page, ...cell(6, 9));
  check(!(await state(page)).pickerOpen, 'first tap on an empty cell only selects it');
  await tap(page, ...cell(6, 9));
  st = await state(page);
  check(st.pickerOpen, 'tapping the selected empty cell opens the picker');
  check(st.inspector.title === 'Empty cell', 'inspector strip stays visible above the sheet (and shows the cell)');
  await shot(page, 'b04_picker_open.png');
  const tiles = await page.evaluate(() => { const p = window.__mgbm.buildScreen.picker; return { ids: p.tiles.map(t => t.id), visible: p.tiles.filter(t => { const r = p.tileScreenRect(t.id); return r.y >= p.listRect.y && r.y + r.h <= p.listRect.y + p.listRect.h; }).map(t => t.id), minTile: Math.min(...p.tiles.map(t => Math.min(t.w, t.h))) }; });
  check(tiles.ids.length === 20, `picker lists 20 placeable blocks (no Remove tile on an empty cell): ${tiles.ids.length}`);
  check(tiles.minTile >= 44, `tiles are at least 44 px: ${tiles.minTile}`);
  check(!tiles.visible.includes('pure_converter'), `pure_converter is not visible before scrolling (visible: ${tiles.visible.length} tiles)`);
  const tr0 = await page.evaluate(() => window.__mgbm.buildScreen.picker.tileScreenRect('turn_r'));
  const [tx, ty] = tileCentre(...TILE.turn_r);
  check(tr0.x < tx && tx < tr0.x + tr0.w && tr0.y < ty && ty < tr0.y + tr0.h, 'independently computed Turn Right tile position hits the real tile');
  await drag(page, 270, 880, 270, 480);
  const tiles2 = await page.evaluate(() => { const p = window.__mgbm.buildScreen.picker; const r = p.tileScreenRect('pure_converter'); return { scroll: p.scrollY, vis: r.y >= p.listRect.y && r.y + r.h <= p.listRect.y + p.listRect.h }; });
  check(tiles2.scroll > 100 && tiles2.vis, `dragging the list scrolls it (scrollY ${Math.round(tiles2.scroll)}) and reveals pure_converter`);
  await shot(page, 'b05_picker_scrolled.png');
  await wheel(page, 270, 700, -2000);
  check((await page.evaluate(() => window.__mgbm.buildScreen.picker.scrollY)) === 0, 'mouse wheel scrolls the list back to the top');

  // Single tap on Turn Right: rule text + live preview.
  await tap(page, ...tileCentre(...TILE.turn_r));
  st = await state(page);
  check(st.inspector.title.startsWith('Turn Right') && st.inspector.body === 'Turns the signal 90° to the right.', `tap Turn Right tile -> "${st.inspector.title}: ${st.inspector.body}"`);
  const viewNow = st.view;
  const pc = (col, row) => [viewNow.ox + (col - 0.5) * viewNow.scale, viewNow.oy + (row - 0.5) * viewNow.scale];
  await shot(page, 'b06_preview_turn_right.png');
  // Preview re-routes the red line: east along row 9 from the ghost block, nothing above it any more.
  const pv = async (col, row, axis) => {
    const [cx, cy] = pc(col, row);
    const pts = await Promise.all([-14, 0, 14].map(o => lib.gameToClient(page, axis === 'V' ? cx : cx + o, axis === 'V' ? cy + o : cy)));
    return (await lib.pixelsAtClient(page, pts)).some(redishDimmed);
  };
  check((await pv(7, 9, 'H')) && (await pv(8, 9, 'H')), 'preview: line runs east along row 9 through the ghost Turn Right');
  check(!(await pv(6, 8, 'V')) , 'preview: line no longer continues straight up from the ghost block');
  check((await gridBlocks(page)).length === 0, 'preview did not place anything');

  // A second tap on the same tile places it.
  await tap(page, ...tileCentre(...TILE.turn_r));
  st = await state(page);
  check(!st.pickerOpen, 'tapping the selected tile again closes the sheet');
  check(JSON.stringify(await gridBlocks(page)) === JSON.stringify([{ col: 6, row: 9, id: 'turn_r', rotation: 0, manual: false }]), 'Turn Right placed at (6,9) in auto mode');
  check(st.view.scale === CELL && st.view.ox === OX && st.view.oy === OY, 'view is restored after the sheet closes');
  await shot(page, 'b07_turn_right_placed.png');
  await expectLine(page, [[6, 10, 'V'], [7, 9, 'H'], [8, 9, 'H'], [9, 9, 'H']], 'Turn Right placed: line goes up col 6 then east along row 9');
  await expectNoLine(page, [[6, 8, 'V'], [6, 5, 'V']], 'Turn Right placed: nothing continues up column 6');

  // Turn Left at (9,9): line reaches the ejector.
  check(await placeViaPicker(page, 9, 9, 'turn_l'), 'picker opened for (9,9)');
  st = await state(page);
  check(st.recipes === 1, 'with Turn Left at (9,9) the circuit reaches the ejector');
  await expectLine(page, [[6, 10, 'V'], [7, 9, 'H'], [8, 9, 'H'], [9, 8, 'V'], [9, 7, 'V'], [9, 6, 'V'], [9, 5, 'V'], [9, 4, 'V'], [9, 3, 'V']], 'journey of the reference screenshot');
  await shot(page, 'b08_route_to_ejector.png');
  check(st.statsStrip[0] === '1', `damage is still 1 with no damage block: strip ${st.statsStrip[0]}`);

  // ------------------------------------------------------------------ 5. Flat+ on and off the line
  const statsBefore = JSON.stringify((await state(page)).statsStrip);
  await placeViaPicker(page, 9, 6, 'flat_plus');
  st = await state(page);
  check(st.statsStrip[0] === '101' && st.statsStrip[3] === '404', `Flat+ on the line changes the stats: ${JSON.stringify(st.statsStrip)} (was ${statsBefore})`);
  await select(page, 9, 6);
  st = await state(page);
  check(/Orientation: auto/.test(st.inspector.title), `selected block shows "${st.inspector.title}"`);
  await shot(page, 'b09_flat_plus_on_line_selected.png');
  const badge = await lib.countInRegion(page, OX + 8 * CELL + 39, OY + 5 * CELL + 9, 4, lib.AUTO_BADGE_PRED);
  check(badge === 0, `no green "auto" badge at the block's corner: ${badge} badge pixels`);

  const statsOn = JSON.stringify((await state(page)).statsStrip);
  await placeViaPicker(page, 3, 5, 'flat_plus');
  st = await state(page);
  check(JSON.stringify(st.statsStrip) === statsOn, 'Flat+ off the line does not change the stats');
  await select(page, 3, 5);
  st = await state(page);
  check(/No signal reaches this block/.test(st.inspector.body), `off-line block says: "${st.inspector.body}"`);
  await shot(page, 'b10_flat_plus_off_line_selected.png');
  const noSigN = await lib.countInRegion(page, OX + 2 * CELL + 9, OY + 4 * CELL + 39, 7, lib.NO_SIGNAL_PRED);
  check(noSigN === 0, `no red "no signal" mark at the corner of the off-line block: ${noSigN} mark pixels`);

  // ------------------------------------------------------------------ 6. Rotation
  await select(page, 9, 6);
  await tap(page, TB.rotCW, TB.y);
  st = await state(page);
  let c = await cellState(page, 9, 6);
  check(c.manual === true && c.rotation === 90, `Rotate CW -> manual, rotation ${c.rotation}`);
  check(st.recipes === 0 && st.stats.damagePerShot === 0, 'rotated Flat+ blocks the line: no recipe');
  check(/manual \(facing right\)/.test(st.inspector.title), `inspector: "${st.inspector.title}"`);
  await shot(page, 'b11_rotated_cw_blocked.png');
  const lock = await lib.countInRegion(page, OX + 8 * CELL + 39, OY + 5 * CELL + 10, 4, lib.PADLOCK_PRED);
  check(lock === 0, `no padlock at the block's corner: ${lock} padlock pixels`);
  const warnPx = await lib.pixelsAtClient(page, await Promise.all([[0, 0], [-4, 3], [4, 3], [0, -3]].map(([dx, dy]) => lib.gameToClient(page, OX + 8.5 * CELL + dx, OY + 5 * CELL + 48 - 6 + dy))));
  check(warnPx.some(p => p[0] > 200 && p[1] > 130 && p[1] < 190 && p[2] < 90), `warning triangle on the block's edge: ${JSON.stringify(warnPx[0])}`);
  await expectLine(page, [[9, 8, 'V'], [9, 7, 'V']], 'line still reaches the rotated block');
  await expectNoLine(page, [[9, 5, 'V'], [9, 4, 'V'], [9, 3, 'V']], 'line stops at the rotated block');

  await tap(page, TB.rotCCW, TB.y);
  st = await state(page);
  c = await cellState(page, 9, 6);
  check(c.manual === true && c.rotation === 0 && st.recipes === 1 && st.stats.damagePerShot === 101, `Rotate CCW -> faces up again, line passes, damage ${st.stats.damagePerShot}`);
  await shot(page, 'b12_rotated_ccw_passes_manual.png');
  await tap(page, TB.rotCW, TB.y);
  await tap(page, TB.auto, TB.y);
  st = await state(page);
  c = await cellState(page, 9, 6);
  check(c.manual === false && st.recipes === 1 && /Orientation: auto/.test(st.inspector.title), 'Auto-orient returns the block to auto mode and the line passes');
  await shot(page, 'b13_auto_orient_restored.png');
  for (let i = 0; i < 4; i++) await tap(page, TB.rotCW, TB.y);
  c = await cellState(page, 9, 6);
  check(c.manual === true && c.rotation === 0, 'four Rotate CW presses return to the starting orientation');
  await tap(page, TB.auto, TB.y);

  // ------------------------------------------------------------------ 7. Undo / redo
  const snapshot = async () => JSON.stringify(await gridBlocks(page));
  const s0 = await snapshot();
  await tap(page, TB.rotCW, TB.y);
  const s1 = await snapshot();
  check(s0 !== s1, 'rotation changed the grid');
  await tap(page, ...CORNER.undo);
  check((await snapshot()) === s0, 'Undo reverts the rotation (and the line passes again)');
  check((await state(page)).recipes === 1, 'circuit valid again after undo');
  await shot(page, 'b14_after_undo.png');
  await tap(page, ...CORNER.redo);
  check((await snapshot()) === s1 && (await state(page)).recipes === 0, 'Redo re-applies the rotation (line blocked again)');
  await tap(page, ...CORNER.undo);

  // ------------------------------------------------------------------ 8. Zoom / pan / Fit
  await tap(page, 5, 700); // deselect, away from everything
  await wheel(page, 270, 470, -400);
  const z = (await state(page)).view;
  check(z.scale > CELL * 1.3, `wheel zoom in: scale ${CELL} -> ${z.scale.toFixed(1)}`);
  await drag(page, 300, 450, 200, 380);
  const z2 = (await state(page)).view;
  check(Math.abs(z2.ox - (z.ox - 100)) < 12 && Math.abs(z2.oy - (z.oy - 70)) < 12, `drag pans the grid (${z.ox.toFixed(0)},${z.oy.toFixed(0)}) -> (${z2.ox.toFixed(0)},${z2.oy.toFixed(0)})`);
  await shot(page, 'b15_zoomed_panned.png');
  await tap(page, ...CORNER.fit);
  const z3 = (await state(page)).view;
  check(z3.scale === CELL && z3.ox === OX && z3.oy === OY, 'Fit button restores the fitted view');

  // ------------------------------------------------------------------ 9. Persistence and A/B
  const beforeReload = await snapshot();
  await page.reload();
  await page.waitForFunction(() => !!window.__mgbm);
  await page.waitForTimeout(400);
  check((await snapshot()) === beforeReload, 'circuit (blocks, rotations, manual flags) persists across a reload');
  await select(page, 9, 6);
  await tap(page, TB.rotCW, TB.y);
  const rotated = await snapshot();
  await page.reload();
  await page.waitForFunction(() => !!window.__mgbm);
  await page.waitForTimeout(400);
  check((await snapshot()) === rotated && (await cellState(page, 9, 6)).manual === true, 'a manual rotation persists across a reload');
  await select(page, 9, 6);
  await tap(page, TB.auto, TB.y);

  const aSnap = await snapshot();
  await tap(page, ...CORNER.ab);
  st = await state(page);
  check(st.active === 'B' && (await gridBlocks(page)).length === 0 && st.recipes === 0, 'A/B toggle switches to the empty circuit B');
  await shot(page, 'b16_circuit_b.png');
  await tap(page, ...CORNER.ab);
  check((await state(page)).active === 'A' && (await snapshot()) === aSnap, 'toggling back restores circuit A unchanged');

  // ------------------------------------------------------------------ 10. Copy / paste
  await tap(page, ...CORNER.copy);
  check((await state(page)).toast === 'Layout copied', `copy toast: "${(await state(page)).toast}"`);
  await tap(page, TB.clearAll, TB.y);
  await tap(page, ...CORNER.paste);
  check((await state(page)).toast === 'Layout pasted' && (await snapshot()) === aSnap, 'paste restores the copied layout');
  await page.evaluate(() => navigator.clipboard.writeText('definitely not a layout'));
  await tap(page, ...CORNER.paste);
  const junkToast = (await state(page)).toast;
  check(/does not contain a layout/.test(junkToast) && (await snapshot()) === aSnap, `pasting junk shows an error toast and changes nothing: "${junkToast}"`);
  await shot(page, 'b17_paste_error_toast.png');

  // ------------------------------------------------------------------ 11. Stats panel, help, stub tabs
  await tap(page, ...STATS_STRIP);
  await page.waitForTimeout(100);
  await shot(page, 'b18_stats_panel.png');
  await tap(page, 270, 500);
  await tap(page, 54 + 216, 932); // Captain tab (the Shop tab is real since chunk 5)
  check(/Coming soon/.test((await state(page)).toast), 'stub tab shows "Coming soon"');
  await shot(page, 'b19_coming_soon_toast.png');

  // ------------------------------------------------------------------ 12. FLY
  const expected = (await state(page)).stats;
  await tap(page, ...FLY);
  // In Fly the ship follows the pointer, so keep it in the lower play area like a player would.
  await page.mouse.move(...Object.values(await lib.gameToClient(page, 270, 800)));
  await page.waitForTimeout(1200);
  const fly = await page.evaluate(() => ({ recipes: window.__mgbm.state().recipes, damage: window.__mgbm.state().damagePerShot, projectiles: window.__mgbm.state().projectiles, hasWorld: !!window.__mgbm.world, buildScreen: !!window.__mgbm.buildScreen }));
  check(fly.hasWorld && !fly.buildScreen, 'FLY switches to the Fly screen');
  check(fly.recipes === expected.projectilesPerPulse && fly.damage.every(d => d === expected.damagePerShot), `ship fires ${fly.recipes} stream(s) of ${fly.damage} damage; strip said ${expected.projectilesPerPulse} x ${expected.damagePerShot}`);
  const flyShots = await page.evaluate(async () => {
    const w = window.__mgbm.world;
    const seen = new Set();
    for (let i = 0; i < 40; i++) { for (let k = 0; k < w.pool.max; k++) if (w.pool.active[k]) seen.add(Math.round(w.pool.damage[k])); await new Promise(r => setTimeout(r, 25)); }
    return [...seen];
  });
  check(flyShots.length === 1 && flyShots[0] === expected.damagePerShot, `projectiles in flight carry ${JSON.stringify(flyShots)} damage`);
  check(fly.projectiles > 0, `${fly.projectiles} projectiles alive after 1.2 s`);
  await shot(page, 'b20_flying.png');
  await page.evaluate(() => { window.__mgbm.world.gameOver = true; });
  await page.waitForTimeout(300);
  await shot(page, 'b21_game_over_back_button.png');
  await tap(page, 270, 520);
  await page.waitForTimeout(300);
  st = await state(page);
  check(st.recipes === expected.projectilesPerPulse && JSON.stringify(st.stats) === JSON.stringify(expected), 'Back to Build shows the same circuit the player left');
  await shot(page, 'b22_back_to_build.png');

  // ------------------------------------------------------------------ 13. Broken circuit: FLY refuses
  await tap(page, TB.clearAll, TB.y);
  await tap(page, ...FLY);
  await page.waitForTimeout(250);
  st = await state(page);
  check(st.toast === "Your circuit doesn't reach an ejector", `toast: "${st.toast}"`);
  check(await page.evaluate(() => !!window.__mgbm.buildScreen && !window.__mgbm.world), 'still on the Build screen');
  await shot(page, 'b23_fly_refused_toast.png');

  await browser.close();
  const { passes, failures } = lib.counts();
  process.stdout.write(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'}  (${passes} passed, ${failures} failed)\n`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });

// Chunk 16e: plain tiles, one list (no tabs), the compact builder sheet, the blocks-only Shop, hulls bought in the hull picker.
// Writes the contact sheet reports/chunk16e/sheet_tiles16e.png (360 x 740 phone, device scale 2).
// Requires the Vite dev server. Run: node e2e/tiles16e.e2e.cjs   (GAME_URL=http://localhost:PORT to pick the server)
const lib = require('./lib.cjs');
const fs = require('fs');
const path = require('path');
const { check, tap } = lib;

const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const SHOP_TAB = [162, 932], BUILD_TAB = [54, 932], SHIP_BTN = [28, 26];
const OUT = path.join(__dirname, '..', 'reports', 'chunk16e');
fs.mkdirSync(OUT, { recursive: true });
const shopState = (page) => page.evaluate(() => window.__mgbm.state());
/** Evaluates an expression with `p` = the Shop's palette and `arg` = the optional argument. */
const spal = (page, expr, arg) => page.evaluate(new Function('arg', `const p = window.__mgbm.shopScreen.palette; return (${expr});`), arg);
/** Same for the builder's picker. */
const bpal = (page, expr, arg) => page.evaluate(new Function('arg', `const p = window.__mgbm.buildScreen.picker; return (${expr});`), arg);
const own = (page, id) => page.evaluate((i) => { const s = window.__mgbm.shopScreen.store.data; return { credits: s.credits, owned: s.owned[i], level: s.levels[i] }; }, id);

async function canvasShot(page) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const b = await page.locator('canvas').screenshot();
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
  return b;
}

async function tapShopTile(page, id) {
  await page.evaluate((i) => window.__mgbm.shopScreen.palette.reveal(i), id);
  await tap(page, ...centre(await spal(page, 'p.tileScreenRect(arg)', id)));
}

async function tapPickerTile(page, id) {
  await page.evaluate((i) => window.__mgbm.buildScreen.picker.reveal(i), id);
  await tap(page, ...centre(await bpal(page, 'p.tileScreenRect(arg)', id)));
}

async function montage(page, shots, captions, file, k) {
  const b64 = await page.evaluate(async ({ shots, captions, k }) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
    const pad = 8, cap = 40;
    const hs = imgs.map(im => im.height * k);
    const widths = imgs.map(im => im.width * k);
    const c = document.createElement('canvas');
    c.width = widths.reduce((a, b) => a + b + pad, pad);
    c.height = Math.max(...hs) + cap + pad;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    let x = pad;
    imgs.forEach((im, i) => {
      ctx.drawImage(im, x, pad, widths[i], hs[i]);
      ctx.fillStyle = '#ccc'; ctx.font = '13px monospace';
      captions[i].split('\n').forEach((line, j) => ctx.fillText(line, x, hs[i] + pad + 16 + j * 15));
      x += widths[i] + pad;
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { shots: shots.map(b => b.toString('base64')), captions, k });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, rich: true });
  const k = 360 / 540; // css px per game px at the phone width

  // ================================================================== Shop
  await tap(page, ...SHOP_TAB);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.shopScreen);
  // Plenty of credits, one block with none owned, and the gated blocks of a fresh frontier stay gated.
  await page.evaluate(() => {
    const s = window.__mgbm.shopScreen;
    s.store.data.credits = 1e7;
    s.store.data.owned.delay_line = 0;
    s.store.data.owned.random_router = 0;
    s.store.commit();
  });
  await page.waitForTimeout(200);
  let st = await shopState(page);
  check(st.rows.length === 41 && st.section === undefined, `the Shop is one list of 41 block tiles, no Blocks / Hulls toggle (${st.rows.length})`);
  check(await spal(page, 'typeof p.setTab === "undefined" && typeof p.chipRect === "undefined" && p.tab === undefined'), 'the palette has no tabs any more');
  const tiles = await spal(page, 'p.tiles.slice(0, 5).map(t => ({ x: t.x, y: t.y, w: t.w, h: t.h }))');
  check(tiles[3].x > tiles[2].x && tiles[2].x > tiles[1].x && tiles[1].x > tiles[0].x && tiles[3].y === tiles[0].y && tiles[4].x === tiles[0].x && tiles[4].y > tiles[0].y,
    `4 tiles per row: ${JSON.stringify(tiles.map(t => [t.x, t.y]))}`);
  check(tiles[0].w * k >= 44 && tiles[0].h * k >= 44, `a tile is ${(tiles[0].w * k).toFixed(0)} x ${(tiles[0].h * k).toFixed(0)} css px at 360 px wide (>= 44)`);
  const gapX = tiles[1].x - (tiles[0].x + tiles[0].w);
  check(gapX * k >= 12, `breathing room: ${(gapX * k).toFixed(0)} css px between tiles`);
  check(tiles.every(t => (t.x * k) % 1 < 1e-6 && (t.y * k) % 1 < 1e-6), 'tile positions are whole css pixels at the phone width');
  const counts = await spal(page, '({ flat: p.countOf("flat_plus"), none: p.countOf("delay_line"), a: p.alphaOf("flat_plus"), dim: p.alphaOf("delay_line"), lock: p.padlockOf("random_router"), lockA: p.alphaOf("random_router"), noLock: p.padlockOf("flat_plus") })');
  check(counts.flat === '20' && counts.none === null && counts.a === 1 && counts.dim < 0.5, `owned tile: count "${counts.flat}" at full strength; unowned: no count, dimmed (alpha ${counts.dim})`);
  check(counts.lock && counts.lockA < 0.5 && !counts.noLock, 'a locked block is dimmed and has a padlock; an owned one has none');
  const names = await spal(page, 'p.tiles.map(t => p.nameOfTile(t.id))');
  check(names.every(n => typeof n === 'string' && n.length > 0) && names.some(n => n.endsWith('…')) === names.some(n => n.endsWith('…')), `every tile carries a one-line name (${names.slice(0, 4).join(', ')} ...)`);
  const shotDefault = await canvasShot(page);

  // A tap in the gap between two tiles does nothing.
  await tap(page, tiles[0].x + tiles[0].w + gapX / 2, tiles[0].y + 50);
  check((await shopState(page)).selected === null, 'a tap in the gap between tiles selects nothing');

  // Select a tile: the info sheet opens with Upgrade and Buy, the tile stays visible, prices unchanged.
  await tapShopTile(page, 'flat_plus');
  let pst = await spal(page, '({ sheet: p.sheetOpen, sel: p.selected, c: p.sheetContentNow, list: p.listRect, tile: p.tileScreenRect(p.selected), sr: p.sheetRect })');
  check(pst.sheet && pst.sel === 'flat_plus' && pst.c.buy && pst.c.upgrade && pst.tile.y >= pst.list.y && pst.tile.y + pst.tile.h <= pst.list.y + pst.list.h,
    'tapping a tile opens the sheet and keeps the tile in view');
  check(/^Level 1\/\d+$/.test(pst.c.levelLine) && /^Owned 20$/.test(pst.c.ownedLine) && pst.c.body.length > 5, `sheet text: ${pst.c.title} | ${pst.c.levelLine} | ${pst.c.ownedLine}`);
  check(pst.sr.y + pst.sr.h <= 904 && pst.sr.h * k < 130, `the Shop sheet sits above the tab bar and is ${(pst.sr.h * k).toFixed(0)} css px high`);
  const shotSheet = await canvasShot(page);
  const before = await own(page, 'flat_plus');
  const prices = await page.evaluate(async (a) => { const m = await import('/src/econ/economy.ts'); return { buy: m.copyPrice(a.id, a.owned), up: m.upgradePrice(a.id, a.level) }; }, { id: 'flat_plus', owned: before.owned, level: before.level });
  await tap(page, ...centre(await spal(page, 'p.sheetButtonRect("buy")')));
  const after = await own(page, 'flat_plus');
  check(after.owned === before.owned + 1 && before.credits - after.credits === prices.buy, `Buy another copy: owned ${before.owned}->${after.owned}, price ${prices.buy} (same as before 16e)`);
  check((await spal(page, 'p.countOf("flat_plus")')) === '21', 'the count on the tile updates to 21');
  await tap(page, ...centre(await spal(page, 'p.sheetButtonRect("upgrade")')));
  const after2 = await own(page, 'flat_plus');
  check(after2.level === 2 && after.credits - after2.credits === prices.up, `Upgrade: level ${after.level}->${after2.level}, price ${prices.up}`);
  check(/Level 2\//.test((await shopState(page)).sheet.level), 'the sheet shows the new level');
  await tapShopTile(page, 'flat_plus');
  check(!(await spal(page, 'p.sheetOpen')), 'tapping the selected tile again closes the sheet');

  // 0 owned: dimmed, still buyable. Locked: requirement, no buy / upgrade.
  await tapShopTile(page, 'delay_line');
  pst = await spal(page, '({ c: p.sheetContentNow })');
  check(pst.c && pst.c.buy && /Owned 0/.test(pst.c.ownedLine), `0-owned block: "${pst.c && pst.c.ownedLine}", Buy offered`);
  await tapShopTile(page, 'random_router');
  pst = await spal(page, '({ c: p.sheetContentNow, buy: p.sheetButtonVisible("buy"), up: p.sheetButtonVisible("upgrade") })');
  check(pst.c && /^Reach ring/.test(pst.c.lockText) && !pst.buy && !pst.up, `locked block: "${pst.c && pst.c.lockText}", no buy and no upgrade button`);
  const shotLock = await canvasShot(page);
  await spal(page, 'p.closeSheet()');

  // Scrolling reaches the end of the one list.
  await lib.wheel(page, 270, 500, 3000);
  const sc = await spal(page, '({ y: p.scrollY, max: p.maxScrollValue })');
  check(sc.y > 0 && Math.abs(sc.y - sc.max) < 1, `the wheel scrolls the list to its end (${sc.y.toFixed(0)} of ${sc.max.toFixed(0)})`);
  const lastTile = await spal(page, 'p.tileScreenRect(p.tiles[p.tiles.length - 1].id)');
  const lastList = await spal(page, 'p.listRect');
  check(lastTile.y >= lastList.y && lastTile.y + lastTile.h <= lastList.y + lastList.h + 1, 'the last tile is fully visible at the end of the scroll');
  // The old Hulls toggle position does nothing now.
  await tap(page, 405, 136);
  check((await shopState(page)).rows.length === 41 && !(await shopState(page)).section, 'the old Hulls toggle spot does nothing: the Shop is blocks only');

  // ================================================================== Builder
  await tap(page, ...BUILD_TAB);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.buildScreen);
  await page.evaluate(() => {
    const m = window.__mgbm.model;
    m.store.data.owned.delay_line = 0;
    m.store.data.owned.random_router = 0;
    m.store.data.credits = 0;
    m.store.commit();
    const b = window.__mgbm.buildScreen;
    const c = b.model.grid.cells.find(c => c.type === 'empty' && !c.blockId);
    window.__cell = { x: c.x, y: c.y };
    b.select(window.__cell); b.openPicker(window.__cell);
  });
  await page.waitForTimeout(250);
  let b = await shopState(page);
  const area = await bpal(page, '({ open: p.isOpen, n: p.tiles.length, list: p.listRect, noTabs: typeof p.setTab === "undefined", y0: p.sheet.y })');
  check(area.open && area.n === 41 && area.noTabs, `builder picker opens with the shared tile list (${area.n} tiles, no tabs)`);
  check(area.y0 >= 560 && area.list.h * k < 270, `the palette takes only the bottom ${((960 - area.y0) * k).toFixed(0)} css px of the 640: the circuit keeps the rest`);
  check(b.inspector.title === 'Empty cell' || /cell/i.test(b.inspector.title), `the top line keeps describing the cell: "${b.inspector.title}"`);
  const rows = await bpal(page, '[0, 4, 8].map(i => p.tileScreenRect(p.tiles[i].id)).map(r => r.y)');
  const shotBuild0 = await canvasShot(page);

  await tapPickerTile(page, 'turn_r');
  b = await shopState(page);
  check(b.sheet && b.sheet.title === 'Turn Right' && /free \d+/.test(b.sheet.status) && /^Level /.test(b.sheet.level) && b.sheet.body.length > 5, `selecting a tile shows ONE compact sheet: "${b.sheet && b.sheet.title}" ${b.sheet && b.sheet.level} | ${b.sheet && b.sheet.status}`);
  check(b.sheet.rect.h * k < 130, `the sheet is compact: ${(b.sheet.rect.h * k).toFixed(0)} css px high`);
  check(b.sheet.placeRect.w * k <= 100 && b.sheet.placeRect.h * k <= 46, `the Place button is small: ${(b.sheet.placeRect.w * k).toFixed(0)} x ${(b.sheet.placeRect.h * k).toFixed(0)} css px`);
  check(b.inspector.title !== 'Turn Right', 'the block info is in the sheet only: the top line did not repeat it');
  const shotBuild = await canvasShot(page);

  // Unowned: dimmed, info with the hint, cannot be placed.
  const blocksBefore = await page.evaluate(() => JSON.stringify(window.__mgbm.model.grid.cells.filter(c => c.blockId)));
  await tapPickerTile(page, 'delay_line');
  b = await shopState(page);
  check(b.sheet && b.sheet.title === 'Delay Line' && /Not owned/.test(b.sheet.status) && !b.sheet.place.enabled, `unowned tile: sheet "${b.sheet && b.sheet.status}", Place disabled`);
  await tapPickerTile(page, 'delay_line');
  b = await shopState(page);
  check(/Buy Delay Line in the Shop/.test(b.toast) && b.pickerOpen, `second tap only says where to get it: "${b.toast}"`);
  check((await page.evaluate(() => JSON.stringify(window.__mgbm.model.grid.cells.filter(c => c.blockId)))) === blocksBefore, 'nothing was placed');
  // Locked: the requirement.
  await tapPickerTile(page, 'random_router');
  b = await shopState(page);
  check(b.sheet && /^Locked: Reach ring/.test(b.sheet.status) && b.sheet.warn && !b.sheet.place.enabled, `locked tile: "${b.sheet && b.sheet.status}"`);
  await tapPickerTile(page, 'random_router');
  b = await shopState(page);
  check(/^Locked: Reach ring/.test(b.toast), `second tap tells how to unlock it: "${b.toast}"`);
  const look = await bpal(page, '({ dim: p.alphaOf("delay_line"), lockDim: p.alphaOf("random_router"), pad: p.padlockOf("random_router"), cnt: p.countOf("delay_line"), turn: p.countOf("turn_r") })');
  check(look.dim < 0.5 && look.lockDim < 0.5 && look.pad && look.cnt === null && /^\d+$/.test(look.turn), 'builder tiles: unowned dimmed without a count, locked with a padlock, owned with a plain number');

  // Placing an owned block still works with two taps, and the palette closes.
  await tapPickerTile(page, 'turn_r');
  await tapPickerTile(page, 'turn_r');
  b = await shopState(page);
  check(!b.pickerOpen && (await page.evaluate(() => window.__mgbm.model.grid.cells.some(c => c.blockId === 'turn_r' && c.x === window.__cell.x && c.y === window.__cell.y))), 'two taps on an owned tile still place it');

  // Stats strip: K / M / B.
  const strip = await page.evaluate(() => {
    const s = window.__mgbm.buildScreen.stats;
    s.set({ damagePerShot: 140000, projectilesPerPulse: 2.5, pulsesPerSecond: 5, estDps: 2400000, warnings: [] }, { damagePerShot: -2400000, projectilesPerPulse: 0, pulsesPerSecond: 0, estDps: 1500000000 });
    return s.texts();
  });
  check(strip[0].startsWith('140K') && strip[1] === '2.5' && strip[3].startsWith('2.4M'), `stats strip uses K / M: ${JSON.stringify(strip)}`);
  check(/2\.4M$/.test(strip[0]) && /1\.5B$/.test(strip[3]), `deltas too: ${JSON.stringify(strip)}`);
  await page.evaluate(() => window.__mgbm.buildScreen.refresh());

  // ================================================================== Hull picker
  await tap(page, ...SHIP_BTN);
  b = await shopState(page);
  const hp = b.hullPanel;
  check(hp && hp.rows.length === 5 && hp.rows.map(r => r.id).join() === 'dart,twin,prong,fan,shuttle', `the hull picker lists all hulls: ${hp && hp.rows.map(r => r.id + ':' + r.state).join(' ')}`);
  check(hp.rows.find(r => r.id === 'twin').state === 'unowned' && hp.rows.find(r => r.id === 'shuttle').state === 'current', 'unowned hulls are marked, the current one too');
  const twinRow = hp.rows.find(r => r.id === 'twin').rect;
  await tap(page, ...centre(twinRow));
  b = await shopState(page);
  check(b.hullPanel.selected === 'twin' && !!b.hullPanel.buy && b.hull === 'shuttle', 'tapping an unowned hull shows its info and a Buy button without switching');
  const shotHull = await canvasShot(page);
  const c0 = b.credits;
  await tap(page, ...centre(b.hullPanel.buy));
  b = await shopState(page);
  check(b.credits === c0 && b.hull === 'shuttle' && b.hullPanelOpen && /Not enough credits/.test(b.toast), `too few credits: nothing bought (credits ${b.credits}, toast "${b.toast}")`);
  await page.evaluate(() => { const m = window.__mgbm.model; m.store.data.credits = 500; m.store.commit(); });
  await tap(page, ...centre(b.hullPanel.buy));
  b = await shopState(page);
  check(b.credits === 430 && b.hull === 'twin' && !b.hullPanelOpen, `buying the Twin costs 70 and selects it (credits ${b.credits}, hull ${b.hull})`);
  check(await page.evaluate(() => window.__mgbm.model.store.data.ownedHulls.includes('twin')), 'the Twin is saved as owned');
  await tap(page, ...SHIP_BTN);
  b = await shopState(page);
  check(b.hullPanel.rows.find(r => r.id === 'twin').state === 'current' && b.hullPanel.rows.find(r => r.id === 'prong').state === 'unowned', 'the picker now shows the Twin as current');
  await tap(page, 270, 900);

  // ---- contact sheet
  await montage(page, [shotBuild, shotDefault, shotSheet, shotHull],
    ['1 Builder: circuit + palette,\none tile selected', '2 Shop default\n(one list, no tabs)', '3 Shop, tile selected\nwith the info sheet', '4 Hull picker, unowned Twin\nselected (info + Buy)'],
    path.join(OUT, 'sheet_tiles16e.png'), 0.5);
  fs.writeFileSync(path.join(OUT, 'builder_palette_closed.png'), shotBuild0);
  fs.writeFileSync(path.join(OUT, 'shop_locked.png'), shotLock);
  void rows;
  const c = lib.counts();
  console.log(`done: ${c.passes} passed, ${c.failures} failed`);
  await browser.close();
  process.exit(c.failures ? 1 : 0);
})();

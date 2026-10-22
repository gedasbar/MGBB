// Chunk 16b-fix: the Shop's tile palette (4 per row, one list by category, info sheet) and a builder crop; writes the contact sheet.
// Requires the Vite dev server. Run: node e2e/shop16b.e2e.cjs   (GAME_URL=http://localhost:PORT to pick the server)
const lib = require('./lib.cjs');
const fs = require('fs');
const path = require('path');
const { check, tap, wheel } = lib;

const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const SHOP_TAB = [162, 932], BUILD_TAB = [54, 932];
const SEC_BLOCKS = [135, 136], SEC_HULLS = [405, 136];
const shopState = (page) => page.evaluate(() => window.__mgbm.state());
/** Evaluates an expression with `p` = the Shop's palette and `arg` = the optional argument. */
const pal = (page, expr, arg) => page.evaluate(new Function('arg', `const p = window.__mgbm.shopScreen.palette; return (${expr});`), arg);
const own = (page, id) => page.evaluate((i) => { const s = window.__mgbm.shopScreen.store.data; return { credits: s.credits, owned: s.owned[i], level: s.levels[i] }; }, id);

async function canvasShot(page) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const b = await page.locator('canvas').screenshot();
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
  return b;
}

async function tapTile(page, id) {
  await page.evaluate((i) => window.__mgbm.shopScreen.palette.reveal(i), id);
  const r = await page.evaluate((i) => window.__mgbm.shopScreen.palette.tileScreenRect(i), id);
  await tap(page, ...centre(r));
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
  const { page } = await lib.openGame(browser, { viewport: { width: 360, height: 740 }, rich: true });
  await tap(page, ...SHOP_TAB);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.shopScreen);
  // Plenty of credits, one block with none owned, one gated block (a Frontier ring it has not reached).
  await page.evaluate(() => {
    const s = window.__mgbm.shopScreen;
    s.store.data.credits = 1e7;
    s.store.data.owned.delay_line = 0;
    s.store.data.owned.random_router = 0;
    s.store.commit();
  });
  await page.waitForTimeout(200);

  // ---- layout at the phone width (360 css px = 540 game px, so css = game x 0.667)
  let st = await shopState(page);
  check(st.section === 'blocks' && st.rows.length === 41, `the Shop lists 41 blocks as tiles (${st.rows.length})`);
  const tiles = await pal(page, 'p.tiles.slice(0, 5).map(t => ({ x: t.x, y: t.y, w: t.w, h: t.h }))');
  check(tiles[3].x > tiles[2].x && tiles[2].x > tiles[1].x && tiles[1].x > tiles[0].x && tiles[3].y === tiles[0].y && tiles[4].x === tiles[0].x && tiles[4].y > tiles[0].y,
    `4 tiles per row: ${JSON.stringify(tiles.map(t => [t.x, t.y]))}`);
  const k = 360 / 540;
  check(tiles[0].w * k >= 44 && tiles[0].h * k >= 44, `tiles ${(tiles[0].w * k).toFixed(0)}x${(tiles[0].h * k).toFixed(0)} px at 360 px wide (>= 44)`);
  check(await page.evaluate(() => !('setTab' in window.__mgbm.shopScreen.palette) && !('tab' in window.__mgbm.shopScreen.palette)), 'the palette has no tabs');
  const badges = await pal(page, 'p.tiles.map(t => p.badgeOf(t.id))');
  check(badges.every(b => b !== null && /^\d+\+?$/.test(b)), 'every tile has a number-only badge');
  check((await pal(page, 'p.badgeOf("delay_line")')) === '0' && (await pal(page, 'p.badgeOf("flat_plus")')) === '20', 'badges read 0 and 20');
  const shotDefault = await canvasShot(page);

  // ---- one list, ordered by category
  const allIds = await pal(page, 'p.tiles.map(t => t.id)');
  const cats = await page.evaluate(async (ids) => { const m = await import('/src/data/blocks.ts'); return ids.map(i => m.BLOCKS[i].category); }, allIds);
  const order = ['pathing', 'damage', 'modifier', 'status', 'mitosis'];
  const idx = cats.map(x => order.indexOf(x));
  check(idx.every((v, i) => v >= 0 && (i === 0 || v >= idx[i - 1])), 'the list is grouped by category (pathing, damage, modifier, status, mitosis)');
  const dmgIds = allIds.filter((_, i) => cats[i] === 'damage');

  // ---- select a tile: info sheet opens, tile stays visible, buy / upgrade work with the Shop's prices
  const first = dmgIds[0];
  // 16c-2: Flat+ is capped at 10 copies, so this test starts from 5 (the rich save's 20 would sit above the cap).
  await page.evaluate((id) => { const st = window.__mgbm.shopScreen.store; st.data.owned[id] = 5; st.commit(); }, first);
  await tapTile(page, first);
  let pst = await pal(page, '({ sheet: p.sheetOpen, sel: p.selected, c: p.sheetContentNow, list: p.listRect, tile: p.tileScreenRect(p.selected) })');
  check(pst.sheet && pst.sel === first && pst.c.buy && pst.c.upgrade && pst.tile.y >= pst.list.y && pst.tile.y + pst.tile.h <= pst.list.y + pst.list.h,
    `tapping ${first} opens the sheet and keeps the tile in view`);
  check(/^Level 1\/\d+$/.test(pst.c.levelLine) && /^Owned 5 \/ 10$/.test(pst.c.ownedLine) && pst.c.body.length > 5, `sheet text: ${pst.c.title} | ${pst.c.levelLine} | ${pst.c.ownedLine}`);
  const shotSheet = await canvasShot(page);
  const before = await own(page, first);
  const prices = await page.evaluate(async (a) => { const m = await import('/src/econ/economy.ts'); return { buy: m.copyPrice(a.id, a.owned), up: m.upgradePrice(a.id, a.level) }; }, { id: first, owned: before.owned, level: before.level });
  await tap(page, ...centre(await pal(page, 'p.sheetButtonRect("buy")')));
  const after = await own(page, first);
  check(after.owned === before.owned + 1 && before.credits - after.credits === prices.buy, `Buy another copy: owned ${before.owned}->${after.owned}, price ${prices.buy}`);
  check((await pal(page, 'p.badgeOf(arg)', first)) === '6', 'the badge updates to 6');
  await tap(page, ...centre(await pal(page, 'p.sheetButtonRect("upgrade")')));
  const after2 = await own(page, first);
  check(after2.level === 2 && after.credits - after2.credits === prices.up, `Upgrade: level ${after.level}->${after2.level}, price ${prices.up}`);
  check((await shopState(page)).inspector.title.includes('Lv 2'), 'the inspector shows the new level');
  await tapTile(page, first);
  check(!(await pal(page, 'p.sheetOpen')), 'tapping the selected tile again closes the sheet');

  // ---- 0 owned: dim tile, badge 0, sheet with Buy
  await tapTile(page, 'delay_line');
  pst = await pal(page, '({ b: p.badgeOf("delay_line"), c: p.sheetContentNow })');
  check(pst.b === '0' && pst.c && pst.c.buy && /Owned 0/.test(pst.c.ownedLine), `0-owned block: badge ${pst.b}, "${pst.c && pst.c.ownedLine}", Buy offered`);
  const shotZero = await canvasShot(page);

  // ---- locked: lock text, no buy / upgrade
  await tapTile(page, 'random_router');
  pst = await pal(page, '({ c: p.sheetContentNow, buy: p.sheetButtonVisible("buy"), up: p.sheetButtonVisible("upgrade") })');
  check(pst.c && pst.c.lockText === 'Reach ring 10 North' && !pst.buy && !pst.up, `locked block: "${pst.c && pst.c.lockText}", no buy and no upgrade button`);
  const locked = (await shopState(page)).rows.find(r => r.key === 'random_router');
  check(locked.buttons.every(b => !b.enabled && b.lock), 'the test view lists the locked block with disabled buttons');
  const cr = (await own(page, 'random_router')).credits;
  await page.evaluate(() => window.__mgbm.shopScreen.palette.press('buy'));
  check((await own(page, 'random_router')).credits === cr, 'pressing buy on a locked block costs nothing');
  const shotLock = await canvasShot(page);

  // ---- scrolling, hulls
  await wheel(page, 270, 500, 2000);
  const sc = await pal(page, '({ y: p.scrollY, max: p.maxScrollValue })');
  check(sc.y > 0 && Math.abs(sc.y - sc.max) < 1, `the wheel scrolls the grid to its end (${sc.y.toFixed(0)} of ${sc.max.toFixed(0)})`);
  await tap(page, ...SEC_HULLS);
  st = await shopState(page);
  check(st.section === 'hulls' && st.rows.length >= 4 && st.rows[0].buttons.length === 1, `Hulls section keeps its rows (${st.rows.length})`);
  await tap(page, ...SEC_BLOCKS);
  check((await shopState(page)).rows.length === 41, 'back on Blocks');

  // ---- wide window
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(400);
  await tapTile(page, 'flat_plus');
  const shotWide = await canvasShot(page);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.waitForTimeout(300);

  // ---- builder crop
  await tap(page, ...BUILD_TAB);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.buildScreen);
  await page.evaluate(() => { const b = window.__mgbm.buildScreen; b.select({ x: 1, y: 2 }); b.openPicker({ x: 1, y: 2 }); });
  await page.waitForTimeout(200);
  const bp = await page.evaluate(() => { const p = window.__mgbm.buildScreen.picker; return { open: p.isOpen, n: p.tiles.length }; });
  check(bp.open && bp.n > 0, `builder picker opens with the shared palette (${bp.n} tiles)`);
  const r = await page.evaluate(() => window.__mgbm.buildScreen.picker.tileScreenRect('turn_l'));
  await tap(page, ...centre(r));
  check(await page.evaluate(() => window.__mgbm.buildScreen.picker.sheetOpen && window.__mgbm.buildScreen.picker.selected === 'turn_l'), 'builder: tapping a tile selects it and opens the sheet');
  const shotBuild = await canvasShot(page);

  await montage(page, [shotDefault, shotSheet, shotZero, shotLock, shotWide, shotBuild],
    ['1 Shop default (All)\n360x740 phone', '2 (same view)', '3 tile selected,\ninfo sheet open', '4 0-owned block\n(Delay Line)', '5 locked block\n(Random Router)', '6 wide window\n1600x900', '7 builder palette\ntile selected'],
    path.join(__dirname, 'screenshots', 'shop16b_contact.png'), 0.55);
  fs.writeFileSync(path.join(__dirname, 'screenshots', 'shop16b_sheet.png'), shotSheet);
  fs.writeFileSync(path.join(__dirname, 'screenshots', 'tilefix_shop.png'), shotDefault);
  fs.writeFileSync(path.join(__dirname, 'screenshots', 'tilefix_builder.png'), shotBuild);
  const c = lib.counts();
  console.log(`done: ${c.passes} passed, ${c.failures} failed`);
  await browser.close();
  process.exit(c.failures ? 1 : 0);
})();

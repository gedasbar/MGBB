// Chunk 17a end-to-end: the hull picker (19 hulls, unowned ones dimmed with a price, info sheet, Buy), the Shop without a Hulls tab
// and with affordability dots, and a flight with a big and a huge hull. Writes the contact sheet to reports/chunk17a/.
// Requires the Vite dev server. Run: node e2e/hulls17a.e2e.cjs   (GAME_URL=http://localhost:PORT to pick the server)
const lib = require('./lib.cjs');
const fs = require('fs');
const path = require('path');
const { check, tap, state } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk17a');
fs.mkdirSync(OUT, { recursive: true });
const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const SHIP_BTN = [28, 26], SHOP_TAB = [162, 932], BUILD_TAB = [54, 932];

const picker = (page, expr, arg) => page.evaluate(new Function('arg', `const p = window.__mgbm.buildScreen.hullPicker; return (${expr});`), arg);
const setCredits = (page, n) => page.evaluate((n) => {
  const store = window.__mgbm.buildScreen ? window.__mgbm.buildScreen.model.store : window.__mgbm.shopScreen.store;
  store.data.credits = n; store.commit();
  if (window.__mgbm.buildScreen) window.__mgbm.buildScreen.hullPicker.refresh();
}, n);
const owned = (page) => page.evaluate(() => (window.__mgbm.model || window.__mgbm.buildScreen.model).store.data.ownedHulls);
const canvasPng = async (page) => {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const b = await page.locator('canvas').screenshot();
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
  return b;
};

async function revealRow(page, id) {
  // scroll the list with the real wheel until the row is on screen
  for (let i = 0; i < 12; i++) {
    const r = await picker(page, 'p.rowScreenRect(arg)', id);
    const lr = await picker(page, 'p.inList(270, 300)');
    if (r && r.y > 170 && r.y + r.h < 780) return r;
    const box = await page.locator('canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.45);
    await page.mouse.wheel(0, r && r.y < 170 ? -200 : 200);
    await page.waitForTimeout(80);
    void lr;
  }
  return picker(page, 'p.rowScreenRect(arg)', id);
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 360, height: 740 }, rich: false, dart: true });
  const shots = [], captions = [];

  // ---- the picker: 19 hulls, price order, unowned dimmed, no dots with no credits
  await setCredits(page, 0);
  await tap(page, ...SHIP_BTN);
  check((await state(page)).hullPanelOpen, 'the ship button opens the hull picker');
  const rows0 = await picker(page, 'p.rowsView()');
  check(rows0.length === 19, `the picker lists 19 hulls (${rows0.length})`);
  const prices = rows0.map(r => r.price);
  check(prices.every((p, i) => i === 0 || p > prices[i - 1]), 'rows are ordered by price, strictly ascending');
  check(rows0[0].owned && rows0[0].current && rows0[0].alpha === 1, 'the Dart is owned and current at full brightness');
  check(rows0.slice(1).every(r => !r.owned && r.alpha < 1), 'every unowned hull is dimmed');
  check(rows0.every(r => !r.dot), 'no dot with 0 credits');

  // ---- affordability dots
  await setCredits(page, 800);
  const rows1 = await picker(page, 'p.rowsView()');
  const dots = rows1.filter(r => r.dot).map(r => r.id);
  check(dots.join() === 'twin,prong,wisp', `with 800 credits the dots are on ${dots}`);

  // ---- tap an unowned hull: info sheet, no purchase yet
  const hornet0 = await revealRow(page, 'hornet');
  await tap(page, ...centre(hornet0));
  let st = await picker(page, '({ sel: p.selected, open: p.sheetOpen, buy: p.buyButtonRect() })');
  check(st.sel === 'hornet' && st.open && st.buy, 'tapping an unowned hull opens its info sheet');
  check(!(await owned(page)).includes('hornet'), 'opening the sheet buys nothing');
  shots.push(await canvasPng(page)); captions.push('unowned hull: info sheet (Hornet, 1.2K)');
  // not enough credits: the Buy button is pressed but nothing happens
  await tap(page, ...centre(st.buy));
  check(!(await owned(page)).includes('hornet') && (await page.evaluate(() => window.__mgbm.buildScreen.model.store.data.credits)) === 800, 'Buy without enough credits does nothing');

  // ---- buy the Wisp: owned, selected, credits spent, picker closed
  const wisp = await revealRow(page, 'wisp');
  await tap(page, ...centre(wisp));
  st = await picker(page, '({ sel: p.selected, buy: p.buyButtonRect() })');
  check(st.sel === 'wisp', 'tapping the Wisp opens its sheet');
  const price = (await picker(page, 'p.rowsView()')).find(r => r.id === 'wisp').price;
  await tap(page, ...centre(st.buy));
  const after = await page.evaluate(() => { const m = window.__mgbm.buildScreen.model; return { owned: m.store.data.ownedHulls, credits: m.store.data.credits, hull: m.hullId }; });
  st = await state(page);
  check(after.owned.includes('wisp') && after.hull === 'wisp' && !st.hullPanelOpen, `bought the Wisp and it is selected: ${after.hull}, picker open ${st.hullPanelOpen}`);
  check(after.credits === 800 - price, `credits ${800 - price} after paying ${price} (${after.credits})`);
  shots.push(await canvasPng(page)); captions.push('after buying: builder on the Wisp column');

  // ---- an owned hull is chosen with one tap
  await tap(page, ...SHIP_BTN);
  const dart = await revealRow(page, 'dart');
  await tap(page, ...centre(dart));
  check((await state(page)).hull === 'dart' && !(await state(page)).hullPanelOpen, 'tapping an owned hull selects it and closes the picker');

  // ---- picker screenshot with the list scrolled, then the Shop
  await tap(page, ...SHIP_BTN);
  await setCredits(page, 5000);
  await revealRow(page, 'kestrel');
  shots.push(await canvasPng(page)); captions.push('hull picker scrolled, dots on affordable hulls');
  await tap(page, 270, 40); // outside the panel (title bar area above it) closes
  check(!(await state(page)).hullPanelOpen, 'a tap outside the panel closes the picker');

  // ---- the Shop: blocks only, no Hulls tab, dots
  await tap(page, ...SHOP_TAB);
  let s = await state(page);
  check(Array.isArray(s.rows) && s.rows.length === 41 && s.section === undefined, `the Shop lists 41 blocks and has no sections (${s.rows && s.rows.length})`);
  const dotKeys = s.rows.filter(r => r.dot).map(r => r.key);
  check(dotKeys.length > 5, `the Shop shows dots on affordable blocks (${dotKeys.length} of 41 with 5K credits)`);
  const alphaOwned = await page.evaluate(() => window.__mgbm.shopScreen.palette.tileAlpha('turn_l'));
  const alphaNot = await page.evaluate(() => window.__mgbm.shopScreen.palette.tileAlpha('flat_plus'));
  check(alphaOwned === 1 && alphaNot === 1, `owned and unowned tiles have the same brightness (${alphaOwned} / ${alphaNot})`);
  shots.push(await canvasPng(page)); captions.push('Shop: blocks only, yellow dots where the next copy is affordable');
  await setCredits(page, 0);
  s = await state(page);
  check(s.rows.every(r => !r.dot), 'no dots with 0 credits');

  // ---- a flight with a big and a huge hull
  const crops = [], cropCaps = [];
  for (const hull of ['dart', 'galleon', 'citadel']) {
    await tap(page, ...BUILD_TAB);
    await page.evaluate(async (hull) => {
      const b = window.__mgbm.buildScreen;
      const { standardBuild } = await import('/src/debug/hullBuilds.ts');
      const store = b.model.store;
      for (const id of ['galleon', 'citadel']) if (!store.data.ownedHulls.includes(id)) store.data.ownedHulls.push(id);
      for (const k of Object.keys(store.data.owned)) store.data.owned[k] = 20;
      store.commit();
      b.model.switchHull(hull);
      const g = standardBuild(hull);
      const blocks = g.cells.filter(c => c.blockId).map(c => ({ x: c.x, y: c.y, blockId: c.blockId, level: c.level, rotation: c.rotation }));
      b.model.pasteLayout(JSON.stringify({ mgbm: 'layout', v: 3, hull, blocks }));
      b.fit(); b.refresh();
    }, hull);
    const rec = await page.evaluate(() => window.__mgbm.buildScreen.model.compiled.recipes.length);
    check(rec >= (hull === 'dart' ? 1 : 3), `${hull}: the standard circuit feeds ${hull === 'dart' ? 1 : 3} ejectors (${rec})`);
    await page.evaluate(() => window.__mgbm.buildScreen.fly());
    await page.waitForFunction(() => window.__mgbm && window.__mgbm.world && window.__mgbm.state().viewW, null, { timeout: 5000 });
    const hit = await page.evaluate(() => window.__mgbm.world.hitR);
    check(hit === ({ dart: 8, galleon: 10, citadel: 11 })[hull], `${hull}: hit radius ${hit}`);
    await page.mouse.move(...Object.values(await lib.gameToClient(page, 270, 700)));
    await page.waitForTimeout(2200);
    if (hull !== 'dart') { shots.push(await canvasPng(page)); captions.push(`flight: ${hull}`); }
    {
      // a close crop around the ship (the whole canvas is only 360 px wide here)
      await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
      const box = await page.locator('canvas').boundingBox();
      const sc = box.width / 540;
      const ship = await page.evaluate(() => ({ x: window.__mgbm.world.shipX, y: window.__mgbm.world.shipY }));
      const clip = { x: box.x + (ship.x - 60) * sc, y: box.y + (ship.y - 90) * sc, width: 120 * sc, height: 120 * sc };
      crops.push(await page.screenshot({ clip })); cropCaps.push(`${hull} in flight (3x)`);
    }
    await page.reload();
    await page.waitForFunction(() => !!window.__mgbm);
    await page.waitForTimeout(400);
  }

  // ---- close crops of the three ships in flight: Dart (small), Galleon (big), Citadel (huge), enlarged 3x
  {
    const b64 = await page.evaluate(async ({ crops, caps }) => {
      const imgs = await Promise.all(crops.map(s => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + s; })));
      const k = 3, pad = 8, cap = 22, w = imgs[0].width * k, h = imgs[0].height * k;
      const c = document.createElement('canvas');
      c.width = imgs.length * (w + pad) + pad; c.height = h + cap + 2 * pad;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
      x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height);
      x.font = '14px monospace'; x.fillStyle = '#aaa';
      imgs.forEach((im, i) => { const cx = pad + i * (w + pad); x.drawImage(im, cx, pad + cap, w, h); x.fillText(caps[i], cx + 2, pad + 15); });
      return c.toDataURL('image/png').split(',')[1];
    }, { crops: crops.map(b => b.toString('base64')), caps: cropCaps });
    fs.writeFileSync(path.join(OUT, 'flight_hulls_17a.png'), Buffer.from(b64, 'base64'));
    console.log('INFO  wrote', path.join(OUT, 'flight_hulls_17a.png'));
  }

  // ---- contact sheet
  const b64 = await page.evaluate(async ({ shots, captions }) => {
    const imgs = await Promise.all(shots.map(s => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + s; })));
    const w = imgs[0].width, h = imgs[0].height, cols = 4, pad = 8, cap = 22;
    const rows = Math.ceil(imgs.length / cols);
    const c = document.createElement('canvas');
    c.width = cols * (w + pad) + pad; c.height = rows * (h + cap + pad) + pad;
    const x = c.getContext('2d');
    x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height);
    x.font = '14px monospace'; x.fillStyle = '#aaa';
    imgs.forEach((im, i) => {
      const cx = pad + (i % cols) * (w + pad), cy = pad + Math.floor(i / cols) * (h + cap + pad);
      x.drawImage(im, cx, cy + cap);
      x.fillText(captions[i].slice(0, 40), cx + 2, cy + 15);
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { shots: shots.map(b => b.toString('base64')), captions });
  fs.writeFileSync(path.join(OUT, 'contact_17a.png'), Buffer.from(b64, 'base64'));
  console.log('INFO  wrote', path.join(OUT, 'contact_17a.png'));

  await browser.close();
  const { passes, failures } = lib.counts();
  console.log(`${failures} FAILURE(S)  (${passes} passed, ${failures} failed)`);
  process.exit(failures ? 1 : 0);
})();

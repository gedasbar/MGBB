// Chunk 31c contact sheet (a picture generator, not a test), phone size 360 x 740: the Shipyard with rotated chunks and the fixed generator below the grid, a selected slot with the
// toolbar, the palette sheet with a chunk tile selected, an error, the debug Cell mode, and the sandbox builder with its banner.
// Output: reports/chunk31c/sheet_31c.png. Needs the Vite dev server. Run: node e2e/sheet-chunk31c.cjs   (adds ?debug=1 itself)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { waitFor, tap, check } = lib;
const OUT = path.join(__dirname, '..', 'reports', 'chunk31c');
fs.mkdirSync(OUT, { recursive: true });
const VIEWPORT = { width: 360, height: 740 };
const SHIP_BTN = [28, 26];
const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const click = (page, id) => page.evaluate((i) => document.getElementById(i).click(), id);

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const cells = [];
  const snap = async (page, cap) => { await page.waitForTimeout(450); cells.push({ b64: (await page.screenshot()).toString('base64'), cap }); };
  const { page, context } = await lib.openGame(browser, { rich: true, viewport: VIEWPORT, summary: 'keep' });
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  await lib.dismissAchievementSummary(page);
  await click(page, 'dbg-fr-reach-all');
  await page.evaluate(() => {
    const s = window.__mgbm.model.store;
    s.data.cores = 4200;
    for (const c of ['full', 'corridor', 'bar', 'corner', 'tjunction', 'cross', 'ring', 'front_gun', 'twin_gun', 'side_gun', 'overdrive', 'core_magnet']) s.data.chunks[c] = 2;
    s.commit();
  });
  // The achievements the cheats grant show a toast for a few seconds; let it go before the pictures (a plain wait: this is a picture generator, not a test).
  await page.waitForTimeout(5000);
  for (let i = 0; i < 4 && !(await page.evaluate(() => window.__mgbm.buildScreen.hubTab === 'ships')); i++) {
    await tap(page, ...SHIP_BTN, { pause: 150 });
    await waitFor(() => page.evaluate(() => window.__mgbm.buildScreen.hubTab === 'ships'), { timeout: 1200 });
  }
  await tap(page, ...center(await page.evaluate(() => window.__mgbm.buildScreen.hullPicker.entryView().rect)), { pause: 300 });
  check(await waitFor(() => page.evaluate(() => window.__mgbm.screen === 'shipyard'), { timeout: 6000 }), 'the Shipyard opens');

  const sy = (fn, arg) => page.evaluate(fn, arg);
  await snap(page, 'Empty: the generator is fixed under the grid, error line');
  // A ship with rotated chunks: Twin Gun upside down over a Full chunk (over the generator), a Cross turned, a Corner turned, two Bars, a Side Gun.
  await sy(() => {
    const e = window.__mgbm.shipyard;
    e.ed.place(8, 'front_gun'); e.ed.place(12, 'full');
    e.ed.place(4, 'cross'); e.ed.place(0, 'twin_gun'); e.ed.rotate(0, 1);
    e.ed.place(13, 'bar'); e.ed.place(10, 'side_gun'); e.ed.rotate(10, -1);
    e.ed.place(14, 'tjunction'); e.ed.rotate(14, 1);
    e.selectedSlot = 10; e.refresh();
  });
  await snap(page, 'Rotated chunks, slot 11 selected, toolbar');
  await sy(() => { const e = window.__mgbm.shipyard; e.selectedSlot = -1; e.refresh(); });
  await snap(page, 'The ship, nothing selected, stats');
  // The palette on an empty slot with a tile selected (its sheet, Buy).
  await tap(page, ...center(await page.evaluate(() => window.__mgbm.slotRect(0))), { pause: 250 });
  await tap(page, ...center(await page.evaluate(() => window.__mgbm.slotRect(0))), { pause: 250 });
  await page.evaluate(() => window.__mgbm.shipyard.palette.reveal('overdrive'));
  await tap(page, ...center(await page.evaluate(() => window.__mgbm.tileRect('overdrive'))), { pause: 250 });
  await snap(page, 'Palette sheet: tile selected, tap again to place, Buy');
  await sy(() => { const e = window.__mgbm.shipyard; e.closePalette(); e.selectedSlot = -1; e.ed.remove(14); e.ed.place(14, 'corridor'); e.refresh(); });
  await snap(page, 'An error: Corridor over the generator');
  await sy(() => { const e = window.__mgbm.shipyard; e.ed.undo(); e.refresh(); });
  // Cell mode with a drawn hull whose generator is not on the bottom row.
  await tap(page, ...center(await page.evaluate(() => window.__mgbm.buttonRect('cellMode'))), { pause: 250 });
  await sy(() => {
    const e = window.__mgbm.shipyard; const c = e.cell;
    c.resize(5, 6);
    ['.E.E.', '.___.', '__.__', '.___.', '..G..', '.._..'].forEach((r, y) => [...r].forEach((ch, x) => c.set(x, y, ch)));
    e.refresh();
  });
  await snap(page, 'Cell mode: generator on row 5 (free), VALID');
  await sy(() => window.__mgbm.shipyard.buildAndFly());
  await page.waitForTimeout(600);
  await snap(page, 'Build & fly: the sandbox builder, SANDBOX banner');
  await context.close();

  const b64 = await (async () => {
    const p = await (await browser.newContext()).newPage();
    return p.evaluate(async ({ cells }) => {
      const imgs = await Promise.all(cells.map(async (c) => { const i = new Image(); i.src = 'data:image/png;base64,' + c.b64; await i.decode(); return i; }));
      const per = 4, pad = 8, cap = 18, k = 0.85, w = Math.round(360 * k), h = Math.round(740 * k);
      const rows = Math.ceil(imgs.length / per);
      const c = document.createElement('canvas');
      c.width = per * (w + pad) + pad; c.height = rows * (h + cap + pad) + pad;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
      imgs.forEach((im, i) => {
        const x = pad + (i % per) * (w + pad), y = pad + Math.floor(i / per) * (h + cap + pad);
        ctx.drawImage(im, x, y + cap, w, h);
        ctx.fillStyle = '#ddd'; ctx.font = '12px sans-serif'; ctx.fillText(cells[i].cap, x + 2, y + 13);
      });
      return c.toDataURL('image/png').split(',')[1];
    }, { cells });
  })();
  fs.writeFileSync(path.join(OUT, 'sheet_31c.png'), Buffer.from(b64, 'base64'));
  console.log('sheet written to reports/chunk31c/sheet_31c.png');
  await browser.close();
  const c = lib.counts(); process.exit(c.failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

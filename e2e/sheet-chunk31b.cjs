// Chunk 31b contact sheet (a picture generator, not a test), phone size 360 x 740: the locked Shipyard entry in the hub, the Shipyard with the chunk palette open,
// an invalid design with its error, a valid design with its stats, the custom ship in flight, and the debug Cell mode with a drawn hull.
// Output: reports/chunk31b/sheet_31b.png. Needs the Vite dev server. Run: node e2e/sheet-chunk31b.cjs   (adds ?debug=1 itself)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { waitFor, tap, check } = lib;
const OUT = path.join(__dirname, '..', 'reports', 'chunk31b');
fs.mkdirSync(OUT, { recursive: true });
const VIEWPORT = { width: 360, height: 740 };
const SHIP_BTN = [28, 26];
const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const click = (page, id) => page.evaluate((i) => document.getElementById(i).click(), id);

async function session(browser) {
  const { page, context } = await lib.openGame(browser, { rich: true, viewport: VIEWPORT, summary: 'keep' });
  // At phone width the debug panel covers the canvas: hide it first, then close the one-time achievement summary.
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  await lib.dismissAchievementSummary(page);
  return { page, context };
}
async function hubShips(page) {
  for (let i = 0; i < 4 && !(await page.evaluate(() => window.__mgbm.buildScreen.hubTab === 'ships')); i++) {
    await tap(page, ...SHIP_BTN, { pause: 150 });
    await waitFor(() => page.evaluate(() => window.__mgbm.buildScreen.hubTab === 'ships'), { timeout: 1200 });
  }
}
const enter = async (page) => {
  await hubShips(page);
  await tap(page, ...center(await page.evaluate(() => window.__mgbm.buildScreen.hullPicker.entryView().rect)), { pause: 300 });
  check(await waitFor(() => page.evaluate(() => window.__mgbm.screen === 'shipyard'), { timeout: 6000 }), 'the Shipyard opens');
};

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const cells = [];
  const snap = async (page, cap) => { await page.waitForTimeout(450); cells.push({ b64: (await page.screenshot()).toString('base64'), cap }); };
  /** A close-up of the ship (a 70 x 100 px window around it, drawn 4x with hard pixels). */
  const snapShip = async (page, cap) => {
    const s = await page.evaluate(() => window.__mgbm.state());
    const p = await lib.gameToClient(page, s.shipX, s.shipY);
    const clip = { x: Math.max(0, Math.round(p.x - 35)), y: Math.max(0, Math.round(p.y - 45)), width: 70, height: 100 };
    cells.push({ b64: (await page.screenshot({ clip })).toString('base64'), cap, zoom: 4 });
  };
  const open = async (page) => {
    // Ring 300 everywhere (the Shipyard opens at 150), plenty of Cores, three of every chunk.
    await click(page, 'dbg-fr-reach-all');
    await page.evaluate(() => { const s = window.__mgbm.model.store; s.data.cores = 4200; for (const c of ['full', 'corridor', 'bar', 'corner', 'tjunction', 'cross', 'ring', 'generator', 'front_gun', 'twin_gun', 'side_gun', 'overdrive']) s.data.chunks[c] = 2; s.commit(); });
    // The achievements the cheats grant show a toast for a few seconds; let it go before the pictures (a plain wait: this is a picture generator, not a test).
    await page.waitForTimeout(5000);
  };

  {
    const { page, context } = await session(browser);
    await hubShips(page);
    await snap(page, 'Hub, SHIPS: Shipyard locked (ring 150)');
    await open(page);
    await page.evaluate(() => window.__mgbm.buildScreen.hullPicker.refresh());
    await snap(page, 'Hub, SHIPS: Shipyard open, Cores shown');
    await enter(page);
    // An invalid design: the Front Gun floats above an empty slot.
    await page.evaluate(() => { const e = window.__mgbm.shipyard; e.ed.place(1, 'front_gun'); e.ed.place(9, 'corridor'); e.ed.place(13, 'generator'); e.refresh(); });
    await tap(page, ...center(await page.evaluate(() => window.__mgbm.slotRect(5))), { pause: 250 });
    await page.evaluate(() => window.__mgbm.shipyard.palette.reveal('cross'));
    await snap(page, 'Shipyard: palette open on an empty slot');
    await page.evaluate(() => { const e = window.__mgbm.shipyard; e.closePalette(); e.refresh(); });
    await snap(page, 'Invalid: Front Gun not connected, its slot outlined');
    await page.evaluate(() => { const e = window.__mgbm.shipyard; e.ed.place(5, 'corridor'); e.ed.place(12, 'bar'); e.ed.rename('Spear'); e.refresh(); });
    await snap(page, 'Valid: stats strip, Use enabled');
    await tap(page, ...center(await page.evaluate(() => window.__mgbm.buttonRect('use'))), { pause: 300 });
    check(await waitFor(() => page.evaluate(() => window.__mgbm.screen === 'build'), { timeout: 6000 }), 'Use this ship opens the builder');
    await snap(page, 'Builder on the custom hull');
    await hubShips(page);
    await page.evaluate(() => window.__mgbm.buildScreen.hullPicker.scrollBy(3000));
    await snap(page, 'Hub, SHIPS: Custom 1 row with its art');
    await page.evaluate(() => window.__mgbm.buildScreen.closeHub());
    const r = await lib.startFreeFly(page);
    check(r === 'ok', 'Free Fly starts');
    await waitFor(() => page.evaluate(() => window.__mgbm.state().time > 1.6), { timeout: 15000 });
    await snap(page, 'The custom ship in flight');
    await snapShip(page, 'Close-up (4x) of the custom ship');
    await context.close();
  }
  {
    const { page, context } = await session(browser);
    await open(page);
    await enter(page);
    await tap(page, ...center(await page.evaluate(() => window.__mgbm.buttonRect('cellMode'))), { pause: 250 });
    const cellTap = async (x, y, n = 1) => { for (let i = 0; i < n; i++) await tap(page, ...center(await page.evaluate(([a, b]) => window.__mgbm.cellRect(a, b), [x, y])), { pause: 60 }); };
    await cellTap(1, 0, 3); await cellTap(3, 0, 3); await cellTap(0, 1); await cellTap(1, 1); await cellTap(2, 1); await cellTap(3, 1); await cellTap(4, 1);
    await cellTap(2, 2); await cellTap(2, 3); await cellTap(2, 4); await cellTap(2, 5, 2);
    await snap(page, 'Cell mode (debug): a drawn hull, VALID');
    await context.close();
  }

  const b64 = await (async () => {
    const page = await (await browser.newContext()).newPage();
    return page.evaluate(async ({ cells }) => {
      const imgs = await Promise.all(cells.map(async (c) => { const i = new Image(); i.src = 'data:image/png;base64,' + c.b64; await i.decode(); return i; }));
      const per = 5, pad = 8, cap = 18, k = 0.78, w = Math.round(360 * k), h = Math.round(740 * k);
      const rows = Math.ceil(imgs.length / per);
      const c = document.createElement('canvas');
      c.width = per * (w + pad) + pad; c.height = rows * (h + cap + pad) + pad;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = false;
      imgs.forEach((im, i) => { const x = pad + (i % per) * (w + pad), y = pad + Math.floor(i / per) * (h + cap + pad); if (cells[i].zoom) { ctx.fillStyle = '#1c1c1e'; ctx.fillRect(x, y, w, h); ctx.drawImage(im, x + (w - im.width * cells[i].zoom) / 2, y + 20, im.width * cells[i].zoom, im.height * cells[i].zoom); } else ctx.drawImage(im, x, y, w, h); ctx.fillStyle = '#bbb'; ctx.font = '11px monospace'; ctx.fillText(cells[i].cap, x, y + h + 13); });
      return c.toDataURL('image/png').split(',')[1];
    }, { cells });
  })();
  fs.writeFileSync(path.join(OUT, 'sheet_31b.png'), Buffer.from(b64, 'base64'));
  console.log('sheet written to reports/chunk31b/sheet_31b.png');
  await browser.close();
  const c = lib.counts(); process.exit(c.failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

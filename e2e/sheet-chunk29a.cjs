// Chunk 29a contact sheet (a picture generator, not a test), phone size 360 x 740: the hub on its three tabs, the Achievements tab with the "show completed" checkbox
// both ways, Settings over its whole scroll, the builder (no help line) and the bottom bar with each tab selected. Output: reports/chunk29a/sheet_29a.png
// Needs the Vite dev server. Run: node e2e/sheet-chunk29a.cjs   (adds ?debug=1 itself)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, tap, waitFor } = lib;
const OUT = path.join(__dirname, '..', 'reports', 'chunk29a');
fs.mkdirSync(OUT, { recursive: true });

const SHIP_BTN = [28, 26], SETTINGS_BTN = [128, 26];
const TAB = { ships: [101, 137], custom: [270, 137], ach: [439, 137] };
const BOTTOM = [['tabBuild', 'build'], ['tabShop', 'shop'], ['tabCaptain', 'captain'], ['tabSkills', 'skills'], ['tabMap', 'map']];
const hubTab = (page) => page.evaluate(() => window.__mgbm.buildScreen && window.__mgbm.buildScreen.hubTab);
async function openHub(page, tab) {
  for (let i = 0; i < 4 && (await hubTab(page)) !== tab; i++) {
    if (!(await hubTab(page))) await tap(page, ...SHIP_BTN, { pause: 150 });
    if (tab !== 'ships') await tap(page, ...TAB[tab], { pause: 150 });
    await waitFor(async () => (await hubTab(page)) === tab, { timeout: 1200 });
  }
  check((await hubTab(page)) === tab, `hub tab ${tab} is open`);
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: true, viewport: { width: 360, height: 740 }, summary: 'keep' });
  // At phone width the debug panel covers the canvas: hide it first, then close the one-time achievement summary.
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  await lib.dismissAchievementSummary(page);
  const cells = [];
  const snap = async (cap, crop) => { await page.waitForTimeout(250); const b = await page.screenshot(crop ? { clip: crop } : {}); cells.push({ b64: b.toString('base64'), cap, w: crop ? crop.width : 360, h: crop ? crop.height : 740 }); };

  await snap('Builder (no help line)');
  await openHub(page, 'ships'); await snap('Hub: SHIPS');
  await openHub(page, 'custom'); await snap('Hub: CUSTOMIZATION');
  await openHub(page, 'ach'); await snap('Hub: ACHIEVEMENTS, box off');
  const r = await page.evaluate(() => window.__mgbm.buildScreen.achPanel.buttonRect('showCompleted'));
  await tap(page, r.x + r.w / 2, r.y + r.h / 2);
  check(await waitFor(() => page.evaluate(() => window.__mgbm.buildScreen.achPanel.showCompleted), { timeout: 2000 }), 'tapping the checkbox turns Show completed on');
  await snap('Achievements, box ticked');
  await page.evaluate(() => window.__mgbm.buildScreen.closeHub());

  await tap(page, ...SETTINGS_BTN, { pause: 200 });
  await waitFor(() => page.evaluate(() => window.__mgbmSm.overlays.current === 'settings'), { timeout: 3000 });
  const st = await page.evaluate(() => window.__mgbmSm.overlays.settingsState);
  for (const [i, y] of [0, 99999].entries()) {
    await page.evaluate((y) => { const o = window.__mgbmSm.overlays; o.wheel(-9999); o.wheel(y); }, y);
    await snap(`Settings ${i + 1}/2 (scroll ${Math.min(y, st.contentH - st.areaH)})`);
  }
  await page.keyboard.press('Escape');

  // The bottom bar with each tab selected: a crop of the lowest strip of each screen.
  const bars = [];
  for (const [id, scr] of BOTTOM) {
    const i = BOTTOM.findIndex(t => t[0] === id);
    if (scr !== 'build') {
      await tap(page, 54 + 108 * i, 930, { pause: 200 });
      await waitFor(() => page.evaluate((s) => window.__mgbm.screen === s, scr), { timeout: 5000 });
    }
    await page.waitForTimeout(300);
    bars.push({ b64: (await page.screenshot({ clip: { x: 0, y: 740 - 78, width: 360, height: 78 } })).toString('base64'), cap: `bar: ${scr}` });
  }
  const b64 = await page.evaluate(async ({ cells, bars }) => {
    const load = async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; };
    const imgs = await Promise.all(cells.map(c => load(c.b64)));
    const barImgs = await Promise.all(bars.map(c => load(c.b64)));
    const per = 5, pad = 8, cap = 18, k = 0.8;
    const w = Math.round(360 * k), h = Math.round(740 * k);
    const rows = Math.ceil(imgs.length / per);
    const c = document.createElement('canvas');
    c.width = per * (w + pad) + pad;
    c.height = rows * (h + cap + pad) + pad + (78 * k + cap + pad);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => { const x = pad + (i % per) * (w + pad), y = pad + Math.floor(i / per) * (h + cap + pad); ctx.drawImage(im, x, y, w, h); ctx.fillStyle = '#bbb'; ctx.font = '12px monospace'; ctx.fillText(cells[i].cap, x, y + h + 13); });
    const y0 = pad + rows * (h + cap + pad);
    barImgs.forEach((im, i) => { const x = pad + i * (w + pad); ctx.drawImage(im, x, y0, w, 78 * k); ctx.fillStyle = '#bbb'; ctx.font = '12px monospace'; ctx.fillText(bars[i].cap, x, y0 + 78 * k + 13); });
    return c.toDataURL('image/png').split(',')[1];
  }, { cells, bars });
  fs.writeFileSync(path.join(OUT, 'sheet_29a.png'), Buffer.from(b64, 'base64'));
  console.log('sheet written to reports/chunk29a/sheet_29a.png');
  await browser.close();
  const c = lib.counts(); process.exit(c.failures ? 1 : 0);
})();

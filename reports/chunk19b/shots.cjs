// Chunk 19b screenshots at 360 x 740 (the canvas is letterboxed in that window). Needs the dev server: GAME_URL=http://localhost:5173 node reports/chunk19b/shots.cjs
const path = require('path');
let url = process.env.GAME_URL || 'http://localhost:5173/';
url += (url.includes('?') ? '&' : '?') + 'debug=0';
process.env.GAME_URL = url;
const lib = require('../../e2e/lib.cjs');
const { tap, state } = lib;
const OUT = __dirname;

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 360, height: 740 }, rich: true });
  // ---- Block info: the longest block (Mine) in the builder picker sheet.
  const e0 = await page.evaluate(() => { const v = window.__mgbm.buildScreen.view; return { x: v.ox + 3.5 * v.scale, y: v.oy + 5.5 * v.scale }; });
  await tap(page, e0.x, e0.y); await tap(page, e0.x, e0.y);
  await page.evaluate(() => window.__mgbm.buildScreen.picker.reveal('mine'));
  const r = await page.evaluate(() => window.__mgbm.buildScreen.picker.tileScreenRect('mine'));
  await tap(page, r.x + r.w / 2, r.y + r.h / 2);
  console.log('SHEET', JSON.stringify(await page.evaluate(() => window.__mgbm.buildScreen.picker.sheetContentNow)));
  await page.locator('canvas').screenshot({ path: path.join(OUT, 'block_info_mine_360x740.png') });
  // ---- Tier panel with best earnings (seeded) and a spike tier (long hint + spike line).
  await page.evaluate(async () => {
    const { getProgressStore } = await import('/src/econ/progress.ts');
    const s = getProgressStore(); const d = s.data;
    d.passedTiers = Array.from({ length: 30 }, (_, i) => i + 1); d.clearedTiers = [1, 2, 3, 4, 5, 6, 7];
    d.wallBestCredits = { '7': 123456, '8': 1234 }; d.wallBestPct = { '7': 100, '8': 83 }; d.wallBestTime = { '7': 95, '8': 140 }; d.wallBestClearTime = { '7': 95 };
    s.commit();
  });
  await page.evaluate(async () => { const { MapScreen } = await import('/src/screens/MapScreen.ts'); window.__mgbmSm.switchTo(new MapScreen(window.__mgbmSm)); });
  await page.waitForFunction(() => window.__mgbm.screen === 'map');
  for (const t of [7, 8]) {
    await page.evaluate(() => window.__mgbm.scrollTo(0));
    const q = await page.evaluate((t) => window.__mgbm.tileScreenRect(t), t);
    if (q.y < 0) await page.evaluate((y) => window.__mgbm.scrollTo(y), 105);
    const q2 = await page.evaluate((t) => window.__mgbm.tileScreenRect(t), t);
    await tap(page, q2.x + q2.w / 2, q2.y + q2.h / 2, { pause: 500 });
    console.log('TIER', t, JSON.stringify((await state(page)).sheet));
    await page.locator('canvas').screenshot({ path: path.join(OUT, `tier_panel_${t}_360x740.png`) });
  }
  // ---- Frontier panel
  const fb = await page.evaluate(() => window.__mgbm.frontierButton());
  await tap(page, fb.rect.x + fb.rect.w / 2, fb.rect.y + fb.rect.h / 2);
  await page.waitForFunction(() => window.__mgbm.screen === 'frontier');
  await page.evaluate(async () => {
    const { getProgressStore } = await import('/src/econ/progress.ts');
    const s = getProgressStore(); s.data.squareBestCredits = { '0,0': 12345678 }; s.commit();
    window.__mgbm.jump(0, 0, 44); window.__mgbm.select(0, 0);
  });
  await page.waitForTimeout(300);
  console.log('FRONTIER', JSON.stringify((await state(page)).panel));
  await page.locator('canvas').screenshot({ path: path.join(OUT, 'frontier_panel_360x740.png') });
  await browser.close();
})();

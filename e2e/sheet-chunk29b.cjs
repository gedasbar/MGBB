// Chunk 29b contact sheet (a picture generator, not a test), phone size 360 x 740: the Map carousel with each mode centred, the locked Frontier card, the Free Fly screen,
// two mode screens with their "<" button, the builder without FLY / CAMPAIGN, the builder with the challenge bar at the bottom, and the hub on each tab scrolled a little.
// Output: reports/chunk29b/sheet_29b.png. Needs the Vite dev server. Run: node e2e/sheet-chunk29b.cjs   (adds ?debug=1 itself)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { waitFor, tap, check } = lib;
const OUT = path.join(__dirname, '..', 'reports', 'chunk29b');
fs.mkdirSync(OUT, { recursive: true });
const VIEWPORT = { width: 360, height: 740 };
const SHIP_BTN = [28, 26], TAB = { ships: [101, 137], custom: [270, 137], ach: [439, 137] }, BUILD_TAB = [54, 930];

async function session(browser, tiers) {
  const { page, context } = await lib.openGame(browser, { rich: true, tiers, viewport: VIEWPORT, summary: 'keep' });
  // At phone width the debug panel covers the canvas: hide it first, then close the one-time achievement summary.
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  await lib.dismissAchievementSummary(page);
  return { page, context };
}
const onScreen = (page, name) => waitFor(() => page.evaluate((n) => window.__mgbm.screen === n, name), { timeout: 6000 });

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const cells = [];
  const snap = async (page, cap) => { await page.waitForTimeout(450); cells.push({ b64: (await page.screenshot()).toString('base64'), cap }); };
  const carouselOn = async (page, i) => {
    if (!(await page.evaluate(() => window.__mgbm.screen === 'carousel'))) {
      await page.evaluate(() => window.__mgbmNav.openMapTab());
      if (!(await onScreen(page, 'carousel'))) { await page.evaluate((m) => window.__mgbmNav.backToCarousel(m), 'campaign'); await onScreen(page, 'carousel'); }
    }
    await page.evaluate((i) => window.__mgbm.carousel.goTo(i), i);
    await waitFor(() => page.evaluate((i) => Math.abs(window.__mgbm.state().pos - i) < 0.005, i), { timeout: 3000 });
  };
  const hub = async (page, tab) => {
    for (let i = 0; i < 4 && (await page.evaluate(() => window.__mgbm.buildScreen.hubTab)) !== tab; i++) {
      if (!(await page.evaluate(() => window.__mgbm.buildScreen.hubTab))) await tap(page, ...SHIP_BTN, { pause: 150 });
      if (tab !== 'ships') await tap(page, ...TAB[tab], { pause: 150 });
      await waitFor(() => page.evaluate((t) => window.__mgbm.buildScreen.hubTab === t, tab), { timeout: 1200 });
    }
    check((await page.evaluate(() => window.__mgbm.buildScreen.hubTab)) === tab, `hub tab ${tab} is open`);
  };

  // ---- Fresh save: tiers not passed, so the Frontier is locked.
  {
    const { page, context } = await session(browser, false);
    await carouselOn(page, 0); await snap(page, 'carousel: Campaign centred');
    await carouselOn(page, 1); await snap(page, 'carousel: Frontier LOCKED');
    await carouselOn(page, 2); await snap(page, 'carousel: Free Fly centred');
    await page.evaluate(() => window.__mgbmNav.openMode('freefly'));
    check(await onScreen(page, 'freefly-home'), 'Free Fly screen opens');
    await snap(page, 'Free Fly screen');
    await context.close();
  }
  // ---- Save with the tiers passed: the Frontier is open.
  {
    const { page, context } = await session(browser, true);
    await carouselOn(page, 1); await snap(page, 'carousel: Frontier open');
    await page.evaluate(() => window.__mgbmNav.openMode('campaign'));
    check(await onScreen(page, 'map'), 'Campaign screen opens');
    await snap(page, 'Campaign screen, "<" top left');
    await page.evaluate(() => window.__mgbmNav.openMode('frontier'));
    check(await onScreen(page, 'frontier'), 'Frontier screen opens');
    await snap(page, 'Frontier screen, "<" top left');
    await tap(page, ...BUILD_TAB);
    check(await onScreen(page, 'build'), 'Build screen');
    await snap(page, 'Builder: no FLY / CAMPAIGN');
    await page.evaluate(() => window.__mgbm.buildScreen.startChallenge('c_no_aoe'));
    await snap(page, 'Builder: challenge bar at the bottom');
    await page.evaluate(() => { const m = window.__mgbm.model; m.switchHull('dart'); });
    await snap(page, 'Builder: bar, build ready (Dart)');
    await page.evaluate(() => window.__mgbm.buildScreen.closeHub && window.__mgbm.buildScreen.closeHub());
    for (const [tab, panel] of [['ships', 'hullPicker'], ['custom', 'customPanel'], ['ach', 'achPanel']]) {
      await hub(page, tab);
      await page.evaluate((p) => window.__mgbm.buildScreen[p].scrollBy(70), panel);
      await snap(page, `Hub ${tab.toUpperCase()}, scrolled 70`);
      await page.evaluate(() => window.__mgbm.buildScreen.closeHub());
    }
    await context.close();
  }

  const b64 = await (async () => {
    const page = await (await browser.newContext()).newPage();
    return page.evaluate(async ({ cells }) => {
      const imgs = await Promise.all(cells.map(async (c) => { const i = new Image(); i.src = 'data:image/png;base64,' + c.b64; await i.decode(); return i; }));
      const per = 5, pad = 8, cap = 18, k = 0.8, w = Math.round(360 * k), h = Math.round(740 * k);
      const rows = Math.ceil(imgs.length / per);
      const c = document.createElement('canvas');
      c.width = per * (w + pad) + pad; c.height = rows * (h + cap + pad) + pad;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
      imgs.forEach((im, i) => { const x = pad + (i % per) * (w + pad), y = pad + Math.floor(i / per) * (h + cap + pad); ctx.drawImage(im, x, y, w, h); ctx.fillStyle = '#bbb'; ctx.font = '11px monospace'; ctx.fillText(cells[i].cap, x, y + h + 13); });
      return c.toDataURL('image/png').split(',')[1];
    }, { cells });
  })();
  fs.writeFileSync(path.join(OUT, 'sheet_29b.png'), Buffer.from(b64, 'base64'));
  console.log('sheet written to reports/chunk29b/sheet_29b.png');
  await browser.close();
  const c = lib.counts(); process.exit(c.failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

// Chunk 28b contact sheet (a picture generator, not a test): the hub with its three tabs, the Achievements tab with Show completed off and on, every settings
// section, the Customization tab with a locked skin, trails in flight, and a Mitosis block split into halves and quarters. Output: reports/chunk28b/sheet_28b.png
// (and the single pictures next to it). Needs the Vite dev server. Run: node e2e/sheet-chunk28b.cjs   (adds ?debug=1 itself)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, tap, waitFor } = lib;
const OUT = path.join(__dirname, '..', 'reports', 'chunk28b');
fs.mkdirSync(OUT, { recursive: true });

const SHIP_BTN = [28, 26], SETTINGS_BTN = [128, 26];
const TAB = { ships: [101, 137], custom: [270, 137], ach: [439, 137] };
async function canvasShot(page, name) {
  const b = await page.locator('canvas').screenshot();
  if (name) fs.writeFileSync(path.join(OUT, name + '.png'), b);
  return b.toString('base64');
}
async function montage(page, shots, captions, file, per = 4) {
  const b64 = await page.evaluate(async ({ shots, captions, per }) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
    const k = 0.4, pad = 8, cap = 22;
    const w = Math.round(540 * k), h = Math.round(960 * k);
    const rows = Math.ceil(imgs.length / per);
    const c = document.createElement('canvas');
    c.width = per * (w + pad) + pad; c.height = rows * (h + cap + pad) + pad;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => {
      const x = pad + (i % per) * (w + pad), y = pad + Math.floor(i / per) * (h + cap + pad);
      ctx.drawImage(im, x, y, w, h);
      ctx.fillStyle = '#aaa'; ctx.font = '11px monospace'; ctx.fillText(captions[i], x, y + h + 15);
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { shots, captions, per });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}
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
  const { page } = await lib.openGame(browser, { rich: true });
  // The debug panel covers the right-hand column of the game: hide it for the whole run (the hooks do not need it).
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const shots = [], caps = [];
  const snap = async (cap, name) => { await page.waitForTimeout(200); shots.push(await canvasShot(page, name)); caps.push(cap); };

  // ---- hub
  await openHub(page, 'ships'); await snap('Hub: SHIPS', 'hub_ships');
  await openHub(page, 'custom'); await snap('Hub: CUSTOMIZATION (locked skins)', 'hub_custom');
  await page.evaluate(() => window.__mgbm.buildScreen.customPanel.scrollBy(400));
  await snap('Customization, scrolled to trails', 'hub_custom2');
  await openHub(page, 'ach'); await snap('Hub: ACHIEVEMENTS, Show completed OFF', 'hub_ach_off');
  const r = await page.evaluate(() => window.__mgbm.buildScreen.achPanel.buttonRect('showCompleted'));
  await tap(page, r.x + r.w / 2, r.y + r.h / 2);
  await waitFor(() => page.evaluate(() => window.__mgbm.buildScreen.achPanel.showCompleted), { timeout: 2000 });
  await snap('Achievements, Show completed ON', 'hub_ach_on');
  await page.evaluate(() => window.__mgbm.buildScreen.achPanel.show('challenges'));
  await snap('Challenges view', 'hub_challenges');
  await page.evaluate(() => window.__mgbm.buildScreen.closeHub());

  // ---- settings, every section (the list scrolls; wheel by amounts)
  await tap(page, ...SETTINGS_BTN, { pause: 200 });
  await waitFor(() => page.evaluate(() => window.__mgbmSm.overlays.current === 'settings'), { timeout: 3000 });
  const st = await page.evaluate(() => window.__mgbmSm.overlays.settingsState);
  check(st.contentH > 0, `settings list is ${st.contentH}px tall in a ${st.areaH}px window`);
  for (const [i, y] of [0, 330, 660, 1000].entries()) {
    await page.evaluate((y) => { const o = window.__mgbmSm.overlays; o.wheel(-5000); o.wheel(y); }, y);
    await snap(`Settings, scroll ${y} (${['Graphics', 'Controls', 'Audio', 'Data / About'][i]})`, `settings_${i}`);
  }
  await page.evaluate(() => { const o = window.__mgbmSm.overlays; o.wheel(5000); });
  await snap('Settings, bottom (About)', 'settings_end');
  await page.keyboard.press('Escape');

  // ---- trails in flight (Free Fly)
  const fly = async (trailMode) => {
    await page.evaluate((m) => window.__mgbmSfx.set('trails', m), trailMode);
    await page.evaluate(async () => { const m = await import('/src/debug/hooks.ts'); m.debugHooks.god = true; m.debugHooks.startFly(1); });
    await waitFor(() => page.evaluate(() => window.__mgbm.screen === 'fly'), { timeout: 5000 });
    const at = await lib.gameToClient(page, 270, 760);
    await page.mouse.move(at.x, at.y);
    await waitFor(() => page.evaluate(() => { const w = window.__mgbm.world; return w && w.pool && w.pool.active.some(Boolean); }), { timeout: 5000 });
    await page.waitForTimeout(500);
  };
  await fly('long'); await snap('Free Fly, trails Long', 'trails_long');
  await page.evaluate(() => window.__mgbm.screenObj && 0);
  await page.evaluate(() => window.__mgbmSm.currentScreen.quit && window.__mgbmSm.currentScreen.quit());
  await waitFor(() => page.evaluate(() => window.__mgbm.screen === 'build'), { timeout: 5000 });
  await fly('short'); await snap('Free Fly, trails Short', 'trails_short');
  await page.evaluate(() => window.__mgbmSm.currentScreen.quit && window.__mgbmSm.currentScreen.quit());
  await waitFor(() => page.evaluate(() => window.__mgbm.screen === 'build'), { timeout: 5000 });

  // ---- Mitosis Wall: a block into halves, then quarters (tier 127)
  await page.evaluate(async () => { const m = await import('/src/debug/hooks.ts'); m.debugHooks.god = true; m.debugHooks.startTier(127); });
  await waitFor(() => page.evaluate(() => window.__mgbm.screen === 'wall'), { timeout: 8000 });
  const pick = await page.evaluate(() => {
    const w = window.__mgbm.wall; w.autoFire = false; w.setWallOffset(560);
    const cols = w.level.cols; let best = null;
    for (const b of w.all) if (w.blocks[b.row * cols + b.col] === b && b.y > 250 && b.y < 600) { const sx = 270 + w.dxw(b.x, w.shipX); if (sx > 100 && sx < 440 && (!best || Math.abs(sx - 270) < best.d)) best = { idx: b.row * cols + b.col, d: Math.abs(sx - 270) }; }
    window.__cell = best.idx; return best;
  });
  const zoomShot = async (cap, name) => {
    const at = await page.evaluate(() => { const w = window.__mgbm.wall; const st = window.__mgbm.state(); const p = w.piecesAt(window.__cell)[0] || w.all.find(b => b.row * w.level.cols + b.col === window.__cell); return { x: st.shipScreenX + w.dxw(p.x - p.ox, w.shipX), y: p.y - p.oy }; });
    const full = await canvasShot(page);
    const z = await page.evaluate(async ({ shot, at }) => {
      const im = new Image(); im.src = 'data:image/png;base64,' + shot; await im.decode();
      const c = document.createElement('canvas'); c.width = 540; c.height = 960;
      const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
      const sx = Math.max(0, Math.min(540 - 135, at.x - 67)), sy = Math.max(0, Math.min(960 - 240, at.y - 120));
      ctx.drawImage(im, sx, sy, 135, 240, 0, 0, 540, 960);
      return c.toDataURL('image/png').split(',')[1];
    }, { shot: full, at });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(z, 'base64'));
    shots.push(z); caps.push(cap);
  };
  await page.evaluate(() => { const w = window.__mgbm.wall; window.__mgbm.timeScale = 0; });
  await zoomShot('Mitosis block before (x4)', 'mitosis_0');
  await page.evaluate(() => { const w = window.__mgbm.wall; w.destroyBlock(w.blocks[window.__cell]); });
  await zoomShot('Destroyed: two halves (x4)', 'mitosis_1');
  await page.evaluate(() => { const w = window.__mgbm.wall; for (const h of [...w.piecesAt(window.__cell)]) w.destroyBlock(h); });
  await zoomShot('Both halves destroyed: four squares (x4)', 'mitosis_2');
  await snap('Mitosis wall, whole screen', 'mitosis_full');

  await montage(page, shots, caps, path.join(OUT, 'sheet_28b.png'));
  await browser.close();
  const c = lib.counts();
  process.stdout.write(`\n${c.passes} passed, ${c.failures} failed\n`);
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { process.stdout.write(`FAIL  script error: ${e.stack || e}\n`); process.exit(1); });

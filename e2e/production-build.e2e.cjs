// Chunk 23a: the PRODUCTION build on a phone-sized screen. Runs `npm run build`, serves dist with `vite preview`
// (its own port, PREVIEW_PORT or 5191; it does not use the dev server) and checks: the page loads at 360 x 740, a run
// starts, nothing debug shows without ?debug=1, the manifest and icons are served, the version label is in Settings,
// pause-on-blur works, and a save moves from one browser to a fresh one with Export / Import.
// Run: node e2e/production-build.e2e.cjs      Screenshots: reports/chunk23a/
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const lib = require('./lib.cjs');
const { check } = lib;

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports', 'chunk23a');
fs.mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.PREVIEW_PORT || 5191);
const BASE = `http://127.0.0.1:${PORT}/`;
const PHONE = { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE); if (r.ok) return true; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

const gameToClient = async (page, gx, gy) => lib.gameToClient(page, gx, gy);
async function tapGame(page, gx, gy) {
  const p = await gameToClient(page, gx, gy);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(150);
}
const tapBtn = async (page, id) => {
  const c = await page.evaluate((i) => window.__mgbmSm.overlays.buttonCenter(i), id);
  if (!c) throw new Error('no settings button ' + id);
  await tapGame(page, c.x, c.y);
};

async function open(browser, url, init) {
  const ctx = await browser.newContext(PHONE);
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(800);
  return { ctx, page, errors };
}

(async () => {
  const build = spawnSync(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: ROOT, encoding: 'utf8' });
  check(build.status === 0 && fs.existsSync(path.join(ROOT, 'dist', 'index.html')), 'vite build produced dist/index.html');
  for (const f of ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) check(fs.existsSync(path.join(ROOT, 'dist', f)), `dist/${f} exists`);
  const server = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  let browser;
  try {
    check(await waitForServer(), `vite preview serves dist on port ${PORT}`);
    browser = await lib.chromium.launch({ headless: true });

    // 1. Plain link, no ?debug=1: the game loads and nothing debug shows.
    const a = await open(browser, BASE);
    const pg = a.page;
    check(await pg.locator('canvas').count() === 1, 'the canvas is there at 360 x 740');
    const nodebug = await pg.evaluate(() => ({ panel: !!document.getElementById('debug-panel'), sm: typeof window.__mgbmSm, hook: typeof window.__mgbm, stats: typeof window.__mgbmStats }));
    check(!nodebug.panel && nodebug.sm === 'undefined' && nodebug.hook === 'undefined' && nodebug.stats === 'undefined', `no debug panel or dev hooks without ?debug=1 (${JSON.stringify(nodebug)})`);
    const meta = await pg.evaluate(() => {
      const cs = getComputedStyle(document.body);
      return { manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href'), apple: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'),
        capable: document.querySelector('meta[name=apple-mobile-web-app-capable]')?.getAttribute('content'), overscroll: cs.overscrollBehaviorY, select: cs.userSelect,
        canvasTouch: getComputedStyle(document.querySelector('canvas')).touchAction };
    });
    check(meta.manifest === 'manifest.webmanifest' && meta.apple === 'apple-touch-icon.png' && meta.capable === 'yes', `manifest, touch icon and web-app-capable tags are in the page (${JSON.stringify(meta)})`);
    check(meta.overscroll === 'none' && meta.select === 'none' && meta.canvasTouch === 'none', 'no overscroll, no text selection, canvas touch-action none');
    const mf = await (await fetch(BASE + 'manifest.webmanifest')).json();
    check(mf.name === 'Mitosis Gun Builder' && mf.short_name === 'MGB' && mf.display === 'standalone' && mf.orientation === 'portrait' && mf.background_color === '#1c1c1e' && mf.theme_color === '#1c1c1e', 'manifest has the name, short name, standalone, portrait and #1c1c1e colours');
    for (const i of mf.icons) {
      const r = await fetch(BASE + i.src);
      const b = Buffer.from(await r.arrayBuffer());
      check(r.ok && b.readUInt32BE(16) === Number(i.sizes.split('x')[0]), `${i.src} is served and is ${i.sizes}`);
    }
    check(a.errors.length === 0, `no console errors on load (${a.errors.slice(0, 2).join(' | ')})`);
    await a.ctx.close();

    // 2. ?debug=1 works in the production build: panel, hooks, a run starts, pause on blur, settings.
    const seed = () => { try { if (!localStorage.getItem('mgbm.progress.v1') && !sessionStorage.getItem('seeded')) { localStorage.setItem('mgbm.progress.v1', JSON.stringify({ version: 11, credits: 777, owned: {}, runs: 5 })); sessionStorage.setItem('seeded', '1'); } } catch { /* ignore */ } };
    const b = await open(browser, BASE + '?debug=1&stats=1', seed);
    const p2 = b.page;
    const dbg = await p2.evaluate(() => ({ panel: !!document.getElementById('debug-panel'), cheats: !!document.getElementById('dbg-cheats'), sm: typeof window.__mgbmSm }));
    await p2.waitForTimeout(500);
    const dbg2 = await p2.evaluate(() => ({ cheats: !!document.getElementById('dbg-cheats') }));
    check(dbg.panel && (dbg.cheats || dbg2.cheats) && dbg.sm === 'object', `?debug=1 shows the debug panel with cheats and the hooks (${JSON.stringify({ ...dbg, ...dbg2 })})`);
    await p2.evaluate(() => { document.getElementById('debug-panel').style.display = 'none'; });

    await p2.evaluate(() => window.__mgbm.buildScreen.fly());
    await p2.waitForFunction(() => window.__mgbm && window.__mgbm.world, null, { timeout: 15000 });
    const p0 = await gameToClient(p2, 270, 700);
    await p2.touchscreen.tap(p0.x, p0.y);
    await p2.mouse.move(p0.x, p0.y); // the ship starts following on the first pointer move
    await p2.waitForTimeout(300);
    await p2.mouse.move(p0.x + 20, p0.y);
    await p2.waitForTimeout(1200);
    const t1 = await p2.evaluate(() => window.__mgbm.state().time);
    check(t1 > 0.5, `a run started and time advances (${t1.toFixed(1)} s)`);
    await p2.screenshot({ path: path.join(OUT, 'run-360x740.png') });

    // Phone switches apps: visibilitychange to hidden, and a window blur, both pause.
    await p2.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    check(await p2.evaluate(() => window.__mgbmSm.paused), 'the run pauses when the page goes to the background');
    await p2.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); window.__mgbmSm.resume(); });
    await p2.waitForTimeout(300);
    await p2.evaluate(() => window.dispatchEvent(new Event('blur')));
    check(await p2.evaluate(() => window.__mgbmSm.paused), 'the run pauses on window blur');
    await p2.evaluate(() => window.__mgbmSm.resume());
    await p2.evaluate(() => window.__mgbmSm.currentScreen.pausable.quit());
    await p2.waitForTimeout(800);

    // Settings: version label, save buttons.
    await p2.evaluate(() => window.__mgbmSm.overlays.openSettings(false));
    await p2.waitForTimeout(300);
    const label = await p2.evaluate(() => {
      const out = [];
      const walk = (n) => { if (typeof n.text === 'string') out.push(n.text); (n.children || []).forEach(walk); };
      walk(window.__mgbmSm.overlays.container);
      return out.find(t => /^v\S+ · \d{4}-\d{2}-\d{2}( +· +Time played \d+h \d+m)?$/.test(t)) || null;
    });
    check(!!label, `Settings shows the version label (${label})`);
    const btns = await p2.evaluate(() => ['exportSave', 'importSave'].map(i => !!window.__mgbmSm.overlays.buttonCenter(i)));
    check(btns[0] && btns[1], 'Settings has Export save and Import save');
    await p2.screenshot({ path: path.join(OUT, 'settings-360x740.png') });
    const stats = await p2.evaluate(() => window.__mgbmStats.shownText || '');
    check(/build v\S+/.test(stats) && !/dev server/.test(stats), `the stats overlay shows the build label without the dev server (${stats.split('\n').pop()})`);

    // Export.
    await tapBtn(p2, 'exportSave');
    await p2.waitForSelector('#export-text');
    const exported = await p2.inputValue('#export-text');
    check(exported.startsWith('MGBM1:') && exported.length > 100, `Export shows the save as one string (${exported.length} characters)`);
    await p2.screenshot({ path: path.join(OUT, 'export-360x740.png') });
    await p2.click('#export-close');
    await b.ctx.close();

    // 3. A fresh browser (no save): a bad string changes nothing, the good one loads.
    const c = await open(browser, BASE + '?debug=1');
    const p3 = c.page;
    await p3.evaluate(() => { document.getElementById('debug-panel').style.display = 'none'; });
    await p3.evaluate(() => window.__mgbmSm.overlays.openSettings(false));
    await p3.waitForTimeout(300);
    // The time-played counter may be saved between two reads (every 15 s); it is not part of what an import must leave alone.
    const readSave = () => p3.evaluate(() => { const o = JSON.parse(localStorage.getItem('mgbm.progress.v1')); if (o) delete o.timePlayed; return JSON.stringify(o); });
    const before = await readSave();
    await tapBtn(p3, 'importSave');
    await p3.waitForSelector('#import-text');
    await p3.fill('#import-text', 'MGBM1:garbage');
    await p3.click('#import-check');
    const bad = await p3.textContent('#import-msg');
    check(/Nothing was changed/.test(bad) && (await readSave()) === before, `a bad string is refused and changes nothing ("${bad}")`);
    await p3.fill('#import-text', exported);
    await p3.click('#import-check');
    const ask = await p3.textContent('#import-msg');
    check(/777 credits/.test(ask) && (await readSave()) === before, `a good string asks to confirm first, nothing written yet ("${ask}")`);
    await p3.screenshot({ path: path.join(OUT, 'import-confirm-360x740.png') });
    await Promise.all([p3.waitForEvent('load'), p3.click('#import-check')]);
    await p3.waitForSelector('canvas');
    const saved = await p3.evaluate(() => JSON.parse(localStorage.getItem('mgbm.progress.v1')));
    check(saved.credits === 777 && saved.runs >= 5 && saved.version === 12, `after confirming, the save moved over and was migrated to the current version (credits ${saved.credits}, runs ${saved.runs}, version ${saved.version})`);
    await c.ctx.close();
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
  const r = lib.counts();
  console.log(`${r.passes} passed, ${r.failures} failed`);
  process.exit(r.failures ? 1 : 0);
})().catch(e => { console.error('FAIL  script error: ' + (e && e.stack || e)); process.exit(1); });

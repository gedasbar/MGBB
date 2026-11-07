// Chunk 34c contact sheet (a picture generator, not a test): the amount widget in the run HUDs (close up) with a PIXEL measurement of how well the icon and the
// number are centred on one line, a run summary, a Shop Buy button (credits, and credits + Medals), the hull picker Buy, and the hub's Stats page.
// Output: reports/chunk34c/sheet_34c.png (and the single pictures next to it). Needs the Vite dev server. Run: node e2e/sheet-chunk34c.cjs
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, waitFor, tap } = lib;
const OUT = path.join(__dirname, '..', 'reports', 'chunk34c');
fs.mkdirSync(OUT, { recursive: true });
const SHOP_TAB = [162, 932];

async function canvasShot(page, name) {
  const b = await page.locator('canvas').screenshot();
  if (name) fs.writeFileSync(path.join(OUT, name + '.png'), b);
  return b.toString('base64');
}

/**
 * Finds the pixels of one colour in a region of a screenshot, splits them into groups of columns (a gap of 3+ empty columns starts a new group) and returns each group's
 * vertical extent: the first group is the icon, the next is the number. Centre = (top + bottom) / 2 in game px (the viewport is 540 x 960, scale 1).
 */
async function measure(page, b64, region, pred) {
  return page.evaluate(async ({ b64, region, pred }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const { x, y, w, h } = region;
    const d = ctx.getImageData(x, y, w, h).data;
    const test = new Function('r', 'g', 'b', 'return ' + pred);
    const cols = new Array(w).fill(null);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      if (d[k + 3] > 0 && test(d[k], d[k + 1], d[k + 2])) { const col = cols[i] || (cols[i] = { top: j, bottom: j }); col.top = Math.min(col.top, j); col.bottom = Math.max(col.bottom, j); }
    }
    const groups = []; let cur = null, gap = 0;
    for (let i = 0; i < w; i++) {
      if (cols[i]) { if (!cur || gap >= 3) { cur = { x0: i, x1: i, top: cols[i].top, bottom: cols[i].bottom }; groups.push(cur); } else { cur.x1 = i; cur.top = Math.min(cur.top, cols[i].top); cur.bottom = Math.max(cur.bottom, cols[i].bottom); } gap = 0; } else gap++;
    }
    return groups.map(g => ({ x: g.x0 + x, w: g.x1 - g.x0 + 1, top: g.top + y, bottom: g.bottom + y, centre: (g.top + g.bottom) / 2 + y }));
  }, { b64, region, pred });
}

/** A montage of crops: items = [{ shot, crop: {x, y, w, h}, scale, cap }], laid out left to right, wrapping at `width`. */
async function montage(page, items, file, width = 1100) {
  const b64 = await page.evaluate(async ({ items, width }) => {
    const imgs = await Promise.all(items.map(async (it) => { const i = new Image(); i.src = 'data:image/png;base64,' + it.shot; await i.decode(); return i; }));
    const pad = 10, cap = 22;
    const pos = []; let x = pad, y = pad, rowH = 0;
    items.forEach((it) => {
      const w = Math.round(it.crop.w * it.scale), h = Math.round(it.crop.h * it.scale);
      if (x + w + pad > width && x > pad) { x = pad; y += rowH + cap + pad; rowH = 0; }
      pos.push({ x, y, w, h }); x += w + pad; rowH = Math.max(rowH, h);
    });
    const c = document.createElement('canvas');
    c.width = width; c.height = y + rowH + cap + pad;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    items.forEach((it, i) => {
      const p = pos[i];
      ctx.drawImage(imgs[i], it.crop.x, it.crop.y, it.crop.w, it.crop.h, p.x, p.y, p.w, p.h);
      ctx.fillStyle = '#aaa'; ctx.font = '12px monospace'; ctx.fillText(it.cap, p.x, p.y + p.h + 15);
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { items, width });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: true });
  const items = [];
  const hide = () => page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const COIN = 'r > 200 && g > 150 && b < 110';
  const TEAL = 'r < 120 && g > 150 && b > 130';
  const centresOk = (m, label) => {
    check(m.length >= 2, `${label}: found an icon and a number (${m.length} groups)`);
    if (m.length < 2) return;
    const icon = m[0], num = m[1];
    const diff = Math.abs(icon.centre - num.centre);
    console.log(`INFO  ${label}: icon rows ${icon.top}-${icon.bottom} (centre ${icon.centre}), number rows ${num.top}-${num.bottom} (centre ${num.centre}), difference ${diff} px`);
    check(diff <= 1, `${label}: the number is centred on its icon within 1 px (difference ${diff})`);
  };

  // ---- Free Fly HUD
  check((await lib.startFreeFly(page)) !== 'noEjector', 'free fly started');
  await waitFor(() => page.evaluate(() => !!window.__mgbm && !!window.__mgbm.world));
  await page.evaluate(() => { const w = window.__mgbm.world; w.god = true; w.autoSpawn = false; w.credits = 1234; w.cores = 56; });
  await hide();
  await page.waitForTimeout(400);
  let shot = await canvasShot(page, 'hud-freefly');
  const row = { x: 14, y: 52, w: 260, h: 34 };
  centresOk((await measure(page, shot, row, COIN)), 'Free Fly credits');
  const tealGroups = await measure(page, shot, row, TEAL);
  centresOk(tealGroups, 'Free Fly Cores');
  items.push({ shot, crop: { x: 0, y: 28, w: 270, h: 110 }, scale: 3, cap: 'Free Fly HUD (x3): coin + credits, hexagon + Cores' });

  // ---- summary of that run (Free Fly)
  await page.evaluate(() => { const w = window.__mgbm.world; w.god = false; w.hull = 0; w.gameOver = true; });
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'summary', null, { timeout: 8000 });
  await page.waitForTimeout(900);
  await hide();
  shot = await canvasShot(page, 'summary');
  items.push({ shot, crop: { x: 0, y: 0, w: 540, h: 960 }, scale: 0.8, cap: 'Free Fly summary: credits, Cores, total credits' });
  const sm = await measure(page, shot, { x: 0, y: 560, w: 540, h: 70 }, COIN);
  console.log('INFO  summary total-credits row groups:', JSON.stringify(sm.map(g => [g.x, g.top, g.bottom])));

  // ---- Wall HUD
  await lib.openCampaign(page, 1);
  await lib.startTier(page, 1);
  await waitFor(() => page.evaluate(() => !!window.__mgbm && !!window.__mgbm.wall));
  await page.evaluate(() => { const w = window.__mgbm.wall; w.creditsExact = 1234; });
  await hide();
  await page.waitForTimeout(500);
  shot = await canvasShot(page, 'hud-wall');
  const wall = await measure(page, shot, { x: 0, y: 0, w: 280, h: 60 }, COIN);
  centresOk(wall, 'Wall credits');
  items.push({ shot, crop: { x: 0, y: 0, w: 270, h: 150 }, scale: 3, cap: 'Wall HUD (x3): coin + credits' });

  await browser.close();

  // ---- second game: Shop Buy buttons, hull picker, hub Stats page
  const b2 = await lib.chromium.launch({ headless: true });
  const g2 = await lib.openGame(b2, { rich: true, tiers: false });
  const pg = g2.page;
  const hide2 = () => pg.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  await tap(pg, ...SHOP_TAB);
  await pg.waitForFunction(() => window.__mgbm && window.__mgbm.shopScreen);
  await pg.evaluate(() => {
    const s = window.__mgbm.shopScreen.store;
    s.data.credits = 1234567; s.data.medals = 40;
    s.data.owned.flat_plus = 2;
    for (const id of ['frontier_echo', 'payload']) s.data.owned[id] = 0;
    s.data.frontier.sq = {}; s.data.frontier.sq['0,-100'] = 2;
    s.commit(); s.data.medals = 40; s.commit();
  });
  await pg.waitForTimeout(300);
  await pg.evaluate(() => window.__mgbm.shopScreen.palette.select('flat_plus'));
  await pg.waitForTimeout(300);
  await hide2();
  shot = await canvasShot(pg, 'shop-buy');
  items.push({ shot, crop: { x: 0, y: 700, w: 540, h: 260 }, scale: 1.3, cap: 'Shop sheet: Buy +1 [coin] and Upgrade [coin]' });
  await pg.evaluate(() => window.__mgbm.shopScreen.palette.select('frontier_echo'));
  await pg.waitForTimeout(300);
  await hide2();
  shot = await canvasShot(pg, 'shop-legendary');
  items.push({ shot, crop: { x: 0, y: 700, w: 540, h: 260 }, scale: 1.3, cap: 'Legendary: [coin] 8K + [medal] 15 on one Buy button' });
  const dual = await pg.evaluate(() => window.__mgbm.state().sheet);
  console.log('INFO  legendary sheet buy label:', JSON.stringify(dual && dual.buy && dual.buy.label));

  // Build screen -> hub -> Stats
  await pg.evaluate(() => window.__mgbmNav && window.__mgbmNav.openMapTab && 0);
  await tap(pg, 54, 932);
  await pg.waitForFunction(() => window.__mgbm && window.__mgbm.buildScreen);
  await pg.evaluate(() => {
    const st = window.__mgbm.buildScreen.model.store.data;
    st.stats.runsCampaign = 41; st.stats.runsFrontier = 12; st.stats.runsFreeFly = 27; st.stats.blocks = 18340; st.stats.rocks = 9120;
    st.stats.bossKills = { hive: 3, bastion: 1 }; st.stats.damage = 3.4e9; st.stats.credits = 2.5e6; st.stats.cores = 4300; st.stats.medals = 61;
    st.stats.hullRuns = { dart: 30, twin: 22, prong: 28 };
    st.records.bestShot = 125000; st.records.bestAvgDps = 8800; st.bestWave = 34; st.timePlayed = 5 * 3600 + 25 * 60;
    window.__mgbm.buildScreen.model.store.commit();
    window.__mgbm.buildScreen.openHub('ach');
    window.__mgbm.buildScreen.achPanel.show('stats');
  });
  await pg.waitForTimeout(500);
  await hide2();
  shot = await canvasShot(pg, 'stats-1');
  items.push({ shot, crop: { x: 0, y: 100, w: 540, h: 860 }, scale: 0.9, cap: 'Hub > Stats (top)' });
  await pg.evaluate(() => { const p = window.__mgbm.buildScreen.achPanel; p.scrollBy(900); });
  await pg.waitForTimeout(300);
  shot = await canvasShot(pg, 'stats-2');
  items.push({ shot, crop: { x: 0, y: 100, w: 540, h: 860 }, scale: 0.9, cap: 'Hub > Stats (scrolled: Earned in all, since line)' });
  const st = await pg.evaluate(() => window.__mgbm.buildScreen.achPanel.state());
  check(st.view === 'stats' && st.rows.some(r => r.id === 'Credits' && /^credits:/.test(r.text)), 'the Stats view lists Credits as an amount');
  await pg.evaluate(() => { const p = window.__mgbm.buildScreen.achPanel; p.show('achievements'); });
  await pg.waitForTimeout(300);
  shot = await canvasShot(pg, 'achievements');
  items.push({ shot, crop: { x: 0, y: 100, w: 540, h: 300 }, scale: 1.3, cap: 'Achievements view: 3-way switch, Medals [icon] N, rewards' });

  // hull picker with a Buy button
  await pg.evaluate(() => { window.__mgbm.buildScreen.closeHub(); });
  await pg.waitForTimeout(200);
  await montage(pg, items, path.join(OUT, 'sheet_34c.png'));
  await b2.close();
  const { passes, failures } = lib.counts();
  console.log(`
${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

// Chunk 35a contact sheet (a picture generator, not a test), 540 x 960: the DAILY card in the Map carousel, the Daily screen (quests with progress, a done quest, the bonus line, the twist,
// reward tiers, the 7-day history), a twist banner at the start of the daily run, a Fog day with enemies near and far from the ship, and the daily run's summary.
// Output: reports/chunk35a/sheet_35a.png (and the single pictures next to it). Needs the Vite dev server. Run: node e2e/sheet-chunk35a.cjs   (adds ?debug=1 itself)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, waitFor, state } = lib;
const OUT = path.join(__dirname, '..', 'reports', 'chunk35a');
fs.mkdirSync(OUT, { recursive: true });

const onScreen = (page, name, timeout = 8000) => waitFor(() => page.evaluate((n) => window.__mgbm && window.__mgbm.screen === n, name), { timeout });
async function canvasShot(page, name) {
  const b = await page.locator('canvas').screenshot();
  if (name) fs.writeFileSync(path.join(OUT, name + '.png'), b);
  return b.toString('base64');
}
async function montage(page, items, file, width = 1500) {
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
    items.forEach((it, i) => { const p = pos[i]; ctx.drawImage(imgs[i], it.crop.x, it.crop.y, it.crop.w, it.crop.h, p.x, p.y, p.w, p.h); ctx.fillStyle = '#aaa'; ctx.font = '12px monospace'; ctx.fillText(it.cap, p.x, p.y + p.h + 15); });
    return c.toDataURL('image/png').split(',')[1];
  }, { items, width });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: true, tiers: true, viewport: { width: 540, height: 960 } });
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const items = [];
  const full = { x: 0, y: 0, w: 540, h: 960 };

  // ---- Seed an interesting day: open the Daily screen (draws the quests), then write some progress into the save and reload.
  check(await page.evaluate(() => window.__mgbmNav.openMode('daily')) && await onScreen(page, 'daily'), 'the Daily screen opens');
  const info = await state(page);
  const prog = await page.evaluate(() => JSON.parse(JSON.stringify(window.__mgbmStore.data.daily)));
  const q = prog.quests;
  q[0].progress = Math.max(1, Math.floor(q[0].n * 0.6));
  q[1].progress = q[1].n; q[1].done = true;
  q[2].progress = Math.floor(q[2].n * 0.25);
  prog.runBest = 12; prog.runPaid = [5, 10];
  const dayShift = (key, n) => { const [y, m, d] = key.split('-').map(Number); const t = new Date(y, m - 1, d - n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
  prog.history = [[6, 9], [5, 14], [3, 7], [2, 22], [1, 17]].map(([ago, best]) => ({ day: dayShift(info.today, ago), best })).sort((a, b) => (a.day < b.day ? -1 : 1));
  await page.evaluate((d) => { window.__mgbmStore.data.daily = d; window.__mgbmStore.commit(); }, prog);

  // ---- 1. The carousel with DAILY centred.
  await page.evaluate(() => window.__mgbmNav.backToCarousel('daily'));
  await page.evaluate(() => window.__mgbmNav.openMapTab());
  check(await onScreen(page, 'carousel'), 'the carousel is open');
  await page.evaluate(() => window.__mgbm.carousel.goTo(3));
  await waitFor(async () => Math.abs((await state(page)).pos - 3) < 0.005, { timeout: 3000 });
  await page.waitForTimeout(500);
  const card = (await state(page)).cards[3];
  console.log('DAILY card line:', card.line);
  items.push({ shot: await canvasShot(page, 'carousel_daily'), crop: full, scale: 0.55, cap: `Map carousel, DAILY centred: "${card.line}"` });

  // ---- 2. The Daily screen.
  check(await page.evaluate(() => window.__mgbmNav.openMode('daily')) && await onScreen(page, 'daily'), 'the Daily screen opens again');
  await page.waitForTimeout(500);
  const s = await state(page);
  console.log('quests:', s.quests.map(x => `${x.text} ${x.progress}/${x.n}${x.done ? ' DONE' : ''}`).join(' | '), '| twist', s.twist, '| history', s.history.map(h => h.best).join(','), '|', s.countdown);
  const daily = await canvasShot(page, 'daily_screen');
  items.push({ shot: daily, crop: full, scale: 0.9, cap: 'Daily screen: quests (progress, DONE, reroll), bonus, twist, reward tiers, history' });
  items.push({ shot: daily, crop: { x: 0, y: 440, w: 540, h: 400 }, scale: 1.4, cap: 'close-up: daily run card, reward tiers (W5, W10 paid), last 7 days' });

  // ---- 3. The twist banner as the daily run starts (time slowed so the 1.5 s banner can be photographed).
  const twist0 = s.twist;
  await page.evaluate(() => window.__mgbmNav.startDaily());
  await waitFor(() => page.evaluate(() => !!window.__mgbm && !!window.__mgbm.world), { timeout: 8000 });
  await page.evaluate(() => window.__mgbm.setTimeScale(0.04));
  await waitFor(async () => { const t = (await state(page)).themeBanner; return t && t.title; }, { timeout: 4000 });
  await page.waitForTimeout(300);
  const st = await state(page);
  console.log('banner:', JSON.stringify(st.themeBanner), '| hud', st.hud.wave, '| twist numbers', JSON.stringify(st.twist));
  items.push({ shot: await canvasShot(page, 'twist_banner'), crop: full, scale: 0.9, cap: `Daily run start: twist banner "${st.themeBanner && st.themeBanner.title}" and the twist name on the wave line` });
  await page.evaluate(() => { window.__mgbm.setTimeScale(1); const w = window.__mgbm.world; w.hull = 0; w.gameOver = true; });

  // ---- 4. The daily run's summary.
  check(await onScreen(page, 'summary', 12000), 'the summary opens');
  await page.waitForTimeout(400);
  items.push({ shot: await canvasShot(page, 'summary'), crop: full, scale: 0.9, cap: 'Daily run summary: twist as the title, "Today\'s best wave" row' });

  // ---- 5. A Fog day: step the clock forward until the twist is Fog, fly with rocks near and far.
  check(await page.evaluate(() => window.__mgbmNav.openMode('daily')) && await onScreen(page, 'daily'), 'back on the Daily screen');
  let guard = 0;
  while ((await state(page)).twist !== 'fog' && guard++ < 8) {
    const before = (await state(page)).day;
    await page.evaluate(() => window.__mgbmNav.nextDay());
    await waitFor(async () => (await state(page)).day !== before, { timeout: 3000 });
  }
  check((await state(page)).twist === 'fog', `reached a Fog day after ${guard} "Next day" steps`);
  await page.evaluate(() => window.__mgbmNav.startDaily());
  await waitFor(() => page.evaluate(() => !!window.__mgbm && !!window.__mgbm.world), { timeout: 8000 });
  await page.evaluate(() => {
    const w = window.__mgbm.world;
    w.autoSpawn = false; w.god = true; w.mitosis.enemies.length = 0;
    window.__mgbm.setTimeScale(0.02);
    const cx = w.shipX, cy = w.shipY;
    for (const [dx, dy] of [[0, -90], [-110, -40], [150, -150], [-170, -230], [60, -300], [200, -380]]) w.spawnSpecies('mitotic_rock', Math.max(30, Math.min(510, cx + dx)), cy + dy);
  });
  await page.waitForTimeout(500);
  const fs2 = await state(page);
  const dist = fs2.enemies.map(e => Math.round(Math.hypot(e.x - fs2.shipX, e.y - fs2.shipY)));
  console.log('fog: distances', dist.join(','), '| alphas', fs2.enemyAlphas.map(a => a.toFixed(2)).join(','));
  check(fs2.enemyAlphas.length === 6 && Math.max(...fs2.enemyAlphas) === 1 && Math.min(...fs2.enemyAlphas) === 0, 'near rocks fully visible, far ones invisible');
  items.push({ shot: await canvasShot(page, 'fog_day'), crop: full, scale: 0.9, cap: `Fog day: 6 rocks at ${dist.join(', ')} px from the ship, alpha ${fs2.enemyAlphas.map(a => a.toFixed(2)).join(', ')}` });
  await page.evaluate(() => { window.__mgbm.setTimeScale(1); window.__mgbm.world.god = false; });
  await page.evaluate(() => window.__mgbmNav.backToToday());

  await montage(page, items, path.join(OUT, 'sheet_35a.png'));
  await browser.close();
  const c = lib.counts();
  console.log(`\n${c.passes} passed, ${c.failures} failed`);
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

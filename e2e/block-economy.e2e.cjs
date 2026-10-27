// Chunk 16c-2 end-to-end: the Shop at a copy cap ("Max"), a block without upgrades (no level line, no Upgrade button), a heavy stacked build in
// flight with its frame rate against a plain build, and the hero level screen above level 10. Writes reports/chunk16c2/sheet_economy.png.
// Needs the Vite dev server. Run: node e2e/block-economy.e2e.cjs   (adds ?debug=1 itself)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, tap, gameToClient } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk16c2');
fs.mkdirSync(OUT, { recursive: true });
const TAB = { build: [54, 932], shop: [162, 932], captain: [270, 932] };
const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];

async function canvasShot(page) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const b = await page.locator('canvas').screenshot();
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
  return b.toString('base64');
}
async function montage(page, shots, captions, file) {
  const b64 = await page.evaluate(async ({ shots, captions }) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
    const w = 540, h = 960, k = 0.6, pad = 8, cap = 52;
    const c = document.createElement('canvas');
    c.width = imgs.length * (w * k + pad) + pad; c.height = h * k + cap + pad;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => {
      ctx.drawImage(im, pad + i * (w * k + pad), pad, w * k, h * k);
      ctx.fillStyle = '#bbb'; ctx.font = '12px monospace';
      captions[i].split('\n').forEach((line, j) => ctx.fillText(line, pad + i * (w * k + pad), h * k + pad + 16 + j * 14));
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { shots, captions });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}
const moveTo = async (page, gx, gy) => { const p = await gameToClient(page, gx, gy); await page.mouse.move(p.x, p.y); };
const shopRow = (page, id) => page.evaluate((i) => window.__mgbm.state().rows.find(r => r.key === i), id);

/** Frame times (ms) over `n` animation frames. */
const frames = (page, n) => page.evaluate((count) => new Promise((resolve) => {
  const t = []; let last = performance.now();
  const f = (now) => { t.push(now - last); last = now; if (t.length < count) requestAnimationFrame(f); else resolve(t); };
  requestAnimationFrame(f);
}), n);
const fpsOf = (t) => { const s = [...t].sort((a, b) => a - b); const mean = t.reduce((a, b) => a + b, 0) / t.length; return { fps: 1000 / mean, p95: s[Math.floor(s.length * 0.95)] }; };

/** The Fan's long snake: [x, y, turn] with turn -1 = Turn Left, 1 = Turn Right, 0 = a straight cell (0-indexed cells). */
function snake() {
  const path = [[4, 8, -1]];
  for (let x = 3; x >= 1; x--) path.push([x, 8, 0]);
  path.push([0, 8, 1]);
  let east = true;
  for (let y = 7; y >= 2; y--) {
    const start = east ? 0 : 8, end = east ? 8 : 0;
    path.push([start, y, east ? 1 : -1]);
    for (let x = start + (east ? 1 : -1); x !== end; x += east ? 1 : -1) path.push([x, y, 0]);
    path.push([end, y, east ? -1 : 1]);
    east = !east;
  }
  path.push([0, 1, 1]);
  for (let x = 1; x <= 6; x++) path.push([x, 1, 0]);
  path.push([7, 1, -1]);
  return path;
}

/**
 * Free Fly at `wave` with a circuit on the Fan, god mode on, ship sweeping under the lowest rock; returns a screenshot and the frame rate.
 * `plan` is either a list of block ids up the middle column or { snake: [ids cycled over the 51 straight cells] }.
 */
async function fly(page, plan, wave) {
  await tap(page, ...TAB.build);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.model);
  await page.evaluate(({ plan, path }) => {
    const m = window.__mgbm.model;
    m.switchHull('fan');
    for (const id of Object.keys(m.store.data.owned)) m.store.data.owned[id] = Math.max(m.store.data.owned[id], 60);
    for (let y = 0; y < m.grid.h; y++) for (let x = 0; x < m.grid.w; x++) { const c = m.grid.cells[y * m.grid.w + x]; if (c.type === 'empty' && c.blockId) m.remove(x, y); }
    const put = (x, y, id) => { const res = m.place(x, y, id); if (!res.ok) throw new Error(`${id} at ${x},${y}: ${res.error}`); };
    if (Array.isArray(plan)) plan.forEach((id, k) => put(4, 8 - k, id));
    else { let n = 0; for (const [x, y, t] of path) put(x, y, t === 0 ? plan.snake[n++ % plan.snake.length] : t < 0 ? 'turn_l' : 'turn_r'); }
  }, { plan, path: snake() });
  const built = await page.evaluate(() => { const m = window.__mgbm.model; return { recipes: m.compiled.recipes.length, warnings: m.compiled.warnings, placed: m.grid.cells.filter(c => c.blockId).length }; });
  console.log('circuit:', JSON.stringify(built));
  await page.evaluate((w) => { document.getElementById('dbg-wave-n').value = String(w); document.getElementById('dbg-start-wave').click(); }, wave);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.world && window.__mgbm.state().viewW, null, { timeout: 8000 });
  await page.evaluate(() => { const g = document.getElementById('dbg-god'); if (!g.checked) g.click(); });
  await page.evaluate(() => { window.__peak = 0; const f = () => { const w = window.__mgbm && window.__mgbm.world; if (w) window.__peak = Math.max(window.__peak, w.pool.count); requestAnimationFrame(f); }; f(); });
  await moveTo(page, 270, 760);
  const t0 = Date.now();
  while (Date.now() - t0 < 6000) {
    const s = await page.evaluate(() => window.__mgbm.state());
    const rocks = (s.enemies || []).filter(e => e.y < 740).sort((a, b) => b.y - a.y);
    await moveTo(page, Math.max(24, Math.min(516, rocks.length ? rocks[0].x : 270)), 760);
    await page.waitForTimeout(80);
  }
  const t = await frames(page, 180);
  const shot = await canvasShot(page);
  const st = await page.evaluate(() => window.__mgbm.state());
  const peak = await page.evaluate(() => window.__peak);
  return { shot, ...fpsOf(t), peak, kills: st.kills, wave: st.wave, projectiles: st.projectiles, recipes: st.recipes };
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 1000, height: 960 }, rich: true }); // wide, so the debug panel does not cover the game's right side
  await page.waitForSelector('#dbg-cheats');

  // ---- Shop: a block at its cap
  await tap(page, ...TAB.shop);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.shopScreen);
  await page.evaluate(() => {
    const s = window.__mgbm.shopScreen;
    s.store.data.credits = 1e7;
    s.store.data.owned.turn_l = 20;
    s.store.data.owned.percent_mult = 3;
    s.store.data.owned.piercing = 2;
    s.store.commit();
  });
  await page.waitForTimeout(200);
  const tapTile = async (id) => {
    await page.evaluate((i) => window.__mgbm.shopScreen.palette.reveal(i), id);
    const r = await page.evaluate((i) => window.__mgbm.shopScreen.palette.tileScreenRect(i), id);
    await tap(page, ...centre(r));
  };
  await tapTile('turn_l');
  let row = await shopRow(page, 'turn_l');
  let content = await page.evaluate(() => { const c = window.__mgbm.shopScreen.palette.content; return c && { owned: c.ownedLine, level: c.levelLine, buy: c.buy, upgrade: c.upgrade }; });
  check(content && content.owned === 'Owned 20 / 20', `Turn Left at its cap reads "${content && content.owned}"`);
  check(content && content.buy && content.buy.label === 'Max' && content.buy.enabled === false, `Buy reads "${content && content.buy && content.buy.label}" and is disabled`);
  check(content && content.level === '' && content.upgrade === null, 'Turn Left has no level line and no Upgrade button');
  const bought = await page.evaluate(() => { const b = window.__mgbm.shopScreen.store.buyCopy('turn_l'); return b; });
  check(bought.ok === false && (await page.evaluate(() => window.__mgbm.shopScreen.store.data.owned.turn_l)) === 20, `a 21st Turn Left cannot be bought ("${bought.error}")`);
  const shotMax = await canvasShot(page);

  // ---- Shop: a block with upgrades below its cap, and a stacking block without a cap
  await tapTile('percent_mult');
  content = await page.evaluate(() => { const c = window.__mgbm.shopScreen.palette.content; return c && { owned: c.ownedLine, level: c.levelLine, buy: c.buy && c.buy.label, upgrade: c.upgrade && c.upgrade.label }; });
  check(content.owned === 'Owned 3 / 10' && /^Level 1\/10$/.test(content.level) && /^Buy \+1\n220$/.test(content.buy) && /^Upgrade L1→L2\n200$/.test(content.upgrade), `Percent x: ${JSON.stringify(content)}`);
  await tapTile('piercing');
  content = await page.evaluate(() => { const c = window.__mgbm.shopScreen.palette.content; return c && { owned: c.ownedLine, level: c.levelLine, buy: c.buy && c.buy.label, upgrade: c.upgrade }; });
  check(content.owned === 'Owned 2' && content.level === '' && content.upgrade === null && /^Buy \+1\n(\d+)/.test(content.buy), `Piercing (no cap, no levels): ${JSON.stringify(content)}`);
  const shotPiercing = await canvasShot(page);

  // ---- Free Fly: a plain build against a heavy stacked build
  const plain = await fly(page, ['flat_plus', 'percent_mult'], 3);
  console.log(`plain build: ${plain.fps.toFixed(1)} fps, p95 frame ${plain.p95.toFixed(1)} ms, peak ${plain.peak} projectiles, ${plain.kills} kills, wave ${plain.wave}`);
  // Back to the menu is a reload: the saved circuit and progress persist.
  await page.reload();
  await page.waitForFunction(() => window.__mgbm);
  await page.waitForSelector('#dbg-cheats');
  const heavy = await fly(page, { snake: ['fork_impact', 'piercing', 'bouncing'] }, 3);
  console.log(`heavy build: ${heavy.fps.toFixed(1)} fps, p95 frame ${heavy.p95.toFixed(1)} ms, peak ${heavy.peak} projectiles, ${heavy.kills} kills, wave ${heavy.wave}`);
  check(heavy.peak > plain.peak, `the stacked build puts more projectiles in the air (peak ${heavy.peak} against ${plain.peak})`);
  check(heavy.fps >= plain.fps * 0.7, `the heavy build holds the frame rate: ${heavy.fps.toFixed(1)} fps against ${plain.fps.toFixed(1)} fps for the plain build (>= 70%)`);
  check(heavy.p95 < 50, `heavy build p95 frame time ${heavy.p95.toFixed(1)} ms (< 50)`);

  // ---- Captain tab: a hero level above 10
  await page.reload();
  await page.waitForFunction(() => window.__mgbm);
  await page.waitForSelector('#dbg-cheats');
  await page.evaluate(() => { document.getElementById('dbg-cap-level-n').value = '25'; document.getElementById('dbg-cap-level').click(); document.getElementById('dbg-medal-100').click(); });
  await tap(page, ...TAB.captain);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.captainScreen);
  let cs = await page.evaluate(() => window.__mgbm.state());
  const cadet = cs.buttons.find(b => b.id === 'card:cadet');
  await tap(page, ...centre(cadet.rect));
  cs = await page.evaluate(() => window.__mgbm.state());
  const hero = cs.buttons.find(b => b.id === 'hero');
  check(!!hero && hero.enabled && /Upgrade \+0\.5 - 95 Medals/.test(hero.label), `hero level 25 -> 26 costs "${hero && hero.label}" (round(1.2^25) = 95 expected)`);
  const savedLevel = await page.evaluate(() => JSON.parse(localStorage.getItem('mgbm.progress.v1')).captains.heroes.cadet.level);
  check(savedLevel === 25, `saved hero level ${savedLevel}`);
  await page.waitForTimeout(600);
  await tap(page, ...centre(hero.rect), { pause: 600 });
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('mgbm.progress.v1')));
  check(after.captains.heroes.cadet.level === 26 && after.version === 8, `bought level 26 (level ${after.captains.heroes.cadet.level}, medals ${after.medals}, version ${after.version})`);
  const shotHero = await canvasShot(page);

  await montage(page, [shotMax, shotPiercing, heavy.shot, shotHero],
    ['Shop: Turn Left at 8 / 8, Buy reads Max,\nno level line, no Upgrade button',
      'Shop: Piercing, no cap, no levels\n(Buy only, price rises per copy)',
      `Free Fly wave 3: Fork, Piercing, Bouncing x17\n${heavy.fps.toFixed(0)} fps (plain ${plain.fps.toFixed(0)}), peak ${heavy.peak} shots`,
      'Captain: hero level above 10\n(no cap, geometric cost)'],
    path.join(OUT, 'sheet_economy.png'));
  console.log('wrote reports/chunk16c2/sheet_economy.png');
  await browser.close();
  const c = lib.counts();
  console.log(`${c.passes} passed, ${c.failures} failed`);
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

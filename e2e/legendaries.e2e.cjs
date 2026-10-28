// Chunk 20a end-to-end: the legendary blocks in the real game. Shop tiles (locked and unlocked), the two-price info sheet and a
// purchase that takes credits AND Medals, the Frontier Unlocks panel with the new rings, and Mirror / Zigzag in real Free Fly flight.
// Contact sheet: reports/chunk20a/sheet_legendaries.png. Needs the Vite dev server. Run: node e2e/legendaries.e2e.cjs
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
for (const [k, v] of [['debug', 1], ['stats', 0]]) {
  if (!new RegExp(`[?&]${k}=`).test(url)) url += (url.includes('?') ? '&' : '?') + `${k}=${v}`;
}
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, tap } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk20a');
fs.mkdirSync(OUT, { recursive: true });
const TAB = { build: [54, 932], shop: [162, 932], map: [486, 930] };
const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const LEGENDARY = ['frontier_echo', 'payload', 'lone_shot', 'last_breath', 'zigzag', 'heavy_round', 'hollow_core', 'idle_barrels', 'waypoint', 'rebound', 'mirror', 'fuse'];
const pal = (page, expr, arg) => page.evaluate(new Function('arg', `const p = window.__mgbm.shopScreen.palette; return (${expr});`), arg);
const waitScreen = (page, name, timeout = 8000) => page.waitForFunction((n) => window.__mgbm && window.__mgbm.screen === n, name, { timeout });

async function snap(page) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const b = await page.locator('canvas').screenshot();
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
  return b;
}

async function montage(page, shots, captions, file, k) {
  const b64 = await page.evaluate(async ({ shots, captions, k }) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
    const pad = 8, cap = 64;
    const hs = imgs.map(im => im.height * k);
    const widths = imgs.map(im => im.width * k);
    const c = document.createElement('canvas');
    c.width = widths.reduce((a, b) => a + b + pad, pad);
    c.height = Math.max(...hs) + cap + pad;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    let x = pad;
    imgs.forEach((im, i) => {
      ctx.drawImage(im, x, pad, widths[i], hs[i]);
      ctx.fillStyle = '#ccc'; ctx.font = '13px monospace';
      captions[i].split('\n').forEach((line, j) => ctx.fillText(line, x, hs[i] + pad + 16 + j * 15));
      x += widths[i] + pad;
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { shots: shots.map(b => b.toString('base64')), captions, k });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}

async function tapTile(page, id) {
  await page.evaluate((i) => window.__mgbm.shopScreen.palette.reveal(i), id);
  const r = await page.evaluate((i) => window.__mgbm.shopScreen.palette.tileScreenRect(i), id);
  await tap(page, ...centre(r));
}

/** Clears the Fan's circuit, places `blocks` ([id, col, row], 0-based, in path order) and flies Free Fly with it. */
async function flyFan(page, blocks) {
  await page.goto(url);
  await page.waitForFunction(() => !!window.__mgbm);
  await page.waitForTimeout(400);
  await tap(page, ...TAB.build);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.buildScreen);
  const placed = await page.evaluate((blocks) => {
    const m = window.__mgbm.model;
    m.switchHull('fan');
    for (const c of m.grid.cells.filter(c => c.blockId)) m.remove(c.x, c.y);
    for (const [id, x, y] of blocks) m.place(x, y, id);
    window.__mgbm.buildScreen.refresh();
    return m.grid.cells.filter(c => c.blockId).map(c => c.blockId);
  }, blocks);
  await page.evaluate(() => window.__mgbm.buildScreen.fly());
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.world && window.__mgbm.state().viewW, null, { timeout: 5000 });
  await page.evaluate(() => {
    const w = window.__mgbm.world;
    w.god = true; w.hull = 1e9; w.invuln = 1e9;
    w.mitosis.enemies.length = 0; // no rocks: the shots fly their whole path
    w.autoSpawn = false;
  });
  return placed;
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 540, height: 960 }, rich: true });
  const shots = [];
  const caps = [];

  // ---- Shop: the twelve tiles, the first reached (Frontier Echo, ring 100 North), the rest locked.
  await tap(page, ...TAB.shop);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.shopScreen);
  await page.evaluate(() => {
    const s = window.__mgbm.shopScreen.store;
    s.data.credits = 1e7;
    s.data.medals = 14;
    for (const id of ['frontier_echo', 'payload', 'lone_shot', 'last_breath', 'zigzag', 'heavy_round', 'hollow_core', 'idle_barrels', 'waypoint', 'rebound', 'mirror', 'fuse']) s.data.owned[id] = 0;
    s.data.frontier.sq = {};
    s.data.frontier.sq['0,-100'] = 2; // North ring 100 cleared (a lattice square: never a hole)
    s.commit();
  });
  await page.waitForTimeout(250);
  let st = await page.evaluate(() => window.__mgbm.state());
  const rows = Object.fromEntries(st.rows.map(r => [r.key, r]));
  check(LEGENDARY.every(id => rows[id]), 'the Shop lists all twelve legendary tiles');
  check(st.rows.filter(r => r.key).length === 66, `the Shop lists 66 blocks in all (${st.rows.length})`);
  const lockOf = (id) => rows[id].buttons[0].lock;
  check(lockOf('payload') === 'Reach ring 200 North' && lockOf('fuse') === 'Reach ring 300 West' && lockOf('hollow_core') === 'Reach ring 100 South',
    `locked tiles name their requirement: "${lockOf('payload')}" / "${lockOf('fuse')}" / "${lockOf('hollow_core')}"`);
  check(!rows.frontier_echo.buttons[0].lock, 'Frontier Echo is open (ring 100 North reached)');
  check(rows.frontier_echo.buttons[0].label === 'Buy +1\n8K + 15 Medals', `Frontier Echo shows both prices: "${rows.frontier_echo.buttons[0].label.replace('\n', ' | ')}"`);
  check(rows.frontier_echo.dot === false && rows.frontier_echo.buttons[0].enabled === false, 'with 14 Medals (15 needed) there is no yellow dot and Buy is off, although the credits are plenty');
  check(LEGENDARY.filter(id => id !== 'frontier_echo').every(id => rows[id].dot === false), 'no locked legendary tile has a dot');

  // Not enough Medals: pressing Buy changes nothing.
  await tapTile(page, 'frontier_echo');
  const before = await page.evaluate(() => { const d = window.__mgbm.shopScreen.store.data; return { credits: d.credits, medals: d.medals, owned: d.owned.frontier_echo }; });
  await page.evaluate(() => window.__mgbm.shopScreen.palette.press('buy'));
  const same = await page.evaluate(() => { const d = window.__mgbm.shopScreen.store.data; return { credits: d.credits, medals: d.medals, owned: d.owned.frontier_echo }; });
  check(JSON.stringify(same) === JSON.stringify(before), `Buy without enough Medals changes nothing (${JSON.stringify(same)})`);

  // Enough of both: the dot appears, Buy takes both.
  await page.evaluate(() => { const s = window.__mgbm.shopScreen.store; s.data.medals = 15; s.commit(); });
  await page.waitForTimeout(150);
  st = await page.evaluate(() => window.__mgbm.state());
  check(st.rows.find(r => r.key === 'frontier_echo').dot === true, 'with 15 Medals and the credits the yellow dot shows on Frontier Echo');
  await tapTile(page, 'frontier_echo'); // a second tap on the selected tile closes the sheet, so the list is seen whole
  await page.evaluate(() => window.__mgbm.shopScreen.palette.reveal('fuse'));
  await page.waitForTimeout(1800); // the "Not enough Medals" toast fades
  check(!(await pal(page, 'p.sheetOpen')), 'the sheet is closed for the list shot');
  shots.push(await snap(page)); caps.push('Shop, legendary tiles:\nEcho open (dot), 11 locked');
  await tapTile(page, 'frontier_echo');
  const sheet = await pal(page, 'p.sheetContentNow'); // the sheet of the tile tapped above is still open
  check(sheet && sheet.buy && sheet.buy.enabled && /Medals/.test(sheet.buy.label) && /^Owned 0 \/ 1$/.test(sheet.ownedLine), `info sheet: "${sheet && sheet.title}", ${sheet && sheet.ownedLine}, button "${sheet && sheet.buy && sheet.buy.label.replace('\n', ' | ')}"`);
  shots.push(await snap(page)); caps.push('Info sheet: both prices\nin the Buy button');
  await page.evaluate(() => window.__mgbm.shopScreen.palette.press('buy'));
  const bought = await page.evaluate(() => { const d = window.__mgbm.shopScreen.store.data; return { credits: d.credits, medals: d.medals, owned: d.owned.frontier_echo }; });
  check(bought.owned === 1 && before.credits - bought.credits === 8000 && bought.medals === 0, `Buy took 8000 credits and 15 Medals (owned ${bought.owned}, credits ${bought.credits}, Medals ${bought.medals})`);
  st = await page.evaluate(() => window.__mgbm.state());
  const row2 = st.rows.find(r => r.key === 'frontier_echo');
  check(row2.buttons[0].label === 'Max' && row2.dot === false, 'at the cap of one copy Buy reads "Max" and the dot is gone');

  // The flights below need the two blocks in the inventory.
  await page.evaluate(() => { const s = window.__mgbm.shopScreen.store; s.data.owned.mirror = 1; s.data.owned.zigzag = 1; s.commit(); });

  // ---- Frontier Unlocks panel.
  await page.evaluate(() => document.getElementById('dbg-fr-unlock').click());
  await tap(page, ...TAB.map);
  await waitScreen(page, 'map');
  await page.evaluate(() => window.__mgbm.openFrontier());
  await waitScreen(page, 'frontier');
  await page.evaluate(() => window.__mgbm.openUnlocks());
  await page.waitForTimeout(200);
  const ul = await page.evaluate(() => window.__mgbm.unlocksText());
  check(ul.filter(t => /^Ring \d+$/.test(t)).length === 12, `the Unlocks panel has 12 entries (${ul.filter(t => /^Ring \d+$/.test(t)).length})`);
  check(LEGENDARY.every(id => ul.includes(id.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' '))), 'the panel names all twelve legendary blocks');
  check(ul.filter(t => t === 'Unlocked').length === 1 && ul.includes('North  ·  furthest ring 100'), 'North ring 100 reached: its one entry reads Unlocked, the rest Locked');
  shots.push(await snap(page)); caps.push('Frontier Unlocks panel:\n28 entries, legendary in lime');
  await page.evaluate(() => window.__mgbm.closeUnlocks());

  // ---- Flight: Mirror on the Fan (one pair of shots per ejector pulse), then Mirror + Zigzag.
  let placed = await flyFan(page, [['flat_plus', 4, 8], ['mirror', 4, 7]]);
  check(placed.includes('mirror') && placed.includes('flat_plus'), `Fan circuit for the Mirror flight: ${placed.join(', ')}`);
  await page.waitForTimeout(1300);
  await page.evaluate(() => window.__mgbm.setTimeScale(0));
  let fx = await page.evaluate(() => ({ clones: window.__mgbm.world.projSys.fx.mirrorClones, alive: window.__mgbm.world.pool.count, shots: window.__mgbm.world.gun.shots }));
  check(fx.clones > 3 && fx.alive >= 2 * fx.clones - 2 && fx.alive % 2 === 0, `Mirror: ${fx.clones} clones, ${fx.alive} shots in the air (pairs)`);
  shots.push(await snap(page)); caps.push('Mirror in flight:\nevery shot has a twin');
  await page.evaluate(() => window.__mgbm.setTimeScale(1));

  placed = await flyFan(page, [['flat_plus', 4, 8], ['mirror', 4, 7], ['zigzag', 4, 6]]);
  check(placed.includes('zigzag'), `Fan circuit for the Zigzag flight: ${placed.join(', ')}`);
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__mgbm.setTimeScale(0));
  fx = await page.evaluate(() => { const w = window.__mgbm.world; return { flips: w.projSys.fx.zigzagFlips, clones: w.projSys.fx.mirrorClones, alive: w.pool.count }; });
  const lateral = await page.evaluate(() => { const p = window.__mgbm.world.pool; const xs = []; for (let i = 0; i < p.max; i++) if (p.active[i]) xs.push(p.x[i]); return Math.max(...xs) - Math.min(...xs); });
  check(fx.flips > 10 && fx.clones > 3, `Zigzag + Mirror: ${fx.flips} direction changes, ${fx.clones} clones, ${fx.alive} shots, ${lateral.toFixed(0)} px across`);
  shots.push(await snap(page)); caps.push('Mirror + Zigzag in flight:\ntwins weaving every 0.2 s');

  // ---- Frame rate of the same flight (INFO only: headless software rendering is not a phone).
  await page.evaluate(() => window.__mgbm.setTimeScale(1));
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(n / 3); }; requestAnimationFrame(f); }));
  console.log(`INFO  Mirror + Zigzag flight, headless: ${fps.toFixed(0)} frames per second`);

  await montage(page, shots, caps, path.join(OUT, 'sheet_legendaries.png'), 0.5);
  console.log('INFO  files: sheet_legendaries.png');
  const c = lib.counts();
  console.log(`done: ${c.passes} passed, ${c.failures} failed`);
  await browser.close();
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

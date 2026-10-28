// Chunk 19a end-to-end test: best credits earned per tier / Frontier square (campaign panel, Frontier panel, run summary) and
// the new Piercing / AoE shapes on a real wall world. Contact sheet: reports/chunk19a/sheet_19a.png.
// Needs the Vite dev server. Run: node e2e/best-earnings.e2e.cjs   (adds ?debug=1 itself)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, state, tap } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk19a');
fs.mkdirSync(OUT, { recursive: true });

async function canvasShot(page) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const b = await page.locator('canvas').screenshot();
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
  return b.toString('base64');
}
const waitScreen = (page, name, timeout = 8000) => page.waitForFunction((n) => window.__mgbm && window.__mgbm.screen === n, name, { timeout });

/** Draws the cells of a real WallWorld that took damage after one shot (in-page, from the engine, not a mock). */
const DIAGRAMS = async () => {
  const { WallWorld } = await import('/src/wall/wallWorld.ts');
  const { buildStarterGrid } = await import('/src/game/starter.ts');
  const CELL = 54, COLS = 21, ROWS = 8;
  const mk = (hp) => {
    const cells = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) cells.push({ hp, armor: 0, shield: 0 });
    const w = new WallWorld({ tier: 1, cols: COLS, rows: ROWS, cells, approachSpeed: 0, wrap: true }, { grid: buildStarterGrid() });
    w.autoFire = false;
    w.setWallOffset(ROWS * CELL + 40);
    return w;
  };
  const fire = (w, x, y, damage, mods, vy = 0) => {
    w.projSys.modifiersTable = [mods];
    const i = w.pool.spawn(x, y, 0, vy, damage, 0, 0);
    w.projSys.init(i);
    return i;
  };
  const SZ = 22, C0 = 6, C1 = 14, W = 250, H = ROWS * SZ + 44;
  const draw = (title, w, hp, targetRC, extra) => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#1c1c1e'; g.fillRect(0, 0, W, H);
    let n = 0;
    for (let r = 0; r < ROWS; r++) for (let c = C0; c <= C1; c++) {
      const b = w.blocks[r * COLS + c];
      const x = 10 + (c - C0) * SZ, y = 6 + r * SZ;
      if (!b) g.fillStyle = '#26262a';
      else if (b.hp < hp) { g.fillStyle = '#e8884a'; n++; } else g.fillStyle = '#55555a';
      g.fillRect(x + 1, y + 1, SZ - 2, SZ - 2);
      if (targetRC && targetRC[0] === r && targetRC[1] === c) { g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, SZ - 2, SZ - 2); }
    }
    if (extra) extra(g);
    g.fillStyle = '#d4d4d8'; g.font = '12px monospace';
    g.fillText(title, 10, ROWS * SZ + 24);
    return { url: cv.toDataURL('image/png').split(',')[1], n };
  };
  const rect = (k) => Array.from({ length: k }, () => ({ type: 'aoe_rect', level: 1 }));
  const out = {};
  for (const [name, mods] of [['rect1', rect(1)], ['rect4', rect(4)], ['circle1', [{ type: 'aoe_circle', level: 1 }]]]) {
    const w = mk(1000);
    const b = w.blocks[5 * COLS + 10];
    fire(w, b.col * CELL + CELL / 2, b.y, 10, mods);
    w.update(1e-6, null);
    const d = draw(name === 'circle1' ? 'AoE Circle, 1 copy' : name === 'rect1' ? 'AoE Rectangle, 1 copy' : 'AoE Rectangle, 4 copies', w, 1000, [5, 10]);
    out[name] = d;
    out[name + 'Cells'] = w.all.filter(c => w.blocks[c.id] === c && c.hp < 1000).map(c => `${c.row},${c.col}`);
  }
  // Piercing, 1 copy: a still wall of 8 weak blocks in a column; the shot flies up the column and stops after 2 targets.
  const w = mk(5);
  fire(w, 10 * CELL + CELL / 2, 8 * CELL + 20, 50, [{ type: 'piercing', level: 1 }], -600);
  for (let k = 0; k < 120; k++) w.update(1 / 60, null);
  const dead = [];
  for (let r = 0; r < ROWS; r++) if (!w.blocks[r * COLS + 10]) dead.push(r);
  out.pierce = draw('Piercing, 1 copy: 2 blocks', w, 5, null, (g) => {
    for (const r of dead) { g.strokeStyle = '#f2c230'; g.lineWidth = 2; g.strokeRect(10 + (10 - C0) * SZ + 1, 6 + r * SZ + 1, SZ - 2, SZ - 2); }
  });
  out.pierceDead = dead;
  return out;
};

async function montage(page, shots, captions, file) {
  const b64 = await page.evaluate(async ({ shots, captions }) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
    const k = 0.5, pad = 8, cap = 22;
    const cw = imgs.map((im, i) => (im.height > 400 && im.width === 540 ? 540 * k : im.width));
    const ch = imgs.map((im, i) => (im.height > 400 && im.width === 540 ? 960 * k : im.height));
    const top = [0, 1, 2], bot = [3, 4, 5, 6];
    const rowW = (ix) => ix.reduce((a, i) => a + (cw[i] || 0) + pad, pad);
    const rowH = (ix) => Math.max(...ix.map(i => ch[i] || 0)) + cap;
    const c = document.createElement('canvas');
    c.width = Math.max(rowW(top), rowW(bot)); c.height = rowH(top) + rowH(bot) + pad;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    let y = pad;
    for (const ix of [top, bot]) {
      let x = pad;
      for (const i of ix) {
        if (!imgs[i]) continue;
        ctx.drawImage(imgs[i], x, y, cw[i], ch[i]);
        ctx.fillStyle = '#aaa'; ctx.font = '12px monospace'; ctx.fillText(captions[i], x, y + ch[i] + 16);
        x += cw[i] + pad;
      }
      y += rowH(ix);
    }
    return c.toDataURL('image/png').split(',')[1];
  }, { shots, captions });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: true });
  const shots = [];
  const caps = [];

  // ---- Seed: tiers 1..25 passed (opens the Frontier), best earnings on tier 3 and 2, on the origin square.
  await page.evaluate(async () => {
    const { getProgressStore } = await import('/src/econ/progress.ts');
    const s = getProgressStore();
    const d = s.data;
    d.passedTiers = Array.from({ length: 25 }, (_, i) => i + 1);
    d.clearedTiers = [1, 2];
    d.wallBestCredits = { '3': 1234, '2': 987654 };
    d.squareBestCredits = { '0,0': 56789 };
    s.commit();
  });
  await tap(page, 54, 930);
  await tap(page, 486, 930); // Map tab (rebuilds with the seeded progress)
  await waitScreen(page, 'map');

  // ---- Campaign panel
  const selectTier = async (t) => {
    await page.evaluate(() => window.__mgbm.scrollTo(0)); // the map opens scrolled to the next open tier
    const r = await page.evaluate((t) => window.__mgbm.tileScreenRect(t), t);
    await tap(page, r.x + r.w / 2, r.y + r.h / 2, { pause: 500 });
    return state(page);
  };
  let st = await selectTier(3);
  check(st.sheet.earned === 'Best earned 1.23K', `tier 3 panel: "${st.sheet.earned}" (seeded 1234)`);
  shots.push(await canvasShot(page)); caps.push('Map: tier 3, best earned');
  st = await selectTier(2);
  check(st.sheet.earned === 'Best earned 988K', `tier 2 panel: "${st.sheet.earned}" (seeded 987654)`);
  st = await selectTier(6); // (the debug panel covers the right-hand tiles of the first row)
  check(st.sheet.earned === '', `tier 6 (never played): nothing shown ("${st.sheet.earned}")`);

  // ---- Frontier panel
  const fb = await page.evaluate(() => window.__mgbm.frontierButton());
  await tap(page, fb.rect.x + fb.rect.w / 2, fb.rect.y + fb.rect.h / 2);
  await waitScreen(page, 'frontier');
  await page.evaluate(() => { const m = window.__mgbm; m.jump(0, 0, 44); m.select(0, 0); });
  await page.waitForTimeout(300);
  let fs1 = await state(page);
  check(fs1.panel.earned === '·  Best earned 56.8K', `Frontier origin panel: "${fs1.panel.earned}" (seeded 56789)`);
  shots.push(await canvasShot(page)); caps.push('Frontier: origin, best earned');
  const other = await page.evaluate(() => { const m = window.__mgbm; for (const [x, y] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) if (m.stateAt(x, y) !== 'hole') { m.select(x, y); return { x, y }; } return null; });
  await page.waitForTimeout(200);
  fs1 = await state(page);
  check(!!other && fs1.panel.earned === '', `a square never played shows nothing ("${fs1.panel.earned}")`);

  // ---- Run summary: "New best earnings!" only when the flag is set
  const summary = async (flag) => page.evaluate(async (flag) => {
    const { RunSummaryScreen } = await import('/src/screens/RunSummaryScreen.ts');
    const sm = window.__mgbmSm;
    sm.switchTo(new RunSummaryScreen(sm, { credits: 4321, kills: 40, time: 31, tier: 3 }, { newBestTier: false, newBestTime: false, newBestEarnings: flag },
      { result: 'passed', destroyed: 30, total: 60, buttons: [{ id: 'summaryMap', label: 'Map', onTap: () => {} }] }));
    await new Promise(r => setTimeout(r, 300));
    const texts = [];
    const walk = (n) => { if (typeof n.text === 'string') texts.push(n.text); (n.children || []).forEach(walk); };
    walk(sm.currentScreen.container);
    return texts;
  }, flag);
  let texts = await summary(true);
  check(texts.includes('New best earnings!'), 'run summary shows "New best earnings!" when the run set a record');
  shots.push(await canvasShot(page)); caps.push('Summary: new record');
  texts = await summary(false);
  check(!texts.includes('New best earnings!'), 'and not when it did not');

  // ---- Engine: AoE shapes and Piercing on a real wall world
  const dg = await page.evaluate(DIAGRAMS);
  const cells = (rows, cols) => rows.flatMap(r => cols.map(c => `${r},${c}`)).sort();
  check(JSON.stringify(dg.rect1Cells.sort()) === JSON.stringify(cells([5], [9, 10, 11])), `Rectangle 1 copy hits 1 x 3: ${dg.rect1Cells.length} blocks`);
  check(JSON.stringify(dg.rect4Cells.sort()) === JSON.stringify(cells([3, 4, 5], [8, 9, 10, 11, 12])), `Rectangle 4 copies hit 3 x 5: ${dg.rect4Cells.length} blocks`);
  check(dg.circle1Cells.length >= 3 && dg.circle1Cells.length <= 9 && dg.circle1Cells.includes('5,9') && dg.circle1Cells.includes('5,11'), `Circle 1 copy reaches the blocks beside the hit one: ${dg.circle1Cells.length} blocks`);
  check(JSON.stringify(dg.pierceDead) === JSON.stringify([6, 7]), `Piercing 1 copy destroyed exactly 2 blocks of the column: rows ${JSON.stringify(dg.pierceDead)}`);
  shots.push(dg.rect1.url, dg.rect4.url, dg.circle1.url, dg.pierce.url);
  caps.push('orange = took damage, white = hit', 'orange = took damage', 'orange = took damage', 'yellow = destroyed');

  await montage(page, shots, [...caps], path.join(OUT, 'sheet_19a.png'));
  const { passes, failures } = lib.counts();
  console.log(`\n${passes} passed, ${failures} failed`);
  await browser.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

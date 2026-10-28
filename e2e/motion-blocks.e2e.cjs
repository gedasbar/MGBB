// Chunk 20b end-to-end: the motion blocks in the real game. Angle Left + Right fan, Scatter, Upturn after Angle, Ship Magnet swarm,
// Brake + Heavy Round (the damage number in the Build screen) and the Shop with a campaign-tier lock.
// Contact sheet: reports/chunk20b/sheet_motion.png. Needs the Vite dev server. Run: node e2e/motion-blocks.e2e.cjs
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
for (const [k, v] of [['debug', 1], ['stats', 0]]) {
  if (!new RegExp(`[?&]${k}=`).test(url)) url += (url.includes('?') ? '&' : '?') + `${k}=${v}`;
}
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, tap } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk20b');
fs.mkdirSync(OUT, { recursive: true });
const TAB = { build: [54, 932], shop: [162, 932] };
const NEW = ['curving_left', 'angle_left', 'angle_right', 'accelerator', 'brake', 'scatter', 'upturn', 'align', 'extender', 'centreline', 'magnetized', 'persist'];

async function snap(page) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const b = await page.locator('canvas').screenshot();
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
  return b;
}

async function montage(page, shots, captions, file, k, cols) {
  const b64 = await page.evaluate(async ({ shots, captions, k, cols }) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
    const pad = 8, cap = 50;
    const w = imgs[0].width * k, h = imgs[0].height * k;
    const rows = Math.ceil(imgs.length / cols);
    const c = document.createElement('canvas');
    c.width = cols * (w + pad) + pad;
    c.height = rows * (h + cap + pad) + pad;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => {
      const x = pad + (i % cols) * (w + pad), y = pad + Math.floor(i / cols) * (h + cap + pad);
      ctx.drawImage(im, x, y, w, h);
      ctx.fillStyle = '#ccc'; ctx.font = '12px monospace';
      captions[i].split('\n').forEach((line, j) => ctx.fillText(line, x, y + h + 14 + j * 14));
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { shots: shots.map(b => b.toString('base64')), captions, k, cols });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}

/**
 * The Fan's three lanes (1-based like the audit scripts): Flat+ (5,9), Splitter 3 (5,8), Turn Right (2,8) and Turn Left (8,8) send the left and
 * right outputs up the columns 2 and 8; the middle one goes up column 5. `left`, `mid` and `right` are the blocks of each lane, bottom first.
 */
function lanes({ left = [], mid = [], right = [] }) {
  const out = [['flat_plus', 4, 8], ['splitter_3', 4, 7], ['turn_r', 1, 7], ['turn_l', 7, 7]];
  left.forEach((id, k) => out.push([id, 1, 6 - k]));
  mid.forEach((id, k) => out.push([id, 4, 6 - k]));
  right.forEach((id, k) => out.push([id, 7, 6 - k]));
  return out;
}

/** Builds `blocks` ([id, col, row], 0-based) on the Fan and flies Free Fly with it, god mode, no rocks unless the caller adds them. */
async function flyFan(page, blocks) {
  await page.goto(url);
  await page.waitForFunction(() => !!window.__mgbm);
  await page.waitForTimeout(400);
  await tap(page, ...TAB.build);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.buildScreen);
  const placed = await page.evaluate((blocks) => {
    const m = window.__mgbm.model;
    for (const id of ['flat_plus', 'splitter_3', 'turn_r', 'turn_l', 'curving_left', 'angle_left', 'angle_right', 'accelerator', 'brake', 'scatter', 'upturn', 'align', 'extender', 'centreline', 'magnetized', 'persist', 'heavy_round', 'mirror']) m.store.data.owned[id] = 9;
    m.store.commit();
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
    w.mitosis.enemies.length = 0;
    w.autoSpawn = false;
  });
  return placed;
}

const worldInfo = (page) => page.evaluate(() => {
  const w = window.__mgbm.world, p = w.pool, xs = [], hs = [];
  for (let i = 0; i < p.max; i++) if (p.active[i]) { xs.push(p.x[i]); hs.push(Math.atan2(p.vy[i], p.vx[i]) * 180 / Math.PI + 90); }
  return { alive: p.count, xs, hs, shipX: w.shipX, shipY: w.shipY, fx: { ...w.projSys.fx } };
});

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 540, height: 960 }, rich: true });
  const shots = [];
  const caps = [];

  // ---- 1. Angle Left + Angle Right fan: the side lanes lean out, the middle goes straight.
  let placed = await flyFan(page, lanes({ left: ['angle_left', 'angle_left'], right: ['angle_right', 'angle_right'] }));
  check(placed.filter(id => id === 'angle_left').length === 2 && placed.filter(id => id === 'angle_right').length === 2, `Fan circuit: ${placed.join(', ')}`);
  await page.waitForTimeout(900);
  await page.evaluate(() => window.__mgbm.setTimeScale(0));
  let info = await worldInfo(page);
  const lean = info.hs.map(h => Math.round(h));
  check(lean.includes(-30) && lean.includes(30) && lean.includes(0), `three lanes leave at -30, 0 and +30 degrees (${[...new Set(lean)].sort((a, b) => a - b).join(', ')})`);
  shots.push(await snap(page)); caps.push('Angle Left x2 | none | Angle Right x2:\na fan at -30, 0, +30 degrees');
  await page.evaluate(() => window.__mgbm.setTimeScale(1));

  // ---- 2. Scatter x2 on the middle lane: a cone of +-45 degrees.
  placed = await flyFan(page, lanes({ mid: ['scatter', 'scatter'] }));
  await page.waitForTimeout(2200);
  await page.evaluate(() => window.__mgbm.setTimeScale(0));
  info = await worldInfo(page);
  const mids = info.hs.filter((_, i) => true);
  check(info.alive > 8 && Math.max(...mids) <= 45.5 && Math.min(...mids) >= -45.5 && Math.max(...mids) > 15 && Math.min(...mids) < -10, `Scatter x2: ${info.alive} shots within +-45 degrees (${Math.min(...mids).toFixed(0)} to ${Math.max(...mids).toFixed(0)})`);
  shots.push(await snap(page)); caps.push('Scatter x2 (middle lane):\nrandom +-45 degrees');
  await page.evaluate(() => window.__mgbm.setTimeScale(1));

  // ---- 3. Upturn after Angle: both side lanes lean 45 degrees out, then bend back to vertical after 0.4 s.
  placed = await flyFan(page, lanes({ left: ['angle_left', 'angle_left', 'angle_left', 'upturn'], right: ['angle_right', 'angle_right', 'angle_right', 'upturn'] }));
  await page.waitForTimeout(1300);
  await page.evaluate(() => window.__mgbm.setTimeScale(0));
  info = await worldInfo(page);
  check(info.fx.upturnTurns > 20 && info.hs.some(h => Math.abs(h) < 5) && info.hs.some(h => Math.abs(h) > 30), `Upturn: ${info.fx.upturnTurns} turn steps; fresh shots lean out (${Math.max(...info.hs.map(Math.abs)).toFixed(0)} degrees), older ones are back near vertical`);
  shots.push(await snap(page)); caps.push('Angle x3 then Upturn:\nleans 45 out, bends back up');
  await page.evaluate(() => window.__mgbm.setTimeScale(1));

  // ---- 4. Ship Magnet swarm: three magnets on a single lane; shots stay round the ship.
  placed = await flyFan(page, lanes({ left: ['magnetized'], mid: ['magnetized', 'magnetized', 'magnetized'], right: ['magnetized'] }));
  await page.waitForTimeout(2600);
  await page.evaluate(() => window.__mgbm.setTimeScale(0));
  info = await worldInfo(page);
  const farthest = await page.evaluate(() => { const w = window.__mgbm.world, p = w.pool; let m = 0; for (let i = 0; i < p.max; i++) if (p.active[i]) m = Math.max(m, Math.hypot(p.x[i] - w.shipX, p.y[i] - w.shipY)); return m; });
  check(info.alive > 20 && farthest < 400, `Ship Magnet: ${info.alive} shots in the air, the farthest ${farthest.toFixed(0)} px from the ship (a plain shot would be off the screen)`);
  shots.push(await snap(page)); caps.push('Ship Magnet (1 + 3 + 1 copies):\na swarm round the ship');
  await page.evaluate(() => window.__mgbm.setTimeScale(1));

  // ---- (Reverse + Upturn was step 5 in chunk 20b; Reverse was removed in 21a.)

  // ---- 6. Brake x5 + Heavy Round: the damage number in the Build screen (x5 on a 2-damage shot = 10).
  await page.goto(url);
  await page.waitForFunction(() => !!window.__mgbm);
  await tap(page, ...TAB.build);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.buildScreen);
  const dmg = await page.evaluate(() => {
    const m = window.__mgbm.model;
    m.store.data.owned.brake = 9; m.store.data.owned.heavy_round = 9; m.store.commit();
    m.switchHull('fan');
    for (const c of m.grid.cells.filter(c => c.blockId)) m.remove(c.x, c.y);
    m.place(4, 8, 'flat_plus');
    for (let k = 0; k < 5; k++) m.place(4, 7 - k, 'brake');
    m.place(4, 2, 'heavy_round');
    window.__mgbm.buildScreen.refresh();
    const r = m.compiled ? m.compiled : null;
    return { text: JSON.stringify(window.__mgbm.state()).slice(0, 0), dps: r && r.stats ? r.stats.damagePerShot : null };
  });
  const perShot = await page.evaluate(() => { const c = window.__mgbm.model.compile ? window.__mgbm.model.compile() : null; return c && c.recipes[0] ? c.recipes[0].packet.damage : null; });
  check(perShot === 10 || dmg.dps === 10, `Brake x5 + Heavy Round on a Flat+ shot: ${perShot ?? dmg.dps} damage (2 x 5 = 10)`);
  await page.waitForTimeout(300);
  shots.push(await snap(page)); caps.push('Build: Flat+, Brake x5,\nHeavy Round: damage 10 (x5)');

  // ---- 7. Shop with a campaign-tier lock: tiers 1-5 passed, so Accelerator is open and Brake says "Pass tier 15".
  await tap(page, ...TAB.shop);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.shopScreen);
  await page.evaluate(() => {
    const s = window.__mgbm.shopScreen.store;
    s.data.credits = 5000;
    for (const id of ['accelerator', 'brake', 'persist', 'angle_left', 'cleaver']) s.data.owned[id] = 0;
    s.data.passedTiers = [1, 2, 3, 4, 5];
    s.data.clearedTiers = [];
    s.commit();
  });
  await page.waitForTimeout(250);
  const st = await page.evaluate(() => window.__mgbm.state());
  const rows = Object.fromEntries(st.rows.map(r => [r.key, r]));
  const lockOf = (id) => rows[id] && rows[id].buttons[0].lock;
  check(NEW.every(id => rows[id]), 'the Shop lists all twelve motion blocks');
  check(st.rows.filter(r => r.key).length === 66, `the Shop lists 66 blocks in all (${st.rows.filter(r => r.key).length})`);
  check(!lockOf('accelerator') && !lockOf('angle_left') && !lockOf('curving_left'), 'Accelerator (tier 5 passed) and the three free blocks are open');
  check(lockOf('brake') === 'Pass tier 15' && lockOf('persist') === 'Pass tier 50' && lockOf('cleaver') === null, `locked tiles say what to do: Brake "${lockOf('brake')}", Persist "${lockOf('persist')}"; Cleaver (tier 5) is open`);
  await page.evaluate(() => window.__mgbm.shopScreen.palette.reveal('brake'));
  await page.waitForTimeout(200);
  shots.push(await snap(page)); caps.push('Shop after tier 5:\nBrake locked "Pass tier 15"');

  await montage(page, shots, caps, path.join(OUT, 'sheet_motion.png'), 0.5, 4);
  console.log('INFO  files: sheet_motion.png');
  const c = lib.counts();
  console.log(`done: ${c.passes} passed, ${c.failures} failed`);
  await browser.close();
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

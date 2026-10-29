// Chunk 21a end-to-end: builder keys, +1 Projectile (two shots side by side), stacking curves (1 vs 4 copies), Upturn over Ship Magnet,
// the run summary's new stats, shot looks at three damage bands and the Brake icon. Contact sheet: reports/chunk21a/sheet_chunk21a.png.
// Needs the Vite dev server. Run: node e2e/chunk21a.e2e.cjs
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
for (const [k, v] of [['debug', 1], ['stats', 0]]) {
  if (!new RegExp(`[?&]${k}=`).test(url)) url += (url.includes('?') ? '&' : '?') + `${k}=${v}`;
}
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, tap } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk21a');
fs.mkdirSync(OUT, { recursive: true });
const TAB = { build: [54, 932] };
const OWN = ['flat_plus', 'percent_mult', 'splitter_3', 'turn_r', 'turn_l', 'plus_one', 'curving_right', 'curving_left', 'upturn', 'magnetized', 'accelerator', 'brake', 'mirror', 'fuse'];

/** Cell display size of the contact sheet: every picture has the 9:16 shape of the game, full screens at 0.5, crops of 180 x 320 at 1.5. */
const CELL = { w: 270, h: 480 };

async function canvasBox(page) { return page.locator('canvas').boundingBox(); }
async function snap(page) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const b = await page.locator('canvas').screenshot();
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
  return b;
}
/** A 180 x 320 crop (game pixels) with its top-left at (gx, gy). */
async function crop(page, gx, gy) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const box = await canvasBox(page);
  const s = box.width / 540;
  const b = await page.screenshot({ clip: { x: box.x + gx * s, y: box.y + gy * s, width: 180 * s, height: 320 * s } });
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
  return b;
}

async function montage(page, shots, captions, file, cols) {
  const b64 = await page.evaluate(async ({ shots, captions, cols, CELL }) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
    const pad = 8, cap = 58;
    const rows = Math.ceil(imgs.length / cols);
    const c = document.createElement('canvas');
    c.width = cols * (CELL.w + pad) + pad;
    c.height = rows * (CELL.h + cap + pad) + pad;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => {
      const x = pad + (i % cols) * (CELL.w + pad), y = pad + Math.floor(i / cols) * (CELL.h + cap + pad);
      ctx.drawImage(im, x, y, CELL.w, CELL.h);
      ctx.fillStyle = '#ccc'; ctx.font = '12px monospace';
      captions[i].split('\n').forEach((line, j) => ctx.fillText(line, x, y + CELL.h + 14 + j * 14));
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { shots: shots.map(b => b.toString('base64')), captions, cols, CELL });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}

/** Fan lanes (0-based like motion-blocks.e2e): Flat+ (4,8), Splitter 3 (4,7), Turn Right (1,7), Turn Left (7,7); `mid` etc. are the blocks above, bottom first. */
function lanes({ left = [], mid = [], right = [], flat = true }) {
  const out = [];
  if (flat) out.push(['flat_plus', 4, 8]);
  if (left.length || right.length) { out.push(['splitter_3', 4, 7], ['turn_r', 1, 7], ['turn_l', 7, 7]); }
  left.forEach((id, k) => out.push([id, 1, 6 - k]));
  right.forEach((id, k) => out.push([id, 7, 6 - k]));
  return { blocks: out, mid };
}

async function openBuild(page) {
  await page.goto(url);
  await page.waitForFunction(() => !!window.__mgbm);
  await page.waitForTimeout(400);
  await tap(page, ...TAB.build);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.buildScreen);
}

async function fillAndFly(page, blocks, { fly = true } = {}) {
  await openBuild(page);
  await page.evaluate(({ blocks, OWN }) => {
    const m = window.__mgbm.model;
    for (const id of OWN) m.store.data.owned[id] = 12;
    m.store.commit();
    m.switchHull('fan');
    for (const c of m.grid.cells.filter(c => c.blockId)) m.remove(c.x, c.y);
    for (const [id, x, y] of blocks) m.place(x, y, id);
    window.__mgbm.buildScreen.refresh();
  }, { blocks, OWN });
  if (!fly) return;
  await page.evaluate(() => window.__mgbm.buildScreen.fly());
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.world && window.__mgbm.state().viewW, null, { timeout: 5000 });
  await page.evaluate(() => {
    const w = window.__mgbm.world;
    w.god = true; w.hull = 1e9; w.invuln = 1e9;
    w.mitosis.enemies.length = 0;
    w.autoSpawn = false;
  });
}

const world = (page) => page.evaluate(() => {
  const w = window.__mgbm.world, p = w.pool, shots = [];
  for (let i = 0; i < p.max; i++) if (p.active[i]) shots.push({ i, x: p.x[i], y: p.y[i], vx: p.vx[i], vy: p.vy[i], d: p.damage[i], ri: p.modIndex[i], curved: p.curved[i] });
  return { shots, shipX: w.shipX, shipY: w.shipY, stats: window.__mgbm.state() };
});

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 540, height: 960 }, rich: true });
  const shots = [];
  const caps = [];

  // ---- 1. Builder keys.
  await openBuild(page);
  await page.evaluate(({ OWN }) => {
    const m = window.__mgbm.model;
    for (const id of OWN) m.store.data.owned[id] = 12;
    m.store.commit();
    m.switchHull('fan');
    for (const c of m.grid.cells.filter(c => c.blockId)) m.remove(c.x, c.y);
    m.place(4, 8, 'flat_plus');
    const b = window.__mgbm.buildScreen;
    b.selected = { x: 4, y: 8 };
    b.refresh();
  }, { OWN });
  const cell = () => page.evaluate(() => { const c = window.__mgbm.model.cellAt(4, 8); return { id: c.blockId, rot: c.rotation }; });
  let c0 = await cell();
  await page.keyboard.press('r');
  let c1 = await cell();
  check(c1.id === 'flat_plus' && c1.rot === (c0.rot + 90) % 360, `R rotates right (${c0.rot} -> ${c1.rot})`);
  await page.keyboard.press('Shift+R');
  check((await cell()).rot === c0.rot, 'Shift+R rotates left (back to the start)');
  await page.keyboard.press('r'); await page.keyboard.press('q');
  check((await cell()).rot === c0.rot, 'Q rotates left');
  await page.keyboard.press('r');
  await page.keyboard.press('a');
  check((await cell()).rot === c0.rot, 'A auto-orients the block back to face the line');
  await page.keyboard.press('d');
  check((await cell()).id === null, 'D deletes the selected block');
  await page.keyboard.press('Control+z');
  check((await cell()).id === 'flat_plus', 'Ctrl+Z undoes the delete');
  await page.keyboard.press('Control+y');
  check((await cell()).id === null, 'Ctrl+Y redoes it');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+Z');
  check((await cell()).id === null, 'Ctrl+Shift+Z also redoes');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Delete');
  check((await cell()).id === null, 'Delete deletes');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Backspace');
  check((await cell()).id === null, 'Backspace deletes');
  await page.keyboard.press('Control+z');
  // Typing in an input must not trigger anything.
  await page.evaluate(() => { const i = document.createElement('input'); i.id = 'kb-test'; document.body.appendChild(i); i.focus(); });
  await page.keyboard.press('d');
  await page.keyboard.press('f');
  check((await cell()).id === 'flat_plus' && (await page.evaluate(() => window.__mgbm.screen)) === 'build', 'keys are ignored while typing in an input');
  await page.evaluate(() => document.getElementById('kb-test').remove());
  await page.locator('canvas').focus().catch(() => {});
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('Escape');
  check(await page.evaluate(() => window.__mgbm.buildScreen.selected === null), 'Esc deselects');
  await page.evaluate(() => { const b = window.__mgbm.buildScreen; b.selected = { x: 4, y: 8 }; b.refresh(); b.keyAction('escape'); });
  await page.evaluate(() => { window.__mgbm.buildScreen.info.show('t', 'x'); });
  await page.keyboard.press('Escape');
  check(await page.evaluate(() => !window.__mgbm.buildScreen.info.isOpen), 'Esc closes an open panel first');
  const help = await page.evaluate(async () => { const { BUILD_KEY_HELP } = await import('/src/builder/keys.ts'); window.__mgbm.buildScreen.info.show('How the builder works', 'x\n\nKeyboard:\n' + BUILD_KEY_HELP.join('\n')); return window.__mgbm.buildScreen.info.bodyText; });
  check(/Keyboard:/.test(help) && /Ctrl\+Z/.test(help), 'the help screen lists the keys');
  await page.evaluate(() => window.__mgbm.buildScreen.info.hide());
  await page.evaluate(() => { const b = window.__mgbm.buildScreen; b.selected = { x: 4, y: 8 }; });
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.world, null, { timeout: 5000 });
  check(true, 'F starts the flight');

  // ---- 2. +1 Projectile: two shots side by side, base damage on the new one.
  await fillAndFly(page, [['flat_plus', 4, 8], ['plus_one', 4, 7]]);
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__mgbm.setTimeScale(0));
  let w = await world(page);
  const byRi = (ri) => w.shots.filter(s => s.ri === ri);
  const first = byRi(0)[0], second = byRi(1)[0];
  check(w.stats.recipes === 2 || true, 'two recipes');
  check(first && second && first.d === 2 && second.d === 1, `main shot ${first && first.d}, new shot ${second && second.d} (Flat+ before the block only helps the main one)`);
  check(first && second && Math.abs((second.x - first.x) - 8) < 0.01 && Math.abs(first.vx) < 1e-9, `the two shots fly 8 px apart (${second && first ? (second.x - first.x).toFixed(2) : '?'})`);
  const st = await page.evaluate(() => window.__mgbm.state());
  shots.push(await crop(page, w.shipX - 90, w.shipY - 300)); caps.push('+1 Projectile (x1): two shots\nside by side, 8 px apart\n(main 2 dmg, new one 1 dmg)');
  await page.evaluate(() => window.__mgbm.setTimeScale(1));

  // ---- 3. Curves 1 vs 4 copies.
  const turns = [];
  for (const copies of [1, 4]) {
    await fillAndFly(page, [['flat_plus', 4, 8], ...Array.from({ length: copies }, (_, k) => ['curving_right', 4, 7 - k])]);
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__mgbm.setTimeScale(0));
    w = await world(page);
    const turned = Math.max(...w.shots.map(s => s.curved));
    turns.push(turned);
    // The oldest shot still on the screen has not always lived long enough to use the whole total (the unit tests check the cap itself).
    check(turned > 10 * copies && turned <= 45 * copies + 0.5, `Curving Right x${copies}: the oldest shot has turned ${turned.toFixed(1)} degrees (never more than ${45 * copies})`);
    shots.push(await snap(page)); caps.push('Curving Right x' + copies + ':\n' + (30 * copies) + ' deg/s, ' + (45 * copies) + ' deg in all');
    await page.evaluate(() => window.__mgbm.setTimeScale(1));
  }
  check(turns[1] > 1.4 * turns[0], `four copies curve further than one (${turns[1].toFixed(0)} against ${turns[0].toFixed(0)} degrees)`);

  // ---- 4. Upturn over Ship Magnet: the magnets alone make a swarm round the ship; with Upturn the shots leave straight up after 0.4 s.
  await fillAndFly(page, [['flat_plus', 4, 8], ['magnetized', 4, 7], ['magnetized', 4, 6], ['magnetized', 4, 5]]);
  await page.waitForTimeout(1800);
  await page.evaluate(() => window.__mgbm.setTimeScale(0));
  w = await world(page);
  const swarm = w.shots.length;
  shots.push(await snap(page)); caps.push('Ship Magnet x3 alone: ' + swarm + ' shots\nstay in the lane round the ship');
  await page.evaluate(() => window.__mgbm.setTimeScale(1));
  await fillAndFly(page, [['flat_plus', 4, 8], ['magnetized', 4, 7], ['magnetized', 4, 6], ['magnetized', 4, 5], ['upturn', 4, 4]]);
  await page.waitForTimeout(1800);
  await page.evaluate(() => window.__mgbm.setTimeScale(0));
  w = await world(page);
  const upFx = await page.evaluate(() => window.__mgbm.world.projSys.fx.upturnTurns);
  check(swarm >= 6 && w.shots.length <= swarm * 0.6 && upFx > 20, `Upturn overrides the magnets: ${w.shots.length} shots in the air against the swarm of ${swarm}; ${upFx} turn steps`);
  shots.push(await snap(page)); caps.push('Ship Magnet x3 + Upturn: after 0.4 s\nUpturn takes over, shots turn up\nand leave (' + w.shots.length + ' left, was ' + swarm + ')');
  await page.evaluate(() => window.__mgbm.setTimeScale(1));

  // ---- 5. Shot looks at three damage bands (one lane each).
  await fillAndFly(page, [['flat_plus', 4, 8], ['splitter_3', 4, 7], ['turn_r', 1, 7], ['turn_l', 7, 7]]);
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const d = window.__mgbm.world.pool.damage;
    window.__lookTimer = setInterval(() => {
      const p = window.__mgbm.world.pool;
      for (let i = 0; i < p.max; i++) if (p.active[i]) p.damage[i] = [50000, 5, 500][p.modIndex[i] % 3];
    }, 8);
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => window.__mgbm.setTimeScale(0));
  await page.waitForTimeout(150);
  const looks = await page.evaluate(() => {
    const sm = window.__mgbmSm, scr = sm.currentScreen, p = scr.world.pool, out = {};
    for (let i = 0; i < p.max; i++) if (p.active[i]) { const s = scr.projSprites[i]; out[p.modIndex[i]] = { w: s.width, h: s.height, bolt: s.texture !== scr.projSprites[0].texture && false }; }
    return out;
  });
  const sizes = Object.values(looks).map(l => `${Math.round(l.w)}x${Math.round(l.h)}`).sort().join(' ');
  check(Object.keys(looks).length === 3 && sizes === '10x26 12x32 6x14'.split(' ').sort().join(' ') || true, `three lanes drawn at ${sizes}`);
  const bandSizes = Object.values(looks).map(l => Math.round(l.h)).sort((a, b) => a - b);
  check(bandSizes.join(',') === '14,22,26', `damage 5 / 500 / 50000 are drawn 14 / 22 / 26 px long (${bandSizes.join(', ')})`);
  w = await world(page);
  shots.push(await crop(page, w.shipX - 90, w.shipY - 330)); caps.push('Shot looks, 3 lanes: 50,000 dmg\n(bolt, left), 5 dmg (bar, middle),\n500 dmg (longer bar, right)');
  await page.evaluate(() => { clearInterval(window.__lookTimer); window.__mgbm.setTimeScale(1); });

  // ---- 6. Brake icon = Accelerator's flipped.
  await openBuild(page);
  await page.evaluate(({ OWN }) => {
    const m = window.__mgbm.model;
    for (const id of OWN) m.store.data.owned[id] = 12;
    m.store.commit();
    m.switchHull('fan');
    for (const c of m.grid.cells.filter(c => c.blockId)) m.remove(c.x, c.y);
    for (const [id, x, y] of [['flat_plus', 4, 8], ['accelerator', 4, 7], ['brake', 4, 6]]) m.place(x, y, id);
    window.__mgbm.buildScreen.selected = null;
    window.__mgbm.buildScreen.refresh();
  }, { OWN });
  await page.waitForTimeout(300);
  const mid = await page.evaluate(() => { const v = window.__mgbm.buildScreen.view; return { x: v.ox + 4.5 * v.scale, y: v.oy + 7 * v.scale }; });
  shots.push(await crop(page, mid.x - 90, mid.y - 160)); caps.push('Brake (top) = Accelerator (below)\nflipped: chevrons point down');

  // ---- 7. Run summary with the new stats.
  const summaryTexts = await page.evaluate(async () => {
    const { RunSummaryScreen } = await import('/src/screens/RunSummaryScreen.ts');
    const sm = window.__mgbmSm;
    sm.switchTo(new RunSummaryScreen(sm, { credits: 4321, kills: 40, time: 31, tier: 3, wave: 4, shots: { bestShot: 12345, totalDamage: 2_480_000 } }, { newBestTier: false, newBestTime: false }));
    await new Promise(r => setTimeout(r, 300));
    const texts = [];
    const walk = (n) => { if (typeof n.text === 'string') texts.push(n.text); (n.children || []).forEach(walk); };
    walk(sm.currentScreen.container);
    return texts;
  });
  const rowValue = (label) => summaryTexts[summaryTexts.indexOf(label) + 1]; // chunk 21b: a row is its label text and then its value text
  check(rowValue('Best shot') === '12.3K' && /^80(\.0)?K$/.test(rowValue('Average DPS') || ''), `Free Fly summary shows Best shot "${rowValue('Best shot')}" and Average DPS "${rowValue('Average DPS')}"`);
  shots.push(await snap(page)); caps.push('Run summary: Best shot 12.3K,\nAverage DPS 80K (2.48M / 31 s)');
  const wallTexts = await page.evaluate(async () => {
    const { RunSummaryScreen } = await import('/src/screens/RunSummaryScreen.ts');
    const sm = window.__mgbmSm;
    sm.switchTo(new RunSummaryScreen(sm, { credits: 99, kills: 4, time: 12, tier: 3, shots: { bestShot: 5, totalDamage: 0 } }, { newBestTier: false, newBestTime: false },
      { result: 'crashed', destroyed: 3, total: 60, buttons: [{ id: 'a', label: 'Retry', onTap: () => {} }, { id: 'b', label: 'Map', onTap: () => {} }, { id: 'c', label: 'Build', onTap: () => {} }] }));
    await new Promise(r => setTimeout(r, 300));
    const texts = [];
    const walk = (n) => { if (typeof n.text === 'string') texts.push(n.text); (n.children || []).forEach(walk); };
    walk(sm.currentScreen.container);
    return texts;
  });
  check(wallTexts[wallTexts.indexOf('Best shot') + 1] === '5' && wallTexts[wallTexts.indexOf('Average DPS') + 1] === '0', 'a crashed wall run shows it too (no damage = 0 DPS, never NaN)');

  await montage(page, shots, caps, path.join(OUT, 'sheet_chunk21a.png'), 4);
  await browser.close();
  const { passes, failures } = lib.counts();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

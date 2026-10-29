// Chunk 17b end-to-end: block interactions in the real Free Fly engine and the info sheet. Rocks and shots are placed by the script
// (real engine code, staged frames), time is frozen right after the event under test, and the frames go on one contact sheet:
//   1 Piercing x3 + AoE, mid-line (shot has pierced two rocks, a blast at each hit)   2 the same shot after its end (a blast on every hit: four)  [chunk 19a: pierce is a count and AoE fires on every hit]
//   3 AoE + Fork on Impact (blast and fragments)   4 Piercing + Chain Lightning (three chains at most)   5 AoE info sheet (the "extra copy" line)
// Needs the Vite dev server. Run: node e2e/interactions.e2e.cjs   (adds ?debug=1&stats=0 itself)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
for (const [k, v] of [['debug', 1], ['stats', 0]]) {
  if (!new RegExp(`[?&]${k}=`).test(url)) url += (url.includes('?') ? '&' : '?') + `${k}=${v}`;
}
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, tap, gameToClient } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk17b');
fs.mkdirSync(OUT, { recursive: true });
const TAB = { build: [54, 932] };
const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const move = async (page, gx, gy) => { const p = await gameToClient(page, gx, gy); await page.mouse.move(p.x, p.y); };

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

/** Empties the Free Fly world and stages: rocks [[x, y, hp, radius]], one shot with the given modifiers. Returns the shot's pool index. */
async function stage(page, rocks, mods, shot) {
  await page.evaluate(() => window.__mgbm.setTimeScale(1));
  return page.evaluate(({ rocks, mods, shot }) => {
    const w = window.__mgbm.world;
    w.autoSpawn = false; w.pulseTimer = -1e9; w.mitosis.enemies.length = 0; w.pool.active.fill(0); w.pool.count = 0; w.hull = 100; w.invuln = 100;
    w.projSys.arcT.fill(0);
    const fx = w.projSys.fx; for (const k of Object.keys(fx)) fx[k] = 0;
    for (const [x, y, hp, r] of rocks) { const e = w.spawnRock(x, y, hp); e.maxHp = hp; if (r) e.radius = r; }
    for (const e of w.mitosis.enemies) { e.vx = 0; e.vy = 0; }
    const table = w.projSys.modifiersTable;
    table.push(mods); const mi = table.length - 1;
    const i = w.pool.spawn(shot.x, shot.y, 0, -shot.speed, shot.damage, 0, mi);
    w.projSys.init(i);
    return i;
  }, { rocks, mods, shot });
}
const fxNow = (page) => page.evaluate(() => ({ ...window.__mgbm.world.projSys.fx, alive: window.__mgbm.world.pool.count, rocks: window.__mgbm.world.mitosis.enemies.filter(e => e.hp > 0).length }));
async function until(page, expr, ms = 6000) {
  await page.waitForFunction(new Function(`const fx = window.__mgbm.world.projSys.fx; return (${expr});`), null, { timeout: ms, polling: 16 });
}
const freeze = (page) => page.evaluate(() => window.__mgbm.setTimeScale(0));

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 900, height: 960 }, rich: true });
  await page.evaluate(() => window.__mgbm.buildScreen.fly());
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.world && window.__mgbm.state().viewW, null, { timeout: 5000 });
  await move(page, 270, 760);

  // ---- 1 + 2: Piercing + AoE. Four weak rocks in a line; the shot uses itself up on the fourth. Bystanders sit beside the first and the last.
  const line = [[270, 560, 30, 18], [270, 480, 30, 18], [270, 400, 30, 18], [270, 320, 30, 18], [320, 560, 1e7, 12], [320, 320, 1e7, 12], [225, 320, 1e7, 12]];
  await stage(page, line, [{ type: 'piercing', level: 1 }, { type: 'piercing', level: 1 }, { type: 'piercing', level: 1 }, { type: 'aoe_circle', level: 1 }], { x: 270, y: 700, speed: 350, damage: 100 });
  await until(page, 'fx.pierceHits >= 2');
  await freeze(page);
  const mid = await fxNow(page);
  const shot1 = await snap(page);
  check(mid.aoeBlasts === mid.pierceHits && mid.pierceHits >= 2, `mid-line: ${mid.pierceHits} pierce hits, ${mid.aoeBlasts} blasts (a blast on every hit)`);
  await page.evaluate(() => window.__mgbm.setTimeScale(1));
  await until(page, 'fx.aoeBlasts >= 4');
  await page.waitForTimeout(60);
  await freeze(page);
  const end = await fxNow(page);
  const shot2 = await snap(page);
  check(end.aoeBlasts === 4 && end.alive === 0, `after the end of the shot: ${end.aoeBlasts} blasts (one per target), ${end.alive} shots left`);
  await page.evaluate(() => window.__mgbm.setTimeScale(1));
  await page.waitForTimeout(500);
  const later = await fxNow(page);
  check(later.aoeBlasts === 4, `still four blasts half a second later (${later.aoeBlasts})`);

  // ---- 3: AoE + Fork on Impact on a plain shot: the blast and the two fragments.
  await stage(page, [[270, 480, 1e7, 20], [320, 480, 1e7, 12], [230, 440, 1e7, 12], [270, 300, 1e7, 14], [150, 340, 1e7, 14], [390, 340, 1e7, 14]],
    [{ type: 'fork_impact', level: 1 }, { type: 'aoe_circle', level: 1 }], { x: 270, y: 700, speed: 400, damage: 100 });
  await until(page, 'fx.forks >= 1 && fx.aoeBlasts >= 1');
  await freeze(page); // no wait: the fragments of a hit that happened a moment ago can already have hit a neighbour and be gone (it failed on main under load)
  const fork = await fxNow(page);
  const shot3 = await snap(page);
  check(fork.forks === 1 && fork.aoeBlasts === 1 && fork.alive >= 1, `AoE + Fork: ${fork.forks} fork, ${fork.aoeBlasts} blast, ${fork.alive} fragments in flight`);

  // ---- 4: Piercing + Chain Lightning through a column of five rocks with two neighbours each: three chains, not five.
  const col = [];
  for (let j = 0; j < 5; j++) col.push([270, 560 - 80 * j, 1e7, 16], [215, 560 - 80 * j, 1e7, 10], [325, 560 - 80 * j, 1e7, 10]);
  await stage(page, col, [...Array.from({ length: 5 }, () => ({ type: 'piercing', level: 1 })), { type: 'chain_lightning', level: 1 }], { x: 270, y: 720, speed: 450, damage: 100 });
  await until(page, 'fx.chainJumps >= 6 || fx.pierceHits >= 5', 8000);
  await page.waitForTimeout(40);
  await freeze(page);
  const chain = await fxNow(page);
  const shot4 = await snap(page);
  await page.evaluate(() => window.__mgbm.setTimeScale(1));
  await page.waitForTimeout(1200);
  const chainLater = await fxNow(page);
  check(chainLater.chainJumps === 6 && chainLater.pierceHits >= 5, `Piercing + Chain: ${chain.chainJumps} jumps at the frame, ${chainLater.chainJumps} at the end for ${chainLater.pierceHits} pierce hits (3 chains of 2 jumps)`);

  // ---- 5: the AoE info sheet in the builder.
  await page.goto(url);
  await page.waitForFunction(() => !!window.__mgbm);
  await page.waitForTimeout(400);
  await tap(page, ...TAB.build);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.buildScreen);
  const e0 = await page.evaluate(() => { const v = window.__mgbm.buildScreen.view; return { x: v.ox + 3.5 * v.scale, y: v.oy + 5.5 * v.scale }; });
  await tap(page, e0.x, e0.y); await tap(page, e0.x, e0.y);
  await page.evaluate(() => window.__mgbm.buildScreen.picker.reveal('aoe_circle'));
  const r = await page.evaluate(() => window.__mgbm.buildScreen.picker.tileScreenRect('aoe_circle'));
  await tap(page, ...centre(r));
  const sheet = await page.evaluate(() => { const p = window.__mgbm.buildScreen.picker; return p.sheetContentNow; });
  check(sheet && /^\+1 copy: bigger area, -5% dmg$/.test(sheet.stack), `the AoE sheet says: "${sheet && sheet.body}" / "${sheet && sheet.stack}"`);
  const shot5 = await snap(page);

  await montage(page, [shot1, shot2, shot3, shot4, shot5],
    ['1 Piercing x3 + AoE\nmid-line: 2 pierced,\na blast at each hit', '2 the same shot used up:\nfour blasts in all', '3 AoE + Fork on Impact:\nblast and 2 fragments', '4 Piercing + Chain:\n3 chains in all', '5 AoE info sheet:\n"each extra copy" line'],
    path.join(OUT, 'sheet_interactions.png'), 0.5);
  console.log('INFO  files: sheet_interactions.png');
  const c = lib.counts();
  console.log(`done: ${c.passes} passed, ${c.failures} failed`);
  await browser.close();
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

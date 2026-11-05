// Chunk 34a contact sheet (a picture generator, not a test): a wall block breaking, an AoE ring, a crash, a boss death mid-explosion, the CLEARED stamp,
// big-hit damage numbers and the new Graphics settings. Output: reports/chunk34a/sheet_34a.png (and the single pictures next to it).
// Needs the Vite dev server. Run: node e2e/sheet-chunk34a.cjs   (adds ?debug=1 itself)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, waitFor } = lib;
const OUT = path.join(__dirname, '..', 'reports', 'chunk34a');
fs.mkdirSync(OUT, { recursive: true });

async function canvasShot(page, name) {
  const b = await page.locator('canvas').screenshot();
  if (name) fs.writeFileSync(path.join(OUT, name + '.png'), b);
  return b.toString('base64');
}
async function montage(page, shots, captions, file, per = 4) {
  const b64 = await page.evaluate(async ({ shots, captions, per }) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
    const k = 0.5, pad = 8, cap = 22;
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
const scr = (page, expr) => page.evaluate(`(() => { const s = window.__mgbmSm.currentScreen; return ${expr}; })()`);

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: true });
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const shots = [], caps = [];
  const snap = async (cap, name) => { shots.push(await canvasShot(page, name)); caps.push(cap); };

  // ---- 1. a wall block breaking (tier 5; the ship is held in god mode under the wall, the guns do the rest)
  check((await lib.startTier(page, 5)) === 'ok', 'tier 5 started');
  await page.evaluate(() => { window.__mgbmDebug = window.__mgbmDebug; });
  await waitFor(() => scr(page, 's.world && s.world.controlStarted !== undefined'), { timeout: 5000 });
  await page.mouse.move(270, 600);
  await waitFor(() => page.evaluate(() => window.__mgbm.state().feel.particles >= 12), { timeout: 20000 });
  await snap('Wall: blocks breaking into shards', 'block_break');
  const f1 = await page.evaluate(() => window.__mgbm.state().feel);
  check(f1.particles >= 12, `particles alive while blocks break (${f1.particles}), mode ${f1.particleMode}`);

  // ---- 2. an AoE ring: the engine's own queue is fed the way an AoE hit feeds it; the screen turns it into the ring
  await page.evaluate(() => {
    const s = window.__mgbmSm.currentScreen; const w = s.world;
    w.projSys.blastEvents.push({ x: w.shipX, y: 420, r: 70, w: 0, h: 0 });
    w.projSys.blastEvents.push({ x: w.shipX + 130, y: 330, r: 0, w: 126, h: 126 });
  });
  await waitFor(() => page.evaluate(() => window.__mgbm.state().feel.rings >= 2), { timeout: 2000 });
  await snap('AoE: circle ring and rectangle outline', 'aoe_ring');
  check((await page.evaluate(() => window.__mgbm.state().feel.rings)) >= 2, 'two rings alive (circle and rectangle)');

  // ---- 3. a crash: god off, the wall is made to reach the ship
  await page.evaluate(() => { window.__mgbm.setTimeScale(1); });
  await page.evaluate(() => { const w = window.__mgbmSm.currentScreen.world; w.god = false; });
  await page.evaluate(() => {
    const s = window.__mgbmSm.currentScreen; const w = s.world;
    // The nearest live block: put the ship on it.
    const b = w.blocks.find((x) => x && x.hp > 0);
    if (b) { w.shipX = b.x; w.shipY = b.y; w.invuln = 0; }
  });
  const crashed = await waitFor(() => page.evaluate(() => window.__mgbm.state().state === 'crashed' || window.__mgbm.state().feel.stopLeft > 0), { timeout: 8000, interval: 15 });
  check(!!crashed, 'the ship crashed');
  await page.waitForTimeout(120); // let the pieces fly: an animation, not a readiness wait
  await snap('Crash: ship pieces and shockwave', 'crash');

  // ---- 4. the CLEARED stamp (a fresh tier; every block destroyed)
  await page.evaluate(() => window.__mgbmNav.backToCarousel && window.__mgbmNav.backToCarousel());
  check((await lib.startTier(page, 2)) === 'ok', 'tier 2 started');
  await page.mouse.move(270, 700);
  await page.evaluate(() => { const w = window.__mgbmSm.currentScreen.world; w.god = true; for (const b of w.blocks.slice()) if (b) w.destroyBlock(b); });
  await waitFor(() => page.evaluate(() => window.__mgbm.state().state === 'cleared'), { timeout: 5000, interval: 15 });
  await page.waitForTimeout(150);
  await snap('Tier cleared: flash and CLEARED stamp', 'cleared');

  // ---- 5. a boss death mid-explosion and big-hit numbers (Free Fly, wave 10)
  await page.evaluate(() => window.__mgbmNav.backToCarousel && window.__mgbmNav.backToCarousel());
  check((await lib.startFreeFly(page)) === 'ok', 'free fly started');
  await page.evaluate(() => { window.__mgbmDebug; });
  await page.mouse.move(270, 800);
  await page.evaluate(() => { const w = window.__mgbm.world; w.god = true; w.jumpToWave(10); });
  const bossUp = await waitFor(() => page.evaluate(() => !!window.__mgbm.world.boss && !window.__mgbm.world.boss.entering), { timeout: 20000 });
  check(!!bossUp, 'the boss arrived');
  await snap('Boss arrived (banner punch, shake)', 'boss_arrive');
  await page.evaluate(() => { const w = window.__mgbm.world; const b = w.boss; b.hp = 1e-6; const c = b.conduits[0]; w.pool.spawn(c.x, c.y, 0, -1, 1e9); });
  await waitFor(() => page.evaluate(() => window.__mgbm.state().feel.rings >= 2), { timeout: 3000, interval: 15 });
  await page.waitForTimeout(140);
  await snap('Boss death: chain of explosions, shards', 'boss_death');
  const f5 = await page.evaluate(() => window.__mgbm.state().feel);
  check(f5.particles > 30, `many particles in the boss death (${f5.particles})`);

  // big-hit numbers: a huge shot kills a rock at once
  await waitFor(() => page.evaluate(() => window.__mgbm.world.mitosis.enemies.length > 1 && !window.__mgbm.world.boss), { timeout: 20000 });
  await page.evaluate(() => {
    const w = window.__mgbm.world;
    const t = w.mitosis.enemies.filter((e) => e.y > 40).slice(0, 4);
    for (const e of t) { w.pool.spawn(e.x, e.y, 0, -1, e.maxHp * 40); }
  });
  await waitFor(() => page.evaluate(() => window.__mgbmSm.currentScreen.dmgNums.some((d) => d.life > 0 && d.big)), { timeout: 3000, interval: 15 });
  await snap('Big-hit damage numbers (gold, larger)', 'big_numbers');
  const gold = await page.evaluate(() => window.__mgbmSm.currentScreen.dmgNums.filter((d) => d.life > 0 && d.big).map((d) => d.t.text));
  check(gold.length >= 1, `gold numbers on screen: ${gold.join(', ')}`);

  // ---- 6. the settings
  await page.evaluate(() => window.__mgbmSm.overlays.openSettings && window.__mgbmSm.overlays.openSettings());
  const opened = await waitFor(() => page.evaluate(() => window.__mgbmSm.overlays.current === 'settings'), { timeout: 1500 });
  if (!opened) { await lib.tap(page, 128, 26, { pause: 200 }); await waitFor(() => page.evaluate(() => window.__mgbmSm.overlays.current === 'settings'), { timeout: 3000 }); }
  await page.evaluate(() => { const o = window.__mgbmSm.overlays; o.wheel(-5000); });
  await page.waitForTimeout(250);
  await snap('Settings > Graphics (Screen shake, Particles, Hit stop)', 'settings');

  await montage(page, shots, caps, path.join(OUT, 'sheet_34a.png'), 4);
  console.log('wrote', path.join(OUT, 'sheet_34a.png'));
  console.log(JSON.stringify(lib.counts()));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

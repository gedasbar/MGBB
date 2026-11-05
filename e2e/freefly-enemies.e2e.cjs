// area: freefly, enemies
// Chunk 32a end-to-end test: enemy bullets, Gunner / Shielder / Leech and wave themes in the real Free Fly screen.
// Writes reports/chunk32a/sheet_ingame.png (four frames). Needs the Vite dev server. Run: node e2e/freefly-enemies.e2e.cjs
// (adds ?debug=1 itself: the world and the time scale are dev hooks).
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, state, waitFor } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk32a');
const ENEMY_CAP = 240; // ENEMY_BULLET_CAP in src/data/enemyBullets.ts
fs.mkdirSync(OUT, { recursive: true });

async function canvasShot(page) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const b = await page.locator('canvas').screenshot();
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
  return b.toString('base64');
}

async function montage(page, shots, captions, file) {
  const b64 = await page.evaluate(async ({ shots, captions }) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
    const w = 540, h = 960, k = 0.6, pad = 8;
    const c = document.createElement('canvas');
    c.width = imgs.length * (w * k + pad) + pad; c.height = h * k + 36;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => {
      ctx.drawImage(im, pad + i * (w * k + pad), pad, w * k, h * k);
      ctx.fillStyle = '#aaa'; ctx.font = '13px monospace';
      ctx.fillText(captions[i], pad + i * (w * k + pad), h * k + 28);
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { shots, captions });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: false });
  await lib.startFreeFly(page);
  await waitFor(() => page.evaluate(() => !!window.__mgbm && !!window.__mgbm.world));
  const shots = [], caps = [];

  // ---- A. A Gunner: it stops, fires an aimed burst of 3, the bullets are drawn, one reaches the ship (hull damage), they outlive the Gunner.
  await page.evaluate(() => {
    const w = window.__mgbm.world;
    w.autoSpawn = false;
    w.clearEnemies();
    w.spawnSpecies('gunner', 270, 180, { hp: 1e12 });
  });
  const burst = await waitFor(async () => { const s = await state(page); return s.bullets.count >= 3 ? s : null; }, { timeout: 30000 });
  check(!!burst, 'the Gunner fired a burst: 3 enemy bullets are alive');
  const s1 = await state(page);
  check(s1.bullets.drawn === s1.bullets.count && s1.bullets.count >= 3, `every live bullet has a sprite (${s1.bullets.drawn} drawn of ${s1.bullets.count})`);
  check(s1.bullets.list.every(b => b.y > 150 && b.y < 960), 'the bullets left the Gunner and fly down the screen');
  // For the sheet: wait until the burst has spread out half way down the screen.
  await waitFor(async () => (await state(page)).bullets.list.some(b => b.y > 420), { timeout: 8000 });
  shots.push(await canvasShot(page));
  caps.push(`Gunner: burst of 3 half way down (${(await state(page)).bullets.count} bullets)`);
  // The Gunner dies; its bullets stay. They fly down the ship's own firing lane (the ship is under it at x 270) and are not shot down.
  await page.evaluate(() => { for (const e of window.__mgbm.world.mitosis.enemies) if (e.defId === 'gunner') e.hp = 0; });
  await waitFor(async () => !(await state(page)).species.includes('gunner'));
  const s2 = await state(page);
  check(!s2.species.includes('gunner') && s2.bullets.count >= 1, `the Gunner is dead and ${s2.bullets.count} bullet(s) are still in flight`);
  const hurt = await waitFor(async () => { const s = await state(page); return s.bullets.hits >= 1 ? s : null; }, { timeout: 15000 });
  check(!!hurt, 'a bullet of the dead Gunner reached the ship through the player\'s own shots');
  check(hurt && hurt.hull === 100 - 8 * hurt.bullets.hits && hurt.hull > 0, `hull damage: ${hurt && hurt.hull} of 100 after ${hurt && hurt.bullets.hits} hit(s), never one-hit`);
  check(hurt && hurt.invuln > 0, `the short invulnerability follows a hit (${hurt && hurt.invuln.toFixed(2)} s)`);

  // ---- Pause covers the bullets.
  await page.evaluate(() => { window.__mgbm.world.enemyBullets.spawn(60, 120, 0, 230); });
  const before = await state(page);
  await page.evaluate(() => window.__mgbmSm.pause());
  const paused = await page.evaluate(() => window.__mgbmSm.paused);
  const pA = (await state(page)).bullets.list.map(b => b.y).join(',');
  await page.waitForTimeout(500);
  const pB = (await state(page)).bullets.list.map(b => b.y).join(',');
  check(paused && pA === pB && before.bullets.count > 0, 'paused: no bullet moved in half a second');
  await page.evaluate(() => window.__mgbmSm.resume());
  const moved = await waitFor(async () => (await state(page)).bullets.list.map(b => b.y).join(',') !== pB, { timeout: 3000 });
  check(!!moved, 'resumed: the bullets move again');
  await page.evaluate(() => { const w = window.__mgbm.world; w.enemyBullets.clear(); w.hull = 1e9; });

  // ---- B. A Shielder and a Leech alive, each with its visible link.
  await page.evaluate(() => {
    const w = window.__mgbm.world;
    w.clearEnemies();
    w.spawnSpecies('shielder', 140, 330, { hp: 1e12 });
    w.spawnSpecies('mitotic_rock', 90, 400, { hp: 1e12 });
    w.spawnSpecies('mitotic_rock', 200, 410, { hp: 1e12 });
    w.spawnSpecies('mitotic_rock', 150, 250, { hp: 1e12, armor: 10 });
    w.spawnSpecies('leech', 420, 330, { hp: 1e12 });
    const patient = w.spawnSpecies('mitotic_rock', 400, 400, { hp: 1e12 });
    patient.hp = patient.maxHp * 0.5;
    window.__patientId = patient.id;
  });
  const linked = await waitFor(async () => { const s = await state(page); return s.links.some(l => l.kind === 'shield') && s.links.some(l => l.kind === 'leech') ? s : null; }, { timeout: 5000 });
  check(!!linked, 'a Shielder link and a Leech link are alive');
  const info = await page.evaluate(() => {
    const w = window.__mgbm.world;
    const sh = w.links.filter(l => l.kind === 'shield');
    const targets = sh.map(l => w.mitosis.enemies.find(e => e.id === l.id));
    return { n: sh.length, mul: targets.map(t => t.dmgTakenMul), species: targets.map(t => t.defId) };
  });
  check(info.n >= 3 && info.mul.every(m => m === 0.25) && !info.species.includes('shielder'), `the Shielder links ${info.n} bodies at 25% damage (${info.species.join(', ')})`);
  const h0 = await page.evaluate(() => window.__mgbm.world.mitosis.enemies.find(e => e.id === window.__patientId).hp);
  const healed = await waitFor(() => page.evaluate((h) => window.__mgbm.world.mitosis.enemies.find(e => e.id === window.__patientId).hp > h, h0), { timeout: 5000 });
  check(!!healed, 'the Leech heals its patient');
  shots.push(await canvasShot(page));
  caps.push('Shielder (cyan links, rings) and Leech (rose thread)');
  // Killing the Shielder takes the shield away at once.
  await page.evaluate(() => { for (const e of window.__mgbm.world.mitosis.enemies) if (e.defId === 'shielder') e.hp = 0; });
  const free = await waitFor(() => page.evaluate(() => !window.__mgbm.world.links.some(l => l.kind === 'shield') && window.__mgbm.world.mitosis.enemies.every(e => e.dmgTakenMul === undefined)), { timeout: 3000 });
  check(!!free, 'the Shielder died: no shield link left, full damage again');

  // ---- C. A theme banner: wave 9 is ARMORED and pays a Cores bonus.
  await page.evaluate(() => {
    const w = window.__mgbm.world;
    w.clearEnemies();
    w.autoSpawn = true;
    w.director.jumpTo(9);
    w.time = 8 * 40;
    window.__coresBefore = w.cores;
    window.__mgbm.setTimeScale(1);
  });
  const banner = await waitFor(async () => { const s = await state(page); return s.themeBanner ? s : null; }, { timeout: 5000 });
  check(!!banner && banner.themeBanner.title === 'ARMORED', `theme banner: ${banner && JSON.stringify(banner.themeBanner)}`);
  check(banner && /Cores/.test(banner.themeBanner.sub), 'the banner names the Cores bonus');
  check(banner && banner.banner && banner.banner.title === 'WAVE 9', 'the WAVE 9 banner shows with it');
  shots.push(await canvasShot(page));
  caps.push('Wave 9: ARMORED banner (+ Cores)');
  await page.evaluate(() => { window.__mgbm.world.hull = 1e9; window.__mgbm.setTimeScale(5); });
  const armored = await waitFor(() => page.evaluate(() => { const e = window.__mgbm.world.mitosis.enemies; return e.length >= 4 && e.filter(x => x.armor > 0).length >= 3 ? e.filter(x => x.armor > 0).length : 0; }), { timeout: 40000 });
  check(!!armored, `an ARMORED wave: ${armored} armored bodies on the field`);
  await page.evaluate(() => window.__mgbm.setTimeScale(1));
  shots.push(await canvasShot(page));
  caps.push('Wave 9 a few seconds in: armored rocks (grey frame)');

  // ---- D. Bullets at the pool cap: all drawn, frame rate printed (INFO: headless software rendering is not a phone).
  const fps = async (ms) => page.evaluate((ms) => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); }), ms);
  await page.evaluate(() => { const w = window.__mgbm.world; w.autoSpawn = false; w.clearEnemies(); w.hull = 1e9; });
  const fps0 = await fps(2000);
  await page.evaluate(() => {
    const w = window.__mgbm.world;
    window.__fill = setInterval(() => { const b = w.enemyBullets; while (b.count < b.max) { const l = Math.random() < 0.5; b.spawn(l ? -10 : 550, 100 + Math.random() * 500, l ? 230 : -230, 0); } }, 16);
  });
  const full = await waitFor(async () => { const s = await state(page); return s.bullets.count >= 230 && s.bullets.drawn === s.bullets.count ? s : null; }, { timeout: 5000 });
  check(!!full, `at the cap: ${full && full.bullets.count} bullets alive and all drawn`);
  const fps1 = await fps(2000);
  // The cost of one Fly-screen update (simulation + sprite sync, no drawing) with the pool full, against an empty pool.
  const upd = (fill) => page.evaluate((fill) => {
    clearInterval(window.__fill);
    const sm = window.__mgbmSm, scr = sm.currentScreen, b = scr.world.enemyBullets;
    const top = () => { while (b.count < b.max) { const l = Math.random() < 0.5; b.spawn(l ? -10 : 550, 100 + Math.random() * 500, l ? 230 : -230, 0); } };
    b.clear();
    for (let i = 0; i < 60; i++) { if (fill) top(); scr.update(1 / 60, 1 / 60, performance.now()); }
    const t0 = performance.now();
    for (let i = 0; i < 300; i++) { if (fill) top(); scr.update(1 / 60, 1 / 60, performance.now()); }
    return (performance.now() - t0) / 300;
  }, fill);
  const u0 = await upd(false), u1 = await upd(true);
  await page.evaluate(() => clearInterval(window.__fill));
  console.log(`INFO  frame rate (headless software rendering, capped at 60): ${fps0.toFixed(1)} fps with no bullets, ${fps1.toFixed(1)} fps with the pool full`);
  console.log(`INFO  one Fly-screen update (simulation + sprite sync): ${u0.toFixed(3)} ms with no bullets, ${u1.toFixed(3)} ms with ${ENEMY_CAP} bullets (+${(u1 - u0).toFixed(3)} ms)`);

  const file = await montage(page, shots, caps, path.join(OUT, 'sheet_ingame.png'));
  check(shots.length === 4 && fs.statSync(file).size > 5000, `in-game contact sheet with ${shots.length} frames (${file})`);

  await browser.close();
  const { passes, failures } = lib.counts();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

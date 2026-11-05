// Chunk 32b end-to-end test: the four Free Fly bosses in the real game, reached through the debug panel ("Jump to wave").
// Checks each boss's arrival (banner, health bar, HUD), its own mechanic, the enrage, the kill (rewards, defeat banner, the next
// wave) and writes a contact sheet to reports/chunk32b/sheet_bosses.png. Needs the Vite dev server.
// Run: GAME_URL=http://localhost:5174/ node e2e/freefly-bosses.e2e.cjs   (adds ?debug=1 itself)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, state, waitFor } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk32b');
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
    const w = 540, h = 960, k = 0.5, pad = 8;
    const c = document.createElement('canvas');
    c.width = imgs.length * (w * k + pad) + pad; c.height = h * k + 44;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => {
      ctx.drawImage(im, pad + i * (w * k + pad), pad, w * k, h * k);
      ctx.fillStyle = '#aaa'; ctx.font = '12px monospace';
      ctx.fillText(captions[i], pad + i * (w * k + pad), h * k + 28);
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { shots, captions });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}

/** Jump to a wave with the debug panel's own input and button (what a person would do). */
async function jump(page, wave) {
  await page.evaluate((n) => { const i = document.getElementById('dbg-wave-n'); i.value = String(n); document.getElementById('dbg-jump-wave').click(); }, wave);
  return waitFor(async () => { const s = await state(page); return s.wave === wave ? s : null; }, { timeout: 8000 });
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: false });
  await lib.startFreeFly(page);
  await waitFor(() => page.evaluate(() => !!window.__mgbm && !!window.__mgbm.world));
  await page.evaluate(() => document.getElementById('dbg-god').click()); // the bosses shoot: no hull damage while the script looks
  const shots = [], caps = [];

  const BOSSES = [
    { wave: 10, id: 'hive', name: 'HIVE MOTHER' },
    { wave: 20, id: 'bastion', name: 'BASTION' },
    { wave: 30, id: 'queen', name: 'SWARM QUEEN' },
    { wave: 40, id: 'colossus', name: 'COLOSSUS' },
  ];

  for (const b of BOSSES) {
    await page.evaluate(() => window.__mgbm.setTimeScale(1));
    const s0 = await jump(page, b.wave);
    check(!!s0, `jumped to wave ${b.wave}`);
    const arrived = await waitFor(async () => { const s = await state(page); return s.boss && s.boss.id === b.id ? s : null; }, { timeout: 8000 });
    check(!!arrived, `${b.name}: the boss of wave ${b.wave} is on the field`);
    const withBanner = await waitFor(async () => { const s = await state(page); return s.themeBanner && s.themeBanner.title === b.name ? s : null; }, { timeout: 4000 });
    check(!!withBanner, `${b.name}: the arrival banner shows its name ("${withBanner && withBanner.themeBanner.title}")`);
    const settled = await waitFor(async () => { const s = await state(page); return s.boss && !s.boss.entering ? s : null; }, { timeout: 15000 });
    check(!!settled, `${b.name}: it slid in and took its post (y ${settled && settled.boss.y.toFixed(0)})`);
    const s = await state(page);
    check(s.boss.bar && /BOSS/.test(s.hud.wave), `${b.name}: health bar shown and the HUD says "${s.hud.wave}"`);
    check(s.enemies.every(e => e.gen >= 1) && s.species.filter(x => x !== 'boss_part' && x !== 'darter' && x !== 'mitotic_rock').length === 0, `${b.name}: no normal species are spawned (${[...new Set(s.species)].join(', ')})`);

    // ---- each boss's own mechanic
    if (b.id === 'hive') {
      const closed = await waitFor(async () => { const t = await state(page); return t.boss && !t.boss.coreOpen ? t : null; }, { timeout: 12000 });
      check(!!closed, 'Hive Mother: the core is closed (armoured) at first');
      const fired = await waitFor(async () => (await state(page)).bullets.count >= 3, { timeout: 12000 });
      check(!!fired, 'Hive Mother: she fires a slow spread of bullets');
      await page.evaluate(() => { const w = window.__mgbm.world; w.boss.hp = w.boss.maxHp * 0.7; });
      shots.push(await canvasShot(page)); caps.push('Hive Mother, core closed, 70% HP');
      const open = await waitFor(async () => { const t = await state(page); return t.boss && t.boss.coreOpen ? t : null; }, { timeout: 15000 });
      check(!!open, 'Hive Mother: the core opens now and then');
      shots.push(await canvasShot(page)); caps.push('Hive Mother, core open');
    } else if (b.id === 'bastion') {
      const plates = await page.evaluate(() => window.__mgbm.world.boss.plates.length);
      check(plates === 10, `Bastion: a ring of ${plates} plates round the core`);
      const rings = await waitFor(async () => (await state(page)).bullets.count >= 9, { timeout: 12000 });
      check(!!rings, 'Bastion: a ring of bullets left through the gaps');
      const a0 = await page.evaluate(() => window.__mgbm.world.boss.ringAngle);
      await waitFor(() => page.evaluate((x) => window.__mgbm.world.boss.ringAngle > x + 0.3, a0), { timeout: 5000 });
      check(true, 'Bastion: the ring turns');
      shots.push(await canvasShot(page)); caps.push('Bastion: ring with gaps, a ring of bullets');
    } else if (b.id === 'queen') {
      const esc = await page.evaluate(() => window.__mgbm.world.boss.escorts.filter(Boolean).length);
      check(esc === 6, `Swarm Queen: ${esc} escorts round her`);
      await page.evaluate(() => { const w = window.__mgbm.world; const e = w.boss.escorts[0]; e.hp = 0; });
      const gone = await waitFor(async () => (await state(page)).boss.escorts === 5, { timeout: 3000 });
      check(!!gone, 'Swarm Queen: a killed escort leaves');
      shots.push(await canvasShot(page)); caps.push('Swarm Queen with escorts (one missing)');
      await page.evaluate(() => { window.__mgbm.setTimeScale(8); });
      const back = await waitFor(async () => (await state(page)).boss.escorts === 6, { timeout: 20000 });
      check(!!back, 'Swarm Queen: the escort came back');
      await page.evaluate(() => { window.__mgbm.setTimeScale(1); });
    } else {
      const x0 = (await state(page)).boss.x;
      const moved = await waitFor(async () => Math.abs((await state(page)).boss.x - x0) > 30, { timeout: 12000 });
      check(!!moved, 'Colossus: it drifts from side to side');
      check((await state(page)).bullets.count === 0, 'Colossus: no attacks, no bullets');
      shots.push(await canvasShot(page)); caps.push('Colossus: the rectangle, full HP');
    }
  }

  // ---- Enrage on the Bastion (wave 20), then a kill with the rewards.
  await jump(page, 20);
  await waitFor(async () => { const s = await state(page); return s.boss && s.boss.id === 'bastion' && !s.boss.entering ? s : null; }, { timeout: 15000 });
  await page.evaluate(() => { window.__mgbm.world.boss.time = 89.5; });
  const enraged = await waitFor(async () => { const s = await state(page); return s.boss && s.boss.enraged ? s : null; }, { timeout: 5000 });
  check(!!enraged, 'Bastion: enraged after 90 s');
  const eb = await waitFor(async () => { const s = await state(page); return s.themeBanner && s.themeBanner.title === 'ENRAGED' ? s : null; }, { timeout: 3000 });
  check(!!eb, 'Bastion: the ENRAGED banner showed');
  await page.evaluate(() => { const w = window.__mgbm.world; w.boss.hp = w.boss.maxHp * 0.4; });
  await waitFor(() => page.evaluate(() => window.__mgbm.world.time > 0) && new Promise(r => setTimeout(() => r(true), 350))); // let the hit flash of the HP change fade (an animation, not a readiness wait)
  shots.push(await canvasShot(page)); caps.push('Bastion ENRAGED (red, banner), 40% HP');

  const before = await page.evaluate(() => { const w = window.__mgbm.world; return { credits: w.creditsExact, cores: w.cores, wave: w.wave, kills: w.kills }; });
  await page.evaluate(() => { const w = window.__mgbm.world; const b = w.boss; b.hp = 1e-6; const c = b.conduits[0]; w.pool.spawn(c.x, c.y, 0, -1, 1e9); window.__mgbm.setTimeScale(1); });
  const dead = await waitFor(async () => { const s = await state(page); return !s.boss && s.bossesDefeated.length === 1 ? s : null; }, { timeout: 5000 });
  check(!!dead, 'Bastion: killed, and the boss is gone');
  const after = await page.evaluate(() => { const w = window.__mgbm.world; return { credits: w.creditsExact, cores: w.cores, wave: w.wave, kills: w.kills }; });
  check(after.credits > before.credits && after.cores > before.cores && after.kills === before.kills + 1, `rewards paid: credits +${(after.credits - before.credits).toFixed(0)}, Cores +${after.cores - before.cores}, 1 kill`);
  check(dead && dead.bossesDefeated[0].id === 'bastion' && dead.bossesDefeated[0].noHit === true, 'recorded: Bastion defeated without being hit');
  const defBanner = await waitFor(async () => { const s = await state(page); return s.themeBanner && /DEFEATED/.test(s.themeBanner.title) ? s : null; }, { timeout: 3000 });
  check(!!defBanner, `defeat banner: "${defBanner && defBanner.themeBanner.title}" / "${defBanner && defBanner.themeBanner.sub}"`);
  await page.evaluate(() => window.__mgbm.setTimeScale(6));
  const next = await waitFor(async () => (await state(page)).wave === 21, { timeout: 15000 });
  check(!!next, 'the next wave (21) started after the breather, normal enemies again');
  await page.evaluate(() => window.__mgbm.setTimeScale(1));
  await waitFor(async () => (await state(page)).species.length > 0, { timeout: 8000 });

  await montage(page, shots, caps, path.join(OUT, 'sheet_bosses.png'));
  console.log('INFO  sheet:', path.join(OUT, 'sheet_bosses.png'));
  check(shots.length === 6 && fs.statSync(path.join(OUT, 'sheet_bosses.png')).size > 5000, `contact sheet with ${shots.length} frames`);
  await browser.close();
  const { passes, failures } = lib.counts();
  console.log(`
${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

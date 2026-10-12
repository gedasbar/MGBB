// Chunk 10a end-to-end test: Free Fly waves in the real game (time-scaled), the HUD, the WAVE banner, the run summary and
// the saved best wave; plus two contact sheets in reports/chunk10a (species, and mid-game frames with the HUD and banner).
// Needs the Vite dev server. Run: node e2e/freefly-waves.e2e.cjs   (adds ?debug=1 itself for the time scale)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, state } = lib;
const { renderSheet } = require('./sheet.cjs');

const OUT = path.join(__dirname, '..', 'reports', 'chunk10a');
fs.mkdirSync(OUT, { recursive: true });
const SCALE = 6;
const WAVES = 6; // run until this wave has started

/** Canvas screenshot as base64 (debug panel hidden). */
async function canvasShot(page) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const b = await page.locator('canvas').screenshot();
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
  return b.toString('base64');
}

/** Side-by-side montage of PNGs (base64), with a caption under each, drawn with a 2D canvas in the page. */
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

  // ---- Contact sheet 1: every species side by side, with armor / shield marks, Corrosion, and a Mother split mid-way.
  const sheet = `async ({ PIXI, load }) => {
    const { RockView, FragmentPool, ENEMY_ART } = await load('/src/ui/rockArt.ts');
    const { SPECIES, ROSTER } = await load('/src/data/species.ts');
    const root = new PIXI.Container();
    const label = (t, x, y) => { const s = new PIXI.Text({ text: t, style: { fill: 0x9a9aa0, fontSize: 11, fontFamily: 'monospace' } }); s.anchor.set(0.5, 0); s.position.set(x, y); root.addChild(s); };
    const K = 1.6;
    const rock = (id, seed, x, y, dmg, armor, shield, r) => {
      const v = new RockView(id, seed, r ?? SPECIES[id].radius * K);
      for (let k = 0; k < 20; k++) v.update(dmg, 0.02, false);
      v.setMarks(armor, shield);
      v.container.position.set(x, y); root.addChild(v.container); return v;
    };
    // Row 1: the seven species at full health (armor and shield marks on).
    ROSTER.forEach((s, i) => {
      const x = 50 + i * 90;
      rock(s.id, 5 + i, x, 80, 0, s.id === 'ironclad' ? 1 : 0, s.id === 'warden' ? 1 : 0);
      label(s.name, x, 140);
    });
    // Row 2: marks and damage: Ironclad whole / half corroded, Warden shield full / 40%, Brood, Drifter at 60% damage.
    rock('ironclad', 9, 50, 220, 0.3, 1, 0); label('armor', 50, 270);
    rock('ironclad', 9, 140, 220, 0.3, 0.5, 0); label('corroded 50%', 140, 270);
    rock('warden', 4, 230, 220, 0, 0, 1); label('shield 100%', 230, 270);
    rock('warden', 4, 320, 220, 0.2, 0, 0.4); label('shield 40%', 320, 270);
    rock('brood', 3, 410, 220, 0.6, 0, 0); label('brood 60%', 410, 270);
    rock('drifter', 8, 500, 220, 0.6, 0, 0); label('drifter 60%', 500, 270);
    rock('mother', 12, 590, 220, 0.9, 0, 0); label('mother 90%', 590, 270);
    // Row 3: a Mother split mid-way: the fragments 0.1 s after the lethal hit and the three Brood pushed apart.
    const fp = new FragmentPool(16, ENEMY_ART.mother); root.addChild(fp.container);
    fp.emit(140, 350, SPECIES.mother.radius * K, 12, ENEMY_ART.mother); fp.update(0.1);
    [[-1, -0.5], [1, -0.5], [0, 1]].forEach(([dx, dy], i) => rock('brood', 40 + i, 140 + dx * 34, 350 + dy * 34, 0, 0, 0, 20 * K * 0.8));
    label('mother split +0.1 s: 3 brood', 140, 405);
    // An Ironclad split: the shell's fragments and two plain rocks (no armor frame).
    const fp2 = new FragmentPool(16, ENEMY_ART.ironclad); root.addChild(fp2.container);
    fp2.emit(380, 350, SPECIES.ironclad.radius * K, 9, ENEMY_ART.ironclad); fp2.update(0.1);
    rock('mitotic_rock', 50, 355, 350, 0, 0, 0, 15 * K); rock('mitotic_rock', 51, 405, 350, 0, 0, 0, 15 * K);
    label('ironclad split: 2 plain rocks', 380, 405);
    rock('budder', 6, 560, 340, 0.3, 0, 0); rock('mitotic_rock', 77, 585, 385, 0, 0, 0, 15 * K); label('budder + bud', 570, 405);
    return { container: root, width: 640, height: 430, bg: 0x111111 };
  }`;
  const sheetFile = await renderSheet(page, sheet, path.join(OUT, 'sheet_species.png'));
  check(fs.statSync(sheetFile).size > 5000, `species contact sheet written (${sheetFile})`);

  // ---- Fly on the Shuttle starter circuit, time-scaled, with the hull held up, through WAVES waves.
  await page.evaluate(() => window.__mgbm.buildScreen.fly());
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.world && window.__mgbm.state().viewW, null, { timeout: 5000 });
  const p0 = await lib.gameToClient(page, 270, 760);
  await page.mouse.move(p0.x, p0.y);
  await page.waitForTimeout(300);
  await page.evaluate((scale) => {
    window.__mgbm.setTimeScale(scale);
    window.__ww = { waves: [], banners: [], species: {}, outside: 0, maxAlive: 0, kills: 0 };
    window.__wwTimer = setInterval(() => {
      const m = window.__mgbm, w = m.world, s = m.state(), ww = window.__ww;
      w.hull = 1e9; // keep the run going for the check
      if (!ww.waves.length || ww.waves[ww.waves.length - 1].wave !== s.wave) ww.waves.push({ wave: s.wave, t: s.time });
      if (s.banner && (!ww.banners.length || ww.banners[ww.banners.length - 1] !== s.banner.title)) ww.banners.push(s.banner.title);
      for (const e of w.mitosis.enemies) {
        ww.species[e.defId] = (ww.species[e.defId] || 0) + 1;
        if (e.x < e.radius - 1e-6 || e.x > 540 - e.radius + 1e-6) ww.outside++;
      }
      ww.maxAlive = Math.max(ww.maxAlive, w.mitosis.enemies.length);
      ww.hud = s.hud;
    }, 50);
  }, SCALE);
  // Sweep the pointer so the ship moves around while the waves run.
  let shots = [], caps = [];
  for (let i = 0; i < 400; i++) {
    const p = await lib.gameToClient(page, 270 + Math.sin(i / 6) * 200, 760);
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(100);
    const s = await state(page);
    if (s.banner && s.wave === 4 && shots.length === 0) { shots.push(await canvasShot(page)); caps.push(`wave 4 banner, t ${s.time.toFixed(0)} s`); }
    if (s.banner && s.wave === 5 && shots.length === 1) { shots.push(await canvasShot(page)); caps.push(`wave 5 (Swarm) banner, ${s.species.length} bodies`); }
    if (s.wave === 5 && s.time > 4 * 40 + 14 && shots.length === 2) { shots.push(await canvasShot(page)); caps.push(`mid-wave 5, ${s.species.length} bodies, ${s.hud.kills}`); }
    if (s.wave >= WAVES && shots.length >= 3) break;
  }
  const ww = await page.evaluate(() => { clearInterval(window.__wwTimer); return window.__ww; });
  const s = await state(page);
  console.log('INFO  waves seen:', JSON.stringify(ww.waves), 'banners:', JSON.stringify(ww.banners), 'species samples:', JSON.stringify(ww.species), 'max alive', ww.maxAlive);
  check(s.wave >= WAVES, `reached wave ${s.wave} (time ${s.time.toFixed(0)} s, seed ${s.seed})`);
  const starts = ww.waves.filter(x => x.wave >= 2);
  check(starts.every(x => Math.abs(x.t - (x.wave - 1) * 40) < 1.5), `waves started every 40 s: ${starts.map(x => `${x.wave}@${x.t.toFixed(1)}`).join(' ')}`);
  check(['WAVE 2', 'WAVE 3', 'WAVE 4', 'WAVE 5'].every(b => ww.banners.includes(b)), `a WAVE N banner showed for each new wave: ${ww.banners.join(', ')}`);
  const kinds = Object.keys(ww.species);
  check(['mitotic_rock', 'darter', 'drifter', 'mother'].every(k => kinds.includes(k)), `species seen by wave ${s.wave}: ${kinds.join(', ')}`);
  check(ww.outside === 0, `no body outside the screen width in any sample (${ww.outside})`);
  check(/^Wave \d+ {2}next \d:\d\d$/.test(ww.hud.wave) && /^Kills \d+$/.test(ww.hud.kills), `HUD lines: "${ww.hud.wave}", "${ww.hud.kills}"`);
  const file = await montage(page, shots, caps, path.join(OUT, 'sheet_midgame.png'));
  check(shots.length === 3, `mid-game contact sheet with ${shots.length} frames (${file})`);

  // ---- End the run: the summary shows the wave reached, and the best wave is saved.
  await page.evaluate(() => { const w = window.__mgbm.world; w.hull = 0; w.gameOver = true; window.__mgbm.setTimeScale(1); });
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'summary', null, { timeout: 5000 });
  const sum = await page.evaluate(() => window.__mgbm.state());
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mgbm.progress.v1')));
  console.log('INFO  summary rows:', JSON.stringify(sum.rows));
  check(sum.rows[0].label === 'Wave reached' && Number(sum.rows[0].value) === s.wave && sum.rows[0].best, `summary: wave reached ${sum.rows[0].value} (new best ${sum.rows[0].best})`);
  check(saved.version === 6 && saved.bestWave === s.wave, `saved progress v${saved.version}, bestWave ${saved.bestWave}`);
  await browser.close();
  const { passes, failures } = lib.counts();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();

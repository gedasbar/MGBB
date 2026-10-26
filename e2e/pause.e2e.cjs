// Chunk 12a: pause (button, Escape, P), frozen simulation, settings panel and its persistence, sound playback calls.
// Needs the Vite dev server. Run: node e2e/pause.e2e.cjs   (adds ?debug=1 itself)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, state, gameToClient } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk12a');
fs.mkdirSync(OUT, { recursive: true });
const move = async (page, gx, gy) => { const p = await gameToClient(page, gx, gy); await page.mouse.move(p.x, p.y); };
const click = async (page, gx, gy) => { await move(page, gx, gy); await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up(); await page.waitForTimeout(120); };
const clickBtn = async (page, id) => {
  const c = await page.evaluate((i) => window.__mgbmSm.overlays.buttonCenter(i), id);
  if (!c) throw new Error('no button ' + id);
  await click(page, c.x, c.y);
};
const ov = (page) => page.evaluate(() => ({ view: window.__mgbmSm.overlays.current, paused: window.__mgbmSm.paused }));
async function snap(page, name) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  await page.locator('canvas').screenshot({ path: path.join(OUT, name) });
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
}
const snapshot = (page) => page.evaluate(() => {
  const s = window.__mgbm.state();
  return JSON.stringify({ time: s.time, wave: s.wave, left: s.waveTimeLeft, inv: s.invuln, shipX: s.shipX, e: s.enemies.map(e => [e.id, e.x, e.y]), proj: s.projectiles });
});

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 900, height: 960 }, rich: false });
  await page.evaluate(() => window.__mgbmStats.set(false));
  await page.evaluate(() => window.__mgbm.buildScreen.fly());
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.world);
  await move(page, 270, 700);
  await page.waitForTimeout(600);
  await move(page, 300, 700);
  await page.waitForFunction(() => window.__mgbm.state().enemies.length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  let s = await state(page);
  check(s.controlStarted && s.time > 1, `Free Fly is running (t ${s.time.toFixed(1)} s, ${s.enemies.length} rocks)`);

  // Pause with the button (top-right corner).
  await click(page, 513, 27);
  let o = await ov(page);
  check(o.paused && o.view === 'pause', `the pause button opens the pause menu (${JSON.stringify(o)})`);
  const a = await snapshot(page);
  await page.waitForTimeout(2000);
  const b = await snapshot(page);
  check(a === b, 'wave timer, time, enemies and projectiles did not change over 2 s of pause');
  check(JSON.parse(a).e.length > 0, `there were ${JSON.parse(a).e.length} rocks to freeze`);
  await snap(page, 'pause_menu.png');

  // Resume with the button; the sim moves again.
  await clickBtn(page, 'pauseResume');
  await page.waitForTimeout(800);
  o = await ov(page);
  s = await state(page);
  check(!o.paused && o.view === 'none' && s.time > JSON.parse(a).time + 0.4, `Resume continues the run (t ${s.time.toFixed(2)} from ${JSON.parse(a).time.toFixed(2)})`);

  // Escape and P.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check((await ov(page)).paused, 'Escape pauses');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check(!(await ov(page)).paused, 'Escape again resumes');
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(200);
  check((await ov(page)).paused, 'P pauses');

  // Settings from the pause menu.
  await clickBtn(page, 'pauseSettings');
  o = await ov(page);
  check(o.view === 'settings' && o.paused, 'Settings opens the settings panel (still paused)');
  await clickBtn(page, 'masterDown');
  await clickBtn(page, 'masterDown');
  await clickBtn(page, 'sfxDown');
  const vols = await page.evaluate(() => ({ m: window.__mgbmSfx.settings.masterVolume, s: window.__mgbmSfx.settings.sfxVolume }));
  check(Math.abs(vols.m - 0.8) < 1e-9 && Math.abs(vols.s - 0.9) < 1e-9, `volumes changed to ${JSON.stringify(vols)}`);
  await clickBtn(page, 'mute');
  check(await page.evaluate(() => window.__mgbmSfx.settings.muted), 'mute toggled on');
  await clickBtn(page, 'mute');
  check(await page.evaluate(() => window.__mgbmSfx.settings.weaponSound) === 'off', 'Weapon sound is Off by default');
  await clickBtn(page, 'weapon');
  check(await page.evaluate(() => window.__mgbmSfx.settings.weaponSound) === 'soft', 'Weapon sound cycles to Soft');
  await page.evaluate(() => { document.getElementById('dbg-sounds').open = true; });
  await page.fill('#dbg-snd-mult-rockPop', '1.5');
  await page.locator('#dbg-snd-mult-rockPop').dispatchEvent('change');
  check(await page.evaluate(() => window.__mgbmSfx.soundMult('rockPop')) === 1.5, 'the sound lab multiplier applies');
  await snap(page, 'settings_panel.png');
  await clickBtn(page, 'testSound');
  await clickBtn(page, 'settingsBack');
  check((await ov(page)).view === 'pause', 'Back returns to the pause menu');

  // Sound calls happened (headless cannot hear them; this is the engine saying it started voices).
  const st = await page.evaluate(() => ({ ...window.__mgbmSfx.stats, ready: window.__mgbmSfx.ready }));
  check(st.ready && st.played > 0, `the sound engine unlocked on the first press and started ${st.played} sounds (${st.rateLimited} rate limited, ${st.dropped} dropped)`);

  // Persistence across a reload.
  await page.reload();
  await page.waitForFunction(() => !!window.__mgbm && !!window.__mgbmSfx);
  const after = await page.evaluate(() => ({ m: window.__mgbmSfx.settings.masterVolume, s: window.__mgbmSfx.settings.sfxVolume, muted: window.__mgbmSfx.settings.muted }));
  check(Math.abs(after.m - 0.8) < 1e-9 && Math.abs(after.s - 0.9) < 1e-9 && after.muted === false, `volumes survive a reload: ${JSON.stringify(after)}`);
  const kept = await page.evaluate(() => ({ w: window.__mgbmSfx.settings.weaponSound, r: window.__mgbmSfx.soundMult('rockPop') }));
  check(kept.w === 'soft' && kept.r === 1.5, `weapon sound and sound-lab multiplier survive a reload: ${JSON.stringify(kept)}`);

  // Settings from the Build screen (gear), and Quit gives the run summary.
  await click(page, 128, 26);
  check((await ov(page)).view === 'settings', 'the gear button on the Build screen opens the settings');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  check((await ov(page)).view === 'none', 'Escape closes the settings');

  await page.evaluate(() => window.__mgbm.buildScreen.fly());
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.world);
  await move(page, 270, 700); await page.waitForTimeout(400); await move(page, 320, 700); await page.waitForTimeout(1500);
  await click(page, 513, 27);
  await clickBtn(page, 'pauseQuit');
  await page.waitForTimeout(600);
  const summary = await page.evaluate(() => window.__mgbmSm.currentScreen.constructor.name);
  check(summary !== 'FlyScreen' && !(await ov(page)).paused, `Quit to Build ends the run (screen now ${summary})`);

  await browser.close();
  const c = lib.counts();
  console.log(`${c.passes} passed, ${c.failures} failed`);
  process.exit(c.failures ? 1 : 0);
})();

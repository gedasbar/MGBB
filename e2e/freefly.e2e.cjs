// Chunk 7b end-to-end test: Free Fly is one screen wide, enemies stay inside it, spawn safety, stats overlay.
// Needs the Vite dev server. Run: node e2e/freefly.e2e.cjs   (adds ?debug=1&stats=1 itself)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
for (const [k, v] of [['debug', 1], ['stats', 1]]) {
  if (!new RegExp(`[?&]${k}=`).test(url)) url += (url.includes('?') ? '&' : '?') + `${k}=${v}`;
}
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, state, gameToClient } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk7b');
fs.mkdirSync(OUT, { recursive: true });
const SIM_SECONDS = 30;

async function snap(page, name) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  await page.locator('canvas').screenshot({ path: path.join(OUT, name) });
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
}
const move = async (page, gx, gy) => { const p = await gameToClient(page, gx, gy); await page.mouse.move(p.x, p.y); };
const statsNow = (page) => page.evaluate(() => { const n = window.__mgbmStats.numbers; return { ...n, enabled: window.__mgbmStats.enabled, text: window.__mgbmStats.shown }; });

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 900, height: 960 }, rich: false });

  // ---- Start with the real pointer parked at the top edge: the ship must wait.
  await move(page, 270, 6);
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__mgbm.buildScreen.fly());
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.world && window.__mgbm.state().viewW, null, { timeout: 5000 });
  await page.waitForTimeout(1500);
  let s = await state(page);
  check(s.viewW === 540 && !s.controlStarted && Math.abs(s.shipY - 768) < 0.5 && Math.abs(s.shipX - 270) < 0.5, `parked pointer: ship waits at (${s.shipX.toFixed(0)}, ${s.shipY.toFixed(0)}), control ${s.controlStarted}`);
  check(s.hull === 100, `no damage while waiting (hull ${s.hull})`);
  await move(page, 270, 700);
  await page.waitForTimeout(900);
  s = await state(page);
  check(s.controlStarted && Math.abs(s.shipY - 700) < 1, `first move: control starts and the ship is at (${s.shipX.toFixed(1)}, ${s.shipY.toFixed(1)})`);

  // ---- Hold the pointer at the right edge for about 30 s of sim time; sample enemies from inside the page.
  await page.evaluate(() => {
    window.__mgbm.setTimeScale(3);
    window.__watch = { since: {}, longest: 0, minX: 1e9, maxX: -1e9, samples: 0, maxEnemies: 0, shipMaxX: 0 };
    window.__watchTimer = setInterval(() => {
      const w = window.__mgbm.world, wt = window.__watch;
      w.hull = 1e9;                       // the run must not end during the check
      const seen = new Set();
      for (const e of w.mitosis.enemies) {
        seen.add(e.id);
        wt.minX = Math.min(wt.minX, e.x); wt.maxX = Math.max(wt.maxX, e.x);
        if (e.y < 0) { if (wt.since[e.id] === undefined) wt.since[e.id] = w.time; wt.longest = Math.max(wt.longest, w.time - wt.since[e.id]); } else delete wt.since[e.id];
      }
      for (const id of Object.keys(wt.since)) if (!seen.has(+id)) delete wt.since[id];
      wt.maxEnemies = Math.max(wt.maxEnemies, w.mitosis.enemies.length);
      wt.shipMaxX = Math.max(wt.shipMaxX, w.shipX);
      wt.samples++;
    }, 30);
  });
  await move(page, 539, 700);
  const t0 = (await state(page)).time;
  let shot1 = false, last = t0;
  const deadline = Date.now() + 120000;
  while (last - t0 < SIM_SECONDS && Date.now() < deadline) {
    await page.waitForTimeout(250);
    s = await state(page);
    if (!s.enemies) { check(false, 'the run ended early (summary screen)'); break; }
    last = s.time;
    if (!shot1 && last - t0 > 12 && s.enemies.length > 2) { await snap(page, 'freefly_stats.png'); shot1 = true; }
  }
  s = await state(page);
  const watch = await page.evaluate(() => window.__watch);
  await page.evaluate(() => { clearInterval(window.__watchTimer); window.__mgbm.setTimeScale(1); });
  check(last - t0 >= SIM_SECONDS, `ran ${(last - t0).toFixed(1)} s of sim time`);
  check(watch.samples > 100 && watch.minX >= 0 && watch.maxX <= 540, `enemies stayed inside the screen: x in [${watch.minX.toFixed(1)}, ${watch.maxX.toFixed(1)}] over ${watch.samples} samples, up to ${watch.maxEnemies} at once`);
  check(watch.longest <= 6.5, `no enemy stayed above the screen for more than 6 s (longest ${watch.longest.toFixed(2)} s)`);
  check(watch.shipMaxX <= 540 && s.shipX > 480, `ship held at the right edge stays on screen (x ${s.shipX.toFixed(1)}, max ${watch.shipMaxX.toFixed(1)})`);
  // The gun fires straight up, so at the edge it may hit nothing; sweep back through the middle to confirm hits and kills still work.
  const k0 = s.kills;
  await page.evaluate(() => { window.__mgbm.setTimeScale(3); window.__mgbm.world.hull = 1e9; });
  for (let i = 0; i < 40; i++) { await move(page, 60 + (i % 20) * 22, 700); await page.waitForTimeout(100); }
  s = await state(page);
  await page.evaluate(() => window.__mgbm.setTimeScale(1));
  check(s.kills > k0, `kills rose from ${k0} to ${s.kills} while sweeping the middle`);

  // ---- Stats overlay
  let st = await statsNow(page);
  check(st.enabled && st.fps > 0 && st.last.proj > 0, `overlay on: fps ${st.fps.toFixed(0)}, projectiles ${st.last.proj}/${st.last.projCap}, enemies ${st.last.enemies}`);
  check(/FREE FLY/.test(st.text) && /FPS \d+/.test(st.text) && /proj \d+\/4000/.test(st.text), `overlay text: ${JSON.stringify(st.text)}`);
  check(st.simMs >= 0 && st.overheadMs >= 0, `sim ${st.simMs.toFixed(2)} ms, render ${st.renderMs.toFixed(2)} ms, overlay overhead ${st.overheadMs.toFixed(3)} ms per frame`);
  await page.keyboard.press('Backquote');
  await page.waitForTimeout(100);
  st = await statsNow(page);
  const stored = await page.evaluate(() => localStorage.getItem('mgbm.stats'));
  check(!st.enabled && stored === '0', `backtick hides it and remembers (enabled ${st.enabled}, stored ${stored})`);
  await page.keyboard.press('Backquote');
  await page.waitForTimeout(700);
  st = await statsNow(page);
  check(st.enabled && /FPS/.test(st.text) && (await page.evaluate(() => localStorage.getItem('mgbm.stats'))) === '1', 'backtick shows it again and remembers');

  // ---- Wall with the overlay: a fresh page, start the debug test wall
  await page.close();
  const { page: p2 } = await lib.openGame(browser, { viewport: { width: 900, height: 960 }, rich: false });
  await move(p2, 270, 800);
  await p2.evaluate(() => document.getElementById('dbg-wall-start').click());
  await p2.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'wall', null, { timeout: 5000 });
  await move(p2, 300, 700);
  await p2.waitForTimeout(2500);
  const ws = await statsNow(p2);
  check(ws.enabled && /WALL/.test(ws.text) && /blocks \d+\/\d+/.test(ws.text) && /camX/.test(ws.text), `wall overlay: ${JSON.stringify(ws.text)}`);
  await snap(p2, 'wall_stats.png');

  await browser.close();
  const c = lib.counts();
  process.stdout.write(`\n${c.passes} passed, ${c.failures} failed\n`);
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

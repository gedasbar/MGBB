// area: wall, background
// Chunk 24c: on a cylinder wall the background keeps scrolling sideways across the seam (it used to jump back to its start when the camera wrapped).
// Holds the pointer at the right edge until the camera has wrapped past the seam, sampling the camera x and the background's offset input every 40 ms.
// Needs the Vite dev server. Run: node e2e/background-wrap.e2e.cjs
let url = process.env.GAME_URL || 'http://localhost:5173/';
for (const [k, v] of [['debug', 1], ['stats', 0], ['bg', 'galaxy']]) if (!new RegExp(`[?&]${k}=`).test(url)) url += (url.includes('?') ? '&' : '?') + `${k}=${v}`;
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, gameToClient } = lib;

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 540, height: 960 } })).newPage();
  page.on('pageerror', (err) => check(false, `page error: ${err.message}`));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__cleared')) { localStorage.clear(); sessionStorage.setItem('__cleared', '1'); }
  });
  await page.goto(lib.URL);
  await page.waitForFunction(() => !!window.__mgbmSm && !!document.getElementById('dbg-start-tier'), null, { timeout: 30000 }); // the debug panel loads lazily; slow under parallel load
  await page.evaluate(() => { document.getElementById('debug-panel').style.display = 'none'; document.getElementById('dbg-tier-n').value = '1'; document.getElementById('dbg-start-tier').click(); });
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'wall', null, { timeout: 8000 });
  const start = await gameToClient(page, 270, 880);
  await page.mouse.move(start.x, start.y);
  await page.waitForTimeout(400);
  const right = await gameToClient(page, 530, 880);
  await page.mouse.move(right.x, right.y, { steps: 6 });

  const samples = [];
  for (let i = 0; i < 200; i++) {
    const s = await page.evaluate(() => window.__mgbm.state());
    if (s.state !== 'playing') break;
    samples.push({ cam: s.cameraX, bg: s.bgCamX, travel: s.camTravel });
    if (samples.length > 3 && s.camTravel > s.worldW * 1.2) break;
    await page.waitForTimeout(40);
  }
  check(samples.length > 20 && samples.every(s => typeof s.bg === 'number'), `sampled ${samples.length} frames with a background offset`);
  const wraps = samples.filter((s, i) => i > 0 && s.cam < samples[i - 1].cam - 300).length;
  check(wraps >= 1, `the camera wrapped past the seam ${wraps} time(s) (travel ${samples.at(-1).travel.toFixed(0)} px)`);
  const steps = samples.slice(1).map((s, i) => s.bg - samples[i].bg);
  const drift = Math.max(...samples.slice(1).map((s, i) => Math.abs((s.bg - samples[i].bg) - (s.travel - samples[i].travel))));
  check(steps.every(d => d >= -0.001), 'the background offset never goes backwards');
  check(drift < 0.5, `every background step equals the camera's own travel step (largest difference ${drift.toFixed(2)} px; a jump back would be about the world width, 1134)`);
  await page.screenshot({ path: 'e2e/screenshots/background-wrap.png' });
  await browser.close();
  const { passes, failures } = lib.counts();
  console.log(`${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

// Chunk 28b: what shot trails cost at a FULL pool, in the browser. Free Fly with the pool filled to its 4,000 shots (all on screen, moving up); times ShotSprites.sync()
// (the sprite pass plus the trail pass) with trails Off / Short / Long, and checks the trail segment cap and the automatic fallback. This is JS time in headless Chromium
// (software rendering): it says what the code costs, not what a phone's GPU does with the extra sprites. Needs the dev server. Run: node e2e/trail-cost.e2e.cjs
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, waitFor } = lib;

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: true });
  await page.evaluate(async () => { const m = await import('/src/debug/hooks.ts'); m.debugHooks.god = true; m.debugHooks.startFly(1); });
  await waitFor(() => page.evaluate(() => window.__mgbm.screen === 'fly'), { timeout: 8000 });
  const out = await page.evaluate(() => {
    const scr = window.__mgbmSm.currentScreen;
    const pool = scr.world.pool, shots = scr.shots;
    pool.clear && pool.clear();
    const N = pool.max;
    for (let i = 0; i < N; i++) pool.spawn(10 + (i % 100) * 5.2, 120 + Math.floor(i / 100) * 17, 0, -300, 5000 + (i % 3) * 50000);
    const time = (mode) => {
      shots.trailMode = mode;
      for (let i = 0; i < 20; i++) shots.sync(pool); // warm up
      const t0 = performance.now(); const R = 200;
      for (let i = 0; i < R; i++) shots.sync(pool);
      return { mode, ms: (performance.now() - t0) / R, segments: shots.trails.used, drawn: shots.drawn, autoOff: shots.trails.autoOff, trailMs: shots.trails.ms };
    };
    return { N, alive: pool.active.filter(Boolean).length, off: time('off'), short: time('short'), long: time('long') };
  });
  console.log(JSON.stringify(out, null, 1));
  check(out.alive >= 3900, `the pool is full: ${out.alive} shots alive`);
  check(out.short.segments <= 1200 && out.long.segments <= 1200, `segments capped at 1200: short ${out.short.segments}, long ${out.long.segments}`);
  check(out.off.segments === 0, 'trails Off draw no segments');
  console.log(`INFO  sync() per frame at a full pool: off ${out.off.ms.toFixed(2)} ms, short ${out.short.ms.toFixed(2)} ms, long ${out.long.ms.toFixed(2)} ms; trail pass alone (smoothed) short/long see the json above; autoOff short=${out.short.autoOff} long=${out.long.autoOff}`);
  await browser.close();
  const c = lib.counts();
  process.stdout.write(`\n${c.passes} passed, ${c.failures} failed\n`);
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { process.stdout.write(`FAIL  script error: ${e.stack || e}\n`); process.exit(1); });

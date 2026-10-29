// Chunk 21b end-to-end: frame cost of the owner's slow build IN THE BROWSER (simulation, sprite sync and the draw call), and the graceful
// overload of the projectile pool. Flies the build of scripts/lib/perfBuild.ts in Free Fly (wave 15) and on tier 100 with the stats overlay
// on, samples its numbers twice a second and prints the mean frame cost by number of shots alive. Headless Chromium draws with a software
// renderer, so the numbers say which part grows, not how a phone feels.
//   node e2e/performance.e2e.cjs            (SECS=n seconds flown per scenario, default 24; OUT=name for the numbers file)
// Needs the Vite dev server (npm run dev).
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
for (const [k, v] of [['stats', 1], ['bg', 'off']]) {
  url = url.replace(new RegExp(`[?&]${k}=[^&]*`), '');
  url += (url.includes('?') ? '&' : '?') + `${k}=${v}`;
}
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check } = lib;

const SECS = Number(process.env.SECS || 24);
const OUT = path.join(__dirname, '..', 'reports', 'chunk21b');
fs.mkdirSync(OUT, { recursive: true });
const BUCKETS = [0, 250, 750, 1500, 2500, 3500];
const bucketOf = (n) => { let b = 0; for (let k = 0; k < BUCKETS.length; k++) if (n >= BUCKETS[k]) b = k; return b; };
const bucketName = (k) => (k === BUCKETS.length - 1 ? `${BUCKETS[k]}+` : `${BUCKETS[k]}-${BUCKETS[k + 1]}`);

/** Starts a scenario inside the page (modules are shared with the app through the dev server) and returns samples taken every 500 ms. */
async function fly(page, kind, target) {
  await page.evaluate(async ({ kind, target }) => {
    const sm = window.__mgbmSm;
    const { perfGrid, OWNER_BUILD, topUp } = await import('/scripts/lib/perfBuild.ts');
    const { debugHooks } = await import('/src/debug/hooks.ts');
    debugHooks.god = true;
    const grid = perfGrid(OWNER_BUILD);
    if (kind === 'ff') {
      const { FlyScreen } = await import('/src/screens/FlyScreen.ts');
      sm.switchTo(new FlyScreen(sm, grid, { startWave: 15 }));
    } else {
      const { WallScreen } = await import('/src/screens/WallScreen.ts');
      const { generateLevel } = await import('/src/wall/generator.ts');
      sm.switchTo(new WallScreen(sm, { ...generateLevel(100), approachSpeed: 0 }, grid));
      sm.currentScreen.world.setWallOffset(430);
    }
    // The pool is held at (at least) `target` shots, so the table compares the same load before and after a change.
    if (target > 0) {
      const w = sm.currentScreen.world;
      const update = w.update.bind(w);
      w.update = (dt, p) => { topUp(w, target); update(dt, p); };
    }
  }, { kind, target });
  // The first pointer move starts the run.
  await page.mouse.move(270, 700);
  await page.mouse.move(272, 720);
  await page.evaluate(() => { const w = window.__mgbmSm.currentScreen.world; if (w.hull !== undefined) { w.hull = 1e12; w.invuln = 1e9; } });
}

async function sample(page, seconds) {
  return page.evaluate(async (seconds) => {
    const out = [];
    const t0 = performance.now();
    while (performance.now() - t0 < seconds * 1000) {
      await new Promise((r) => setTimeout(r, 500));
      const n = window.__mgbmStats.numbers;
      const sc = window.__mgbmSm.currentScreen;
      const w = sc.world;
      out.push({ fps: n.fps, frameMs: n.frameMs, worstMs: n.worstMs, simMs: n.simMs, renderMs: n.renderMs, alive: w.pool.count, max: w.pool.max, targets: w.mitosis ? w.mitosis.enemies.length : w.alive });
    }
    return out;
  }, seconds);
}

function table(title, samples) {
  const lines = [`### ${title}`, '', '| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms |', '|---|---|---|---|---|---|---|'];
  const mean = (a, f) => a.reduce((s, v) => s + f(v), 0) / a.length;
  for (let k = 0; k < BUCKETS.length; k++) {
    const s = samples.filter((x) => bucketOf(x.alive) === k && x.fps > 0);
    if (!s.length) continue;
    lines.push(`| ${bucketName(k)} | ${s.length} | ${mean(s, (x) => x.fps).toFixed(0)} | ${mean(s, (x) => x.frameMs).toFixed(1)} | ${mean(s, (x) => x.simMs).toFixed(2)} | ${mean(s, (x) => x.renderMs).toFixed(2)} | ${Math.max(...s.map((x) => x.worstMs)).toFixed(1)} |`);
  }
  lines.push('');
  return lines;
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 540, height: 960 }, rich: true });
  const lines = [`## Browser frame cost (headless Chromium, software renderer; ${SECS} s per scenario)`, ''];

  const FF_TARGETS = [0, 2500, 4000];
  const WALL_TARGETS = [0, 2000, 4000];
  let ffMax = 0, wMax = 0;
  for (const kind of ['ff', 'wall']) {
    for (const target of kind === 'ff' ? FF_TARGETS : WALL_TARGETS) {
      await fly(page, kind, target);
      const samples = await sample(page, SECS);
      const max = Math.max(...samples.map((s) => s.alive));
      if (kind === 'ff') ffMax = Math.max(ffMax, max); else wMax = Math.max(wMax, max);
      check(samples.length > 5, `${kind} target ${target}: sampled (${samples.length} samples, most shots alive ${max}, pool ${samples[0].max})`);
      check(max <= samples[0].max, `${kind} target ${target}: never more shots than the pool holds`);
      lines.push(...table(`${kind === 'ff' ? 'Free Fly, wave 15' : 'Tier 100 wall (held still in front of the guns)'}, pool held at ${target === 0 ? 'what the circuit reaches' : 'at least ' + target}`, samples));
    }
  }
  check(ffMax > 500, `Free Fly: the owner's build put ${ffMax} shots in the air`);
  check(wMax > 200, `Tier 100: ${wMax} shots in the air`);

  const text = lines.join('\n');
  fs.writeFileSync(path.join(OUT, `${process.env.OUT || 'browser'}.md`), text);
  console.log(text);
  await browser.close();
  const c = lib.counts();
  process.exit(c.failures ? 1 : 0);
})();

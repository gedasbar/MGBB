// Chunk 6b end-to-end test: Build -> CAMPAIGN -> Map -> tier 1 -> clear -> Map with a Medal and tier 2 open.
// Needs the Vite dev server. Run: GAME_URL="http://localhost:5173/?debug=1" node e2e/campaign.e2e.cjs
const path = require('path');
const URL_DEBUG = process.env.GAME_URL || 'http://localhost:5173/?debug=1';
process.env.GAME_URL = URL_DEBUG.includes('debug=1') ? URL_DEBUG : URL_DEBUG + (URL_DEBUG.includes('?') ? '&' : '?') + 'debug=1';
const lib = require('./lib.cjs'); // reads GAME_URL when loaded
const { check, tap, state, gameToClient } = lib;
const OUT = path.join(__dirname, '..', 'reports', 'chunk6b');
require('fs').mkdirSync(OUT, { recursive: true });

async function snap(page, name) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  await page.locator('canvas').screenshot({ path: path.join(OUT, name) });
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
}
const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const progress = async (page) => (await page.evaluate(() => JSON.parse(localStorage.getItem('mgbm.progress.v1')))) || {};
const rect = (page, tier) => page.evaluate((t) => window.__mgbm.tileScreenRect(t), tier);
const waitScreen = (page, name, ms = 8000) => page.waitForFunction((n) => window.__mgbm && window.__mgbm.screen === n, name, { timeout: ms });
const START = [451, 862];

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 900, height: 960 } });
  const mv = async (gx, gy) => { const p = await gameToClient(page, gx, gy); await page.mouse.move(p.x, p.y); };

  // ---- Build screen: CAMPAIGN opens the map
  await tap(page, 468, 735, { pause: 300 });
  await waitScreen(page, 'map');
  let s = await state(page);
  check(s.tiles.length === 100, `map shows ${s.tiles.length} tiles`);
  check(s.tiles[0].state === 'open' && s.tiles[0].next, 'tier 1 is open and marked as next');
  check(s.tiles.slice(1).every(t => t.state === 'locked'), 'every other tier is locked on a fresh save');
  check(s.medals === 0 && /Medals 0/.test(s.medalsText), `fresh save shows "${s.medalsText}"`);
  check(s.sheet.startEnabled && s.sheet.startLabel === 'START' && /Not cleared/.test(s.sheet.best), `tier 1 inspector: "${s.sheet.title}", ${s.sheet.best}, button ${s.sheet.startLabel}`);
  await snap(page, 'map_fresh.png');

  // ---- Locked tier: inspector says Locked and START does nothing
  await tap(page, ...centre(await rect(page, 2)));
  s = await state(page);
  check(s.selected === 2 && !s.sheet.startEnabled && s.sheet.startLabel === 'Locked', `locked tier 2: button "${s.sheet.startLabel}", enabled ${s.sheet.startEnabled}`);
  await snap(page, 'map_inspector_locked.png');
  await tap(page, ...START);
  check((await state(page)).selected === 2 && (await page.evaluate(() => window.__mgbm.screen)) === 'map', 'tapping a disabled START stays on the map');

  // ---- Spike tier: scroll to it and select it
  const spike = s.tiles.find(t => t.spike).tier;
  await page.evaluate((t) => window.__mgbm.scrollTo(Math.max(0, Math.floor((t - 1) / 5) * 105 - 200)), spike);
  await page.waitForTimeout(2400);
  await tap(page, ...centre(await rect(page, spike)));
  s = await state(page);
  check(s.selected === spike && /SPIKE/.test(s.sheet.spike), `spike tier ${spike} inspector shows "${s.sheet.spike}"`);
  await snap(page, 'map_inspector_spike.png');

  // ---- Tier 1: play for a few seconds with the pointer, then finish it with the debug helper
  await page.evaluate(() => window.__mgbm.scrollTo(0));
  await tap(page, ...centre(await rect(page, 1)));
  await tap(page, ...START, { pause: 300 });
  await waitScreen(page, 'wall');
  s = await state(page);
  check(s.hud.tier === 'Tier 1' && s.hud.name === 'Slab' && s.hud.spike === false, `wall HUD: ${s.hud.tier} / ${s.hud.name} / spike ${s.hud.spike}`);
  await page.evaluate(() => window.__mgbm.setTimeScale(4));
  for (let i = 0; i < 40; i++) { await mv(40 + ((i * 53) % 440), 790); await page.waitForTimeout(50); }
  await page.evaluate(() => window.__mgbm.setTimeScale(1));
  s = await state(page);
  check(s.destroyed > 0, `real shots destroyed ${s.destroyed} blocks before the shortcut`);
  const before = await progress(page);
  await page.evaluate(() => window.__mgbm.wall.destroyAll());
  await waitScreen(page, 'summary');
  s = await state(page);
  check(s.title === 'Tier cleared' && s.wall.medal === true, `summary "${s.title}", medal ${s.wall.medal}`);
  check(JSON.stringify(s.wall.buttons.map(b => b.label)) === JSON.stringify(['Next tier', 'Map', 'Build']), `clear buttons: ${s.wall.buttons.map(b => b.label)}`);
  await snap(page, 'summary_cleared.png');
  let p = await progress(page);
  check(p.medals === 1 && JSON.stringify(p.clearedTiers) === '[1]' && p.runs === (before.runs || 0) + 1, `banked once: medals ${p.medals}, cleared ${JSON.stringify(p.clearedTiers)}, runs ${before.runs} -> ${p.runs}`);
  check(p.credits > (before.credits || 0), `credits paid (${before.credits} -> ${p.credits})`);

  // ---- Back to the map: tier 1 has its medal, tier 2 is open
  await tap(page, 270, 672);
  await waitScreen(page, 'map');
  s = await state(page);
  check(s.tiles[0].state === 'cleared' && s.tiles[1].state === 'open' && s.tiles[1].next && s.tiles[2].state === 'locked', `map: tier 1 ${s.tiles[0].state}, tier 2 ${s.tiles[1].state}, tier 3 ${s.tiles[2].state}`);
  check(s.medals === 1 && /Medals 1/.test(s.medalsText) && s.selected === 2, `medals "${s.medalsText}", the next tier (${s.selected}) is selected`);
  await snap(page, 'map_after_clear.png');
  await tap(page, ...centre(await rect(page, 1)));
  s = await state(page);
  check(/^Best 100% \/ \d+:\d\d$/.test(s.sheet.best), `inspector of tier 1 shows "${s.sheet.best}"`);
  await snap(page, 'map_tier1_best.png');

  // ---- Replay tier 1: credits again, no second Medal
  const c1 = (await progress(page)).credits;
  await tap(page, ...START, { pause: 300 });
  await waitScreen(page, 'wall');
  await page.evaluate(() => window.__mgbm.wall.destroyAll());
  await waitScreen(page, 'summary');
  s = await state(page);
  p = await progress(page);
  check(s.wall.medal === false && p.medals === 1 && p.credits > c1, `replay: medal ${s.wall.medal}, medals ${p.medals}, credits ${c1} -> ${p.credits}`);
  await tap(page, 270, 672);
  await waitScreen(page, 'map');

  // ---- Fail tier 2: Retry / Map / Build, no medal, tier 3 stays locked
  await tap(page, ...centre(await rect(page, 2)));
  await tap(page, ...START, { pause: 300 });
  await waitScreen(page, 'wall');
  await mv(270, 900);
  await page.evaluate(() => window.__mgbm.setTimeScale(12));
  await waitScreen(page, 'summary', 40000);
  s = await state(page);
  check(s.title === 'Tier failed' && JSON.stringify(s.wall.buttons.map(b => b.label)) === JSON.stringify(['Retry', 'Map', 'Build']), `fail: "${s.title}", buttons ${s.wall.buttons.map(b => b.label)}`);
  p = await progress(page);
  check(s.wall.medal === false && p.clearedTiers.length === 1 && p.wallBestPct['2'] !== undefined, `failed tier: no medal, cleared ${JSON.stringify(p.clearedTiers)}, best ${p.wallBestPct['2']}%`);

  // ---- Free Fly is still separate: Build -> FLY
  await tap(page, 440, 672);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.buildScreen, null, { timeout: 5000 });
  await tap(page, 478, 789, { pause: 400 });
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.world, null, { timeout: 5000 });
  s = await state(page);
  check(s.tier === 1 && typeof s.hull === 'number', `FLY still starts Free Fly (tier ${s.tier}, hull ${s.hull})`);

  const c = lib.counts();
  console.log(`\n${c.passes} passed, ${c.failures} failed`);
  await browser.close();
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

// Chunk 10b: the ?debug=1 cheat panel, end to end. Add credits -> buy a hull with real taps -> unlock tiers (Map) ->
// Free Fly at wave 10 (a Mother spawns) -> spawn a species, god mode, kill all -> reset campaign.
// Needs the Vite dev server. Run: node e2e/cheats.e2e.cjs
process.env.GAME_URL = (process.env.GAME_URL || 'http://localhost:5173/') + '?debug=1';
const path = require('path');
const fs = require('fs');
const lib = require('./lib.cjs');
const { check, tap, state } = lib;
const OUT = path.join(__dirname, '..', 'reports', 'chunk10b');
fs.mkdirSync(OUT, { recursive: true });
const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const TAB = { build: [54, 932], shop: [162, 932], map: [916, 932] };

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 1000, height: 960 }, rich: false, dart: true });
  const click = (id) => page.evaluate((i) => document.getElementById(i).click(), id);
  const status = () => page.evaluate(() => document.getElementById('dbg-cheat-status').textContent);
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('mgbm.progress.v1')));
  await page.waitForSelector('#dbg-cheats');
  await page.evaluate(() => document.querySelectorAll('#dbg-cheats details').forEach(d => { d.open = true; }));

  // ---- credits: the Build screen's badge updates at once, and the save has them
  await click('dbg-add-1000'); await click('dbg-add-100000');
  let s = await state(page);
  check(/101[,.]?000|101K/.test(s.creditsText) || (await saved()).credits === 101000, `credits +101,000: badge "${s.creditsText}", saved ${(await saved()).credits}`);
  check((await saved()).credits === 101000 && /101000/.test(await status()), `saved through the store; status "${await status()}"`);

  // ---- buy a hull with real taps
  await tap(page, ...TAB.shop);
  await tap(page, 405, 136);
  s = await state(page);
  const twin = s.rows.find(r => r.key === 'twin');
  await tap(page, ...centre(twin.buttons[0].rect), { pause: 250 });
  check((await saved()).ownedHulls.includes('twin') && (await saved()).credits === 101000 - 70, `bought the Twin in the Shop: credits ${(await saved()).credits}`);
  await click('dbg-add-10000000');
  s = await state(page);
  check(s.credits === 101000 - 70 + 10_000_000, `the open Shop sees +10M at once (${s.credits})`);

  // ---- own all blocks / hulls
  await click('dbg-own-max'); await click('dbg-own-blocks'); await click('dbg-own-hulls');
  const p = await saved();
  check(p.ownedHulls.length === 5 && p.owned.flat_plus === 10 && p.levels.flat_plus === 10, `all hulls (${p.ownedHulls.length}), 10 x Flat+ at level ${p.levels.flat_plus}`);
  check(p.owned.alternator === 10, `a block of chunk 9a owned x10 (${p.owned.alternator}); hidden: ${Object.keys(p.owned).length} entries`);

  // ---- unlock tiers: the Map shows them open, no medals
  await click('dbg-unlock-tiers');
  await tap(page, ...TAB.map);
  s = await state(page);
  const p2 = await saved();
  check(p2.passedTiers.length === 100 && p2.medals === 0 && p2.clearedTiers.length === 0, `tiers 1-100 passed, medals ${p2.medals}, cleared ${p2.clearedTiers.length}`);
  await page.screenshot({ path: path.join(OUT, 'map_unlocked.png') });
  await click('dbg-reset-campaign');
  check((await saved()).passedTiers.length === 0, 'reset campaign progress empties the passed tiers');
  await tap(page, ...TAB.build);

  // ---- Free Fly at wave 10: a Mother event
  await page.evaluate(() => { document.getElementById('dbg-wave-n').value = '10'; });
  await click('dbg-start-wave');
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.world && window.__mgbm.state().viewW, null, { timeout: 5000 });
  await click('dbg-god');
  await page.evaluate(() => window.__mgbm.setTimeScale(1));
  await page.waitForFunction(() => window.__mgbm.state().species.includes('mother'), null, { timeout: 8000 });
  s = await state(page);
  check(s.wave === 10 && s.species.includes('mother') && /^Wave 10/.test(s.hud.wave), `Free Fly started at wave ${s.wave}, species now: ${[...new Set(s.species)].join(',')}, HUD "${s.hud.wave}"`);
  check(s.time >= 360 && s.tier === 1 + Math.floor(s.time / 15), `run time ${s.time.toFixed(0)} s, tier ${s.tier}`);

  // ---- spawn a chosen species, god mode, kill all
  const n0 = (await state(page)).enemies.length;
  await page.selectOption('#dbg-species', 'warden');
  await click('dbg-spawn');
  s = await state(page);
  check(s.species.includes('warden') && s.enemies.length > n0, `spawned a Warden (enemies ${n0} -> ${s.enemies.length})`);
  await page.evaluate(() => { window.__mgbm.world.shipY = 100; });
  await page.screenshot({ path: path.join(OUT, 'cheat_panel.png') });
  await click('dbg-kill-all');
  s = await state(page);
  check(s.enemies.length === 0, `kill all removed every enemy (${s.enemies.length} left)`);
  const hull0 = (await state(page)).hull;
  await page.evaluate(() => { const w = window.__mgbm.world; w.spawnRock(w.shipX, w.shipY, 1e9); w.invuln = 0; });
  await page.waitForTimeout(600);
  check((await state(page)).hull === hull0, `god mode: touching a rock did no damage (hull ${hull0} -> ${(await state(page)).hull})`);

  // ---- a campaign tier by number, any time
  await page.evaluate(() => { document.getElementById('dbg-tier-n').value = '37'; });
  await click('dbg-start-tier');
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'wall' || (window.__mgbm && window.__mgbm.state && window.__mgbm.state().tier === 37), null, { timeout: 5000 }).catch(() => {});
  const w37 = await page.evaluate(() => (window.__mgbm.wall ? window.__mgbm.wall.level.tier : window.__mgbm.state().tier));
  check(w37 === 37, `campaign tier 37 started from the panel (tier ${w37})`);
  await click('dbg-kill-all');
  await page.waitForTimeout(400);

  // ---- fold + full reset (two clicks)
  await click('dbg-reset-all');
  check(/Really/.test(await page.evaluate(() => document.getElementById('dbg-reset-all').textContent)), 'the entire-save reset asks to be clicked twice');
  await click('dbg-fold');
  check(await page.evaluate(() => document.getElementById('dbg-body').style.display === 'none'), 'the panel folds');
  await browser.close();
  const c = lib.counts();
  console.log(`${c.passes} passed, ${c.failures} failed`);
  process.exit(c.failures ? 1 : 0);
})();

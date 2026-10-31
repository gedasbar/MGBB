// Chunk 13a: captains, end to end. With cheats: Medals -> unlock Bulwark -> level it -> kills open tier 2 -> buy and switch
// options -> a Free Fly run (effects applied, a Medal milestone, kills banked) -> a wall tier (Second Chance) -> reload and
// check persistence. Screenshots: list, detail, run summary (reports/chunk13a).
// Needs the Vite dev server. Run: node e2e/captains.e2e.cjs
process.env.GAME_URL = (process.env.GAME_URL || 'http://localhost:5173/') + '?debug=1';
const path = require('path');
const fs = require('fs');
const lib = require('./lib.cjs');
const { check, tap, state } = lib;
const OUT = path.join(__dirname, '..', 'reports', 'chunk13a');
fs.mkdirSync(OUT, { recursive: true });
const TAB = { build: [54, 932], shop: [162, 932], captain: [270, 932], map: [486, 932] };
const CLIP = { x: 230, y: 0, width: 540, height: 960 }; // the 540 x 960 game canvas inside the 1000 px viewport
const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 1000, height: 960 }, rich: false, dart: true });
  const click = (id) => page.evaluate((i) => document.getElementById(i).click(), id);
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('mgbm.progress.v1')));
  const btn = async (id) => (await state(page)).buttons.find(b => b.id === id);
  const press = async (id) => {
    const b = await btn(id);
    if (!b) throw new Error('no button ' + id);
    await tap(page, ...centre(b.rect), { pause: 400 });
    return b;
  };
  const setNum = (id, v) => page.evaluate(([i, val]) => { document.getElementById(i).value = String(val); }, [id, v]);
  await page.waitForSelector('#dbg-cheats');

  // ---- the tab opens the list; a fresh save has Cadet only and no Medals
  await tap(page, ...TAB.captain);
  let s = await state(page);
  check(s.view === 'list' && s.buttons.length === 4, `Captain tab: list of ${s.buttons.length} cards`);
  check(s.medals === 0 && s.activeText === 'Active: Cadet', `fresh save: ${s.medalsText}, ${s.activeText}`);
  await page.screenshot({ path: path.join(OUT, '1-captain-list.png'), clip: CLIP });

  // ---- Medals by cheat; a locked captain can be previewed but not used
  await click('dbg-medal-100');
  await tap(page, 270 + 135, 96 + 100); // Bulwark card
  s = await state(page);
  check(s.view === 'detail' && s.selected === 'bulwark', 'tapping a card opens its detail');
  let b = await btn('unlock');
  check(!!b && b.enabled && /Unlock - 10 Medals/.test(b.label), `locked captain offers "${b && b.label}"`);
  let o = await btn('opt:bul_second');
  check(o && !o.enabled && /Unlock the captain first/.test(o.label), `its options are previewed but not buyable ("${o && o.label}")`);
  await press('hero');
  check((await saved()).captains.heroes.bulwark.level === 0, 'a locked captain cannot be levelled');

  // ---- unlock, make active, level up
  await press('unlock');
  let p = await saved();
  check(p.captains.owned.includes('bulwark') && p.medals === 90, `Bulwark unlocked for 10 Medals (medals ${p.medals})`);
  await press('select');
  await press('hero');
  await press('hero');
  p = await saved();
  check(p.captains.selected === 'bulwark' && p.captains.heroes.bulwark.level === 2 && p.medals === 88, `active Bulwark, hero level ${p.captains.heroes.bulwark.level}, medals ${p.medals}`);

  // ---- tier 1 is open; tier 2 needs 2000 kills (24a)
  o = await btn('opt:bul_plating');
  check(o && !o.enabled && /Needs 2K kills \(have 0\)/.test(o.label), `tier 2 shows "${o && o.label}"`);
  await press('opt:bul_plating');
  p = await saved();
  check(!p.captains.heroes.bulwark.owned.includes('bul_plating') && p.medals === 88, 'a locked option cannot be bought and costs nothing');
  await press('opt:bul_second');
  await press('opt:bul_steady');
  p = await saved();
  check(p.captains.heroes.bulwark.active['1'] === 'bul_steady' && p.medals === 84, `both tier-1 options bought; the last one is active (${p.captains.heroes.bulwark.active['1']}, medals ${p.medals})`);
  await press('opt:bul_second'); // owned: activate is free
  p = await saved();
  check(p.captains.heroes.bulwark.active['1'] === 'bul_second' && p.medals === 84, 'switching back to an owned option is free');

  // ---- a drag scrolls the detail, and a tap on a locked option after scrolling reaches the right button
  const sy0 = (await state(page)).scrollY;
  await lib.drag(page, 270, 760, 270, 360);
  s = await state(page);
  check(sy0 === 0 && s.scrollY > 200, `dragging scrolls the detail (scrollY ${sy0} -> ${s.scrollY})`);
  await press('opt:bul_wind');
  s = await state(page);
  check(s.toast === 'Needs 10K kills (have 0)', `a locked option answers a tap with its reason after scrolling: "${s.toast}"`);
  await page.evaluate(() => { window.__mgbm.captainScreen.scrollBy(-2000); });

  // ---- kills by cheat open tier 2
  await setNum('dbg-cap-kills-n', 2000);
  await click('dbg-cap-kills');
  s = await state(page);
  o = await btn('opt:bul_plating');
  check(o && o.enabled && /Buy - 4 Medals/.test(o.label), `2000 kills open tier 2: "${o && o.label}"`);
  await press('opt:bul_plating');
  p = await saved();
  check(p.captains.heroes.bulwark.active['2'] === 'bul_plating' && p.medals === 80 && p.captains.heroes.bulwark.kills === 2000, `Plating bought (medals ${p.medals}, kills ${p.captains.heroes.bulwark.kills})`);
  // The detail view with tiers in different states.
  await page.evaluate(() => { window.__mgbm.captainScreen.scrollBy(300); });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, '2-captain-detail.png'), clip: CLIP });
  await page.evaluate(() => { window.__mgbm.captainScreen.scrollBy(-300); });

  // ---- a Free Fly run: effects applied
  await tap(page, ...TAB.build);
  await setNum('dbg-wave-n', 1);
  await click('dbg-start-wave');
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.world && window.__mgbm.state().viewW, null, { timeout: 5000 });
  s = await state(page);
  const cap = s.captain;
  check(cap.id === 'bulwark' && cap.maxHull === 130 && Math.round(s.hull) === 130, `Free Fly: hull x1.3 (max ${cap.maxHull}, hull ${s.hull})`);
  check(s.damagePerShot[0] === 2, `Free Fly: hero level 2 adds +1 base damage (0.5 a level, chunk 14a) to the bare shot (damage per shot ${s.damagePerShot[0]}, was 1)`);
  check(cap.secondChancesLeft === 1, `Free Fly: Second Chance charge ready (${cap.secondChancesLeft})`);
  // Second Chance: a rock on the ship deals no damage the first time.
  await page.evaluate(() => { const w = window.__mgbm.world; w.beginControl(); w.invuln = 0; w.spawnRock(w.shipX, w.shipY, 1e9); });
  await page.waitForTimeout(250);
  s = await state(page);
  check(s.effects.secondChance === 1 && Math.round(s.hull) === 130, `Free Fly: the first contact is forgiven (secondChance ${s.effects.secondChance}, hull ${s.hull})`);
  // Run on at speed in god mode: wave 5 pays the first Free Fly milestone.
  await page.evaluate(() => { const g = document.getElementById('dbg-god'); g.checked = true; g.dispatchEvent(new Event('change')); });
  await page.evaluate(() => window.__mgbm.setTimeScale(24));
  await page.waitForFunction(() => window.__mgbm.state().wave >= 5, null, { timeout: 60000 });
  await page.evaluate(() => window.__mgbm.setTimeScale(1));
  // A few kills for the captain: three rocks at 0 HP die on the next step.
  await page.evaluate(() => { const w = window.__mgbm.world; for (let i = 0; i < 3; i++) { const r = w.spawnRock(100 + i * 120, 200, 1e9); if (r) r.hp = 0; } });
  await page.waitForTimeout(400);
  s = await state(page);
  p = await saved();
  check(p.captains.milestones.includes(5) && s.captain.medalsRun === 1, `wave 5 milestone paid once: +1 Medal (run ${s.captain.medalsRun}, saved milestones ${JSON.stringify(p.captains.milestones)})`);
  check(p.medals === 81, `Medals in hand ${p.medals} (80 + 1)`);
  check(s.kills >= 3, `kills this run: ${s.kills}`);

  // ---- quit the run: the summary shows Medals and the kills added to the captain
  const killsRun = s.kills;
  await page.evaluate(() => window.__mgbmSm.currentScreen.pausable.quit());
  await page.waitForTimeout(500);
  s = await state(page);
  check(s.captain && s.captain.name === 'Bulwark' && s.captain.medals === 1 && s.captain.killsAdded === killsRun, `summary: ${JSON.stringify(s.captain)}`);
  p = await saved();
  check(p.captains.heroes.bulwark.kills === 2000 + killsRun && p.captains.heroes.cadet.kills === 0, `kills went to Bulwark only (${p.captains.heroes.bulwark.kills}), Cadet ${p.captains.heroes.cadet.kills}`);
  await page.screenshot({ path: path.join(OUT, '3-run-summary.png'), clip: CLIP });

  // ---- a campaign wall: the same captain's effects, and Second Chance on a block
  await tap(page, 100, 832); // Build
  await page.waitForTimeout(300);
  await setNum('dbg-tier-n', 1);
  await click('dbg-start-tier');
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'wall', null, { timeout: 5000 });
  s = await state(page);
  check(s.captain.mods.secondChances === 1 && s.captain.mods.baseDamage === 1 && s.captain.mods.spawnInvuln === 0, `wall: modifiers ${JSON.stringify({ sc: s.captain.mods.secondChances, base: s.captain.mods.baseDamage })}`);
  await page.evaluate(() => { const g = document.getElementById('dbg-god'); g.checked = false; g.dispatchEvent(new Event('change')); });
  await page.evaluate(() => {
    const w = window.__mgbm.wall;
    const b = w.all.find(x => w.blocks[x.row * w.level.cols + x.col] === x);
    w.shipX = b.x;
    w.shipY = 400;
    w.setWallOffset(400 - 27 + (w.level.rows - b.row) * 54);
  });
  await page.waitForTimeout(250);
  s = await state(page);
  check(s.effects.secondChance === 1 && s.state === 'playing' && s.destroyed >= 1, `wall: touching a block is forgiven (secondChance ${s.effects.secondChance}, state ${s.state}, destroyed ${s.destroyed})`);

  // ---- persistence: reload, the same captain, level, options and kills
  const before = (await saved()).captains;
  const destroyedInWall = (await state(page)).destroyed;
  await page.reload();
  await page.waitForFunction(() => !!window.__mgbm);
  await page.waitForTimeout(500);
  const after = (await saved()).captains;
  // Leaving the page hides the tab: the wall's kills so far are handed to the captain then (once), nothing else changes.
  const expected = JSON.parse(JSON.stringify(before));
  expected.heroes.bulwark.kills += destroyedInWall;
  check(JSON.stringify(after) === JSON.stringify(expected), `reload: captains kept; ${destroyedInWall} wall kill(s) banked when the tab was hidden (kills ${before.heroes.bulwark.kills} -> ${after.heroes.bulwark.kills})`);
  await tap(page, ...TAB.captain);
  s = await state(page);
  check(s.activeText === 'Active: Bulwark', `after reload the tab shows ${s.activeText}`);
  await tap(page, 270 + 135, 96 + 100);
  s = await state(page);
  const act = await btn('opt:bul_second');
  const act2 = await btn('opt:bul_plating');
  check(act && act.label === 'Active' && act2 && act2.label === 'Active', `reloaded options are still active (${act && act.label}, ${act2 && act2.label})`);

  await browser.close();
  const c = lib.counts();
  console.log(`\n${c.passes} passed, ${c.failures} failed`);
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

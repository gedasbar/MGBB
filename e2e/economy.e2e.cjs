// Chunk 5 end-to-end test: the economy loop with real pointer events.
// fresh progress -> picker shows only owned blocks -> Fly (kills pay) -> Run Summary -> Build -> Shop (buy, upgrade, hull) -> Build.
// Needs the Vite dev server. Run: GAME_URL="http://localhost:5173/?debug=1" node e2e/economy.e2e.cjs
const path = require('path');
const lib = require('./lib.cjs');
const { check, tap, state, gameToClient, park } = lib;

const URL_DEBUG = process.env.GAME_URL || 'http://localhost:5173/?debug=1';
process.env.GAME_URL = URL_DEBUG.includes('debug=1') ? URL_DEBUG : URL_DEBUG + (URL_DEBUG.includes('?') ? '&' : '?') + 'debug=1';
// Screenshots go to reports/chunk5 and are taken from the canvas only (the DOM debug panel is hidden while shooting).
const OUT = path.join(__dirname, '..', 'reports', 'chunk5');
require('fs').mkdirSync(OUT, { recursive: true });

const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const TAB = { build: [54, 932], shop: [162, 932] };
const FLY_BTN = [478, 789];
const SHIP_BTN = [28, 26];

async function snap(page, name) {
  await page.evaluate(() => { document.getElementById('debug-panel').style.display = 'none'; });
  await page.locator('canvas').screenshot({ path: path.join(OUT, name) });
  await page.evaluate(() => { document.getElementById('debug-panel').style.display = 'flex'; });
}

/** Moves the pointer so the ship's ejector (10.5 px right of the ship) lines up with the lowest rock above it. */
async function aim(page, s) {
  const rocks = s.enemies.filter(e => e.y < 740);
  rocks.sort((a, b) => b.y - a.y);
  const gx = rocks.length ? rocks[0].x - 10.5 : 270;
  const p = await gameToClient(page, Math.max(24, Math.min(516, gx)), 768);
  await page.mouse.move(p.x, p.y);
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 900, height: 960 }, rich: false, dart: true });
  const dbg = (id) => page.click('#' + id);
  const model = (fn, arg) => page.evaluate(({ fn, arg }) => new Function('m', 'a', fn)(window.__mgbm.model, arg), { fn, arg });

  // ---- fresh progress, Build screen
  let s = await state(page);
  check(s.credits === 0 && s.creditsText === '0', `fresh progress shows 0 credits (top bar "${s.creditsText}")`);
  const owned = await model('return Object.fromEntries(Object.entries(m.owned).filter(([k, v]) => v > 0))');
  check(JSON.stringify(owned) === JSON.stringify({ turn_l: 2, turn_r: 2, flat_plus: 1 }), `only turn_l 2, turn_r 2, flat_plus 1 are owned: ${JSON.stringify(owned)}`);
  check((await state(page)).hull === 'dart', 'a fresh save starts on the free Dart (the free-hull flow is covered in freefly.e2e)');
  // The rest of this script was written on the Shuttle's default circuit: grant it and switch (the Dart is covered by freefly.e2e).
  await page.evaluate(() => {
    const m = window.__mgbm.model;
    m.store.data.ownedHulls.push('shuttle'); m.store.commit(); m.switchHull('shuttle');
    window.__mgbm.buildScreen.fit(); window.__mgbm.buildScreen.refresh();
  });
  await page.waitForTimeout(200);

  // Open the picker on an empty cell (tap twice) and try to place Splitter 2, which is not owned.
  await tap(page, 174, 420); // an empty cell (col 4, row 5)
  await tap(page, 174, 420);
  s = await state(page);
  check(s.pickerOpen, 'picker opens on an empty cell');
  const placeable = await page.evaluate(() => {
    const m = window.__mgbm.model;
    return window.__mgbm.buildScreen.picker.tiles.map(t => t.id).filter(id => m.available(id) > 0);
  });
  check(JSON.stringify(placeable.sort()) === JSON.stringify(['turn_l', 'turn_r']), `placeable tiles are only the owned ones not yet used: ${placeable}`);
  const sp = await page.evaluate(() => window.__mgbm.buildScreen.picker.tileScreenRect('splitter_2'));
  await tap(page, ...centre(sp));
  await tap(page, ...centre(sp));
  s = await state(page);
  check(/No Splitter 2 left/.test(s.toast) && s.pickerOpen, `second tap on an unowned tile only toasts: "${s.toast}"`);
  await tap(page, 516, 492); // close the sheet
  s = await state(page);
  check(!s.pickerOpen, 'sheet closes');
  const flatBefore = s.statsStrip[0];

  // ---- Fly: kills pay credits
  await tap(page, ...FLY_BTN, { pause: 300 });
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.world, null, { timeout: 5000 });
  let shotFly = false;
  let t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    s = await state(page);
    await aim(page, s);
    if (!shotFly && s.popups.length && s.popups.some(p => p.alpha > 0.7) && s.credits >= 1) {
      await snap(page, 'fly_hud_popup.png');
      shotFly = true;
      console.log('INFO  fly HUD:', JSON.stringify(s.hud), 'popups:', JSON.stringify(s.popups));
    }
    if (shotFly && s.kills >= 12) break;
    await page.waitForTimeout(40);
  }
  s = await state(page);
  check(s.kills > 0 && s.credits > 0, `kills pay credits during the run (kills ${s.kills}, credits ${s.credits}, ${s.hud.credits}, ${s.hud.tier})`);
  check(shotFly, 'a yellow +N popup was on screen (screenshot fly_hud_popup.png)');
  check(/^Credits \+\d+/.test(s.hud.credits) && /^Tier \d+/.test(s.hud.tier), 'HUD shows Credits and Tier');
  const creditsAtEnd = s.credits;

  // ---- end the run: Set hull to 1 and look away so rocks reach the ship or the bottom edge
  await dbg('dbg-hull1');
  const far = await gameToClient(page, 30, 768);
  await page.mouse.move(far.x, far.y);
  t0 = Date.now();
  let st = null;
  while (Date.now() - t0 < 90000) {
    st = await page.evaluate(() => window.__mgbm && window.__mgbm.screen);
    if (st === 'summary') break;
    await page.waitForTimeout(250);
  }
  check(st === 'summary', 'the run ended and the Run Summary screen appeared');
  s = await state(page);
  const run = s.result;
  console.log('INFO  summary:', JSON.stringify(run), JSON.stringify(s.marks));
  await page.waitForTimeout(200);
  await snap(page, 'run_summary.png');
  let credits = run.credits;
  if (!(run.credits > 0)) {
    console.log('INFO  the run earned no credits; using +10000 credits for the rest (this check is NOT satisfied by a real earning)');
    await dbg('dbg-credits');
    credits += 10000;
  }
  check(run.credits >= creditsAtEnd && run.credits > 0, `summary shows credits earned > 0 (${run.credits}; ${creditsAtEnd} at the last poll)`);
  check(s.marks.newBestTier && s.marks.newBestTime, 'first run is a new best tier and time');
  check(s.credits === run.credits, `credits were banked exactly once (store ${s.credits}, run ${run.credits})`);

  // ---- Build: top-bar currency equals the summary
  await tap(page, 145, 672);
  s = await state(page);
  check(s.active === 'A' && s.credits === credits, `Build is back with the same circuit; store credits ${s.credits}`);
  check(s.creditsText === String(credits), `top-bar currency "${s.creditsText}" equals the summary's ${credits}`);
  check(s.statsStrip[0] === flatBefore, `circuit unchanged (Dmg/shot ${s.statsStrip[0]})`);

  // ---- Shop: buy a Splitter 2 (needs 200)
  await tap(page, ...TAB.shop);
  s = await state(page);
  check(s.rows && s.rows.length === 41, `Shop lists 41 blocks (${s.rows && s.rows.length})`);
  if (s.credits < 200) {
    console.log('INFO  fewer than 200 credits: using +10000 credits for the purchases');
    await dbg('dbg-credits');
  }
  s = await state(page);
  const credBeforeBuy = s.credits;
  let row = s.rows.find(r => r.key === 'splitter_2');
  await tap(page, ...centre(row.rect), { pause: 200 }); // select the row first
  s = await state(page);
  check(s.selected === 'splitter_2' && /Splits the signal into two full copies/.test(s.inspector.body), `row tap selects it and shows its rule: "${s.inspector.title}"`);
  row = s.rows.find(r => r.key === 'splitter_2');
  check(row.buttons[0].label === 'Buy x1 - 200' && row.buttons[0].enabled, `buy button "${row.buttons[0].label}" is enabled`);
  check(row.buttons[1].label === 'Upgrade L1 -> L2 - 400', `Splitter 2 has upgrade levels now ("${row.buttons[1].label}")`);
  await tap(page, ...centre(row.buttons[0].rect), { pause: 200 });
  s = await state(page);
  check(s.credits === credBeforeBuy - 200, `buying Splitter 2 cost exactly 200 (${credBeforeBuy} -> ${s.credits})`);
  check(/Bought Splitter 2/.test(s.toast), `purchase toast: "${s.toast}"`);

  // Upgrade Flat+ L1 -> L2
  const flat = s.rows.find(r => r.key === 'flat_plus');
  check(/^Upgrade L1 -> L2 - 120$/.test(flat.buttons[1].label) && flat.buttons[1].enabled, `upgrade button "${flat.buttons[1].label}"`);
  const credBeforeUp = s.credits;
  await tap(page, ...centre(flat.buttons[1].rect), { pause: 200 });
  s = await state(page);
  check(s.credits === credBeforeUp - 120, `upgrade cost 120 (${credBeforeUp} -> ${s.credits})`);
  const flat2 = s.rows.find(r => r.key === 'flat_plus');
  check(/^Upgrade L2 -> L3 - 264$/.test(flat2.buttons[1].label), `next upgrade is "${flat2.buttons[1].label}"`);
  await tap(page, 120, flat2.rect.y + 42, { pause: 200 }); // select the Flat+ row to read its rule
  s = await state(page);
  check(/\+2 damage/.test(s.inspector.body), `inspector shows the level-2 rule: "${s.inspector.body}"`);
  await snap(page, 'shop_blocks.png');

  // ---- back to Build: picker count and stats strip
  await tap(page, ...TAB.build);
  s = await state(page);
  check(s.statsStrip[0].startsWith('3'), `stats strip Dmg/shot rose from ${flatBefore} to ${s.statsStrip[0]} after the Flat+ upgrade`);
  const count1 = await page.evaluate(() => window.__mgbm.model.available('splitter_2'));
  await tap(page, 174, 420);
  await tap(page, 174, 420);
  const labels = await page.evaluate(() => {
    const p = window.__mgbm.buildScreen.picker;
    const t = p.tiles.find(x => x.id === 'splitter_2');
    return p.listC.children.filter(c => c.text !== undefined && Math.abs(c.y - (t.y + 36)) < 2 && c.x > t.x + t.w - 40 && c.x <= t.x + t.w).map(c => c.text);
  });
  check(count1 === 1 && labels.includes('×1'), `the picker shows Splitter 2 as ×1 (available ${count1}, tile label ${JSON.stringify(labels)})`);
  await tap(page, 516, 492);
  await snap(page, 'build_after_purchases.png');

  // ---- Fan hull: locked until bought
  await tap(page, ...SHIP_BTN);
  await tap(page, 270, 492); // Fan row (Dart, Twin, Prong, Fan, Shuttle)
  s = await state(page);
  check(s.hull === 'shuttle', `the locked Fan hull is not selectable (hull ${s.hull}, toast "${s.toast}")`);
  await tap(page, ...TAB.shop);
  await tap(page, 405, 136); // Hulls section
  s = await state(page);
  check(s.section === 'hulls', 'Hulls section opens');
  if (s.credits < 1200) await dbg('dbg-credits');
  s = await state(page);
  const fan = s.rows.find(r => r.key === 'fan');
  check(/Buy - 1\.2K/.test(fan.buttons[0].label) && fan.buttons[0].enabled, `Fan hull button "${fan.buttons[0].label}"`);
  const credBeforeFan = s.credits;
  await tap(page, ...centre(fan.buttons[0].rect), { pause: 200 });
  s = await state(page);
  check(s.credits === credBeforeFan - 1200, `Fan hull cost 1200 (${credBeforeFan} -> ${s.credits})`);
  await tap(page, ...TAB.build);
  await tap(page, ...SHIP_BTN);
  await tap(page, 270, 492);
  s = await state(page);
  check(s.hull === 'fan', `the bought Fan hull is selectable (hull ${s.hull})`);

  // ---- progress survives a reload
  await page.reload();
  await page.waitForFunction(() => !!window.__mgbm);
  await page.waitForTimeout(400);
  s = await state(page);
  check(s.credits > 0 && s.hull === 'fan', `progress and hull survive a reload (credits ${s.credits}, hull ${s.hull})`);

  await browser.close();
  const { passes, failures } = lib.counts();
  process.stdout.write(`\n${passes} passed, ${failures} failed\n`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

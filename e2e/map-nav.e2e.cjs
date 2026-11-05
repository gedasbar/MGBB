// area: map, builder, challenges
// Chunk 29b end-to-end test: the Map tab's mode carousel (swipe, arrows, keys, centre card opens its mode), the Free Fly screen, the "<" path, the remembered mode
// (across tabs, a finished run and a page reload), the run summary's Map button, the builder without FLY / CAMPAIGN and the challenge bar at the bottom with its START.
// Needs the Vite dev server. Run: GAME_URL="http://localhost:5173/?debug=1" node e2e/map-nav.e2e.cjs
const lib = require('./lib.cjs');
const { check, state, tap, drag, waitFor } = lib;

const MAP_TAB = [486, 930], BUILD_TAB = [54, 930], SHOP_TAB = [162, 930];
const screen = (page) => page.evaluate(() => window.__mgbm && window.__mgbm.screen);
const waitScreen = (page, name, timeout = 8000) => waitFor(async () => (await screen(page)) === name, { timeout });
const centre = async (page) => (await state(page)).mode;

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  // 900 px wide: the debug panel sits beside the canvas and never covers a card. No tiers passed: the Frontier is locked.
  const { page } = await lib.openGame(browser, { rich: true, tiers: false, viewport: { width: 900, height: 960 } });

  // ---- The builder has no FLY / CAMPAIGN buttons any more: the old spots do nothing.
  await tap(page, 468, 789); await tap(page, 468, 735);
  check((await screen(page)) === 'build', 'the builder: taps where FLY and CAMPAIGN used to be do nothing');

  // ---- Map tab: the carousel opens on Campaign, the centre card is bigger and brighter than its neighbours.
  await tap(page, ...MAP_TAB);
  check(await waitScreen(page, 'carousel'), 'the Map tab opens the carousel');
  let s = await state(page);
  check(s.mode === 'campaign' && s.cards.map(c => c.mode).join() === 'campaign,frontier,freefly', `three cards, centred on Campaign (${s.cards.map(c => c.mode)})`);
  check(s.cards[0].scale === 1 && s.cards[0].alpha === 1 && s.cards[1].scale < 0.9 && s.cards[1].alpha < 0.6, `centre card full size and brightness, the neighbour smaller (${s.cards[1].scale}) and dimmer (${s.cards[1].alpha.toFixed(2)})`);
  check(/^Tier 1 · next: /.test(s.cards[0].line) && s.cards[1].locked && /tier 25/.test(s.cards[1].line) && s.cards[2].line === 'Not flown yet', `card lines: "${s.cards[0].line}" / "${s.cards[1].line}" / "${s.cards[2].line}"`);
  check(s.left === false && s.right === true, 'the left arrow is greyed on the first card');

  // ---- Swipe with the mouse: a drag left of about one card moves one card; a small drag springs back.
  await drag(page, 400, 420, 330, 420);
  check(await waitFor(async () => Math.abs((await state(page)).pos) < 0.01, { timeout: 3000 }) && (await centre(page)) === 'campaign', 'a short drag (70 px) springs back to Campaign');
  await drag(page, 420, 420, 110, 420, 12, 250); // held still before release: no flick, so it lands on the next card whatever the machine's speed
  check(await waitFor(async () => (await centre(page)) === 'frontier', { timeout: 3000 }), 'a drag left by one card width moves to the Frontier card');
  check(await waitFor(async () => Math.abs((await state(page)).pos - 1) < 0.01, { timeout: 3000 }), 'and the carousel settles exactly on it');
  await page.keyboard.press('ArrowRight');
  check(await waitFor(async () => (await centre(page)) === 'freefly', { timeout: 3000 }), 'the right arrow key moves to Free Fly');
  await page.keyboard.press('ArrowRight');
  check((await centre(page)) === 'freefly' && !(await state(page)).right, 'it stops at the last card');
  await page.keyboard.press('ArrowLeft');
  check(await waitFor(async () => (await centre(page)) === 'frontier', { timeout: 3000 }), 'the left arrow key moves back');
  const b = await page.evaluate(() => window.__mgbm.buttonRect('carouselRight'));
  await tap(page, b.x + b.w / 2, b.y + b.h / 2);
  check(await waitFor(async () => (await centre(page)) === 'freefly', { timeout: 3000 }), 'the on-screen arrow button moves to the next card');

  // ---- A locked card: the centre tap only explains.
  await page.keyboard.press('ArrowLeft');
  await waitFor(async () => (await centre(page)) === 'frontier' && Math.abs((await state(page)).pos - 1) < 0.01, { timeout: 3000 }); // settled before the tap
  await tap(page, 270, 420);
  check(await waitFor(async () => /tier 25/.test((await state(page)).toast), { timeout: 3000 }) && (await screen(page)) === 'carousel', 'tapping the locked Frontier card shows what unlocks it and stays on the carousel');

  // ---- Free Fly: the centre card opens its own screen; best wave, medal waves, START.
  await page.keyboard.press('ArrowRight');
  await waitFor(async () => (await centre(page)) === 'freefly' && Math.abs((await state(page)).pos - 2) < 0.01, { timeout: 3000 }); // settled before the tap
  await tap(page, 270, 420);
  check(await waitScreen(page, 'freefly-home'), 'the centre card opens the Free Fly screen');
  s = await state(page);
  check(s.milestones.length === 7 && s.milestones.every(m => !m.done) && s.bestWave === 0, `Free Fly screen: ${s.milestones.length} medal waves, none done, best wave ${s.bestWave}`);

  // ---- Memory: Build, Shop and back to the Map tab land on the Free Fly screen, not the carousel.
  await tap(page, ...BUILD_TAB);
  check(await waitScreen(page, 'build'), 'Build tab from the Free Fly screen');
  await tap(page, ...SHOP_TAB);
  check(await waitFor(async () => (await page.evaluate(() => window.__mgbmSm.currentScreen.statsName)) === 'Shop', { timeout: 4000 }), 'Shop tab');
  await tap(page, ...MAP_TAB);
  check(await waitScreen(page, 'freefly-home'), 'the Map tab goes straight back to the Free Fly screen');

  // ---- A finished run: its summary's Map button returns to the Free Fly screen.
  await tap(page, 270, 830); // START
  check(await waitFor(() => page.evaluate(() => !!window.__mgbm && !!window.__mgbm.world), { timeout: 8000 }), 'START starts Free Fly');
  await page.evaluate(() => window.__mgbmSm.currentScreen.pausable.quit());
  check(await waitScreen(page, 'summary'), 'the run ends with the summary');
  await tap(page, 270, 832); // Map
  check(await waitScreen(page, 'freefly-home'), 'the summary\'s Map button returns to the Free Fly screen it came from');

  // ---- Restart the app: the Map tab still goes to the Free Fly screen.
  await page.reload();
  await page.waitForFunction(() => !!window.__mgbm);
  await lib.dismissAchievementSummary(page);
  await tap(page, ...MAP_TAB);
  check(await waitScreen(page, 'freefly-home'), 'after reloading the page the Map tab still opens the Free Fly screen');

  // ---- "<": the carousel, centred on Free Fly; the Map tab then shows the carousel until a card is opened again.
  await tap(page, 30, 26);
  check(await waitScreen(page, 'carousel') && (await centre(page)) === 'freefly', '"<" returns to the carousel centred on Free Fly');
  await tap(page, ...BUILD_TAB);
  await waitScreen(page, 'build');
  await tap(page, ...MAP_TAB);
  check(await waitScreen(page, 'carousel') && (await centre(page)) === 'freefly', 'after "<" the Map tab shows the carousel (still on Free Fly)');
  await page.reload();
  await page.waitForFunction(() => !!window.__mgbm);
  await lib.dismissAchievementSummary(page);
  await tap(page, ...MAP_TAB);
  check(await waitScreen(page, 'carousel') && (await centre(page)) === 'freefly', 'and the carousel, centred on Free Fly, survives a reload too');

  // ---- Campaign card: tapping the centre card opens the tier list; "<" in its header returns.
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  await waitFor(async () => (await centre(page)) === 'campaign' && Math.abs((await state(page)).pos) < 0.01, { timeout: 3000 }); // settled: a tap on a card that is still gliding misses it
  await tap(page, 270, 420);
  check(await waitScreen(page, 'map'), 'the Campaign card opens the tier list');
  await tap(page, 30, 26);
  check(await waitScreen(page, 'carousel') && (await centre(page)) === 'campaign', '"<" in the tier list returns to the carousel centred on Campaign');

  // ---- The challenge bar: at the bottom of the builder, with its own START; none without a challenge.
  await tap(page, ...BUILD_TAB);
  await waitScreen(page, 'build');
  s = await state(page);
  check(s.challenge === null, 'no challenge: no bar');
  await page.evaluate(() => window.__mgbm.buildScreen.startChallenge('c_fast_25'));
  s = await state(page);
  check(!!s.challenge && s.challenge.visible, 'starting a challenge shows the bar');
  const r = s.challenge.startRect;
  check(s.challenge.barY > 700 && r.y > s.challenge.barY && r.y + r.h <= 820, `the bar sits just above the stats strip (bar y ${Math.round(s.challenge.barY)}, START y ${Math.round(r.y)}-${Math.round(r.y + r.h)}), clear of the top buttons`);
  await tap(page, r.x + r.w / 2, r.y + r.h / 2);
  const flew = await waitScreen(page, 'wall', 4000);
  s = flew ? await page.evaluate(() => window.__mgbm.level.tier) : null;
  check(flew, `the bar's START flies the challenge's tier (tier ${s})`);

  await browser.close();
  const c = lib.counts();
  console.log(`\n${c.passes} passed, ${c.failures} failed`);
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

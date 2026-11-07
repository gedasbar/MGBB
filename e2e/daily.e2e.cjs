// area: map, hub, economy, freefly
// Chunk 35a end-to-end test: the DAILY card in the Map carousel, the Daily screen (three quests, countdown, twist, reward tiers, history), the one free reroll, the daily run
// (twist banner, the run summary, today's best wave kept), the reset on "Next day" (new quests, yesterday in the history) and the save (version 19, daily state survives a reload).
// Needs the Vite dev server. Run: GAME_URL="http://localhost:5173/?debug=1" node e2e/daily.e2e.cjs
const lib = require('./lib.cjs');
const { check, state, tap, waitFor } = lib;

const screen = (page) => page.evaluate(() => window.__mgbm && window.__mgbm.screen);
const waitScreen = (page, name, timeout = 8000) => waitFor(async () => (await screen(page)) === name, { timeout });

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  // 900 px wide: the debug panel sits beside the canvas (its "Next day" button is a DOM button).
  const { page } = await lib.openGame(browser, { rich: true, tiers: true, viewport: { width: 900, height: 960 } });

  // ---- The carousel has a fourth card, DAILY, with the quests done and the twist.
  await page.evaluate(() => window.__mgbmNav.backToCarousel('campaign'));
  await page.evaluate(() => window.__mgbmNav.openMapTab());
  check(await waitScreen(page, 'carousel'), 'the Map tab shows the carousel');
  let s = await state(page);
  check(s.cards.length === 4 && s.cards[3].mode === 'daily', `four cards, the last is DAILY (${s.cards.map(c => c.mode)})`);
  check(/^3 new quests · [A-Z ]+$/.test(s.cards[3].line) && !s.cards[3].locked, `the DAILY card says "${s.cards[3].line}" and is never locked`);
  await page.evaluate(() => window.__mgbm.carousel.goTo(3));
  await waitFor(async () => Math.abs((await state(page)).pos - 3) < 0.01, { timeout: 3000 });
  await tap(page, 270, 420);
  check(await waitScreen(page, 'daily'), 'tapping the centre DAILY card opens the Daily screen');

  // ---- The Daily screen: three quests, a countdown, today's twist, seven history days.
  s = await state(page);
  check(s.quests.length === 3 && new Set(s.quests.map(q => q.kind)).size === 3, `three different quests: ${s.quests.map(q => q.text).join(' | ')}`);
  check(s.quests.every(q => q.progress === 0 && !q.done && q.n >= 1), 'all at 0 progress');
  check(/^New day in (\d+h \d\dm|\d+m \d\ds)$/.test(s.countdown), `countdown: "${s.countdown}"`);
  check(s.history.length === 7 && s.history.every(h => h.best === 0) && s.history[6].day === s.today, 'seven history days, today last, none flown yet');
  const day0 = s.today, kinds0 = s.quests.map(q => q.kind), twist0 = s.twist;
  check(s.day === day0 && !s.rerolled, `today is ${day0}, twist ${twist0}, reroll still available`);

  // ---- One free reroll: tap the second quest's Reroll, the quest changes, the buttons go.
  const rr = await page.evaluate(() => window.__mgbm.buttonRect('dailyReroll1'));
  check(!!rr, 'each unfinished quest has a Reroll button');
  await tap(page, rr.x + rr.w / 2, rr.y + rr.h / 2);
  check(await waitFor(async () => (await state(page)).rerolled === true, { timeout: 3000 }), 'tapping Reroll uses the day\'s reroll');
  s = await state(page);
  check(s.quests[1].kind !== kinds0[1] && s.quests[0].kind === kinds0[0] && s.quests[2].kind === kinds0[2] && !kinds0.includes(s.quests[1].kind), `only the second quest changed (${kinds0[1]} -> ${s.quests[1].kind})`);
  check(await page.evaluate(() => !window.__mgbm.buttonRect('dailyReroll0') && !window.__mgbm.buttonRect('dailyReroll2')), 'no Reroll buttons are left');
  const questsAfterReroll = JSON.stringify(s.quests);

  // ---- The daily run: START opens a Free Fly run with the twist announced.
  // The twist banner is on screen for about a second and a half of game time: record it from inside the page, not by polling from outside.
  await page.evaluate(() => { window.__seen = []; setInterval(() => { try { const t = window.__mgbm.state().themeBanner; if (t) window.__seen.push(t.title); } catch (e) { /* not a fly screen */ } }, 25); });
  await tap(page, 270, 849);
  check(await waitFor(() => page.evaluate(() => !!window.__mgbm && !!window.__mgbm.world), { timeout: 8000 }), 'START DAILY RUN starts a Free Fly run');
  s = await state(page);
  check(s.daily && s.daily.day === day0 && s.daily.twistId === twist0, `the run is the daily run of ${day0} with the ${twist0} twist`);
  const seed = s.seed;
  const twistName = twist0.replace('_', ' ').toUpperCase();
  check(await waitFor(() => page.evaluate((n) => window.__seen.includes(n), twistName), { timeout: 4000 }), `the twist banner "${twistName}" was shown as the run started`);
  check((await state(page)).hud.wave.includes(twistName), `the wave line carries the twist name ("${(await state(page)).hud.wave}")`);
  // The same seed on a second start the same day.
  await page.evaluate(() => { const w = window.__mgbm.world; w.hull = 0; w.gameOver = true; });
  check(await waitScreen(page, 'summary', 10000), 'the run ends on the summary');
  s = await state(page);
  check(s.rows.some(r => r.label === "Today's best wave") && s.rows.some(r => r.label === 'Wave reached'), 'the daily summary has "Today\'s best wave" in place of "Highest tier"');
  // Fly again keeps the daily run.
  await tap(page, 100, 832);
  check(await waitFor(() => page.evaluate(() => !!window.__mgbm && !!window.__mgbm.world), { timeout: 8000 }), 'Fly again starts another daily run');
  s = await state(page);
  check(s.daily && s.daily.day === day0 && s.seed === seed, `the second attempt has the same seed (${seed}): unlimited attempts, same waves`);
  await page.evaluate(() => { const w = window.__mgbm.world; w.jumpToWave(6); });
  await waitFor(async () => (await state(page)).wave >= 6, { timeout: 4000 });
  await page.evaluate(() => { const w = window.__mgbm.world; w.hull = 0; w.gameOver = true; });
  check(await waitScreen(page, 'summary', 10000), 'the second run ends');
  s = await state(page);
  check(/Daily run, wave 5: \+6 Cores/.test(s.unlocked), `the summary says the wave 5 reward was paid ("${s.unlocked.replace(/\n/g, ' / ')}")`);
  // The Free Fly records are untouched by a daily run.
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('mgbm.progress.v1')));
  check(rec.version === 19 && rec.bestWave === 0, `save version ${rec.version}; bestWave stays ${rec.bestWave} (the daily run does not feed Free Fly records)`);
  check(rec.daily.runBest >= 6 && rec.daily.runPaid.includes(5), `the save keeps today's best wave (${rec.daily.runBest}) and the paid tier`);

  // ---- Back to the Daily screen through Map: best wave shown, tier paid once.
  await tap(page, 270, 832);
  check(await waitScreen(page, 'daily'), 'the summary\'s Map button returns to the Daily screen');
  s = await state(page);
  check(s.runBest >= 6 && s.runPaid.join() === '5' && JSON.stringify(s.quests) === questsAfterReroll, `best wave ${s.runBest}, tiers paid [${s.runPaid}], the quests are unchanged all day`);
  check(s.history[6].best === s.runBest, 'today\'s bar in the history shows it');

  // ---- A reload keeps today (same quests, same twist).
  await page.reload();
  await page.waitForFunction(() => !!window.__mgbm);
  await lib.dismissAchievementSummary(page);
  check(await lib.openMode(page, 'daily'), 'after a reload the Daily screen opens again');
  s = await state(page);
  check(s.today === day0 && JSON.stringify(s.quests) === questsAfterReroll && s.twist === twist0 && s.rerolled, 'same day, same quests, same twist, reroll still used');

  // ---- Next day (debug): new quests, a fresh reroll, yesterday in the history, the screen redraws while open.
  await page.evaluate(() => window.__mgbmNav.nextDay()); // what the debug panel's "Next day" button does
  check(await waitFor(async () => (await state(page)).day !== day0, { timeout: 4000 }), 'Next day draws a new day while the Daily screen is open');
  s = await state(page);
  check(!s.rerolled && s.quests.every(q => q.progress === 0) && s.runBest === 0 && s.runPaid.length === 0 && s.twist !== twist0, `new day ${s.day}: fresh quests, reroll back, nothing paid, a different twist (${twist0} -> ${s.twist})`);
  check(s.history[5].day === day0 && s.history[5].best >= 6 && s.history[6].best === 0, 'yesterday\'s best wave is in the history');
  check(JSON.stringify(s.quests.map(q => q.kind)) !== JSON.stringify(JSON.parse(questsAfterReroll).map(q => q.kind)), 'different quests than yesterday');
  check(await page.evaluate(() => !!window.__mgbm.buttonRect('dailyReroll0')), 'the Reroll buttons are back');
  await page.evaluate(() => window.__mgbmNav.backToToday());
  check(await waitFor(async () => (await state(page)).today === day0, { timeout: 4000 }), 'Back to today (debug) returns to the real day');

  // ---- The real way: a wall run feeds a quest (blocks destroyed) and the card line on the carousel follows.
  await page.evaluate(() => window.__mgbmNav.backToCarousel('daily'));
  await waitScreen(page, 'carousel');
  s = await state(page);
  check(/^\d \/ 3 quests · [A-Z ]+$/.test(s.cards[3].line), `the DAILY card now says "${s.cards[3].line}"`);
  await browser.close();
  const c = lib.counts();
  console.log(`
${c.passes} passed, ${c.failures} failed`);
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

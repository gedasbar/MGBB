// Chunk 28a end-to-end test (28b: the panel lives in the Build screen's ship hub, ACHIEVEMENTS tab): achievements and challenges. An old save (before achievements) loads with ONE summary panel; the panel
// lists achievements with progress and a hidden one; a new achievement is a toast; the challenge list; a started challenge shows its rule in
// the builder and blocks FLY when the circuit breaks it; a challenge run is judged and paid once. Contact sheet:
// reports/chunk28a/sheet_achievements.png. Needs the Vite dev server (npm run dev, or GAME_URL). Run: node e2e/achievements.e2e.cjs
const path = require('path');
const fs = require('fs');
const lib = require('./lib.cjs');
const { check, state, tap, waitFor } = lib;
const OUT = path.join(__dirname, '..', 'reports', 'chunk28a');
fs.mkdirSync(OUT, { recursive: true });

const SHIP_BTN = [28, 26], ACH_TAB = [439, 137], BUILD_TAB = [54, 930];
const hubTab = (page) => page.evaluate(() => window.__mgbm.buildScreen && window.__mgbm.buildScreen.hubTab);
const astate = (page) => page.evaluate(() => window.__mgbm.buildScreen.achPanel.state());
/** Opens the hub's Achievements tab from the Build screen (retrying the taps until it shows). */
async function openAch(page) {
  for (let i = 0; i < 4 && (await hubTab(page)) !== 'ach'; i++) {
    if (!(await hubTab(page))) await tap(page, ...SHIP_BTN, { pause: 150 });
    await tap(page, ...ACH_TAB, { pause: 150 });
    await waitFor(async () => (await hubTab(page)) === 'ach', { timeout: 1500 });
  }
  check((await hubTab(page)) === 'ach', 'the hub opens on the Achievements tab');
}
const sm = (page, fn, arg) => page.evaluate(fn, arg);
const overlays = (page) => page.evaluate(() => ({ view: window.__mgbmSm.overlays.current, toast: window.__mgbmSm.overlays.toastMessage }));
const waitScreen = (page, n) => page.waitForFunction((x) => window.__mgbm && window.__mgbm.screen === x, n, { timeout: 8000 });
async function canvasShot(page) { return (await page.locator('canvas').screenshot()).toString('base64'); }
async function montage(page, shots, captions, file) {
  const b64 = await page.evaluate(async ({ shots, captions }) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
    const w = 540, h = 960, k = 0.5, pad = 8, cols = 3, rows = Math.ceil(imgs.length / cols);
    const c = document.createElement('canvas');
    c.width = cols * (w * k + pad) + pad; c.height = rows * (h * k + 40) + pad;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => {
      const x = pad + (i % cols) * (w * k + pad), y = pad + Math.floor(i / cols) * (h * k + 40);
      ctx.drawImage(im, x, y, w * k, h * k); ctx.fillStyle = '#aaa'; ctx.font = '12px monospace'; ctx.fillText(captions[i], x, y + h * k + 22);
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { shots, captions });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mgbm.progress.v1')));
const rectOf = (page, id) => page.evaluate((i) => window.__mgbm.buildScreen.achPanel.buttonRect(i), id);
async function tapButton(page, id, screen) {
  // buttonRect scrolls a list button into view first; the tap is retried until its effect shows.
  const r = await waitFor(() => rectOf(page, id), { timeout: 3000 });
  check(!!r, `button ${id} exists`);
  if (r) await tap(page, r.x + r.w / 2, r.y + r.h / 2);
  for (let i = 0; screen && i < 3 && !(await waitFor(() => page.evaluate((x) => window.__mgbm.screen === x, screen), { timeout: 2500 })); i++) {
    const r2 = await rectOf(page, id);
    if (r2) await tap(page, r2.x + r2.w / 2, r2.y + r2.h / 2);
  }
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  // The standard rich save is version 8 (an "old" save): 100 tiers passed, 20 blocks, the Shuttle and the Fan.
  const { page } = await lib.openGame(browser, { rich: true, tiers: true, summary: 'keep' });
  const shots = [], caps = [];

  // ---- 1. The load summary of an old save: ONE panel, no toasts.
  const ov = await waitFor(async () => { const o = await overlays(page); return o.view === 'achSummary' ? o : null; }, { timeout: 4000 });
  check(!!ov, 'an old save opens the achievements summary panel at load');
  const sum = await page.evaluate(() => { const s = window.__mgbm.model.store; return { n: s.data.achievements.length, medals: s.data.medals, ids: s.data.achievements, toasts: s.hasAchievementToasts }; });
  check(sum.n === 4 && sum.ids.includes('pass_100') && sum.ids.includes('pass_10'), `the save was granted what it had reached: ${sum.n} achievements (${sum.ids.slice(0, 6).join(', ')}...)`);
  check(sum.toasts === false && !ov.toast, 'no burst of toasts: the summary stands in for them');
  check(sum.medals >= 12, `the Medals of what it had reached were paid (pass tier 10 / 25 / 50 / 100 alone are 12): ${sum.medals}`);
  shots.push(await canvasShot(page)); caps.push('1 Load summary, old save');
  const ok = await page.evaluate(() => window.__mgbmSm.overlays.buttonCenter('achSummaryOk'));
  await tap(page, ok.x, ok.y);
  check(await waitFor(async () => (await overlays(page)).view === 'none', { timeout: 2000 }), 'OK closes the summary');
  check(await page.evaluate(() => window.__mgbmSm.overlays.current === 'none'), 'the panel does not come back');

  // ---- 2. A new achievement during play is a toast.
  await page.evaluate(() => { const s = window.__mgbm.model.store; s.data.bestWave = 10; s.commit(); });
  const toast = await waitFor(async () => (await overlays(page)).toast, { timeout: 2000 });
  check(/Achievement: Rock breaker/.test(toast || ''), `reaching wave 10 shows a toast: "${(toast || '').replace(/\n/g, ' / ')}"`);
  check((await page.evaluate(() => window.__mgbm.model.store.data.medals)) === sum.medals + 1, 'and pays its Medal once');
  await page.waitForTimeout(150);
  shots.push(await canvasShot(page)); caps.push('2 Achievement toast');

  // ---- 3. The panel: the ship button's hub, ACHIEVEMENTS tab. "Show completed" is off by default.
  await openAch(page);
  let s = await astate(page);
  check(s.view === 'achievements' && s.showCompleted === false && s.rows.length === 39 && s.rows.every(r => !r.earned), `Show completed is off: only the 39 unfinished achievements are listed (5 are earned): ${s.rows.length}`);
  shots.push(await canvasShot(page)); caps.push('3a Achievements, Show completed OFF');
  await tapButton(page, 'showCompleted');
  await waitFor(async () => (await astate(page)).showCompleted === true, { timeout: 2000 });
  s = await astate(page);
  const row = (id) => s.rows.find(r => r.id === id);
  check(s.rows.length === 44, `the panel lists all 44 achievements with Show completed on: ${s.rows.length}`);
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('mgbm_settings')).showCompleted === true), 'the switch is remembered in the settings');
  check(s.rows.filter(r => r.earned).length === 5, 'five are earned');
  const at = (id) => s.rows.findIndex(r => r.id === id);
  check(at('pass_10') > at('pass_125'), 'a completed achievement (pass_10) is listed after an unfinished one of the same group (pass_125)');
  check(row('pass_10').earned && row('pass_100').earned && !row('pass_125').earned, 'earned and open ones are marked');
  check(row('pass_125').value === 100 && row('pass_125').goal === 125, `a bar reads value / goal: ${row('pass_125').value} / ${row('pass_125').goal}`);
  check(row('after_100').title === '???' && /behind the last wall/.test(row('after_100').text), `the hidden one shows only its hint: "${row('after_100').title}" / "${row('after_100').text}"`);
  await page.evaluate(() => window.__mgbm.buildScreen.achPanel.scrollBy(60));
  await page.waitForTimeout(150);
  shots.push(await canvasShot(page)); caps.push('3b Achievements, Show completed ON');

  // ---- 4. The challenge list grows with the tiers passed.
  await tapButton(page, 'viewChallenges');
  await waitFor(async () => (await astate(page)).view === 'challenges', { timeout: 2000 });
  s = await astate(page);
  const open = s.rows.filter(r => r.open).length;
  check(s.rows.length === 31 && open === 25, `31 challenges, the 25 on tiers 1-100 are open (the six on tiers 106-150 are not): ${open} open`);
  check(!s.rows.find(r => r.id === 'c_maze_nofire').open && /Locked: pass tier 106/.test(s.rows.find(r => r.id === 'c_maze_nofire').text), 'a challenge on a tier not passed shows "Locked: pass tier 106 first"');
  shots.push(await canvasShot(page)); caps.push('4 Challenges list');

  // ---- 5. Start one with a rule the circuit breaks: the builder shows the rule and FLY is refused.
  await page.evaluate(() => window.__mgbm.buildScreen.achPanel.show('challenges'));
  await tapButton(page, 'start:c_no_aoe');
  check(await waitFor(async () => (await hubTab(page)) === null, { timeout: 3000 }), 'Start closes the hub and the builder shows the challenge');
  const aoe = await page.evaluate(() => {
    const m = window.__mgbm.model;
    const c = m.grid.cells.find(x => x.type === 'empty' && !x.blockId);
    m.place(c.x, c.y, 'aoe_circle');
    return { x: c.x, y: c.y };
  });
  s = await state(page);
  check(s.challenge && s.challenge.id === 'c_no_aoe' && s.challenge.visible && /No AoE - Circle, AoE - Rectangle/.test(s.challenge.text) && /Clear tier 45/.test(s.challenge.text), `the builder shows the rule: ${s.challenge && s.challenge.text.replace(/\n/g, ' / ')}`);
  check(/Not allowed in this challenge: AoE - Circle/.test(s.challenge.status), `and says why it cannot fly: "${s.challenge.status}"`);
  await tap(page, 468, 789); // FLY
  await page.waitForTimeout(200);
  s = await state(page);
  check(s.toast && /Not allowed in this challenge/.test(s.toast), `FLY gives the plain message instead of flying: "${s.toast}"`);
  check((await page.evaluate(() => window.__mgbm.screen)) === 'build', 'and stays in the builder');
  shots.push(await canvasShot(page)); caps.push('5 Builder blocked by a rule');
  await page.evaluate(([x, y]) => window.__mgbm.model.remove(x, y), [aoe.x, aoe.y]);
  s = await state(page);
  check(/Ready/.test(s.challenge.status), `taking the block off makes it ready: "${s.challenge.status}"`);

  // ---- 6. A challenge run that meets its rule pays once.
  await openAch(page);
  await page.evaluate(() => window.__mgbm.buildScreen.achPanel.show('challenges'));
  // The Dart challenge needs the Dart.
  await tapButton(page, 'start:c_dart');
  await waitFor(async () => (await hubTab(page)) === null, { timeout: 3000 });
  s = await state(page);
  check(/Needs the Dart hull|needs the Dart hull/.test(s.challenge.status), `the wrong hull is refused: "${s.challenge.status}"`);
  await page.evaluate(() => { const m = window.__mgbm.model; m.switchHull('dart'); });
  s = await state(page);
  check(/Ready/.test(s.challenge.status), `with the Dart picked it is ready: "${s.challenge.status}"`);
  const before = await saved(page);
  await tap(page, 468, 789); // FLY: the challenge's tier
  await waitScreen(page, 'wall');
  const lvl = await page.evaluate(() => ({ tier: window.__mgbm.level.tier, hud: window.__mgbm.state().hud.square }));
  check(lvl.tier === 10 && /Challenge/.test(lvl.hud), `FLY flies the challenge's tier with the rule on the HUD: tier ${lvl.tier}, "${lvl.hud}"`);
  await page.evaluate(() => window.__mgbm.wall.destroyAll());
  await waitScreen(page, 'summary');
  s = await state(page);
  check(s.challenge && s.challenge.ok && /Challenge complete! \+1 Medal/.test(s.challenge.text), `the summary says it is complete and what it paid: "${s.challenge && s.challenge.text}"`);
  const first = await saved(page);
  check(first.challengesDone.includes('c_dart') && first.medals >= before.medals + 1, `the reward is in the save: Medals ${before.medals} -> ${first.medals}, done ${JSON.stringify(first.challengesDone)}`);
  shots.push(await canvasShot(page)); caps.push('6 Challenge complete');
  // Retry: the same challenge again pays nothing more.
  await tap(page, 100, 832);
  await waitScreen(page, 'wall');
  await page.evaluate(() => window.__mgbm.wall.destroyAll());
  await waitScreen(page, 'summary');
  s = await state(page);
  check(s.challenge && s.challenge.ok && /already taken/.test(s.challenge.text), `a second success pays nothing: "${s.challenge && s.challenge.text}"`);
  const second = await saved(page);
  check(second.medals === first.medals && second.challengesDone.length === first.challengesDone.length, `and the Medals stay at ${second.medals}`);

  // ---- 7. A run that breaks the in-run rule fails the challenge.
  await tap(page, 440, 832); // Build
  await waitScreen(page, 'build');
  await page.evaluate(() => window.__mgbm.model.store.data.passedTiers.push(25));
  await openAch(page);
  await page.evaluate(() => window.__mgbm.buildScreen.achPanel.show('challenges'));
  await tapButton(page, 'start:c_fast_25');
  await waitFor(async () => (await hubTab(page)) === null, { timeout: 3000 });
  await tap(page, 468, 789);
  await waitScreen(page, 'wall');
  await page.evaluate(() => { window.__mgbm.wall.time = 40; window.__mgbm.wall.destroyAll(); });
  await waitScreen(page, 'summary');
  s = await state(page);
  check(s.challenge && !s.challenge.ok && /Too slow/.test(s.challenge.text), `a clear after the time limit fails it: "${s.challenge && s.challenge.text}"`);

  await montage(page, shots, caps, path.join(OUT, 'sheet_achievements.png'));
  await browser.close();
  const c = lib.counts();
  process.stdout.write(`\n${c.passes} passed, ${c.failures} failed\n`);
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { process.stdout.write(`FAIL  script error: ${e.stack || e}\n`); process.exit(1); });

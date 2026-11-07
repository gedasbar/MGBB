// area: debug, audio
// Chunk 35b end-to-end test: the debug panel's Sound tuner. Opens it, picks a slot, randomizes, uses the sound in game, exports the JSON and
// imports it back. Nobody can hear anything in headless Chromium, so this checks the controls and the data only.
// Needs the Vite dev server. Run: node e2e/sound-tuner.e2e.cjs
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, waitFor } = lib;

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: true });
  await waitFor(async () => await page.evaluate(() => !!document.getElementById("dbg-tuner")), { timeout: 8000 });
  // Buttons are clicked through the DOM: the debug panel sits above the game canvas and may be folded or scrolled.
  const click = (id) => page.evaluate((i) => { document.getElementById(i).click(); }, id);
  const val = (id) => page.evaluate((i) => document.getElementById(i).value, id);
  await page.evaluate(() => { document.getElementById('dbg-tuner').open = true; });

  check(await page.evaluate(() => document.querySelectorAll('#dbg-tuner-slot option').length) >= 25, 'the slot list has every game sound');
  check(await page.evaluate(() => ['shot', 'blockDestroyed', 'rockPop', 'aoe', 'hurt', 'crash', 'crystal', 'wave', 'bossArrive', 'bossDeath', 'cleared', 'passed', 'uiTap', 'purchase', 'denied'].every(id => !!document.querySelector(`#dbg-tuner-slot option[value="${id}"]`))), 'the named slots are all there');
  check(await page.evaluate(() => document.querySelectorAll('[id^="dbg-tuner-preset-"]').length) === 7, 'seven preset buttons');
  check(await page.evaluate(() => document.querySelectorAll('[id^="dbg-tuner-p-"]').length) === 21, 'one slider for every parameter');

  // Pick a slot, randomize: the sliders change.
  await page.evaluate(() => { const s = document.getElementById('dbg-tuner-slot'); s.value = 'blockDestroyed'; s.dispatchEvent(new Event('change')); });
  const before = await page.evaluate(() => Array.from(document.querySelectorAll('[id^="dbg-tuner-p-"]')).map(i => i.value).join(','));
  await click('dbg-tuner-random');
  const after = await page.evaluate(() => Array.from(document.querySelectorAll('[id^="dbg-tuner-p-"]')).map(i => i.value).join(','));
  check(before !== after, 'Randomize changes the sliders');
  check((await page.evaluate(() => document.getElementById('dbg-tuner-undo').disabled)) === false, 'Undo is available after a change');
  await click('dbg-tuner-undo');
  check((await page.evaluate(() => Array.from(document.querySelectorAll('[id^="dbg-tuner-p-"]')).map(i => i.value).join(','))) === before, 'Undo restores the old numbers');
  await click('dbg-tuner-preset-Explosion');
  await click('dbg-tuner-mutate');

  // Use in game: the slot now has a design, kept in localStorage, and the engine's bank has it.
  check((await page.evaluate(() => document.getElementById('dbg-tuner-status').textContent)).includes('original'), 'before: the slot plays the original sound');
  await click('dbg-tuner-use');
  check((await page.evaluate(() => document.getElementById('dbg-tuner-status').textContent)).includes('designed sound'), 'after Use in game: the slot is designed');
  check(await page.evaluate(() => !!window.__mgbmSfx.bank.get('blockDestroyed')), 'the engine bank holds the design');
  check(await page.evaluate(() => (localStorage.getItem('mgbm_sfxr_draft') || '').includes('blockDestroyed')), 'the design is kept in localStorage');

  // Export: the box holds JSON with that slot.
  await click('dbg-tuner-export');
  const text = await val('dbg-tuner-json');
  const parsed = JSON.parse(text);
  check(parsed.version === 1 && Object.keys(parsed.sounds).join() === 'blockDestroyed', 'Export all writes version 1 JSON with the one designed slot');
  check(typeof parsed.sounds.blockDestroyed.startFreq === 'number', 'the slot holds its numbers');

  // Clear, then import the same text back.
  await click('dbg-tuner-clear');
  check(await page.evaluate(() => !window.__mgbmSfx.bank.has('blockDestroyed')), 'Clear all removes the design');
  await page.evaluate((t) => { document.getElementById('dbg-tuner-json').value = t; }, text);
  await click('dbg-tuner-import');
  check(await page.evaluate(() => window.__mgbmSfx.bank.has('blockDestroyed')), 'Import brings the design back');
  await click('dbg-tuner-export');
  check((await val('dbg-tuner-json')) === text, 'export -> import -> export gives the same text');

  await browser.close();
  const c = lib.counts();
  process.stdout.write(`\n${c.passes} passed, ${c.failures} failed\n`);
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { process.stdout.write(`FAIL  script error: ${e.stack || e}\n`); process.exit(1); });

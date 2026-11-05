// area: hub, settings, cosmetics, captains
// Chunk 28b end-to-end test: the ship hub (three tabs), the Customization tab (a locked skin, choosing an unlocked one, saved), the Settings sections (frame rate limit,
// trails, backgrounds, damage numbers, touch sensitivity slider, double-confirm reset) and that the Captain tab no longer has the Achievements button.
// Needs the Vite dev server. Run: node e2e/hub-settings.e2e.cjs
const lib = require('./lib.cjs');
const { check, tap, waitFor } = lib;

const SHIP_BTN = [28, 26], SETTINGS_BTN = [128, 26], CAPTAIN_TAB = [270, 930];
const TAB = { ships: [101, 137], custom: [270, 137], ach: [439, 137] };
const hubTab = (page) => page.evaluate(() => window.__mgbm.buildScreen && window.__mgbm.buildScreen.hubTab);
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mgbm_settings') || '{}'));
const view = (page) => page.evaluate(() => window.__mgbmSm.overlays.current);

async function openTab(page, tab) {
  for (let i = 0; i < 4 && (await hubTab(page)) !== tab; i++) {
    if (!(await hubTab(page))) await tap(page, ...SHIP_BTN, { pause: 150 });
    if (tab !== 'ships' || (await hubTab(page)) !== 'ships') await tap(page, ...TAB[tab], { pause: 150 });
    await waitFor(async () => (await hubTab(page)) === tab, { timeout: 1500 });
  }
  check((await hubTab(page)) === tab, `the hub shows the ${tab} tab`);
}
/** Taps a settings button until the predicate holds (a tap can be swallowed on a loaded machine). */
async function press(page, id, pred, msg) {
  let ok = false;
  for (let i = 0; i < 4 && !ok; i++) {
    const c = await page.evaluate((b) => window.__mgbmSm.overlays.buttonCenter(b), id);
    await tap(page, c.x, c.y, { pause: 120 });
    ok = await waitFor(pred, { timeout: 1200 });
  }
  check(!!ok, msg);
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: true });

  // ---- hub
  await openTab(page, 'ships');
  await openTab(page, 'custom');
  await openTab(page, 'ach');
  await openTab(page, 'ships');
  await page.keyboard.press('Escape');
  check(await waitFor(async () => (await hubTab(page)) === null, { timeout: 2000 }), 'Escape closes the hub');
  await tap(page, ...CAPTAIN_TAB, { pause: 200 });
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'captain', null, { timeout: 5000 });
  const capButtons = await page.evaluate(() => window.__mgbm.state().buttons.map(b => b.id));
  check(!capButtons.includes('achievements'), `the Captain tab has no Achievements button any more: ${capButtons.join(', ')}`);
  await tap(page, 54, 930, { pause: 200 });
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'build', null, { timeout: 5000 });

  // ---- customization: a locked skin, then an unlocked one
  await openTab(page, 'custom');
  let cs = await page.evaluate(() => window.__mgbm.buildScreen.customPanel.state());
  const tile = (id) => cs.tiles.find(t => t.id === id);
  check(tile('auto').selected && tile('band0').unlocked && !tile('band3').unlocked && !tile('skin_legend').unlocked && !tile('trail_ember').unlocked, 'Auto is selected; band 3 and the reward skins / trails are locked on a save with no big hits');
  check(/Land a hit of 1000|Land a hit of 1,000|Land a hit of 1K/.test(tile('band3').hint), `a locked skin says what unlocks it: "${tile('band3').hint}"`);
  const tapTile = async (id) => { const r = await page.evaluate((i) => window.__mgbm.buildScreen.customPanel.tileRect(i), id); await tap(page, r.x + r.w / 2, r.y + r.h / 2, { pause: 120 }); };
  await tapTile('band3');
  check(await waitFor(async () => /Locked/.test(await page.evaluate(() => window.__mgbm.state().toast || '')), { timeout: 2000 }), 'tapping a locked skin says it is locked');
  check((await saved(page)).shotSkin !== 'band3', 'and does not select it');
  await page.evaluate(() => { const s = window.__mgbm.model.store; s.data.records.bestShot = 5000; s.commit(); window.__mgbm.buildScreen.customPanel.refresh(); });
  await tapTile('band3');
  check(await waitFor(async () => (await saved(page)).shotSkin === 'band3', { timeout: 2000 }), 'a skin unlocked by the best shot can be chosen and is saved');
  await page.evaluate(() => { const s = window.__mgbm.model.store; s.data.cosmetics.push('trail_ace'); s.commit(); window.__mgbm.buildScreen.customPanel.refresh(); });
  await tapTile('trail_ace');
  check(await waitFor(async () => (await saved(page)).trailStyle === 'trail_ace', { timeout: 2000 }), 'a reward trail (a cosmetic id from an achievement) can be chosen');
  await tapTile('auto');
  check(await waitFor(async () => (await saved(page)).shotSkin === 'auto', { timeout: 2000 }), 'Auto puts the skin back to "follows damage"');
  await page.keyboard.press('Escape');

  // ---- settings
  await tap(page, ...SETTINGS_BTN, { pause: 200 });
  check(await waitFor(async () => (await view(page)) === 'settings', { timeout: 3000 }), 'the settings panel opens');
  const st = await page.evaluate(() => window.__mgbmSm.overlays.settingsState);
  check(st.contentH > st.areaH, `the list is taller (${st.contentH}) than its window (${st.areaH}): it scrolls`);
  await page.mouse.move(270, 500);
  await page.mouse.wheel(0, 400);
  check(await waitFor(async () => (await page.evaluate(() => window.__mgbmSm.overlays.settingsState.scroll)) > 100, { timeout: 2000 }), 'the mouse wheel scrolls the settings list');
  await page.evaluate(() => window.__mgbmSm.overlays.wheel(-5000));
  const fps = () => page.evaluate(() => window.__app.ticker.maxFPS);
  await press(page, 'frameLimit', async () => (await saved(page)).frameLimit === 30, 'Frame rate limit Auto -> 30 is saved');
  check(await waitFor(async () => (await fps()) === 30, { timeout: 2000 }), `and the render loop is capped at 30 (maxFPS ${await fps()})`);
  await press(page, 'frameLimit', async () => (await saved(page)).frameLimit === 60, 'then 60');
  await press(page, 'frameLimit', async () => (await saved(page)).frameLimit === 0, 'then back to Auto');
  check(await waitFor(async () => (await fps()) === 0, { timeout: 2000 }), 'Auto removes the cap');
  await press(page, 'trails', async () => (await saved(page)).trails === 'long', 'Trails Short -> Long');
  await press(page, 'trails', async () => (await saved(page)).trails === 'off', 'Trails -> Off');
  await press(page, 'backgrounds', async () => (await saved(page)).backgrounds === false, 'Backgrounds off is saved');
  await press(page, 'damageNumbers', async () => (await saved(page)).damageNumbers === false, 'Damage numbers off is saved');
  await press(page, 'gainUp', async () => (await saved(page)).touchGain === 1.25, 'Touch sensitivity + : 1.25');
  for (let i = 0; i < 4 && (await saved(page)).touchGain !== 2; i++) {
    const sl = await page.evaluate(() => window.__mgbmSm.overlays.buttonCenter('gainSlider'));
    await tap(page, sl.x + 150, sl.y, { pause: 120 }); // near the right end of the track
    await waitFor(async () => (await saved(page)).touchGain === 2, { timeout: 1000 });
  }
  check((await saved(page)).touchGain === 2, 'a tap near the right end of the slider track sets 2.0');
  await press(page, 'gainDown', async () => (await saved(page)).touchGain === 1.75, 'the - button steps it back to 1.75');
  const gain = (await saved(page)).touchGain;
  check(gain >= 0.75 && gain <= 2, `sensitivity stays inside 0.75 - 2.0: ${gain}`);
  // The sound row, the keys list and the About line exist.
  const ids = await page.evaluate(() => ['mute', 'weapon', 'testSound', 'exportSave', 'importSave', 'resetSave', 'touchControl', 'statsToggle'].map(i => !!window.__mgbmSm.overlays.buttonCenter(i)));
  check(ids.every(Boolean), 'Audio, Data and Controls buttons all exist');
  // Reset asks twice.
  await press(page, 'resetSave', async () => (await view(page)) === 'confirm', 'Reset save opens the first confirmation');
  await press(page, 'resetYes', async () => (await view(page)) === 'confirm2', 'Yes, erase leads to a SECOND confirmation, nothing is erased yet');
  check(await page.evaluate(() => !!localStorage.getItem('mgbm.progress.v1')), 'the save is still there after the first yes');
  await press(page, 'resetNo2', async () => (await view(page)) === 'settings', 'Cancel on the second one returns to the settings');
  await press(page, 'settingsBack', async () => (await view(page)) === 'none', 'Back closes the settings');

  await browser.close();
  const c = lib.counts();
  process.stdout.write(`\n${c.passes} passed, ${c.failures} failed\n`);
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { process.stdout.write(`FAIL  script error: ${e.stack || e}\n`); process.exit(1); });

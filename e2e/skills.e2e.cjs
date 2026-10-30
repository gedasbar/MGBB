// Chunk 22a end-to-end test: the Skills tab. Opens it from the tab bar, checks points and the progress bar, buys along a path,
// the adjacency rule, the node panel, the respec dialog (cost, confirm, cancel), that a Turn skill changes the builder estimate,
// and that dragging and the wheel move the map. Contact sheet: reports/chunk22a/sheet_skills.png.
// Needs the Vite dev server. Run: node e2e/skills.e2e.cjs
const path = require('path');
const fs = require('fs');
const lib = require('./lib.cjs');
const { check, state, tap, drag, wheel } = lib;
const OUT = path.join(__dirname, '..', 'reports', 'chunk22a');
fs.mkdirSync(OUT, { recursive: true });

const SKILLS_TAB = [378, 930], BUILD_TAB = [54, 930], BUY = [441, 864], RESPEC = [470, 26];
// The respec dialog: Respec (confirm) on the left, Cancel on the right.
const DIALOG_YES = [140, 510], DIALOG_NO = [400, 510];
const waitScreen = (page, n) => page.waitForFunction((x) => window.__mgbm && window.__mgbm.screen === x, n, { timeout: 8000 });
async function canvasShot(page) { return (await page.locator('canvas').screenshot()).toString('base64'); }
async function montage(page, shots, captions, file) {
  const b64 = await page.evaluate(async ({ shots, captions }) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
    const w = 540, h = 960, k = 0.5, pad = 8;
    const c = document.createElement('canvas');
    c.width = imgs.length * (w * k + pad) + pad; c.height = h * k + 40;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => { ctx.drawImage(im, pad + i * (w * k + pad), pad, w * k, h * k); ctx.fillStyle = '#aaa'; ctx.font = '12px monospace'; ctx.fillText(captions[i], pad + i * (w * k + pad), h * k + 28); });
    return c.toDataURL('image/png').split(',')[1];
  }, { shots, captions });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}
const nodeXY = (page, id) => page.evaluate((i) => window.__mgbm.nodeScreen(i), id);
async function tapNode(page, id) { const p = await nodeXY(page, id); await tap(page, p.x, p.y); }

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: true, tiers: false });
  const shots = [], caps = [];

  // ---- Builder estimate before the skill: a Turn Left on a hull where it still reaches an ejector.
  const before = await page.evaluate(() => {
    const m = window.__mgbm.model;
    m.store.data.ownedHulls.push('hornet'); // a hull where a left turn then a right turn, both on the signal path, lead to an ejector
    m.switchHull('hornet'); m.clearAll();
    m.place(2, 3, 'turn_l'); m.place(0, 3, 'turn_r');
    const on = m.compiled.cellInfo;
    if (m.compiled.recipes.length > 0 && on[3 * m.grid.w + 2].onPath && on[3 * m.grid.w].onPath) return { hull: 'hornet', damage: m.compiled.recipes[0].packet.damage };
    return null;
  });
  check(!!before, `a hull where a Turn Left then a Turn Right reach an ejector was found: ${before && before.hull}, damage per shot ${before && before.damage}`);
  await page.waitForTimeout(300);
  shots.push(await canvasShot(page)); caps.push('Builder, before the Turn skill');

  // ---- Open the tab.
  await tap(page, ...SKILLS_TAB);
  await waitScreen(page, 'skills');
  let s = await state(page);
  check(s.points === 'Points 0 / 0', `no Frontier ring yet: ${s.points}`);
  check(/next point at ring 25/.test(s.bar), `the bar names the next point: "${s.bar}"`);
  check(s.respecEnabled === false, 'Respec is greyed with no skills');
  check(Object.values(s.states).filter(v => v === 'owned').length === 1 && s.states.turn_left === 'buyable' && s.states.split_two === 'locked', 'only the start is owned; the first node of each path is buyable, deeper nodes are locked');
  shots.push(await canvasShot(page)); caps.push('Skills tab, zoomed out, no points');

  // ---- Points arrive with the ring; the node panel and Buy.
  await page.evaluate(() => { window.__mgbm.setRing(100); window.__mgbm.progress.data.medals = 25; window.__mgbm.progress.commit(); });
  await page.waitForTimeout(250);
  s = await state(page);
  check(s.points === 'Points 4 / 4', `ring 100 pays 4 points: ${s.points}`);
  await page.evaluate(() => window.__mgbm.focus('turn_left', 1.1));
  await page.waitForTimeout(250);
  await tapNode(page, 'turn_left');
  s = await state(page);
  check(s.selected === 'turn_left' && s.panel.name === 'Left Edge' && /Turn Left: \+1 damage/.test(s.panel.effect) && s.panel.buy, `tapping a node shows its panel and Buy: ${JSON.stringify(s.panel)}`);
  shots.push(await canvasShot(page)); caps.push('One path zoomed in, node panel (buyable)');
  await tap(page, ...BUY);
  s = await state(page);
  check(s.owned.join() === 'turn_left' && s.points === 'Points 3 / 4' && s.states.turn_right === 'buyable', `Buy takes one point: ${s.points}, next node now buyable`);
  await tapNode(page, 'split_two');
  s = await state(page);
  check(s.selected === 'split_two' && !s.panel.buy && /Locked/.test(s.panel.state), 'a node that touches nothing owned shows "Locked" and cannot be bought');
  await tapNode(page, 'turn_right'); await tap(page, ...BUY);
  await tapNode(page, 'split_two'); await tap(page, ...BUY);
  s = await state(page);
  check(s.owned.join() === 'turn_left,turn_right,split_two' && s.points === 'Points 1 / 4', `a chain along the path: ${s.owned.join(', ')}`);
  await page.evaluate(() => window.__mgbm.focus('split_three', 0.9));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__mgbm.select('cap_waypoint'));
  s = await state(page);
  check(/Needs the Waypoint block/.test(s.panel.state) && /Locked/.test(s.panel.state), `a capstone of a block not owned says so: "${s.panel.state.replace(/\n/g, ' / ')}"`);
  await page.evaluate(() => window.__mgbm.select('split_three'));
  await page.waitForTimeout(250);
  shots.push(await canvasShot(page)); caps.push('Owned / buyable / locked nodes');

  // ---- Pan and zoom.
  const c1 = (await state(page)).camera;
  await drag(page, 270, 300, 200, 360);
  const c2 = (await state(page)).camera;
  check(Math.abs(c2.cx - c1.cx) > 20 && Math.abs(c2.cy - c1.cy) > 20, 'dragging the map pans it');
  await wheel(page, 270, 300, -300);
  const c3 = (await state(page)).camera;
  check(c3.zoom > c2.zoom, `the wheel zooms in (${c2.zoom.toFixed(2)} -> ${c3.zoom.toFixed(2)})`);
  await page.evaluate(() => window.__mgbm.fit());
  await page.waitForTimeout(250);
  shots.push(await canvasShot(page)); caps.push('Whole tree, 3 skills bought');

  // ---- Respec dialog: Cancel, then confirm.
  await tap(page, ...RESPEC);
  s = await state(page);
  check(s.dialogOpen, 'Respec opens a confirm dialog');
  shots.push(await canvasShot(page)); caps.push('Respec dialog');
  await tap(page, ...DIALOG_NO);
  s = await state(page);
  check(!s.dialogOpen && s.owned.length === 3 && s.medals === 25, 'Cancel changes nothing');
  await tap(page, ...RESPEC);
  await tap(page, ...DIALOG_YES);
  s = await state(page);
  check(!s.dialogOpen && s.owned.length === 0 && s.medals === 15 && s.points === 'Points 4 / 4', `confirming took everything back for 10 Medals (25 -> ${s.medals}), ${s.points}`);

  // ---- The builder estimate after a Turn skill (bought again, one point).
  await page.evaluate(() => window.__mgbm.focus('turn_left', 1.1));
  await page.waitForTimeout(200);
  await tapNode(page, 'turn_left');
  await tap(page, ...BUY);
  s = await state(page);
  check(s.owned.join() === 'turn_left', 'Turn Left bought again');
  await tap(page, ...BUILD_TAB);
  await waitScreen(page, 'build');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.__mgbm.model.compiled.recipes[0].packet.damage);
  check(after === before.damage + 1, `the builder estimate includes the Turn Left skill: damage ${before.damage} -> ${after}`);
  shots.push(await canvasShot(page)); caps.push('Builder, after the Turn skill (+1)');

  await montage(page, shots, caps, path.join(OUT, 'sheet_skills.png'));
  const { passes, failures } = lib.counts();
  process.stdout.write(`\n${passes} passed, ${failures} failed\n`);
  await browser.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => { process.stdout.write(`FAIL  script error: ${e.stack}\n`); process.exit(1); });

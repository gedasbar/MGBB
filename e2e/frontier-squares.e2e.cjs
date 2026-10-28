// Chunk 15b end-to-end test: the Frontier's lavender look, wall and Free Fly squares, threshold rings, directional
// unlocks (toast, Unlocks panel, a gated block in the shop) and one Free Fly square played to a result and back.
// Contact sheet: reports/chunk15b/sheet_frontier15b.png. Needs the Vite dev server. Run: node e2e/frontier-squares.e2e.cjs
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, state, tap, gameToClient, pixelsAtClient } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk15b');
fs.mkdirSync(OUT, { recursive: true });
const waitScreen = (page, name, timeout = 8000) => page.waitForFunction((n) => window.__mgbm && window.__mgbm.screen === n, name, { timeout });

async function canvasShot(page) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const b = await page.locator('canvas').screenshot();
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
  return b.toString('base64');
}
async function montage(page, shots, captions, file) {
  const b64 = await page.evaluate(async ({ shots, captions }) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
    const w = 540, h = 960, k = 0.5, pad = 8;
    const c = document.createElement('canvas');
    c.width = imgs.length * (w * k + pad) + pad; c.height = h * k + 40;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => {
      ctx.drawImage(im, pad + i * (w * k + pad), pad, w * k, h * k);
      ctx.fillStyle = '#aaa'; ctx.font = '12px monospace';
      ctx.fillText(captions[i], pad + i * (w * k + pad), h * k + 28);
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { shots, captions });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
}
const lum = (p) => (p[0] + p[1] + p[2]) / 3;
const isLavender = (p) => p[2] > p[1] + 25 && p[0] > p[1] && lum(p) > 150;
const readSquares = async (page, sqs, dx = 0, dy = 0) => {
  const pts = await page.evaluate(({ sqs, dx, dy }) => sqs.map(q => { const p = window.__mgbm.squareScreen(q.x, q.y); return { x: p.x + dx, y: p.y + dy }; }), { sqs, dx, dy });
  const cl = await Promise.all(pts.map(p => gameToClient(page, p.x, p.y)));
  return pixelsAtClient(page, cl);
};

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  // A save that owns none of the gated blocks (rich: false), so the shop shows them locked.
  const { page } = await lib.openGame(browser, { rich: false });
  const shots = [];
  const caps = [];

  await page.evaluate(() => document.getElementById('dbg-fr-unlock').click());
  await tap(page, 486, 930);
  await waitScreen(page, 'map');
  await page.evaluate(() => window.__mgbm.openFrontier());
  await waitScreen(page, 'frontier');

  // ---- States: rings 0..3 cleared, one available medal square marked passed; camera so the ring-10 line is in view.
  const setup = await page.evaluate(() => {
    const m = window.__mgbm;
    m.clearRing(3);
    let pm = null;
    for (let r = 4; r <= 12 && !pm; r++) {
      for (let y = -r; y <= r && !pm; y++) for (let x = -r; x <= r && !pm; x++) {
        if (Math.max(Math.abs(x), Math.abs(y)) !== r || !m.hasMedal(x, y) || y > 0) continue;
        if (m.stateAt(x, y) === 'available') { pm = { x, y }; break; }
        const n = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => ({ x: x + dx, y: y + dy })).find(q => m.stateAt(q.x, q.y) !== 'hole');
        if (n && Math.max(Math.abs(n.x), Math.abs(n.y)) < r) { m.clearSquare(n.x, n.y); pm = { x, y }; }
      }
    }
    m.progress.data.frontier.sq[pm.x + ',' + pm.y] = 1; m.progress.commit();
    m.jump(0, -4, 44);
    m.select(1, -1); // a cleared (lavender) square
    return { pm };
  });
  await page.waitForTimeout(250);
  const census = await page.evaluate(() => {
    const m = window.__mgbm;
    const c = { cleared: 0, passed: 0, available: 0, locked: 0, hole: 0, wall: 0, freefly: 0, medal: 0, spike: 0, ffAvailable: null, ffLocked: null };
    for (let y = -11; y <= 3; y++) for (let x = -6; x <= 6; x++) {
      const st = m.stateAt(x, y);
      c[st]++;
      if (st === 'hole') continue;
      const k = m.kindAt(x, y);
      c[k]++;
      if (k === 'freefly' && st === 'available' && !c.ffAvailable && !m.hasMedal(x, y)) c.ffAvailable = { x, y };
      if (k === 'freefly' && st === 'locked' && !c.ffLocked && !m.hasMedal(x, y) && !m.spikeAt(x, y)) c.ffLocked = { x, y };
      if (m.hasMedal(x, y) && st !== 'cleared') c.medal++;
      if (m.spikeAt(x, y)) c.spike++;
    }
    return c;
  });
  check(census.cleared && census.passed === 1 && census.available && census.locked && census.hole && census.wall && census.freefly && census.medal && census.spike,
    `default zoom view holds every state, wall and Free Fly squares, medals, spikes, holes: ${JSON.stringify({ ...census, ffAvailable: undefined, ffLocked: undefined })}`);
  // Pixels: cleared = lavender fill; passed = lavender outline around a grey plate; the white selection shows on lavender.
  for (let k = 0; k < 25; k++) { await page.screenshot(); await page.waitForTimeout(100); } // headless draws frames while it is screenshotted: draw the new view before reading pixels
  const [cl, pa, paEdge, sel] = [
    ...(await readSquares(page, [{ x: 2, y: -1 }])),
    ...(await readSquares(page, [setup.pm], 0, 12)),
    ...(await readSquares(page, [setup.pm], 0, -18.5)),
    ...(await readSquares(page, [{ x: 1, y: -1 }], 0, -22.5)),
  ];
  check(isLavender(cl), `cleared square is filled lavender ${cl}`);
  check(!isLavender(pa) && Math.abs(pa[0] - pa[2]) < 10 && isLavender(paEdge), `passed square: grey plate ${pa} inside a lavender outline ${paEdge}`);
  check(lum(sel) > 230, `white selection outline visible on a lavender square ${sel}`);
  // Free Fly squares: a round inner dot (the corner of the inner square area is plate, the centre is the dark dot).
  if (census.ffAvailable) {
    const [corner, centre] = [...(await readSquares(page, [census.ffAvailable], -8, -8)), ...(await readSquares(page, [census.ffAvailable]))];
    check(lum(corner) > 80 && lum(centre) < 50, `Free Fly square (available) has a round inner dot: inner-square corner ${lum(corner).toFixed(0)} (plate), centre ${lum(centre).toFixed(0)} (dot)`);
  } else check(false, 'no available Free Fly square in view');
  const panel = await page.evaluate((q) => { window.__mgbm.select(q.x, q.y); return window.__mgbm.state().panel; }, census.ffAvailable || census.ffLocked);
  check(panel.line1.includes('Free Fly'), `panel names the kind: "${panel.line1}"`);
  // A square on the ring-10 line names its unlock.
  const note = await page.evaluate(() => { window.__mgbm.select(0, -100); return window.__mgbm.state().panel.note; });
  check(note.includes('Ring 100 North unlocks Frontier Echo'), `square on the ring-100 line: "${note}"`);
  await page.evaluate(() => window.__mgbm.select(1, -1));
  await page.waitForTimeout(150);
  shots.push(await canvasShot(page)); caps.push('lavender look, wall/Free Fly, ring 10');

  // ---- Far zoom: rings 10, 25 and 50 in view, cleared vs passed still distinguishable.
  await page.evaluate(() => window.__mgbm.jump(0, 0, 5));
  await page.waitForTimeout(250);
  const [farCleared, farPassed] = await readSquares(page, [{ x: 2, y: -1 }, setup.pm]);
  check(isLavender(farCleared) && !isLavender(farPassed), `far zoom (5 px): cleared ${farCleared} vs passed ${farPassed} (lavender ring, grey centre)`);
  shots.push(await canvasShot(page)); caps.push('zoom 5: threshold rings 10/25/50');

  // ---- Reach ring 10 North (cheat-clear the lattice column x = 0): the unlock toast fires once.
  await page.evaluate(() => { const m = window.__mgbm; for (let k = 4; k <= 100; k++) m.clearSquare(0, -k); m.jump(0, -4, 44); });
  await page.waitForTimeout(250);
  let fs1 = await state(page);
  check(fs1.toast.includes('Unlocked: Frontier Echo'), `toast on reaching ring 100 North: "${fs1.toast}"`);
  const reach = await page.evaluate(() => window.__mgbm.reach());
  check(reach.N >= 100, `reach per direction ${JSON.stringify(reach)}`);
  await page.evaluate(() => { window.__mgbm.clearSquare(0, -101); });
  await page.waitForTimeout(4000); // the first toast (3.5 s) is gone
  await page.evaluate(() => window.__mgbm.clearSquare(1, -101));
  await page.waitForTimeout(200);
  fs1 = await state(page);
  check(!fs1.toast.includes('Unlocked'), 'no second toast for the same threshold');
  await page.evaluate(() => window.__mgbm.openUnlocks());
  await page.waitForTimeout(150);
  const ul = await page.evaluate(() => window.__mgbm.unlocksText());
  check(ul.filter(t => /^Ring \d+$/.test(t)).length === 12 && ul.includes('North  ·  furthest ring 101') && ul.filter(t => t === 'Unlocked').length === 1,
    `Unlocks panel: 12 entries, furthest rings, one unlocked (${ul.filter(t => t.includes('furthest')).join(' | ')})`);
  shots.push(await canvasShot(page)); caps.push('Unlocks panel');
  await page.evaluate(() => window.__mgbm.closeUnlocks());

  // ---- Shop: Random Router can be bought now, Cleaver (ring 25 North) is greyed with its requirement.
  await tap(page, 162, 930); // Shop tab
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.shopScreen, null, { timeout: 5000 });
  const rows = (await state(page)).rows;
  const rowOf = (k) => rows.find(r => r.key === k);
  check(rowOf('frontier_echo').buttons[0].lock === null, 'shop: Frontier Echo (ring 100 North reached) is unlocked');
  check(rowOf('persist').buttons[0].label === 'Pass tier 50' && !rowOf('cleaver').buttons[0].enabled, `shop: Persist greyed "${rowOf('persist').buttons[0].label}"`);
  check(/^Buy/.test(rowOf('overclock').buttons[0].label), 'shop: Overclock (left free) is for sale');
  const before = (await state(page)).credits;
  // Chunk 16b-fix: the Shop is a tile grid; a locked block shows its requirement in the info sheet and has no buy button.
  await page.evaluate(() => window.__mgbm.shopScreen.palette.reveal('persist'));
  await page.waitForTimeout(150);
  const tile = await page.evaluate(() => window.__mgbm.shopScreen.palette.tileScreenRect('persist'));
  await tap(page, tile.x + tile.w / 2, tile.y + tile.h / 2);
  const gate = await page.evaluate(() => { const p = window.__mgbm.shopScreen.palette; return { c: p.sheetContentNow, buy: p.sheetButtonVisible('buy'), up: p.sheetButtonVisible('upgrade') }; });
  const afterTap = await state(page);
  check(gate.c && gate.c.lockText === 'Pass tier 50' && !gate.buy && !gate.up && afterTap.credits === before, `tapping it shows "${gate.c && gate.c.lockText}", offers no buy / upgrade and buys nothing`);
  shots.push(await canvasShot(page)); caps.push('shop: gated blocks');

  // ---- Play a Free Fly square to a result (time x6, a real ship that only drifts a little), then back.
  await tap(page, 486, 930); await waitScreen(page, 'map');
  await page.evaluate(() => window.__mgbm.openFrontier()); await waitScreen(page, 'frontier');
  const ffq = census.ffAvailable;
  await page.evaluate((q) => { window.__mgbm.select(q.x, q.y); }, ffq);
  const camBefore = (await state(page)).camera;
  const sqBefore = (await state(page)).sq[ffq.x + ',' + ffq.y];
  await tap(page, 451, 864); // PLAY
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'fly', null, { timeout: 8000 });
  let fly = await state(page);
  check(fly.encounter && fly.encounter.duration === 60 && fly.hud.wave.includes('survive'), `Free Fly square starts an encounter: "${fly.hud.tier}" / "${fly.hud.wave}"`);
  const c = await gameToClient(page, 270, 820);
  await page.mouse.move(c.x, c.y);
  await page.mouse.move(c.x + 30, c.y, { steps: 4 });
  await page.evaluate(() => window.__mgbm.setTimeScale(6));
  await page.waitForTimeout(1500);
  fly = await state(page);
  check(fly.enemies.length > 0 && fly.time > 2, `enemies present from the start (${fly.enemies.length} at ${fly.time.toFixed(1)} s)`);
  shots.push(await canvasShot(page)); caps.push(`encounter HUD (${fly.time.toFixed(0)} s)`);
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'summary', null, { timeout: 30000 });
  await page.evaluate(() => { window.__mgbmSm && 0; });
  const sum = await state(page);
  await page.evaluate(() => {});
  const t = sum.result.time;
  const expect = t >= 60 - 1e-6 ? 'cleared' : t >= 30 ? 'passed' : 'failed';
  check(sum.wall.result === expect && sum.title.toLowerCase().includes(expect), `result "${sum.title}" after ${t.toFixed(1)} s matches the rule (${expect})`);
  shots.push(await canvasShot(page)); caps.push(`result: ${sum.title}`);
  // Back to the Frontier (the x6 time scale only speeds up the map's redraws from here on).
  await tap(page, 100, 672);
  await waitScreen(page, 'frontier');
  await page.waitForTimeout(200);
  const back = await state(page);
  const want = expect === 'cleared' ? 2 : expect === 'passed' ? 1 : sqBefore;
  check(back.sq[ffq.x + ',' + ffq.y] === want, `square ${ffq.x},${ffq.y} is now ${want === 2 ? 'cleared' : want === 1 ? 'passed' : 'unchanged'}`);
  check(back.camera.cx === camBefore.cx && back.camera.cy === camBefore.cy && back.selected.x === ffq.x, 'camera and selection kept');
  shots.push(await canvasShot(page)); caps.push('back on the Frontier');

  const sheet = await montage(page, shots, caps, path.join(OUT, 'sheet_frontier15b.png'));
  check(fs.statSync(sheet).size > 20000, `contact sheet written (${sheet})`);
  const { passes, failures } = lib.counts();
  console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'} (${passes} checks)`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });

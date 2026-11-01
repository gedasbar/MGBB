// Chunk 25a contact sheet (not part of the suite: no .e2e in the name). Needs the Vite dev server. Run: node e2e/sheet-chunk25a.cjs
// Left: the builder's ejector cells (inlets on all four sides; arrow on the exit side from where the signal enters; none without a signal).
// Right: a Fan with three +1 Projectile in a Free Fly flight, zoomed on the ship (tight spread, no marks on the ship).
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
for (const [k, v] of [['debug', 1], ['stats', 0], ['bg', 'off']]) if (!new RegExp(`[?&]${k}=`).test(url)) url += (url.includes('?') ? '&' : '?') + `${k}=${v}`;
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const OUT = path.join(__dirname, '..', 'reports', 'chunk25a');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log('page error', err.message));
  await page.addInitScript(() => { if (!sessionStorage.getItem('__c')) { localStorage.clear(); sessionStorage.setItem('__c', '1'); } });
  await page.goto(lib.URL);
  await page.waitForFunction(() => !!window.__mgbmSm, null, { timeout: 10000 });
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });

  // 1. Builder ejector cells on a hand-made 11 x 9 board: entered from the left, above, below and the right, plus one with no signal.
  await page.evaluate(async () => {
    const { GridRenderer } = await import('/src/builder/gridView.ts');
    const { parseLayout } = await import('/src/game/gridUtils.ts');
    const { compile } = await import('/src/engine/compiler.ts');
    const { fitView } = await import('/src/builder/layout.ts');
    const g = parseLayout(new Array(9).fill('_'.repeat(11)));
    const fix = (x, y, type, facing) => { const c = g.cells[y * g.w + x]; c.type = type; c.facing = facing; };
    fix(1, 1, 'generator', 'E'); fix(4, 1, 'ejector', 'N');
    fix(7, 1, 'generator', 'S'); fix(7, 4, 'ejector', 'N');
    fix(2, 7, 'generator', 'N'); fix(2, 4, 'ejector', 'N');
    fix(10, 7, 'generator', 'W'); fix(6, 7, 'ejector', 'N');
    fix(5, 5, 'ejector', 'N');
    const r = new GridRenderer();
    const Graphics = r.cellsG.constructor;
    const root = new (window.__mgbmSm.app.stage.constructor)();
    root.addChild(new Graphics().rect(0, 0, 540, 960).fill(0x1c1c1e));
    root.addChild(r.container);
    r.setView(fitView(g.w, g.h));
    r.render(g, compile(g), { selected: null });
    window.__sheetRoot = root;
    window.__mgbmSm.app.stage.addChild(root);
  });
  await page.waitForTimeout(500);
  const builder = await page.screenshot({ clip: { x: 0, y: 150, width: 540, height: 540 } });
  fs.writeFileSync(path.join(OUT, 'builder.png'), builder);
  await page.evaluate(() => { window.__mgbmSm.app.stage.removeChild(window.__sheetRoot); });

  // 2. A flight with many shots: Fan + 3 x +1 Projectile on the middle lane.
  await page.evaluate(async () => {
    const { buildFanGrid } = await import('/src/game/gridUtils.ts');
    const { place } = await import('/src/game/starter.ts');
    const { FlyScreen } = await import('/src/screens/FlyScreen.ts');
    const g = buildFanGrid();
    place(g, 5, 9, 'flat_plus');
    for (let k = 0; k < 3; k++) place(g, 5, 8 - k, 'plus_one');
    const sm = window.__mgbmSm;
    sm.switchTo(new FlyScreen(sm, g, {}));
  });
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'fly', null, { timeout: 8000 });
  await page.mouse.move(270, 820); await page.mouse.move(272, 822);
  await page.waitForTimeout(1200);
  const fly = await page.screenshot({ clip: { x: 170, y: 560, width: 200, height: 400 } });
  fs.writeFileSync(path.join(OUT, 'flight.png'), fly);

  const b64 = await page.evaluate(async ({ a, b }) => {
    const load = async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; };
    const A = await load(a), B = await load(b);
    const c = document.createElement('canvas');
    c.width = A.width + B.width + 30; c.height = Math.max(A.height, B.height) + 60;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(A, 10, 10); ctx.drawImage(B, A.width + 20, 10);
    ctx.fillStyle = '#ccc'; ctx.font = '22px monospace';
    ctx.fillText('builder: ejectors entered from left / above / below / right, last one has no signal', 10, c.height - 24);
    ctx.fillText('flight: Fan + 3x +1 Projectile', A.width + 20, c.height - 24);
    return c.toDataURL('image/png').split(',')[1];
  }, { a: builder.toString('base64'), b: fly.toString('base64') });
  fs.writeFileSync(path.join(OUT, 'sheet_25a.png'), Buffer.from(b64, 'base64'));
  console.log('written', path.join(OUT, 'sheet_25a.png'));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

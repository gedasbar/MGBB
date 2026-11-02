// Chunk 25c contact sheet (not part of the suite: no .e2e in the name). Needs the Vite dev server. Run: node e2e/sheet-chunk25c.cjs
// Top: all 19 hulls in ladder order at picker size (56 px tall) with names, on the picker's grey. Middle: the same ships at flight
// size on the game's galaxy background. Bottom: the three Zenith options at 3x. Writes reports/chunk25c/ship-sheet.png.
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
for (const [k, v] of [['debug', 1], ['stats', 0], ['bg', 'galaxy']]) if (!new RegExp(`[?&]${k}=`).test(url)) url += (url.includes('?') ? '&' : '?') + `${k}=${v}`;
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const OUT = path.join(__dirname, '..', 'reports', 'chunk25c');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 3 });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log('page error', err.message));
  await page.addInitScript(() => { if (!sessionStorage.getItem('__c')) { localStorage.clear(); sessionStorage.setItem('__c', '1'); } });
  await page.goto(lib.URL);
  await page.waitForFunction(() => !!window.__mgbmSm, null, { timeout: 10000 });
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });

  await page.evaluate(async () => {
    const { Container, Graphics, Text, Sprite } = window.__pixi;
    const { shipThumbnail, getShipTexture, getFlameTextures, ShipView } = await import('/src/ui/shipArt.ts');
    const { ZENITH_OPTIONS } = await import('/src/ui/shipShapes.ts');
    const { BackgroundView } = await import('/src/ui/background.ts');
    const { HULL_ORDER, HULLS, SIZE_CLASSES, sizeClassOf } = await import('/src/data/hulls.ts');
    const renderer = window.__mgbmSm.app.renderer;
    const root = new Container();
    root.addChild(new BackgroundView(renderer, 'galaxy').container);
    const label = (s, x, y, size = 11, fill = 0xd4d4d8, anchorX = 0) => { const t = new Text({ text: s, style: { fill, fontSize: size, fontFamily: 'sans-serif' } }); t.anchor.set(anchorX, 0); t.position.set(x, y); root.addChild(t); return t; };

    // 1. picker size, on the picker's grey
    label('Picker size (56 px tall), ladder order', 10, 6, 11, 0xf2c230);
    const COLS = 5, CW = 108, CH = 84, TOP = 24;
    root.addChild(new Graphics().rect(0, TOP - 4, 540, Math.ceil(19 / COLS) * CH + 4).fill(0x1c1c1e));
    HULL_ORDER.forEach((id, i) => {
      const cx = (i % COLS) * CW + CW / 2, cy = TOP + Math.floor(i / COLS) * CH;
      root.addChild(new Graphics().rect(cx - CW / 2 + 3, cy + 1, CW - 6, CH - 4).fill(0x3a3a3e));
      const t = shipThumbnail(renderer, id, 56); t.position.set(cx, cy + 32); root.addChild(t);
      label(HULLS[id].name, cx, cy + 68, 11, 0xd4d4d8, 0.5);
    });

    // 2. flight size on the game background
    let y = TOP + Math.ceil(19 / COLS) * CH + 12;
    label('Flight size (1x), on the game background', 10, y, 11, 0xf2c230);
    y += 18;
    const rows = [HULL_ORDER.slice(0, 10), HULL_ORDER.slice(10)];
    for (const row of rows) {
      const slot = 540 / row.length;
      row.forEach((id, i) => {
        const v = new ShipView(renderer, id); v.setPosition(slot * i + slot / 2, y + 44); root.addChild(v.container);
        label(HULLS[id].name.slice(0, 7), slot * i + slot / 2, y + 84, 8, 0x8a8a90, 0.5);
      });
      y += 100;
    }

    // 3. the three Zenith options at 3x
    label('Zenith options 1, 2, 3 (3x)', 10, y, 11, 0xf2c230);
    y += 18;
    const sc = SIZE_CLASSES.huge;
    for (let n = 0; n < 3; n++) {
      const t = shipThumbnail(renderer, 'zenith', sc.artH * 3, ZENITH_OPTIONS[n]);
      t.position.set(90 + n * 180, y + sc.artH * 1.5 + 6); root.addChild(t);
      label('Option ' + (n + 1), 90 + n * 180, y + sc.artH * 3 * 1.2 + 14, 11, 0xd4d4d8, 0.5);
    }
    window.__mgbmSm.app.stage.addChild(root);
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'ship-sheet.png') });
  await browser.close();
  console.log('wrote', path.join(OUT, 'ship-sheet.png'));
})();

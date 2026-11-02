// Chunk 25b ship art concept sheet (not part of the suite: no .e2e in the name). Needs the Vite dev server. Run: node e2e/sheet-chunk25b.cjs
// 3 styles (columns A, B, C) x 3 hulls (rows Wisp, Halberd, Zenith) on the galaxy background. Per cell: the ship at 3x,
// then at flight size (its size class, 1x) and at picker size (56 px tall, the hull picker's thumbnail).
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
for (const [k, v] of [['debug', 1], ['stats', 0], ['bg', 'galaxy']]) if (!new RegExp(`[?&]${k}=`).test(url)) url += (url.includes('?') ? '&' : '?') + `${k}=${v}`;
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const OUT = path.join(__dirname, '..', 'reports', 'chunk25b');
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
    const { Container, Graphics, Text } = window.__pixi;
    const { drawConceptShip, conceptShip, CONCEPT_HULLS, CONCEPT_STYLES } = await import('/src/ui/shipConcepts.ts');
    const { SIZE_CLASSES, sizeClassOf } = await import('/src/data/hulls.ts');
    const root = new Container();
    root.addChild(new Graphics().rect(0, 0, 540, 960).fill(0x05060a));
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // galaxy look: dark field and white specks
    const stars = new Graphics(); for (let i = 0; i < 140; i++) stars.rect(rnd() * 540, rnd() * 960, rnd() < 0.2 ? 2 : 1, rnd() < 0.2 ? 2 : 1).fill({ color: 0xffffff, alpha: 0.25 + rnd() * 0.5 }); root.addChild(stars);
    const label = (s, x, y, size = 11, fill = 0xd4d4d8) => { const t = new Text({ text: s, style: { fill, fontSize: size, fontFamily: 'sans-serif' } }); t.position.set(x, y); root.addChild(t); };
    label('Ship art concepts (chunk 25b): A hard-edge fighter, B industrial, C silhouette from the layout', 10, 8, 11, 0xf2c230);
    label('per cell: 3x zoom | flight size 1x | picker size (56 px tall)', 10, 24, 10, 0x8a8a90);
    const COL = 180, PICKER = 56, ZOOM = 3;
    let y = 50;
    for (const hull of CONCEPT_HULLS) {
      const sc = SIZE_CLASSES[sizeClassOf(hull)];
      const flameGap = 0.16 * sc.artH * ZOOM;
      const rowH = sc.artH * ZOOM + flameGap + 14 + PICKER + 18;
      CONCEPT_STYLES.forEach((style, i) => {
        const ship = conceptShip(hull, style);
        const x0 = i * COL;
        label(`${style}  ${hull}`, x0 + 10, y, 11, 0xf2c230);
        const zg = new Graphics(); drawConceptShip(zg, ship, sc.artW * ZOOM, sc.artH * ZOOM);
        zg.position.set(x0 + (COL - sc.artW * ZOOM) / 2, y + 16); root.addChild(zg);
        const by = y + 16 + sc.artH * ZOOM + flameGap + 14;
        const fg = new Graphics(); drawConceptShip(fg, ship, sc.artW, sc.artH);
        fg.position.set(x0 + 40, by); root.addChild(fg);
        const pw = PICKER * (sc.artW / sc.artH);
        const pg = new Graphics(); drawConceptShip(pg, ship, pw, PICKER);
        pg.position.set(x0 + 100, by); root.addChild(pg);
      });
      y += rowH + 22;
    }
    window.__sheetRoot = root;
    window.__mgbmSm.app.stage.addChild(root);
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'concept-sheet.png') });
  await browser.close();
  console.log('wrote', path.join(OUT, 'concept-sheet.png'));
})();

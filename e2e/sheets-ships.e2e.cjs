// Contact sheet of all 19 hulls (chunk 17a): in-game size (1x) and 2x on the dark background, with the size class under each name.
// Run: GAME_URL=http://localhost:PORT node e2e/sheets-ships.e2e.cjs (dev server up). Writes reports/chunk17a/sheet_hulls.png
const path = require('path');
const lib = require('./lib.cjs');
const { renderSheet } = require('./sheet.cjs');
const OUT = path.join(__dirname, '..', 'reports', 'chunk17a');

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: false, dart: true });
  const src = `async ({ PIXI, app, load }) => {
    const { ShipView } = await load('/src/ui/shipArt.ts');
    const { HULL_ORDER, HULLS } = await load('/src/data/hulls.ts');
    const root = new PIXI.Container();
    const label = (t, x, y) => { const s = new PIXI.Text({ text: t, style: { fill: 0x8a8a90, fontSize: 12, fontFamily: 'monospace' } }); s.position.set(x, y); root.addChild(s); };
    const PER_ROW = 10, COL = 130;
    HULL_ORDER.forEach((id, i) => {
      const col = i % PER_ROW, row = Math.floor(i / PER_ROW);
      const x = 70 + col * COL, y0 = row * 250;
      label((i + 1) + ' ' + HULLS[id].name, x - 50, y0 + 6);
      label(HULLS[id].size, x - 50, y0 + 22);
      const v1 = new ShipView(app.renderer, id, [{ x: 0, y: -3.5, dir: 'N' }]);
      v1.setPosition(x, y0 + 70); root.addChild(v1.container);
      const v2 = new ShipView(app.renderer, id, []);
      v2.container.scale.set(2);
      v2.setPosition(x, y0 + 170); root.addChild(v2.container);
    });
    label('1x', 4, 66);
    return { container: root, width: 1330, height: 500, bg: 0x111111 };
  }`;
  const f = await renderSheet(page, src, path.join(OUT, 'sheet_hulls.png'));
  console.log('wrote', f);
  await browser.close();
})();

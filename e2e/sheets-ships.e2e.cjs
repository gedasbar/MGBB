// Contact sheet of the five hulls at 1x and 3x on the dark background. Run: node e2e/sheets-ships.e2e.cjs (dev server up)
const path = require('path');
const lib = require('./lib.cjs');
const { renderSheet } = require('./sheet.cjs');
const OUT = path.join(__dirname, '..', 'reports', 'chunk8a');

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: false, dart: true });
  const src = `async ({ PIXI, app, load }) => {
    const { ShipView, SHIP_ART } = await load('/src/ui/shipArt.ts');
    const ids = ['dart', 'twin', 'prong', 'fan', 'shuttle'];
    const root = new PIXI.Container();
    const label = (t, x, y) => { const s = new PIXI.Text({ text: t, style: { fill: 0x8a8a90, fontSize: 11, fontFamily: 'monospace' } }); s.position.set(x, y); root.addChild(s); };
    ids.forEach((id, i) => {
      const x = 60 + i * 110;
      label(id, x - 14, 6);
      // 1x: the real in-game size, one muzzle tick at the ejector offset of a Shuttle-like gun
      const v1 = new ShipView(app.renderer, id, [{ x: 0, y: -3.5, dir: 'N' }]);
      v1.setPosition(x, 50); root.addChild(v1.container);
      // 3x
      const v3 = new ShipView(app.renderer, id, [{ x: 0, y: -3.5, dir: 'N' }]);
      v3.container.scale.set(3);
      v3.setPosition(x, 150); root.addChild(v3.container);
    });
    label('1x', 4, 40); label('3x', 4, 140);
    return { container: root, width: 580, height: 210, bg: 0x111111 };
  }`;
  const f = await renderSheet(page, src, path.join(OUT, 'sheet_ships.png'));
  console.log('wrote', f);
  await browser.close();
})();

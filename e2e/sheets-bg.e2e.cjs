// Contact sheet: the six backgrounds in a 3 x 2 grid with a ship, blocks and rocks on top. Run: node e2e/sheets-bg.e2e.cjs
const path = require('path');
const lib = require('./lib.cjs');
const { renderSheet } = require('./sheet.cjs');
const OUT = path.join(__dirname, '..', 'reports', 'chunk8a');

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: false, dart: true });
  const src = `async ({ PIXI, app, load }) => {
    const { BackgroundView, BACKGROUND_IDS } = await load('/src/ui/background.ts');
    const { ShipView } = await load('/src/ui/shipArt.ts');
    const { RockView } = await load('/src/ui/rockArt.ts');
    const root = new PIXI.Container();
    const W = 270, H = 480;   // each cell is the fly screen at half size
    BACKGROUND_IDS.forEach((id, i) => {
      const cell = new PIXI.Container();
      const bg = new BackgroundView(app.renderer, id);
      bg.update(1, 60, 0);   // one second of scroll so the layers are offset a little
      cell.addChild(bg.container);
      // a few blocks like the wall, rocks, and the ship
      const blocks = new PIXI.Graphics();
      for (let c = 0; c < 5; c++) blocks.rect(c * 54 + 1, 20, 52, 52).fill(0x55555a).rect(c * 54 + 5, 24, 44, 44).fill(0x26262a).rect(c * 54 + 14, 33, 26, 26).fill(0x6fbf73);
      cell.addChild(blocks);
      [[70, 150, 11], [180, 210, 4], [110, 290, 26], [220, 330, 3]].forEach(([x, y, rid]) => {
        const r = new RockView('mitotic_rock', rid, 20); r.update(rid % 2 ? 0.4 : 0, 0.02, false); r.container.position.set(x, y); cell.addChild(r.container);
      });
      const ship = new ShipView(app.renderer, 'twin', [{ x: 0, y: -3.5, dir: 'N' }]); ship.setPosition(135, 420); cell.addChild(ship.container);
      const label = new PIXI.Text({ text: id, style: { fill: 0x8a8a90, fontSize: 11, fontFamily: 'monospace' } }); label.position.set(6, H - 18); cell.addChild(label);
      const mask = new PIXI.Graphics().rect(0, 0, 540, 960).fill(0xffffff); mask.scale.set(0.5);
      cell.scale.set(0.5);
      cell.position.set((i % 3) * (W + 6), Math.floor(i / 3) * (H + 6));
      root.addChild(cell);
    });
    return { container: root, width: 3 * (W + 6), height: 2 * (H + 6), bg: 0x222222 };
  }`;
  console.log('wrote', await renderSheet(page, src, path.join(OUT, 'sheet_backgrounds.png')));
  await browser.close();
})();

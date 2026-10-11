// Contact sheet of the rock enemies: damage stages, a split burst, three shapes. Run: node e2e/sheets-rocks.e2e.cjs (dev server up)
const path = require('path');
const lib = require('./lib.cjs');
const { renderSheet } = require('./sheet.cjs');
const OUT = path.join(__dirname, '..', 'reports', 'chunk8a');

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: false, dart: true });
  const src = `async ({ PIXI, app, load }) => {
    const { RockView, FragmentPool, ENEMY_ART } = await load('/src/ui/rockArt.ts');
    const root = new PIXI.Container();
    const label = (t, x, y) => { const s = new PIXI.Text({ text: t, style: { fill: 0x8a8a90, fontSize: 11, fontFamily: 'monospace' } }); s.position.set(x, y); root.addChild(s); };
    const R = 34;
    // row 1: one rock at damage 0 / 30 / 60 / 90 %
    [0, 0.3, 0.6, 0.9].forEach((d, i) => {
      const v = new RockView('mitotic_rock', 7, R);
      for (let k = 0; k < 20; k++) v.update(d, 0.02, false);
      v.container.position.set(70 + i * 120, 70);
      root.addChild(v.container);
      label('damage ' + Math.round(d * 100) + '%', 30 + i * 120, 118);
    });
    // row 2: the split burst 0.12 s after the split (and the same rock, hit flash on)
    const fp = new FragmentPool(); root.addChild(fp.container);
    fp.emit(70, 200, R, 7, ENEMY_ART.mitotic_rock); fp.update(0.12);
    label('split +0.12 s', 24, 248);
    const fp2 = new FragmentPool(); root.addChild(fp2.container);
    fp2.emit(190, 200, R, 19, ENEMY_ART.mitotic_rock); fp2.update(0.2);
    label('split +0.20 s', 144, 248);
    const fl = new RockView('mitotic_rock', 7, R); fl.update(0.3, 0.02, true); fl.container.position.set(310, 200); root.addChild(fl.container);
    label('hit flash', 280, 248);
    // row 3: three different rocks at 60% damage
    [3, 11, 26].forEach((id, i) => {
      const v = new RockView('mitotic_rock', id, R);
      for (let k = 0; k < 20; k++) v.update(0.6, 0.02, false);
      v.container.position.set(70 + i * 120, 330);
      root.addChild(v.container);
      label('id ' + id, 50 + i * 120, 378);
    });
    return { container: root, width: 520, height: 400, bg: 0x111111 };
  }`;
  console.log('wrote', await renderSheet(page, src, path.join(OUT, 'sheet_rocks.png')));
  await browser.close();
})();

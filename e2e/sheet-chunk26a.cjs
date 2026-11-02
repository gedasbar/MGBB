// Chunk 26a contact sheet (not part of the suite). Needs the Vite dev server. Run: GAME_URL=http://localhost:5290/ node e2e/sheet-chunk26a.cjs
// Starts the real wall screen (tier 1, bg off), then sets the max HP of the blocks to one band per wall (1: under 100 ... 5: 100K+) and a mixed
// wall (the bands in columns, some blocks damaged, one armored, one shielded), takes one screenshot of each and puts them side by side in
// reports/chunk26a/wall-colours.png.
const path = require('path');
const fs = require('fs');
const lib = require('./lib.cjs');
const OUT = path.join(__dirname, '..', 'reports', 'chunk26a');
fs.mkdirSync(OUT, { recursive: true });
const BAND_HP = [40, 400, 4000, 40000, 400000];

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 900, height: 960 }, rich: false });
  await page.fill('#dbg-wall-tier', '1');
  await page.fill('#dbg-wall-rows', '8');
  await page.mouse.move(10, 10);
  await page.evaluate(() => document.getElementById('dbg-wall-start').click());
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'wall', null, { timeout: 5000 });
  const shots = [];
  const canvas = page.locator('canvas');
  const freeze = () => page.evaluate(() => { const w = window.__mgbm.wall; w.setWallOffset(520); window.__mgbm.timeScale = 0.0001; });
  await freeze();
  const names = ['under 100', '100-999', '1K-9.9K', '10K-99K', '100K+', 'mixed'];
  for (let k = 0; k < 6; k++) {
    await page.evaluate(({ k, BAND_HP }) => {
      const w = window.__mgbm.wall;
      w.blocks.forEach((b, i) => {
        if (!b) return;
        const band = k < 5 ? k : b.col % 5;
        b.maxHp = BAND_HP[band];
        b.hp = k < 5 ? b.maxHp : b.maxHp * (((b.row + b.col) % 3 === 0) ? 0.35 : 1);
        b.armor = 0; b.shield = 0; b.maxShield = 0;
        if (k === 5 && b.row === 2 && b.col % 2 === 0) { b.armor = 3; b.armor0 = 3; }
        if (k === 5 && b.row === 4 && b.col % 2 === 1) { b.maxShield = 10; b.shield = 6; }
      });
    }, { k, BAND_HP });
    await page.waitForTimeout(300);
    shots.push((await canvas.screenshot()).toString('base64'));
  }
  const sheet = await browser.newPage({ viewport: { width: 1920, height: 760 } });
  await sheet.setContent(`<body style="margin:0;background:#111;display:flex;gap:6px;flex-wrap:nowrap;font:14px sans-serif;color:#eee">${shots.map((s, i) => `<div><div style="padding:3px">${names[i]}</div><img style="width:315px;height:560px;object-fit:cover;object-position:top" src="data:image/png;base64,${s}"></div>`).join('')}</body>`);
  await sheet.screenshot({ path: path.join(OUT, 'wall-colours.png') });
  for (let k = 0; k < 6; k++) fs.writeFileSync(path.join(OUT, `wall-${k}.png`), Buffer.from(shots[k], 'base64'));
  await browser.close();
})();

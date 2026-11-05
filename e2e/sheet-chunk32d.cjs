// Chunk 32d contact sheet (not part of the suite). Needs the Vite dev server. Run: GAME_URL=http://localhost:5292/ node e2e/sheet-chunk32d.cjs
// Draws with the game's own modules (reports/chunk32d/sheet_art.png): the four bosses at full HP and 55% damaged (Swarm Queen next to a swarm Darter, Colossus in steel),
// and the HUD icons / Cores colour / hull bar. The in-game frame of the new HUD and boss bar is reports/chunk32b/sheet_bosses.png (freefly-bosses e2e).
const path = require('path');
const lib = require('./lib.cjs');
const { renderSheet } = require('./sheet.cjs');
const OUT = path.join(__dirname, '..', 'reports', 'chunk32d');

const sheet = `async ({ PIXI, app, load }) => {
  const { BossView } = await load('/src/ui/bossArt.ts');
  const { BOSS_BY_ID, BASTION } = await load('/src/data/bosses.ts');
  const { RockView } = await load('/src/ui/rockArt.ts');
  const { SPECIES } = await load('/src/data/species.ts');
  const { coresIcon, creditIcon, wrenchIcon } = await load('/src/ui/icons.ts');
  const { UI } = await load('/src/ui/theme.ts');
  const root = new PIXI.Container();
  const label = (t, x, y, size = 11, color = 0x9a9aa0) => { const s = new PIXI.Text({ text: t, style: { fill: color, fontSize: size, fontFamily: 'monospace' } }); s.anchor.set(0.5, 0); s.position.set(x, y); root.addChild(s); };
  const ids = ['hive', 'bastion', 'queen', 'colossus'];
  ids.forEach((id, i) => {
    [1, 0.45].forEach((fraction, j) => {
      const x = 90 + i * 170, y = 110 + j * 200;
      const plates = [];
      if (id === 'bastion') for (let k = 0; k < 10; k++) { const a = k * 0.6; plates.push({ x: x + Math.cos(a) * BASTION.ringR * 0.7, y: y + Math.sin(a) * BASTION.ringR * 0.7, hp: 1 }); }
      const boss = { def: BOSS_BY_ID[id], anchorX: x, anchorY: y, fraction, hp: fraction, enraged: false, coreOpen: i === 0 && j === 1, plates };
      const v = new BossView(); v.update(boss, 0.02); v.update(boss, 0.2);
      root.addChild(v.container);
    });
    label(BOSS_BY_ID[id].name, 90 + i * 170, 20, 12, 0xd4d4d8);
  });
  // Queen's escorts: the darters of the swarm, at the size the boss uses.
  for (let k = 0; k < 3; k++) { const r = new RockView('darter', 3 + k, 11 * 2.2); for (let q = 0; q < 10; q++) r.update(0, 0.02, false); r.container.position.set(340 + k * 36, 232); root.addChild(r.container); }
  label('swarm darters', 376, 255, 10);
  label('ICONS', 120, 440, 13, 0xd4d4d8);
  const put = (g, x, y) => { g.position.set(x, y); root.addChild(g); };
  put(creditIcon(28), 40, 470); put(coresIcon(28), 100, 470); put(wrenchIcon(28), 160, 470);
  put(creditIcon(14), 40, 520); put(coresIcon(14), 100, 520); put(wrenchIcon(14), 160, 520);
  const bar = (x, y, f) => { const g = new PIXI.Graphics().rect(0, 0, 100, 10).fill(0x3a3a3e).rect(0, 0, 100 * f, 10).fill(0xd4d4d8); g.position.set(x, y); root.addChild(g); };
  bar(230, 480, 1); bar(230, 505, 0.6); bar(230, 530, 0.2);
  return { container: root, width: 700, height: 570, bg: 0x111111 };
}`;

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: false });
  const file = await renderSheet(page, sheet, path.join(OUT, 'sheet_art.png'));
  console.log('wrote', file);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

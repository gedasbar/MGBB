// Chunk 32a contact sheet (not part of the suite). Needs the Vite dev server. Run: GAME_URL=http://localhost:5292/ node e2e/sheet-chunk32a.cjs
// Draws with the game's own modules (reports/chunk32a/sheet_enemies.png): the three new enemies next to a Rock, a Warden and an Ironclad
// (whole and 60 % damaged), the enemy bullet at its real size and enlarged beside every player shot look, and the bullet on every background.
// The in-game frames (bullets in flight, links, theme banner) are written by e2e/freefly-enemies.e2e.cjs (sheet_ingame.png).
const path = require('path');
const lib = require('./lib.cjs');
const { renderSheet } = require('./sheet.cjs');
const OUT = path.join(__dirname, '..', 'reports', 'chunk32a');

const sheet = `async ({ PIXI, app, load }) => {
  const { RockView, FragmentPool, ENEMY_ART } = await load('/src/ui/rockArt.ts');
  const { SPECIES } = await load('/src/data/species.ts');
  const { enemyBulletTexture } = await load('/src/ui/enemyBulletSprites.ts');
  const { SHOT_LOOKS } = await load('/src/ui/shotLook.ts');
  const { shotTextures } = await load('/src/ui/shotTextures.ts');
  const { BackgroundView, BACKGROUND_IDS } = await load('/src/ui/background.ts');
  const { ENEMY_BULLET_LOOK } = await load('/src/data/enemyBullets.ts');
  const root = new PIXI.Container();
  const label = (t, x, y, size = 11, color = 0x9a9aa0) => { const s = new PIXI.Text({ text: t, style: { fill: color, fontSize: size, fontFamily: 'monospace' } }); s.anchor.set(0.5, 0); s.position.set(x, y); root.addChild(s); };
  const K = 2.1;
  const rock = (id, seed, x, y, dmg) => {
    const v = new RockView(id, seed, SPECIES[id].radius * K);
    for (let k = 0; k < 20; k++) v.update(dmg, 0.02, false);
    v.container.position.set(x, y); root.addChild(v.container); return v;
  };
  label('NEW ENEMIES (rock art language), whole and 60 % damaged', 330, 6, 13, 0xd4d4d8);
  const ids = ['mitotic_rock', 'warden', 'ironclad', 'gunner', 'shielder', 'leech'];
  const names = ['Rock', 'Warden', 'Ironclad', 'GUNNER', 'SHIELDER', 'LEECH'];
  ids.forEach((id, i) => {
    const x = 60 + i * 105;
    rock(id, 5 + i, x, 80, 0);
    rock(id, 9 + i, x, 190, 0.6);
    label(names[i], x, 128, 11, i >= 3 ? 0xf2c230 : 0x9a9aa0);
  });
  // The Shielder's ring, a link and its protected body, the Leech's thread, drawn with the real function.
  const { drawSupportLinks } = await load('/src/ui/supportLinks.ts');
  const g = new PIXI.Graphics(); root.addChild(g);
  const sh = rock('shielder', 21, 120, 330, 0), a = rock('mitotic_rock', 22, 60, 410, 0), b = rock('mitotic_rock', 23, 190, 400, 0.3);
  const lc = rock('leech', 24, 440, 330, 0), c = rock('mitotic_rock', 25, 500, 420, 0.5);
  drawSupportLinks(g, [
    { kind: 'shield', id: 1, ax: 120, ay: 330, bx: 60, by: 410, r: SPECIES.mitotic_rock.radius * K },
    { kind: 'shield', id: 2, ax: 120, ay: 330, bx: 190, by: 400, r: SPECIES.mitotic_rock.radius * K },
    { kind: 'leech', id: 3, ax: 440, ay: 330, bx: 500, by: 420, r: 20 },
  ], 0.4);
  label('Shielder links (cyan line + ring)', 130, 440); label('Leech thread (rose, dashed)', 470, 440);
  // The bullet: real size (14 px) and 6x, next to every player look; then on every background.
  const tex = enemyBulletTexture(app), pt = shotTextures(app);
  label('ENEMY BULLET vs PLAYER SHOTS (real size, then 4x)', 330, 470, 13, 0xd4d4d8);
  const place = (t, w, h, x, y, tint, k) => { const s = new PIXI.Sprite(t); s.anchor.set(0.5); s.width = w * k; s.height = h * k; if (tint !== undefined) s.tint = tint; s.position.set(x, y); root.addChild(s); };
  const row = (k, y) => {
    place(tex, ENEMY_BULLET_LOOK.size, ENEMY_BULLET_LOOK.size, 60, y, undefined, k);
    SHOT_LOOKS.forEach((l, i) => place(pt[l.shape], l.w, l.h, 150 + i * 80, y, l.color, k));
  };
  row(1, 520); row(4, 620);
  label('bullet', 60, 700); ['<10', '10-99', '100-999', '1K-9.9K', '10K+'].forEach((t, i) => label(t, 150 + i * 80, 700));
  // On every background: a bullet (and a cyan player shot) over each one.
  label('ON EVERY BACKGROUND (bullet x3)', 330, 730, 13, 0xd4d4d8);
  BACKGROUND_IDS.forEach((id, i) => {
    const x = 20 + (i % 4) * 155, y = 760 + Math.floor(i / 4) * 100;
    const bg = new BackgroundView(app.renderer, id, 140, 90);
    bg.update(1, 60);
    const box = new PIXI.Container(); box.position.set(x, y); box.addChild(bg.container);
    const m = new PIXI.Graphics().rect(0, 0, 140, 90).fill(0xffffff); box.addChild(m); box.mask = m;
    root.addChild(box);
    place(tex, 14, 14, x + 45, y + 45, undefined, 3);
    place(pt.bar, 4, 14, x + 100, y + 45, 0x00ffff, 1.5);
    label(id, x + 70, y + 92, 9);
  });
  return { container: root, width: 660, height: 980, bg: 0x111111 };
}`;

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: false });
  const file = await renderSheet(page, sheet, path.join(OUT, 'sheet_enemies.png'));
  console.log('wrote', file);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

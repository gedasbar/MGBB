// Chunk 24a contact sheet (not part of the suite: no .e2e in the name). Needs the Vite dev server. Run: node e2e/sheet-chunk24a.cjs
// One montage: the run HUD (campaign spike tier, Frontier wall, Frontier Free Fly square) at 360 x 740 and the campaign / Frontier wall HUD on a
// tall phone (390 x 844), the run summary with an "Unlocked" line, the Shop with NEW marks and a dot on its tab, Settings with time played and the touch setting.
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
for (const [k, v] of [['debug', 1], ['stats', 0], ['bg', 'off']]) if (!new RegExp(`[?&]${k}=`).test(url)) url += (url.includes('?') ? '&' : '?') + `${k}=${v}`;
process.env.GAME_URL = url;
const lib = require('./lib.cjs');

const OUT = path.join(__dirname, '..', 'reports', 'chunk24a');
fs.mkdirSync(OUT, { recursive: true });

async function montage(page, shots, captions, file, cols, cell) {
  const b64 = await page.evaluate(async ({ shots, captions, cols, cell }) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
    const pad = 10, cap = 46;
    const rows = Math.ceil(imgs.length / cols);
    const c = document.createElement('canvas');
    c.width = cols * (cell.w + pad) + pad;
    c.height = rows * (cell.h + cap + pad) + pad;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => {
      const x = pad + (i % cols) * (cell.w + pad), y = pad + Math.floor(i / cols) * (cell.h + cap + pad);
      const k = Math.min(cell.w / im.width, cell.h / im.height);
      ctx.drawImage(im, x, y, im.width * k, im.height * k);
      ctx.fillStyle = '#ccc'; ctx.font = '13px monospace';
      captions[i].split('\n').forEach((line, j) => ctx.fillText(line, x, y + cell.h + 16 + j * 15));
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { shots: shots.map((b) => b.toString('base64')), captions, cols, cell });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}

const SAVE = JSON.stringify({
  version: 12, credits: 5000, ownedHulls: ['dart', 'twin'], passedTiers: Array.from({ length: 30 }, (_, i) => i + 1), clearedTiers: [1, 2, 3],
  newBlocks: ['turn_l', 'splitter_2', 'flat_plus', 'percent_mult', 'lucky_strike'], timePlayed: 12 * 3600 + 34 * 60 + 5, skillPointsSeen: 0,
  frontier: { seed: 1, sq: { '0,-30': 2 } },
});

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const shots = [], caps = [];
  for (const [vw, vh] of [[360, 740], [390, 844]]) {
    const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', (err) => console.log('page error', err.message));
    await page.addInitScript((save) => {
      if (!sessionStorage.getItem('__cleared')) { localStorage.clear(); localStorage.setItem('mgbm.progress.v1', save); sessionStorage.setItem('__cleared', '1'); }
    }, SAVE);
    await page.goto(lib.URL);
    await page.waitForFunction(() => !!window.__mgbmSm && !!document.getElementById('dbg-start-tier'), null, { timeout: 10000 });
    await page.evaluate(() => { document.getElementById('debug-panel').style.display = 'none'; });
    const grab = async () => { await page.waitForTimeout(500); return page.locator('canvas').screenshot(); };

    // Which Frontier squares: a spike wall, a spike Free Fly square (first found around the origin).
    const found = await page.evaluate(async () => {
      const { squareLevel } = await import('/src/frontier/level.ts');
      const { getWorld } = await import('/src/frontier/world.ts');
      const { FRONTIER_SEED } = await import('/src/frontier/constants.ts');
      const { isSpike } = await import('/src/wall/generator.ts');
      const w = getWorld(FRONTIER_SEED);
      let wall = null, fly = null;
      for (let r = 8; r < 40 && !(wall && fly); r++) for (let x = -r; x <= r; x++) for (const y of [-r, r]) {
        if (w.isHole(x, y)) continue;
        const lv = squareLevel(x, y, FRONTIER_SEED);
        if (lv.kind === 'wall' && lv.spike && !wall) wall = { x, y };
        if (lv.kind === 'freefly' && lv.spike && !fly) fly = { x, y };
      }
      let tier = 1; while (!isSpike(tier) || tier < 6) tier++;
      return { wall, fly, tier };
    });
    const startCampaign = async (tier) => {
      await page.evaluate((tier) => { document.getElementById('dbg-tier-n').value = String(tier); document.getElementById('dbg-start-tier').click(); }, tier);
      await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'wall', null, { timeout: 8000 });
    };
    const startSquare = async (sq, fly) => {
      await page.evaluate(async ({ sq, fly }) => {
        const { squareLevel, frontierLevel } = await import('/src/frontier/level.ts');
        const { FRONTIER_SEED } = await import('/src/frontier/constants.ts');
        const { WallScreen } = await import('/src/screens/WallScreen.ts');
        const { FlyScreen } = await import('/src/screens/FlyScreen.ts');
        const { getBuilderModel } = await import('/src/builder/session.ts');
        const { buildStarterGrid } = await import('/src/game/starter.ts');
        const sm = window.__mgbmSm;
        const model = getBuilderModel();
        const grid = model.compiled.recipes.length > 0 ? model.gridForFlight() : buildStarterGrid();
        const lv = squareLevel(sq.x, sq.y, FRONTIER_SEED);
        if (fly) sm.switchTo(new FlyScreen(sm, grid, { frontier: { x: sq.x, y: sq.y, params: lv.fly, spike: lv.spike, squareTier: lv.tier } }));
        else sm.switchTo(new WallScreen(sm, frontierLevel(lv), grid));
      }, { sq, fly });
    };
    const tag = `${vw}x${vh}`;
    await startCampaign(found.tier);
    shots.push(await grab()); caps.push(`${tag} campaign SPIKE tier ${found.tier}`);
    if (vw === 360) {
      await startSquare(found.wall, false);
      shots.push(await grab()); caps.push(`${tag} Frontier wall (spike)`);
      await startSquare(found.fly, true);
      shots.push(await grab()); caps.push(`${tag} Frontier Free Fly (spike)`);
    } else {
      await startSquare(found.wall, false);
      shots.push(await grab()); caps.push(`${tag} Frontier wall (spike)`);
    }
    if (vw === 360) {
      // Run summary with an Unlocked line
      await page.evaluate(async () => {
        const { RunSummaryScreen } = await import('/src/screens/RunSummaryScreen.ts');
        const sm = window.__mgbmSm;
        sm.switchTo(new RunSummaryScreen(sm, { credits: 4321, kills: 160, time: 74, tier: 9, shots: { bestShot: 480, totalDamage: 90000 } }, { newBestTier: false, newBestTime: false, newBestEarnings: false },
          { result: 'passed', destroyed: 150, total: 160, buttons: [{ id: 'a', label: 'Next tier', onTap() {} }, { id: 'b', label: 'Map', onTap() {} }, { id: 'c', label: 'Build', onTap() {} }] },
          { name: 'Cadet', killsAdded: 150, killsTotal: 1530, medals: 0, doubled: false }, 'Unlocked: Accelerator, Cleaver, +1 skill point'));
      });
      shots.push(await grab()); caps.push(`${tag} run summary with "Unlocked"`);
      // Shop with NEW marks (and the dot on the Shop tab shows on the other screens)
      await page.evaluate(async () => { const { ShopScreen } = await import('/src/screens/ShopScreen.ts'); const sm = window.__mgbmSm; sm.switchTo(new ShopScreen(sm)); });
      shots.push(await grab()); caps.push(`${tag} Shop: NEW marks, dot on the tab`);
      await page.evaluate(async () => { const { BuildScreen } = await import('/src/screens/BuildScreen.ts'); const sm = window.__mgbmSm; sm.switchTo(new BuildScreen(sm)); });
      shots.push(await grab()); caps.push(`${tag} Build: dot on the Shop and Skills tabs`);
      // Settings
      await page.evaluate(() => window.__mgbmSm.overlays.openSettings(false));
      shots.push(await grab()); caps.push(`${tag} Settings: touch control, time played`);
    }
    await context.close();
  }
  const cell = { w: 360, h: 740 };
  await montage(await (await browser.newContext()).newPage(), shots, caps, path.join(OUT, 'sheet_24a.png'), 4, cell);
  console.log('written', path.join(OUT, 'sheet_24a.png'), shots.length, 'shots');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

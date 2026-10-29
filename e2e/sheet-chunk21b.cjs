// Chunk 21b contact sheets (not part of the suite: no .e2e in the name). Needs the Vite dev server.
//   node e2e/sheet-chunk21b.cjs summary    the run summary at 360 x 740 (Free Fly with a captain and Medals, a crashed wall run)
//   node e2e/sheet-chunk21b.cjs shots      the five shot looks side by side in flight, on a dark field with a rock for scale
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
for (const [k, v] of [['stats', 0], ['bg', 'off']]) {
  if (!new RegExp(`[?&]${k}=`).test(url)) url += (url.includes('?') ? '&' : '?') + `${k}=${v}`;
}
process.env.GAME_URL = url;
const lib = require('./lib.cjs');

const OUT = path.join(__dirname, '..', 'reports', 'chunk21b');
fs.mkdirSync(OUT, { recursive: true });
const what = process.argv[2] || 'summary';

async function montage(page, shots, captions, file, cols, cell) {
  const b64 = await page.evaluate(async ({ shots, captions, cols, cell }) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
    const pad = 10, cap = 46;
    const rows = Math.ceil(imgs.length / cols);
    const c = document.createElement('canvas');
    c.width = cols * (cell.w + pad) + pad;
    c.height = rows * (cell.h + cap + pad) + pad;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => {
      const x = pad + (i % cols) * (cell.w + pad), y = pad + Math.floor(i / cols) * (cell.h + cap + pad);
      ctx.drawImage(im, x, y, cell.w, cell.h);
      ctx.fillStyle = '#ccc'; ctx.font = '13px monospace';
      captions[i].split('\n').forEach((line, j) => ctx.fillText(line, x, y + cell.h + 16 + j * 15));
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { shots: shots.map((b) => b.toString('base64')), captions, cols, cell });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  if (what === 'summary') {
    const { page } = await lib.openGame(browser, { viewport: { width: 360, height: 740 }, rich: true });
    const shots = [], caps = [];
    const show = async (args) => {
      await page.evaluate(async (args) => {
        const { RunSummaryScreen } = await import('/src/screens/RunSummaryScreen.ts');
        const sm = window.__mgbmSm;
        if (args.wall) args.wall.buttons = args.wall.buttons.map((x) => ({ ...x}));
        sm.switchTo(new RunSummaryScreen(sm, args.result, args.marks, args.wall, args.captain));
      }, args);
      await page.waitForTimeout(400);
      return page.locator('canvas').screenshot();
    };
    shots.push(await show({
      result: { credits: 123456, kills: 214, time: 187, tier: 9, wave: 5, shots: { bestShot: 1234567, totalDamage: 9.8e9 } },
      marks: { newBestTier: true, newBestTime: true, newBestWave: true, newBestEarnings: true },
      captain: { name: 'Gunner', killsAdded: 214, killsTotal: 1530, medals: 2, doubled: true, note: '+5% pass bonus' },
    }));
    caps.push('Free Fly: 6 rows, Medals, captain line');
    shots.push(await show({
      result: { credits: 4321, kills: 40, time: 31, tier: 3, shots: { bestShot: 52, totalDamage: 1234 } },
      marks: { newBestTier: false, newBestTime: false },
      wall: { result: 'crashed', destroyed: 3, total: 60, buttons: [{ id: 'a', label: 'Retry'}, { id: 'b', label: 'Map'}, { id: 'c', label: 'Build'}] },
    }));
    caps.push('Wall, crashed: 5 rows, 3 buttons');
    shots.push(await show({
      result: { credits: 99, kills: 0, time: 12, tier: 3 },
      marks: { newBestTier: false, newBestTime: false },
      wall: { result: 'cleared', destroyed: 60, total: 60, medal: true, buttons: [{ id: 'a', label: 'Next'}, { id: 'b', label: 'Map'}] },
    }));
    caps.push('Wall, cleared, no shot stats: 3 rows');
    await montage(page, shots, caps, path.join(OUT, 'sheet_summary.png'), 3, { w: 360, h: 640 });
    console.log('wrote reports/chunk21b/sheet_summary.png');
  } else {
    const { page } = await lib.openGame(browser, { viewport: { width: 540, height: 960 }, rich: true });
    // A Free Fly world with no enemies; five shots of the five bands flying side by side, then frozen by pausing the clock.
    await page.evaluate(async () => {
      const { FlyScreen } = await import('/src/screens/FlyScreen.ts');
      const { buildStarterGrid } = await import('/src/game/starter.ts');
      const sm = window.__mgbmSm;
      sm.switchTo(new FlyScreen(sm, buildStarterGrid()));
      const w = sm.currentScreen.world;
      w.autoSpawn = false; w.mitosis.enemies.length = 0; w.god = true; w.hull = 1e9; w.invuln = 1e9;
      w.update = () => {}; // freeze the world: the sheet is a still of shots in flight
      const damages = [5, 50, 500, 5000, 50000];
      damages.forEach((d, k) => {
        for (let j = 0; j < 3; j++) {
          const i = w.pool.spawn(90 + k * 90, 560 - j * 120, 0, -600, d, 0, 0);
          w.pool.size[i] = 1;
        }
      });
      // A rock and a fork copy for scale, and one of each special phase.
      const rock = w.spawnRock(270, 780);
      const fork = w.pool.spawn(450, 780, 0, -600, 5000, 0, 0); w.pool.size[fork] = 0.6;
    });
    await page.waitForTimeout(500);
    const full = await page.locator('canvas').screenshot();
    const box = await page.locator('canvas').boundingBox();
    const crop = await page.screenshot({ clip: { x: box.x, y: box.y + 340, width: 540, height: 480 } });
    await montage(page, [full, crop], ['The five bands in flight (damage 5, 50, 500, 5K, 50K,\nthree shots each, left to right); rock for scale', 'Detail: dash, bar, diamond, bolt, star'], path.join(OUT, 'sheet_shots.png'), 2, { w: 405, h: 720 });
    console.log('wrote reports/chunk21b/sheet_shots.png');
  }
  await browser.close();
})();

// Browser end-to-end checks. Requires the Vite dev server: `npm run dev`.
// Run: node e2e/browser.e2e.cjs   (exits non-zero on any failure)
const lib = require('./lib.cjs');
const { chromium } = require('./lib.cjs');
const path = require('path');
const fs = require('fs');

const URL = process.env.GAME_URL || 'http://localhost:5173';
const OUT = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
function check(cond, msg) {
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'}  ${msg}\n`);
  if (!cond) failures++;
}

async function pixelAt(page, x, y) {
  const png = await page.screenshot({ clip: { x: Math.round(x) - 1, y: Math.round(y) - 1, width: 3, height: 3 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(1, 1, 1, 1).data;
    return [d[0], d[1], d[2]];
  }, png.toString('base64'));
}

async function openGame(browser, viewport) {
  // The game starts on the Build screen: press FLY with the default circuit to reach the Fly screen.
  const { page } = await lib.openGame(browser, { viewport });
  await lib.tap(page, 468, 789);
  await page.waitForFunction(() => !!window.__mgbm && !!window.__mgbm.world);
  await page.waitForTimeout(300);
  return page;
}

async function mouseTest(browser, viewport, label) {
  const page = await openGame(browser, viewport);
  // Remove enemies so contact knockback can't move the ship during the measurement.
  await page.evaluate(() => { window.__mgbm.world.autoSpawn = false; window.__mgbm.world.mitosis.enemies.length = 0; });
  const rect = await page.evaluate(() => {
    const b = document.querySelector('canvas').getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width, height: b.height };
  });
  // Independent conversion (does not call game code): uniform scale + centred letterbox.
  const s = Math.min(rect.width / 540, rect.height / 960);
  const offX = rect.left + (rect.width - 540 * s) / 2;
  const offY = rect.top + (rect.height - 960 * s) / 2;
  const screenPts = [
    [offX + 540 * s * 0.2, offY + 960 * s * 0.75],
    [offX + 540 * s * 0.5, offY + 960 * s * 0.9],
    [offX + 540 * s * 0.8, offY + 960 * s * 0.6],
  ];
  process.stdout.write(`\n[${label}] viewport ${viewport.width}x${viewport.height}, canvas rect ${JSON.stringify(rect)}, scale ${s.toFixed(4)}\n`);
  for (const [sx, sy] of screenPts) {
    await page.mouse.move(sx, sy);
    await page.waitForTimeout(120);
    const st = await page.evaluate(() => window.__mgbm.state());
    const ex = (sx - offX) / s;
    const ey = (sy - offY) / s;
    const err = Math.hypot(st.shipX - ex, st.shipY - ey);
    check(err <= 2, `[${label}] mouse screen (${sx.toFixed(1)}, ${sy.toFixed(1)}) -> expected game (${ex.toFixed(1)}, ${ey.toFixed(1)}), ship (${st.shipX.toFixed(1)}, ${st.shipY.toFixed(1)}), error ${err.toFixed(2)}px`);
    const px = await pixelAt(page, sx, sy);
    check(px[1] > 90 && px[0] < 60 && px[2] < 60, `[${label}] pixel under cursor is ship green (dimmed while it blinks in the spawn grace): rgb(${px.join(',')})`);
  }
  await page.screenshot({ path: path.join(OUT, `mouse_${label}.png`) });
  await page.close();
}

async function combatTest(browser) {
  const page = await openGame(browser, { width: 1280, height: 1000 });
  const box = await page.evaluate(() => {
    const b = document.querySelector('canvas').getBoundingClientRect();
    return { left: b.left, top: b.top, s: b.width / 540 };
  });
  const toScreen = (gx, gy) => [box.left + gx * box.s, box.top + gy * box.s];

  // Clean field, one rock in front of the ship.
  await page.evaluate(() => {
    const w = window.__mgbm.world;
    w.autoSpawn = false;
    w.mitosis.enemies.length = 0;
  });
  await page.mouse.move(...toScreen(270, 800));
  await page.waitForTimeout(100);
  const rockId = await page.evaluate(() => window.__mgbm.world.spawnRock(270, 450).id);

  const st0 = await page.evaluate(() => window.__mgbm.state());
  check(st0.recipes > 0, `compiled recipes in browser: ${st0.recipes}, damage per shot ${JSON.stringify(st0.damagePerShot)}`);

  let lastHp = null; let hitShot = false; let splitShot = false; const hpLog = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 6000 && !splitShot) {
    const st = await page.evaluate(() => window.__mgbm.state());
    const rock = st.enemies.find((e) => e.id === rockId);
    if (rock) {
      // keep ship under the swaying rock
      await page.mouse.move(...toScreen(rock.x - 10.5, 800)); // the Shuttle ejector sits 3 cells (42 px, scaled by 0.25 to 10.5 px) right of the ship centre
      if (lastHp !== null && rock.hp < lastHp) {
        hpLog.push(Math.round(rock.hp));
        if (!hitShot) {
          await page.screenshot({ path: path.join(OUT, 'hit_flash_damage_number.png') });
          hitShot = true;
        }
      }
      lastHp = rock.hp;
    } else if (lastHp !== null) {
      const kids = st.enemies.filter((e) => e.gen === 2);
      await page.screenshot({ path: path.join(OUT, 'split.png') });
      splitShot = true;
      check(kids.length === 2, `rock ${rockId} died; children alive right after death: ${kids.length} (${kids.map((k) => `id${k.id} hp${Math.round(k.hp)}`).join(', ')})`);
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, 'split_after_400ms.png') });
    }
    await page.waitForTimeout(16);
  }
  check(hpLog.length >= 1, `rock HP after each observed hit: ${JSON.stringify(hpLog)} (start 250)`);
  check(hitShot, 'captured hit screenshot');
  check(splitShot, 'captured split screenshot');
  await page.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    await mouseTest(browser, { width: 1600, height: 900 }, 'wide');
    await mouseTest(browser, { width: 400, height: 900 }, 'narrow');
    await combatTest(browser);
  } finally {
    await browser.close();
  }
  process.stdout.write(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'}\n`);
  process.exit(failures === 0 ? 0 : 1);
})();

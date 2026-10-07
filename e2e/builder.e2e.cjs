const { chromium } = require('playwright');
const fs = require('fs');

async function clickGame(page, gx, gy) {
  const box = await page.locator('canvas').boundingBox();
  const s = Math.min(box.width / 540, box.height / 960);
  const cx = box.x + (box.width - 540 * s) / 2 + gx * s;
  const cy = box.y + (box.height - 960 * s) / 2 + gy * s;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.up();
  await page.waitForTimeout(100);
}

function cellPos(cx, cy) {
  return [28 + cx * 44 + 22, 160 + cy * 44 + 22];
}

function palPos(idx) {
  if (idx < 7) return [10 + idx * 70 + 30, 720 + 30];
  return [10 + (idx - 7) * 70 + 30, 790 + 30];
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:5173');
  const canvas = page.locator('canvas');
  await canvas.waitFor();
  await page.waitForTimeout(1000);

  // Clear localStorage
  await page.evaluate(() => { localStorage.clear(); location.reload(); });
  await page.waitForTimeout(1000);

  // Clear All button
  await clickGame(page, 400, 130);

  // 1. Select Flat+ (index 6)
  await clickGame(page, ...palPos(6));
  // Place at (5,6)
  await clickGame(page, ...cellPos(5, 6));

  // 2. Select Splitter 2 (index 3)
  await clickGame(page, ...palPos(3));
  // Place at (5,5)
  await clickGame(page, ...cellPos(5, 5));

  // 3. Select Turn R (index 2)
  await clickGame(page, ...palPos(2));
  // Place at (4,5)
  await clickGame(page, ...cellPos(4, 5));
  // Select it again to rotate
  await clickGame(page, ...cellPos(4, 5));
  // Click Rot CCW (x=245, y=130) once to face North (default is in S out E, CCW makes it in W out N - wait, 1 CCW = in E out S. We need in E out N. 
  // Let's just use evaluate to check rotation, or click CW/CCW.
  // Actually, turn_r is in S out E. Rot 1(CW) = in W out S. Rot 2 = in N out W. Rot 3(CCW) = in E out N.
  // Yes, Rot CCW once makes it in E out N.
  await clickGame(page, 245, 130);

  // 4. Select Turn L (index 1)
  await clickGame(page, ...palPos(1));
  // Place at (6,5)
  await clickGame(page, ...cellPos(6, 5));
  // Select it
  await clickGame(page, ...cellPos(6, 5));
  // Rot CW (x=165, y=130) once to face North.
  // turn_l default: in S out W. CW makes it in W out N.
  await clickGame(page, 165, 130);

  // 5. Select Straight (index 0)
  await clickGame(page, ...palPos(0));
  // Place at (4,4)
  await clickGame(page, ...cellPos(4, 4));
  
  // 6. Select Straight again (index 0)
  await clickGame(page, ...palPos(0));
  // Place at (6,4)
  await clickGame(page, ...cellPos(6, 4));

  // Take screenshot of built circuit
  await page.screenshot({ path: 'artifacts/playwright_built.png' });

  const state1 = await page.evaluate(() => {
    const grid = window.__mgbm.buildScreen.grid;
    const blocks = grid.cells.filter(c => c.blockId).map(c => `${c.x},${c.y}: ${c.blockId} (rot ${c.rotation})`);
    return {
      recipes: window.__mgbm.state().recipes,
      blocks,
      warnings: window.__mgbm.buildScreen.compiled.warnings,
      edges: window.__mgbm.buildScreen.compiled.edges.map(e => `${e.x},${e.y} -> ${e.outDir} (active:${e.active})`)
    };
  });
  console.log('Build State recipes:', state1.recipes);
  console.log('Grid blocks:', state1.blocks);
  console.log('Edges:', state1.edges);
  if (state1.recipes < 2) {
      console.error('Failed to compile 2 streams. Check script.');
      process.exit(1);
  }

  // Click FLY (x=500, y=50)
  await clickGame(page, 500, 50);
  await page.waitForTimeout(1000);

  const state = await page.evaluate(() => window.__mgbm.state());
  console.log('Fly State after flying:', state);
  
  if (state.recipes >= 2 && state.damagePerShot[0] > 1) {
    console.log('SUCCESS: Ship has 2+ projectile streams and damage increased.');
  } else {
    console.error('FAIL: Expected 2+ streams and >1 damage, got', state);
    process.exit(1);
  }

  await browser.close();
}

run().catch(console.error);

// Chunk 10b: the stats panel sits beside the game on a wide window and inside the canvas on a narrow one.
// Needs the Vite dev server. Run: node e2e/stats-side.e2e.cjs
process.env.GAME_URL = (process.env.GAME_URL || 'http://localhost:5173/') + '?stats=1';
const path = require('path');
const fs = require('fs');
const lib = require('./lib.cjs');
const { check } = lib;
const OUT = path.join(__dirname, '..', 'reports', 'chunk10b');
fs.mkdirSync(OUT, { recursive: true });

const probe = (page) => page.evaluate(() => {
  const st = window.__mgbmStats;
  const side = document.getElementById('stats-side');
  const c = document.querySelector('canvas').getBoundingClientRect();
  const r = side && side.getBoundingClientRect();
  return {
    placement: st.placement, canvas: { l: c.left, r: c.right, w: c.width, h: c.height },
    side: r && { l: r.left, r: r.right, w: r.width, shown: getComputedStyle(side).display !== 'none', pe: getComputedStyle(side).pointerEvents, text: side.textContent },
    pixiVisible: st.container.visible, hud: st.hudOffset, shown: st.shown,
  };
});

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { viewport: { width: 1400, height: 960 }, rich: false });
  await page.waitForTimeout(800);
  let p = await probe(page);
  check(p.placement === 'side' && p.side && p.side.shown && p.side.r <= p.canvas.l + 0.5, `wide: side panel [${p.side && p.side.l.toFixed(0)}, ${p.side && p.side.r.toFixed(0)}] left of the canvas [${p.canvas.l.toFixed(0)}, ${p.canvas.r.toFixed(0)}]`);
  check(!p.pixiVisible && p.hud === 0, `wide: the in-canvas plate is hidden and the HUD is not pushed down (hud offset ${p.hud})`);
  check(p.side.pe === 'none' && /FPS \d+/.test(p.side.text) && /kills/.test(p.side.text), `wide: no pointer input, text "${p.side.text.split('\n').slice(0, 2).join(' | ')}"`);
  check(p.canvas.w === 540 && p.canvas.h === 960, `wide: the game keeps its size (${p.canvas.w} x ${p.canvas.h})`);
  await page.screenshot({ path: path.join(OUT, 'stats_side_wide.png') });
  // The same setting toggles it: backtick hides the side plate.
  await page.keyboard.press('Backquote');
  await page.waitForTimeout(100);
  p = await probe(page);
  check(!p.side.shown && !p.pixiVisible, 'backtick hides it (both versions off)');
  await page.keyboard.press('Backquote');
  // Resize to a narrow window: the plate moves into the canvas.
  await page.setViewportSize({ width: 600, height: 960 });
  await page.waitForTimeout(700);
  p = await probe(page);
  check(p.placement === 'canvas' && !p.side.shown && p.pixiVisible && p.hud > 0, `narrow: in-canvas plate shown, side plate hidden, HUD pushed down ${p.hud}`);
  check(/FPS \d+/.test(p.shown), `narrow: canvas text "${p.shown.split('\n')[1]}"`);
  // Back to wide.
  await page.setViewportSize({ width: 1400, height: 960 });
  await page.waitForTimeout(700);
  p = await probe(page);
  check(p.placement === 'side' && p.side.shown && !p.pixiVisible, 'resized back to wide: side panel again');
  const n = await page.evaluate(() => window.__mgbmStats.numbers);
  console.log(`INFO  overhead ${n.overheadMs.toFixed(4)} ms per frame, sim ${n.simMs.toFixed(2)} ms`);
  await browser.close();
  const c = lib.counts();
  console.log(`${c.passes} passed, ${c.failures} failed`);
  process.exit(c.failures ? 1 : 0);
})();

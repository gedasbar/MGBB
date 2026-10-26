// Chunk 15a-fix end-to-end test: the Frontier's neutral square look. Both tile styles ('plate', 'flat') at the default zoom
// with every state on screen, and a far-zoom (5 px a square) crop of each, in one contact sheet
// (reports/chunk15a/sheet_tile_styles.png). Checks by screen pixels that locked and available squares are easy to tell
// apart, and that neither carries a category colour (greys only).
// Needs the Vite dev server. Run: node e2e/frontier-map-fix.e2e.cjs   (adds ?debug=1 itself)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, tap, gameToClient, pixelsAtClient } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk15a');
fs.mkdirSync(OUT, { recursive: true });
const waitScreen = (page, name) => page.waitForFunction((n) => window.__mgbm && window.__mgbm.screen === n, name, { timeout: 8000 });

async function canvasShot(page, clip) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  let b;
  if (clip) {
    const a = await gameToClient(page, clip.x, clip.y);
    const e = await gameToClient(page, clip.x + clip.w, clip.y + clip.h);
    b = await page.screenshot({ clip: { x: a.x, y: a.y, width: e.x - a.x, height: e.y - a.y } });
  } else b = await page.locator('canvas').screenshot();
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
  return b.toString('base64');
}

/** Two full screens (half size) then two far-zoom crops (shown at 2x, no smoothing), captions under each. */
async function montage(page, shots, captions, file) {
  const b64 = await page.evaluate(async ({ shots, captions }) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
    const pad = 8, H = 480;
    const sizes = imgs.map((im) => { const k = H / im.height; return { w: Math.round(im.width * k), h: H }; });
    const c = document.createElement('canvas');
    c.width = sizes.reduce((s, z) => s + z.w + pad, pad); c.height = H + 44;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    let x = pad;
    imgs.forEach((im, i) => {
      ctx.drawImage(im, x, pad, sizes[i].w, sizes[i].h);
      ctx.fillStyle = '#aaa'; ctx.font = '12px monospace';
      ctx.fillText(captions[i], x, H + 30);
      x += sizes[i].w + pad;
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { shots, captions });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
}

const grey = (p) => Math.max(Math.abs(p[0] - p[1]), Math.abs(p[1] - p[2]), Math.abs(p[0] - p[2])) <= 6;
const lum = (p) => (p[0] + p[1] + p[2]) / 3;

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: true });
  await page.evaluate(() => document.getElementById('dbg-fr-unlock').click());
  await tap(page, 486, 930);
  await waitScreen(page, 'map');
  await page.evaluate(() => window.__mgbm.openFrontier());
  await waitScreen(page, 'frontier');

  // States: rings 0..2 cleared; the nearest medal square made available and marked passed (as in frontier15a).
  const pm = await page.evaluate(() => {
    const m = window.__mgbm;
    m.clearRing(2);
    let pm = null;
    for (let r = 3; r <= 12 && !pm; r++) {
      for (let y = -r; y <= r && !pm; y++) for (let x = -r; x <= r && !pm; x++) {
        if (Math.max(Math.abs(x), Math.abs(y)) !== r || !m.hasMedal(x, y)) continue;
        if (m.stateAt(x, y) === 'available') { pm = { x, y }; break; }
        const n = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => ({ x: x + dx, y: y + dy })).find(q => m.stateAt(q.x, q.y) !== 'hole');
        if (n && Math.max(Math.abs(n.x), Math.abs(n.y)) < r) { m.clearSquare(n.x, n.y); pm = { x, y }; }
      }
    }
    m.progress.data.frontier.sq[pm.x + ',' + pm.y] = 1; m.progress.commit();
    return pm;
  });

  /** Screen centres of one square of each state in view, plus a hole and a spike square. */
  const samples = () => page.evaluate((pm) => {
    const m = window.__mgbm;
    const s = m.state().camera;
    const out = {};
    const R = Math.ceil(270 / s.zoom) - 1;
    for (let y = Math.round(s.cy) - R; y <= Math.round(s.cy) + R; y++) for (let x = Math.round(s.cx) - R; x <= Math.round(s.cx) + R; x++) {
      const st = m.stateAt(x, y);
      if (m.hasMedal(x, y)) continue; // the medal dot sits in the middle
      const p = m.squareScreen(x, y);
      if (p.y < 70 || p.y > 690) continue;
      if (!out[st]) out[st] = { x, y, sx: p.x, sy: p.y };
    }
    const q = m.squareScreen(pm.x, pm.y);
    out.passed = { x: pm.x, y: pm.y, sx: q.x, sy: q.y }; // the passed square is the medal square
    return out;
  }, pm);
  const readAt = async (pts, dx = 0, dy = 0) => {
    const cl = await Promise.all(pts.map(p => gameToClient(page, p.sx + dx, p.sy + dy)));
    return pixelsAtClient(page, cl);
  };

  const shots = [];
  const caps = [];
  for (const style of ['plate', 'flat']) {
    await page.evaluate(([st, p]) => { const m = window.__mgbm; m.setTileStyle(st); m.jump(Math.round(p.x / 2), Math.round(p.y / 2), 44); m.select(p.x, p.y); }, [style, pm]);
    await page.waitForTimeout(250);
    const smp = await samples();
    const states = ['locked', 'available', 'passed', 'cleared', 'hole'];
    check(states.every(s => smp[s]), `${style}: default zoom shows locked, available, passed, cleared and a hole`);
    // Plate: the outer ring of the plate (1/6 in from the edge); flat: the middle. Both away from the medal / spike marks.
    const off = style === 'plate' ? -44 * 0.36 : 0;
    const order = states.filter(s => smp[s]);
    const px = await readAt(order.map(s => smp[s]), 0, off);
    // (the passed sample is read on its plate ring too, not on the medal dot)
    const c = Object.fromEntries(order.map((s, i) => [s, px[i]]));
    check(grey(c.locked) && grey(c.available), `${style}: locked ${c.locked} and available ${c.available} plates are greys (no category colour)`);
    check(lum(c.available) - lum(c.locked) >= 40, `${style}: available is clearly lighter than locked (${lum(c.available).toFixed(0)} vs ${lum(c.locked).toFixed(0)})`);
    check(lum(c.locked) - lum(c.hole) >= 8, `${style}: locked (${lum(c.locked).toFixed(0)}) is a little lighter than the background / hole (${lum(c.hole).toFixed(0)})`);
    check(!grey(c.cleared), `${style}: cleared is filled with colour ${c.cleared}`);
    if (style === 'plate') {
      const inner = await readAt([smp.available, smp.locked]);
      check(lum(inner[0]) < lum(c.available) - 30, `plate: available has a dark inner square (${lum(inner[0]).toFixed(0)} inside a ${lum(c.available).toFixed(0)} plate)`);
      check(Math.abs(lum(inner[1]) - lum(c.locked)) <= 12, `plate: the locked inner square is barely visible (${lum(inner[1]).toFixed(0)} in ${lum(c.locked).toFixed(0)})`);
    } else {
      const inner = await readAt([smp.available]);
      check(Math.abs(lum(inner[0]) - lum(c.available)) <= 3, 'flat: no inner square');
    }
    const edge = await readAt([smp.passed], 0, -18.5);
    check(edge[0][2] > edge[0][1] + 20 && lum(edge[0]) > 150, `${style}: passed square has the lavender outline ${edge[0]}`);
    shots.push(await canvasShot(page)); caps.push(`${style}: default zoom`);
  }
  for (const style of ['plate', 'flat']) {
    await page.evaluate((st) => { const m = window.__mgbm; m.setTileStyle(st); m.jump(0, 0, 5); m.select(0, 0); }, style);
    await page.waitForTimeout(250);
    // Far zoom contrast: locked vs available squares, read at their centres.
    const smp = await samples();
    const px = await readAt([smp.locked, smp.available, smp.cleared]);
    check(lum(px[1]) - lum(px[0]) >= 40, `${style} far zoom: available ${lum(px[1]).toFixed(0)} vs locked ${lum(px[0]).toFixed(0)}`);
    shots.push(await canvasShot(page, { x: 170, y: 278, w: 200, h: 200 })); caps.push(`${style}: zoom 5 crop (2x)`);
  }
  const file = await montage(page, shots, caps, path.join(OUT, 'sheet_tile_styles.png'));
  check(fs.statSync(file).size > 20000, `contact sheet written (${file})`);

  const { passes, failures } = lib.counts();
  console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'} (${passes} checks)`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });

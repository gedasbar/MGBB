// Chunk 15a end-to-end test: the Frontier grid map. Opens it from the campaign Map (greyed until tier 25 is passed),
// shows all four square states, a medal square and holes, pans / zooms with the mouse, measures the frame rate while
// panning at three zooms, plays one square to a result and comes back. Contact sheet: reports/chunk15a/sheet_frontier.png.
// Needs the Vite dev server. Run: node e2e/frontier-map.e2e.cjs   (adds ?debug=1 itself)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, state, tap, drag, wheel, gameToClient } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk15a');
fs.mkdirSync(OUT, { recursive: true });

async function canvasShot(page) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const b = await page.locator('canvas').screenshot();
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
  return b.toString('base64');
}
async function montage(page, shots, captions, file) {
  const b64 = await page.evaluate(async ({ shots, captions }) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
    const w = 540, h = 960, k = 0.5, pad = 8;
    const c = document.createElement('canvas');
    c.width = imgs.length * (w * k + pad) + pad; c.height = h * k + 40;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => {
      ctx.drawImage(im, pad + i * (w * k + pad), pad, w * k, h * k);
      ctx.fillStyle = '#aaa'; ctx.font = '12px monospace';
      ctx.fillText(captions[i], pad + i * (w * k + pad), h * k + 28);
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { shots, captions });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
}
const screenName = (page) => page.evaluate(() => window.__mgbm && window.__mgbm.screen);
const waitScreen = (page, name, timeout = 8000) => page.waitForFunction((n) => window.__mgbm && window.__mgbm.screen === n, name, { timeout });

/**
 * Frame rate at a zoom: idle (nothing changes) and while the camera pans every frame (~2 s, rAF-driven, the real render
 * loop), plus the CPU time of the Frontier's own per-frame work (redraw + panel) without rendering.
 */
async function panFps(page, zoom) {
  return page.evaluate(async (zoom) => {
    const m = window.__mgbm;
    m.jump(0, 0, zoom);
    await new Promise(r => setTimeout(r, 400));
    const measure = async (pan) => {
      const gaps = [];
      let frames = 0;
      const t0 = performance.now();
      let last = t0;
      await new Promise(res => {
        const step = (t) => { frames++; gaps.push(t - last); last = t; if (pan) m.pan(6, 2); if (t - t0 < 2000) requestAnimationFrame(step); else res(); };
        requestAnimationFrame(step);
      });
      gaps.sort((a, b) => a - b);
      return { fps: Math.round((frames / (performance.now() - t0)) * 1000), p95: Math.round(gaps[Math.floor(gaps.length * 0.95)]) };
    };
    const idle = await measure(false);
    const pan = await measure(true);
    const scr = window.__mgbmSm.currentScreen;
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) { scr.pan(6, 2); scr.update(1 / 60); }
    const cpuMs = (performance.now() - t0) / 30;
    return { idleFps: idle.fps, panFps: pan.fps, panP95: pan.p95, cpuMs: Math.round(cpuMs * 100) / 100, drawn: m.state().drawnSquares, sprites: m.state().spritesUsed };
  }, zoom);
}

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: true });
  const shots = [];
  const caps = [];

  // ---- Entry: the Map's Frontier button is greyed until tier 25 is passed.
  await tap(page, 486, 930); // Map tab
  await waitScreen(page, 'map');
  let fb = await page.evaluate(() => window.__mgbm.frontierButton());
  check(!fb.enabled, 'Map: the Frontier button is greyed before tier 25 is passed');
  await tap(page, fb.rect.x + fb.rect.w / 2, fb.rect.y + fb.rect.h / 2);
  let mapState = await state(page);
  check(mapState.toast.includes('tier 25') && (await screenName(page)) === 'map', `tapping it explains why: "${mapState.toast}"`);

  await page.evaluate(() => document.getElementById('dbg-fr-unlock').click());
  await tap(page, 54, 930); // Build tab, then back to the Map (it rebuilds with the new progress)
  await tap(page, 486, 930);
  await waitScreen(page, 'map');
  fb = await page.evaluate(() => window.__mgbm.frontierButton());
  check(fb.enabled, 'after passing tier 25 (cheat) the Frontier button is enabled');
  await tap(page, fb.rect.x + fb.rect.w / 2, fb.rect.y + fb.rect.h / 2);
  await waitScreen(page, 'frontier');
  check(true, 'tapping it opens the Frontier screen');

  // ---- States: clear rings 0..2 (cheat), then make the medal square nearest to the cleared area available (clear one
  // open neighbour of it with the cheat) and mark it passed.
  const setup = await page.evaluate(() => {
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
    if (pm) { m.progress.data.frontier.sq[pm.x + ',' + pm.y] = 1; m.progress.commit(); }
    m.jump(pm ? Math.round(pm.x / 2) : 0, pm ? Math.round(pm.y / 2) : 0, 44);
    if (pm) m.select(pm.x, pm.y);
    return pm;
  });
  check(!!setup, `a medal square next to the cleared area was found and marked passed: ${JSON.stringify(setup)}`);
  await page.waitForTimeout(250);
  const counts = await page.evaluate(() => {
    const m = window.__mgbm;
    const s = m.state();
    const c = { cleared: 0, passed: 0, available: 0, locked: 0, hole: 0, medal: 0 };
    const r = 8;
    const cx = Math.round(s.camera.cx), cy = Math.round(s.camera.cy);
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - 6; x <= cx + 6; x++) {
      c[m.stateAt(x, y)]++;
      if (m.hasMedal(x, y) && m.stateAt(x, y) !== 'cleared') c.medal++;
    }
    return c;
  });
  check(counts.cleared > 0 && counts.passed === 1 && counts.available > 0 && counts.locked > 0 && counts.hole > 0 && counts.medal > 0,
    `default zoom shows every state: ${JSON.stringify(counts)}`);
  let fs1 = await state(page);
  check(fs1.panel.state === 'Passed' && fs1.panel.medal.includes('Medal') && fs1.panel.play, `panel of the passed medal square: "${fs1.panel.line1}" / "${fs1.panel.line2}" / "${fs1.panel.state} ${fs1.panel.medal}", Play enabled`);
  check(/Ring \d+ {2}· {2}(North|East|South|West) {2}· {2}Tier \d+/.test(fs1.panel.line2), 'panel shows ring, sector and effective tier');
  shots.push(await canvasShot(page)); caps.push('default zoom: 4 states, medal, holes');

  // ---- A locked square cannot be played; the button says why.
  const locked = await page.evaluate(() => { const m = window.__mgbm; for (let x = 8; x < 40; x++) if (m.stateAt(x, -1) === 'locked') return { x, y: -1 }; return null; });
  await page.evaluate((l) => window.__mgbm.select(l.x, l.y), locked);
  await tap(page, 451, 864);
  let ls = await state(page);
  check(!ls.panel.play && ls.toast.startsWith('Locked') && (await screenName(page)) === 'frontier', `locked square: Play disabled, toast "${ls.toast}"`);

  // ---- Mouse: drag pans, the wheel zooms around the pointer.
  await page.evaluate(() => window.__mgbm.jump(0, 0, 44));
  await page.waitForTimeout(100);
  const before = (await state(page)).camera;
  await drag(page, 300, 400, 200, 300);
  const after = (await state(page)).camera;
  check(Math.abs((after.cx - before.cx) * 44 - 100) < 15 && Math.abs((after.cy - before.cy) * 44 - 100) < 15, `drag 100 px left/up moves the camera ${((after.cx - before.cx) * 44).toFixed(0)} / ${((after.cy - before.cy) * 44).toFixed(0)} px`);
  const under = await page.evaluate(() => { const m = window.__mgbm; const s = m.state().camera; return { x: s.cx + (150 - 270) / s.zoom, y: s.cy + (300 - 378) / s.zoom }; });
  await wheel(page, 150, 300, -300);
  const z = await page.evaluate(() => { const m = window.__mgbm; const s = m.state().camera; return { zoom: s.zoom, x: s.cx + (150 - 270) / s.zoom, y: s.cy + (300 - 378) / s.zoom }; });
  check(z.zoom > 60 && Math.abs(z.x - under.x) < 0.05 && Math.abs(z.y - under.y) < 0.05, `wheel zooms in (44 -> ${z.zoom.toFixed(1)}) keeping the square under the pointer`);
  const statsLine = await page.evaluate(() => { const o = {}; window.__mgbmSm.currentScreen.statsInfo(o); return o.extra; });
  check(/squares \d+/.test(statsLine), `stats overlay line: "${statsLine}"`);

  // ---- Frame rate while panning, at the far, default and near zoom.
  const fps = {};
  for (const zz of [5, 44, 110]) fps[zz] = await panFps(page, zz);
  fs.writeFileSync(path.join(OUT, 'pan-fps.json'), JSON.stringify(fps, null, 2));
  // Headless Chromium renders in software and runs well under 60 fps even idle, so a frame rate here says nothing about a real
  // phone: it is REPORTED, not checked.
  for (const zz of [5, 44, 110]) {
    const f = fps[zz];
    console.log(`INFO  zoom ${zz}: panning ${f.panFps} fps vs idle ${f.idleFps} (p95 frame ${f.panP95} ms), Frontier CPU ${f.cpuMs} ms/frame, ${f.drawn} squares, ${f.sprites} sprites`);
  }

  // Far and near screenshots.
  await page.evaluate(() => window.__mgbm.jump(0, 0, 5));
  await page.waitForTimeout(200);
  shots.push(await canvasShot(page)); caps.push(`zoom 5: ${(await state(page)).drawnSquares} squares`);
  await page.evaluate((p) => { window.__mgbm.jump(p.x, p.y, 110); }, setup);
  await page.waitForTimeout(200);
  shots.push(await canvasShot(page)); caps.push('zoom 110: the passed medal square');

  // ---- Play the passed medal square to a result and come back.
  await page.evaluate((p) => { window.__mgbm.jump(Math.round(p.x / 2), Math.round(p.y / 2), 44); window.__mgbm.select(p.x, p.y); }, setup);
  await page.waitForTimeout(150);
  const camBefore = (await state(page)).camera;
  const medalsBefore = (await state(page)).medals;
  await tap(page, 451, 864); // PLAY
  await waitScreen(page, 'wall');
  const ws = await state(page);
  check(ws.hud.tier.startsWith('Frontier (') && ws.total > 0, `the square starts the wall screen: HUD "${ws.hud.tier}", ${ws.total} blocks`);
  const c = await gameToClient(page, 270, 760);
  await page.mouse.move(c.x, c.y);
  await page.mouse.move(c.x + 20, c.y, { steps: 4 });
  await page.waitForTimeout(1500);
  const mid = await state(page);
  check(mid.destroyed >= 0 && mid.state === 'playing', `the run is live after 1.5 s (${mid.destroyed} blocks destroyed by the gun)`);
  await page.evaluate(() => window.__mgbm.wall.destroyAll()); // finish the clear with the dev path (same destroyBlock as hits)
  await waitScreen(page, 'summary', 10000);
  const sum = await state(page);
  check(sum.wall.result === 'cleared' && sum.captain.medals === 1, `result CLEARED, Medal paid once: ${sum.captain.medals}`);
  shots.push(await canvasShot(page)); caps.push('result: CLEARED, +1 Medal');
  await tap(page, 100, 672); // Frontier button of the summary
  await waitScreen(page, 'frontier');
  await page.waitForTimeout(200);
  const back = await state(page);
  const key = setup.x + ',' + setup.y;
  check(back.sq[key] === 2 && back.medals === medalsBefore + 1, `back on the Frontier: square ${key} cleared, Medals ${medalsBefore} -> ${back.medals}`);
  check(back.camera.cx === camBefore.cx && back.camera.cy === camBefore.cy && back.camera.zoom === camBefore.zoom && back.selected.x === setup.x && back.selected.y === setup.y, 'camera and selection are where they were');
  check(!back.panel.medal && back.panel.state === 'Cleared' && back.panel.play, `panel: "${back.panel.state}", no medal marker, Replay enabled`);
  shots.push(await canvasShot(page)); caps.push('back: square filled, medal gone');

  const sheet = await montage(page, shots, caps, path.join(OUT, 'sheet_frontier.png'));
  check(fs.statSync(sheet).size > 20000, `contact sheet written (${sheet})`);

  const { passes, failures } = lib.counts();
  console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'} (${passes} checks)`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });

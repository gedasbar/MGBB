// area: late-tiers, wall
// Chunk 27b end-to-end test: the five effect types of tiers 101-200 in flight on the real wall screen: Strong Wind (115), Crosswind (118), Fog (121), Regrowth (124),
// Mitosis Wall (127). Each tier panel says what it does, and each effect is read off the running world (a shot leaves backwards, a shot drifts, a far block is hidden,
// a hurt block heals, a destroyed block splits). Contact sheet: reports/chunk27b/sheet_27b.png (the Map list with the icons, then one picture per type in flight).
// Needs the Vite dev server. Run: node e2e/late-effects.e2e.cjs   (adds ?debug=1 itself)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, state, tap } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk27b');
fs.mkdirSync(OUT, { recursive: true });
const waitScreen = (page, name, timeout = 8000) => page.waitForFunction((n) => window.__mgbm && window.__mgbm.screen === n, name, { timeout });
const MAP_TAB = [486, 930];
const START = [451, 862];
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

async function canvasShot(page) {
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const b = await page.locator('canvas').screenshot();
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
  return b.toString('base64');
}

async function montage(page, shots, captions, file) {
  const b64 = await page.evaluate(async ({ shots, captions }) => {
    const imgs = await Promise.all(shots.map(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; }));
    const k = 0.5, pad = 8, cap = 22, per = 3;
    const w = Math.round(540 * k), h = Math.round(960 * k);
    const rows = Math.ceil(imgs.length / per);
    const c = document.createElement('canvas');
    c.width = per * (w + pad) + pad; c.height = rows * (h + cap + pad) + pad;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => {
      const x = pad + (i % per) * (w + pad), y = pad + Math.floor(i / per) * (h + cap + pad);
      ctx.drawImage(im, x, y, w, h);
      ctx.fillStyle = '#aaa'; ctx.font = '12px monospace'; ctx.fillText(captions[i], x, y + h + 16);
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { shots, captions });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}

const seed = (page, cleared, passed) => page.evaluate(({ cleared, passed }) => {
  const s = window.__mgbm.progress;
  s.data.clearedTiers = cleared;
  s.data.passedTiers = passed;
  s.commit();
}, { cleared, passed });

// What each type does, read off the running world. `ready` makes the situation (and may be called again until it holds), `check` reads the effect.
const FLIGHTS = [
  {
    tier: 115, name: 'Strong Wind', ship: [270, 560], offset: 470, autoFire: true,
    ready: () => { const w = window.__mgbm.wall; let down = 0; for (let i = 0; i < w.pool.max; i++) if (w.pool.active[i] && w.pool.vy[i] > 100) down++; return w.gun.launchTurnDeg === 180 && down >= 3; },
    check: () => { const w = window.__mgbm.wall; let up = 0, down = 0; for (let i = 0; i < w.pool.max; i++) if (w.pool.active[i]) { if (w.pool.vy[i] < -100) up++; else if (w.pool.vy[i] > 100) down++; } return { up, down, ok: up === 0 && down >= 3 }; },
  },
  {
    tier: 118, name: 'Crosswind', ship: [270, 820], offset: 360, autoFire: true,
    ready: () => { const w = window.__mgbm.wall; let n = 0; for (let i = 0; i < w.pool.max; i++) if (w.pool.active[i] && Math.abs(w.pool.vx[i]) > 40) n++; return n >= 3; },
    check: () => {
      const w = window.__mgbm.wall; const sign = Math.sign(w.crossAccel); let side = 0, wrong = 0;
      for (let i = 0; i < w.pool.max; i++) if (w.pool.active[i] && Math.abs(w.pool.vx[i]) > 5) { if (Math.sign(w.pool.vx[i]) === sign) side++; else wrong++; }
      return { accel: w.crossAccel, side, wrong, ok: w.crossAccel !== 0 && side >= 3 && wrong === 0 };
    },
  },
  {
    tier: 121, name: 'Fog', ship: [270, 760], offset: 520, autoFire: false,
    ready: () => true,
    check: () => {
      const w = window.__mgbm.wall;
      const live = w.all.filter(b => w.blocks[b.row * w.level.cols + b.col] === b);
      const dist = (b) => Math.hypot(w.dxw(b.x, w.shipX), b.y - w.shipY);
      const near = live.reduce((a, b) => (dist(b) < dist(a) ? b : a));
      const far = live.reduce((a, b) => (dist(b) > dist(a) ? b : a));
      const radius = w.level.effects.fog.radius;
      return { radius, near: near && w.fogAlpha(near), far: far && w.fogAlpha(far), ok: !!near && !!far && w.fogAlpha(near) > 0 && w.fogAlpha(far) === 0 && radius >= 240 };
    },
  },
  {
    tier: 124, name: 'Regrowth', ship: [270, 860], offset: 560, autoFire: false,
    ready: () => {
      const w = window.__mgbm.wall;
      if (window.__hurt === undefined) {
        const b = w.all.filter(x => w.blocks[x.row * w.level.cols + x.col] === x).reduce((a, x) => (x.y > a.y ? x : a)); // the lowest living block
        b.hp = b.maxHp * 0.4; b.lastDamaged = w.time; window.__hurt = b.hp; window.__hurtId = b.id;
      }
      return true;
    },
    check: () => { const w = window.__mgbm.wall; const b = w.blocks[window.__hurtId]; return { hp: b && b.hp, hurt: window.__hurt, max: b && b.maxHp, ok: !!b && b.hp > window.__hurt + 1 && b.hp < b.maxHp }; },
  },
  {
    tier: 127, name: 'Mitosis Wall', ship: [270, 860], offset: 560, autoFire: false,
    ready: () => {
      const w = window.__mgbm.wall; const cols = w.level.cols;
      if (window.__split) return true;
      const st = window.__mgbm.state();
      // The block nearest the middle of the screen (the lowest rows first): destroy it, it splits INSIDE its own cell (28b).
      let best = null;
      for (let r = 1; r < w.level.rows; r++) {
        for (let c = 1; c < cols - 1; c++) {
          const b = w.blocks[r * cols + c];
          if (!b) continue;
          const sx = st.shipScreenX + w.dxw(b.x, w.shipX);
          if (sx < 60 || sx > 480 || b.y < 150) continue;
          const score = Math.abs(sx - 270) + Math.abs(b.y - 420) * 2;
          if (!best || score < best.score) best = { r, c, score };
        }
      }
      if (best) {
        const idx = best.r * cols + best.c;
        w.destroyBlock(w.blocks[idx]);                       // whole -> two halves
        window.__splitCell = idx;
        window.__split = true;
      }
      return !!window.__split;
    },
    check: () => {
      const w = window.__mgbm.wall; const cols = w.level.cols;
      const idx = window.__splitCell;
      const halves = w.piecesAt(idx).filter(b => b.gen === 1);
      const parentHp = w.all.find(p => p.gen === 0).maxHp;
      const real = halves.length === 2 && halves.every(b => b.hw === 13.5 && b.hh === 27 && b.maxHp > 0 && b.maxHp < parentHp);
      // Every neighbour cell of the split one is untouched (nothing leaked out of the cell).
      const row = Math.floor(idx / cols), col = idx % cols;
      const leaked = [[row, col - 1], [row, col + 1], [row - 1, col]].some(([rr, cc]) => w.piecesAt(rr * cols + cc).some(p => p.gen > 0));
      return { halves: halves.length, splits: w.fx.splits, total: w.total, ok: real && !leaked && w.fx.splits === 2 && w.total > w.level.cells.filter(Boolean).length };
    },
  },
];

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: true });
  const shots = [];
  const caps = [];
  const onScreen = (name) => page.evaluate((n) => !!window.__mgbm && window.__mgbm.screen === n, name);
  const goTab = async (xy, name) => {
    for (let attempt = 0; attempt < 6; attempt++) {
      await tap(page, ...xy, { pause: 150 });
      if (await lib.waitFor(() => onScreen(name), { timeout: 2000 })) return;
    }
    await waitScreen(page, name, 1000);
  };
  const openMap = () => lib.openCampaign(page);
  const reopenMap = async () => { await goTab([54, 930], 'build'); await openMap(); };
  const selectTier = async (t) => {
    // The debug panel covers the right-hand column of the list: hide it while tapping.
    await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.evaluate((t) => { const m = window.__mgbm; m.scrollTo(0); const r0 = m.tileScreenRect(t); m.scrollTo(Math.max(0, r0.y - 300)); }, t);
      const rr = await page.evaluate((t) => window.__mgbm.tileScreenRect(t), t);
      await tap(page, rr.x + rr.w / 2, rr.y + rr.h / 2, { pause: 200 });
      if (await lib.waitFor(async () => { const s = await state(page); return s.selected === t && new RegExp(`^Tier ${t}\b`).test(s.sheet.title); }, { timeout: 1500 })) break;
    }
    const out = await state(page);
    await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'flex'; });
    return out;
  };

  // ---- 1. The list: every type tile is marked; each panel has the one-line description
  await openMap();
  await seed(page, range(1, 100), range(1, 100));
  await reopenMap();
  let st = await state(page);
  const types = ['strong_wind', 'crosswind', 'fog', 'regrowth', 'mitosis_wall'];
  const firstTier = {};
  for (const ty of types) firstTier[ty] = st.tiles.find(t => t.type === ty).tier;
  check(JSON.stringify(firstTier) === JSON.stringify({ strong_wind: 115, crosswind: 118, fog: 121, regrowth: 124, mitosis_wall: 127 }), `the first tier of each type: ${JSON.stringify(firstTier)}`);
  check(types.every(ty => st.tiles.filter(t => t.type === ty).length >= 3), 'each effect type is marked on at least three tiles');
  const lines = { 115: /every shot leaves backwards/i, 118: /pushes every shot sideways/i, 121: /show only near your ship/i, 124: /left alone for a second heal/i, 127: /splits into two small/i };
  for (const t of [115, 118, 121, 124, 127]) {
    st = await selectTier(t);
    check(lines[t].test(st.sheet.typeLine) && !/not active/.test(st.sheet.typeLine), `tier ${t} panel line: "${st.sheet.typeLine}"`);
    if (t === 121) { shots.push(await canvasShot(page)); caps.push('Map: icons and a panel line'); }
  }

  // ---- 2. One tier of each type in flight (a reload between them keeps the saved progress)
  for (const f of FLIGHTS) {
    await page.reload(); await page.waitForFunction(() => !!window.__mgbm);
    await openMap();
    await lib.waitFor(() => page.evaluate(() => !!document.getElementById('dbg-god')), { timeout: 8000 }); // the debug panel is a lazy import
    await page.evaluate(() => { const g = document.getElementById('dbg-god'); g.checked = true; g.dispatchEvent(new Event('change')); });
    await seed(page, range(1, 100), range(1, f.tier - 1));
    await reopenMap();
    await selectTier(f.tier);
    await tap(page, ...START, { pause: 300 });
    await waitScreen(page, 'wall');
    const at = await lib.gameToClient(page, ...f.ship);
    await page.mouse.move(at.x, at.y);
    check(await lib.waitFor(() => page.evaluate((y) => !!window.__mgbm.wall && Math.abs(window.__mgbm.wall.shipY - y) < 6, f.ship[1]), { timeout: 5000 }), `${f.name}: the ship is where the pointer is`);
    await page.evaluate(({ offset, autoFire }) => { const w = window.__mgbm.wall; w.autoFire = autoFire; w.setWallOffset(offset); }, { offset: f.offset, autoFire: f.autoFire });
    // Wait on the condition itself (24d): make the situation until the effect shows in the world.
    const ok = await lib.waitFor(async () => {
      await page.evaluate(`(${f.ready.toString()})()`);
      return (await page.evaluate(`(${f.check.toString()})()`)).ok;
    }, { timeout: 10000 });
    const v = await page.evaluate(`(${f.check.toString()})()`);
    check(ok, `${f.name} (tier ${f.tier}) in flight: ${JSON.stringify(v)}`);
    check((await page.evaluate(() => window.__mgbm.wall.state)) === 'playing', `${f.name}: the run is still on for the picture`);
    await page.evaluate(() => { window.__mgbm.timeScale = 0.0001; });
    await page.waitForTimeout(250);
    const shot = await canvasShot(page);
    shots.push(shot); caps.push(`${f.name}, tier ${f.tier}`);
    if (f.name === 'Mitosis Wall') {
      // A close-up of the children: 3x the region round them, so their size against the cell next to them can be seen.
      const at = await page.evaluate(() => {
        const w = window.__mgbm.wall; const st = window.__mgbm.state();
        const kid = w.piecesAt(window.__splitCell)[0];
        return { x: st.shipScreenX + w.dxw(kid.x - kid.ox, w.shipX), y: kid.y - kid.oy };
      });
      const zoom = await page.evaluate(async ({ shot, at }) => {
        const im = new Image(); im.src = 'data:image/png;base64,' + shot; await im.decode();
        const c = document.createElement('canvas'); c.width = 540; c.height = 960;
        const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
        const sx = Math.max(0, Math.min(540 - 180, at.x - 90)), sy = Math.max(0, Math.min(960 - 320, at.y - 160));
        ctx.drawImage(im, sx, sy, 180, 320, 0, 0, 540, 960);
        return c.toDataURL('image/png').split(',')[1];
      }, { shot, at });
      shots.push(zoom); caps.push('Mitosis Wall, the two halves x3');
    }
  }

  await montage(page, shots, caps, path.join(OUT, 'sheet_27b.png'));
  await browser.close();
  const c = lib.counts();
  process.stdout.write(`${c.failures ? 'FAIL' : 'DONE'} ${c.passes} passed, ${c.failures} failed\n`);
  process.exit(c.failures ? 1 : 0);
})().catch((e) => { process.stdout.write(`FAIL  ${e.stack}\n`); process.exit(1); });

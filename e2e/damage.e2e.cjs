// Chunk 14a end-to-end test: the small numbers on screen. A Free Fly wave with damage popups and a wall tier, in one contact
// sheet (reports/chunk14a/sheet_small_numbers.png); checks that every damage popup is a small number with at most one
// decimal and that wall blocks carry whole-number HP.
// Needs the Vite dev server. Run: node e2e/damage.e2e.cjs   (adds ?debug=1 itself)
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
if (!/[?&]debug=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'debug=1';
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check, state, gameToClient } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk14a');
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
    const w = 540, h = 960, k = 0.75, pad = 8;
    const c = document.createElement('canvas');
    c.width = imgs.length * (w * k + pad) + pad; c.height = h * k + 36;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    imgs.forEach((im, i) => {
      ctx.drawImage(im, pad + i * (w * k + pad), pad, w * k, h * k);
      ctx.fillStyle = '#aaa'; ctx.font = '13px monospace';
      ctx.fillText(captions[i], pad + i * (w * k + pad), h * k + 28);
    });
    return c.toDataURL('image/png').split(',')[1];
  }, { shots, captions });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
}
const moveTo = async (page, gx, gy) => { const p = await gameToClient(page, gx, gy); await page.mouse.move(p.x, p.y); };
/** Damage popups on screen now (white hits, orange burn ticks, amber cloud ticks; the yellow "+N" credit popups excluded). */
const popups = (page) => page.evaluate(() => (window.__mgbmSm.currentScreen.dmgNums || []).filter(d => d.life > 0 && !d.t.text.startsWith('+')).map(d => d.t.text));

(async () => {
  const browser = await lib.chromium.launch({ headless: true });
  const { page } = await lib.openGame(browser, { rich: true });

  // ---- Free Fly, wave 6, god mode, the ship under the lowest rock: collect the damage popups for a few seconds.
  await page.evaluate(() => { document.getElementById('dbg-wave-n').value = '6'; document.getElementById('dbg-start-wave').click(); });
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.world && window.__mgbm.state().viewW, null, { timeout: 5000 });
  await page.evaluate(() => { const g = document.getElementById('dbg-god'); if (!g.checked) g.click(); });
  await moveTo(page, 270, 760);
  const seen = new Set();
  let flyShot = null, best = 0;
  for (let k = 0; k < 60; k++) {
    const s = await state(page);
    const rocks = (s.enemies || []).filter(e => e.y < 740).sort((a, b) => b.y - a.y);
    await moveTo(page, Math.max(24, Math.min(516, rocks.length ? rocks[0].x : 270)), 760);
    await page.waitForTimeout(100);
    const now = await popups(page);
    now.forEach(t => seen.add(t));
    if (now.length > best && now.length >= 3) { best = now.length; flyShot = await canvasShot(page); }
  }
  if (!flyShot) flyShot = await canvasShot(page);
  const texts = [...seen];
  check(texts.length > 0, `damage popups seen in Free Fly wave 6: ${texts.length} distinct (${texts.slice(0, 12).join(', ')})`);
  check(texts.every(t => /^\d+(\.\d)?$/.test(t)), `every damage popup is a number with at most one decimal (${texts.filter(t => !/^\d+(\.\d)?$/.test(t)).join(', ') || 'all'})`);
  check(texts.every(t => Number(t) < 100), `every damage popup is small: max ${Math.max(...texts.map(Number))}`);
  check(texts.some(t => t !== '0'), 'no popup reads a bare 0 for a real hit');

  // ---- A wall tier (debug test wall: tier 25, some armor and shields) after a few seconds of fire.
  await page.fill('#dbg-wall-tier', '25');
  await page.fill('#dbg-wall-armor', '0.3');
  await page.fill('#dbg-wall-shield', '0.2');
  await page.fill('#dbg-wall-rows', '8');
  await moveTo(page, 270, 800);
  await page.evaluate(() => document.getElementById('dbg-wall-start').click());
  await page.waitForFunction(() => window.__mgbm && window.__mgbm.screen === 'wall', null, { timeout: 5000 });
  await moveTo(page, 270, 820);
  await page.evaluate(() => window.__mgbm.wall.setWallOffset(560));
  await page.waitForTimeout(2500);
  const blocks = await page.evaluate(() => window.__mgbm.wall.blocks.filter(Boolean).map(b => ({ hp: b.hp, maxHp: b.maxHp, shield: b.maxShield })));
  const maxHp = Math.max(...blocks.map(b => b.maxHp));
  check(blocks.length > 0 && blocks.every(b => Number.isInteger(b.maxHp) && Number.isInteger(b.shield)), `wall tier 25: every block's max HP and shield are whole numbers (max HP ${maxHp})`);
  check(maxHp < 100, `wall tier 25: block HP is a small number (${maxHp})`);
  check(blocks.some(b => b.hp < b.maxHp), `some blocks have taken damage (${blocks.filter(b => b.hp < b.maxHp).length})`);
  const wallShot = await canvasShot(page);

  const file = await montage(page, [flyShot, wallShot], [`Free Fly wave 6: ${best} damage popups`, `Wall tier 25 (test wall, max HP ${maxHp})`], path.join(OUT, 'sheet_small_numbers.png'));
  process.stdout.write(`sheet: ${file}\n`);
  await browser.close();
  const { passes, failures } = lib.counts();
  process.stdout.write(`${passes} passed, ${failures} failed\n`);
  process.exit(failures ? 1 : 0);
})();

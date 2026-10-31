// Chunk 24b: the Import / Export save dialog on a phone-size touch screen (390 x 844): the import field is selectable and takes typed and pasted text,
// the Paste button falls back to a hint when the clipboard cannot be read, "Load file" reads a save file (with a header line and wrapped lines),
// "Save as file" downloads the string, and the whole path ends with the save moved into a fresh browser.
// Not covered (needs the owner's iPhone): the long-press Paste bubble and the home-screen app itself.
// Needs the Vite dev server. Run: node e2e/save-transfer.e2e.cjs      Screenshots: reports/chunk24b/
const path = require('path');
const fs = require('fs');
let url = process.env.GAME_URL || 'http://localhost:5173/';
for (const [k, v] of [['debug', 1], ['stats', 0], ['bg', 'off']]) if (!new RegExp(`[?&]${k}=`).test(url)) url += (url.includes('?') ? '&' : '?') + `${k}=${v}`;
process.env.GAME_URL = url;
const lib = require('./lib.cjs');
const { check } = lib;

const OUT = path.join(__dirname, '..', 'reports', 'chunk24b');
fs.mkdirSync(OUT, { recursive: true });
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function openPage(browser, seed) {
  const ctx = await browser.newContext({ ...PHONE, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(false, `page error: ${e.message}`));
  if (seed) await page.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); localStorage.setItem('mgbm.progress.v1', s); sessionStorage.setItem('seeded', '1'); } }, seed);
  await page.goto(lib.URL);
  await page.waitForFunction(() => !!window.__mgbmSm);
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  await page.waitForTimeout(500);
  return { ctx, page };
}
const openDialog = (page, which) => page.evaluate(async (w) => {
  const m = await import('/src/ui/saveTransferUi.ts');
  if (w === 'export') m.openExportSave(); else m.openImportSave();
}, which);

(async () => {
  const browser = await lib.chromium.launch({ headless: true });

  // ---- Export from a device that has a save
  const seed = JSON.stringify({ version: 12, credits: 4321, runs: 9, ownedHulls: ['dart'], passedTiers: [1, 2, 3] });
  const a = await openPage(browser, seed);
  await openDialog(a.page, 'export');
  await a.page.waitForSelector('#export-text');
  const exported = await a.page.inputValue('#export-text');
  check(exported.startsWith('MGBM1:') && exported.length > 100, `export shows the save string (${exported.length} characters)`);
  const fileBtn = await a.page.$('#export-file');
  check(!!fileBtn && !!(await a.page.$('#export-copy')), 'export has Copy and Save as file');
  const [download] = await Promise.all([a.page.waitForEvent('download'), a.page.click('#export-file')]);
  const dlPath = path.join(OUT, 'downloaded-save.txt');
  await download.saveAs(dlPath);
  check(/^mgbm-save-\d{4}-\d{2}-\d{2}\.txt$/.test(download.suggestedFilename()) && fs.readFileSync(dlPath, 'utf8') === exported, `Save as file downloads ${download.suggestedFilename()} with exactly the string`);
  await a.page.screenshot({ path: path.join(OUT, 'export-390x844.png') });
  await a.ctx.close();

  // A save file as an editor or a messaging app might leave it: BOM, a header line, wrapped lines, a trailing note.
  const fixture = path.join(OUT, 'fixture-save.txt');
  fs.writeFileSync(fixture, `﻿Mitosis Gun Builder save\r\n${exported.replace(/(.{70})/g, '$1\r\n')}\r\n-- sent from my other phone\r\n`);

  // ---- Import into a fresh browser (no save)
  const b = await openPage(browser, null);
  await openDialog(b.page, 'import');
  await b.page.waitForSelector('#import-text');
  const style = await b.page.evaluate(() => {
    const t = document.getElementById('import-text');
    const cs = getComputedStyle(t);
    const box = getComputedStyle(document.getElementById('save-transfer'));
    return { sel: cs.userSelect || cs.webkitUserSelect, callout: cs.webkitTouchCallout, touch: cs.touchAction, font: parseFloat(cs.fontSize), boxCallout: box.webkitTouchCallout, rows: t.getBoundingClientRect().height, bodySel: getComputedStyle(document.body).userSelect };
  });
  check(style.sel === 'text' && style.bodySel === 'none', `the field is selectable (user-select ${style.sel}) while the page around the game is not (${style.bodySel})`);
  // -webkit-touch-callout exists only in iOS WebKit (Chromium reports nothing): the dialog's CSS strings are checked in tests/saveTransfer.test.ts.
  console.log(`INFO  touch-callout as this browser reports it: ${style.callout} / ${style.boxCallout}`);
  check(style.touch === 'auto' && style.font >= 16 && style.rows >= 100, `touch-action ${style.touch}, font ${style.font}px (no iOS focus zoom), box ${Math.round(style.rows)} px high (multi-line)`);

  // Typed text lands in the box and a bad one is refused without changing anything.
  await b.page.click('#import-text');
  await b.page.keyboard.type('hello\nthis is not a save');
  const typed = await b.page.inputValue('#import-text');
  check(typed === 'hello\nthis is not a save', 'typed text (two lines) is accepted by the field');
  await b.page.click('#import-check');
  check(/Nothing was changed.*not a save string/.test(await b.page.textContent('#import-msg')), `a bad text is refused with a reason ("${await b.page.textContent('#import-msg')}")`);

  // Paste button: with a readable clipboard, then with one that refuses.
  await b.page.evaluate((t) => navigator.clipboard.writeText(t), exported);
  await b.page.click('#import-paste');
  await b.page.waitForTimeout(200);
  check((await b.page.inputValue('#import-text')) === exported && /Pasted/.test(await b.page.textContent('#import-msg')), 'the Paste button puts the clipboard into the box');
  await b.page.fill('#import-text', '');
  await b.page.evaluate(() => { navigator.clipboard.readText = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); });
  await b.page.click('#import-paste');
  await b.page.waitForTimeout(200);
  check(/long-press the box and choose Paste/i.test(await b.page.textContent('#import-hint')), `a clipboard that cannot be read falls back to "${await b.page.textContent('#import-hint')}"`);

  // Load file: the save with the header, wrapped lines and a trailing note.
  await b.page.setInputFiles('#import-file', fixture);
  await b.page.waitForFunction(() => /credits/.test(document.getElementById('import-msg').textContent), null, { timeout: 5000 });
  const ask = await b.page.textContent('#import-msg');
  check(/4321 credits, 9 runs/.test(ask) && /Tap again to confirm/.test(ask), `Load file reads it and asks to confirm ("${ask}")`);
  check((await b.page.evaluate(() => localStorage.getItem('mgbm.progress.v1'))) === null || !/"credits":4321/.test(await b.page.evaluate(() => localStorage.getItem('mgbm.progress.v1'))), 'nothing is written before the confirmation');
  await b.page.screenshot({ path: path.join(OUT, 'import-390x844.png') });
  await b.page.fill('#import-text', '');
  await b.page.setInputFiles('#import-file', path.join(OUT, 'downloaded-save.txt'));
  await b.page.waitForFunction(() => /credits/.test(document.getElementById('import-msg').textContent), null, { timeout: 5000 });
  await Promise.all([b.page.waitForEvent('load'), b.page.click('#import-check')]);
  await b.page.waitForFunction(() => !!window.__mgbmSm);
  const saved = await b.page.evaluate(() => JSON.parse(localStorage.getItem('mgbm.progress.v1')));
  check(saved.credits === 4321 && saved.runs >= 9 && saved.version === 12, `after confirming and the restart the save is there (credits ${saved.credits}, runs ${saved.runs}, version ${saved.version})`);
  await b.ctx.close();

  // A broken file changes nothing.
  const c = await openPage(browser, null);
  await openDialog(c.page, 'import');
  await c.page.waitForSelector('#import-text');
  fs.writeFileSync(path.join(OUT, 'fixture-broken.txt'), 'MGBM1:eyJhcHAiOiJtZ2JtIiwiZm9ybWF0Ijox');
  await c.page.setInputFiles('#import-file', path.join(OUT, 'fixture-broken.txt'));
  await c.page.waitForFunction(() => /Nothing was changed/.test(document.getElementById('import-msg').textContent), null, { timeout: 5000 });
  check(true, `a cut-short file is refused ("${await c.page.textContent('#import-msg')}")`);
  await c.ctx.close();

  await browser.close();
  const { passes, failures } = lib.counts();
  console.log(`${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

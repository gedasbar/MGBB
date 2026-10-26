// Runs the browser (Playwright) scripts in e2e/ one after another and prints one verdict line per script.
//   node scripts/run-e2e.cjs smoke   a quick set that touches every screen (npm run test:e2e)
//   node scripts/run-e2e.cjs all     every e2e/*.e2e.cjs script (npm run test:e2e:all)
// The dev server must be running (npm run dev); GAME_URL=http://localhost:PORT picks another address.
// A script passes when it exits with code 0. Scripts write their screenshots into reports/ and e2e/screenshots/.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SMOKE = ['browser', 'basics', 'cheats', 'pause', 'shop', 'hulls'];
const dir = path.join(__dirname, '..', 'e2e');
const mode = process.argv[2] === 'all' ? 'all' : 'smoke';
const names = mode === 'all'
  ? fs.readdirSync(dir).filter(f => f.endsWith('.e2e.cjs')).map(f => f.replace('.e2e.cjs', '')).sort()
  : SMOKE;

const base = process.env.GAME_URL || 'http://localhost:5173';
fetch(base).then(() => run(), () => {
  console.error(`No game server at ${base}. Start it in another terminal with: npm run dev`);
  process.exit(2);
});

function run() {
  const results = [];
  for (const n of names) {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [path.join(dir, `${n}.e2e.cjs`)], { encoding: 'utf8', timeout: 15 * 60 * 1000 });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    const passes = (out.match(/^PASS/gm) || []).length;
    const fails = (out.match(/^FAIL/gm) || []).length;
    const ok = r.status === 0;
    results.push(ok);
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${n.padEnd(22)} ${String(passes).padStart(3)} checks passed, ${fails} failed, ${Math.round((Date.now() - t0) / 1000)} s`);
    if (!ok) console.log(out.split('\n').filter(l => /^FAIL|Error/.test(l)).slice(0, 8).map(l => `       ${l}`).join('\n'));
  }
  const bad = results.filter(r => !r).length;
  console.log(`\n${names.length - bad} of ${names.length} scripts passed.`);
  process.exit(bad ? 1 : 0);
}

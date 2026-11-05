// Runs the browser (Playwright) scripts in e2e/ in parallel workers and prints a summary (chunk 33a, DECISIONS 578-584).
//   node scripts/run-e2e.cjs smoke     scripts tagged `smoke` (npm run test:e2e)
//   node scripts/run-e2e.cjs all       every e2e/*.e2e.cjs (npm run test:e2e:all): parallel ones, then `// serial` ones alone, then `// slow` ones
//   node scripts/run-e2e.cjs sheets    the picture scripts e2e/sheet-*.cjs, never part of `all` (npm run test:e2e:sheets)
// Options:  --area a,b     only scripts whose `// area:` line has one of these tags (searches every e2e script, whatever the mode)
//           --only x,y     only these script names (rerun the failures: `--only map-nav,chunk21a`)
//           --workers N    parallel workers (default 3)
//           --show         print the whole output of every script that failed (to see why)
//           --list         print the selection and the tags, run nothing
// First lines of a script: `// area: tag, tag`, optionally `// serial` (runs alone after the parallel ones) or `// slow` (runs last, alone).
// The runner starts ONE fresh Vite dev server on a free port and stops it at the end, also after a failure or Ctrl+C. GAME_URL=... uses
// the server you give instead (nothing is started). A failed script is retried once: passing the second time = FLAKY, not failed.
// Exit code 0 when nothing FAILED (flaky ones are listed, not counted as failures).
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const dir = path.join(ROOT, 'e2e');
const TIMES_FILE = path.join(dir, 'out', 'run-times.json'); // last run's seconds per script (ignored by git): the slowest start first
const SCRIPT_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_WORKERS = 3;
const RETRY_PAUSE_MS = 1500;

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const split = (v) => (v || '').split(',').map(s => s.trim()).filter(Boolean);
const areas = split(opt('--area'));
const only = split(opt('--only'));
const mode = ['smoke', 'all', 'sheets'].find(m => argv.includes(m)) || (areas.length || only.length ? 'filter' : 'smoke');
const workers = Math.max(1, Number(opt('--workers')) || DEFAULT_WORKERS);

function describe(file) {
  const head = fs.readFileSync(path.join(dir, file), 'utf8').split('\n').slice(0, 4).map(l => l.trim());
  const tags = split((head.find(l => l.startsWith('// area:')) || '').replace('// area:', ''));
  return { file, name: file.replace(/\.e2e\.cjs$|\.cjs$/, ''), tags, serial: head.includes('// serial'), slow: head.includes('// slow') };
}

const all = fs.readdirSync(dir).filter(f => f.endsWith('.e2e.cjs')).sort().map(describe);
const known = new Set(all.flatMap(s => s.tags));
let picked;
if (mode === 'sheets') picked = fs.readdirSync(dir).filter(f => /^sheet-.*\.cjs$/.test(f)).sort().map(describe);
else if (mode === 'smoke') picked = all.filter(s => s.tags.includes('smoke'));
else picked = all;
if (areas.length) {
  const unknown = areas.filter(a => !known.has(a));
  if (unknown.length) { console.error(`Unknown area tag(s): ${unknown.join(', ')}. Known: ${[...known].sort().join(', ')}`); process.exit(2); }
  picked = all.filter(s => s.tags.some(t => areas.includes(t)));
}
if (only.length) picked = (mode === 'sheets' ? picked : all).filter(s => only.includes(s.name));
if (argv.includes('--list')) {
  for (const s of picked) console.log(`${s.name.padEnd(22)} ${s.tags.join(', ')}${s.serial ? '  [serial]' : ''}${s.slow ? '  [slow]' : ''}`);
  console.log(`\n${picked.length} scripts. Tags: ${[...known].sort().join(', ')}`);
  process.exit(0);
}
if (!picked.length) { console.error('No script matches.'); process.exit(2); }

let times = {};
try { times = JSON.parse(fs.readFileSync(TIMES_FILE, 'utf8')); } catch { /* first run */ }

// ---- the dev server -------------------------------------------------------------------------------------------------
let server = null;
function killTree(child) {
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGKILL');
  } catch { /* already gone */ }
}
function stopServer() {
  if (!server) return;
  killTree(server);
  server = null;
}
process.on('exit', stopServer);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { stopServer(); process.exit(130); });

const freePort = () => new Promise((res, rej) => {
  const s = net.createServer();
  s.on('error', rej);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
});
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function startServer() {
  if (process.env.GAME_URL) return process.env.GAME_URL;
  const port = await freePort();
  server = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore', detached: process.platform !== 'win32' });
  const base = `http://127.0.0.1:${port}/`;
  let up = false;
  for (let i = 0; i < 120 && !up; i++) {
    try { up = (await fetch(base)).ok; } catch { /* not up yet */ }
    if (!up) await sleep(500);
  }
  if (!up) throw new Error(`the dev server did not start on ${base}`);
  return base;
}

// ---- running one script ---------------------------------------------------------------------------------------------
const errLines = (out) => out.split('\n').filter(l => /^FAIL|Error/.test(l)).slice(0, 6);

function runOnce(s, base) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [path.join(dir, s.file)], { cwd: ROOT, env: { ...process.env, GAME_URL: base }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    const timer = setTimeout(() => { out += '\nFAIL  timeout\n'; killTree(child); }, SCRIPT_TIMEOUT_MS);
    child.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0, out, secs: (Date.now() - t0) / 1000 }); });
  });
}

async function runScript(s, base) {
  let r = await runOnce(s, base);
  let secs = r.secs, firstErrors = [];
  let status = r.ok ? 'ok' : 'fail';
  if (!r.ok) {
    firstErrors = errLines(r.out);
    await sleep(RETRY_PAUSE_MS);
    r = await runOnce(s, base);
    secs += r.secs;
    status = r.ok ? 'flaky' : 'fail';
  }
  const passes = (r.out.match(/^PASS/gm) || []).length;
  const fails = (r.out.match(/^FAIL/gm) || []).length;
  const tag = { ok: 'ok   ', flaky: 'FLAKY', fail: 'FAIL ' }[status];
  console.log(`${tag} ${s.name.padEnd(22)} ${String(passes).padStart(3)} checks passed, ${fails} failed, ${Math.round(secs)} s`);
  if (argv.includes('--show') && status !== 'ok') console.log(`---- output of ${s.name} (last run) ----
${r.out}
----`);
  return { s, status, secs, errors: errLines(r.out), firstErrors };
}

async function pool(list, n, base) {
  const queue = [...list], results = [];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    while (queue.length) results.push(await runScript(queue.shift(), base));
  }));
  return results;
}

(async () => {
  const t0 = Date.now();
  const base = await startServer();
  console.log(`${picked.length} scripts, ${workers} workers, server ${base}${server ? ' (started by the runner)' : ''}\n`);
  const slowestFirst = (a, b) => (times[b.name] || 0) - (times[a.name] || 0);
  const par = picked.filter(s => !s.serial && !s.slow).sort(slowestFirst);
  const ser = picked.filter(s => s.serial && !s.slow);
  const slow = picked.filter(s => s.slow);
  const results = await pool(par, workers, base);
  results.push(...await pool(ser, 1, base), ...await pool(slow, 1, base));
  stopServer();

  const total = (Date.now() - t0) / 1000;
  const group = (st) => results.filter(r => r.status === st);
  const sum = results.reduce((a, r) => a + r.secs, 0);
  console.log(`\n${group('ok').length} passed, ${group('flaky').length} flaky, ${group('fail').length} failed of ${results.length} scripts in ${Math.floor(total / 60)} min ${Math.round(total % 60)} s (${workers} workers; the script times add up to ${Math.round(sum / 60)} min).`);
  for (const r of group('flaky')) console.log(`  FLAKY ${r.s.name}: failed once with:\n${r.firstErrors.map(l => `       ${l}`).join('\n')}`);
  for (const r of group('fail')) console.log(`  FAILED ${r.s.name}:\n${r.errors.map(l => `       ${l}`).join('\n')}`);
  console.log('\nTimes: ' + results.slice().sort((a, b) => b.secs - a.secs).map(r => `${r.s.name} ${Math.round(r.secs)}s`).join(', '));
  try {
    fs.mkdirSync(path.dirname(TIMES_FILE), { recursive: true });
    for (const r of results) times[r.s.name] = r.secs;
    fs.writeFileSync(TIMES_FILE, JSON.stringify(times));
  } catch { /* not important */ }
  process.exit(group('fail').length ? 1 : 0);
})().catch((e) => { console.error(e); stopServer(); process.exit(1); });

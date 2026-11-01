// Chunk 24c: how far the wall bots get on the spike tiers (and overall) with two starter builds.
// Run: npm run spike-botcheck   (prints the spike tier list, then per build the highest tier passed in a row and each spike tier's result)
import { buildDartStarterGrid, place } from '../src/game/starter';
import { buildTwinGrid } from '../src/game/gridUtils';
import { generateLevel, isSpike, MAX_TIER } from '../src/wall/generator';
import { simulateWall } from '../src/wall/sim';

const spikes = Array.from({ length: MAX_TIER }, (_, i) => i + 1).filter(isSpike);
console.log(`Spike tiers (${spikes.length}): ${spikes.join(', ')}`);
const twin = () => { const g = buildTwinGrid(); place(g, 1, 3, 'flat_plus'); place(g, 1, 2, 'flat_plus'); return g; };
const builds: [string, () => ReturnType<typeof buildDartStarterGrid>][] = [['Dart + Flat+', buildDartStarterGrid], ['Twin + 2 Flat+', twin]];
const MAX = Number(process.env.MAX_TIER ?? 40);
for (const [name, mk] of builds) {
  let high = 0, broken = false;
  const rows: string[] = [];
  for (let t = 1; t <= MAX; t++) {
    const l = generateLevel(t);
    const r = simulateWall(l, mk(), 'carve');
    const ok = r.state === 'passed' || r.state === 'cleared';
    if (!ok) broken = true;
    if (ok && !broken) high = t;
    if (l.spike || t <= 8) rows.push(`${t}${l.spike ? '*' : ''}:${r.state}`);
  }
  console.log(`${name}: highest tier passed in a row (carve bot, tiers 1-${MAX}) = ${high}\n  ${rows.join('  ')}`);
}

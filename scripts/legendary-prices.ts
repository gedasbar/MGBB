// Chunk 20a: checks the credit prices of the legendary blocks against the economy model of the difficulty audit (scripts/lib/difficultyModel.ts).
// For each legendary ring: the credits of one full run on a Frontier wall at that ring, the income of "one tier of play" at that point
// (3 runs destroying half the wall each, the model's assumption), the credits banked and the Medals held on arriving there, and what the
// price is in runs and in banked credits. Medals are checked the same way (the model's Medals on arrival minus the 7 hero levels' worth
// it assumes are bought first is NOT subtracted: it is an upper bound, see the report).
//   npx vite-node scripts/legendary-prices.ts
import { mkdirSync, writeFileSync } from 'fs';
import { LEGENDARY_PRICE_BY_RING } from '../src/data/blockEconomy';
import { budgetAt, incomeAt, medalsAt, ringNeeds, RUNS_PER_TIER, SHARE_PER_RUN, tierOfRing } from './lib/difficultyModel';

const lines: string[] = [
  '# Legendary prices against the economy model (chunk 20a)',
  '',
  `Model of \`docs/difficulty-audit.md\`: ${RUNS_PER_TIER} runs per wall, each destroying ${SHARE_PER_RUN * 100}% of it, Frontier credits from the ring's wall squares, Medals from first clears, Free Fly milestones and 0.25 per ring. "Arrival" = the career position where the ring is first reached.`,
  '',
  '| ring | effective tier | credits of one full clear | credits of one run (50%) | income of one tier of play (3 runs) | banked on arrival | price (credits) | price in runs | price / banked | Medals on arrival | price (Medals) |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
];
for (const ring of [100, 200, 300]) {
  const e = Math.round(tierOfRing(ring));
  const full = ringNeeds(ring).credits;
  const run = full * SHARE_PER_RUN;
  const p = LEGENDARY_PRICE_BY_RING[ring];
  const banked = budgetAt(e);
  lines.push(`| ${ring} | ${e} | ${Math.round(full).toLocaleString('en')} | ${Math.round(run).toLocaleString('en')} | ${Math.round(incomeAt(e)).toLocaleString('en')} | ${Math.round(banked).toLocaleString('en')} | ${p.credits.toLocaleString('en')} | ${(p.credits / run).toFixed(1)} | ${(100 * p.credits / banked).toFixed(2)}% | ${medalsAt(e)} | ${p.medals} |`);
}
lines.push('');
mkdirSync('reports/chunk20a', { recursive: true });
writeFileSync('reports/chunk20a/prices.md', lines.join('\n'));
console.log(lines.join('\n'));

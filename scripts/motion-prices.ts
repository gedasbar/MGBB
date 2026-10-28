// Chunk 20b: checks the first-copy price of every block behind a campaign-tier lock against the economy model of the difficulty audit
// (scripts/lib/difficultyModel.ts): credits of one run at the unlock tier (half the wall), the income of that tier of play (3 runs),
// the credits banked on arrival, and the price in runs. Writes reports/chunk20b/prices.md.
//   npx vite-node scripts/motion-prices.ts
import { mkdirSync, writeFileSync } from 'fs';
import { BLOCK_ECONOMY } from '../src/data/blockEconomy';
import { TIER_LOCKS } from '../src/data/tierLocks';
import { BLOCKS } from '../src/data/blocks';
import { budgetAt, campaignNeeds, incomeAt, SHARE_PER_RUN } from './lib/difficultyModel';

const lines: string[] = [
  '# Prices of the tier-locked blocks against the economy model (chunk 20b)',
  '',
  'Model of `docs/difficulty-audit.md`: 3 runs per wall, each destroying 50% of it. "Run" = credits of half a wall at the unlock tier; "banked" = credits a model player holds on arriving at that tier (before this purchase).',
  '',
  '| block | tier | first copy | run (50%) | price in runs | income of the tier (3 runs) | banked | price / banked | cap | growth | last copy | price at 2.5 runs |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|',
];
const rows = Object.entries(TIER_LOCKS).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
for (const [id, tier] of rows) {
  const e = BLOCK_ECONOMY[id];
  const run = campaignNeeds(tier).credits * SHARE_PER_RUN;
  const banked = budgetAt(tier);
  const cap = e.cap ?? 8;
  const last = Math.round(e.base * Math.pow(e.growth, cap - 1));
  lines.push(`| ${BLOCKS[id].name} | ${tier} | ${e.base.toLocaleString('en')} | ${Math.round(run).toLocaleString('en')} | ${(e.base / run).toFixed(2)} | ${Math.round(incomeAt(tier)).toLocaleString('en')} | ${Math.round(banked).toLocaleString('en')} | ${(100 * e.base / banked).toFixed(1)}% | ${e.cap ?? 'none'} | ${e.growth} | ${last.toLocaleString('en')} | ${Math.round((run * 2.5) / 10) * 10 || Math.round(run * 2.5)} |`);
}
lines.push('');
mkdirSync('reports/chunk20b', { recursive: true });
writeFileSync('reports/chunk20b/prices.md', lines.join('\n'));
console.log(lines.join('\n'));

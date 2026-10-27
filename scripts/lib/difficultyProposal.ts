// Chunk 18a, part E: the PROPOSED difficulty curves of docs/difficulty-audit.md. Nothing here is wired into the game; the audit
// script scales the measured needs by (proposed HP / today's HP) to show what the ratio tables would look like. Needed DPS is linear
// in block HP (effective HP = shield + HP x armor weight, all proportional to HP), so the scaling is exact up to rounding of whole numbers.
import { blockHp } from '../../src/wall/level';
import { MAP_BASE_TIER, MAP_TIER_PER_RING } from '../../src/frontier/constants';
import { rockHp, tierOfTime } from '../../src/econ/economy';
import { waveHpMul, WAVE_TIME } from '../../src/data/waves';
import { fmtBig } from '../../src/ui/format';
import type { Entry, Point } from './difficultyModel';

/**
 * The proposal in numbers.
 *  campaign: block HP of tier t = 2 x 1.13^(t-1) as today up to tier 30, then the growth per tier of each segment (today the HP stops
 *            growing at tier 38 and only rows, armor and shields grow).
 *  frontier: block HP of a ring = the campaign curve at the ring's effective tier (25 + 0.3 ring) up to ring `pastRing` (tier 100),
 *            then `growth` per ring (today 1.5% per ring from the first ring).
 *  fly:      total HP growth per wave (the wave multiplier x the tier that time brings) from wave 20 on; today about x1.44 a wave.
 */
export const PROPOSED = {
  campaignBase: 2,
  campaignSegments: [
    { to: 30, growth: 1.13 },
    { to: 40, growth: 1.06 },
    { to: 60, growth: 1.065 },
    { to: 100, growth: 1.0525 },
  ],
  frontierPastRing: 250,
  frontierGrowth: 1.001,
  flyFromWave: 20,
  flySegments: [
    { to: 30, growth: 1.19 },
    { to: 40, growth: 1.08 },
    { to: 50, growth: 1.06 },
  ],
  /** Where the proposal wants the player to stand: owned / clear need for the reference build (casual up to this tier, builder from 100, geometric blend between). */
  refBlendFrom: 40,
  refBlendTo: 100,
};

/** Today's block HP and the proposed one, whole numbers. */
export function proposedBlockHp(tier: number): number {
  let hp = PROPOSED.campaignBase, t = 1;
  for (const seg of PROPOSED.campaignSegments) {
    while (t < Math.min(tier, seg.to)) { hp *= seg.growth; t++; }
  }
  return Math.max(1, Math.round(hp));
}
/** The Frontier's HP before chunk 18b (x1.015 a ring); kept so the 18a proposal tables can still be printed. */
export const currentRingHp = (ring: number) => blockHp(MAP_BASE_TIER) * Math.pow(1.015, ring);
export function proposedRingHp(ring: number): number {
  const e = MAP_BASE_TIER + ring * MAP_TIER_PER_RING;
  if (ring <= PROPOSED.frontierPastRing) return proposedBlockHp(e);
  return proposedBlockHp(100) * Math.pow(PROPOSED.frontierGrowth, ring - PROPOSED.frontierPastRing);
}

/** Free Fly body HP at the start of a wave, today and proposed (a body of the basic rock's HP multiplier). */
export const currentFlyHp = (wave: number) => rockHp(tierOfTime((wave - 1) * WAVE_TIME)) * waveHpMul(wave);
export function proposedFlyHp(wave: number): number {
  if (wave <= PROPOSED.flyFromWave) return currentFlyHp(wave);
  let hp = currentFlyHp(PROPOSED.flyFromWave);
  for (let w = PROPOSED.flyFromWave + 1; w <= wave; w++) hp *= PROPOSED.flySegments.find(s => w <= s.to)!.growth;
  return hp;
}

/** Factor the proposal puts on the DPS a point needs (1 = unchanged). */
export function scaleOf(p: Point): number {
  if (p.kind === 'tier') return proposedBlockHp(p.n) / blockHp(p.n);
  if (p.kind === 'ring') return proposedRingHp(p.n) / currentRingHp(p.n);
  return proposedFlyHp(p.n) / currentFlyHp(p.n);
}

/** Reference DPS the proposal aims at for a campaign tier or ring: casual up to refBlendFrom, builder from refBlendTo, geometric blend between. */
export function referenceDps(casual: number, builder: number, e: number): number {
  const w = Math.min(1, Math.max(0, (e - PROPOSED.refBlendFrom) / (PROPOSED.refBlendTo - PROPOSED.refBlendFrom)));
  return Math.pow(Math.max(casual, 1e-9), 1 - w) * Math.pow(Math.max(builder, 1e-9), w);
}

type Out = (s?: string) => void;
type TableFn = (head: string[], rows: (string | number)[][]) => void;
interface Helpers {
  f1: (n: number) => string;
  ratioText: (r: number) => string;
  POINTS: Point[];
  needsOf: (p: Point) => { pass: number; clear: number; toughest: number };
  ownedAt: (p: Point) => { casualHero: Entry | null; builderHero: Entry | null };
  est: (e: Entry | null) => number;
}

export function proposalParts(out: Out, table: TableFn, h: Helpers) {
  const { f1, ratioText, POINTS, needsOf, ownedAt, est } = h;
  out('Proposed numbers (nothing is wired into the game; the needs of section B are scaled by proposed HP / today\'s HP):\n');
  out(`- Campaign block HP: as today (x1.13 a tier) up to tier 30; then ${PROPOSED.campaignSegments.slice(1).map((sg) => `x${sg.growth} a tier to tier ${sg.to}`).join(', ')} (today: flat from tier 38).`);
  out(`- Frontier block HP: the campaign curve at the ring's effective tier (25 + 0.3 x ring) up to ring ${PROPOSED.frontierPastRing} (tier 100), then x${PROPOSED.frontierGrowth} a ring (today x1.015 a ring from ring 0).`);
  out(`- Free Fly body HP: as today to wave ${PROPOSED.flyFromWave}; then total growth per wave x${PROPOSED.flySegments.map(s => `${s.growth} (to wave ${s.to})`).join(', x')} (today about x1.44 a wave: wave multiplier 1.25 times the tier step 1.055 every 15 s).\n`);

  out('Curves (HP of one block; rows, armor and shield shares, speed and spike tiers unchanged):\n');
  table(['tier', 'today HP', 'proposed HP', 'factor'], [1, 5, 10, 20, 30, 38, 40, 50, 60, 75, 100].map(t => [t, blockHp(t), fmtBig(proposedBlockHp(t)), (proposedBlockHp(t) / blockHp(t)).toFixed(2)]));
  table(['ring (effective tier)', 'today HP', 'proposed HP', 'factor'], [10, 25, 50, 100, 150, 200, 250, 300, 400].map(r => [`${r} (${(MAP_BASE_TIER + r * MAP_TIER_PER_RING).toFixed(0)})`, f1(currentRingHp(r)), f1(proposedRingHp(r)), (proposedRingHp(r) / currentRingHp(r)).toFixed(2)]));
  table(['wave', 'today body HP', 'proposed body HP', 'factor', 'today growth that wave', 'proposed growth'], [5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map(w => [
    w, f1(currentFlyHp(w)), f1(proposedFlyHp(w)), (proposedFlyHp(w) / currentFlyHp(w)).toFixed(3),
    (currentFlyHp(w) / currentFlyHp(w - 1 || 1)).toFixed(2), (proposedFlyHp(w) / proposedFlyHp(w - 1 || 1)).toFixed(2),
  ]));

  out('Owned / needed with the proposed curves (hero levels included, casual and builder as in section B). "ref" = reference DPS / proposed clear need, target 0.7 to 1.5: the reference is the casual build up to tier 40, the builder build from tier 100, a geometric blend between.\n');
  table(['point', 'proposed pass DPS', 'proposed clear DPS', 'toughest block', 'casual pass', 'builder pass', 'casual clear', 'builder clear', 'ref clear'], POINTS.map(p => {
    const n = needsOf(p), o = ownedAt(p), s = scaleOf(p);
    const ref = referenceDps(est(o.casualHero), est(o.builderHero), p.e);
    return [p.label, f1(n.pass * s), f1(n.clear * s), f1(n.toughest * s), ratioText(est(o.casualHero) / (n.pass * s)), ratioText(est(o.builderHero) / (n.pass * s)),
      ratioText(est(o.casualHero) / (n.clear * s)), ratioText(est(o.builderHero) / (n.clear * s)), ratioText(ref / (n.clear * s))];
  }));
  out('Small-numbers check: the proposal changes nothing before tier 30 (HP 2 at tier 1, whole numbers, 70 at tier 30). Late HP is read through the K / M / B format of src/ui/format.ts: tier 100 block HP is '
    + `${fmtBig(proposedBlockHp(100))}, the toughest block (armor and shields included) ${f1(needsOf(POINTS.find(p => p.label === 'tier 100')!).toughest * scaleOf(POINTS.find(p => p.label === 'tier 100')!))}, ring 400 block HP ${f1(proposedRingHp(400))}, wave 50 body HP ${f1(proposedFlyHp(50))}.\n`);
}

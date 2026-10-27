import { aoeCircleRadius, randomCurveMaxDeg, shieldBreakMul, aoeRectSize, armorPierceMul, forkDamageFrac, CURVE_RATE_DEG, FORK_ANGLE_DEG, HOMING_CONE_DEG, HOMING_RANGE, HOMING_RATE_DEG } from '../engine/projectiles';
import { FIXED_LEVEL, UPGRADABLE } from './blockEconomy';
import { addDamage, BlockCategory, BlockDef, gateDamage, Modifier, mulDamage, Packet, Rarity, Rel } from '../engine/compilerTypes';
import {
  alternatorMul, boomerangRange, capacitorMul, CAPACITOR_N, chainJumps, CHAIN_ARC_LIFE, CHAIN_FRAC, CHAIN_RANGE, corrosionCap,
  CORROSION_STEP, delaySeconds, executionerMul, EXECUTIONER_BELOW, frostBonus, frostSlow, frostTime, igniteFrac, IGNITE_TIME,
  mineDistance, MINE_WAIT, orbitTime, ORBIT_RADIUS, ORBIT_REHIT, overclockAverage, overclockGain, OVERCLOCK_CAP, OVERCLOCK_WINDOW,
  bounceCount, flatPlusAdd, cauterizeBonus, cauterizeTime, cleaverBonus, cleaverPenalty, CULLING_CAP, cullingPct, fissionCooldown, residueFrac,
  CHAIN_ARCS_PER_SHOT, MINE_EXTRA_MAX, RESIDUE_RADIUS, RESIDUE_TICK, RESIDUE_TIME, routerBoth, SPILL_CHAIN_DEPTH, spillFrac, STATIC_HITS, STATIC_WINDOW, staticFrac, WELL_RADIUS, WELL_TIME, wellPull,
} from '../engine/effects';

export const BLOCKS: Record<string, BlockDef> = {};

function register(b: BlockDef) {
  BLOCKS[b.id] = b;
}

const FWD: Rel[] = ['F'];

// Level scaling of the older blocks (level 1 is exactly what they always did).
const turnSpeedMul = (l: number) => 1 + 0.1 * (l - 1);
const splitterMul = (l: number) => 1 + 0.05 * (l - 1);
const luckyProb = (l: number) => 0.33 + 0.05 * (l - 1);
const jackpotProb = (l: number) => 0.04 + 0.01 * (l - 1);
/** Gambler's Gate: 40% at level 1 to 50% at level 3 (chunk 16c-2; it was 50% to 60%). */
export const gamblerProb = (l: number) => 0.4 + 0.05 * (l - 1);
/** Percent x per copy: x1.5 at level 1 to x3 at level 10, geometric in the level (chunk 16c-2; it was 1 + 0.5 L). */
const PERCENT_MUL_L1 = 1.5;
const PERCENT_MUL_MAX = 3;
const PERCENT_MAX_LEVEL = 10;
export const percentMul = (l: number) => PERCENT_MUL_L1 * Math.pow(PERCENT_MUL_MAX / PERCENT_MUL_L1, (l - 1) / (PERCENT_MAX_LEVEL - 1));

/**
 * Data hook for the future perk behind the Crossover block. Lines already cross freely in
 * empty cells, so the block currently does nothing; add the benefit here (it receives each
 * signal's packet) and flip `shown` on the Crossover entry.
 */
function crossoverBonus(_packet: Packet, _level: number): void {
  // intentionally empty: no benefit defined yet
}

const NOT_CONSUMED = 'No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly.';

/** A forward-only block that tags the packet with a projectile modifier. */
function modBlock(
  id: string, name: string, category: BlockCategory, maxLevel: number,
  mod: Modifier, desc: string | ((l: number) => string),
  shown = false, hideReason: string | undefined = shown ? undefined : NOT_CONSUMED,
) {
  register({
    id, name, category, maxLevel, outputs: FWD, desc, shown, hideReason,
    transform: (p) => { p.mods.push({ ...mod }); },
  });
}

/** Shop price bands of the chunk 9a blocks (the older blocks cost 40-450). */
const RARITY_PRICE: Record<Rarity, number> = { common: 150, uncommon: 500, rare: 800, epic: 1200 };

/** Fields every chunk 9a block carries: rarity, its base price, five levels and a shop unlock. */
function rare(rarity: Rarity) {
  return { rarity, baseCost: RARITY_PRICE[rarity], maxLevel: 5, shown: true, unlock: 'shop' as const };
}
const pct = (v: number) => Math.round(v * 100);

// ---------------------------------------------------------------- Pathing
register({
  id: 'generator', name: 'Generator', category: 'pathing', maxLevel: 1, outputs: FWD,
  desc: 'Projectile dispenser. Fires a pulse of projectiles up the circuit continuously.',
  shown: false, hideReason: 'Fixed hull cell, not placeable.',
});
register({
  id: 'ejector', name: 'Ejector', category: 'pathing', maxLevel: 1, outputs: [],
  desc: 'Ejector. Projectiles leave the ship here.',
  shown: false, hideReason: 'Fixed hull cell, not placeable.',
});
register({
  id: 'straight', name: 'Straight', category: 'pathing', maxLevel: 1, outputs: FWD,
  desc: 'Moves the signal straight on.',
  shown: false, hideReason: 'Removed: every empty cell is an implicit straight piece. Id kept for save migration only.',
});
register({
  id: 'turn_l', name: 'Turn Left', category: 'pathing', maxLevel: 3, outputs: ['L'],
  desc: (l) => `Turns the signal 90° to the left.${l > 1 ? ` Projectiles fly ${pct(turnSpeedMul(l) - 1)}% faster.` : ''}`,
  transform: (p, l) => { if (l > 1) p.speedMul *= turnSpeedMul(l); },
  shown: true,
});
register({
  id: 'turn_r', name: 'Turn Right', category: 'pathing', maxLevel: 3, outputs: ['R'],
  desc: (l) => `Turns the signal 90° to the right.${l > 1 ? ` Projectiles fly ${pct(turnSpeedMul(l) - 1)}% faster.` : ''}`,
  transform: (p, l) => { if (l > 1) p.speedMul *= turnSpeedMul(l); },
  shown: true,
});
register({
  id: 'splitter_2', name: 'Splitter 2', category: 'pathing', maxLevel: 5, outputs: ['L', 'R'],
  desc: (l) => `Splits the signal into two ${l > 1 ? `copies at ×${splitterMul(l).toFixed(2)} damage` : 'full copies'}, one to the left and one to the right.`,
  transform: (p, l) => { if (l > 1) mulDamage(p, splitterMul(l)); },
  shown: true,
});
register({
  id: 'splitter_3', name: 'Splitter 3', category: 'pathing', maxLevel: 5, outputs: ['L', 'F', 'R'],
  desc: (l) => `Splits the signal into three ${l > 1 ? `copies at ×${splitterMul(l).toFixed(2)} damage` : 'full copies'}: left, straight on and right.`,
  transform: (p, l) => { if (l > 1) mulDamage(p, splitterMul(l)); },
  shown: true,
});
register({
  id: 'crossover', name: 'Crossover', category: 'pathing', maxLevel: 1, outputs: FWD,
  desc: 'Future perk block. Lines already cross freely, so it currently has no effect.',
  transform: (p, l) => crossoverBonus(p, l),
  shown: false, hideReason: 'Future perk block (hook: crossoverBonus). Lines cross freely without it, so it has no effect yet.',
});
register({
  id: 'diode', name: 'Diode', category: 'pathing', maxLevel: 1, outputs: FWD,
  desc: 'Lets the signal through in one direction only.',
  shown: false, hideReason: 'No effect: every line already runs one way, and a manually rotated block already gates by side.',
});
register({
  id: 'alternator', name: 'Alternator', category: 'pathing', outputs: ['L', 'R'], ...rare('rare'),
  desc: (l) => `One in, two out (left and right). Successive packets take turns (A, B, A, B), so only one fires per pulse, and each emitted packet has ×${alternatorMul(l).toFixed(1)} damage.`,
  transform: (p, l) => { mulDamage(p, alternatorMul(l)); p.mods.push({ type: 'alternator', level: l }); },
  alternates: true,
});
register({
  id: 'random_router', name: 'Random Router', category: 'pathing', outputs: ['L', 'R'], ...rare('uncommon'),
  desc: (l) => `One in, two out (left and right). On ${pct(routerBoth(l))}% of pulses the packet takes both, otherwise one of the two at random (50/50), always at full damage.`,
  transform: (p, l) => { p.mods.push({ type: 'random_router', level: l }); },
  router: { both: routerBoth },
});
register({
  id: 'merger', name: 'Merger', category: 'pathing', maxLevel: 1, outputs: FWD,
  desc: 'Joins two signals into one.',
  shown: false, hideReason: 'Signals no longer share cells, so there is nothing to merge; needs a redesign.',
});
register({
  id: 'delay_line', name: 'Delay Line', category: 'pathing', outputs: FWD, ...rare('uncommon'),
  desc: (l) => `Holds each packet for ${delaySeconds(l).toFixed(1)} s, then releases it: the projectile leaves the ship late (timed volleys). The rate of fire is unchanged.`,
  transform: (p, l) => { p.ops.push({ t: 'delay', sec: delaySeconds(l) }); p.mods.push({ type: 'delay_line', level: l }); },
});
register({
  id: 'portal_pair', name: 'Portal Pair', category: 'pathing', maxLevel: 1, outputs: FWD,
  desc: 'Teleports the signal to the other portal.',
  shown: false, hideReason: 'Teleporting is not expressible in the relative-direction model yet.',
});
register({
  id: 'reflector', name: 'Reflector', category: 'pathing', maxLevel: 1, outputs: [],
  desc: 'Sends the signal back where it came from.',
  shown: false, hideReason: 'A reflected signal would overlap itself; not supported by the line model.',
});
register({
  id: 'armored_plating', name: 'Armored Plating', category: 'pathing', maxLevel: 1, outputs: [],
  desc: 'Passive plating.',
  shown: false, hideReason: 'Passive block: not on the signal path and no ship stat consumes it.',
});

// ---------------------------------------------------------------- Damage
register({
  id: 'flat_plus', name: 'Flat +', category: 'damage', maxLevel: 10, outputs: FWD,
  desc: (l) => `Adds +${flatPlusAdd(l)} damage to each projectile.`,
  transform: (p, l) => { addDamage(p, flatPlusAdd(l)); },
  shown: true,
});
register({
  id: 'percent_mult', name: 'Percent ×', category: 'damage', maxLevel: 10, outputs: FWD,
  desc: (l) => `Multiplies projectile damage by ×${Math.round(percentMul(l) * 100) / 100}.`,
  transform: (p, l) => { mulDamage(p, percentMul(l)); },
  shown: true,
});
register({
  id: 'lucky_strike', name: 'Lucky Strike', category: 'damage', maxLevel: 3, outputs: FWD,
  desc: (l) => `${pct(luckyProb(l))}% chance to double projectile damage.`,
  transform: (p, l) => { gateDamage(p, { prob: luckyProb(l), mult: 2, elseMult: 1 }); },
  shown: true,
});
register({
  id: 'jackpot', name: 'Jackpot', category: 'damage', maxLevel: 3, outputs: FWD,
  desc: (l) => `${pct(jackpotProb(l))}% chance to multiply projectile damage by 10.`,
  transform: (p, l) => { gateDamage(p, { prob: jackpotProb(l), mult: 10, elseMult: 1 }); },
  shown: true,
});
register({
  id: 'gamblers_gate', name: 'Gambler’s Gate', category: 'damage', maxLevel: 3, outputs: FWD,
  desc: (l) => `${pct(gamblerProb(l))}% chance to triple projectile damage, otherwise the projectile is lost.`,
  transform: (p, l) => { gateDamage(p, { prob: gamblerProb(l), mult: 3, elseMult: 0 }); },
  shown: true,
});
register({
  id: 'overclock', name: 'Overclock', category: 'damage', outputs: FWD, ...rare('uncommon'),
  desc: (l) => `Each consecutive packet that passes on this lane adds +${Math.round(overclockGain(l) * 1000) / 10}% damage (up to +${pct(OVERCLOCK_CAP)}%). The streak resets after ${OVERCLOCK_WINDOW} s without a packet (1.5 pulses on a slow hull).`,
  transform: (p, l) => {
    const avg = overclockAverage(l);
    p.damage *= avg;
    p.ops.push({ t: 'oc', gain: overclockGain(l), cap: OVERCLOCK_CAP, avg });
    p.mods.push({ type: 'overclock', level: l });
  },
});
register({
  id: 'capacitor', name: 'Capacitor', category: 'damage', outputs: FWD, ...rare('rare'),
  desc: (l) => `Absorbs the next ${CAPACITOR_N} packets and emits one packet with the sum of their damage${l > 1 ? ` +${pct(capacitorMul(l) - 1)}%` : ''}: the same damage per second in one bigger, slower shot (×${Math.round(CAPACITOR_N * capacitorMul(l) * 10) / 10} every ${CAPACITOR_N}rd pulse).`,
  transform: (p, l) => {
    p.damage *= CAPACITOR_N * capacitorMul(l);
    p.ops.push({ t: 'cap', n: CAPACITOR_N, mul: capacitorMul(l) });
    p.mods.push({ type: 'capacitor', level: l });
  },
});
modBlock('berserker_coil', 'Berserker Coil', 'damage', 1, { type: 'berserker' }, 'Damage rises as hull falls.');
register({
  id: 'executioner', name: 'Executioner', category: 'damage', outputs: FWD, ...rare('rare'),
  desc: (l) => `Deals ×${executionerMul(l)} damage to targets below ${pct(EXECUTIONER_BELOW)}% HP. Works on rocks and on wall blocks.`,
  transform: (p, l) => { p.mods.push({ type: 'executioner', level: l }); },
});
register({
  id: 'tithe', name: 'Tithe', category: 'damage', maxLevel: 1, outputs: FWD,
  desc: 'Takes 20% of projectile damage.',
  transform: (p) => { mulDamage(p, 0.8); p.mods.push({ type: 'tithe' }); },
  shown: false, hideReason: 'Only a damage penalty; its benefit (tithe) is not consumed by anything yet.',
});

// ---- Mitosis category (chunk 11a). Rocks count generations from 1 (the parent); wall blocks have none, so the rock-only ones do nothing there.
const ROCKS = 'Free Fly rocks only.';
newMod('fission_catalyst', 'Fission Catalyst', 'mitosis', 'epic', 'fission_catalyst',
  (l) => `A hit that does not kill splits the rock now; the children share its remaining HP. Again after ${fissionCooldown(l).toFixed(1)} s. Not Darter or Budder. ${ROCKS}`);
newMod('cauterize', 'Cauterize', 'mitosis', 'uncommon', 'cauterize',
  (l) => `A hit rock cannot split for ${cauterizeTime(l)} s. A kill inside that window leaves no children and pays +${pct(cauterizeBonus(l))}% credits. ${ROCKS}`);
newMod('cleaver', 'Cleaver', 'mitosis', 'uncommon', 'cleaver',
  (l) => `×${cleaverBonus(l).toFixed(1)} damage to fragments (generation 2 and later) and ×${cleaverPenalty(l).toFixed(2)} to parents (generation 1). ${ROCKS}`);
newMod('culling_bolt', 'Culling Bolt', 'mitosis', 'rare', 'culling_bolt',
  (l) => `Adds ${pct(cullingPct(l))}% of the target's max HP to the hit, at most ${CULLING_CAP}× the shot's damage. Works on rocks and on wall blocks.`);
newMod('residue_seed', 'Residue Seed', 'mitosis', 'rare', 'residue_seed',
  (l) => `A kill leaves a ${RESIDUE_RADIUS} px cloud for ${RESIDUE_TIME} s: every ${RESIDUE_TICK} s it deals ${pct(residueFrac(l))}% of the killing hit (counted up to the target's max HP) to all inside, new children too. Rocks and wall blocks.`);
register({
  id: 'overkill_spill', name: 'Overkill Spill', category: 'mitosis', outputs: FWD, ...rare('uncommon'), maxLevel: 6,
  desc: (l) => `When this shot kills a rock that splits, every child at once takes ${pct(spillFrac(l))}% of the killing hit's total damage (counted up to the rock's max HP). A child it kills splits as usual and passes the burst on once more (${SPILL_CHAIN_DEPTH} generations at most). Rocks only, no effect on wall blocks. ${ROCKS}`,
  transform: (p, l) => { p.mods.push({ type: 'overkill_spill', level: l }); },
});

// ---------------------------------------------------------------- Projectile modifiers
/** A shown projectile modifier whose strength scales with the block level (the level travels in the modifier). */
function levelMod(id: string, name: string, maxLevel: number, mod: Modifier, desc: (l: number) => string) {
  register({
    id, name, category: 'modifier', maxLevel, outputs: FWD, desc, shown: true,
    transform: (p, l) => { p.mods.push({ ...mod, level: l }); },
  });
}

/** The line every stacking shape block ends with: what one more copy on the signal path does (checked by tests/interactions.test.ts). */
export const MORE: Record<string, string> = {
  piercing: 'Each extra copy: one more pierce.',
  bouncing: 'Each extra copy: one more bounce.',
  aoe: 'Each extra copy: bigger area, -5% damage.',
  chain: 'Each extra copy: one more jump in every chain (each added jump weaker).',
  homing: 'Each extra copy: sharper turn, wider cone, longer seek range.',
  fork: 'Each extra copy: one more pair of copies (each pair 20% weaker).',
  boomerang: 'Each extra copy: longer range.',
  orbit: 'Each extra copy: one more full pass round the ship.',
  mine: `Each extra copy: a bigger mine, and one more mine beside it (up to ${MINE_EXTRA_MAX} extra).`,
};

levelMod('piercing', 'Piercing', 5, { type: 'piercing' },
  (l) => l === 1
    ? `Projectiles pass through enemies. Each hit costs the projectile the damage it dealt (at least 10% of its damage). ${MORE.piercing}`
    : `Projectiles pass through enemies. Each hit costs the projectile 1/${l} of the damage it dealt (at least ${Math.round(10 / l * 10) / 10}% of its damage). ${MORE.piercing}`);
levelMod('bouncing', 'Bouncing', 5, { type: 'bouncing' },
  (l) => `Bounces off the first ${bounceCount(l)} things it hits instead of stopping. Keeps full damage. ${MORE.bouncing}`);
levelMod('aoe_circle', 'AoE - Circle', 5, { type: 'aoe_circle' },
  (l) => `Projectiles explode once, where the shot ends (a Piercing or Bouncing shot travels on first), hitting every enemy within ${aoeCircleRadius(l)} units. ${MORE.aoe}`);
levelMod('shield_breaker', 'Shield-Breaker', 3, { type: 'shield_breaker' },
  (l) => `Damage dealt to a shield ×${shieldBreakMul(l)}, and shields take double on top of that. Hits on armor and HP are unchanged.`);
register({
  id: 'pure_converter', name: 'Pure Converter', category: 'modifier', maxLevel: 5, outputs: FWD,
  desc: (l) => `Converts ${15 * l}% of projectile damage to pure damage, which ignores armor.`,
  transform: (p, l) => { p.pure = Math.min(1, p.pure + 0.15 * l); },
  shown: true,
});
/** A chunk 9a projectile modifier: tags the packet with its type and level; the hit pipeline and ProjectileSystem do the rest. */
function newMod(id: string, name: string, category: BlockCategory, rarity: Rarity, type: string, desc: (l: number) => string) {
  register({
    id, name, category, outputs: FWD, ...rare(rarity), desc,
    transform: (p, l) => { p.mods.push({ type, level: l }); },
  });
}
newMod('boomerang', 'Boomerang', 'modifier', 'uncommon', 'boomerang',
  (l) => `Flies up to ${boomerangRange(l)} px, returns to the ship and hits on both legs, then disappears at the ship. ${MORE.boomerang}`);
newMod('orbit', 'Orbit', 'modifier', 'rare', 'orbit',
  (l) => `Circles the ship at ${ORBIT_RADIUS} px for ${orbitTime(l)} s, then launches in its original direction. Can hit while orbiting, the same target at most once per ${ORBIT_REHIT} s. ${MORE.orbit}`);
newMod('chain_lightning', 'Chain Lightning', 'modifier', 'epic', 'chain_lightning',
  (l) => `On a hit, jumps to up to ${chainJumps(l)} more targets within ${CHAIN_RANGE} px for ${pct(CHAIN_FRAC)}% damage each, drawing a short arc (${CHAIN_ARC_LIFE} s). At most ${CHAIN_ARCS_PER_SHOT} chains per shot. In the Wall it jumps to nearby blocks. ${MORE.chain}`);
newMod('mine', 'Mine', 'modifier', 'uncommon', 'mine',
  (l) => `Stops after ${mineDistance(l)} px and waits up to ${MINE_WAIT} s; detonates for its full damage when something touches it. In the Wall it stays where it is and the wall runs into it. ${MORE.mine}`);
newMod('gravity_well', 'Gravity Well', 'modifier', 'rare', 'gravity_well',
  (l) => `On the first impact of a shot, pulls rocks within ${WELL_RADIUS} px toward the impact point at ${wellPull(l)} px/s for ${WELL_TIME} s. Free Fly rocks only.`);
modBlock('magnetized', 'Magnetized', 'modifier', 1, { type: 'magnetized' }, 'Projectiles are magnetised.');

levelMod('curving_right', 'Curving Right', 3, { type: 'curve', dir: 'right' },
  (l) => `After launch, projectiles turn clockwise at ${CURVE_RATE_DEG * l}° per second.`);
levelMod('random_curve', 'Random Curve', 3, { type: 'random_curve' },
  (l) => `Projectiles weave on smooth random steering, turning at most ${randomCurveMaxDeg(l)}° per second.`);
levelMod('homing', 'Homing', 5, { type: 'homing' },
  (l) => `Projectiles steer at ${HOMING_RATE_DEG * l}° per second toward the nearest enemy within ${HOMING_RANGE} px and a ${HOMING_CONE_DEG}° cone ahead. With no target they fly straight. ${MORE.homing}`);
levelMod('aoe_rect', 'AoE - Rectangle', 5, { type: 'aoe_rect' },
  (l) => { const r = aoeRectSize(l); return `Projectiles detonate once, where the shot ends (a Piercing or Bouncing shot travels on first), as a horizontal bar ${r.w} px wide and ${r.h} px tall, hitting every enemy it overlaps. ${MORE.aoe}`; });
levelMod('fork_impact', 'Fork on Impact', 3, { type: 'fork_impact' },
  (l) => `On the first hit, spawns 2 copies at ${Math.round(forkDamageFrac(l) * 100)}% damage and 0.6× size, flying ±${FORK_ANGLE_DEG}° off the heading; the shot goes on. Copies carry status effects only (no blast, fork or chain). ${MORE.fork}`);
levelMod('armor_piercer', 'Armor-Piercer Tip', 3, { type: 'armor_piercer' },
  (l) => `Deals ×${armorPierceMul(l)} damage to enemies that have armor. No effect on unarmored enemies.`);

// ---------------------------------------------------------------- Status & elemental
newMod('ignite', 'Ignite', 'status', 'uncommon', 'ignite',
  (l) => `A hit sets the target on fire: ${pct(igniteFrac(l))}% of the hit damage per second for ${IGNITE_TIME} s (ignores armor). A new hit refreshes the burn, it does not stack.`);
newMod('frostbite', 'Frostbite', 'status', 'rare', 'frostbite',
  (l) => `A hit slows the target's drift by ${pct(frostSlow(l))}% for ${frostTime(l)} s (rocks; wall blocks do not move). Frozen targets take +${pct(frostBonus(l))}% damage from everything.`);
newMod('corrosion', 'Corrosion', 'status', 'rare', 'corrosion',
  (l) => `Each hit removes ${pct(CORROSION_STEP)}% of the target's remaining armor, up to ${pct(corrosionCap(l))}% of it in total. Armored wall blocks lose their thick frame as it is stripped.`);
newMod('static_charge', 'Static Charge', 'status', 'uncommon', 'static_charge',
  (l) => `${STATIC_HITS} hits on one target within ${STATIC_WINDOW} s release an extra pulse of ${pct(staticFrac(l))}% of that hit's damage, then reset. Rocks and wall blocks.`);
modBlock('magnetize_target', 'Magnetize Target', 'status', 1, { type: 'magnetize_target' }, 'Magnetises enemies.');
modBlock('vampiric', 'Vampiric', 'status', 3, { type: 'vampiric' }, 'Heals the hull on hit.');

// ---------------------------------------------------------------- Passives
const PASSIVE = 'Passive block: not on the signal path and no ship stat consumes it.';
for (const [id, name, max] of [
  ['shield_emitter', 'Shield Emitter', 5], ['magnet_core', 'Magnet Core', 5], ['thruster', 'Thruster', 5],
  ['targeting_lens', 'Targeting Lens', 5], ['capacitor_bank', 'Capacitor Bank', 5], ['lucky_charm', 'Lucky Charm', 5],
  ['sensor_array', 'Sensor Array', 3],
] as [string, string, number][]) {
  register({ id, name, category: 'passive', maxLevel: max, outputs: [], desc: `${name}.`, shown: false, hideReason: PASSIVE });
}

/** Friendly names of projectile modifiers, for the ledger tooltip. */
export const MOD_LABEL: Record<string, string> = {
  piercing: 'Piercing', bouncing: 'Bouncing', aoe_circle: 'AoE - Circle', shield_breaker: 'Shield-Breaker',
  curve: 'Curving Right', random_curve: 'Random Curve', homing: 'Homing', aoe_rect: 'AoE - Rectangle', fork_impact: 'Fork on Impact', armor_piercer: 'Armor-Piercer Tip',
  // Chunk 11a
  fission_catalyst: 'Fission Catalyst', cauterize: 'Cauterize', cleaver: 'Cleaver', culling_bolt: 'Culling Bolt', residue_seed: 'Residue Seed',
  overkill_spill: 'Overkill Spill', gravity_well: 'Gravity Well', static_charge: 'Static Charge', random_router: 'Random Router',
};

// Chunk 16c-2: only the blocks in UPGRADABLE have levels. Every other block has one level and runs at its fixed level.
for (const b of Object.values(BLOCKS)) {
  if (UPGRADABLE.has(b.id)) continue;
  b.maxLevel = 1;
  b.fixedLevel = FIXED_LEVEL[b.id] ?? 1;
}

/** Blocks the player can place, in picker order. */
export function pickerBlocks(): BlockDef[] {
  return Object.values(BLOCKS).filter(b => b.shown);
}


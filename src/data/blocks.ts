import { aoeCircleRadius, randomCurveMaxDeg, shieldBreakMul, aoeRectSize, armorPierceMul, forkDamageFrac, CURVE_RATE_DEG, FORK_ANGLE_DEG, HOMING_CONE_DEG, HOMING_RANGE, HOMING_RATE_DEG } from '../engine/projectiles';
import { addDamage, BlockCategory, BlockDef, gateDamage, Modifier, mulDamage, Packet, Rarity, Rel } from '../engine/compilerTypes';
import {
  alternatorMul, boomerangRange, capacitorMul, CAPACITOR_N, chainJumps, CHAIN_ARC_LIFE, CHAIN_FRAC, CHAIN_RANGE, corrosionCap,
  CORROSION_STEP, delaySeconds, executionerMul, EXECUTIONER_BELOW, frostBonus, frostSlow, frostTime, igniteFrac, IGNITE_TIME,
  mineDistance, MINE_WAIT, orbitTime, ORBIT_RADIUS, ORBIT_REHIT, overclockAverage, overclockGain, OVERCLOCK_CAP, OVERCLOCK_WINDOW,
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
const gamblerProb = (l: number) => 0.5 + 0.05 * (l - 1);

/**
 * Data hook for the future perk behind the Crossover block. Lines already cross freely in
 * empty cells, so the block currently does nothing; add the benefit here (it receives each
 * signal's packet) and flip `shown` on the Crossover entry.
 */
export function crossoverBonus(_packet: Packet, _level: number): void {
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
export const RARITY_PRICE: Record<Rarity, number> = { common: 150, uncommon: 500, rare: 800, epic: 1200 };

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
  id: 'random_router', name: 'Random Router', category: 'pathing', maxLevel: 1, outputs: ['L', 'F', 'R'],
  desc: 'Sends the signal left, straight or right at random, dividing its damage by three.',
  transform: (p) => { mulDamage(p, 1 / 3); },
  shown: false, hideReason: 'Random routing is not modelled; as a fixed three-way split it would just duplicate Splitter 3.',
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
  desc: (l) => `Adds +${100 * l} damage to each projectile.`,
  transform: (p, l) => { addDamage(p, 100 * l); },
  shown: true,
});
register({
  id: 'percent_mult', name: 'Percent ×', category: 'damage', maxLevel: 10, outputs: FWD,
  desc: (l) => `Multiplies projectile damage by ×${1 + 0.5 * l}.`,
  transform: (p, l) => { mulDamage(p, 1 + 0.5 * l); },
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

// Mitosis-aware blocks
modBlock('fission_catalyst', 'Fission Catalyst', 'damage', 1, { type: 'fission_catalyst' }, 'Affects how enemies split.');
modBlock('cauterize', 'Cauterize', 'damage', 1, { type: 'cauterize' }, 'Prevents splitting.');
modBlock('cleaver', 'Cleaver', 'damage', 1, { type: 'cleaver' }, 'Cleaves enemies.');
modBlock('culling_bolt', 'Culling Bolt', 'damage', 1, { type: 'culling_bolt' }, 'Culls weak enemies.');
modBlock('residue_seed', 'Residue Seed', 'damage', 1, { type: 'residue_seed' }, 'Leaves residue.');
modBlock('overkill_spill', 'Overkill Spill', 'damage', 1, { type: 'overkill_spill' }, 'Spills overkill damage.');

// ---------------------------------------------------------------- Projectile modifiers
/** A shown projectile modifier whose strength scales with the block level (the level travels in the modifier). */
function levelMod(id: string, name: string, maxLevel: number, mod: Modifier, desc: (l: number) => string) {
  register({
    id, name, category: 'modifier', maxLevel, outputs: FWD, desc, shown: true,
    transform: (p, l) => { p.mods.push({ ...mod, level: l }); },
  });
}

levelMod('piercing', 'Piercing', 5, { type: 'piercing' },
  (l) => l === 1
    ? 'Projectiles pass through enemies. Each hit costs the projectile the damage it dealt (at least 10% of its damage).'
    : `Projectiles pass through enemies. Each hit costs the projectile 1/${l} of the damage it dealt (at least ${Math.round(10 / l * 10) / 10}% of its damage).`);
levelMod('bouncing', 'Bouncing', 5, { type: 'bouncing' },
  (l) => `Projectiles that hit an armored enemy ricochet in a random direction, keeping their damage${l > 1 ? ` and gaining ${(l - 1) * 10}% on every ricochet` : ''}.`);
levelMod('aoe_circle', 'AoE - Circle', 5, { type: 'aoe_circle' },
  (l) => `Projectiles explode on impact, hitting every enemy within ${aoeCircleRadius(l)} units for full damage.`);
levelMod('shield_breaker', 'Shield-Breaker', 3, { type: 'shield_breaker' },
  (l) => `Direct damage ×${shieldBreakMul(l)}, and shields take double on top of that.`);
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
  (l) => `Flies up to ${boomerangRange(l)} px, returns to the ship and hits on both legs, then disappears at the ship.`);
newMod('orbit', 'Orbit', 'modifier', 'rare', 'orbit',
  (l) => `Circles the ship at ${ORBIT_RADIUS} px for ${orbitTime(l)} s, then launches in its original direction. Can hit while orbiting, the same target at most once per ${ORBIT_REHIT} s.`);
newMod('chain_lightning', 'Chain Lightning', 'modifier', 'epic', 'chain_lightning',
  (l) => `On a hit, jumps to up to ${chainJumps(l)} more targets within ${CHAIN_RANGE} px for ${pct(CHAIN_FRAC)}% damage each, drawing a short arc (${CHAIN_ARC_LIFE} s). In the Wall it jumps to nearby blocks.`);
newMod('mine', 'Mine', 'modifier', 'uncommon', 'mine',
  (l) => `Stops after ${mineDistance(l)} px and waits up to ${MINE_WAIT} s; detonates for its full damage when something touches it. In the Wall it stays where it is and the wall runs into it.`);
modBlock('gravity_well', 'Gravity Well', 'modifier', 3, { type: 'gravity_well' }, 'Projectiles pull enemies in.');
modBlock('magnetized', 'Magnetized', 'modifier', 1, { type: 'magnetized' }, 'Projectiles are magnetised.');

levelMod('curving_right', 'Curving Right', 3, { type: 'curve', dir: 'right' },
  (l) => `After launch, projectiles turn clockwise at ${CURVE_RATE_DEG * l}° per second.`);
levelMod('random_curve', 'Random Curve', 3, { type: 'random_curve' },
  (l) => `Projectiles weave on smooth random steering, turning at most ${randomCurveMaxDeg(l)}° per second.`);
levelMod('homing', 'Homing', 5, { type: 'homing' },
  (l) => `Projectiles steer at ${HOMING_RATE_DEG * l}° per second toward the nearest enemy within ${HOMING_RANGE} px and a ${HOMING_CONE_DEG}° cone ahead. With no target they fly straight.`);
levelMod('aoe_rect', 'AoE - Rectangle', 5, { type: 'aoe_rect' },
  (l) => { const r = aoeRectSize(l); return `Projectiles detonate on impact as a horizontal bar ${r.w} px wide and ${r.h} px tall, hitting every enemy it overlaps once for full damage.`; });
levelMod('fork_impact', 'Fork on Impact', 3, { type: 'fork_impact' },
  (l) => `On a hit, spawns 2 copies at ${Math.round(forkDamageFrac(l) * 100)}% damage and 0.6× size, flying ±${FORK_ANGLE_DEG}° off the heading. Copies cannot fork again.`);
levelMod('armor_piercer', 'Armor-Piercer Tip', 3, { type: 'armor_piercer' },
  (l) => `Deals ×${armorPierceMul(l)} damage to enemies that have armor. No effect on unarmored enemies.`);

// ---------------------------------------------------------------- Status & elemental
newMod('ignite', 'Ignite', 'status', 'uncommon', 'ignite',
  (l) => `A hit sets the target on fire: ${pct(igniteFrac(l))}% of the hit damage per second for ${IGNITE_TIME} s (ignores armor). A new hit refreshes the burn, it does not stack.`);
newMod('frostbite', 'Frostbite', 'status', 'rare', 'frostbite',
  (l) => `A hit slows the target's drift by ${pct(frostSlow(l))}% for ${frostTime(l)} s (rocks; wall blocks do not move). Frozen targets take +${pct(frostBonus(l))}% damage from everything.`);
newMod('corrosion', 'Corrosion', 'status', 'rare', 'corrosion',
  (l) => `Each hit removes ${pct(CORROSION_STEP)}% of the target's remaining armor, up to ${pct(corrosionCap(l))}% of it in total. Armored wall blocks lose their thick frame as it is stripped.`);
modBlock('static_charge', 'Static Charge', 'status', 1, { type: 'static_charge' }, 'Charges enemies.');
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
};

/** Blocks the player can place, in picker order. */
export function pickerBlocks(): BlockDef[] {
  return Object.values(BLOCKS).filter(b => b.shown);
}

export const CATEGORY_LABEL: Record<BlockCategory, string> = {
  pathing: 'Pathing', damage: 'Damage', modifier: 'Modifiers', status: 'Status', mitosis: 'Mitosis', passive: 'Passive',
};

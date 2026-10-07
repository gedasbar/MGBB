import { addDamage, BlockCategory, BlockDef, gateDamage, Modifier, mulDamage, Packet, Rel } from '../engine/compilerTypes';

export const BLOCKS: Record<string, BlockDef> = {};

function register(b: BlockDef) {
  BLOCKS[b.id] = b;
}

const FWD: Rel[] = ['F'];

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
  id: 'turn_l', name: 'Turn Left', category: 'pathing', maxLevel: 1, outputs: ['L'],
  desc: 'Turns the signal 90° to the left.',
  shown: true,
});
register({
  id: 'turn_r', name: 'Turn Right', category: 'pathing', maxLevel: 1, outputs: ['R'],
  desc: 'Turns the signal 90° to the right.',
  shown: true,
});
register({
  id: 'splitter_2', name: 'Splitter 2', category: 'pathing', maxLevel: 1, outputs: ['L', 'R'],
  desc: 'Splits the signal into two full copies, one to the left and one to the right.',
  shown: true,
});
register({
  id: 'splitter_3', name: 'Splitter 3', category: 'pathing', maxLevel: 1, outputs: ['L', 'F', 'R'],
  desc: 'Splits the signal into three full copies: left, straight on and right.',
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
  id: 'alternator', name: 'Alternator', category: 'pathing', maxLevel: 1, outputs: ['L', 'R'],
  desc: 'Alternates the signal between left and right, doubling its damage.',
  transform: (p) => { mulDamage(p, 2); },
  shown: false, hideReason: 'Needs per-pulse state; the compiler is a pure function, so alternating cannot be expressed yet.',
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
  id: 'delay_line', name: 'Delay Line', category: 'pathing', maxLevel: 5, outputs: FWD,
  desc: 'Delays the signal.',
  shown: false, hideReason: 'Timing is not modelled by the compiler and nothing in Fly consumes it.',
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
  id: 'lucky_strike', name: 'Lucky Strike', category: 'damage', maxLevel: 1, outputs: FWD,
  desc: '33% chance to double projectile damage.',
  transform: (p) => { gateDamage(p, { prob: 0.33, mult: 2, elseMult: 1 }); },
  shown: true,
});
register({
  id: 'jackpot', name: 'Jackpot', category: 'damage', maxLevel: 1, outputs: FWD,
  desc: '4% chance to multiply projectile damage by 10.',
  transform: (p) => { gateDamage(p, { prob: 0.04, mult: 10, elseMult: 1 }); },
  shown: true,
});
register({
  id: 'gamblers_gate', name: 'Gambler’s Gate', category: 'damage', maxLevel: 1, outputs: FWD,
  desc: '50% chance to triple projectile damage, otherwise the projectile is lost.',
  transform: (p) => { gateDamage(p, { prob: 0.5, mult: 3, elseMult: 0 }); },
  shown: true,
});
modBlock('overclock', 'Overclock', 'damage', 1, { type: 'overclock' }, 'Overclocks the pulse.');
modBlock('capacitor', 'Capacitor', 'damage', 1, { type: 'capacitor' }, 'Stores charge between pulses.');
modBlock('berserker_coil', 'Berserker Coil', 'damage', 1, { type: 'berserker' }, 'Damage rises as hull falls.');
modBlock('executioner', 'Executioner', 'damage', 1, { type: 'executioner' }, 'Bonus damage to weak enemies.');
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
modBlock('piercing', 'Piercing', 'modifier', 3, { type: 'piercing' },
  'Projectiles pass through enemies. Each hit costs the projectile the damage it dealt (at least 10% of its damage).', true);
modBlock('bouncing', 'Bouncing', 'modifier', 5, { type: 'bouncing' },
  'Projectiles that hit an armored enemy ricochet in a random direction, keeping their damage.', true);
modBlock('aoe_circle', 'AoE - Circle', 'modifier', 5, { type: 'aoe_circle' },
  'Projectiles explode on impact, hitting every enemy within 50 units for full damage.', true);
modBlock('shield_breaker', 'Shield-Breaker', 'modifier', 3, { type: 'shield_breaker' },
  'Direct damage ×1.5, and shields take double on top of that.', true);
register({
  id: 'pure_converter', name: 'Pure Converter', category: 'modifier', maxLevel: 5, outputs: FWD,
  desc: (l) => `Converts ${15 * l}% of projectile damage to pure damage, which ignores armor.`,
  transform: (p, l) => { p.pure = Math.min(1, p.pure + 0.15 * l); },
  shown: true,
});
modBlock('curving_right', 'Curving Right', 'modifier', 3, { type: 'curve', dir: 'right' }, 'Projectiles curve right.');
modBlock('random_curve', 'Random Curve', 'modifier', 1, { type: 'random_curve' }, 'Projectiles curve at random.');
modBlock('boomerang', 'Boomerang', 'modifier', 1, { type: 'boomerang' }, 'Projectiles return.');
modBlock('homing', 'Homing', 'modifier', 5, { type: 'homing' }, 'Projectiles home in.');
modBlock('orbit', 'Orbit', 'modifier', 3, { type: 'orbit' }, 'Projectiles orbit the ship.');
modBlock('aoe_rect', 'AoE - Rectangle', 'modifier', 5, { type: 'aoe_rect' }, 'Projectiles explode in a rectangle.');
modBlock('chain_lightning', 'Chain Lightning', 'modifier', 5, { type: 'chain_lightning' }, 'Hits chain to nearby enemies.');
modBlock('fork_impact', 'Fork on Impact', 'modifier', 3, { type: 'fork_impact' }, 'Projectiles fork on impact.');
modBlock('mine', 'Mine', 'modifier', 1, { type: 'mine' }, 'Projectiles become mines.');
modBlock('gravity_well', 'Gravity Well', 'modifier', 3, { type: 'gravity_well' }, 'Projectiles pull enemies in.');
modBlock('magnetized', 'Magnetized', 'modifier', 1, { type: 'magnetized' }, 'Projectiles are magnetised.');
modBlock('armor_piercer', 'Armor-Piercer Tip', 'modifier', 3, { type: 'armor_piercer' }, 'Bonus damage against armor.', false,
  'The projectile system reads the modifier id "armor_piercer_tip" but this block emits "armor_piercer", and the engine doubles all direct damage rather than only damage against armor. Needs an engine fix first.');

// ---------------------------------------------------------------- Status & elemental
modBlock('ignite', 'Ignite', 'status', 5, { type: 'ignite' }, 'Sets enemies on fire.');
modBlock('frostbite', 'Frostbite', 'status', 1, { type: 'frostbite' }, 'Slows enemies.');
modBlock('corrosion', 'Corrosion', 'status', 5, { type: 'corrosion' }, 'Corrodes armor.');
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

/** Blocks the player can place, in picker order. */
export function pickerBlocks(): BlockDef[] {
  return Object.values(BLOCKS).filter(b => b.shown);
}

export const CATEGORY_LABEL: Record<BlockCategory, string> = {
  pathing: 'Pathing', damage: 'Damage', modifier: 'Modifiers', status: 'Status', mitosis: 'Mitosis', passive: 'Passive',
};

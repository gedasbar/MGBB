import { BlockDef, clonePacket } from '../engine/compilerTypes';

export const BLOCKS: Record<string, BlockDef> = {};

function register(b: BlockDef) {
  BLOCKS[b.id] = b;
}

// 1. Pathing (red)
register({
  id: 'generator', name: 'Generator', category: 'pathing', maxLevel: 1,
  desc: 'Produces packets.',
  ports: { N: 'out' },
  apply: (p) => [{ localOut: 'N', packet: p }]
});
register({
  id: 'ejector', name: 'Ejector', category: 'pathing', maxLevel: 1,
  ports: { S: 'in' },
  apply: () => []
});
register({
  id: 'straight', name: 'Straight', category: 'pathing', maxLevel: 1,
  desc: 'Moves signal straight.',
  ports: { S: 'in', N: 'out' },
  apply: (p) => [{ localOut: 'N', packet: p }]
});
register({
  id: 'turn_l', name: 'Turn L', category: 'pathing', maxLevel: 1,
  desc: 'Turns signal left.',
  ports: { S: 'in', W: 'out' },
  apply: (p) => [{ localOut: 'W', packet: p }]
});
register({
  id: 'turn_r', name: 'Turn R', category: 'pathing', maxLevel: 1,
  desc: 'Turns signal right.',
  ports: { S: 'in', E: 'out' },
  apply: (p) => [{ localOut: 'E', packet: p }]
});
register({
  id: 'splitter_2', name: 'Splitter 2', category: 'pathing', maxLevel: 1,
  desc: 'Splits signal into 2 streams.',
  ports: { S: 'in', W: 'out', E: 'out' },
  apply: (p) => [
    { localOut: 'W', packet: clonePacket(p) },
    { localOut: 'E', packet: clonePacket(p) }
  ]
});
register({
  id: 'splitter_3', name: 'Splitter 3', category: 'pathing', maxLevel: 1,
  desc: 'Splits signal into 3 streams.',
  ports: { S: 'in', W: 'out', N: 'out', E: 'out' },
  apply: (p) => [
    { localOut: 'W', packet: clonePacket(p) },
    { localOut: 'N', packet: clonePacket(p) },
    { localOut: 'E', packet: clonePacket(p) }
  ]
});
register({
  id: 'crossover', name: 'Crossover', category: 'pathing', maxLevel: 1,
  desc: 'Allows two signals to cross without intersecting.',
  ports: { N: 'both', E: 'both', S: 'both', W: 'both' },
  apply: (p, inDir) => {
    // S->N, N->S, W->E, E->W
    if (inDir === 'S') { p.axisLock = 'V'; return [{ localOut: 'N', packet: p }]; }
    if (inDir === 'N') { p.axisLock = 'V'; return [{ localOut: 'S', packet: p }]; }
    if (inDir === 'W') { p.axisLock = 'H'; return [{ localOut: 'E', packet: p }]; }
    if (inDir === 'E') { p.axisLock = 'H'; return [{ localOut: 'W', packet: p }]; }
    return [];
  }
});

// Remaining pathing blocks
register({
  id: 'diode', name: 'Diode', category: 'pathing', maxLevel: 1,
  ports: { S: 'in', N: 'out' },
  apply: (p) => [{ localOut: 'N', packet: p }]
});
register({
  id: 'alternator', name: 'Alternator', category: 'pathing', maxLevel: 1,
  ports: { S: 'in', W: 'out', E: 'out' },
  apply: (p, _inDir, _level, state) => {
    state.alt = !state.alt;
    p.damage *= 2;
    return [{ localOut: state.alt ? 'W' : 'E', packet: p }];
  }
});
register({
  id: 'random_router', name: 'Random Router', category: 'pathing', maxLevel: 1,
  ports: { S: 'in', W: 'out', N: 'out', E: 'out' },
  apply: (p) => {
    p.damage /= 3;
    return [
      { localOut: 'W', packet: clonePacket(p) },
      { localOut: 'N', packet: clonePacket(p) },
      { localOut: 'E', packet: clonePacket(p) }
    ];
  }
});
register({
  id: 'merger', name: 'Merger', category: 'pathing', maxLevel: 1,
  ports: { W: 'in', E: 'in', N: 'out' },
  apply: (p) => [{ localOut: 'N', packet: p }]
});
register({
  id: 'delay_line', name: 'Delay Line', category: 'pathing', maxLevel: 5,
  ports: { S: 'in', N: 'out' },
  apply: (p) => [{ localOut: 'N', packet: p }]
});
register({
  id: 'portal_pair', name: 'Portal Pair', category: 'pathing', maxLevel: 1,
  ports: { S: 'in', N: 'out', E: 'in', W: 'out' },
  apply: (p) => [{ localOut: 'N', packet: p }]
});
register({
  id: 'reflector', name: 'Reflector', category: 'pathing', maxLevel: 1,
  ports: { S: 'in', N: 'out' },
  apply: (p, inDir) => [{ localOut: inDir, packet: p }]
});
register({
  id: 'armored_plating', name: 'Armored Plating', category: 'pathing', maxLevel: 1,
  ports: {},
  apply: () => []
});

// Damage / scaling blocks
register({
  id: 'flat_plus', name: 'Flat +', category: 'damage', maxLevel: 10,
  ports: { S: 'in', N: 'out' },
  apply: (p, _inDir, level) => {
    p.damage += 100 * level;
    return [{ localOut: 'N', packet: p }];
  }
});
register({
  id: 'percent_mult', name: 'Percent ×', category: 'damage', maxLevel: 10,
  ports: { S: 'in', N: 'out' },
  apply: (p, _inDir, level) => {
    p.damage *= (1 + 0.5 * level);
    return [{ localOut: 'N', packet: p }];
  }
});
register({
  id: 'lucky_strike', name: 'Lucky Strike', category: 'damage', maxLevel: 1,
  ports: { S: 'in', N: 'out' },
  apply: (p) => {
    p.gates.push({ prob: 0.33, type: 'x2' });
    p.damage *= 1.33;
    return [{ localOut: 'N', packet: p }];
  }
});
register({
  id: 'jackpot', name: 'Jackpot', category: 'damage', maxLevel: 1,
  ports: { S: 'in', N: 'out' },
  apply: (p) => {
    p.gates.push({ prob: 0.04, type: 'x10' });
    p.damage *= 1.36;
    return [{ localOut: 'N', packet: p }];
  }
});
register({
  id: 'gamblers_gate', name: 'Gamblers Gate', category: 'damage', maxLevel: 1,
  ports: { S: 'in', N: 'out' },
  apply: (p) => {
    p.gates.push({ prob: 0.5, type: 'delete_or_x3' });
    p.damage *= 1.5; 
    return [{ localOut: 'N', packet: p }];
  }
});
register({
  id: 'overclock', name: 'Overclock', category: 'damage', maxLevel: 1,
  ports: { S: 'in', N: 'out' },
  apply: (p) => { p.mods.push({ type: 'overclock' }); return [{ localOut: 'N', packet: p }]; }
});
register({
  id: 'capacitor', name: 'Capacitor', category: 'damage', maxLevel: 1,
  ports: { S: 'in', N: 'out' },
  apply: (p) => { p.mods.push({ type: 'capacitor' }); return [{ localOut: 'N', packet: p }]; }
});
register({
  id: 'berserker_coil', name: 'Berserker Coil', category: 'damage', maxLevel: 1,
  ports: { S: 'in', N: 'out' },
  apply: (p) => { p.mods.push({ type: 'berserker' }); return [{ localOut: 'N', packet: p }]; }
});
register({
  id: 'executioner', name: 'Executioner', category: 'damage', maxLevel: 1,
  ports: { S: 'in', N: 'out' },
  apply: (p) => { p.mods.push({ type: 'executioner' }); return [{ localOut: 'N', packet: p }]; }
});
register({
  id: 'tithe', name: 'Tithe', category: 'damage', maxLevel: 1,
  ports: { S: 'in', N: 'out' },
  apply: (p) => { p.damage *= 0.8; p.mods.push({ type: 'tithe' }); return [{ localOut: 'N', packet: p }]; }
});

// 5.5 Mitosis-aware blocks
register({
  id: 'fission_catalyst', name: 'Fission Catalyst', category: 'damage', maxLevel: 1,
  ports: { S: 'in', N: 'out' },
  apply: (p) => { p.mods.push({ type: 'fission_catalyst' }); return [{ localOut: 'N', packet: p }]; }
});
register({
  id: 'cauterize', name: 'Cauterize', category: 'damage', maxLevel: 1,
  ports: { S: 'in', N: 'out' },
  apply: (p) => { p.mods.push({ type: 'cauterize' }); return [{ localOut: 'N', packet: p }]; }
});
register({
  id: 'cleaver', name: 'Cleaver', category: 'damage', maxLevel: 1,
  ports: { S: 'in', N: 'out' },
  apply: (p) => { p.mods.push({ type: 'cleaver' }); return [{ localOut: 'N', packet: p }]; }
});
register({
  id: 'culling_bolt', name: 'Culling Bolt', category: 'damage', maxLevel: 1,
  ports: { S: 'in', N: 'out' },
  apply: (p) => { p.mods.push({ type: 'culling_bolt' }); return [{ localOut: 'N', packet: p }]; }
});
register({
  id: 'residue_seed', name: 'Residue Seed', category: 'damage', maxLevel: 1,
  ports: { S: 'in', N: 'out' },
  apply: (p) => { p.mods.push({ type: 'residue_seed' }); return [{ localOut: 'N', packet: p }]; }
});
register({
  id: 'overkill_spill', name: 'Overkill Spill', category: 'damage', maxLevel: 1,
  ports: { S: 'in', N: 'out' },
  apply: (p) => { p.mods.push({ type: 'overkill_spill' }); return [{ localOut: 'N', packet: p }]; }
});

// 5.3 Projectile behavior modifiers
register({ id: 'piercing', name: 'Piercing', category: 'modifier', maxLevel: 3, ports: { S: 'in', N: 'out' }, apply: (p) => { p.mods.push({ type: 'piercing' }); return [{ localOut: 'N', packet: p }]; } });
register({ id: 'bouncing', name: 'Bouncing', category: 'modifier', maxLevel: 5, ports: { S: 'in', N: 'out' }, apply: (p) => { p.mods.push({ type: 'bouncing' }); return [{ localOut: 'N', packet: p }]; } });
register({ id: 'curving_right', name: 'Curving Right', category: 'modifier', maxLevel: 3, ports: { S: 'in', N: 'out' }, apply: (p) => { p.mods.push({ type: 'curve', dir: 'right' }); return [{ localOut: 'N', packet: p }]; } });
register({ id: 'random_curve', name: 'Random Curve', category: 'modifier', maxLevel: 1, ports: { S: 'in', N: 'out' }, apply: (p) => { p.mods.push({ type: 'random_curve' }); return [{ localOut: 'N', packet: p }]; } });
register({ id: 'boomerang', name: 'Boomerang', category: 'modifier', maxLevel: 1, ports: { S: 'in', N: 'out' }, apply: (p) => { p.mods.push({ type: 'boomerang' }); return [{ localOut: 'N', packet: p }]; } });
register({ id: 'homing', name: 'Homing', category: 'modifier', maxLevel: 5, ports: { S: 'in', N: 'out' }, apply: (p) => { p.mods.push({ type: 'homing' }); return [{ localOut: 'N', packet: p }]; } });
register({ id: 'orbit', name: 'Orbit', category: 'modifier', maxLevel: 3, ports: { S: 'in', N: 'out' }, apply: (p) => { p.mods.push({ type: 'orbit' }); return [{ localOut: 'N', packet: p }]; } });
register({ id: 'aoe_circle', name: 'AoE - Circle', category: 'modifier', maxLevel: 5, ports: { S: 'in', N: 'out' }, apply: (p) => { p.mods.push({ type: 'aoe_circle' }); return [{ localOut: 'N', packet: p }]; } });
register({ id: 'aoe_rect', name: 'AoE - Rectangle', category: 'modifier', maxLevel: 5, ports: { S: 'in', N: 'out' }, apply: (p) => { p.mods.push({ type: 'aoe_rect' }); return [{ localOut: 'N', packet: p }]; } });
register({ id: 'chain_lightning', name: 'Chain Lightning', category: 'modifier', maxLevel: 5, ports: { S: 'in', N: 'out' }, apply: (p) => { p.mods.push({ type: 'chain_lightning' }); return [{ localOut: 'N', packet: p }]; } });
register({ id: 'fork_impact', name: 'Fork on Impact', category: 'modifier', maxLevel: 3, ports: { S: 'in', N: 'out' }, apply: (p) => { p.mods.push({ type: 'fork_impact' }); return [{ localOut: 'N', packet: p }]; } });
register({ id: 'mine', name: 'Mine', category: 'modifier', maxLevel: 1, ports: { S: 'in', N: 'out' }, apply: (p) => { p.mods.push({ type: 'mine' }); return [{ localOut: 'N', packet: p }]; } });
register({ id: 'gravity_well', name: 'Gravity Well', category: 'modifier', maxLevel: 3, ports: { S: 'in', N: 'out' }, apply: (p) => { p.mods.push({ type: 'gravity_well' }); return [{ localOut: 'N', packet: p }]; } });
register({ id: 'magnetized', name: 'Magnetized', category: 'modifier', maxLevel: 1, ports: { S: 'in', N: 'out' }, apply: (p) => { p.mods.push({ type: 'magnetized' }); return [{ localOut: 'N', packet: p }]; } });
register({ id: 'pure_converter', name: 'Pure Converter', category: 'modifier', maxLevel: 5, ports: { S: 'in', N: 'out' }, apply: (p, _dir, level) => { p.pure += 0.15 * level; return [{ localOut: 'N', packet: p }]; } });
register({ id: 'armor_piercer', name: 'Armor-Piercer Tip', category: 'modifier', maxLevel: 3, ports: { S: 'in', N: 'out' }, apply: (p) => { p.mods.push({ type: 'armor_piercer' }); return [{ localOut: 'N', packet: p }]; } });
register({ id: 'shield_breaker', name: 'Shield-Breaker', category: 'modifier', maxLevel: 3, ports: { S: 'in', N: 'out' }, apply: (p) => { p.mods.push({ type: 'shield_breaker' }); return [{ localOut: 'N', packet: p }]; } });

// 5.4 Status & elemental
register({ id: 'ignite', name: 'Ignite', category: 'status', maxLevel: 5, ports: { S: 'in', N: 'out' }, apply: (p) => { p.mods.push({ type: 'ignite' }); return [{ localOut: 'N', packet: p }]; } });
register({ id: 'frostbite', name: 'Frostbite', category: 'status', maxLevel: 1, ports: { S: 'in', N: 'out' }, apply: (p) => { p.mods.push({ type: 'frostbite' }); return [{ localOut: 'N', packet: p }]; } });
register({ id: 'corrosion', name: 'Corrosion', category: 'status', maxLevel: 5, ports: { S: 'in', N: 'out' }, apply: (p) => { p.mods.push({ type: 'corrosion' }); return [{ localOut: 'N', packet: p }]; } });
register({ id: 'static_charge', name: 'Static Charge', category: 'status', maxLevel: 1, ports: { S: 'in', N: 'out' }, apply: (p) => { p.mods.push({ type: 'static_charge' }); return [{ localOut: 'N', packet: p }]; } });
register({ id: 'magnetize_target', name: 'Magnetize Target', category: 'status', maxLevel: 1, ports: { S: 'in', N: 'out' }, apply: (p) => { p.mods.push({ type: 'magnetize_target' }); return [{ localOut: 'N', packet: p }]; } });
register({ id: 'vampiric', name: 'Vampiric', category: 'status', maxLevel: 3, ports: { S: 'in', N: 'out' }, apply: (p) => { p.mods.push({ type: 'vampiric' }); return [{ localOut: 'N', packet: p }]; } });

// 5.6 Passives
register({ id: 'shield_emitter', name: 'Shield Emitter', category: 'passive', maxLevel: 5, ports: {}, apply: () => [] });
register({ id: 'magnet_core', name: 'Magnet Core', category: 'passive', maxLevel: 5, ports: {}, apply: () => [] });
register({ id: 'thruster', name: 'Thruster', category: 'passive', maxLevel: 5, ports: {}, apply: () => [] });
register({ id: 'targeting_lens', name: 'Targeting Lens', category: 'passive', maxLevel: 5, ports: {}, apply: () => [] });
register({ id: 'capacitor_bank', name: 'Capacitor Bank', category: 'passive', maxLevel: 5, ports: {}, apply: () => [] });
register({ id: 'lucky_charm', name: 'Lucky Charm', category: 'passive', maxLevel: 5, ports: {}, apply: () => [] });
register({ id: 'sensor_array', name: 'Sensor Array', category: 'passive', maxLevel: 3, ports: {}, apply: () => [] });

export type Dir = 'N' | 'E' | 'S' | 'W';
export const DIRS: Dir[] = ['N', 'E', 'S', 'W'];
export const DIR_OPPOSITE: Record<Dir, Dir> = { N: 'S', E: 'W', S: 'N', W: 'E' };

export function rotateDir(d: Dir, steps: number): Dir {
  const idx = DIRS.indexOf(d);
  return DIRS[(((idx + steps) % 4) + 4) % 4] as Dir;
}

/** A relative direction of travel: forward, left or right of the way the signal is moving. */
export type Rel = 'F' | 'L' | 'R';

/** Block orientation in degrees clockwise. 0 = facing up (input on the south/back side). */
export type Rotation = 0 | 90 | 180 | 270;

export function dirToRotation(d: Dir): Rotation {
  return (DIRS.indexOf(d) * 90) as Rotation;
}

export function rotationToDir(r: Rotation): Dir {
  return DIRS[(r / 90) % 4] as Dir;
}

export function normalizeRotation(deg: number): Rotation {
  return ((((Math.round(deg / 90) * 90) % 360) + 360) % 360) as Rotation;
}

/** The absolute direction a signal leaves in, given its travel direction and a relative output. */
export function relToDir(travel: Dir, rel: Rel): Dir {
  if (rel === 'F') return travel;
  return rotateDir(travel, rel === 'R' ? 1 : -1);
}

export interface Modifier {
  type: string;
  [key: string]: any;
}

/**
 * A chance multiplier that is rolled at fire time. With probability `prob` the damage is
 * multiplied by `mult`, otherwise by `elseMult` (0 means the projectile is lost).
 */
export interface ChanceGate {
  prob: number;
  mult: number;
  elseMult: number;
}

/** Damage operations, kept in path order so the order of blocks matters. */
export type DamageOp =
  | { t: 'add'; v: number }
  | { t: 'mul'; v: number }
  | { t: 'gate'; gate: ChanceGate }
  // Stateful stages (chunk 9a). They are evaluated per pulse by the Gun (src/game/fire.ts); the expected-value replay below
  // uses their average effect: Overclock `avg`, Capacitor n x mul. Alternator and Delay Line do not change the damage.
  | { t: 'oc'; gain: number; cap: number; avg: number }
  | { t: 'cap'; n: number; mul: number }
  | { t: 'alt'; key: number; branch: number; of: number }
  | { t: 'delay'; sec: number };

/** True when a packet's damage depends on state that changes from pulse to pulse (needs the Gun's evaluator). */
export function isDynamic(p: Packet): boolean {
  for (const op of p.ops) if (op.t === 'oc' || op.t === 'cap' || op.t === 'alt' || op.t === 'delay') return true;
  return false;
}

/**
 * Share of the pulses on which a packet is emitted: 1/n per Capacitor, 1/2 per Alternator branch. `pulse` is the part
 * from capacitors alone (how much longer the interval between its shots is), `branch` the part from alternators.
 */
export function emitRate(p: Packet): { pulse: number; branch: number } {
  let pulse = 1;
  let branch = 1;
  for (const op of p.ops) {
    if (op.t === 'cap') pulse /= op.n;
    else if (op.t === 'alt') branch /= op.of;
  }
  return { pulse, branch };
}

export interface Packet {
  /** Deterministic damage: every add/mul applied in order, chance gates NOT applied. */
  damage: number;
  pure: number; // 0..1
  count: number;
  speedMul: number;
  lifeMul: number;
  sizeMul: number;
  mods: Modifier[];
  gates: ChanceGate[];
  ops: DamageOp[];
  tags: Set<string>;
}

export function newPacket(): Packet {
  return { damage: 1, pure: 0, count: 1, speedMul: 1, lifeMul: 1, sizeMul: 1, mods: [], gates: [], ops: [], tags: new Set() };
}

export function addDamage(p: Packet, v: number) {
  p.damage += v;
  p.ops.push({ t: 'add', v });
}

export function mulDamage(p: Packet, v: number) {
  p.damage *= v;
  p.ops.push({ t: 'mul', v });
}

export function gateDamage(p: Packet, gate: ChanceGate) {
  p.gates.push(gate);
  p.ops.push({ t: 'gate', gate });
}

/** Replays the damage ops. `roll` supplies a 0..1 random number per gate; without it gates use their expected value. */
export function evalDamage(p: Packet, roll?: () => number): number {
  let d = 1;
  for (const op of p.ops) {
    if (op.t === 'add') d += op.v;
    else if (op.t === 'mul') d *= op.v;
    else if (op.t === 'oc') d *= op.avg;
    else if (op.t === 'cap') d *= op.n * op.mul;
    else if (op.t === 'alt' || op.t === 'delay') continue;
    else if (roll) d *= roll() < op.gate.prob ? op.gate.mult : op.gate.elseMult;
    else d *= op.gate.prob * op.gate.mult + (1 - op.gate.prob) * op.gate.elseMult;
  }
  return d;
}

export type BlockCategory = 'pathing' | 'damage' | 'modifier' | 'status' | 'mitosis' | 'passive';

export interface BlockDef {
  id: string;
  name: string;
  category: BlockCategory;
  maxLevel: number;
  /** Relative directions the signal leaves through, applied after `transform`. */
  outputs: Rel[];
  /** Mutates the (already cloned) packet. */
  transform?: (packet: Packet, level: number) => void;
  /** The outputs take turns (Alternator): each output's packet is tagged with its branch, one fires per pulse. */
  alternates?: boolean;
  /** Shop rarity and base copy price (upgrade price follows the usual formula); set on the chunk 9a blocks. */
  rarity?: Rarity;
  baseCost?: number;
  /** Where the block is obtained: 'shop' now, a later node map may switch it to 'map'. Absent = the old shop list. */
  unlock?: 'shop' | 'map';
  /** Rule text shown in the inspector; every number comes from here. */
  desc: string | ((level: number) => string);
  /** Offered in the picker only when the compiler handles it AND it changes what the ship fires. */
  shown: boolean;
  /** Why the block is hidden (shown: false). */
  hideReason?: string;
}

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';

export function describeBlock(def: BlockDef, level = 1): string {
  return typeof def.desc === 'function' ? def.desc(level) : def.desc;
}

export function clonePacket(p: Packet): Packet {
  return {
    damage: p.damage,
    pure: p.pure,
    count: p.count,
    speedMul: p.speedMul,
    lifeMul: p.lifeMul,
    sizeMul: p.sizeMul,
    mods: p.mods.map(m => ({ ...m })),
    gates: [...p.gates],
    ops: [...p.ops],
    tags: new Set(p.tags),
  };
}

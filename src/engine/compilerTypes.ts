export type Dir = 'N' | 'E' | 'S' | 'W';
export const DIRS: Dir[] = ['N', 'E', 'S', 'W'];
export const DIR_OPPOSITE: Record<Dir, Dir> = { N: 'S', E: 'W', S: 'N', W: 'E' };

export function rotateDir(d: Dir, steps: number): Dir {
  const idx = DIRS.indexOf(d);
  return DIRS[(idx + steps) % 4] as Dir;
}

export interface Modifier {
  type: string;
  [key: string]: any;
}

export interface ChanceGate {
  prob: number;
  type: string;
}

export interface Packet {
  damage: number;
  pure: number; // 0..1
  count: number;
  speedMul: number;
  lifeMul: number;
  sizeMul: number;
  mods: Modifier[];
  gates: ChanceGate[];
  tags: Set<string>;
  axisLock?: 'H' | 'V';
}

export interface ApplyResult {
  localOut: Dir;
  packet: Packet;
}

export interface BlockDef {
  id: string;
  name: string;
  category: 'pathing' | 'damage' | 'modifier' | 'status' | 'mitosis' | 'passive';
  ports: Partial<Record<Dir, 'in' | 'out' | 'both' | 'none'>>;
  apply: (packet: Packet, inDir: Dir, level: number, state?: any) => ApplyResult[];
  maxLevel: number;
  desc?: string | ((level: number) => string);
}

export function clonePacket(p: Packet): Packet {
  return {
    damage: p.damage,
    pure: p.pure,
    count: p.count,
    speedMul: p.speedMul,
    lifeMul: p.lifeMul,
    sizeMul: p.sizeMul,
    mods: [...p.mods],
    gates: [...p.gates],
    tags: new Set(p.tags),
    axisLock: p.axisLock,
  };
}

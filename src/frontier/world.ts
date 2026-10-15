import {
  BLOCK_K, HOLE_DENSITY, MEDAL_BASE, MEDAL_FALLOFF_RINGS, MEDAL_MIN, MEDAL_POCKET_MUL, START_SAFE_RING,
} from './constants';

/** Square coordinates: integers, origin (0,0), north is up (negative y on screen). */
export const sqKey = (x: number, y: number) => `${x},${y}`;
export function parseKey(k: string): { x: number; y: number } | null {
  const m = /^(-?\d+),(-?\d+)$/.exec(k);
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  return Number.isSafeInteger(x) && Number.isSafeInteger(y) ? { x, y } : null;
}

export const ring = (x: number, y: number) => Math.max(Math.abs(x), Math.abs(y));

export type Sector = 'N' | 'E' | 'S' | 'W' | 'C';
/** East / West when |x| > |y|, else North / South (ties go to North / South). The origin is C. */
export function sector(x: number, y: number): Sector {
  if (x === 0 && y === 0) return 'C';
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'E' : 'W';
  return y < 0 ? 'N' : 'S';
}
export const SECTOR_NAME: Record<Sector, string> = { N: 'North', E: 'East', S: 'South', W: 'West', C: 'Centre' };

/** N, E, S, W. */
export const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * Seeded integer hash of a square and a salt, in [0, 1). Pure, the same on every machine (Math.imul on 32-bit ints).
 * Different salts give independent rolls for the same square.
 */
export function hash01(x: number, y: number, seed: number, salt: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(salt | 0, 0x85ebca77);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const SALT_HOLE = 1;
const SALT_MEDAL = 2;

const fdiv = (a: number, b: number) => Math.floor(a / b);
const mod = (a: number, b: number) => ((a % b) + b) % b;
export const isLattice = (x: number, y: number) => mod(x, BLOCK_K) === 0 || mod(y, BLOCK_K) === 0;

/**
 * The seeded world: which squares exist. Built per K x K block on demand and cached; never the whole plane.
 * A block's cell (i, j), 0..K-1, is the square (bx*K + i, by*K + j); i = 0 or j = 0 is the lattice (always open).
 */
export class FrontierWorld {
  private blocks = new Map<string, Uint8Array>();
  constructor(readonly seed: number) {}

  /** Blocks generated so far (for tests and the stats overlay). */
  get cachedBlocks(): number { return this.blocks.size; }

  isHole(x: number, y: number): boolean {
    if (isLattice(x, y)) return false;
    const bx = fdiv(x, BLOCK_K);
    const by = fdiv(y, BLOCK_K);
    const b = this.block(bx, by);
    return b[mod(y, BLOCK_K) * BLOCK_K + mod(x, BLOCK_K)] === 1;
  }

  isOpen(x: number, y: number): boolean { return !this.isHole(x, y); }

  /** Open N/E/S/W neighbours of a square. */
  openNeighbours(x: number, y: number): number {
    let n = 0;
    for (const [dx, dy] of NEIGHBOURS) if (this.isOpen(x + dx, y + dy)) n++;
    return n;
  }

  /** A dead-end pocket: an open square with a single open neighbour. */
  isPocket(x: number, y: number): boolean { return this.isOpen(x, y) && this.openNeighbours(x, y) === 1; }

  /** Medal marker: seeded, never on a hole, the lattice or the origin; rarer far out, likelier in a pocket. */
  hasMedal(x: number, y: number): boolean {
    if ((x === 0 && y === 0) || isLattice(x, y) || this.isHole(x, y)) return false;
    return hash01(x, y, this.seed, SALT_MEDAL) < medalChance(ring(x, y), this.isPocket(x, y));
  }

  private block(bx: number, by: number): Uint8Array {
    const key = `${bx},${by}`;
    let b = this.blocks.get(key);
    if (!b) { b = this.buildBlock(bx, by); this.blocks.set(key, b); }
    return b;
  }

  /** 1 = hole. Candidates by seeded noise, then any interior square the flood fill from the lattice cannot reach. */
  private buildBlock(bx: number, by: number): Uint8Array {
    const K = BLOCK_K;
    const out = new Uint8Array(K * K);
    for (let j = 1; j < K; j++) {
      for (let i = 1; i < K; i++) {
        const x = bx * K + i;
        const y = by * K + j;
        if (ring(x, y) <= START_SAFE_RING) continue;
        if (hash01(x, y, this.seed, SALT_HOLE) < HOLE_DENSITY) out[j * K + i] = 1;
      }
    }
    // Flood fill over the open interior, starting from every open interior square next to the lattice (the block's own
    // lattice row / column at index 0, and the next block's at index K, which is the far side of cells K-1).
    const seen = new Uint8Array(K * K);
    const stack: number[] = [];
    for (let j = 1; j < K; j++) {
      for (let i = 1; i < K; i++) {
        const edge = i === 1 || j === 1 || i === K - 1 || j === K - 1;
        const idx = j * K + i;
        if (edge && out[idx] === 0) { seen[idx] = 1; stack.push(idx); }
      }
    }
    while (stack.length) {
      const idx = stack.pop()!;
      const i = idx % K;
      const j = (idx - i) / K;
      for (const [dx, dy] of NEIGHBOURS) {
        const ni = i + dx;
        const nj = j + dy;
        if (ni < 1 || nj < 1 || ni >= K || nj >= K) continue;
        const n = nj * K + ni;
        if (out[n] === 0 && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    for (let j = 1; j < K; j++) for (let i = 1; i < K; i++) { const idx = j * K + i; if (out[idx] === 0 && !seen[idx]) out[idx] = 1; }
    return out;
  }
}

/** Medal chance at a ring: falls from MEDAL_BASE near the origin towards MEDAL_MIN; pockets get MEDAL_POCKET_MUL. */
export function medalChance(r: number, pocket: boolean): number {
  const base = MEDAL_MIN + (MEDAL_BASE - MEDAL_MIN) * Math.exp(-r / MEDAL_FALLOFF_RINGS);
  return Math.min(1, base * (pocket ? MEDAL_POCKET_MUL : 1));
}

const worlds = new Map<number, FrontierWorld>();
/** One shared, cached world per seed. */
export function getWorld(seed: number): FrontierWorld {
  let w = worlds.get(seed);
  if (!w) { w = new FrontierWorld(seed); worlds.set(seed, w); }
  return w;
}

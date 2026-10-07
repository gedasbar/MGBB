import { CONFIG } from '../config';
import { BLOCKS } from '../data/blocks';
import {
  clonePacket, Dir, DIRS, dirToRotation, evalDamage, newPacket, Packet, Rel, relToDir, Rotation, rotationToDir,
} from './compilerTypes';

export interface GridCell {
  x: number;
  y: number;
  type: 'empty' | 'void' | 'blocked' | 'generator' | 'ejector';
  /** Player-placed block; always null on fixed (non-empty) cells. */
  blockId: string | null;
  level: number;
  /** Stored orientation. Only meaningful for the signal when `manual` is true. */
  rotation: Rotation;
  /** true = the player rotated it by hand and it keeps its own orientation. */
  manual: boolean;
  /** Fixed facing of generators and ejectors. */
  facing?: Dir;
}

export interface Grid {
  w: number;
  h: number;
  cells: GridCell[];
}

export interface EjectorRecipe {
  direction: Dir;
  x: number;
  y: number;
  packet: Packet;
}

export type SegmentKind = 'live' | 'dead-end' | 'loop-cut' | 'overlap';

export interface CellRef {
  x: number;
  y: number;
}

/**
 * A straight piece of red line between two cell centres. Runs through empty cells are merged
 * into one segment; a run ends at the first block, ejector or obstruction.
 * For the non-live kinds `toCell` is the cell the signal could not enter (it may be off the grid).
 */
export interface Segment {
  fromCell: CellRef;
  toCell: CellRef;
  dir: Dir;
  kind: SegmentKind;
  reason?: string;
}

/** What the projectile looks like after passing a cell (first signal through the cell). */
export interface Ledger {
  damage: number;
  /** Expected damage, counting chance blocks at their average. */
  expectedDamage: number;
  pure: number;
  count: number;
  /** Modifier types on the packet, in path order. */
  mods: string[];
  chanceBlocks: number;
}

export interface CellInfo {
  onPath: boolean;
  ledger?: Ledger;
  /** Travel directions of the signals entering this cell. */
  inDirs: Dir[];
  outDirs: Dir[];
  effectiveRotation: Rotation;
  orientationMode: 'auto' | 'manual';
  warning?: string;
}

export interface CompileStats {
  damagePerShot: number;
  projectilesPerPulse: number;
  pulsesPerSecond: number;
  estDps: number;
  wastedBlocks: number;
  warnings: string[];
}

export interface CompiledShip {
  recipes: EjectorRecipe[];
  warnings: string[];
  segments: Segment[];
  /** One entry per grid cell, row-major. */
  cellInfo: CellInfo[];
  stats: CompileStats;
}

const STEP_CAP = 500;

function ledgerOf(p: Packet): Ledger {
  return {
    damage: p.damage,
    expectedDamage: evalDamage(p),
    pure: p.pure,
    count: p.count,
    mods: p.mods.map(m => m.type),
    chanceBlocks: p.gates.length,
  };
}
const DELTA: Record<Dir, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 }, E: { dx: 1, dy: 0 }, S: { dx: 0, dy: 1 }, W: { dx: -1, dy: 0 },
};
const REL_ORDER: Record<Rel, number> = { L: 0, F: 1, R: 2 };

export function cellLabel(x: number, y: number): string {
  return `(${x + 1},${y + 1})`;
}

interface Signal {
  x: number;
  y: number;
  dir: Dir;
  packet: Packet;
  /** (cell, direction) states this signal's own path has already been through. */
  seen: Set<number>;
}

/** Pure and deterministic: the same grid always gives the same result. */
export function compile(grid: Grid): CompiledShip {
  const { w, h, cells } = grid;
  const cellInfo: CellInfo[] = cells.map(c => ({
    onPath: false, inDirs: [], outDirs: [], effectiveRotation: c.rotation, orientationMode: c.manual ? 'manual' : 'auto',
  }));
  const segments: Segment[] = [];
  const recipes: EjectorRecipe[] = [];
  const warnings: string[] = [];
  /** idx*2 + axis (0 = vertical, 1 = horizontal): which cell axes already carry a line. */
  const claimed = new Set<number>();

  // Generators in a fixed order: top-to-bottom, left-to-right (cells are stored row-major).
  for (let gi = 0; gi < cells.length; gi++) {
    const gen = cells[gi];
    if (gen.type !== 'generator') continue;
    const facing: Dir = gen.facing ?? 'N';
    cellInfo[gi].onPath = true;
    cellInfo[gi].outDirs.push(facing);
    let steps = 0;
    const stack: Signal[] = [{ x: gen.x, y: gen.y, dir: facing, packet: newPacket(), seen: new Set() }];

    while (stack.length > 0) {
      const sig = stack.pop()!;
      const dir = sig.dir;
      const { dx, dy } = DELTA[dir];
      const axis = dir === 'N' || dir === 'S' ? 0 : 1;
      const runStart: CellRef = { x: sig.x, y: sig.y };
      let x = sig.x;
      let y = sig.y;

      for (;;) {
        const nx = x + dx;
        const ny = y + dy;
        const from: CellRef = { x, y };
        const to: CellRef = { x: nx, y: ny };

        const closeRun = (end: CellRef) => {
          if (runStart.x !== end.x || runStart.y !== end.y) {
            segments.push({ fromCell: { ...runStart }, toCell: end, dir, kind: 'live' });
          }
        };
        const stop = (kind: Exclude<SegmentKind, 'live'>, reason: string, warning: string) => {
          closeRun(from);
          segments.push({ fromCell: from, toCell: to, dir, kind, reason });
          warnings.push(warning);
        };

        if (++steps > STEP_CAP) {
          stop('dead-end', 'step cap', `Signal from the generator is longer than ${STEP_CAP} steps and was cut.`);
          break;
        }
        const noEjector = (what: string) =>
          `Signal doesn't reach an ejector: dead end at ${cellLabel(x, y)} (${what}).`;

        if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
          stop('dead-end', 'edge', noEjector('hull edge'));
          break;
        }
        const nidx = ny * w + nx;
        const cell = cells[nidx];
        const info = cellInfo[nidx];

        if (cell.type === 'void') { stop('dead-end', 'void', noEjector('empty space')); break; }
        if (cell.type === 'blocked') { stop('dead-end', 'blocked', noEjector('solid block in the way')); break; }
        if (cell.type === 'generator') { stop('dead-end', 'generator', noEjector('runs into a generator')); break; }

        if (cell.type === 'ejector') {
          const eFacing: Dir = cell.facing ?? 'N';
          if (dir !== eFacing) {
            info.warning = 'Ejector entered from the wrong side';
            stop('dead-end', 'ejector wrong side', `Signal enters the ejector at ${cellLabel(nx, ny)} from the wrong side.`);
            break;
          }
          closeRun(to);
          info.onPath = true;
          info.inDirs.push(dir);
          if (!info.ledger) info.ledger = ledgerOf(sig.packet);
          recipes.push({ direction: eFacing, x: nx, y: ny, packet: sig.packet });
          break;
        }

        const def = cell.blockId ? BLOCKS[cell.blockId] : undefined;

        if (!def) {
          // Empty buildable cell: an implicit straight piece.
          const ck = nidx * 2 + axis;
          if (claimed.has(ck)) {
            stop('overlap', 'lines overlap', `Lines overlap at ${cellLabel(nx, ny)}: the later line was cut.`);
            break;
          }
          claimed.add(ck);
          info.onPath = true;
          info.inDirs.push(dir);
          info.outDirs.push(dir);
          if (!info.ledger) info.ledger = ledgerOf(sig.packet);
          x = nx;
          y = ny;
          continue;
        }

        // A block.
        if (cell.manual && dir !== rotationToDir(cell.rotation)) {
          info.warning = 'Entered from the wrong side';
          stop('dead-end', 'wrong side', `Signal enters ${def.name} at ${cellLabel(nx, ny)} from the wrong side.`);
          break;
        }
        const stateKey = nidx * 4 + DIRS.indexOf(dir);
        if (sig.seen.has(stateKey)) {
          stop('loop-cut', 'feedback loop', `Feedback loop at ${cellLabel(nx, ny)}: the signal was cut.`);
          break;
        }
        const ck = nidx * 2 + axis;
        if (claimed.has(ck)) {
          stop('overlap', 'lines overlap', `Lines overlap at ${cellLabel(nx, ny)}: the later line was cut.`);
          break;
        }
        claimed.add(ck);
        sig.seen.add(stateKey);
        closeRun(to);

        if (!info.onPath) {
          info.onPath = true;
          info.effectiveRotation = cell.manual ? cell.rotation : dirToRotation(dir);
        }
        info.inDirs.push(dir);

        const packet = clonePacket(sig.packet);
        def.transform?.(packet, cell.level);
        if (!info.ledger) info.ledger = ledgerOf(packet);
        const outs = [...def.outputs].sort((a, b) => REL_ORDER[a] - REL_ORDER[b]);
        if (outs.length === 0) {
          warnings.push(`Signal ends inside ${def.name} at ${cellLabel(nx, ny)}: it has no output.`);
        }
        const children: Signal[] = [];
        for (const rel of outs) {
          const od = relToDir(dir, rel);
          info.outDirs.push(od);
          children.push({ x: nx, y: ny, dir: od, packet: clonePacket(packet), seen: new Set(sig.seen) });
        }
        // Reverse so the left branch is walked first.
        for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
        break;
      }
    }
  }

  if (recipes.length === 0 && !warnings.some(wn => wn.startsWith('Signal doesn'))) {
    warnings.push("No signal reaches an ejector.");
  }

  let wastedBlocks = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].type === 'empty' && cells[i].blockId && !cellInfo[i].onPath) wastedBlocks++;
  }
  const pps = CONFIG.PULSE.BASE_RATE;
  let dmgSum = 0;
  let ev = 0;
  for (const r of recipes) {
    dmgSum += r.packet.damage;
    ev += evalDamage(r.packet);
  }
  const stats: CompileStats = {
    damagePerShot: recipes.length ? dmgSum / recipes.length : 0,
    projectilesPerPulse: recipes.length,
    pulsesPerSecond: pps,
    estDps: ev * pps,
    wastedBlocks,
    warnings: [...warnings],
  };

  return { recipes, warnings, segments, cellInfo, stats };
}

import { CONFIG } from '../config';
import { BLOCKS } from '../data/blocks';
import { fireRateMul, shotSpeedMul } from '../data/hulls';
import {
  clonePacket, CompileContext, Dir, DIRS, eachShot, GENERATOR_BASE_DAMAGE, emitRate, evalDamage, mulDamage, newPacket, Packet, powerLevel, Rel, relToDir, Rotation, rotationToDir,
} from './compilerTypes';
import { NO_SKILLS, SkillEffects } from '../skills/effects';
import { ANGLE_MAX_DEG, aoeEstimateMul, heavyRoundMul, laneOffset } from './effects';

export interface GridCell {
  x: number;
  y: number;
  type: 'empty' | 'void' | 'generator' | 'ejector';
  /** Player-placed block; always null on fixed (non-empty) cells. */
  blockId: string | null;
  level: number;
  /** Stored orientation: a block is entered from the side it faces away from (0 = facing up, entered from below); any other side is a dead end. */
  rotation: Rotation;
  /** Fixed facing of generators and ejectors. */
  facing?: Dir;
}

export interface Grid {
  w: number;
  h: number;
  cells: GridCell[];
  /** Hull this grid belongs to (set by the hull builders); sets the firing stats of the worlds. Absent in test grids. */
  hullId?: string;
}

export interface EjectorRecipe {
  direction: Dir;
  x: number;
  y: number;
  packet: Packet;
  /** Sideways offset (px) of this shot from the ejector's centre line: the shots of a +1 Projectile lane stand side by side (0 = alone). */
  lane: number;
  /** True for a shot a +1 Projectile block added (not the lane's own first shot): the overload rule refuses these before normal shots. */
  extra?: boolean;
}

type SegmentKind = 'live' | 'dead-end' | 'loop-cut' | 'overlap';

interface CellRef {
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
  /** The segment leaves a generator (drawing starts at the emitter notch). */
  fromGenerator?: boolean;
  /** A live segment that ends in an ejector (drawing stops at the bullet's base). */
  toEjector?: boolean;
}

/** What the projectile looks like after passing a cell (first signal through the cell). */
interface Ledger {
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

function cellLabel(x: number, y: number): string {
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
/** Options of a compile: the extra base damage the active captain's hero level gives every packet (0 = none). */
export interface CompileOptions { skills?: SkillEffects; baseDamage?: number; /** Furthest Frontier ring reached (Frontier Echo); 0 = none. */ furthestRing?: number; /** Captain projectile speed multiplier (Heavy Round reads the real shot speed). */ projSpeedMul?: number }

/** Blocks whose damage needs to know which ejectors the circuit reaches: the compile runs twice for them. */
const NEEDS_IDLE_COUNT = 'idle_barrels';

export function compile(grid: Grid, opts: CompileOptions = {}): CompiledShip {
  const emptyCells = grid.cells.reduce((n, c) => n + (c.type === 'empty' && !c.blockId ? 1 : 0), 0);
  const ctx: CompileContext = { furthestRing: opts.furthestRing ?? 0, emptyCells, idleEjectors: 0, skills: opts.skills ?? NO_SKILLS };
  const first = compileOnce(grid, opts, ctx);
  if (!grid.cells.some(c => c.blockId === NEEDS_IDLE_COUNT)) return first;
  // Second pass: the ejectors the first pass did not reach are idle (reaching does not depend on damage).
  const reached = new Set(first.recipes.map(r => r.y * grid.w + r.x));
  const ejectors = grid.cells.filter(c => c.type === 'ejector').length;
  ctx.idleEjectors = ejectors - reached.size;
  return compileOnce(grid, opts, ctx);
}

function compileOnce(grid: Grid, opts: CompileOptions, ctx: CompileContext): CompiledShip {
  const baseDamage = GENERATOR_BASE_DAMAGE + (opts.baseDamage ?? 0);
  const { w, h, cells } = grid;
  const cellInfo: CellInfo[] = cells.map(c => ({
    onPath: false, inDirs: [], outDirs: [], effectiveRotation: c.rotation,
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
    const stack: Signal[] = [{ x: gen.x, y: gen.y, dir: facing, packet: newPacket(baseDamage), seen: new Set() }];

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

        if (cell.type === 'void') { stop('dead-end', 'void', noEjector('outside the hull')); break; }
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
          // One recipe per shot of the lane: the packet itself and the extras +1 Projectile blocks made (each only knows the blocks after its own).
          const shots = [sig.packet, ...sig.packet.extras];
          shots.forEach((shot, k) => recipes.push({ direction: eFacing, x: nx, y: ny, packet: { ...shot, extras: [] }, lane: laneOffset(k, shots.length), extra: k > 0 }));
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
        if (dir !== rotationToDir(cell.rotation)) {
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
          info.effectiveRotation = cell.rotation;
        }
        info.inDirs.push(dir);

        const packet = clonePacket(sig.packet);
        const level = powerLevel(def, cell.level);
        // The extras made by earlier +1 Projectile blocks get every block after theirs; a block that makes an extra does so inside its own transform (after this).
        for (const e of packet.extras) {
          def.transform?.(e, level, ctx);
          if (def.isTurn) e.turns++;
          if (def.keyedOp) e.ops.push(def.keyedOp(nidx, ctx));
        }
        if (def.addsShot) packet.extras.push(newPacket(packet.base + ctx.skills.plusOneBase));
        def.transform?.(packet, level, ctx);
        if (def.isTurn) packet.turns++;
        if (def.keyedOp) packet.ops.push(def.keyedOp(nidx, ctx));
        if (!info.ledger) info.ledger = ledgerOf(packet);
        const outs = [...def.outputs].sort((a, b) => REL_ORDER[a] - REL_ORDER[b]);
        if (outs.length === 0) {
          warnings.push(`Signal ends inside ${def.name} at ${cellLabel(nx, ny)}: it has no output.`);
        }
        const children: Signal[] = [];
        outs.forEach((rel, oi) => {
          const od = relToDir(dir, rel);
          info.outDirs.push(od);
          const child = clonePacket(packet);
          // An alternating block gives each output its own turn: the packet carries (block, branch) and the Gun lets one fire.
          if (def.alternates) eachShot(child, s => s.ops.push({ t: 'alt', key: nidx, branch: oi, of: outs.length }));
          // A random router: the Gun picks the output (or both) at random each pulse, from the seeded combat RNG.
          if (def.router) eachShot(child, s => s.ops.push({ t: 'rnd', key: nidx, branch: oi, of: outs.length, both: Math.min(1, def.router!.both(level) + ctx.skills.routerBoth) }));
          children.push({ x: nx, y: ny, dir: od, packet: child, seen: new Set(sig.seen) });
        });
        // Reverse so the left branch is walked first.
        for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
        break;
      }
    }
  }

  for (const s of segments) {
    if (cells[s.fromCell.y * w + s.fromCell.x].type === 'generator') s.fromGenerator = true;
    const tc = s.toCell;
    if (s.kind === 'live' && cells[tc.y * w + tc.x].type === 'ejector') s.toEjector = true;
  }

  if (recipes.length === 0 && !warnings.some(wn => wn.startsWith('Signal doesn'))) {
    warnings.push("No signal reaches an ejector.");
  }

  let wastedBlocks = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].type === 'empty' && cells[i].blockId && !cellInfo[i].onPath) wastedBlocks++;
  }
  // Heavy Round (chunk 20a) pays for slow shots; the shot's final speed is only known at the ejector, so it is the last op of the packet.
  const hullSpeed = shotSpeedMul(grid.hullId) * (opts.projSpeedMul ?? 1);
  const sk = ctx.skills;
  for (const r of recipes) {
    const p = r.packet;
    if (p.mods.some(m => m.type === 'heavy_round')) mulDamage(p, heavyRoundMul(p.speedMul * hullSpeed, sk.heavyTop));
    // Flight skills (chunk 22a): damage for shots aimed off straight (linear in the angle, full at ANGLE_MAX_DEG), for Scatter and for Accelerator copies.
    const lean = Math.min(1, Math.abs(p.angle) / ANGLE_MAX_DEG);
    const angleBonus = lean * (p.angle < 0 ? sk.angleLeftBonus : p.angle > 0 ? sk.angleRightBonus : 0);
    const scatterBonus = p.mods.some(m => m.type === 'scatter') ? sk.scatterBonus : 0;
    const accel = p.mods.reduce((n, m) => n + (m.type === 'accelerator' ? 1 : 0), 0) * sk.acceleratorBonus;
    if (angleBonus + scatterBonus + accel > 0) mulDamage(p, 1 + angleBonus + scatterBonus + accel);
    // Extender skill: a shot that passed an Extender lives longer still.
    if (sk.extenderLife > 0 && p.mods.some(m => m.type === 'extender')) p.lifeMul *= 1 + sk.extenderLife;
  }
  const basePps = CONFIG.PULSE.BASE_RATE * fireRateMul(grid.hullId);
  // Every recipe fires on a share `rate` of the pulses (1 without Capacitor / Alternator). Expected projectiles per pulse
  // is the sum of the rates; a Capacitor stretches the interval between shots (Pulses/s falls, the shot grows); an
  // Alternator's two branches add up to one projectile per pulse.
  let rateSum = 0;
  let dmgSum = 0;
  let ev = 0;
  let pulseShare = 0; // the most frequent recipe sets how often the gun fires at all
  for (const r of recipes) {
    const er = emitRate(r.packet);
    // A Mirror line fires two shots per pulse (the clone has the same damage).
    const rate = er.pulse * er.branch * (r.packet.mods.some(m => m.type === 'mirror') ? 2 + sk.mirrorMul : 1);
    rateSum += rate;
    dmgSum += rate * r.packet.damage;
    ev += rate * evalDamage(r.packet) * aoeEstimateMul(r.packet.mods, sk);
    if (er.pulse > pulseShare) pulseShare = er.pulse;
  }
  const pps = basePps * (recipes.length ? pulseShare : 1);
  const stats: CompileStats = {
    damagePerShot: rateSum > 0 ? dmgSum / rateSum : 0,
    projectilesPerPulse: recipes.length ? rateSum / pulseShare : 0,
    pulsesPerSecond: pps,
    estDps: ev * basePps,
    wastedBlocks,
    warnings: [...warnings],
  };

  return { recipes, warnings, segments, cellInfo, stats };
}

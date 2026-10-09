import { Container, Graphics } from 'pixi.js';
import { CellInfo, CompiledShip, Grid, GridCell } from '../engine/compiler';
import { Dir, Rel } from '../engine/compilerTypes';
import { BLOCKS } from '../data/blocks';
import {
  CATEGORY_COLOR, COLORS, drawBlockIcon, drawWarn,
} from './draw';
import { THEME } from '../ui/theme';
import { BASE_CELL as S, LAYOUT, View } from './layout';
import { computeHops, drawCaps, drawFlow, drawLines } from './lines';

const PAD = 1.5;

/** Maps a point in "facing north" coordinates (y up is forward) to the cell's facing, relative to the cell centre. */
function turn(f: Dir, lx: number, ly: number): [number, number] {
  switch (f) {
    case 'E': return [-ly, lx];
    case 'S': return [-lx, -ly];
    case 'W': return [ly, -lx];
    default: return [lx, ly];
  }
}

/** Filled axis-aligned (in local coordinates) rectangle, rotated to the facing. lx/ly are the local centre; hw/hh the half sizes. */
function localRect(g: Graphics, cx: number, cy: number, f: Dir, lx: number, ly: number, hw: number, hh: number, color: number) {
  const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].flatMap(([dx, dy]) => {
    const [px, py] = turn(f, lx + dx, ly + dy);
    return [cx + px, cy + py];
  });
  g.poly(pts).fill(color);
}

/** Ejector: a bullet whose pointed tip is the exit; the flat base faces the incoming line. About a 10% margin all round. */
export function drawBullet(g: Graphics, cx: number, cy: number, w: number, f: Dir) {
  const half = w * 0.4; // half length of the bullet
  const bw = w * 0.24; // half width
  const tipStart = -half * 0.2; // casing runs from the base (+half) up to here
  localRect(g, cx, cy, f, 0, (half + tipStart) / 2, bw, (half - tipStart) / 2, THEME.bulletCasing);
  localRect(g, cx, cy, f, 0, tipStart + 1.5, bw, 1.5, THEME.hullDark);
  const tip = [[-bw, tipStart], [bw, tipStart], [0, -half]].flatMap(([lx, ly]) => { const [px, py] = turn(f, lx, ly); return [cx + px, cy + py]; });
  g.poly(tip).fill(THEME.bulletTip);
  // Thin dark ring on the flat base, where the red line ends.
  const ring = [[-bw + 2, half - 1], [bw - 2, half - 1], [bw - 2, half - 7], [-bw + 2, half - 7]].flatMap(([lx, ly]) => { const [px, py] = turn(f, lx, ly); return [cx + px, cy + py]; });
  g.poly(ring).stroke({ color: THEME.hullDark, width: 1.5 });
}

/** Generator: three concentric squares (outer, middle, red core) and a flat emitter notch on the edge that faces the line. */
export function drawReactor(g: Graphics, cx: number, cy: number, w: number, f: Dir) {
  const o = w * 0.4;
  localRect(g, cx, cy, f, 0, 0, o, o, THEME.reactorOuter);
  localRect(g, cx, cy, f, 0, 0, o * 0.74, o * 0.74, THEME.hullDark);
  localRect(g, cx, cy, f, 0, 0, o * 0.66, o * 0.66, THEME.reactorMid);
  localRect(g, cx, cy, f, 0, 0, o * 0.4, o * 0.4, THEME.hullDark);
  localRect(g, cx, cy, f, 0, 0, o * 0.32, o * 0.32, COLORS.red);
  // Emitter notch: sits on the facing edge and protrudes slightly into the margin.
  localRect(g, cx, cy, f, 0, -o - 1, w * 0.12, 3.5, THEME.reactorMid);
}

export interface RenderOpts {
  selected: { x: number; y: number } | null;
  /** Cell whose block is only a preview. */
  ghost?: { x: number; y: number } | null;
}

/** Draws the hull, the blocks and the red line in cell units (BASE_CELL px per cell); the container is scaled to the view. */
export class GridRenderer {
  readonly container = new Container();
  private content = new Container();
  private cellsG = new Graphics();
  private linesG = new Graphics();
  private flowG = new Graphics();
  private blocksC = new Container();
  private capsG = new Graphics();
  private overlayG = new Graphics();
  private maskG = new Graphics();
  private segments: CompiledShip['segments'] = [];
  private hops = new Set<string>();
  private dim = 1;

  constructor() {
    const a = LAYOUT.gridArea;
    this.maskG.rect(a.x, a.y, a.w, a.h).fill(0xffffff);
    this.content.addChild(this.cellsG, this.linesG, this.flowG, this.blocksC, this.capsG, this.overlayG);
    this.content.mask = this.maskG;
    this.container.addChild(this.maskG, this.content);
  }

  setView(v: View) {
    const k = v.scale / S;
    this.content.scale.set(k);
    this.content.position.set(v.ox, v.oy);
  }

  render(grid: Grid, compiled: CompiledShip, opts: RenderOpts) {
    this.segments = compiled.segments;
    this.drawCells(grid);
    this.linesG.clear();
    this.hops = computeHops(compiled.segments);
    drawLines(this.linesG, compiled.segments, this.hops);
    this.capsG.clear();
    drawCaps(this.capsG, compiled.segments);
    this.drawBlocks(grid, compiled, opts);
    this.drawOverlay(grid, compiled, opts);
  }

  /** Animated dashes; called every frame. */
  tick(timeMs: number) {
    this.flowG.clear();
    drawFlow(this.flowG, this.segments, timeMs, this.hops, this.dim);
  }

  private drawCells(grid: Grid) {
    const g = this.cellsG;
    g.clear();
    // Void cells are just this flat backdrop; every hull cell lays its own grid-line square over it.
    g.rect(-3, -3, grid.w * S + 6, grid.h * S + 6).fill(THEME.voidFill);
    for (const c of grid.cells) {
      if (c.type !== 'void') g.rect(c.x * S, c.y * S, S, S).fill(THEME.cellGap);
      this.drawCell(g, c);
    }
  }

  private drawCell(g: Graphics, c: GridCell) {
    const x = c.x * S + PAD;
    const y = c.y * S + PAD;
    const w = S - 2 * PAD;
    const cx = c.x * S + S / 2;
    const cy = c.y * S + S / 2;
    switch (c.type) {
      case 'void':
        break;
      case 'generator':
        g.rect(x, y, w, w).fill(THEME.hullPanel);
        drawReactor(g, cx, cy, w, c.facing ?? 'N');
        break;
      case 'ejector':
        g.rect(x, y, w, w).fill(THEME.hullPanel);
        drawBullet(g, cx, cy, w, c.facing ?? 'N');
        break;
      default:
        g.rect(x, y, w, w).fill(COLORS.cell);
    }
  }

  private outputEdges(blockId: string): Rel[] {
    return BLOCKS[blockId]?.outputs ?? [];
  }

  private drawBlocks(grid: Grid, compiled: CompiledShip, opts: RenderOpts) {
    for (const ch of this.blocksC.removeChildren()) ch.destroy({ children: true });
    for (const c of grid.cells) {
      if (c.type !== 'empty' || !c.blockId) continue;
      const def = BLOCKS[c.blockId];
      if (!def) continue;
      const info: CellInfo = compiled.cellInfo[c.y * grid.w + c.x];
      const isGhost = !!opts.ghost && opts.ghost.x === c.x && opts.ghost.y === c.y;
      const box = new Container();
      box.position.set(c.x * S + S / 2, c.y * S + S / 2);
      box.rotation = (info.effectiveRotation * Math.PI) / 180;
      const g = new Graphics();
      const color = CATEGORY_COLOR[def.category] ?? 0xffffff;
      g.roundRect(-23, -23, 46, 46, 8).fill({ color: 0x1c1c1c, alpha: 0.94 }).stroke({ color, width: 2.5 });
      drawBlockIcon(g, c.blockId, 34, color);
      // Input notch on the back (south) edge and output ticks on the output edges.
      g.poly([-10, S / 2 - 1, 10, S / 2 - 1, 0, S / 2 - 12]).fill(0x000000).stroke({ color: 0xffffff, width: 1, alpha: 0.6 });
      for (const rel of this.outputEdges(c.blockId)) {
        if (rel === 'F') g.moveTo(-9, -S / 2 + 2).lineTo(9, -S / 2 + 2);
        else if (rel === 'L') g.moveTo(-S / 2 + 2, -9).lineTo(-S / 2 + 2, 9);
        else g.moveTo(S / 2 - 2, -9).lineTo(S / 2 - 2, 9);
      }
      g.stroke({ color: COLORS.red, width: 4, cap: 'round' });
      box.addChild(g);
      box.alpha = isGhost ? 0.72 : info.onPath ? 1 : 0.5;
      this.blocksC.addChild(box);
    }
  }

  private drawOverlay(grid: Grid, compiled: CompiledShip, opts: RenderOpts) {
    const g = this.overlayG;
    g.clear();
    for (const c of grid.cells) {
      if (c.type !== 'empty' || !c.blockId) continue;
      const info = compiled.cellInfo[c.y * grid.w + c.x];
      const x = c.x * S;
      const y = c.y * S;
      if (info.warning) drawWarn(g, x + S / 2, y + S - 8, 20);
    }
    for (let i = 0; i < compiled.cellInfo.length; i++) {
      const c = grid.cells[i];
      if (c.type === 'ejector' && compiled.cellInfo[i].warning) {
        drawWarn(g, c.x * S + S / 2, c.y * S + S - 8, 20);
      }
    }
    if (opts.ghost) {
      g.rect(opts.ghost.x * S + 3, opts.ghost.y * S + 3, S - 6, S - 6).stroke({ color: 0x66f0ff, width: 3 });
    }
    if (opts.selected) {
      g.rect(opts.selected.x * S + 1, opts.selected.y * S + 1, S - 2, S - 2).stroke({ color: THEME.select, width: THEME.selectWidth });
    }
  }
}

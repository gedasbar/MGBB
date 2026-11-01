import { Container, Graphics } from 'pixi.js';
import { CellInfo, CompiledShip, Grid, GridCell } from '../engine/compiler';
import { Dir } from '../engine/compilerTypes';
import { BLOCKS } from '../data/blocks';
import {
  COLORS,
} from './draw';
import { THEME } from '../ui/theme';
import { drawPlate } from '../ui/blockArt';
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

/** Direction -> the "facing north" frame used by turn(): the side a signal that travels in `d` leaves by (the exit side). */
const SIDES: Dir[] = ['N', 'E', 'S', 'W'];

/**
 * Ejector (chunk 25a): a plate with a pipe-like inlet opening on all four sides (it takes a signal from any side) and a round
 * bore. An arrow on the exit side shows where the shots leave: opposite the side each signal enters by. No signal, no arrow.
 */
function drawEjector(g: Graphics, cx: number, cy: number, w: number, fires: Dir[]) {
  const o = w * 0.4;
  localRect(g, cx, cy, 'N', 0, 0, o, o, THEME.bulletCasing);
  localRect(g, cx, cy, 'N', 0, 0, o * 0.8, o * 0.8, THEME.hullDark);
  for (const side of SIDES) {
    // Inlet: a dark slot cut through the rim, with a lighter lip just inside it.
    localRect(g, cx, cy, side, 0, -o + 2, w * 0.13, 3.2, THEME.hullDark);
    localRect(g, cx, cy, side, 0, -o * 0.8 + 1.2, w * 0.13, 1.2, THEME.bulletTip);
  }
  g.circle(cx, cy, o * 0.34).fill(THEME.bulletCasing);
  for (const d of fires) {
    const tri = [[-w * 0.13, -o * 0.55], [w * 0.13, -o * 0.55], [0, -o * 0.98]].flatMap(([lx, ly]) => { const [px, py] = turn(d, lx, ly); return [cx + px, cy + py]; });
    g.poly(tri).fill(THEME.select);
  }
}

/** Generator: three concentric squares (outer, middle, red core) and a flat emitter notch on the edge that faces the line. */
function drawReactor(g: Graphics, cx: number, cy: number, w: number, f: Dir) {
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
    this.drawCells(grid, compiled);
    this.linesG.clear();
    this.hops = computeHops(compiled.segments);
    drawLines(this.linesG, compiled.segments, this.hops);
    this.capsG.clear();
    drawCaps(this.capsG, compiled.segments);
    this.drawBlocks(grid, compiled, opts);
    this.drawOverlay(opts);
  }

  /** Animated dashes; called every frame. */
  tick(timeMs: number) {
    this.flowG.clear();
    drawFlow(this.flowG, this.segments, timeMs, this.hops, this.dim);
  }

  private drawCells(grid: Grid, compiled: CompiledShip) {
    const g = this.cellsG;
    g.clear();
    // Void cells are just this flat backdrop; every hull cell lays its own grid-line square over it.
    g.rect(-3, -3, grid.w * S + 6, grid.h * S + 6).fill(THEME.voidFill);
    for (const c of grid.cells) {
      if (c.type !== 'void') g.rect(c.x * S, c.y * S, S, S).fill(THEME.cellGap);
      this.drawCell(g, c, compiled.cellInfo[c.y * grid.w + c.x]);
    }
  }

  private drawCell(g: Graphics, c: GridCell, info: CellInfo) {
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
        drawEjector(g, cx, cy, w, [...new Set(info.inDirs)]);
        break;
      default:
        g.rect(x, y, w, w).fill(COLORS.cell);
    }
  }

  private drawBlocks(grid: Grid, compiled: CompiledShip, opts: RenderOpts) {
    for (const ch of this.blocksC.removeChildren()) ch.destroy({ children: true });
    for (const c of grid.cells) {
      if (c.type !== 'empty' || !c.blockId) continue;
      if (!BLOCKS[c.blockId]) continue;
      const info: CellInfo = compiled.cellInfo[c.y * grid.w + c.x];
      const isGhost = !!opts.ghost && opts.ghost.x === c.x && opts.ghost.y === c.y;
      const g = new Graphics();
      g.position.set(c.x * S + S / 2, c.y * S + S / 2);
      drawPlate(g, c.blockId, S, info.effectiveRotation);
      g.alpha = isGhost ? 0.6 : info.onPath ? 1 : 0.5;
      this.blocksC.addChild(g);
    }
  }

  private drawOverlay(opts: RenderOpts) {
    const g = this.overlayG;
    g.clear();
    if (opts.ghost) {
      g.rect(opts.ghost.x * S + 3, opts.ghost.y * S + 3, S - 6, S - 6).stroke({ color: THEME.select, width: THEME.selectWidth });
    }
    if (opts.selected) {
      g.rect(opts.selected.x * S + 1, opts.selected.y * S + 1, S - 2, S - 2).stroke({ color: THEME.select, width: THEME.selectWidth });
    }
  }
}

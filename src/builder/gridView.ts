import { Container, Graphics } from 'pixi.js';
import { CellInfo, CompiledShip, Grid, GridCell } from '../engine/compiler';
import { Dir, Rel } from '../engine/compilerTypes';
import { BLOCKS } from '../data/blocks';
import {
  arrowHead, CATEGORY_COLOR, COLORS, drawAutoBadge, drawBlockIcon, drawLock, drawNoSignal, drawWarn, drawX, hatch,
} from './draw';
import { BASE_CELL as S, LAYOUT, View } from './layout';
import { computeHops, drawCaps, drawFlow, drawLines } from './lines';

const PAD = 1.5;
const FACING_ANGLE: Record<Dir, number> = { N: -Math.PI / 2, E: 0, S: Math.PI / 2, W: Math.PI };

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
    const hops = computeHops(compiled.segments);
    drawLines(this.linesG, compiled.segments, hops);
    this.capsG.clear();
    drawCaps(this.capsG, compiled.segments);
    this.drawBlocks(grid, compiled, opts);
    this.drawOverlay(grid, compiled, opts);
  }

  /** Animated dashes; called every frame. */
  tick(timeMs: number) {
    this.flowG.clear();
    drawFlow(this.flowG, this.segments, timeMs, this.dim);
  }

  private drawCells(grid: Grid) {
    const g = this.cellsG;
    g.clear();
    g.rect(-3, -3, grid.w * S + 6, grid.h * S + 6).fill(0x2a2a2a);
    for (const c of grid.cells) this.drawCell(g, c);
  }

  private drawCell(g: Graphics, c: GridCell) {
    const x = c.x * S + PAD;
    const y = c.y * S + PAD;
    const w = S - 2 * PAD;
    const cx = c.x * S + S / 2;
    const cy = c.y * S + S / 2;
    switch (c.type) {
      case 'void':
        g.rect(x, y, w, w).fill(COLORS.voidFill);
        hatch(g, x, y, w, w, 9, COLORS.voidHatch, 2.5);
        break;
      case 'blocked':
        g.rect(x, y, w, w).fill(0x242424);
        hatch(g, x, y, w, w, 9, 0x111111, 2.5);
        for (const [tx, ty, ex, ey] of [[cx, y, 0, 1], [cx, y + w, 0, -1], [x, cy, 1, 0], [x + w, cy, -1, 0]]) {
          g.moveTo(tx, ty).lineTo(tx + ex * 9, ty + ey * 9);
        }
        g.stroke({ color: COLORS.red, width: 2 });
        drawX(g, cx, cy, 15, COLORS.red, 9);
        drawX(g, cx, cy, 15, 0x000000, 4.5);
        break;
      case 'generator':
        g.rect(x, y, w, w).fill(0x8c1414);
        hatch(g, x, y, w, w, 9, 0xff4040, 3);
        g.rect(x, y, w, w).stroke({ color: 0xff7070, width: 2 });
        arrowHead(g, cx, y + 5, FACING_ANGLE[c.facing ?? 'N'] - (c.facing ? 0 : 0), 17, 11, 0xffd6d6);
        break;
      case 'ejector': {
        g.rect(x, y, w, w).fill(0x701010);
        hatch(g, x, y, w, w, 9, 0xe02828, 3);
        g.rect(x, y, w, w).stroke({ color: 0xff7070, width: 2 });
        drawX(g, cx, cy, 15, 0x000000, 11);
        drawX(g, cx, cy, 15, COLORS.red, 6);
        const f = c.facing ?? 'N';
        const ex = cx + Math.cos(FACING_ANGLE[f]) * (w / 2 - 3);
        const ey = cy + Math.sin(FACING_ANGLE[f]) * (w / 2 - 3);
        arrowHead(g, ex, ey, FACING_ANGLE[f], 16, 11, 0xffd6d6);
        break;
      }
      default:
        g.rect(x, y, w, w).fill(COLORS.cell);
        g.rect(x + 1.5, y + 1.5, w - 3, w - 3).stroke({ color: COLORS.cellEdge, width: 1.5, alpha: 0.7 });
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
      // Mode marker, top-right: lock = manual, A = auto.
      if (info.orientationMode === 'manual') drawLock(g, x + S - 11, y + 12, 14);
      else drawAutoBadge(g, x + S - 11, y + 11, 12);
      if (info.warning) drawWarn(g, x + S / 2, y + S - 8, 20);
      else if (!info.onPath && !(opts.ghost && opts.ghost.x === c.x && opts.ghost.y === c.y)) drawNoSignal(g, x + 11, y + S - 11, 15);
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
      g.rect(opts.selected.x * S + 1, opts.selected.y * S + 1, S - 2, S - 2).stroke({ color: COLORS.green, width: 4 });
    }
  }
}

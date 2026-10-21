import { Graphics } from 'pixi.js';
import { BLOCKS } from '../data/blocks';
import { Rel } from '../engine/compilerTypes';
import { CATEGORY_COLOR } from '../builder/draw';
import { THEME } from './theme';

/**
 * Procedural block plates. A plate is three nested sharp squares, a glyph on the inner face and flow marks
 * (entry bar on the back edge, exit triangles on the output edges). Everything is polygons and mitred
 * strokes: no rounded corners. `cell` is the cell size the plate is drawn for; the plate is 0.70 of it.
 */

type Pt = [number, number];

function darken(c: number, k: number): number {
  const r = Math.round(((c >> 16) & 255) * k);
  const g = Math.round(((c >> 8) & 255) * k);
  const b = Math.round((c & 255) * k);
  return (r << 16) | (g << 8) | b;
}

/** Draws in glyph units: the glyph box is [-1,1] in both axes, y down, forward = -y. */
export class Pen {
  constructor(
    private g: Graphics,
    /** pixels per glyph unit */
    private k: number,
    /** rotation in radians, clockwise on screen */
    private rot: number,
    /** base stroke width in pixels */
    private sw: number,
    private color: number,
  ) {}

  private p(x: number, y: number): Pt {
    const c = Math.cos(this.rot);
    const s = Math.sin(this.rot);
    return [(x * c - y * s) * this.k, (x * s + y * c) * this.k];
  }

  private flat(pts: Pt[]): number[] {
    return pts.flatMap(([x, y]) => this.p(x, y));
  }

  /** Open polyline. */
  line(pts: Pt[], w = 1) {
    const f = this.flat(pts);
    this.g.moveTo(f[0], f[1]);
    for (let i = 2; i < f.length; i += 2) this.g.lineTo(f[i], f[i + 1]);
    this.g.stroke({ width: this.sw * w, color: this.color, cap: 'butt', join: 'miter' });
  }

  /** Closed outline. */
  outline(pts: Pt[], w = 1) {
    this.g.poly(this.flat(pts), true).stroke({ width: this.sw * w, color: this.color, cap: 'butt', join: 'miter' });
  }

  fill(pts: Pt[]) {
    this.g.poly(this.flat(pts)).fill(this.color);
  }

  rect(x0: number, y0: number, x1: number, y1: number): Pt[] {
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  }

  /** Arrowhead triangle with its tip at (tx,ty) pointing along (dx,dy) (unit vector). */
  head(tx: number, ty: number, dx: number, dy: number, len = 0.5, half = 0.4) {
    const bx = tx - dx * len;
    const by = ty - dy * len;
    this.fill([[tx, ty], [bx - dy * half, by + dx * half], [bx + dy * half, by - dx * half]]);
  }
}

export interface Glyph {
  /** Routing and curve glyphs turn with the block; symbol glyphs stay upright. */
  rotatesWithBlock: boolean;
  draw(p: Pen): void;
}

const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 12): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as Pt; });

function turn(p: Pen, s: 1 | -1) {
  p.line([[0, 1], [0, 0], [s * 0.5, 0]], 1);
  p.head(s * 1, 0, s, 0);
}

export const GLYPHS: Record<string, Glyph> = {
  turn_l: { rotatesWithBlock: true, draw: (p) => turn(p, -1) },
  turn_r: { rotatesWithBlock: true, draw: (p) => turn(p, 1) },
  splitter_2: {
    rotatesWithBlock: true,
    draw: (p) => {
      p.line([[0, 1], [0, 0]]);
      p.line([[-0.5, 0], [0.5, 0]]);
      p.head(-1, 0, -1, 0);
      p.head(1, 0, 1, 0);
    },
  },
  splitter_3: {
    rotatesWithBlock: true,
    draw: (p) => {
      p.line([[0, 1], [0, -0.45]]);
      p.line([[-0.5, 0.3], [0.5, 0.3]]);
      p.head(-1, 0.3, -1, 0);
      p.head(1, 0.3, 1, 0);
      p.head(0, -1, 0, -1);
    },
  },
  flat_plus: {
    rotatesWithBlock: false,
    draw: (p) => { p.line([[-0.9, 0], [0.9, 0]], 1.6); p.line([[0, -0.9], [0, 0.9]], 1.6); },
  },
  percent_mult: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.fill(p.rect(-0.9, 0.2, -0.5, 0.85));
      p.fill(p.rect(-0.2, -0.3, 0.2, 0.85));
      p.fill(p.rect(0.5, -0.85, 0.9, 0.85));
    },
  },
  lucky_strike: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.outline(p.rect(-0.85, -0.85, 0.85, 0.85));
      p.fill(p.rect(-0.55, -0.55, -0.15, -0.15));
      p.fill(p.rect(0.15, 0.15, 0.55, 0.55));
    },
  },
  jackpot: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.outline([[0, -0.95], [0.95, 0], [0, 0.95], [-0.95, 0]]);
      p.fill(p.rect(-0.2, -0.2, 0.2, 0.2));
    },
  },
  gamblers_gate: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.outline(p.rect(-0.85, -0.85, 0.85, 0.85));
      p.fill([[-0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]);
    },
  },
  piercing: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.outline(p.rect(-0.1, -0.9, 0.3, 0.9));
      p.line([[-0.95, 0], [0.45, 0]]);
      p.head(1, 0, 1, 0, 0.5, 0.38);
    },
  },
  bouncing: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.line([[-0.95, -0.7], [-0.1, 0.6], [0.55, -0.4]]);
      p.head(0.95, -0.95, 0.55, -0.83, 0.6, 0.38);
      p.fill(p.rect(-0.95, 0.75, 0.95, 0.95));
    },
  },
  aoe_circle: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.fill(p.rect(-0.25, -0.25, 0.25, 0.25));
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        p.line([[Math.cos(a) * 0.55, Math.sin(a) * 0.55], [Math.cos(a) * 0.98, Math.sin(a) * 0.98]]);
      }
    },
  },
  shield_breaker: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.outline([[-0.8, -0.85], [0.8, -0.85], [0.8, 0.1], [0, 0.95], [-0.8, 0.1]]);
      p.line([[0.15, -0.85], [-0.15, -0.25], [0.2, 0.05], [0, 0.55]], 0.8);
    },
  },
  pure_converter: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.outline([[0, -0.95], [0.8, 0], [0, 0.95], [-0.8, 0]]);
      p.fill([[0, -0.52], [0.42, 0], [0, 0.52], [-0.42, 0]]);
    },
  },
  // ---- Part B blocks
  armor_piercer: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.outline(p.rect(-0.9, -0.3, 0.9, 0.3), 0.8);
      for (const x of [-0.65, -0.2, 0.25, 0.7]) p.line([[x - 0.2, 0.3], [x + 0.2, -0.3]], 0.6);
      p.line([[0, 0.95], [0, -0.4]], 1.1);
      p.head(0, -0.98, 0, -1, 0.6, 0.38);
    },
  },
  curving_right: {
    rotatesWithBlock: true,
    draw: (p) => {
      p.line(arc(0.8, 0.9, 1.4, Math.PI, 4.53), 1);
      p.head(1, -0.48, 1, 0);
    },
  },
  homing: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.outline(p.rect(-0.8, -0.8, 0.8, 0.8), 0.8);
      p.line([[0, -0.95], [0, -0.45]]);
      p.line([[0, 0.45], [0, 0.95]]);
      p.line([[-0.95, 0], [-0.45, 0]]);
      p.line([[0.45, 0], [0.95, 0]]);
      p.fill([[0, -0.3], [0.25, 0.22], [-0.25, 0.22]]);
    },
  },
  random_curve: {
    rotatesWithBlock: true,
    draw: (p) => {
      const pts: Pt[] = Array.from({ length: 21 }, (_, i) => { const y = 0.95 - (i * 1.9) / 20; return [0.5 * Math.sin((0.95 - y) * Math.PI * 1.5), y] as Pt; });
      p.line(pts, 1);
    },
  },
  aoe_rect: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.fill(p.rect(-0.7, -0.22, 0.7, 0.22));
      p.line([[-0.92, -0.55], [-0.92, 0.55]]);
      p.line([[0.92, -0.55], [0.92, 0.55]]);
    },
  },
  fork_impact: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.line([[0, 0.95], [0, 0.1]]);
      p.line([[0, 0.1], [-0.7, -0.85]]);
      p.line([[0, 0.1], [0.7, -0.85]]);
    },
  },
  // ---- Chunk 9a blocks
  alternator: {
    rotatesWithBlock: true,
    draw: (p) => {
      // In from the back; the left branch is solid, the right one dashed: the two take turns.
      p.line([[0, 1], [0, 0.15]]);
      p.line([[0, 0.15], [-0.75, -0.45]]);
      p.head(-0.95, -0.6, -0.75, -0.6, 0.5, 0.36);
      p.line([[0.05, 0.1], [0.3, -0.12]]);
      p.line([[0.45, -0.25], [0.7, -0.45]]);
      p.head(0.95, -0.6, 0.75, -0.6, 0.5, 0.36);
    },
  },
  delay_line: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.outline([[-0.65, -0.9], [0.65, -0.9], [0, 0]], 0.9);
      p.fill([[-0.65, 0.9], [0.65, 0.9], [0, 0.1]]);
      p.line([[-0.8, -0.9], [0.8, -0.9]], 1.2);
      p.line([[-0.8, 0.9], [0.8, 0.9]], 1.2);
    },
  },
  overclock: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.line([[-0.75, 0.05], [0, -0.6], [0.75, 0.05]], 1.2);
      p.line([[-0.75, 0.8], [0, 0.15], [0.75, 0.8]], 1.2);
    },
  },
  capacitor: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.fill(p.rect(-0.85, -0.5, 0.85, -0.2));
      p.fill(p.rect(-0.85, 0.2, 0.85, 0.5));
      p.line([[0, -0.95], [0, -0.5]]);
      p.line([[0, 0.5], [0, 0.95]]);
    },
  },
  executioner: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.outline([[-0.75, -0.85], [0.75, -0.85], [0, 0.55]], 0.9);
      p.line([[-0.9, 0.85], [0.9, 0.85]], 1.4);
    },
  },
  chain_lightning: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.line([[0.35, -0.95], [-0.4, -0.1], [0.35, 0.05], [-0.35, 0.95]], 1.1);
      p.fill(p.rect(0.2, -1, 0.5, -0.7));
      p.fill(p.rect(-0.5, 0.7, -0.2, 1));
    },
  },
  boomerang: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.line([[-0.85, -0.55], [-0.1, 0.75], [0.85, -0.2]], 1.5);
      p.head(0.95, -0.35, 0.8, -0.5, 0.5, 0.36);
    },
  },
  orbit: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.line(arc(0, 0, 0.75, 0.5, 2 * Math.PI - 0.3, 20), 1);
      p.head(0.55, 0.75, 1, -0.2, 0.45, 0.34);
      p.fill(p.rect(-0.18, -0.18, 0.18, 0.18));
    },
  },
  mine: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.fill([[-0.3, -0.6], [0.3, -0.6], [0.6, -0.3], [0.6, 0.3], [0.3, 0.6], [-0.3, 0.6], [-0.6, 0.3], [-0.6, -0.3]]);
      p.line([[0, -0.7], [0, -1]], 1.2);
      p.line([[0, 0.7], [0, 1]], 1.2);
      p.line([[-0.7, 0], [-1, 0]], 1.2);
      p.line([[0.7, 0], [1, 0]], 1.2);
    },
  },
  ignite: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.outline([[0, -0.95], [0.55, -0.1], [0.42, 0.6], [0, 0.95], [-0.42, 0.6], [-0.55, -0.1], [-0.18, -0.3]], 0.9);
      p.fill([[0, 0.05], [0.22, 0.5], [0, 0.78], [-0.22, 0.5]]);
    },
  },
  corrosion: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.outline(p.rect(-0.85, -0.85, 0.85, 0), 0.9);
      p.fill(p.rect(-0.6, 0.1, -0.35, 0.6));
      p.fill(p.rect(-0.12, 0.1, 0.12, 0.95));
      p.fill(p.rect(0.35, 0.1, 0.6, 0.4));
    },
  },
  // ---- Chunk 11a
  fission_catalyst: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.outline(p.rect(-0.95, -0.6, -0.12, 0.6), 0.9);
      p.outline(p.rect(0.12, -0.6, 0.95, 0.6), 0.9);
      p.fill([[0, -0.9], [0.14, -0.55], [-0.14, -0.55]]);
      p.fill([[0, 0.9], [0.14, 0.55], [-0.14, 0.55]]);
    },
  },
  cauterize: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.outline([[0, -0.95], [0.85, 0], [0, 0.95], [-0.85, 0]], 0.9);
      p.line([[-0.55, 0], [0.55, 0]], 1.6);
    },
  },
  cleaver: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.fill([[-0.9, -0.75], [0.15, -0.75], [0.15, 0.45], [-0.9, 0.05]]);
      p.fill(p.rect(0.15, -0.5, 0.9, -0.2));
    },
  },
  culling_bolt: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.outline(p.rect(-0.4, -0.9, 0.4, 0.9), 0.9);
      p.fill(p.rect(-0.4, 0.15, 0.4, 0.9));
      p.line([[-0.95, -0.2], [0.95, -0.2]], 1.2);
    },
  },
  residue_seed: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.outline(arc(0, 0, 0.85, 0, 2 * Math.PI, 8).slice(0, 8), 0.8);
      p.fill(p.rect(-0.2, -0.2, 0.2, 0.2));
    },
  },
  overkill_spill: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.outline(p.rect(-0.85, -0.9, 0.85, 0.05), 0.9);
      p.line([[0, 0.05], [0, 0.4]]);
      p.line([[-0.6, 0.4], [0.6, 0.4]]);
      p.head(-0.6, 0.95, 0, 1, 0.45, 0.32);
      p.head(0.6, 0.95, 0, 1, 0.45, 0.32);
    },
  },
  gravity_well: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.fill(p.rect(-0.14, -0.14, 0.14, 0.14));
      p.head(0, -0.3, 0, 1, 0.45, 0.32);
      p.head(0, 0.3, 0, -1, 0.45, 0.32);
      p.head(-0.3, 0, 1, 0, 0.45, 0.32);
      p.head(0.3, 0, -1, 0, 0.45, 0.32);
      p.outline(arc(0, 0, 0.95, 0, 2 * Math.PI, 8).slice(0, 8), 0.6);
    },
  },
  static_charge: {
    rotatesWithBlock: false,
    draw: (p) => {
      p.line([[0.25, -0.95], [-0.3, -0.15], [0.3, -0.15], [-0.25, 0.5]], 1.1);
      p.fill(p.rect(-0.85, 0.7, -0.5, 0.95));
      p.fill(p.rect(-0.17, 0.7, 0.17, 0.95));
      p.fill(p.rect(0.5, 0.7, 0.85, 0.95));
    },
  },
  random_router: {
    rotatesWithBlock: true,
    draw: (p) => {
      p.line([[0, 1], [0, 0.55]]);
      p.outline(p.rect(-0.2, 0.15, 0.2, 0.55), 0.9);
      p.line([[0, 0.15], [0, -0.1]]);
      p.line([[-0.5, -0.1], [0.5, -0.1]]);
      p.head(-1, -0.1, -1, 0);
      p.head(1, -0.1, 1, 0);
    },
  },
  frostbite: {
    rotatesWithBlock: false,
    draw: (p) => {
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3 + Math.PI / 6;
        p.line([[Math.cos(a) * 0.95, Math.sin(a) * 0.95], [-Math.cos(a) * 0.95, -Math.sin(a) * 0.95]], 0.9);
      }
      p.fill(p.rect(-0.16, -0.16, 0.16, 0.16));
    },
  },
};

/** Fallback glyph: a small centred square. */
const FALLBACK: Glyph = { rotatesWithBlock: false, draw: (p) => p.fill(p.rect(-0.3, -0.3, 0.3, 0.3)) };

export function glyphFor(id: string): Glyph {
  return GLYPHS[id] ?? FALLBACK;
}

function rotPt(x: number, y: number, rad: number): Pt {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [x * c - y * s, x * s + y * c];
}

/** Light-grey flow mark with a thin dark edge. `pts` are in the block's own frame (facing up), rotated by `rad`. */
function mark(g: Graphics, pts: Pt[], rad: number) {
  g.poly(pts.flatMap(([x, y]) => rotPt(x, y, rad))).fill(THEME.mark).stroke({ width: 1, color: THEME.markEdge });
}

/**
 * Draws a block plate centred on the origin of `g`.
 * @param cell cell size in the units of `g`
 * @param rotationDeg effective block rotation (clockwise degrees)
 * @param outputs relative exits; defaults to the block's own
 */
export function drawPlate(g: Graphics, id: string, cell: number, rotationDeg = 0, outputs?: Rel[]) {
  const def = BLOCKS[id];
  const cat = def ? CATEGORY_COLOR[def.category] ?? 0xb0b0b0 : 0xb0b0b0;
  const rad = (rotationDeg * Math.PI) / 180;
  const P = cell * 0.7;
  const h = P / 2;
  g.rect(-h, -h, P, P).fill(THEME.plateOuter);
  const i2 = P * 0.07;
  g.rect(-h + i2, -h + i2, P - 2 * i2, P - 2 * i2).fill(darken(cat, 0.5));
  const i3 = P * 0.17;
  const face = P - 2 * i3;
  g.rect(-h + i3, -h + i3, face, face).fill(THEME.plateFace);

  const glyph = glyphFor(id);
  const pen = new Pen(g, face * 0.5 * 0.7, glyph.rotatesWithBlock ? rad : 0, P * 0.06, cat);
  glyph.draw(pen);

  // Flow marks: an entry bar on the back edge, an exit triangle on every output edge.
  const barW = P * 0.4;
  const barT = cell * 0.05;
  mark(g, [[-barW / 2, h - 1], [barW / 2, h - 1], [barW / 2, h - 1 + barT], [-barW / 2, h - 1 + barT]], rad);
  const tb = cell * 0.1;
  const th = cell * 0.15;
  for (const rel of outputs ?? def?.outputs ?? []) {
    const r = rel === 'F' ? 0 : rel === 'L' ? -Math.PI / 2 : Math.PI / 2;
    const tri: Pt[] = [[-tb, -h + 1], [tb, -h + 1], [0, -h + 1 - th]].map(([x, y]) => rotPt(x, y, r));
    mark(g, tri, rad);
  }
}

/** Icon half-size as a share of the plate side, and the glyph stroke in game px (3 px = 2 CSS px on a 360 px phone). */
export const TILE_ICON_SCALE = 0.27;
export const TILE_ICON_STROKE = 3;

/**
 * The block's icon on a plain plate for the palette tiles (16e): one flat square with the glyph in the category colour. No nested
 * squares, no entry bar, no exit triangles. Drawn from (0,0) to (size,size); `g` should sit on a whole pixel.
 */
export function drawTileIcon(g: Graphics, id: string, size: number, plateColor: number = THEME.tilePlate) {
  const def = BLOCKS[id];
  const cat = def ? CATEGORY_COLOR[def.category] ?? 0xb0b0b0 : 0xb0b0b0;
  g.rect(0, 0, size, size).fill(plateColor);
  const ic = new Graphics();
  glyphFor(id).draw(new Pen(ic, size * TILE_ICON_SCALE, 0, TILE_ICON_STROKE, cat));
  ic.position.set(Math.round(size / 2), Math.round(size / 2));
  g.addChild(ic);
}

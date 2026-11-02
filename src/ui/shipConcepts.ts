import { Graphics } from 'pixi.js';
import { CATEGORY_COLOR } from '../builder/draw';

/**
 * Chunk 25b: ship art CONCEPTS (not used by the game yet; `src/ui/shipArt.ts` still draws the real ships).
 * A concept ship is a short list of flat polygons in the same unit box as `ShipArtDef` (x right, y down, nose at the top,
 * (0.5, 0.5) the centre), each with a tone from a small palette, plus engine flames. Three styles are drawn for three hulls so
 * the owner can pick one (docs/ship-art.md). Authoring uses half-widths: a path is a list of [dx, y] where dx is the distance
 * from the centre line, and the helpers mirror it.
 */
type Pt = [number, number];
export type ConceptStyle = 'A' | 'B' | 'C';
export type Tone = 'edge' | 'light' | 'mid' | 'dark' | 'core' | 'accent' | 'flame' | 'flameCore';

export interface ConceptPart { tone: Tone; points: Pt[] }
export interface ConceptFlame { dx: number; y: number; width: number; length: number }
export interface ConceptShip {
  hull: string;
  style: ConceptStyle;
  parts: ConceptPart[];
  /** Flames hang below the hull box at y (unit box); `length` is a fraction of the box height. */
  flames: ConceptFlame[];
}

/** Same grey ramp as shipArt.ts and the block plates; one accent per hull; a flat two-tone flame. */
export const CONCEPT_COLORS: Record<Exclude<Tone, 'accent'>, number> = {
  edge: 0xd4d4d8, light: 0xb0b0b6, mid: 0x8a8a90, dark: 0x55555a, core: 0x26262a, flame: 0xf0883a, flameCore: 0xf2c230,
};
/** The flame may reach this far below the box (fraction of the box height) before it is clipped in the sheet. */
export const FLAME_MAX_LENGTH = 0.22;

const mirrorX = (p: Pt): Pt => [1 - p[0], p[1]];
const abs = (path: Pt[]): Pt[] => path.map(([dx, y]) => [0.5 + dx, y] as Pt);

/** A shape on the centre line: the path is its right half, top to bottom (dx = 0 on the line). */
const full = (tone: Tone, path: Pt[]): ConceptPart => ({ tone, points: [...abs(path), ...abs(path).map(mirrorX).reverse()] });
/** Only the right / left half of such a shape (two tones make a hard facet down the middle). */
const right = (tone: Tone, path: Pt[]): ConceptPart => ({ tone, points: abs(path) });
const left = (tone: Tone, path: Pt[]): ConceptPart => ({ tone, points: abs(path).map(mirrorX) });
/** A shape off the centre line, drawn twice (right and mirrored left). */
const pair = (tone: Tone, path: Pt[]): ConceptPart[] => [right(tone, path), left(tone, path)];
/** Axis-aligned box [dx0, dx1, y0, y1] as a pair. */
const boxPair = (tone: Tone, dx0: number, dx1: number, y0: number, y1: number): ConceptPart[] => pair(tone, [[dx0, y0], [dx1, y0], [dx1, y1], [dx0, y1]]);
const boxMid = (tone: Tone, dx: number, y0: number, y1: number): ConceptPart => full(tone, [[0, y0], [dx, y0], [dx, y1], [0, y1]]);

/** Shrinks a polygon toward its centroid (style C nests four of them, like the block plates). */
function inset(points: Pt[], k: number): Pt[] {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  return points.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as Pt);
}
function nested(path: Pt[]): ConceptPart[] {
  const outer = full('edge', path).points;
  return [{ tone: 'edge', points: outer }, { tone: 'mid', points: inset(outer, 0.8) }, { tone: 'dark', points: inset(outer, 0.58) }, { tone: 'core', points: inset(outer, 0.3) }];
}

/** Hull accents: the same family as the real art (one category colour per hull). */
const ACCENT: Record<string, number> = { wisp: CATEGORY_COLOR.pathing, halberd: CATEGORY_COLOR.damage, zenith: CATEGORY_COLOR.mitosis };
export function conceptAccent(hull: string): number { return ACCENT[hull] ?? CATEGORY_COLOR.damage; }

/** Small gun tips (accent) along a straight edge: n boxes centred on the edge from (dx0, y0) to (dx1, y1), pointing up. */
function gunsAlong(n: number, dx0: number, y0: number, dx1: number, y1: number, w: number, h: number): ConceptPart[] {
  const out: ConceptPart[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const dx = dx0 + (dx1 - dx0) * t, y = y0 + (y1 - y0) * t;
    out.push(...pair('accent', [[dx - w / 2, y], [dx + w / 2, y], [dx + w / 2, y - h], [dx - w / 2, y - h]]));
  }
  return out;
}

/* ---------- Style A: hard-edge fighter ---------- */

const wispA: ConceptShip = {
  hull: 'wisp', style: 'A',
  parts: [
    ...pair('dark', [[0.1, 0.46], [0.47, 0.9], [0.47, 0.98], [0.12, 0.82]]),
    ...pair('edge', [[0.1, 0.46], [0.47, 0.9], [0.43, 0.9], [0.1, 0.54]]),
    right('mid', [[0, 0], [0.1, 0.3], [0.13, 0.78], [0.07, 0.9], [0, 0.9]]),
    left('light', [[0, 0], [0.1, 0.3], [0.13, 0.78], [0.07, 0.9], [0, 0.9]]),
    full('accent', [[0, 0.24], [0.05, 0.35], [0, 0.47]]),
    ...boxPair('core', 0.04, 0.11, 0.86, 0.96),
  ],
  flames: [{ dx: 0.075, y: 0.96, width: 0.07, length: 0.14 }],
};

const halberdA: ConceptShip = {
  hull: 'halberd', style: 'A',
  parts: [
    ...pair('dark', [[0.1, 0.28], [0.48, 0.74], [0.48, 0.9], [0.12, 0.7]]),
    ...pair('mid', [[0.12, 0.46], [0.44, 0.76], [0.44, 0.84], [0.12, 0.7]]),
    ...pair('edge', [[0.1, 0.28], [0.48, 0.74], [0.44, 0.74], [0.1, 0.36]]),
    ...gunsAlong(1, 0.3, 0.52, 0.3, 0.52, 0.05, 0.1),
    right('mid', [[0, 0], [0.08, 0.22], [0.12, 0.62], [0.13, 0.86], [0.07, 0.94], [0, 0.94]]),
    left('light', [[0, 0], [0.08, 0.22], [0.12, 0.62], [0.13, 0.86], [0.07, 0.94], [0, 0.94]]),
    full('accent', [[0, 0.22], [0.05, 0.32], [0, 0.46]]),
    full('core', [[0, 0.5], [0.03, 0.56], [0, 0.78]]),
    ...boxPair('core', 0.04, 0.12, 0.9, 1.0),
    boxMid('core', 0.03, 0.92, 1.0),
  ],
  flames: [{ dx: 0.08, y: 1.0, width: 0.06, length: 0.12 }, { dx: 0, y: 1.0, width: 0.06, length: 0.14 }],
};

const zenithA: ConceptShip = {
  hull: 'zenith', style: 'A',
  parts: [
    ...pair('dark', [[0.14, 0.18], [0.49, 0.62], [0.49, 0.86], [0.18, 0.74]]),
    ...pair('mid', [[0.2, 0.34], [0.46, 0.66], [0.46, 0.8], [0.2, 0.72]]),
    ...pair('edge', [[0.14, 0.18], [0.49, 0.62], [0.45, 0.62], [0.14, 0.27]]),
    ...gunsAlong(4, 0.2, 0.26, 0.44, 0.56, 0.035, 0.07),
    right('mid', [[0, 0], [0.12, 0.2], [0.18, 0.6], [0.14, 0.88], [0.08, 0.94], [0, 0.94]]),
    left('light', [[0, 0], [0.12, 0.2], [0.18, 0.6], [0.14, 0.88], [0.08, 0.94], [0, 0.94]]),
    ...gunsAlong(2, 0.1, 0.28, 0.14, 0.4, 0.03, 0.06),
    full('accent', [[0, 0.2], [0.06, 0.32], [0, 0.5]]),
    full('core', [[0, 0.54], [0.05, 0.64], [0, 0.86]]),
    ...boxPair('core', 0.06, 0.16, 0.88, 0.98),
    boxMid('dark', 0.05, 0.92, 1.0),
  ],
  flames: [{ dx: 0.11, y: 0.98, width: 0.08, length: 0.1 }, { dx: 0, y: 1.0, width: 0.08, length: 0.14 }],
};

/* ---------- Style B: industrial ---------- */

/** A thin panel line across the hull (core colour) at y, `dx` wide each side. */
const line = (dx: number, y: number, t = 0.012): ConceptPart => boxMid('core', dx, y, y + t);

const wispB: ConceptShip = {
  hull: 'wisp', style: 'B',
  parts: [
    ...boxPair('dark', 0.17, 0.31, 0.38, 0.84),
    ...boxPair('mid', 0.17, 0.31, 0.38, 0.46),
    full('edge', [[0.07, 0.02], [0.14, 0.1], [0.14, 0.84], [0.1, 0.9], [0, 0.9]]),
    full('mid', [[0.05, 0.08], [0.1, 0.14], [0.1, 0.8], [0, 0.8]]),
    line(0.1, 0.3), line(0.1, 0.5), line(0.1, 0.68),
    boxMid('accent', 0.04, 0.12, 0.22),
    ...boxPair('core', 0.17, 0.3, 0.84, 0.88),
    ...boxPair('dark', 0.03, 0.12, 0.9, 0.98),
  ],
  flames: [{ dx: 0.075, y: 0.98, width: 0.07, length: 0.12 }],
};

const halberdB: ConceptShip = {
  hull: 'halberd', style: 'B',
  parts: [
    ...boxPair('dark', 0.2, 0.46, 0.2, 0.62),
    ...boxPair('mid', 0.2, 0.46, 0.2, 0.28),
    ...boxPair('accent', 0.38, 0.44, 0.1, 0.22),
    ...boxPair('core', 0.38, 0.44, 0.34, 0.5),
    full('edge', [[0.1, 0.02], [0.16, 0.1], [0.2, 0.2], [0.2, 0.84], [0.14, 0.9], [0, 0.9]]),
    full('mid', [[0.07, 0.1], [0.14, 0.2], [0.14, 0.8], [0, 0.8]]),
    line(0.2, 0.34), line(0.2, 0.52), line(0.2, 0.7),
    boxMid('accent', 0.05, 0.1, 0.2),
    boxMid('dark', 0.1, 0.38, 0.5),
    ...boxPair('dark', 0.1, 0.22, 0.86, 1.0),
    ...boxPair('core', 0.12, 0.2, 0.96, 1.0),
    boxMid('dark', 0.05, 0.9, 1.0),
  ],
  flames: [{ dx: 0.16, y: 1.0, width: 0.07, length: 0.12 }, { dx: 0, y: 1.0, width: 0.07, length: 0.12 }],
};

const zenithB: ConceptShip = {
  hull: 'zenith', style: 'B',
  parts: [
    boxMid('edge', 0.5, 0.0, 0.2),                                   // the gun deck: full width, like the ten ejectors
    ...gunsAlong(5, 0.08, 0.1, 0.46, 0.1, 0.05, 0.1),
    boxMid('mid', 0.46, 0.04, 0.16),
    boxMid('edge', 0.42, 0.2, 0.46),
    boxMid('dark', 0.38, 0.24, 0.42),
    line(0.42, 0.33),
    boxMid('edge', 0.32, 0.46, 0.64),
    boxMid('dark', 0.28, 0.5, 0.6),
    boxMid('edge', 0.22, 0.64, 0.78),
    boxMid('edge', 0.14, 0.78, 0.88),
    boxMid('accent', 0.05, 0.24, 0.34),
    line(0.5, 0.2), line(0.32, 0.55),
    ...boxPair('dark', 0.1, 0.24, 0.86, 1.0),
    boxMid('dark', 0.08, 0.88, 1.0),
    ...boxPair('core', 0.12, 0.22, 0.97, 1.0),
  ],
  flames: [{ dx: 0.17, y: 1.0, width: 0.09, length: 0.1 }, { dx: 0, y: 1.0, width: 0.09, length: 0.14 }],
};

/* ---------- Style C: silhouette from the layout ---------- */

const wispC: ConceptShip = {
  hull: 'wisp', style: 'C',
  parts: [
    ...nested([[0, 0], [0.08, 0.2], [0.11, 0.5], [0.22, 0.76], [0.25, 0.96], [0.1, 0.9], [0, 0.94]]),
    full('accent', [[0, 0.2], [0.04, 0.3], [0, 0.42]]),
    ...boxPair('core', 0.04, 0.09, 0.92, 0.98),
  ],
  flames: [{ dx: 0.065, y: 0.98, width: 0.06, length: 0.12 }],
};

const halberdC: ConceptShip = {
  hull: 'halberd', style: 'C',
  parts: [
    ...nested([[0, 0], [0.09, 0.1], [0.38, 0.12], [0.49, 0.22], [0.44, 0.32], [0.2, 0.34], [0.14, 0.44], [0.14, 0.58], [0.23, 0.65], [0.2, 0.74], [0.13, 0.8], [0.13, 0.94], [0, 0.94]]),
    ...boxPair('accent', 0.42, 0.46, 0.12, 0.2),
    full('accent', [[0, 0.04], [0.04, 0.14], [0, 0.26]]),
    ...boxPair('core', 0.06, 0.12, 0.92, 1.0),
  ],
  flames: [{ dx: 0.09, y: 1.0, width: 0.06, length: 0.12 }],
};

const zenithC: ConceptShip = {
  hull: 'zenith', style: 'C',
  parts: [
    ...nested([[0, 0.04], [0.1, 0.02], [0.3, 0.03], [0.49, 0.14], [0.49, 0.5], [0.38, 0.62], [0.26, 0.76], [0.14, 0.88], [0.07, 0.94], [0.07, 1.0], [0, 1.0]]),
    ...gunsAlong(4, 0.1, 0.1, 0.4, 0.14, 0.035, 0.07),
    full('accent', [[0, 0.3], [0.06, 0.42], [0, 0.6]]),
    ...boxPair('core', 0.05, 0.1, 0.94, 1.0),
  ],
  flames: [{ dx: 0.07, y: 1.0, width: 0.06, length: 0.1 }],
};

export const CONCEPT_HULLS = ['wisp', 'halberd', 'zenith'] as const;
export const CONCEPT_STYLES: ConceptStyle[] = ['A', 'B', 'C'];
export const SHIP_CONCEPTS: ConceptShip[] = [wispA, halberdA, zenithA, wispB, halberdB, zenithB, wispC, halberdC, zenithC];

export function conceptShip(hull: string, style: ConceptStyle): ConceptShip {
  const s = SHIP_CONCEPTS.find(c => c.hull === hull && c.style === style);
  if (!s) throw new Error(`no concept for ${hull} ${style}`);
  return s;
}

/** Draws a concept into a Graphics at its origin (top-left of the hull box); `w` x `h` is the box in px. */
export function drawConceptShip(g: Graphics, ship: ConceptShip, w: number, h: number): Graphics {
  for (const p of ship.parts) {
    const color = p.tone === 'accent' ? conceptAccent(ship.hull) : CONCEPT_COLORS[p.tone];
    g.poly(p.points.flatMap(([x, y]) => [x * w, y * h])).fill(color);
  }
  for (const f of ship.flames) {
    for (const sx of f.dx === 0 ? [0] : [-1, 1]) {
      const cx = (0.5 + sx * f.dx) * w, y0 = f.y * h, hw = (f.width / 2) * w, len = f.length * h;
      g.poly([cx - hw, y0, cx + hw, y0, cx, y0 + len]).fill(CONCEPT_COLORS.flame);
      g.poly([cx - hw * 0.5, y0, cx + hw * 0.5, y0, cx, y0 + len * 0.55]).fill(CONCEPT_COLORS.flameCore);
    }
  }
  return g;
}

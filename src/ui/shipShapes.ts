import { CATEGORY_COLOR } from '../builder/draw';
import { ZENITH_ART } from '../config';

/**
 * Chunk 25c: the ship art of all 19 hulls, in the owner's pick from the 25b concept sheet, style C: the outline follows the
 * hull's grid shape (row widths, where the guns sit), smoothed into a ship with a nose, wings and engines. A ship is DATA
 * (`ShipArtDef`): a few convex pieces drawn as four nested copies (light edge, mid grey, dark grey, dark core: the block plate
 * language), up to four small accent pieces, engine blocks and flames. docs/ship-art.md explains how to add or change one.
 * Coordinates are the unit box: x right, y down, the nose at the top, (0.5, 0.5) the ship centre.
 */
export type Pt = [number, number];
export type Tone = 'edge' | 'mid' | 'dark' | 'core' | 'accent';

export interface ShipPart { tone: Tone; points: Pt[] }
export interface ShipFlame { x: number; y: number; width: number; length: number }
export interface ShipArtDef {
  id: string;
  parts: ShipPart[];
  /** Flames hang below the hull box at y; `length` is a fraction of the box height. They are a separate texture (they flicker). */
  flames: ShipFlame[];
  /** The hull's own colour: the cockpit, the gun tips. */
  accent: number;
}

/** The most accent pieces a ship may have, however many ejectors it has (decoration only, shots leave from the simulation's own offsets). */
export const MAX_ACCENT_PIECES = 4;
/** Longest flame, as a fraction of the hull box height (the texture reserves this much room below the box). */
export const FLAME_MAX_LENGTH = 0.2;

const mirrorX = (p: Pt): Pt => [1 - p[0], p[1]];
const abs = (path: Pt[]): Pt[] => path.map(([dx, y]) => [0.5 + dx, y] as Pt);
/** A shape on the centre line from its right half (dx = distance from the centre line, top to bottom). */
const sym = (path: Pt[]): Pt[] => [...abs(path), ...abs(path).map(mirrorX).reverse()];
/** A shape off the centre line, as its right and its mirrored left polygon. */
const duo = (path: Pt[]): Pt[][] => [abs(path), abs(path).map(mirrorX)];
const box = (dx0: number, dx1: number, y0: number, y1: number): Pt[] => [[dx0, y0], [dx1, y0], [dx1, y1], [dx0, y1]];

function inset(points: Pt[], k: number): Pt[] {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  return points.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as Pt);
}
/** Four nested copies of every piece, all outers first so touching pieces merge into one silhouette. */
function plates(pieces: Pt[][]): ShipPart[] {
  return [
    ...pieces.map(p => ({ tone: 'edge' as const, points: p })),
    ...pieces.map(p => ({ tone: 'mid' as const, points: inset(p, 0.8) })),
    ...pieces.map(p => ({ tone: 'dark' as const, points: inset(p, 0.58) })),
    ...pieces.map(p => ({ tone: 'core' as const, points: inset(p, 0.3) })),
  ];
}
/** An accent piece (on the centre line from its right half, or a pair). */
const acc = (path: Pt[]): ShipPart => ({ tone: 'accent', points: sym(path) });
const accPair = (path: Pt[]): ShipPart[] => duo(path).map(points => ({ tone: 'accent' as const, points }));
/** The cockpit: one accent diamond on the centre line. */
const cockpit = (y0: number, y1: number, w = 0.05): ShipPart => acc([[0, y0], [w, (y0 + y1) / 2], [0, y1]]);
/** A pair of small gun tips. */
const tips = (dx: number, y: number, w = 0.04, h = 0.08): ShipPart[] => accPair(box(dx - w / 2, dx + w / 2, y, y + h));

/** Engine blocks (dark box with a core nozzle) at the given offsets from the centre line (0 = on it) and their flames. */
function engines(dxs: number[], y0: number, y1: number, w: number, flame: number): { parts: ShipPart[]; flames: ShipFlame[] } {
  const parts: ShipPart[] = [], flames: ShipFlame[] = [];
  for (const dx of dxs) for (const s of dx === 0 ? [0] : [1, -1]) {
    const cx = 0.5 + s * dx;
    parts.push({ tone: 'dark', points: box(cx - w / 2, cx + w / 2, y0, y1) }, { tone: 'core', points: box(cx - w / 2 + w * 0.15, cx + w / 2 - w * 0.15, y1 - (y1 - y0) * 0.4, y1) });
    flames.push({ x: cx, y: y1, width: w * 0.8, length: flame });
  }
  return { parts, flames };
}

const A = CATEGORY_COLOR;
/** Hull accent colours: the colour each hull had before 25c (the five hand-drawn hulls kept theirs, the rest cycled by ladder position). */
const ACCENT: Record<string, number> = {
  dart: A.damage, twin: A.pathing, prong: A.modifier, wisp: A.mitosis, hornet: A.status, lancet: A.damage, kestrel: A.pathing,
  mantis: A.modifier, bastion: A.mitosis, halberd: A.status, corvette: A.damage, trident: A.pathing, galleon: A.modifier,
  shuttle: A.status, spire: A.damage, leviathan: A.pathing, fan: A.mitosis, citadel: A.status, zenith: A.mitosis,
};

interface Spec { pieces: Pt[][]; details?: ShipPart[]; eng: { dxs: number[]; y0: number; y1: number; w: number; flame: number } }
function ship(id: string, s: Spec): ShipArtDef {
  const e = engines(s.eng.dxs, s.eng.y0, s.eng.y1, s.eng.w, s.eng.flame);
  return { id, parts: [...plates(s.pieces), ...(s.details ?? []), ...e.parts], flames: e.flames, accent: ACCENT[id] };
}

/** Zenith art options (chunk 25c): 1 = spearhead with layered wings, 2 = split twin hull, 3 = crescent with a floating spear. */
const zenith1: Spec = {
  pieces: [
    sym([[0, 0], [0.05, 0.28], [0.09, 0.5], [0.1, 0.9], [0.06, 0.97], [0, 0.97]]),
    ...duo([[0.06, 0.36], [0.26, 0.52], [0.24, 0.6], [0.08, 0.56]]),
    ...duo([[0.08, 0.5], [0.37, 0.7], [0.35, 0.8], [0.09, 0.72]]),
    ...duo([[0.09, 0.64], [0.49, 0.88], [0.46, 0.98], [0.09, 0.9]]),
  ],
  details: [cockpit(0.26, 0.46, 0.04), ...tips(0.41, 0.76, 0.04, 0.06)],
  eng: { dxs: [0, 0.14], y0: 0.9, y1: 0.99, w: 0.09, flame: 0.12 },
};
const zenith2: Spec = {
  pieces: [
    ...duo([[0.27, 0], [0.34, 0.26], [0.36, 0.84], [0.3, 0.96], [0.2, 0.96], [0.17, 0.84], [0.19, 0.26]]),
    [[0.4, 0.4], [0.6, 0.4], [0.6, 0.62], [0.4, 0.62]],
    sym([[0, 0.14], [0.06, 0.4], [0.06, 0.4], [0, 0.4]]),
    ...duo([[0.36, 0.5], [0.49, 0.72], [0.49, 0.9], [0.36, 0.82]]),
  ],
  details: [cockpit(0.42, 0.6, 0.05), ...tips(0.27, 0.02, 0.04, 0.08)],
  eng: { dxs: [0.27], y0: 0.88, y1: 0.99, w: 0.1, flame: 0.12 },
};
const zenith3: Spec = {
  pieces: [
    ...duo([[0.38, 0.0], [0.5, 0.2], [0.46, 0.46], [0.3, 0.74], [0.12, 0.92], [0.0, 0.92], [0, 0.7], [0.12, 0.64], [0.28, 0.46], [0.36, 0.22]]),
    sym([[0, 0.14], [0.06, 0.4], [0, 0.56]]),
    sym([[0, 0.72], [0.12, 0.82], [0.1, 0.97], [0, 0.97]]),
  ],
  details: [cockpit(0.24, 0.4, 0.035), ...tips(0.44, 0.1, 0.04, 0.06)],
  eng: { dxs: [0, 0.18], y0: 0.88, y1: 0.99, w: 0.08, flame: 0.12 },
};
export const ZENITH_SPECS: Record<1 | 2 | 3, Spec> = { 1: zenith1, 2: zenith2, 3: zenith3 };

const SPECS: Record<string, Spec> = {
  dart: {
    pieces: [sym([[0, 0], [0.1, 0.3], [0.27, 0.92], [0.12, 0.8], [0, 0.84]])],
    details: [cockpit(0.3, 0.46, 0.04)],
    eng: { dxs: [0], y0: 0.82, y1: 0.95, w: 0.12, flame: 0.14 },
  },
  twin: {
    pieces: [...duo([[0.07, 0.16], [0.13, 0], [0.2, 0.16], [0.22, 0.9], [0.1, 0.94], [0.06, 0.8]]), box(0.4, 0.6, 0.56, 0.68)],
    details: tips(0.13, 0.1, 0.05, 0.1),
    eng: { dxs: [0.14], y0: 0.84, y1: 0.95, w: 0.08, flame: 0.13 },
  },
  prong: {
    pieces: [sym([[0, 0.5], [0.05, 0.46], [0.05, 0.08], [0.11, 0], [0.19, 0.1], [0.27, 0.6], [0.28, 0.92], [0, 0.92]])],
    details: [cockpit(0.56, 0.7, 0.04), ...tips(0.12, 0.06, 0.04, 0.1)],
    eng: { dxs: [0, 0.16], y0: 0.86, y1: 0.95, w: 0.1, flame: 0.12 },
  },
  wisp: {
    pieces: [sym([[0, 0], [0.07, 0.2], [0.1, 0.55], [0.1, 0.72], [0.24, 0.9], [0.24, 0.98], [0.1, 0.93], [0, 0.96]])],
    details: [cockpit(0.22, 0.4, 0.035)],
    eng: { dxs: [0], y0: 0.86, y1: 0.97, w: 0.1, flame: 0.14 },
  },
  hornet: {
    pieces: [
      ...duo([[0.04, 0.42], [0.14, 0.04], [0.24, 0.0], [0.28, 0.3], [0.46, 0.58], [0.4, 0.72], [0.3, 0.66], [0.04, 0.96]]),
      sym([[0, 0.3], [0.1, 0.5], [0.12, 0.9], [0.06, 0.98], [0, 0.98]]),
    ],
    details: [...tips(0.19, 0.06, 0.04, 0.1), cockpit(0.46, 0.62, 0.04)],
    eng: { dxs: [0], y0: 0.86, y1: 0.97, w: 0.1, flame: 0.12 },
  },
  lancet: {
    pieces: [
      sym([[0, 0], [0.07, 0.3], [0.08, 0.44], [0.1, 0.9], [0, 0.96]]),
      ...duo([[0.07, 0.62], [0.27, 0.36], [0.28, 0.5], [0.12, 0.74]]),
    ],
    details: [cockpit(0.3, 0.44, 0.03), ...tips(0.275, 0.38, 0.03, 0.06)],
    eng: { dxs: [0], y0: 0.84, y1: 0.96, w: 0.09, flame: 0.14 },
  },
  kestrel: {
    pieces: [
      sym([[0, 0], [0.07, 0.16], [0.1, 0.6], [0.08, 0.92], [0, 0.96]]),
      ...duo([[0.06, 0.2], [0.48, 0.52], [0.44, 0.6], [0.3, 0.56], [0.14, 0.7], [0.08, 0.5]]),
    ],
    details: [cockpit(0.24, 0.4, 0.04), ...tips(0.46, 0.46, 0.03, 0.07)],
    eng: { dxs: [0], y0: 0.84, y1: 0.96, w: 0.1, flame: 0.12 },
  },
  mantis: {
    pieces: [
      sym([[0, 0.08], [0.06, 0.22], [0.09, 0.5], [0.12, 0.7], [0.1, 0.92], [0, 0.96]]),
      ...duo([[0.07, 0.38], [0.36, 0.0], [0.46, 0.04], [0.4, 0.34], [0.2, 0.56], [0.1, 0.6]]),
    ],
    details: [cockpit(0.2, 0.36, 0.035), ...tips(0.4, 0.02, 0.04, 0.06)],
    eng: { dxs: [0], y0: 0.84, y1: 0.96, w: 0.1, flame: 0.12 },
  },
  bastion: {
    pieces: [sym([[0, 0.06], [0.2, 0.06], [0.24, 0.0], [0.34, 0.0], [0.38, 0.12], [0.48, 0.22], [0.48, 0.62], [0.3, 0.86], [0.14, 0.86], [0.1, 0.96], [0, 0.96]])],
    details: [...tips(0.29, 0.08, 0.05, 0.07), cockpit(0.36, 0.56, 0.06)],
    eng: { dxs: [0, 0.18], y0: 0.82, y1: 0.95, w: 0.1, flame: 0.1 },
  },
  halberd: {
    pieces: [
      sym([[0, 0], [0.05, 0.15], [0.1, 0.2], [0.1, 0.7], [0.2, 0.8], [0.12, 0.9], [0.12, 0.95], [0, 0.95]]),
      ...duo([[0.08, 0.2], [0.3, 0.08], [0.48, 0.0], [0.48, 0.34], [0.34, 0.5], [0.08, 0.5]]),
    ],
    details: [cockpit(0.22, 0.38, 0.035), ...tips(0.44, 0.02, 0.04, 0.08)],
    eng: { dxs: [0], y0: 0.86, y1: 0.96, w: 0.1, flame: 0.12 },
  },
  corvette: {
    pieces: [
      sym([[0, 0], [0.12, 0.14], [0.24, 0.4], [0.27, 0.62], [0.2, 0.82], [0.1, 0.96], [0, 0.96]]),
      ...duo([[0.28, 0.3], [0.42, 0.34], [0.42, 0.64], [0.28, 0.6]]),
    ],
    details: [cockpit(0.2, 0.38, 0.04), ...tips(0.35, 0.26, 0.04, 0.07)],
    eng: { dxs: [0, 0.16], y0: 0.86, y1: 0.97, w: 0.09, flame: 0.12 },
  },
  trident: {
    pieces: [
      sym([[0, 0], [0.06, 0.1], [0.06, 0.5], [0.2, 0.5], [0.46, 0.72], [0.34, 0.84], [0.12, 0.84], [0.1, 0.96], [0, 0.96]]),
      ...duo([[0.2, 0.52], [0.2, 0.14], [0.33, 0.04], [0.46, 0.14], [0.46, 0.7]]),
    ],
    details: [cockpit(0.34, 0.5, 0.035), ...tips(0.33, 0.1, 0.04, 0.08)],
    eng: { dxs: [0, 0.3], y0: 0.82, y1: 0.95, w: 0.1, flame: 0.1 },
  },
  galleon: {
    pieces: [sym([[0, 0], [0.07, 0.12], [0.14, 0.3], [0.2, 0.5], [0.34, 0.56], [0.46, 0.66], [0.46, 0.88], [0.32, 0.94], [0.14, 0.94], [0, 0.94]])],
    details: [cockpit(0.28, 0.48, 0.05), ...tips(0.4, 0.58, 0.04, 0.07)],
    eng: { dxs: [0, 0.2], y0: 0.84, y1: 0.97, w: 0.1, flame: 0.1 },
  },
  shuttle: {
    pieces: [
      sym([[0, 0], [0.06, 0.02], [0.1, 0.16], [0.12, 0.84], [0.1, 0.96], [0, 0.96]]),
      ...duo([[0.1, 0.5], [0.46, 0.78], [0.46, 0.9], [0.1, 0.86]]),
    ],
    details: [cockpit(0.12, 0.26, 0.04), ...tips(0.44, 0.72, 0.03, 0.07)],
    eng: { dxs: [0, 0.2], y0: 0.88, y1: 0.97, w: 0.09, flame: 0.1 },
  },
  spire: {
    pieces: [
      sym([[0, 0], [0.07, 0.28], [0.1, 0.5], [0.12, 0.9], [0.1, 0.97], [0, 0.97]]),
      ...duo([[0.09, 0.5], [0.26, 0.4], [0.42, 0.5], [0.42, 0.78], [0.16, 0.86]]),
    ],
    details: [cockpit(0.24, 0.44, 0.04), ...tips(0.26, 0.42, 0.04, 0.06)],
    eng: { dxs: [0, 0.14], y0: 0.88, y1: 0.98, w: 0.09, flame: 0.1 },
  },
  leviathan: {
    pieces: [
      sym([[0, 0.16], [0.05, 0.06], [0.12, 0.0], [0.14, 0.2], [0.26, 0.3], [0.2, 0.4], [0.32, 0.5], [0.22, 0.6], [0.2, 0.78], [0.12, 0.92], [0, 0.98]]),
      ...duo([[0.2, 0.74], [0.46, 0.88], [0.4, 0.98], [0.12, 0.92]]),
    ],
    details: [cockpit(0.3, 0.5, 0.05), ...tips(0.13, 0.02, 0.04, 0.08)],
    eng: { dxs: [0, 0.2], y0: 0.88, y1: 0.99, w: 0.09, flame: 0.1 },
  },
  fan: {
    pieces: [sym([[0, 0.14], [0.11, 0.0], [0.2, 0.1], [0.32, 0.0], [0.48, 0.12], [0.46, 0.34], [0.1, 0.9], [0.06, 0.96], [0, 0.96]])],
    details: [cockpit(0.4, 0.62, 0.05), ...tips(0.32, 0.04, 0.05, 0.06)],
    eng: { dxs: [0], y0: 0.86, y1: 0.97, w: 0.1, flame: 0.12 },
  },
  citadel: {
    pieces: [sym([[0, 0.04], [0.12, 0.04], [0.14, 0.0], [0.22, 0.0], [0.24, 0.06], [0.4, 0.06], [0.42, 0.0], [0.5, 0.0], [0.5, 0.62], [0.44, 0.7], [0.2, 0.7], [0.12, 0.86], [0.08, 0.96], [0, 0.96]])],
    details: [{ tone: 'core', points: sym([[0, 0.26], [0.2, 0.26], [0.2, 0.58], [0, 0.58]]) }, cockpit(0.34, 0.5, 0.06), ...tips(0.38, 0.1, 0.05, 0.06)],
    eng: { dxs: [0, 0.14], y0: 0.86, y1: 0.97, w: 0.1, flame: 0.1 },
  },
  zenith: ZENITH_SPECS[ZENITH_ART],
};

/** The art of every hull of the ladder, by id. */
export const SHIP_ART: Record<string, ShipArtDef> = Object.fromEntries(Object.entries(SPECS).map(([id, s]) => [id, ship(id, s)]));
/** The three Zenith options (for the contact sheet and the owner's switch). */
export const ZENITH_OPTIONS: ShipArtDef[] = ([1, 2, 3] as const).map(n => ship('zenith', ZENITH_SPECS[n]));

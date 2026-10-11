import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { CONFIG } from '../config';
import { CATEGORY_COLOR } from '../builder/draw';

/**
 * Ship art: code-drawn, flat, static. A ship is data (`ShipArtDef`): nested sharp polygons in a unit box (x right, y down,
 * the nose at the top, (0.5, 0.5) the ship centre), the same language as the block plates (light grey edge, mid and dark
 * greys, dark core), plus two small accent-coloured pieces (engine bar, cockpit square). Adding a ship is adding a def.
 */
export type Pt = [number, number];
export type LayerRole = 'outer' | 'mid' | 'inner' | 'core';

export interface ShipLayer { points: Pt[]; role: LayerRole }

export interface ShipArtDef {
  id: string;
  layers: ShipLayer[];
  /** Accent colour of the hull: only the engine bar and the cockpit square use it. */
  accent: number;
  /** Engine bar [x0, x1, y0, y1] in the unit box; default a centred bar at the back. */
  engine?: [number, number, number, number];
  /** Where the nose is in the unit box (y); kept for callers that want to place a muzzle on the art. */
  muzzleY?: number;
  /** Size multiplier: 1 draws the unit box ART_W x ART_H. */
  size: number;
}


/** Shrinks a polygon toward its centroid (used to nest the mid and inner layers inside the outer one). */
function inset(points: Pt[], k: number): Pt[] {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  return points.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as Pt);
}

/** Four nested copies of every silhouette piece: light edge, mid grey, dark grey, dark core. */
function nest(...pieces: Pt[][]): ShipLayer[] {
  const out: ShipLayer[] = [];
  for (const p of pieces) out.push({ points: p, role: 'outer' });
  for (const p of pieces) out.push({ points: inset(p, 0.8), role: 'mid' });
  for (const p of pieces) out.push({ points: inset(p, 0.6), role: 'inner' });
  for (const p of pieces) out.push({ points: inset(p, 0.32), role: 'core' });
  return out;
}

export const SHIP_ART: Record<string, ShipArtDef> = {
  /** Narrow arrowhead. */
  dart: {
    id: 'dart', accent: CATEGORY_COLOR.damage, size: 1, muzzleY: 0.02,
    layers: nest([[0.5, 0.0], [0.77, 0.92], [0.5, 0.74], [0.23, 0.92]]),
    engine: [0.43, 0.57, 0.92, 0.98],
  },
  /** Arrowhead with two small side pods. */
  twin: {
    id: 'twin', accent: CATEGORY_COLOR.pathing, size: 1, muzzleY: 0.02,
    layers: nest(
      [[0.5, 0.0], [0.7, 0.9], [0.5, 0.74], [0.3, 0.9]],
      [[0.08, 0.42], [0.22, 0.42], [0.22, 0.86], [0.08, 0.86]],
      [[0.78, 0.42], [0.92, 0.42], [0.92, 0.86], [0.78, 0.86]],
    ),
    engine: [0.43, 0.57, 0.88, 0.94],
  },
  /** Two forward prongs on one body. */
  prong: {
    id: 'prong', accent: CATEGORY_COLOR.modifier, size: 1, muzzleY: 0.04,
    layers: nest([[0.2, 0.04], [0.34, 0.04], [0.42, 0.52], [0.58, 0.52], [0.66, 0.04], [0.8, 0.04], [0.8, 0.92], [0.2, 0.92]]),
    engine: [0.42, 0.58, 0.92, 0.98],
  },
  /** Wide fan. */
  fan: {
    id: 'fan', accent: CATEGORY_COLOR.mitosis, size: 1, muzzleY: 0.04,
    layers: nest([[0.4, 0.94], [0.6, 0.94], [0.97, 0.12], [0.78, 0.04], [0.5, 0.16], [0.22, 0.04], [0.03, 0.12]]),
    engine: [0.43, 0.57, 0.94, 0.99],
  },
  /** Boxy body with wing blocks. */
  shuttle: {
    id: 'shuttle', accent: CATEGORY_COLOR.status, size: 1, muzzleY: 0.04,
    layers: nest(
      [[0.4, 0.04], [0.6, 0.04], [0.7, 0.16], [0.7, 0.94], [0.3, 0.94], [0.3, 0.16]],
      [[0.04, 0.5], [0.3, 0.5], [0.3, 0.86], [0.04, 0.86]],
      [[0.7, 0.5], [0.96, 0.5], [0.96, 0.86], [0.7, 0.86]],
    ),
    engine: [0.42, 0.58, 0.94, 1.0],
  },
};

/** Grey ramp of the ships (same family as the block plates): light edge, mid greys, dark core; colour only in small pieces. */
export const SHIP_EDGE = 0xd4d4d8;
export const SHIP_MID = 0x8a8a90;
export const SHIP_DARK = 0x55555a;
export const SHIP_CORE = 0x26262a;
const ROLE_FILL: Record<LayerRole, number> = { outer: SHIP_EDGE, mid: SHIP_MID, inner: SHIP_DARK, core: SHIP_CORE };

/** Visible size of every ship in px at the 540 px wide viewport (the unit box is stretched to this). */
export const ART_W = 26;
export const ART_H = 34;
/** Texture resolution (the sheets zoom the ships 3x). */
const TEX_RES = 4;

/** Draws a ship into a Graphics at origin (top-left of its box); `w` x `h` is the box in px. */
export function drawShipArt(g: Graphics, def: ShipArtDef, w = ART_W, h = ART_H): Graphics {
  const kx = w * def.size;
  const ky = h * def.size;
  g.rect(0, 0, kx, ky).fill({ color: 0x000000, alpha: 0 });   // keeps the texture's bounds equal to the unit box, so the art centres on the ship
  for (const layer of def.layers) {
    g.poly(layer.points.flatMap(([x, y]) => [x * kx, y * ky])).fill(ROLE_FILL[layer.role]);
  }
  // Two small coloured pieces: the engine bar at the back and a cockpit square in the core.
  const e = def.engine ?? [0.42, 0.58, 0.92, 0.98];
  g.rect(e[0] * kx, e[2] * ky, (e[1] - e[0]) * kx, (e[3] - e[2]) * ky).fill(def.accent);
  g.rect(0.44 * kx, 0.4 * ky, 0.12 * kx, 0.12 * ky).fill(def.accent);
  return g;
}

/** What the cache needs from a renderer (Pixi's `renderer.generateTexture`; tests pass a fake). */
export interface TextureMaker { generateTexture(options: { target: Graphics; resolution?: number }): Texture }

const cache = new Map<string, Texture>();

/** One texture per ship id, drawn once and reused. */
export function getShipTexture(renderer: TextureMaker, id: string): Texture {
  let t = cache.get(id);
  if (!t) {
    const def = SHIP_ART[id] ?? SHIP_ART.dart;
    const g = drawShipArt(new Graphics(), def);
    t = renderer.generateTexture({ target: g, resolution: TEX_RES });
    g.destroy();
    cache.set(id, t);
  }
  return t;
}

/** For tests: forget cached textures. */
export function clearShipTextureCache() { cache.clear(); }

/** A small sprite of a ship's art (Shop cards, the Build hull list), centred on (0,0), `px` tall, aspect kept. */
export function shipThumbnail(renderer: TextureMaker, id: string, px: number): Sprite {
  const s = new Sprite(getShipTexture(renderer, id));
  s.anchor.set(0.5);
  s.height = px;
  s.width = px * (ART_W / ART_H);
  return s;
}

/** A muzzle tick sits where an ejector's shots leave. */
export interface MuzzleSpot { x: number; y: number; dir: 'N' | 'E' | 'S' | 'W' }

/**
 * A ship in the Fly screens: the cached art and a small light-grey notch at every ejector's firing position. There is no
 * dot: the hit point is an invisible circle at the ship centre (HIT_RADIUS), so touching any part of the art reads as death.
 */
export class ShipView {
  readonly container = new Container();
  private art: Sprite;
  private ticks = new Graphics();

  constructor(renderer: TextureMaker, hullId: string, muzzles: MuzzleSpot[]) {
    const k = CONFIG.VIEW.W / 540;
    const def = SHIP_ART[hullId] ?? SHIP_ART.dart;
    this.art = new Sprite(getShipTexture(renderer, hullId));
    this.art.anchor.set(0.5);
    this.art.width = ART_W * def.size * k;
    this.art.height = ART_H * def.size * k;
    for (const m of muzzles) {
      const along = m.dir === 'E' || m.dir === 'W';
      const w = along ? 3 : 1.5;
      const h = along ? 1.5 : 3;
      this.ticks.rect(m.x - w / 2, m.y - h / 2, w, h).fill(SHIP_EDGE);
    }
    this.container.addChild(this.art, this.ticks);
  }

  setPosition(x: number, y: number) { this.container.position.set(x, y); }
  setAlpha(a: number) { this.container.alpha = a; }
}

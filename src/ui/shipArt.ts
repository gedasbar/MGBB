import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { CONFIG } from '../config';
import { CATEGORY_COLOR } from '../builder/draw';
import { THEME } from './theme';

/**
 * Ship art: code-drawn, flat, static. A ship is data (`ShipArtDef`): nested sharp polygons in a unit box (x right, y down,
 * the nose at the top, (0.5, 0.5) the ship centre), the same language as the block plates (outer grey, mid = accent
 * darkened, inner dark), plus a small accent engine bar at the back. Adding a ship is adding a def.
 */
export type Pt = [number, number];
export type LayerRole = 'outer' | 'mid' | 'inner';

export interface ShipLayer { points: Pt[]; role: LayerRole }

export interface ShipArtDef {
  id: string;
  layers: ShipLayer[];
  /** Accent colour (a block category colour): the mid layers and the engine bar. */
  accent: number;
  /** Engine bar [x0, x1, y0, y1] in the unit box; default a centred bar at the back. */
  engine?: [number, number, number, number];
  /** Where the nose is in the unit box (y); kept for callers that want to place a muzzle on the art. */
  muzzleY?: number;
  /** Height multiplier: 1 draws the unit box ART_PX tall. */
  size: number;
}

/** Height of a size-1 ship in px at the 540 px wide viewport. */
export const ART_PX = 44;
const INNER_FILL = THEME.plateFace;

const mid = (c: number) => darken(c, 0.5);
function darken(c: number, k: number): number {
  const r = Math.round(((c >> 16) & 255) * k);
  const g = Math.round(((c >> 8) & 255) * k);
  const b = Math.round((c & 255) * k);
  return (r << 16) | (g << 8) | b;
}

/** Shrinks a polygon toward its centroid (used to nest the mid and inner layers inside the outer one). */
function inset(points: Pt[], k: number): Pt[] {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  return points.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as Pt);
}

/** outer + a 0.72 mid + a 0.42 inner for every silhouette piece. */
function nest(...pieces: Pt[][]): ShipLayer[] {
  const out: ShipLayer[] = [];
  for (const p of pieces) out.push({ points: p, role: 'outer' });
  for (const p of pieces) out.push({ points: inset(p, 0.72), role: 'mid' });
  for (const p of pieces) out.push({ points: inset(p, 0.4), role: 'inner' });
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

/** Greys of the art: muted on purpose so the bright green hit dot is what reads as "can die". */
const OUTER = THEME.plateOuter;

/** Draws a ship into a Graphics at origin (top-left of its box); `px` is the box edge in px. */
export function drawShipArt(g: Graphics, def: ShipArtDef, px: number): Graphics {
  const k = px * def.size;
  g.rect(0, 0, k, k).fill({ color: 0x000000, alpha: 0 });   // keeps the texture's bounds equal to the unit box, so the art centres on the dot
  for (const layer of def.layers) {
    const fill = layer.role === 'outer' ? OUTER : layer.role === 'mid' ? mid(def.accent) : INNER_FILL;
    g.poly(layer.points.flatMap(([x, y]) => [x * k, y * k])).fill(fill);
  }
  const e = def.engine ?? [0.42, 0.58, 0.92, 0.98];
  g.rect(e[0] * k, e[2] * k, (e[1] - e[0]) * k, (e[3] - e[2]) * k).fill(def.accent);
  return g;
}

/** What the cache needs from a renderer (Pixi's `renderer.generateTexture`; tests pass a fake). */
export interface TextureMaker { generateTexture(options: { target: Graphics; resolution?: number }): Texture }

const cache = new Map<string, Texture>();

/** One texture per ship id and size, drawn once and reused. */
export function getShipTexture(renderer: TextureMaker, id: string, px = ART_PX): Texture {
  const key = `${id}:${px}`;
  let t = cache.get(key);
  if (!t) {
    const def = SHIP_ART[id] ?? SHIP_ART.dart;
    const g = drawShipArt(new Graphics(), def, px);
    t = renderer.generateTexture({ target: g, resolution: 2 });
    g.destroy();
    cache.set(key, t);
  }
  return t;
}

/** For tests: forget cached textures. */
export function clearShipTextureCache() { cache.clear(); }

/** A small sprite of a ship's art (Shop cards, the Build hull list), centred on (0,0) and `px` tall. */
export function shipThumbnail(renderer: TextureMaker, id: string, px: number): Sprite {
  const s = new Sprite(getShipTexture(renderer, id));
  s.anchor.set(0.5);
  s.width = px;
  s.height = px;
  return s;
}

/** Muzzle ticks and the hit dot sit on top of the art. */
export interface MuzzleSpot { x: number; y: number; dir: 'N' | 'E' | 'S' | 'W' }

/**
 * A ship in the Fly screens: the cached art (muted greys) behind, a small tick at every ejector's firing position and the
 * bright green hit dot with a thin ring on top (the dot is the real hit point). Built once; only position and alpha move.
 */
export class ShipView {
  readonly container = new Container();
  private art: Sprite;
  private ticks = new Graphics();
  private dot: Graphics;

  constructor(renderer: TextureMaker, hullId: string, muzzles: MuzzleSpot[], hitR: number = CONFIG.PLAYER.HITBOX_R) {
    const px = ART_PX * (CONFIG.VIEW.W / 540);
    const def = SHIP_ART[hullId] ?? SHIP_ART.dart;
    this.art = new Sprite(getShipTexture(renderer, hullId, px));
    this.art.anchor.set(0.5);
    this.art.width = px * def.size;
    this.art.height = px * def.size;
    for (const m of muzzles) {
      const along = m.dir === 'E' || m.dir === 'W';
      const w = along ? 4 : 2;
      const h = along ? 2 : 4;
      // Nudged off the dead centre so the middle pixel of the dot stays bright green.
      const oy = m.dir === 'N' || m.dir === 'S' ? (m.y <= 0 ? -1.5 : 1.5) : 0;
      this.ticks.rect(m.x - w / 2, m.y + oy - h / 2, w, h).fill(0x101012);
    }
    this.dot = new Graphics().circle(0, 0, hitR + 3).stroke({ color: 0x00ff00, width: 1.5, alpha: 0.9 }).circle(0, 0, hitR).fill(0x00ff00);
    // The ejectors sit a few px from the centre (inside the dot), so the ticks are drawn over it.
    this.container.addChild(this.art, this.dot, this.ticks);
  }

  setPosition(x: number, y: number) { this.container.position.set(x, y); }
  setAlpha(a: number) { this.container.alpha = a; }
}

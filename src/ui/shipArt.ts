import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { CONFIG } from '../config';
import { SIZE_CLASSES, sizeClassOf } from '../data/hulls';
import { hasCustomArt } from '../shipyard/constants';
import { CUSTOM_SHIP_ART, FLAME_MAX_LENGTH, SHIP_ART, ShipArtDef, Tone } from './shipShapes';

export { SHIP_ART };

/**
 * Ship art drawing (chunk 25c). The shapes are data in `shipShapes.ts` (one per hull, style C); this file turns a shape into
 * textures and sprites: a hull texture (the unit box, cached per hull) and two flame textures (a long and a short flame,
 * the ship flickers between them), used by the fly screens (`ShipView`) and the hull picker (`shipThumbnail`).
 */
/** Grey ramp of the ships (same family as the block plates): light edge, mid greys, dark core; colour only in small pieces. */
const TONE_FILL: Record<Exclude<Tone, 'accent'>, number> = { edge: 0xd4d4d8, mid: 0x8a8a90, dark: 0x55555a, core: 0x26262a };
const FLAME_OUTER = 0xf0883a;
const FLAME_INNER = 0xf2c230;
/** The short flame of the flicker is this share of the long one, and the flicker swaps every FLICKER_SECONDS. */
const FLAME_SHORT = 0.65;
const FLICKER_SECONDS = 0.07;

/** Visible size of a small ship in px at the 540 px wide viewport (the unit box is stretched to this); bigger hulls use their size class (data/hulls.ts). */
export const ART_W = SIZE_CLASSES.small.artW;
export const ART_H = SIZE_CLASSES.small.artH;

/** Art box in px of a hull: its size class. */
export function artSizeOf(id: string): { w: number; h: number } {
  const c = SIZE_CLASSES[sizeClassOf(id)];
  return { w: c.artW, h: c.artH };
}
/** Texture resolution (the sheets zoom the ships 3x). */
const TEX_RES = 4;

/** Draws a ship's hull into a Graphics at origin (top-left of its box); `w` x `h` is the box in px. */
function drawHull(g: Graphics, def: ShipArtDef, w: number, h: number): Graphics {
  g.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0 });   // keeps the texture's bounds equal to the unit box, so the art centres on the ship
  for (const p of def.parts) g.poly(p.points.flatMap(([x, y]) => [x * w, y * h])).fill(p.tone === 'accent' ? def.accent : TONE_FILL[p.tone]);
  return g;
}

/** The flames of a ship at a length factor, in a box as wide as the hull and FLAME_MAX_LENGTH taller (the hull is the top part). */
function drawFlames(g: Graphics, def: ShipArtDef, w: number, h: number, lengthMul: number): Graphics {
  g.rect(0, 0, w, h * (1 + FLAME_MAX_LENGTH)).fill({ color: 0x000000, alpha: 0 });
  for (const f of def.flames) {
    const cx = f.x * w, y0 = f.y * h, hw = (f.width / 2) * w, len = f.length * h * lengthMul;
    g.poly([cx - hw, y0, cx + hw, y0, cx, y0 + len]).fill(FLAME_OUTER);
    g.poly([cx - hw * 0.5, y0, cx + hw * 0.5, y0, cx, y0 + len * 0.55]).fill(FLAME_INNER);
  }
  return g;
}

/** What the cache needs from a renderer (Pixi's `renderer.generateTexture`; tests pass a fake). */
export interface TextureMaker { generateTexture(options: { target: Graphics; resolution?: number }): Texture }

const cache = new Map<string, Texture>();
const flameCache = new Map<string, [Texture, Texture]>();

/** Chunk 31b: every custom ship (and the debug test hull) shares the one fixed custom drawing. */
const artOf = (id: string): ShipArtDef => (hasCustomArt(id) ? CUSTOM_SHIP_ART : SHIP_ART[id] ?? SHIP_ART.dart);
/** Cache key: a custom hull's size class changes when its design does, and the texture is drawn at the size class's box. */
const keyOf = (id: string): string => { const a = artSizeOf(id); return `${id}@${a.w}x${a.h}`; };

/** One hull texture per ship id, drawn once and reused. */
export function getShipTexture(renderer: TextureMaker, id: string, def?: ShipArtDef): Texture {
  let t = def ? undefined : cache.get(keyOf(id));
  if (!t) {
    const a = artSizeOf(id);
    const g = drawHull(new Graphics(), def ?? artOf(id), a.w, a.h);
    t = renderer.generateTexture({ target: g, resolution: TEX_RES });
    g.destroy();
    if (!def) cache.set(keyOf(id), t);
  }
  return t;
}

/** The long and the short flame texture of a ship (same box as its hull, taller by FLAME_MAX_LENGTH). */
export function getFlameTextures(renderer: TextureMaker, id: string, art?: ShipArtDef): [Texture, Texture] {
  let t = art ? undefined : flameCache.get(keyOf(id));
  if (!t) {
    const a = artSizeOf(id), def = art ?? artOf(id);
    const make = (mul: number) => { const g = drawFlames(new Graphics(), def, a.w, a.h, mul); const tex = renderer.generateTexture({ target: g, resolution: TEX_RES }); g.destroy(); return tex; };
    t = [make(1), make(FLAME_SHORT)];
    if (!art) flameCache.set(keyOf(id), t);
  }
  return t;
}

/** For tests: forget cached textures. */
export function clearShipTextureCache() { cache.clear(); flameCache.clear(); }

/** A ship's art as sprites: the flame under the hull, both in a Container centred on the hull box. */
function shipSprites(renderer: TextureMaker, id: string, w: number, h: number, def?: ShipArtDef): { box: Container; flame: Sprite; flames: [Texture, Texture] } {
  const box = new Container();
  const flames = getFlameTextures(renderer, id, def);
  const flame = new Sprite(flames[0]);
  flame.anchor.set(0.5, 0.5 / (1 + FLAME_MAX_LENGTH));
  flame.width = w; flame.height = h * (1 + FLAME_MAX_LENGTH);
  const hull = new Sprite(getShipTexture(renderer, id, def));
  hull.anchor.set(0.5);
  hull.width = w; hull.height = h;
  box.addChild(flame, hull);
  return { box, flame, flames };
}

/** A small picture of a ship's art (the hull picker; `def` draws another art of the same hull, uncached, for the contact sheet), centred on the hull box, `px` tall, aspect kept, flame included. */
export function shipThumbnail(renderer: TextureMaker, id: string, px: number, def?: ShipArtDef): Container {
  const a = artSizeOf(id);
  return shipSprites(renderer, id, px * (a.w / a.h), px, def).box;
}

/**
 * A ship in the Fly screens: the cached art only (chunk 25a: no marks where shots leave). There is no dot: the hit point is
 * an invisible circle at the ship centre (HIT_RADIUS), so touching any part of the art reads as death. The flame flickers
 * between two cached textures by the clock (setPosition runs every frame; no per-frame drawing).
 */
export class ShipView {
  readonly container = new Container();
  private flame: Sprite;
  private flames: [Texture, Texture];

  constructor(renderer: TextureMaker, hullId: string) {
    const k = CONFIG.VIEW.W / 540;
    const a = artSizeOf(hullId);
    const s = shipSprites(renderer, hullId, a.w * k, a.h * k);
    this.flame = s.flame; this.flames = s.flames;
    this.container.addChild(s.box);
  }

  setPosition(x: number, y: number) {
    this.container.position.set(x, y);
    this.flame.texture = this.flames[Math.floor(performance.now() / 1000 / FLICKER_SECONDS) % 2];
  }
  setAlpha(a: number) { this.container.alpha = a; }
}

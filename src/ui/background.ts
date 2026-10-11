import { Container, Graphics, Texture, TilingSprite } from 'pixi.js';
import { CONFIG } from '../config';
import { Mulberry32 } from '../rng';

/**
 * Procedural backgrounds for the fly screens. A background is data (`BackgroundDef`): a base colour and a few layers of
 * stars or angular rock masses. Each layer is drawn ONCE with a seeded RNG into a tiling texture and shown with a
 * TilingSprite, so the per-frame cost is moving a handful of tile offsets. Everything is kept low contrast so ships,
 * blocks and rocks always stand out (see `backgroundMaxLuminance` and its test).
 */
export type LayerKind = 'stars' | 'rocks';

export interface BgLayerDef {
  kind: LayerKind;
  /** Stars: dots per tile. Rocks: masses per tile. */
  density: number;
  /** Stars: dot size in px. Rocks: mass size in px. */
  size: [number, number];
  tint: number;
  opacity: number;
  /** Share of the scroll speed this layer moves at (far layers are slower). */
  parallax: number;
}

export interface BackgroundDef {
  id: string;
  baseColor: number;
  layers: BgLayerDef[];
}

/** Edge of the repeating tile in px. */
export const TILE = 512;

const galaxy = (id: string, base: number, tint: number, dense = 1): BackgroundDef => ({
  id, baseColor: base,
  layers: [
    { kind: 'stars', density: Math.round(70 * dense), size: [1, 1], tint, opacity: 0.25, parallax: 0.15 },
    { kind: 'stars', density: Math.round(32 * dense), size: [1, 1.6], tint, opacity: 0.33, parallax: 0.3 },
    { kind: 'stars', density: Math.round(10 * dense), size: [1.6, 2.2], tint, opacity: 0.42, parallax: 0.5 },
  ],
});

const cave = (id: string, base: number, far: number, near: number, specks?: { tint: number; density: number }): BackgroundDef => ({
  id, baseColor: base,
  layers: [
    { kind: 'rocks', density: 7, size: [150, 260], tint: far, opacity: 1, parallax: 0.2 },
    { kind: 'rocks', density: 6, size: [90, 180], tint: near, opacity: 1, parallax: 0.45 },
    ...(specks ? [{ kind: 'stars' as const, density: specks.density, size: [1, 1.8] as [number, number], tint: specks.tint, opacity: 0.4, parallax: 0.35 }] : []),
  ],
});

export const BACKGROUNDS: Record<string, BackgroundDef> = {
  galaxy: galaxy('galaxy', 0x05060a, 0xffffff),
  cave_blue: cave('cave_blue', 0x090c11, 0x131a23, 0x1a2430),
  galaxy_violet: galaxy('galaxy_violet', 0x08060e, 0xcdb8ff),
  cave_brown: cave('cave_brown', 0x0e0a07, 0x1c1510, 0x261c14),
  galaxy_red: galaxy('galaxy_red', 0x0c0505, 0xffc4c4, 2),
  /** The one background of every spike tier: an angular cave with a dark red tint and a few faint orange specks. */
  ember: cave('ember', 0x100606, 0x1f0d0c, 0x2a1210, { tint: 0xff8c3a, density: 6 }),
};

export const BACKGROUND_IDS = Object.keys(BACKGROUNDS);

/** Campaign schedule: bands of 20 tiers, every spike tier on Ember (milestones that are not spikes keep their band). */
const BANDS = ['galaxy', 'cave_blue', 'galaxy_violet', 'cave_brown', 'galaxy_red'];
export function backgroundForTier(tier: number, isSpike: boolean): string {
  if (isSpike) return 'ember';
  const band = Math.max(0, Math.min(BANDS.length - 1, Math.floor((tier - 1) / 20)));
  return BANDS[band];
}

/** Free Fly: Galaxy, then every FREE_FLY_THEME_SECONDS the next of these, repeating. */
export const FREE_FLY_THEMES = ['galaxy', 'cave_blue', 'galaxy_violet', 'cave_brown'];
export const FREE_FLY_THEME_SECONDS = 180;
export const CROSSFADE_SECONDS = 3;
export function freeFlyThemeAt(seconds: number): string {
  return FREE_FLY_THEMES[Math.floor(Math.max(0, seconds) / FREE_FLY_THEME_SECONDS) % FREE_FLY_THEMES.length];
}

const lum = (c: number) => (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255;
const mix = (base: number, tint: number, a: number) => {
  const ch = (s: number) => Math.round(((base >> s) & 255) * (1 - a) + ((tint >> s) & 255) * a);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** Brightest pixel a background can produce (relative luminance 0..1): a full-strength layer element over the base. */
export function backgroundMaxLuminance(def: BackgroundDef): { base: number; stars: number; rocks: number } {
  let stars = lum(def.baseColor);
  let rocks = lum(def.baseColor);
  for (const l of def.layers) {
    const v = lum(mix(def.baseColor, l.tint, l.opacity));
    if (l.kind === 'stars') stars = Math.max(stars, v); else rocks = Math.max(rocks, v);
  }
  return { base: lum(def.baseColor), stars, rocks };
}

/** What the texture cache needs from a renderer. */
export interface TextureMaker { generateTexture(options: { target: Graphics; resolution?: number; frame?: any }): Texture }

const texCache = new Map<string, Texture>();
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** Draws one layer into a TILE x TILE texture (elements near an edge are repeated on the far side so it tiles). */
export function layerTexture(renderer: TextureMaker, def: BackgroundDef, index: number): Texture {
  const key = `${def.id}:${index}`;
  let t = texCache.get(key);
  if (t) return t;
  const layer = def.layers[index];
  const rnd = new Mulberry32(hash(key));
  const g = new Graphics();
  g.rect(0, 0, TILE, TILE).fill({ color: 0x000000, alpha: 0 });   // fixes the texture to the full tile
  const offsets = [0, -TILE, TILE];
  for (let i = 0; i < layer.density; i++) {
    const x = rnd.next() * TILE;
    const y = rnd.next() * TILE;
    const size = layer.size[0] + rnd.next() * (layer.size[1] - layer.size[0]);
    if (layer.kind === 'stars') {
      for (const ox of offsets) for (const oy of offsets) {
        const px = x + ox, py = y + oy;
        if (px < -4 || py < -4 || px > TILE + 4 || py > TILE + 4) continue;
        g.rect(px, py, size, size).fill({ color: layer.tint, alpha: layer.opacity });
      }
    } else {
      // An angular mass: 5 to 8 vertices around (x, y), jittered radius, sharp edges.
      const n = 5 + Math.floor(rnd.next() * 4);
      const pts: number[] = [];
      const r0 = size / 2;
      const rot = rnd.next() * Math.PI * 2;
      for (let k = 0; k < n; k++) {
        const a = rot + (k * Math.PI * 2) / n + (rnd.next() - 0.5) * 0.5;
        const r = r0 * (0.55 + rnd.next() * 0.45);
        pts.push(Math.cos(a) * r, Math.sin(a) * r);
      }
      for (const ox of offsets) for (const oy of offsets) {
        const cx = x + ox, cy = y + oy;
        if (cx < -r0 || cy < -r0 || cx > TILE + r0 || cy > TILE + r0) continue;
        g.poly(pts.map((v, j) => v + (j % 2 === 0 ? cx : cy))).fill({ color: layer.tint, alpha: layer.opacity });
      }
    }
  }
  t = renderer.generateTexture({ target: g, resolution: 1 });
  g.destroy();
  texCache.set(key, t);
  return t;
}

/** For tests: forget the cached textures. */
export function clearBackgroundCache() { texCache.clear(); }

class LayerSet {
  readonly container = new Container();
  private sprites: TilingSprite[] = [];

  constructor(renderer: TextureMaker, readonly def: BackgroundDef, w: number, h: number) {
    this.container.addChild(new Graphics().rect(0, 0, w, h).fill(def.baseColor));
    def.layers.forEach((_l, i) => {
      const s = new TilingSprite({ texture: layerTexture(renderer, def, i), width: w, height: h });
      this.sprites.push(s);
      this.container.addChild(s);
    });
  }

  /** Absolute scroll position (px, unwrapped): the tiles repeat. */
  setScroll(y: number, camX: number, hFactor: number) {
    for (let i = 0; i < this.sprites.length; i++) {
      const p = this.def.layers[i].parallax;
      this.sprites[i].tilePosition.set(-camX * hFactor * p, y * p);
    }
  }
}

/**
 * The background of a fly screen: sits at the bottom of the screen's container. Layers scroll down with the scroll
 * speed you give it (times their parallax) and, on rings, sideways with the camera x times `hFactor`.
 */
export class BackgroundView {
  readonly container = new Container();
  private cur: LayerSet;
  private next: LayerSet | null = null;
  private fade = 0;
  private fadeTime = CROSSFADE_SECONDS;
  private y = 0;
  /** Horizontal scroll share (rings only; Free Fly passes camX 0). */
  hFactor = 0.25;

  constructor(private renderer: TextureMaker, id: string, private w = CONFIG.VIEW.W, private h = CONFIG.VIEW.H) {
    this.cur = new LayerSet(renderer, BACKGROUNDS[id] ?? BACKGROUNDS.galaxy, w, h);
    this.container.addChild(this.cur.container);
  }

  get id(): string { return (this.next ?? this.cur).def.id; }

  /** Switches at once. */
  set(id: string) {
    if (id === this.cur.def.id && !this.next) return;
    this.container.removeChildren();
    this.cur.container.destroy({ children: true });
    if (this.next) { this.next.container.destroy({ children: true }); this.next = null; }
    this.cur = new LayerSet(this.renderer, BACKGROUNDS[id] ?? BACKGROUNDS.galaxy, this.w, this.h);
    this.container.addChild(this.cur.container);
  }

  /** Fades to another background over `seconds`. */
  crossfadeTo(id: string, seconds = CROSSFADE_SECONDS) {
    if (id === this.id) return;
    if (this.next) this.finishFade();
    this.next = new LayerSet(this.renderer, BACKGROUNDS[id] ?? BACKGROUNDS.galaxy, this.w, this.h);
    this.next.container.alpha = 0;
    this.container.addChild(this.next.container);
    this.fade = 0;
    this.fadeTime = Math.max(0.001, seconds);
  }

  private finishFade() {
    if (!this.next) return;
    this.container.removeChild(this.cur.container);
    this.cur.container.destroy({ children: true });
    this.cur = this.next;
    this.cur.container.alpha = 1;
    this.next = null;
  }

  /** `speed` px/s of scroll (down), `camX` the camera x on rings (0 elsewhere). */
  update(dt: number, speed: number, camX = 0) {
    this.y += speed * dt;
    this.cur.setScroll(this.y, camX, this.hFactor);
    if (this.next) {
      this.next.setScroll(this.y, camX, this.hFactor);
      this.fade += dt;
      this.next.container.alpha = Math.min(1, this.fade / this.fadeTime);
      if (this.fade >= this.fadeTime) this.finishFade();
    }
  }

  get fading(): boolean { return this.next !== null; }
}

/** `?bg=<id>` in the URL forces a background in any fly screen (`off` hides it); null when not given. */
export function forcedBackground(): string | null {
  try {
    const v = new URLSearchParams(window.location.search).get('bg');
    return v && (v === 'off' || v in BACKGROUNDS) ? v : null;
  } catch { return null; }
}

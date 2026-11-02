import { Container, Sprite, Texture } from 'pixi.js';
import type { ProjectilePool } from '../engine/pools';
import { PHASE_BOOM_BACK, PHASE_BOOM_OUT, PHASE_MINE_TRAVEL, PHASE_MINE_WAIT, PHASE_NORMAL, PHASE_ORBIT } from '../engine/projectiles';
import { ALL_LOOKS, PLAIN_LOOK, ShotLook, shotBand } from './shotLook';
import { ShotTrails } from './shotTrails';
import type { TrailMode } from './settings';
import { ShotTextures } from './shotTextures';

const MINE_COLOR = 0xff5050;
const LOOP_COLOR = 0xffe14d;
/** A waiting mine is a small red square turned into a diamond. */
const MINE_WAIT_SIZE = 14;
/** Shots further than this outside the view are not drawn at all. */
const CULL_MARGIN = 30;

/** Look ids besides the five damage bands and the three reward skins (ALL_LOOKS): the bar of Orbit / Boomerang, of a travelling Mine, and a waiting Mine. */
const LOOK_LOOP = ALL_LOOKS.length;
const LOOK_MINE_TRAVEL = LOOK_LOOP + 1;
const LOOK_MINE_WAIT = LOOK_LOOP + 2;

/**
 * The sprites of every shot of a pool (chunk 21b), shared by the Free Fly and wall screens. One sprite per pool slot in one container; the
 * sprites of a shape share one texture, so the renderer batches them. A sprite's texture, size and colour are set only when its look (a
 * damage band, a phase or a size) changes, not every frame; each frame only moves it, turns it when its shape is not symmetric, and hides it
 * when it is outside the view. `mapX` turns a world x into a screen x (the wall's ring camera); the default is the identity.
 */
export class ShotSprites {
  readonly sprites: Sprite[] = [];
  private readonly lookOf: Uint8Array;
  private readonly sizeOf: Float32Array;
  /** Width of each slot's sprite as last set (the trail's width follows it). */
  private readonly widthOf: Float32Array;
  /** Chunk 28b: the trails (made before the shot sprites, so they draw under them). */
  readonly trails: ShotTrails;
  /** Chunk 28b: a look id of ALL_LOOKS that every shot in normal flight is locked to (the player's skin), or null = the look follows damage. */
  private skinLook: number | null = null;
  /** Chunk 28b: trail length, and the colours of the trail style (null = each shot's own colour). Set by the screen. */
  trailMode: TrailMode = 'off';
  trailColors: readonly number[] | null = null;
  /** Number of sprites shown at the last sync() (tests and the stats overlay). */
  drawn = 0;

  constructor(layer: Container, max: number, private tex: ShotTextures, private viewW: number, private viewH: number) {
    this.lookOf = new Uint8Array(max).fill(255);
    this.sizeOf = new Float32Array(max);
    this.widthOf = new Float32Array(max);
    this.trails = new ShotTrails(layer);
    for (let i = 0; i < max; i++) {
      const s = new Sprite(Texture.WHITE);
      s.anchor.set(0.5);
      s.visible = false;
      layer.addChild(s);
      this.sprites.push(s);
    }
  }

  /** Locks every shot in normal flight to one look (a look id of ALL_LOOKS), or null for "the look follows damage". */
  setSkin(look: number | null) {
    if (look === this.skinLook) return;
    this.skinLook = look;
    this.lookOf.fill(255); // every sprite takes its look again
  }

  /** Look id of a slot: the player's skin or the damage band in plain flight, else the special look of its phase. */
  private lookId(pool: ProjectilePool, i: number): number {
    switch (pool.phase[i]) {
      case PHASE_NORMAL: return this.skinLook ?? shotBand(pool.damage[i]);
      case PHASE_MINE_WAIT: return LOOK_MINE_WAIT;
      case PHASE_MINE_TRAVEL: return LOOK_MINE_TRAVEL;
      case PHASE_ORBIT: case PHASE_BOOM_OUT: case PHASE_BOOM_BACK: return LOOK_LOOP;
      default: return 0;
    }
  }

  private apply(s: Sprite, id: number, size: number, slot: number) {
    let look: ShotLook = PLAIN_LOOK;
    let tint = PLAIN_LOOK.color;
    if (id < ALL_LOOKS.length) { look = ALL_LOOKS[id]; tint = look.color; }
    else if (id === LOOK_LOOP) tint = LOOP_COLOR;
    else tint = MINE_COLOR; // a travelling or a waiting mine
    const tex = id < ALL_LOOKS.length ? this.tex[look.shape] : Texture.WHITE;
    if (s.texture !== tex) s.texture = tex;
    if (id === LOOK_MINE_WAIT) { s.width = MINE_WAIT_SIZE * size; s.height = MINE_WAIT_SIZE * size; s.rotation = Math.PI / 4; }
    else { s.width = look.w * size; s.height = look.h * size; }
    this.widthOf[slot] = s.width;
    s.tint = tint;
    if (id !== LOOK_MINE_WAIT) s.rotation = 0;
  }

  /** Brings every sprite in line with the pool. */
  sync(pool: ProjectilePool, mapX: (x: number) => number = (x) => x) {
    let drawn = 0;
    const sprites = this.sprites;
    for (let i = 0; i < pool.max; i++) {
      const s = sprites[i];
      if (!pool.active[i]) {
        if (s.visible) s.visible = false;
        continue;
      }
      const sx = mapX(pool.x[i]);
      const y = pool.y[i];
      if (sx < -CULL_MARGIN || sx > this.viewW + CULL_MARGIN || y < -CULL_MARGIN || y > this.viewH + CULL_MARGIN) {
        if (s.visible) s.visible = false;
        continue;
      }
      const id = this.lookId(pool, i);
      const size = pool.size[i];
      if (this.lookOf[i] !== id || this.sizeOf[i] !== size) {
        this.apply(s, id, size, i);
        this.lookOf[i] = id;
        this.sizeOf[i] = size;
      }
      s.position.set(sx, y);
      // A waiting mine stays turned; the star is the same from every side; everything else points along its heading.
      if (id !== LOOK_MINE_WAIT && !(id < ALL_LOOKS.length && (ALL_LOOKS[id].shape === 'star' || ALL_LOOKS[id].shape === 'cross'))) s.rotation = Math.atan2(pool.vy[i], pool.vx[i]) + Math.PI / 2;
      if (!s.visible) s.visible = true;
      drawn++;
    }
    this.drawn = drawn;
    // Chunk 28b: the trails, a second pass over the slots the first pass left visible.
    this.trails.sync(pool, this.trailMode, this.trailColors, (i) => sprites[i].tint as number, (i) => this.widthOf[i], (i) => sprites[i].visible, mapX);
  }
}

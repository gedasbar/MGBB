import { Container, Sprite, Texture } from 'pixi.js';
import type { ProjectilePool } from '../engine/pools';
import { PHASE_BOOM_BACK, PHASE_BOOM_OUT, PHASE_MINE_TRAVEL, PHASE_MINE_WAIT, PHASE_NORMAL, PHASE_ORBIT } from '../engine/projectiles';
import { PLAIN_LOOK, ShotLook, SHOT_LOOKS, shotBand } from './shotLook';
import { ShotTextures } from './shotTextures';

const MINE_COLOR = 0xff5050;
const LOOP_COLOR = 0xffe14d;
/** A waiting mine is a small red square turned into a diamond. */
const MINE_WAIT_SIZE = 14;
/** Shots further than this outside the view are not drawn at all. */
const CULL_MARGIN = 30;

/** Look ids besides the five damage bands: the bar of Orbit / Boomerang, of a travelling Mine, and a waiting Mine. */
const LOOK_LOOP = SHOT_LOOKS.length;
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
  /** Number of sprites shown at the last sync() (tests and the stats overlay). */
  drawn = 0;

  constructor(layer: Container, max: number, private tex: ShotTextures, private viewW: number, private viewH: number) {
    this.lookOf = new Uint8Array(max).fill(255);
    this.sizeOf = new Float32Array(max);
    for (let i = 0; i < max; i++) {
      const s = new Sprite(Texture.WHITE);
      s.anchor.set(0.5);
      s.visible = false;
      layer.addChild(s);
      this.sprites.push(s);
    }
  }

  /** Look id of a slot: the damage band in plain flight, else the special look of its phase. */
  private static lookId(pool: ProjectilePool, i: number): number {
    switch (pool.phase[i]) {
      case PHASE_NORMAL: return shotBand(pool.damage[i]);
      case PHASE_MINE_WAIT: return LOOK_MINE_WAIT;
      case PHASE_MINE_TRAVEL: return LOOK_MINE_TRAVEL;
      case PHASE_ORBIT: case PHASE_BOOM_OUT: case PHASE_BOOM_BACK: return LOOK_LOOP;
      default: return 0;
    }
  }

  private apply(s: Sprite, id: number, size: number) {
    let look: ShotLook = PLAIN_LOOK;
    let tint = PLAIN_LOOK.color;
    if (id < SHOT_LOOKS.length) { look = SHOT_LOOKS[id]; tint = look.color; }
    else if (id === LOOK_LOOP) tint = LOOP_COLOR;
    else tint = MINE_COLOR; // a travelling or a waiting mine
    const tex = id < SHOT_LOOKS.length ? this.tex[look.shape] : Texture.WHITE;
    if (s.texture !== tex) s.texture = tex;
    if (id === LOOK_MINE_WAIT) { s.width = MINE_WAIT_SIZE * size; s.height = MINE_WAIT_SIZE * size; s.rotation = Math.PI / 4; }
    else { s.width = look.w * size; s.height = look.h * size; }
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
      const id = ShotSprites.lookId(pool, i);
      const size = pool.size[i];
      if (this.lookOf[i] !== id || this.sizeOf[i] !== size) {
        this.apply(s, id, size);
        this.lookOf[i] = id;
        this.sizeOf[i] = size;
      }
      s.position.set(sx, y);
      // A waiting mine stays turned; the star is the same from every side; everything else points along its heading.
      if (id !== LOOK_MINE_WAIT && !(id < SHOT_LOOKS.length && SHOT_LOOKS[id].shape === 'star')) s.rotation = Math.atan2(pool.vy[i], pool.vx[i]) + Math.PI / 2;
      if (!s.visible) s.visible = true;
      drawn++;
    }
    this.drawn = drawn;
  }
}

import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { ENEMY_BULLET_LOOK } from '../data/enemyBullets';
import type { EnemyBullets } from '../engine/enemyBullets';

/** The enemy bullet's texture: a round lime bullet in a near-black outline with a dark core (no player shot is round or lime). Built once per app. */
const cache = new WeakMap<Application, Texture>();
export function enemyBulletTexture(app: Application | null | undefined): Texture {
  if (!app) return Texture.WHITE;
  const hit = cache.get(app);
  if (hit) return hit;
  const L = ENEMY_BULLET_LOOK, r = L.size / 2;
  let t: Texture;
  try {
    const g = new Graphics().circle(r, r, r).fill(L.outline).circle(r, r, r - 2).fill(L.fill).circle(r, r, r * 0.32).fill(L.core);
    t = app.renderer.generateTexture({ target: g });
    g.destroy();
  } catch {
    t = Texture.WHITE;
  }
  cache.set(app, t);
  return t;
}

/** One sprite per pool slot of an EnemyBullets pool; a slot that is not alive is hidden. Chunk 32a. */
export class EnemyBulletSprites {
  readonly container = new Container();
  readonly sprites: Sprite[] = [];

  constructor(max: number, texture: Texture) {
    for (let i = 0; i < max; i++) {
      const s = new Sprite(texture);
      s.anchor.set(0.5);
      s.width = s.height = ENEMY_BULLET_LOOK.size;
      s.visible = false;
      this.container.addChild(s);
      this.sprites.push(s);
    }
  }

  sync(b: EnemyBullets) {
    for (let i = 0; i < b.max; i++) {
      const s = this.sprites[i];
      const on = b.active[i] === 1;
      if (s.visible !== on) s.visible = on;
      if (on) s.position.set(b.x[i], b.y[i]);
    }
  }

  /** Slots drawn right now (the e2e script and the sheet read it). */
  get visibleCount(): number { return this.sprites.reduce((n, s) => n + (s.visible ? 1 : 0), 0); }
}

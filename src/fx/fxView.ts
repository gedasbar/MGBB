import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { FEEL } from '../data/feel';
import { FeelHub } from './hub';

const cache = new WeakMap<Application, Texture>();

/** One white kite-shaped shard, tinted per particle (flat colour, sharp points: the art language). */
function shardTexture(app: Application | null | undefined): Texture {
  if (!app) return Texture.WHITE;
  const hit = cache.get(app);
  if (hit) return hit;
  let t: Texture = Texture.WHITE;
  try {
    const g = new Graphics().poly([8, 0, 14, 10, 8, 16, 0, 10]).fill(0xffffff);
    t = app.renderer.generateTexture({ target: g, resolution: 2 });
    g.destroy();
  } catch { t = Texture.WHITE; }
  cache.set(app, t);
  return t;
}

/** Draws a FeelHub's particles (one sprite per pool slot, tinted) and rings (one Graphics, redrawn each frame). `mapX` turns a world x into a screen x (the ring wall's camera). */
export class FxView {
  readonly container = new Container();
  private sprites: Sprite[] = [];
  private ringG = new Graphics();
  /** Sprites shown on the last sync (tests and the stats overlay read it). */
  visibleCount = 0;

  constructor(private hub: FeelHub, app: Application | null | undefined) {
    const tex = shardTexture(app);
    this.container.addChild(this.ringG);
    for (let i = 0; i < hub.particles.max; i++) {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.visible = false;
      this.sprites.push(s);
      this.container.addChild(s);
    }
  }

  sync(mapX: (x: number) => number = (x) => x) {
    const p = this.hub.particles;
    let shown = 0;
    for (let i = 0; i < p.max; i++) {
      const s = this.sprites[i];
      if (p.life[i] <= 0) { if (s.visible) s.visible = false; continue; }
      const k = p.life[i] / p.maxLife[i];
      s.visible = true;
      s.position.set(mapX(p.x[i]), p.y[i]);
      s.rotation = p.rot[i];
      const sz = p.size[i] * (0.4 + 0.6 * k);
      s.width = sz;
      s.height = sz * 1.3;
      s.tint = p.color[i];
      s.alpha = Math.min(1, k * 2);
      shown++;
    }
    this.visibleCount = shown;
    const g = this.ringG.clear();
    for (const r of this.hub.rings.list) {
      const t = 1 - r.life / r.maxLife;
      const ease = 1 - (1 - t) * (1 - t);
      const cx = mapX(r.x);
      const alpha = 1 - t;
      if (r.w > 0 && r.h > 0) {
        const sc = r.r0 / Math.max(1, r.r1) + (1 - r.r0 / Math.max(1, r.r1)) * ease;
        const w = r.w * sc, h = r.h * sc;
        g.rect(cx - w / 2, r.y - h / 2, w, h).stroke({ width: FEEL.RINGS.WIDTH, color: r.color, alpha, join: 'miter' });
      } else {
        g.circle(cx, r.y, r.r0 + (r.r1 - r.r0) * ease).stroke({ width: FEEL.RINGS.WIDTH, color: r.color, alpha });
      }
    }
  }

  destroy() { this.container.destroy({ children: true }); }
}

import { Application, Graphics, Texture } from 'pixi.js';
import { SHOT_LOOKS, ShotShape } from './shotLook';

/** One white texture per shot shape (chunk 21b), tinted by the band's colour: the plain bar is the 1 x 1 white texture itself. */
export type ShotTextures = Record<ShotShape, Texture>;

const cache = new WeakMap<Application, ShotTextures>();

/** The outline of a shape inside a w x h box. */
export function shotPolygon(shape: ShotShape, w: number, h: number): number[] {
  switch (shape) {
    case 'diamond': return [w / 2, 0, w, h / 2, w / 2, h, 0, h / 2];
    case 'bolt': return [w / 2, 0, w, h * 0.28, w, h * 0.78, w / 2, h, 0, h * 0.78, 0, h * 0.28];
    case 'star': {
      // A four-pointed star: long points up, down, left and right, short notches between them.
      const k = 0.2;
      return [w / 2, 0, w * (0.5 + k), h * (0.5 - k), w, h / 2, w * (0.5 + k), h * (0.5 + k), w / 2, h, w * (0.5 - k), h * (0.5 + k), 0, h / 2, w * (0.5 - k), h * (0.5 - k)];
    }
    default: return [0, 0, w, 0, w, h, 0, h];
  }
}

/** Built once per app. Without a renderer (headless) every shape is the plain white texture, so a shot is simply drawn as a coloured box. */
export function shotTextures(app: Application | null | undefined): ShotTextures {
  const plain: ShotTextures = { bar: Texture.WHITE, diamond: Texture.WHITE, bolt: Texture.WHITE, star: Texture.WHITE };
  if (!app) return plain;
  const hit = cache.get(app);
  if (hit) return hit;
  const t: ShotTextures = { ...plain };
  for (const shape of ['diamond', 'bolt', 'star'] as const) {
    const look = SHOT_LOOKS.find(l => l.shape === shape);
    if (!look) continue;
    try {
      const g = new Graphics().poly(shotPolygon(shape, look.w, look.h)).fill(0xffffff);
      t[shape] = app.renderer.generateTexture({ target: g });
      g.destroy();
    } catch {
      t[shape] = Texture.WHITE;
    }
  }
  cache.set(app, t);
  return t;
}

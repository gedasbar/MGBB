import { Application, Graphics, Texture } from 'pixi.js';

/** The two shapes a shot sprite can have (chunk 21a): the plain bar (a white rectangle) and the pointed bolt of the top damage bands. */
export interface ShotTextures { bar: Texture; bolt: Texture }

const BOLT_W = 12;
const BOLT_H = 32;
const cache = new WeakMap<Application, ShotTextures>();

/** Built once per app. Without a renderer (headless) both are the plain white texture, so a shot is simply drawn as a bar. */
export function shotTextures(app: Application | null | undefined): ShotTextures {
  if (!app) return { bar: Texture.WHITE, bolt: Texture.WHITE };
  const hit = cache.get(app);
  if (hit) return hit;
  let bolt: Texture = Texture.WHITE;
  try {
    const g = new Graphics().poly([BOLT_W / 2, 0, BOLT_W, 9, BOLT_W, BOLT_H - 7, BOLT_W / 2, BOLT_H, 0, BOLT_H - 7, 0, 9]).fill(0xffffff);
    bolt = app.renderer.generateTexture({ target: g });
    g.destroy();
  } catch {
    bolt = Texture.WHITE;
  }
  const t = { bar: Texture.WHITE, bolt };
  cache.set(app, t);
  return t;
}

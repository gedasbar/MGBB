import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { CRYSTAL_SIZE } from '../data/coreCrystals';
import { FEEL } from '../data/feel';
import { flashLook } from '../fx/feel';
import { crystalVisible, CrystalField } from '../engine/coreCrystals';
import { UI } from './theme';
import { hexPoints } from './icons';

/** The crystal texture: a flat teal hexagon with a darker core (the Cores icon look). Built once per app. Chunk 32e. */
const cache = new WeakMap<Application, Texture>();
export function crystalTexture(app: Application | null | undefined): Texture {
  if (!app) return Texture.WHITE;
  const hit = cache.get(app);
  if (hit) return hit;
  let t: Texture;
  try {
    const r = CRYSTAL_SIZE / 2;
    const g = new Graphics().poly(hexPoints(r, r, r)).fill(UI.color.cores).poly(hexPoints(r, r, r * 0.5)).fill(0x1c3a36);
    t = app.renderer.generateTexture({ target: g });
    g.destroy();
  } catch {
    t = Texture.WHITE;
  }
  cache.set(app, t);
  return t;
}

/** One sprite per crystal slot; a slot with no crystal is hidden, a blinking one is hidden on its "off" beats. */
export class CrystalSprites {
  readonly container = new Container();
  readonly sprites: Sprite[] = [];
  /** Chunk 34b: the absorb flashes (a white hexagon that grows and fades), a small pool. */
  private flashes: { s: Sprite; age: number }[] = [];

  constructor(max: number, texture: Texture) {
    for (let i = 0; i < max; i++) {
      const s = new Sprite(texture);
      s.anchor.set(0.5);
      s.width = s.height = CRYSTAL_SIZE;
      s.visible = false;
      this.container.addChild(s);
      this.sprites.push(s);
    }
    for (let i = 0; i < FEEL.PICKUPS.FLASH_MAX; i++) {
      const s = new Sprite(texture);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.visible = false;
      this.container.addChild(s);
      this.flashes.push({ s, age: Infinity });
    }
  }

  /** A crystal was just absorbed at (x, y): flash once. */
  flash(x: number, y: number) {
    const f = this.flashes.find(q => q.age >= FEEL.PICKUPS.FLASH_TIME);
    if (!f) return;
    f.age = 0;
    f.s.position.set(x, y);
    f.s.visible = true;
    this.paintFlash(f);
  }

  private paintFlash(f: { s: Sprite; age: number }) {
    const look = flashLook(f.age);
    f.s.width = f.s.height = CRYSTAL_SIZE * look.scale;
    f.s.alpha = look.alpha;
  }

  /** Advances the flashes by `dt` seconds. */
  update(dt: number) {
    for (const f of this.flashes) {
      if (f.age >= FEEL.PICKUPS.FLASH_TIME) continue;
      f.age += dt;
      if (f.age >= FEEL.PICKUPS.FLASH_TIME) f.s.visible = false; else this.paintFlash(f);
    }
  }

  get flashCount(): number { return this.flashes.reduce((n, f) => n + (f.s.visible ? 1 : 0), 0); }

  sync(f: CrystalField) {
    for (let i = 0; i < this.sprites.length; i++) {
      const s = this.sprites[i];
      const c = f.list[i];
      const on = !!c && crystalVisible(c.age);
      if (s.visible !== on) s.visible = on;
      if (on) s.position.set(c.x, c.y);
    }
  }

  get visibleCount(): number { return this.sprites.reduce((n, s) => n + (s.visible ? 1 : 0), 0); }
}

import { Container, Graphics } from 'pixi.js';
import type { BossFight } from '../game/boss';
import { BASTION, COLOSSUS, COLOSSUS_HALF_H, COLOSSUS_HALF_W, HIVE, QUEEN } from '../data/bosses';

/**
 * The four Free Fly bosses (chunk 32b) in the rock art language: faceted shapes, three nested shades (edge, mid, inner), thin dark
 * cracks that appear with damage, flat fills, no gradients and no glow. One Graphics per boss, redrawn each frame from the boss's
 * state (a boss is one object, not a swarm, so this is cheap). A second Graphics draws the same silhouette in white for a hit flash.
 * Escorts of the Swarm Queen are ordinary small bodies drawn by the rock view; everything else of a boss is drawn here.
 */

const CRACK = 0x120c08;
const FLASH_TIME = 0.09;
/** The Colossus' metal details (chunk 32d): armour band, dark seams and panel lines, light bolts. */
const METAL_BAND = 0x5a626e;
const METAL_SEAM = 0x1a1d22;
const METAL_BOLT = 0x9aa2ae;
const ENRAGE_TINT = 0xff8a8a;

/** A regular polygon of `n` sides, radius `r`, turned `rot` radians, centred on (cx, cy). */
function ngon(cx: number, cy: number, r: number, n: number, rot = 0, sx = 1, sy = 1): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * Math.PI * 2) / n;
    out.push(cx + Math.cos(a) * r * sx, cy + Math.sin(a) * r * sy);
  }
  return out;
}

interface Shades { edge: number; mid: number; inner: number }
const WHITE: Shades = { edge: 0xffffff, mid: 0xffffff, inner: 0xffffff };

/** Cracks that appear as HP falls: `lost` is the damage fraction (0..1); up to 8 lines from the middle, fixed directions. */
function cracks(g: Graphics, cx: number, cy: number, reach: number, lost: number) {
  const n = Math.min(8, Math.floor(lost * 9));
  for (let i = 0; i < n; i++) {
    const a = 0.4 + i * 0.83;
    const len = reach * (0.5 + 0.1 * (i % 4));
    const mx = cx + Math.cos(a) * len * 0.5 + Math.sin(a) * reach * 0.06, my = cy + Math.sin(a) * len * 0.5 - Math.cos(a) * reach * 0.06;
    g.moveTo(cx + Math.cos(a) * reach * 0.12, cy + Math.sin(a) * reach * 0.12).lineTo(mx, my).lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
  }
  if (n > 0) g.stroke({ width: 2, color: CRACK, alpha: 0.9 });
}

export class BossView {
  readonly container = new Container();
  private body = new Graphics();
  private flash = new Graphics();
  private lastHp = -1;
  private flashT = 0;

  constructor() {
    this.flash.alpha = 0.5;
    this.container.addChild(this.body, this.flash);
  }

  /** Redraws from `boss` (dt in seconds, for the flash). */
  update(boss: BossFight, dt: number) {
    if (this.lastHp >= 0 && boss.hp < this.lastHp) this.flashT = FLASH_TIME;
    this.lastHp = boss.hp;
    this.body.clear();
    this.draw(this.body, boss, boss.def.shades, true);
    this.body.tint = boss.enraged ? ENRAGE_TINT : 0xffffff;
    this.flash.clear();
    this.flash.visible = this.flashT > 0;
    if (this.flashT > 0) { this.draw(this.flash, boss, WHITE, false); this.flashT -= dt; }
  }

  private draw(g: Graphics, b: BossFight, s: Shades, detail: boolean) {
    const x = b.anchorX, y = b.anchorY;
    const lost = 1 - b.fraction;
    switch (b.def.id) {
      case 'hive': {
        const R = HIVE.radius;
        // pods round the rim, then the body in three nested shades
        for (let i = 0; i < 7; i++) {
          const a = (i * Math.PI * 2) / 7 + 0.3;
          g.poly(ngon(x + Math.cos(a) * R * 0.92, y + Math.sin(a) * R * 0.92, R * 0.27, 6, a)).fill(s.mid);
        }
        g.poly(ngon(x, y, R, 12, 0.13)).fill(s.edge).poly(ngon(x, y, R * 0.78, 12, 0.13)).fill(s.mid).poly(ngon(x, y, R * 0.55, 12, 0.13)).fill(s.inner);
        if (detail) cracks(g, x, y, R * 0.95, lost);
        // the core: an armoured lid while closed, a bright opening while open
        const cr = R * 0.36;
        if (b.coreOpen) g.circle(x, y, cr * 1.25).fill(0xff9a2a).circle(x, y, cr).fill(0xffd34a).circle(x, y, cr * 0.45).fill(0xfff4c0);
        else {
          g.circle(x, y, cr * 1.1).fill(0x2a2a30);
          for (let i = 0; i < 4; i++) {
            const a = (i * Math.PI) / 2 + Math.PI / 4;
            g.poly([x, y, x + Math.cos(a - 0.7) * cr * 1.1, y + Math.sin(a - 0.7) * cr * 1.1, x + Math.cos(a + 0.7) * cr * 1.1, y + Math.sin(a + 0.7) * cr * 1.1]).fill(i % 2 ? 0x5a5a64 : 0x44444c);
          }
          g.circle(x, y, cr * 1.1).stroke({ width: 2, color: 0x8a8a94 });
        }
        break;
      }
      case 'bastion': {
        g.circle(x, y, BASTION.ringR).stroke({ width: 3, color: 0x1c2230, alpha: 0.7 });
        for (const p of b.plates) {
          if (!(p.hp > 0)) continue;
          g.poly(ngon(p.x, p.y, BASTION.plateR, 8, 0.4)).fill(s.edge).poly(ngon(p.x, p.y, BASTION.plateR * 0.72, 8, 0.4)).fill(s.mid).poly(ngon(p.x, p.y, BASTION.plateR * 0.4, 8, 0.4)).fill(s.inner);
        }
        const R = BASTION.coreRadius;
        g.poly(ngon(x, y, R, 6, 0.5)).fill(s.edge).poly(ngon(x, y, R * 0.76, 6, 0.5)).fill(s.mid).poly(ngon(x, y, R * 0.5, 6, 0.5)).fill(detail ? 0xe8553a : s.inner);
        if (detail) { g.circle(x, y, R * 0.2).fill(0xffc9a0); cracks(g, x, y, R, lost); }
        break;
      }
      case 'queen': {
        const R = QUEEN.radius;
        // Swarm look (chunk 32d): the darters' warm kite colours, sharp jagged shards, a crown of spikes; no round shapes.
        const mirror = (pts: number[]) => { const o: number[] = []; for (let i = 0; i < pts.length; i += 2) o.push(-pts[i], pts[i + 1]); return o; };
        const at = (pts: number[], k = 1) => pts.map((v, i) => (i % 2 ? y : x) + v * R * k);
        // two pairs of angular wing shards, drawn behind the body
        const wingA = [0.6, -0.15, 2.0, -0.95, 1.2, 0.05, 1.85, 0.5, 0.8, 0.45];
        const wingB = [0.7, 0.1, 1.5, -0.25, 1.1, 0.4];
        g.poly(at(wingA)).fill(s.mid).poly(at(mirror(wingA))).fill(s.mid);
        g.poly(at(wingB)).fill(s.inner).poly(at(mirror(wingB))).fill(s.inner);
        // crown: five spikes of rising height
        const spikes = [-0.62, -0.31, 0, 0.31, 0.62], heights = [1.15, 1.45, 1.85, 1.45, 1.15];
        spikes.forEach((sx, i) => g.poly([x + (sx - 0.15) * R, y - R * 0.55, x + (sx + 0.15) * R, y - R * 0.55, x + sx * R, y - R * heights[i]]).fill(s.edge));
        // the body: a jagged shard in three nested shades
        const body = [0, -1.0, 0.3, -0.55, 0.75, -0.7, 0.62, -0.2, 1.05, 0.05, 0.55, 0.35, 0.7, 0.85, 0.2, 0.6, 0, 1.1, -0.2, 0.6, -0.7, 0.85, -0.55, 0.35, -1.05, 0.05, -0.62, -0.2, -0.75, -0.7, -0.3, -0.55];
        g.poly(at(body)).fill(s.edge).poly(at(body, 0.72)).fill(s.mid).poly(at(body, 0.44)).fill(s.inner);
        g.poly([x - R * 0.3, y + R * 0.8, x + R * 0.3, y + R * 0.8, x, y + R * 1.6]).fill(detail ? 0x2a1208 : s.inner); // the sting
        if (detail) { g.poly([x - R * 0.42, y - R * 0.18, x - R * 0.1, y - R * 0.1, x - R * 0.3, y + R * 0.14]).fill(0xffe2b8).poly([x + R * 0.42, y - R * 0.18, x + R * 0.1, y - R * 0.1, x + R * 0.3, y + R * 0.14]).fill(0xffe2b8); cracks(g, x, y, R, lost); }
        break;
      }
      case 'colossus': {
        const hw = COLOSSUS_HALF_W, hh = COLOSSUS_HALF_H;
        g.rect(x - hw, y - hh, hw * 2, hh * 2).fill(s.edge);
        g.rect(x - hw + 7, y - hh + 7, (hw - 7) * 2, (hh - 7) * 2).fill(s.mid);
        g.rect(x - hw + 20, y - hh + 17, (hw - 20) * 2, (hh - 17) * 2).fill(s.inner);
        if (detail) {
          // Metal (chunk 32d): armour bands across the top and bottom, dark panel seams, a bolt in each corner and on every seam.
          g.rect(x - hw + 7, y - hh + 7, (hw - 7) * 2, 9).fill(METAL_BAND).rect(x - hw + 7, y + hh - 16, (hw - 7) * 2, 9).fill(METAL_BAND);
          for (let i = 1; i < COLOSSUS.count; i++) {
            const sx = x - hw + 20 + (i * (hw - 20) * 2) / COLOSSUS.count;
            g.rect(sx - 1.5, y - hh + 17, 3, (hh - 17) * 2).fill(METAL_SEAM);
            for (const by of [y - hh + 11, y + hh - 11]) g.rect(sx - 2, by - 2, 4, 4).fill(METAL_BOLT);
          }
          g.rect(x - hw + 20, y - 1.5, (hw - 20) * 2, 3).fill(METAL_SEAM);
          g.rect(x - hw, y - hh, hw * 2, hh * 2).stroke({ width: 2, color: METAL_SEAM });
          for (const sx of [-1, 1]) for (const sy of [-1, 1]) g.rect(x + sx * (hw - 12) - 3, y + sy * (hh - 11) - 3, 6, 6).fill(METAL_BOLT).rect(x + sx * (hw - 12) - 3, y + sy * (hh - 11) - 3, 6, 6).stroke({ width: 1, color: METAL_SEAM });
          // the cracks stay inside the plate: three small groups across its width
          for (const k of [-0.55, 0, 0.55]) cracks(g, x + hw * k, y, hh * 0.95, lost);
        }
        break;
      }
    }
  }

  destroy() { this.container.destroy({ children: true }); }
}

/** The boss health bar (chunk 32d): geometry only (the screen draws it), so tests can read the numbers. It sits in the pause button's row, from the left edge to just left of the button (x 494..532, y 8..46). */
export const BOSS_BAR = { x: 8, y: 14, w: 476, h: 24 } as const;

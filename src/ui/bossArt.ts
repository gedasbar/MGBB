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
        // wings (two flat triangles), crown spikes, then the body
        g.poly([x - R * 0.7, y - R * 0.1, x - R * 2.0, y - R * 0.85, x - R * 1.05, y + R * 0.55]).fill(s.mid);
        g.poly([x + R * 0.7, y - R * 0.1, x + R * 2.0, y - R * 0.85, x + R * 1.05, y + R * 0.55]).fill(s.mid);
        g.poly([x - R * 1.55, y - R * 0.6, x - R * 0.8, y - R * 0.05, x - R * 1.0, y + R * 0.3]).fill(s.inner);
        g.poly([x + R * 1.55, y - R * 0.6, x + R * 0.8, y - R * 0.05, x + R * 1.0, y + R * 0.3]).fill(s.inner);
        for (let i = -1; i <= 1; i++) g.poly([x + i * R * 0.42 - R * 0.16, y - R * 0.85, x + i * R * 0.42 + R * 0.16, y - R * 0.85, x + i * R * 0.42, y - R * (i === 0 ? 1.45 : 1.2)]).fill(s.edge);
        g.poly(ngon(x, y, R, 8, Math.PI / 8, 1.0, 1.1)).fill(s.edge).poly(ngon(x, y, R * 0.74, 8, Math.PI / 8, 1.0, 1.1)).fill(s.mid).poly(ngon(x, y, R * 0.46, 8, Math.PI / 8, 1.0, 1.1)).fill(s.inner);
        g.poly([x - R * 0.3, y + R * 0.9, x + R * 0.3, y + R * 0.9, x, y + R * 1.45]).fill(detail ? 0x2a0d28 : s.inner); // the sting
        if (detail) { g.poly([x - R * 0.42, y - R * 0.12, x - R * 0.12, y - R * 0.12, x - R * 0.27, y + R * 0.12]).fill(0xffd0f0).poly([x + R * 0.12, y - R * 0.12, x + R * 0.42, y - R * 0.12, x + R * 0.27, y + R * 0.12]).fill(0xffd0f0); cracks(g, x, y, R, lost); }
        break;
      }
      case 'colossus': {
        const hw = COLOSSUS_HALF_W, hh = COLOSSUS_HALF_H;
        g.rect(x - hw, y - hh, hw * 2, hh * 2).fill(s.edge);
        g.rect(x - hw + 7, y - hh + 7, (hw - 7) * 2, (hh - 7) * 2).fill(s.mid);
        g.rect(x - hw + 20, y - hh + 17, (hw - 20) * 2, (hh - 17) * 2).fill(s.inner);
        if (detail) {
          for (const sx of [-1, 1]) for (const sy of [-1, 1]) g.rect(x + sx * (hw - 13) - 4, y + sy * (hh - 13) - 4, 8, 8).fill(0x2a2018);
          for (let i = 1; i < COLOSSUS.count; i++) { const sx = x - hw + 20 + (i * (hw - 20) * 2) / COLOSSUS.count; g.rect(sx - 1, y - hh + 17, 2, (hh - 17) * 2).fill({ color: 0x2a2018, alpha: 0.5 }); }
          cracks(g, x, y, hw, lost);
        }
        break;
      }
    }
  }

  destroy() { this.container.destroy({ children: true }); }
}

/** The boss health bar: geometry only (the screen draws it), so tests can read the numbers. */
export const BOSS_BAR = { x: 20, y: 150, w: 500, h: 14 } as const;

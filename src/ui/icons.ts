import { Graphics } from 'pixi.js';
import { UI } from './theme';

/**
 * Chunk 32d: the small HUD / currency icons, flat shapes drawn into a fresh Graphics whose top-left corner is (0, 0) and whose size is `size` px.
 * The credit coin (yellow), the Cores hexagon (teal, the one colour and shape Cores wear everywhere) and the hull wrench (light grey).
 */

/** The credit icon: a round coin with a small inner ring. */
export function creditIcon(size = 14, color: number = UI.color.accent): Graphics {
  const r = size / 2;
  return new Graphics().circle(r, r, r).fill(color).circle(r, r, r * 0.55).stroke({ width: Math.max(1, size / 10), color: 0x26262a });
}

/** The vertices of a flat hexagon of radius `r` centred on (cx, cy), pointy side up. */
export function hexPoints(cx: number, cy: number, r: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 3; out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  return out;
}

/** The Cores icon: a small hexagon with a darker inner hexagon. */
export function coresIcon(size = 14, color: number = UI.color.cores): Graphics {
  const r = size / 2;
  return new Graphics().poly(hexPoints(r, r, r)).fill(color).poly(hexPoints(r, r, r * 0.5)).fill(0x1c3a36);
}

/** Chunk 34c: the Medal icon: a round medal in its own warm orange (`UI.color.medal`) with a darker five-point star. */
export function medalIcon(size = 14, color: number = UI.color.medal): Graphics {
  const r = size / 2;
  const star: number[] = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 === 0 ? r * 0.62 : r * 0.26; star.push(r + Math.cos(a) * rr, r + Math.sin(a) * rr); }
  return new Graphics().circle(r, r, r).fill(color).poly(star).fill(0x4a2a10);
}

/** The hull wrench: a diagonal handle with an open jaw at the top right. */
export function wrenchIcon(size = 14, color = 0xd4d4d8): Graphics {
  const s = size / 14;
  const g = new Graphics();
  // handle from the lower left to the middle, as a thick diagonal bar
  g.poly([1.5 * s, 12.5 * s, 0.5 * s, 11.5 * s, 7 * s, 5 * s, 9 * s, 7 * s]).fill(color);
  // the head: a square block with a notch (the jaw) cut out of its upper right corner
  g.poly([6 * s, 4 * s, 9 * s, 1 * s, 11 * s, 3 * s, 12.5 * s, 1.5 * s, 13.5 * s, 4.5 * s, 12 * s, 7 * s, 9 * s, 8 * s]).fill(color);
  return g;
}

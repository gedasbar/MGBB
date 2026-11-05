import { Graphics } from 'pixi.js';
import type { SupportLink } from '../game/world';

/** Link colours (chunk 32a): the shield cyan of the wall and the rocks, and a rose thread for a Leech. */
export const SHIELD_LINK_COLOR = 0x5fd4e8;
export const LEECH_LINK_COLOR = 0xe87aa0;
const DASH = 6, GAP = 5;

/**
 * Draws the links of the Shielders and Leeches: a thin cyan line plus a ring round the protected body, and a rose dashed
 * thread. One Graphics, cleared and redrawn every frame (at most a few dozen links).
 */
export function drawSupportLinks(g: Graphics, links: readonly SupportLink[], time: number) {
  g.clear();
  if (links.length === 0) return;
  let shield = false, leech = false;
  for (const l of links) {
    if (l.kind === 'shield') {
      g.moveTo(l.ax, l.ay).lineTo(l.bx, l.by);
      shield = true;
    }
  }
  if (shield) g.stroke({ width: 2, color: SHIELD_LINK_COLOR, alpha: 0.75 });
  for (const l of links) if (l.kind === 'shield') g.circle(l.bx, l.by, l.r + 4);
  if (shield) g.stroke({ width: 1.5, color: SHIELD_LINK_COLOR, alpha: 0.6 });
  for (const l of links) {
    if (l.kind !== 'leech') continue;
    leech = true;
    const dx = l.bx - l.ax, dy = l.by - l.ay;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    // The dashes crawl from the Leech to its patient.
    for (let d = -((time * 30) % (DASH + GAP)); d < len; d += DASH + GAP) {
      const a = Math.max(0, d), b = Math.min(len, d + DASH);
      if (b > a) g.moveTo(l.ax + ux * a, l.ay + uy * a).lineTo(l.ax + ux * b, l.ay + uy * b);
    }
  }
  if (leech) g.stroke({ width: 2, color: LEECH_LINK_COLOR, alpha: 0.9 });
}

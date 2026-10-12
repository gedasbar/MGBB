import { Graphics } from 'pixi.js';
import type { Emblem } from '../captains/data';
import { THEME } from './theme';

/**
 * Captain emblems: sharp geometric shapes, flat fills, no gradients, no glow. A grey plate (the same nested squares as a block
 * plate) with one accent-colour symbol per captain. Drawn centred on (0, 0) in a square of side `size`.
 */
export function drawEmblem(g: Graphics, kind: Emblem, size: number, accent: number, dim = false) {
  const u = size / 2;
  const a = dim ? THEME.disabled : accent;
  g.rect(-u, -u, size, size).fill(THEME.plateOuter);
  g.rect(-u * 0.82, -u * 0.82, u * 1.64, u * 1.64).fill(dim ? 0x3a3a3e : 0x45454a);
  g.rect(-u * 0.64, -u * 0.64, u * 1.28, u * 1.28).fill(THEME.plateFace);
  switch (kind) {
    case 'cadet':
      // A coin: a diamond with a small square cut-out, and a grey chevron under it.
      g.poly([0, -u * 0.5, u * 0.5, 0, 0, u * 0.5, -u * 0.5, 0]).fill(a);
      g.rect(-u * 0.14, -u * 0.14, u * 0.28, u * 0.28).fill(THEME.plateFace);
      g.poly([-u * 0.4, u * 0.58, 0, u * 0.4, u * 0.4, u * 0.58, u * 0.4, u * 0.48, 0, u * 0.3, -u * 0.4, u * 0.48]).fill(THEME.mark);
      break;
    case 'bulwark':
      // A shield: a pentagon pointing down, with an inner grey bar.
      g.poly([-u * 0.45, -u * 0.5, u * 0.45, -u * 0.5, u * 0.45, u * 0.1, 0, u * 0.58, -u * 0.45, u * 0.1]).fill(a);
      g.poly([-u * 0.2, -u * 0.28, u * 0.2, -u * 0.28, u * 0.2, u * 0.05, 0, u * 0.3, -u * 0.2, u * 0.05]).fill(THEME.plateFace);
      break;
    case 'gunner':
      // A crosshair: ring, four ticks and a centre block.
      g.circle(0, 0, u * 0.42).stroke({ color: a, width: Math.max(2, size * 0.07) });
      g.rect(-u * 0.05, -u * 0.62, u * 0.1, u * 0.3).fill(a);
      g.rect(-u * 0.05, u * 0.32, u * 0.1, u * 0.3).fill(a);
      g.rect(-u * 0.62, -u * 0.05, u * 0.3, u * 0.1).fill(a);
      g.rect(u * 0.32, -u * 0.05, u * 0.3, u * 0.1).fill(a);
      g.rect(-u * 0.1, -u * 0.1, u * 0.2, u * 0.2).fill(THEME.mark);
      break;
    case 'pathfinder':
      // Two stacked chevrons pointing up (the wall is flown through).
      g.poly([-u * 0.5, -u * 0.05, 0, -u * 0.55, u * 0.5, -u * 0.05, u * 0.5, u * 0.15, 0, -u * 0.35, -u * 0.5, u * 0.15]).fill(a);
      g.poly([-u * 0.5, u * 0.35, 0, -u * 0.15, u * 0.5, u * 0.35, u * 0.5, u * 0.55, 0, u * 0.05, -u * 0.5, u * 0.55]).fill(THEME.mark);
      break;
  }
}

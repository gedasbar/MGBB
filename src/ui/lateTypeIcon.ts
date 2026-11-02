// Chunk 27b: the small icon of each late-tier type (the Map list draws it in the corner of a type tile). Sharp geometric shapes, flat fills, in the
// art language of the rest of the game. `h` is the half size in px; everything is drawn inside a square of side 2h centred on (cx, cy).
import { Graphics } from 'pixi.js';
import type { LateType } from '../data/lateTiers';

export function drawLateTypeIcon(g: Graphics, type: LateType, cx: number, cy: number, h: number, color: number) {
  const x0 = cx - h, y0 = cy - h, s = 2 * h;
  switch (type) {
    case 'monolith': // one tall slab
      g.rect(cx - h * 0.45, y0, h * 0.9, s).fill(color);
      break;
    case 'maze': // a winding path
      g.poly([x0, y0 + s * 0.15, cx, y0 + s * 0.15, cx, cy, x0 + s, cy, x0 + s, y0 + s * 0.85]).stroke({ width: Math.max(2, h * 0.28), color });
      break;
    case 'fortress': // a keep with three teeth
      g.rect(x0, cy - h * 0.1, s, h * 1.1).fill(color);
      for (let k = 0; k < 3; k++) g.rect(x0 + k * s * 0.4, y0, s * 0.2, h * 1.0).fill(color);
      break;
    case 'drift': // two rows sliding opposite ways
      g.rect(x0, y0 + s * 0.12, s * 0.7, s * 0.3).fill(color);
      g.rect(x0 + s * 0.3, y0 + s * 0.58, s * 0.7, s * 0.3).fill(color);
      break;
    case 'strong_wind': // an arrow pointing straight back (down)
      g.poly([cx, y0 + s, x0, cy, cx - h * 0.3, cy, cx - h * 0.3, y0, cx + h * 0.3, y0, cx + h * 0.3, cy, x0 + s, cy]).fill(color);
      break;
    case 'crosswind': // an arrow pointing sideways with a stroke behind it
      g.poly([x0 + s, cy, cx, y0, cx, cy - h * 0.3, x0, cy - h * 0.3, x0, cy + h * 0.3, cx, cy + h * 0.3, cx, y0 + s]).fill(color);
      break;
    case 'fog': // three bars fading out
      for (let k = 0; k < 3; k++) g.rect(x0, y0 + s * (0.1 + 0.32 * k), s, s * 0.2).fill({ color, alpha: 1 - 0.35 * k });
      break;
    case 'regrowth': // a plus (heals)
      g.rect(cx - h * 0.3, y0, h * 0.6, s).fill(color);
      g.rect(x0, cy - h * 0.3, s, h * 0.6).fill(color);
      break;
    case 'mitosis_wall': // one block becoming two smaller ones
      g.rect(x0, cy - h * 0.55, h * 0.95, h * 1.1).fill(color);
      g.rect(cx + h * 0.15, y0, h * 0.85, h * 0.85).fill(color);
      g.rect(cx + h * 0.15, cy + h * 0.15, h * 0.85, h * 0.85).fill(color);
      break;
  }
}

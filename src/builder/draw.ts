import { Graphics } from 'pixi.js';
import { THEME } from '../ui/theme';

export const COLORS = {
  red: 0xff2a2a,
  redDim: 0x8a1f1f,
  redHatch: 0xd01e1e,
  bg: THEME.bg,
  text: THEME.text,
  textDim: THEME.textDim,
  cell: THEME.cellFill,
  warn: THEME.warn,
};

export { CATEGORY_COLOR } from '../ui/theme';

/** Pixi connects a new arc to the previous path point (the origin on a fresh path), so always start it explicitly. */
export function arcPath(g: Graphics, x: number, y: number, r: number, a0: number, a1: number, anticlockwise = false) {
  g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r).arc(x, y, r, a0, a1, anticlockwise);
}

/** Diagonal hatching clipped to a rectangle. */
export function hatch(g: Graphics, x: number, y: number, w: number, h: number, step: number, color: number, width: number, alpha = 1) {
  for (let c = step; c < w + h; c += step) {
    // line x + y = c, clipped to the rect
    const x0 = Math.max(0, c - h);
    const y0 = c - x0;
    const y1 = Math.max(0, c - w);
    const x1 = c - y1;
    if (y0 < 0 || x1 < 0 || x0 > w || y1 > h) continue;
    g.moveTo(x + x0, y + Math.min(y0, h)).lineTo(x + Math.min(x1, w), y + y1);
  }
  g.stroke({ color, width, alpha });
}

export function drawX(g: Graphics, cx: number, cy: number, r: number, color: number, width: number, alpha = 1) {
  g.moveTo(cx - r, cy - r).lineTo(cx + r, cy + r).moveTo(cx + r, cy - r).lineTo(cx - r, cy + r)
    .stroke({ color, width, alpha, cap: 'round' });
}

/** Filled triangle pointing in direction angle (0 = right), tip at (x,y). */
export function arrowHead(g: Graphics, x: number, y: number, angle: number, len: number, halfW: number, color: number) {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const bx = x - ca * len;
  const by = y - sa * len;
  g.poly([x, y, bx - sa * halfW, by + ca * halfW, bx + sa * halfW, by - ca * halfW]).fill(color);
}

function circularArrow(g: Graphics, r: number, color: number, width: number, clockwise: boolean) {
  // Clockwise sweep of about 225 degrees; the counter-clockwise arrow is its mirror image.
  const start = -Math.PI * 0.8;
  const end = Math.PI * 0.45;
  const mirror = (a: number) => (clockwise ? a : Math.PI - a);
  arcPath(g, 0, 0, r, mirror(start), mirror(end), !clockwise);
  g.stroke({ color, width, cap: 'round' });
  const a = mirror(end);
  const dir = clockwise ? a + Math.PI / 2 : a - Math.PI / 2;
  arrowHead(g, Math.cos(a) * r + Math.cos(dir) * r * 0.45, Math.sin(a) * r + Math.sin(dir) * r * 0.45, dir, r * 0.7, r * 0.42, color);
}

export type ToolIcon = 'clear' | 'ccw' | 'cw' | 'auto' | 'clearAll' | 'fit' | 'undo' | 'redo' | 'copy' | 'paste' | 'help' | 'ship';

/** Procedural icons for buttons, centred on the origin. */
export function drawToolIcon(g: Graphics, kind: ToolIcon, s: number, color: number) {
  const u = s / 2;
  const w = Math.max(2, s * 0.09);
  const line = { color, width: w, cap: 'round' as const, join: 'round' as const };
  switch (kind) {
    case 'clear':
      g.rect(-u * 0.8, -u * 0.8, u * 1.6, u * 1.6).stroke({ color, width: w * 0.7 });
      drawX(g, 0, 0, u * 0.65, color, w);
      break;
    case 'clearAll':
      g.rect(-u * 0.85, -u * 0.85, u * 1.7, u * 1.7).fill({ color, alpha: 0.25 });
      hatch(g, -u * 0.85, -u * 0.85, u * 1.7, u * 1.7, s * 0.2, color, w * 0.6, 0.8);
      g.rect(-u * 0.85, -u * 0.85, u * 1.7, u * 1.7).stroke({ color, width: w * 0.7 });
      drawX(g, 0, 0, u * 0.7, color, w * 1.2);
      break;
    case 'cw':
      circularArrow(g, u * 0.7, color, w * 1.2, true);
      break;
    case 'ccw':
      circularArrow(g, u * 0.7, color, w * 1.2, false);
      break;
    case 'auto': {
      circularArrow(g, u * 0.85, color, w, true);
      g.moveTo(-u * 0.32, u * 0.3).lineTo(0, -u * 0.35).lineTo(u * 0.32, u * 0.3)
        .moveTo(-u * 0.18, u * 0.08).lineTo(u * 0.18, u * 0.08).stroke({ ...line, width: w * 1.2 });
      break;
    }
    case 'fit':
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        g.moveTo(sx * u * 0.2, sy * u * 0.2).lineTo(sx * u * 0.75, sy * u * 0.75).stroke(line);
        arrowHead(g, sx * u * 0.75, sy * u * 0.75, Math.atan2(sy, sx), u * 0.42, u * 0.3, color);
      }
      break;
    case 'undo':
    case 'redo': {
      const d = kind === 'undo' ? 1 : -1;
      g.moveTo(d * u * 0.5, u * 0.45).bezierCurveTo(d * u * 0.9, -u * 0.1, d * u * 0.3, -u * 0.6, -d * u * 0.2, -u * 0.35).stroke(line);
      arrowHead(g, -d * u * 0.55, -u * 0.25, d > 0 ? Math.PI * 0.9 : Math.PI * 0.1, u * 0.5, u * 0.35, color);
      break;
    }
    case 'copy':
      g.rect(-u * 0.7, -u * 0.75, u * 1, u * 1.2).stroke(line);
      g.rect(-u * 0.25, -u * 0.35, u * 1, u * 1.2).fill(THEME.buttonFill).stroke(line);
      break;
    case 'paste':
      g.rect(-u * 0.7, -u * 0.7, u * 1.4, u * 1.55).stroke(line);
      g.rect(-u * 0.3, -u * 0.9, u * 0.6, u * 0.35).fill(color);
      g.moveTo(-u * 0.4, -u * 0.05).lineTo(u * 0.4, -u * 0.05).moveTo(-u * 0.4, u * 0.35).lineTo(u * 0.4, u * 0.35).stroke({ ...line, width: w * 0.7 });
      break;
    case 'help':
      g.circle(0, 0, u * 0.85).stroke(line);
      arcPath(g, 0, -u * 0.18, u * 0.3, Math.PI * 1.05, Math.PI * 2.25);
      g.stroke(line);
      g.moveTo(0, u * 0.12).lineTo(0, u * 0.25).stroke(line);
      g.circle(0, u * 0.52, w * 0.6).fill(color);
      break;
    case 'ship':
      g.rect(-u * 0.55, -u * 0.6, u * 1.1, u * 1.3).stroke(line);
      g.rect(-u * 0.3, -u * 0.4, u * 0.6, u * 0.4).fill(color);
      g.rect(-u * 0.85, -u * 0.1, u * 0.3, u * 0.7).fill(color);
      g.rect(u * 0.55, -u * 0.1, u * 0.3, u * 0.7).fill(color);
      break;
  }
}

export type TabIcon = 'build' | 'shop' | 'captain' | 'skills' | 'map';

export function drawTabIcon(g: Graphics, kind: TabIcon, s: number, color: number) {
  const u = s / 2;
  const w = Math.max(2, s * 0.09);
  switch (kind) {
    case 'build':
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        g.rect(-u + c * u * 0.72, -u + r * u * 0.72, u * 0.56, u * 0.56).fill(color);
      }
      break;
    case 'shop':
      g.circle(0, 0, u * 0.85).stroke({ color, width: w });
      arcPath(g, 0, -u * 0.22, u * 0.3, Math.PI * 0.2, Math.PI * 1.5, true);
      g.stroke({ color, width: w, cap: 'round' });
      arcPath(g, 0, u * 0.22, u * 0.3, -Math.PI * 0.5, Math.PI * 0.8);
      g.stroke({ color, width: w, cap: 'round' });
      g.moveTo(0, -u * 0.62).lineTo(0, u * 0.62).stroke({ color, width: w * 0.8 });
      break;
    case 'captain':
      g.rect(-u * 0.8, -u * 0.8, u * 1.6, u * 1.6).stroke({ color, width: w * 1.3 });
      break;
    case 'skills':
      g.poly([-u * 0.9, 0, -u * 0.2, -u * 0.8, u * 0.9, -u * 0.8, u * 0.9, u * 0.8, -u * 0.2, u * 0.8]).stroke({ color, width: w, join: 'round' });
      g.moveTo(-u * 0.1, -u * 0.3).lineTo(u * 0.5, -u * 0.3).moveTo(-u * 0.1, 0).lineTo(u * 0.5, 0).moveTo(-u * 0.1, u * 0.3).lineTo(u * 0.5, u * 0.3).stroke({ color, width: w * 0.8 });
      break;
    case 'map':
      g.rect(-u * 0.9, -u * 0.9, u * 0.5, u * 0.5).stroke({ color, width: w });
      g.rect(-u * 0.9, u * 0.1, u * 0.5, u * 0.5).stroke({ color, width: w });
      g.rect(u * 0.1, u * 0.35, u * 0.5, u * 0.5).stroke({ color, width: w });
      g.moveTo(-u * 0.4, -u * 0.5).lineTo(u * 0.5, -u * 0.35).moveTo(-u * 0.4, u * 0.3).lineTo(u * 0.5, -u * 0.35).moveTo(u * 0.5, -u * 0.35).lineTo(u * 0.35, u * 0.35)
        .stroke({ color, width: w * 0.7 });
      g.circle(u * 0.5, -u * 0.4, u * 0.2).fill(color);
      break;
  }
}

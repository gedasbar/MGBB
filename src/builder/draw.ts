import { Graphics } from 'pixi.js';

export const COLORS = {
  red: 0xff2a2a,
  redDim: 0x8a1f1f,
  redHatch: 0xd01e1e,
  bg: 0x686868,
  panel: 0x3d3d3d,
  panelDark: 0x262626,
  panelLine: 0x1b1b1b,
  text: 0xf2f2f2,
  textDim: 0xb4b4b4,
  cell: 0x808080,
  cellEdge: 0x4a4a4a,
  voidFill: 0x3b3b3b,
  voidHatch: 0x262626,
  green: 0x2cf04a,
  warn: 0xffcc00,
  magenta: 0xff22ee,
  yellow: 0xffe600,
  orange: 0xff9a1a,
  cyan: 0x16d8e8,
};

export const CATEGORY_COLOR: Record<string, number> = {
  pathing: 0x59b9ff,
  damage: 0xff7a5c,
  modifier: 0xd27bff,
  status: 0x62e68a,
  mitosis: 0xffd24d,
  passive: 0xb0b0b0,
};

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

/** Warning triangle with an exclamation mark, centred on (cx,cy). */
export function drawWarn(g: Graphics, cx: number, cy: number, s: number) {
  const h = s * 0.5;
  g.poly([cx, cy - h, cx + h * 1.1, cy + h * 0.8, cx - h * 1.1, cy + h * 0.8]).fill(COLORS.warn).stroke({ color: 0x000000, width: Math.max(1, s * 0.08) });
  g.moveTo(cx, cy - h * 0.3).lineTo(cx, cy + h * 0.25).stroke({ color: 0x000000, width: Math.max(1.5, s * 0.14), cap: 'round' });
  g.circle(cx, cy + h * 0.55, Math.max(1, s * 0.07)).fill(0x000000);
}

/** Small padlock for manual-orientation blocks. */
export function drawLock(g: Graphics, cx: number, cy: number, s: number) {
  g.roundRect(cx - s / 2, cy - s * 0.1, s, s * 0.62, s * 0.12).fill(0xffd34d).stroke({ color: 0x000000, width: Math.max(1, s * 0.08) });
  arcPath(g, cx, cy - s * 0.1, s * 0.3, Math.PI, 0);
  g.stroke({ color: 0xffd34d, width: Math.max(1.5, s * 0.14) });
  g.circle(cx, cy + s * 0.2, s * 0.09).fill(0x000000);
}

/** Small "A" badge for auto-orientation blocks. */
export function drawAutoBadge(g: Graphics, cx: number, cy: number, s: number) {
  g.circle(cx, cy, s * 0.62).fill({ color: 0x0f6e2a, alpha: 0.95 }).stroke({ color: 0x000000, width: Math.max(1, s * 0.08) });
  const w = s * 0.34;
  g.moveTo(cx - w, cy + s * 0.34).lineTo(cx, cy - s * 0.36).lineTo(cx + w, cy + s * 0.34)
    .moveTo(cx - w * 0.5, cy + s * 0.08).lineTo(cx + w * 0.5, cy + s * 0.08)
    .stroke({ color: 0xffffff, width: Math.max(1.5, s * 0.15), cap: 'round', join: 'round' });
}

/** "No signal" mark: a circle with a slash. */
export function drawNoSignal(g: Graphics, cx: number, cy: number, s: number) {
  g.circle(cx, cy, s * 0.5).fill({ color: 0x000000, alpha: 0.6 }).stroke({ color: 0xff5a5a, width: Math.max(1.5, s * 0.15) });
  g.moveTo(cx - s * 0.36, cy + s * 0.36).lineTo(cx + s * 0.36, cy - s * 0.36).stroke({ color: 0xff5a5a, width: Math.max(1.5, s * 0.15) });
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

/** Procedural icon for a block, centred on the origin, drawn facing up (input at the bottom). */
export function drawBlockIcon(g: Graphics, id: string, s: number, color: number) {
  const u = s / 2;
  const w = Math.max(2, s * 0.11);
  const line = { color, width: w, cap: 'round' as const, join: 'round' as const };
  switch (id) {
    case 'turn_r':
    case 'turn_l': {
      const d = id === 'turn_r' ? 1 : -1;
      g.moveTo(0, u * 0.85).lineTo(0, 0).lineTo(d * u * 0.5, 0).stroke(line);
      arrowHead(g, d * u * 0.95, 0, d > 0 ? 0 : Math.PI, u * 0.5, u * 0.3, color);
      break;
    }
    case 'splitter_2':
    case 'splitter_3': {
      g.moveTo(0, u * 0.85).lineTo(0, 0).moveTo(-u * 0.5, 0).lineTo(u * 0.5, 0);
      if (id === 'splitter_3') g.moveTo(0, 0).lineTo(0, -u * 0.5);
      g.stroke(line);
      arrowHead(g, -u * 0.95, 0, Math.PI, u * 0.5, u * 0.3, color);
      arrowHead(g, u * 0.95, 0, 0, u * 0.5, u * 0.3, color);
      if (id === 'splitter_3') arrowHead(g, 0, -u * 0.95, -Math.PI / 2, u * 0.5, u * 0.3, color);
      break;
    }
    case 'flat_plus':
      g.moveTo(-u * 0.65, 0).lineTo(u * 0.65, 0).moveTo(0, -u * 0.65).lineTo(0, u * 0.65).stroke({ ...line, width: w * 1.5 });
      break;
    case 'percent_mult':
      g.moveTo(-u * 0.55, -u * 0.55).lineTo(u * 0.55, u * 0.55).moveTo(u * 0.55, -u * 0.55).lineTo(-u * 0.55, u * 0.55).stroke({ ...line, width: w * 1.5 });
      break;
    case 'lucky_strike': {
      g.roundRect(-u * 0.65, -u * 0.65, u * 1.3, u * 1.3, u * 0.25).stroke(line);
      for (const [px, py] of [[-0.3, -0.3], [0, 0], [0.3, 0.3]]) g.circle(px * u, py * u, w * 0.75).fill(color);
      break;
    }
    case 'jackpot': {
      const pts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? u * 0.85 : u * 0.38;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.poly(pts).fill(color);
      break;
    }
    case 'gamblers_gate': {
      g.circle(0, 0, u * 0.7).stroke(line);
      const pts: number[] = [];
      for (let i = 0; i <= 16; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 16;
        pts.push(Math.cos(a) * u * 0.7, Math.sin(a) * u * 0.7);
      }
      g.poly(pts).fill(color);
      break;
    }
    case 'piercing':
      g.moveTo(0, u * 0.85).lineTo(0, -u * 0.5).stroke(line);
      arrowHead(g, 0, -u * 0.95, -Math.PI / 2, u * 0.5, u * 0.3, color);
      g.moveTo(-u * 0.55, -u * 0.1).lineTo(u * 0.55, -u * 0.1).moveTo(-u * 0.55, u * 0.35).lineTo(u * 0.55, u * 0.35).stroke({ ...line, width: w * 0.8 });
      break;
    case 'bouncing':
      g.moveTo(-u * 0.75, u * 0.6).lineTo(-u * 0.25, -u * 0.55).lineTo(u * 0.2, u * 0.25).lineTo(u * 0.7, -u * 0.6).stroke(line);
      break;
    case 'aoe_circle':
      g.circle(0, 0, u * 0.78).stroke(line);
      g.circle(0, 0, u * 0.3).fill(color);
      break;
    case 'shield_breaker':
      g.poly([-u * 0.65, -u * 0.7, u * 0.65, -u * 0.7, u * 0.65, -u * 0.05, 0, u * 0.85, -u * 0.65, -u * 0.05]).stroke(line);
      g.moveTo(0, -u * 0.7).lineTo(-u * 0.2, -u * 0.2).lineTo(u * 0.2, u * 0.1).lineTo(0, u * 0.5).stroke({ ...line, width: w * 0.7 });
      break;
    case 'pure_converter':
      g.poly([0, -u * 0.85, u * 0.7, 0, 0, u * 0.85, -u * 0.7, 0]).stroke(line);
      g.poly([0, -u * 0.35, u * 0.3, 0, 0, u * 0.35, -u * 0.3, 0]).fill(color);
      break;
    default:
      g.circle(0, 0, u * 0.6).stroke(line);
  }
}

export type ToolIcon = 'clear' | 'ccw' | 'cw' | 'auto' | 'clearAll' | 'fit' | 'undo' | 'redo' | 'copy' | 'paste' | 'help' | 'ship';

/** Procedural icons for buttons, centred on the origin. */
export function drawToolIcon(g: Graphics, kind: ToolIcon, s: number, color: number) {
  const u = s / 2;
  const w = Math.max(2, s * 0.09);
  const line = { color, width: w, cap: 'round' as const, join: 'round' as const };
  switch (kind) {
    case 'clear':
      g.roundRect(-u * 0.8, -u * 0.8, u * 1.6, u * 1.6, u * 0.15).fill({ color: 0x1a1a1a, alpha: 0.9 }).stroke({ color, width: w * 0.7 });
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
      g.roundRect(-u * 0.7, -u * 0.75, u * 1, u * 1.2, u * 0.1).stroke(line);
      g.roundRect(-u * 0.25, -u * 0.35, u * 1, u * 1.2, u * 0.1).fill({ color: 0x1a1a1a, alpha: 0.95 }).stroke(line);
      break;
    case 'paste':
      g.roundRect(-u * 0.7, -u * 0.7, u * 1.4, u * 1.55, u * 0.12).stroke(line);
      g.roundRect(-u * 0.3, -u * 0.9, u * 0.6, u * 0.35, u * 0.1).fill(color);
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
      g.roundRect(-u * 0.55, -u * 0.6, u * 1.1, u * 1.3, u * 0.2).fill(0x6e5e46).stroke({ color: 0x1b1b1b, width: w * 0.8 });
      g.rect(-u * 0.3, -u * 0.4, u * 0.6, u * 0.4).fill(0xdddddd);
      g.rect(-u * 0.85, -u * 0.1, u * 0.3, u * 0.7).fill(0x2a2a2a);
      g.rect(u * 0.55, -u * 0.1, u * 0.3, u * 0.7).fill(0x2a2a2a);
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

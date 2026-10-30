import { SKILL_NODES, SkillNode } from '../data/skillTree';

/** Map geometry of the skill tree (pure, so it is unit tested). Hexes are pointy-top; one axial step is HEX_STEP map units. */
export const HEX_RADIUS = 30;
export const HEX_STEP = HEX_RADIUS * 2.2;
/** Capstones are drawn this much bigger than a normal node. */
export const CAPSTONE_SCALE = 1.28;
/** Zoom (screen px per map unit) limits and the start zoom, which shows the whole tree on a 360 px wide screen. */
export const SKILL_ZOOM_MIN = 0.3;
export const SKILL_ZOOM_MAX = 2.5;

const SQRT3 = Math.sqrt(3);

/** Map position (centre) of an axial hex. */
export function hexCentre(at: readonly [number, number]): { x: number; y: number } {
  return { x: HEX_STEP * (at[0] + at[1] / 2), y: HEX_STEP * (SQRT3 / 2) * at[1] };
}

/** The six corners of a pointy-top hexagon of radius `r` around (cx, cy), flat array for Graphics.poly. */
export function hexCorners(cx: number, cy: number, r: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return pts;
}

/** Radius of a node's hexagon. */
export const nodeRadius = (n: Pick<SkillNode, 'capstone'>) => HEX_RADIUS * (n.capstone ? CAPSTONE_SCALE : 1);

/** The node under a map point, or null. Distance to the centre is compared with the hexagon's inner radius, which is plenty for taps. */
export function nodeAt(mx: number, my: number): SkillNode | null {
  let best: SkillNode | null = null;
  let bestD = Infinity;
  for (const n of SKILL_NODES) {
    const c = hexCentre(n.at);
    const d = Math.hypot(mx - c.x, my - c.y);
    if (d <= nodeRadius(n) * 0.9 && d < bestD) { best = n; bestD = d; }
  }
  return best;
}

/** Bounding box of every node on the map (with the node radius), for fitting the first view. */
export function treeBounds(): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of SKILL_NODES) {
    const c = hexCentre(n.at);
    const r = nodeRadius(n);
    x0 = Math.min(x0, c.x - r); y0 = Math.min(y0, c.y - r); x1 = Math.max(x1, c.x + r); y1 = Math.max(y1, c.y + r);
  }
  return { x0, y0, x1, y1 };
}

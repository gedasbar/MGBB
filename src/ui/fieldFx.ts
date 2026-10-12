import { Graphics } from 'pixi.js';
import { CLOUD_MAX, ProjectileSystem, WELL_MAX } from '../engine/projectiles';
import { RESIDUE_RADIUS, RESIDUE_TIME, WELL_RADIUS, WELL_TIME } from '../engine/effects';
import { CATEGORY_COLOR } from './theme';

/** Residue Seed clouds and Gravity Well attractors: faint thin regular polygons, flat colour, no glow. */
const CLOUD_SIDES = 12;
const WELL_SIDES = 8;
const CLOUD_ALPHA = 0.55;
const WELL_ALPHA = 0.5;
/** A well's ring shrinks from the full radius to this share of it as it ends. */
const WELL_END_SCALE = 0.25;
/** A cloud fades out over its last second... of this many seconds. */
const CLOUD_FADE = 0.5;

function ring(g: Graphics, cx: number, cy: number, r: number, sides: number, color: number, alpha: number) {
  const pts: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.poly(pts, true).stroke({ width: 1, color, alpha, join: 'miter' });
}

/** Redraws every live cloud and well into `g` (cleared first). `mapX` converts a world x to a screen x (the ring wall's camera). */
export function drawFieldFx(g: Graphics, ps: ProjectileSystem, mapX: (x: number) => number = (x) => x, wells = true) {
  g.clear();
  for (let k = 0; k < CLOUD_MAX; k++) {
    if (ps.cloudT[k] <= 0) continue;
    const fade = Math.min(1, ps.cloudT[k] / CLOUD_FADE);
    ring(g, mapX(ps.cloudX[k]), ps.cloudY[k], RESIDUE_RADIUS, CLOUD_SIDES, CATEGORY_COLOR.mitosis, CLOUD_ALPHA * fade);
    // The clock hand of the ticks: a small inner ring that shrinks over the cloud's life.
    ring(g, mapX(ps.cloudX[k]), ps.cloudY[k], Math.max(3, RESIDUE_RADIUS * 0.5 * (ps.cloudT[k] / RESIDUE_TIME)), CLOUD_SIDES, CATEGORY_COLOR.mitosis, CLOUD_ALPHA * 0.6 * fade);
  }
  if (!wells) return;
  for (let k = 0; k < WELL_MAX; k++) {
    if (ps.wellT[k] <= 0) continue;
    const left = Math.min(1, ps.wellT[k] / WELL_TIME);
    ring(g, ps.wellX[k], ps.wellY[k], WELL_RADIUS * (WELL_END_SCALE + (1 - WELL_END_SCALE) * left), WELL_SIDES, CATEGORY_COLOR.modifier, WELL_ALPHA * Math.min(1, left * 2));
  }
}

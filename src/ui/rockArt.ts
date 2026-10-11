import { Container, Graphics } from 'pixi.js';
import { Mulberry32 } from '../rng';

/**
 * Rock enemies: irregular faceted polygons generated from the enemy id (a rock keeps its shape), three nested warm shades,
 * thin dark cracks that appear with damage, and fragments that fly apart when it splits. An enemy type is data
 * (`EnemyArtDef`), the same idea as the ship art; the shapes are in unit radius and scaled by the enemy's size.
 * Flat fills and plain lines only: no gradients, no glow.
 */
export type Pt = [number, number];

export interface EnemyArtDef {
  id: string;
  vertsMin: number;
  vertsMax: number;
  /** Vertex distance from the centre, in unit radius: [min, max]. */
  radius: [number, number];
  shades: { edge: number; mid: number; inner: number };
  crackColor: number;
  cracksMin: number;
  cracksMax: number;
  /** Fragments thrown out by a split: [min, max]. */
  fragments: [number, number];
  /** Damage fraction at which the first crack appears, and the step to each following one. */
  crackFirst: number;
  crackStep: number;
  /** From this damage fraction the visible cracks widen (over WIDEN_TIME). */
  widenAt: number;
}

export const ENEMY_ART: Record<string, EnemyArtDef> = {
  mitotic_rock: {
    id: 'mitotic_rock', vertsMin: 6, vertsMax: 9, radius: [0.78, 1.0],
    shades: { edge: 0xd9b27a, mid: 0xa8794d, inner: 0x6f4b2e },
    crackColor: 0x1a120b, cracksMin: 1, cracksMax: 3, fragments: [2, 4],
    crackFirst: 0.25, crackStep: 0.25, widenAt: 0.85,
  },
};

export const enemyArt = (defId: string): EnemyArtDef => ENEMY_ART[defId] ?? ENEMY_ART.mitotic_rock;

/** Seconds the cracks take to widen once the rock is nearly dead, and the split fragments' flight time. */
export const WIDEN_TIME = 0.2;
export const FRAGMENT_LIFE = 0.25;

export interface RockShape {
  outer: Pt[];
  mid: Pt[];
  inner: Pt[];
  /** Each crack is a polyline from the middle of one edge to the middle of another. */
  cracks: Pt[][];
}

const scaled = (pts: Pt[], k: number): Pt[] => pts.map(([x, y]) => [x * k, y * k] as Pt);

/** The shape of a rock: a pure function of its id and art def. */
export function rockShape(def: EnemyArtDef, id: number): RockShape {
  const rnd = new Mulberry32((id * 7919 + 104729) | 0);
  const n = def.vertsMin + Math.floor(rnd.next() * (def.vertsMax - def.vertsMin + 1));
  const start = rnd.next() * Math.PI * 2;
  const outer: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = start + ((i + (rnd.next() - 0.5) * 0.55) * Math.PI * 2) / n;
    const r = def.radius[0] + rnd.next() * (def.radius[1] - def.radius[0]);
    outer.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const nCracks = def.cracksMin + Math.floor(rnd.next() * (def.cracksMax - def.cracksMin + 1));
  const edgeMid = (i: number): Pt => {
    const a = outer[i % n], b = outer[(i + 1) % n];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  const cracks: Pt[][] = [];
  for (let k = 0; k < nCracks; k++) {
    const i = (k * Math.floor(n / nCracks) + Math.floor(rnd.next() * 2)) % n;
    const j = (i + Math.floor(n / 2) + (rnd.next() < 0.5 ? 0 : 1)) % n;
    const A = edgeMid(i), B = edgeMid(j);
    const dx = B[0] - A[0], dy = B[1] - A[1];
    const len = Math.hypot(dx, dy) || 1;
    const off = (rnd.next() - 0.5) * 0.45;
    const M: Pt = [(A[0] + B[0]) / 2 - (dy / len) * off, (A[1] + B[1]) / 2 + (dx / len) * off];
    cracks.push([A, M, B]);
  }
  return { outer, mid: scaled(outer, 0.72), inner: scaled(outer, 0.42), cracks };
}

/** How many of a rock's cracks show at a damage fraction (0 = full HP, 1 = dead). Never more than it has. */
export function visibleCracks(def: EnemyArtDef, nCracks: number, damage: number): number {
  let n = 0;
  for (let k = 0; k < nCracks; k++) if (damage >= def.crackFirst + k * def.crackStep - 1e-9) n++;
  return n;
}

const flat = (pts: Pt[]) => pts.flatMap(([x, y]) => [x, y]);

/** One rock in the Fly screen: static body polygons, a crack layer redrawn only when its state changes, a white hit flash. */
export class RockView {
  readonly container = new Container();
  readonly shape: RockShape;
  private def: EnemyArtDef;
  private cracks = new Graphics();
  private flashG: Graphics;
  /** Status wash (burning / frozen): the outline filled in a colour at partial alpha. */
  private statusG: Graphics;
  private radius: number;
  private shown = -1;
  private widthStep = -1;
  private widenT = 0;

  constructor(defId: string, id: number, radius: number) {
    this.def = enemyArt(defId);
    this.radius = radius;
    this.shape = rockShape(this.def, id);
    const s = this.def.shades;
    const body = new Graphics()
      .poly(flat(this.shape.outer)).fill(s.edge)
      .poly(flat(this.shape.mid)).fill(s.mid)
      .poly(flat(this.shape.inner)).fill(s.inner);
    this.flashG = new Graphics().poly(flat(this.shape.outer)).fill(0xffffff);
    this.flashG.visible = false;
    this.statusG = new Graphics().poly(flat(this.shape.outer)).fill(0xffffff);
    this.statusG.visible = false;
    this.statusG.alpha = 0.5;
    this.container.addChild(body, this.cracks, this.statusG, this.flashG);
    this.container.scale.set(radius);
  }

  setRadius(r: number) {
    if (r !== this.radius) { this.radius = r; this.container.scale.set(r); this.widthStep = -1; }
  }

  /** `damage` is 1 - hp / maxHp. Redraws the cracks only when a new one appears or the width steps. */
  update(damage: number, dt: number, flashing: boolean) {
    this.flashG.visible = flashing;
    const n = visibleCracks(this.def, this.shape.cracks.length, damage);
    if (damage >= this.def.widenAt) this.widenT = Math.min(WIDEN_TIME, this.widenT + dt); else this.widenT = 0;
    const step = Math.round((this.widenT / WIDEN_TIME) * 4);
    if (n === this.shown && step === this.widthStep) return;
    this.shown = n;
    this.widthStep = step;
    const px = 1.5 + 2 * (step / 4);
    this.cracks.clear();
    for (let k = 0; k < n; k++) {
      const c = this.shape.cracks[k];
      this.cracks.moveTo(c[0][0], c[0][1]).lineTo(c[1][0], c[1][1]).lineTo(c[2][0], c[2][1]);
    }
    if (n > 0) this.cracks.stroke({ width: px / this.radius, color: this.def.crackColor, cap: 'butt', join: 'miter' });
  }

  /** Tints the rock with a status colour, or clears it with -1. */
  setStatus(color: number) {
    this.statusG.visible = color >= 0;
    if (color >= 0) this.statusG.tint = color;
  }

  get visibleCrackCount(): number { return this.shown; }
  get crackWidthStep(): number { return this.widthStep; }

  destroy() { this.container.destroy({ children: true }); }
}

/** Small angular shards, in unit radius. */
const SHARDS: Pt[][] = [
  [[-0.5, -0.3], [0.5, -0.5], [0.1, 0.6]],
  [[-0.4, -0.5], [0.6, -0.1], [0.2, 0.5], [-0.5, 0.3]],
  [[-0.6, 0.1], [0.0, -0.6], [0.6, 0.2]],
  [[-0.3, -0.6], [0.5, -0.2], [0.4, 0.5], [-0.5, 0.4]],
];

interface Frag { g: Graphics; vx: number; vy: number; vr: number; life: number }

/** A fixed pool of fragment polygons: no allocation when a rock splits. */
export class FragmentPool {
  readonly container = new Container();
  private items: Frag[] = [];

  constructor(size = 32, def: EnemyArtDef = ENEMY_ART.mitotic_rock) {
    for (let i = 0; i < size; i++) {
      const g = new Graphics().poly(flat(SHARDS[i % SHARDS.length])).fill(def.shades.edge).stroke({ width: 0.14, color: def.shades.inner });
      g.visible = false;
      this.container.addChild(g);
      this.items.push({ g, vx: 0, vy: 0, vr: 0, life: 0 });
    }
  }

  /** 2 to 4 fragments (by the def) fly out of (x, y); `seed` (the parent's id) fixes how many and which way. */
  emit(x: number, y: number, radius: number, seed: number, def: EnemyArtDef = ENEMY_ART.mitotic_rock) {
    const rnd = new Mulberry32((seed * 2654435761) | 0);
    const count = def.fragments[0] + Math.floor(rnd.next() * (def.fragments[1] - def.fragments[0] + 1));
    const base = rnd.next() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const it = this.items.find(f => f.life <= 0);
      if (!it) return;
      const a = base + (i * Math.PI * 2) / count + (rnd.next() - 0.5) * 0.6;
      const sp = 90 + rnd.next() * 60;
      it.vx = Math.cos(a) * sp;
      it.vy = Math.sin(a) * sp;
      it.vr = (rnd.next() - 0.5) * 12;
      it.life = FRAGMENT_LIFE;
      it.g.position.set(x, y);
      it.g.rotation = rnd.next() * Math.PI * 2;
      it.g.scale.set(radius * 0.55);
      it.g.alpha = 1;
      it.g.visible = true;
    }
  }

  update(dt: number) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) { it.g.visible = false; continue; }
      it.g.x += it.vx * dt;
      it.g.y += it.vy * dt;
      it.g.rotation += it.vr * dt;
      it.g.alpha = Math.min(1, it.life / (FRAGMENT_LIFE * 0.5));
    }
  }

  get live(): number { return this.items.filter(f => f.life > 0).length; }
}

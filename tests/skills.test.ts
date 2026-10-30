import { describe, it, expect } from 'vitest';
import { BLOCKS } from '../src/data/blocks';
import { capWithSkills } from '../src/data/blockEconomy';
import { PATHS, SKILL_BY_ID, SKILL_NODES } from '../src/data/skillTree';
import { compile, Grid } from '../src/engine/compiler';
import { newPacket, Modifier, CompileContext } from '../src/engine/compilerTypes';
import { aoeEstimateMul, aoeStackDamage, frontierEchoAdd, heavyRoundMul, hollowCoreMul, idleBarrelsAdd, lastBreathMul, loneShotMul, waypointMul, zigzagMul } from '../src/engine/effects';
import { ProjectilePool } from '../src/engine/pools';
import { EnemyEntity, ProjectileSystem } from '../src/engine/projectiles';
import { SpatialHash } from '../src/engine/spatialHash';
import { Gun, spawnOffsetsFor } from '../src/game/fire';
import { buildFanGrid, buildDartGrid } from '../src/game/gridUtils';
import { place } from '../src/game/starter';
import { defaultProgress, loadProgress, ProgressStore, PROGRESS_VERSION } from '../src/econ/progress';
import { heroCostWith } from '../src/captains/state';
import { SKILL_FX_KEYS, NO_SKILLS, SkillEffects } from '../src/skills/effects';
import { RESPEC_MEDALS } from '../src/skills/constants';
import { buyBlocker, buySkill, freePoints, nextPointRing, pointRingBounds, respecCost, respecSkills, sanitizeSkillList, skillEffects, skillPointsFor } from '../src/skills/rules';
import { hexCentre, nodeAt, nodeRadius } from '../src/skills/layout';
import { getWorld, sqKey } from '../src/frontier/world';
import type { GridCell } from '../src/engine/compiler';

// Chunk 22a: the skill tree (docs/skills.md).

const fx = (...ids: string[]): SkillEffects => skillEffects(ids);
const ctxWith = (s: SkillEffects): CompileContext => ({ furthestRing: 0, emptyCells: 0, idleEjectors: 0, skills: s });
function fanLine(ids: string[]): Grid {
  const g = buildFanGrid();
  place(g, 5, 9, 'flat_plus');
  ids.forEach((id, k) => place(g, 5, 8 - k, id));
  return g;
}
const dmg = (ids: string[], skills: SkillEffects = NO_SKILLS) => compile(fanLine(ids), { skills }).recipes[0].packet.damage;
/** The damage a block's own transform gives a base packet (what compile() calls for every block on the path). */
const through = (id: string, s: SkillEffects, level = 1) => { const p = newPacket(10); BLOCKS[id].transform!(p, level, ctxWith(s)); return p.damage; };

describe('points from the furthest ring', () => {
  it('one per 25 rings to ring 250, then one per 50', () => {
    const at = (r: number) => skillPointsFor(r);
    expect([0, 24, 25, 49, 50, 249, 250, 251, 299, 300, 500, 1000].map(at)).toEqual([0, 0, 1, 1, 2, 9, 10, 10, 10, 11, 15, 25]);
    expect(skillPointsFor(-5)).toBe(0);
    expect(skillPointsFor(NaN)).toBe(0);
  });
  it('the next point and the progress bar bounds', () => {
    expect([0, 24, 25, 249, 250, 299, 300].map(nextPointRing)).toEqual([25, 25, 50, 250, 300, 300, 350]);
    expect(pointRingBounds(260)).toEqual({ prev: 250, next: 300 });
    expect(pointRingBounds(30)).toEqual({ prev: 25, next: 50 });
  });
});

describe('the tree', () => {
  it('55 nodes: the start and six paths of 7 normal nodes and 2 capstones, every capstone tied to a legendary block', () => {
    expect(SKILL_NODES.length).toBe(55);
    for (const p of PATHS) {
      const ns = SKILL_NODES.filter(n => n.path === p.id);
      expect(ns.length, p.id).toBe(9);
      expect(ns.filter(n => n.capstone).length, p.id).toBe(2);
    }
    for (const n of SKILL_NODES.filter(n => n.capstone)) expect(BLOCKS[n.needsBlock!]?.category, n.id).toBe('legendary');
  });
  it('positions are distinct, links are two-way, every node can be reached from the start, texts fit 60 characters', () => {
    expect(new Set(SKILL_NODES.map(n => n.at.join(','))).size).toBe(55);
    for (const n of SKILL_NODES) for (const l of n.links) expect(SKILL_BY_ID[l].links, `${l} -> ${n.id}`).toContain(n.id);
    const seen = new Set(['start']);
    for (let grew = true; grew;) { grew = false; for (const n of SKILL_NODES) if (!seen.has(n.id) && n.links.some(l => seen.has(l))) { seen.add(n.id); grew = true; } }
    expect(seen.size).toBe(55);
    for (const n of SKILL_NODES) { expect(n.text.length, n.id).toBeLessThanOrEqual(60); expect(n.text, n.id).not.toMatch(/[{}]/); }
  });
  it('every effect key a node uses exists, and every key is used by a node', () => {
    const used = new Set<string>();
    for (const n of SKILL_NODES) for (const k of Object.keys(n.fx)) { expect(SKILL_FX_KEYS as readonly string[], `${n.id}.${k}`).toContain(k); used.add(k); }
    expect([...SKILL_FX_KEYS].filter(k => !used.has(k))).toEqual([]);
  });
  it('the map: a tap on a node centre finds the node, capstones are bigger', () => {
    for (const n of SKILL_NODES) { const c = hexCentre(n.at); expect(nodeAt(c.x, c.y)?.id).toBe(n.id); }
    expect(nodeAt(5000, 5000)).toBeNull();
    expect(nodeRadius(SKILL_BY_ID.cap_waypoint)).toBeGreaterThan(nodeRadius(SKILL_BY_ID.turn_left));
  });
});

describe('buying and respec', () => {
  const ring = 100; // 4 points
  it('a node must touch an owned node (the start counts); a point must be free', () => {
    expect(buyBlocker(ring, [], 'turn_left')).toBeNull();
    expect(buyBlocker(ring, [], 'turn_right')).toMatch(/neighbouring/);
    expect(buyBlocker(ring, ['turn_left'], 'turn_right')).toBeNull();
    expect(buyBlocker(ring, ['turn_left'], 'turn_left')).toMatch(/Already/);
    expect(buyBlocker(ring, ['turn_left'], 'nope')).toMatch(/Unknown/);
    expect(buyBlocker(ring, ['turn_left'], 'start')).toMatch(/Unknown/);
    expect(buyBlocker(24, [], 'turn_left')).toMatch(/point/);
    const p = { skills: [] as string[], medals: 0 };
    expect(buySkill(p, 25, 'turn_left').ok).toBe(true);
    expect(buySkill(p, 25, 'turn_right').ok).toBe(false); // the one point is spent
    expect(freePoints(25, p.skills)).toBe(0);
    expect(freePoints(50, p.skills)).toBe(1);
  });
  it('respec takes every node back for 10 Medals (5 with the Fresh Start node) and needs the Medals', () => {
    expect(RESPEC_MEDALS).toBe(10);
    const p = { skills: ['turn_left', 'turn_right'], medals: 9 };
    expect(respecSkills(p).ok).toBe(false);
    expect(p.skills.length).toBe(2);
    p.medals = 12;
    expect(respecSkills(p)).toEqual({ ok: true, cost: 10 });
    expect(p).toEqual({ skills: [], medals: 2 });
    expect(respecSkills(p).ok).toBe(false); // nothing to take back costs nothing
    expect(p.medals).toBe(2);
    expect(respecCost([])).toBe(10);
    expect(respecCost(['replay_credits', 'record_credits', 'medal_square', 'respec_half'])).toBe(5);
    const q = { skills: ['replay_credits', 'record_credits', 'medal_square', 'respec_half'], medals: 5 };
    expect(respecSkills(q)).toEqual({ ok: true, cost: 5 });
    expect(q.medals).toBe(0);
  });
});

describe('save version 11', () => {
  it('an older save starts with no skills; a saved list round-trips; floating, unknown and unpaid nodes are dropped', () => {
    expect(PROGRESS_VERSION).toBe(11);
    expect(defaultProgress().skills).toEqual([]);
    const old = loadProgress(JSON.stringify({ version: 10, credits: 77, owned: {}, levels: {}, ownedHulls: ['dart'] }));
    expect(old.version).toBe(11);
    expect(old.skills).toEqual([]);
    expect(old.credits).toBe(77);
    const frontier = { seed: 15015, sq: { [sqKey(0, 25)]: 2 as const, [sqKey(0, -50)]: 2 as const } }; // rings 25 and 50: 2 points
    const raw = (skills: unknown) => JSON.stringify({ version: 11, owned: {}, levels: {}, ownedHulls: ['dart'], frontier, skills });
    expect(loadProgress(raw(['turn_left', 'turn_right'])).skills).toEqual(['turn_left', 'turn_right']);
    expect(loadProgress(raw(['turn_right', 'nope', 'turn_left', 'turn_left', 'start'])).skills).toEqual(['turn_left', 'turn_right']);
    expect(loadProgress(raw(['split_two'])).skills).toEqual([]); // floating
    expect(loadProgress(raw(['turn_left', 'turn_right', 'split_two'])).skills.length).toBe(2); // only 2 points paid
    expect(loadProgress(raw('x')).skills).toEqual([]);
    expect(sanitizeSkillList(['turn_left'], 0)).toEqual([]);
  });
  it('the store buys and respecs through the progress object and commits', () => {
    const store = new ProgressStore(null, defaultProgress());
    expect(store.buySkill('turn_left').ok).toBe(false); // ring 0
    store.data.frontier.sq[sqKey(0, 25)] = 2;
    store.commit();
    expect(store.skillRing).toBe(25);
    expect(store.buySkill('turn_left').ok).toBe(true);
    expect(store.runModifiers().skills.turnLeftAdd).toBe(1);
    store.data.medals = 10;
    expect(store.respecSkills().ok).toBe(true);
    expect(store.data.skills).toEqual([]);
    expect(store.runModifiers().skills.turnLeftAdd).toBe(0);
  });
});

describe('Routing', () => {
  it('Turn Left / Right +1 damage, Splitters +10%, Curving and Random Curve +1, Delay Line +20%', () => {
    expect(through('turn_l', NO_SKILLS)).toBe(10);
    expect(through('turn_l', fx('turn_left'))).toBe(11);
    expect(through('turn_r', fx('turn_right'))).toBe(11);
    expect(through('turn_r', fx('turn_left'))).toBe(10);
    expect(through('splitter_2', fx('split_two'))).toBeCloseTo(11, 9);
    expect(through('splitter_3', fx('split_three'))).toBeCloseTo(11, 9);
    expect(through('splitter_2', fx('split_three'))).toBe(10);
    for (const id of ['curving_left', 'curving_right', 'random_curve']) expect(through(id, fx('curve_dmg'))).toBe(11);
    expect(through('delay_line', fx('delay_dmg'))).toBeCloseTo(12, 9);
  });
  it('Random Router: both outputs +10 points (the compiled op)', () => {
    // generator at the bottom middle, the router above it, an ejector on each side of the router
    const cell = (x: number, y: number, type: GridCell['type'], facing?: GridCell['facing']): GridCell => ({ x, y, type, blockId: null, level: 1, rotation: 0, facing });
    const g: Grid = { w: 3, h: 3, cells: [] };
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) g.cells.push(cell(x, y, 'void'));
    g.cells[2 * 3 + 1] = cell(1, 2, 'generator', 'N');
    g.cells[1 * 3 + 1] = { ...cell(1, 1, 'empty'), blockId: 'random_router' };
    g.cells[1 * 3 + 0] = cell(0, 1, 'ejector', 'W');
    g.cells[1 * 3 + 2] = cell(2, 1, 'ejector', 'E');
    const both = (s: SkillEffects) => (compile(g, { skills: s }).recipes[0].packet.ops.find(o => o.t === 'rnd') as any).both;
    expect(both(NO_SKILLS)).toBeCloseTo(0.7, 9); // the Router runs at its fixed level
    expect(both(fx('router_both'))).toBeCloseTo(0.8, 9);
  });
  it('capstones: Waypoint x1.1 -> x1.15 per turn, Hollow Core +10% -> +15% per empty cell', () => {
    expect(waypointMul(2)).toBeCloseTo(1.21, 9);
    expect(waypointMul(2, fx('cap_waypoint').waypointPer)).toBeCloseTo(1.3225, 9);
    expect(through('waypoint', fx('cap_waypoint'))).toBeCloseTo(10, 9); // no turns yet
    expect(hollowCoreMul(10)).toBeCloseTo(2, 9);
    expect(hollowCoreMul(10, fx('cap_hollow').hollowPerCell)).toBeCloseTo(2.5, 9);
    const ctx = { ...ctxWith(fx('cap_hollow')), emptyCells: 10 };
    const p = newPacket(10);
    BLOCKS.hollow_core.transform!(p, 1, ctx);
    expect(p.damage).toBeCloseTo(25, 9);
  });
});

describe('Flight', () => {
  it('shots angled left gain up to +40% (linear in the angle, full at 60 degrees); right likewise; straight shots nothing', () => {
    const left = fx('angle_left'), right = fx('angle_right');
    const base = dmg(['angle_left', 'angle_left']);
    expect(dmg(['angle_left', 'angle_left'], left)).toBeCloseTo(base * 1.2, 9); // 30 degrees: half of 40%
    expect(dmg(['angle_left', 'angle_left', 'angle_left', 'angle_left'], left)).toBeCloseTo(dmg(['angle_left', 'angle_left', 'angle_left', 'angle_left']) * 1.4, 9); // 60 degrees
    expect(dmg(['angle_left', 'angle_left'], right)).toBe(base); // a left shot ignores the right node
    expect(dmg(['angle_right', 'angle_right'], right)).toBeCloseTo(base * 1.2, 9);
    expect(dmg([], left)).toBe(dmg([]));
  });
  it('Scatter +15%, Accelerator +10% per copy, Brake floor 0.2 -> 0.15, Extender +50% lifetime', () => {
    expect(dmg(['scatter'], fx('scatter_dmg'))).toBeCloseTo(dmg(['scatter']) * 1.15, 9);
    expect(dmg(['accelerator', 'accelerator'], fx('accel_dmg'))).toBeCloseTo(dmg(['accelerator', 'accelerator']) * 1.2, 9);
    const speed = (s: SkillEffects) => compile(fanLine(['brake', 'brake', 'brake', 'brake', 'brake', 'brake', 'brake', 'brake']), { skills: s }).recipes[0].packet.speedMul;
    expect(speed(NO_SKILLS)).toBeCloseTo(0.2, 9);
    expect(speed(fx('brake_floor'))).toBeCloseTo(0.15, 9);
    const life = (s: SkillEffects) => compile(fanLine(['extender']), { skills: s }).recipes[0].packet.lifeMul;
    expect(life(NO_SKILLS)).toBe(2);
    expect(life(fx('extender_life'))).toBe(3);
  });
  it('Upturn turns 0.1 s sooner', () => {
    const heading = (skills: SkillEffects) => {
      const r = rig();
      r.sys.skills = skills;
      const i = r.launch([{ type: 'upturn' }], 200, 500, 300, 0);
      for (let k = 0; k < 22; k++) r.sys.steer(DT, r.enemies); // 0.37 s: past 0.3 s, before 0.4 s
      return Math.atan2(r.pool.vy[i], r.pool.vx[i]);
    };
    expect(heading(NO_SKILLS)).toBeCloseTo(0, 6); // default delay 0.4 s: still flat
    expect(heading(fx('upturn_delay'))).toBeLessThan(-0.01); // delay 0.3 s: already turning up
  });
  it('capstones: Zigzag +5% -> +8% per change, Heavy Round top x5 -> x6', () => {
    expect(zigzagMul(10)).toBeCloseTo(1.5, 9);
    expect(zigzagMul(10, fx('cap_zigzag').zigzagGain)).toBeCloseTo(1.8, 9);
    expect(heavyRoundMul(0.2)).toBe(5);
    expect(heavyRoundMul(0.2, fx('cap_heavy').heavyTop)).toBe(6);
    expect(heavyRoundMul(1, 1)).toBe(2);
  });
});

describe('Volley', () => {
  it('shots added by +1 Projectile start with +1 damage', () => {
    const lanes = (s: SkillEffects) => compile(fanLine(['plus_one']), { skills: s }).recipes.map(r => r.packet.damage).sort();
    expect(lanes(NO_SKILLS)).toEqual([1, 2]);
    expect(lanes(fx('plus_base'))).toEqual([2, 2]);
  });
  it('copy limits: Splitter 3 +3, +1 Projectile +2, Percent x +1 (Firepower)', () => {
    expect(capWithSkills('splitter_3', NO_SKILLS)).toBe(15);
    expect(capWithSkills('splitter_3', fx('split3_cap'))).toBe(18);
    expect(capWithSkills('plus_one', fx('plus_cap'))).toBe(12);
    expect(capWithSkills('percent_mult', fx('percent_cap'))).toBe(11);
    expect(capWithSkills('piercing', fx('percent_cap'))).toBe(Infinity);
    const store = new ProgressStore(null, defaultProgress());
    store.data.owned.percent_mult = 10;
    store.data.credits = 1e12;
    expect(store.buyCopy('percent_mult').ok).toBe(false);
    store.data.skills = ['percent_cap'];
    expect(store.buyCopy('percent_mult').ok).toBe(true);
    expect(store.data.owned.percent_mult).toBe(11);
  });
  it('capstones: Fuse fires after 8 shots, Mirror clones deal x1.5', () => {
    const cap = (s: SkillEffects) => compile(fanLine(['fuse']), { skills: s }).recipes[0].packet.ops.find(o => o.t === 'cap') as any;
    expect(cap(NO_SKILLS).n).toBe(10);
    expect(cap(fx('cap_fuse')).n).toBe(8);
    for (const [s, k] of [[NO_SKILLS, 1], [fx('cap_mirror'), 1.5]] as const) {
      const g = buildDartGrid();
      place(g, 1, 2, 'mirror');
      const c = compile(g);
      const pool = new ProjectilePool(16);
      const sys = new ProjectileSystem(pool);
      sys.skills = s;
      sys.modifiersTable = c.recipes.map(r => r.packet.mods);
      const gun = new Gun(pool, sys, c.recipes, spawnOffsetsFor(c.recipes, g), 0.25);
      gun.update(0.25, 270, 800); gun.fire(270, 800);
      const d = Array.from({ length: 16 }, (_, i) => i).filter(i => pool.active[i]).map(i => pool.damage[i]).sort();
      expect(d).toEqual([1, k]);
    }
  });
  it('Fork pairs 50% -> 60%', () => {
    const forkDamage = (skills: SkillEffects) => {
      const r = rig();
      r.sys.skills = skills;
      r.rock(200, 300);
      r.launch([{ type: 'fork_impact', level: 1 }], 200, 400, 0, -300, 100);
      r.step(30);
      const forks = Array.from({ length: r.pool.max }, (_, k) => k).filter(k => r.pool.active[k] && r.pool.copy[k]);
      expect(forks.length).toBe(2);
      return r.pool.damage[forks[0]];
    };
    expect(forkDamage(NO_SKILLS)).toBeCloseTo(50, 6);
    expect(forkDamage(fx('fork_frac'))).toBeCloseTo(60, 6);
  });
  it('Mine +1 mine, Orbit +1 pass, Boomerang range +20%', () => {
    const mines = (skills: SkillEffects) => {
      const r = rig(); r.sys.skills = skills;
      r.launch([{ type: 'mine', level: 1 }], 200, 800, 0, -300, 5);
      for (let k = 0; k < 90; k++) { r.sys.steer(DT, r.enemies); for (let q = 0; q < r.pool.max; q++) if (r.pool.active[q]) { r.pool.x[q] += r.pool.vx[q] * DT; r.pool.y[q] += r.pool.vy[q] * DT; } }
      return Array.from({ length: r.pool.max }, (_, q) => q).filter(q => r.pool.active[q]).length;
    };
    expect(mines(NO_SKILLS)).toBe(1);
    expect(mines(fx('mine_more'))).toBe(2);
    const orbitEnds = (skills: SkillEffects) => {
      const r = rig(); r.sys.skills = skills; r.sys.shipX = 200; r.sys.shipY = 500;
      const i = r.launch([{ type: 'orbit', level: 1 }], 200, 500, 0, -600, 5);
      let t = 0;
      while (r.pool.phase[i] !== 0 && t < 600) { r.sys.steer(DT, r.enemies); t++; }
      return t * DT;
    };
    expect(orbitEnds(fx('orbit_pass')) - orbitEnds(NO_SKILLS)).toBeGreaterThan(0.5);
    const boomTurn = (skills: SkillEffects) => {
      const r = rig(); r.sys.skills = skills;
      const i = r.launch([{ type: 'boomerang', level: 1 }], 200, 900, 0, -600, 5);
      let t = 0;
      while (r.pool.phase[i] === 2 && t < 600) { r.sys.steer(DT, r.enemies); r.pool.y[i] += r.pool.vy[i] * DT; t++; }
      return t * DT * 600;
    };
    expect(boomTurn(fx('boomerang_range')) / boomTurn(NO_SKILLS)).toBeCloseTo(1.2, 1);
  });
});

describe('Impact', () => {
  it('a chance of +1 pierce and +1 bounce, rolled at launch (chance 1 always, 0 never)', () => {
    const one = (k: string, n: number) => ({ ...NO_SKILLS, [k]: n });
    const bonus = (s: SkillEffects) => { const r = rig(); r.sys.skills = s; const i = r.launch([{ type: 'piercing' }], 100, 100, 0, -100); return r.pool.pierceBonus[i]; };
    expect(bonus(one('pierceChance', 1))).toBe(1);
    expect(bonus(NO_SKILLS)).toBe(0);
    const bounces = (s: SkillEffects) => { const r = rig(); r.sys.skills = s; const i = r.launch([{ type: 'bouncing', level: 1 }], 100, 100, 0, -100); return r.pool.bounces[i]; };
    expect(bounces(one('bounceChance', 1))).toBe(bounces(NO_SKILLS) + 1);
    // the bonus pierce is used: with one Piercing copy a shot passes 2 targets, with the bonus 3
    const run = (s: SkillEffects) => {
      const r = rig(); r.sys.skills = s;
      for (const y of [300, 240, 180, 120]) r.rock(200, y, 1e6, 8);
      const i = r.launch([{ type: 'piercing' }], 200, 400, 0, -200, 10);
      r.step(240);
      return r.enemies.filter(e => e.hp < e.maxHp).length + (i < 0 ? 0 : 0);
    };
    expect(run(NO_SKILLS)).toBe(2);
    expect(run(one('pierceChance', 1))).toBe(3);
  });
  it('+10% damage per bounce already made', () => {
    const r = rig();
    r.sys.skills = fx('bounce_dmg');
    const i = r.launch([{ type: 'bouncing', level: 1 }], 100, 100, 0, -100, 100);
    r.pool.bounceN[i] = 3;
    const f = (r.sys as any).hitFactor(i, [{ type: 'bouncing' }]);
    expect(f).toBeCloseTo(1.3, 9);
    r.sys.skills = NO_SKILLS;
    expect((r.sys as any).hitFactor(i, [{ type: 'bouncing' }])).toBe(1);
  });
  it('AoE Rectangle / Circle penalty 5% -> 3% per extra copy, in the hit and in the builder estimate', () => {
    expect(aoeStackDamage(3)).toBeCloseTo(0.9025, 9);
    expect(aoeStackDamage(3, fx('aoe_rect_keep').aoeRectPenalty)).toBeCloseTo(0.9409, 9);
    const rect3 = [{ type: 'aoe_rect' }, { type: 'aoe_rect' }, { type: 'aoe_rect' }];
    const circ3 = [{ type: 'aoe_circle' }, { type: 'aoe_circle' }, { type: 'aoe_circle' }];
    expect(aoeEstimateMul(rect3, fx('aoe_rect_keep'))).toBeCloseTo(0.9409, 9);
    expect(aoeEstimateMul(rect3, fx('aoe_circle_keep'))).toBeCloseTo(0.9025, 9); // the other node does nothing here
    expect(aoeEstimateMul(circ3, fx('aoe_circle_keep'))).toBeCloseTo(0.9409, 9);
    const est = (s: SkillEffects) => compile(fanLine(['aoe_rect', 'aoe_rect', 'aoe_rect']), { skills: s }).stats.estDps;
    expect(est(fx('aoe_rect_keep'))).toBeCloseTo(est(NO_SKILLS) * (0.9409 / 0.9025), 6);
  });
  it('Chain Lightning jumps keep 80%, Persist spends 80% of a kill, Executioner works below 30%', () => {
    const hit = (s: SkillEffects, mods: Modifier[], hp: number, shotDamage: number) => {
      const r = rig(); r.sys.skills = s;
      const a = r.rock(200, 300, hp, 8);
      const b = r.rock(240, 300, 1e6, 8);
      r.launch(mods, 200, 400, 0, -300, shotDamage);
      r.step(40);
      return { a, b };
    };
    const chain = (s: SkillEffects) => { const { b } = hit(s, [{ type: 'chain_lightning', level: 1 }], 1e6, 100); return b.maxHp - b.hp; };
    expect(chain(NO_SKILLS)).toBeCloseTo(70, 6);
    expect(chain(fx('chain_frac'))).toBeCloseTo(80, 6);
    const executed = (s: SkillEffects) => { const { a } = hit(s, [{ type: 'executioner', level: 1 }], 1000, 10); a.hp = 280; return 0 + a.hp; };
    expect(executed(NO_SKILLS)).toBe(280);
    // Executioner at 28% HP: x3 only with the skill (25% -> 30%)
    const ex = (s: SkillEffects) => { const r = rig(); r.sys.skills = s; const a = r.rock(200, 300, 1000, 8); a.hp = 280; r.launch([{ type: 'executioner', level: 1 }], 200, 400, 0, -300, 10); r.step(40); return 280 - a.hp; };
    expect(ex(NO_SKILLS)).toBeCloseTo(10, 6);
    expect(ex(fx('executioner'))).toBeCloseTo(30, 6);
    // Persist: a rock with 10 HP, shot of 100: the shot keeps 1 - 10/100 = 90% (no skill) or 1 - 8/100 = 92% (80% spent)
    const persist = (s: SkillEffects) => { const r = rig(); r.sys.skills = s; r.rock(200, 300, 10, 8); const i = r.launch([{ type: 'persist' }], 200, 400, 0, -300, 100); r.step(40); return r.pool.damage[i]; };
    expect(persist(NO_SKILLS)).toBeCloseTo(90, 6);
    expect(persist(fx('persist_spend'))).toBeCloseTo(92, 6);
  });
  it('capstones: Last Breath x2 -> x3, Rebound x4 -> x5', () => {
    expect(lastBreathMul(2.5, 3)).toBe(2);
    expect(lastBreathMul(2.5, 3, fx('cap_last_breath').lastBreathMul)).toBe(3);
    expect(lastBreathMul(1, 3, 1)).toBe(1);
    const mul = (s: SkillEffects) => (compile(fanLine(['rebound']), { skills: s }).recipes[0].packet.ops.find(o => o.t === 'rebound') as any).mul;
    expect(mul(NO_SKILLS)).toBe(4);
    expect(mul(fx('cap_rebound'))).toBe(5);
  });
});

describe('Firepower', () => {
  it('Flat + adds +1 more per copy; Lucky Strike and Gambler\'s Gate +5% chance; Jackpot x12; Overclock cap +150%', () => {
    expect(through('flat_plus', NO_SKILLS, 3)).toBe(13);
    expect(through('flat_plus', fx('flat_more'), 3)).toBe(14);
    const gate = (id: string, s: SkillEffects) => compile(fanLine([id]), { skills: s }).recipes[0].packet.gates[0];
    expect(gate('lucky_strike', NO_SKILLS).prob).toBeCloseTo(0.33, 9);
    expect(gate('lucky_strike', fx('lucky_more')).prob).toBeCloseTo(0.38, 9);
    expect(gate('gamblers_gate', fx('gambler_more')).prob).toBeCloseTo(0.45, 9);
    expect(gate('jackpot', NO_SKILLS).mult).toBe(10);
    expect(gate('jackpot', fx('jackpot_more')).mult).toBe(12);
    const oc = (s: SkillEffects) => compile(fanLine(['overclock']), { skills: s }).recipes[0].packet.ops.find(o => o.t === 'oc') as any;
    expect(oc(NO_SKILLS).cap).toBe(1);
    expect(oc(fx('overclock_cap')).cap).toBe(1.5);
    expect(oc(fx('overclock_cap')).avg).toBeGreaterThan(oc(NO_SKILLS).avg);
  });
  it('capstones: Payload +25 -> +40, Lone Shot top x2 -> x3', () => {
    expect(through('payload', NO_SKILLS)).toBe(35);
    expect(through('payload', fx('cap_payload'))).toBe(50);
    expect(loneShotMul(1)).toBe(2);
    expect(loneShotMul(1, fx('cap_lone').loneShotTop)).toBe(3);
    expect(loneShotMul(10, 1)).toBe(1);
  });
});

describe('Salvage', () => {
  const store = (skills: string[]) => { const s = new ProgressStore(null, defaultProgress()); s.data.skills = skills; return s; };
  it('+10% credits on a replay of a cleared tier or square, +25% on a run that beats the best (an earlier best is needed), the two add', () => {
    const s = store(['replay_credits', 'record_credits']);
    expect(s.creditBonusMul('tier', '5', 100)).toBe(1);
    s.data.clearedTiers = [5];
    expect(s.creditBonusMul('tier', '5', 100)).toBeCloseTo(1.1, 9);
    s.data.wallBestCredits['5'] = 80;
    expect(s.creditBonusMul('tier', '5', 100)).toBeCloseTo(1.35, 9);
    expect(s.creditBonusMul('tier', '5', 80)).toBeCloseTo(1.1, 9); // equal is not a record
    s.data.squareBestCredits['3,4'] = 10;
    expect(s.creditBonusMul('square', '3,4', 20)).toBeCloseTo(1.25, 9); // not cleared, but a record
    s.data.frontier.sq['3,4'] = 2;
    expect(s.creditBonusMul('square', '3,4', 20)).toBeCloseTo(1.35, 9);
    expect(store([]).creditBonusMul('tier', '5', 100)).toBe(1);
  });
  it('Free Fly +10%, +5% credits per legendary block owned', () => {
    expect(store(['free_fly_credits']).runModifiers().skills.freeFlyCredits).toBeCloseTo(0.1, 9);
    const s = store(['legend_credits']);
    const base = s.runModifiers().creditMul;
    s.data.owned.payload = 1; s.data.owned.mirror = 1; s.data.owned.fuse = 0;
    expect(s.runModifiers().creditMul).toBeCloseTo(base + 0.1, 9);
  });
  it('a Medal square pays one extra Medal 20% of the time', () => {
    const s = store(['medal_square']);
    let x = 0, y = 1;
    while (!getWorld(s.data.frontier.seed).hasMedal(x, y)) { x++; if (x > 40) { x = 0; y++; } }
    const before = s.data.medals;
    s.data.frontier.sq[sqKey(x, y - 1)] = 2; // open the square (a neighbour cleared)
    const r = s.recordWallRun({ credits: 0, kills: 0, square: { x, y }, destroyed: 1, total: 1, rand: () => 0.1 });
    expect(r.medals).toBe(2);
    expect(s.data.medals).toBe(before + 2);
    const t = store([]);
    t.data.frontier.sq[sqKey(x, y - 1)] = 2;
    expect(t.recordWallRun({ credits: 0, kills: 0, square: { x, y }, destroyed: 1, total: 1, rand: () => 0.1 }).medals).toBe(1);
  });
  it('hero levels cost 10% fewer Medals (rounded, at least 1)', () => {
    expect(heroCostWith(10, 0)).toBe(6);
    expect(heroCostWith(10, 0.1)).toBe(5);
    expect(heroCostWith(0, 0.1)).toBe(1);
    expect(heroCostWith(30, fx('hero_discount').heroDiscount)).toBe(Math.max(1, Math.round(heroCostWith(30, 0) * 0.9)));
  });
  it('capstones: Frontier Echo 10% -> 15% of the ring, Idle Barrels +3 -> +5 per ejector', () => {
    expect(frontierEchoAdd(300)).toBe(30);
    expect(frontierEchoAdd(300, fx('cap_echo').echoShare)).toBe(45);
    expect(idleBarrelsAdd(2)).toBe(6);
    expect(idleBarrelsAdd(2, fx('cap_idle').idleBarrels)).toBe(10);
    const echo = (s: SkillEffects) => compile(fanLine(['frontier_echo']), { skills: s, furthestRing: 300 }).recipes[0].packet.damage;
    expect(echo(fx('cap_echo')) - echo(NO_SKILLS)).toBe(15);
  });
});

// ---------------------------------------------------------------- helpers
const DT = 1 / 60;
function rig() {
  const pool = new ProjectilePool(64);
  const sys = new ProjectileSystem(pool);
  const enemies: EnemyEntity[] = [];
  const hash = new SpatialHash(540, 960, 64);
  const rock = (x: number, y: number, hp = 1e6, radius = 20) => {
    const e: EnemyEntity = { id: enemies.length + 1, x, y, radius, hp, maxHp: hp, armor: 0, shield: 0, maxShield: 0 };
    enemies.push(e);
    return e;
  };
  const launch = (mods: Modifier[], x: number, y: number, vx: number, vy: number, damage = 100) => {
    sys.modifiersTable = [mods];
    sys.shipX = x; sys.shipY = y;
    const i = pool.spawn(x, y, vx, vy, damage, 0, 0);
    sys.init(i);
    return i;
  };
  const move = () => { for (let i = 0; i < pool.max; i++) if (pool.active[i]) { pool.x[i] += pool.vx[i] * DT; pool.y[i] += pool.vy[i] * DT; pool.age[i] += 0; } };
  const step = (n = 1) => { for (let k = 0; k < n; k++) { sys.steer(DT, enemies); move(); hash.clear(); for (const e of enemies) hash.insert(e.id, e.x, e.y); sys.processHits(enemies, hash, 1); } };
  return { pool, sys, enemies, rock, launch, step };
}

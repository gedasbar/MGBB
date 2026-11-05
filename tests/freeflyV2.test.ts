import { describe, it, expect } from 'vitest';
import { World } from '../src/game/world';
import { PointerState } from '../src/input';
import { SPECIES, ROSTER } from '../src/data/species';
import { ENEMY_BULLET_CAP, ENEMY_BULLET_DAMAGE, ENEMY_BULLET_INVULN, ENEMY_BULLET_SPEED } from '../src/data/enemyBullets';
import { EnemyBullets } from '../src/engine/enemyBullets';
import { applyDamage, damageToKill } from '../src/engine/damage';
import { burstVelocities, gunStep, newGunState, nearestWithin } from '../src/game/support';
import { planWave } from '../src/game/waves';
import { planEncounter } from '../src/frontier/encounter';
import { SPAWN_INVULN_SECONDS } from '../src/engine/control';
import { ARMORED_ARMOR, SHIELD_WALL_ESCORTS, SHIELD_WALL_SPREAD, themeAt, themeCores, themeEligible, THEMES } from '../src/data/waveThemes';
import { coresForWave } from '../src/shipyard/cores';
import { specialKind } from '../src/data/waves';

const DT = 1 / 60;
const idle = (): PointerState => ({ x: 0, y: 0, active: false, type: 'mouse', seen: false });
const run = (w: World, seconds: number) => { for (let i = 0; i < Math.round(seconds / DT); i++) w.update(DT, idle()); };
/** A world with no director and the ship parked at its start spot. */
const quiet = (opts: ConstructorParameters<typeof World>[0] = {}) => new World({ autoSpawn: false, ...opts });
/** Puts a still bullet on the ship. */
const bulletOnShip = (w: World) => w.enemyBullets.spawn(w.shipX, w.shipY, 0, 0);
const gunner = SPECIES.gunner.gun!;

describe('enemy bullets: the pool', () => {
  it('moves at its own velocity, leaves the screen and frees the slot', () => {
    const b = new EnemyBullets(8);
    b.spawn(100, 100, 0, ENEMY_BULLET_SPEED);
    b.update(1);
    expect(b.y[0]).toBeCloseTo(100 + ENEMY_BULLET_SPEED, 3);
    expect(b.count).toBe(1);
    b.update(5); // 100 + 6 x 230 = 1480 > 960 + margin
    expect(b.count).toBe(0);
    expect(b.active[0]).toBe(0);
  });
  it('is capped: a shot into a full pool is refused and counted', () => {
    const b = new EnemyBullets();
    for (let i = 0; i < ENEMY_BULLET_CAP; i++) expect(b.spawn(10, 10, 0, 0)).toBe(true);
    expect(b.spawn(10, 10, 0, 0)).toBe(false);
    expect(b.count).toBe(ENEMY_BULLET_CAP);
    expect(b.refused).toBe(1);
  });
  it('is slower than a player shot and does one hit well short of the hull', () => {
    expect(ENEMY_BULLET_SPEED).toBeLessThan(600 / 2);
    expect(ENEMY_BULLET_DAMAGE).toBeLessThan(100 / 5);
  });
});

describe('enemy bullets in the world', () => {
  it('a hit takes hull, uses the bullet up and starts the short invulnerability (never one-hit)', () => {
    const w = quiet();
    bulletOnShip(w);
    w.update(DT, idle());
    expect(w.hull).toBe(w.maxHull - ENEMY_BULLET_DAMAGE);
    expect(w.hull).toBeGreaterThan(0);
    expect(w.enemyBullets.count).toBe(0);
    expect(w.invuln).toBeGreaterThan(ENEMY_BULLET_INVULN - 2 * DT);
    expect(w.bulletHits).toBe(1);
  });
  it('while invulnerable a bullet flies through (no damage, not used up); after the window it hurts again', () => {
    const w = quiet();
    bulletOnShip(w);
    w.update(DT, idle());
    const hullAfterFirst = w.hull;
    bulletOnShip(w);
    w.update(DT, idle());
    expect(w.hull).toBe(hullAfterFirst);
    expect(w.enemyBullets.count).toBe(1);
    w.enemyBullets.clear();
    run(w, ENEMY_BULLET_INVULN + 0.1);
    expect(w.invuln).toBeLessThanOrEqual(0);
    w.enemyBullets.clear();
    bulletOnShip(w);
    w.update(DT, idle());
    expect(w.hull).toBe(hullAfterFirst - ENEMY_BULLET_DAMAGE);
  });
  it('the spawn invulnerability (1.5 s from the first frame) covers bullets, touched or not', () => {
    const w = quiet({ safeStart: true });
    expect(w.invuln).toBeCloseTo(SPAWN_INVULN_SECONDS, 5);
    bulletOnShip(w);
    w.update(DT, idle());
    expect(w.hull).toBe(w.maxHull);
    expect(w.enemyBullets.count).toBe(1);
  });
  it('the god cheat and a Second Chance charge stop the damage too', () => {
    const w = quiet();
    w.god = true;
    bulletOnShip(w);
    w.update(DT, idle());
    expect(w.hull).toBe(w.maxHull);
    const s = quiet();
    (s as unknown as { secondChancesLeft: number }).secondChancesLeft = 1;
    bulletOnShip(s);
    s.update(DT, idle());
    expect(s.hull).toBe(s.maxHull);
    expect(s.secondChancesLeft).toBe(0);
  });
  it('enough hits end the run', () => {
    const w = quiet();
    for (let i = 0; i < 20 && !w.gameOver; i++) { w.invuln = 0; bulletOnShip(w); w.update(DT, idle()); }
    expect(w.gameOver).toBe(true);
    expect(w.hull).toBe(0);
  });
  it('a bullet outlives its shooter, and player shots cannot touch it', () => {
    const w = quiet();
    const g = w.spawnSpecies('gunner', 270, 300, { hp: 1e9 })!;
    w.enemyBullets.spawn(g.x, 400, 0, 0); // a stationary bullet in the lane above the ship
    w.enemyBullets.spawn(g.x, 420, 0, 0);
    // The Gunner dies (and its rock children with it): the bullets stay.
    g.hp = 0;
    w.update(DT, idle());
    expect(w.mitosis.enemies.some(e => e.id === g.id)).toBe(false);
    expect(w.enemyBullets.count).toBe(2);
    // The player's gun fires straight up through the bullets for 2 s: a bullet is not a target.
    w.shipX = 270;
    w.clearEnemies();
    run(w, 2);
    expect(w.projSys.runStats.bestShot).toBe(0); // nothing was hit by anything
    expect(w.enemyBullets.count).toBe(2);
    expect(w.pool.count).toBeGreaterThanOrEqual(0);
  });
  it('a shot of the player that passes a bullet is not used up by it', () => {
    const w = quiet();
    w.shipX = 270;
    w.enemyBullets.spawn(270, 600, 0, 0);
    w.fire();
    const before = w.pool.count;
    expect(before).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) w.update(DT, idle()); // 0.67 s: 400 px of flight, past y 600
    expect(w.enemyBullets.count).toBe(1);
    expect(w.pool.count).toBeGreaterThan(0);
  });
  it('reset() clears them', () => {
    const w = quiet();
    w.enemyBullets.spawn(10, 10, 0, 0);
    w.reset();
    expect(w.enemyBullets.count).toBe(0);
  });
});

describe('Gunner', () => {
  it('walks, stops and fires once per stop: the clock only runs while it can shoot', () => {
    const st = newGunState(gunner);
    const log: { moving: boolean; fire: boolean }[] = [];
    // Not on screen: the walk clock holds, so it never stops.
    for (let i = 0; i < 600; i++) log.push(gunStep(st, gunner, DT, false));
    expect(log.every(l => l.moving && !l.fire)).toBe(true);
    // On screen: first stop after firstWalk s, one burst aimAt s into it, walks on after `stop`.
    let t = 0, firedAt = -1, stoppedAt = -1, movingAgain = -1, fires = 0;
    for (let i = 0; i < 6 * 60; i++) {
      const r = gunStep(st, gunner, DT, true);
      t += DT;
      if (!r.moving && stoppedAt < 0) stoppedAt = t;
      if (r.fire) { fires++; if (firedAt < 0) firedAt = t; }
      if (stoppedAt > 0 && r.moving && movingAgain < 0) movingAgain = t;
    }
    expect(stoppedAt).toBeCloseTo(gunner.firstWalk, 1);
    expect(firedAt - stoppedAt).toBeCloseTo(gunner.aimAt, 1);
    expect(movingAgain - stoppedAt).toBeCloseTo(gunner.stop, 1);
    expect(fires).toBeGreaterThanOrEqual(2); // 6 s holds at least two cycles
  });
  it('a burst is 3 bullets in a fan centred on the line to the ship', () => {
    const v = burstVelocities(100, 100, 400, 700, ENEMY_BULLET_SPEED, 3, 10);
    expect(v.length).toBe(3);
    const ang = v.map(b => Math.atan2(b.vy, b.vx));
    const aim = Math.atan2(600, 300);
    expect(ang[1]).toBeCloseTo(aim, 6);
    expect(ang[0]).toBeCloseTo(aim - (10 * Math.PI) / 180, 6);
    expect(ang[2]).toBeCloseTo(aim + (10 * Math.PI) / 180, 6);
    for (const b of v) expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(ENEMY_BULLET_SPEED, 6);
  });
  it('in the world: it stops, then fires 3 bullets at where the ship is, and its bullets outlive it', () => {
    const w = quiet();
    w.teleportShip(450, 880);
    const g = w.spawnSpecies('gunner', 120, 200, { hp: 1e9 })!;
    let stopped = false, stoppedY = 0;
    for (let i = 0; i < 6 * 60 && w.enemyBullets.count < 3; i++) {
      w.update(DT, idle());
      if (g.vy === 0 && !stopped) { stopped = true; stoppedY = g.y; }
    }
    expect(stopped).toBe(true);
    expect(w.enemyBullets.count).toBe(3);
    const mid = [0, 1, 2].map(i => ({ vx: w.enemyBullets.vx[i], vy: w.enemyBullets.vy[i] }));
    const ang = mid.map(b => Math.atan2(b.vy, b.vx)).sort((a, b) => a - b)[1];
    const aim = Math.atan2(w.shipY - (g.y + g.radius * 0.5), w.shipX - g.x);
    expect(Math.abs(ang - aim)).toBeLessThan(0.02); // fired at the ship (it moved a little since)
    expect(g.y).toBeGreaterThanOrEqual(stoppedY);
    g.hp = 0;
    const n = w.enemyBullets.count;
    w.update(DT, idle());
    expect(w.mitosis.enemies.some(e => e.id === g.id)).toBe(false);
    expect(w.enemyBullets.count).toBe(n);
  });
  it('does not fire from above the screen or from below the ship', () => {
    const w = quiet();
    const g = w.spawnSpecies('gunner', 270, w.shipY + 100, { hp: 1e9 })!;
    run(w, 6);
    expect(g.y).toBeGreaterThan(w.shipY); // it simply walked on down
    expect(w.enemyBullets.count).toBe(0);
  });
});

describe('Shielder', () => {
  const rock = () => ({ hp: 100, maxHp: 100, armor: 0, shield: 0, maxShield: 0 });
  it('a linked body takes 25 % of every hit (and needs 4x the hit to die)', () => {
    const a = rock(), b = { ...rock(), dmgTakenMul: SPECIES.shielder.shield!.damageMul };
    applyDamage(a, 40, 0, 1);
    applyDamage(b, 40, 0, 1);
    expect(a.hp).toBe(60);
    expect(b.hp).toBe(90);
    expect(damageToKill({ ...rock(), dmgTakenMul: 0.25 }, 0, 1)).toBeCloseTo(400, 6);
    expect(damageToKill(rock(), 0, 1)).toBeCloseTo(100, 6);
  });
  it('links the nearest bodies in range, not itself and not another Shielder; the link is listed for the screen', () => {
    const w = quiet();
    const s = w.spawnSpecies('shielder', 270, 300, { hp: 1000 })!;
    const s2 = w.spawnSpecies('shielder', 330, 300, { hp: 1000 })!;
    const near = w.spawnSpecies('mitotic_rock', 270, 380, { hp: 1000 })!;
    const far = w.spawnSpecies('mitotic_rock', 270, 300 + SPECIES.shielder.shield!.range + 60, { hp: 1000 })!;
    w.update(DT, idle());
    expect(near.dmgTakenMul).toBe(0.25);
    expect(far.dmgTakenMul).toBeUndefined();
    expect(s.dmgTakenMul).toBeUndefined();
    expect(s2.dmgTakenMul).toBeUndefined();
    // Each Shielder links the body (two links, one rock); the damage does not stack.
    expect(w.links.filter(l => l.kind === 'shield').map(l => l.id)).toEqual([near.id, near.id]);
  });
  it('shots really do less to a linked rock, and full damage returns the moment the Shielder is dead', () => {
    const w = quiet();
    w.teleportShip(270, 800);
    const s = w.spawnSpecies('shielder', 200, 500, { hp: 1e9 })!;
    const t = w.spawnSpecies('mitotic_rock', 270, 520, { hp: 1e6 })!;
    w.update(DT, idle());
    expect(t.dmgTakenMul).toBe(0.25);
    const burnHit = (e: typeof t) => { const before = e.hp; applyDamage(e, 100, 0, 1); return before - e.hp; };
    expect(burnHit(t)).toBeCloseTo(25, 6);
    s.hp = 0;
    w.update(DT, idle());
    expect(w.mitosis.enemies.some(e => e.id === s.id)).toBe(false);
    expect(t.dmgTakenMul).toBeUndefined();
    expect(burnHit(t)).toBeCloseTo(100, 6);
    expect(w.links.length).toBe(0);
  });
  it('at most maxLinks bodies are linked, the nearest ones', () => {
    const w = quiet();
    w.spawnSpecies('shielder', 270, 300, { hp: 1e6 });
    const rocks = Array.from({ length: 9 }, (_, i) => w.spawnSpecies('mitotic_rock', 100 + i * 40, 330 + (i % 2) * 10, { hp: 1e6 })!);
    w.update(DT, idle());
    expect(w.links.length).toBe(SPECIES.shielder.shield!.maxLinks);
    expect(rocks.filter(r => r.dmgTakenMul !== undefined).length).toBe(SPECIES.shielder.shield!.maxLinks);
  });
});

describe('Leech', () => {
  it('heals the nearby body a share of its max HP a second, never above max, and not another Leech or itself', () => {
    const w = quiet();
    w.teleportShip(40, 900); // the Dart fires straight up its own lane, away from the patients
    const l = w.spawnSpecies('leech', 270, 300, { hp: 1000 })!;
    const l2 = w.spawnSpecies('leech', 300, 300, { hp: 1000 })!;
    const t = w.spawnSpecies('mitotic_rock', 270, 360, { hp: 1000 })!;
    t.hp = 500; l2.hp = 500; l.hp = 500;
    const far = w.spawnSpecies('mitotic_rock', 270, 300 + SPECIES.leech.heal!.range + 80, { hp: 1000 })!;
    far.hp = 500;
    run(w, 1);
    expect(t.hp).toBeGreaterThan(500 + 1000 * SPECIES.leech.heal!.perSec * 0.9);
    expect(t.hp).toBeLessThan(500 + 1000 * SPECIES.leech.heal!.perSec * 1.2);
    expect(l.hp).toBe(500);
    expect(l2.hp).toBe(500);
    expect(far.hp).toBe(500);
    expect(w.links.some(k => k.kind === 'leech' && k.id === t.id)).toBe(true);
    run(w, 30);
    expect(t.hp).toBe(t.maxHp);
  });
  it('two Leeches do not heal one body twice', () => {
    const w = quiet();
    w.teleportShip(40, 900);
    w.spawnSpecies('leech', 250, 300, { hp: 100 });
    w.spawnSpecies('leech', 290, 300, { hp: 100 });
    const t = w.spawnSpecies('mitotic_rock', 270, 340, { hp: 1000 })!;
    t.hp = 500;
    run(w, 1);
    expect(t.hp).toBeGreaterThan(540);
    expect(t.hp).toBeLessThan(560);
  });
  it('is fragile', () => {
    expect(SPECIES.leech.hpMul).toBeLessThan(SPECIES.mitotic_rock.hpMul / 2);
  });
  it('nearestWithin picks nearest first and ignores the dead', () => {
    const list = [{ id: 1, x: 50, y: 0, hp: 5 }, { id: 2, x: 10, y: 0, hp: 5 }, { id: 3, x: 5, y: 0, hp: 0 }, { id: 4, x: 500, y: 0, hp: 5 }];
    expect(nearestWithin(0, 0, list, 100, 5, () => true).map(e => e.id)).toEqual([2, 1]);
    expect(nearestWithin(0, 0, list, 100, 1, () => true).map(e => e.id)).toEqual([2]);
  });
});

describe('roster', () => {
  it('the new enemies start at waves 8 / 12 / 15 and are Free Fly only (Frontier squares do not send them)', () => {
    expect([SPECIES.gunner.firstWave, SPECIES.shielder.firstWave, SPECIES.leech.firstWave]).toEqual([8, 12, 15]);
    for (const id of ['gunner', 'shielder', 'leech']) expect(ROSTER.some(s => s.id === id)).toBe(true);
    for (let wave = 8; wave <= 40; wave += 4) {
      const plan = planEncounter({ seed: 3, wave, tier: 20, hpMul: 1, duration: 120, weights: {}, startMul: 1, trickleMul: 1 } as never);
      expect(plan.some(p => ['gunner', 'shielder', 'leech'].includes(p.defId))).toBe(false);
    }
  });
  it('a Gunner wave 8 contains the newcomer, first', () => {
    const p = planWave(5, 8);
    expect(p.some(s => s.defId === 'gunner')).toBe(true);
  });
});

describe('wave themes', () => {
  it('the schedule: 9, 12, 18, 21, 24, 27 ...; never a Swarm / Mother / boss wave; none before wave 9', () => {
    const waves = Array.from({ length: 60 }, (_, i) => i + 1).filter(themeEligible);
    expect(waves.slice(0, 8)).toEqual([9, 12, 18, 21, 24, 27, 33, 36]);
    for (let w = 1; w <= 8; w++) expect(themeAt(w)).toBeNull();
    for (const w of [10, 15, 20, 30, 40, 45, 50, 60]) { expect(specialKind(w)).not.toBeNull(); expect(themeAt(w)).toBeNull(); }
    expect(waves.slice(0, 6).map(w => themeAt(w)!.id)).toEqual(['armored', 'swarm', 'gunners', 'shield_wall', 'leeches', 'armored']);
    expect(waves.slice(5, 10).map(w => themeAt(w)!.id)).toEqual(['armored', 'swarm', 'gunners', 'shield_wall', 'leeches']);
    expect(THEMES.length).toBe(5);
  });
  it('a theme wave pays Cores on top; a plain wave nothing', () => {
    expect(themeCores(9)).toBe(Math.max(1, Math.round(coresForWave(9) * 0.5)));
    expect(themeCores(9)).toBeGreaterThan(0);
    expect(themeCores(8)).toBe(0);
    expect(themeCores(10)).toBe(0);
    const w = new World({ seed: 4, startWave: 9 });
    w.god = true;
    w.update(DT, idle());
    const ev = w.waveEvents[0];
    expect(ev.theme).toBe('armored');
    expect(ev.cores).toBe(themeCores(9));
    expect(w.cores).toBeGreaterThanOrEqual(themeCores(9));
    const plain = new World({ seed: 4, startWave: 8 });
    plain.update(DT, idle());
    expect(plain.waveEvents[0].theme).toBeNull();
    expect(plain.waveEvents[0].cores).toBe(0);
  });
  it('ARMORED: most bodies are born armored; the same wave without the theme has none', () => {
    const p = planWave(7, 9);
    const armored = p.filter(s => s.armor === ARMORED_ARMOR).length;
    expect(armored / p.length).toBeGreaterThan(0.5);
    expect(planWave(7, 8).some(s => s.armor !== undefined)).toBe(false);
    const w = quiet();
    const e = w.spawnSpecies('mitotic_rock', 100, 100, { hp: 50, armor: ARMORED_ARMOR })!;
    expect(e.armor).toBe(ARMORED_ARMOR);
  });
  it('SWARM: only Darters and pebbles besides the newcomer, many of them', () => {
    const p = planWave(7, 12);
    const small = p.filter(s => s.defId === 'darter' || (s.defId === 'mitotic_rock' && s.generation === 3));
    expect(p.length - small.length).toBeLessThanOrEqual(1); // the Shielder, newcomer of wave 12
    expect(small.length).toBeGreaterThan(20);
  });
  it('GUNNERS: most of the wave is Gunners', () => {
    const p = planWave(7, 18);
    const pts = (list: typeof p) => list.reduce((n, s) => n + (SPECIES[s.defId]?.cost || 1), 0);
    expect(pts(p.filter(s => s.defId === 'gunner')) / pts(p)).toBeGreaterThan(0.5);
  });
  it('SHIELD WALL: every Shielder comes with escorts born within a few px of it, at its time', () => {
    const p = planWave(7, 21);
    const shields = p.filter(s => s.defId === 'shielder');
    expect(shields.length).toBeGreaterThanOrEqual(2);
    for (const s of shields) {
      const escorts = p.filter(e => e !== s && Math.abs(e.at - s.at - 0.15) < 1e-9 && Math.abs(e.x - s.x) <= SHIELD_WALL_SPREAD + 1e-9);
      expect(escorts.length).toBeGreaterThanOrEqual(1);
      expect(escorts.length).toBeLessThanOrEqual(SHIELD_WALL_ESCORTS + 3);
    }
  });
  it('LEECHES: a good share of the wave is Leeches', () => {
    const p = planWave(7, 24);
    expect(p.filter(s => s.defId === 'leech').length).toBeGreaterThanOrEqual(3);
  });
  it('plans are deterministic', () => {
    expect(JSON.stringify(planWave(9, 21))).toBe(JSON.stringify(planWave(9, 21)));
  });
});

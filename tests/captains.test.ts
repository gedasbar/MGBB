import { describe, it, expect } from 'vitest';
import {
  HERO_LEVEL_BASE_DAMAGE, CAPTAINS, CAPTAIN_BY_ID, FLY_MEDAL_MILESTONES, HERO_LEVEL_COSTS, HERO_MAX_LEVEL, OPTION_BY_ID, TIER_COSTS, TIER_KILLS, describeOption,
} from '../src/captains/data';
import { computeRunModifiers, modifiersFor, neutralModifiers } from '../src/captains/modifiers';
import {
  activateOption, buyOption, claimFlyMilestone, defaultCaptains, isTierUnlocked, KillBanker, optionState, rollMedals, sanitizeCaptains,
  selectCaptain, unlockCaptain, upgradeHero, CaptainHolder,
} from '../src/captains/state';
import { defaultProgress, loadProgress, ProgressStore, PROGRESS_VERSION, serializeProgress, applyWallRun } from '../src/econ/progress';
import { addCaptainKillsCheat, setHeroLevel, unlockAllCaptains } from '../src/debug/cheats';
import { compile } from '../src/engine/compiler';
import { buildDartStarterGrid } from '../src/game/starter';
import { World } from '../src/game/world';
import { WallWorld } from '../src/wall/wallWorld';
import { CELL, WORLD_WIDTH } from '../src/wall/constants';
import { BlockDef, LevelDef } from '../src/wall/level';
import { CONFIG } from '../src/config';
import { PointerState } from '../src/input';
import { WAVE_TIME } from '../src/data/waves';

const holder = (medals = 100): CaptainHolder => ({ medals, captains: defaultCaptains() });
const seq = (...v: number[]) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };
const mod = (...ids: string[]) => computeRunModifiers(0, ids);

describe('captain data', () => {
  it('has 4 captains, 4 tiers of 2 options each, unique ids, effects on every option', () => {
    expect(CAPTAINS.map(c => c.id)).toEqual(['cadet', 'bulwark', 'gunner', 'pathfinder']);
    const ids = new Set<string>();
    for (const c of CAPTAINS) {
      expect(c.tiers.length).toBe(4);
      c.tiers.forEach((pair, t) => {
        expect(pair.length).toBe(2);
        for (const opt of pair) {
          expect(opt.tier).toBe(t + 1);
          expect(opt.effects.length).toBeGreaterThan(0);
          expect(describeOption(opt).length).toBeGreaterThan(5);
          expect(ids.has(opt.id)).toBe(false);
          ids.add(opt.id);
        }
      });
    }
    expect(TIER_KILLS).toEqual([0, 300, 1500, 6000]);
    expect(HERO_LEVEL_COSTS.length).toBe(HERO_MAX_LEVEL);
    expect(CAPTAIN_BY_ID.cadet.unlockCost).toBe(0);
  });
});

describe('run modifiers math', () => {
  it('no options and level 0 is exactly neutral', () => {
    expect(computeRunModifiers(0, [])).toEqual(neutralModifiers());
    expect(modifiersFor('cadet', defaultCaptains().heroes.cadet)).toEqual(neutralModifiers());
  });
  it('the hero level adds HERO_LEVEL_BASE_DAMAGE (0.5) base damage per level, nothing else', () => {
    expect(HERO_LEVEL_BASE_DAMAGE).toBe(0.5);
    expect(computeRunModifiers(7, []).baseDamage).toBe(3.5);
    expect({ ...computeRunModifiers(7, []), baseDamage: 0 }).toEqual(neutralModifiers());
  });
  it('each effect type lands in its own field with the data value', () => {
    expect(mod('cad_prospector').creditMul).toBeCloseTo(1.05);
    expect(mod('cad_lucky').medalDouble).toBeCloseTo(0.10);
    expect(mod('cad_dividend').waveBonusMul).toBeCloseTo(1.5);
    expect(mod('cad_toll').passCredits).toBeCloseTo(0.15);
    expect(mod('bul_second').secondChances).toBe(1);
    expect(mod('bul_steady').spawnInvuln).toBe(1);
    expect(mod('bul_plating').hullMul).toBeCloseTo(1.3);
    expect(mod('bul_salvage').killHeal).toBe(0.5);
    expect(mod('gun_barrel').damageMul).toBeCloseTo(1.08);
    expect(mod('gun_trigger').fireRateMul).toBeCloseTo(1.08);
    expect(mod('gun_breaker').vsArmor).toBeCloseTo(0.3);
    expect(mod('gun_cracker').vsShield).toBeCloseTo(0.3);
    expect(mod('gun_hunter').vsFragment).toBeCloseTo(0.3);
    expect(mod('pth_slip').boostZone).toBeCloseTo(1.3);
    expect(mod('pth_reach').projSpeedMul).toBeCloseTo(1.2);
    expect(mod('pth_breaker').wallDamageMul).toBeCloseTo(1.12);
    expect(mod('pth_quarry').wallCreditMul).toBeCloseTo(1.2);
    const aegis = mod('bul_aegis');
    expect([aegis.secondChances, aegis.hullMul]).toEqual([1, 1.25]);
  });
  it('values of one type add across tiers; Medal double is capped at 100%; unknown ids are ignored', () => {
    expect(mod('cad_prospector', 'cad_broker', 'cad_tycoon').creditMul).toBeCloseTo(1.35);
    expect(mod('bul_second', 'bul_wind', 'bul_aegis').secondChances).toBe(3);
    expect(mod('cad_lucky', 'cad_fortune', 'cad_mint').medalDouble).toBeCloseTo(0.75);
    expect(computeRunModifiers(0, ['cad_mint', 'cad_mint', 'cad_mint', 'cad_mint']).medalDouble).toBe(1);
    expect(mod('nope')).toEqual(neutralModifiers());
  });
  it('a captain only gets its own options', () => {
    const hero = { level: 2, active: { '1': 'gun_barrel' } };
    expect(modifiersFor('cadet', hero).damageMul).toBe(1);
    expect(modifiersFor('gunner', hero).damageMul).toBeCloseTo(1.08);
    expect(modifiersFor('gunner', hero).baseDamage).toBe(2 * HERO_LEVEL_BASE_DAMAGE);
  });
});

describe('tiers, buying and switching', () => {
  it('tier unlocks at exactly 0 / 300 / 1500 / 6000 kills', () => {
    const hero = defaultCaptains().heroes.cadet;
    const open = () => [1, 2, 3, 4].map(t => isTierUnlocked(hero, t));
    expect(open()).toEqual([true, false, false, false]);
    hero.kills = 299; expect(open()).toEqual([true, false, false, false]);
    hero.kills = 300; expect(open()).toEqual([true, true, false, false]);
    hero.kills = 1500; expect(open()).toEqual([true, true, true, false]);
    hero.kills = 6000; expect(open()).toEqual([true, true, true, true]);
  });
  it('an option costs its tier price, needs its tier open, cannot be bought twice, and a locked tier does not charge', () => {
    const p = holder(50);
    expect(buyOption(p, 'cad_prospector')).toEqual({ ok: true, cost: TIER_COSTS[0] });
    expect(p.medals).toBe(50 - TIER_COSTS[0]);
    const again = buyOption(p, 'cad_prospector');
    expect(again.ok).toBe(false);
    expect(p.medals).toBe(50 - TIER_COSTS[0]);
    const locked = buyOption(p, 'cad_dividend');
    expect(locked).toEqual({ ok: false, error: 'Needs 300 kills (have 0)' });
    expect(p.medals).toBe(50 - TIER_COSTS[0]);
    p.captains.heroes.cadet.kills = 300;
    expect(buyOption(p, 'cad_dividend').ok).toBe(true);
    expect(p.medals).toBe(50 - TIER_COSTS[0] - TIER_COSTS[1]);
  });
  it('not enough Medals: refused and nothing changes', () => {
    const p = holder(1);
    expect(buyOption(p, 'cad_prospector')).toEqual({ ok: false, error: 'Not enough Medals' });
    expect(p.medals).toBe(1);
    expect(p.captains.heroes.cadet.owned).toEqual([]);
  });
  it('one active option per tier: buying the other one switches it, switching among owned options is free, an unowned one is refused', () => {
    const p = holder(50);
    buyOption(p, 'cad_prospector');
    expect(p.captains.heroes.cadet.active['1']).toBe('cad_prospector');
    expect(activateOption(p, 'cad_lucky')).toEqual({ ok: false, error: 'Buy it first' });
    buyOption(p, 'cad_lucky');
    expect(p.captains.heroes.cadet.active['1']).toBe('cad_lucky');
    const before = p.medals;
    expect(activateOption(p, 'cad_prospector')).toEqual({ ok: true, cost: 0 });
    expect(p.medals).toBe(before);
    const hero = p.captains.heroes.cadet;
    expect(hero.active['1']).toBe('cad_prospector');
    expect(Object.keys(hero.active)).toEqual(['1']);
    expect(hero.owned.sort()).toEqual(['cad_lucky', 'cad_prospector']);
    expect(optionState(hero, OPTION_BY_ID.cad_prospector)).toBe('active');
    expect(optionState(hero, OPTION_BY_ID.cad_lucky)).toBe('owned');
    expect(optionState(hero, OPTION_BY_ID.cad_dividend)).toBe('locked');
  });
  it('a locked captain can be previewed but not used: no level, no options, no select; unlocking costs Medals once', () => {
    const p = holder(30);
    expect(upgradeHero(p, 'bulwark').ok).toBe(false);
    expect(buyOption(p, 'bul_second').ok).toBe(false);
    expect(selectCaptain(p, 'bulwark').ok).toBe(false);
    expect(unlockCaptain(p, 'bulwark')).toEqual({ ok: true, cost: 10 });
    expect(p.medals).toBe(20);
    expect(unlockCaptain(p, 'bulwark').ok).toBe(false);
    expect(selectCaptain(p, 'bulwark').ok).toBe(true);
    expect(p.captains.selected).toBe('bulwark');
    expect(unlockCaptain(p, 'pathfinder')).toEqual({ ok: false, error: 'Not enough Medals' });
  });
  it('hero level: cost rises, +1 each, stops at 10', () => {
    const p = holder(1000);
    let spent = 0;
    for (let i = 0; i < HERO_MAX_LEVEL; i++) {
      const r = upgradeHero(p, 'cadet');
      expect(r).toEqual({ ok: true, cost: HERO_LEVEL_COSTS[i] });
      spent += HERO_LEVEL_COSTS[i];
    }
    expect(p.captains.heroes.cadet.level).toBe(10);
    expect(p.medals).toBe(1000 - spent);
    expect(upgradeHero(p, 'cadet')).toEqual({ ok: false, error: 'Already at max level' });
  });
});

describe('Medals and the injected RNG', () => {
  it('a doubling chance doubles exactly when the roll is below it; no chance never rolls', () => {
    expect(rollMedals(2, 0.25, seq(0.24))).toEqual({ medals: 4, doubled: true });
    expect(rollMedals(2, 0.25, seq(0.25))).toEqual({ medals: 2, doubled: false });
    let rolled = 0;
    expect(rollMedals(1, 0, () => { rolled++; return 0; })).toEqual({ medals: 1, doubled: false });
    expect(rolled).toBe(0);
  });
  it('a seeded sequence gives a reproducible set of doubled awards', () => {
    const rolls = seq(0.05, 0.9, 0.2, 0.31, 0.0);
    const out = Array.from({ length: 5 }, () => rollMedals(1, 0.3, rolls).doubled);
    expect(out).toEqual([true, false, true, false, true]);
  });
  it('a wall first clear pays 1 Medal, 2 when doubled, and never again for the same tier', () => {
    const p = defaultProgress();
    const run = { tier: 1, destroyed: 5, total: 5, time: 10, credits: 1, kills: 5 };
    const a = applyWallRun(p, { ...run, medalDouble: 0.5, rand: seq(0.1) });
    expect([a.medal, a.medals, a.medalDoubled, p.medals]).toEqual([true, 2, true, 2]);
    const b = applyWallRun(p, { ...run, medalDouble: 1, rand: seq(0) });
    expect([b.medal, b.medals, p.medals]).toEqual([false, 0, 2]);
  });
  it('Free Fly milestones pay once per save, only on their waves, and can double', () => {
    const p = holder(0);
    expect(claimFlyMilestone(p, 4, 0, seq(0))).toBeNull();
    expect(claimFlyMilestone(p, 5, 0, seq(0))).toEqual({ medals: 1, doubled: false });
    expect(claimFlyMilestone(p, 5, 0, seq(0))).toBeNull();
    expect(claimFlyMilestone(p, 10, 0.5, seq(0.4))).toEqual({ medals: 4, doubled: true });
    expect(p.medals).toBe(5);
    expect(p.captains.milestones).toEqual([5, 10]);
    expect(FLY_MEDAL_MILESTONES.reduce((s, m) => s + m.medals, 0)).toBe(23);
  });
});

describe('save v6', () => {
  it('a v5 save loads with Cadet owned and selected, level 0, no kills, and the old Medal rule', () => {
    const v5 = { version: 5, credits: 40, clearedTiers: [1, 2, 3], passedTiers: [1, 2, 3], medals: 99, bestWave: 4 };
    const p = loadProgress(JSON.stringify(v5));
    expect(PROGRESS_VERSION).toBe(7);
    expect(p.version).toBe(7);
    expect(p.medals).toBe(3); // never more than cleared tiers for a pre-v6 save
    expect(p.captains.selected).toBe('cadet');
    expect(p.captains.owned).toEqual(['cadet']);
    expect(p.captains.heroes.cadet).toEqual({ level: 0, kills: 0, owned: [], active: {} });
    expect(p.captains.milestones).toEqual([]);
    expect(p.bestWave).toBe(4);
  });
  it('a v6 save round-trips, and a spent balance below the cleared count is kept (Medals are a balance now)', () => {
    const s = new ProgressStore(null, defaultProgress());
    s.data.clearedTiers = [1, 2, 3, 4]; s.data.medals = 4;
    s.unlockCaptain('bulwark'); // not enough: 4 < 10
    s.data.medals = 12;
    expect(s.unlockCaptain('bulwark').ok).toBe(true);
    expect(s.upgradeHero('bulwark').ok).toBe(true);
    s.claimFlyMilestone(5, 0, seq(0));
    s.addCaptainKills('bulwark', 7);
    const back = loadProgress(serializeProgress(s.data));
    expect(back.medals).toBe(12 - 10 - 1 + 1);
    expect(back.captains).toEqual(s.data.captains);
    expect(back.captains.heroes.bulwark).toMatchObject({ level: 1, kills: 7 });
    expect(back.captains.milestones).toEqual([5]);
  });
  it('garbage in captains is repaired: unknown ids dropped, active must be an owned option of its tier, level clamped', () => {
    const c = sanitizeCaptains({
      selected: 'nobody', owned: ['gunner', 'ghost', 5],
      heroes: { cadet: { level: 99, kills: -4, owned: ['cad_prospector', 'gun_barrel', 7], active: { '1': 'cad_lucky', '2': 'cad_prospector', '3': 'gun_barrel' } }, gunner: { level: 3, kills: 12.5, owned: ['gun_barrel'], active: { '1': 'gun_barrel' } } },
      milestones: [5, 5, 7, 'x', 50],
    });
    expect(c.selected).toBe('cadet');
    expect(c.owned).toEqual(['cadet', 'gunner']);
    expect(c.heroes.cadet).toEqual({ level: 0, kills: 0, owned: ['cad_prospector'], active: {} });
    expect(c.heroes.gunner).toEqual({ level: 3, kills: 0, owned: ['gun_barrel'], active: { '1': 'gun_barrel' } });
    expect(c.milestones).toEqual([5, 50]);
  });
});

describe('kill banking', () => {
  it('kills go to the captain that flew the run, in instalments, each counted once', () => {
    const s = new ProgressStore(null, defaultProgress());
    s.data.medals = 100;
    s.unlockCaptain('gunner');
    const b = new KillBanker(s, 'cadet');
    expect(b.flush(10)).toBe(10); // a pause
    expect(b.flush(10)).toBe(0);  // another pause, nothing new
    s.selectCaptain('gunner');    // the active captain changes while the old run is still being banked
    expect(b.flush(25)).toBe(15); // the end of the run
    expect(s.data.captains.heroes.cadet.kills).toBe(25);
    expect(s.data.captains.heroes.gunner.kills).toBe(0);
    expect(b.added).toBe(25);
    // the next run belongs to the gunner
    const g = new KillBanker(s, s.data.captains.selected);
    g.flush(4);
    expect(s.data.captains.heroes.gunner.kills).toBe(4);
    expect(s.data.captains.heroes.cadet.kills).toBe(25);
  });
  it('kill cheats go to the active captain; unlock all and set level work and are saved', () => {
    const s = new ProgressStore(null, defaultProgress());
    addCaptainKillsCheat(s, 300);
    setHeroLevel(s, 4);
    unlockAllCaptains(s);
    expect(s.data.captains.heroes.cadet).toMatchObject({ kills: 300, level: 4 });
    expect(s.data.captains.owned.length).toBe(4);
    expect(isTierUnlocked(s.data.captains.heroes.cadet, 2)).toBe(true);
  });
});

// ------------------------------------------------------------------ gameplay hooks
const DT = 1 / 60;
const plain: BlockDef = { hp: 100000, armor: 0, shield: 0 };
const armored: BlockDef = { hp: 100000, armor: 10, shield: 0 };
const shielded: BlockDef = { hp: 100000, armor: 0, shield: 50000 };
const mouse = (x: number, y: number): PointerState => ({ x, y, active: false, type: 'mouse', seen: true });

/** A one-block wall a shot from the Dart + Flat+ reaches at once: returns the damage of the first hit. */
function firstWallHit(block: BlockDef, mods = neutralModifiers(), tier = 1): number {
  const level: LevelDef = { tier, cols: 21, rows: 1, cells: Array.from({ length: 21 }, (_, i) => (i === 10 ? block : null)), approachSpeed: 0 };
  const w = new WallWorld(level, { grid: buildDartStarterGrid(), modifiers: mods });
  w.autoFire = false;
  w.setWallOffset(CELL * 6);
  w.shipX = 10 * CELL + CELL / 2;
  w.shipY = w.blockTop(0) + CELL * 4;
  w.fire();
  for (let i = 0; i < 60 && w.hits.length === 0; i++) w.update(DT, { x: w.shipX, y: w.shipY });
  return w.hits[0].damage;
}

describe('hooks: damage', () => {
  it('base damage: the generator starts at 1 + hero level, so Flat+ L1 gives 2 + level bonus', () => {
    const grid = buildDartStarterGrid();
    expect(compile(grid).recipes[0].packet.damage).toBe(2);
    expect(compile(grid, { baseDamage: 3 }).recipes[0].packet.damage).toBe(5);
    expect(compile(grid, { baseDamage: 3 }).stats.damagePerShot).toBe(5);
  });
  it('the hero level reaches the shot a wall block takes', () => {
    expect(firstWallHit(plain)).toBe(2);
    expect(firstWallHit(plain, computeRunModifiers(5, []))).toBe(2 + 5 * HERO_LEVEL_BASE_DAMAGE);
  });
  it('damage %, wall damage % and the vs-armor / vs-shield bonuses change the hit as the data says', () => {
    expect(firstWallHit(plain, mod('gun_barrel'))).toBeCloseTo(2 * 1.08, 5);
    expect(firstWallHit(plain, mod('pth_breaker'))).toBeCloseTo(2 * 1.12, 5);
    const arm = firstWallHit(armored);
    expect(firstWallHit(armored, mod('gun_breaker'))).toBeCloseTo(arm * 1.3, 5);
    expect(firstWallHit(plain, mod('gun_breaker'))).toBe(2); // no armor, no bonus
    const sh0 = firstWallHit(shielded);
    expect(firstWallHit(shielded, mod('gun_cracker'))).toBeCloseTo(sh0 * 1.3, 5);
  });
  it('fire rate and projectile speed reach the gun', () => {
    const w = new World({ grid: buildDartStarterGrid(), modifiers: mod('gun_overdrive') });
    expect(w.gun.speedMul).toBeCloseTo(1.2);
    const fast = new World({ grid: buildDartStarterGrid(), autoSpawn: false, modifiers: mod('gun_trigger') });
    const base = new World({ grid: buildDartStarterGrid(), autoSpawn: false });
    const p = mouse(270, 700);
    for (let i = 0; i < 60 * 20; i++) { fast.update(DT, p); base.update(DT, p); }
    expect(fast.gun.shots / base.gun.shots).toBeCloseTo(1.08, 1);
  });
});

describe('hooks: economy', () => {
  it('credit % pays more per wall block; wall credit % only in walls; neutral pays exactly as before', () => {
    const run = (mods = neutralModifiers()) => {
      const level: LevelDef = { tier: 3, cols: 21, rows: 1, cells: Array.from({ length: 21 }, () => ({ hp: 1, armor: 0, shield: 0 })), approachSpeed: 0 };
      const w = new WallWorld(level, { grid: buildDartStarterGrid(), modifiers: mods });
      w.destroyAll();
      return w.creditsExact;
    };
    const base = run();
    expect(run(mod('cad_prospector'))).toBeCloseTo(base * 1.05, 6);
    expect(run(mod('pth_quarry'))).toBeCloseTo(base * 1.2, 6);
    expect(run(mod('gun_barrel'))).toBe(base);
  });
  it('a Free Fly kill pays creditMul times the base; wave bonus uses waveBonusMul', () => {
    const kill = (mods = neutralModifiers()) => {
      const w = new World({ grid: buildDartStarterGrid(), autoSpawn: false, modifiers: mods });
      const r = w.spawnRock(270, 100, 1);
      r!.hp = 0;
      w.update(DT, mouse(270, 768));
      return w.creditsExact;
    };
    const base = kill();
    expect(base).toBeGreaterThan(0);
    expect(kill(mod('cad_prospector'))).toBeCloseTo(base * 1.05, 6);
    const bonus = (mods = neutralModifiers()) => {
      const w = new World({ grid: buildDartStarterGrid(), seed: 3, modifiers: mods, startWave: 5 });
      for (let i = 0; i < 5; i++) w.update(DT, mouse(270, 768));
      return w.bonusCredits;
    };
    expect(bonus()).toBeGreaterThan(0);
    expect(bonus(mod('cad_dividend'))).toBeCloseTo(bonus() * 1.5, 6);
    expect(WAVE_TIME).toBeGreaterThan(0);
  });
  it('a pass or clear pays passCredits x the credits earned in the run, once; a run that earned nothing gets nothing', () => {
    const make = (mods = neutralModifiers()) => {
      const level: LevelDef = { tier: 1, cols: 21, rows: 1, cells: Array.from({ length: 21 }, () => plain), approachSpeed: 0 };
      return new WallWorld(level, { grid: buildDartStarterGrid(), modifiers: mods });
    };
    const w = make(mod('cad_toll'));
    w.autoFire = false;
    for (let i = 0; i < 5; i++) w.destroyBlock(w.blocks[i]!);
    const earned = w.creditsExact;
    expect(earned).toBeGreaterThan(0);
    w.setWallOffset(2000); // the wall has scrolled by: the pass line is below the ship
    w.update(DT, { x: w.shipX, y: w.shipY });
    expect(w.state).toBe('passed');
    expect(w.fx.passBonus).toBeCloseTo(0.15 * earned, 6);
    expect(w.creditsExact).toBeCloseTo(1.15 * earned, 6);
    const n = make();
    n.autoFire = false;
    n.setWallOffset(2000);
    n.update(DT, { x: n.shipX, y: n.shipY });
    expect(n.state).toBe('passed');
    expect(n.creditsExact).toBe(0);
  });
});

describe('hooks: survival', () => {
  it('Free Fly Second Chance: the first contact deals no damage and gives 1 s, the second hurts; neutral hurts at once', () => {
    const touch = (mods = neutralModifiers()) => {
      const w = new World({ grid: buildDartStarterGrid(), autoSpawn: false, modifiers: mods });
      w.spawnRock(w.shipX, w.shipY, 1e9);
      const p = mouse(w.shipX, w.shipY);
      w.update(DT, p);
      return w;
    };
    const plainRun = touch();
    expect(plainRun.hull).toBe(90);
    const sc = touch(mod('bul_second'));
    expect(sc.hull).toBe(100);
    expect(sc.fx.secondChance).toBe(1);
    expect(sc.secondChancesLeft).toBe(0);
    expect(sc.invuln).toBeGreaterThan(0.9);
    const at = { x: sc.shipX, y: sc.shipY };
    for (let i = 0; i < 70; i++) sc.update(DT, mouse(at.x, at.y));
    expect(sc.hull).toBe(100);
    sc.spawnRock(at.x, at.y, 1e9);
    sc.update(DT, mouse(at.x, at.y));
    expect(sc.hull).toBe(90); // spent: the next contact is a normal hit
  });
  it('wall Second Chance: the touched block is destroyed, the run goes on, then the next touch crashes', () => {
    const level: LevelDef = { tier: 1, cols: 21, rows: 3, cells: Array.from({ length: 63 }, () => plain), approachSpeed: 0 };
    const w = new WallWorld(level, { grid: buildDartStarterGrid(), modifiers: mod('bul_second') });
    w.autoFire = false;
    w.setWallOffset(3 * CELL);
    w.shipX = 10 * CELL + CELL / 2;
    w.shipY = 1.5 * CELL;
    w.update(DT, { x: w.shipX, y: w.shipY });
    expect(w.state).toBe('playing');
    expect(w.destroyed).toBeGreaterThan(0);
    expect(w.fx.secondChance).toBe(1);
    expect(w.invuln).toBeGreaterThan(0.9);
    expect(w.blockAt(w.shipX, w.shipY)).toBeNull();
    // move into another block after the invulnerability: crash
    w.shipY = 0.5 * CELL;
    for (let i = 0; i < 70; i++) w.update(DT, { x: w.shipX, y: w.shipY });
    expect(w.state).toBe('crashed');
  });
  it('spawn invulnerability grows by the captain bonus (both modes)', () => {
    const fly = new World({ grid: buildDartStarterGrid(), safeStart: true, modifiers: mod('bul_fortress') });
    fly.beginControl();
    expect(fly.invuln).toBeCloseTo(1 + 2, 6);
    const level: LevelDef = { tier: 1, cols: 21, rows: 1, cells: Array.from({ length: 21 }, () => plain), approachSpeed: 0 };
    const wall = new WallWorld(level, { grid: buildDartStarterGrid(), safeStart: true, modifiers: mod('bul_steady') });
    wall.beginControl();
    expect(wall.invuln).toBeCloseTo(2, 6);
  });
  it('hull %, kill heal and leak damage: more hull, kills heal up to max, leaks stay at the base size', () => {
    const w = new World({ grid: buildDartStarterGrid(), autoSpawn: false, modifiers: mod('bul_plating', 'bul_salvage') });
    expect(w.maxHull).toBeCloseTo(130, 6);
    expect(w.hull).toBeCloseTo(130, 6);
    w.hull = 100;
    const r = w.spawnRock(100, 50, 1);
    r!.hp = 0;
    w.update(DT, mouse(w.shipX, w.shipY));
    expect(w.hull).toBeCloseTo(100.5, 6);
    expect(w.fx.killHealed).toBeCloseTo(0.5, 6);
    const leak = new World({ grid: buildDartStarterGrid(), autoSpawn: false, modifiers: mod('bul_plating') });
    const lr = leak.spawnRock(100, CONFIG.VIEW.H + 1, 1e9);
    lr!.y = CONFIG.VIEW.H;
    leak.update(DT, mouse(leak.shipX, leak.shipY));
    expect(leak.maxHull - leak.hull).toBeCloseTo(100 * 0.1 * 1.5, 6); // the same hull loss as an unmodified ship
  });
  it('boost zone: the top-edge boost starts lower on the screen', async () => {
    const { boostT, scrollSpeed } = await import('../src/wall/wallWorld');
    expect(boostT(400)).toBe(0);
    expect(boostT(400, 1.3)).toBeGreaterThan(0);
    expect(scrollSpeed(26, 400, 1.3)).toBeGreaterThan(scrollSpeed(26, 400));
    expect(scrollSpeed(26, 100, 1)).toBe(scrollSpeed(26, 100));
    expect(WORLD_WIDTH).toBeGreaterThan(0);
  });
});

describe('neutral captain changes nothing', () => {
  it('a Free Fly bot-free run with neutral modifiers equals one with none (same seed, same credits and kills)', () => {
    const go = (mods?: ReturnType<typeof neutralModifiers>) => {
      const w = new World({ grid: buildDartStarterGrid(), seed: 11, modifiers: mods });
      for (let i = 0; i < 60 * 40; i++) w.update(DT, mouse(270 + Math.sin(i / 40) * 150, 700));
      return [w.credits, w.kills, w.hull, w.leaks, w.mitosis.enemies.length, w.gun.shots];
    };
    expect(go(neutralModifiers())).toEqual(go());
  });
});

import { describe, it, expect } from 'vitest';
import { Container } from 'pixi.js';
import { DEFAULT_SETTINGS, loadSettings, migrateSettings, saveSettings, SETTINGS_KEY, SETTINGS_VERSION, TOUCH_GAIN_MAX, TOUCH_GAIN_MIN } from '../src/ui/settings';
import { frameLimitFps } from '../src/ui/touchMode';
import { ShipSteer } from '../src/engine/steer';
import { resolveSkin, resolveTrailStyle, SKINS, skinUnlocked, TRAIL_STYLES, trailUnlocked } from '../src/ui/cosmetics';
import { SHOT_LOOK_BANDS, SHOT_LOOKS, ALL_LOOKS } from '../src/ui/shotLook';
import { ProjectilePool } from '../src/engine/pools';
import { ShotSprites } from '../src/ui/shotSprites';
import { shotTextures } from '../src/ui/shotTextures';
import { ShotTrails, TRAIL_BUDGET_FRAMES, TRAIL_SEGMENTS, TRAIL_SEGMENT_CAP, trailShape } from '../src/ui/shotTrails';

const store = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
};

describe('settings (version 2)', () => {
  it('a version 1 blob (no version field, 12a-24a shape) migrates: old values kept, new fields at their defaults', () => {
    const old = { masterVolume: 0.4, sfxVolume: 0.7, muted: true, weaponSound: 'soft', touchControl: 'direct', soundMult: { crash: 2 } };
    const s = store({ [SETTINGS_KEY]: JSON.stringify(old) });
    const m = loadSettings(s);
    expect(m.version).toBe(SETTINGS_VERSION);
    expect(m).toMatchObject({ masterVolume: 0.4, sfxVolume: 0.7, muted: true, weaponSound: 'soft', touchControl: 'direct', soundMult: { crash: 2 } });
    expect(m).toMatchObject({ frameLimit: 0, trails: 'short', backgrounds: true, damageNumbers: true, touchGain: 1, shotSkin: 'auto', trailStyle: 'default', showCompleted: false });
  });

  it('every new field survives a save and a load; junk values fall back to the default instead of breaking', () => {
    const s = store();
    saveSettings({ ...DEFAULT_SETTINGS, frameLimit: 30, trails: 'long', backgrounds: false, damageNumbers: false, touchGain: 1.5, shotSkin: 'band2', trailStyle: 'trail_ember', showCompleted: true }, s);
    expect(loadSettings(s)).toMatchObject({ frameLimit: 30, trails: 'long', backgrounds: false, damageNumbers: false, touchGain: 1.5, shotSkin: 'band2', trailStyle: 'trail_ember', showCompleted: true });
    const bad = migrateSettings({ frameLimit: 45, trails: 'huge', backgrounds: 'yes', touchGain: 'fast', shotSkin: 7, trailStyle: '', masterVolume: 'x' });
    expect(bad).toMatchObject({ frameLimit: 0, trails: 'short', backgrounds: true, touchGain: 1, shotSkin: 'auto', trailStyle: 'default', masterVolume: 1 });
    expect(migrateSettings({ touchGain: 5 }).touchGain).toBe(TOUCH_GAIN_MAX); // clamped
    expect(migrateSettings({ touchGain: 0.1 }).touchGain).toBe(TOUCH_GAIN_MIN);
    expect(() => migrateSettings(null)).not.toThrow();
  });
});

describe('frame rate limit and touch sensitivity', () => {
  it('Auto is no cap; 30 and 60 cap the loop; anything else is Auto', () => {
    expect([0, 30, 60].map(frameLimitFps)).toEqual([0, 30, 60]);
    expect([45, -1, NaN, 120].map(frameLimitFps)).toEqual([0, 0, 0, 0]);
  });

  it('the sensitivity multiplies the finger movement in relative mode', () => {
    const bounds = { minX: 0, maxX: 540, minY: 0, maxY: 960 };
    const move = (gain: number) => {
      const st = new ShipSteer(270, 600, bounds, 'relative', gain);
      const p = { x: 100, y: 100, active: true, type: 'touch', seen: true };
      st.update(p); p.x = 140; p.y = 90; st.update(p);
      return { dx: st.x - 270, dy: st.y - 600 };
    };
    expect(move(1)).toEqual({ dx: 40, dy: -10 });
    expect(move(2)).toEqual({ dx: 80, dy: -20 });
    expect(move(0.75).dx).toBeCloseTo(30, 9);
  });
});

describe('projectile skins and trail styles', () => {
  const p = (bestShot: number, cosmetics: string[] = []) => ({ records: { bestShot }, cosmetics });
  it('Auto is the default; a band look unlocks when the best shot reaches the band', () => {
    expect(resolveSkin('auto', p(0))).toBeNull();
    const band = (i: number) => SKINS.find(s => s.id === `band${i}`)!;
    expect(skinUnlocked(band(0), p(0))).toBe(true);
    for (let i = 1; i <= 4; i++) {
      const need = SHOT_LOOK_BANDS[i - 1];
      expect(skinUnlocked(band(i), p(need - 1)), `band ${i} just below`).toBe(false);
      expect(skinUnlocked(band(i), p(need)), `band ${i} at ${need}`).toBe(true);
    }
  });
  it('a locked skin falls back to Auto (a save imported from another device); an unlocked one is used', () => {
    expect(resolveSkin('band3', p(50))).toBeNull();
    expect(resolveSkin('band3', p(5000))?.look).toBe(3);
    expect(resolveSkin('nonsense', p(1e9))).toBeNull();
  });
  it('the three reward skins unlock by their cosmetic id and are real extra looks with their own colours', () => {
    const rewards = SKINS.filter(s => 'cosmetic' in s.unlock);
    expect(rewards.map(s => s.id)).toEqual(['skin_legend', 'skin_star', 'skin_zenith']);
    for (const s of rewards) {
      expect(skinUnlocked(s, p(1e12))).toBe(false);
      expect(skinUnlocked(s, p(0, [s.id]))).toBe(true);
    }
    const colours = new Set(ALL_LOOKS.map(l => l.color));
    expect(colours.size).toBe(ALL_LOOKS.length); // every look its own colour
    expect(ALL_LOOKS.slice(SHOT_LOOKS.length).map(l => l.shape)).toEqual(['hex', 'cross', 'chevron']);
  });
  it('trail styles: Standard always; the three reward styles by cosmetic id; a locked choice falls back to Standard', () => {
    expect(TRAIL_STYLES.filter(t => !trailUnlocked(t, p(0))).map(t => t.id)).toEqual(['trail_ember', 'trail_ace', 'trail_pacifist']);
    expect(resolveTrailStyle('trail_ember', p(0)).id).toBe('default');
    expect(resolveTrailStyle('trail_ember', p(0, ['trail_ember'])).id).toBe('trail_ember');
  });
  it('a sprite uses the locked skin for normal flight whatever the damage, and the damage band again on Auto', () => {
    const layer = new Container();
    const pool = new ProjectilePool(4);
    const shots = new ShotSprites(layer, 4, shotTextures(null), 540, 960);
    pool.spawn(200, 400, 0, -600, 5);
    pool.spawn(300, 400, 0, -600, 50000);
    shots.setSkin(6); // skin_star
    shots.sync(pool);
    expect(shots.sprites[0].tint).toBe(ALL_LOOKS[6].color);
    expect(shots.sprites[1].tint).toBe(ALL_LOOKS[6].color);
    shots.setSkin(null);
    shots.sync(pool);
    expect(shots.sprites[0].tint).toBe(SHOT_LOOKS[0].color);
    expect(shots.sprites[1].tint).toBe(SHOT_LOOKS[4].color);
  });
});

describe('trails', () => {
  const fill = (n: number) => {
    const pool = new ProjectilePool(n);
    for (let i = 0; i < n; i++) pool.spawn(10 + (i % 50) * 10, 100 + Math.floor(i / 50) * 3, 0, -600, 5);
    return pool;
  };
  const run = (pool: ProjectilePool, mode: 'off' | 'short' | 'long', now?: () => number) => {
    const layer = new Container();
    const t = new ShotTrails(layer);
    t.sync(pool, mode, null, () => 0xffffff, () => 4, () => true, (x) => x, now);
    return t;
  };
  it('a trail has 3 (short) or 5 (long) segments, longer for a faster shot within a min and a max; off has none', () => {
    expect(trailShape('off', 600)).toEqual({ segments: 0, length: 0 });
    expect(trailShape('short', 600).segments).toBe(TRAIL_SEGMENTS.short);
    expect(trailShape('long', 600).segments).toBe(TRAIL_SEGMENTS.long);
    expect(trailShape('long', 600).length).toBeGreaterThan(trailShape('short', 600).length);
    expect(trailShape('short', 1).length).toBeGreaterThan(0);
    expect(trailShape('long', 1e6).length).toBeLessThanOrEqual(110);
  });
  it('segment sprites never exceed the cap however many shots are alive, and every shot below the cap has its full trail', () => {
    const few = run(fill(10), 'long');
    expect(few.used).toBe(10 * TRAIL_SEGMENTS.long);
    const many = run(fill(1000), 'long');
    expect(many.used).toBeLessThanOrEqual(TRAIL_SEGMENT_CAP);
    expect(many.used).toBe(Math.floor(TRAIL_SEGMENT_CAP / TRAIL_SEGMENTS.long) * TRAIL_SEGMENTS.long);
  });
  it('a shot whose whole trail does not fit under the cap gets none (never a half trail, never past the cap)', () => {
    const t = new ShotTrails(new Container(), 12); // room for two long trails (10) and 2 spare segments
    t.sync(fill(5), 'long', null, () => 1, () => 4, () => true, (x) => x);
    expect(t.used).toBe(10);
  });
  it('Off draws nothing', () => {
    expect(run(fill(20), 'off').used).toBe(0);
  });
  it('a pass that stays over its frame budget turns the trails off by itself, for good', () => {
    const pool = fill(50);
    const layer = new Container();
    const t = new ShotTrails(layer);
    let clock = 0;
    const slow = () => (clock += 10); // every reading 10 ms later: the pass "costs" 10 ms
    for (let f = 0; f < TRAIL_BUDGET_FRAMES - 1; f++) t.sync(pool, 'short', null, () => 1, () => 4, () => true, (x) => x, slow);
    expect(t.autoOff).toBe(false);
    for (let f = 0; f < 10; f++) t.sync(pool, 'short', null, () => 1, () => 4, () => true, (x) => x, slow);
    expect(t.autoOff).toBe(true);
    t.sync(pool, 'short', null, () => 1, () => 4, () => true, (x) => x, () => 0);
    expect(t.used).toBe(0);
  });
});

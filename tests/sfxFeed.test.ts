import { describe, it, expect } from 'vitest';
import { SfxFeed, damagePitch, popPitch } from '../src/audio/feed';
import type { SfxId } from '../src/audio/sounds';
import { HIT_BURN, HIT_CLOUD } from '../src/engine/projectiles';

function feed() {
  const played: { id: SfxId; pitch?: number }[] = [];
  const f = new SfxFeed({
    play: (id: SfxId, o?: { pitch?: number }) => { played.push({ id, pitch: o?.pitch }); return true; },
    playShot: () => { played.push({ id: 'shot' }); return true; },
  });
  return { f, played };
}
const hit = (o: Partial<{ id: number; damage: number; kind: number; armor: number; shield: number; maxShield: number }> = {}) =>
  ({ id: 1, damage: 10, kind: 0, armor: 0, shield: 0, maxShield: 0, ...o });
const ids = (p: { id: SfxId }[]) => p.map(x => x.id);

describe('SfxFeed', () => {
  it('counter growth plays one sound per kind per frame, and nothing when nothing grew', () => {
    const { f, played } = feed();
    f.frame({ shots: 0, chainJumps: 0, wellsMade: 0, bounces: 0 });
    expect(played).toHaveLength(0);
    f.frame({ shots: 5, chainJumps: 2, wellsMade: 1, bounces: 3 });
    expect(ids(played)).toEqual(['shot', 'chain', 'well', 'bounce']);
    f.frame({ shots: 5, chainJumps: 2, wellsMade: 1, bounces: 3 });
    expect(played).toHaveLength(4);
    f.frame({ shots: 6, chainJumps: 2, wellsMade: 1, bounces: 3 });
    expect(ids(played).slice(4)).toEqual(['shot']);
  });

  it('classifies hits: plain rock/tick with pitch by damage, armor ping, shield zap, then shield break once; burn ticks silent', () => {
    const { f, played } = feed();
    f.hit(hit(), true);
    f.hit(hit({ damage: 5000 }), false);
    f.hit(hit({ armor: 3 }), true);
    f.hit(hit({ id: 7, shield: 5, maxShield: 10 }), true);
    f.hit(hit({ id: 7, shield: 0, maxShield: 10 }), true);   // the shield just went down: break
    f.hit(hit({ id: 7, shield: 0, maxShield: 10 }), true);   // already down: a plain hit
    f.hit(hit({ kind: HIT_BURN }), true);
    f.hit(hit({ kind: HIT_CLOUD }), true);
    expect(ids(played)).toEqual(['rockHit', 'tick', 'armorPing', 'shieldHit', 'shieldBreak', 'rockHit']);
    expect(played[1].pitch!).toBeGreaterThan(played[0].pitch!);
  });

  it('kills and splits: a rock pops (lower for parents), a block thuds, a split cracks', () => {
    const { f, played } = feed();
    f.kill(1); f.kill(3); f.kill(); f.split();
    expect(ids(played)).toEqual(['rockPop', 'rockPop', 'blockDestroyed', 'split']);
    expect(played[0].pitch!).toBeLessThan(played[1].pitch!);
    expect(damagePitch(1)).toBeLessThan(damagePitch(1e4));
    expect(popPitch(1)).toBeLessThan(popPitch(4));
  });
});

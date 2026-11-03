import { describe, expect, it } from 'vitest';
import { CAROUSEL, MAP_MEMORY_KEY, MAP_MODES } from '../src/map/constants';
import { cardAt, cardLook, dragPos, easePos, releaseVelocity, snapIndex, stepIndex } from '../src/map/carousel';
import { MapMemoryStore, sanitizeMemory } from '../src/map/memory';
import { modeStatus, nextLegendaryRing, tabTarget, flyMilestones } from '../src/map/modes';
import { challengeStart } from '../src/challenges/start';
import { keyAction } from '../src/builder/keys';
import { defaultProgress, Progress } from '../src/econ/progress';

const S = CAROUSEL.spacing;
const N = MAP_MODES.length;

/** A fake localStorage that survives "an app restart": a new MapMemoryStore over the same object. */
const fakeStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, raw: m };
};

describe('chunk 29b carousel maths', () => {
  it('a drag of one card spacing to the left moves exactly one card; to the right moves back', () => {
    expect(dragPos(0, -S, N)).toBeCloseTo(1);
    expect(dragPos(1, -S / 2, N)).toBeCloseTo(1.5);
    expect(dragPos(1, S, N)).toBeCloseTo(0);
  });
  it('dragging past the first or last card is resisted, not blocked', () => {
    expect(dragPos(0, S, N)).toBeCloseTo(-CAROUSEL.rubber);
    expect(dragPos(N - 1, -S, N)).toBeCloseTo(N - 1 + CAROUSEL.rubber);
    expect(dragPos(0, S, N)).toBeLessThan(0);
  });
  it('a slow release snaps to the nearest card, a short flick goes one card further, never more than one', () => {
    expect(snapIndex(0.4, 0, N)).toBe(0);
    expect(snapIndex(0.6, 0, N)).toBe(1);
    expect(snapIndex(0.3, -1500, N)).toBe(1); // flicked left from just past card 0
    expect(snapIndex(0.7, 1500, N)).toBe(0); // flicked right from just short of card 1: back to card 0
    expect(snapIndex(0, -50000, N)).toBe(1); // a huge flick still moves one card only
    expect(snapIndex(N - 1, -3000, N)).toBe(N - 1); // clamped at the end
    expect(snapIndex(0, 3000, N)).toBe(0);
  });
  it('arrows and keys step one card and stop at the ends', () => {
    expect(stepIndex(0, 1, N)).toBe(1);
    expect(stepIndex(0, -1, N)).toBe(0);
    expect(stepIndex(N - 1, 1, N)).toBe(N - 1);
  });
  it('easing moves toward the target, never past it, and lands exactly', () => {
    let p = 0;
    for (let i = 0; i < 400; i++) { const q = easePos(p, 2, 1 / 60); expect(q).toBeGreaterThanOrEqual(p); expect(q).toBeLessThanOrEqual(2); p = q; }
    expect(p).toBe(2);
    expect(easePos(2, 0, 1 / 60)).toBeLessThan(2);
  });
  it('the centre card is full size and brightness, its neighbours smaller and dimmer on either side', () => {
    const c = cardLook(0), l = cardLook(-1), r = cardLook(1), far = cardLook(2.5);
    expect(c).toEqual({ dx: 0, scale: 1, alpha: 1 });
    expect(l.dx).toBe(-S); expect(r.dx).toBe(S);
    expect(l.scale).toBeCloseTo(CAROUSEL.sideScale); expect(l.alpha).toBeCloseTo(CAROUSEL.sideAlpha);
    expect(far.scale).toBeCloseTo(CAROUSEL.sideScale);
    expect(cardLook(0.5).scale).toBeGreaterThan(CAROUSEL.sideScale);
    expect(cardLook(0.5).scale).toBeLessThan(1);
  });
  it('a tap lands on the card under it: the centre one in the middle, the neighbour at the edge', () => {
    const cx = 270, w = CAROUSEL.card.w;
    expect(cardAt(cx, 0, N, cx, w)).toBe(0);
    expect(cardAt(cx + 200, 0, N, cx, w)).toBe(1); // 200 px right of the centre is the right neighbour
    expect(cardAt(cx + 100, 0, N, cx, w)).toBe(0); // 100 px right is still the centre card (half width 150)
    expect(cardAt(cx + 200, 1, N, cx, w)).toBe(2);
    expect(cardAt(cx - 200, 1, N, cx, w)).toBe(0);
    expect(cardAt(5, 0, N, cx, w)).toBe(-1);
  });
  it('release speed is read from the last 0.1 s only', () => {
    expect(releaseVelocity([{ t: 0, x: 0 }])).toBe(0);
    expect(releaseVelocity([{ t: 0, x: 0 }, { t: 0.5, x: 500 }, { t: 0.55, x: 505 }, { t: 0.6, x: 510 }])).toBeCloseTo(100, 0);
    expect(releaseVelocity([{ t: 0, x: 300 }, { t: 0.05, x: 250 }, { t: 0.1, x: 200 }])).toBeCloseTo(-1000, 0);
  });
});

describe('chunk 29b remembered mode', () => {
  it('opening a mode screen is remembered, also after an app restart (a new store over the same storage)', () => {
    const st = fakeStorage();
    expect(new MapMemoryStore(st).get()).toEqual({ open: null, last: 'campaign' }); // fresh save: the carousel, on Campaign
    new MapMemoryStore(st).setOpen('freefly');
    const restarted = new MapMemoryStore(st);
    expect(restarted.get()).toEqual({ open: 'freefly', last: 'freefly' });
    expect(JSON.parse(st.raw.get(MAP_MEMORY_KEY)!).open).toBe('freefly');
  });
  it('"<" returns to the carousel, centred on the mode it came from; that is remembered too', () => {
    const st = fakeStorage();
    const m = new MapMemoryStore(st);
    m.setOpen('frontier');
    m.backToCarousel('frontier');
    const restarted = new MapMemoryStore(st);
    expect(restarted.get()).toEqual({ open: null, last: 'frontier' });
    expect(restarted.centred()).toBe('frontier');
    restarted.setOpen('campaign'); // opening a card again makes the Map tab go straight back to it
    expect(restarted.get().open).toBe('campaign');
  });
  it('garbage in storage falls back to the carousel on Campaign; no storage at all does not throw', () => {
    expect(sanitizeMemory({ open: 'nope', last: 5 })).toEqual({ open: null, last: 'campaign' });
    expect(sanitizeMemory('x')).toEqual({ open: null, last: 'campaign' });
    const st = fakeStorage(); st.raw.set(MAP_MEMORY_KEY, '{not json');
    expect(new MapMemoryStore(st).get()).toEqual({ open: null, last: 'campaign' });
    const none = new MapMemoryStore(null);
    expect(() => none.setOpen('frontier')).not.toThrow();
    expect(none.get().open).toBe(null);
  });
  it('the Map tab goes to the remembered mode, but a Frontier that is no longer open falls back to the carousel', () => {
    const p: Progress = defaultProgress();
    expect(tabTarget({ open: 'campaign', last: 'campaign' }, p)).toBe('campaign');
    expect(tabTarget({ open: 'freefly', last: 'freefly' }, p)).toBe('freefly');
    expect(tabTarget({ open: null, last: 'freefly' }, p)).toBe(null);
    expect(tabTarget({ open: 'frontier', last: 'frontier' }, p)).toBe(null); // tier 25 not passed
    p.passedTiers = Array.from({ length: 25 }, (_, i) => i + 1);
    expect(tabTarget({ open: 'frontier', last: 'frontier' }, p)).toBe('frontier');
  });
});

describe('chunk 29b card texts', () => {
  it('campaign, Frontier (locked and open) and Free Fly status lines', () => {
    const p = defaultProgress();
    expect(modeStatus('campaign', p).line).toMatch(/^Tier 1 · next: \w+/);
    const locked = modeStatus('frontier', p);
    expect(locked.locked).toBe(true);
    expect(locked.unlock).toBe('Pass tier 25');
    expect(modeStatus('freefly', p).line).toBe('Not flown yet');
    p.bestWave = 31;
    expect(modeStatus('freefly', p).line).toBe('Best wave 31');
    p.passedTiers = Array.from({ length: 25 }, (_, i) => i + 1);
    const open = modeStatus('frontier', p);
    expect(open.locked).toBe(false);
    expect(open.line).toBe('Ring 0 · next legendary at ring 100');
  });
  it('the next legendary ring is the first of 100 / 200 / 300 above the furthest ring', () => {
    expect(nextLegendaryRing(0)).toBe(100);
    expect(nextLegendaryRing(100)).toBe(200);
    expect(nextLegendaryRing(299)).toBe(300);
    expect(nextLegendaryRing(300)).toBe(null);
  });
  it('Free Fly milestones are done when paid or when the best wave has reached them', () => {
    const p = defaultProgress();
    p.bestWave = 12; p.captains.milestones = [5, 30];
    const m = flyMilestones(p);
    expect(m.find(x => x.wave === 5)!.done).toBe(true);
    expect(m.find(x => x.wave === 10)!.done).toBe(true); // best wave 12 reached it
    expect(m.find(x => x.wave === 15)!.done).toBe(false);
    expect(m.find(x => x.wave === 30)!.done).toBe(true); // paid
  });
});

describe('chunk 29b challenge bar start', () => {
  it('START flies the challenge when the build is allowed, says why when it is not, does nothing without a challenge', () => {
    expect(challengeStart(true, null)).toEqual({ kind: 'fly' });
    expect(challengeStart(true, 'Not allowed in this challenge: AoE - Circle')).toEqual({ kind: 'blocked', why: 'Not allowed in this challenge: AoE - Circle' });
    expect(challengeStart(false, null)).toEqual({ kind: 'none' });
    expect(challengeStart(false, 'x')).toEqual({ kind: 'none' });
  });
  it('the F key still maps to the "start" action (the builder only acts on it while a challenge is on)', () => {
    expect(keyAction({ key: 'f' })).toBe('fly');
  });
});

import { describe, it, expect } from 'vitest';
import {
  BACKGROUNDS, BACKGROUND_IDS, backgroundForTier, backgroundMaxLuminance, clearBackgroundCache, freeFlyThemeAt, layerTexture,
} from '../src/ui/background';
import { generateLevel, MAX_TIER } from '../src/wall/generator';

describe('backgrounds', () => {
  it('stay low contrast: dark base, dim stars, rock masses only a little lighter than the base', () => {
    for (const id of BACKGROUND_IDS) {
      const l = backgroundMaxLuminance(BACKGROUNDS[id]);
      expect(l.base, `${id} base`).toBeLessThan(0.06);
      expect(l.stars, `${id} stars`).toBeLessThan(0.45);
      expect(l.rocks, `${id} rocks`).toBeLessThan(0.15);
    }
  });

  it('campaign schedule: bands of 20, Ember on every spike tier and only there', () => {
    const bands = ['galaxy', 'cave_blue', 'galaxy_violet', 'cave_brown', 'galaxy_red'];
    let spikes = 0;
    for (let t = 1; t <= MAX_TIER; t++) {
      const l = generateLevel(t);
      const id = backgroundForTier(t, !!l.spike);
      expect(BACKGROUNDS[id], `tier ${t}`).toBeDefined();
      if (l.spike) { expect(id).toBe('ember'); spikes++; } else expect(id).toBe(bands[Math.floor((t - 1) / 20)]);
    }
    expect(spikes).toBeGreaterThanOrEqual(8);
    expect(backgroundForTier(10, false)).toBe('galaxy');   // a milestone that is not a spike keeps its band
    expect(backgroundForTier(100, false)).toBe('galaxy_red');
  });

  it('Free Fly starts on Galaxy and moves to the next theme every 3 minutes, repeating', () => {
    const seq = [0, 179, 180, 360, 540, 720, 900].map(freeFlyThemeAt);
    expect(seq).toEqual(['galaxy', 'galaxy', 'cave_blue', 'galaxy_violet', 'cave_brown', 'galaxy', 'cave_blue']);
  });

  it('each layer is drawn once and its texture reused', () => {
    clearBackgroundCache();
    let made = 0;
    const renderer = { generateTexture: () => ({ id: ++made }) as any };
    const a = layerTexture(renderer, BACKGROUNDS.galaxy, 0);
    const b = layerTexture(renderer, BACKGROUNDS.galaxy, 0);
    layerTexture(renderer, BACKGROUNDS.ember, 1);
    expect(b).toBe(a);
    expect(made).toBe(2);
  });
});

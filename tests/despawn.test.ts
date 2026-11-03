import { describe, it, expect } from 'vitest';
import { beyondDespawn } from '../src/engine/projectiles';
import { CONFIG } from '../src/config';

const W = CONFIG.VIEW.W, H = CONFIG.VIEW.H, D = CONFIG.DESPAWN;

describe('shot despawn margin (30a)', () => {
  it('keeps a shot below the screen within one screen height', () => {
    expect(beyondDespawn(W / 2, H + 51, -100, W, H)).toBe(false); // the old rule removed this
    expect(beyondDespawn(W / 2, H + D.BELOW - 1, -100, W, H)).toBe(false);
  });
  it('removes a shot beyond the bottom margin', () => {
    expect(beyondDespawn(W / 2, H + D.BELOW + 1, -100, W, H)).toBe(true);
  });
  it('keeps a shot half a screen width to the side, removes beyond', () => {
    expect(beyondDespawn(-D.SIDE + 1, 100, -100, W, H)).toBe(false);
    expect(beyondDespawn(W + D.SIDE + 1, 100, -100, W, H)).toBe(true);
    expect(beyondDespawn(-D.SIDE - 1, 100, -100, W, H)).toBe(true);
  });
  it('ignores the sides on a ring wall and still honours the top', () => {
    expect(beyondDespawn(-5000, 100, -100, W, H, false)).toBe(false);
    expect(beyondDespawn(W / 2, -101, -100, W, H)).toBe(true);
  });
});

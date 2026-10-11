import { describe, it, expect } from 'vitest';
import { SIDE_MIN_BLANK, statsPlacement } from '../src/ui/stats';

describe('stats placement', () => {
  it('a wide window puts the stats beside the game, a phone-width or narrow one keeps them in the canvas', () => {
    expect(statsPlacement(1920, 960)).toBe('side');
    expect(statsPlacement(1400, 1000)).toBe('side');
    expect(statsPlacement(390, 844)).toBe('canvas');
    expect(statsPlacement(540, 960)).toBe('canvas');
    expect(statsPlacement(900, 960)).toBe('canvas'); // 180 px of blank each side: too little
  });
  it('switches exactly where the blank column reaches SIDE_MIN_BLANK (game 540 px wide at height 960)', () => {
    const w = 540 + 2 * SIDE_MIN_BLANK;
    expect(statsPlacement(w, 960)).toBe('side');
    expect(statsPlacement(w - 1, 960)).toBe('canvas');
  });
  it('is decided by the letterboxed game width, not the window width: a wide but short window has a narrow game and lots of room', () => {
    expect(statsPlacement(1000, 600)).toBe('side'); // game 337 px wide, 331 px blank each side
    expect(statsPlacement(1000, 1500)).toBe('canvas'); // game 540 wide, 230 blank each side
  });
});

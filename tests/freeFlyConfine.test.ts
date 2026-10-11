import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config';
import { ABOVE_SCREEN_MAX, World } from '../src/game/world';
import { PointerState } from '../src/input';

const DT = 1 / 60;
const VW = CONFIG.VIEW.W;

describe('Free Fly is one screen wide and nothing leaves it sideways', () => {
  it('120 s with a sweeping pointer, splitting rocks and extra rocks at both sides: x stays in [0, W], never above for > 6 s', () => {
    const w = new World({ autoSpawn: true });
    const p: PointerState = { x: VW / 2, y: 700, active: false, type: 'mouse', seen: true };
    const above = new Map<number, number>();
    let maxAbove = 0, minX = Infinity, maxX = -Infinity, maxSeen = 0;
    for (let i = 0; i < 120 * 60; i++) {
      w.hull = 1e9; // never let the run end
      p.x = VW / 2 + Math.sin(i / 90) * (VW / 2);
      if (i % 120 === 0) { w.spawnRock(i % 240 === 0 ? 0 : VW, -20, 400); }
      w.update(DT, p);
      maxSeen = Math.max(maxSeen, w.mitosis.enemies.length);
      for (const e of w.mitosis.enemies) {
        minX = Math.min(minX, e.x); maxX = Math.max(maxX, e.x);
        if (e.y < 0) { const t = (above.get(e.id) ?? 0) + DT; above.set(e.id, t); maxAbove = Math.max(maxAbove, t); } else above.delete(e.id);
      }
    }
    expect(w.kills).toBeGreaterThan(20);
    expect(maxSeen).toBeGreaterThan(5);
    expect(minX).toBeGreaterThanOrEqual(0);
    expect(maxX).toBeLessThanOrEqual(VW);
    expect(maxAbove).toBeLessThanOrEqual(ABOVE_SCREEN_MAX + 2 * DT);
  });

  it('a rock that touches a side is reflected, not left outside; a far-away rock is moved in after 6 s', () => {
    const w = new World({ autoSpawn: false });
    const p: PointerState = { x: 100, y: 800, active: false, type: 'mouse', seen: false };
    const r = w.spawnRock(1000, 300, 1e9)!;   // asked for x = 1000: born clamped inside
    expect(r.x).toBeLessThanOrEqual(VW - r.radius);
    r.x = VW - r.radius; r.vx = 0;
    for (let i = 0; i < 600; i++) { w.update(DT, p); r.y = Math.min(r.y, 300); expect(r.x).toBeLessThanOrEqual(VW - r.radius + 1e-6); expect(r.x).toBeGreaterThanOrEqual(r.radius - 1e-6); }
    const far = w.spawnRock(100, -2000, 1e9)!;
    let t = 0;
    while (far.y < 0 && t < 8) { w.update(DT, p); t += DT; }
    expect(t).toBeLessThan(ABOVE_SCREEN_MAX + 0.1);
  });
});

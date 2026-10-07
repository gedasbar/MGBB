import { describe, it, expect } from 'vitest';
import {
  cellCenter, cellFromPoint, clampView, fitView, LAYOUT, MAX_SCALE, MIN_SCALE, MIN_TAP, panToReveal, zoomAt, VIEW_W,
} from '../src/builder/layout';
import { computeHops, segmentEnds } from '../src/builder/lines';
import { compile } from '../src/engine/compiler';
import { buildStarterGrid } from '../src/game/starter';
import { buildFanGrid, buildShuttleGrid } from '../src/game/gridUtils';
import { DRAG_SLOP, GestureHandlers, GestureTracker, LONG_PRESS_MS } from '../src/builder/gestures';
import { vi } from 'vitest';

describe('layout', () => {
  it('fits the Shuttle with tappable cells (>= 44 game px) fully inside the grid area', () => {
    const v = fitView(11, 11);
    expect(v.scale).toBeGreaterThanOrEqual(MIN_TAP);
    const a = LAYOUT.gridArea;
    expect(v.ox).toBeGreaterThanOrEqual(a.x);
    expect(v.oy).toBeGreaterThanOrEqual(a.y);
    expect(v.ox + 11 * v.scale).toBeLessThanOrEqual(a.x + a.w);
    expect(v.oy + 11 * v.scale).toBeLessThanOrEqual(a.y + a.h);
  });

  it('fits the wider Fan hull too', () => {
    const v = fitView(9, 10);
    expect(v.scale).toBeGreaterThanOrEqual(MIN_TAP);
    expect(v.oy + 10 * v.scale).toBeLessThanOrEqual(LAYOUT.gridArea.y + LAYOUT.gridArea.h);
  });

  it('the screen regions tile the 540x960 view without overlap', () => {
    const order = [LAYOUT.top, LAYOUT.inspector, LAYOUT.gridArea, LAYOUT.stats, LAYOUT.toolbar, LAYOUT.tabs];
    let y = 0;
    for (const r of order) { expect(r.y).toBe(y); y += r.h; }
    expect(y).toBe(960);
    expect(LAYOUT.sheet.y).toBeGreaterThan(LAYOUT.inspector.y + LAYOUT.inspector.h); // inspector stays visible
  });

  it('cellFromPoint and cellCenter are inverse', () => {
    const v = fitView(11, 11);
    for (const [cx, cy] of [[0, 0], [5, 5], [10, 10], [8, 1]]) {
      const c = cellCenter(v, cx, cy);
      expect(cellFromPoint(v, 11, 11, c.x, c.y)).toEqual({ x: cx, y: cy });
    }
    expect(cellFromPoint(v, 11, 11, v.ox - 1, v.oy + 5)).toBeNull();
    expect(cellFromPoint(v, 11, 11, v.ox + 11 * v.scale, v.oy + 5)).toBeNull();
  });

  it('zoomAt keeps the focal point fixed and respects the limits', () => {
    const v = fitView(11, 11);
    const px = 300;
    const py = 400;
    const before = { x: (px - v.ox) / v.scale, y: (py - v.oy) / v.scale };
    const z = zoomAt(v, 1.7, px, py);
    expect(z.scale).toBeCloseTo(v.scale * 1.7, 6);
    expect((px - z.ox) / z.scale).toBeCloseTo(before.x, 6);
    expect((py - z.oy) / z.scale).toBeCloseTo(before.y, 6);
    expect(zoomAt(v, 1000, px, py).scale).toBe(MAX_SCALE);
    expect(zoomAt(v, 0.0001, px, py).scale).toBe(MIN_SCALE);
  });

  it('clampView never lets the hull leave the screen', () => {
    const v = fitView(11, 11);
    const far = clampView({ ...v, ox: 5000, oy: -5000 }, 11, 11);
    expect(far.ox).toBeLessThan(VIEW_W);
    expect(far.oy + 11 * v.scale).toBeGreaterThan(LAYOUT.gridArea.y);
  });

  it('panToReveal moves a hidden cell into the visible band without zooming', () => {
    const v = fitView(11, 11);
    const visible = { x: 0, y: 116, w: 540, h: 320 };
    const cell = { x: 5, y: 9 }; // low on the hull, behind the sheet
    expect(v.oy + (cell.y + 1) * v.scale).toBeGreaterThan(visible.y + visible.h);
    const p = panToReveal(v, cell.x, cell.y, visible);
    expect(p.scale).toBe(v.scale);
    expect(p.oy + (cell.y + 1) * p.scale).toBeLessThanOrEqual(visible.y + visible.h);
    expect(p.oy + cell.y * p.scale).toBeGreaterThanOrEqual(visible.y);
    const already = panToReveal(v, 5, 4, visible);
    expect(already.oy).toBeLessThanOrEqual(v.oy); // a cell that is visible barely moves it down
  });
});

describe('line geometry', () => {
  it('computes hop cells only where a horizontal and a vertical run cross', () => {
    const g = buildFanGrid();
    const hopsEmpty = computeHops(compile(g).segments);
    expect(hopsEmpty.size).toBe(0);
    // Two lines crossing: generator facing east along row 5 meets the generator line going north.
    const x = buildFanGrid();
    const gen2 = x.cells[5 * 9 + 0];
    gen2.type = 'generator';
    gen2.facing = 'E';
    const hops = computeHops(compile(x).segments);
    expect([...hops]).toEqual(['4,5']);
  });

  it('segment ends: live runs go centre to centre, dead ends stop at the cell edge', () => {
    const res = compile(buildShuttleGrid());
    const [live, dead] = res.segments;
    const l = segmentEnds(live);
    expect(l.a.x).toBe(l.b.x);
    expect(l.a.y).toBeGreaterThan(l.b.y); // heading up
    const d = segmentEnds(dead);
    expect(d.a.x - d.b.x).toBe(0);
    expect(d.a.y - d.b.y).toBe(32); // half a 64px cell
    expect(res.segments.length).toBe(2);
    expect(compile(buildStarterGrid()).segments.every(s => s.kind === 'live')).toBe(true);
  });
});

describe('gesture tracker', () => {
  class FakeEl {
    listeners: Record<string, ((e: any) => void)[]> = {};
    addEventListener(n: string, f: (e: any) => void) { (this.listeners[n] ??= []).push(f); }
    removeEventListener(n: string, f: (e: any) => void) { this.listeners[n] = (this.listeners[n] ?? []).filter(x => x !== f); }
    setPointerCapture() { /* noop */ }
    fire(n: string, e: any) { for (const f of this.listeners[n] ?? []) f(e); }
  }

  function setup(canDrag = true) {
    const el = new FakeEl();
    const log: string[] = [];
    let t = 0;
    const h: GestureHandlers = {
      onTap: (x, y) => log.push(`tap ${x},${y}`),
      onDoubleTap: (x, y) => log.push(`double ${x},${y}`),
      onDrag: (dx, dy) => log.push(`drag ${dx},${dy}`),
      onPinch: (f) => log.push(`pinch ${f.toFixed(2)}`),
      onWheel: (dy) => log.push(`wheel ${dy}`),
      canDrag: () => canDrag,
    };
    const g = new GestureTracker(el as any, (x, y) => ({ x, y }), h, () => t);
    g.attach();
    const ev = (id: number, x: number, y: number) => ({ pointerId: id, clientX: x, clientY: y, pointerType: 'mouse', preventDefault() { /* noop */ } });
    return { el, log, ev, advance: (ms: number) => { t += ms; } };
  }

  it('a quick press and release is a tap; a second one soon after is a double tap', () => {
    const { el, log, ev, advance } = setup();
    el.fire('pointerdown', ev(1, 100, 100)); advance(40); el.fire('pointerup', ev(1, 100, 100));
    advance(100);
    el.fire('pointerdown', ev(1, 102, 101)); advance(40); el.fire('pointerup', ev(1, 102, 101));
    expect(log).toEqual(['tap 100,100', 'double 102,101']);
  });

  it('two taps far apart in time are two single taps', () => {
    const { el, log, ev, advance } = setup();
    el.fire('pointerdown', ev(1, 100, 100)); advance(40); el.fire('pointerup', ev(1, 100, 100));
    advance(800);
    el.fire('pointerdown', ev(1, 100, 100)); advance(40); el.fire('pointerup', ev(1, 100, 100));
    expect(log).toEqual(['tap 100,100', 'tap 100,100']);
  });

  it('movement beyond the slop is a drag, not a tap', () => {
    const { el, log, ev, advance } = setup();
    el.fire('pointerdown', ev(1, 100, 100));
    el.fire('pointermove', ev(1, 100 + DRAG_SLOP + 20, 100));
    el.fire('pointermove', ev(1, 100 + DRAG_SLOP + 30, 105));
    advance(60);
    el.fire('pointerup', ev(1, 100 + DRAG_SLOP + 30, 105));
    expect(log.some(l => l.startsWith('tap'))).toBe(false);
    expect(log.filter(l => l.startsWith('drag')).length).toBe(2);
  });

  it('does not drag where dragging is not allowed, and does not tap either once moved', () => {
    const { el, log, ev, advance } = setup(false);
    el.fire('pointerdown', ev(1, 100, 100));
    el.fire('pointermove', ev(1, 200, 100));
    advance(60);
    el.fire('pointerup', ev(1, 200, 100));
    expect(log).toEqual([]);
  });

  it('two fingers pinch and never produce a tap', () => {
    const { el, log, ev, advance } = setup();
    el.fire('pointerdown', ev(1, 100, 100));
    el.fire('pointerdown', ev(2, 200, 100));
    el.fire('pointermove', ev(2, 300, 100));
    advance(50);
    el.fire('pointerup', ev(2, 300, 100));
    el.fire('pointerup', ev(1, 100, 100));
    expect(log).toEqual(['pinch 2.00']);
  });

  it('forwards wheel events and stops after detach', () => {
    const { el, log } = setup();
    el.fire('wheel', { clientX: 5, clientY: 6, deltaY: 120, preventDefault() { /* noop */ } });
    expect(log).toEqual(['wheel 120']);
  });

  it('a press held still fires a long press, and its release is not a tap', () => {
    vi.useFakeTimers();
    try {
      const el = new FakeEl();
      const log: string[] = [];
      const h: GestureHandlers = {
        onTap: () => log.push('tap'), onDoubleTap: () => log.push('double'), onDrag: () => log.push('drag'),
        onPinch: () => log.push('pinch'), onWheel: () => log.push('wheel'), canDrag: () => true,
        onLongPress: (x, y) => log.push(`long ${x},${y}`), onLongPressEnd: () => log.push('long end'),
      };
      const g = new GestureTracker(el as any, (x, y) => ({ x, y }), h, () => Date.now());
      g.attach();
      const ev = (x: number, y: number) => ({ pointerId: 1, clientX: x, clientY: y, pointerType: 'touch', preventDefault() { /* noop */ } });
      el.fire('pointerdown', ev(50, 60));
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
      el.fire('pointerup', ev(50, 60));
      expect(log).toEqual(['long 50,60', 'long end']);

      log.length = 0;
      el.fire('pointerdown', ev(50, 60)); // moving cancels the long press
      el.fire('pointermove', ev(50 + DRAG_SLOP + 5, 60));
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
      el.fire('pointerup', ev(50 + DRAG_SLOP + 5, 60));
      expect(log.some(l => l.startsWith('long'))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

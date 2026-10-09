/**
 * Turns raw pointer events on the canvas into taps, double taps, drags, pinches and wheel zooms,
 * all reported in game coordinates.
 */
export interface GestureHandlers {
  onTap(x: number, y: number): void;
  /** Optional. When absent, every tap (fast or not) is reported through onTap. */
  onDoubleTap?(x: number, y: number): void;
  /** Incremental movement of a one-pointer drag that started where `canDrag` said yes. */
  onDrag(dx: number, dy: number, x: number, y: number): void;
  /** Two-pointer pinch: ratio of the new finger distance to the old one, around the midpoint. */
  onPinch(factor: number, cx: number, cy: number): void;
  onWheel(deltaY: number, x: number, y: number): void;
  canDrag(x: number, y: number): boolean;
  /** Hover (mouse only). */
  onMove?(x: number, y: number): void;
  /** Press held still for LONG_PRESS_MS; the release that follows is not a tap. */
  onLongPress?(x: number, y: number): void;
  onLongPressEnd?(): void;
}

export const DRAG_SLOP = 10;
export const DOUBLE_TAP_MS = 400;
export const DOUBLE_TAP_DIST = 32;
export const TAP_MAX_MS = 600;
export const LONG_PRESS_MS = 450;

interface Pt { x: number; y: number; sx: number; sy: number; t: number; dragging: boolean; drag: boolean; long: boolean; timer: ReturnType<typeof setTimeout> | null }

export class GestureTracker {
  private pts = new Map<number, Pt>();
  private lastTap: { t: number; x: number; y: number } | null = null;
  private pinched = false;
  private pinchDist = 0;
  private bound: [string, (e: any) => void][] = [];

  constructor(
    private el: HTMLElement,
    private toGame: (clientX: number, clientY: number) => { x: number; y: number },
    private h: GestureHandlers,
    private now: () => number = () => performance.now(),
  ) {}

  attach() {
    const down = (e: PointerEvent) => {
      const g = this.toGame(e.clientX, e.clientY);
      const pt: Pt = { x: g.x, y: g.y, sx: g.x, sy: g.y, t: this.now(), dragging: false, drag: this.h.canDrag(g.x, g.y), long: false, timer: null };
      if (this.h.onLongPress) {
        pt.timer = setTimeout(() => {
          pt.timer = null;
          if (this.pts.get(e.pointerId) === pt && this.pts.size === 1 && !pt.dragging && Math.hypot(pt.x - pt.sx, pt.y - pt.sy) <= DRAG_SLOP) {
            pt.long = true;
            this.h.onLongPress!(pt.x, pt.y);
          }
        }, LONG_PRESS_MS);
      }
      this.pts.set(e.pointerId, pt);
      if (this.pts.size === 2) {
        this.pinched = true;
        this.pinchDist = this.distance();
      }
      try { this.el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    };
    const move = (e: PointerEvent) => {
      const g = this.toGame(e.clientX, e.clientY);
      const p = this.pts.get(e.pointerId);
      if (!p) {
        if (e.pointerType === 'mouse') this.h.onMove?.(g.x, g.y);
        return;
      }
      const dx = g.x - p.x;
      const dy = g.y - p.y;
      p.x = g.x;
      p.y = g.y;
      if (this.pts.size >= 2) {
        const d = this.distance();
        if (this.pinchDist > 0 && d > 0) {
          const mid = this.midpoint();
          this.h.onPinch(d / this.pinchDist, mid.x, mid.y);
        }
        this.pinchDist = d;
        return;
      }
      if (Math.hypot(g.x - p.sx, g.y - p.sy) > DRAG_SLOP && p.timer) { clearTimeout(p.timer); p.timer = null; }
      if (!p.dragging && Math.hypot(g.x - p.sx, g.y - p.sy) > DRAG_SLOP) p.dragging = p.drag;
      if (p.dragging) this.h.onDrag(dx, dy, g.x, g.y);
    };
    const up = (e: PointerEvent) => {
      const p = this.pts.get(e.pointerId);
      this.pts.delete(e.pointerId);
      if (!p) return;
      if (p.timer) { clearTimeout(p.timer); p.timer = null; }
      if (p.long) { this.h.onLongPressEnd?.(); if (this.pts.size === 0) { this.pinched = false; this.pinchDist = 0; } return; }
      if (this.pts.size === 0) {
        const wasPinch = this.pinched;
        this.pinched = false;
        this.pinchDist = 0;
        const moved = Math.hypot(p.x - p.sx, p.y - p.sy) > DRAG_SLOP;
        if (!wasPinch && !p.dragging && !moved && this.now() - p.t < TAP_MAX_MS) this.registerTap(p.x, p.y);
      } else {
        this.pinchDist = this.pts.size >= 2 ? this.distance() : 0;
      }
    };
    const cancel = (e: PointerEvent) => {
      const p = this.pts.get(e.pointerId);
      if (p?.timer) clearTimeout(p.timer);
      if (p?.long) this.h.onLongPressEnd?.();
      this.pts.delete(e.pointerId);
      if (this.pts.size === 0) { this.pinched = false; this.pinchDist = 0; }
    };
    const wheel = (e: WheelEvent) => {
      const g = this.toGame(e.clientX, e.clientY);
      this.h.onWheel(e.deltaY, g.x, g.y);
      e.preventDefault();
    };
    this.bound = [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', cancel], ['wheel', wheel]];
    for (const [n, f] of this.bound) this.el.addEventListener(n, f, { passive: false });
  }

  detach() {
    for (const [n, f] of this.bound) this.el.removeEventListener(n, f);
    this.bound = [];
    for (const p of this.pts.values()) if (p.timer) clearTimeout(p.timer);
    this.pts.clear();
  }

  private registerTap(x: number, y: number) {
    const t = this.now();
    const last = this.lastTap;
    if (this.h.onDoubleTap && last && t - last.t <= DOUBLE_TAP_MS && Math.hypot(x - last.x, y - last.y) <= DOUBLE_TAP_DIST) {
      this.lastTap = null;
      this.h.onDoubleTap(x, y);
    } else {
      this.lastTap = { t, x, y };
      this.h.onTap(x, y);
    }
  }

  private distance(): number {
    const [a, b] = [...this.pts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private midpoint(): { x: number; y: number } {
    const [a, b] = [...this.pts.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
}

/** Spawn safety (chunk 7a E4): the ship waits for the player's first move, then eases in and is briefly untouchable. */
export const EASE_TIME = 0.25;
export const GRACE_TIME = 1.0;

/** Smoothstep ease of the ship from its start spot to the pointer: 0 at control start, 1 after EASE_TIME. */
export function easeK(t: number): number {
  const u = Math.max(0, Math.min(1, t / EASE_TIME));
  return u * u * (3 - 2 * u);
}

/** What the gate reads of the pointer. */
export interface GatePointer { x: number; y: number; active: boolean }

/**
 * Detects "the first pointer move (or press) after the run started". The first reading is only remembered (a pointer
 * parked wherever the player tapped the button is not a move); after that any change of position, or a new press,
 * fires it once. A finger that is already down when it is first seen is a press (chunk 24a: a touch press starts the run, it does not have to move).
 */
export class PointerGate {
  fired = false;
  private ref: { x: number; y: number; active: boolean } | null = null;

  /** Returns true on every call once the gate has fired. */
  observe(p: GatePointer, seen = true): boolean {
    if (this.fired) return true;
    if (!seen) return false;
    // The first reading is remembered as a pointer that is not pressed, so a finger already down when it is first seen counts as a press.
    if (!this.ref) this.ref = { x: p.x, y: p.y, active: false };
    if (p.x !== this.ref.x || p.y !== this.ref.y || (p.active && !this.ref.active)) this.fired = true;
    return this.fired;
  }
}

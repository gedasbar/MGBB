import { CONFIG } from './config';

export interface PointerState {
  /** Pointer position in GAME coordinates (0..VIEW.W, 0..VIEW.H). */
  x: number;
  y: number;
  /** True while a touch/pen is pressed. Mouse follows without a press. */
  active: boolean;
  type: string; // 'mouse' | 'pen' | 'touch'
  /** False until the first pointer event; the ship stays put until then. */
  seen: boolean;
}

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Convert a client (CSS pixel) position into game coordinates.
 * Handles any CSS scale and any letterboxing inside the element
 * (as produced by `object-fit: contain`).
 */
export function clientToGame(
  clientX: number,
  clientY: number,
  rect: RectLike,
  viewW: number = CONFIG.VIEW.W,
  viewH: number = CONFIG.VIEW.H,
): { x: number; y: number } {
  const scale = Math.min(rect.width / viewW, rect.height / viewH);
  const offX = rect.left + (rect.width - viewW * scale) / 2;
  const offY = rect.top + (rect.height - viewH * scale) / 2;
  return { x: (clientX - offX) / scale, y: (clientY - offY) / scale };
}

/** Mouse and touch only. No keyboard movement. */
export class InputManager {
  pointer: PointerState = { x: 0, y: 0, active: false, type: 'mouse', seen: false };

  constructor(private element: HTMLElement) {
    element.style.touchAction = 'none';
    element.addEventListener('pointerdown', (e) => {
      this.pointer.active = true;
      this.updatePointer(e);
    });
    // Track on window so the ship keeps following when the cursor is in the letterbox.
    window.addEventListener('pointermove', (e) => this.updatePointer(e));
    window.addEventListener('pointerup', () => { this.pointer.active = false; });
    window.addEventListener('pointercancel', () => { this.pointer.active = false; });
  }

  private updatePointer(e: PointerEvent) {
    const p = clientToGame(e.clientX, e.clientY, this.element.getBoundingClientRect());
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    this.pointer.type = e.pointerType || 'mouse';
    this.pointer.seen = true;
  }
}

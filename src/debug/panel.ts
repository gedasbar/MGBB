import { getProgressStore, PROGRESS_KEY } from '../econ/progress';
import { debugHooks } from './hooks';

/**
 * Small DOM panel shown with ?debug=1, to the left of the canvas (it never covers the game on a
 * viewport wider than the 540 px game column).
 */
export class DebugPanel {
  enabled = false;

  init() {
    if (typeof window !== 'undefined' && window.location.search.includes('debug=1')) {
      this.enabled = true;
      this.createUI();
    }
  }

  createUI() {
    const box = document.createElement('div');
    box.id = 'debug-panel';
    box.style.cssText = 'position:fixed;top:4px;left:4px;z-index:9999;display:flex;flex-direction:column;gap:3px;font:11px monospace';
    const add = (id: string, label: string, act: () => void) => {
      const b = document.createElement('button');
      b.id = id;
      b.textContent = label;
      b.style.cssText = 'font:11px monospace;padding:3px 6px;text-align:left;background:#222;color:#ccc;border:1px solid #666;cursor:pointer';
      b.addEventListener('click', act);
      box.appendChild(b);
    };
    add('dbg-credits', '+10000 credits', () => getProgressStore().addCredits(10000));
    add('dbg-reset', 'Reset progress', () => {
      try { localStorage.removeItem(PROGRESS_KEY); } catch { /* ignore */ }
      getProgressStore().reset();
      location.reload();
    });
    add('dbg-hull1', 'Set hull to 1', () => { if (debugHooks.world) debugHooks.world.hull = 1; });
    document.body.appendChild(box);
  }
}

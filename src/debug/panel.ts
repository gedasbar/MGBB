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
    // Wall levels: tier + armor/shield share, then start a test wall with the current circuit.
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:2px;border:1px solid #666;padding:3px;background:#222;color:#ccc';
    const field = (id: string, label: string, value: string, step = '1') => {
      const l = document.createElement('label');
      l.textContent = label + ' ';
      const i = document.createElement('input');
      i.id = id;
      i.type = 'number';
      i.value = value;
      i.step = step;
      i.style.cssText = 'width:52px;font:11px monospace;background:#111;color:#ccc;border:1px solid #666';
      l.appendChild(i);
      row.appendChild(l);
      return i;
    };
    const tier = field('dbg-wall-tier', 'wall tier', '1');
    const armor = field('dbg-wall-armor', 'armor frac', '0', '0.1');
    const shield = field('dbg-wall-shield', 'shield frac', '0', '0.1');
    const rows = field('dbg-wall-rows', 'rows', '8');
    const speed = field('dbg-time-scale', 'time x', '1');
    speed.addEventListener('change', () => { debugHooks.timeScale = Math.max(1, Math.min(60, Math.floor(Number(speed.value)) || 1)); });
    const start = document.createElement('button');
    start.id = 'dbg-wall-start';
    start.textContent = 'Start wall tier';
    start.style.cssText = 'font:11px monospace;padding:3px 6px;background:#222;color:#ccc;border:1px solid #666;cursor:pointer';
    start.addEventListener('click', () => {
      debugHooks.startWall?.({
        tier: Math.max(1, Math.floor(Number(tier.value)) || 1),
        armorFraction: Math.max(0, Math.min(1, Number(armor.value) || 0)),
        shieldFraction: Math.max(0, Math.min(1, Number(shield.value) || 0)),
        rows: Math.max(1, Math.floor(Number(rows.value)) || 8),
      });
    });
    row.appendChild(start);
    box.appendChild(row);
    document.body.appendChild(box);
  }
}

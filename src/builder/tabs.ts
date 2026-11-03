import { Graphics } from 'pixi.js';
import { drawTabIcon, TabIcon } from './draw';
import { LAYOUT } from './layout';
import { UIButton } from './ui';
import { THEME, UI } from '../ui/theme';
import { getProgressStore } from '../econ/progress';

const TAB_DEFS: { id: string; icon: TabIcon; label: string }[] = [
  { id: 'tabBuild', icon: 'build', label: 'Build' },
  { id: 'tabShop', icon: 'shop', label: 'Shop' },
  { id: 'tabCaptain', icon: 'captain', label: 'Captain' },
  { id: 'tabSkills', icon: 'skills', label: 'Skills' },
  { id: 'tabMap', icon: 'map', label: 'Map' },
];

/** Whether a tab shows the "something new" dot. */
export function tabHasDot(id: string): boolean {
  const store = getProgressStore();
  return id === 'tabShop' ? store.shopDot : id === 'tabSkills' ? store.skillsDot : false;
}

/** The five bottom tab buttons, shared by the Build and Shop screens. The active tab is the whole cell inverted (29a). */
export function makeTabButtons(activeId: string, onTap: (id: string) => void): UIButton[] {
  return TAB_DEFS.map((t, i) => {
    const active = t.id === activeId;
    return new UIButton({
      id: t.id, rect: { x: i * 108, y: LAYOUT.tabs.y + 1, w: 108, h: LAYOUT.tabs.h - 1 }, label: t.label, labelSize: 12, labelColor: active ? UI.color.onSelected : THEME.textDim,
      onTap: () => onTap(t.id),
      draw: (g: Graphics, b: UIButton) => {
        const on = active || b.lit;
        // Chunk 29a: the whole tab cell takes the selected fill (icon and label inverted), not a small square round the icon.
        if (on) g.rect(0, 0, b.rect.w, b.rect.h).fill(UI.color.selected);
        const ic = new Graphics();
        drawTabIcon(ic, t.icon, 24, on ? UI.color.onSelected : THEME.buttonIcon);
        ic.position.set(b.rect.w / 2, 20);
        g.addChild(ic);
        // Chunk 24a: a dot while something new waits (Shop: a block unlocked and not looked at; Skills: skill points not seen yet).
        if (tabHasDot(t.id)) g.circle(b.rect.w / 2 + 17, 5, 5).fill(THEME.good).stroke({ color: on ? UI.color.selected : THEME.bg, width: 1.5 });
      },
    });
  });
}

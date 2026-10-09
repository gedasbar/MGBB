import { Graphics } from 'pixi.js';
import { drawTabIcon, TabIcon } from './draw';
import { LAYOUT } from './layout';
import { UIButton } from './ui';
import { THEME } from '../ui/theme';

export const TAB_DEFS: { id: string; icon: TabIcon; label: string }[] = [
  { id: 'tabBuild', icon: 'build', label: 'Build' },
  { id: 'tabShop', icon: 'shop', label: 'Shop' },
  { id: 'tabCaptain', icon: 'captain', label: 'Captain' },
  { id: 'tabSkills', icon: 'skills', label: 'Skills' },
  { id: 'tabMap', icon: 'map', label: 'Map' },
];

/** The five bottom tab buttons, shared by the Build and Shop screens. The active tab is drawn inverted. */
export function makeTabButtons(activeId: string, onTap: (id: string) => void): UIButton[] {
  return TAB_DEFS.map((t, i) => {
    const active = t.id === activeId;
    return new UIButton({
      id: t.id, rect: { x: i * 108, y: LAYOUT.tabs.y + 1, w: 108, h: LAYOUT.tabs.h - 1 }, label: t.label, labelSize: 12, labelColor: active ? THEME.text : THEME.textDim,
      onTap: () => onTap(t.id),
      draw: (g: Graphics, b: UIButton) => {
        const on = active || b.lit;
        if (on) g.rect(b.rect.w / 2 - 19, 2, 38, 36).fill(THEME.pressedFill);
        const ic = new Graphics();
        drawTabIcon(ic, t.icon, 24, on ? THEME.pressedIcon : THEME.buttonIcon);
        ic.position.set(b.rect.w / 2, 20);
        g.addChild(ic);
      },
    });
  });
}

import { Container, Graphics } from 'pixi.js';
import { inRect, Rect, VIEW_H, VIEW_W } from './layout';
import { makeText } from './ui';
import { UI } from '../ui/theme';
import { drawModal, drawTabCell } from '../ui/widgets';
import { HULL_PANEL, HULL_TITLE_H } from './hullPickerLogic';

/**
 * Chunk 28b: the hub the builder's ship button opens. One panel (the old hull picker's rectangle) with three tabs at the top: SHIPS (the hull picker), CUSTOMIZATION
 * (projectile skins and trails) and ACHIEVEMENTS (achievements and challenges). Each tab is its own class; this file is the frame and the tab strip they share.
 */
export type HubTab = 'ships' | 'custom' | 'ach';
export const HUB_TABS: readonly { id: HubTab; label: string }[] = [
  { id: 'ships', label: 'SHIPS' },
  { id: 'custom', label: 'CUSTOMIZATION' },
  { id: 'ach', label: 'ACHIEVEMENTS' },
];

export const HUB_PANEL: Rect = HULL_PANEL;
export const HUB_TAB_H = HULL_TITLE_H;

/** The area of a tab's own content: the panel below the tab strip. */
/** (29b: starts `UI.hubGap` below the strip, and the scrolling content is clipped there.) */
export const hubBodyRect = (): Rect => ({ x: HUB_PANEL.x, y: HUB_PANEL.y + HUB_TAB_H + UI.hubGap, w: HUB_PANEL.w, h: HUB_PANEL.h - HUB_TAB_H - UI.hubGap });

/** The rectangle of each tab button (equal thirds of the strip). */
export function hubTabRects(): Rect[] {
  const w = HUB_PANEL.w / HUB_TABS.length;
  return HUB_TABS.map((_, i) => ({ x: HUB_PANEL.x + i * w, y: HUB_PANEL.y, w, h: HUB_TAB_H }));
}

/** The tab under a game point, or null. */
export function hubTabAt(x: number, y: number): HubTab | null {
  const i = hubTabRects().findIndex(r => inRect(r, x, y));
  return i < 0 ? null : HUB_TABS[i].id;
}

/** Draws the dimmed backdrop, the dark modal panel and the tab strip with `active` highlighted (the full active cell is light, the others raised and dark). */
export function drawHubFrame(into: Container, active: HubTab) {
  const p = HUB_PANEL;
  into.addChild(new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x000000, alpha: 0.6 }));
  into.addChild(drawModal(new Graphics(), p));
  hubTabRects().forEach((r, i) => {
    const on = HUB_TABS[i].id === active;
    into.addChild(drawTabCell(new Graphics(), r, on));
    const t = makeText(HUB_TABS[i].label, UI.text.body + 1, on ? UI.color.onSelected : UI.color.textDim, { fontWeight: 'bold' });
    t.anchor.set(0.5);
    t.position.set(r.x + r.w / 2, r.y + r.h / 2);
    into.addChild(t);
  });
  // Chunk 29b: a rule under the strip, so the tabs read as their own bar and not as part of the list.
  into.addChild(new Graphics().rect(p.x, p.y + HUB_TAB_H, p.w, 2).fill(UI.color.border));
}

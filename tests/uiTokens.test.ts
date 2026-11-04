import { describe, expect, it } from 'vitest';
import { UI } from '../src/ui/theme';
import { segmentRects } from '../src/ui/widgets';
import { hasKeyboard } from '../src/ui/touchMode';
import { HUB_TABS, hubTabRects, HUB_PANEL, HUB_TAB_H, hubBodyRect } from '../src/builder/hub';
import { hullListRect, HULL_ENTRY_H, shipyardEntryRect } from '../src/builder/hullPickerLogic';

const lum = (c: number) => ((c >> 16) & 255) * 0.299 + ((c >> 8) & 255) * 0.587 + (c & 255) * 0.114;

describe('chunk 29a UI tokens', () => {
  it('layers: the modal is the panel colour again (29b), the tiles inside it are lighter, their outline lighter still, and the selected fill is lighter than all', () => {
    expect(UI.color.modal).toBe(UI.color.panel);
    expect(lum(UI.color.modal)).toBeLessThan(lum(UI.color.tile) - 8);
    expect(lum(UI.color.tileEdge)).toBeGreaterThan(lum(UI.color.tile) + 25);
    expect(lum(UI.color.tileEdge)).toBeLessThan(lum(UI.color.selected));
    expect(lum(UI.color.selected)).toBeGreaterThan(lum(UI.color.tile) + 80);
    expect(Math.abs(lum(UI.color.onSelected) - lum(UI.color.selected))).toBeGreaterThan(100);
  });
  it('text sizes and spacing steps only go up', () => {
    const t = UI.text, s = UI.space;
    expect(t.title).toBeGreaterThan(t.header); expect(t.header).toBeGreaterThan(t.body); expect(t.body).toBeGreaterThan(t.small);
    expect(s.xs).toBeLessThan(s.s); expect(s.s).toBeLessThan(s.m); expect(s.m).toBeLessThan(s.l); expect(s.l).toBeLessThan(s.xl);
  });
  it('segmentRects tiles a control with equal, gap-free cells', () => {
    const r = segmentRects({ x: 10, y: 20, w: 300, h: 44 }, 3);
    expect(r.map(c => c.w)).toEqual([100, 100, 100]);
    expect(r.map(c => c.x)).toEqual([10, 110, 210]);
    expect(r.every(c => c.y === 20 && c.h === 44)).toBe(true);
  });
  it('the hub tab strip is three equal cells across the panel', () => {
    const rs = hubTabRects();
    expect(rs.length).toBe(HUB_TABS.length);
    expect(rs.reduce((n, r) => n + r.w, 0)).toBeCloseTo(HUB_PANEL.w);
  });
  it('a machine with no matchMedia (node, or a touch-only phone) lists no keyboard keys', () => {
    expect(hasKeyboard()).toBe(false);
  });

  it('29b: the scrolling content of every hub tab starts a gap below the tab strip and ends inside the panel', () => {
    const body = hubBodyRect();
    expect(body.y).toBe(HUB_PANEL.y + HUB_TAB_H + UI.hubGap);
    expect(UI.hubGap).toBeGreaterThan(0);
    expect(body.y + body.h).toBe(HUB_PANEL.y + HUB_PANEL.h);
    // the ships list is the same area (with its info sheet closed) below the pinned Shipyard entry (chunk 31b), so all three tabs end at the same line
    // and the Ships tab's own content starts right under its pinned entry
    expect(hullListRect(false)).toEqual({ ...body, y: body.y + HULL_ENTRY_H, h: body.h - HULL_ENTRY_H });
    expect(shipyardEntryRect().y).toBe(body.y);
  });
});

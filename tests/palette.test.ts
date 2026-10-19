import { describe, expect, it } from 'vitest';
import { pickerBlocks } from '../src/data/blocks';
import {
  badgeText, CHIP_H, chipLayout, clampScroll, cssPx, hitTile, idsForTab, INFO_SHEET_H, layoutTiles, loadTab, MIN_TOUCH_CSS,
  PALETTE_COLS, PALETTE_TABS, paletteGeometry, removeSheetContent, saveTab, scrollToReveal, sheetButtonRects, sheetContent, SheetInput,
  TAB_STORAGE_KEY, tileMetrics, visibleTiles,
} from '../src/builder/paletteLogic';
import { LAYOUT } from '../src/builder/layout';

const blocks = pickerBlocks();
const sheetBase: SheetInput = {
  id: 'flat_plus', name: 'Flat +', desc: 'Adds +1 damage.', owned: 3, available: 2, level: 1, maxLevel: 5, credits: 100,
  copyPrice: 40, upgradePrice: 120, lock: null,
};

describe('layout math', () => {
  it('always 4 columns; the tiles and gaps fill the width exactly (rounding aside) at several widths', () => {
    for (const w of [360, 540, 810, 1080]) {
      const m = tileMetrics(w);
      expect(m.cols).toBe(PALETTE_COLS);
      const used = m.cols * m.w + (m.cols + 1) * m.gap;
      expect(used).toBeLessThanOrEqual(w);
      expect(w - used).toBeLessThan(m.cols);
      expect(m.h).toBe(Math.round(m.w * 0.9));
    }
  });

  it('the real palette: 125 x 113 tiles, and every touch target is at least 44 css px at a 360 px wide phone', () => {
    const m = paletteGeometry().metrics;
    expect([m.w, m.h]).toEqual([125, 113]);
    expect(cssPx(m.w)).toBeGreaterThanOrEqual(MIN_TOUCH_CSS);
    expect(cssPx(m.h)).toBeGreaterThanOrEqual(MIN_TOUCH_CSS);
    const strip = chipLayout(LAYOUT.sheet.w, 0);
    for (const c of strip.chips) { expect(cssPx(c.h)).toBeGreaterThanOrEqual(MIN_TOUCH_CSS); expect(cssPx(c.w)).toBeGreaterThanOrEqual(MIN_TOUCH_CSS); }
    expect(cssPx(strip.close.w)).toBeGreaterThanOrEqual(MIN_TOUCH_CSS);
    const b = sheetButtonRects(paletteGeometry().sheet, ['place', 'upgrade', 'buy']);
    for (const r of Object.values(b)) { expect(cssPx(r!.h)).toBeGreaterThanOrEqual(MIN_TOUCH_CSS); expect(cssPx(r!.w)).toBeGreaterThanOrEqual(MIN_TOUCH_CSS); }
  });

  it('lays tiles out row by row and reports the content height', () => {
    const m = tileMetrics(540);
    const { tiles, contentH } = layoutTiles(blocks.map(b => b.id), m);
    expect(tiles.length).toBe(blocks.length);
    expect(tiles[0]).toMatchObject({ x: 8, y: 8 });
    expect(tiles[3].y).toBe(tiles[0].y);
    expect(tiles[4]).toMatchObject({ x: tiles[0].x, y: 8 + m.h + 8 });
    const rows = Math.ceil(blocks.length / 4);
    expect(contentH).toBe(8 + rows * (m.h + 8));
    // No overlaps.
    for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) {
      const a = tiles[i], b = tiles[j];
      expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
    }
  });

  it('an empty tab has no tiles and nothing to scroll', () => {
    const { tiles, contentH } = layoutTiles([], tileMetrics(540));
    expect(tiles).toEqual([]);
    expect(clampScroll(500, contentH, 400)).toBe(0);
  });

  it('scroll limits: clamped to [0, content - view]; a view taller than the content never scrolls', () => {
    expect(clampScroll(-30, 1000, 400)).toBe(0);
    expect(clampScroll(300, 1000, 400)).toBe(300);
    expect(clampScroll(900, 1000, 400)).toBe(600);
    expect(clampScroll(50, 300, 400)).toBe(0);
  });

  it('revealing scrolls the minimum to bring a tile fully into view', () => {
    const t = { id: 'x', x: 0, y: 600, w: 100, h: 100 };
    expect(scrollToReveal(t, 0, 400)).toBe(600 + 100 + 8 - 400);
    expect(scrollToReveal(t, 400, 400)).toBe(400);
    expect(scrollToReveal(t, 900, 400)).toBe(592);
    expect(scrollToReveal({ ...t, y: 2 }, 50, 400)).toBe(0);
  });

  it('only tiles touching the visible window are listed (culling)', () => {
    const { tiles } = layoutTiles(blocks.map(b => b.id), tileMetrics(540));
    const vis = visibleTiles(tiles, 0, 224);
    expect(vis.length).toBeGreaterThanOrEqual(8);
    expect(vis.length).toBeLessThan(tiles.length);
    expect(vis.every(t => t.y < 224)).toBe(true);
  });

  it('chips fit the width without overlapping, and the sheet, tabs and list partition the area', () => {
    const { chips, close } = chipLayout(540, 470);
    expect(chips.length).toBe(PALETTE_TABS.length);
    for (let i = 1; i < chips.length; i++) expect(chips[i].x).toBeGreaterThanOrEqual(chips[i - 1].x + chips[i - 1].w);
    expect(chips[chips.length - 1].x + chips[chips.length - 1].w).toBeLessThanOrEqual(close.x);
    expect(chips.every(c => c.h === CHIP_H && c.y === 470)).toBe(true);
    const noClose = chipLayout(540, 0, 6, 0);
    expect(noClose.chips[5].x + noClose.chips[5].w).toBeLessThanOrEqual(540);
    const g = paletteGeometry({ x: 0, y: 100, w: 540, h: 700 });
    expect(g.chipRow.h + g.listClosed.h).toBe(700);
    expect(g.listOpen.h + INFO_SHEET_H).toBe(g.listClosed.h);
    expect(g.sheet.y).toBe(g.listOpen.y + g.listOpen.h);
  });

  it('sheet buttons share the width and never overlap, for one, two or three buttons', () => {
    const info = { x: 0, y: 700, w: 540, h: INFO_SHEET_H };
    for (const ids of [['place'], ['upgrade', 'buy'], ['place', 'upgrade', 'buy']] as const) {
      const r = sheetButtonRects(info, ids);
      const list = ids.map(i => r[i]!);
      for (let i = 1; i < list.length; i++) expect(list[i].x).toBeGreaterThanOrEqual(list[i - 1].x + list[i - 1].w);
      expect(list[list.length - 1].x + list[list.length - 1].w).toBeLessThanOrEqual(540);
      expect(list.every(b => b.y + b.h <= info.y + info.h)).toBe(true);
    }
  });
});

describe('hit testing and tile -> block mapping', () => {
  const m = tileMetrics(540);
  const ids = blocks.map(b => b.id);
  const { tiles } = layoutTiles(ids, m);

  it('the centre of every tile maps back to that tile\'s block', () => {
    for (let i = 0; i < ids.length; i++) {
      const t = tiles[i];
      expect(hitTile(tiles, t.x + t.w / 2, t.y + t.h / 2)?.id).toBe(ids[i]);
    }
  });

  it('gaps, margins and points past the last tile hit nothing; a tile edge counts, the far edge does not', () => {
    expect(hitTile(tiles, 3, 3)).toBeNull();
    expect(hitTile(tiles, tiles[0].x + tiles[0].w + 2, tiles[0].y + 10)).toBeNull();
    expect(hitTile(tiles, tiles[0].x, tiles[0].y)?.id).toBe(ids[0]);
    expect(hitTile(tiles, tiles[0].x + tiles[0].w, tiles[0].y)).toBeNull();
    expect(hitTile(tiles, 10, 99999)).toBeNull();
  });
});

describe('tabs and filtering', () => {
  it('All lists every placeable block once, in data order; no passive block', () => {
    const all = idsForTab('all', blocks);
    expect(all).toEqual(blocks.filter(b => b.category !== 'passive').map(b => b.id));
    expect(new Set(all).size).toBe(all.length);
  });

  it('each category tab shows only its blocks and the tabs partition All', () => {
    const cats = PALETTE_TABS.filter(t => t !== 'all');
    const seen: string[] = [];
    for (const tab of cats) {
      const ids = idsForTab(tab, blocks);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(blocks.find(b => b.id === id)!.category).toBe(tab);
      seen.push(...ids);
    }
    expect([...seen].sort()).toEqual([...idsForTab('all', blocks)].sort());
  });

  it('an unknown category list gives an empty tab', () => {
    expect(idsForTab('pathing', [{ id: 'a', category: 'damage' }])).toEqual([]);
  });

  it('the remembered tab survives a round trip and bad values fall back to All', () => {
    const mem: Record<string, string> = {};
    const store = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
    expect(loadTab(store)).toBe('all');
    saveTab(store, 'status');
    expect(mem[TAB_STORAGE_KEY]).toBe('status');
    expect(loadTab(store)).toBe('status');
    mem[TAB_STORAGE_KEY] = 'passive';
    expect(loadTab(store)).toBe('all');
    expect(loadTab(null)).toBe('all');
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadTab(broken)).toBe('all');
    expect(() => saveTab(broken, 'damage')).not.toThrow();
  });
});

describe('badge text', () => {
  it('prints whole numbers, 99+ above 99, never negative or NaN', () => {
    expect([0, 1, 15, 99].map(badgeText)).toEqual(['0', '1', '15', '99']);
    expect([100, 5000, 1e9].map(badgeText)).toEqual(['99+', '99+', '99+']);
    expect(badgeText(-4)).toBe('0');
    expect(badgeText(NaN)).toBe('0');
    expect(badgeText(7.9)).toBe('7');
  });
});

describe('info sheet content', () => {
  it('an owned block: name, level, owned, and both buttons with the given prices', () => {
    const c = sheetContent(sheetBase);
    expect(c.title).toBe('Flat +');
    expect(c.levelLine).toBe('Level 1/5');
    expect(c.ownedLine).toBe('Owned 3');
    expect(c.lockText).toBeNull();
    expect(c.buy).toEqual({ label: 'Buy +1\n40', enabled: true });
    // 100 credits: Buy (40) is affordable, Upgrade (120) is not.
    expect(c.upgrade).toEqual({ label: 'Upgrade L1→L2\n120', enabled: false });
    expect(c.place.enabled).toBe(true);
  });

  it('the builder also reports how many copies are free to place', () => {
    expect(sheetContent({ ...sheetBase, showFree: true }).ownedLine).toBe('Owned 3 · free 2');
  });

  it('an unowned block stays buyable: owned 0, Buy enabled when affordable, Place disabled', () => {
    const c = sheetContent({ ...sheetBase, owned: 0, available: 0 });
    expect(c.ownedLine).toBe('Owned 0');
    expect(c.buy?.enabled).toBe(true);
    expect(c.place.enabled).toBe(false);
  });

  it('buttons turn off when the player cannot pay, and Upgrade says MAX at the top level', () => {
    const poor = sheetContent({ ...sheetBase, credits: 39 });
    expect(poor.buy?.enabled).toBe(false);
    expect(poor.upgrade?.enabled).toBe(false);
    expect(sheetContent({ ...sheetBase, credits: 119 }).upgrade?.enabled).toBe(false);
    expect(sheetContent({ ...sheetBase, credits: 119 }).buy?.enabled).toBe(true);
    expect(sheetContent({ ...sheetBase, credits: 120 }).upgrade?.enabled).toBe(true);
    const max = sheetContent({ ...sheetBase, level: 5, credits: 1e9 });
    expect(max.upgrade).toEqual({ label: 'Upgrade\nMAX', enabled: false });
    expect(max.levelLine).toBe('Level 5/5');
  });

  it('a locked block shows the requirement and has no buy or upgrade button', () => {
    const c = sheetContent({ ...sheetBase, owned: 0, available: 0, lock: 'Reach ring 10 North' });
    expect(c.lockText).toBe('Reach ring 10 North');
    expect(c.buy).toBeNull();
    expect(c.upgrade).toBeNull();
    expect(c.place.enabled).toBe(false);
  });

  it('large prices are abbreviated like everywhere else', () => {
    expect(sheetContent({ ...sheetBase, copyPrice: 1644 }).buy?.label).toBe('Buy +1\n1.64K');
  });

  it('the Remove tile has a Remove button and no buy / upgrade', () => {
    const c = removeSheetContent();
    expect(c.place).toEqual({ label: 'Remove', enabled: true });
    expect(c.buy).toBeNull();
    expect(c.upgrade).toBeNull();
  });
});

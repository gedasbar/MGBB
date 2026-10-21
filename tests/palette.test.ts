import { describe, expect, it } from 'vitest';
import { pickerBlocks } from '../src/data/blocks';
import {
  ALPHA_DIM, ALPHA_NORMAL, ALPHA_USED, badgeText, CATEGORY_ORDER, clampScroll, COL_GAP, cssPx, fitText, hitTile, layoutTiles, listRect,
  MIN_TOUCH_CSS, orderedBlockIds, PALETTE_COLS, PLATE, removeSheetContent, ROW_GAP, scrollToReveal, SHEET_BUTTON_H, sheetContent, sheetGeometry,
  SheetInput, TILE_H, TILE_W, tileLook, tileMetrics, visibleTiles,
} from '../src/builder/paletteLogic';

const blocks = pickerBlocks();
const ids = orderedBlockIds(blocks);
const sheetBase: SheetInput = {
  id: 'flat_plus', name: 'Flat +', desc: 'Adds +1 damage.', owned: 3, available: 2, level: 1, maxLevel: 5, credits: 100,
  copyPrice: 40, upgradePrice: 120, lock: null,
};

describe('layout maths (16e: gaps, plates, 4 per row)', () => {
  it('always 4 columns, centred, with fixed gaps; everything fits the 540 wide screen', () => {
    const m = tileMetrics(540);
    expect(m.cols).toBe(PALETTE_COLS);
    expect(m.marginX * 2 + m.cols * m.w + (m.cols - 1) * m.colGap).toBeLessThanOrEqual(540);
    expect(540 - (m.marginX * 2 + m.cols * m.w + (m.cols - 1) * m.colGap)).toBeLessThan(2);
    expect([m.w, m.h, m.plate]).toEqual([TILE_W, TILE_H, PLATE]);
    // The plate is smaller than the 85 px of the 16b tile and sits inside its box.
    expect(PLATE).toBeLessThan(85);
    expect(PLATE).toBeLessThan(TILE_W);
  });

  it('every layout number is a whole CSS pixel on a 360 px phone (multiples of 3 game px)', () => {
    const m = tileMetrics(540);
    for (const v of [m.marginX, m.marginY, m.w, m.h, m.plate, m.colGap, m.rowGap, (m.w - m.plate) / 2]) expect(v % 3).toBe(0);
    const { tiles } = layoutTiles(ids, m);
    for (const t of tiles) { expect(t.x % 3).toBe(0); expect(t.y % 3).toBe(0); }
  });

  it('every touch target is at least 44 css px at a 360 px wide phone', () => {
    const m = tileMetrics(540);
    expect(cssPx(m.w)).toBeGreaterThanOrEqual(MIN_TOUCH_CSS);
    expect(cssPx(m.h)).toBeGreaterThanOrEqual(MIN_TOUCH_CSS);
    expect(cssPx(SHEET_BUTTON_H)).toBeGreaterThanOrEqual(MIN_TOUCH_CSS);
  });

  it('lays tiles out row by row with the gaps and reports the content height', () => {
    const m = tileMetrics(540);
    const { tiles, contentH } = layoutTiles(ids, m);
    expect(tiles.length).toBe(ids.length);
    expect(tiles[0]).toMatchObject({ x: m.marginX, y: m.marginY });
    expect(tiles[3].y).toBe(tiles[0].y);
    expect(tiles[1].x - (tiles[0].x + tiles[0].w)).toBe(COL_GAP);
    expect(tiles[4]).toMatchObject({ x: tiles[0].x, y: m.marginY + m.h + ROW_GAP });
    const rows = Math.ceil(ids.length / 4);
    expect(contentH).toBe(m.marginY + rows * m.h + (rows - 1) * ROW_GAP + m.marginY);
    for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) {
      const a = tiles[i], b = tiles[j];
      expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
    }
  });

  it('an empty list has no tiles and nothing to scroll', () => {
    const { tiles, contentH } = layoutTiles([], tileMetrics(540));
    expect(tiles).toEqual([]);
    expect(contentH).toBe(0);
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
    expect(scrollToReveal(t, 0, 400)).toBe(600 + 100 + 15 - 400);
    expect(scrollToReveal(t, 400, 400)).toBe(400);
    expect(scrollToReveal(t, 900, 400)).toBe(585);
    expect(scrollToReveal({ ...t, y: 2 }, 50, 400)).toBe(0);
  });

  it('only tiles touching the visible window are listed (culling)', () => {
    const { tiles } = layoutTiles(ids, tileMetrics(540));
    const vis = visibleTiles(tiles, 0, 282);
    expect(vis.length).toBeGreaterThanOrEqual(8);
    expect(vis.length).toBeLessThan(tiles.length);
    expect(vis.every(t => t.y < 282)).toBe(true);
  });

  it('the list viewport is the area minus the sheet at its bottom', () => {
    const area = { x: 0, y: 576, w: 540, h: 384 };
    expect(listRect(area, 0)).toEqual(area);
    expect(listRect(area, 100)).toEqual({ x: 0, y: 576, w: 540, h: 284 });
  });
});

describe('hit testing with the gaps', () => {
  const m = tileMetrics(540);
  const { tiles } = layoutTiles(ids, m);

  it('the centre of every tile maps back to that tile\'s block', () => {
    for (let i = 0; i < ids.length; i++) {
      const t = tiles[i];
      expect(hitTile(tiles, t.x + t.w / 2, t.y + t.h / 2)?.id).toBe(ids[i]);
    }
  });

  it('a point in the gap between two tiles, in the margins or past the last tile hits nothing', () => {
    const a = tiles[0];
    expect(hitTile(tiles, a.x + a.w + COL_GAP / 2, a.y + 10)).toBeNull();
    expect(hitTile(tiles, a.x + 10, a.y + a.h + ROW_GAP / 2)).toBeNull();
    expect(hitTile(tiles, 3, 3)).toBeNull();
    expect(hitTile(tiles, 10, 99999)).toBeNull();
  });

  it('the edges: the first pixel of a tile hits it, the pixel after its far edge falls into the gap', () => {
    const a = tiles[0], b = tiles[1];
    expect(hitTile(tiles, a.x, a.y)?.id).toBe(ids[0]);
    expect(hitTile(tiles, a.x + a.w - 1, a.y + a.h - 1)?.id).toBe(ids[0]);
    expect(hitTile(tiles, a.x + a.w, a.y)).toBeNull();
    expect(hitTile(tiles, b.x - 1, a.y)).toBeNull();
    expect(hitTile(tiles, b.x, a.y)?.id).toBe(ids[1]);
  });
});

describe('one list, ordered by category (no tabs)', () => {
  it('lists every placeable block once, no passive, category by category, then in data order', () => {
    expect(ids.length).toBe(blocks.filter(b => b.category !== 'passive').length);
    expect(new Set(ids).size).toBe(ids.length);
    const catOf = (id: string) => blocks.find(b => b.id === id)!.category;
    const ranks = ids.map(id => CATEGORY_ORDER.indexOf(catOf(id) as (typeof CATEGORY_ORDER)[number]));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(ranks.every(r => r >= 0)).toBe(true);
    expect([...new Set(ranks)]).toEqual([0, 1, 2, 3, 4]);
    for (const cat of CATEGORY_ORDER) {
      const inData = blocks.filter(b => b.category === cat).map(b => b.id);
      expect(ids.filter(id => catOf(id) === cat)).toEqual(inData);
    }
  });

  it('sorts a shuffled input into Pathing, Damage, Modifiers, Status, Mitosis and keeps the given order inside a category', () => {
    const input = [
      { id: 'm1', category: 'mitosis' as const }, { id: 's1', category: 'status' as const }, { id: 'd2', category: 'damage' as const },
      { id: 'p1', category: 'passive' as const }, { id: 'a1', category: 'pathing' as const }, { id: 'd1', category: 'damage' as const },
      { id: 'o1', category: 'modifier' as const },
    ];
    expect(orderedBlockIds(input)).toEqual(['a1', 'd2', 'd1', 'o1', 's1', 'm1']);
  });
});

describe('tile look: count text, dimming, padlock', () => {
  it('an owned block shows its free count as plain text at full strength', () => {
    expect(tileLook({ count: 7, owned: true, locked: false })).toEqual({ alpha: ALPHA_NORMAL, count: { text: '7', faint: false }, padlock: false });
  });

  it('an owned block with none free shows a very dim 0 and a slightly dimmed plate', () => {
    expect(tileLook({ count: 0, owned: true, locked: false })).toEqual({ alpha: ALPHA_USED, count: { text: '0', faint: true }, padlock: false });
    expect(ALPHA_USED).toBeLessThan(ALPHA_NORMAL);
    expect(ALPHA_USED).toBeGreaterThan(ALPHA_DIM);
  });

  it('an unowned block is dimmed and has no count; a locked one also gets the padlock', () => {
    expect(tileLook({ count: 0, owned: false, locked: false })).toEqual({ alpha: ALPHA_DIM, count: null, padlock: false });
    expect(tileLook({ count: 0, owned: false, locked: true })).toEqual({ alpha: ALPHA_DIM, count: null, padlock: true });
  });

  it('the Remove tile (no count, always owned) is plain', () => {
    expect(tileLook({ count: null, owned: true, locked: false })).toEqual({ alpha: ALPHA_NORMAL, count: null, padlock: false });
  });

  it('counts print whole numbers, 99+ above 99, never negative or NaN', () => {
    expect([0, 1, 15, 99].map(badgeText)).toEqual(['0', '1', '15', '99']);
    expect([100, 5000, 1e9].map(badgeText)).toEqual(['99+', '99+', '99+']);
    expect(badgeText(-4)).toBe('0');
    expect(badgeText(NaN)).toBe('0');
    expect(badgeText(7.9)).toBe('7');
    expect(tileLook({ count: 250, owned: true, locked: false }).count?.text).toBe('99+');
  });
});

describe('tile names fit on one line', () => {
  const measure = (s: string) => s.length * 10;
  it('a name that fits is unchanged', () => {
    expect(fitText('Turn Left', 100, measure)).toBe('Turn Left');
  });
  it('a long name is cut with an ellipsis and never wider than the limit', () => {
    const t = fitText('Armor-Piercer Tip', 100, measure);
    expect(t.endsWith('…')).toBe(true);
    expect(measure(t)).toBeLessThanOrEqual(100);
    expect(t.length).toBeGreaterThan(3);
  });
  it('a limit too small for any letter gives just the ellipsis', () => {
    expect(fitText('Splitter', 5, measure)).toBe('…');
  });
});

describe('info sheet content', () => {
  it('an owned block: name, level, owned, and both buttons with the given prices', () => {
    const c = sheetContent(sheetBase);
    expect(c.title).toBe('Flat +');
    expect(c.levelLine).toBe('Level 1/5');
    expect(c.ownedLine).toBe('Owned 3');
    expect(c.warn).toBe(false);
    expect(c.lockText).toBeNull();
    expect(c.buy).toEqual({ label: 'Buy +1\n40', enabled: true });
    // 100 credits: Buy (40) is affordable, Upgrade (120) is not.
    expect(c.upgrade).toEqual({ label: 'Upgrade L1→L2\n120', enabled: false });
    expect(c.place.enabled).toBe(true);
  });

  it('the builder also reports how many copies are free to place', () => {
    expect(sheetContent({ ...sheetBase, showFree: true }).ownedLine).toBe('Owned 3 · free 2');
  });

  it('builder, unowned block: placing is off and the sheet says to buy it in the Shop', () => {
    const c = sheetContent({ ...sheetBase, owned: 0, available: 0, showFree: true });
    expect(c.ownedLine).toBe('Not owned · buy it in the Shop');
    expect(c.warn).toBe(true);
    expect(c.place.enabled).toBe(false);
    expect(c.place.hint).toBe('Buy Flat + in the Shop');
  });

  it('builder, locked block: placing is off and the sheet gives the unlock requirement', () => {
    const c = sheetContent({ ...sheetBase, owned: 0, available: 0, lock: 'Reach ring 10 North', showFree: true });
    expect(c.ownedLine).toBe('Locked: Reach ring 10 North');
    expect(c.warn).toBe(true);
    expect(c.place.enabled).toBe(false);
    expect(c.place.hint).toBe('Locked: Reach ring 10 North');
    expect(c.buy).toBeNull();
    expect(c.upgrade).toBeNull();
  });

  it('builder, all copies placed: placing is off with a "none left" hint', () => {
    const c = sheetContent({ ...sheetBase, owned: 2, available: 0, showFree: true });
    expect(c.ownedLine).toBe('Owned 2 · free 0');
    expect(c.place).toMatchObject({ enabled: false, hint: 'No Flat + left' });
  });

  it('a preview note is added to the status line in the warning colour', () => {
    const c = sheetContent({ ...sheetBase, showFree: true, note: 'No ejector reached' });
    expect(c.ownedLine).toBe('Owned 3 · free 2 · No ejector reached');
    expect(c.warn).toBe(true);
  });

  it('the Shop: an unowned block stays buyable (Owned 0, Buy enabled when affordable)', () => {
    const c = sheetContent({ ...sheetBase, owned: 0, available: 0 });
    expect(c.ownedLine).toBe('Owned 0');
    expect(c.warn).toBe(false);
    expect(c.buy?.enabled).toBe(true);
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

describe('info sheet geometry', () => {
  it('compact (builder): one small button at the right, vertically centred, text column beside it', () => {
    const g = sheetGeometry(540, 'compact', 2, ['place']);
    const b = g.buttons.place!;
    expect(b.h).toBe(SHEET_BUTTON_H);
    expect(b.x + b.w).toBeLessThanOrEqual(540);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.y + b.h).toBeLessThanOrEqual(g.h);
    expect(g.textW + 14 + 8).toBeLessThanOrEqual(b.x);
    expect(g.h).toBeLessThan(150);
  });

  it('grows with the description and never less than the button needs', () => {
    const one = sheetGeometry(540, 'compact', 1, ['place']);
    const four = sheetGeometry(540, 'compact', 4, ['place']);
    expect(four.h).toBeGreaterThan(one.h);
    expect(one.h).toBeGreaterThanOrEqual(SHEET_BUTTON_H + 20);
  });

  it('full (Shop): the buttons sit in a row under the text and share the width without overlap', () => {
    const g = sheetGeometry(540, 'full', 2, ['upgrade', 'buy']);
    const u = g.buttons.upgrade!, b = g.buttons.buy!;
    expect(u.y).toBe(b.y);
    expect(u.y).toBeGreaterThan(g.statusY);
    expect(b.x).toBeGreaterThanOrEqual(u.x + u.w);
    expect(b.x + b.w).toBeLessThanOrEqual(540);
    expect(b.y + b.h).toBeLessThanOrEqual(g.h);
    expect(g.textW).toBeGreaterThan(sheetGeometry(540, 'compact', 2, ['place']).textW);
  });
});

import { BLOCKS, pickerBlocks } from '../data/blocks';
import { BuilderModel } from './model';
import { LAYOUT } from './layout';
import { skillEffects } from '../skills/rules';
import { copyCap, copyPrice, maxLevelOf, upgradePrice } from '../econ/economy';
import { blockLockReason } from '../econ/progress';
import { blockText } from '../data/blockText';
import { paletteIds, REMOVE_TILE, removeSheetContent, sheetContent } from './paletteLogic';
import { PaletteSource, TilePalette } from './tilePalette';

export { REMOVE_TILE };

export interface PickerEvents {
  /** Tap on a tile (or REMOVE_TILE) that was not selected: highlight and preview it. */
  onHighlight(id: string): void;
  /** Second tap on the selected tile, place the block (or remove). */
  onPlace(id: string): void;
  onMessage(msg: string): void;
}

/**
 * The builder's bottom sheet: the shared tile palette fed with the builder's inventory. A tile tap previews the block and
 * opens its info sheet; a second tap on the tile places it (no Place button).
 */
export class Picker extends TilePalette {
  /** Tile whose preview is on the circuit. Not set by merely opening the palette. */
  armed: string | null = null;
  target: { x: number; y: number } | null = null;

  constructor() {
    super({ area: LAYOUT.sheet, buttons: [], tapAgain: 'place', panel: true });
    this.container.visible = false;
  }

  open(model: BuilderModel, target: { x: number; y: number }, events: PickerEvents) {
    this.target = target;
    this.armed = null;
    const cell = () => model.cellAt(target.x, target.y);
    const source: PaletteSource = {
      ids: () => {
        const ids = paletteIds(pickerBlocks());
        return cell()?.blockId ? [REMOVE_TILE, ...ids] : ids;
      },
      badge: (id) => (id === REMOVE_TILE ? null : model.available(id)),
      lock: (id) => blockLockReason(model.store.data, id, model.store.frontierReach),
      current: (id) => id === cell()?.blockId,
      content: (id) => {
        if (id === REMOVE_TILE) return removeSheetContent();
        const p = model.store.data;
        const level = model.levelOf(id);
        return sheetContent({
          id, name: BLOCKS[id].name, desc: blockText(BLOCKS[id], level).short, stack: blockText(BLOCKS[id], level).stack, owned: p.owned[id] ?? 0, available: model.available(id),
          level, maxLevel: maxLevelOf(id), cap: copyCap(id, skillEffects(p.skills)), credits: p.credits, copyPrice: copyPrice(id, p.owned[id] ?? 0), upgradePrice: upgradePrice(id, level),
          lock: blockLockReason(p, id, model.store.frontierReach), showFree: true,
        });
      },
    };
    this.attach(source, {
      onSelect: (id) => { this.armed = id; events.onHighlight(id); },
      onButton: (id) => events.onPlace(id),
      onMessage: (m) => events.onMessage(m),
    });
    this.selected = cell()?.blockId ?? null;
    this.build();
    if (this.selected) this.reveal(this.selected);
  }

  close() {
    this.hide();
    this.armed = null;
    this.target = null;
  }

  /** Selects a tile as the previewed one (the caller previews it on the circuit). */
  highlight(id: string) {
    this.armed = id;
    if (this.selected !== id || !this.sheetOpen) this.select(id);
  }
}

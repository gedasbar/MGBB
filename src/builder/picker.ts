import { BLOCKS, pickerBlocks } from '../data/blocks';
import { BuilderModel } from './model';
import { LAYOUT } from './layout';
import { copyPrice, maxLevelOf, upgradePrice } from '../econ/economy';
import { blockLockReason } from '../econ/progress';
import { describeBlock } from '../engine/compilerTypes';
import { orderedBlockIds, REMOVE_TILE, removeSheetContent, sheetContent } from './paletteLogic';
import { PaletteSource, TilePalette } from './tilePalette';

export { REMOVE_TILE };

export interface PickerEvents {
  /** Tap on a tile (or REMOVE_TILE) that was not selected: highlight and preview it. */
  onHighlight(id: string): void;
  /** Second tap on the selected tile, or the sheet's Place / Remove button: place the block (or remove). */
  onPlace(id: string): void;
  onMessage(msg: string): void;
}

/** The note shown on the sheet when a previewed block leaves the circuit without an ejector. */
export const NO_EJECTOR_NOTE = 'No ejector reached';

/**
 * The builder's bottom sheet: the shared tile palette fed with the builder's inventory. A tile tap previews the block and
 * opens its info sheet; a second tap on the tile (or the sheet's small Place button) places it. Unowned and locked blocks are
 * listed too (dimmed) but cannot be placed: their sheet says where to get them.
 */
export class Picker extends TilePalette {
  /** Tile whose preview is on the circuit. Not set by merely opening the palette. */
  armed: string | null = null;
  target: { x: number; y: number } | null = null;
  /** Previewed blocks whose circuit reaches no ejector (their sheet carries a warning). */
  private noEjector = new Set<string>();

  constructor() {
    super({ area: LAYOUT.sheet, buttons: ['place'], tapAgain: 'place', panel: true });
    this.container.visible = false;
  }

  open(model: BuilderModel, target: { x: number; y: number }, events: PickerEvents) {
    this.target = target;
    this.armed = null;
    this.noEjector.clear();
    const cell = () => model.cellAt(target.x, target.y);
    const source: PaletteSource = {
      ids: () => {
        const ids = orderedBlockIds(pickerBlocks());
        return cell()?.blockId ? [REMOVE_TILE, ...ids] : ids;
      },
      count: (id) => (id === REMOVE_TILE ? null : model.available(id)),
      owned: (id) => (model.store.data.owned[id] ?? 0) > 0,
      lock: (id) => blockLockReason(model.store.data, id, model.store.frontierReach),
      content: (id) => {
        if (id === REMOVE_TILE) return removeSheetContent();
        const p = model.store.data;
        const level = model.levelOf(id);
        return sheetContent({
          id, name: BLOCKS[id].name, desc: describeBlock(BLOCKS[id], level), owned: p.owned[id] ?? 0, available: model.available(id),
          level, maxLevel: maxLevelOf(id), credits: p.credits, copyPrice: copyPrice(id, p.owned[id] ?? 0), upgradePrice: upgradePrice(id, level),
          lock: blockLockReason(p, id, model.store.frontierReach), showFree: true, note: this.noEjector.has(id) ? NO_EJECTOR_NOTE : null,
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

  /** Marks whether the circuit with this block previewed reaches an ejector; the sheet warns when it does not. */
  setPreviewReach(id: string, reaches: boolean) {
    if (reaches) this.noEjector.delete(id); else this.noEjector.add(id);
  }

  /** Selects a tile as the previewed one (the caller previews it on the circuit). */
  highlight(id: string) {
    this.armed = id;
    if (this.selected !== id || !this.sheetOpen) this.select(id);
    else this.build();
  }
}

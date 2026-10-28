import { describe, expect, it } from 'vitest';
import blocksDoc from '../docs/blocks.md?raw';
import { BLOCKS, pickerBlocks } from '../src/data/blocks';
import { blockText, SHORT_MAX, STACK_MAX } from '../src/data/blockText';
import { describeBlock } from '../src/engine/compilerTypes';

/** Game px of one character of the info sheet's 12 px body font is at most 7 (bold sans), the sheet text is 520 px wide: 74 characters. */
describe('player block texts (19b)', () => {
  const levels = (id: string) => Array.from({ length: BLOCKS[id].maxLevel }, (_, i) => i + 1);

  it('every shown block has a short line of at most 60 characters at every level, one sentence, and no empty text', () => {
    for (const b of pickerBlocks()) {
      for (const l of levels(b.id)) {
        const { short } = blockText(b, l);
        expect(short.length, `${b.id} L${l}: "${short}"`).toBeGreaterThan(8);
        expect(short.length, `${b.id} L${l}: "${short}" (${short.length})`).toBeLessThanOrEqual(SHORT_MAX);
        expect(short, b.id).not.toMatch(/undefined|NaN|\[object/);
      }
    }
  });
  it('stacking blocks have a stacking line of at most 40 characters, the others have none', () => {
    const stackers = ['piercing', 'bouncing', 'aoe_circle', 'aoe_rect', 'chain_lightning', 'homing', 'fork_impact', 'boomerang', 'orbit', 'mine'];
    for (const b of pickerBlocks()) {
      const { stack } = blockText(b, 1);
      if (stackers.includes(b.id)) {
        expect(stack, b.id).not.toBeNull();
        expect(stack!.length, `${b.id}: "${stack}"`).toBeLessThanOrEqual(STACK_MAX);
      } else expect(stack, b.id).toBeNull();
    }
  });
  it('the short text is shorter than the technical text it replaces, and level numbers still show', () => {
    for (const b of pickerBlocks()) expect(blockText(b, b.fixedLevel ?? 1).short.length, b.id).toBeLessThanOrEqual(describeBlock(b, b.fixedLevel ?? 1).length);
    expect(blockText(BLOCKS.flat_plus, 3).short).toContain('+3');
    expect(blockText(BLOCKS.percent_mult, 1).short).toContain('1.5');
    expect(blockText(BLOCKS.lucky_strike, 2).short).toContain('38%');
  });
  it('docs/blocks.md lists every shown block with its short text (npm run blocks-doc)', () => {
    const doc = blocksDoc;
    for (const b of pickerBlocks()) {
      expect(doc, b.id).toContain(`| ${b.name} |`);
      expect(doc, b.id).toContain(blockText(b, b.fixedLevel ?? 1).short);
    }
  });
});

// Chunk 34c: the pure layout of an "amount" (icon + number). No Pixi here so the rule can be unit-tested: the icon and the number are
// centred on the SAME horizontal line (y = 0), the icon size comes from the text size (the 34b rule: 0.8 x the font size, at least 10 px).

export type AmountKind = 'credits' | 'cores' | 'medals';
/** One price or balance: the currency and the text of the number ("1.2K"). */
export interface Cost { kind: AmountKind; text: string }

/** Icon size = this x the font size. */
export const AMOUNT_ICON_RATIO = 0.8;
export const AMOUNT_ICON_MIN = 10;
/** Gap between the prefix, the icon and the number. */
export const AMOUNT_GAP = 5;
/** Gap around the "+" of a two-currency price. */
export const AMOUNT_PLUS_GAP = 6;
/**
 * Digits sit a little off the centre of a text box (the box holds room for accents and descenders). The number's anchor y is
 * 0.5 + this x nothing: measured in the browser (sheet `e2e/sheet-chunk34c.cjs`, chunk 34c report) the digit centre of Arial is within a
 * pixel of the box centre, so the nudge is a fraction of the font size and is 0 unless a measurement says otherwise.
 */
export const AMOUNT_DIGIT_NUDGE = 0;

export const amountIconSize = (fontSize: number): number => Math.max(AMOUNT_ICON_MIN, Math.round(fontSize * AMOUNT_ICON_RATIO));

export interface AmountLayoutInput { fontSize: number; textW: number; prefixW?: number; align?: 'left' | 'center' | 'right' }
export interface AmountLayout {
  iconSize: number;
  /** x of the prefix (when there is one), the icon's left edge and the number's left edge. */
  prefixX: number; iconX: number; textX: number;
  /** y of the icon's TOP edge; its centre is `iconCentreY`. */
  iconTop: number; iconCentreY: number;
  /** y the number is anchored at with anchor.y = 0.5 (its centre line). */
  textCentreY: number;
  width: number;
}

/** Positions for one amount; the row is centred on y = 0 and `align` says which end of the row x = 0 is. */
export function amountLayout(o: AmountLayoutInput): AmountLayout {
  const iconSize = amountIconSize(o.fontSize);
  const hasPrefix = (o.prefixW ?? 0) > 0;
  const iconX0 = hasPrefix ? o.prefixW! + AMOUNT_GAP : 0;
  const textX0 = iconX0 + iconSize + AMOUNT_GAP;
  const width = textX0 + o.textW;
  const shift = o.align === 'right' ? -width : o.align === 'center' ? -width / 2 : 0;
  const nudge = AMOUNT_DIGIT_NUDGE * o.fontSize;
  return {
    iconSize, prefixX: shift, iconX: iconX0 + shift, textX: textX0 + shift,
    iconTop: -iconSize / 2, iconCentreY: 0, textCentreY: nudge, width,
  };
}

/** Widths of a row of costs separated by "+" (each is icon + number); returns the left x of each cost, the row centred on 0. */
export function costRowLayout(widths: readonly number[], plusW: number): { xs: number[]; plusXs: number[]; width: number } {
  const xs: number[] = [], plusXs: number[] = [];
  let x = 0;
  widths.forEach((w, i) => {
    if (i > 0) { x += AMOUNT_PLUS_GAP; plusXs.push(x); x += plusW + AMOUNT_PLUS_GAP; }
    xs.push(x); x += w;
  });
  return { xs: xs.map(v => v - x / 2), plusXs: plusXs.map(v => v - x / 2), width: x };
}

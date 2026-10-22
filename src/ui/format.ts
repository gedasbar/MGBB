/** Suffixes of the compact format; above the last one numbers switch to scientific notation (1.2e45). */
const SUFFIXES = ['', 'K', 'M', 'B', 'T'];
const INFINITY_SIGN = '∞';

/** Mantissa of 3 significant digits with trailing zeros dropped (1.50 -> 1.5, 120 -> 120). */
function mantissa(x: number): string {
  const digits = x >= 100 ? 0 : x >= 10 ? 1 : 2;
  const t = x.toFixed(digits);
  return t.includes('.') ? t.replace(/\.?0+$/, '') : t; // only after a decimal point: 950 stays 950
}

/**
 * The compact form of a non-negative finite number of at least 1000: 12.3K, 4.56M, 7.8B, 950T, then scientific (1.2e45).
 * Never prints "Infinity" or "NaN" (those cases are handled by the callers).
 */
function compact(v: number): string {
  let i = 0;
  let x = v;
  while (x >= 1000 && i < SUFFIXES.length - 1) { x /= 1000; i++; }
  if (x >= 1000) {
    // Past T: scientific notation, one decimal of mantissa (1.2e45).
    const [m, e] = v.toExponential(1).split('e');
    return `${m.replace(/\.0$/, '')}e${e.replace('+', '')}`;
  }
  const s = mantissa(x);
  // 999.6K rounds to 1000K: carry into the next suffix.
  if (s === '1000' && i < SUFFIXES.length - 1) return `1${SUFFIXES[i + 1]}`;
  return s + SUFFIXES[i];
}

/**
 * A damage number as the player reads it (chunk 14a): whole numbers plain, anything else with one decimal (1.5, 0.3).
 * From 1000 up the compact form (chunk 16c-2). NaN prints 0, infinity prints the infinity sign.
 */
export function fmtDamage(n: number): string {
  if (Number.isNaN(n)) return '0';
  if (!Number.isFinite(n)) return n < 0 ? `-${INFINITY_SIGN}` : INFINITY_SIGN;
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1000) return sign + compact(a);
  const r = Math.round(a * 10) / 10;
  if (r >= 1000) return `${sign}1${SUFFIXES[1]}`;   // 999.96 rounds to 1000
  return sign + (Math.abs(r - Math.round(r)) < 1e-9 ? String(Math.round(r)) : r.toFixed(1));
}

/** Compact big-number format for currency, prices and counts: 950, 12.3K, 4.56M, 7.8B, 950T, 1.2e45. Whole numbers below 1000. */
export function fmtBig(n: number): string {
  if (Number.isNaN(n)) return '0';
  if (!Number.isFinite(n)) return n < 0 ? `-${INFINITY_SIGN}` : INFINITY_SIGN;
  const sign = n < 0 ? '-' : '';
  const v = Math.floor(Math.abs(n));
  if (v < 1000) return sign + String(v);
  return sign + compact(v);
}

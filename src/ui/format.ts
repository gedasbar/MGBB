/** A damage number as the player reads it (chunk 14a): whole numbers plain, anything else with one decimal (1.5, 0.3). */
export function fmtDamage(n: number): string {
  if (!isFinite(n)) return '0';
  const r = Math.round(n * 10) / 10;
  return Math.abs(r - Math.round(r)) < 1e-9 ? String(Math.round(r)) : r.toFixed(1);
}

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];

/** Compact big-number format for currency and prices: 950, 12.3K, 4.56M. Integers below 1000 are printed whole. */
export function fmtBig(n: number): string {
  if (!isFinite(n)) return '0';
  const sign = n < 0 ? '-' : '';
  const v = Math.floor(Math.abs(n));
  if (v < 1000) return sign + String(v);
  let i = 0;
  let x = v;
  while (x >= 1000 && i < SUFFIXES.length - 1) { x /= 1000; i++; }
  const digits = x >= 100 ? 0 : x >= 10 ? 1 : 2;
  // Zeros are only trimmed after a decimal point (before 16e "140K" lost its zero and printed "14K").
  const fixed = x.toFixed(digits);
  const s = fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
  return sign + s + SUFFIXES[i];
}

/**
 * A circuit stat as the stats strip prints it (16e): small values as before (whole, or one decimal), anything from 1000 up in
 * K / M / B form with its sign (140K, -2.4M). The same rule as fmtBig, which keeps two digits for values under 100K.
 */
export function fmtStat(n: number): string {
  if (!isFinite(n)) return '0';
  if (Math.abs(n) < 1000) {
    const r = Math.abs(n - Math.round(n)) < 0.005 ? String(Math.round(n)) : n.toFixed(1);
    return r === '-0' ? '0' : r;
  }
  return fmtBig(n);
}

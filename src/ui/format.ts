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
  const s = x.toFixed(digits).replace(/\.?0+$/, '');
  return sign + s + SUFFIXES[i];
}

// Chunk 35a: "which day is it" for the daily quests and the daily run. Pure functions of a timestamp, plus one tiny clock that the debug panel can push forward.
// A day is the player's LOCAL calendar day: it ends at local midnight (so a daylight-saving day is 23 or 25 hours long, which is correct).

/** "2026-11-07": the local calendar day of `ms`. Sorts as text in date order. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** True for a well-formed key of a real date (used to sanitize saves). */
export function isDayKey(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
}

/** The local midnight that starts the next day, in ms. */
export function nextMidnight(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

/** The key of the day `n` days before (or after, for negative n) the day `key`, by calendar (never by 24-hour steps). */
export function shiftDay(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - n).getTime());
}

/** Whole days from key `a` to key `b` by calendar (b later = positive). */
export function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

/** "5h 12m" / "12m 03s" until the reset, for the countdown on the Daily screen. */
export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

/** A 32-bit seed from a day key (FNV-1a on the text). The same key always gives the same seed; neighbouring days give unrelated ones. */
export function seedOfDay(key: string, salt = ''): number {
  let h = 0x811c9dc5;
  const s = `${key}|${salt}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return h >>> 0;
}

/** Debug: days the clock has been pushed forward ("Next day" in the debug panel). Only the debug panel ever sets it; it is never saved. */
let offsetDays = 0;
export const setDayOffset = (n: number): void => { offsetDays = Math.max(0, Math.floor(n)); };
export const getDayOffset = (): number => offsetDays;

/** The game's "now": the real time, plus the debug offset. Everything daily reads time through this. */
export function gameNow(): number {
  if (offsetDays === 0) return Date.now();
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetDays, d.getHours(), d.getMinutes(), d.getSeconds()).getTime();
}

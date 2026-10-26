/**
 * Checks one hull layout (see data/hullLayouts.ts) and returns every mistake as a plain-language sentence; an empty list means
 * the layout is fine. Rows and columns are counted from 1, from the top-left corner of the layout.
 */
export interface HullExpect { cells: number; ejectors: number }

export function validateHullLayout(name: string, rows: string[], expect?: HullExpect): string[] {
  const out: string[] = [];
  const bad = (msg: string) => out.push(`${name}: ${msg}`);
  if (rows.length === 0) { bad('the layout has no rows'); return out; }
  const w = rows[0].length;
  rows.forEach((r, y) => { if (r.length !== w) bad(`row ${y + 1} has ${r.length} characters but row 1 has ${w}; every row must be the same length`); });
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (!'._GE'.includes(ch)) bad(`the character "${ch}" at row ${y + 1}, column ${x + 1} is not allowed; use only _ . G E`);
  }));
  const at = (x: number, y: number) => (y >= 0 && y < rows.length && x >= 0 && x < rows[y].length ? rows[y][x] : '.');
  const count = (ch: string) => rows.join('').split(ch).length - 1;
  const gens = count('G');
  if (gens !== 1) bad(`needs exactly 1 generator (G), found ${gens}`);
  const gy = rows.findIndex(r => r.includes('G'));
  if (gy >= 0 && gy !== rows.length - 1) bad(`the generator (G) is on row ${gy + 1} but must be on the bottom row, row ${rows.length}`);
  if (gens === 1) {
    const gx = rows[gy].indexOf('G');
    if (at(gx, gy - 1) === '.') bad(`the cell above the generator (row ${gy}, column ${gx + 1}) must be part of the hull, the signal only leaves upward`);
    const seen = new Set<string>();
    const stack: [number, number][] = [[gx, gy]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (at(x, y) === '.' || seen.has(`${x},${y}`)) continue;
      seen.add(`${x},${y}`);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      if (ch !== '.' && !seen.has(`${x},${y}`)) bad(`the cell at row ${y + 1}, column ${x + 1} cannot be reached from G`);
    }));
  }
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === 'E' && at(x, y - 1) !== '.') bad(`the ejector (E) at row ${y + 1}, column ${x + 1} has a cell above it; nothing may sit above an ejector`);
  }));
  if (expect) {
    if (count('E') !== expect.ejectors) bad(`needs ${expect.ejectors} ejectors, found ${count('E')}`);
    if (count('_') !== expect.cells) bad(`needs ${expect.cells} buildable cells (_), found ${count('_')}`);
  }
  return out;
}

/**
 * HULL LAYOUTS - the shape of every hull, all in one place, listed in price order (cheapest first).
 *
 * How to read a layout (rows are listed top to bottom, one text line per row, all rows of a hull the same length):
 *   _  = buildable cell (you can put a block here)
 *   .  = outside the hull (nothing here, the signal cannot pass)
 *   G  = generator (exactly one, on the bottom row; it fires the signal upward)
 *   E  = ejector (where a shot leaves the ship; nothing buildable may sit above one)
 *
 * Every cell must be reachable from G, and the cell right above G must be part of the hull. The test
 * tests/hulls.test.ts checks this and explains mistakes in plain words. Prices and speeds are in hulls.ts;
 * how to edit is in docs/EDITING.md.
 */

// Dart - idea: TODO
const DART_ROWS = [
  'E',
  '_',
  'G',
];

// Twin - idea: TODO
const TWIN_ROWS = [
  'E',
  '_',
  '_',
  'G',
];

// Prong - idea: TODO
const PRONG_ROWS = [
  'E.E',
  '___',
  'G..',
];

// Wisp - idea: TODO
const WISP_ROWS = [
  'E',
  '_',
  '_',
  '_',
  '_',
  '_',
  'G',
];

// Hornet - idea: TODO
const HORNET_ROWS = [
  'E...E',
  '_..._',
  '_..._',
  '_____',
  '..G..',
];

// Lancet - idea: TODO
const LANCET_ROWS = [
  '...E',
  '..._',
  '____',
  '_...',
  '_...',
  'G...',
];

// Kestrel - idea: TODO
const KESTREL_ROWS = [
  'EEE',
  '___',
  '___',
  '___',
  '___',
  '.G.',
];

// Mantis - idea: TODO
const MANTIS_ROWS = [
  '.....E',
  '______',
  '__..._',
  '__....',
  '__....',
  '_.....',
  'G.....',
];

// Bastion - idea: TODO
const BASTION_ROWS = [
  'E.E.E.E',
  '_______',
  '_______',
  '..____.',
  '...G...',
];

// Halberd - idea: TODO
const HALBERD_ROWS = [
  '..E...',
  'E.__.E',
  '______',
  '..__..',
  '..__..',
  '.____.',
  '..__..',
  '..__..',
  '..__..',
  '..G...',
];

// Corvette - idea: TODO
const CORVETTE_ROWS = [
  '..E.E..',
  '._____.',
  '_______',
  '_______',
  '._____.',
  '...__..',
  '...G...',
];

// Trident - idea: TODO
const TRIDENT_ROWS = [
  '...E...',
  'E.._..E',
  '_.._.._',
  '_.._.._',
  '_.._.._',
  '_.._.._',
  '_.._.._',
  '_______',
  '_______',
  '...G...',
];

// Galleon - idea: TODO
const GALLEON_ROWS = [
  'E.E.E.E.E',
  '_________',
  '_________',
  '_________',
  '.._____..',
  '...___...',
  '...._....',
  '....G....',
];

// Shuttle - idea: TODO
const SHUTTLE_ROWS = [
  '...........',
  '....._..E..',
  '.._______..',
  '.._____._..',
  '.._____._..',
  '.._____._..',
  '.._____._..',
  '.._______..',
  '.._______..',
  '....._.....',
  '.....G.....',
];

// Spire - idea: TODO
const SPIRE_ROWS = [
  '...E.E...',
  '...___...',
  '...___...',
  '...___...',
  '...___...',
  '.EE___EE.',
  '._______.',
  '._______.',
  '._______.',
  '...___...',
  '...___...',
  '....G....',
];

// Leviathan - idea: TODO
const LEVIATHAN_ROWS = [
  '....E....',
  '...___...',
  '...___...',
  'E.E___...',
  '______...',
  '______...',
  '______E..',
  '_________',
  '_________',
  '...____..',
  '...___...',
  '...___...',
  '....G....',
];

// Fan - idea: TODO
const FAN_ROWS = [
  '.E..E..E.',
  '_________',
  '_________',
  '_________',
  '_________',
  '_________',
  '_________',
  '_________',
  '_________',
  '....G....',
];

// Citadel - idea: TODO
const CITADEL_ROWS = [
  '.EEEEEEEE.',
  '__________',
  '__________',
  '___....___',
  '___....___',
  '___....___',
  '___....___',
  '__________',
  '__________',
  '....G.....',
];

// Zenith - idea: TODO
const ZENITH_ROWS = [
  'EEEEE.EEEEE',
  '___________',
  '___________',
  '___________',
  '___________',
  '___________',
  '._________.',
  '.._______..',
  '..._____...',
  '....___....',
  '....._.....',
  '.....G.....',
];

/** Layout rows of every hull, by id. */
export const HULL_ROWS: Record<string, string[]> = {
  dart: DART_ROWS,
  twin: TWIN_ROWS,
  prong: PRONG_ROWS,
  wisp: WISP_ROWS,
  hornet: HORNET_ROWS,
  lancet: LANCET_ROWS,
  kestrel: KESTREL_ROWS,
  mantis: MANTIS_ROWS,
  bastion: BASTION_ROWS,
  halberd: HALBERD_ROWS,
  corvette: CORVETTE_ROWS,
  trident: TRIDENT_ROWS,
  galleon: GALLEON_ROWS,
  shuttle: SHUTTLE_ROWS,
  spire: SPIRE_ROWS,
  leviathan: LEVIATHAN_ROWS,
  fan: FAN_ROWS,
  citadel: CITADEL_ROWS,
  zenith: ZENITH_ROWS,
};

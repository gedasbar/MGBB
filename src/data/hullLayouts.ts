/**
 * Layouts of the hulls added by the 17a ladder (drawn in docs/hull-ladder.md). Legend as in game/gridUtils.ts: `.` outside,
 * `_` buildable, `G` generator, `E` ejector. Rows are listed top to bottom; the generator is always on the bottom row.
 */
export const WISP_ROWS = ['E', '_', '_', '_', '_', '_', 'G'];

export const HORNET_ROWS = [
  'E...E',
  '_..._',
  '_..._',
  '_____',
  '..G..',
];

export const LANCET_ROWS = [
  '...E',
  '..._',
  '____',
  '_...',
  '_...',
  'G...',
];

export const KESTREL_ROWS = [
  'EEE',
  '___',
  '___',
  '___',
  '___',
  '.G.',
];

export const MANTIS_ROWS = [
  '.....E',
  '______',
  '__..._',
  '__....',
  '__....',
  '_.....',
  'G.....',
];

export const BASTION_ROWS = [
  'E.E.E.E',
  '_______',
  '_______',
  '..____.',
  '...G...',
];

export const HALBERD_ROWS = [
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

export const CORVETTE_ROWS = [
  '..E.E..',
  '.#####.',
  '#######',
  '#######',
  '.#####.',
  '...##..',
  '...G...',
].map(r => r.replace(/#/g, '_'));

export const TRIDENT_ROWS = [
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

export const GALLEON_ROWS = [
  'E.E.E.E.E',
  '#########',
  '#########',
  '#########',
  '..#####..',
  '...###...',
  '....#....',
  '....G....',
].map(r => r.replace(/#/g, '_'));

export const SPIRE_ROWS = [
  '...E.E...',
  '...###...',
  '...###...',
  '...###...',
  '...###...',
  '.EE###EE.',
  '.#######.',
  '.#######.',
  '.#######.',
  '...###...',
  '...###...',
  '....G....',
].map(r => r.replace(/#/g, '_'));

export const LEVIATHAN_ROWS = [
  '....E....',
  '...###...',
  '...###...',
  'E.E###...',
  '######...',
  '######...',
  '######E..',
  '#########',
  '#########',
  '...####..',
  '...###...',
  '...###...',
  '....G....',
].map(r => r.replace(/#/g, '_'));

export const CITADEL_ROWS = [
  '.EEEEEEEE.',
  '##########',
  '##########',
  '###....###',
  '###....###',
  '###....###',
  '###....###',
  '##########',
  '##########',
  '....G.....',
].map(r => r.replace(/#/g, '_'));

export const ZENITH_ROWS = [
  'EEEEE.EEEEE',
  '###########',
  '###########',
  '###########',
  '###########',
  '###########',
  '.#########.',
  '..#######..',
  '...#####...',
  '....###....',
  '.....#.....',
  '.....G.....',
].map(r => r.replace(/#/g, '_'));

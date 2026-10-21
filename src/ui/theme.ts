/** Single source of UI colours and style constants (grey theme). Hull art, block categories and the red signal line stay in builder/draw.ts. */
/** Block category colours (picker headers, plates, shop strips). Status is a teal that no other category uses. */
export const CATEGORY_COLOR: Record<string, number> = {
  pathing: 0x59b9ff,
  damage: 0xff7a5c,
  modifier: 0xd27bff,
  status: 0x22d3b0,
  mitosis: 0xffd24d,
  passive: 0xb0b0b0,
};

export const THEME = {
  bg: 0x1c1c1e,
  panel: 0x2a2a2d,
  border: 0x3d3d41,
  buttonFill: 0x3a3a3e,
  buttonLine: 0xe6e6e6,
  buttonIcon: 0xe6e6e6,
  pressedFill: 0xe6e6e6,
  pressedIcon: 0x2a2a2d,
  disabled: 0x77777c,
  text: 0xe6e6e6,
  textDim: 0xa0a0a6,
  currency: 0xf2c230,
  select: 0xffffff,
  selectWidth: 2,
  warn: 0xe0a030,
  good: 0x6fbf73,
  bad: 0xd96a5a,
  cellFill: 0x3a3a3d,
  cellGap: 0x2a2a2d,
  dim: 0x000000,
  voidFill: 0x161618,
  hullPanel: 0x2a2a2d,
  hullDark: 0x161618,
  bulletCasing: 0xd4d4d8,
  bulletTip: 0x8c8c92,
  reactorOuter: 0x55555a,
  reactorMid: 0x8c8c92,
  plateOuter: 0x55555a,
  plateFace: 0x26262a,
  /** Flat plate of a palette tile (16e). */
  tilePlate: 0x38383c,
  /** Quiet grey of tile names and counts (16e). */
  tileText: 0x8c8c92,
  mark: 0xd4d4d8,
  markEdge: 0x161618,
} as const;

/** Single source of UI colours and style constants (grey theme). Hull art, block categories and the red signal line stay in builder/draw.ts. */
/** Block category colours (picker headers, plates, shop strips). Status is a teal that no other category uses. */
export const CATEGORY_COLOR: Record<string, number> = {
  pathing: 0x59b9ff,
  damage: 0xff7a5c,
  modifier: 0xd27bff,
  status: 0x22d3b0,
  mitosis: 0xffd24d,
  legendary: 0xa8e63d,
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
  mark: 0xd4d4d8,
  markEdge: 0x161618,
} as const;

/**
 * Chunk 29a: the shared UI rules. Every screen and overlay takes its colours, text sizes and spacing from here and draws buttons, tabs, segmented controls and toggles
 * with the helpers in `widgets.ts`. Layers, darkest to lightest: `modal` = `panel` (a hub, Settings, a dialog or a screen's own boxes) < `tile` (anything tappable inside
 * a modal, with a lighter `tileEdge` outline). `selected` is the inverted look (light fill, dark text) used for the active tab, segment, tile and ticked box.
 */
export const UI = {
  color: {
    page: THEME.bg,
    /** Chunk 29b: back to the panel colour (29a had made it darker). */
    modal: THEME.panel,
    panel: THEME.panel,
    tile: 0x38383c,
    /** Chunk 29b: the thin outline of a tile inside a hub / modal (lighter than the tile and the tab cells, so a tile reads as its own box). */
    tileEdge: 0x77777d,
    tilePressed: 0x4a4a4f,
    selected: THEME.pressedFill,
    onSelected: THEME.pressedIcon,
    border: 0x4d4d52,
    text: THEME.text,
    textDim: THEME.textDim,
    disabled: THEME.disabled,
    accent: THEME.currency,
    /** Chunk 32d: Cores, the Shipyard's currency, are teal everywhere (never the yellow of credits, never a shot colour). */
    cores: 0x3fc9b8,
    /** Chunk 34c: Medals have their own warm orange (they used to share the yellow of credits). */
    medal: 0xf08a3c,
    good: THEME.good,
  },
  /** Text sizes in game px (the game is 540 wide): title / section header / body / small. */
  text: { title: 24, header: 17, body: 14, small: 12 },
  /** Spacing steps. */
  space: { xs: 4, s: 8, m: 12, l: 16, xl: 24 },
  /** Heights of the shared controls. */
  control: { button: 48, segment: 44, tab: 44, checkbox: 40 },
  stroke: { thin: 1.5, thick: 2 },
  /** Chunk 29b: the hub keeps this many px of plain panel between the tab strip and the scrolling content (content is clipped at the gap's lower edge). */
  hubGap: 8,
} as const;

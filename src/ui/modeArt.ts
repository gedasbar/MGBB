import { Container, Graphics } from 'pixi.js';
import { MapMode } from '../map/constants';
import { UI } from './theme';
import { WALL_HP_COLORS } from './wallBlockLook';

/** Chunk 29b: the small picture on each carousel card, in the art language (sharp, flat, no glow). Drawn once; `tick` moves a few parts (cheap: a handful of transforms). */
export interface ModeArt { container: Container; tick(seconds: number): void }

const W = 240;
const H = 200;

function campaignArt(): ModeArt {
  const c = new Container();
  const g = new Graphics();
  const cols = 8, rows = 5, cell = 26, gap = 3;
  const x0 = -(cols * (cell + gap) - gap) / 2, y0 = -H / 2 + 6;
  // A wall with a lane carved up the middle: cells missing in column 3-4 of the lower rows.
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    if ((k === 3 || k === 4) && r >= 1) continue;
    const band = r < 2 ? 3 : r < 4 ? 2 : 1;
    g.rect(x0 + k * (cell + gap), y0 + r * (cell + gap), cell, cell).fill(WALL_HP_COLORS[band]);
    g.rect(x0 + k * (cell + gap) + 4, y0 + r * (cell + gap) + 4, cell - 8, cell - 8).fill(0x26262a);
  }
  const ship = new Graphics().poly([0, -18, 11, 14, 0, 8, -11, 14]).fill(0xd4d4d8).poly([0, -6, 4, 6, -4, 6]).fill(0x55555a);
  ship.position.set(0, H / 2 - 16);
  const shots = new Graphics();
  c.addChild(g, shots, ship);
  return {
    container: c,
    tick(t) {
      // Three shots climb the lane and start again.
      shots.clear();
      for (let i = 0; i < 3; i++) {
        const f = ((t * 0.7 + i / 3) % 1);
        shots.rect(-2, H / 2 - 40 - f * (H - 70), 4, 12).fill(0x7fe3f5);
      }
    },
  };
}

function frontierArt(): ModeArt {
  const c = new Container();
  const g = new Graphics();
  const n = 7, cell = 26, gap = 3, x0 = -(n * (cell + gap) - gap) / 2, y0 = -(n * (cell + gap) - gap) / 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.max(Math.abs(x - 3), Math.abs(y - 3));
    if ((x * 5 + y * 3) % 11 === 0 && d > 1) continue; // holes
    const fill = d === 0 ? 0xb9a8f0 : d === 1 ? 0x8d7fcf : 0x26262a;
    g.rect(x0 + x * (cell + gap), y0 + y * (cell + gap), cell, cell).fill(fill);
    if ((x === 5 && y === 1) || (x === 1 && y === 5)) g.circle(x0 + x * (cell + gap) + cell / 2, y0 + y * (cell + gap) + cell / 2, 6).fill(UI.color.accent);
  }
  const sel = new Graphics().rect(-cell / 2 - 2, -cell / 2 - 2, cell + 4, cell + 4).stroke({ color: UI.color.selected, width: 2 });
  c.addChild(g, sel);
  return { container: c, tick(t) { sel.alpha = 0.55 + 0.45 * Math.sin(t * 3) ** 2; } };
}

/** A rock: an irregular flat polygon with one crack. */
function rock(r: number, seed: number, fill: number, crack: number): Graphics {
  const pts: number[] = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 0.82 + 0.18 * Math.sin(seed * 7.3 + i * 2.1);
    pts.push(Math.cos(a) * r * k, Math.sin(a) * r * k);
  }
  return new Graphics().poly(pts).fill(fill).moveTo(-r * 0.3, -r * 0.5).lineTo(r * 0.1, 0).lineTo(-r * 0.1, r * 0.55).stroke({ color: crack, width: 2 });
}

function freeFlyArt(): ModeArt {
  const c = new Container();
  const big = rock(34, 1, 0xa8794d, 0x1a120b);
  const a = rock(20, 2, 0xa8664a, 0x1a0e08);
  const b = rock(20, 3, 0x97834f, 0x17140b);
  const s1 = rock(11, 4, 0xa07565, 0x1a0f0c);
  const s2 = rock(11, 5, 0x86745f, 0x16120d);
  big.position.set(0, -34);
  a.position.set(-62, 38); b.position.set(62, 38);
  s1.position.set(-96, 78); s2.position.set(96, 78);
  const ship = new Graphics().poly([0, -16, 10, 12, 0, 7, -10, 12]).fill(0xd4d4d8);
  ship.position.set(0, H / 2 - 8);
  c.addChild(big, a, b, s1, s2, ship);
  return {
    container: c,
    tick(t) {
      // The rocks drift apart and back, as if splitting.
      const k = 0.5 + 0.5 * Math.sin(t * 1.6);
      a.x = -44 - 20 * k; b.x = 44 + 20 * k;
      s1.x = -78 - 26 * k; s2.x = 78 + 26 * k;
      big.rotation = Math.sin(t * 0.8) * 0.15;
      ship.x = Math.sin(t * 1.2) * 40;
    },
  };
}

export function makeModeArt(mode: MapMode): ModeArt {
  return mode === 'campaign' ? campaignArt() : mode === 'frontier' ? frontierArt() : freeFlyArt();
}

/** A padlock, centred at (0,0), about 40 px tall. */
export function drawPadlock(): Graphics {
  return new Graphics().rect(-16, -4, 32, 26).fill(UI.color.textDim).stroke({ color: UI.color.text, width: 2 })
    .moveTo(-9, -4).lineTo(-9, -16).lineTo(9, -16).lineTo(9, -4).stroke({ color: UI.color.text, width: 3.5 })
    .rect(-2.5, 6, 5, 9).fill(0x1c1c1e);
}

export const MODE_ART_SIZE = { w: W, h: H };

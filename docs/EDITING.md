# Editing the game data by hand

Short guide for the owner. You do not need to know TypeScript: you change text and numbers in a few data files, then check them.

**After any change, check it:**

```bash
npm test
```

All tests should pass. If you broke something, the test names the hull or block and says in plain words what is wrong (see "What an error looks like" below). To see the change in the game, run `npm run dev` and open the address it prints (usually http://localhost:5173).

## 1. A hull layout (`src/data/hullLayouts.ts`)

Each hull is a list of text rows, top to bottom. One character per cell:

| Character | Meaning |
|---|---|
| `_` | buildable cell (you can place a block here) |
| `.` | outside the hull |
| `G` | generator: exactly one, on the **bottom row**, fires the signal upward |
| `E` | ejector: where shots leave; no cell may sit above an ejector |

Rules: every row has the same length; every cell must be reachable from `G` by walking up/down/left/right; the cell right above `G` must be part of the hull. Hulls are listed in price order. Above each hull there is an `idea:` comment line: write what the hull is for there.

If you change the number of `_` cells or `E` ejectors, also update the matching numbers in `tests/hulls.test.ts` (the `LADDER` table at the top: cells, ejectors, pulses per second, shot speed, size class) and the hull's description text in `src/game/gridUtils.ts` (`DESC`), otherwise the tests will tell you the counts no longer match.

## 2. Hull prices and stats (`src/data/hulls.ts`, table `HULLS`)

One line per hull: `name`, `price` (credits), `pulsesPerSec` (shots per second, the main damage stat), `shotSpeed` (1 = normal, 1.2 = 20% faster), `size` (`small`, `medium`, `big`, `huge`: changes the size of the ship and its hit circle). Prices must go up from hull to hull (a test checks it). The order of hulls in the picker is `HULL_ORDER` at the top of the same file.

## 3. Block copy cap, price and growth (`src/data/blockEconomy.ts`, table `BLOCK_ECONOMY`)

One line per block; the comment above the table explains each column:

- `cap`: how many copies you can own (`null` = no limit).
- `base`: price of the first copy.
- `growth`: the price multiplies by this for each copy you already own (copy n costs `base x growth^(n-1)`).

Example: `turn_l: { cap: 20, base: 30, growth: 1.2 }`. Change `cap: 20` to `cap: 30` to allow 30 turns. Upgrade prices of the eight upgradable blocks are derived from `base` (see the top of the file).

## What an error looks like

- A layout mistake, from `npm test`:
  `Kestrel: needs 3 ejectors, found 2` or `Hornet: the cell at row 3, column 2 cannot be reached from G`. Rows and columns count from 1 at the top-left of that hull's layout.
- A typing mistake (missing comma, quote or bracket): `npm test` or `npm run typecheck` prints a file name, a line number and a short message like `',' expected`. Go to that line and look at the line just above it too.
- If the game shows a blank screen after an edit, run `npm run typecheck` and read the first error.

When unsure, undo with Git (`git checkout -- <file>`) or ask Claude to look at the error text.

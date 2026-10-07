# Mitosis Gun Builder

A factory-builder idle game about defending a ship against geometrically dividing space rocks.

## The circuit builder

The Build screen draws a hull grid. The **generator** is a fixed cell that always fires a red line (the signal) in the direction it faces. The line runs straight through empty cells and only changes when it meets a block; it ends at an **ejector** (projectiles leave the ship there) or at a dead end (drawn with a cross, counted as a warning).

- **Tap** a cell to select it and read its rule text in the inspector strip. **Double-tap** an empty cell to open the picker; tap a tile to preview it (ghost block, re-routed line, stats with deltas), double-tap the tile to place it.
- Blocks on the line **auto-orient** to the direction the signal enters them (green "A" badge). **Rotate left / right** locks the facing by hand (padlock); a locked block only accepts a signal travelling the way it faces, any other side dead-ends with a warning. **Auto-orient** (centre toolbar button) hands control back to the line.
- Drag to pan, wheel or pinch to zoom, the corner-arrows button fits the hull. Long-press (touch) or hover (mouse) a cell on the line to see what the projectile looks like after it.
- **A/B** switches between two saved circuits per hull; **Copy / Paste** moves a layout through the clipboard; the ship button switches hull (Shuttle, Fan).
- **FLY** compiles the active circuit and starts a run; it refuses (with a message) if nothing reaches an ejector.

## Commands

```
npm run dev        # Vite dev server on http://localhost:5173
npm run typecheck  # tsc --noEmit
npm test           # Vitest (compiler, model, persistence, layout, block audit, world)
npm run test:e2e   # Playwright scripts; needs the dev server running in another terminal
npm run audit      # prints the block audit table
```

## How to add a new Block in 5 minutes
1. Open `src/data/blocks.ts`.
2. Use `register({ ... })` (or `modBlock(...)` for a plain projectile modifier):
   ```typescript
   register({
     id: 'my_new_block',
     name: 'My New Block',
     category: 'damage',
     maxLevel: 5,
     outputs: ['F'],                       // where the signal leaves: F forward, L left, R right
     desc: (l) => `Adds +${50 * l} damage to each projectile.`,
     transform: (p, l) => { addDamage(p, 50 * l); },
     shown: true,                          // only when the compiler handles it AND it changes what the ship fires
   });
   ```
3. Add a test next to the others in `tests/blockAudit.test.ts` (it must compile correctly and change the fired projectile), then list it in `scripts/block-audit.ts`.
   Blocks with `shown: false` stay in the data but are not offered in the picker; give them a `hideReason`.

## How to add a new Enemy in 5 minutes
1. Open `src/data/enemies.ts`.
2. Add a new `Species` to the `SPECIES` dictionary:
   ```typescript
   my_new_enemy: {
     id: 'my_new_enemy',
     name: 'My New Enemy',
     baseHp: 120,
     baseArmor: 20,
     baseShield: 0,
     radius: 12,
     speed: 25,
     splitRule: { type: 'binary', hpShare: 0.55 }
   }
   ```
3. The director and spawn logic will automatically be able to summon `'my_new_enemy'`.

## How to add a new Boss in 5 minutes
1. Open `src/data/bosses.ts`.
2. Define a new `BossDef` object and add it to the `BOSSES` array:
   ```typescript
   {
     id: 'my_boss',
     name: 'The Big Boss',
     width: 0.9,
     descentSpeed: 3,
     enrageAt: 45, // seconds
     parts: [
       { id: 'plate1', hp: 50000, armor: 10000, shield: 0, offset: {x: 0, y: 50}, role: 'plate', hitShape: { type: 'rect', w: 100, h: 20 } },
       { id: 'core', hp: 200000, armor: 50000, shield: 10000, offset: {x: 0, y: 0}, role: 'core', hitShape: { type: 'circle', r: 40 }, invulnerableUntil: ['plate1'] }
     ],
     phases: []
   }
   ```
3. That's it! `BossRuntime` parses parts, logic, and vulnerabilities dynamically.

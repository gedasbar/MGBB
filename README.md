# Mitosis Gun Builder

A factory-builder idle game about defending a ship against geometrically dividing space rocks.

## Controls
- **Left Click (Drag & Drop)**: Place and move blocks on the circuit grid.
- **Right Click (or 'R')**: Rotate the currently held block clockwise.
- **Scroll Wheel**: Zoom in/out on the grid or world map.
- **Middle Click (or Spacebar)**: Pan the camera.
- **Delete / Backspace**: Remove the hovered or selected block.

## How to add a new Block in 5 minutes
1. Open `src/data/blocks.ts`.
2. Scroll to the appropriate section (pathing, modifier, status, passive, damage).
3. Use `register({ ... })` to define your block:
   ```typescript
   register({
     id: 'my_new_block',
     name: 'My New Block',
     category: 'damage',
     maxLevel: 5,
     ports: { S: 'in', N: 'out' },
     apply: (p, inDir, level) => {
       p.damage += 50 * level;
       return [{ localOut: 'N', packet: p }];
     }
   });
   ```
4. Test it in the game! (The compiler and simulation will pick it up automatically).

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

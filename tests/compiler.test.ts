import { describe, it, expect } from 'vitest';
import { compile, Grid, GridCell } from '../src/engine/compiler';
import '../src/data/blocks'; // Ensure blocks are registered

describe('Compiler', () => {
  function makeGrid(cells: Partial<GridCell>[]): Grid {
    const fullCells: GridCell[] = [];
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 11; x++) {
        fullCells.push({ x, y, blockId: null, level: 1, rotation: 0, type: 'empty' });
      }
    }
    const grid = { w: 11, h: 11, cells: fullCells };
    for (const c of cells) {
      grid.cells[c.y! * 11 + c.x!] = { 
        x: c.x!, y: c.y!, 
        blockId: c.blockId || null, 
        level: c.level || 1, 
        rotation: c.rotation || 0, 
        type: c.type || (c.blockId ? 'empty' : 'empty'),
        facing: c.facing
      };
    }
    return grid;
  }

  it('A Generator -> Straight -> Ejector chain yields one recipe with damage = base', () => {
    const grid = makeGrid([
      { x: 5, y: 5, type: 'generator', facing: 'N' },
      { x: 5, y: 4, blockId: 'straight' }, // straight goes S->N by default, no rot needed
      { x: 5, y: 3, type: 'ejector', facing: 'N' }
    ]);
    const res = compile(grid);
    expect(res.recipes.length).toBe(1);
    expect(res.recipes[0].packet.damage).toBe(1);
    expect(res.warnings).toEqual([]);
  });

  it('Order matters: Flat+100 then x2 vs x2 then Flat+100', () => {
    // 1 -> +100 -> x2 -> Ejector
    const grid1 = makeGrid([
      { x: 5, y: 5, type: 'generator', facing: 'N' },
      { x: 5, y: 4, blockId: 'flat_plus', level: 1 }, // +100
      { x: 5, y: 3, blockId: 'percent_mult', level: 2 }, // x2 (1 + 0.5 * 2)
      { x: 5, y: 2, type: 'ejector', facing: 'N' }
    ]);
    const res1 = compile(grid1);
    expect(res1.recipes[0].packet.damage).toBe((1 + 100) * 2);

    // 1 -> x2 -> +100 -> Ejector
    const grid2 = makeGrid([
      { x: 5, y: 5, type: 'generator', facing: 'N' },
      { x: 5, y: 4, blockId: 'percent_mult', level: 2 }, // x2
      { x: 5, y: 3, blockId: 'flat_plus', level: 1 }, // +100
      { x: 5, y: 2, type: 'ejector', facing: 'N' }
    ]);
    const res2 = compile(grid2);
    expect(res2.recipes[0].packet.damage).toBe((1 * 2) + 100);
  });

  it('Splitter-3 yields 3 packets; a Merger rejoins two of them to one packet whose damage is the sum.', () => {
    // Gen at 5,5 facing N.
    // Splitter-3 at 5,4. Outputs W(4,4), N(5,3), E(6,4).
    // Let's route W(4,4) to N(4,3) to E(5,3) using turns.
    // And E(6,4) to N(6,3) to W(5,3).
    // Then Merger at 5,3 facing N. Inputs W and E.
    // The straight N(5,3) from splitter would hit the S port of the merger! 
    // Wait, merger takes W and E, and outputs N. It does not accept S.
    // So the N branch from splitter will just die at the merger's S port (which is blocked/none).
    // The merger outputs to 5,2 Ejector.
    
    const grid = makeGrid([
      { x: 5, y: 5, type: 'generator', facing: 'N' },
      { x: 5, y: 4, blockId: 'splitter_3' }, 
      
      // Left branch
      { x: 4, y: 4, blockId: 'turn_r' }, // enters S (from E? No, packet moving W enters E of cell 4,4. turn_r takes S in, E out. We need a block that takes E in, N out. rotate turn_r.)
      // Actually, turn_r is S in, E out.
      // If we rotate it 90 CW (rot=1), it takes W in, S out.
      // If we rotate it 180 (rot=2), it takes N in, W out.
      // If we rotate it 270 (rot=3), it takes E in, N out.
      { x: 4, y: 4, blockId: 'turn_r', rotation: 3 }, // E in, N out. Moves N to 4,3
      { x: 4, y: 3, blockId: 'turn_r', rotation: 0 }, // S in, E out. Moves E to 5,3

      // Right branch
      { x: 6, y: 4, blockId: 'turn_l', rotation: 1 }, // W in, N out. Moves N to 6,3
      { x: 6, y: 3, blockId: 'turn_l', rotation: 0 }, // S in, W out. Moves W to 5,3
      
      // Merger at 5,3 (takes W and E in, N out)
      { x: 5, y: 3, blockId: 'merger' },
      { x: 5, y: 2, type: 'ejector', facing: 'N' }
    ]);
    
    const res = compile(grid);
    expect(res.recipes.length).toBe(1);
    expect(res.recipes[0].packet.damage).toBe(2); // 1 + 1 (left and right branches)
  });

  it('Two crossing lanes through a Crossover do not mix modifiers', () => {
    // Gen 1 (5,5) facing N -> +100 -> crossover(5,3) -> Ejector(5,2)
    // Gen 2 (3,3) facing E -> x2 -> crossover(5,3) -> Ejector(7,3)
    const grid = makeGrid([
      { x: 5, y: 5, type: 'generator', facing: 'N' },
      { x: 5, y: 4, blockId: 'flat_plus', level: 1 },
      
      { x: 3, y: 3, type: 'generator', facing: 'E' },
      { x: 4, y: 3, blockId: 'percent_mult', level: 2, rotation: 1 }, // rot 1: W in, E out
      
      { x: 5, y: 3, blockId: 'crossover' },
      
      { x: 5, y: 2, type: 'ejector', facing: 'N' },
      { x: 6, y: 3, type: 'ejector', facing: 'E' } // Wait, crossover outputs E to 6,3. 6,3 has Ejector. Ejector needs W in, so rot 3? No, Ejector takes S in by default. Let's rot it.
      // Ejector faces E, means it takes W in.
      // In blocks.ts: Ejector ports: { S: 'in' }.
      // To accept W in, it must be rotated 1 (90 CW). 
    ]);
    grid.cells[3 * 11 + 6].rotation = 1; // Ejector at 6,3
    
    const res = compile(grid);
    expect(res.recipes.length).toBe(2);
    
    const r1 = res.recipes.find(r => r.direction === 'N');
    const r2 = res.recipes.find(r => r.direction === 'E');
    
    expect(r1!.packet.damage).toBe(101);
    expect(r2!.packet.damage).toBe(2);
  });

  it('A feedback loop is cut and reported, not infinite-looped', () => {
    // Use a merger to form a cycle.
    // Gen (4,4) E -> (5,4) Merger W in, N out -> (5,3) Turn R -> (6,3) Turn R -> (6,4) Turn R -> (5,4) Merger E in.
    const grid = makeGrid([
      { x: 4, y: 4, type: 'generator', facing: 'E' },
      { x: 5, y: 4, blockId: 'merger', rotation: 0 }, // W in, E in, N out
      { x: 5, y: 3, blockId: 'turn_r', rotation: 0 }, // S in, E out
      { x: 6, y: 3, blockId: 'turn_r', rotation: 1 }, // W in, S out
      { x: 6, y: 4, blockId: 'turn_r', rotation: 2 }, // N in, W out -> feeds E in of Merger!
    ]);
    const res = compile(grid);
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.warnings.some(w => w.includes('Cycle'))).toBe(true);
  });

  it('Portal pair transports a packet and preserves modifiers', () => {
    const grid = makeGrid([
      { x: 5, y: 5, type: 'generator', facing: 'N' },
      { x: 5, y: 4, blockId: 'flat_plus', level: 1 }, // 1 -> 101
      { x: 5, y: 3, blockId: 'portal_pair', rotation: 0 }, // S in, N out. Teleports to other portal
      { x: 1, y: 1, blockId: 'portal_pair', rotation: 0 }, // It will output N from 1,1 -> to 1,0
      { x: 1, y: 0, type: 'ejector', facing: 'N' }
    ]);
    const res = compile(grid);
    expect(res.recipes.length).toBe(1);
    expect(res.recipes[0].x).toBe(1);
    expect(res.recipes[0].y).toBe(0);
    expect(res.recipes[0].packet.damage).toBe(101);
  });

  it('Compile of an 11x11 full board < 5 ms (average over 100 runs)', () => {
    // Fill board with splitters and straight lines
    const cells: Partial<GridCell>[] = [{ x: 5, y: 10, type: 'generator', facing: 'N' }];
    for (let y = 9; y >= 1; y--) {
      for (let x = 0; x < 11; x++) {
        cells.push({ x, y, blockId: 'straight', rotation: 0 });
      }
    }
    for (let x = 0; x < 11; x++) {
      cells.push({ x, y: 0, type: 'ejector', facing: 'N' });
    }
    const grid = makeGrid(cells);
    
    // Warmup
    for(let i=0; i<10; i++) compile(grid);
    
    const start = performance.now();
    const runs = 100;
    for(let i=0; i<runs; i++) {
      compile(grid);
    }
    const end = performance.now();
    const avg = (end - start) / runs;
    expect(avg).toBeLessThan(5);
  });
});

import { clonePacket, Dir, Packet, rotateDir } from './compilerTypes';
import { BLOCKS } from '../data/blocks';

export interface GridCell {
  x: number;
  y: number;
  blockId: string | null;
  level: number;
  rotation: number; // 0=0, 1=90, 2=180, 3=270 (CW)
  type: 'empty' | 'void' | 'blocked' | 'generator' | 'ejector';
  facing?: Dir; // For ejectors/generators if fixed
}

export interface Grid {
  w: number;
  h: number;
  cells: GridCell[];
}

export interface EjectorRecipe {
  direction: Dir;
  x: number;
  y: number;
  packet: Packet;
}

export interface PathEdge {
  x: number;
  y: number;
  outDir: Dir;
  active: boolean; // reaches an ejector
}

export interface CompiledShip {
  recipes: EjectorRecipe[];
  warnings: string[];
  activePaths: Set<string>;
  edges: PathEdge[];
}

function getCell(grid: Grid, x: number, y: number): GridCell | null {
  if (x < 0 || x >= grid.w || y < 0 || y >= grid.h) return null;
  return grid.cells[y * grid.w + x];
}

function dirToDelta(d: Dir) {
  switch (d) {
    case 'N': return { dx: 0, dy: -1 };
    case 'E': return { dx: 1, dy: 0 };
    case 'S': return { dx: 0, dy: 1 };
    case 'W': return { dx: -1, dy: 0 };
  }
}

export function compile(grid: Grid): CompiledShip {
  const recipes: EjectorRecipe[] = [];
  const warnings: string[] = [];
  const activePaths = new Set<string>();
  const edges: PathEdge[] = [];

  function addEdge(x: number, y: number, outDir: Dir) {
    edges.push({ x, y, outDir, active: false });
  }

  // Find generators
  const generators = grid.cells.filter(c => c.type === 'generator' || c.blockId === 'generator');
  
  // To detect cycles, we track visited paths (cell index + entering from direction)
  // Or just visited cell index if a block can only be visited once.
  // Wait, crossovers can be visited twice (H and V). So visited = cellIdx + axisLock?
  // Actually, we can just trace depth-first. Set of "current path" for cycle detection.
  
  interface State {
    x: number;
    y: number;
    movingDir: Dir;
    packet: Packet;
    pathSet: Set<string>;
    history: { x: number, y: number, outDir: Dir }[];
  }
  
  let queue: State[] = [];
  
  for (const gen of generators) {
    const startPacket: Packet = {
      damage: 1, pure: 0, count: 1, speedMul: 1, lifeMul: 1, sizeMul: 1,
      mods: [], gates: [], tags: new Set()
    };
    const genOut = gen.facing || 'N'; 
    const delta = dirToDelta(genOut);
    queue.push({
      x: gen.x + delta.dx, y: gen.y + delta.dy,
      movingDir: genOut, packet: startPacket, pathSet: new Set(),
      history: [{ x: gen.x, y: gen.y, outDir: genOut }]
    });
    addEdge(gen.x, gen.y, genOut);
  }

  while (queue.length > 0) {
    const nextQueue: State[] = [];
    
    // Group by cell
    const cellGroups = new Map<string, State[]>();
    for (const q of queue) {
      const key = `${q.x},${q.y}`;
      if (!cellGroups.has(key)) cellGroups.set(key, []);
      cellGroups.get(key)!.push(q);
    }
    
    for (const [key, states] of cellGroups.entries()) {
      const [sx, sy] = key.split(',').map(Number);
      const cell = getCell(grid, sx, sy);
      
      // Is it an ejector?
      if (cell && (cell.type === 'ejector' || cell.blockId === 'ejector')) {
        activePaths.add(`${sx},${sy}`);
        for (const s of states) {
          recipes.push({ direction: cell.facing || 'N', x: sx, y: sy, packet: s.packet });
          // Mark history as active
          for (const h of s.history) {
            const edge = edges.find(e => e.x === h.x && e.y === h.y && e.outDir === h.outDir);
            if (edge) edge.active = true;
            activePaths.add(`${h.x},${h.y}`);
          }
        }
        continue;
      }

      if (!cell || !cell.blockId || cell.type === 'blocked' || cell.type === 'void') {
        continue;
      }
      
      const bDef = BLOCKS[cell.blockId];
      if (!bDef) continue;
      
      activePaths.add(`${sx},${sy}`);
      
      // If it's a merger, we merge packets that arrived at the same time
      let mergedStates = states;
      if (bDef.id === 'merger' && states.length > 1) {
        const mergedPacket = clonePacket(states[0].packet);
        for (let i = 1; i < states.length; i++) {
          mergedPacket.damage += states[i].packet.damage;
          mergedPacket.count += states[i].packet.count;
          states[i].packet.mods.forEach(m => mergedPacket.mods.push(m));
          states[i].packet.tags.forEach(t => mergedPacket.tags.add(t));
        }
        // Union pathSets
        const mergedPathSet = new Set<string>();
        states.forEach(s => s.pathSet.forEach(p => mergedPathSet.add(p)));
        
        mergedStates = [{
          x: sx, y: sy, movingDir: states[0].movingDir, // taking first dir, might be slightly off for crossovers but mergers only output N
          packet: mergedPacket, pathSet: mergedPathSet, history: states[0].history // roughly correct for merger
        }];
      }

      for (const s of mergedStates) {
        let oppositeGlobal: Dir;
        if (s.movingDir === 'N') oppositeGlobal = 'S';
        else if (s.movingDir === 'E') oppositeGlobal = 'W';
        else if (s.movingDir === 'S') oppositeGlobal = 'N';
        else oppositeGlobal = 'E';
        
        const localIn = rotateDir(oppositeGlobal, 4 - (cell.rotation % 4));
        const portDef = bDef.ports[localIn];
        
        // Fix: Merger expects W or E in, N out (local). If inputs come from other ports, reject.
        if (portDef !== 'in' && portDef !== 'both') {
          warnings.push(`Rejection at ${sx},${sy}: portDef is ${portDef} for localIn ${localIn}`);
          continue;
        }
        
        const stepKey = `${sx},${sy},${localIn}`;
        if (s.pathSet.has(stepKey)) {
          warnings.push(`Cycle detected at ${sx},${sy}`);
          continue;
        }
        
        s.pathSet.add(stepKey);
        
        let results;
        try {
          results = bDef.apply(clonePacket(s.packet), localIn, cell.level, (cell as any).state || {});
        } catch (e: any) {
          warnings.push(`Error in block ${bDef.name} at ${sx},${sy}: ${e.message}`);
          continue;
        }
        
        for (const res of results) {
          const globalOut = rotateDir(res.localOut, cell.rotation);
          let targetX = sx;
          let targetY = sy;
          
          if (bDef.id === 'portal_pair') {
            // Find the other portal pair on the grid
            const portals = grid.cells.filter(c => c.blockId === 'portal_pair');
            if (portals.length === 2) {
              const other = portals.find(c => c.x !== sx || c.y !== sy);
              if (other) {
                targetX = other.x;
                targetY = other.y;
              }
            }
          }
          
          const nextD = dirToDelta(globalOut);
          const newHistory = [...s.history, { x: targetX, y: targetY, outDir: globalOut }];
          nextQueue.push({
            x: targetX + nextD.dx, y: targetY + nextD.dy,
            movingDir: globalOut, packet: res.packet, pathSet: new Set(s.pathSet),
            history: newHistory
          });
          addEdge(targetX, targetY, globalOut);
        }
      }
    }
    
    queue = nextQueue;
  }

  return { recipes, warnings, activePaths, edges };
}

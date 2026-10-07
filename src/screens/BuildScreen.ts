import { Container, Graphics, Text } from 'pixi.js';
import { CONFIG } from '../config';
import { Screen, ScreenManager } from './ScreenManager';
import { compile, Grid, CompiledShip } from '../engine/compiler';
import { buildShuttleGrid } from '../game/gridUtils';
import { BLOCKS } from '../data/blocks';
import { FlyScreen } from './FlyScreen';


const CELL_SIZE = 44; 
const GRID_OFF_X = 28;
const GRID_OFF_Y = 160;

const PALETTE = ['straight', 'turn_l', 'turn_r', 'splitter_2', 'splitter_3', 'crossover', 'flat_plus', 'percent_mult', 'piercing', 'bouncing', 'aoe_circle'];

const CAT_COLORS: Record<string, number> = {
  pathing: 0x2266aa,
  damage: 0xaa3322,
  modifier: 0xaa2288
};

const DESC_MAP: Record<string, (l: number) => string> = {
  generator: () => 'Produces packets.',
  ejector: () => 'Ejects packets into space.',
  straight: () => 'Moves signal straight.',
  turn_l: () => 'Turns signal left.',
  turn_r: () => 'Turns signal right.',
  splitter_2: () => 'Splits signal into 2 streams.',
  splitter_3: () => 'Splits signal into 3 streams.',
  crossover: () => 'Allows two signals to cross without intersecting.',
  flat_plus: (l) => `Adds ${100 * l} flat damage.`,
  percent_mult: (l) => `Multiplies damage by ${100 + 10 * l}%.`,
  piercing: () => 'Projectiles pierce 1 additional enemy.',
  bouncing: () => 'Projectiles bounce 1 additional time.',
  aoe_circle: () => 'Projectiles explode in an area of effect.'
};

export class BuildScreen implements Screen {
  container = new Container();
  grid!: Grid;
  
  gridLayer = new Container();
  uiLayer = new Container();
  ghostLayer = new Container();
  traceLayer = new Container();

  compiled!: CompiledShip;

  selectedPalette: string | null = null;
  selectedCell: { x: number, y: number } | null = null;
  
  history: string[] = [];
  historyIndex = -1;

  statsText!: Text;
  inspectorText!: Text;
  ghostGraphics = new Graphics();
  
  private wasPointerActive = false;
  private nowTime = 0;

  constructor(private screenManager: ScreenManager) {
    this.container.addChild(this.gridLayer, this.traceLayer, this.ghostLayer, this.uiLayer);
    this.loadGrid();
    this.saveState();
    this.recompile();
    this.buildUI();
  }

  loadGrid() {
    const saved = localStorage.getItem('mgbm_grid');
    if (saved) {
      try {
        this.grid = JSON.parse(saved);
        if (!this.grid.cells || this.grid.cells.length !== 121) throw new Error('Corrupt');
        return;
      } catch (e) {
        console.warn('Grid load failed, resetting.');
      }
    }
    this.grid = buildShuttleGrid();
  }

  saveGrid() {
    localStorage.setItem('mgbm_grid', JSON.stringify(this.grid));
  }

  saveState() {
    const state = JSON.stringify(this.grid);
    if (this.historyIndex >= 0 && this.history[this.historyIndex] === state) return;
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(state);
    this.historyIndex++;
    this.saveGrid();
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.grid = JSON.parse(this.history[this.historyIndex]);
      this.recompile();
      this.saveGrid();
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.grid = JSON.parse(this.history[this.historyIndex]);
      this.recompile();
      this.saveGrid();
    }
  }

  recompile() {
    this.compiled = compile(this.grid);
    this.drawGrid();
    this.updateStats();
  }
  
  updateStats() {
    if (!this.statsText) return;
    let totalDmg = 0;
    for (const r of this.compiled.recipes) totalDmg += r.packet.damage;
    const proj = this.compiled.recipes.length;
    const pps = 3; // Basic Hull firerate
    const dps = totalDmg * pps;
    
    let wasted = 0;
    for (const c of this.grid.cells) {
      if (c.type === 'empty' && c.blockId && !this.compiled.activePaths.has(`${c.x},${c.y}`)) {
        wasted++;
      }
    }
    
    this.statsText.text = `Dmg/Shot: ${totalDmg.toFixed(1)} | Proj/Pulse: ${proj} | Pulses/sec: ${pps}\nDPS: ${dps.toFixed(1)} | Wasted: ${wasted} | Warns: ${this.compiled.warnings.length}\n(Hint: Maximize DPS by connecting more blocks to Ejectors)`;
  }

  buildUI() {
    // Top Bar (Stats & Fly)
    const topBar = new Graphics().rect(0, 0, CONFIG.VIEW.W, 100).fill(0x222222);
    this.uiLayer.addChild(topBar);

    this.statsText = new Text({ text: '', style: { fill: 0xdddddd, fontSize: 13, lineHeight: 18 } });
    this.statsText.position.set(10, 10);
    this.uiLayer.addChild(this.statsText);

    const flyBtn = this.createButton(CONFIG.VIEW.W - 100, 20, 80, 60, 'FLY', 0x22aa22);
    this.uiLayer.addChild(flyBtn);

    // Toolbars
    const tbY = 110;
    this.uiLayer.addChild(this.createButton(10, tbY, 50, 40, 'Undo', 0x555555, () => this.undo()));
    this.uiLayer.addChild(this.createButton(70, tbY, 50, 40, 'Redo', 0x555555, () => this.redo()));
    this.uiLayer.addChild(this.createButton(130, tbY, 70, 40, 'Rot CW', 0x555555, () => this.rotateSelected(1)));
    this.uiLayer.addChild(this.createButton(210, tbY, 70, 40, 'Rot CCW', 0x555555, () => this.rotateSelected(-1)));
    this.uiLayer.addChild(this.createButton(290, tbY, 60, 40, 'Clear', 0xaa2222, () => this.clearSelected()));
    this.uiLayer.addChild(this.createButton(360, tbY, 80, 40, 'Clear All', 0xaa2222, () => this.clearAll()));

    // Bottom Palette
    const palY = 660;
    const palBar = new Graphics().rect(0, palY, CONFIG.VIEW.W, CONFIG.VIEW.H - palY).fill(0x1a1a1a);
    this.uiLayer.addChild(palBar);

    const inspBg = new Graphics().rect(0, palY, CONFIG.VIEW.W, 50).fill(0x111111);
    this.uiLayer.addChild(inspBg);

    this.inspectorText = new Text({ text: 'Select a block to inspect', style: { fill: 0xdddddd, fontSize: 13, wordWrap: true, wordWrapWidth: CONFIG.VIEW.W - 20 } });
    this.inspectorText.position.set(10, palY + 5);
    this.uiLayer.addChild(this.inspectorText);

    this.ghostLayer.addChild(this.ghostGraphics);
    
    this.recompile();

    if (import.meta.env.DEV) {
      (window as any).__mgbm = {
        buildScreen: this,
        state: () => ({
          projectiles: 0, recipes: this.compiled.recipes.length,
          damagePerShot: this.compiled.recipes.map(r => r.packet.damage),
        }),
      };
    }
  }

  createButton(x: number, y: number, w: number, h: number, label: string, color: number, _onClick?: () => void) {
    const c = new Container();
    c.position.set(x, y);
    c.addChild(new Graphics().roundRect(0, 0, w, h, 8).fill(color));
    const t = new Text({ text: label, style: { fill: 0xffffff, fontSize: 13, fontWeight: 'bold' } });
    t.anchor.set(0.5);
    t.position.set(w/2, h/2);
    c.addChild(t);
    return c;
  }

  rotateSelected(dir: number) {
    if (!this.selectedCell) return;
    const cell = this.grid.cells[this.selectedCell.y * 11 + this.selectedCell.x];
    if (cell && cell.blockId && cell.type === 'empty') {
      cell.rotation = (cell.rotation + dir + 4) % 4;
      this.saveState();
      this.recompile();
    }
  }

  clearSelected() {
    if (!this.selectedCell) return;
    const cell = this.grid.cells[this.selectedCell.y * 11 + this.selectedCell.x];
    if (cell && cell.blockId && cell.type === 'empty') {
      cell.blockId = null;
      this.saveState();
      this.recompile();
    }
  }

  clearAll() {
    for (const c of this.grid.cells) {
      if (c.type === 'empty' && c.blockId) c.blockId = null;
    }
    this.saveState();
    this.recompile();
  }

  drawGrid() {
    this.gridLayer.removeChildren();
    
    const bg = new Graphics().rect(GRID_OFF_X - 4, GRID_OFF_Y - 4, 11 * CELL_SIZE + 8, 11 * CELL_SIZE + 8).fill(0x111111);
    this.gridLayer.addChild(bg);

    for (const c of this.grid.cells) {
      const g = new Graphics();
      const px = GRID_OFF_X + c.x * CELL_SIZE;
      const py = GRID_OFF_Y + c.y * CELL_SIZE;
      g.position.set(px, py);

      if (c.type === 'void') {
        // empty space
      } else if (c.type === 'blocked') {
        g.rect(1, 1, CELL_SIZE-2, CELL_SIZE-2).fill(0x331111);
      } else {
        const isActive = this.compiled.activePaths.has(`${c.x},${c.y}`);
        const isSelected = this.selectedCell?.x === c.x && this.selectedCell?.y === c.y;
        
        g.rect(1, 1, CELL_SIZE-2, CELL_SIZE-2).stroke({ color: isSelected ? 0xffff00 : 0x444444, width: 2 });
        if (c.type === 'generator') g.rect(1, 1, CELL_SIZE-2, CELL_SIZE-2).fill(0x004400);
        else if (c.type === 'ejector') g.rect(1, 1, CELL_SIZE-2, CELL_SIZE-2).fill(0x444400);
        else g.rect(1, 1, CELL_SIZE-2, CELL_SIZE-2).fill(0x222222);

        if (c.blockId) {
          const bDef = BLOCKS[c.blockId];
          const catCol = bDef ? CAT_COLORS[bDef.category] || 0x555555 : 0x555555;
          const alpha = isActive ? 1 : 0.4;
          
          g.rect(2, 2, CELL_SIZE-4, CELL_SIZE-4).fill({ color: catCol, alpha });
          
          const t = new Text({ text: (bDef ? bDef.name.substring(0,3) : c.blockId.substring(0,3)).toUpperCase(), style: { fill: 0xffffff, fontSize: 10 } });
          t.alpha = alpha;
          t.anchor.set(0.5);
          t.position.set(CELL_SIZE/2, CELL_SIZE/2);
          g.addChild(t);

          const dot = new Graphics().circle(0, 0, 3).fill({ color: 0xffffff, alpha });
          if (c.rotation === 0) dot.position.set(CELL_SIZE/2, 6);
          else if (c.rotation === 1) dot.position.set(CELL_SIZE - 6, CELL_SIZE/2);
          else if (c.rotation === 2) dot.position.set(CELL_SIZE/2, CELL_SIZE - 6);
          else dot.position.set(6, CELL_SIZE/2);
          g.addChild(dot);

          if (!isActive && c.type === 'empty') {
            const noCon = new Text({ text: 'No Sig', style: { fill: 0xffaaaa, fontSize: 10, align: 'center', stroke: { color: 0x0, width: 2 } } });
            noCon.anchor.set(0.5);
            noCon.position.set(CELL_SIZE/2, CELL_SIZE/2 + 10);
            g.addChild(noCon);
          }
        }
      }
      this.gridLayer.addChild(g);
    }
    
    // Draw Palette items
    let px = 10, py = 720;
    for (const id of PALETTE) {
      const bDef = BLOCKS[id];
      if (!bDef) continue;
      
      const isSel = this.selectedPalette === id;
      const catCol = CAT_COLORS[bDef.category] || 0x555555;
      
      const pg = new Graphics();
      pg.position.set(px, py);
      pg.rect(0, 0, 60, 60).fill(catCol);
      pg.rect(0, 0, 60, 60).stroke({ color: isSel ? 0xffff00 : 0x000000, width: isSel ? 3 : 1 });
      
      const lbl = new Text({ text: bDef.name, style: { fill: 0xffffff, fontSize: 10, wordWrap: true, wordWrapWidth: 56, align: 'center' } });
      lbl.anchor.set(0.5);
      lbl.position.set(30, 20);
      pg.addChild(lbl);
      
      const cnt = new Text({ text: '99', style: { fill: 0xaaaaaa, fontSize: 10 } });
      cnt.anchor.set(1, 1);
      cnt.position.set(58, 58);
      pg.addChild(cnt);
      
      this.gridLayer.addChild(pg);
      
      px += 70;
      if (px > CONFIG.VIEW.W - 65) { px = 10; py += 70; }
    }
  }

  setInspector(blockId: string | null, level: number = 1) {
    if (!blockId) {
      this.inspectorText.text = 'Select a block to inspect';
      return;
    }
    const def = BLOCKS[blockId];
    if (!def) return;
    const descFn = DESC_MAP[blockId];
    const desc = descFn ? descFn(level) : '';
    this.inspectorText.text = `[${def.name}] ${def.category.toUpperCase()}\n${desc}`;
  }

  handlePointerClick(x: number, y: number) {
    // FLY
    if (y < 100 && x > CONFIG.VIEW.W - 100 && y > 20 && y < 80) {
      this.screenManager.switchTo(new FlyScreen(this.screenManager, this.grid, () => {
        this.screenManager.switchTo(new BuildScreen(this.screenManager));
      }));
      return;
    }

    // Toolbars
    if (y > 110 && y < 150) {
      if (x > 10 && x < 60) this.undo();
      else if (x > 70 && x < 120) this.redo();
      else if (x > 130 && x < 200) this.rotateSelected(1);
      else if (x > 210 && x < 280) this.rotateSelected(-1);
      else if (x > 290 && x < 350) this.clearSelected();
      else if (x > 360 && x < 440) this.clearAll();
      return;
    }

    // Palette
    if (y > 720) {
      let px = 10, py = 720;
      for (const id of PALETTE) {
        if (x >= px && x <= px + 60 && y >= py && y <= py + 60) {
          this.selectedPalette = id;
          this.selectedCell = null;
          this.setInspector(id);
          this.drawGrid();
          return;
        }
        px += 70;
        if (px > CONFIG.VIEW.W - 65) { px = 10; py += 70; }
      }
    }

    // Grid
    const cx = Math.floor((x - GRID_OFF_X) / CELL_SIZE);
    const cy = Math.floor((y - GRID_OFF_Y) / CELL_SIZE);
    if (cx >= 0 && cx < 11 && cy >= 0 && cy < 11) {
      const cell = this.grid.cells[cy * 11 + cx];
      if (cell.type === 'empty') {
        if (this.selectedPalette) {
          cell.blockId = this.selectedPalette;
          cell.rotation = 0;
          this.selectedCell = { x: cx, y: cy };
          this.selectedPalette = null; // Deselect palette to allow rotating
          this.saveState();
          this.recompile();
          this.setInspector(cell.blockId, cell.level);
        } else if (cell.blockId) {
          this.selectedCell = { x: cx, y: cy };
          this.drawGrid();
          this.setInspector(cell.blockId, cell.level);
        }
      } else if (cell.blockId) {
          this.selectedCell = { x: cx, y: cy };
          this.drawGrid();
          this.setInspector(cell.blockId, cell.level);
      }
    }
  }

  update(_dt: number, _frameTime: number, now: number) {
    this.nowTime = now;
    const p = this.screenManager.input.pointer;
    
    if (p.active && !this.wasPointerActive) {
      this.handlePointerClick(p.x, p.y);
    }
    this.wasPointerActive = p.active;

    // Ghost
    this.ghostGraphics.clear();
    const cx = Math.floor((p.x - GRID_OFF_X) / CELL_SIZE);
    const cy = Math.floor((p.y - GRID_OFF_Y) / CELL_SIZE);
    if (cx >= 0 && cx < 11 && cy >= 0 && cy < 11 && this.selectedPalette) {
      const cell = this.grid.cells[cy * 11 + cx];
      const valid = cell.type === 'empty';
      this.ghostGraphics.rect(GRID_OFF_X + cx * CELL_SIZE, GRID_OFF_Y + cy * CELL_SIZE, CELL_SIZE, CELL_SIZE)
        .fill({ color: valid ? 0x00ff00 : 0xff0000, alpha: 0.3 });
    }

    // Tracing
    this.traceLayer.removeChildren();
    
    // Animate dash offset
    const dashOffset = (this.nowTime / 15) % CELL_SIZE;

    for (const edge of this.compiled.edges) {
      const g = new Graphics();
      const sx = GRID_OFF_X + edge.x * CELL_SIZE + CELL_SIZE/2;
      const sy = GRID_OFF_Y + edge.y * CELL_SIZE + CELL_SIZE/2;
      
      let dx = 0, dy = 0;
      if (edge.outDir === 'N') dy = -CELL_SIZE;
      else if (edge.outDir === 'E') dx = CELL_SIZE;
      else if (edge.outDir === 'S') dy = CELL_SIZE;
      else if (edge.outDir === 'W') dx = -CELL_SIZE;

      const alpha = edge.active ? 1 : 0.3;
      const color = edge.active ? 0xff0000 : 0x880000;

      // Base line
      g.moveTo(sx, sy).lineTo(sx + dx, sy + dy).stroke({ color, width: 3, alpha });
      
      // Moving dash (dot)
      const dotT = (dashOffset / CELL_SIZE);
      const dotX = sx + dx * dotT;
      const dotY = sy + dy * dotT;
      g.circle(dotX, dotY, 4).fill({ color: 0xffffff, alpha: alpha === 1 ? 1 : 0 });
      
      this.traceLayer.addChild(g);
    }
  }
}

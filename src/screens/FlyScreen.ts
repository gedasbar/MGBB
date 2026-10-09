import { Container, Graphics, Sprite, Texture, Text } from 'pixi.js';
import { CONFIG } from '../config';
import { World } from '../game/world';
import { clientToGame } from '../input';
import { Screen, ScreenManager } from './ScreenManager';
import { Grid } from '../engine/compiler';

const ROCK_COLOR = 0xffa500;
const FLASH_TIME = 0.08;
const DMG_NUMBER_LIFE = 0.6;

interface DmgNum { t: Text; life: number; }
interface Burst { g: Graphics; life: number; }

export class FlyScreen implements Screen {
  container = new Container();
  world: World;
  
  projLayer = new Container();
  enemyLayer = new Container();
  fxLayer = new Container();
  uiLayer = new Container();
  
  shipGfx = new Graphics().circle(0, 0, CONFIG.PLAYER.HITBOX_R).fill(0x00ff00);
  hullBarBg = new Graphics().rect(0, 0, 100, 10).fill(0xff0000);
  hullBarFg = new Graphics().rect(0, 0, 100, 10).fill(0x00ff00);
  
  projSprites: Sprite[] = [];
  enemySprites = new Map<number, Sprite>();
  flash = new Map<number, number>();
  dmgNums: DmgNum[] = [];
  bursts: Burst[] = [];
  
  gameOverText = new Text({ text: 'GAME OVER', style: { fill: 0xff4444, align: 'center', fontSize: 48, fontWeight: 'bold' } });
  restartBtn = new Container();

  constructor(private screenManager: ScreenManager, grid: Grid, private backToBuild: () => void) {
    this.world = new World({ grid });
    
    this.container.addChild(this.projLayer, this.enemyLayer);
    this.container.addChild(this.shipGfx, this.fxLayer, this.uiLayer);

    this.hullBarBg.position.set(20, 20);
    this.hullBarFg.position.set(20, 20);
    this.uiLayer.addChild(this.hullBarBg, this.hullBarFg);

    for (let i = 0; i < this.world.pool.max; i++) {
      const s = new Sprite(Texture.WHITE);
      s.width = 6;
      s.height = 14;
      s.tint = 0x00ffff;
      s.anchor.set(0.5);
      s.visible = false;
      this.projLayer.addChild(s);
      this.projSprites.push(s);
    }

    for (let i = 0; i < CONFIG.CAPS.DAMAGE_NUMBERS; i++) {
      const t = new Text({ text: '', style: { fill: 0xffffff, fontSize: 18, fontWeight: 'bold', stroke: { color: 0x000000, width: 3 } } });
      t.anchor.set(0.5);
      t.visible = false;
      this.fxLayer.addChild(t);
      this.dmgNums.push({ t, life: 0 });
    }

    this.gameOverText.anchor.set(0.5);
    this.gameOverText.position.set(CONFIG.VIEW.W / 2, CONFIG.VIEW.H / 2 - 40);
    
    this.restartBtn.addChild(new Graphics().roundRect(-90, -28, 180, 56, 12).fill(0x2266ff));
    const restartLabel = new Text({ text: 'BACK TO BUILD', style: { fill: 0xffffff, fontSize: 22, fontWeight: 'bold' } });
    restartLabel.anchor.set(0.5);
    this.restartBtn.addChild(restartLabel);
    this.restartBtn.position.set(CONFIG.VIEW.W / 2, CONFIG.VIEW.H / 2 + 40);
    this.restartBtn.eventMode = 'static';
    this.restartBtn.cursor = 'pointer';
    this.restartBtn.on('pointerdown', () => this.backToBuild());
    
    this.gameOverText.visible = false;
    this.restartBtn.visible = false;
    this.uiLayer.addChild(this.gameOverText, this.restartBtn);

    // Dev-only hook
    if (import.meta.env.DEV) {
      (window as any).__mgbm = {
        state: () => ({
          shipX: this.world.shipX, shipY: this.world.shipY, knockX: this.world.knockX, knockY: this.world.knockY,
          enemies: this.world.mitosis.enemies.map(e => ({ id: e.id, gen: e.generation, hp: e.hp, x: e.x, y: e.y })),
          projectiles: this.world.pool.count, recipes: this.world.recipes.length,
          damagePerShot: this.world.recipes.map(r => r.packet.damage),
        }),
        clientToGame: (cx: number, cy: number) => clientToGame(cx, cy, this.screenManager.app.canvas.getBoundingClientRect()),
        world: this.world,
      };
    }
  }

  showDamage(x: number, y: number, dmg: number) {
    const slot = this.dmgNums.find(d => d.life <= 0) ?? this.dmgNums[0];
    slot.t.text = `${Math.round(dmg)}`;
    slot.t.position.set(x + (Math.random() - 0.5) * 12, y - 10);
    slot.t.alpha = 1;
    slot.t.visible = true;
    slot.life = DMG_NUMBER_LIFE;
  }

  update(dt: number, frameTime: number, now: number) {
    this.world.update(dt, this.screenManager.input.pointer);

    for (const h of this.world.hits) {
      this.flash.set(h.enemyId, FLASH_TIME);
      this.showDamage(h.x, h.y, h.damage);
    }
    this.world.hits.length = 0;
    
    for (const s of this.world.splits) {
      const g = new Graphics().circle(0, 0, 20).stroke({ color: 0xffffff, width: 3 });
      g.position.set(s.x, s.y);
      this.fxLayer.addChild(g);
      this.bursts.push({ g, life: 0.3 });
    }
    this.world.splits.length = 0;

    this.shipGfx.position.set(this.world.shipX, this.world.shipY);
    this.shipGfx.alpha = this.world.invuln > 0 ? (Math.floor(now / 100) % 2 === 0 ? 0.4 : 1) : 1;
    this.hullBarFg.width = Math.max(0, (this.world.hull / this.world.maxHull) * 100);

    const pool = this.world.pool;
    for (let i = 0; i < pool.max; i++) {
      const s = this.projSprites[i];
      if (pool.active[i]) {
        s.position.set(pool.x[i], pool.y[i]);
        s.width = 6 * pool.size[i];
        s.height = 14 * pool.size[i];
        s.rotation = Math.atan2(pool.vy[i], pool.vx[i]) + Math.PI / 2;
        s.visible = true;
      } else if (s.visible) {
        s.visible = false;
      }
    }

    const alive = new Set<number>();
    for (const e of this.world.mitosis.enemies) {
      alive.add(e.id);
      let s = this.enemySprites.get(e.id);
      if (!s) {
        s = new Sprite(Texture.WHITE);
        s.anchor.set(0.5);
        this.enemyLayer.addChild(s);
        this.enemySprites.set(e.id, s);
      }
      s.position.set(e.x, e.y);
      s.width = e.radius * 2;
      s.height = e.radius * 2;
      const f = this.flash.get(e.id) ?? 0;
      s.tint = f > 0 ? 0xffffff : ROCK_COLOR;
      if (f > 0) this.flash.set(e.id, f - frameTime);
    }
    for (const [id, s] of this.enemySprites) {
      if (!alive.has(id)) {
        s.destroy();
        this.enemySprites.delete(id);
        this.flash.delete(id);
      }
    }

    for (const d of this.dmgNums) {
      if (d.life <= 0) continue;
      d.life -= frameTime;
      d.t.y -= 40 * frameTime;
      d.t.alpha = Math.max(0, d.life / DMG_NUMBER_LIFE);
      if (d.life <= 0) d.t.visible = false;
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= frameTime;
      b.g.scale.set(1 + (0.3 - b.life) * 6);
      b.g.alpha = Math.max(0, b.life / 0.3);
      if (b.life <= 0) { b.g.destroy(); this.bursts.splice(i, 1); }
    }

    if (this.world.gameOver && !this.restartBtn.visible) {
      this.gameOverText.visible = true;
      this.restartBtn.visible = true;
    }
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}

import { Container, Graphics, Sprite, Texture, Text } from 'pixi.js';
import { CONFIG } from '../config';
import { SPAWN_INTERVAL, World } from '../game/world';
import type { StatsInfo } from '../ui/stats';
import { clientToGame } from '../input';
import { Screen, ScreenManager } from './ScreenManager';
import { Grid } from '../engine/compiler';
import { THEME } from '../ui/theme';
import { fmtBig } from '../ui/format';
import { makeText } from '../builder/ui';
import { getProgressStore } from '../econ/progress';
import { debugHooks } from '../debug/hooks';
import { RunSummaryScreen } from './RunSummaryScreen';
import { PointerGate } from '../engine/control';
import { ShipView } from '../ui/shipArt';
import { ARC_MAX, PHASE_BOOM_BACK, PHASE_BOOM_OUT, PHASE_MINE_WAIT, PHASE_MINE_TRAVEL, PHASE_ORBIT } from '../engine/projectiles';

const ROCK_COLOR = 0xffa500;
/** Status tints of a rock: burning is a redder orange, frozen a pale blue. */
const BURN_COLOR = 0xff4a1a;
const FROZEN_COLOR = 0xbfe6ff;
const BURN_FROZEN_COLOR = 0xe6bfc8;
const ARC_COLOR = 0xe8f4ff;
const MINE_COLOR = 0xff5050;
const LOOP_COLOR = 0xffe14d;
const FLASH_TIME = 0.08;
const DMG_NUMBER_LIFE = 0.6;
/** Seconds between the hull reaching 0 and the Run Summary appearing. */
const END_DELAY = 0.7;

interface DmgNum { t: Text; life: number; }
interface Burst { g: Graphics; life: number; }

export class FlyScreen implements Screen {
  container = new Container();
  world: World;
  
  projLayer = new Container();
  enemyLayer = new Container();
  fxLayer = new Container();
  uiLayer = new Container();
  /** Chain-lightning arcs: one Graphics, cleared and redrawn from the arc ring each frame. */
  private arcG = new Graphics();
  
  ship: ShipView;
  hullBarBg = new Graphics().rect(0, 0, 100, 10).fill(0xff0000);
  hullBarFg = new Graphics().rect(0, 0, 100, 10).fill(0x00ff00);
  
  projSprites: Sprite[] = [];
  enemySprites = new Map<number, Sprite>();
  flash = new Map<number, number>();
  dmgNums: DmgNum[] = [];
  bursts: Burst[] = [];
  
  creditsText = makeText('Credits +0', 16, THEME.currency, { fontWeight: 'bold' });
  tierText = makeText('Tier 1', 16, THEME.textDim, { fontWeight: 'bold' });

  /** Credits already shown as "+N" popups (whole credits), and the exact total they are measured against. */
  private shownCredits = 0;
  private popupTotal = 0;
  private endTimer = 0;
  private finished = false;
  private gate = new PointerGate();

  constructor(private screenManager: ScreenManager, grid: Grid) {
    this.world = new World({ grid, safeStart: true });
    debugHooks.world = this.world;
    
    this.container.addChild(this.projLayer, this.enemyLayer);
    const w = this.world;
    this.ship = new ShipView(
      this.screenManager.app.renderer, grid.hullId ?? 'shuttle',
      w.recipes.map((r, i) => ({ x: w.spawnOffsets[i].x, y: w.spawnOffsets[i].y, dir: r.direction })),
    );
    this.container.addChild(this.ship.container, this.fxLayer, this.uiLayer);
    this.fxLayer.addChild(this.arcG);

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

    this.creditsText.position.set(20, 36);
    this.tierText.position.set(20, 56);
    this.uiLayer.addChild(this.creditsText, this.tierText);

    // Dev-only hook
    if (import.meta.env.DEV) {
      (window as any).__mgbm = {
        state: () => ({
          shipX: this.world.shipX, shipY: this.world.shipY, viewW: CONFIG.VIEW.W,
          controlStarted: this.world.controlStarted, invuln: this.world.invuln,
          knockX: this.world.knockX, knockY: this.world.knockY,
          enemies: this.world.mitosis.enemies.map(e => ({ id: e.id, gen: e.generation, hp: e.hp, x: e.x, y: e.y })),
          projectiles: this.world.pool.count, recipes: this.world.recipes.length,
          damagePerShot: this.world.recipes.map(r => r.packet.damage),
          hull: this.world.hull, credits: this.world.credits, tier: this.world.tier, kills: this.world.kills, time: this.world.time,
          hud: { credits: this.creditsText.text, tier: this.tierText.text },
          popups: this.dmgNums.filter(d => d.life > 0 && d.t.text.startsWith('+')).map(d => ({ text: d.t.text, alpha: d.t.alpha })),
          effects: { ...this.world.projSys.fx, ...this.world.gun.fx },
          arcs: Array.from(this.world.projSys.arcT).filter(t => t > 0).length,
        }),
        clientToGame: (cx: number, cy: number) => clientToGame(cx, cy, this.screenManager.app.canvas.getBoundingClientRect()),
        setTimeScale: (n: number) => { debugHooks.timeScale = n; },
        world: this.world,
      };
    }
  }

  statsInfo(o: StatsInfo) {
    const w = this.world;
    let fx = this.bursts.length;
    for (const d of this.dmgNums) if (d.life > 0) fx++;
    o.name = 'FREE FLY';
    o.proj = w.pool.count;
    o.projCap = w.pool.max;
    o.enemies = w.mitosis.enemies.length;
    o.fx = fx;
    o.kills = w.kills;
    o.extra = `tier ${w.tier}  spawn ${(1 / SPAWN_INTERVAL).toFixed(2)}/s  t ${w.time.toFixed(0)}s`;
  }

  showDamage(x: number, y: number, dmg: number) {
    this.showNumber(x, y, `${Math.round(dmg)}`, 0xffffff, 18);
  }

  /** Floating number from the shared pool: white damage numbers and small yellow "+N" credit popups. */
  showNumber(x: number, y: number, text: string, color: number, size: number) {
    const slot = this.dmgNums.find(d => d.life <= 0) ?? this.dmgNums[0];
    slot.t.text = text;
    slot.t.style.fill = color;
    slot.t.style.fontSize = size;
    slot.t.position.set(x + (Math.random() - 0.5) * 12, y - 10);
    slot.t.alpha = 1;
    slot.t.visible = true;
    slot.life = DMG_NUMBER_LIFE;
  }

  update(dt: number, frameTime: number, now: number) {
    const pointer = this.screenManager.input.pointer;
    // Spawn safety: the ship waits where it starts until the player's first pointer move or press.
    if (!this.world.controlStarted && this.gate.observe(pointer, pointer.seen)) this.world.beginControl();
    this.world.update(dt, pointer);

    for (const h of this.world.hits) {
      if (h.kind === 1) {
        // A burn tick: a small orange number, no hit flash.
        this.showNumber(h.x, h.y, `${Math.round(h.damage)}`, 0xff9a3c, 11);
        continue;
      }
      this.flash.set(h.enemyId, FLASH_TIME);
      this.showDamage(h.x, h.y, h.damage);
    }
    this.world.hits.length = 0;

    for (const k of this.world.killEvents) {
      this.popupTotal += k.reward;
      const whole = Math.floor(this.popupTotal + 1e-9);
      if (whole > this.shownCredits) {
        this.showNumber(k.x, k.y - 6, `+${fmtBig(whole - this.shownCredits)}`, THEME.currency, 14);
        this.shownCredits = whole;
      }
    }
    this.world.killEvents.length = 0;
    this.creditsText.text = `Credits +${fmtBig(this.world.credits)}`;
    this.tierText.text = `Tier ${this.world.tier}`;

    for (const s of this.world.splits) {
      const g = new Graphics().circle(0, 0, 20).stroke({ color: 0xffffff, width: 3 });
      g.position.set(s.x, s.y);
      this.fxLayer.addChild(g);
      this.bursts.push({ g, life: 0.3 });
    }
    this.world.splits.length = 0;

    this.ship.setPosition(this.world.shipX, this.world.shipY);
    this.ship.setAlpha(this.world.invuln > 0 ? (Math.floor(now / 100) % 2 === 0 ? 0.4 : 1) : 1);
    this.hullBarFg.width = Math.max(0, (this.world.hull / this.world.maxHull) * 100);
    // The HUD sits below the stats overlay while it is on.
    const hudDy = this.screenManager.stats.hudOffset;
    if (this.uiLayer.y !== hudDy) this.uiLayer.y = hudDy;

    const pool = this.world.pool;
    for (let i = 0; i < pool.max; i++) {
      const s = this.projSprites[i];
      if (pool.active[i]) {
        s.position.set(pool.x[i], pool.y[i]);
        const ph = pool.phase[i];
        if (ph === PHASE_MINE_WAIT) {
          // A waiting mine is a small red square.
          s.width = s.height = 14 * pool.size[i];
          s.tint = MINE_COLOR;
          s.rotation = Math.PI / 4;
        } else {
          s.width = 6 * pool.size[i];
          s.height = 14 * pool.size[i];
          s.tint = ph === PHASE_ORBIT || ph === PHASE_BOOM_OUT || ph === PHASE_BOOM_BACK ? LOOP_COLOR : ph === PHASE_MINE_TRAVEL ? MINE_COLOR : 0x00ffff;
          s.rotation = Math.atan2(pool.vy[i], pool.vx[i]) + Math.PI / 2;
        }
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
      const burning = (e.burnT ?? 0) > 0;
      const frozen = (e.freezeT ?? 0) > 0;
      s.tint = f > 0 ? 0xffffff : burning && frozen ? BURN_FROZEN_COLOR : frozen ? FROZEN_COLOR : burning ? BURN_COLOR : ROCK_COLOR;
      if (f > 0) this.flash.set(e.id, f - frameTime);
    }
    for (const [id, s] of this.enemySprites) {
      if (!alive.has(id)) {
        s.destroy();
        this.enemySprites.delete(id);
        this.flash.delete(id);
      }
    }

    const proj = this.world.projSys;
    this.arcG.clear();
    let arcs = 0;
    for (let k = 0; k < ARC_MAX; k++) {
      if (proj.arcT[k] <= 0) continue;
      this.arcG.moveTo(proj.arcX0[k], proj.arcY0[k]).lineTo(proj.arcX1[k], proj.arcY1[k]);
      arcs++;
    }
    if (arcs > 0) this.arcG.stroke({ width: 2, color: ARC_COLOR, alpha: 0.9 });

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

    if (this.world.gameOver && !this.finished) {
      this.endTimer += frameTime;
      if (this.endTimer >= END_DELAY) this.finish();
    }
  }

  /** The run is over: bank it exactly once and show the summary. */
  private finish() {
    this.finished = true;
    const w = this.world;
    const result = { credits: w.credits, kills: w.kills, time: w.time, tier: w.maxTier };
    const marks = getProgressStore().recordRun(result);
    this.screenManager.switchTo(new RunSummaryScreen(this.screenManager, result, marks));
  }

  destroy() {
    if (debugHooks.world === this.world) debugHooks.world = null;
    this.container.destroy({ children: true });
  }
}

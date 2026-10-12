import { Container, Graphics, Sprite, Texture, Text } from 'pixi.js';
import { CONFIG } from '../config';
import { World } from '../game/world';
import { specialKind } from '../data/waves';
import type { StatsInfo } from '../ui/stats';
import { clientToGame } from '../input';
import { Pausable, Screen, ScreenManager } from './ScreenManager';
import { Grid } from '../engine/compiler';
import { CATEGORY_COLOR, THEME } from '../ui/theme';
import { HIT_CLOUD } from '../engine/projectiles';
import { fmtBig } from '../ui/format';
import { makeText } from '../builder/ui';
import { getProgressStore } from '../econ/progress';
import { debugHooks } from '../debug/hooks';
import { RunSummaryScreen, fmtTime } from './RunSummaryScreen';
import { PointerGate } from '../engine/control';
import { FragmentPool, RockView, enemyArt } from '../ui/rockArt';
import { BackgroundView, forcedBackground, freeFlyThemeAt } from '../ui/background';
import { ShipView } from '../ui/shipArt';
import { drawFieldFx } from '../ui/fieldFx';
import { sfx } from '../audio';
import { bankFlyRun } from '../game/runEnd';
import { SfxFeed } from '../audio/feed';
import { ARC_MAX, PHASE_BOOM_BACK, PHASE_BOOM_OUT, PHASE_MINE_WAIT, PHASE_MINE_TRAVEL, PHASE_ORBIT } from '../engine/projectiles';

/** Status tints of a rock: burning is a redder orange, frozen a pale blue. */
const BURN_COLOR = 0xff4a1a;
const FROZEN_COLOR = 0xbfe6ff;
const BURN_FROZEN_COLOR = 0xe6bfc8;
const ARC_COLOR = 0xe8f4ff;
const MINE_COLOR = 0xff5050;
const LOOP_COLOR = 0xffe14d;
const FLASH_TIME = 0.08;
/** Free Fly background scroll in px/s (before each layer's parallax). */
const BG_SCROLL = 60;
const DMG_NUMBER_LIFE = 0.6;
/** Seconds between the hull reaching 0 and the Run Summary appearing. */
const END_DELAY = 0.7;
/** The "WAVE N" banner: seconds on screen, the fade at its end, and where it sits. */
const BANNER_TIME = 1.5;
const BANNER_FADE = 0.3;
const BANNER_Y = 300;
const BANNER_W = 220;
const BANNER_H = 72;

interface DmgNum { t: Text; life: number; }

export class FlyScreen implements Screen {
  container = new Container();
  world: World;
  
  projLayer = new Container();
  enemyLayer = new Container();
  fxLayer = new Container();
  uiLayer = new Container();
  /** Chain-lightning arcs: one Graphics, cleared and redrawn from the arc ring each frame. */
  private arcG = new Graphics();
  /** Residue Seed clouds and Gravity Well rings. */
  private fieldG = new Graphics();
  
  ship: ShipView;
  hullBarBg = new Graphics().rect(0, 0, 100, 10).fill(0xff0000);
  hullBarFg = new Graphics().rect(0, 0, 100, 10).fill(0x00ff00);
  
  projSprites: Sprite[] = [];
  enemySprites = new Map<number, RockView>();
  fragments = new FragmentPool();
  /** One fragment pool per species look (the basic rock's is `fragments`), made on first use. */
  private fragPools = new Map<string, FragmentPool>();
  private fragLayer = new Container();
  flash = new Map<number, number>();
  dmgNums: DmgNum[] = [];
  
  creditsText = makeText('Credits +0', 16, THEME.currency, { fontWeight: 'bold' });
  tierText = makeText('Tier 1', 16, THEME.textDim, { fontWeight: 'bold' });
  waveText = makeText('Wave 1', 16, THEME.text, { fontWeight: 'bold' });
  killsText = makeText('Kills 0', 16, THEME.textDim, { fontWeight: 'bold' });
  /** "WAVE N" banner (theme panel, no effects) shown for BANNER_TIME on each new wave. */
  private banner = new Container();
  private bannerTitle = makeText('WAVE 1', 30, THEME.text, { fontWeight: 'bold' });
  private bannerSub = makeText('', 14, THEME.textDim, { fontWeight: 'bold' });
  private bannerT = 0;

  /** Credits already shown as "+N" popups (whole credits), and the exact total they are measured against. */
  private shownCredits = 0;
  private popupTotal = 0;
  private endTimer = 0;
  private finished = false;
  private gate = new PointerGate();
  private sfxFeed = new SfxFeed(sfx);
  private crashSounded = false;
  /** Galaxy first, then the next theme every 3 minutes (3 s crossfade); ?bg=<id> forces one, ?bg=off hides it. */
  private bg: BackgroundView | null = null;
  private bgForced = forcedBackground();

  /** The pause menu's view of this run: it may pause once the ship is under control and until the run ends. */
  readonly pausable: Pausable = {
    canPause: () => this.world.controlStarted && !this.world.gameOver && !this.finished,
    resume: () => this.world.resumeEase(),
    restart: () => {
      if (this.finished) return;
      this.finished = true;
      bankFlyRun(this.world, getProgressStore());
      this.screenManager.switchTo(new FlyScreen(this.screenManager, this.grid, this.opts));
    },
    quit: () => { if (!this.finished) this.finish(); },
  };

  constructor(private screenManager: ScreenManager, private grid: Grid, private opts: { startWave?: number } = {}) {
    // A new seed per run: the waves are deterministic for a seed (World.seed, shown by the debug hook).
    this.world = new World({ grid, safeStart: true, seed: (Math.random() * 0x7fffffff) | 0, startWave: opts.startWave });
    debugHooks.world = this.world;
    
    this.fragPools.set('mitotic_rock', this.fragments);
    this.fragLayer.addChild(this.fragments.container);
    this.container.addChild(this.projLayer, this.enemyLayer, this.fragLayer);
    const w = this.world;
    this.ship = new ShipView(
      this.screenManager.app.renderer, grid.hullId ?? 'shuttle',
      w.recipes.map((r, i) => ({ x: w.spawnOffsets[i].x, y: w.spawnOffsets[i].y, dir: r.direction })),
    );
    this.container.addChild(this.ship.container, this.fxLayer, this.uiLayer);
    this.fxLayer.addChild(this.fieldG, this.arcG);
    if (this.bgForced !== 'off') {
      this.bg = new BackgroundView(this.screenManager.app.renderer, this.bgForced ?? freeFlyThemeAt(0));
      this.container.addChildAt(this.bg.container, 0);
    }

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
    this.waveText.position.set(20, 76);
    this.killsText.position.set(20, 96);
    this.uiLayer.addChild(this.creditsText, this.tierText, this.waveText, this.killsText);
    const panel = new Graphics().rect(-BANNER_W / 2, -BANNER_H / 2, BANNER_W, BANNER_H).fill(THEME.panel).stroke({ color: THEME.border, width: 1.5 });
    this.bannerTitle.anchor.set(0.5);
    this.bannerTitle.position.set(0, -8);
    this.bannerSub.anchor.set(0.5);
    this.bannerSub.position.set(0, 22);
    this.banner.addChild(panel, this.bannerTitle, this.bannerSub);
    this.banner.position.set(CONFIG.VIEW.W / 2, BANNER_Y);
    this.banner.visible = false;
    this.uiLayer.addChild(this.banner);

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
          hud: { credits: this.creditsText.text, tier: this.tierText.text, wave: this.waveText.text, kills: this.killsText.text },
          wave: this.world.wave, waveTimeLeft: this.world.waveTimeLeft, seed: this.world.seed,
          banner: this.banner.visible ? { title: this.bannerTitle.text, sub: this.bannerSub.text, alpha: this.banner.alpha } : null,
          species: this.world.mitosis.enemies.map(e => e.defId),
          popups: this.dmgNums.filter(d => d.life > 0 && d.t.text.startsWith('+')).map(d => ({ text: d.t.text, alpha: d.t.alpha })),
          effects: { ...this.world.projSys.fx, ...this.world.gun.fx, ...this.world.fx },
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
    let fx = 0;
    for (const p of this.fragPools.values()) fx += p.live;
    for (const d of this.dmgNums) if (d.life > 0) fx++;
    o.name = 'FREE FLY';
    o.proj = w.pool.count;
    o.projCap = w.pool.max;
    o.enemies = w.mitosis.enemies.length;
    o.fx = fx;
    o.kills = w.kills;
    o.extra = `wave ${w.wave}  tier ${w.tier}  t ${w.time.toFixed(0)}s`;
  }

  /** The fragment pool in a species' colours (its art def), made on first use. */
  private fragPool(defId: string): FragmentPool {
    const art = enemyArt(defId);
    let p = this.fragPools.get(art.id);
    if (!p) { p = new FragmentPool(16, art); this.fragPools.set(art.id, p); this.fragLayer.addChild(p.container); }
    return p;
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
    this.world.god = debugHooks.god;
    this.world.update(dt, pointer);
    const fx = this.world.projSys.fx;
    this.sfxFeed.frame({ shots: this.world.gun.shots, chainJumps: fx.chainJumps, wellsMade: fx.wellsMade, bounces: fx.bounces + fx.edgeBounces });
    if (this.world.gameOver && !this.crashSounded) { this.crashSounded = true; sfx.play('crash'); }
    if (this.bg) {
      // Constant slow scroll (no horizontal motion: Free Fly is one fixed screen).
      this.bg.update(frameTime, BG_SCROLL);
      if (!this.bgForced) { const want = freeFlyThemeAt(this.world.time); if (want !== this.bg.id) this.bg.crossfadeTo(want); }
    }

    for (const h of this.world.hits) {
      this.sfxFeed.hit({ id: h.enemyId, damage: h.damage, kind: h.kind, armor: h.armor, shield: h.shield, maxShield: h.maxShield }, true);
      if (h.kind === 1) {
        // A burn tick: a small orange number, no hit flash.
        this.showNumber(h.x, h.y, `${Math.round(h.damage)}`, 0xff9a3c, 11);
        continue;
      }
      if (h.kind === HIT_CLOUD) {
        // A Residue Seed tick: a small number in the Mitosis colour, no hit flash.
        this.showNumber(h.x, h.y, `${Math.round(h.damage)}`, CATEGORY_COLOR.mitosis, 11);
        continue;
      }
      this.flash.set(h.enemyId, FLASH_TIME);
      this.showDamage(h.x, h.y, h.damage);
    }
    this.world.hits.length = 0;

    for (const k of this.world.killEvents) {
      this.sfxFeed.kill(k.generation);
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
    this.waveText.text = `Wave ${Math.max(1, this.world.wave)}  next ${fmtTime(Math.ceil(this.world.waveTimeLeft))}`;
    this.killsText.text = `Kills ${this.world.kills}`;
    for (const ev of this.world.waveEvents) {
      sfx.play('wave');
      const kind = specialKind(ev.wave);
      this.bannerTitle.text = `WAVE ${ev.wave}`;
      this.bannerSub.text = [kind === 'swarm' ? 'SWARM' : kind === 'mothers' ? 'MOTHERS' : '', ev.bonus > 0 ? `+${fmtBig(ev.bonus)} credits` : ''].filter(Boolean).join('  ');
      this.bannerSub.style.fill = ev.bonus > 0 ? THEME.currency : THEME.textDim;
      this.bannerT = BANNER_TIME;
    }
    this.world.waveEvents.length = 0;
    if (this.bannerT > 0) {
      this.bannerT -= frameTime;
      this.banner.visible = this.bannerT > 0;
      this.banner.alpha = Math.min(1, Math.max(0, this.bannerT) / BANNER_FADE);
    }

    // A rock splitting throws 2 to 4 fragments (the children already exist as normal rocks).
    if (this.world.splits.length > 0) this.sfxFeed.split(); // one crack a frame however many rocks split
    for (const s of this.world.splits) this.fragPool(s.defId).emit(s.x, s.y, s.radius, s.parentId, enemyArt(s.defId));
    this.world.splits.length = 0;
    for (const p of this.fragPools.values()) p.update(frameTime);

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
        s = new RockView(e.defId, e.id, e.radius);
        this.enemyLayer.addChild(s.container);
        this.enemySprites.set(e.id, s);
      }
      s.container.position.set(e.x, e.y);
      s.setRadius(e.radius);
      const f = this.flash.get(e.id) ?? 0;
      s.update(e.maxHp > 0 ? 1 - e.hp / e.maxHp : 0, frameTime, f > 0);
      const burning = (e.burnT ?? 0) > 0;
      const frozen = (e.freezeT ?? 0) > 0;
      s.setStatus(burning && frozen ? BURN_FROZEN_COLOR : frozen ? FROZEN_COLOR : burning ? BURN_COLOR : -1);
      s.setMarks(e.armor > 0 ? e.armor / (e.armor0 ?? e.armor) : 0, e.maxShield > 0 ? e.shield / e.maxShield : 0);
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
    drawFieldFx(this.fieldG, proj);
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
    if (this.world.gameOver && !this.finished) {
      this.endTimer += frameTime;
      if (this.endTimer >= END_DELAY) this.finish();
    }
  }

  /** The run is over: bank it exactly once and show the summary. */
  private finish() {
    this.finished = true;
    const { result, marks } = bankFlyRun(this.world, getProgressStore());
    this.screenManager.switchTo(new RunSummaryScreen(this.screenManager, result, marks));
  }

  destroy() {
    if (debugHooks.world === this.world) debugHooks.world = null;
    this.container.destroy({ children: true });
  }
}

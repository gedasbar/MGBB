import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { CONFIG } from '../config';
import { World } from '../game/world';
import { specialKind } from '../data/waves';
import type { StatsInfo } from '../ui/stats';
import { clientToGame } from '../input';
import { Pausable, Screen, ScreenManager } from './ScreenManager';
import { Grid } from '../engine/compiler';
import { CATEGORY_COLOR, THEME } from '../ui/theme';
import { HIT_CLOUD } from '../engine/projectiles';
import { fmtBig, fmtDamage } from '../ui/format';
import { makeText } from '../builder/ui';
import { getProgressStore, RunResult } from '../econ/progress';
import { ShotSprites } from '../ui/shotSprites';
import { shotTextures } from '../ui/shotTextures';
import { debugHooks } from '../debug/hooks';
import { RunSummaryScreen, fmtTime, CaptainSummary } from './RunSummaryScreen';
import { KillBanker } from '../captains/state';
import { RunModifiers } from '../captains/modifiers';
import { CAPTAIN_BY_ID } from '../captains/data';
import { PointerGate } from '../engine/control';
import { FragmentPool, RockView, enemyArt } from '../ui/rockArt';
import { BackgroundView, forcedBackground, freeFlyThemeAt } from '../ui/background';
import { ShipView } from '../ui/shipArt';
import { drawFieldFx } from '../ui/fieldFx';
import { sfx } from '../audio';
import { bankFlyRun } from '../game/runEnd';
import { SfxFeed } from '../audio/feed';
import { EncounterParams, encounterOutcome, EncounterOutcome, planEncounter } from '../frontier/encounter';
import { FREEFLY_PASS_SHARE, FRONTIER_NAME, PROGRESS_COLOR } from '../frontier/constants';
import { FrontierScreen } from './FrontierScreen';
import { BuildScreen } from './BuildScreen';
import { RESULT_DELAY_CLEARED, RESULT_DELAY_FAILED } from '../wall/constants';
import { ARC_MAX } from '../engine/projectiles';

/** Status tints of a rock: burning is a redder orange, frozen a pale blue. */
const BURN_COLOR = 0xff4a1a;
const FROZEN_COLOR = 0xbfe6ff;
const BURN_FROZEN_COLOR = 0xe6bfc8;
const ARC_COLOR = 0xe8f4ff;
const FLASH_TIME = 0.08;
/** Free Fly background scroll in px/s (before each layer's parallax). */
const BG_SCROLL = 60;
const DMG_NUMBER_LIFE = 0.6;
/** The "WAVE N" banner: seconds on screen, the fade at its end, and where it sits. */
const BANNER_TIME = 1.5;
const BANNER_FADE = 0.3;
const BANNER_Y = 300;
const BANNER_W = 220;
const BANNER_H = 72;
/** Seconds the SECOND CHANCE hint blinks. */
const HINT_TIME = 1.2;

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
  
  private shots!: ShotSprites;
  /** The shot sprites, one per pool slot (the e2e scripts read them). */
  get projSprites(): Sprite[] { return this.shots.sprites; }
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
  /** Medal milestone banner ("+2 Medals") and the Second Chance hint (a short blink). */
  private medalBanner = new Container();
  private medalTitle = makeText('', 20, THEME.currency, { fontWeight: 'bold' });
  private medalT = 0;
  private hint = makeText('SECOND CHANCE', 22, THEME.good, { fontWeight: 'bold' });
  private hintT = 0;
  private seenSecondChance = 0;
  /** The captain flying this run: its effects, and the hand-over of its kills. */
  private mods: RunModifiers;
  private banker: KillBanker;
  private medalsRun = 0;
  private medalsDoubled = false;

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
    persist: () => { if (!this.finished) this.banker.flush(this.world.kills); },
    canPause: () => this.world.controlStarted && !this.world.gameOver && !this.finished,
    resume: () => this.world.resumeEase(),
    restart: () => {
      if (this.finished) return;
      this.finished = true;
      if (this.opts.frontier) this.bankEncounter(); else bankFlyRun(this.world, getProgressStore(), this.banker);
      this.screenManager.switchTo(new FlyScreen(this.screenManager, this.grid, this.opts));
    },
    quit: () => { if (!this.finished) this.finish(); },
  };

  /** Frontier encounter (chunk 15b): the countdown bar with its half-way mark, and the run's outcome once it ends. */
  private timeBarBg = new Graphics();
  private timeBarFg = new Graphics();
  outcome: EncounterOutcome | null = null;

  constructor(private screenManager: ScreenManager, private grid: Grid, private opts: { startWave?: number; frontier?: { x: number; y: number; params: EncounterParams; spike: boolean; squareTier: number } } = {}) {
    // A new seed per run: the waves are deterministic for a seed (World.seed, shown by the debug hook).
    const store = getProgressStore();
    this.mods = store.runModifiers();
    this.banker = new KillBanker(store, store.data.captains.selected);
    const fr = opts.frontier;
    // A Frontier encounter plays a fixed plan (its own seed); normal Free Fly is exactly as before.
    const encounter = fr ? { plan: planEncounter(fr.params), wave: fr.params.wave, tier: fr.params.tier, hpMul: fr.params.hpMul, duration: fr.params.duration } : undefined;
    this.world = new World({
      grid, safeStart: true, seed: fr ? fr.params.seed : (Math.random() * 0x7fffffff) | 0, startWave: fr ? undefined : opts.startWave, modifiers: this.mods,
      ...(encounter ? { encounter } : {}),
    });
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
      this.bg = new BackgroundView(this.screenManager.app.renderer, this.bgForced ?? (fr?.spike ? 'ember' : freeFlyThemeAt(0)));
      this.container.addChildAt(this.bg.container, 0);
    }

    this.hullBarBg.position.set(20, 20);
    this.hullBarFg.position.set(20, 20);
    this.uiLayer.addChild(this.hullBarBg, this.hullBarFg);
    if (fr) {
      // Countdown: the bar empties as time runs out; the tick marks the half-way point (survive past it = PASSED).
      const W = CONFIG.VIEW.W - 40;
      this.timeBarBg.rect(0, 0, W, 6).fill(THEME.border).rect(W * (1 - FREEFLY_PASS_SHARE) - 1, -4, 2, 14).fill(THEME.text);
      this.timeBarBg.position.set(20, 4);
      this.timeBarFg.position.set(20, 4);
      this.uiLayer.addChild(this.timeBarBg, this.timeBarFg);
    }

    this.shots = new ShotSprites(this.projLayer, this.world.pool.max, shotTextures(this.screenManager.app), CONFIG.VIEW.W, CONFIG.VIEW.H);

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
    const mPanel = new Graphics().rect(-BANNER_W / 2, -22, BANNER_W, 44).fill(THEME.panel).stroke({ color: THEME.currency, width: 1.5 });
    this.medalTitle.anchor.set(0.5);
    this.medalBanner.addChild(mPanel, this.medalTitle);
    this.medalBanner.position.set(CONFIG.VIEW.W / 2, BANNER_Y + BANNER_H / 2 + 40);
    this.medalBanner.visible = false;
    this.hint.anchor.set(0.5);
    this.hint.position.set(CONFIG.VIEW.W / 2, BANNER_Y - 90);
    this.hint.visible = false;
    this.uiLayer.addChild(this.medalBanner, this.hint);

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
          captain: { id: this.banker.captainId, mods: this.mods, medalsRun: this.medalsRun, killsHanded: this.banker.added, maxHull: this.world.maxHull, secondChancesLeft: this.world.secondChancesLeft, medalBanner: this.medalBanner.visible ? this.medalTitle.text : null },
          arcs: Array.from(this.world.projSys.arcT).filter(t => t > 0).length,
          encounter: this.world.encounter ? { duration: this.world.encounter.duration, wave: this.world.encounter.wave, tier: this.world.encounter.tier, survived: this.world.survived, outcome: this.outcome, timeBar: this.timeBarFg.width } : null,
        }),
        screen: 'fly',
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
    this.showNumber(x, y, fmtDamage(dmg), 0xffffff, 18);
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
    if (this.world.gameOver && !this.crashSounded) { this.crashSounded = true; sfx.play(this.world.survived ? 'medal' : 'crash'); }
    if (this.bg) {
      // Constant slow scroll (no horizontal motion: Free Fly is one fixed screen).
      this.bg.update(frameTime, BG_SCROLL);
      if (!this.bgForced) { const want = freeFlyThemeAt(this.world.time); if (want !== this.bg.id) this.bg.crossfadeTo(want); }
    }

    for (const h of this.world.hits) {
      this.sfxFeed.hit({ id: h.enemyId, damage: h.damage, kind: h.kind, armor: h.armor, shield: h.shield, maxShield: h.maxShield }, true);
      if (h.kind === 1) {
        // A burn tick: a small orange number, no hit flash.
        this.showNumber(h.x, h.y, fmtDamage(h.damage), 0xff9a3c, 11);
        continue;
      }
      if (h.kind === HIT_CLOUD) {
        // A Residue Seed tick: a small number in the Mitosis colour, no hit flash.
        this.showNumber(h.x, h.y, fmtDamage(h.damage), CATEGORY_COLOR.mitosis, 11);
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
    const sqr = this.opts.frontier;
    this.tierText.text = sqr ? `Tier ${sqr.squareTier} (wave ${sqr.params.wave} enemies)` : `Tier ${this.world.tier}`;
    const enc = this.world.encounter;
    if (enc) {
      const left = Math.max(0, enc.duration - this.world.time);
      this.waveText.text = `${FRONTIER_NAME} encounter  survive ${fmtTime(Math.ceil(left))}`;
      this.timeBarFg.clear().rect(0, 0, (CONFIG.VIEW.W - 40) * (left / enc.duration), 6).fill(this.world.time >= enc.duration * FREEFLY_PASS_SHARE ? PROGRESS_COLOR : THEME.currency);
    } else this.waveText.text = `Wave ${Math.max(1, this.world.wave)}  next ${fmtTime(Math.ceil(this.world.waveTimeLeft))}`;
    this.killsText.text = `Kills ${this.world.kills}`;
    for (const ev of this.world.waveEvents) {
      sfx.play('wave');
      const kind = specialKind(ev.wave);
      this.bannerTitle.text = `WAVE ${ev.wave}`;
      this.bannerSub.text = [kind === 'swarm' ? 'SWARM' : kind === 'mothers' ? 'MOTHERS' : '', ev.bonus > 0 ? `+${fmtBig(ev.bonus)} credits` : ''].filter(Boolean).join('  ');
      this.bannerSub.style.fill = ev.bonus > 0 ? THEME.currency : THEME.textDim;
      this.bannerT = BANNER_TIME;
      // Free Fly Medal milestones (first time only per save). A run started at a later wave by a cheat earns none.
      if ((this.opts.startWave ?? 1) <= 1) {
        const award = getProgressStore().claimFlyMilestone(ev.wave, this.mods.medalDouble);
        if (award) {
          this.medalsRun += award.medals;
          this.medalsDoubled ||= award.doubled;
          this.medalTitle.text = `+${award.medals} Medal${award.medals === 1 ? '' : 's'}${award.doubled ? ' DOUBLED!' : ''}`;
          this.medalT = BANNER_TIME + 0.5;
          sfx.play('medal');
        }
      }
    }
    this.world.waveEvents.length = 0;
    if (this.medalT > 0) {
      this.medalT -= frameTime;
      this.medalBanner.visible = this.medalT > 0;
      this.medalBanner.alpha = Math.min(1, Math.max(0, this.medalT) / BANNER_FADE);
    }
    const sc = this.world.fx.secondChance;
    if (sc > this.seenSecondChance) { this.seenSecondChance = sc; this.hintT = HINT_TIME; }
    if (this.hintT > 0) {
      this.hintT -= frameTime;
      // A blink: on for 0.15 s, off for 0.15 s.
      this.hint.visible = this.hintT > 0 && Math.floor(this.hintT / 0.15) % 2 === 0;
    }
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

    this.shots.sync(this.world.pool);

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
      if (this.endTimer >= (this.world.survived ? RESULT_DELAY_CLEARED : RESULT_DELAY_FAILED)) this.finish();
    }
  }

  /**
   * Frontier encounter: books the square (cleared / passed / failed by the time survived; a quit counts like a death at
   * that time), credits and kills. Free Fly records are not touched. Returns the Medals paid.
   */
  private bankEncounter(): { medals: number; doubled: boolean; newBestEarnings: boolean } {
    const fr = this.opts.frontier!;
    const w = this.world;
    this.outcome = encounterOutcome(w.time, fr.params.duration, w.survived);
    const r = getProgressStore().recordFrontierFly({ x: fr.x, y: fr.y, credits: w.credits, kills: w.kills, outcome: this.outcome, medalDouble: this.mods.medalDouble });
    this.banker.flush(w.kills);
    return { medals: r.medals, doubled: r.medalDoubled, newBestEarnings: r.newBestEarnings };
  }

  /** The run is over: bank it exactly once and show the summary. */
  private finish() {
    if (this.opts.frontier) { this.finishEncounter(); return; }
    this.finished = true;
    const store = getProgressStore();
    const { result, marks } = bankFlyRun(this.world, store, this.banker);
    const id = this.banker.captainId;
    const captain: CaptainSummary = {
      name: CAPTAIN_BY_ID[id]?.name ?? id, killsAdded: this.banker.added, killsTotal: store.data.captains.heroes[id]?.kills ?? 0,
      medals: this.medalsRun, doubled: this.medalsDoubled,
    };
    this.screenManager.switchTo(new RunSummaryScreen(this.screenManager, result, marks, undefined, captain));
  }

  private finishEncounter() {
    this.finished = true;
    const store = getProgressStore();
    const paid = this.bankEncounter();
    const w = this.world;
    const sm = this.screenManager;
    const grid = this.grid;
    const opts = this.opts;
    const id = this.banker.captainId;
    const captain: CaptainSummary = {
      name: CAPTAIN_BY_ID[id]?.name ?? id, killsAdded: this.banker.added, killsTotal: store.data.captains.heroes[id]?.kills ?? 0,
      medals: paid.medals, doubled: paid.doubled,
    };
    const result: RunResult = { credits: w.credits, kills: w.kills, time: w.time, tier: w.tier, shots: { ...w.projSys.runStats } };
    sm.switchTo(new RunSummaryScreen(sm, result, { newBestTier: false, newBestTime: false, newBestEarnings: paid.newBestEarnings }, {
      result: this.outcome!, destroyed: 0, total: 0, medal: paid.medals > 0,
      encounter: { duration: opts.frontier!.params.duration, kills: w.kills },
      buttons: [
        { id: 'summaryFrontier', label: FRONTIER_NAME, onTap: () => sm.switchTo(new FrontierScreen(sm)) },
        { id: 'summaryRetry', label: 'Retry', onTap: () => sm.switchTo(new FlyScreen(sm, grid, opts)) },
        { id: 'summaryBuild', label: 'Build', onTap: () => sm.switchTo(new BuildScreen(sm)) },
      ],
    }, captain));
  }

  destroy() {
    if (debugHooks.world === this.world) debugHooks.world = null;
    this.container.destroy({ children: true });
  }
}

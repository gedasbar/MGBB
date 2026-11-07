import { CONFIG, shipHalfW } from '../config';
import { amountLabel } from '../ui/widgets';
import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { Grid } from '../engine/compiler';
import { clientToGame } from '../input';
import { makeText } from '../builder/ui';
import { debugHooks } from '../debug/hooks';
import { getProgressStore, isUnlocked, RunResult, unlockSummary } from '../econ/progress';
import { ShotSprites } from '../ui/shotSprites';
import { shotTextures } from '../ui/shotTextures';
import { cosmeticsFor } from '../ui/cosmetics';
import { fmtBig } from '../ui/format';
import { makeSpikeBadge, SPIKE_BADGE } from '../ui/hud';
import { THEME } from '../ui/theme';
import { wallFillColor, wallFlashColor } from '../ui/wallBlockLook';
import { ShipSteer } from '../engine/steer';
import { backgroundsOn, touchGain, touchMode } from '../ui/touchMode';
import { pushShipX, ringScreenX, WallCamera } from '../wall/camera';
import { CELL, RESULT_DELAY_CLEARED, RESULT_DELAY_CRASHED, RESULT_DELAY_PASSED, SHIP_START_Y, VIEW_H, VIEW_W } from '../wall/constants';
import { generateLevel, MAX_TIER } from '../wall/generator';
import { BuildScreen } from './BuildScreen';
import { openModeScreen } from '../map/nav';
import { FrontierScreen } from './FrontierScreen';
import { FRONTIER_NAME } from '../frontier/constants';
import { LevelDef } from '../wall/level';
import { WallWorld } from '../wall/wallWorld';
import { PointerGate } from '../engine/control';
import { ShipView } from '../ui/shipArt';
import { BackgroundView, backgroundForTier, forcedBackground } from '../ui/background';
import { RunSummaryScreen, CaptainSummary, ChallengeSummary } from './RunSummaryScreen';
import { KillBanker } from '../captains/state';
import { CAPTAIN_BY_ID } from '../captains/data';
import { Pausable, Screen, ScreenManager } from './ScreenManager';
import type { StatsInfo } from '../ui/stats';
import { drawFieldFx } from '../ui/fieldFx';
import { sfx } from '../audio';
import { SfxFeed } from '../audio/feed';
import { ARC_MAX } from '../engine/projectiles';
import { DEBUG_ON } from '../debug/enabled';
import { ChallengeDef } from '../data/challenges';
import { challengeRewardText, challengeVerdict } from '../challenges/rules';
import { endChallengeSession } from '../challenges/session';
import { FeelHub } from '../fx/hub';
import { FxView } from '../fx/fxView';
import { FEEL } from '../data/feel';
import { popScale } from '../fx/feel';

/** The HUD box (top-left): plate position, first text column, row height and the narrowest the plate goes. */
const HUD_PLATE_X = 10;
const HUD_X = 20;
const HUD_Y = 12;
const HUD_ROW = 20;
const HUD_MIN_W = 190;
const POPUPS = 40;
const POPUP_LIFE = 0.6;
/** Seconds the SECOND CHANCE hint blinks. */
const HINT_TIME = 1.2;

const FRAME = 0x55555a;
const FRAME_ARMOR = 0xd4d4d8;
const INNER_BG = THEME.plateFace;
const GREEN = 0x6fbf73;
const SHIELD_BAR = 0x5fd4e8;
/** Faint status overlays on a block: a burning one is washed orange, a frozen one pale blue. */
const BURN_TINT = 0xff7a1a;
const FROZEN_TINT = 0xbfe6ff;
const OVERLAY_ALPHA = 0.42;
const ARC_COLOR = 0xe8f4ff;

/** Block art: a frame, a dark well and a green square that shrinks with the HP left. */
const GAP = 1;
const FRAME_W = 3;
const FRAME_W_ARMOR = 6;
const PAD = 2;
const MIN_INNER = 5;
const SHIELD_H = 3;

interface BlockView { frame: Sprite; well: Sprite; inner: Sprite; shield: Sprite; status: Sprite }
interface Popup { t: Text; life: number; key: number; value: number; big: boolean; age: number }

function whiteSprite(color: number): Sprite {
  const s = new Sprite(Texture.WHITE);
  s.tint = color;
  s.visible = false;
  return s;
}

function lerpColor(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 255;
  const mix = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

/** Side of the green square for a block of `hpFrac` HP left (exported for tests and the e2e hook). */
function innerSize(hpFrac: number, armored: boolean, side = CELL): number {
  const wellW = side - 2 * GAP - 2 * (armored ? FRAME_W_ARMOR : FRAME_W);
  const max = wellW - 2 * PAD;
  return Math.max(MIN_INNER, Math.round(max * Math.max(0, Math.min(1, hpFrac))));
}

/** A wall level: 21 columns, 10 visible, the camera scrolls sideways when the pointer nears an edge. */
export class WallScreen implements Screen {
  container = new Container();
  world: WallWorld;
  camera: WallCamera;

  private blockLayer = new Container();
  private projLayer = new Container();
  private ship: ShipView;
  private arcG = new Graphics();
  /** Residue Seed clouds. */
  private fieldG = new Graphics();
  /** Chunk 27b: the rim of the fog. */
  private fogG = new Graphics();
  private bg: BackgroundView | null = null;
  /** ?debug=1: a faint line at world x = 0 so the seam of a ring can be seen. */
  private seamLine: Graphics | null = null;
  private fxLayer = new Container();
  private uiLayer = new Container();
  /** The HUD text and its plate; moved down while the stats overlay is on. */
  private hudBox = new Container();
  private views: BlockView[] = [];
  private shots!: ShotSprites;
  /** Chunk 34a: the feel pass, its drawing, the stamp and flash of a finished wall. */
  readonly feel = new FeelHub();
  private fxView!: FxView;
  private prevShots = 0;
  private stamp = new Container();
  private stampText = makeText('', FEEL.STAMP.SIZE, THEME.text, { fontWeight: 'bold' });
  private flashG = new Graphics();
  private shipBroken = false;
  /** The shot sprites, one per pool slot (the e2e scripts read them). */
  get projSprites(): Sprite[] { return this.shots.sprites; }
  private popups: Popup[] = [];
  private progressBg = new Graphics().rect(VIEW_W - 8, 20, 4, VIEW_H - 40).fill(THEME.border);
  private progressFg = new Graphics();
  /** Chunk 34c: the shared amount widget (coin + number centred on one line); its origin is the row's vertical centre. */
  private creditsLabel = amountLabel('+0', 16, 'credits', { align: 'left' });
  private get creditsText(): Text { return this.creditsLabel.amount; }
  /** Chunk 34b: the credits coin and the amount, one HUD row. */
  private creditsRow = new Container();
  private tierText = makeText('Tier 1', 16, THEME.textDim, { fontWeight: 'bold' });
  private nameText = makeText('', 15, THEME.textDim, { fontWeight: 'bold' });
  private spikeBadge = makeSpikeBadge();
  /** The Frontier square line of the HUD box (hidden in the campaign). */
  private squareText = makeText('', 15, THEME.textDim, { fontWeight: 'bold' });
  private hudPlate = new Graphics();
  private hudKey = '';
  private hudSize = { x: HUD_PLATE_X, y: HUD_Y, w: 0, h: 0 };
  private blocksText = makeText('Destroyed 0%', 16, THEME.textDim, { fontWeight: 'bold' });

  private shownCredits = 0;
  private popupTotal = 0;
  private endTimer = 0;
  private finished = false;
  private gate = new PointerGate();
  private steer = new ShipSteer(VIEW_W / 2, SHIP_START_Y, { minX: shipHalfW(VIEW_W), maxX: VIEW_W - shipHalfW(VIEW_W), minY: CONFIG.PLAYER.MARGIN, maxY: VIEW_H - CONFIG.PLAYER.MARGIN });
  private sfxFeed = new SfxFeed(sfx);
  private endSounded = false;
  /** The captain flying this level: the hand-over of its kills, and the Second Chance hint. */
  private banker: KillBanker;
  private hint = makeText('SECOND CHANCE', 22, THEME.good, { fontWeight: 'bold' });
  private hintT = 0;
  private seenSecondChance = 0;
  /** Slots used by the last draw, for the e2e hook. */
  private lastDrawn: { col: number; row: number; inner: number }[] = [];

/** The pause menu's view of this level: pausable from the first move until the level ends. */
  readonly pausable: Pausable = {
    persist: () => { if (!this.finished) this.banker.flush(this.world.destroyed); },
    canPause: () => this.world.state === 'playing' && !this.finished,
    resume: () => { this.world.resumeEase(); this.steer.release(); },
    restart: () => {
      if (this.finished) return;
      this.finished = true;
      this.world.bank(getProgressStore());
      this.banker.flush(this.world.destroyed);
      this.sm.switchTo(new WallScreen(this.sm, this.levelDef, this.grid, this.challenge));
    },
    quit: () => { if (!this.finished) this.finish(); },
  };

  /** `challenge` (chunk 28a): the rule this run is flown under; the in-run rules go to the world, the verdict is given when the run ends. */
  constructor(private sm: ScreenManager, readonly levelDef: LevelDef, private grid: Grid, readonly challenge: ChallengeDef | null = null) {
    const store = getProgressStore();
    this.banker = new KillBanker(store, store.data.captains.selected);
    this.world = new WallWorld(levelDef, { grid, safeStart: true, modifiers: store.runModifiers(), rules: challenge ? { noFire: challenge.rules.noFire, timeLimit: challenge.rules.timeLimit } : undefined });
    debugHooks.wall = this.world;
    const worldW = this.world.worldW;
    // A ring wall: the camera is unclamped and wraps; a flat wall (wrap: false) clamps to its width.
    this.camera = this.world.ring ? new WallCamera(0, worldW - VIEW_W, worldW) : new WallCamera(0, worldW - VIEW_W);

    this.ship = new ShipView(this.sm.app.renderer, grid.hullId ?? 'shuttle');
    this.container.addChild(this.blockLayer, this.projLayer, this.ship.container, this.fxLayer, this.uiLayer);
    this.fxLayer.addChild(this.fogG, this.fieldG, this.arcG);
    const forcedBg = forcedBackground() ?? (backgroundsOn() ? null : 'off'); // chunk 28b: Settings > Graphics > Backgrounds
    if (forcedBg !== 'off') {
      this.bg = new BackgroundView(this.sm.app.renderer, forcedBg ?? backgroundForTier(levelDef.tier, !!levelDef.spike));
      this.container.addChildAt(this.bg.container, 0);
    }
    if (typeof window !== 'undefined' && window.location.search.includes('debug=1')) {
      this.seamLine = new Graphics().rect(-1, 0, 2, VIEW_H).fill({ color: 0xff3366, alpha: 0.3 });
      this.seamLine.visible = false;
      this.container.addChildAt(this.seamLine, this.bg ? 1 : 0);
    }

    // Enough views for every cell that can be on screen at once (11 partial columns x 19 partial rows, with slack).
    const slots = 12 * (Math.ceil(VIEW_H / CELL) + 2) * (levelDef.effects?.mitosis ? 4 : 1); // a Mitosis cell can hold four pieces
    for (let i = 0; i < slots; i++) {
      const v: BlockView = { frame: whiteSprite(FRAME), well: whiteSprite(INNER_BG), inner: whiteSprite(GREEN), shield: whiteSprite(SHIELD_BAR), status: whiteSprite(BURN_TINT) };
      v.status.alpha = OVERLAY_ALPHA;
      this.blockLayer.addChild(v.frame, v.well, v.inner, v.shield, v.status);
      this.views.push(v);
    }

    this.fxView = new FxView(this.feel, this.sm.app);
    this.fxLayer.addChild(this.fxView.container);
    this.stampText.anchor.set(0.5);
    this.stamp.addChild(this.stampText);
    this.stamp.position.set(VIEW_W / 2, VIEW_H * 0.38);
    this.stamp.visible = false;
    this.flashG.rect(0, 0, VIEW_W, VIEW_H).fill(0xffffff);
    this.flashG.visible = false;
    this.uiLayer.addChild(this.flashG, this.stamp);
    this.shots = new ShotSprites(this.projLayer, this.world.pool.max, shotTextures(this.sm.app), VIEW_W, VIEW_H);
    this.applyCosmetics();

    for (let i = 0; i < POPUPS; i++) {
      const t = new Text({ text: '', style: { fill: THEME.currency, fontSize: 14, fontWeight: 'bold', stroke: { color: 0x000000, width: 3 } } });
      t.anchor.set(0.5);
      t.visible = false;
      this.fxLayer.addChild(t);
      this.popups.push({ t, life: 0, key: -1, value: 0, big: false, age: 0 });
    }

    this.spikeBadge.visible = !!levelDef.spike;
    this.nameText.text = levelDef.name ? `Wall: ${levelDef.name}` : '';
    // A dim plate behind the HUD text so it stays readable over the blocks. Everything, the SPIKE badge too, sits inside it.
    this.creditsRow.addChild(this.creditsLabel);
    this.creditsLabel.y = Math.round(this.tierText.height / 2);
    this.hudBox.addChild(this.hudPlate, this.creditsRow, this.tierText, this.spikeBadge, this.squareText, this.nameText, this.blocksText);
    this.hint.anchor.set(0.5);
    this.hint.position.set(VIEW_W / 2, 250);
    this.hint.visible = false;
    this.uiLayer.addChild(this.hudBox, this.progressBg, this.progressFg, this.hint);

    this.updateTexts();

    if (DEBUG_ON) {
      (window as any).__mgbm = {
        screen: 'wall',
        state: () => this.debugState(),
        clientToGame: (cx: number, cy: number) => clientToGame(cx, cy, this.sm.app.canvas.getBoundingClientRect()),
        setTimeScale: (n: number) => { debugHooks.timeScale = n; },
        wall: this.world,
        camera: this.camera,
        sampleBlocks: () => this.lastDrawn,
        level: levelDef,
      };
    }
  }

  /** Dev hook: the feel pass's numbers (chunk 34a). */
  private feelState() {
    const f = this.feel;
    return { trauma: f.shake.trauma, particles: f.particles.count, particleMode: f.particles.mode, rings: f.rings.list.length, stopLeft: f.stop.left, drawn: this.fxView.visibleCount, autoDropped: f.autoDropped, pendingBlasts: f.pendingBlasts };
  }

  private debugState() {
    const w = this.world;
    return {
      feel: this.feelState(), state: w.state, time: w.time, finishY: w.finishY, progress: w.progress, alive: w.alive, total: w.total, destroyed: w.destroyed,
      credits: w.credits, wallOffsetY: w.wallOffsetY, bottomEdge: w.bottomEdge(), scrollSpeed: w.scroll, cameraX: this.camera.x, cameraSpeed: this.camera.speed, bgCamX: this.bg ? this.bg.camX : null,
      controlStarted: w.controlStarted, invuln: w.invuln, shipWorldX: w.shipX, shipScreenX: this.sx(w.shipX), camTravel: this.camera.travel, worldW: w.worldW, ring: w.ring, shipY: w.shipY, projectiles: w.pool.count,
      hud: { credits: this.creditsText.text, tier: this.tierText.text, name: this.levelDef.name ?? '', nameLabel: this.nameText.text, square: this.squareText.text, spike: this.spikeBadge.visible, spikeBox: this.spikeBadge.visible ? { x: this.spikeBadge.x, w: SPIKE_BADGE.w } : null, plate: this.hudSize, blocks: this.blocksText.text },
      drawn: this.lastDrawn.length,
      effects: { ...w.projSys.fx, ...w.gun.fx, ...w.fx },
      captain: { id: this.banker.captainId, mods: w.mods, secondChancesLeft: w.secondChancesLeft, killsHanded: this.banker.added },
      arcs: Array.from(w.projSys.arcT).filter(t => t > 0).length,
    };
  }

  statsInfo(o: StatsInfo) {
    const w = this.world;
    let fx = 0;
    for (const p of this.popups) if (p.life > 0) fx++;
    o.name = 'WALL';
    o.proj = w.pool.count;
    o.projCap = w.pool.max;
    o.enemies = w.alive;
    o.fx = fx;
    o.kills = w.total - w.alive;
    o.fx += this.feel.particles.count;
    o.extra = `blocks ${w.alive}/${w.total}  scroll ${Math.round(w.scroll)}  camX ${Math.round(this.camera.x)}`;
  }

  /** Stacks the HUD rows (credits, tier + SPIKE badge, Frontier square, wall name, destroyed) and sizes the plate to the widest one. */
  private layoutHud() {
    const rows: (Container)[] = [this.creditsRow, this.tierText];
    const sq = this.squareText.text !== '';
    const nm = this.nameText.text !== '';
    if (sq) rows.push(this.squareText);
    if (nm) rows.push(this.nameText);
    rows.push(this.blocksText);
    this.squareText.visible = sq;
    this.nameText.visible = nm;
    let right = 0;
    rows.forEach((r, i) => { r.position.set(HUD_X, HUD_Y + 8 + i * HUD_ROW); right = Math.max(right, HUD_X + r.width); });
    const badge = this.spikeBadge.visible;
    if (badge) {
      this.spikeBadge.position.set(Math.max(right, HUD_X + this.tierText.width + 12), HUD_Y + 8 + HUD_ROW + (this.tierText.height - SPIKE_BADGE.h) / 2);
      right = Math.max(right, this.spikeBadge.x + SPIKE_BADGE.w);
    }
    const w = Math.max(HUD_MIN_W, right + HUD_X - HUD_PLATE_X + 4);
    const h = rows.length * HUD_ROW + 12;
    const key = `${Math.round(w)}x${h}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    this.hudSize = { x: HUD_PLATE_X, y: HUD_Y, w, h };
    this.hudPlate.clear().rect(HUD_PLATE_X, HUD_Y, w, h).fill({ color: THEME.bg, alpha: 0.72 });
  }

  /** The HUD line of a challenge run (hidden in an ordinary run): the time left, or the rule that is on. */
  private challengeHud(): string {
    const ch = this.challenge;
    if (!ch) return '';
    const w = this.world;
    if (w.timeLimit !== undefined) return w.overTime ? 'Challenge: too slow' : `Challenge: ${Math.ceil(w.timeLimit - w.time)} s left`;
    if (ch.rules.noFire) return 'Challenge: no firing';
    return `Challenge: ${ch.name}`;
  }

  private updateTexts() {
    const w = this.world;
    const hudDy = this.sm.stats.hudOffset;
    if (this.hudBox.y !== hudDy) this.hudBox.y = hudDy;
    this.creditsText.text = `+${fmtBig(w.credits)}`;
    const sq = this.levelDef.frontier;
    this.tierText.text = `Tier ${w.tier}`;
    this.squareText.text = sq ? `${FRONTIER_NAME} (${fmtBig(sq.x)}, ${fmtBig(sq.y)})` : this.challengeHud();
    this.squareText.style.fill = w.overTime ? THEME.bad : THEME.textDim;
    this.layoutHud();
    this.blocksText.text = `Destroyed ${Math.floor(w.percentDestroyed)}%`;
    const h = (VIEW_H - 40) * w.progress;
    this.progressFg.clear();
    if (h > 0) this.progressFg.rect(VIEW_W - 8, 20 + (VIEW_H - 40) - h, 4, h).fill(GREEN);
  }

  update(dt: number, frameTime: number, now: number) {
    const w = this.world;
    const p = this.sm.input.pointer;
    // Chunk 34a: the feel pass first. A hit stop freezes the simulation for a few frames; the shake, particles and stamp carry on.
    this.feel.applySettings({ shake: sfx.settings.shake, particles: sfx.settings.particles, hitStop: sfx.settings.hitStop });
    const frozen = this.feel.update(frameTime);
    const o = this.feel.shake.offset();
    this.container.position.set(o.x, o.y);
    this.uiLayer.position.set(-o.x, -o.y);
    this.updateStamp(frameTime);
    if (frozen) { this.fxView.sync(x => this.sx(x)); return; }

    // Spawn safety: nothing follows the pointer (ship and camera alike) until the first move or press after the run started.
    if (!w.controlStarted && this.gate.observe(p, p.seen)) w.beginControl();
    // Chunk 24a: the pointer sets the ship's target (touch: by the finger's movement), the ship flies there at a capped speed, and the
    // camera's edge push follows the SHIP's place on the screen, so a ship held at a side keeps scrolling even after the finger is lifted.
    this.steer.mode = touchMode();
    this.steer.gain = touchGain();
    this.steer.update(p);
    this.camera.update(dt, pushShipX(w.state === 'playing', w.controlStarted, this.sx(w.shipX)));
    const target = w.controlStarted ? { x: this.steer.x + this.camera.x, y: this.steer.y } : null;
    w.god = debugHooks.god;
    // The overload rule's idea of "off-screen" follows the camera (chunk 21b).
    const ps = w.projSys;
    ps.viewCx = this.camera.x + VIEW_W / 2;
    ps.viewHalfW = VIEW_W / 2 + CONFIG.OVERLOAD.VIEW_MARGIN;
    ps.viewTop = -CONFIG.OVERLOAD.VIEW_MARGIN;
    ps.viewBottom = VIEW_H + CONFIG.OVERLOAD.VIEW_MARGIN;
    w.update(dt, target);
    const fx = w.projSys.fx;
    this.sfxFeed.frame({ shots: w.gun.shots, chainJumps: fx.chainJumps, wellsMade: fx.wellsMade, bounces: fx.bounces + fx.edgeBounces });
    for (const h of w.hits) {
      this.sfxFeed.hit({ id: h.blockId, damage: h.damage, kind: h.kind, armor: h.armor, shield: h.shield, maxShield: h.maxShield }, false);
      if (h.kind === 0) this.feel.spark(h.x, h.y, 0xbfe9f5);
      if (h.big) { this.feel.bigHit(); this.showBigHit(h.blockId, this.sx(h.x), h.y, h.damage); }
    }
    this.feelEvents();
    if (w.state !== 'playing' && !this.endSounded) { this.endSounded = true; sfx.play(w.state === 'crashed' ? 'crash' : 'cleared'); }
    // The background scrolls with the real wall speed (top-edge boost included); on a ring also sideways with the camera.
    if (this.bg) this.bg.update(frameTime, w.state === 'playing' ? w.scroll : 0, w.ring ? this.camera.unwrappedX : 0);

    // Credit popups: a small yellow +N each time the running total crosses a whole credit.
    for (const k of w.killEvents) {
      this.sfxFeed.kill();
      this.feel.blockDestroyed(k.x, k.y, wallFillColor(k.maxHp), k.hard);
      this.popupTotal += k.reward;
      const whole = Math.floor(this.popupTotal + 1e-9);
      if (whole > this.shownCredits) {
        this.showPopup(this.sx(k.x), k.y - 6, `+${fmtBig(whole - this.shownCredits)}`);
        this.shownCredits = whole;
      }
    }
    w.killEvents.length = 0;
    w.hits.length = 0;

    this.updateTexts();
    const sc = w.fx.secondChance;
    if (sc > this.seenSecondChance) { this.seenSecondChance = sc; this.hintT = HINT_TIME; }
    if (this.hintT > 0) {
      this.hintT -= frameTime;
      this.hint.visible = this.hintT > 0 && Math.floor(this.hintT / 0.15) % 2 === 0;
    }

    this.fxView.sync(x => this.sx(x));
    this.drawBlocks();
    this.drawFogRim();
    this.drawProjectiles();
    this.drawArcs();
    this.ship.setPosition(this.sx(w.shipX), w.shipY);
    if (this.seamLine) { const x = this.sx(0); this.seamLine.visible = x > -2 && x < VIEW_W + 2; this.seamLine.x = x; }
    this.ship.setAlpha(w.invuln > 0 ? (Math.floor(now / 100) % 2 === 0 ? 0.4 : 1) : 1);

    for (const pu of this.popups) {
      if (pu.life <= 0) continue;
      pu.life -= frameTime;
      pu.age += frameTime;
      pu.t.y -= (pu.big ? FEEL.NUMBERS.BIG_RISE : 40) * frameTime;
      pu.t.scale.set(pu.big ? popScale(pu.age, true) : 1);
      pu.t.alpha = Math.max(0, pu.life / (pu.big ? FEEL.NUMBERS.BIG_LIFE : POPUP_LIFE));
      if (pu.life <= 0) pu.t.visible = false;
    }

    if (w.state !== 'playing' && !this.finished) {
      this.endTimer += frameTime;
      const delay = w.state === 'crashed' ? RESULT_DELAY_CRASHED : w.state === 'cleared' ? RESULT_DELAY_CLEARED + FEEL.STAMP.CLEARED_EXTRA : RESULT_DELAY_PASSED + FEEL.STAMP.PASSED_EXTRA;
      if (this.endTimer >= delay) this.finish();
    }
  }

  /** Per frame, after the world ran: the end of the wall (crash pieces, CLEARED / PASSED stamp), the muzzle flash and the AoE blasts. */
  private feelEvents() {
    const w = this.world;
    if (w.state !== 'playing' && !this.shipBroken) {
      this.shipBroken = true;
      if (w.state === 'crashed') {
        this.ship.container.visible = false;
        this.feel.crash(w.shipX, w.shipY, [0xd4d4d8, 0x9a9aa2, 0x6b6b72, 0x3a3a40]);
      } else this.startStamp(w.state === 'cleared');
    }
    if (w.gun.shots > this.prevShots && w.state === 'playing') this.feel.muzzle(w.shipX, w.shipY - 16, w.pulseRate, 0xe8f6ff);
    this.prevShots = w.gun.shots;
    const be = w.projSys.blastEvents;
    for (const b of be) this.feel.aoe(b.x, b.y, b.r > 0 ? b.r : Math.max(b.w, b.h) / 2, 0xffb070, b.w, b.h);
    be.length = 0;
  }

  /** A flash and the stamp word: CLEARED big and bright, PASSED quieter. */
  private startStamp(cleared: boolean) {
    this.stampText.text = cleared ? 'CLEARED' : 'PASSED';
    this.stampText.style.fill = cleared ? THEME.good : THEME.textDim;
    this.stampText.style.fontSize = cleared ? FEEL.STAMP.SIZE : FEEL.STAMP.SIZE * 0.7;
    this.stampAge = 0;
    this.stampFlash = cleared;
    this.stamp.visible = true;
  }

  private stampAge = -1;
  private stampFlash = false;

  private updateStamp(frameTime: number) {
    if (this.stampAge < 0) return;
    this.stampAge += frameTime;
    const t = Math.min(1, this.stampAge / FEEL.BANNER.SLIDE_TIME);
    this.stamp.scale.set(1 + (FEEL.BANNER.PUNCH_SCALE * 1.6 - 1) * (1 - t) * (1 - t));
    this.stamp.alpha = Math.min(1, this.stampAge / 0.08);
    this.flashG.visible = this.stampFlash && this.stampAge < FEEL.STAMP.FLASH_TIME;
    this.flashG.alpha = FEEL.STAMP.FLASH_ALPHA * Math.max(0, 1 - this.stampAge / FEEL.STAMP.FLASH_TIME);
  }

  /** A big hit's number: gold and large, merged per block. */
  private showBigHit(key: number, x: number, y: number, dmg: number) {
    const slot = this.popups.find(d => d.life > 0 && d.key === key) ?? this.popups.find(d => d.life <= 0) ?? this.popups[0];
    const merged = slot.life > 0 && slot.key === key;
    slot.key = key;
    slot.value = merged ? slot.value + dmg : dmg;
    slot.t.text = fmtBig(slot.value);
    slot.t.style.fill = FEEL.NUMBERS.BIG_COLOR;
    slot.t.style.fontSize = FEEL.NUMBERS.BIG_SIZE;
    if (!merged) slot.t.position.set(x, y);
    slot.t.alpha = 1;
    slot.t.visible = true;
    slot.life = FEEL.NUMBERS.BIG_LIFE;
    slot.big = true;
    slot.age = 0;
  }

  private showPopup(x: number, y: number, text: string) {
    const slot = this.popups.find(d => d.life <= 0) ?? this.popups[0];
    slot.key = -1;
    slot.big = false;
    slot.t.style.fill = THEME.currency;
    slot.t.style.fontSize = 14;
    slot.t.text = text;
    slot.t.position.set(x, y);
    slot.t.alpha = 1;
    slot.t.visible = true;
    slot.life = POPUP_LIFE;
  }

  /** Chunk 27b (Fog): a faint ring at the edge of what the ship can see, so the player knows how far the fog reaches. */
  private drawFogRim() {
    const fog = this.world.level.effects?.fog;
    this.fogG.clear();
    if (!fog) return;
    this.fogG.circle(this.sx(this.world.shipX), this.world.shipY, fog.radius).stroke({ width: 2, color: 0xffffff, alpha: 0.12 });
  }

  /** Draws only the cells inside the viewport, reusing a fixed pool of sprites. */
  private drawBlocks() {
    const w = this.world;
    const { cols, rows } = w.level;
    const camX = this.camera.x;
    const ring = w.ring;
    // Columns whose left edge may be in view: a ring walks round the seam, a flat wall stops at its ends.
    const first = ring ? Math.floor(camX / CELL) : Math.max(0, Math.floor(camX / CELL));
    const last = ring ? first + Math.ceil(VIEW_W / CELL) : Math.min(cols - 1, Math.floor((camX + VIEW_W) / CELL));
    const r0 = Math.max(0, rows + Math.floor((-CELL - w.wallOffsetY) / CELL));
    const r1 = Math.min(rows - 1, rows + Math.floor((VIEW_H - w.wallOffsetY) / CELL));
    this.lastDrawn.length = 0;
    let used = 0;
    for (let r = r0; r <= r1; r++) {
      // Chunk 27a: a Drift row has slid sideways (rowShift), so the columns in view start further along; one spare column covers the part-cell.
      const sh = w.rowShift[r];
      const rowFirst = ring && sh !== 0 ? Math.floor((camX - sh) / CELL) : first;
      const rowLast = ring && sh !== 0 ? rowFirst + Math.ceil(VIEW_W / CELL) + 1 : last;
      for (let k = rowFirst; k <= rowLast; k++) {
        const c = ring ? ((k % cols) + cols) % cols : k;
        const cellIdx = r * cols + c;
        if (!w.blocks[cellIdx]) continue;
        for (const b of w.piecesAt(cellIdx)) {
        if (used >= this.views.length) break;
        // Screen x of the cell: the short way round from the viewport centre on a ring (no pop, no duplicate at the seam).
        const left = ring ? this.sx(b.x - b.ox) - CELL / 2 : c * CELL - camX;
        if (left < -CELL || left > VIEW_W) continue;
        const fog = w.fogAlpha(b); // chunk 27b: a Fog tier draws a block only near the ship or once it has been hit
        if (fog <= 0) continue;
        const v = this.views[used++];
        const armored = b.armor > 0;
        // A Mitosis piece (28b) is a part of its cell: a half is CELL / 2 wide, a square CELL / 2 both ways (hw / hh are half sizes).
        const w2 = b.hw * 2, h2 = b.hh * 2;
        const x = left + CELL / 2 + b.ox - b.hw + GAP;
        const y = w.blockTop(r) + CELL / 2 + b.oy - b.hh + GAP;
        const sizeW = w2 - 2 * GAP, sizeH = h2 - 2 * GAP;
        v.frame.alpha = v.well.alpha = v.inner.alpha = v.shield.alpha = fog;
        // Corrosion strips armor: the thick frame thins (and dims) in step with the armor that is left.
        const armorLeft = armored ? Math.min(1, b.armor / (b.armor0 ?? b.armor)) : 0;
        const ft = armored ? FRAME_W + (FRAME_W_ARMOR - FRAME_W) * armorLeft : FRAME_W;
        v.frame.visible = v.well.visible = v.inner.visible = true;
        v.frame.tint = armored ? (armorLeft >= 1 ? FRAME_ARMOR : lerpColor(FRAME, FRAME_ARMOR, armorLeft)) : FRAME;
        v.frame.position.set(x, y);
        v.frame.width = sizeW; v.frame.height = sizeH;
        v.well.position.set(x + ft, y + ft);
        v.well.width = sizeW - 2 * ft; v.well.height = sizeH - 2 * ft;
        const hpFrac = b.hp / b.maxHp;
        // The green fill shrinks with the HP left; on a half or a square (28b) it follows the shape of the well (a half is a tall rectangle).
        const innerW = Math.min(sizeW - 2 * ft - 2 * PAD, innerSize(hpFrac, armored, w2 + 2 * GAP));
        const innerH = Math.min(sizeH - 2 * ft - 2 * PAD, innerSize(hpFrac, armored, h2 + 2 * GAP));
        const inner = Math.max(innerW, innerH);
        v.inner.tint = b.flash > 0 ? wallFlashColor(b.maxHp) : wallFillColor(b.maxHp);
        v.inner.width = innerW; v.inner.height = innerH;
        v.inner.position.set(x + (sizeW - innerW) / 2, y + (sizeH - innerH) / 2);
        const burning = (b.burnT ?? 0) > 0;
        const frozen = (b.freezeT ?? 0) > 0;
        v.status.alpha = OVERLAY_ALPHA * fog;
        if (burning || frozen) {
          v.status.visible = true;
          v.status.tint = frozen && !burning ? FROZEN_TINT : BURN_TINT;
          v.status.position.set(x, y);
          v.status.width = sizeW; v.status.height = sizeH;
        } else {
          v.status.visible = false;
        }
        if (b.maxShield > 0 && b.shield > 0) {
          v.shield.visible = true;
          v.shield.position.set(x, y);
          v.shield.width = sizeW * Math.min(1, b.shield / b.maxShield);
          v.shield.height = SHIELD_H;
        } else {
          v.shield.visible = false;
        }
        if (DEBUG_ON) this.lastDrawn.push({ col: c, row: r, inner });
        }
      }
    }
    for (let i = used; i < this.views.length; i++) {
      const v = this.views[i];
      if (!v.frame.visible) break; // everything after the first hidden one was already hidden
      v.frame.visible = v.well.visible = v.inner.visible = v.shield.visible = v.status.visible = false;
    }
  }

  /** Screen x of a world x: the short way round from the viewport centre on a ring, x - camera on a flat wall. */
  private sx(x: number): number {
    const w = this.world;
    return ringScreenX(x, this.camera.x, VIEW_W, w.worldW, w.ring);
  }

  private drawProjectiles() {
    this.shots.trailMode = sfx.settings.trails; // chunk 28b: Settings > Graphics > Trails, read every frame
    this.shots.sync(this.world.pool, (x) => this.sx(x));
  }

  /** Chain-lightning arcs, from the arc ring (world x -> screen x through the camera). */
  private drawArcs() {
    const proj = this.world.projSys;
    drawFieldFx(this.fieldG, proj, (x) => this.sx(x), false);
    this.arcG.clear();
    let n = 0;
    for (let k = 0; k < ARC_MAX; k++) {
      if (proj.arcT[k] <= 0) continue;
      // The far end is stored unwrapped (x0 + the short way round), so an arc over the seam stays short.
      const x0 = this.sx(proj.arcX0[k]);
      this.arcG.moveTo(x0, proj.arcY0[k]).lineTo(x0 + (proj.arcX1[k] - proj.arcX0[k]), proj.arcY1[k]);
      n++;
    }
    if (n > 0) this.arcG.stroke({ width: 2, color: ARC_COLOR, alpha: 0.9 });
  }

  /** The level is over: bank the credits exactly once and show the summary. */
  private finish() {
    this.finished = true;
    const w = this.world;
    const store = getProgressStore();
    w.bank(store);
    this.banker.flush(w.destroyed);
    const unlocks = store.takeRunUnlocks();
    const unlocked = unlockSummary(unlocks.blocks, unlocks.skillPoints);
    const result: RunResult = { credits: w.credits, kills: w.destroyed, time: w.time, tier: w.tier, shots: { ...w.projSys.runStats } };
    const marks = { newBestTier: false, newBestTime: false, newBestEarnings: w.newBestEarnings };
    const level = this.levelDef;
    const grid = this.grid;
    const sm = this.sm;
    const outcome = w.state === 'playing' ? 'crashed' : w.state;
    const won = outcome !== 'crashed';
    const challenge = this.challenge;
    const retry = { id: 'summaryRetry', label: 'Retry', onTap: () => sm.switchTo(new WallScreen(sm, level, grid, challenge)) };
    const build = { id: 'summaryBuild', label: 'Build', onTap: () => sm.switchTo(new BuildScreen(sm)) };
    let buttons;
    if (level.campaign) {
      const next = { id: 'summaryNext', label: 'Next tier', onTap: () => sm.switchTo(new WallScreen(sm, generateLevel(level.tier + 1), grid)) };
      const map = { id: 'summaryMap', label: 'Map', onTap: () => openModeScreen(sm, 'campaign') };
      // Chunk 27a: tier 101 stays closed until every tier 1-100 is cleared, so "Next tier" is only offered when the next tier is open.
      buttons = [!challenge && won && level.tier < MAX_TIER && isUnlocked(store.data, level.tier + 1) ? next : retry, map, build];
    } else if (level.frontier) {
      // Chunk 15a: back to the Frontier (the camera and selection are where they were), or play the square again.
      buttons = [{ id: 'summaryFrontier', label: FRONTIER_NAME, onTap: () => sm.switchTo(new FrontierScreen(sm)) }, retry, build];
    } else {
      buttons = [build, retry]; // a debug test wall: as before
    }
    // Chunk 28a: a challenge run is judged by its rule; the first success pays the reward once.
    let challengeSummary: ChallengeSummary | null = null;
    if (challenge) {
      const verdict = challengeVerdict(challenge, { outcome, time: w.time });
      if (!verdict.ok) challengeSummary = { ok: false, text: `Challenge failed: ${verdict.reason}` };
      else {
        const paid = store.completeChallenge(challenge.id);
        if (paid.paid) endChallengeSession();
        challengeSummary = { ok: true, text: paid.paid ? `Challenge complete! ${'medals' in challenge.reward ? '+' : 'Reward: '}${challengeRewardText(challenge)}` : 'Challenge complete (reward already taken)' };
      }
    }
    if (w.medalEarned) sfx.play('medal');
    const id = this.banker.captainId;
    const captain: CaptainSummary = {
      name: CAPTAIN_BY_ID[id]?.name ?? id, killsAdded: this.banker.added, killsTotal: store.data.captains.heroes[id]?.kills ?? 0,
      medals: w.medalsEarned, doubled: w.medalDoubled,
      note: [w.fx.passBonus > 0 ? `pass bonus +${fmtBig(Math.floor(w.fx.passBonus))}` : '', w.fx.skillBonus > 0 ? `skill bonus +${fmtBig(Math.floor(w.fx.skillBonus))}` : ''].filter(Boolean).join('  ') || undefined,
    };
    sm.switchTo(new RunSummaryScreen(sm, result, marks, { result: outcome, destroyed: w.destroyed, total: w.total, buttons, medal: w.medalEarned }, captain, unlocked, challengeSummary));
  }

  destroy() {
    if (debugHooks.wall === this.world) debugHooks.wall = null;
    this.container.destroy({ children: true });
  }

  /** Chunk 28b: the player's projectile skin and trail style (Customization tab), resolved against what is unlocked; read once when the run starts. */
  private applyCosmetics() {
    const c = cosmeticsFor(getProgressStore().data, sfx.settings.shotSkin, sfx.settings.trailStyle);
    this.shots.setSkin(c.skinLook);
    this.shots.trailColors = c.trailColors;
  }

}

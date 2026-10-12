import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { Grid } from '../engine/compiler';
import { clientToGame } from '../input';
import { makeText } from '../builder/ui';
import { debugHooks } from '../debug/hooks';
import { getProgressStore } from '../econ/progress';
import { fmtBig } from '../ui/format';
import { THEME } from '../ui/theme';
import { TOUCH_OFFSET_Y } from '../game/world';
import { clampShipX, ringScreenX, WallCamera } from '../wall/camera';
import { CELL, VIEW_H, VIEW_W } from '../wall/constants';
import { generateLevel, MAX_TIER } from '../wall/generator';
import { BuildScreen } from './BuildScreen';
import { MapScreen } from './MapScreen';
import { LevelDef } from '../wall/level';
import { scrollSpeed, WallWorld } from '../wall/wallWorld';
import { PointerGate } from '../engine/control';
import { ShipView } from '../ui/shipArt';
import { BackgroundView, backgroundForTier, forcedBackground } from '../ui/background';
import { RunSummaryScreen } from './RunSummaryScreen';
import { Pausable, Screen, ScreenManager } from './ScreenManager';
import type { StatsInfo } from '../ui/stats';
import { drawFieldFx } from '../ui/fieldFx';
import { sfx } from '../audio';
import { SfxFeed } from '../audio/feed';
import { ARC_MAX, PHASE_BOOM_BACK, PHASE_BOOM_OUT, PHASE_MINE_TRAVEL, PHASE_MINE_WAIT, PHASE_ORBIT } from '../engine/projectiles';

/** Seconds between the level ending and the summary appearing (a crash restarts faster). */
const END_DELAY = 0.6;
const CRASH_DELAY = 0.3;
const POPUPS = 40;
const POPUP_LIFE = 0.6;

const FRAME = 0x55555a;
const FRAME_ARMOR = 0xd4d4d8;
const INNER_BG = THEME.plateFace;
const GREEN = 0x6fbf73;
const GREEN_FLASH = 0xd2f0d4;
const SHIELD_BAR = 0x5fd4e8;
/** Faint status overlays on a block: a burning one is washed orange, a frozen one pale blue. */
const BURN_TINT = 0xff7a1a;
const FROZEN_TINT = 0xbfe6ff;
const OVERLAY_ALPHA = 0.42;
const ARC_COLOR = 0xe8f4ff;
const MINE_COLOR = 0xff5050;
const LOOP_COLOR = 0xffe14d;

/** Block art: a frame, a dark well and a green square that shrinks with the HP left. */
const GAP = 1;
const FRAME_W = 3;
const FRAME_W_ARMOR = 6;
const PAD = 2;
const MIN_INNER = 5;
const SHIELD_H = 3;

interface BlockView { frame: Sprite; well: Sprite; inner: Sprite; shield: Sprite; status: Sprite }
interface Popup { t: Text; life: number }

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
export function innerSize(hpFrac: number, armored: boolean): number {
  const wellW = CELL - 2 * GAP - 2 * (armored ? FRAME_W_ARMOR : FRAME_W);
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
  private bg: BackgroundView | null = null;
  /** ?debug=1: a faint line at world x = 0 so the seam of a ring can be seen. */
  private seamLine: Graphics | null = null;
  private fxLayer = new Container();
  private uiLayer = new Container();
  /** The HUD text and its plate; moved down while the stats overlay is on. */
  private hudBox = new Container();
  private views: BlockView[] = [];
  private projSprites: Sprite[] = [];
  private popups: Popup[] = [];
  private progressBg = new Graphics().rect(VIEW_W - 8, 20, 4, VIEW_H - 40).fill(THEME.border);
  private progressFg = new Graphics();
  private creditsText = makeText('Credits +0', 16, THEME.currency, { fontWeight: 'bold' });
  private tierText = makeText('Tier 1', 16, THEME.textDim, { fontWeight: 'bold' });
  private nameText = makeText('', 15, THEME.textDim, { fontWeight: 'bold' });
  private spikeText = makeText('SPIKE', 16, THEME.bad, { fontWeight: 'bold' });
  private blocksText = makeText('Destroyed 0%', 16, THEME.textDim, { fontWeight: 'bold' });

  private shownCredits = 0;
  private popupTotal = 0;
  private endTimer = 0;
  private finished = false;
  private gate = new PointerGate();
  private sfxFeed = new SfxFeed(sfx);
  private endSounded = false;
  /** Slots used by the last draw, for the e2e hook. */
  private lastDrawn: { col: number; row: number; inner: number }[] = [];

/** The pause menu's view of this level: pausable from the first move until the level ends. */
  readonly pausable: Pausable = {
    canPause: () => this.world.controlStarted && this.world.state === 'playing' && !this.finished,
    resume: () => this.world.resumeEase(),
    restart: () => {
      if (this.finished) return;
      this.finished = true;
      this.world.bank(getProgressStore());
      this.sm.switchTo(new WallScreen(this.sm, this.levelDef, this.grid));
    },
    quit: () => { if (!this.finished) this.finish(); },
  };

  constructor(private sm: ScreenManager, readonly levelDef: LevelDef, private grid: Grid) {
    this.world = new WallWorld(levelDef, { grid, safeStart: true });
    debugHooks.wall = this.world;
    const worldW = this.world.worldW;
    // A ring wall: the camera is unclamped and wraps; a flat wall (wrap: false) clamps to its width.
    this.camera = this.world.ring ? new WallCamera(0, worldW - VIEW_W, worldW) : new WallCamera(0, worldW - VIEW_W);

    this.ship = new ShipView(
      this.sm.app.renderer, grid.hullId ?? 'shuttle',
      this.world.recipes.map((r, i) => ({ x: this.world.spawnOffsets[i].x, y: this.world.spawnOffsets[i].y, dir: r.direction })),
    );
    this.container.addChild(this.blockLayer, this.projLayer, this.ship.container, this.fxLayer, this.uiLayer);
    this.fxLayer.addChild(this.fieldG, this.arcG);
    const forcedBg = forcedBackground();
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
    const slots = 12 * (Math.ceil(VIEW_H / CELL) + 2);
    for (let i = 0; i < slots; i++) {
      const v: BlockView = { frame: whiteSprite(FRAME), well: whiteSprite(INNER_BG), inner: whiteSprite(GREEN), shield: whiteSprite(SHIELD_BAR), status: whiteSprite(BURN_TINT) };
      v.status.alpha = OVERLAY_ALPHA;
      this.blockLayer.addChild(v.frame, v.well, v.inner, v.shield, v.status);
      this.views.push(v);
    }

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

    for (let i = 0; i < POPUPS; i++) {
      const t = new Text({ text: '', style: { fill: THEME.currency, fontSize: 14, fontWeight: 'bold', stroke: { color: 0x000000, width: 3 } } });
      t.anchor.set(0.5);
      t.visible = false;
      this.fxLayer.addChild(t);
      this.popups.push({ t, life: 0 });
    }

    this.creditsText.position.set(20, 20);
    this.tierText.position.set(20, 40);
    this.nameText.position.set(20, 60);
    this.blocksText.position.set(20, 80);
    this.spikeText.visible = !!levelDef.spike;
    this.nameText.text = levelDef.name ?? '';
    // A dim plate behind the HUD text so it stays readable over the blocks.
    this.hudBox.addChild(new Graphics().rect(10, 12, 190, 92).fill({ color: THEME.bg, alpha: 0.72 }));
    this.hudBox.addChild(this.creditsText, this.tierText, this.spikeText, this.nameText, this.blocksText);
    this.uiLayer.addChild(this.hudBox, this.progressBg, this.progressFg);

    this.updateTexts();

    if (import.meta.env.DEV) {
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

  private debugState() {
    const w = this.world;
    return {
      state: w.state, time: w.time, finishY: w.finishY, progress: w.progress, alive: w.alive, total: w.total, destroyed: w.destroyed,
      credits: w.credits, wallOffsetY: w.wallOffsetY, bottomEdge: w.bottomEdge(), scrollSpeed: scrollSpeed(w.level.approachSpeed, w.shipY), cameraX: this.camera.x, cameraSpeed: this.camera.speed,
      controlStarted: w.controlStarted, invuln: w.invuln, shipWorldX: w.shipX, shipScreenX: this.sx(w.shipX), camTravel: this.camera.travel, worldW: w.worldW, ring: w.ring, shipY: w.shipY, projectiles: w.pool.count,
      hud: { credits: this.creditsText.text, tier: this.tierText.text, name: this.nameText.text, spike: this.spikeText.visible, blocks: this.blocksText.text },
      drawn: this.lastDrawn.length,
      effects: { ...w.projSys.fx, ...w.gun.fx },
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
    o.extra = `blocks ${w.alive}/${w.total}  scroll ${Math.round(scrollSpeed(w.level.approachSpeed, w.shipY))}  camX ${Math.round(this.camera.x)}`;
  }

  private updateTexts() {
    const w = this.world;
    const hudDy = this.sm.stats.hudOffset;
    if (this.hudBox.y !== hudDy) this.hudBox.y = hudDy;
    this.creditsText.text = `Credits +${fmtBig(w.credits)}`;
    this.tierText.text = `Tier ${w.tier}`;
    this.spikeText.position.set(20 + this.tierText.width + 10, 56);
    this.blocksText.text = `Destroyed ${Math.floor(w.percentDestroyed)}%`;
    const h = (VIEW_H - 40) * w.progress;
    this.progressFg.clear();
    if (h > 0) this.progressFg.rect(VIEW_W - 8, 20 + (VIEW_H - 40) - h, 4, h).fill(GREEN);
  }

  update(dt: number, frameTime: number, now: number) {
    const w = this.world;
    const p = this.sm.input.pointer;

    // Camera first (edge push), then the ship follows the pointer in screen space: world x = screen x + camera x.
    // Spawn safety: nothing follows the pointer (ship and camera alike) until the first move or press after the run started.
    if (!w.controlStarted && this.gate.observe(p, p.seen)) w.beginControl();
    const pushing = w.controlStarted && p.seen && (p.type !== 'touch' || p.active);
    // The pointer may sit outside the canvas (tracked at window level); the ship's screen x is clamped so it is fully visible.
    const shipSx = clampShipX(p.x);
    this.camera.update(dt, pushing ? shipSx : null);
    let target: { x: number; y: number } | null = null;
    if (w.controlStarted && p.seen) {
      if (p.type === 'touch') { if (p.active) target = { x: shipSx + this.camera.x, y: p.y + TOUCH_OFFSET_Y }; }
      else target = { x: shipSx + this.camera.x, y: p.y };
    }
    w.god = debugHooks.god;
    w.update(dt, target);
    const fx = w.projSys.fx;
    this.sfxFeed.frame({ shots: w.gun.shots, chainJumps: fx.chainJumps, wellsMade: fx.wellsMade, bounces: fx.bounces + fx.edgeBounces });
    for (const h of w.hits) this.sfxFeed.hit({ id: h.blockId, damage: h.damage, kind: h.kind, armor: h.armor, shield: h.shield, maxShield: h.maxShield }, false);
    if (w.state !== 'playing' && !this.endSounded) { this.endSounded = true; sfx.play(w.state === 'crashed' ? 'crash' : 'cleared'); }
    // The background scrolls with the real wall speed (top-edge boost included); on a ring also sideways with the camera.
    if (this.bg) this.bg.update(frameTime, scrollSpeed(w.level.approachSpeed, w.shipY), w.ring ? this.camera.x : 0);

    // Credit popups: a small yellow +N each time the running total crosses a whole credit.
    for (const k of w.killEvents) {
      this.sfxFeed.kill();
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

    this.drawBlocks();
    this.drawProjectiles();
    this.drawArcs();
    this.ship.setPosition(this.sx(w.shipX), w.shipY);
    if (this.seamLine) { const x = this.sx(0); this.seamLine.visible = x > -2 && x < VIEW_W + 2; this.seamLine.x = x; }
    this.ship.setAlpha(w.invuln > 0 ? (Math.floor(now / 100) % 2 === 0 ? 0.4 : 1) : 1);

    for (const pu of this.popups) {
      if (pu.life <= 0) continue;
      pu.life -= frameTime;
      pu.t.y -= 40 * frameTime;
      pu.t.alpha = Math.max(0, pu.life / POPUP_LIFE);
      if (pu.life <= 0) pu.t.visible = false;
    }

    if (w.state !== 'playing' && !this.finished) {
      this.endTimer += frameTime;
      if (this.endTimer >= (w.state === 'crashed' ? CRASH_DELAY : END_DELAY)) this.finish();
    }
  }

  private showPopup(x: number, y: number, text: string) {
    const slot = this.popups.find(d => d.life <= 0) ?? this.popups[0];
    slot.t.text = text;
    slot.t.position.set(x, y);
    slot.t.alpha = 1;
    slot.t.visible = true;
    slot.life = POPUP_LIFE;
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
      for (let k = first; k <= last; k++) {
        const c = ring ? ((k % cols) + cols) % cols : k;
        const b = w.blocks[r * cols + c];
        if (!b || used >= this.views.length) continue;
        // Screen x of the block: the short way round from the viewport centre on a ring (no pop, no duplicate at the seam).
        const left = ring ? this.sx(c * CELL + CELL / 2) - CELL / 2 : c * CELL - camX;
        if (left < -CELL || left > VIEW_W) continue;
        const v = this.views[used++];
        const armored = b.armor > 0;
        const x = left + GAP;
        const y = w.blockTop(r) + GAP;
        const size = CELL - 2 * GAP;
        // Corrosion strips armor: the thick frame thins (and dims) in step with the armor that is left.
        const armorLeft = armored ? Math.min(1, b.armor / (b.armor0 ?? b.armor)) : 0;
        const ft = armored ? FRAME_W + (FRAME_W_ARMOR - FRAME_W) * armorLeft : FRAME_W;
        v.frame.visible = v.well.visible = v.inner.visible = true;
        v.frame.tint = armored ? (armorLeft >= 1 ? FRAME_ARMOR : lerpColor(FRAME, FRAME_ARMOR, armorLeft)) : FRAME;
        v.frame.position.set(x, y);
        v.frame.width = v.frame.height = size;
        v.well.position.set(x + ft, y + ft);
        v.well.width = v.well.height = size - 2 * ft;
        const hpFrac = b.hp / b.maxHp;
        const inner = innerSize(hpFrac, armored);
        v.inner.tint = b.flash > 0 ? GREEN_FLASH : GREEN;
        v.inner.width = v.inner.height = inner;
        v.inner.position.set(x + (size - inner) / 2, y + (size - inner) / 2);
        const burning = (b.burnT ?? 0) > 0;
        const frozen = (b.freezeT ?? 0) > 0;
        if (burning || frozen) {
          v.status.visible = true;
          v.status.tint = frozen && !burning ? FROZEN_TINT : BURN_TINT;
          v.status.position.set(x, y);
          v.status.width = v.status.height = size;
        } else {
          v.status.visible = false;
        }
        if (b.maxShield > 0 && b.shield > 0) {
          v.shield.visible = true;
          v.shield.position.set(x, y);
          v.shield.width = size * Math.min(1, b.shield / b.maxShield);
          v.shield.height = SHIELD_H;
        } else {
          v.shield.visible = false;
        }
        if (import.meta.env.DEV) this.lastDrawn.push({ col: c, row: r, inner });
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
    const pool = this.world.pool;
    for (let i = 0; i < pool.max; i++) {
      const s = this.projSprites[i];
      if (pool.active[i]) {
        const sx = this.sx(pool.x[i]);
        if (sx < -20 || sx > VIEW_W + 20) { s.visible = false; continue; }
        s.position.set(sx, pool.y[i]);
        const ph = pool.phase[i];
        if (ph === PHASE_MINE_WAIT) {
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
    w.bank(getProgressStore());
    const result = { credits: w.credits, kills: w.destroyed, time: w.time, tier: w.tier };
    const marks = { newBestTier: false, newBestTime: false };
    const level = this.levelDef;
    const grid = this.grid;
    const sm = this.sm;
    const outcome = w.state === 'playing' ? 'crashed' : w.state;
    const won = outcome !== 'crashed';
    const retry = { id: 'summaryRetry', label: 'Retry', onTap: () => sm.switchTo(new WallScreen(sm, level, grid)) };
    const build = { id: 'summaryBuild', label: 'Build', onTap: () => sm.switchTo(new BuildScreen(sm)) };
    let buttons;
    if (level.campaign) {
      const next = { id: 'summaryNext', label: 'Next tier', onTap: () => sm.switchTo(new WallScreen(sm, generateLevel(level.tier + 1), grid)) };
      const map = { id: 'summaryMap', label: 'Map', onTap: () => sm.switchTo(new MapScreen(sm)) };
      buttons = [won && level.tier < MAX_TIER ? next : retry, map, build];
    } else {
      buttons = [build, retry]; // a debug test wall: as before
    }
    if (w.medalEarned) sfx.play('medal');
    sm.switchTo(new RunSummaryScreen(sm, result, marks, { result: outcome, destroyed: w.destroyed, total: w.total, buttons, medal: w.medalEarned }));
  }

  destroy() {
    if (debugHooks.wall === this.world) debugHooks.wall = null;
    this.container.destroy({ children: true });
  }
}

/**
 * The player-facing block texts (chunk 19b): ONE short line saying what the block does (at most SHORT_MAX characters) and, for the
 * blocks whose copies stack, a second dimmer line saying what one more copy does (at most STACK_MAX). They are what the builder
 * inspector and the Shop / builder info sheet show. The long technical explanation stays in `BlockDef.desc` (`describeBlock`) and in
 * `docs/blocks.md` (`npm run blocks-doc`); nothing is lost, it is just not in the game.
 */
import { BLOCKS, gamblerProb, jackpotProb, luckyProb, percentMul } from './blocks';
import { BlockDef, powerLevel } from '../engine/compilerTypes';
import {
  alternatorMul, bounceCount, boomerangRange, capacitorMul, CAPACITOR_N, chainJumps, CHAIN_FRAC, cleaverBonus, cleaverPenalty,
  cauterizeTime, corrosionCap, cullingPct, delaySeconds, executionerMul, EXECUTIONER_BELOW, flatPlusAdd, frostBonus, frostSlow, igniteFrac, orbitTime,
  overclockGain, OVERCLOCK_CAP, RESIDUE_TIME, STATIC_HITS,
} from '../engine/effects';
import { armorPierceMul, shieldBreakMul } from '../engine/projectiles';
import {
  FRONTIER_ECHO_SHARE, FUSE_MUL, FUSE_N, HEAVY_MUL_NORMAL, HEAVY_MUL_SLOWEST, HOLLOW_CORE_PER_CELL, IDLE_BARRELS_PER_EJECTOR, LAST_BREATH_MUL, loneShotMul,
  PAYLOAD_ADD, REBOUND_MUL, WAYPOINT_PER_TURN, ZIGZAG_GAIN,
} from '../engine/effects';

/** Longest short line and longest stacking line, in characters (the info panel is 360 px wide on a phone; checked by tests/blockText.test.ts). */
export const SHORT_MAX = 60;
export const STACK_MAX = 40;

export interface BlockText { short: string; stack: string | null }

const pct = (v: number) => Math.round(v * 100);
const AOE_STACK = '+1 copy: bigger area, -5% dmg';

/** Short texts by block id; a function when a number depends on the level the block runs at. */
const SHORT: Record<string, string | ((l: number) => string)> = {
  turn_l: 'Turns the signal 90° to the left.',
  turn_r: 'Turns the signal 90° to the right.',
  splitter_2: 'Splits the signal in two: left and right.',
  splitter_3: 'Splits the signal in three: left, ahead and right.',
  alternator: (l) => `Left and right take turns; shots do ×${alternatorMul(l).toFixed(1)} damage.`,
  random_router: 'Sends each shot left, right or both, at random.',
  delay_line: (l) => `Holds each shot back for ${delaySeconds(l).toFixed(1)} s.`,
  plus_one: 'Adds a new shot with base damage to the lane.',
  flat_plus: (l) => `Adds +${flatPlusAdd(l)} damage to every shot.`,
  percent_mult: (l) => `Multiplies shot damage by ×${Math.round(percentMul(l) * 100) / 100}.`,
  lucky_strike: (l) => `${pct(luckyProb(l))}% chance to double a shot's damage.`,
  jackpot: (l) => `${pct(jackpotProb(l))}% chance to multiply damage by 10.`,
  gamblers_gate: (l) => `${pct(gamblerProb(l))}% chance of ×3 damage, otherwise the shot is lost.`,
  overclock: (l) => `Each shot in a row adds +${Math.round(overclockGain(l) * 1000) / 10}% damage, up to +${pct(OVERCLOCK_CAP)}%.`,
  capacitor: (l) => `Saves ${CAPACITOR_N} shots, fires one ×${Math.round(CAPACITOR_N * capacitorMul(l) * 10) / 10} shot.`,
  executioner: (l) => `×${executionerMul(l)} damage to targets below ${pct(EXECUTIONER_BELOW)}% HP.`,
  fission_catalyst: 'A hit splits the rock at once. Free Fly rocks only.',
  cauterize: (l) => `Hit rocks can't split for ${cauterizeTime(l)} s; kills pay more.`,
  cleaver: (l) => `×${cleaverBonus(l).toFixed(1)} damage to rock fragments, ×${cleaverPenalty(l).toFixed(2)} to parents.`,
  culling_bolt: (l) => `Adds ${pct(cullingPct(l))}% of the target's max HP to each hit.`,
  residue_seed: () => `A kill leaves a damaging cloud for ${RESIDUE_TIME} s.`,
  overkill_spill: 'Overkill damage is passed on to the rock\'s children.',
  piercing: 'Shots pass through one target.',
  bouncing: (l) => `Shots bounce off the first ${bounceCount(l)} things they hit.`,
  aoe_circle: 'Explodes on hit, hitting the blocks around it.',
  aoe_rect: 'Explodes on hit, hitting 3 blocks in a row.',
  shield_breaker: (l) => `×${shieldBreakMul(l)} damage to shields, doubled again.`,
  pure_converter: (l) => `Turns ${15 * l}% of the damage into armor-ignoring pure damage.`,
  boomerang: (l) => `Flies ${boomerangRange(l)} px, returns and hits on the way back.`,
  orbit: (l) => `Circles the ship for ${orbitTime(l)} s, then launches.`,
  chain_lightning: (l) => `A hit jumps to ${chainJumps(l)} nearby targets for ${pct(CHAIN_FRAC)}% damage.`,
  mine: 'Stops and waits; explodes when something touches it.',
  gravity_well: 'Pulls nearby rocks to the first hit. Free Fly only.',
  curving_right: 'Shots curve clockwise after launch.',
  random_curve: 'Shots weave left and right at random.',
  curving_left: 'Shots curve anticlockwise after launch.',
  angle_left: 'Shots leave 15° to the left and fly straight.',
  angle_right: 'Shots leave 15° to the right and fly straight.',
  accelerator: 'Shots fly 1.5 times as fast.',
  brake: 'Shots fly at 0.7 speed, never under 0.2.',
  scatter: 'Each shot leaves at a random angle, ±30°.',
  upturn: 'After 0.4 s the shot turns straight up and stays there.',
  align: 'After a hit it survives, the shot flies straight up.',
  extender: 'Shots live twice as long.',
  centreline: 'Shots are pulled toward the line they were fired on.',
  magnetized: 'Shots are pulled toward your ship and swarm.',
  persist: 'The shot goes on through kills while damage is left.',
  homing: 'Shots steer toward the nearest enemy ahead.',
  fork_impact: 'The first hit splits off two weaker shots.',
  armor_piercer: (l) => `×${armorPierceMul(l)} damage to armored enemies.`,
  ignite: (l) => `Sets targets on fire: ${pct(igniteFrac(l))}% of the hit per second.`,
  frostbite: (l) => `Slows targets ${pct(frostSlow(l))}%; frozen ones take +${pct(frostBonus(l))}% damage.`,
  corrosion: (l) => `Each hit strips 5% of armor, up to ${pct(corrosionCap(l))}%.`,
  static_charge: () => `Every ${STATIC_HITS}rd hit on a target adds a bonus pulse.`,
  // Legendary (chunk 20a)
  frontier_echo: () => `Adds ${pct(FRONTIER_ECHO_SHARE)}% of your furthest Frontier ring as damage.`,
  payload: () => `Adds +${PAYLOAD_ADD} damage to every shot.`,
  lone_shot: () => `Up to ×${loneShotMul(1)} damage when few of your shots are in the air.`,
  last_breath: () => `×${LAST_BREATH_MUL} damage in the last second of a shot's life.`,
  zigzag: () => `Shots weave left and right and gain +${pct(ZIGZAG_GAIN)}% damage per turn.`,
  heavy_round: () => `Slower shots hit harder: ×${HEAVY_MUL_NORMAL} at normal speed, up to ×${HEAVY_MUL_SLOWEST}.`,
  hollow_core: () => `+${pct(HOLLOW_CORE_PER_CELL)}% damage for every empty buildable cell of the hull.`,
  idle_barrels: () => `+${IDLE_BARRELS_PER_EJECTOR} damage for every ejector no signal reaches.`,
  waypoint: () => `×${WAYPOINT_PER_TURN} damage for every turn the signal made before.`,
  rebound: () => `×${REBOUND_MUL} damage if the last shot through here was weaker.`,
  mirror: () => 'Every shot gets a clone flying beside it.',
  fuse: () => `Absorbs ${FUSE_N} shots, fires one with ×${FUSE_MUL} their total damage.`,
};

/** The stacking line of the blocks whose extra copies do something. */
const STACK: Record<string, string> = {
  plus_one: '+1 copy: one more shot',
  piercing: '+1 copy: one more target',
  bouncing: '+1 copy: one more bounce',
  aoe_circle: AOE_STACK,
  aoe_rect: AOE_STACK,
  chain_lightning: '+1 copy: one more jump',
  homing: '+1 copy: wider cone, longer range',
  fork_impact: '+1 copy: one more pair of shots',
  boomerang: '+1 copy: longer range',
  orbit: '+1 copy: one more circle',
  mine: '+1 copy: bigger mine, one more mine',
  curving_right: '+1 copy: curves harder',
  curving_left: '+1 copy: curves harder',
  random_curve: '+1 copy: weaves harder',
  angle_left: '+1 copy: 15° more',
  angle_right: '+1 copy: 15° more',
  accelerator: '+1 copy: 1.5 times faster',
  brake: '+1 copy: slower again, down to 0.2',
  scatter: '+1 copy: ±15° wider',
  upturn: '+1 copy: starts sooner, turns faster',
  extender: '+1 copy: lives twice as long',
  centreline: '+1 copy: pulls harder',
  magnetized: '+1 copy: pulls harder',
};

/** First sentence of the technical text, for a block without an entry (hidden blocks). */
function firstSentence(def: BlockDef, level: number): string {
  const d = typeof def.desc === 'function' ? def.desc(powerLevel(def, level)) : def.desc;
  const s = d.split(/(?<=\.)\s/)[0];
  return s.length <= SHORT_MAX ? s : `${s.slice(0, SHORT_MAX - 1)}…`;
}

/** The two player lines of a block at a level. */
export function blockText(def: BlockDef, level = 1): BlockText {
  const e = SHORT[def.id];
  const l = powerLevel(def, level);
  return { short: e === undefined ? firstSentence(def, level) : typeof e === 'function' ? e(l) : e, stack: STACK[def.id] ?? null };
}

/** `blockText` by id (undefined for an unknown id). */
export const blockTextOf = (id: string, level = 1): BlockText | undefined => (BLOCKS[id] ? blockText(BLOCKS[id], level) : undefined);

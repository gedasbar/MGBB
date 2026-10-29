import type { SkillFx, SkillFxKey } from '../skills/effects';
import { SKILL_START_ID } from '../skills/constants';

/**
 * THE SKILL TREE (chunk 22a, docs/skills.md). Edit names, texts and numbers here; the engine reads the numbers through `fx`.
 *
 * Six paths leave the free start node in the middle. Each path has the same shape:
 *   s1 - s2 - s3 - s4 - s5      the spine, five nodes in a line away from the centre
 *   b2 hangs off s2, b4 hangs off s4     two side branches (one node each)
 *   c1, c2 hang off s5                   the two capstones (they upgrade a legendary block)
 * so a path has 7 normal nodes and 2 capstones. The map position of every node follows from its path and its role (see `spot`).
 *
 * `fx` is a list of "effect key: number" pairs. Every number is an ADDITION to the game's own number (0 = no change), so
 * "Waypoint x1.1 -> x1.15" is `waypointPer: 0.05`. The keys are listed in skills/effects.ts.
 *
 * `text` is the one line the player reads (60 characters at most). Numbers in it are filled in from `fx` so they can never drift:
 *   {key}       the number          {key%}      the number times 100          {key+10}  the number plus 10 (a base value)
 *   {key%+10}   the number times 100, plus 10   (e.g. 5 points on top of a base of 10%)
 */
export type PathId = 'routing' | 'flight' | 'volley' | 'impact' | 'firepower' | 'salvage';
export type Role = 's1' | 's2' | 's3' | 's4' | 's5' | 'b2' | 'b4' | 'c1' | 'c2';

export interface SkillNode {
  id: string;
  path: PathId | 'start';
  role: Role | 'start';
  name: string;
  /** One line with the {placeholders} already filled from `fx`. */
  text: string;
  /** A block id (its glyph is drawn) or the name of a simple symbol: coin, medal, refresh, star, hero. */
  glyph: string;
  fx: SkillFx;
  /** Capstones are bigger and upgrade a legendary block; `needsBlock` is that block (the panel says so while it is not owned). */
  capstone?: boolean;
  needsBlock?: string;
  /** Axial hex position on the map and the nodes it touches (filled in below from path and role). */
  at: [number, number];
  links: string[];
}

export const PATHS: { id: PathId; name: string; color: number }[] = [
  { id: 'routing', name: 'Routing', color: 0x59b9ff },
  { id: 'flight', name: 'Flight', color: 0xd27bff },
  { id: 'volley', name: 'Volley', color: 0x22d3b0 },
  { id: 'impact', name: 'Impact', color: 0xffd24d },
  { id: 'firepower', name: 'Firepower', color: 0xff7a5c },
  { id: 'salvage', name: 'Salvage', color: 0xa8e63d },
];

/** The six hex directions (axial q, r), counter-clockwise from "right" on screen. Path i leaves the centre along DIRS[i]. */
const DIRS: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

/** Map position of a role on path `p` (0..5): the spine runs along the direction, branches and the second capstone sit beside it. */
function spot(p: number, role: Role): [number, number] {
  const d = DIRS[p], left = DIRS[(p + 1) % 6], right = DIRS[(p + 5) % 6];
  const on = (k: number, s: [number, number] = [0, 0]): [number, number] => [d[0] * k + s[0], d[1] * k + s[1]];
  switch (role) {
    case 's1': return on(1);
    case 's2': return on(2);
    case 's3': return on(3);
    case 's4': return on(4);
    case 's5': return on(5);
    case 'b2': return on(2, left);
    case 'b4': return on(4, right);
    case 'c1': return on(6);
    case 'c2': return on(5, left);
  }
}

/** What each role touches. */
const TOUCHES: Record<Role, Role | 'start'> = { s1: 'start', s2: 's1', s3: 's2', s4: 's3', s5: 's4', b2: 's2', b4: 's4', c1: 's5', c2: 's5' };

// [role, id, name, text, glyph, fx, needsBlock (capstones only)]
type Row = [Role, string, string, string, string, SkillFx, string?];

const ROUTING: Row[] = [
  ['s1', 'turn_left', 'Left Edge', 'Turn Left: +{turnLeftAdd} damage', 'turn_l', { turnLeftAdd: 1 }],
  ['s2', 'turn_right', 'Right Edge', 'Turn Right: +{turnRightAdd} damage', 'turn_r', { turnRightAdd: 1 }],
  ['s3', 'split_two', 'Twin Lanes', 'Splitter 2: each lane +{splitter2Mul%}% damage', 'splitter_2', { splitter2Mul: 0.1 }],
  ['s4', 'split_three', 'Triple Lanes', 'Splitter 3: each lane +{splitter3Mul%}% damage', 'splitter_3', { splitter3Mul: 0.1 }],
  ['s5', 'curve_dmg', 'Sharp Bends', 'Curving, Random Curve: +{curveAdd} damage each', 'curving_left', { curveAdd: 1 }],
  ['b2', 'delay_dmg', 'Slow Burn', 'Delay Line: shots +{delayMul%}% damage', 'delay_line', { delayMul: 0.2 }],
  ['b4', 'router_both', 'Loaded Dice', 'Random Router: both outputs +{routerBoth%} points', 'random_router', { routerBoth: 0.1 }],
  ['c1', 'cap_waypoint', 'Long Road', 'Waypoint: x{waypointPer+1.1} per turn (was x1.1)', 'waypoint', { waypointPer: 0.05 }, 'waypoint'],
  ['c2', 'cap_hollow', 'Empty Halls', 'Hollow Core: +{hollowPerCell%+10}% per empty cell (was 10%)', 'hollow_core', { hollowPerCell: 0.05 }, 'hollow_core'],
];

const FLIGHT: Row[] = [
  ['s1', 'angle_left', 'Lean Left', 'Shots angled left: up to +{angleLeftBonus%}% damage', 'angle_left', { angleLeftBonus: 0.4 }],
  ['s2', 'angle_right', 'Lean Right', 'Shots angled right: up to +{angleRightBonus%}% damage', 'angle_right', { angleRightBonus: 0.4 }],
  ['s3', 'accel_dmg', 'Rush', 'Accelerator: +{acceleratorBonus%}% damage per copy', 'accelerator', { acceleratorBonus: 0.1 }],
  ['s4', 'brake_floor', 'Crawl', 'Brake: slows down to x{brakeFloor+0.2} (was x0.2)', 'brake', { brakeFloor: -0.05 }],
  ['s5', 'extender_life', 'Long Haul', 'Extender: shots live {extenderLife%}% longer', 'extender', { extenderLife: 0.5 }],
  ['b2', 'scatter_dmg', 'Buckshot', 'Scatter: shots +{scatterBonus%}% damage', 'scatter', { scatterBonus: 0.15 }],
  ['b4', 'upturn_delay', 'Quick Turn', 'Upturn: delay {upturnDelay} s', 'upturn', { upturnDelay: -0.1 }],
  ['c1', 'cap_zigzag', 'Wild Weave', 'Zigzag: +{zigzagGain%+5}% damage per change (was 5%)', 'zigzag', { zigzagGain: 0.03 }, 'zigzag'],
  ['c2', 'cap_heavy', 'Dead Weight', 'Heavy Round: top x{heavyTop+5} (was x5)', 'heavy_round', { heavyTop: 1 }, 'heavy_round'],
];

const VOLLEY: Row[] = [
  ['s1', 'plus_base', 'Strong Spares', '+1 Projectile: added shots start with +{plusOneBase} damage', 'plus_one', { plusOneBase: 1 }],
  ['s2', 'fork_frac', 'Wide Fork', 'Fork on Impact: pairs deal {forkFrac%+50}% (was 50%)', 'fork_impact', { forkFrac: 0.1 }],
  ['s3', 'mine_more', 'Minefield', 'Mine: +{mineExtra} mine', 'mine', { mineExtra: 1 }],
  ['s4', 'split3_cap', 'Wider Fan', 'Splitter 3: copy limit +{splitter3Cap}', 'splitter_3', { splitter3Cap: 3 }],
  ['s5', 'plus_cap', 'Spare Magazine', '+1 Projectile: copy limit +{plusOneCap}', 'plus_one', { plusOneCap: 2 }],
  ['b2', 'orbit_pass', 'Extra Lap', 'Orbit: +{orbitPass} pass round the ship', 'orbit', { orbitPass: 1 }],
  ['b4', 'boomerang_range', 'Long Throw', 'Boomerang: range +{boomerangRange%}%', 'boomerang', { boomerangRange: 0.2 }],
  ['c1', 'cap_mirror', 'Heavy Mirror', 'Mirror: clones deal x{mirrorMul+1} damage', 'mirror', { mirrorMul: 0.5 }, 'mirror'],
  ['c2', 'cap_fuse', 'Short Fuse', 'Fuse: fires after {fuseN+10} shots instead of 10', 'fuse', { fuseN: -2 }, 'fuse'],
];

const IMPACT: Row[] = [
  ['s1', 'pierce_chance', 'Sharp Point', 'Piercing: {pierceChance%}% chance of +1 pierce', 'piercing', { pierceChance: 0.3 }],
  ['s2', 'bounce_chance', 'Springy', 'Bouncing: {bounceChance%}% chance of +1 bounce', 'bouncing', { bounceChance: 0.25 }],
  ['s3', 'aoe_rect_keep', 'Tight Blast', 'AoE Rectangle: extra copies cost {aoeRectPenalty%+5}% (was 5%)', 'aoe_rect', { aoeRectPenalty: -0.02 }],
  ['s4', 'aoe_circle_keep', 'Round Blast', 'AoE Circle: extra copies cost {aoeCirclePenalty%+5}% (was 5%)', 'aoe_circle', { aoeCirclePenalty: -0.02 }],
  ['s5', 'persist_spend', 'Thrifty', 'Persist: a kill spends {persistSpend%+100}% of its HP', 'persist', { persistSpend: -0.2 }],
  ['b2', 'bounce_dmg', 'Ricochet', 'Bounces: +{bounceDamage%}% damage per bounce made', 'bouncing', { bounceDamage: 0.1 }],
  ['b4', 'chain_frac', 'Live Wire', 'Chain Lightning: jumps keep {chainFrac%+70}% (was 70%)', 'chain_lightning', { chainFrac: 0.1 }],
  ['c1', 'cap_last_breath', 'Final Gasp', 'Last Breath: x{lastBreathMul+2} (was x2)', 'last_breath', { lastBreathMul: 1 }, 'last_breath'],
  ['c2', 'cap_rebound', 'Hard Return', 'Rebound: x{reboundMul+4} (was x4)', 'rebound', { reboundMul: 1 }, 'rebound'],
];

const FIREPOWER: Row[] = [
  ['s1', 'flat_more', 'Heavier Plates', 'Flat +: +{flatPlusPer} more per copy', 'flat_plus', { flatPlusPer: 1 }],
  ['s2', 'percent_cap', 'Deep Pockets', 'Percent x: copy limit +{percentCap}', 'percent_mult', { percentCap: 1 }],
  ['s3', 'lucky_more', 'Lucky Day', 'Lucky Strike: +{luckyChance%}% chance', 'lucky_strike', { luckyChance: 0.05 }],
  ['s4', 'jackpot_more', 'Big Win', 'Jackpot: x{jackpotMul+10} (was x10)', 'jackpot', { jackpotMul: 2 }],
  ['s5', 'gambler_more', 'Steady Hand', "Gambler's Gate: +{gamblerChance%}% chance", 'gamblers_gate', { gamblerChance: 0.05 }],
  ['b2', 'executioner', 'Mercy Rule', 'Executioner: works below {executionerBelow%+25}% HP', 'executioner', { executionerBelow: 0.05 }],
  ['b4', 'overclock_cap', 'Redline', 'Overclock: up to +{overclockCap%+100}% (was +100%)', 'overclock', { overclockCap: 0.5 }],
  ['c1', 'cap_payload', 'Bigger Payload', 'Payload: +{payloadAdd+25} damage (was +25)', 'payload', { payloadAdd: 15 }, 'payload'],
  ['c2', 'cap_lone', 'Lone Wolf', 'Lone Shot: top x{loneShotTop+2} (was x2)', 'lone_shot', { loneShotTop: 1 }, 'lone_shot'],
];

const SALVAGE: Row[] = [
  ['s1', 'replay_credits', 'Second Pass', 'Replays of a cleared level: +{replayCredits%}% credits', 'coin', { replayCredits: 0.1 }],
  ['s2', 'record_credits', 'Personal Best', 'A run that beats the level best: +{recordCredits%}% credits', 'star', { recordCredits: 0.25 }],
  ['s3', 'medal_square', 'Medal Hunter', 'Medal squares: {medalSquareExtra%}% chance of +1 Medal', 'medal', { medalSquareExtra: 0.2 }],
  ['s4', 'respec_half', 'Fresh Start', 'Respec costs {respecDiscount%}% less', 'refresh', { respecDiscount: 0.5 }],
  ['s5', 'legend_credits', 'Collector', '+{legendaryCredits%}% credits per legendary block owned', 'star', { legendaryCredits: 0.05 }],
  ['b2', 'free_fly_credits', 'Drifter', 'Free Fly: +{freeFlyCredits%}% credits', 'coin', { freeFlyCredits: 0.1 }],
  ['b4', 'hero_discount', 'Mentor', 'Hero levels cost {heroDiscount%}% fewer Medals', 'hero', { heroDiscount: 0.1 }],
  ['c1', 'cap_echo', 'Far Echo', 'Frontier Echo: {echoShare%+10}% of the ring (was 10%)', 'frontier_echo', { echoShare: 0.05 }, 'frontier_echo'],
  ['c2', 'cap_idle', 'Spare Barrels', 'Idle Barrels: +{idleBarrels+3} per ejector (was +3)', 'idle_barrels', { idleBarrels: 2 }, 'idle_barrels'],
];

const ROWS: Record<PathId, Row[]> = { routing: ROUTING, flight: FLIGHT, volley: VOLLEY, impact: IMPACT, firepower: FIREPOWER, salvage: SALVAGE };

/** Fills `{key}` placeholders of a node text from its fx (see the header). Unknown keys are left as written so a typo is visible. */
export function fillText(text: string, fx: SkillFx): string {
  return text.replace(/\{(\w+)(%?)(?:\+(-?[\d.]+))?\}/g, (whole, key: string, pct: string, base: string | undefined) => {
    const v = fx[key as SkillFxKey];
    if (v === undefined) return whole;
    const n = (pct ? v * 100 : v) + (base ? Number(base) : 0);
    return String(Number(n.toFixed(4)));
  });
}

/** The start node in the middle: free, always owned, no effect. */
const START: SkillNode = { id: SKILL_START_ID, path: 'start', role: 'start', name: 'Start', text: 'The centre of the tree', glyph: 'star', fx: {}, at: [0, 0], links: [] };

export const SKILL_NODES: SkillNode[] = [START];
export const SKILL_BY_ID: Record<string, SkillNode> = { [SKILL_START_ID]: START };

PATHS.forEach((p, pi) => {
  const byRole = new Map<Role, string>();
  for (const [role, id, name, text, glyph, fx, needs] of ROWS[p.id]) {
    byRole.set(role, id);
    const touches = TOUCHES[role];
    const node: SkillNode = {
      id, path: p.id, role, name, text: fillText(text, fx), glyph, fx, at: spot(pi, role),
      links: [touches === 'start' ? SKILL_START_ID : byRole.get(touches)!],
      ...(needs ? { capstone: true, needsBlock: needs } : {}),
    };
    SKILL_NODES.push(node);
    SKILL_BY_ID[id] = node;
  }
});

// Links are two-way: every node also lists the nodes that touch it.
for (const n of SKILL_NODES) for (const l of n.links) if (!SKILL_BY_ID[l].links.includes(n.id)) SKILL_BY_ID[l].links.push(n.id);

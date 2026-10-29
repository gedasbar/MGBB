/** Skill tree rules (chunk 22a, docs/skills.md). Every number of the rules lives here; the nodes' own numbers live in data/skillTree.ts. */

/** One skill point per this many Frontier rings (of the furthest passed or cleared square) up to SKILL_RING_SLOW_FROM... */
export const SKILL_RING_STEP = 25;
/** ...and from that ring on, one point per SKILL_RING_STEP_SLOW rings (ring 250 = 10 points, 500 = 15, 1000 = 25). */
export const SKILL_RING_SLOW_FROM = 250;
export const SKILL_RING_STEP_SLOW = 50;
/** Every node costs this many points. */
export const SKILL_NODE_COST = 1;
/** Medals a respec costs; the Salvage node halves it (see `respecCost`). */
export const RESPEC_MEDALS = 10;
/** The free node in the middle of the tree. It is always owned and never stored in a save. */
export const SKILL_START_ID = 'start';

export const CONFIG = {
  GAME_TITLE: "Mitosis Gun Builder",
  VIEW: { W: 540, H: 960 },                 // logical 9:16, letterboxed to fit any screen
  SCROLL_SPEED: 60,                         // px/s background parallax, cosmetic only
  PLAYER: { MOVE_SMOOTHING: 0.22, KEYBOARD_SPEED: 420, HITBOX_R: 10, MARGIN: 24 },
  CAPS: { PROJECTILES: 4000, ENEMIES: 400, PARTICLES: 6000, PICKUPS: 300, DAMAGE_NUMBERS: 120 },
  GRID: { CELL: 48, MAX_W: 11, MAX_H: 11 },
  PULSE: { BASE_RATE: 4 },                  // generator pulses per second at firerate stat = 4
  MITOSIS: { MAX_GENERATION: 4, GLOBAL_SPLIT_BUDGET_PER_SEC: 120, SWARM_MERGE_BONUS: 1.5 },
  ECON: { TIER_HP_GROWTH: 1.055, TIER_REWARD_GROWTH: 1.05 },
};

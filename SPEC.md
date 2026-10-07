# MASTER PROMPT: "MITOSIS GUN BUILDER" — a modular circuit-shooter

> Paste everything below this line into your AI coding tool. If the tool has an output limit, paste **Section 0–3** first, then feed each **Build Phase** (Section 14) one at a time using the kickoff message at the very end.
> Working title is a placeholder. Change `GAME_TITLE` in the config block.

---

## 0. ROLE & DELIVERY RULES

You are a senior game programmer and systems designer. Build a **complete, playable, polished prototype** of a vertical-scrolling shooter in which the player *designs the gun as a circuit board*. It is inspired by the mobile game *Miner Gun Builder* (Germapur Apps) but is an **original game**: do not copy its art, names, text, or audio. Re-implement the *ideas*, then extend them as specified below.

**Hard rules**
1. **Zero manual setup.** After `npm install && npm run dev` (or opening `index.html` for the single-file build), the game must run. No editor, no asset downloads, no external image/audio files. **All art, backgrounds and sound are generated procedurally in code.**
2. **Stack (decided, don't ask):** TypeScript (strict) + Vite + PixiJS v8 for rendering. Vitest for unit tests. No other runtime dependencies unless you justify them in `DECISIONS.md`. Provide a `npm run build:single` script that emits one self-contained `dist/index.html`.
3. **Never abbreviate.** No "...rest unchanged", no `// TODO`, no stub blocks, no "placeholder" content. Every file you mention exists in full. If you run out of room, stop at the end of a complete file and say which phase/file to continue from.
4. **Data-driven.** Every block, enemy, boss, captain, ship, skill-tree node and achievement is a plain data object in `src/data/*.ts`, validated by a schema at startup. Adding content must never require touching engine code unless a *new behavior primitive* is needed.
5. **Deterministic.** All randomness goes through one seeded PRNG (`mulberry32`) with named streams (`rng.combat`, `rng.map`, `rng.fx`, `rng.spawn`). Same seed + same inputs ⇒ same run. Never call `Math.random()` in gameplay code.
6. **Show your work at the start:** output the file tree, a one-paragraph architecture summary, and `DECISIONS.md` (3–10 lines each for any choice you made where this spec was silent). Then implement.
7. **Self-verify.** Before declaring a phase done: run `tsc --noEmit`, `vitest run`, and `vite build`; fix every error; list the acceptance tests (Section 15) that pass.

---

## 1. THE FANTASY (read this before designing anything)

The player is a ship-builder first and a pilot second. The loop is:

**Build** a circuit in the hull grid → **fly** a run through a procedurally generated world map of tiers → **earn** currency → **unlock** better blocks, hulls, captains and skill nodes → **rebuild** smarter → push deeper.

Two things make this version different from its inspiration, and they are the heart of the project:

* **Living enemies.** Enemies are *organisms made of rock*, not static bricks. They drift, rotate, **divide by mitosis when damaged or killed**, mutate, and interact with specific projectile modifiers. A build that melts a single big asteroid might make things *worse* against a swarm, and vice-versa. Builds must have to **answer different enemy types**.
* **Wall bosses.** Bosses are screen-spanning structures you **cannot fly around**. They are DPS-and-mechanics checks that demand a build designed for them.

Design every system so that **block choice and block ORDER on the grid are the primary skill expression.**

---

## 2. CONFIG BLOCK (put in `src/config.ts`, referenced everywhere, no magic numbers elsewhere)

```ts
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
```

Large numbers: use JS doubles and a `formatBig(n)` helper (`1.2K, 3.4M, 5.6B, 7.8T, 9.1Qa, …, then scientific`). Never let damage overflow to `Infinity`; clamp at `1e300`.

---

## 3. CORE RUNTIME

### 3.1 Camera, world, movement
* Portrait 9:16 logical resolution, scaled to fit the window with letterboxing; crisp on HiDPI.
* Layered parallax background (3 depth layers + drifting nebula + star field) generated at boot from noise onto offscreen canvases. Each *world-map biome* uses a different palette (red-nebula, teal-nebula, grey-rock, ice, toxic-green, void-purple).
* **Free movement.** The ship can move anywhere inside the screen margins (not locked to the bottom). Input:
  * Touch/mouse: ship follows the pointer with smoothed lerp and a small offset so the finger doesn't hide it. Relative-drag mode as an option in settings.
  * Keyboard: WASD/arrows, `Shift` = slow precision move.
* **Auto-fire is always on** while the ship is alive. Aim is fixed by the circuit's ejector directions (a hull may fire in several directions).
* **Ship vs. enemy collision:** contact deals damage to the ship's *hull integrity* (see 9.2) and bumps the ship (small knockback + 0.5 s i-frames). Enemies are never dodged *for free*: bigger rocks have a big hitbox and large clusters can corral the player.

### 3.2 Performance architecture (non-negotiable)
* **Struct-of-arrays object pools** (typed arrays: `Float32Array` for x/y/vx/vy/rot/hp etc., `Uint8Array` for flags) for projectiles, enemies, particles, pickups, damage numbers. No object allocation inside the frame loop. No `array.filter/map/forEach` closures in hot paths.
* **Spatial hash grid** (cell ≈ 64 px) for projectile↔enemy and ship↔enemy queries. Rebuild per frame for enemies; query per projectile.
* **Rendering:** Pixi `ParticleContainer`/instanced sprites from pre-baked texture atlases (generated at boot via `renderer.generate.texture`). Projectile trails drawn as batched line/mesh ribbons with a hard cap.
* **Fixed timestep simulation** at 120 Hz with interpolated render; clamp max catch-up to 5 steps.
* **Budget:** 60 FPS on a mid-range phone with 2000 projectiles + 250 enemies + 3000 particles. Include an in-game perf overlay (`F3`/triple-tap) showing frame ms, entity counts, split-budget usage, GC pauses.
* **Graceful degradation:** if frame time > 20 ms for 1 s, auto-reduce particle density → trail length → then merge-spawn enemies (see 6.5). Never drop gameplay correctness, only visuals.

### 3.3 Game states
`Boot → MainMenu → [Build | Ships | Shop | Captain | SkillTree | WorldMap | Quests | Settings] → Run → RunSummary → back`. A bottom tab bar (5 tabs, colour-coded: red = Build, magenta = Ships/Shop, yellow = Captain/Resources, orange = Skill Tree, cyan = World Map) is visible in all non-run screens, mirroring the original's navigation clarity. A run can be launched from the World Map by selecting a node and pressing **Fly**.

---

## 4. THE CIRCUIT BUILDER (the soul of the game)

### 4.1 Grid & hulls
* A **Hull** defines a grid (up to 11×11) where each cell is one of: `empty` (buildable), `void` (hatched, unusable), `blocked` (solid, cannot be crossed or built on, shown with a red ✕), `generator` (pre-placed, fixed), `ejector` (pre-placed, fixed, on any edge or hull cell facing outward).
* Hull stats: `space` (number of buildable cells, shown like "Space: 43"), `firerate` (generator pulses/s multiplier), `projectileSpeed`, `hullIntegrity`, `moveSpeed`, plus hull **trait** (e.g. "Pirate Mothership: enemies in pirate nodes act as if 15% weaker").
* Ship hull roster (minimum 10, each with a distinct grid silhouette, ≥ 3 with multiple generators and/or multiple ejector directions): Shuttle (small, 1 gen/1 ej), Army Launcher (long vertical), Explorer (wide), Luxus-Class (symmetrical), Extractor (spider, 4 ejectors), Pirate Mothership (large, deterrent trait), Lancer, Hive-Carrier, Prism, Leviathan. Each hull has a procedurally drawn top-down sprite (layered polygons + engine glow) and a procedurally drawn **build-screen blueprint** of its grid.
* Hulls are unlocked by currency and/or achievements. Show "owned" labels in a horizontally scrolling carousel with a live preview of the hull's current circuit in a minimap.

### 4.2 Cells, ports and rotation
* Every block has up to four **ports** (N/E/S/W), each `in`, `out`, `both` or `none`, defined in the block's base orientation and rotated in 90° steps. A **signal packet** only travels between two adjacent cells if the leaving side is an `out` and the facing side of the neighbour is an `in` (or `both`).
* Blocks are placed by **drag-and-drop with snapping**: show a ghost block, highlight valid cells green and invalid cells red, show port arrows on the ghost, cell hover glow, and a satisfying snap animation + sound. Long-press or click selects a placed block (green selection outline). Toolbar: **rotate CCW, rotate CW, clear cell, clear all, copy layout, paste layout, auto-fit/zoom, undo, redo (50-step history)**. Pinch-zoom and pan the grid on touch; scroll-wheel on desktop.
* **Inspector panel** (top of screen, always visible, two lines of text as in the original): selecting any block — in inventory or on grid — shows its name, rarity, level, and the **exact mathematical rule** ("Converts 15% of direct damage into pure damage. Pure damage pierces shield and armor."). All numbers displayed in the inspector are read from the same data fields the compiler uses, so text can never drift from behavior.

### 4.3 Visual circuit tracing
* Draw a persistent **red circuit line** through every cell the signal travels, from each Generator to each Ejector, using each block's port geometry (straight dashes, elbow turns, T-junctions, crossovers drawn with a small hop/bridge). Dashed-line *marching ants* animation runs in the direction of travel.
* Unconnected-but-placed blocks render dimmed with a "no signal" marker so the player instantly sees wasted parts. Dead-end signals render as a short faded stub.
* **Damage Ledger (new, important):** long-press/hover on any cell on a live path shows the packet's stats *after* passing that cell (damage, pure fraction, projectile count multiplier, active modifiers, probability tags). A "Path View" toggle shows the full ledger as a strip under the grid for the selected ejector. This is what makes order-of-operations learnable.

### 4.4 The Circuit Compiler (`src/engine/compiler.ts`) — specify precisely, unit-test heavily

Input: grid + rotations + hull stats + captain/skill modifiers. Output: `CompiledShip`.

**Algorithm**
1. Build a directed graph over cells using the port rules above. Detect and reject cycles: any cycle gets a red "feedback loop" marker and the signals through it are cut at the cell that closes the loop (the compile still succeeds; the cut is reported).
2. From each Generator, depth-first walk, carrying a `Packet`:
   ```ts
   interface Packet {
     damage: number;           // direct damage
     pure: number;             // pure-damage fraction 0..1 (ignores shield+armor)
     count: number;            // projectiles represented by this packet (for splitters)
     speedMul: number; lifeMul: number; sizeMul: number;
     mods: Modifier[];         // ordered list of behavior modifiers
     gates: ChanceGate[];      // per-shot random effects, resolved at fire time
     tags: Set<string>;        // e.g. "fire","frost","shock","corrosive","seed"
     axisLock?: 'H'|'V';       // used by crossovers
   }
   ```
3. Each block exposes a pure function `apply(packet, ctx) => Packet[]` (one output packet per out-port it routes to). **Order matters**: blocks apply in path order, so *Add-then-Multiply ≠ Multiply-then-Add*. This is intended and must be taught by the ledger.
4. **Splitters duplicate packets** (each branch keeps full damage; splitters are a trade of burst for coverage). Total emitted projectile count is bounded by `ejector.throughput` per pulse to prevent infinite-exponential cheese; excess is converted into **+damage on the surviving projectiles** at a 50 % rate so more splitting is never a pure loss.
5. **Crossovers:** pass H and V packets through the same cell independently with no mixing and no modification. Different `axisLock` values are preserved.
6. At an Ejector the packet becomes an `EjectorRecipe { direction, spawnOffset, packet }`. A **multi-generator** hull gets independent pulse timers.
7. `CompiledShip` also reports: dps estimate (expected value including probabilities), burst estimate, projectile count per pulse, pierce/bounce/AoE summary, wasted-cell count, and warnings. Show a **Stats Card** in the Build screen (expected dmg/pulse, dps vs. Shield/Armor/Swarm benchmarks).
8. Compile is triggered on every grid change, takes < 5 ms for an 11×11 grid, and is **pure/deterministic** (no side effects) so it's testable headlessly.

**Fire-time resolution:** each pulse, for every recipe, roll `gates` (Section 5.3) with `rng.combat`, instantiate projectiles from the pool, attach the modifier list as a compact index array into a shared behavior table (do not copy objects per projectile).

---

## 5. BLOCK CATALOG (the expanded part — implement ALL of these, no placeholders)

Each block is a data record: `{ id, name, category, rarity, ports, baseCost, maxLevel, levelScaling, inspectorText(level), apply, icon }`. Every block has a **procedurally drawn icon** (line-art style in its category colour on a dark tile) and **upgrade levels** (1…maxLevel, bought with currency) that scale its numbers. Costs scale ~×1.6 per level. Show numbers like `+100` via the inspector.

### 5.1 Pathing (red)
| Block | Behavior |
|---|---|
| **Generator** | Fixed. Emits a pulse at `firerate × CONFIG.PULSE.BASE_RATE`/s with base damage 1 (+captain/skill bonuses). |
| **Ejector** | Fixed on hull. Spawns projectiles in its facing direction. |
| **Straight** | In one side, out opposite. |
| **Turn L / Turn R** | 90° turn. |
| **Splitter 2** | One in, two outs (left/right of input). |
| **Splitter 3** | One in, three outs (left/forward/right). |
| **Crossover** | Two independent perpendicular lanes, no interaction. |
| **Diode** | One-way gate; also blocks reverse-direction packets (used with loop layouts). |
| **Alternator** | Sends successive pulses to alternating outputs (A, B, A, B). Output count halves per-branch frequency but doubles each branch's damage. |
| **Random Router** | Each pulse chooses one output at random (weighted by level). |
| **Merger** | Two inputs → one output: sums damage, keeps union of modifiers, count adds. Powerful but needs both lanes alive. |
| **Delay Line** (levels 1–5) | Holds the packet for `0.1 × level` s; the projectile is emitted late, enabling timed volleys. |
| **Portal Pair** (placed as two linked cells) | Packet entering one portal exits the other, in the exit portal's facing direction; allows jumping over blocked cells. |
| **Reflector** | Reverses packet direction (bouncing a lane back through earlier blocks is *forbidden* by cycle rule — it can only reverse into a free neighbour). |
| **Armored Plating** | Non-signal cosmetic/structural block that adds hull integrity and blocks nothing; fills holes productively. |

### 5.2 Damage & scaling (yellow)
| Block | Behavior |
|---|---|
| **Flat +** (L1 +100 … ) | Adds flat damage. Scales with levels. |
| **Percent ×** (×1.5, ×2) | Multiplies current packet damage. |
| **Lucky Strike** | 33 % chance: ×2 damage (resolved per shot at fire time). |
| **Jackpot** | 4 % chance: ×10 damage. |
| **Gambler's Gate** | 50 % chance packet is **deleted**, otherwise ×3 damage (high variance, great with splitters). |
| **Overclock** | Each consecutive pulse that this lane fires **adds +2 % damage (cap +100 %)**, resets on 1 s of no fire. Rewards uninterrupted lanes. |
| **Capacitor** | Absorbs the next *N* pulses on its lane and emits one projectile with the **sum** of their damage (a "slow, huge shot" archetype). |
| **Berserker Coil** | Damage ×(1 + 0.5 × missing-hull-integrity fraction). |
| **Executioner** | Projectile deals ×3 damage to enemies below 25 % HP. |
| **Tithe** | −X % damage, but kills that happen with this projectile give +Y % extra currency. |

### 5.3 Projectile behavior modifiers (cyan)
| Block | Behavior |
|---|---|
| **Piercing** | Projectile continues through enemies while damage remains; damage is reduced by `max(10 %, hitTargetRemainingHP)` after each pierce (spec: it loses the damage it spent). |
| **Bouncing** | On hitting a screen edge or an **armored** enemy, picks a random new direction and keeps **full** damage (count of bounces limited by level). |
| **Curving Right** | Applies constant angular velocity (clockwise) after launch. |
| **Random Curve** | Smooth noise-driven steering. |
| **Boomerang** | Returns to the ship after max range; hits both ways, then is re-absorbed (reduces next pulse delay slightly). |
| **Homing** | Gentle steering toward nearest enemy within a cone (turn rate by level). |
| **Orbit** | Projectile circles the ship at radius R for N seconds before launching; creates a defensive ring. |
| **AoE – Circle** | Detonates on impact: full damage in radius R. |
| **AoE – Rectangle** | Detonates as a horizontal bar (wide, thin), good vs rows of enemies. |
| **Chain Lightning** | On hit, jumps to up to *N* nearby enemies at 70 % damage each (shock tag). |
| **Fork on Impact** | On hit, spawns *k* smaller copies (50 % damage, 0.6× size) radiating outward. |
| **Mine** | Projectile halts after traveling distance D and **waits** for an enemy to touch it (long lifespan). |
| **Gravity Well** | Small attractor on impact for 1.5 s; pulls enemies and enemy fragments together (huge with AoE; see Mitosis interactions). |
| **Magnetized** | Projectile is pulled toward other friendly projectiles, forming dense clusters. |
| **Pure Converter** | Converts *X* % of damage into **pure damage** (ignores shield and armor). Inspector text: *"Converts 15% of direct damage into pure damage. Pure damage pierces shield and armor."* |
| **Armor-Piercer Tip** | Bonus ×damage vs enemy armor only; no effect on unarmored. |
| **Shield-Breaker** | Bonus ×damage vs shields only; also stops shield regen for 2 s. |

### 5.4 Status & elemental (orange)
| Block | Behavior |
|---|---|
| **Ignite** | Applies a burn: *Y*% of hit damage per second for 3 s (stacks refresh, do not multiply). |
| **Frostbite** | Slows enemy drift/rotation by 30 % for 2 s; frozen enemies take +25 % damage and **cannot split** until thawed (they shatter into the same children when killed). |
| **Corrosion** | Each hit strips 5 % of the enemy's remaining armor (stacks to 50 %). |
| **Static Charge** | After 3 hits on one target, it releases a damage pulse at 150 % damage. |
| **Magnetize Target** | Marked enemy pulls nearby small fragments toward it. |
| **Vampiric** | 2 % of damage dealt is converted to hull repair (capped per second). |

### 5.5 Mitosis-aware blocks (**new, these make the enemy system matter**)
| Block | Behavior |
|---|---|
| **Fission Catalyst** | A hit that doesn't kill forces the enemy to split **immediately** (children inherit remaining HP divided by number of children) — turns big slow rocks into many fast-dying small ones. |
| **Cauterize** | Hit enemies **cannot split** for 3 s; a kill during this window yields **no children** and +25 % currency. Anti-swarm tech. |
| **Cleaver** | Projectile deals ×1.5 damage to a split-fragment (generation ≥ 1) but ×0.75 to a generation-0 parent. Meant for cleaning up. |
| **Culling Bolt** | Deals damage equal to **N % of the target's max HP** (capped at a multiple of your current damage); great vs huge parents, weak vs fragments. |
| **Residue Seed** | On kill, leaves a lingering damaging cloud (seed tag) where the enemy died; damages emerging children. |
| **Overkill Spill** | Damage in excess of an enemy's remaining HP is **carried over** to its newly spawned children (spread evenly) rather than wasted. |

### 5.6 Ship passives (green, placed in circuit-free cells)
Shield Emitter (+hull integrity regen), Magnet Core (pickup radius), Thruster (+move speed), Targeting Lens (+projectile speed), Capacitor Bank (+max burst), Lucky Charm (+5 % rare-pickup chance), Sensor Array (shows enemy HP bars on tier ≥ N).

### 5.7 Progression of blocks
* Blocks are bought **in the Shop** (quantity-limited stock that refreshes per world tier) and **unlocked via the Skill Tree / achievements** (hex nodes can unlock blocks, +slots, new hull traits).
* The Inventory screen (grid of icons with owned counts and filter by category) opens from the Build screen's "A▮▮▮" button. Dragging from inventory to grid consumes nothing until *Saved*; removing returns the block.
* **Presets:** 5 named save slots per hull; "Copy/Paste layout" via JSON string (so players can share builds).
* **Block synergy hints:** when hovering a block, glow other blocks in the current circuit it synergizes with (tag-based).

**Content requirement:** at least **48 distinct blocks** from the tables above must exist as fully working data entries with icons, inspector text and compiler/combat behavior, plus ≥ 3 upgrade levels each.

---

## 6. ENEMY SYSTEM — living, dividing asteroid-organisms

### 6.1 Philosophy
Enemies are **rock organisms**. They *drift, spin, grow, split, reform and react*. Visual identity: asymmetrical procedurally generated polygons (Voronoi-ish / perturbed-circle outlines, 7–14 vertices) with layered shading, cracks, subtle bioluminescent veins, and a **membrane/nucleus glow** that telegraphs behavior (e.g., pulsing orange = about to split).

### 6.2 Enemy data shape
```ts
interface EnemyDef {
  id: string; name: string; tierMin: number; weight: number;
  size: 'XS'|'S'|'M'|'L'|'XL';          // radius 10 / 18 / 30 / 48 / 72 px
  hpMul: number; armorMul: number; shieldMul: number;
  move: MoveBehavior;                   // drift | sine | seek | orbit | skitter | anchor | chase-edge
  split?: SplitRule;                    // see 6.3
  traits: Trait[];                      // see 6.4
  reward: number;                       // currency multiplier
  contactDamage: number;
  palette: [string,string,string];
  draw: ProceduralShapeSpec;
}
```
Per-instance stats scale from the **node's tier** (Section 10) via `base(tier) = 12 × CONFIG.ECON.TIER_HP_GROWTH^tier`, then × def multipliers × mutation modifiers.

### 6.3 Mitosis (the signature mechanic)
```ts
interface SplitRule {
  trigger: 'onDeath' | 'onHitThreshold' | 'onTimer' | 'onHitEvery';  // e.g. every 25% HP lost
  children: number | [min:number,max:number];
  childDefId: string;                    // may be a *different* species (e.g., Geode → Shards)
  hpShare: number;                       // fraction of parent's *max* HP each child gets (e.g., 0.4)
  shape: 'binary' | 'triple' | 'radial' | 'bud' | 'cluster';
  inheritArmor: number; inheritShield: number; inheritVelocity: number;
  generationCap: number;                 // default CONFIG.MITOSIS.MAX_GENERATION
  telegraph: number;                     // seconds of visible swell/crack before dividing
}
```
**Rules**
1. **Conservation with a ceiling:** total child HP = `parentMaxHP × hpShare × children`, with `hpShare × children` between **0.7 and 1.3** (some species grow, some shrink). Generation +1 each split. At the generation cap, the enemy dies without splitting.
2. **Impulse:** children fly apart along a natural fission axis (perpendicular to the killing projectile's direction for `binary`, 360° fan for `radial`) with a bounce-off impulse plus inherited velocity — **splits must be spatially readable and satisfying** (squish/pinch animation → pop → particle burst).
3. **Overkill spill:** by default overkill is *lost*; with the Overkill Spill block it carries into children (Section 5.5).
4. **Telegraph:** when a split is queued, the parent swells and pulses for `telegraph` seconds (min 0.12 s). During telegraph it takes **+25 % damage** and a Cauterize/Frost hit cancels the split. This gives skilled builds something to exploit.
5. **Budgeting:** a global **split budget** (CONFIG.MITOSIS.GLOBAL_SPLIT_BUDGET_PER_SEC) prevents the engine from exploding. If exceeded, the split spawns **one aggregated child** with `SWARM_MERGE_BONUS ×` the HP and a "swarm" visual instead of N bodies. The player never sees a freeze, and the numbers remain fair. Likewise honor `CAPS.ENEMIES`.
6. **Currency:** **every** body drops currency (value scales with generation: later generations drop less each, but the *sum* of a family drops ≈ 1.1 × the parent alone), so cleaning up fragments is always worth it.
7. **Reformation (select species only):** fragments left alive too long (> 6 s) near each other can **merge back** into a parent at 70 % of the sum of their remaining HP, creating pressure to kill swarms.

### 6.4 Traits (composable)
| Trait | Effect |
|---|---|
| **Armored** | Flat armor value; direct damage is reduced by the armor *ratio* formula below. |
| **Shielded** | Shield pool absorbs first; shield **regens** after 2 s of no hits. |
| **Reflective** | Reflects non-pure projectiles with 10 % probability (new random direction). |
| **Magnetic** | Pulls friendly projectiles' paths slightly toward itself (bend) — Homing/Magnetized blocks interplay. |
| **Regenerating** | Heals % per second unless burning/corroded. |
| **Spore-cast** | Fires slow, destructible *spore* projectiles at the player (HP 1, can be shot). |
| **Phasing** | Alternates solid/ghost every 1.5 s (ghost is invulnerable but also can't hurt). |
| **Volatile** | Explodes on death damaging nearby enemies *and* the ship (use AoE to chain explode). |
| **Leader** | Nearby enemies get +damage resist until the Leader dies. |
| **Hardshell** | Immune to splitting while generation 0 hull is intact (breaks at 50 % HP): "crack, then divide". |

**Damage formula (in `src/engine/damage.ts`, unit-tested):**
```
pureDmg   = dmg * pureFrac
directDmg = dmg - pureDmg
afterShield = shield absorbs directDmg first; remainder continues
afterArmor  = remainder * (1 / (1 + armor / armorScale(tier)))     // armor is a ratio, never a flat wall
hpDamage    = afterArmor + pureDmg                                  // pure bypasses both
```
Show a **floating damage number** on a pool with color coding: white = normal, cyan = pure, orange = crit/lucky, grey = reduced by armor.

### 6.5 Species roster (minimum 12, each with unique silhouette, palette and behavior)
1. **Mitotic Rock** — baseline binary splitter, onDeath → 2 children (S→XS).
2. **Spore Mother** — triple split, slowly drifts, fires destructible spores.
3. **Hydra Boulder** — *bud* splits: each 25 % HP lost spawns a small bud while still alive; killing the parent last leaves the buds.
4. **Crystal Geode** — heavy armor, on death shatters into 5 **shielded** shards that skitter.
5. **Amoeba Slime-Rock** — large, soft, `onHitEvery` splits and reforms; slows projectiles passing through it.
6. **Seeker Chip** — small fast skitterers that chase the ship's x-position; low HP, high contact damage.
7. **Anchor Core** — stays put, heavy shield, emits a **shield bubble** that protects a radius of enemies; kill it first.
8. **Twin Orbit** — two bodies that orbit each other; killing one makes the other enrage (+50 % speed, +damage).
9. **Magnet Husk** — bends projectiles and drags fragments into itself.
10. **Gravity Pup** — spawns tiny fragments that orbit the ship briefly and then explode.
11. **Ghost Rock** — phasing; splits on thaw only.
12. **Chain Colony** — a connected line of 6 rocks; killing the chain's head causes the rest to disperse and split.
13. *(bonus)* **Reformer** — splits into 3, but if any live more than 6 s they merge back stronger.

**Mutation modifiers** (from the map node's "Mutation %"): per-spawn chance, each adds a modifier: *+1 generation cap*, *+armor*, *+shield*, *+speed*, *double telegraph*, *glowing outline = drops extra*, *Elite (size ×1.4, +HP, extra trait)*. Mutated enemies draw a distinct coloured outline.

### 6.6 Spawning, waves & pacing
* Enemies spawn from the **top** (and, for skitterers, upper side edges), arriving in **patterns**: row, wedge, ring, spiral, pincer, snake (list ≥ 8 pattern generators), chosen by a **director** that keeps pressure within a target "threat budget" scaling with node tier and the time since last pressure drop.
* A run is a **stretch of a map path** (e.g. N waves → mini-boss at wave X → boss at node end). Nodes with a boss show a skull marker.
* Enemies that reach the **bottom** deal damage to hull integrity (and are removed); big rocks deal more. This gives the DPS race a deadline.

---

## 7. BOSS SYSTEM — "Wall Bosses"

**Design pillars:** bosses are **structures**, not ships. They span **≥ 85 % of the screen width**, enter from the top, and **cannot be circumvented** — there is no safe flank. They descend slowly (a visible "danger line" shows how close they are to the player's end of the screen) and the fight ends when the boss dies or reaches the line.

### 7.1 Anatomy
```ts
interface BossDef {
  id: string; name: string; width: number;     // 0.85–1.0 of view
  parts: BossPart[];                            // see below
  phases: Phase[];                              // HP-threshold-driven script
  descentSpeed: number;                         // px/s toward the danger line
  enrageAt: number;                             // seconds before descent speed ×2
  arena?: ArenaModifier;                        // e.g. side-wall hazards, scrolling debris
  reward: Reward;
}
interface BossPart { id: string; hp: number; armor: number; shield: number;
  offset: Vec2; hitShape: Shape; role: 'plate'|'turret'|'core'|'spawner'|'shieldGen'; invulnerableUntil?: string[]; }
```
* **Plates/turrets/shield generators** must be destroyed or opened before the **core** takes damage (or the core takes only 10 % until exposed). Parts have independent armor/shield so **different builds win different bosses** (high-pure builds ignore plate armor; AoE hits many plates; piercers punch through lanes of plates).
* Every boss has a **weak point** that cycles: mark it visibly (glowing core), taking ×3 damage while exposed.

### 7.2 Attacks (data-driven pattern scripts, combine from a library)
Spread/aimed/ring bullet patterns, sweeping laser beams (telegraphed 1 s with a thin line), spawning minion waves (using mitosis species), falling debris, sideways shockwaves (the *player must be in the gap*), a screen-edge "pincer" that narrows the safe horizontal space. Telegraph everything. Never create an unavoidable instant death.

### 7.3 Boss roster (minimum 6; one per ~10 map tiers by scaling formula)
1. **The Crusher Wall** — a 4-plate wall that descends; destroy plates left→right to open the core; minimal attacks; pure DPS check, teaches the genre.
2. **Hive Mother** — a huge organic wall with 5 **spawner pores** that continuously birth Mitotic Rocks; killing pores with splash is correct; Cauterize helps; Fission Catalyst is a trap.
3. **The Prism Gate** — twin shield-generator pylons that refract/bend your projectiles; destroy them to expose the core, laser sweep attacks.
4. **Cell Lattice** — a grid of 40 small cells; the cells *divide* if damaged without being killed (boss-scale mitosis); AoE and pierce shine.
5. **The Breaker** — boss that *consumes* its own plates to heal; kill order matters; periodic shockwaves.
6. **The Singularity** — a gravity-bending wall that pulls the ship and curves your projectiles; the final test; 3 phases.

Each boss has procedurally drawn art (modular parts drawn from polygons/gradients/glow), a **boss health bar** with part-health pips, a name-intro splash (1.5 s), and a unique music/sfx intensity shift.

### 7.4 Rewards
First-kill: unique block unlock or hull trait. Repeat kills: scaled currency + chance of rare upgrade tokens.

---

## 8. THE PLAYER'S SHIP IN RUN

* **Hull integrity** is the health bar (bottom-right cyan bars in the screenshots). Contact/hazards reduce it; passives regen; hitting zero ends the run (partial rewards kept).
* A thin **tier/progress** readout at the top right (the number "731" tilted in the reference) shows current tier or kill count.
* **Run modifiers:** at fixed milestones the player can pick 1 of 3 *temporary* boons (e.g., "+20 % AoE radius until end of run"). These never replace circuit-building; they flavor runs.
* A **pause menu** lets the player quit, view the circuit stats, or retry.

---

## 9. METAGAME

### 9.1 World Map (cyan)
* A procedurally generated graph of nodes across the **"world"** (seeded). Each node has **Tier, Coordinate, Health, Armor, Shield, Mutation%** (as in the reference screenshot: "Tier 1902, Coordinate 1338/1353, Health 504G, Armor 641G (100% of map, 64% with 0.53AR), Shield 1062G (45% of map, 25.6% regen/s), Mutation 9% (Level 4)").
* Nodes connect with edges; **cleared nodes** become cyan; locked nodes are dim. Player picks the next uncleared neighbor and presses **Fly**. Quick-nav buttons: *Current Selection, X, Max Tier, Cleared*.
* Biome backgrounds (large procedural planets/nebulas with glowing veins) change every ~100 tiers and set enemy species weights (e.g., toxic biome favors Spore Mothers).
* Node variants: *standard, elite (many mutations), boss, treasure (few enemies, big pickups), hazard (enemy waves + asteroid belts).*

### 9.2 Currency & economy
* Main currency (yellow square icon): from kills, bosses, treasure nodes, daily claim. Secondary: **Hex Tokens** (orange hex icon) for the Skill Tree; **Core Shards** for hull unlocks (boss drops).
* Top bar shows live currency. Show *tier-based reward scaling* but keep prices growing ~×1.6 per level. Include a **"Refund All"** option in the Skill Tree with a visible refundable amount.

### 9.3 Ships tab (magenta)
Carousel of hulls with a large animated preview, stats line ("Space: 43, Firerate: 4, Projectile speed: 2"), trait description, buy/equip button, and the hull's **circuit minimap**.

### 9.4 Shop
Tabs: **Blocks / Multipliers / Cosmetics / Boosters**. Items show their inspector text. Blocks have per-world-tier stock. A **Daily Deal** carries a discount. No real-money systems.

### 9.5 Captains (yellow)
Collectable captains with portraits (procedurally drawn pixel-art busts or stylized glyphs; **no real-person likenesses**). Each captain gives a rank-based bonus (e.g., +1 base damage per rank to all projectiles; +x% currency; +fire rate; "Venus: 1 damage for every 5 tiers cleared"), costs currency to rank up, and one captain is **active** per run. Provide ≥ 8 captains with distinct passive effects and an ability per run (a once-per-run active skill with a cooldown: e.g., "Nova: clear all enemy projectiles").

### 9.6 Skill Tree (orange hex)
* A **hexagonal node graph** with *Tier* progression markers on the right edge (50, 100, … 1000+), nodes unlocking: +damage, +fire rate, new block unlocks, more grid space, extra boon choices, mitosis-related perks ("+15 % damage to generation ≥ 2 fragments"), and "keystone" effects (as in the reference: "Projectiles near the ship are blasted upward with 1.5× damage; projectiles need to be active ≥ 1 s").
* Nodes: locked/grey, available/orange outline, owned/solid. **Tap to select** (green outline), description appears in the top bar, **buy** with Hex Tokens, **Refund All** button. Two secondary tabs: *Upgrades* (chevron), *Hex Tree* (hexagon), *Partnerships/Contracts* (handshake): timed contracts with objectives ("Clear 5 boss nodes using ≥ 4 splitters") granting rewards.

### 9.7 Quests/Achievements
≥ 40 achievements with tiered goals and checkboxes ("Create a projectile with more than 1000 damage", "Own 10 ships", "Kill a Hive Mother using only AoE"), each granting currency or a block.

### 9.8 Save system
Auto-save to `localStorage` (versioned schema with migrations), manual **export/import save string**, and a hard reset option. Corrupted saves must fall back safely, not crash.

---

## 10. TIER / DIFFICULTY MODEL

`tierHP(t) = 12 × 1.055^t`, `tierArmor(t) = 0.8 × tierHP(t)` (varies by species), `tierShield(t)`, `tierReward(t) = 4 × 1.05^t`. Tune so that the recommended build power roughly doubles every ~14 tiers. Include a **balance spreadsheet generator** (`npm run balance`) that prints expected enemy HP, boss HP, and the required DPS for tiers 1, 10, 50, 100, 250, 500, 1000, 1900.

---

## 11. UI/UX & FEEL (polish is part of the spec)

* **Visual language (follow the references' mood but produce your own look):** deep nebula backgrounds; neon outline UI on dark glass panels; red = circuit, yellow = currency, magenta = ships/captains, orange = skills, cyan = map. Rounded-hex and tile iconography.
* **Juice:** hit flashes, white/cyan impact sparks, damped screen shake (tied to big kills/boss hits, with a setting to disable), hit-stop 40 ms on big splits, squash-and-stretch on splits, rising damage numbers, kill-streak combo meter, pickup magnet whoosh, boss intro slam.
* **Visual clarity under load (critical, the references show thousands of projectiles):** projectile colour is derived from the packet's dominant tag; **friendly projectiles never obscure enemy bodies** (render projectiles in a lower-alpha additive layer with outlines off); enemy bodies have a bright rim light. Provide a **"Visual Clarity" setting** (reduced trails / thinner projectiles / opaque-enemy outline).
* **Audio (WebAudio, procedural):** synthesized shoot (pitch by damage tier), hit, split "squelch", boss slam, UI click, pickup arpeggio, ambient pad per biome. Master/SFX/Music sliders, auto-ducking during boss intro, polyphony cap.
* **Accessibility:** colour-blind palette toggle, reduced flashing, hold-vs-toggle options, text scaling, haptics on mobile (`navigator.vibrate`).
* **Tutorial:** a 6-step interactive first-time tutorial in the Build screen (place splitter, order of flat vs. multiplier, crossovers, first run) with a skip button.
* **Responsive:** works from 360×640 phones to 4K desktop; touch targets ≥ 44 px.

---

## 12. DEBUG & TEST TOOLING (so you can prove it works)

* `?debug=1` enables a panel with: spawn any species/boss at any tier, god-mode, +currency, unlock-all, time scale (0.25×–4×), entity counts, split-budget meter, compile ledger dump, deterministic seed input, and **"Autoplay"** (an AI pilot that dodges the nearest threat and holds a sine sweep) for soak tests.
* `window.__MGB__` exposes `compile(grid)`, `simulate(seconds, seed)` (headless fixed-step sim returning kill count, damage dealt, splits), and `loadBuild(json)` for the unit tests.
* Provide **5 starter example circuits** (JSON) and 5 "showpiece" circuits that stress-test the engine (e.g., the pierce/curve loop with 1500+ projectiles).

---

## 13. FILE STRUCTURE (create exactly this, expand as needed)

```
/
├─ index.html, package.json, tsconfig.json, vite.config.ts, README.md, DECISIONS.md
├─ src/
│  ├─ main.ts, config.ts, rng.ts, save.ts, audio.ts, input.ts
│  ├─ engine/ compiler.ts, damage.ts, pools.ts, spatialHash.ts, sim.ts, director.ts, mitosis.ts, boss.ts, projectiles.ts
│  ├─ data/ blocks.ts, enemies.ts, bosses.ts, hulls.ts, captains.ts, skillTree.ts, quests.ts, biomes.ts, patterns.ts
│  ├─ gen/ shapes.ts (procedural polygons), textures.ts (atlases), backgrounds.ts, icons.ts, portraits.ts, planets.ts
│  ├─ ui/ screens/*.ts, widgets/*.ts (grid, inspector, tabbar, carousel, hexTree, mapView, toast)
│  └─ debug/ panel.ts, autoplay.ts
└─ tests/ compiler.test.ts, damage.test.ts, mitosis.test.ts, pools.test.ts, save.test.ts, boss.test.ts, balance.test.ts
```

---

## 14. BUILD PHASES (do them in order; finish and verify each before the next)

1. **Foundations:** config, RNG, pools (SoA), spatial hash, fixed-timestep loop, Pixi bootstrap, input, perf overlay. Acceptance: 3000 dummy projectiles at 60 FPS.
2. **Compiler + Builder UI:** grid, ports, rotation, drag/drop, inspector, red circuit tracing, ledger, undo/redo, with the 15 pathing blocks, first 10 damage/modifier blocks. Acceptance: tests in Section 15 (compiler group).
3. **Combat core:** projectiles with all behavior modifiers, damage formula, hit pipeline, first 4 enemy species, pickups, damage numbers, run loop and summary.
4. **Mitosis system:** SplitRule, telegraph, impulses, split budget & aggregation, reformation, generation caps, Mitosis blocks (5.5), remaining 8+ species, mutation modifiers.
5. **Bosses:** BossDef runtime, parts, phases, attack library, danger line, all 6 bosses.
6. **Metagame:** hulls (10), shop, captains, skill tree, world map with tier model, quests, save system.
7. **Remaining blocks to reach ≥ 48, upgrade levels, status/elemental systems.**
8. **Polish:** procedural audio, biome backgrounds, tutorial, settings/accessibility, juice, clarity setting, balance pass (`npm run balance`).
9. **Hardening:** soak test (30-minute autoplay, no memory growth, no NaN), mobile pass, final README with controls and "How to add a block/enemy/boss in 5 minutes".

---

## 15. ACCEPTANCE TESTS (write them as Vitest tests and report results)

**Compiler**
* A Generator → Straight → Ejector chain yields one recipe with damage = base.
* Flat+100 then ×2 yields `(base+100)×2`; ×2 then Flat+100 yields `base×2+100` (order matters).
* Splitter-3 yields 3 packets; a Merger rejoins two of them to one packet whose damage is the sum.
* Two crossing lanes through a Crossover do not mix modifiers.
* A feedback loop is cut and reported, not infinite-looped.
* Portal pair transports a packet and preserves modifiers.
* Compile of an 11×11 full board < 5 ms (average over 100 runs).

**Damage & combat**
* Pure fraction bypasses shield and armor exactly as the formula states (numeric test).
* Piercing loses damage per target; Bounce keeps full damage; AoE hits all in radius once.
* Probability gates over 100k rolls land within ±1 % of expected frequency (seeded).

**Mitosis**
* Binary rock with `hpShare 0.55 × 2 children` spawns children whose total max HP ≈ 1.1 × parent.
* Generation cap prevents splitting beyond `MAX_GENERATION`.
* Over-budget splits spawn one aggregated child with the merge bonus; the total live enemy count never exceeds `CAPS.ENEMIES`.
* Cauterize cancels a queued split; Fission Catalyst forces one; Overkill Spill passes excess damage to children.

**Bosses**
* Core takes reduced damage until its plate/turret parts are destroyed.
* The danger-line reaching the bottom ends the run.

**System**
* Same seed + same build ⇒ identical `simulate(30, seed)` output (kills, damage, splits).
* Save round-trips and migrates older versions; corrupted JSON falls back to defaults.
* `tsc --noEmit`, `vitest run`, `vite build`, `build:single` all succeed.

---

## 16. DEFINITION OF DONE

A new player can open the game, finish the tutorial, build a circuit, fly through at least 20 tiers, meet at least 8 enemy species dividing in readable and satisfying ways, beat the first boss wall, spend rewards on blocks/ships/captains/skills, and come back to find a build that is meaningfully better, while the game stays at 60 FPS and never softlocks. Everything is procedurally generated, data-driven and documented.

**Start now: print the file tree, the architecture summary, DECISIONS.md, then implement Phase 1 in full.**

---

### Kickoff messages for multi-turn use

*First message:* "Read the master prompt. Output the file tree, architecture summary and DECISIONS.md, then implement Phase 1 completely. Stop when Phase 1's acceptance tests pass."

*Each next message:* "Continue with Phase N exactly as specified. Do not rewrite finished files unless a bug requires it; show only changed files in full. Run all checks and report results."

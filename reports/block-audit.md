| id | compiles correctly (test) | changes projectiles in Fly (test) | shown in picker |
|---|---|---|---|
| `generator` | - | - | N: Fixed hull cell, not placeable. |
| `ejector` | - | - | N: Fixed hull cell, not placeable. |
| `straight` | - | - | N: Removed: every empty cell is an implicit straight piece. Id kept for save migration only. |
| `turn_l` | compiles: turn_l sends the line left | fly: turn_l and turn_r change whether the ship fires at all | **Y** |
| `turn_r` | compiles: turn_r sends the line right | fly: turn_l and turn_r change whether the ship fires at all | **Y** |
| `splitter_2` | compiles: splitter_2 makes a left and a right branch only | fly: splitter_2 and splitter_3 change the number of projectiles per pulse | **Y** |
| `splitter_3` | compiles: splitter_3 makes left, forward and right branches | fly: splitter_2 and splitter_3 change the number of projectiles per pulse (+ e2e: 3 projectiles in every pulse) | **Y** |
| `crossover` | - | - | N: Future perk block (hook: crossoverBonus). Lines cross freely without it, so it has no effect yet. |
| `diode` | - | - | N: No effect: every line already runs one way, and a manually rotated block already gates by side. |
| `alternator` | - | - | N: Needs per-pulse state; the compiler is a pure function, so alternating cannot be expressed yet. |
| `random_router` | - | - | N: Random routing is not modelled; as a fixed three-way split it would just duplicate Splitter 3. |
| `merger` | - | - | N: Signals no longer share cells, so there is nothing to merge; needs a redesign. |
| `delay_line` | - | - | N: Timing is not modelled by the compiler and nothing in Fly consumes it. |
| `portal_pair` | - | - | N: Teleporting is not expressible in the relative-direction model yet. |
| `reflector` | - | - | N: A reflected signal would overlap itself; not supported by the line model. |
| `armored_plating` | - | - | N: Passive block: not on the signal path and no ship stat consumes it. |
| `flat_plus` | compiles: flat_plus adds 100 | fly: flat_plus and percent_mult change the damage of the fired projectile | **Y** |
| `percent_mult` | compiles: percent_mult multiplies by 1.5 in path order | fly: flat_plus and percent_mult change the damage of the fired projectile | **Y** |
| `lucky_strike` | compiles: lucky_strike adds a 33% x2 gate without changing the deterministic damage | fly: lucky_strike doubles the damage of about 33% of the shots | **Y** |
| `jackpot` | compiles: jackpot adds a 4% x10 gate | fly: jackpot multiplies the damage of about 4% of the shots by ten | **Y** |
| `gamblers_gate` | compiles: gamblers_gate adds a 50% x3-or-lose gate | fly: gamblers_gate loses about half the projectiles and triples the rest | **Y** |
| `overclock` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `capacitor` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `berserker_coil` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `executioner` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `tithe` | - | - | N: Only a damage penalty; its benefit (tithe) is not consumed by anything yet. |
| `fission_catalyst` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `cauterize` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `cleaver` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `culling_bolt` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `residue_seed` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `overkill_spill` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `piercing` | compiles: piercing, bouncing, aoe_circle and shield_breaker tag the packet | fly: piercing lets the projectile survive a hit (baseline: it is destroyed) | **Y** |
| `bouncing` | compiles: piercing, bouncing, aoe_circle and shield_breaker tag the packet | fly: bouncing ricochets off an armored enemy (baseline: destroyed) | **Y** |
| `aoe_circle` | compiles: piercing, bouncing, aoe_circle and shield_breaker tag the packet | fly: aoe_circle also damages a neighbouring enemy (baseline: only the one hit) | **Y** |
| `shield_breaker` | compiles: piercing, bouncing, aoe_circle and shield_breaker tag the packet | fly: shield_breaker strips more shield and deals more damage than the same shot without it | **Y** |
| `pure_converter` | compiles: pure_converter makes 15% of the damage pure | fly: pure_converter ignores armor, so an armored enemy takes more damage | **Y** |
| `curving_right` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `random_curve` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `boomerang` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `homing` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `orbit` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `aoe_rect` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `chain_lightning` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `fork_impact` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `mine` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `gravity_well` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `magnetized` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `armor_piercer` | - | - | N: The projectile system reads the modifier id "armor_piercer_tip" but this block emits "armor_piercer", and the engine doubles all direct damage rather than only damage against armor. Needs an engine fix first. |
| `ignite` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `frostbite` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `corrosion` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `static_charge` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `magnetize_target` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `vampiric` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `shield_emitter` | - | - | N: Passive block: not on the signal path and no ship stat consumes it. |
| `magnet_core` | - | - | N: Passive block: not on the signal path and no ship stat consumes it. |
| `thruster` | - | - | N: Passive block: not on the signal path and no ship stat consumes it. |
| `targeting_lens` | - | - | N: Passive block: not on the signal path and no ship stat consumes it. |
| `capacitor_bank` | - | - | N: Passive block: not on the signal path and no ship stat consumes it. |
| `lucky_charm` | - | - | N: Passive block: not on the signal path and no ship stat consumes it. |
| `sensor_array` | - | - | N: Passive block: not on the signal path and no ship stat consumes it. |

14 of 62 blocks are shown in the picker; the rest stay in the data and are hidden.

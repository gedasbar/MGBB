| id | compiles correctly (test) | changes projectiles in Fly (test) | shown in picker |
|---|---|---|---|
| `generator` | - | - | N: Fixed hull cell, not placeable. |
| `ejector` | - | - | N: Fixed hull cell, not placeable. |
| `straight` | - | - | N: Removed: every empty cell is an implicit straight piece. Id kept for save migration only. |
| `turn_l` | compiles: turn_l sends the line left + levels (blocks9a: every shown block has at least 3 levels) | fly: turn_l and turn_r change whether the ship fires at all | **Y** |
| `turn_r` | compiles: turn_r sends the line right + levels (blocks9a: every shown block has at least 3 levels) | fly: turn_l and turn_r change whether the ship fires at all | **Y** |
| `splitter_2` | compiles: splitter_2 makes a left and a right branch only + levels (blocks9a: every shown block has at least 3 levels) | fly: splitter_2 and splitter_3 change the number of projectiles per pulse | **Y** |
| `splitter_3` | compiles: splitter_3 makes left, forward and right branches + levels (blocks9a: every shown block has at least 3 levels) | fly: splitter_2 and splitter_3 change the number of projectiles per pulse (+ e2e: 3 projectiles in every pulse) | **Y** |
| `crossover` | - | - | N: Future perk block (hook: crossoverBonus). Lines cross freely without it, so it has no effect yet. |
| `diode` | - | - | N: No effect: every line already runs one way, and a manually rotated block already gates by side. |
| `alternator` | blocks9a: alternator is a placeable shop block with levels, rarity, price and rule text | blocks9a: alternator does what its inspector says (Free Fly / shared pipeline) + takes effect in the Wall | **Y** |
| `random_router` | - | - | N: Random routing is not modelled; as a fixed three-way split it would just duplicate Splitter 3. |
| `merger` | - | - | N: Signals no longer share cells, so there is nothing to merge; needs a redesign. |
| `delay_line` | blocks9a: delay_line is a placeable shop block with levels, rarity, price and rule text | blocks9a: delay_line does what its inspector says (Free Fly / shared pipeline) + takes effect in the Wall | **Y** |
| `portal_pair` | - | - | N: Teleporting is not expressible in the relative-direction model yet. |
| `reflector` | - | - | N: A reflected signal would overlap itself; not supported by the line model. |
| `armored_plating` | - | - | N: Passive block: not on the signal path and no ship stat consumes it. |
| `flat_plus` | compiles: flat_plus adds 100 | fly: flat_plus and percent_mult change the damage of the fired projectile | **Y** |
| `percent_mult` | compiles: percent_mult multiplies by 1.5 in path order | fly: flat_plus and percent_mult change the damage of the fired projectile | **Y** |
| `lucky_strike` | compiles: lucky_strike adds a 33% x2 gate without changing the deterministic damage + levels (blocks9a: every shown block has at least 3 levels) | fly: lucky_strike doubles the damage of about 33% of the shots | **Y** |
| `jackpot` | compiles: jackpot adds a 4% x10 gate + levels (blocks9a: every shown block has at least 3 levels) | fly: jackpot multiplies the damage of about 4% of the shots by ten | **Y** |
| `gamblers_gate` | compiles: gamblers_gate adds a 50% x3-or-lose gate + levels (blocks9a: every shown block has at least 3 levels) | fly: gamblers_gate loses about half the projectiles and triples the rest | **Y** |
| `overclock` | blocks9a: overclock is a placeable shop block with levels, rarity, price and rule text | blocks9a: overclock does what its inspector says (Free Fly / shared pipeline) + takes effect in the Wall | **Y** |
| `capacitor` | blocks9a: capacitor is a placeable shop block with levels, rarity, price and rule text | blocks9a: capacitor does what its inspector says (Free Fly / shared pipeline) + takes effect in the Wall | **Y** |
| `berserker_coil` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `executioner` | blocks9a: executioner is a placeable shop block with levels, rarity, price and rule text | blocks9a: executioner does what its inspector says (Free Fly / shared pipeline) + takes effect in the Wall | **Y** |
| `tithe` | - | - | N: Only a damage penalty; its benefit (tithe) is not consumed by anything yet. |
| `fission_catalyst` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `cauterize` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `cleaver` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `culling_bolt` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `residue_seed` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `overkill_spill` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `piercing` | compiles: piercing, bouncing, aoe_circle and shield_breaker tag the packet + levels (blocks9a: every shown block has at least 3 levels) | fly: piercing lets the projectile survive a hit (baseline: it is destroyed) | **Y** |
| `bouncing` | compiles: piercing, bouncing, aoe_circle and shield_breaker tag the packet | fly: bouncing ricochets off an armored enemy (baseline: destroyed) | **Y** |
| `aoe_circle` | compiles: piercing, bouncing, aoe_circle and shield_breaker tag the packet | fly: aoe_circle also damages a neighbouring enemy (baseline: only the one hit) | **Y** |
| `shield_breaker` | compiles: piercing, bouncing, aoe_circle and shield_breaker tag the packet | fly: shield_breaker strips more shield and deals more damage than the same shot without it | **Y** |
| `pure_converter` | compiles: pure_converter makes 15% of the damage pure | fly: pure_converter ignores armor, so an armored enemy takes more damage | **Y** |
| `boomerang` | blocks9a: boomerang is a placeable shop block with levels, rarity, price and rule text | blocks9a: boomerang does what its inspector says (Free Fly / shared pipeline) + takes effect in the Wall | **Y** |
| `orbit` | blocks9a: orbit is a placeable shop block with levels, rarity, price and rule text | blocks9a: orbit does what its inspector says (Free Fly / shared pipeline) + takes effect in the Wall | **Y** |
| `chain_lightning` | blocks9a: chain_lightning is a placeable shop block with levels, rarity, price and rule text | blocks9a: chain_lightning does what its inspector says (Free Fly / shared pipeline) + takes effect in the Wall | **Y** |
| `mine` | blocks9a: mine is a placeable shop block with levels, rarity, price and rule text | blocks9a: mine does what its inspector says (Free Fly / shared pipeline) + takes effect in the Wall | **Y** |
| `gravity_well` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `magnetized` | - | - | N: No ship stat or projectile behaviour consumes this effect yet, so it would change nothing in Fly. |
| `curving_right` | hiddenBlocks: curving_right: compile | hiddenBlocks: curving_right: fly (heading turns 45 deg in 0.5 s, baseline straight) | **Y** |
| `random_curve` | hiddenBlocks: random_curve: compile + levels (blocks9a: every shown block has at least 3 levels) | hiddenBlocks: random_curve: fly (seeded, deterministic, max 120 deg/s) | **Y** |
| `homing` | hiddenBlocks: homing: compile | hiddenBlocks: homing: fly (hits an enemy 20 deg off-axis, baseline misses) | **Y** |
| `aoe_rect` | hiddenBlocks: aoe_rect: compile | hiddenBlocks: aoe_rect: fly (hits neighbours inside the bar only) | **Y** |
| `fork_impact` | hiddenBlocks: fork_impact: compile | hiddenBlocks: fork_impact: fly (2 copies at 50% / 0.6x, +/-35 deg, no second fork) | **Y** |
| `armor_piercer` | hiddenBlocks: armor_piercer: compile | hiddenBlocks: armor_piercer: fly (x2 vs armored, unchanged vs unarmored) | **Y** |
| `ignite` | blocks9a: ignite is a placeable shop block with levels, rarity, price and rule text | blocks9a: ignite does what its inspector says (Free Fly / shared pipeline) + takes effect in the Wall | **Y** |
| `frostbite` | blocks9a: frostbite is a placeable shop block with levels, rarity, price and rule text | blocks9a: frostbite does what its inspector says (Free Fly / shared pipeline) + takes effect in the Wall | **Y** |
| `corrosion` | blocks9a: corrosion is a placeable shop block with levels, rarity, price and rule text | blocks9a: corrosion does what its inspector says (Free Fly / shared pipeline) + takes effect in the Wall | **Y** |
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

32 of 62 blocks are shown in the picker; the rest stay in the data and are hidden.

### Hidden blocks: implementation status

| id | category | compiler | combat | status |
|---|---|---|---|---|
| `generator` | pathing | yes | yes | FULL |
| `ejector` | pathing | yes | yes | FULL |
| `straight` | pathing | no | no | data-only stub |
| `crossover` | pathing | yes | no | compiler-only stub |
| `diode` | pathing | no | no | data-only stub |
| `random_router` | pathing | yes | no | compiler-only stub |
| `merger` | pathing | no | no | data-only stub |
| `portal_pair` | pathing | no | no | data-only stub |
| `reflector` | pathing | no | no | data-only stub |
| `armored_plating` | pathing | no | no | data-only stub |
| `berserker_coil` | damage | yes | no | compiler-only stub |
| `tithe` | damage | yes | no | compiler-only stub |
| `fission_catalyst` | damage | yes | no | compiler-only stub |
| `cauterize` | damage | yes | no | compiler-only stub |
| `cleaver` | damage | yes | no | compiler-only stub |
| `culling_bolt` | damage | yes | no | compiler-only stub |
| `residue_seed` | damage | yes | no | compiler-only stub |
| `overkill_spill` | damage | yes | no | compiler-only stub |
| `gravity_well` | modifier | yes | no | compiler-only stub |
| `magnetized` | modifier | yes | no | compiler-only stub |
| `static_charge` | status | yes | no | compiler-only stub |
| `magnetize_target` | status | yes | no | compiler-only stub |
| `vampiric` | status | yes | no | compiler-only stub |
| `shield_emitter` | passive | no | no | data-only stub |
| `magnet_core` | passive | no | no | data-only stub |
| `thruster` | passive | no | no | data-only stub |
| `targeting_lens` | passive | no | no | data-only stub |
| `capacitor_bank` | passive | no | no | data-only stub |
| `lucky_charm` | passive | no | no | data-only stub |
| `sensor_array` | passive | no | no | data-only stub |

30 hidden blocks, 2 fully implemented.

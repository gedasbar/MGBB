# Chunk 29a: UI consistency pass (report)

UI only. Tokens: `UI` in `src/ui/theme.ts`; helpers: `src/ui/widgets.ts`. DECISIONS 494-501. Sheet: `reports/chunk29a/sheet_29a.png` (360 x 740, `node e2e/sheet-chunk29a.cjs`).

## Text removed or shortened
| Where | Was | Now |
|---|---|---|
| Customization, PROJECTILE SKIN | "Auto: the look follows the shot's damage. Best shot so far: 0." | nothing |
| Customization, SHOT TRAIL | "Colour of the fading trail. Length: Settings > Graphics > Trails (now short)." | nothing |
| Customization, locked tiles | "LOCKED  Land a hit of 1K" (and the like) | "LOCKED" |
| Customization, unlocked tile status | "Unlocked" | nothing (a selected tile says SELECTED) |
| Captain tab | "Tap a captain to see its upgrades. All of them can be previewed." | nothing |
| Builder strip, nothing selected | "Circuit builder / Tap a cell to inspect it; tap it again to build. The red line runs from the generator to an ejector." | the hull name only |
| Builder strip, empty cell | "Buildable. The red line passes straight through. Tap it again to build here." | title "Empty cell" only |
| Builder strip, Remove (strip and sheet) | "Clears this cell and returns the block to your inventory." | title only |
| Challenges view | "Each challenge is a campaign tier with a rule. It opens when you pass the tier; the reward is paid once." | nothing |
| Achievements / Challenges, empty list | "Everything is done. Turn on "Show completed" to see them." | "All done" |
| Challenges, locked card | "Locked: pass tier N first" | "Locked · tier N" |
| Achievements switch row | wide button "Show completed: On / Off" | square tick box with a one-word "Done" caption |
| Settings | the keyboard list (about 13 lines) | removed; in the Build help, only on devices with a keyboard |
| Settings, toggles | "Backgrounds: ON", "Damage numbers: ON", "Stats overlay: ON", "Sound: ON / MUTED" | label + tick box |
| Settings, reset confirm | "This erases ALL progress: credits, blocks, hulls, medals and your saved circuit. It cannot be undone." | "Erases ALL progress on this device. It cannot be undone." |
| Settings, last-chance confirm | "Last chance. Everything on this device is erased and the game restarts. Export the save first if unsure." | "Last chance. Everything is erased." |
| Map, locked "What happens after 100?" | "Clear every tier from 1 to 100 (destroy all their blocks) to find out." | nothing ("N / 100 cleared" stays) |
| Frontier, Unlocks overlay | "Go far in a direction to unlock its legendary blocks (bought with Medals and credits). Ordinary blocks unlock in the campaign. Tap to close." | "Tap to close." |
| Export save dialog | "This one line is your whole save. Copy it, save it as a file or share it, then use Import save on the other device. (The home-screen app keeps its own save, apart from Safari.)" | nothing |
| Import save dialog | "Paste the save string from the other device, or load it from a file. This replaces the save on THIS device." | nothing |
| Import save dialog | "Tap Paste, or long-press the box and choose Paste." | nothing (the fallback line shows only when the clipboard cannot be read) |

Not touched: per-block player lines (`blockText.ts`), achievement and challenge descriptions and rewards (they are content), the Build help text (where the guidance now lives), the Shop / Skills sheets.

## Contact sheet (what is really in it)
360 x 740 phone screenshots. Builder: the strip under the top bar shows only "Shuttle". Hub: the active tab (SHIPS / CUSTOMIZATION / ACHIEVEMENTS) is a full light cell with dark text, the others dark with dim text, the panel body is darker than the tiles (hull rows, skin tiles, achievement cards). Customization: PROJECTILE SKIN and SHOT TRAIL headers with tiles straight under them, locked tiles say only LOCKED. Achievements: the segmented switch (active half light) with a square box at its right, empty and then ticked with a check mark, a "Done" caption under it and "Medals 12" on the left. Settings: two shots (top, then scrolled to the end), no key list, boxes with ticks for Backgrounds, Damage numbers, Stats overlay (empty) and Sound. Bottom bar: Build, Shop, Captain, Skills, Map, each time the whole selected cell is light with an inverted icon and label.

## Not verified
- Shop, Skills, Map, Frontier, Captain, the hull info sheet and the run summary were not re-skinned onto the new tokens and were not looked at after this chunk (only their bottom bar was, on the sheet).
- The Export / Import dialogs (HTML) were restyled and had hints removed but were not screenshotted; `e2e/save-transfer.e2e.cjs` was not run.
- `hasKeyboard()` on a real touch phone was not tested; only the Node case is unit-tested, and desktop Chromium was seen to show the key list in the help (not screenshotted).
- Only `e2e/hub-settings.e2e.cjs` was run (36 pass), plus typecheck and all unit tests (1,110 pass). `e2e/achievements.e2e.cjs` presses "showCompleted" by id (unchanged) but was not run.
- Nothing was checked on a physical device.

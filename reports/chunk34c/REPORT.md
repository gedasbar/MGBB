# Chunk 34c report: icon consistency, HUD alignment, Stats

## Places changed to the shared amount widget (`amountLabel` / `costLabel` / `buttonLabel`)
- Run HUDs: wall credits (`WallScreen`), Free Fly / Frontier credits and Cores (`FlyScreen`).
- Build / Shop credits badge (`ui/hud.ts` `CreditsBadge`).
- Run summary: big credits, Total credits, Cores, Medals (`RunSummaryScreen`).
- Buy / Upgrade buttons: Shop and builder sheet (`tilePalette`, incl. legendary credits + Medals), hull picker Buy, its Cores line and price tags, Shipyard chunk Buy (Cores) and Cores balance.
- Medals: Map carousel, Map, Frontier and Captain headers; Captain Unlock / Upgrade / Buy buttons, option price tags, "Locked -" lines; Skills respec dialog (cost, you have) and the medal node colour; Achievements panel (Medals line, reward lines); Free Fly home Cores row.
- Left as text: toasts, Free Fly banner and boss banner lines, the achievement summary panel line, the settings reward line.

## Stats
Hub > Achievements > Stats. Save version 18 (`stats`), migration tested. See DECISIONS 635-638.

## Checks
- `npx tsc --noEmit` clean; `npx vitest run`: 1360 existing + 15 new pass (after updating the hard-coded save version and `costs` expectations).
- E2E areas hud, economy, hub, shop (16 scripts, 7 min 0 s): 14 ok, 2 FLAKY (block-economy: heavy-build p95 frame time 50.0 ms vs < 50; motion-blocks: a Scatter angle count), both passed on the runner's retry; neither is in changed code.
- Contact sheet `reports/chunk34c/sheet_34c.png` (opened). It shows: Free Fly HUD x3 (coin + 0, hexagon + 0, numbers on the icons' centre line), the Free Fly run summary, the wall HUD x3 ("+1.23K" beside the coin), the Shop sheet with Buy +1 / Upgrade each carrying a coin, Frontier Echo with "coin 8K + medal 15" on one Buy button, the Stats page (top and scrolled: Time and runs, Destroyed, Damage, Progress, Earned in all with icons, "since 7 Nov 2026" line) and the Achievements view with the three-way switch and "Medals icon 52".
- Pixel measurement (same script): icon rows and number rows are identical (difference 0 px) for Free Fly credits, Free Fly Cores and wall credits.

## Not verified
- The "before" misalignment was not measured in pixels (reasoned from the old code: wall icon about 2.7 px high).
- The Free Fly HUD and summary in the sheet show 0 credits (my seeding of the world's credits did not take); only the wall HUD shows a wide number ("+1.23K").
- Hull picker Buy, Shipyard Buy, Captain buttons, the Skills respec dialog and the Map / Frontier / Captain headers were NOT pictured; they compile and the e2e areas pass, nothing more.
- Cores-only prices were checked by unit tests of the `costs` data only.
- Medals from cheats count as earned (any rise of the balance).
- Blocks / rocks / per-boss kills start at 0 for old saves by design. Real play on a phone not tried.
- Dev server on port 5199 was stopped. No full e2e suite (small chunk, areas only).

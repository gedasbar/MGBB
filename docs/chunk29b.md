# Chunk 29b: Map carousel and navigation (report)

DECISIONS 502-511. Sheet: `reports/chunk29b/sheet_29b.png` (360 x 740, `node e2e/sheet-chunk29b.cjs`). Tests: `tests/mapCarousel.test.ts`, `e2e/map-nav.e2e.cjs`.

## Navigation now
- Bottom tabs: Build, Shop, Captain, Skills, **Map**. The Map tab opens the remembered mode screen, or the carousel.
- Carousel (CAMPAIGN, FRONTIER, FREE FLY): swipe / drag / arrows / Left-Right keys; the centre card opens its mode. A locked Frontier card only explains.
- Mode screens: Campaign (tier list), Frontier (grid map), Free Fly (records, Medal waves, START). "<" in the header returns to the carousel, centred on that mode.
- Runs: Free Fly START, a tier's START and a Frontier square's PLAY start as before. A run summary's Map button goes back to the mode screen it came from.
- Builder: no FLY / CAMPAIGN. A started challenge shows its bar at the bottom with START and X.

## Code map
`src/map/` (`constants`, `carousel`, `memory`, `modes`, `nav`, `tabs`), `src/screens/MapCarouselScreen.ts`, `src/screens/FreeFlyHomeScreen.ts`, `src/ui/modeArt.ts`, `src/challenges/start.ts`.

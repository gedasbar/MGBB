# Mitosis Gun Builder (working title)

A mobile-first browser game. You design a gun as a circuit inside a hull grid (blocks change the projectile as it travels from the generator to the ejectors), then fly the ship and shoot. Rocks crack and split into smaller rocks (Free Fly), campaign walls approach and you carve a lane through them (tiers 1-100), and the Frontier is an endless map of squares.

## Run it

```
npm install
npm run dev          # game on http://localhost:5173
npm test             # unit tests
npm run typecheck    # TypeScript check
npm run test:e2e     # quick browser smoke set (needs the dev server running)
npm run test:e2e:all # every browser script
```

## Where things are

- `CLAUDE.md`: how the code is organised and the working rules (read this first).
- `docs/PLAN.md`: the living plan, design pillars and open problems.
- `docs/EDITING.md`: how to edit hull layouts, prices and block caps by hand.
- `DECISIONS.md`: numbered record of non-obvious implementation decisions.
- `docs/`: design notes and balance audits. `docs/archive/`: the original master prompt (out of date) and early reports.
- `reports/`: one folder per chunk with its report.

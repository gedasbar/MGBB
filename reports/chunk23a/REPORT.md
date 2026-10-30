# Chunk 23a: ready for the phone (deploy)

No gameplay change. Decisions 396-402 in DECISIONS.md, the how-to in `docs/DEPLOY.md`.

## What was done
1. **Build.** `npm run build` = `tsc --noEmit -p tsconfig.build.json && vite build`; the build config checks only `src` (no vitest globals). `engines >= 20`, `.nvmrc` 20. A fresh clone with `npm ci` then `npm run build` passes (Node 24) and gives `dist/index.html` plus the manifest and three icons.
2. **Version label** `v<hash> · <date>` (Vite `define`; Cloudflare's commit variable first, then git) in Settings and the stats overlay (no dev server needed any more).
3. **Debug in production:** `ALLOW_DEBUG_IN_PROD = true` in `src/debug/enabled.ts`; with `?debug=1` the panel, cheats and hooks work in the built game, without it none exist (checked in the browser).
4. **Home screen:** manifest, 192 / 512 icons and apple-touch-icon made by `npm run make-icons`, iOS web-app meta tags. No service worker.
5. **Touch:** no overscroll, no pull-to-refresh, no double-tap zoom, no selection or long-press menu (CSS). Pause on blur and on hidden already existed; both pause the run in the production build.
6. **Export / Import save** in Settings (string `MGBM1:...`, copy button and a box to copy by hand; import validates, shows what is inside, asks a second tap, then loads and restarts).
7. `docs/DEPLOY.md` for the Cloudflare settings, previews, `?debug=1`, and moving a save.

## Checks run
- `npx tsc --noEmit`: clean. `npm test`: 49 files, 905 tests pass (8 new in `tests/saveTransfer.test.ts`: round trip, line breaks from copy-paste, 17 garbage strings, newer version, v7 migration, storage writes, debug switch, label).
- Mutation checks (broken, saw the test fail, restored): newer-version check removed (1 test failed); `sanitizeProgress` skipped on import (round trip and migration tests failed); debug switch always on (debug test failed).
- New `e2e/production-build.e2e.cjs`: 25 checks pass (builds, serves with `vite preview`, 360 x 740 touch context, run starts, no debug without `?debug=1`, manifest and icons served, pause on hidden and blur, Settings label and buttons, export, bad string changes nothing, good string moves the save to a fresh browser).
- Smoke set of the older e2e (`browser basics cheats pause shop hulls`) on a fresh dev server: 6 of 6 pass. The whole suite was NOT run (no gameplay, save-shape or economy change).

## Screenshots (opened and looked at)
- `settings-360x740.png`: Settings panel on a 360 x 740 screen: volume rows, sound toggles, **Export save** and **Import save** side by side, Reset save, Back, and under them the grey line `v0647585 · 2026-10-30`. The stats plate top-left also shows `build v0647585 · 2026-10-30`.
- `import-confirm-360x740.png`: the Import box with a pasted string and the yellow text "This save has 777 credits, 6 runs, tier 0 passed, 1 hulls. Loading it erases the save on this device. Tap again to confirm." and the buttons "Yes, replace my save" / "Cancel".
- `export-360x740.png`, `run-360x740.png`: the export box and a run on the phone-size screen (taken by the script; the run one was not studied closely).

## Not verified
- **Real phones.** Nothing was tried on an iPhone or Android: touch feel, pull-to-refresh, double-tap zoom, long-press menu, the home-screen install, the icon look under a phone's mask, safe-area insets, the Copy button's clipboard permission, pasting into the Import box, and pause when switching apps (only simulated by firing the events).
- **Node 20.** Only Node 24 is installed here; the build was not run on Node 20 (the toolchain, Vite 5 and TypeScript 5.5, supports it).
- **Cloudflare itself.** No deploy was done; the settings in `docs/DEPLOY.md` are from the brief. The Pages commit variable (`CF_PAGES_COMMIT_SHA`) is used from memory of Cloudflare's docs, with git as the fallback.
- The full e2e suite, performance of the production build on a phone, and an import of a save from a much older game version in a browser (only unit-tested).
- Ports: the dev server on 5193 and the preview servers on 5191 / 5192 were stopped.

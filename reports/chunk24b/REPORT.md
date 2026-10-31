# Small fix 24b: save import / export in the home-screen app

Branch `chunk-24b` from `origin/main` (after 24a was merged). Scope: typecheck, unit tests, one e2e (`e2e/save-transfer.e2e.cjs`); no gameplay or save-shape change, so no full suite.

## Findings (DECISIONS 416-418)
Import always read a plain textarea; there is no clipboard read, no `prompt`. The problem is getting text into the box. `index.html` sets `-webkit-touch-callout: none` and `user-select: none` on `html, body`; `-webkit-touch-callout` is inherited, so the textarea had no long-press Paste bubble, and a home-screen app has no Safari paste bar to fall back on. The box also used a 12 px font (iOS focus zoom that the game cannot undo) and the game's window pointer listeners heard touches on the dialog. This is read from the code and the iOS rules, not reproduced on a phone.

## What changed
- The dialog, panel and fields set `-webkit-touch-callout: default`, `user-select: text`, `touch-action: auto` themselves; the field is 16 px; pointer events stop at the dialog.
- Import: **Paste** (clipboard read where allowed, else a hint to long-press the box), **Load file** (.txt / .json; tolerates a BOM, a header line, wrapped lines, trailing text; a plain JSON envelope works), then the unchanged Check, confirm and migration.
- Export: **Copy**, **Save as file** (`mgbm-save-<date>.txt`), **Share** (only where `navigator.share` exists).
- `docs/DEPLOY.md`: the home-screen app has its own save; how to move one in.

## Tests
- Unit: `tests/saveTransfer.test.ts` +6 (file text variants, JSON envelope, bad files, file name, the dialog's CSS strings). 941 pass. Mutation checks: reading the string only from the start of the file (header test fails) and dropping the JSON envelope branch (JSON test fails).
- e2e `save-transfer.e2e.cjs` (390 x 844 touch): 13 checks pass: export string, Save as file download equals the string, field selectable while the page is not, 16 px and `touch-action: auto`, typed text accepted, bad text refused, Paste from the clipboard, Paste falling back to the hint, Load file with a messy fixture asks to confirm, nothing written before confirming, the save lands in a fresh browser after the restart, a cut-short file refused.
- Screenshots opened: `import-390x844.png` shows the IMPORT SAVE panel over the builder: explanatory text, a multi-line monospace box filled with `MGBM1:...` (first lines visible, the rest scrolls), the yellow clipboard-fallback hint, the yellow "This save has 4321 credits, 9 runs, tier 3 passed, 1 hulls ... Tap again to confirm" message, buttons Paste / Load file and "Yes, replace my save" / Cancel. `export-390x844.png` shows EXPORT SAVE with the string, "Saved as mgbm-save-2026-10-31.txt (look in Downloads or Files)." and Copy / Save as file / Close (no Share button: headless Chromium has no `navigator.share`).

## Not verified
- **Standalone iPhone behaviour needs the owner**: that the long-press Paste bubble now appears in the home-screen app, that Load file opens the iOS Files picker, that Save as file / Share work there. The diagnosis is from the code, not from a device.
- `-webkit-touch-callout` is iOS-only: Chromium reports nothing, so the e2e cannot see it; the dialog's CSS strings are checked in a unit test instead.
- The Share button was not exercised (not present in the headless browser).
- Stale yellow hint: after a failed Paste the hint stays yellow until the dialog is reopened.

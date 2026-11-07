# Chunk 35b: Sound tuner (report)

## What was built
- `src/audio/sfxr.ts`: sfxr-style generator. A sound = 21 numbers + a wave (square / saw / sine / noise). Deterministic (seeded noise). Presets (Pickup, Laser, Explosion, Power-up, Hit, Blip, Jump), `randomize`, `mutate`.
- `src/audio/sfxrBank.ts`: slot -> numbers; export / import JSON; localStorage draft `mgbm_sfxr_draft` (debug pages only); the shipped file is `src/audio/sfxrSounds.json` (empty now).
- `SfxEngine` plays a slot with an entry from rendered samples (rate limit, voice cap, priority, volume, mute, per-sound multiplier unchanged); `preview()` for the tuner.
- Debug panel "Sound tuner" (`src/debug/sfxrTuner.ts`, logic in `sfxrTunerModel.ts`): 28 slots, presets, Randomize, Mutate, Play, Undo, Use in game, Original, 21 sliders + wave, Export all / Import / Clear all.
- New slots: `hurt`, `aoe` (new hand-made default sounds, played in the fly screens), `passed`, `bossArrive`, `bossDeath` (copies of `cleared`, `wave`, `medal`).

## How to put designed sounds in the repo
1. Open the game with `?debug=1`, open "Sound tuner", design and press "Use in game" per slot.
2. "Export all", copy the text, replace the whole of `src/audio/sfxrSounds.json`, commit.
3. "Clear all" in the tuner afterwards (a local draft overrides the file in that browser).

## Checks
- `npx tsc --noEmit` and the build tsconfig: clean. `npx vitest run`: 70 files / 1413 tests pass (new: `tests/sfxr.test.ts`, 9 tests).
- Mutation checks: seeded noise replaced with `Math.random` -> the determinism test fails; engine ignoring the bank -> the designed-slot engine test fails. Both restored.
- New e2e `e2e/sound-tuner.e2e.cjs` (16 checks): slots, presets, sliders, Randomize, Undo, Use in game, localStorage, Export, Clear, Import round trip.

## Not verified
- Nobody listened to anything: the synth's output, the presets and the loudness against the hand-made sounds (`SFXR_LEVEL` 0.3 is a guess) are unheard. Headless Chromium has no sound.
- The generator follows sfxr's algorithm from memory; it is not compared sample by sample with the original tool, so a preset may sound a little different from the real sfxr.
- The new default sounds for `hurt` and `aoe` and their loudness / frequency in a real run.
- Phone Safari (AudioBuffer sources, CPU cost of rendering a sound the first time it plays: up to 4 s of samples is generated on the first play of a slot, then cached).
- Clipboard copy (blocked in headless; the text box always has the JSON).

## E2E run
Areas audio, debug, freefly, wall (29 scripts, slow machine): 4 failed in the first pass. `freefly-waves`, `legendaries` and `core-pickups` passed on rerun (flaky under load, not chased). `campaign` had a stale check from 35a (the carousel has 4 cards, the script wanted 3); fixed, passes.

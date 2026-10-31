# Putting the game on your phone (Cloudflare Pages)

The game is one web page. Cloudflare Pages hosts it for free and gives you a link you can open on your phone.

## Settings in Cloudflare Pages

Create a Pages project from the GitHub repository, then use exactly these:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variable | `NODE_VERSION` = `20` |

(The repository also has a `.nvmrc` file saying 20, which Cloudflare reads as well.)

## What happens when

- **Every merge to `main`** builds and publishes the game again at the main link (`https://<project>.pages.dev`). Wait about a minute.
- **Every pull request** gets its own preview link (Cloudflare writes it in a comment on the PR). Use it to try a chunk on your phone BEFORE you merge. The main link does not change until you merge.
- The version is written in **Settings** (the gear): `v<code> · <date>`. If it does not match the newest merge, the page is cached: close the tab and open it again.

## Add it to your home screen

- **iPhone (Safari):** Share button, then "Add to Home Screen".
- **Android (Chrome):** menu (three dots), then "Install app" or "Add to Home screen".

It then opens full screen with its own icon. It needs a connection to start (there is no offline mode yet).

## Frame rate (60 or 120 fps)

The game does not cap itself: it draws on every frame the browser offers and the simulation uses the time that really passed (`src/game/timestep.ts`), so a 120 Hz screen gets 120 pictures a second at the same game speed. The stats overlay (backtick key, or `?stats=1`) shows the measured screen rate as `display 120 Hz`.

**iPhone Safari limits web pages to 60 fps** unless the Safari feature flag **"Prefer Page Rendering Updates near 60fps"** is turned off (iOS Settings, Safari, Advanced, Feature Flags). This is a browser setting, not the game: with the flag on, the stats overlay will show `display 60 Hz` even on a 120 Hz iPhone.

## Debug tools on the test link

Add `?debug=1` to the end of the link (for example `https://<project>.pages.dev/?debug=1`) to get the debug panel with the cheats. Without it nothing debug shows. This is allowed by one switch, `ALLOW_DEBUG_IN_PROD` in `src/debug/enabled.ts`; set it to `false` before a public release.

## Your save lives in ONE browser

The save is kept inside the browser on the device you play on. A different phone, a different browser, a private tab, or a preview link of a pull request (it is a different address) each start with an empty save. Clearing the browser's site data erases it.

To move a save:

1. On the device that has it: Settings, **Export save**. Tap **Copy** (or select the text in the box and copy it by hand).
2. Send that text to yourself (a note, a message).
3. On the other device: Settings, **Import save**, paste, tap **Check**. It tells you what is inside, or why it cannot be used (a bad text changes nothing). Tap again to confirm: it replaces the save on that device and restarts the game.

Export before anything risky; the text is also a backup.

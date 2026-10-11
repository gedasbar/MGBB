// Contact-sheet helper for the e2e scripts: runs a function in the game page that draws a Pixi container with the game's
// own modules (dynamic import of /src/... through the Vite dev server) and returns it as a PNG file.
const fs = require('fs');
const path = require('path');

/**
 * `src` is the source of `async ({ PIXI, app, load }) => ({ container, width, height, bg })`; `load(path)` imports a game
 * module such as '/src/ui/shipArt.ts'. The container is drawn on a `bg` coloured rectangle and saved to `file`.
 */
async function renderSheet(page, src, file) {
  await page.waitForFunction(() => !!window.__pixi && !!window.__app);
  const b64 = await page.evaluate(async (src) => {
    const fn = eval(src);
    const PIXI = window.__pixi;
    const app = window.__app;
    const { container, width, height, bg } = await fn({ PIXI, app, load: (p) => import(/* @vite-ignore */ p) });
    const root = new PIXI.Container();
    root.addChild(new PIXI.Graphics().rect(0, 0, width, height).fill(bg ?? 0x111111));
    root.addChild(container);
    const url = await app.renderer.extract.base64({ target: root, frame: new PIXI.Rectangle(0, 0, width, height), resolution: 1 });
    return url.split(',')[1];
  }, src);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
}

module.exports = { renderSheet };

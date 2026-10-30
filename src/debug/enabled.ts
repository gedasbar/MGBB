/**
 * The one switch for debug tools in a production build (chunk 23a). The game is hosted as a private test link, so with
 * this on, `?debug=1` opens the debug panel, the cheats and the dev hooks in the built game too. Without `?debug=1`
 * nothing debug shows. Set to false to strip all of it from a public release. A dev server (`npm run dev`) always has the hooks.
 */
export const ALLOW_DEBUG_IN_PROD = true;

/** True when the page address carries `debug=1`. */
export function debugQuery(search: string | undefined = typeof window !== 'undefined' ? window.location.search : ''): boolean {
  return /[?&]debug=1(&|$)/.test(search ?? '');
}

/** Whether the dev hooks, the debug panel and the cheats are on for this page: always on a dev server, else only with ?debug=1 and ALLOW_DEBUG_IN_PROD. */
export function debugOn(dev: boolean = !!import.meta.env.DEV, search?: string, allow: boolean = ALLOW_DEBUG_IN_PROD): boolean {
  return dev || (allow && debugQuery(search));
}

/** Evaluated once per page load (the address does not change while the game runs). */
export const DEBUG_ON: boolean = debugOn();

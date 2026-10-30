declare const __BUILD_HASH__: string;
declare const __BUILD_DATE__: string;

/** Injected by Vite at build time (vite.config.ts `define`): short git hash and UTC build date. Scripts and tests without Vite get "dev". */
export const BUILD_HASH: string = typeof __BUILD_HASH__ === 'string' ? __BUILD_HASH__ : 'dev';
export const BUILD_DATE: string = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : '';

/** "v<hash> · <date>", shown in the Settings panel and the stats overlay. */
export const VERSION_LABEL = BUILD_DATE ? `v${BUILD_HASH} · ${BUILD_DATE}` : `v${BUILD_HASH}`;

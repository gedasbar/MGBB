import { PROGRESS_VERSION, sanitizeProgress, serializeProgress, Progress } from './progress';

/**
 * Moving a save between devices (chunk 23a). The save is exported as ONE text string: "MGBM1:" and then the base64 of a
 * small JSON envelope holding the progress and the saved circuits. Import checks the string completely before anything is
 * written, so a bad string changes nothing and says why. Progress goes through `sanitizeProgress`, so a save from an older
 * game version is migrated on the way in (refunds, new fields) exactly as it would be on load.
 */
export const EXPORT_PREFIX = 'MGBM1:';
/** Envelope format; bump when the envelope itself changes (the progress and builder versions have their own). */
export const EXPORT_FORMAT = 1;

interface Envelope {
  app: 'mgbm';
  format: number;
  progress: unknown;
  /** The builder save as stored (a JSON string) or null when the device had none yet. */
  builder: string | null;
}

export type ImportCheck =
  | { ok: true; progress: Progress; builder: string | null; summary: string }
  | { ok: false; error: string };

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** The whole save as one string. `builderRaw` is the stored builder JSON (null = none). */
export function exportSaveString(progress: Progress, builderRaw: string | null): string {
  const env: Envelope = { app: 'mgbm', format: EXPORT_FORMAT, progress: JSON.parse(serializeProgress(progress)), builder: builderRaw };
  return EXPORT_PREFIX + toBase64(JSON.stringify(env));
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Checks a pasted string and returns the save it holds (migrated), or a plain-words reason it cannot be used. Writes nothing. */
export function checkImportString(input: string): ImportCheck {
  const text = (input ?? '').replace(/\s+/g, '');
  if (!text) return { ok: false, error: 'Nothing was pasted.' };
  if (!text.startsWith(EXPORT_PREFIX)) return { ok: false, error: 'This is not a save string from this game (it should start with MGBM1:).' };
  let env: unknown;
  try {
    env = JSON.parse(fromBase64(text.slice(EXPORT_PREFIX.length)));
  } catch {
    return { ok: false, error: 'The string is damaged or cut short. Copy the whole text again.' };
  }
  if (!isObj(env) || env.app !== 'mgbm') return { ok: false, error: 'This is not a save from this game.' };
  if (env.format !== EXPORT_FORMAT) return { ok: false, error: 'This save was made by a different version of the transfer tool.' };
  const p = env.progress;
  if (!isObj(p)) return { ok: false, error: 'The save has no progress in it.' };
  if (typeof p.version !== 'number' || !Number.isInteger(p.version) || p.version < 1) return { ok: false, error: 'The save has no valid version number.' };
  if (p.version > PROGRESS_VERSION) return { ok: false, error: `This save is from a newer game (save version ${p.version}; this game reads up to ${PROGRESS_VERSION}). Open the newest build of the game first.` };
  if (typeof p.credits !== 'number' || !isFinite(p.credits) || p.credits < 0) return { ok: false, error: 'The save is missing its credits, so it looks damaged.' };
  if (!isObj(p.owned)) return { ok: false, error: 'The save is missing its block list, so it looks damaged.' };
  const progress = sanitizeProgress(p);
  let builder: string | null = null;
  if (env.builder !== null && env.builder !== undefined) {
    if (typeof env.builder !== 'string') return { ok: false, error: 'The saved circuits are damaged.' };
    try {
      const b = JSON.parse(env.builder);
      if (!isObj(b) || (b.version !== 2 && b.version !== 3) || !isObj(b.hulls)) throw new Error('shape');
      builder = env.builder; // stored as it came: the builder's own loader sanitises it (and counts removed blocks) on the next start
    } catch {
      return { ok: false, error: 'The saved circuits are damaged.' };
    }
  }
  const tiers = progress.passedTiers.length ? progress.passedTiers[progress.passedTiers.length - 1] : 0;
  return { ok: true, progress, builder, summary: `${Math.floor(progress.credits)} credits, ${progress.runs} runs, tier ${tiers} passed, ${progress.ownedHulls.length} hulls` };
}

/**
 * Chunk 24b: the save string out of the text of a file the player picked (a .txt written by "Save as file", or any text that contains the string,
 * or the plain JSON envelope as a .json). Strips a byte-order mark and anything around the string. A text with no string in it is returned
 * trimmed, so `checkImportString` says what is wrong with it.
 */
export function saveStringFromFileText(fileText: string): string {
  const text = (fileText ?? '').replace(/^﻿/, '').trim(); // a byte-order mark, as some editors add
  const at = text.indexOf(EXPORT_PREFIX);
  if (at >= 0) {
    // The string is the prefix and the base64 after it (base64 has no spaces; line breaks added by an editor are allowed and dropped later).
    const m = /^[A-Za-z0-9+/=\s]*/.exec(text.slice(at + EXPORT_PREFIX.length));
    return EXPORT_PREFIX + (m ? m[0] : '').trim();
  }
  if (text.startsWith('{')) {
    try {
      const env = JSON.parse(text);
      if (isObj(env) && env.app === 'mgbm') return EXPORT_PREFIX + toBase64(JSON.stringify(env));
    } catch { /* not JSON: fall through */ }
  }
  return text;
}

/** The file name "Save as file" offers: mgbm-save-2026-11-02.txt (the date is the device's, in UTC). */
export function exportFileName(now: Date = new Date()): string {
  return `mgbm-save-${now.toISOString().slice(0, 10)}.txt`;
}

export interface WritableStorage { setItem(k: string, v: string): void; removeItem(k: string): void }

/** Writes a checked import into storage (the caller reloads the page afterwards, so no old in-memory state can overwrite it). */
export function writeImport(check: Extract<ImportCheck, { ok: true }>, storage: WritableStorage, progressKey: string, builderKey: string, legacyKey: string): void {
  storage.setItem(progressKey, serializeProgress(check.progress));
  if (check.builder !== null) storage.setItem(builderKey, check.builder);
  else storage.removeItem(builderKey);
  storage.removeItem(legacyKey);
}

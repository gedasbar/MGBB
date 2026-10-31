import { describe, it, expect } from 'vitest';
import { checkImportString, exportFileName, exportSaveString, EXPORT_PREFIX, saveStringFromFileText, writeImport } from '../src/econ/saveTransfer';
import { defaultProgress, loadProgress, PROGRESS_KEY, PROGRESS_VERSION, serializeProgress } from '../src/econ/progress';
import { LEGACY_KEY, STORAGE_KEY, defaultSave, serializeBuilder } from '../src/builder/persist';
import { VERSION_LABEL } from '../src/version';
import { debugOn, debugQuery } from '../src/debug/enabled';
import { AREA, BOX, OPEN_TEXT, PANEL } from '../src/ui/saveTransferUi';

// Chunk 23a: moving a save between devices, the version label and the debug switch.

const b64 = (o: unknown) => EXPORT_PREFIX + btoa(JSON.stringify(o));

function richSave() {
  const p = defaultProgress();
  p.credits = 12345;
  p.runs = 7;
  p.bestTier = 9;
  p.passedTiers = [1, 2, 3];
  p.clearedTiers = [1, 2];
  p.medals = 2;
  p.owned.flat_plus = 4;
  return p;
}

describe('save export / import', () => {
  it('round trips progress and circuits', () => {
    const p = richSave();
    const builder = serializeBuilder(defaultSave());
    const text = exportSaveString(p, builder);
    expect(text.startsWith(EXPORT_PREFIX)).toBe(true);
    const r = checkImportString(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.progress).toEqual(loadProgress(serializeProgress(p)));
    expect(r.progress.credits).toBe(12345);
    expect(r.progress.owned.flat_plus).toBe(4);
    expect(r.builder).toBe(builder);
  });

  it('survives line breaks and spaces added by copy and paste', () => {
    const text = exportSaveString(richSave(), null);
    const mangled = ' \n' + text.replace(/(.{40})/g, '$1\n') + '  ';
    const r = checkImportString(mangled);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.builder).toBeNull();
  });

  it('rejects garbage with a reason and no result', () => {
    const bad = [
      '', '   ', 'hello', '{"credits": 5}', EXPORT_PREFIX, EXPORT_PREFIX + '!!!notbase64', EXPORT_PREFIX + btoa('not json'),
      b64({ app: 'other', format: 1, progress: {} }),
      b64({ app: 'mgbm', format: 99, progress: {} }),
      b64({ app: 'mgbm', format: 1, progress: [] }),
      b64({ app: 'mgbm', format: 1, progress: { version: 11 } }),
      b64({ app: 'mgbm', format: 1, progress: { version: 'x', credits: 1, owned: {} } }),
      b64({ app: 'mgbm', format: 1, progress: { version: 11, credits: -5, owned: {} } }),
      b64({ app: 'mgbm', format: 1, progress: { version: 11, credits: 1, owned: 'no' } }),
      b64({ app: 'mgbm', format: 1, progress: { version: 11, credits: 1, owned: {} }, builder: 42 }),
      b64({ app: 'mgbm', format: 1, progress: { version: 11, credits: 1, owned: {} }, builder: '{"version":9}' }),
      b64({ app: 'mgbm', format: 1, progress: { version: 11, credits: 1, owned: {} }, builder: 'nope' }),
    ];
    for (const s of bad) {
      const r = checkImportString(s);
      expect(r.ok, JSON.stringify(s).slice(0, 60)).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
    }
  });

  it('refuses a save from a newer game', () => {
    const r = checkImportString(b64({ app: 'mgbm', format: 1, progress: { version: PROGRESS_VERSION + 1, credits: 1, owned: {} } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('newer');
  });

  it('migrates an older save version on the way in', () => {
    // A version 7 save: no skills, no best-credit tables; 6 copies of Percent x (cap 10) get refunded like on load.
    const old = { version: 7, credits: 100, owned: { percent_mult: 12 }, levels: {}, ownedHulls: ['dart'], medals: 0, clearedTiers: [1], passedTiers: [1] };
    const r = checkImportString(b64({ app: 'mgbm', format: 1, progress: old, builder: null }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.progress.version).toBe(12);
    expect(r.progress.skills).toEqual([]);
    expect(r.progress.wallBestCredits).toEqual({});
    expect(r.progress.owned.percent_mult).toBeLessThanOrEqual(10);
    expect(r.progress.credits).toBeGreaterThan(100);
  });

  it('writes both keys, and removes the circuit when the export had none', () => {
    const mem = new Map<string, string>([[STORAGE_KEY, 'old'], [LEGACY_KEY, 'older']]);
    const storage = { setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } };
    const r = checkImportString(exportSaveString(richSave(), serializeBuilder(defaultSave())));
    if (!r.ok) throw new Error(r.error);
    writeImport(r, storage, PROGRESS_KEY, STORAGE_KEY, LEGACY_KEY);
    expect(loadProgress(mem.get(PROGRESS_KEY) ?? null).credits).toBe(12345);
    expect(mem.get(STORAGE_KEY)).toBe(r.builder);
    expect(mem.has(LEGACY_KEY)).toBe(false);
    const r2 = checkImportString(exportSaveString(richSave(), null));
    if (!r2.ok) throw new Error(r2.error);
    writeImport(r2, storage, PROGRESS_KEY, STORAGE_KEY, LEGACY_KEY);
    expect(mem.has(STORAGE_KEY)).toBe(false);
  });
});

describe('debug switch and version label', () => {
  it('debug shows only with ?debug=1 in a production build, and only while the constant allows it', () => {
    expect(debugOn(false, '')).toBe(false);
    expect(debugOn(false, '?stats=1')).toBe(false);
    expect(debugOn(false, '?debug=0')).toBe(false);
    expect(debugOn(false, '?debug=1')).toBe(true);
    expect(debugOn(false, '?bg=off&debug=1')).toBe(true);
    expect(debugOn(false, '?debug=1', false)).toBe(false);
    expect(debugOn(true, '')).toBe(true);
    expect(debugQuery('?debug=10')).toBe(false);
  });

  it('the label reads v<hash> and a date', () => {
    expect(VERSION_LABEL).toMatch(/^v\S+( · \d{4}-\d{2}-\d{2})?$/);
  });
});

// Chunk 24b: a save read from a file (the home-screen app cannot always paste).
describe('reading a save from file text', () => {
  const str = () => exportSaveString(richSave(), serializeBuilder(defaultSave()));

  it('a file written by "Save as file" (the bare string, with or without a final newline) imports', () => {
    for (const text of [str(), str() + '\n', str() + '\r\n']) {
      const r = checkImportString(saveStringFromFileText(text));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.progress.credits).toBe(12345);
    }
  });

  it('a byte-order mark, a header line, line breaks inside the string and trailing words do not matter', () => {
    const s = str();
    const wrapped = s.replace(/(.{60})/g, '$1\n');
    const text = `﻿Mitosis Gun Builder save, 2026-11-02\r\n${wrapped}\r\n-- sent from my phone`;
    const r = checkImportString(saveStringFromFileText(text));
    expect(r.ok).toBe(true);
    expect(saveStringFromFileText(text).replace(/\s+/g, '')).toBe(s);
  });

  it('a .json file holding the plain envelope imports too', () => {
    const env = JSON.parse(atob(str().slice(EXPORT_PREFIX.length)));
    const r = checkImportString(saveStringFromFileText(JSON.stringify(env, null, 2)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.progress.runs).toBe(7);
  });

  it('files that are not saves give a plain reason, and a cut-short string is refused', () => {
    expect(checkImportString(saveStringFromFileText('')).ok).toBe(false);
    const other = checkImportString(saveStringFromFileText('{"hello":1}'));
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error).toMatch(/not a save string/);
    const cut = checkImportString(saveStringFromFileText(str().slice(0, 40)));
    expect(cut.ok).toBe(false);
    if (!cut.ok) expect(cut.error).toMatch(/damaged or cut short/);
    expect(checkImportString(saveStringFromFileText(JSON.stringify({ app: 'mgbm', format: 9, progress: {}, builder: null }))).ok).toBe(false);
  });

  it('the file name carries the date', () => {
    expect(exportFileName(new Date('2026-11-02T10:00:00Z'))).toBe('mgbm-save-2026-11-02.txt');
  });
});

describe('the dialog opts out of the play lock-down (24b)', () => {
  it('the box, the panel and the field allow the long-press callout, selection and touch, and the field is 16 px', () => {
    for (const css of [BOX, PANEL, AREA]) {
      expect(css).toContain('-webkit-touch-callout:default');
      expect(css).toContain('-webkit-user-select:text');
      expect(css).toContain('user-select:text');
      expect(css).toContain('touch-action:auto');
    }
    expect(OPEN_TEXT).not.toContain('none');
    expect(AREA).toMatch(/font:16px/);
  });
});

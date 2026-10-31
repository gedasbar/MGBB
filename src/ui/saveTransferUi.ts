import { playTimeGuard } from '../econ/playTime';
import { getProgressStore, PROGRESS_KEY } from '../econ/progress';
import { LEGACY_KEY, STORAGE_KEY } from '../builder/persist';
import { checkImportString, exportFileName, exportSaveString, saveStringFromFileText, writeImport } from '../econ/saveTransfer';

/**
 * The Export save / Import save dialog (chunk 23a, reworked in 24b): a plain DOM box over the game (a phone needs a real text field to
 * paste into). Export shows the whole save as one string in a box, with Copy, Save as file and (where the browser has it) Share.
 * Import takes a pasted string or a file, checks it, says what is in it and asks to confirm before it replaces this device's save.
 */

/**
 * The page is locked down for play (index.html: no text selection, no long-press callout, no touch gestures). This dialog is the one place that
 * must NOT be: the box, the panel and the fields say so themselves, because `-webkit-touch-callout` is inherited from body and iOS then hides the
 * long-press "Paste" bubble (chunk 24b, DECISIONS 417).
 */
export const OPEN_TEXT = '-webkit-touch-callout:default;-webkit-user-select:text;user-select:text;touch-action:auto;';
export const BOX = `position:fixed;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);font:16px system-ui,sans-serif;color:#e8e8ea;${OPEN_TEXT}`;
export const PANEL = `box-sizing:border-box;width:min(92vw,480px);max-height:92vh;overflow:auto;background:#2a2a2d;border:2px solid #55555a;padding:16px;display:flex;flex-direction:column;gap:10px;${OPEN_TEXT}`;
// 16 px: iOS zooms the page when a field with a smaller font gets focus, and the game cannot zoom back.
export const AREA = `box-sizing:border-box;width:100%;height:150px;resize:none;background:#1c1c1e;color:#e8e8ea;border:1px solid #55555a;font:16px monospace;padding:6px;${OPEN_TEXT}`;
const BTN = 'flex:1;min-height:48px;font:bold 16px system-ui,sans-serif;background:#3a3a3f;color:#e8e8ea;border:1.5px solid #8a8a90;cursor:pointer;-webkit-user-select:none;user-select:none;touch-action:manipulation;';
const HINT = 'font-size:14px;color:#b0b0b6;';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

function open(title: string, build: (panel: HTMLElement, close: () => void) => void) {
  document.getElementById('save-transfer')?.remove();
  const box = el('div', BOX);
  box.id = 'save-transfer';
  const panel = el('div', PANEL);
  const close = () => box.remove();
  panel.appendChild(el('div', 'font:bold 22px system-ui,sans-serif;', title));
  build(panel, close);
  box.appendChild(panel);
  // The game's own key handlers (builder shortcuts, the stats key) must not hear typing in the box.
  box.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') close(); });
  box.addEventListener('keyup', e => e.stopPropagation());
  // The game listens for pointers on the window; touches on this dialog are not the game's.
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) box.addEventListener(t, e => e.stopPropagation());
  document.body.appendChild(box);
}

function row(panel: HTMLElement): HTMLElement {
  const r = el('div', 'display:flex;gap:10px;');
  panel.appendChild(r);
  return r;
}

export function openExportSave() {
  open('EXPORT SAVE', (panel, close) => {
    const text = exportSaveString(getProgressStore().data, safeStorage()?.getItem(STORAGE_KEY) ?? null);
    panel.appendChild(el('div', HINT, 'This one line is your whole save. Copy it, save it as a file or share it, then use Import save on the other device. (The home-screen app keeps its own save, apart from Safari.)'));
    const area = el('textarea', AREA);
    area.id = 'export-text';
    area.readOnly = true;
    area.value = text;
    area.addEventListener('focus', () => area.select());
    panel.appendChild(area);
    const msg = el('div', 'font-size:14px;color:#f2c230;min-height:18px;overflow-wrap:anywhere;');
    msg.id = 'export-msg';
    panel.appendChild(msg);
    const r = row(panel);
    const r2 = row(panel);
    const copy = el('button', BTN, 'Copy');
    copy.id = 'export-copy';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text);
        msg.textContent = 'Copied.';
      } catch {
        area.focus();
        area.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch { /* not allowed */ }
        msg.textContent = ok ? 'Copied.' : 'Could not copy by itself: the text is selected, copy it by hand.';
      }
    });
    const asFile = el('button', BTN, 'Save as file');
    asFile.id = 'export-file';
    asFile.addEventListener('click', () => {
      try {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
        const a = el('a', 'display:none;');
        a.href = url;
        a.download = exportFileName();
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        msg.textContent = `Saved as ${a.download} (look in Downloads or Files).`;
      } catch {
        msg.textContent = 'Could not make a file here: use Copy or Share.';
      }
    });
    r.append(copy, asFile);
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      const share = el('button', BTN, 'Share');
      share.id = 'export-share';
      share.addEventListener('click', async () => {
        try {
          const file = new File([text], exportFileName(), { type: 'text/plain' });
          if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Mitosis Gun Builder save' });
          else await navigator.share({ text, title: 'Mitosis Gun Builder save' });
          msg.textContent = 'Shared.';
        } catch (e) {
          if ((e as Error)?.name !== 'AbortError') msg.textContent = 'Sharing did not work here: use Copy or Save as file.';
        }
      });
      r2.appendChild(share);
    }
    const done = el('button', BTN, 'Close');
    done.id = 'export-close';
    done.addEventListener('click', close);
    r2.appendChild(done);
  });
}

export function openImportSave(reload: () => void = () => location.reload()) {
  open('IMPORT SAVE', (panel, close) => {
    panel.appendChild(el('div', HINT, 'Paste the save string from the other device, or load it from a file. This replaces the save on THIS device.'));
    const area = el('textarea', AREA);
    area.id = 'import-text';
    area.placeholder = 'MGBM1:...';
    area.autocomplete = 'off';
    area.spellcheck = false;
    area.setAttribute('autocapitalize', 'off');
    area.setAttribute('autocorrect', 'off');
    panel.appendChild(area);
    const canRead = typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function';
    const pasteHint = el('div', HINT, canRead ? 'Tap Paste, or long-press the box and choose Paste.' : 'Long-press the box and choose Paste.');
    pasteHint.id = 'import-hint';
    panel.appendChild(pasteHint);
    const msg = el('div', 'font-size:14px;min-height:36px;overflow-wrap:anywhere;');
    msg.id = 'import-msg';
    panel.appendChild(msg);
    const r1 = row(panel);
    const paste = el('button', BTN, 'Paste');
    paste.id = 'import-paste';
    const loadFile = el('button', BTN, 'Load file');
    loadFile.id = 'import-file-button';
    const file = el('input', 'display:none;');
    file.type = 'file';
    file.id = 'import-file';
    file.accept = '.txt,.json,text/plain,application/json';
    r1.append(paste, loadFile, file);
    const r = row(panel);
    const load = el('button', BTN, 'Check');
    load.id = 'import-check';
    const cancel = el('button', BTN, 'Cancel');
    cancel.id = 'import-cancel';
    cancel.addEventListener('click', close);
    r.append(load, cancel);

    let armed = false;
    area.addEventListener('input', () => { armed = false; load.textContent = 'Check'; msg.textContent = ''; });
    const fill = (text: string) => { area.value = text; area.dispatchEvent(new Event('input')); };

    paste.addEventListener('click', async () => {
      try {
        const t = await navigator.clipboard.readText();
        if (!t) throw new Error('empty');
        fill(t);
        msg.style.color = '#b0b0b6';
        msg.textContent = 'Pasted. Tap Check.';
      } catch {
        // Not allowed here (a home-screen app, or the answer to the browser's question was no): the box itself still takes a long-press Paste.
        area.focus();
        pasteHint.style.color = '#f2c230';
        pasteHint.textContent = 'This browser will not let the game read the clipboard. Long-press the box and choose Paste.';
      }
    });
    loadFile.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        const t = await readFileText(f);
        fill(saveStringFromFileText(t));
        load.click(); // checks it at once: the message says what is in the file (or what is wrong with it)
      } catch {
        msg.style.color = '#ff8a80';
        msg.textContent = 'Nothing was changed. The file could not be read.';
      }
      file.value = '';
    });

    load.addEventListener('click', () => {
      const storage = safeStorage();
      const check = checkImportString(area.value);
      if (!check.ok) { armed = false; load.textContent = 'Check'; msg.style.color = '#ff8a80'; msg.textContent = `Nothing was changed. ${check.error}`; return; }
      if (!armed) {
        armed = true;
        load.textContent = 'Yes, replace my save';
        msg.style.color = '#f2c230';
        msg.textContent = `This save has ${check.summary}. Loading it erases the save on this device. Tap again to confirm.`;
        return;
      }
      if (!storage) { msg.style.color = '#ff8a80'; msg.textContent = 'Nothing was changed. This browser does not allow saving.'; return; }
      try {
        writeImport(check, storage, PROGRESS_KEY, STORAGE_KEY, LEGACY_KEY);
      } catch {
        msg.style.color = '#ff8a80';
        msg.textContent = 'Nothing was changed. The browser refused to store the save.';
        return;
      }
      msg.style.color = '#8fd18f';
      msg.textContent = 'Loaded. Restarting...';
      playTimeGuard.blocked = true;
      reload();
    });
  });
}

/** The text of a picked file (File.text where there is one, else a FileReader). */
function readFileText(f: File): Promise<string> {
  if (typeof f.text === 'function') return f.text();
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsText(f);
  });
}

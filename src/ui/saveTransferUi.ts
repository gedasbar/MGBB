import { getProgressStore, PROGRESS_KEY } from '../econ/progress';
import { LEGACY_KEY, STORAGE_KEY } from '../builder/persist';
import { checkImportString, exportSaveString, writeImport } from '../econ/saveTransfer';

/**
 * The Export save / Import save dialog (chunk 23a): a plain DOM box over the game (a phone needs a real text field to
 * paste into). Export shows the whole save as one string in a box, with a Copy button, to copy by hand if the button fails.
 * Import takes a pasted string, checks it, says what is in it and asks to confirm before it replaces this device's save.
 */
const BOX = 'position:fixed;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);font:16px system-ui,sans-serif;color:#e8e8ea;';
const PANEL = 'box-sizing:border-box;width:min(92vw,480px);max-height:92vh;overflow:auto;background:#2a2a2d;border:2px solid #55555a;padding:16px;display:flex;flex-direction:column;gap:10px;touch-action:auto;';
const AREA = 'box-sizing:border-box;width:100%;height:150px;resize:none;background:#1c1c1e;color:#e8e8ea;border:1px solid #55555a;font:12px monospace;padding:6px;user-select:text;-webkit-user-select:text;touch-action:auto;';
const BTN = 'flex:1;min-height:48px;font:bold 16px system-ui,sans-serif;background:#3a3a3f;color:#e8e8ea;border:1.5px solid #8a8a90;cursor:pointer;';

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
    panel.appendChild(el('div', 'font-size:14px;color:#b0b0b6;', 'This one line is your whole save. Copy it, then use Import save on the other device.'));
    const area = el('textarea', AREA);
    area.id = 'export-text';
    area.readOnly = true;
    area.value = text;
    area.addEventListener('focus', () => area.select());
    panel.appendChild(area);
    const msg = el('div', 'font-size:14px;color:#f2c230;min-height:18px;');
    msg.id = 'export-msg';
    panel.appendChild(msg);
    const r = row(panel);
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
    const done = el('button', BTN, 'Close');
    done.id = 'export-close';
    done.addEventListener('click', close);
    r.append(copy, done);
  });
}

export function openImportSave(reload: () => void = () => location.reload()) {
  open('IMPORT SAVE', (panel, close) => {
    panel.appendChild(el('div', 'font-size:14px;color:#b0b0b6;', 'Paste the save string from the other device. This replaces the save on THIS device.'));
    const area = el('textarea', AREA);
    area.id = 'import-text';
    area.placeholder = 'MGBM1:...';
    area.autocomplete = 'off';
    area.spellcheck = false;
    panel.appendChild(area);
    const msg = el('div', 'font-size:14px;min-height:36px;overflow-wrap:anywhere;');
    msg.id = 'import-msg';
    panel.appendChild(msg);
    const r = row(panel);
    const load = el('button', BTN, 'Check');
    load.id = 'import-check';
    const cancel = el('button', BTN, 'Cancel');
    cancel.id = 'import-cancel';
    cancel.addEventListener('click', close);
    r.append(load, cancel);
    let armed = false;
    area.addEventListener('input', () => { armed = false; load.textContent = 'Check'; msg.textContent = ''; });
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
      reload();
    });
  });
}

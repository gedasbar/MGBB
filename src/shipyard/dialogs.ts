import { AREA, BTN, el, open, row } from '../ui/saveTransferUi';
import { DESIGN_NAME_MAX } from './constants';

/** Chunk 31b: the two DOM boxes of the Shipyard (a phone needs a real text field): rename a design, and show the cell-mode export text to copy by hand. Same look as the save export. */

/** A box with one text field for the design's name; OK gives the text (empty = back to "Custom N"). */
export function openNameDialog(current: string, onOk: (name: string) => void) {
  open('NAME THIS SHIP', (panel, close) => {
    const input = el('input', `${AREA}height:auto;min-height:44px;`);
    input.id = 'shipyard-name';
    input.type = 'text';
    input.value = current;
    input.maxLength = DESIGN_NAME_MAX;
    input.autocomplete = 'off';
    input.spellcheck = false;
    panel.appendChild(input);
    const r = row(panel);
    const ok = el('button', BTN, 'OK');
    ok.id = 'shipyard-name-ok';
    ok.addEventListener('click', () => { onOk(input.value); close(); });
    const cancel = el('button', BTN, 'Cancel');
    cancel.addEventListener('click', close);
    r.append(ok, cancel);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') ok.click(); });
    setTimeout(() => input.focus(), 0);
  });
}

/** Shows text in a box to copy: a Copy button, and the text is selected on focus for a copy by hand. */
export function openTextDialog(title: string, text: string, hint = '') {
  open(title, (panel, close) => {
    const area = el('textarea', AREA);
    area.id = 'shipyard-export-text';
    area.readOnly = true;
    area.value = text;
    area.addEventListener('focus', () => area.select());
    panel.appendChild(area);
    const msg = el('div', 'font-size:14px;color:#f2c230;min-height:18px;overflow-wrap:anywhere;', hint);
    msg.id = 'shipyard-export-msg';
    panel.appendChild(msg);
    const r = row(panel);
    const copy = el('button', BTN, 'Copy');
    copy.id = 'shipyard-export-copy';
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
    done.id = 'shipyard-export-close';
    done.addEventListener('click', close);
    r.append(copy, done);
  });
}

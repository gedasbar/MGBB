import { sfx as defaultEngine, SOUND_IDS } from '../audio';
import type { SfxEngine } from '../audio';
import { MAX_SOUND_MULT } from '../ui/settings';

/** The tuning as pasteable JSON: only the sounds whose multiplier is not 1, keyed by sound id. */
export function tuningJson(engine: Pick<SfxEngine, 'soundMult'>): string {
  const out: Record<string, number> = {};
  for (const id of SOUND_IDS) {
    const m = engine.soundMult(id);
    if (m !== 1) out[id] = Math.round(m * 10) / 10;
  }
  return JSON.stringify(out);
}

/**
 * Debug panel section "Sounds" (?debug=1 only): one row per sound with a Play button and a loudness multiplier
 * (0.0 to 3.0, applied immediately and saved, on top of the global boost in normal play too).
 */
export function addSoundLab(body: HTMLElement, engine: SfxEngine = defaultEngine) {
  const css = 'font:11px monospace;background:#222;color:#ccc;border:1px solid #666;';
  const det = document.createElement('details');
  det.id = 'dbg-sounds';
  det.style.cssText = 'border:1px solid #666;background:#222;color:#ccc;padding:3px';
  const sum = document.createElement('summary');
  sum.textContent = 'Sounds';
  sum.style.cursor = 'pointer';
  det.appendChild(sum);

  const inputs = new Map<string, HTMLInputElement>();
  for (const id of SOUND_IDS) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:2px;margin-top:2px';
    const play = document.createElement('button');
    play.id = `dbg-snd-${id}`;
    play.textContent = id;
    play.style.cssText = css + 'flex:1;text-align:left;padding:2px 4px;cursor:pointer;overflow:hidden';
    play.addEventListener('click', () => { engine.unlock(); engine.play(id); });
    const mult = document.createElement('input');
    mult.id = `dbg-snd-mult-${id}`;
    mult.type = 'number';
    mult.min = '0';
    mult.max = String(MAX_SOUND_MULT);
    mult.step = '0.1';
    mult.value = engine.soundMult(id).toFixed(1);
    mult.style.cssText = css + 'width:44px';
    mult.addEventListener('change', () => {
      const v = Number(mult.value);
      engine.setSoundMult(id, Number.isFinite(v) ? v : 1);
      mult.value = engine.soundMult(id).toFixed(1);
    });
    inputs.set(id, mult);
    row.append(play, mult);
    det.appendChild(row);
  }

  const out = document.createElement('textarea');
  out.id = 'dbg-snd-json';
  out.readOnly = true;
  out.rows = 3;
  out.style.cssText = css + 'width:100%;margin-top:3px;display:none';
  const copy = document.createElement('button');
  copy.id = 'dbg-snd-copy';
  copy.textContent = 'Copy tuning as JSON';
  copy.style.cssText = css + 'margin-top:3px;padding:3px 6px;cursor:pointer;width:100%';
  copy.addEventListener('click', () => {
    const json = tuningJson(engine);
    // Also shown in the box so it can be copied by hand when the clipboard is blocked.
    out.value = json;
    out.style.display = 'block';
    try { void navigator.clipboard.writeText(json); } catch { /* clipboard blocked: the box has it */ }
  });
  const reset = document.createElement('button');
  reset.id = 'dbg-snd-reset';
  reset.textContent = 'Reset';
  reset.style.cssText = css + 'margin-top:3px;padding:3px 6px;cursor:pointer;width:100%';
  reset.addEventListener('click', () => {
    engine.resetSoundMult();
    for (const i of inputs.values()) i.value = '1.0';
    out.value = '';
    out.style.display = 'none';
  });
  det.append(copy, out, reset);
  body.appendChild(det);
}

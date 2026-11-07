import { sfx as defaultEngine } from '../audio';
import type { SfxEngine } from '../audio';
import { PARAM_SPECS, PRESET_NAMES, SfxrKey, SfxrWave, WAVE_NAMES } from '../audio/sfxr';
import { SfxId } from '../audio/sounds';
import { SLOT_LABELS, SLOT_ORDER, TunerModel } from './sfxrTunerModel';

const CSS = 'font:11px monospace;background:#222;color:#ccc;border:1px solid #666;';

function button(id: string, text: string, onClick: () => void, extra = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.id = id;
  b.textContent = text;
  b.style.cssText = CSS + 'padding:3px 6px;cursor:pointer;' + extra;
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Debug panel section "Sound tuner" (?debug=1 only, chunk 35b): design any game sound by ear, sfxr style.
 * Pick a slot, press a preset / Randomize / Mutate or drag a slider (each change plays), "Use in game" assigns it at once.
 * Designs live in localStorage; "Export all" gives the JSON for src/audio/sfxrSounds.json (see CLAUDE.md).
 */
export function addSfxrTuner(body: HTMLElement, engine: SfxEngine = defaultEngine) {
  const model = new TunerModel(engine.bank, p => { engine.unlock(); engine.preview(p); });
  const det = document.createElement('details');
  det.id = 'dbg-tuner';
  det.style.cssText = 'border:1px solid #666;background:#222;color:#ccc;padding:3px';
  const sum = document.createElement('summary');
  sum.textContent = 'Sound tuner';
  sum.style.cursor = 'pointer';
  det.appendChild(sum);

  const status = document.createElement('div');
  status.id = 'dbg-tuner-status';
  status.style.cssText = 'font:11px monospace;margin-top:3px';

  const select = document.createElement('select');
  select.id = 'dbg-tuner-slot';
  select.style.cssText = CSS + 'width:100%;margin-top:3px';
  for (const id of SLOT_ORDER) { const o = document.createElement('option'); o.value = id; select.appendChild(o); }

  const sliders = new Map<SfxrKey, HTMLInputElement>();
  const waveSel = document.createElement('select');
  waveSel.id = 'dbg-tuner-wave';
  waveSel.style.cssText = CSS + 'width:100%;margin-top:3px';
  WAVE_NAMES.forEach((n, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = `wave: ${n}`; waveSel.appendChild(o); });
  waveSel.addEventListener('change', () => { model.setWave(Number(waveSel.value) as SfxrWave); refresh(); });

  const undo = button('dbg-tuner-undo', 'Undo', () => { model.undo(); refresh(); });

  function refresh() {
    for (const o of Array.from(select.options)) o.textContent = `${engine.bank.has(o.value) ? '● ' : ''}${SLOT_LABELS[o.value as SfxId]}`;
    select.value = model.slot;
    waveSel.value = String(model.params.wave);
    for (const [k, inp] of sliders) inp.value = String(model.params[k]);
    undo.disabled = !model.canUndo;
    status.textContent = `${model.designed ? 'In game: designed sound' : 'In game: original sound'} · ${engine.bank.size} designed`;
  }
  select.addEventListener('change', () => { model.select(select.value as SfxId); refresh(); });

  const presets = document.createElement('div');
  presets.style.cssText = 'display:flex;flex-wrap:wrap;gap:2px;margin-top:3px';
  for (const n of PRESET_NAMES) presets.appendChild(button(`dbg-tuner-preset-${n}`, n, () => { model.applyPreset(n); refresh(); }));

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:2px;margin-top:3px';
  actions.append(
    button('dbg-tuner-random', 'Randomize', () => { model.randomize(); refresh(); }),
    button('dbg-tuner-mutate', 'Mutate', () => { model.mutate(); refresh(); }),
    button('dbg-tuner-play', 'Play', () => model.replay()),
    undo,
    button('dbg-tuner-use', 'Use in game', () => { model.useInGame(); refresh(); }, 'background:#2d4a2d'),
    button('dbg-tuner-remove', 'Original', () => { model.removeDesign(); refresh(); }),
  );

  const sliderBox = document.createElement('div');
  sliderBox.style.cssText = 'margin-top:3px';
  for (const spec of PARAM_SPECS) {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:3px;font:10px monospace';
    const name = document.createElement('span');
    name.textContent = spec.label;
    name.style.cssText = 'width:112px;flex:none';
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.id = `dbg-tuner-p-${spec.key}`;
    inp.min = String(spec.min);
    inp.max = String(spec.max);
    inp.step = '0.01';
    inp.style.cssText = 'flex:1;min-width:0';
    inp.addEventListener('input', () => { model.setParam(spec.key, Number(inp.value)); undo.disabled = false; });
    sliders.set(spec.key, inp);
    row.append(name, inp);
    sliderBox.appendChild(row);
  }

  const json = document.createElement('textarea');
  json.id = 'dbg-tuner-json';
  json.rows = 4;
  json.placeholder = 'Export all writes the JSON here; paste JSON here and press Import';
  json.style.cssText = CSS + 'width:100%;margin-top:3px';
  const msg = document.createElement('div');
  msg.id = 'dbg-tuner-msg';
  msg.style.cssText = 'font:10px monospace;margin-top:2px';
  const io = document.createElement('div');
  io.style.cssText = 'display:flex;gap:2px;margin-top:3px';
  io.append(
    button('dbg-tuner-export', 'Export all', () => {
      const text = engine.bank.exportJson();
      json.value = text;
      json.select();
      let copied = false;
      try { void navigator.clipboard.writeText(text).catch(() => {}); copied = true; } catch { /* clipboard blocked: the box has it */ }
      msg.textContent = `Exported ${engine.bank.size} sounds${copied ? ' (copied)' : ''}. Save as src/audio/sfxrSounds.json`;
    }, 'flex:1'),
    button('dbg-tuner-import', 'Import', () => {
      const r = engine.bank.importJson(json.value);
      msg.textContent = r.ok ? `Imported ${r.count} sounds${r.ignored.length ? `, ignored: ${r.ignored.join(', ')}` : ''}` : `Import failed: ${r.error}`;
      model.select(model.slot);
      refresh();
    }, 'flex:1'),
    button('dbg-tuner-clear', 'Clear all', () => {
      engine.bank.importJson('{"version":1,"sounds":{}}');
      msg.textContent = 'All designs removed (the original sounds play)';
      model.select(model.slot);
      refresh();
    }),
  );

  det.append(select, status, presets, actions, waveSel, sliderBox, json, io, msg);
  body.appendChild(det);
  refresh();
  return model;
}

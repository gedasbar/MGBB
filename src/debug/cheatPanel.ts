import { getProgressStore } from '../econ/progress';
import { getBuilderModel } from '../builder/session';
import { SPECIES } from '../data/species';
import { debugHooks } from './hooks';
import { addCaptainKillsCheat, setHeroLevel, unlockAllCaptains, addCredits, addMedals, ownAllBlocks, ownAllHulls, resetCampaign, resetEverything, unlockAllTiers, unlockFrontier, clearFrontierSquare, clearFrontierRing, reachAllDirections } from './cheats';
import { frontierJump } from '../frontier/session';

/**
 * The Cheats section of the ?debug=1 panel. Dev builds only: the panel imports this module behind `import.meta.env.DEV`,
 * so a production build does not contain it. Every button works from any screen; each one reports what it did in the
 * status line at the top of the section.
 */
const BTN = 'font:11px monospace;padding:3px 6px;text-align:left;background:#222;color:#ccc;border:1px solid #666;cursor:pointer';
const INPUT = 'width:60px;font:11px monospace;background:#111;color:#ccc;border:1px solid #666';
/** Seconds the "really reset?" confirm stays armed. */
const CONFIRM_MS = 4000;

export function addCheats(parent: HTMLElement) {
  const wrap = document.createElement('div');
  wrap.id = 'dbg-cheats';
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;border-top:2px solid #a55;padding-top:3px';
  const status = document.createElement('div');
  status.id = 'dbg-cheat-status';
  status.style.cssText = 'color:#e6c07b;min-height:13px;max-width:170px;overflow-wrap:anywhere';
  status.textContent = 'CHEATS (dev only)';
  wrap.appendChild(status);
  const say = (t: string) => { status.textContent = t; };

  const group = (id: string, title: string) => {
    const d = document.createElement('details');
    d.id = id;
    d.style.cssText = 'border:1px solid #666;background:#222;color:#ccc;padding:2px 3px';
    const s = document.createElement('summary');
    s.textContent = title;
    s.style.cssText = 'cursor:pointer';
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:3px;margin-top:3px';
    d.append(s, body);
    wrap.appendChild(d);
    return body;
  };
  const button = (box: HTMLElement, id: string, label: string, act: () => void) => {
    const b = document.createElement('button');
    b.id = id; b.textContent = label; b.style.cssText = BTN;
    b.addEventListener('click', act);
    box.appendChild(b);
    return b;
  };
  const number = (box: HTMLElement, id: string, label: string, value: string, step = '1') => {
    const l = document.createElement('label');
    l.textContent = label + ' ';
    const i = document.createElement('input');
    i.id = id; i.type = 'number'; i.value = value; i.step = step; i.style.cssText = INPUT;
    l.appendChild(i);
    box.appendChild(l);
    return i;
  };
  const int = (el: HTMLInputElement, min = 0) => Math.max(min, Math.floor(Number(el.value)) || min);
  const store = () => getProgressStore();

  // ---- Economy and progress
  const eco = group('dbg-g-eco', 'Economy and progress');
  for (const n of [1000, 100_000, 10_000_000]) {
    button(eco, `dbg-add-${n}`, `+${n.toLocaleString('en-US')} credits`, () => { addCredits(store(), n); say(`credits ${store().data.credits}`); });
  }
  const amount = number(eco, 'dbg-add-n', 'credits', '5000');
  button(eco, 'dbg-add-custom', 'Add that many', () => { addCredits(store(), Math.floor(Number(amount.value)) || 0); say(`credits ${store().data.credits}`); });
  button(eco, 'dbg-medal-1', '+1 Medal', () => { addMedals(store(), 1); say(`medals ${store().data.medals}`); });
  button(eco, 'dbg-medal-10', '+10 Medals', () => { addMedals(store(), 10); say(`medals ${store().data.medals}`); });
  button(eco, 'dbg-medal-100', '+100 Medals', () => { addMedals(store(), 100); say(`medals ${store().data.medals}`); });
  const copies = number(eco, 'dbg-own-n', 'copies', '10');
  const maxLv = document.createElement('label');
  const maxBox = document.createElement('input');
  maxBox.id = 'dbg-own-max'; maxBox.type = 'checkbox';
  maxLv.append(maxBox, ' max level');
  eco.appendChild(maxLv);
  button(eco, 'dbg-own-blocks', 'Own all blocks', () => {
    ownAllBlocks(store(), int(copies), maxBox.checked);
    getBuilderModel().refreshLevels();
    say(`all blocks x${int(copies)}${maxBox.checked ? ', max level' : ''}`);
  });
  button(eco, 'dbg-own-hulls', 'Own all hulls', () => { ownAllHulls(store()); say(`hulls ${store().data.ownedHulls.join(',')}`); });

  // ---- Campaign
  const camp = group('dbg-g-camp', 'Campaign');
  button(camp, 'dbg-unlock-tiers', 'Unlock tiers 1-100', () => { unlockAllTiers(store()); say('tiers 1-100 open (no medals)'); });
  button(camp, 'dbg-reset-campaign', 'Reset campaign progress', () => { resetCampaign(store()); say('campaign reset'); });
  let armed = 0;
  const resetBtn = button(camp, 'dbg-reset-all', 'Reset ENTIRE save', () => {
    if (Date.now() - armed > CONFIRM_MS) {
      armed = Date.now();
      resetBtn.textContent = 'Really reset? click again';
      setTimeout(() => { resetBtn.textContent = 'Reset ENTIRE save'; }, CONFIRM_MS);
      return;
    }
    resetEverything(store(), getBuilderModel());
    say('save reset, reloading');
    location.reload();
  });
  const tierN = number(camp, 'dbg-tier-n', 'tier', '1');
  button(camp, 'dbg-start-tier', 'Start campaign tier', () => {
    if (!debugHooks.startTier) return say('not ready');
    debugHooks.startTier(Math.min(100, int(tierN, 1)));
    say(`tier ${int(tierN, 1)} started`);
  });

  // ---- Frontier (chunk 15a)
  const fr = group('dbg-g-frontier', 'Frontier');
  button(fr, 'dbg-fr-unlock', 'Unlock the Frontier', () => { unlockFrontier(store()); say('Frontier open (tiers 1-25 passed, no medals)'); });
  button(fr, 'dbg-fr-reach-all', 'Reach ring 300 everywhere', () => { reachAllDirections(store()); say('every directional unlock reached (all gated blocks for sale)'); });
  const fx = number(fr, 'dbg-fr-x', 'x', '0');
  const fy = number(fr, 'dbg-fr-y', 'y', '0');
  const num = (el: HTMLInputElement) => Math.round(Number(el.value)) || 0;
  button(fr, 'dbg-fr-clear', 'Clear square x,y', () => say(clearFrontierSquare(store(), num(fx), num(fy)) ? `cleared ${num(fx)},${num(fy)}` : 'hole or origin: nothing to clear'));
  button(fr, 'dbg-fr-jump', 'Jump camera to x,y', () => { frontierJump(num(fx), num(fy)); say(`camera at ${num(fx)},${num(fy)}`); });
  const fr_r = number(fr, 'dbg-fr-r', 'ring', '3');
  button(fr, 'dbg-fr-ring', 'Clear rings 0..r', () => say(`${clearFrontierRing(store(), int(fr_r))} squares cleared`));

  // ---- Captains (chunk 13a)
  const cap = group('dbg-g-cap', 'Captains');
  const kills = number(cap, 'dbg-cap-kills-n', 'kills', '300');
  button(cap, 'dbg-cap-kills', 'Add kills to the active captain', () => {
    addCaptainKillsCheat(store(), int(kills));
    const c = store().data.captains;
    say(`${c.selected}: ${c.heroes[c.selected].kills} kills`);
  });
  button(cap, 'dbg-cap-unlock', 'Unlock all captains', () => { unlockAllCaptains(store()); say(`captains ${store().data.captains.owned.join(',')}`); });
  const lvl = number(cap, 'dbg-cap-level-n', 'hero level', '5');
  button(cap, 'dbg-cap-level', 'Set hero level (active captain)', () => {
    setHeroLevel(store(), int(lvl));
    getBuilderModel().refreshCaptain();
    const c = store().data.captains;
    say(`${c.selected}: level ${c.heroes[c.selected].level}`);
  });

  // ---- Free Fly
  const ff = group('dbg-g-ff', 'Free Fly');
  const waveN = number(ff, 'dbg-wave-n', 'wave', '1');
  button(ff, 'dbg-start-wave', 'Start Free Fly at wave', () => {
    if (!debugHooks.startFly) return say('not ready');
    debugHooks.startFly(int(waveN, 1));
    say(`Free Fly from wave ${int(waveN, 1)}`);
  });
  const sel = document.createElement('select');
  sel.id = 'dbg-species';
  sel.style.cssText = INPUT + ';width:auto';
  for (const s of Object.values(SPECIES)) sel.add(new Option(s.name, s.id));
  ff.appendChild(sel);
  button(ff, 'dbg-spawn', 'Spawn species at top', () => {
    const w = debugHooks.world;
    if (!w) return say('start Free Fly first');
    const sp = SPECIES[sel.value];
    const e = w.spawnSpecies(sel.value, sp.radius + Math.random() * (540 - 2 * sp.radius), -sp.radius);
    say(e ? `spawned ${sp.name}` : 'enemy cap reached');
  });

  // ---- Both modes
  const both = group('dbg-g-both', 'Free Fly and walls');
  const god = document.createElement('label');
  const godBox = document.createElement('input');
  godBox.id = 'dbg-god'; godBox.type = 'checkbox'; godBox.checked = debugHooks.god;
  godBox.addEventListener('change', () => { debugHooks.god = godBox.checked; say(godBox.checked ? 'god mode ON' : 'god mode off'); });
  god.append(godBox, ' god mode (no damage / no crash)');
  both.appendChild(god);
  button(both, 'dbg-kill-all', 'Kill all enemies / destroy all blocks', () => {
    if (debugHooks.wall) { debugHooks.wall.destroyAll(); say('all blocks destroyed'); }
    else if (debugHooks.world) { debugHooks.world.clearEnemies(); say('all enemies removed'); }
    else say('nothing is running');
  });
  parent.appendChild(wrap);
}

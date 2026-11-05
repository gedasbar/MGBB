import { World } from '../src/game/world';
const w = new World({ startWave: Number(process.argv[2] ?? 10), seed: 3 });
const ptr: any = { x: 270, y: 800, active: false, seen: false, type: 'mouse' };
for (let i = 0; i < 60 * 12; i++) { w.update(1 / 60, ptr); }
const b = w.boss;
console.log('wave', w.wave, 'boss', b?.def.id, 'hp', b?.hp, '/', b?.maxHp, 'parts', b?.parts.length, 'entering', b?.entering, 'anchor', b?.anchorX.toFixed(0), b?.anchorY.toFixed(0), 'bullets', w.enemyBullets.count, 'enemies', w.mitosis.enemies.length, 'kills', w.kills, 'hull', w.hull);

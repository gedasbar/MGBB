export class Mulberry32 {
  private a: number;
  constructor(seed: number) {
    this.a = seed;
  }
  next(): number {
    let t = this.a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

export const rng = {
  combat: new Mulberry32(1),
  map: new Mulberry32(2),
  fx: new Mulberry32(3),
  spawn: new Mulberry32(4),
  reset(seed: number) {
    this.combat = new Mulberry32(seed);
    this.map = new Mulberry32(seed + 1);
    this.fx = new Mulberry32(seed + 2);
    this.spawn = new Mulberry32(seed + 3);
  }
};

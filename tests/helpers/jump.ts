/** One step with the ship put at the target first (chunk 24a: the pointer no longer teleports the ship; a test that needs a place uses this). */
export function jump(w: { teleportShip(x: number, y: number): void; update(dt: number, target: any): void }, target: { x: number; y: number }, dt = 1 / 60) {
  w.teleportShip(target.x, target.y);
  w.update(dt, target);
}

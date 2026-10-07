// Autoplay script for soak testing
// "an AI pilot that dodges the nearest threat and holds a sine sweep"

export class Autopilot {
  enabled: boolean = false;
  time: number = 0;

  update(dt: number, shipPosition: { x: number, y: number }, enemies: any[]) {
    if (!this.enabled) return { vx: 0, vy: 0 };

    this.time += dt;
    let targetX = shipPosition.x;

    // Sine sweep holding
    const sweepX = Math.sin(this.time) * 100;

    // Dodge nearest threat
    let nearest = null;
    let minDist = Infinity;

    for (const e of enemies) {
      const dx = e.x - shipPosition.x;
      const dy = e.y - shipPosition.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < minDist && dist < 150) {
        minDist = dist;
        nearest = e;
      }
    }

    if (nearest) {
      // Move away
      const dx = shipPosition.x - nearest.x;
      targetX += Math.sign(dx) * 200;
    } else {
      // Just sweep
      targetX += sweepX;
    }

    // Simple proportional control
    const vx = (targetX - shipPosition.x) * 5;
    return { vx, vy: 0 }; // stay on same horizontal plane mostly
  }
}

# Decisions

1. **Build Tooling**: Vite with vanilla TypeScript template. It provides fast HMR and a straightforward build process without unnecessary bloat.
2. **Rendering Engine**: PixiJS v8. Chosen for its WebGL/WebGPU performance, specifically for handling thousands of sprites (projectiles/particles) using ParticleContainer/instanced rendering.
3. **Testing**: Vitest for unit tests. It integrates seamlessly with Vite and supports TypeScript out of the box.
4. **Data Structures**: We use Struct-of-Arrays (SoA) typed arrays (`Float32Array`, `Uint8Array`) for entities (Projectiles, Enemies, Particles) to ensure memory contiguity, avoid GC pauses, and maintain 60 FPS budget.
5. **Randomness**: `mulberry32` is implemented for deterministic PRNG, taking a seed to ensure reproducible runs.
6. **Input**: A simple polling-based input manager that tracks keyboard state (WASD/Arrows, Shift) and pointer coordinates.

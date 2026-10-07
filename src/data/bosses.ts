export interface BossPart {
  id: string;
  hp: number;
  maxHp: number;
  armor: number;
  shield: number;
  maxShield: number;
  offset: { x: number, y: number };
  width: number;
  height: number;
  role: 'plate' | 'turret' | 'core' | 'spawner' | 'shieldGen';
  invulnerableUntil?: string[]; // Wait until these parts are destroyed
}

export interface Phase {
  hpThreshold: number;
  attackScript: string[];
}

export interface BossDef {
  id: string;
  name: string;
  width: number;
  parts: BossPart[];
  phases: Phase[];
  descentSpeed: number;
  enrageAt: number;
  reward: number;
}

export const BOSSES: Record<string, BossDef> = {
  crusher_wall: {
    id: 'crusher_wall',
    name: 'The Crusher Wall',
    width: 0.85,
    descentSpeed: 5,
    enrageAt: 60,
    reward: 100,
    phases: [
      { hpThreshold: 1.0, attackScript: ['basic_shoot'] }
    ],
    parts: [
      { id: 'plate1', hp: 500, maxHp: 500, armor: 50, shield: 0, maxShield: 0, offset: { x: -100, y: 20 }, width: 40, height: 40, role: 'plate' },
      { id: 'plate2', hp: 500, maxHp: 500, armor: 50, shield: 0, maxShield: 0, offset: { x: -50, y: 20 }, width: 40, height: 40, role: 'plate' },
      { id: 'plate3', hp: 500, maxHp: 500, armor: 50, shield: 0, maxShield: 0, offset: { x: 50, y: 20 }, width: 40, height: 40, role: 'plate' },
      { id: 'plate4', hp: 500, maxHp: 500, armor: 50, shield: 0, maxShield: 0, offset: { x: 100, y: 20 }, width: 40, height: 40, role: 'plate' },
      { id: 'core', hp: 2000, maxHp: 2000, armor: 100, shield: 500, maxShield: 500, offset: { x: 0, y: 0 }, width: 60, height: 60, role: 'core', invulnerableUntil: ['plate1', 'plate2', 'plate3', 'plate4'] }
    ]
  },
  hive_mother: {
    id: 'hive_mother', name: 'Hive Mother', width: 0.9, descentSpeed: 3, enrageAt: 90, reward: 200,
    phases: [{ hpThreshold: 1.0, attackScript: ['spawn_mitotic'] }],
    parts: [
      { id: 'pore1', hp: 800, maxHp: 800, armor: 0, shield: 0, maxShield: 0, offset: { x: -80, y: 30 }, width: 30, height: 30, role: 'spawner' },
      { id: 'pore2', hp: 800, maxHp: 800, armor: 0, shield: 0, maxShield: 0, offset: { x: 80, y: 30 }, width: 30, height: 30, role: 'spawner' },
      { id: 'core', hp: 4000, maxHp: 4000, armor: 0, shield: 0, maxShield: 0, offset: { x: 0, y: -10 }, width: 80, height: 80, role: 'core', invulnerableUntil: ['pore1', 'pore2'] }
    ]
  },
  prism_gate: {
    id: 'prism_gate', name: 'The Prism Gate', width: 0.85, descentSpeed: 4, enrageAt: 75, reward: 250,
    phases: [{ hpThreshold: 1.0, attackScript: ['laser_sweep'] }],
    parts: [
      { id: 'pylon_l', hp: 1500, maxHp: 1500, armor: 100, shield: 1000, maxShield: 1000, offset: { x: -120, y: 0 }, width: 40, height: 80, role: 'shieldGen' },
      { id: 'pylon_r', hp: 1500, maxHp: 1500, armor: 100, shield: 1000, maxShield: 1000, offset: { x: 120, y: 0 }, width: 40, height: 80, role: 'shieldGen' },
      { id: 'core', hp: 3000, maxHp: 3000, armor: 200, shield: 0, maxShield: 0, offset: { x: 0, y: 0 }, width: 60, height: 60, role: 'core', invulnerableUntil: ['pylon_l', 'pylon_r'] }
    ]
  },
  cell_lattice: {
    id: 'cell_lattice', name: 'Cell Lattice', width: 0.95, descentSpeed: 2, enrageAt: 120, reward: 300,
    phases: [{ hpThreshold: 1.0, attackScript: ['lattice_pulse'] }],
    parts: [
      { id: 'core', hp: 5000, maxHp: 5000, armor: 0, shield: 2000, maxShield: 2000, offset: { x: 0, y: 0 }, width: 100, height: 100, role: 'core' }
      // The 40 small cells would be generated dynamically or represented simply here for the test.
    ]
  },
  the_breaker: {
    id: 'the_breaker', name: 'The Breaker', width: 0.9, descentSpeed: 6, enrageAt: 80, reward: 350,
    phases: [{ hpThreshold: 1.0, attackScript: ['shockwave'] }],
    parts: [
      { id: 'plateL', hp: 1000, maxHp: 1000, armor: 200, shield: 0, maxShield: 0, offset: { x: -70, y: 20 }, width: 50, height: 40, role: 'plate' },
      { id: 'plateR', hp: 1000, maxHp: 1000, armor: 200, shield: 0, maxShield: 0, offset: { x: 70, y: 20 }, width: 50, height: 40, role: 'plate' },
      { id: 'core', hp: 6000, maxHp: 6000, armor: 300, shield: 500, maxShield: 500, offset: { x: 0, y: 0 }, width: 70, height: 70, role: 'core', invulnerableUntil: ['plateL', 'plateR'] }
    ]
  },
  singularity: {
    id: 'singularity', name: 'The Singularity', width: 1.0, descentSpeed: 3, enrageAt: 150, reward: 500,
    phases: [
      { hpThreshold: 1.0, attackScript: ['gravity_pull'] },
      { hpThreshold: 0.6, attackScript: ['gravity_pull', 'debris'] },
      { hpThreshold: 0.3, attackScript: ['gravity_pull', 'debris', 'laser_sweep'] }
    ],
    parts: [
      { id: 'core', hp: 10000, maxHp: 10000, armor: 500, shield: 5000, maxShield: 5000, offset: { x: 0, y: 0 }, width: 90, height: 90, role: 'core' }
    ]
  }
};

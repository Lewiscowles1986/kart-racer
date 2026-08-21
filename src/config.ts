// Central tuning + game constants. Keeping every magic number here makes the
// whole game coherent and easy to balance like a real arcade racer.

export interface RaceConfig {
  totalLaps: number;
  kartCount: number;
  respawnTimeoutMs: number;
}

export interface BoostConfig {
  force: number;
  time: number;
  top: number;
}

export interface PhysConfig {
  gravity: number;
  accel: number;
  maxSpeed: number;
  reverseSpeed: number;
  turnRate: number;
  turnDropoff: number;
  driftSteerBoost: number;
  driftMinSpeed: number;
  bananaSpinMs: number;
  miniTurboMinTime: number;
  boost: { mushroom: BoostConfig; star: BoostConfig };
}

export interface TerrainConfig {
  road: number;
  grass: number;
  dirt: number;
  sand: number;
}

export interface ItemConfig {
  boxRespawnMs: number;
  rouletteMs: number;
  weights: { banana: number; mushroom: number; star: number };
}

export interface CameraConfig {
  height: number;
  distance: number;
  lookAhead: number;
  fovBase: number;
  fovBoost: number;
  lerp: number;
}

export interface RendererConfig {
  pixelRatio: number;
  shadowMapSize: number;
  exposure: number;
  toneMapping: string;
}

export interface WorldConfig {
  roadWidth: number;
  curbWidth: number;
  roadRes: number;
}

export const RACE: RaceConfig = {
  totalLaps: 3,
  kartCount: 8,          // player + AI
  respawnTimeoutMs: 4200,
};

export const PHYS: PhysConfig = {
  gravity: -30,
  accel: 30,
  maxSpeed: 34,
  reverseSpeed: -12,
  turnRate: 4.2,         // rad/s — fast enough to corner at full speed
  turnDropoff: 0.35,     // steering loss at top speed (kept < 1 so it never inverts)
  driftSteerBoost: 1.9,
  driftMinSpeed: 15,
  bananaSpinMs: 900,
  miniTurboMinTime: 750,
  boost: { mushroom: { force: 900, time: 1500, top: 47 }, star: { force: 800, time: 5400, top: 44 } },
};

export const TERRAIN: TerrainConfig = {
  road: 1.0,
  grass: 0.32,
  dirt: 0.45,
  sand: 0.3,
};

export const ITEM: ItemConfig = {
  boxRespawnMs: 5000,
  rouletteMs: 900,
  weights: { banana: 30, mushroom: 45, star: 25 },
};

export const CAMERA: CameraConfig = {
  height: 2.1,
  distance: 3.7,
  lookAhead: 3.5,
  fovBase: 62,
  fovBoost: 74,
  lerp: 6.0,
};

// Kart visual + physics scale. The models are authored ~4m long; this shrinks
// them (and the collision radius / ride height) so they read as small karts on
// the wide road. Steering turn rate is unchanged — a smaller kart already turns
// tighter for the same yaw rate.
export const KART_SCALE = 0.25;

export const RENDERER: RendererConfig = {
  pixelRatio: 1, // actual device ratio is applied at runtime in Game.js
  shadowMapSize: 2048,
  exposure: 0.88,
  toneMapping: 'ACESFilmic',
};

export const WORLD: WorldConfig = {
  roadWidth: 12,
  curbWidth: 1.1,
  roadRes: 0.6,        // meters per sample along centerline
};

export const TRACK_POINTS: [number, number][] = [
  [0, -44],
  [34, -40],
  [60, -18],
  [66, 16],
  [50, 42],
  [22, 52],
  [2, 44],
  [-14, 60],
  [-46, 60],
  [-58, 34],
  [-42, 10],
  [-60, -14],
  [-44, -36],
];

export const PLAYER = { index: 0 };

// Item box placement: as fractions of track arc length (0..1). Boxes appear in
// short lateral offsets so a full set can be grabbed in sequence.
export const ITEM_BOX_PLACEMENTS: number[] = [
  0.06, 0.16, 0.27, 0.36, 0.45, 0.55, 0.66, 0.75, 0.86, 0.96,
];

export const GRID_GAP = 7.0; // longitudinal spacing on start grid

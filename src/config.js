// Central tuning + game constants. Keeping every magic number here makes the
// whole game coherent and easy to balance like a real arcade racer.

export const RACE = {
  totalLaps: 3,
  kartCount: 8,          // player + AI
  respawnTimeoutMs: 4200,
};

export const PHYS = {
  gravity: -30,
  accel: 30,
  maxSpeed: 34,
  reverseSpeed: -12,
  turnRate: 3.6,         // rad/s — fast enough to corner at full speed
  turnDropoff: 0.42,     // steering loss at top speed (kept < 1 so it never inverts)
  driftSteerBoost: 1.9,
  driftMinSpeed: 15,
  bananaSpinMs: 900,
  miniTurboMinTime: 750,
  boost: { mushroom: { force: 900, time: 1500, top: 47 }, star: { force: 800, time: 5400, top: 44 } },
};

export const TERRAIN = {
  road: 1.0,
  grass: 0.32,
  dirt: 0.45,
  sand: 0.3,
};

export const ITEM = {
  boxRespawnMs: 5000,
  rouletteMs: 900,
  weights: { banana: 30, mushroom: 45, star: 25 },
};

export const CAMERA = {
  height: 4.2,
  distance: 7.4,
  lookAhead: 7,
  fovBase: 62,
  fovBoost: 74,
  lerp: 6.0,
};

export const RENDERER = {
  pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  shadowMapSize: 2048,
  exposure: 0.88,
  toneMapping: 'ACESFilmic',
};

export const WORLD = {
  roadWidth: 9.2,
  curbWidth: 1.1,
  roadRes: 0.6,        // meters per sample along centerline
};

export const TRACK_POINTS = [
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
export const ITEM_BOX_PLACEMENTS = [
  0.06, 0.16, 0.27, 0.36, 0.45, 0.55, 0.66, 0.75, 0.86, 0.96,
];

export const GRID_GAP = 7.0; // longitudinal spacing on start grid

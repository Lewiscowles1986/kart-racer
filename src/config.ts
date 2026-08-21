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

export type CameraMode = 'chase' | 'close' | 'hood' | 'overhead';

export interface CameraModeDef {
  id: CameraMode;
  name: string;
  height: number;
  distance: number;   // behind the kart; negative = slightly ahead (hood)
  lookAhead: number;  // where the camera looks down the road
  fov: number;
  overhead?: boolean; // place the camera directly above, looking straight down
}

// Selectable camera modes, cycled with C. The race camera lerps between the
// player's kart and these target offsets.
export const CAMERA_MODES: CameraModeDef[] = [
  { id: 'chase', name: 'Chase', height: 2.1, distance: 3.7, lookAhead: 3.5, fov: 62 },
  { id: 'close', name: 'Close', height: 1.7, distance: 2.1, lookAhead: 5.5, fov: 70 },
  { id: 'hood', name: 'Hood', height: 1.1, distance: -0.4, lookAhead: 8.0, fov: 78 },
  { id: 'overhead', name: 'Overhead', height: 26, distance: 0, lookAhead: 0, fov: 52, overhead: true },
];

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

export interface TrackDef {
  id: string;
  name: string;
  desc: string;
  points: [number, number][];
  // gradient stops for the track's thumbnail/swatch
  color: [string, string];
}

// Selectable tracks. Each is a closed Catmull-Rom loop; the first is the default.
export const TRACKS: TrackDef[] = [
  {
    id: 'sunny',
    name: 'Sunny Circuit',
    desc: 'A wide, gentle summer loop — great for learning the basics.',
    color: ['#6cc24a', '#ffd23f'],
    points: [
      [0, -44], [34, -40], [60, -18], [66, 16], [50, 42], [22, 52],
      [2, 44], [-14, 60], [-46, 60], [-58, 34], [-42, 10], [-60, -14], [-44, -36],
    ],
  },
  {
    id: 'canyon',
    name: 'Canyon Loop',
    desc: 'Snakier with tighter turns — practise your drifts here.',
    color: ['#e76f51', '#f4a261'],
    points: [
      [0, -40], [24, -34], [34, -12], [22, 8], [34, 30], [12, 42],
      [-12, 34], [-24, 12], [-12, -8], [-24, -30],
    ],
  },
  {
    id: 'coast',
    name: 'Coastal Dash',
    desc: 'A fast, flowing seaside circuit with long sweeping straights.',
    color: ['#4fd1c5', '#3b82f6'],
    points: [
      [0, -52], [44, -46], [72, -18], [72, 18], [44, 46], [0, 52],
      [-44, 46], [-72, 18], [-72, -18], [-44, -46],
    ],
  },
];

// Back-compat alias: the default track's points.
export const TRACK_POINTS: [number, number][] = TRACKS[0].points;

export const PLAYER = { index: 0 };

// Item box placement: as fractions of track arc length (0..1). Boxes appear in
// short lateral offsets so a full set can be grabbed in sequence.
// Curated, learning-friendly item box placement (fractions of arc length 0..1):
// a teaching pair right after the start line so new players grab an item
// immediately, then a steady spread around the rest of the loop.
export const ITEM_BOX_PLACEMENTS: number[] = [
  0.05, 0.09, 0.22, 0.34, 0.46, 0.58, 0.70, 0.82, 0.94,
];

export const GRID_GAP = 7.0; // longitudinal spacing on start grid

// Boost-pad physics: a moderate speed kick, between base cruising and a full
// mushroom, so pads reward hitting the racing line without overpowering items.
export const PAD = {
  force: 520,      // extra acceleration while a pad boost is active
  time: 1.0,       // seconds the boost lasts after leaving the pad
  top: 40,         // top speed while pad-boosting (base maxSpeed 34, mushroom 47)
};

// Boost-pad placement: fractions of arc length, centred on the road.
export const BOOST_PADS: { frac: number; lateral: number }[] = [
  { frac: 0.13, lateral: 0 },
  { frac: 0.29, lateral: 0 },
  { frac: 0.47, lateral: 0 },
  { frac: 0.65, lateral: 0 },
  { frac: 0.84, lateral: 0 },
];

// Jump physics: launching a kart into a parabolic arc.
export const JUMP = {
  vy: 17,         // initial vertical velocity on launch
  gravity: 46,    // gravity acceleration while airborne
  minSpeed: 12,   // minimum ground speed required to launch
  airDrag: 1.4,   // fraction of speed kept per second while airborne
};

// Jump zones: fractions of arc length. Driving over one (fast enough) launches
// the kart into the air; a visible ramp marks the take-off.
export const JUMPS: { frac: number; lateral: number }[] = [
  { frac: 0.20, lateral: 0 },
  { frac: 0.55, lateral: 0 },
  { frac: 0.90, lateral: 0 },
];

// Meridian Run — shared constants: flight envelope, mission definitions, palette.
// One job: every number the rest of the game agrees on lives here, so tuning is one file.

export const GAME_TITLE = 'MERIDIAN RUN';
export const GAME_SUBTITLE = 'a test pilot flies three sorties over one island archipelago';

// Fixed bounded airspace (metres). The world is one fixed scene, never infinite.
export const WORLD = {
  halfSize: 4200,
  minAltitude: 0,
  maxAltitude: 1400,
  groundLevel: 0,
};

// Flight envelope. One fixed difficulty, same physics in every mission.
export const FLIGHT = {
  stallSpeed: 62,        // knots: slower than this and the wing stops flying
  cruiseSpeed: 170,
  maxSpeed: 330,         // faster than this and the airframe shakes apart
  overspeedWarn: 290,
  climbRate: 26,         // m/s at full climb
  sinkRate: 30,
  turnRate: 0.62,        // rad/s at full bank
  maxBank: 1.05,         // rad of roll
  maxPitch: 0.55,
  throttleStep: 55,      // knots per second while a throttle key is held
  fuelBurnBase: 0.55,    // fuel units per second at cruise
  fuelBurnFull: 1.5,     // fuel units per second at full throttle
  fuelCapacity: 100,
  healthMax: 100,
  ringScore: 250,
  pickupScore: 100,
  landingScore: 1000,
  missionBonus: 500,
};

// Missions in order. Same physics everywhere; only the goal and the weather change.
export const MISSIONS = [
  {
    id: 'rings',
    name: 'SORTIE 1 — RING TRIAL',
    goal: 'Fly through all 8 rings in order',
    briefing: 'Morning over the Meridian archipelago. Eight survey rings mark the trial course. Thread each one — clean passes pay 250 points, clipping a ring costs the airframe.',
    timeOfDay: 'morning',
    ringCount: 8,
    start: { x: -2600, y: 320, z: 3400, heading: 0.0 },
    runway: { x: 0, z: -600 },
  },
  {
    id: 'storm',
    name: 'SORTIE 2 — STORM RIDGE',
    goal: 'Cross the ridge and reach the beacon',
    briefing: 'Afternoon storm over the ridge. Thunderheads stand in your path and gull flocks ride the updrafts. Thread the gap, mind your fuel, and touch the beacon ring at the far end.',
    timeOfDay: 'storm',
    ringCount: 1,
    start: { x: -2600, y: 380, z: 3400, heading: 0.0 },
    runway: { x: 0, z: -600 },
  },
  {
    id: 'night',
    name: 'SORTIE 3 — NIGHT LANDING',
    goal: 'Land on the lit runway, slow and straight',
    briefing: 'Night. The runway lights are the only bright thing on the island. Come in low, slow and straight down the centreline — flare under 90 knots and put her down on the strip.',
    timeOfDay: 'night',
    ringCount: 0,
    start: { x: -2400, y: 420, z: 3000, heading: 0.0 },
    runway: { x: 0, z: -600 },
  },
];

// Palette: one style for sky, sea, land and instruments.
export const PALETTE = {
  morning: { skyTop: '#2f6fb8', skyMid: '#7fb2e0', skyLow: '#cfe6f5', sun: '#fff3c4', sea: '#2e7fa8', haze: 'rgba(207,230,245,0.55)' },
  storm: { skyTop: '#232a3d', skyMid: '#4a5568', skyLow: '#8a7f6a', sun: '#e8d9a8', sea: '#2c4a5e', haze: 'rgba(138,127,106,0.5)' },
  night: { skyTop: '#050914', skyMid: '#0d1b33', skyLow: '#1d2f4d', sun: '#f4ead0', sea: '#0a1a2c', haze: 'rgba(13,27,51,0.6)' },
};

export const KEYS = {
  pitchUp: ['ArrowUp', 'KeyW'],
  pitchDown: ['ArrowDown', 'KeyS'],
  bankLeft: ['ArrowLeft', 'KeyA'],
  bankRight: ['ArrowRight', 'KeyD'],
  throttleUp: ['ShiftLeft', 'ShiftRight', 'KeyE'],
  throttleDown: ['ControlLeft', 'ControlRight', 'KeyQ'],
  pause: ['KeyP', 'Escape'],
  restart: ['KeyR'],
  mute: ['KeyM'],
  confirm: ['Enter', 'Space'],
};

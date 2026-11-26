// Meridian Run — the fixed world: islands, sea, runway, rings, storm towers, birds, pickups.
// One job: where everything in the archipelago sits, and how high the ground is there.
// The scene is fixed and finite: the same islands, the same runway, every flight.

import { WORLD } from './config.js';

// Deterministic pseudo-random from a seed, so the world never changes between loads.
export function seededRandom(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Island peaks: [x, z, radius, height]. A smooth hill per island, flat sea between them.
export const ISLANDS = [
  { x: 0, z: -600, radius: 1500, height: 150, name: 'Meridian Isle' },
  { x: -2100, z: 900, radius: 1100, height: 260, name: 'Gull Rock' },
  { x: 2200, z: 700, radius: 950, height: 210, name: 'Sailor’s Rest' },
  { x: -1500, z: -2600, radius: 900, height: 330, name: 'Storm Ridge' },
  { x: 1800, z: -2500, radius: 1000, height: 180, name: 'Beacon Cay' },
  { x: 0, z: 2600, radius: 800, height: 120, name: 'Home Reef' },
  { x: 3100, z: -800, radius: 700, height: 150, name: 'Far Point' },
  { x: -3200, z: -1400, radius: 750, height: 190, name: 'West Hook' },
];

// The runway strip is flattened into the hilltop: real runways are graded flat,
// and a landing must be possible. Inside the strip the ground is runway level;
// it blends back to the natural hill over 160 m so there is no cliff edge.
const RUNWAY_FLAT = { x: 0, zMin: -1120, zMax: 320, halfW: 70, blend: 160, level: 4 };

function runwayBlend(x, z) {
  const dx = Math.max(0, Math.abs(x - RUNWAY_FLAT.x) - RUNWAY_FLAT.halfW);
  const dz = Math.max(0, Math.max(RUNWAY_FLAT.zMin - z, z - RUNWAY_FLAT.zMax));
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d >= RUNWAY_FLAT.blend) return 0;
  const t = 1 - d / RUNWAY_FLAT.blend;
  return t * t * (3 - 2 * t);
}

// Height of the ground at (x, z). Sea level is 0; islands rise smoothly from it.
export function groundHeightAt(x, z) {
  let h = 0;
  for (const island of ISLANDS) {
    const dx = x - island.x;
    const dz = z - island.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < island.radius) {
      const t = 1 - d / island.radius;
      h = Math.max(h, island.height * t * t * (3 - 2 * t));
    }
  }
  const flat = runwayBlend(x, z);
  if (flat > 0) h = h * (1 - flat) + RUNWAY_FLAT.level * flat;
  return h;
}

// The runway on Meridian Isle: a flat strip the island is flattened to meet.
export const RUNWAY = {
  x: 0, z: -600, length: 900, width: 46, heading: 0,
  thresholdZ: -150, // southern (approach) end; fly north along -z to land
};

// Ring trial course: 8 rings winding over the archipelago, in order.
export const RINGS = [
  { x: -1800, y: 330, z: 2400, r: 55 },
  { x: -900, y: 300, z: 1500, r: 55 },
  { x: 300, y: 360, z: 800, r: 55 },
  { x: 1400, y: 320, z: -100, r: 55 },
  { x: 900, y: 380, z: -1400, r: 55 },
  { x: -600, y: 340, z: -2200, r: 55 },
  { x: -1900, y: 300, z: -1800, r: 55 },
  { x: -700, y: 280, z: -600, r: 60 },
];

// Storm towers for sortie 2: thunderhead columns standing on the ridge.
export const STORM_TOWERS = [
  { x: -1500, y: 0, z: -2600, radius: 130, top: 900 },
  { x: -900, y: 0, z: -2400, radius: 110, top: 820 },
  { x: -2100, y: 0, z: -2300, radius: 120, top: 860 },
  { x: -300, y: 0, z: -2700, radius: 100, top: 780 },
  { x: -1200, y: 0, z: -1800, radius: 90, top: 700 },
  { x: -1800, y: 0, z: -2900, radius: 105, top: 800 },
];

// The beacon ring at the far end of the storm ridge (sortie 2 goal).
export const BEACON_RING = { x: -1500, y: 420, z: -3300, r: 70 };

// Gull flocks: moving bird hazards. Each flock circles a fixed centre.
export function makeBirdFlocks() {
  const rand = seededRandom(20261126);
  const flocks = [];
  const centres = [
    { x: -1200, z: 1200 }, { x: 800, z: -600 }, { x: -1600, z: -2000 },
    { x: 1500, z: 1800 }, { x: 0, z: 400 }, { x: -2400, z: -800 },
  ];
  for (const c of centres) {
    const birds = [];
    for (let i = 0; i < 7; i++) {
      birds.push({ angle: rand() * Math.PI * 2, radius: 40 + rand() * 60, y: 260 + rand() * 120, speed: 0.25 + rand() * 0.2 });
    }
    flocks.push({ x: c.x, z: c.z, birds, phase: rand() * Math.PI * 2 });
  }
  return flocks;
}

// Pickups: fuel drums (green) and repair kits (white cross) floating over the sea.
export function makePickups() {
  return [
    { kind: 'fuel', x: -1400, y: 300, z: 1900, taken: false },
    { kind: 'fuel', x: 800, y: 320, z: 300, taken: false },
    { kind: 'repair', x: 1200, y: 300, z: -900, taken: false },
    { kind: 'fuel', x: -1000, y: 360, z: -1900, taken: false },
    { kind: 'repair', x: -2200, y: 280, z: -1200, taken: false },
    { kind: 'fuel', x: 300, y: 300, z: -2600, taken: false },
  ];
}

// Clouds: fixed puffs placed once, drifting slowly with the wind.
export function makeClouds() {
  const rand = seededRandom(77);
  const clouds = [];
  for (let i = 0; i < 26; i++) {
    clouds.push({
      x: (rand() - 0.5) * 7800,
      z: (rand() - 0.5) * 7800,
      y: 620 + rand() * 320,
      size: 120 + rand() * 220,
      speed: 4 + rand() * 6,
    });
  }
  return clouds;
}

// Clamp a position inside the bounded airspace.
export function clampToAirspace(p) {
  p.x = Math.max(-WORLD.halfSize, Math.min(WORLD.halfSize, p.x));
  p.z = Math.max(-WORLD.halfSize, Math.min(WORLD.halfSize, p.z));
  p.y = Math.max(4, Math.min(WORLD.maxAltitude, p.y));
  return p;
}

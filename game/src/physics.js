// Meridian Run — the flight model: one fixed difficulty, same physics in every mission.
// One job: turn pilot input into position, speed, bank, pitch and fuel, and say when the
// aircraft stalls, overspeeds, clips the ground or is out of fuel.

import { FLIGHT, WORLD } from './config.js';
import { groundHeightAt, clampToAirspace } from './world.js';

// A fresh aircraft at a mission start.
export function createAircraft(start) {
  return {
    x: start.x, y: start.y, z: start.z,
    heading: start.heading, // radians, 0 = flying north (-z)
    pitch: 0,               // radians, positive = nose up
    bank: 0,                // radians, positive = bank right
    speed: 150,             // knots
    throttle: 55,           // percent
    fuel: FLIGHT.fuelCapacity,
    health: FLIGHT.healthMax,
    verticalSpeed: 0,
    shaking: 0,             // overspeed buffet, 0..1
    stalled: false,
    landed: false,
  };
}

// One physics step. dt is seconds (clamped by the caller). input is {pitch, bank, throttle}
// with each axis -1..1, plus a storm flag that adds turbulence.
export function stepFlight(plane, input, dt, stormy) {
  // Throttle: hold to spool up or down, then ease toward the throttle's target speed.
  // Full throttle levels out near 320 knots — fast and shaking, but the airframe only
  // comes apart past 330, which takes a dive as well as full power.
  plane.throttle = Math.max(0, Math.min(100, plane.throttle + input.throttle * FLIGHT.throttleStep * dt));
  const targetSpeed = 40 + plane.throttle * 2.8;
  plane.speed += (targetSpeed - plane.speed) * Math.min(1, dt * 0.55);
  if (plane.pitch < -0.08) plane.speed += (-plane.pitch) * 42 * dt; // a dive buys speed

  // Pitch and bank chase the stick, with a little smoothing so the nose never snaps.
  const targetPitch = input.pitch * FLIGHT.maxPitch;
  plane.pitch += (targetPitch - plane.pitch) * Math.min(1, dt * 3.2);
  const targetBank = input.bank * FLIGHT.maxBank;
  plane.bank += (targetBank - plane.bank) * Math.min(1, dt * 2.6);

  // Turning: bank turns the nose. A steeper bank turns faster but bleeds speed.
  const turnRate = FLIGHT.turnRate * Math.sin(plane.bank);
  plane.heading += turnRate * dt * (plane.speed / FLIGHT.cruiseSpeed);
  if (plane.speed > FLIGHT.overspeedWarn) plane.speed -= 14 * dt * Math.sin(Math.abs(plane.bank));

  // Vertical speed from pitch and speed; a slow wing sinks.
  const lift = Math.max(0, (plane.speed - 30) / FLIGHT.cruiseSpeed);
  plane.verticalSpeed = Math.sin(plane.pitch) * plane.speed * 0.514 * lift;
  if (plane.speed < FLIGHT.stallSpeed) plane.verticalSpeed -= (FLIGHT.stallSpeed - plane.speed) * 0.35;

  // Storm turbulence: the ridge shakes the airframe and nudges the nose.
  if (stormy) {
    plane.pitch += (Math.random() - 0.5) * 0.35 * dt;
    plane.bank += (Math.random() - 0.5) * 0.5 * dt;
    plane.verticalSpeed += (Math.random() - 0.5) * 6 * dt;
  }

  // Move forward along the heading, and up or down with the pitch.
  const forward = plane.speed * 0.514 * dt; // knots -> m/s
  plane.x += Math.sin(plane.heading) * forward * Math.cos(plane.pitch);
  plane.z -= Math.cos(plane.heading) * forward * Math.cos(plane.pitch);
  plane.y += plane.verticalSpeed * dt;
  clampToAirspace(plane);

  // Fuel burns faster at full throttle, slower when throttled back.
  const burn = FLIGHT.fuelBurnBase + (plane.throttle / 100) * FLIGHT.fuelBurnFull;
  plane.fuel = Math.max(0, plane.fuel - burn * dt);
  if (plane.fuel <= 0 && plane.speed > 60) plane.speed = Math.max(55, plane.speed - 40 * dt);

  // Overspeed buffet grows past the red line.
  plane.shaking = plane.speed > FLIGHT.overspeedWarn
    ? Math.min(1, (plane.speed - FLIGHT.overspeedWarn) / 40)
    : 0;

  // Stall: too slow and the wing quits — the nose drops and the aircraft falls.
  plane.stalled = plane.speed < FLIGHT.stallSpeed && plane.y > groundHeightAt(plane.x, plane.z) + 8;
  return plane;
}

// What the ground does to the aircraft right now: 'air', 'ground' (touching terrain) or
// 'runway' (touching the strip). Landing counts only on the runway, slow and level.
export function groundContact(plane, runway) {
  const ground = groundHeightAt(plane.x, plane.z);
  if (plane.y > ground + 6) return 'air';
  const onStrip = Math.abs(plane.x - runway.x) < runway.width / 2 + 6
    && plane.z > runway.z - runway.length / 2 - 20
    && plane.z < runway.z + runway.length / 2 + 20;
  return onStrip ? 'runway' : 'ground';
}

// A clean landing: on the strip, slow, wings near level, sinking gently.
export function isCleanLanding(plane) {
  return plane.speed < 95
    && Math.abs(plane.bank) < 0.25
    && Math.abs(plane.pitch) < 0.2
    && plane.verticalSpeed > -6;
}

// Distance in 3D between the aircraft nose and a point.
export function distanceTo(plane, point) {
  const dx = plane.x - point.x;
  const dy = plane.y - point.y;
  const dz = plane.z - point.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Heading in degrees, 0 = north, clockwise — what the HUD compass shows.
export function headingDegrees(plane) {
  return ((plane.heading * 180 / Math.PI) % 360 + 360) % 360;
}

// Altitude above the ground right now (AGL), for the HUD.
export function altitudeAgl(plane) {
  return Math.max(0, plane.y - groundHeightAt(plane.x, plane.z));
}

export { WORLD };

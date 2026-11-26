// Meridian Run — game state: screens, missions, collisions, scoring, win and lose.
// One job: own the rules. Physics flies the aircraft, the renderer draws it; this file
// decides what counts, what hurts, and when a sortie is won or lost.

import { FLIGHT, MISSIONS, KEYS } from './config.js';
import {
  RINGS, BEACON_RING, STORM_TOWERS, RUNWAY,
  makeBirdFlocks, makePickups, makeClouds, groundHeightAt,
} from './world.js';
import { createAircraft, stepFlight, groundContact, isCleanLanding, distanceTo } from './physics.js';

export function createGame() {
  const game = {
    screen: 'menu', // menu | briefing | playing | paused | win | gameover
    missionIndex: 0,
    mission: MISSIONS[0],
    plane: null,
    score: 0,
    bestScore: 0,
    ringsCleared: 0,
    beaconReached: false,
    rings: [],
    stormTowers: [],
    birdFlocks: makeBirdFlocks(),
    pickups: makePickups(),
    clouds: makeClouds(),
    time: 0,
    muted: false,
    endTitle: '',
    endText: '',
    target: null,
    stallWarned: false,
    statusText: 'Meridian Run ready.',
    // Screenshot presets (?shot=...) place the aircraft in a photogenic spot.
    shotMode: null,

    get timeOfDay() {
      return this.mission.timeOfDay;
    },

    get missionProgress() {
      if (this.mission.id === 'rings') return this.ringsCleared / this.rings.length;
      if (this.mission.id === 'storm') return this.beaconReached ? 1 : this.plane ? Math.max(0, (3400 - this.plane.z) / 6800) : 0;
      if (this.mission.id === 'night') {
        if (!this.plane) return 0;
        const d = distanceTo(this.plane, { x: RUNWAY.x, y: 10, z: RUNWAY.z });
        return Math.max(0, Math.min(1, 1 - d / 5200));
      }
      return 0;
    },

    startMission(index) {
      this.missionIndex = index;
      this.mission = MISSIONS[index];
      this.plane = createAircraft(this.mission.start);
      this.rings = this.mission.id === 'rings'
        ? RINGS.map((r) => ({ ...r }))
        : this.mission.id === 'storm' ? [{ ...BEACON_RING }] : [];
      this.ringsCleared = 0;
      this.beaconReached = false;
      this.stormTowers = this.mission.id === 'storm' ? STORM_TOWERS.map((t) => ({ ...t })) : [];
      this.pickups = makePickups();
      this.stallWarned = false;
      this.screen = 'briefing';
      this.updateTarget();
      this.statusText = `${this.mission.name} briefed.`;
    },

    beginFlying() {
      this.screen = 'playing';
      this.statusText = `${this.mission.name} — flying.`;
    },

    toMenu() {
      this.screen = 'menu';
      this.missionIndex = 0;
      this.mission = MISSIONS[0];
      this.plane = createAircraft(this.mission.start);
      this.score = 0;
      this.updateTarget();
      this.statusText = 'Meridian Run ready.';
    },

    updateTarget() {
      if (!this.plane) { this.target = null; return; }
      if (this.mission.id === 'rings' && this.ringsCleared < this.rings.length) {
        const ring = this.rings[this.ringsCleared];
        this.target = { x: ring.x, y: ring.y, z: ring.z, label: `RING ${this.ringsCleared + 1}/${this.rings.length}` };
      } else if (this.mission.id === 'storm' && !this.beaconReached) {
        this.target = { x: BEACON_RING.x, y: BEACON_RING.y, z: BEACON_RING.z, label: 'BEACON' };
      } else if (this.mission.id === 'night') {
        this.target = { x: RUNWAY.x, y: 10, z: RUNWAY.z, label: 'RUNWAY 18' };
      } else {
        this.target = null;
      }
    },

    // --- endings ------------------------------------------------------------
    winSortie(text) {
      const bonus = FLIGHT.missionBonus;
      this.score += bonus;
      if (this.score > this.bestScore) this.bestScore = this.score;
      this.endTitle = 'SORTIE COMPLETE';
      this.endText = `${text} Mission bonus +${bonus} points. The debrief board is already chalking up your name.`;
      this.screen = 'win';
      this.statusText = `Sortie complete: ${Math.round(this.score)} points.`;
    },

    loseSortie(title, text) {
      if (this.score > this.bestScore) this.bestScore = this.score;
      this.endTitle = title;
      this.endText = text;
      this.screen = 'gameover';
      this.statusText = `${title}: ${Math.round(this.score)} points.`;
    },

    // --- per-frame update while flying --------------------------------------
    update(dt, input, sound) {
      this.time += dt;
      // Clouds drift with the wind; birds circle their flocks.
      for (const cloud of this.clouds) {
        cloud.x += cloud.speed * dt;
        if (cloud.x > 4200) cloud.x = -4200;
      }
      if (this.screen !== 'playing' || !this.plane) return;
      const axes = input.flightAxes();
      const stormy = this.mission.id === 'storm';
      stepFlight(this.plane, axes, dt, stormy);
      const plane = this.plane;

      // Stall warning, once per stall, then a stall crash if the wing never recovers.
      if (plane.stalled && !this.stallWarned) {
        this.stallWarned = true;
        sound.stallWarning();
      }
      if (!plane.stalled) this.stallWarned = false;
      if (plane.stalled && plane.y - groundHeightAt(plane.x, plane.z) < 25) {
        sound.crashSound();
        this.loseSortie('STALLED OUT', 'The wing stopped flying below 62 knots and the aircraft fell out of the sky. Keep the speed up — throttle is life, and the nose must stay down until the wing bites again.');
        return;
      }

      // Overspeed: past the red line the airframe comes apart.
      if (plane.speed > FLIGHT.maxSpeed) {
        sound.crashSound();
        this.loseSortie('AIRFRAME FAILURE', 'Past 330 knots the airframe shook itself apart. The red line on the dial is not a suggestion — throttle back before the shaking starts.');
        return;
      }

      // Out of fuel: the engine quits and the aircraft glides down, out of luck.
      if (plane.fuel <= 0 && plane.y - groundHeightAt(plane.x, plane.z) < 30) {
        sound.crashSound();
        this.loseSortie('OUT OF FUEL', 'The tanks ran dry over open water. A green fuel drum was out there somewhere — throttle discipline and the drums are what bring a test pilot home.');
        return;
      }

      // Ground contact: runway landing, or a crash into terrain or sea.
      const contact = groundContact(plane, RUNWAY);
      if (contact === 'ground') {
        sound.crashSound();
        this.loseSortie('CONTROLLED FLIGHT INTO TERRAIN', 'The aircraft met the island the hard way. Watch the altitude tape and the attitude ball — the ground in the Meridian archipelago is never as far away as it looks.');
        return;
      }
      if (contact === 'runway') {
        if (this.mission.id === 'night') {
          if (isCleanLanding(plane)) {
            plane.landed = true;
            this.score += FLIGHT.landingScore;
            sound.winFanfare();
            this.winSortie(`Wheels down on Runway 18 at ${Math.round(plane.speed)} knots, straight down the centreline. The night landing is in the book.`);
            return;
          }
          sound.crashSound();
          this.loseSortie('RUNWAY OVERRUN', 'You reached the strip too fast, too steep, or banked over. A landing counts only slow, level and on the centreline — come back around and fly the approach like you mean it.');
          return;
        }
        // Touching the strip in sorties 1 and 2 is a crash: this is a flying test, not a landing.
        sound.crashSound();
        this.loseSortie('CONTROLLED FLIGHT INTO TERRAIN', 'The aircraft clipped the runway while the sortie still needed altitude. In sorties 1 and 2 the strip is scenery — stay in the air until the mission is done.');
        return;
      }

      // Storm towers: a solid column of thunderhead.
      for (const tower of this.stormTowers) {
        const dx = plane.x - tower.x;
        const dz = plane.z - tower.z;
        const horizontal = Math.sqrt(dx * dx + dz * dz);
        if (horizontal < tower.radius && plane.y < tower.top) {
          plane.health -= 55;
          sound.collisionThud();
          // Shove the aircraft clear so one tower cannot hit twice in a row.
          plane.x = tower.x + (dx / (horizontal || 1)) * (tower.radius + 80);
          plane.z = tower.z + (dz / (horizontal || 1)) * (tower.radius + 80);
          if (plane.health <= 0) {
            sound.crashSound();
            this.loseSortie('LOST IN THE STORM', 'A thunderhead tore the aircraft apart. The ridge is crossed through the gap, never through the cloud — the towers are solid, and the storm always wins a head-on argument.');
            return;
          }
        }
      }

      // Gull flocks: a strike costs hull and rattles the pilot.
      for (const flock of this.birdFlocks) {
        for (const bird of flock.birds) {
          const angle = bird.angle + this.time * bird.speed + flock.phase;
          const bx = flock.x + Math.cos(angle) * bird.radius;
          const bz = flock.z + Math.sin(angle) * bird.radius;
          if (distanceTo(plane, { x: bx, y: bird.y, z: bz }) < 16) {
            plane.health -= 12;
            sound.collisionThud();
            bird.angle += 1.2; // the flock scatters
            if (plane.health <= 0) {
              sound.crashSound();
              this.loseSortie('BIRD STRIKE', 'A gull came through the canopy at 170 knots. The flocks ride the updrafts over the islands — give the circling birds a wide berth, or pay for the airframe in feathers.');
              return;
            }
          }
        }
      }

      // Rings: fly through the next one to score.
      if (this.ringsCleared < this.rings.length) {
        const ring = this.rings[this.ringsCleared];
        if (distanceTo(plane, ring) < ring.r) {
          this.ringsCleared += 1;
          this.score += FLIGHT.ringScore;
          sound.ringChime();
          if (this.mission.id === 'rings' && this.ringsCleared >= this.rings.length) {
            sound.winFanfare();
            this.winSortie('All eight rings threaded, clean and in order. The trial course is yours.');
            return;
          }
          if (this.mission.id === 'storm') {
            this.beaconReached = true;
            sound.winFanfare();
            this.winSortie('Beacon reached through the storm ridge. The thunderheads are behind you and the course is clear.');
            return;
          }
          this.updateTarget();
        }
      }

      // Pickups: fuel drums and repair kits.
      for (const pickup of this.pickups) {
        if (pickup.taken) continue;
        if (distanceTo(plane, pickup) < 34) {
          pickup.taken = true;
          this.score += FLIGHT.pickupScore;
          sound.pickupJingle();
          if (pickup.kind === 'fuel') {
            plane.fuel = Math.min(FLIGHT.fuelCapacity, plane.fuel + 35);
            this.statusText = 'Fuel drum collected: +35 fuel.';
          } else {
            plane.health = Math.min(FLIGHT.healthMax, plane.health + 40);
            this.statusText = 'Repair kit collected: hull +40.';
          }
        }
      }

      // Score trickles in for clean, fast flying on course (kept fractional here;
      // the HUD rounds it, so a frame's 0.1 points never rounds away to nothing).
      if (plane.speed > 120 && plane.speed < FLIGHT.overspeedWarn && !plane.stalled) {
        this.score += dt * 6;
      }
      this.updateTarget();
    },

    // --- input routing for menus and buttons ---------------------------------
    handleButton(id, sound) {
      sound.click();
      if (id === 'start') this.startMission(0);
      else if (id === 'fly') this.beginFlying();
      else if (id === 'resume') this.screen = 'playing';
      else if (id === 'restart') this.startMission(this.missionIndex);
      else if (id === 'menu') this.toMenu();
      else if (id === 'sound') {
        this.muted = !this.muted;
        sound.setMuted(this.muted);
      } else if (id === 'again') {
        if (this.screen === 'win' && this.missionIndex < 2) this.startMission(this.missionIndex + 1);
        else this.startMission(this.missionIndex);
      }
    },

    // --- screenshot presets: deterministic, photogenic, mid-flight states -----
    applyShot(shot) {
      this.shotMode = shot;
      if (shot === 'cover' || shot === 'play') {
        // Chase view mid-trial: next ring ahead, runway below, instruments lit.
        this.startMission(0);
        this.screen = 'playing';
        this.plane.x = -1200; this.plane.y = 330; this.plane.z = 1900;
        this.plane.heading = 0.72; this.plane.speed = 185; this.plane.throttle = 62;
        this.plane.pitch = 0.04; this.plane.bank = 0.10;
        this.score = 1250; this.ringsCleared = 2;
        this.updateTarget();
      } else if (shot === 'storm') {
        // East of the beacon, flying west down the ridge line: thunderheads
        // flank the course and the amber beacon ring stands ahead.
        this.startMission(1);
        this.screen = 'playing';
        this.plane.x = 200; this.plane.y = 430; this.plane.z = -3150;
        this.plane.heading = -1.57; this.plane.speed = 175; this.plane.throttle = 58;
        this.plane.pitch = 0.02; this.plane.bank = 0.15;
        this.score = 2600; this.ringsCleared = 0;
        this.updateTarget();
      } else if (shot === 'night') {
        // Final approach at night: slow, low, straight at the lit runway.
        this.startMission(2);
        this.screen = 'playing';
        this.plane.x = -80; this.plane.y = 120; this.plane.z = 900;
        this.plane.heading = 0.02; this.plane.speed = 92; this.plane.throttle = 16;
        this.plane.pitch = -0.06; this.plane.bank = 0.02;
        this.score = 4100;
        this.updateTarget();
      } else if (shot === 'menu') {
        this.toMenu();
      }
    },
  };
  game.plane = createAircraft(MISSIONS[0].start);
  game.updateTarget();
  return game;
}

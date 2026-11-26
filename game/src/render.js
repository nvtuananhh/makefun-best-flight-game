// Meridian Run — the renderer: chase view, terrain, sky, aircraft, HUD and every screen.
// One job: turn the game state into one readable frame, at 60 FPS, with no assets at all.
// The 3D is a hand-rolled projection: the camera sits behind the aircraft, banks with it,
// and the fixed archipelago is drawn far-to-near as shaded triangles.

import { PALETTE, FLIGHT } from './config.js';
import { ISLANDS, RUNWAY, groundHeightAt } from './world.js';
import { headingDegrees, altitudeAgl } from './physics.js';

const GRID_STEP = 260;
const GRID_HALF = 4200;

function lerpColor(a, b, t) {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}

function rgb(c, alpha) {
  return alpha === undefined ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

// Terrain colour by height, one style in every light.
function terrainColor(height, timeOfDay) {
  let c;
  if (height < 6) c = lerpColor([194, 178, 128], [210, 196, 150], height / 6);       // sand
  else if (height < 90) c = lerpColor([86, 140, 74], [120, 165, 90], height / 90);   // grass
  else if (height < 200) c = lerpColor([110, 125, 90], [140, 135, 110], (height - 90) / 110); // scrub
  else if (height < 280) c = lerpColor([120, 110, 100], [150, 145, 135], (height - 200) / 80); // rock
  else c = lerpColor([190, 190, 195], [235, 238, 245], Math.min(1, (height - 280) / 50));      // snow
  if (timeOfDay === 'night') c = c.map((v) => Math.round(v * 0.32));
  else if (timeOfDay === 'storm') c = c.map((v) => Math.round(v * 0.72));
  return c;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const renderer = {
    canvas, ctx, w: 0, h: 0,
    buttons: [], // clickable buttons drawn this frame: {id, x, y, w, h}
    stars: [],

    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = canvas.clientWidth;
      this.h = canvas.clientHeight;
      canvas.width = Math.round(this.w * dpr);
      canvas.height = Math.round(this.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },

    initStars() {
      let seed = 12345;
      const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      this.stars = [];
      for (let i = 0; i < 140; i++) this.stars.push({ x: rand(), y: rand() * 0.55, r: 0.5 + rand() * 1.4, tw: rand() * Math.PI * 2 });
    },

    // Project a world point into screen space. Returns null when behind the camera.
    project(p, cam) {
      const dx = p.x - cam.x;
      const dy = p.y - cam.y;
      const dz = p.z - cam.z;
      const fwd = dx * cam.fx + dy * cam.fy + dz * cam.fz;
      if (fwd < 8) return null;
      const right = dx * cam.rx + dy * cam.ry + dz * cam.rz;
      const up = dx * cam.ux + dy * cam.uy + dz * cam.uz;
      const f = this.h * 0.95;
      return { x: this.w / 2 + (right / fwd) * f, y: this.h * 0.56 - (up / fwd) * f, d: fwd, s: f / fwd };
    },

    // Camera basis from the aircraft: behind it, above it, looking where it looks.
    cameraFor(plane) {
      const shake = plane.shaking * 2.2;
      const shX = (Math.random() - 0.5) * shake;
      const shY = (Math.random() - 0.5) * shake;
      const fx = Math.sin(plane.heading) * Math.cos(plane.pitch);
      const fy = Math.sin(plane.pitch);
      const fz = -Math.cos(plane.heading) * Math.cos(plane.pitch);
      const cam = {
        x: plane.x - fx * 30 + shX, y: plane.y - fy * 30 + 7 + shY, z: plane.z - fz * 30,
        fx, fy, fz, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0,
      };
      // Right = forward x world-up, then up = right x forward; roll by the bank.
      let rx = -fz, ry = 0, rz = fx;
      const rl = Math.hypot(rx, ry, rz) || 1;
      rx /= rl; ry /= rl; rz /= rl;
      let ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
      const cosB = Math.cos(plane.bank * 0.55), sinB = Math.sin(plane.bank * 0.55);
      const nrx = rx * cosB + ux * sinB, nry = ry * cosB + uy * sinB, nrz = rz * cosB + uz * sinB;
      const nux = -rx * sinB + ux * cosB, nuy = -ry * sinB + uy * cosB, nuz = -rz * sinB + uz * cosB;
      cam.rx = nrx; cam.ry = nry; cam.rz = nrz;
      cam.ux = nux; cam.uy = nuy; cam.uz = nuz;
      return cam;
    },
  };
  renderer.initStars();
  return renderer;
}

// ---- sky, sea and terrain -------------------------------------------------

function drawSky(r, scene) {
  const { ctx, w, h } = r;
  const pal = PALETTE[scene.timeOfDay];
  const horizonY = h * 0.56 - scene.plane.pitch * h * 0.9;
  const grad = ctx.createLinearGradient(0, 0, 0, Math.max(horizonY, 1));
  grad.addColorStop(0, pal.skyTop);
  grad.addColorStop(0.65, pal.skyMid);
  grad.addColorStop(1, pal.skyLow);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, Math.max(horizonY, 0));
  // Sea below the horizon.
  ctx.fillStyle = pal.sea;
  ctx.fillRect(0, Math.max(horizonY, 0), w, h - Math.max(horizonY, 0));
  // Sun or moon, fixed in the sky so the pilot can steer by it.
  const sunX = w * 0.78, sunY = Math.min(horizonY - 90, h * 0.2);
  ctx.fillStyle = pal.sun;
  ctx.beginPath();
  ctx.arc(sunX, sunY, scene.timeOfDay === 'night' ? 26 : 34, 0, Math.PI * 2);
  ctx.fill();
  if (scene.timeOfDay !== 'night') {
    ctx.fillStyle = 'rgba(255,243,196,0.35)';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 52, 0, Math.PI * 2);
    ctx.fill();
  }
  if (scene.timeOfDay === 'night') {
    for (const star of r.stars) {
      const a = 0.4 + 0.6 * Math.abs(Math.sin(scene.time * 1.5 + star.tw));
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
      ctx.fillRect(star.x * w, star.y * h, star.r, star.r);
    }
  }
}

function drawTerrain(r, scene, cam) {
  const { ctx } = r;
  const quads = [];
  for (let gx = -GRID_HALF; gx < GRID_HALF; gx += GRID_STEP) {
    for (let gz = -GRID_HALF; gz < GRID_HALF; gz += GRID_STEP) {
      const h00 = groundHeightAt(gx, gz);
      const h10 = groundHeightAt(gx + GRID_STEP, gz);
      const h01 = groundHeightAt(gx, gz + GRID_STEP);
      const h11 = groundHeightAt(gx + GRID_STEP, gz + GRID_STEP);
      const maxH = Math.max(h00, h10, h01, h11);
      if (maxH < 2) continue; // open sea: already painted
      const cx = gx + GRID_STEP / 2, cz = gz + GRID_STEP / 2;
      const dx = cx - cam.x, dz = cz - cam.z;
      const depth = dx * cam.fx + dz * cam.fz;
      if (depth < 0 || depth > 4500) continue; // behind the camera or past the far haze
      quads.push({ gx, gz, h00, h10, h01, h11, maxH, depth });
    }
  }
  quads.sort((a, b) => b.depth - a.depth);
  for (const q of quads) {
    const p00 = r.project({ x: q.gx, y: q.h00, z: q.gz }, cam);
    const p10 = r.project({ x: q.gx + GRID_STEP, y: q.h10, z: q.gz }, cam);
    const p01 = r.project({ x: q.gx, y: q.h01, z: q.gz + GRID_STEP }, cam);
    const p11 = r.project({ x: q.gx + GRID_STEP, y: q.h11, z: q.gz + GRID_STEP }, cam);
    if (!p00 || !p10 || !p01 || !p11) continue;
    // Shade by slope facing: brighter where the ground faces the sun.
    const shade = 0.92 + 0.08 * Math.sin((q.h10 - q.h00) * 0.05);
    const base = terrainColor(q.maxH, scene.timeOfDay).map((v) => Math.round(v * shade));
    ctx.fillStyle = rgb(base);
    ctx.beginPath();
    ctx.moveTo(p00.x, p00.y);
    ctx.lineTo(p10.x, p10.y);
    ctx.lineTo(p11.x, p11.y);
    ctx.lineTo(p01.x, p01.y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawRunway(r, scene, cam) {
  const { ctx } = r;
  const rw = RUNWAY;
  const half = rw.length / 2;
  const corners = [
    { x: rw.x - rw.width / 2, y: 4, z: rw.z - half },
    { x: rw.x + rw.width / 2, y: 4, z: rw.z - half },
    { x: rw.x + rw.width / 2, y: 4, z: rw.z + half },
    { x: rw.x - rw.width / 2, y: 4, z: rw.z + half },
  ];
  const pts = corners.map((c) => r.project(c, cam));
  if (pts.some((p) => !p)) return;
  ctx.fillStyle = scene.timeOfDay === 'night' ? '#2a2f38' : '#3a3f47';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
  // Centreline dashes.
  ctx.strokeStyle = '#f5d76e';
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 18]);
  ctx.beginPath();
  const a = r.project({ x: rw.x, y: 5, z: rw.z - half + 20 }, cam);
  const b = r.project({ x: rw.x, y: 5, z: rw.z + half - 20 }, cam);
  if (a && b) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
  ctx.stroke();
  ctx.setLineDash([]);
  // Edge and threshold lights — bright at night, the thing the pilot aims at.
  const lightColor = scene.timeOfDay === 'night' ? '#7dffb0' : '#cfe8ff';
  ctx.fillStyle = lightColor;
  for (let i = 0; i <= 8; i++) {
    const z = rw.z - half + (i / 8) * rw.length;
    for (const side of [-1, 1]) {
      const p = r.project({ x: rw.x + side * (rw.width / 2 + 3), y: 5, z }, cam);
      if (p) { ctx.beginPath(); ctx.arc(p.x, p.y, scene.timeOfDay === 'night' ? 3.5 : 2, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  // Runway number painted at the threshold.
  const label = r.project({ x: rw.x, y: 6, z: rw.z + half - 60 }, cam);
  if (label && label.d < 2500) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(10, Math.round(900 / label.d))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('18', label.x, label.y);
  }
}

function drawRing(r, scene, cam, ring, state) {
  const { ctx } = r;
  const c = r.project(ring, cam);
  if (!c || c.d < 20) return;
  const radius = Math.max(4, ring.r * c.s);
  const pulse = 1 + 0.06 * Math.sin(scene.time * 5);
  ctx.lineWidth = Math.max(2, radius * 0.09);
  if (state === 'next') {
    ctx.strokeStyle = '#ffb020';
    ctx.shadowColor = '#ffb020';
    ctx.shadowBlur = 18;
  } else if (state === 'done') {
    ctx.strokeStyle = 'rgba(90,255,140,0.85)';
    ctx.shadowBlur = 0;
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.shadowBlur = 0;
  }
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, radius * pulse, radius * pulse * 0.96, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Chevrons on the next ring so the pilot can read it at a glance.
  if (state === 'next') {
    ctx.fillStyle = '#ffb020';
    ctx.font = `bold ${Math.max(12, Math.round(radius * 0.35))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('NEXT', c.x, c.y - radius - 10);
  }
}

function drawStormTower(r, scene, cam, tower) {
  const { ctx } = r;
  const base = r.project({ x: tower.x, y: 0, z: tower.z }, cam);
  const top = r.project({ x: tower.x, y: tower.top, z: tower.z }, cam);
  if (!base || !top) return;
  const width = Math.max(6, tower.radius * 2 * base.s);
  const grad = ctx.createLinearGradient(0, top.y, 0, base.y);
  grad.addColorStop(0, '#3a4152');
  grad.addColorStop(0.6, '#4c5468');
  grad.addColorStop(1, '#232936');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(top.x - width * 0.32, top.y);
  ctx.lineTo(top.x + width * 0.32, top.y);
  ctx.lineTo(base.x + width * 0.5, base.y);
  ctx.lineTo(base.x - width * 0.5, base.y);
  ctx.closePath();
  ctx.fill();
  // Anvil top: a dark mushroom cap.
  ctx.fillStyle = '#5a6274';
  ctx.beginPath();
  ctx.ellipse(top.x, top.y, width * 0.55, width * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  // Lightning flicker inside the nearest towers.
  if (base.d < 1800 && Math.sin(scene.time * 9 + tower.x) > 0.86) {
    ctx.strokeStyle = '#ffe66d';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(top.x, top.y + 10);
    ctx.lineTo(top.x - 8, top.y + 60);
    ctx.lineTo(top.x + 6, top.y + 110);
    ctx.lineTo(top.x - 4, top.y + 170);
    ctx.stroke();
  }
}

function drawClouds(r, scene, cam) {
  const { ctx } = r;
  for (const cloud of scene.clouds) {
    const p = r.project(cloud, cam);
    if (!p || p.d < 30) continue;
    const size = cloud.size * p.s;
    if (size < 4) continue;
    const night = scene.timeOfDay === 'night';
    const storm = scene.timeOfDay === 'storm';
    ctx.fillStyle = night ? 'rgba(120,140,175,0.5)' : storm ? 'rgba(88,94,110,0.85)' : 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, size, size * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(p.x - size * 0.5, p.y + size * 0.08, size * 0.6, size * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBirds(r, scene, cam) {
  const { ctx } = r;
  ctx.strokeStyle = '#1c2430';
  ctx.lineWidth = 2;
  for (const flock of scene.birdFlocks) {
    for (const bird of flock.birds) {
      const angle = bird.angle + scene.time * bird.speed + flock.phase;
      const bx = flock.x + Math.cos(angle) * bird.radius;
      const bz = flock.z + Math.sin(angle) * bird.radius;
      const p = r.project({ x: bx, y: bird.y, z: bz }, cam);
      if (!p || p.d > 1200) continue;
      const s = Math.max(3, 260 / p.d);
      const flap = Math.sin(scene.time * 10 + bird.angle * 7) * s * 0.5;
      ctx.beginPath();
      ctx.moveTo(p.x - s, p.y - flap);
      ctx.lineTo(p.x, p.y);
      ctx.lineTo(p.x + s, p.y - flap);
      ctx.stroke();
    }
  }
}

function drawPickups(r, scene, cam) {
  const { ctx } = r;
  for (const pickup of scene.pickups) {
    if (pickup.taken) continue;
    const p = r.project(pickup, cam);
    if (!p || p.d > 1600) continue;
    const size = Math.max(8, 900 / p.d);
    const bob = Math.sin(scene.time * 2 + pickup.x) * 3;
    const y = p.y + bob;
    ctx.save();
    ctx.shadowBlur = 14;
    if (pickup.kind === 'fuel') {
      ctx.shadowColor = '#39d353';
      ctx.fillStyle = '#2ea043';
      ctx.beginPath();
      ctx.arc(p.x, y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(size)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('F', p.x, y + 1);
      ctx.font = `bold ${Math.max(9, Math.round(size * 0.5))}px sans-serif`;
      ctx.fillText('FUEL', p.x, y + size + 10);
    } else {
      ctx.shadowColor = '#ffffff';
      ctx.fillStyle = '#e8eef5';
      ctx.beginPath();
      ctx.arc(p.x, y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d23b3b';
      ctx.fillRect(p.x - size * 0.55, y - size * 0.18, size * 1.1, size * 0.36);
      ctx.fillRect(p.x - size * 0.18, y - size * 0.55, size * 0.36, size * 1.1);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(9, Math.round(size * 0.5))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('REPAIR', p.x, y + size + 10);
    }
    ctx.restore();
  }
}

// ---- the aircraft, drawn in screen space as a chase view -------------------

function drawAircraft(r, scene) {
  const { ctx, w, h } = r;
  const plane = scene.plane;
  const cx = w / 2;
  const cy = h * 0.66;
  const scale = Math.min(w, h) / 620;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(plane.bank * 0.55);
  ctx.scale(scale, scale);
  // Wings: swept, with lit tips — red left, green right, like a real aircraft.
  ctx.fillStyle = '#c8d2dd';
  ctx.beginPath();
  ctx.moveTo(-20, 6); ctx.lineTo(-168, 34); ctx.lineTo(-168, 50); ctx.lineTo(-20, 24); ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(20, 6); ctx.lineTo(168, 34); ctx.lineTo(168, 50); ctx.lineTo(20, 24); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff4d4d';
  ctx.beginPath(); ctx.arc(-168, 42, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#39d353';
  ctx.beginPath(); ctx.arc(168, 42, 4, 0, Math.PI * 2); ctx.fill();
  // Tailplane and fin.
  ctx.fillStyle = '#9fb0c2';
  ctx.beginPath();
  ctx.moveTo(-14, -78); ctx.lineTo(-64, -110); ctx.lineTo(-64, -96); ctx.lineTo(-14, -66); ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14, -78); ctx.lineTo(64, -110); ctx.lineTo(64, -96); ctx.lineTo(14, -66); ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -70); ctx.lineTo(-10, -122); ctx.lineTo(10, -122); ctx.lineTo(0, -70); ctx.closePath();
  ctx.fillStyle = '#d94f30';
  ctx.fill();
  // Fuselage: a built test jet, nose away from the camera, canopy glinting.
  const body = ctx.createLinearGradient(-24, 0, 24, 0);
  body.addColorStop(0, '#8d9aa8');
  body.addColorStop(0.5, '#e8eef5');
  body.addColorStop(1, '#8d9aa8');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-22, 30);
  ctx.quadraticCurveTo(-26, -60, -9, -105);
  ctx.quadraticCurveTo(0, -118, 9, -105);
  ctx.quadraticCurveTo(26, -60, 22, 30);
  ctx.quadraticCurveTo(0, 46, -22, 30);
  ctx.fill();
  // Canopy.
  ctx.fillStyle = '#1d4e89';
  ctx.beginPath();
  ctx.ellipse(0, -72, 12, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-3, -80, 3, 8, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // Engine glow and registration.
  ctx.fillStyle = plane.throttle > 10 ? '#ff9d2e' : '#5a6470';
  ctx.beginPath(); ctx.ellipse(0, 38, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#22303e';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N-77 MERIDIAN', 0, -28);
  ctx.restore();
  // Strobe flash.
  if (Math.sin(scene.time * 6) > 0.7) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(cx, cy - 60 * scale, 3, 0, Math.PI * 2); ctx.fill();
  }
}

// ---- HUD and instruments ----------------------------------------------------

function drawHud(r, scene) {
  const { ctx, w, h } = r;
  const plane = scene.plane;
  const pad = 16;
  // Top bar.
  ctx.fillStyle = 'rgba(8,18,32,0.72)';
  ctx.fillRect(0, 0, w, 64);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`${Math.round(plane.speed)} KT`, pad, 30);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#9fc4e8';
  ctx.fillText('AIRSPEED', pad, 50);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`${Math.round(altitudeAgl(plane))} M`, 150, 30);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#9fc4e8';
  ctx.fillText('ALTITUDE AGL', 150, 50);
  // Heading compass tape.
  const hdg = headingDegrees(plane);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${String(Math.round(hdg)).padStart(3, '0')}°`, w / 2, 30);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#9fc4e8';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  ctx.fillText(dirs[Math.round(hdg / 45) % 8] + '  HEADING', w / 2, 50);
  // Score, mission, progress on the right.
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`${Math.round(scene.score).toLocaleString()} PTS`, w - pad, 30);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#9fc4e8';
  ctx.fillText(scene.mission.name, w - pad, 50);
  // Progress bar under the top bar.
  const progress = scene.missionProgress;
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(0, 64, w, 5);
  ctx.fillStyle = '#39d353';
  ctx.fillRect(0, 64, w * Math.max(0, Math.min(1, progress)), 5);
  // Left gauges: fuel and health.
  drawGauge(r, pad, h - 108, 150, 'FUEL', plane.fuel / 100, plane.fuel < 25 ? '#ff5d5d' : '#39d353');
  drawGauge(r, pad, h - 64, 150, 'HULL', plane.health / 100, plane.health < 30 ? '#ff5d5d' : '#4da3ff');
  // Throttle bar, right side.
  drawGauge(r, w - pad - 150, h - 108, 150, 'THROTTLE', plane.throttle / 100, '#ffb020');
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(`${Math.round(plane.speed)} KT  ·  ${Math.round(plane.verticalSpeed)} M/S`, w - pad, h - 64);
  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#9fc4e8';
  ctx.fillText('VERTICAL SPEED', w - pad, h - 44);
  // Artificial horizon: a lit instrument ball, bottom centre.
  drawArtificialHorizon(r, scene);
  // Target pointer: distance and direction to the next objective.
  if (scene.target) {
    const dx = scene.target.x - plane.x;
    const dz = scene.target.z - plane.z;
    const dist = Math.round(Math.sqrt(dx * dx + dz * dz));
    const bearing = ((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360;
    let diff = ((bearing - hdg + 540) % 360) - 180;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffb020';
    ctx.font = 'bold 17px sans-serif';
    const arrow = diff > 15 ? '>>' : diff < -15 ? '<<' : '^^';
    ctx.fillText(`${arrow} ${scene.target.label} ${dist} M ${arrow}`, w / 2, 96);
  }
  // Warnings, centre screen, impossible to miss.
  ctx.textAlign = 'center';
  ctx.font = 'bold 26px sans-serif';
  if (plane.stalled) {
    ctx.fillStyle = '#ff5d5d';
    ctx.fillText('STALL — NOSE DOWN, ADD POWER', w / 2, h * 0.3);
  } else if (plane.speed > FLIGHT.overspeedWarn) {
    ctx.fillStyle = '#ffb020';
    ctx.fillText('OVERSPEED — THROTTLE BACK', w / 2, h * 0.3);
  } else if (plane.fuel < 20) {
    ctx.fillStyle = '#ffb020';
    ctx.fillText('LOW FUEL — FIND A GREEN DRUM', w / 2, h * 0.3);
  }
  // Mission goal reminder, bottom centre above the horizon ball.
  ctx.fillStyle = 'rgba(8,18,32,0.72)';
  const goalText = scene.mission.goal;
  ctx.font = '15px sans-serif';
  const gw = ctx.measureText(goalText).width + 28;
  ctx.fillRect(w / 2 - gw / 2, h - 34, gw, 24);
  ctx.fillStyle = '#dbeafe';
  ctx.fillText(goalText, w / 2, h - 17);
}

function drawGauge(r, x, y, width, label, fraction, color) {
  const { ctx } = r;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9fc4e8';
  ctx.font = '12px sans-serif';
  ctx.fillText(label, x, y - 6);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x, y, width, 12);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width * Math.max(0, Math.min(1, fraction)), 12);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, 12);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(fraction * 100)}%`, x + width, y - 6);
}

function drawArtificialHorizon(r, scene) {
  const { ctx, w, h } = r;
  const plane = scene.plane;
  const cx = w / 2, cy = h - 92, radius = 42;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#2f6fb8';
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-plane.bank);
  ctx.translate(0, plane.pitch * 90);
  ctx.fillStyle = '#7a5a38';
  ctx.fillRect(-radius, 0, radius * 2, radius);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-radius, -1, radius * 2, 2);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = '#e8eef5';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Fixed wings marker.
  ctx.strokeStyle = '#ffb020';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 26, cy); ctx.lineTo(cx - 8, cy);
  ctx.moveTo(cx + 8, cy); ctx.lineTo(cx + 26, cy);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#9fc4e8';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', cx, cy + radius + 14);
}

// ---- screens -----------------------------------------------------------------

function drawButton(r, id, x, y, w, h, label, accent) {
  const { ctx } = r;
  const hover = r.mouseX >= x && r.mouseX <= x + w && r.mouseY >= y && r.mouseY <= y + h;
  ctx.fillStyle = hover ? '#ffb020' : (accent ? '#d94f30' : 'rgba(20,40,64,0.9)');
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = hover ? '#1c2430' : '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  r.buttons.push({ id, x, y, w, h });
}

function drawMenu(r, scene) {
  const { ctx, w, h } = r;
  // Dim the world behind the menu so the title reads.
  ctx.fillStyle = 'rgba(5,12,24,0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('MERIDIAN RUN', w / 2, h * 0.24);
  ctx.fillStyle = '#ffb020';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('a test pilot flies three sorties over one island archipelago', w / 2, h * 0.24 + 38);
  ctx.fillStyle = '#dbeafe';
  ctx.font = '17px sans-serif';
  const lines = [
    'SORTIE 1  Ring Trial — thread 8 rings over the islands',
    'SORTIE 2  Storm Ridge — cross the thunderheads to the beacon',
    'SORTIE 3  Night Landing — put her down on the lit runway',
    '',
    'Fly:  W/S or ↑/↓ pitch  ·  A/D or ←/→ bank and turn  ·  SHIFT / CTRL throttle',
    'P pause  ·  R restart  ·  M sound on/off  ·  Click the buttons, or press Enter',
    'Stall below 62 knots. Overspeed past 290 knots shakes the airframe apart.',
    'Watch your fuel — green drums refuel, white kits repair the hull.',
  ];
  lines.forEach((line, i) => ctx.fillText(line, w / 2, h * 0.36 + i * 26));
  const bw = 260, bh = 52;
  drawButton(r, 'start', w / 2 - bw / 2, h * 0.68, bw, bh, 'FLY SORTIE 1', true);
  drawButton(r, 'sound', w / 2 - bw / 2, h * 0.68 + 66, bw, bh, scene.muted ? 'SOUND: OFF' : 'SOUND: ON', false);
  ctx.fillStyle = '#9fc4e8';
  ctx.font = '13px sans-serif';
  ctx.fillText('Best score this session: ' + Math.round(scene.bestScore).toLocaleString() + ' pts', w / 2, h * 0.68 + 152);
}

function drawBriefing(r, scene) {
  const { ctx, w, h } = r;
  ctx.fillStyle = 'rgba(5,12,24,0.72)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb020';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText(scene.mission.name, w / 2, h * 0.3);
  ctx.fillStyle = '#ffffff';
  ctx.font = '20px sans-serif';
  ctx.fillText('Goal: ' + scene.mission.goal, w / 2, h * 0.3 + 44);
  ctx.fillStyle = '#dbeafe';
  ctx.font = '17px sans-serif';
  wrapText(ctx, scene.mission.briefing, w / 2, h * 0.42, w * 0.6, 26);
  drawButton(r, 'fly', w / 2 - 130, h * 0.66, 260, 52, 'TAKE OFF', true);
}

function drawPaused(r, scene) {
  const { ctx, w, h } = r;
  ctx.fillStyle = 'rgba(5,12,24,0.6)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText('PAUSED', w / 2, h * 0.4);
  ctx.font = '17px sans-serif';
  ctx.fillStyle = '#dbeafe';
  ctx.fillText('The aircraft holds its course. Press P or click Resume to keep flying.', w / 2, h * 0.4 + 36);
  drawButton(r, 'resume', w / 2 - 130, h * 0.52, 260, 52, 'RESUME', true);
  drawButton(r, 'restart', w / 2 - 130, h * 0.52 + 66, 260, 52, 'RESTART SORTIE', false);
  drawButton(r, 'menu', w / 2 - 130, h * 0.52 + 132, 260, 52, 'BACK TO MENU', false);
}

function drawEndScreen(r, scene, won) {
  const { ctx, w, h } = r;
  ctx.fillStyle = won ? 'rgba(6,32,16,0.72)' : 'rgba(40,8,8,0.72)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = won ? '#7dffb0' : '#ff8a8a';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText(scene.endTitle, w / 2, h * 0.3);
  ctx.fillStyle = '#ffffff';
  ctx.font = '20px sans-serif';
  wrapText(ctx, scene.endText, w / 2, h * 0.38, w * 0.62, 28);
  ctx.font = 'bold 24px sans-serif';
  ctx.fillStyle = '#ffb020';
  ctx.fillText(`SCORE  ${Math.round(scene.score).toLocaleString()} PTS`, w / 2, h * 0.58);
  if (scene.bestScore > 0) {
    ctx.fillStyle = '#9fc4e8';
    ctx.font = '16px sans-serif';
    ctx.fillText(`Best this session: ${Math.round(scene.bestScore).toLocaleString()} pts`, w / 2, h * 0.58 + 30);
  }
  const label = won && scene.missionIndex < 2 ? 'NEXT SORTIE' : (won ? 'FLY AGAIN' : 'TRY AGAIN');
  drawButton(r, 'again', w / 2 - 130, h * 0.68, 260, 52, label, true);
  drawButton(r, 'menu', w / 2 - 130, h * 0.68 + 66, 260, 52, 'BACK TO MENU', false);
}

function wrapText(ctx, text, cx, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, cx, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, yy);
}

// ---- the frame -----------------------------------------------------------------

export function renderFrame(r, scene) {
  const { ctx, w, h } = r;
  r.buttons = [];
  r.mouseX = scene.mouseX;
  r.mouseY = scene.mouseY;
  ctx.clearRect(0, 0, w, h);
  const screen = scene.screen;
  const showWorld = screen !== 'menu';
  if (showWorld) {
    const cam = r.cameraFor(scene.plane);
    drawSky(r, scene);
    drawClouds(r, scene, cam);
    drawTerrain(r, scene, cam);
    drawRunway(r, scene, cam);
    // Rings: next one amber, cleared ones green, the rest faint.
    scene.rings.forEach((ring, i) => {
      const state = i < scene.ringsCleared ? 'done' : i === scene.ringsCleared ? 'next' : 'later';
      drawRing(r, scene, cam, ring, state);
    });
    if (scene.mission.id === 'storm' && !scene.beaconReached) {
      drawRing(r, scene, cam, scene.beaconRing, 'next');
    }
    for (const tower of scene.stormTowers) drawStormTower(r, scene, cam, tower);
    drawBirds(r, scene, cam);
    drawPickups(r, scene, cam);
    drawAircraft(r, scene);
    if (screen === 'playing' || screen === 'paused') drawHud(r, scene);
  } else {
    // Menu backdrop: the archipelago at dawn from a parked chase camera.
    const parked = { ...scene.plane, heading: 0.5, pitch: 0.02, bank: 0, shaking: 0 };
    const cam = r.cameraFor(parked);
    drawSky(r, scene);
    drawClouds(r, scene, cam);
    drawTerrain(r, scene, cam);
    drawRunway(r, scene, cam);
    drawAircraft(r, scene);
  }
  if (screen === 'menu') drawMenu(r, scene);
  else if (screen === 'briefing') drawBriefing(r, scene);
  else if (screen === 'paused') drawPaused(r, scene);
  else if (screen === 'win' || screen === 'gameover') drawEndScreen(r, scene, screen === 'win');
  // Vignette: a soft dark edge so the HUD and aircraft read at any size.
  const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.75);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}

// Meridian Run — bootstrap and the engine loop.
// One job: wire input, sound, game state and renderer together, and keep one frame
// on screen at 60 FPS from the first paint, with no console errors and no blank screen.

import { createRenderer, renderFrame } from './render.js';
import { createGame } from './game.js';
import { createInput } from './input.js';
import { createSoundEngine } from './audio.js';
import { KEYS } from './config.js';

const canvas = document.getElementById('game');
const statusLine = document.getElementById('status');
const renderer = createRenderer(canvas);
const game = createGame();
const input = createInput(canvas);
const sound = createSoundEngine();

function fitCanvas() {
  renderer.resize();
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// Screenshot presets: ?shot=cover|play|storm|night|menu renders a fixed, photogenic state
// so the maker's screenshots are real renders of the game's own code, mid-flight.
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot) {
  game.applyShot(shot);
}

// Read the shot state back to the page title, so a screenshot run can prove what it shows.
if (shot) document.title = `Meridian Run — ${shot}`;

let lastTime = performance.now();
let lastStatus = '';

function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;

  // Global keys, on any screen.
  if (input.wasPressed(...KEYS.mute)) {
    game.muted = !game.muted;
    sound.setMuted(game.muted);
  }
  if (input.wasPressed(...KEYS.restart) && (game.screen === 'playing' || game.screen === 'paused' || game.screen === 'gameover')) {
    game.startMission(game.missionIndex);
  }
  if (input.wasPressed(...KEYS.pause) && (game.screen === 'playing' || game.screen === 'paused')) {
    game.screen = game.screen === 'playing' ? 'paused' : 'playing';
    sound.click();
  }

  // Confirm key: start from the menu, take off from a briefing, advance from an end screen.
  if (input.wasPressed(...KEYS.confirm)) {
    sound.ensure();
    if (game.screen === 'menu') game.handleButton('start', sound);
    else if (game.screen === 'briefing') game.handleButton('fly', sound);
    else if (game.screen === 'win' || game.screen === 'gameover') game.handleButton('again', sound);
  }

  // Mouse clicks on the buttons the renderer drew this frame.
  if (input.consumeClick()) {
    sound.ensure();
    for (const button of renderer.buttons) {
      if (input.clickX >= button.x && input.clickX <= button.x + button.w
        && input.clickY >= button.y && input.clickY <= button.y + button.h) {
        game.handleButton(button.id, sound);
        break;
      }
    }
  }

  // Flying: engine sound follows throttle and speed; the game owns the rules.
  const flying = game.screen === 'playing';
  if (flying) sound.ensure();
  if (sound.ctx) sound.updateEngine(game.plane ? game.plane.throttle : 0, game.plane ? game.plane.speed : 0, flying);
  game.update(dt, input, sound);

  // One frame, every frame: world, aircraft, HUD, and the screen on top.
  renderFrame(renderer, {
    screen: game.screen,
    plane: game.plane,
    mission: game.mission,
    missionIndex: game.missionIndex,
    missionProgress: game.missionProgress,
    timeOfDay: game.timeOfDay,
    rings: game.rings,
    ringsCleared: game.ringsCleared,
    beaconRing: { x: -1500, y: 420, z: -3300, r: 70 },
    beaconReached: game.beaconReached,
    stormTowers: game.stormTowers,
    birdFlocks: game.birdFlocks,
    pickups: game.pickups,
    clouds: game.clouds,
    score: game.score,
    bestScore: game.bestScore,
    muted: game.muted,
    time: game.time,
    target: game.target,
    endTitle: game.endTitle,
    endText: game.endText,
    mouseX: input.mouseX,
    mouseY: input.mouseY,
  });

  // Screen-reader status, only when it changes.
  if (game.statusText !== lastStatus) {
    statusLine.textContent = game.statusText;
    lastStatus = game.statusText;
  }

  input.endFrame();
  requestAnimationFrame(frame);
}

// Test hook for automated playtests (read-only state, harmless in play).
window.__meridian = { game, renderer, input, sound };

requestAnimationFrame(frame);

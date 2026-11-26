# Meridian Run — Make the best flight game

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Rank](https://make.fun/badge/best-flight-game-20261126-0057/nvtuananhh/makefun-best-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Reward](https://make.fun/badge/best-flight-game-20261126-0057/nvtuananhh/makefun-best-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

**MERIDIAN RUN** — a test pilot flies three sorties over one island archipelago:
a ring trial at dawn, a crossing of the storm ridge, and a night landing on a
lit runway. Chase view behind a built test jet, over recognisable terrain —
eight islands, open sea, a runway you can actually land on — with lit
instruments, and altitude, speed and heading on the HUD.

## Play it

Open `game/index.html` in desktop Chrome (serve `game/` with any static
server, for example `python3 -m http.server` inside `game/`). No network, no
build step, no libraries: pure HTML5 Canvas + Web Audio, everything
self-contained under `game/`.

## How to fly

| Keys | What they do |
| --- | --- |
| W / S or ↑ / ↓ | Pitch up / down |
| A / D or ← / → | Bank left / right — bank turns the nose |
| SHIFT / CTRL (or E / Q) | Throttle up / down |
| P | Pause · R restart · M sound on/off · Enter confirm |

Stall below 62 knots and the wing quits. Push past 290 knots and the
airframe starts shaking apart; past 330 it comes apart. Fuel burns faster at
full throttle — green drums refuel, white kits repair the hull.

## The three sorties

1. **Ring Trial** — thread 8 survey rings in order over the archipelago.
2. **Storm Ridge** — cross the thunderheads (solid columns, not scenery) and
   gull flocks to reach the beacon ring at the far end.
3. **Night Landing** — come in low, slow and straight down Runway 18 and put
   her down under 95 knots, wings level.

Score comes from rings, pickups and clean, fast flying on course. Three ways
to lose: stall out, run out of fuel, or meet the terrain — plus airframe
failure past the red line.

## Files

- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to
  `/output` and writes `/output/dossier.json` (Node 22, stdlib only).
- `game/index.html` — the game page.
- `game/src/config.js` — flight envelope, missions, palette.
- `game/src/world.js` — the fixed archipelago: islands, runway, rings, storm
  towers, birds, pickups, clouds.
- `game/src/physics.js` — the flight model: throttle, stall, overspeed, landing.
- `game/src/render.js` — chase-view projection, terrain, aircraft, HUD, screens.
- `game/src/game.js` — screens, missions, collisions, scoring, win and lose.
- `game/src/audio.js` — every sound synthesized with Web Audio.
- `game/src/input.js` — keyboard and mouse.
- `game/src/main.js` — bootstrap and the engine loop.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.
- `screenshots/` — real renders of the game's own code.

## Bounty

Built for [Make the best flight game](https://make.fun/bounty/best-flight-game-20261126-0057)
on make.fun — $500 across the top 50 entries, final 28/11/2026.

Referral code: `jn15e7qt`

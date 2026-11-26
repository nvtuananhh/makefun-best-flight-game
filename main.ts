// Meridian Run — the hand-in program (Node 22, standard library only).
//
// The game lives in this directory as plain static files: game/index.html and its ES
// modules, no library, no build step and no network request. This program hands it in:
// it copies game/ and screenshots/ from beside this file into /output and writes
// /output/dossier.json, the summary the judge reads, using the vendored make.fun
// library at ./vendor/makefun-game.ts. It is deterministic: run it twice and the
// dossier bytes are identical.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function countGameFiles(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += 1 + countGameFiles(path);
    else if (entry.isFile()) total += 1;
  }
  return total;
}

function fail(message: string): never {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

if (!existsSync(join(here, 'game', 'index.html'))) fail('game/index.html is missing');
if (!existsSync(join(here, 'screenshots'))) fail('screenshots/ is missing');
const shots = readdirSync(join(here, 'screenshots')).filter((name) => !name.startsWith('.'));
if (shots.length < 3 || shots.length > 4) fail(`screenshots/ holds ${shots.length} images, need 3 or 4`);
for (const name of shots) {
  const size = statSync(join(here, 'screenshots', name)).size;
  if (size > 262144) fail(`screenshots/${name} is ${size} bytes, over the 256 KiB cap`);
}
if (countGameFiles(join(here, 'game')) > 993) fail('game/ holds more than 993 files and directories');

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps: only text_max_bytes shapes the bytes; the others refuse an
// entry the scorer would refuse (more than 4 screenshots or one over 256 KiB; more
// than 993 files in game/ or 48 MiB of game files in all, or a path under game/
// over 1000 bytes; game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

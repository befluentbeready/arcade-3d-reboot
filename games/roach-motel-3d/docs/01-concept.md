# 01 — Concept: Roach Motel 3D

**Agent:** Agent 1 — Concept, R&D & Naming
**Input:** Space Invaders (Taito, 1978)

## Original mechanics summary

- Player controls a laser base that slides horizontally along the bottom
  of the screen and fires straight up. Only one player shot can be on
  screen at a time — you can't spam fire, you have to time it.
- Five rows of eleven invaders march sideways as a single grid; every
  time the formation touches a screen edge it drops down one row and
  reverses direction.
- The formation speeds up as it thins out — fewer invaders on screen
  means faster movement, so the last few survivors are frantic.
- Scoring is tiered by row: bottom rows are worth 10 points, middle rows
  20, the top row 30 (990 points for a fully cleared screen), plus a
  variable bonus from the mystery UFO that periodically flies across the
  top of the screen.
- Four breakable shield bunkers sit between the player and the invaders,
  eroding under both player and invader fire.
- Player loses a life when hit; the game ends when all lives are gone or
  when any invader reaches the bottom of the screen.

## Modernization concept

Same descending-grid loop, reskinned as a junkyard pest-control fantasy
seen from just behind a tiny pilot's shoulders:

- The player base becomes a one-seat, glass-domed "Bug Zapper" buggy
  that trundles left-right along a rail at the bottom of a moonlit
  scrapyard. A small low-poly pilot bust is visible inside the dome,
  with a couple of idle animations (a fist-pump on a good hit, a flinch
  on a near-miss) — the 3D layer that makes this a reboot rather than a
  reskin, without turning it into a full 3D character game.
- The invaders become "Cosmic Roaches": glowing, low-poly bugs that
  descend and reverse in exactly the original 5×11 grid pattern, at the
  same speed-scales-with-remaining-count curve. The loop is untouched —
  only the paint job changes.
- The four shield bunkers become stacked scrap-metal/traffic-cone
  barricades that crumble in a few blocky 3D chunks per hit instead of
  eroding a 2D sprite — same gameplay function (cover that degrades),
  new material.
- The mystery UFO becomes a jingling "Space Ice-Cream Truck" that
  drifts across the top of the screen on the same schedule, still worth
  a variable bonus.
- Camera: fixed, slightly-angled "over the shoulder" 3D view of the
  cockpit dome and the lane in front of it — not a free camera, so the
  game still reads at a glance like classic Space Invaders.

## Name

**Roach Motel 3D** — *"They check in. You check out... their score."*

**Slug:** `roach-motel-3d`

## Visual direction

- Low-poly / PS1-era aesthetic: flat-shaded geometric meshes, no
  high-frequency detail, so it stays inside the weight budget.
- Palette: neon green and violet roach shells against a dark, moonlit
  scrapyard skybox (gradient, no heavy skybox texture); warm amber glow
  from the cockpit dome.
- HUD: chunky retro pixel font layered over the 3D scene, plus a subtle
  CRT-style scanline shader for a retro-future feel without adding real
  post-processing cost.
- Roaches and barricade chunks are GPU-instanced from a single mesh
  each, so the visual density (a full 5×11 swarm) stays cheap to draw.

## Explicit out-of-scope

- No heavy/high-poly 3D character models or full-body rigging — the
  pilot is a static bust with two or three simple pose swaps, not a
  skeletal-animated character.
- No multiplayer or co-op of any kind.
- Nothing server-side: high scores, if kept, live in the browser
  (`localStorage`) only. No backend, no accounts, no leaderboard service.
- No physics engine — movement stays lane-constrained/kinematic, not
  simulated.
- No procedural level generation — waves are fixed/designed, matching
  the original's screen-by-screen structure.

## Sources

Original-mechanics facts verified against a Space Invaders (1978) play
guide: https://classicgaming.cc/classics/space-invaders/play-guide

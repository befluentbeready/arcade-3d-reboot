# 02 — Mechanics: Roach Motel 3D

**Agent:** Agent 2 — Game Mechanics Design
**Input:** `01-concept.md`

## Controls

- Move: `A` / `D` or `←` / `→` (desktop); on-screen left/right buttons
  on touch.
- Fire: `Space` (desktop); on-screen fire button (touch).
- Buggy movement is horizontal only, clamped to the play-field bounds —
  no vertical or free movement, matching the original cannon.

## Movement / physics model

- Kinematic, not simulated: the buggy is a lane-constrained X-axis
  translation with a fixed max speed and instant accel/decel (no
  momentum), rendered in 3D but functionally identical to the original
  arcade cabinet's cannon. No physics engine.
- Roach grid movement is a step function (position update on a timer),
  not continuous — reversing direction and dropping one row whenever any
  roach in the formation reaches a screen edge, exactly as the original.

## Shooting / fire rate

- One shot cooldown of ~400ms between player shots (a bolt must clear
  the screen or hit a target before the next can fire). This softens the
  original's strict "one shot on screen at a time" rule slightly for
  modern feel, while keeping the same tactical rhythm of "you can't just
  hold the button down."
- Roaches fire back at a random interval that scales with wave number
  (more frequent fire in later waves), same as the original's escalating
  pressure.

## Scoring

- Bottom two roach rows: 10 pts each.
- Middle two roach rows: 20 pts each.
- Top roach row: 30 pts each (990 pts for a fully cleared 5×11 swarm,
  matching the original screen total).
- Space Ice-Cream Truck bonus: random 50–300 pts.
- Full-clear bonus: +50 pts if the swarm is wiped before any roach
  reaches the barricade row.

## Lives and difficulty curve

- 3 lives.
- Swarm step-interval shortens as roach count drops (same "fewer bugs =
  faster bugs" curve as the original — implemented as a lookup table
  keyed to roaches-remaining, not a continuous physics ramp, so it's
  cheap and deterministic).
- Each new wave starts at a higher base speed than the previous wave's
  starting speed, capped at a ceiling tuned to stay playable at the
  30fps floor on a mid-range laptop.

## Level progression

- Continuous wave structure (no discrete "levels" screen-select): clear
  a 5×11 swarm, next wave spawns immediately in the same grid layout at
  the next speed tier.
- Starting wave 3, some columns spawn as stacked double-roaches (same
  hit points, worth combined score) to add visual/spatial variety
  without new mechanics.

## Win / lose states

- **Lose:** any roach reaches the barricade row, or the third life is
  lost → Game Over screen showing final score and wave reached, with a
  "New High Score" check against `localStorage` only (no server, no
  accounts).
- **Win:** none — this is an infinite wave-survival, score-chasing loop,
  consistent with the original arcade design (there's no "ending", only
  a high score to beat).

## Asset list (estimated sizes)

| Asset | Type | Est. size |
|---|---|---|
| `pilot-cockpit-lowpoly.glb` | buggy + pilot bust, single baked mesh | ~350 KB |
| `roach-lowpoly.glb` | single roach mesh, GPU-instanced for the swarm | ~80 KB |
| `barricade-chunk.glb` | single reusable chunk mesh, instanced | ~40 KB |
| `icecreamtruck-lowpoly.glb` | mystery bonus vehicle | ~120 KB |
| `texture-atlas.png` | 512×512 diffuse atlas, covers all meshes above | ~180 KB |
| `sfx/*.mp3` (laser, roach-pop, truck-jingle, game-over) | audio | ~150 KB |
| `pixel-font-subset.woff2` | HUD font, Latin subset | ~40 KB |

**Estimated total local payload: ~960 KB**, well under the 3MB budget —
leaves headroom for a polish pass (extra SFX variants, a second roach
palette for later waves) without risking the limit. Three.js itself
loads from a CDN and isn't counted against the local payload.

## Rendering approach

**Three.js**, over plain Canvas 2D.

**Justification:** the concept's core hook — a real 3D cockpit dome,
lit low-poly roaches, and a swarm that reads as a 3D crowd rather than a
sprite grid — needs actual 3D transforms/lighting that Canvas 2D can't
give cheaply. Three.js's GPU instancing renders the full 55-roach swarm
in a handful of draw calls, which keeps the extra visual layer inside
the 60fps target / 30fps floor on a mid-range laptop instead of fighting
the weight/perf budget.

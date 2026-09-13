# Roach Motel 3D — Stage System

Replaces the old "infinite wave" loop (clear the same 5x11 grid forever,
each clear just shaving the swarm-speed timer) with a curated difficulty
curve of discrete stages. Each stage is one grid to clear; clearing it
transitions — with a themed background swap — straight into the next.

## Why

Player feedback on the first playable build: the swarm felt like one
undifferentiated grind, there was no ramp-up, and it wasn't obvious how to
hit the back rows. The bullet-aim fix (see PR #4) solved the second part.
This solves the first: start small and undefended, then layer on more
targets, faster movement, and smarter return fire one stage at a time.

## Design

Each stage (`STAGES` array in `game.js`) sets:

- `rows` / `cols` — grid size. Starts small (2x6 = 12) and grows toward the
  original full grid (5x11 = 55) by stage 5.
- `roachShoot` — off entirely for stage 1, so a brand-new player can learn
  movement/aim with zero return fire.
- `fireMin`/`fireMax` — enemy fire cadence (ms between shots), tightening
  each stage.
- `aimSkill` (0..1) — chance a shot is fired from the column nearest the
  buggy's *current* x instead of a uniformly random column. This is the
  "shooting intelligence" knob: 0.15 at stage 2 (mostly random) up to 0.85
  at stage 5 (rarely random).
- `salvo` — shots fired per volley (1 normally, 2 at stage 5).
- `swarmSpeedMul` / `baseIntervalMs` — swarm horizontal speed.
- `barricadeXs` — which of the 4 cover positions are present; later stages
  drop to 3, then 2, so cover gets scarcer as everything else gets harder.
- `bg` / `fog` / `ground` / `backdrop` / `prop` — per-stage color theme.

The instanced roach mesh is sized to `MAX_ROWS x MAX_COLS` (6x12 = 72), well
above stage 5's 55, so future stages can keep growing the grid without a
mesh-capacity change. A stage's unused instance slots are simply parked
off-screen (reusing the same mechanism already used for dead roaches), so
smaller stages aren't an extra render cost.

## The 5 stages shipped now

1. **Lobby Check-In** — 2x6, no return fire. Learn to move and aim.
2. **Kitchenette Cleanup** — 3x7, occasional random shots.
3. **Bathroom Blitz** — 3x9, faster fire, some aim.
4. **Parking Lot Ambush** — 4x10, frequent aimed fire, one barricade gone.
5. **Neon Sign Showdown** — 5x11 (the original full grid), fast/aimed/dual
   shots, only 2 barricades left.

## Beyond stage 5

`getStageConfig(n)` procedurally extends the table past `STAGES.length`:
grid size and barricades hold at stage 5's, while fire rate, aim skill and
swarm speed keep climbing (capped so it stays playable), and the five
backgrounds cycle for visual variety instead of repeating the last theme
forever. This is the fallback, not the plan — the goal is 25 hand-tuned
stages (backgrounds, grid shapes, maybe new enemy behaviors beyond "aim
better/shoot more"); a future agent should extend the `STAGES` array
directly rather than lean on the procedural fallback long-term.

## Transitions

On a stage clear: bullets are cleared, a full-clear bonus is awarded (if
the player took no hits that stage), a "STAGE N CLEAR / STAGE N+1 — name"
banner fades in (CSS keyframes), a quick radial flash pulses, and the
background/fog/ground/backdrop/prop colors smooth-step (~1.5s) from the
old stage's palette to the new one while the decorative prop mesh spins.
Game logic (swarm, bullets, firing, movement) is fully paused during the
transition (`STATE.TRANSITION`) so nothing happens off-screen while the
banner plays.

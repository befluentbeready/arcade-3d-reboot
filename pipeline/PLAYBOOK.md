# Retro Arcade 3D Reboot — Agent Pipeline Playbook

Drop this file at `/pipeline/PLAYBOOK.md` in the repo. At the start of every
Cowork phase, tell Claude: *"Read /pipeline/PLAYBOOK.md, act as the
<Agent Name> for <game slug>, and check games/<slug>/docs/STATUS.md for
current state."* That's the whole orchestration mechanism — no special
Cowork feature required.

## 0. Ground rules (binding on every agent, every game)

- Static, browser-only, no backend. No servers, no databases, no build
  pipeline that requires a persistent process.
- No Unity, Unreal, Godot, or any engine with its own editor/runtime.
  Allowed stack: HTML5, CSS, vanilla JS, and (only if a 3D game needs it)
  Three.js loaded from a CDN. PixiJS is fine for 2D-heavy titles.
- Weight budget per game: total payload (JS + CSS + assets) **under 3MB**,
  first playable frame **under 3 seconds**, steady **60fps target /
  30fps floor** on a mid-range laptop.
- Each game is fully self-contained in `/games/<slug>/` and playable by
  opening `index.html` directly or via GitHub Pages — no npm install,
  no build step, at runtime.
- The reboot must keep the original's core loop recognizable (descending
  grid, centipede segments, swooping formations, arcade racer track) while
  adding a 3D visual layer and a funny working name.

## Repo layout

```
/
  index.html                     <- arcade hub, links to every game
  /games/
    /<slug>/                     <- e.g. space-invaders-3d
      index.html
      game.js
      style.css
      /docs/
        01-concept.md
        02-mechanics.md
        03-validation.md
        STATUS.md
  /pipeline/
    PLAYBOOK.md                  <- this file
```

## STATUS.md template (one per game, in `/games/<slug>/docs/`)

```
game: <slug>
phase: CONCEPT | MECHANICS | VALIDATION | DEV | DONE
last_agent: <name>
validator_verdict: PENDING | PASS | REJECTED
rejection_reason: <text or none>
revision_count: <n>
```

## Agent 1 — Concept, R&D & Naming

**Inputs:** the classic game's name (e.g. "Space Invaders").
**Job:** research the original's core mechanics, design a modern 3D
reinterpretation (e.g. a mini pilot character visible inside a low-poly
aircraft cockpit), and give it a funny, memorable name.
**Output:** `01-concept.md` — original mechanics summary, modernization
concept, funny name + slug, visual direction, explicit out-of-scope list
(heavy 3D models, multiplayer, anything server-side).
**Hand-off:** commit to `feat/<slug>-concept`, set STATUS.md phase to
`MECHANICS`.

## Agent 2 — Game Mechanics Design

**Inputs:** `01-concept.md`.
**Job:** turn the concept into a buildable spec — controls, movement/
physics model, scoring, lives and difficulty curve, level progression,
win/lose states, an enumerated asset list with estimated sizes, and the
chosen rendering approach (Three.js vs plain Canvas 2D) with a one-line
justification tied to the weight budget.
**Output:** `02-mechanics.md`.
**Hand-off:** commit to `feat/<slug>-mechanics`, set STATUS.md phase to
`VALIDATION`.

## Agent 3 — Validator

Runs this checklist against `01-concept.md` + `02-mechanics.md`:

- [ ] No engine/runtime outside HTML/CSS/vanilla JS/Three.js/Pixi
- [ ] No backend or server dependency described anywhere
- [ ] Estimated asset payload is under the 3MB budget
- [ ] Core loop is still recognizably the original game
- [ ] The modern 3D element is described concretely, not vaguely
- [ ] A funny name is assigned and used consistently across both docs
- [ ] Mechanics doc doesn't contradict the concept doc

**PASS:** write `03-validation.md` with the checked-off list, set
STATUS.md phase to `DEV`, merge the branch.
**REJECTED:** write `03-validation.md` with itemized reasons, set
`validator_verdict: REJECTED` + `rejection_reason`, increment
`revision_count`, and reassign to whichever agent owns the failing
item — concept issues go back to Agent 1, mechanics issues to Agent 2.
Do not advance to Dev on a rejection.

## Agent 4 — Developer

**Inputs:** the approved `01-concept.md` + `02-mechanics.md`.
**Job:** implement the full game in `/games/<slug>/`. Before committing,
verify it opens standalone with zero console errors, meets the fps
target, and the payload is under budget.
**Hand-off:** commit, open a PR against `main`, set STATUS.md phase to
`DONE`.

## Orchestration note

Cowork runs as one agentic session, not literally separate bots, so the
"agents" here are personas you invoke in sequence: start a task, point it
at this file and the relevant section, let it finish and commit, then
start the next phase pointing at the next section and `STATUS.md` so it
always knows where things left off. That also makes each phase resumable
across different days/sessions.

If you later want genuinely concurrent, independently-running agents
(a coordinator dispatching to specialists in parallel) rather than
sequential personas, that's the Claude Agent SDK's multi-agent sessions
feature (coordinator + agent roster) — a separate, more developer-facing
setup worth exploring once the sequential version is working.

## Git workflow

- One branch per game per phase: `feat/<slug>-concept`,
  `feat/<slug>-mechanics`, `feat/<slug>-dev`.
- A PR opens at each phase, merged once the validator (or you) approves.
- `main` auto-deploys via GitHub Pages.
- Commit message format: `[<slug>][<phase>] <summary>`.

## Hosting

GitHub repo → Settings → Pages → Deploy from branch `main`, folder `/`.
Root `index.html` becomes the arcade hub linking every game. No server
to run — this satisfies the "lightweight" requirement on its own, and
the same static output can also be dropped onto your existing
teebros.in hosting if you'd rather serve it from there.

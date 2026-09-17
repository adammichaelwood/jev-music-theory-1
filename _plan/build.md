# Build Guide

Execution order. Each phase ends with something I can run and check. Tick
boxes as done; add notes under each phase as reality intrudes.

Conventions: Vite + TS + React; `src/` for app, `exercises/` for `.md`
exercises, `scripts/` for headless tools, `runs/` (gitignored) for harness
output, `_plan/` for these docs.

## Phase 0 — Scaffold & smoke test
- [x] `npm create vite` (react-ts), install `abcjs`, `@typesafe-ai/sdk`, `js-yaml`.
- [x] `.env` (gitignored) with `TYPESAFE_API_KEY`; `.env.example`.
- [x] Vite dev-server proxy: `/api/*` → `https://api.typesafe.ai/v1/*` adding
      the bearer header from env. Browser-side client posts to `/api/systemone`.
- [x] `scripts/smoke.ts`: one Choice question through the proxy path (and
      directly via SDK in Node) — prints answer + model + latency.
- [x] Write `_plan/format.md` (grammar) after reading abcjs docs on invisible
      rests, classes, and synth.

## Phase 1 — Score model & format
- [x] `src/score/model.ts`: Score { key, time, voices: {S,A,T,B}: Measure[] },
      Note { pitch letter, accidental, octave, duration, figures?, locked }.
- [x] `src/score/format.ts`: parse CSV cell grammar ↔ serialize with variant
      options (`accidentals: 'words'|'unicode'`, `align: boolean`).
- [x] `src/exercises/load.ts`: parse `.md` (front matter + text + csv block).
- [x] 3 starter exercises: (1) melody to harmonize, (2) figured bass to
      realize, (3) SATB with gaps to complete. Small: 4 measures each.
- [x] Quick round-trip tests (vitest) for parser/serializer — these protect
      the experiment's data, so worth having.

## Phase 2 — Renderer
- [x] `src/render/abc.ts`: model → ABC string (two staves, 4 voices, key,
      meter, invisible rests for gaps, figures as text annotations, classes).
- [x] `<ScoreView>` component; CSS for given / placed / just-placed /
      selected-location highlight.
- [x] Playback: abcjs synth "play whole score"; single-note audition via
      Web Audio oscillator (or abcjs synth) when a note is placed.

## Phase 3 — Controller
- [x] `src/controller/options.ts`: given a score + partial turn, produce the
      option list for the next sub-step (with mechanical filtering, S3).
- [x] ~~`src/controller/apply.ts`~~ → `placeNote` in `score/model.ts` (overwrite rule S4).
- [x] `<Controller>` UI: one panel per sub-step, buttons with probability
      bars, piano layout for PITCH; human mode clicks buttons directly.
- [x] Turn log component.

## Phase 4 — Jev loop
- [x] `src/jev/prompt.ts`: format guide text + examples; question builders
      for each sub-step (instructions + criteria wording).
- [x] `src/jev/client.ts`: fetch to `/api/systemone`, pinned model, logging.
- [x] `src/jev/turn.ts`: async sub-loop; yields after each answer so the UI
      can animate; honours speed slider (delay), pause, step, stop, max turns.
- [x] Wire: Start → loop → apply → render → play note → repeat until STOP.

## Phase 5 — Grader
- [x] `src/grader/`: pitch math (intervals in code), parallels, crossing,
      overlap, spacing, ranges, chord identification against key/figures,
      doubling, leading-tone / seventh resolution, completeness.
- [x] `<GradeReport>` panel; violation highlighting on the score.

## Phase 6 — Chrome & knobs
- [x] Exercise picker + random; speed slider; mode toggle; format variant
      switches; model/API status; export run as JSON.

## Phase 7 — Harness & exercise library
- [x] `src/jev/conditions.ts`: Condition type + named presets; prompt.ts
      builds task/format guide/theory primer/step wording from a condition.
- [x] `scripts/run.ts`: headless runs (exercise × condition × repeats) →
      `runs/<run>.json` + append to `runs/index.jsonl` (ledger).
- [x] `scripts/report.ts`: ledger → `_plan/results.md` (table per exercise ×
      condition: mean errors/warnings, chord-tone rate, stop rate, turns, cost).
- [x] Grow `exercises/` into a graded series (easy → advanced): `scripts/kern2ex.ts`
      converts Bach chorales (Humdrum kern, craigsapp/bach-370-chorales) — 8 added, levels 2–5.
- [ ] First results write-up in `_plan/results.md`.

## Phase 8 — Strategies (pilots → matrix)
- [x] `strategy`, `feedback`, `pitchOctave` fields on Condition; option filtering in
      `controller/options.ts`; feedback injection in `jev/turn.ts`.
- [x] `errorsAtFirstComplete` in the ledger (revision effect).
- [ ] Pilot: each strategy × 3 exercises × 2 repeats; promote the promising ones.
- [ ] `merged-pitch`, `windowed`, `fanout` as time allows.

## Later / deployment
- Cloudflare Worker proxy + GH Pages build with user-entered key.
- Fan-out variant of the turn (all sub-steps in one request).

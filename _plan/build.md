# Build Guide

Execution order. Each phase ends with something I can run and check. Tick
boxes as done; add notes under each phase as reality intrudes.

Conventions: Vite + TS + React; `src/` for app, `exercises/` for `.md`
exercises, `scripts/` for headless tools, `runs/` (gitignored) for harness
output, `_plan/` for these docs.

## Phase 0 — Scaffold & smoke test
- [ ] `npm create vite` (react-ts), install `abcjs`, `@typesafe-ai/sdk`, `js-yaml`.
- [ ] `.env` (gitignored) with `TYPESAFE_API_KEY`; `.env.example`.
- [ ] Vite dev-server proxy: `/api/*` → `https://api.typesafe.ai/v1/*` adding
      the bearer header from env. Browser-side client posts to `/api/systemone`.
- [ ] `scripts/smoke.ts`: one Choice question through the proxy path (and
      directly via SDK in Node) — prints answer + model + latency.
- [ ] Write `_plan/format.md` (grammar) after reading abcjs docs on invisible
      rests, classes, and synth.

## Phase 1 — Score model & format
- [ ] `src/score/model.ts`: Score { key, time, voices: {S,A,T,B}: Measure[] },
      Note { pitch letter, accidental, octave, duration, figures?, locked }.
- [ ] `src/score/format.ts`: parse CSV cell grammar ↔ serialize with variant
      options (`accidentals: 'words'|'unicode'`, `align: boolean`).
- [ ] `src/exercises/load.ts`: parse `.md` (front matter + text + csv block).
- [ ] 3 starter exercises: (1) melody to harmonize, (2) figured bass to
      realize, (3) SATB with gaps to complete. Small: 4 measures each.
- [ ] Quick round-trip tests (vitest) for parser/serializer — these protect
      the experiment's data, so worth having.

## Phase 2 — Renderer
- [ ] `src/render/abc.ts`: model → ABC string (two staves, 4 voices, key,
      meter, invisible rests for gaps, figures as text annotations, classes).
- [ ] `<ScoreView>` component; CSS for given / placed / just-placed /
      selected-location highlight.
- [ ] Playback: abcjs synth "play whole score"; single-note audition via
      Web Audio oscillator (or abcjs synth) when a note is placed.

## Phase 3 — Controller
- [ ] `src/controller/options.ts`: given a score + partial turn, produce the
      option list for the next sub-step (with mechanical filtering, S3).
- [ ] `src/controller/apply.ts`: apply a completed move (overwrite rule S4).
- [ ] `<Controller>` UI: one panel per sub-step, buttons with probability
      bars, piano layout for PITCH; human mode clicks buttons directly.
- [ ] Turn log component.

## Phase 4 — Jev loop
- [ ] `src/jev/prompt.ts`: format guide text + examples; question builders
      for each sub-step (instructions + criteria wording).
- [ ] `src/jev/client.ts`: fetch to `/api/systemone`, pinned model, logging.
- [ ] `src/jev/turn.ts`: async sub-loop; yields after each answer so the UI
      can animate; honours speed slider (delay), pause, step, stop, max turns.
- [ ] Wire: Start → loop → apply → render → play note → repeat until STOP.

## Phase 5 — Grader
- [ ] `src/grader/`: pitch math (intervals in code), parallels, crossing,
      overlap, spacing, ranges, chord identification against key/figures,
      doubling, leading-tone / seventh resolution, completeness.
- [ ] `<GradeReport>` panel; violation highlighting on the score.

## Phase 6 — Chrome & knobs
- [ ] Exercise picker + random; speed slider; mode toggle; format variant
      switches; model/API status; export run as JSON.

## Phase 7 — Harness & exercise library
- [ ] `scripts/run.ts`: headless runs (exercise × variant × repeats) → `runs/`
      with grader summary table.
- [ ] Grow `exercises/` into a graded series (easy → advanced); mine
      public-domain chorale melodies online if practical.
- [ ] First results write-up in `_plan/results.md`.

## Later / deployment
- Cloudflare Worker proxy + GH Pages build with user-entered key.
- Fan-out variant of the turn (all sub-steps in one request).

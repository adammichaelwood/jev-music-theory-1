# Jev Chorale Lab

An experiment: can **Jev** — TypeSafe's System One decision model, which
answers typed multiple-choice questions with calibrated probabilities and
never generates text — do undergraduate music theory?

Jev works SATB part-writing exercises (complete a cadence, realize a figured
bass, harmonize a chorale melody) through a **controller**: each turn it
chooses a voice, a measure, a beat, a pitch, an octave and a duration, seeing
the whole score as plain text every time. Code never filters its options for
musical reasons. A rule-based grader scores the result, and a headless harness
runs exercises × prompt conditions × strategies × repeats into a ledger.

**Findings:** [`_plan/findings.md`](_plan/findings.md) (also the *findings*
tab in the app). Numbers: [`_plan/results.md`](_plan/results.md).
Design and decision log: [`_plan/main.md`](_plan/main.md).

## Run it

```sh
npm install
cp .env.example .env        # put your TYPESAFE_API_KEY in .env
npm run dev                 # http://localhost:5173
```

The Vite dev server proxies `/api/*` to `api.typesafe.ai` and injects the key,
so it never reaches the browser. (`api.typesafe.ai` rejects browser CORS
origins, so a deployed build needs an equivalent proxy.)

- **▶ start Jev** runs the loop; the speed slider paces it; the controller on
  the right shows every option with Jev's probability, the piano lights up
  for pitch choices, and the turn log expands to per-step distributions.
- **human mode** lets you enter notes with the same controller, then hand the
  score to Jev.
- **condition** picks a preset of prompt levers / strategies; *show experiment
  settings* exposes each lever.

## Headless harness

```sh
npx tsx scripts/run.ts --ex 001,002 --cond baseline,backward --repeats 3 --jobs 3
npx tsx scripts/report.ts       # regenerates _plan/results.md from runs/index.jsonl
npx tsx scripts/grade.ts runs/<file>.json
npx tsx scripts/kern2ex.ts chor001.krn --phrases 1 --given S,B --id 020   # Bach chorale → exercise
```

## Layout

| path | what |
|---|---|
| `exercises/*.md` | exercises: YAML front matter + instructions + score block in the chorale CSV format (`_plan/format.md`) |
| `src/score/` | score model, parser/serializer with format variants |
| `src/controller/` | the option sets Jev picks from (mechanical filtering + strategy ordering only) |
| `src/jev/` | prompt/state builders, conditions, the turn loop (sequential and fan-out), SDK client |
| `src/grader/` | voice-leading grader: parallels, crossing, overlap, spacing, range, chord ID + Roman numerals, doubling, figures, tendency tones |
| `src/render/` | score → ABC → abcjs, with per-note classes for highlighting |
| `src/ui/` | controller (piano), turn log, grade panel, findings renderer |
| `scripts/` | harness, report, grader CLI, kern converter |
| `runs/` | run logs and `index.jsonl` ledger (gitignored) |

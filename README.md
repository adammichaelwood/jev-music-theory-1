# Jev Chorale Lab

**Live demo: https://adammichaelwood.com/jev-music-theory-1/**

An experiment in two parts, done in one day:

1. **Does a decision model know music theory?** [Jev](https://docs.typesafe.ai)
   is TypeSafe's "System One" model: it answers typed multiple-choice questions
   with calibrated probabilities and never generates text. We gave it
   undergraduate SATB part-writing exercises and a *controller* — pick a voice,
   a measure, a beat, a pitch, an octave, a duration — and let it work, with no
   musical hints from code and a rule-based grader marking the result
   afterwards. Then we varied everything we could think of (score formats,
   prompt wording, strategies, framings), wrote a generated theory quiz, and
   compared it with Claude Haiku 4.5, Sonnet 5 and Opus 5 on accuracy and cost.
2. **Jev plays piano.** A never-ending stream of mellow Rhodes chords, three
   decisions each (root → quality → bass tone), voiced and arpeggiated by code.
   No scientific value to speak of; we built it because it was fun.

**This whole repository was vibecoded.** The plan, the code, the experiments,
the write-ups, the videos and this README were produced by Claude Code
(Claude Opus 5) working autonomously from a conversation, with a human
supplying ideas, API keys, and taste. Read it in that light: it is an
experiment about an AI model, run by an AI model. The full planning trail —
including the design questions the agent asked and then answered itself — is
in [`_plan/`](_plan/).

## What we found (short version)

Full write-ups: [round 1](_plan/findings.md) · [round 2](_plan/findings-2.md) ·
[piano notes](_plan/findings-piano.md), also under the *findings* tab of the demo.

- Jev's music theory is **lexical**. It knows the vocabulary — scale degrees,
  cadence types, secondary dominants, enharmonics — and can match a pitch to a
  chord spelled out beside it. It cannot compute relations between spelled
  pitches (Roman numeral from pitches: chance level; the chordal seventh of
  V7: 0%, it answers the seventh scale degree), and it has no representation
  of motion between chords, so voice leading is out of reach.
- **The score format wasn't the problem.** CSV, ABC and LilyPond give the same
  failure profile. What helped was **framing**: showing only the previous
  beat, this beat and the next — or one sentence of prose — halved the errors
  and turned the melody-harmonization exercises from never-finishing into
  70–91% recognizable chords, at a third of the cost.
- **Its characteristic failure is the fixed point**: once a score (or a chord
  progression) reaches a state it likes, a deterministic model with no memory
  of its own moves repeats or oscillates forever.
- **Against Claude**, per step at low effort Sonnet 5 makes a third of Jev's
  errors at ~50× the cost and ~10× the time; Haiku 4.5 is roughly Jev's
  equal. Given the whole exercise and minutes to think, Sonnet 5 and Opus 5
  produce near-perfect and sometimes perfect harmonizations for $0.2–0.7.
  Jev's niche is $0.001 and four seconds per exercise.
- Opus 5's safety classifier refuses the CSV-format chorale prompt as
  "cyber" content, every time.

## Run it

```sh
npm install
cp .env.example .env        # TYPESAFE_API_KEY=… (and ANTHROPIC_API_KEY=… for the Claude experiments)
npm run dev                 # http://localhost:5173
```

The Vite dev server proxies `/api/*` to `api.typesafe.ai` and injects the key,
so it never reaches the browser. The deployed site uses a Cloudflare Worker
(`worker/`) that does the same with a shared key and daily caps, or passes
through a visitor's own key.

### Headless experiments

```sh
npx tsx experiments/lab/run.ts --ex 001,002 --cond baseline,slice --decider jev,claude-sonnet --repeats 3 --jobs 3
npx tsx core/harness/report.ts                       # → _plan/results.md
npx tsx experiments/quiz/run.ts --decider jev,claude-haiku --per 8 && npx tsx experiments/quiz/report.ts
npx tsx experiments/oneshot/run.ts --ex 001 --model claude-sonnet --format csv
npx tsx experiments/piano/run.ts --n 60 --sample --temp 0.4
npx tsx scripts/kern2ex.ts chor001.krn --phrases 1 --given S,B --id 020   # Bach chorale (Humdrum) → exercise
npx tsx scripts/record.ts video && python3 scripts/mixaudio.py video <samples>   # demo videos
```

## Deploy

```sh
npx wrangler login && npx wrangler secret put TYPESAFE_API_KEY && npx wrangler deploy
gh variable set VITE_API_BASE --body "https://<your-worker>.workers.dev"   # then push to main
```

Pages builds from `.github/workflows/pages.yml`; the Worker's caps are the
`[vars]` in `wrangler.toml`.

## Layout

| path | what |
|---|---|
| `core/score/`, `core/formats/` | score model; CSV / ABC / LilyPond presentations (`_plan/format.md`) |
| `core/controller/` | the option sets the model picks from; location/option policies |
| `core/loop/` | conditions (every experimental lever), prompt/state builders, the turn loop |
| `core/decide/` | `Decider` interface: Jev, Claude (Haiku/Sonnet/Opus) |
| `core/grader/` | voice-leading grader with Roman-numeral chord identification |
| `core/quiz/` | generated theory quiz (19 kinds, 5 tiers, answers computed) |
| `core/piano/` | chord vocabulary, voicing, stream analysis |
| `experiments/` | headless runners: lab, quiz, one-shot, piano |
| `src/` | the demo app (lab, findings, piano tabs) |
| `worker/` | Cloudflare Worker proxy with caps and request-shape checks |
| `exercises/` | 12 exercises (3 written, 1 diagnostic, 8 Bach chorale phrases) |
| `_plan/` | plan, decision log, self-answered questions, ideas, write-ups, result tables |
| `scripts/` | grader CLI, kern converter, video recorders and audio mixers |

## Credits

Bach chorales from [craigsapp/bach-370-chorales](https://github.com/craigsapp/bach-370-chorales)
(Humdrum kern). Notation and playback via [abcjs](https://github.com/paulrosen/abcjs)
and the FluidR3 soundfonts hosted by Paul Rosen. Model: TypeSafe `jev-1.13.0`;
comparisons on Anthropic's Claude API.

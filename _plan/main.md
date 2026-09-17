# Jev Chorale Lab — Design & Decision Log

Living document. What the app is, decisions made (with who made them), and
what's open. Build order: `build.md`. Jev/TypeSafe constraints: `jev-notes.md`.
Self-answered design questions during autonomous work: `self-answered.md`.

Status: round 1 concluded 2026-09-17 (`findings.md`, `results.md`); **round 2** (formats, quiz, LLM comparison, policies/framings) in progress — see `build.md` §Round 2 and `findings-2.md`.

---

## 1. Purpose — what we're actually testing

**Primary question: does Jev have latent music-theory knowledge from its
training?** Secondary: can we draw it out better (score formatting, prompt
wording, unicode accidentals, column alignment…)?

This is *not* a tool to help humans with theory homework, and it is not
production software. Whenever a design choice comes up, pick the option that
best answers "Does Jev understand basic music theory?"

Consequence: **no help from code.** We do not pre-validate, filter, or annotate
Jev's options with rule violations. Jev sees the whole score in our text
format plus format-reading instructions and examples, and picks from the
complete controller option set every time. Code checks rules only *after the
fact* (the grader) to measure what Jev did.

Two experiments at once: (1) the above; (2) how far Claude Code can carry this
autonomously from a written plan.

## 2. Score format (the "chorale CSV")

Exercises are `.md` files in `exercises/`: YAML front matter (key, time
signature, title, type, difficulty…), the instructional text, and the score
as a CSV block.

- One **row per voice** (S, A, T, B), one **cell per measure**.
- A cell holds space-separated notes: `{PITCH}-{OCTAVE}-{DURATION}[-{FIGURES}]`,
  e.g. `A-FLAT-5-QUARTER`, `G-3-HALF-6/4`. Figures only appear on the bass in
  figured-bass exercises.
- **Undecided = empty.** A missing note is simply absent from the cell; an
  empty cell is an entirely undecided measure. Rendered as invisible rests.
- Enharmonics are distinct (`G-FLAT` ≠ `F-SHARP`).
- Given (exercise-provided) notes vs Jev-placed notes are tracked *outside*
  the CSV (a parallel "locked" map), so the CSV Jev reads stays clean.
- **Format variants are an experimental knob** (see §5): spelled-out
  accidentals vs unicode `♯/♭`; column-aligned simultaneous notes vs not.
  The parser must accept all variants; the serializer takes a variant option.

The precise grammar (durations, dotted notes, ties, rests, figure syntax,
pickup measures) is specified in `format.md` once built.

## 3. The controller (how Jev edits)

Each **turn** is a sub-loop of Choice questions. At every sub-step Jev sees the
entire score + exercise text + format guide + *its answers so far in this
turn*. Options are the complete set, never trimmed for musical reasons.

| Step | Options | Notes |
|------|---------|-------|
| VOICE | `[S] [A] [T] [B] [STOP — the exercise is complete]` | STOP is offered at the start of every turn, including when the score is already full — Jev keeps editing until satisfied. Voices that are entirely given (e.g. a supplied bass line) are omitted. |
| MEASURE | `[1] … [N]` | |
| BEAT | `[1] [AND OF 1] [2] …` per time signature | Positions already occupied by a *given* note are omitted (mechanical, not musical, filtering — see `self-answered.md` S3). |
| PITCH | 21 spellings: `C C-SHARP D-FLAT D … B-SHARP C-FLAT` | Enharmonics distinct. On-screen: piano-style view, nice-to-have. |
| OCTAVE | `[2] [3] [4] [5] [6]` | Added by me — the format needs it; see S1. |
| DURATION | `[EIGHTH] [QUARTER] [HALF] [WHOLE]` (+dotted later) | Only durations that fit before the barline / next given note are offered (mechanical). |

After DURATION, code applies the move: it replaces any Jev-placed notes the
new note overlaps, updates the CSV, re-renders, plays the note, and starts
the next turn. Given notes can never be overwritten.

On-screen controller shows, per sub-step, every option with Jev's
probability bar and the chosen one highlighted; a turn log records the full
path (`S → m2 → beat 2 → A-FLAT → 4 → QUARTER`) with probabilities.

The same controller is used in **human mode** to enter/edit a score before
handing to Jev.

## 4. Components

| # | Component | Decision |
|---|-----------|----------|
| A | Score format + parser/serializer | §2. |
| B | Controller state machine + UI | §3. |
| C | Renderer | **abcjs** — translator from our model to ABC; built-in playback (important); invisible rests (`x`) for undecided; per-note CSS classes for highlighting (given / Jev-placed / just-placed / violation). |
| D | Exercise library | `exercises/*.md`. Start with a handful (made up + public-domain chorale tunes). Later: a graded easy→advanced series to find where Jev's capability ends. Online sources allowed. |
| E | Jev loop | Turn = sub-loop of sequential Choice requests (§3). Speed slider from "as fast as possible" to slow-motion; step; pause; stop. Max-turn safety cap. |
| F | Grader | Code rule engine run after the fact: parallel 5ths/8ves, voice crossing/overlap, spacing, ranges, doubling, chord membership vs figures/Roman numerals, unresolved leading tone/7ths. Produces a score report shown in-app and used by the eval harness. Stretch in the brief, but cheap and essential to *measure* anything — built after the loop works. |
| G | Chrome | Load random / pick exercise; Jev start/pause/step/stop; speed; human/Jev mode; format-variant switches; API key status. |
| H | Evaluation harness | Headless Node runner: N exercises × format variants → grader stats + full turn logs saved to `runs/`. This is how we answer the primary question. |
| I | Deployment | Local only for now. Browser calls a relative `/api/systemone`; Vite dev server proxies to `api.typesafe.ai` and injects the key from `.env`. Nothing else in the app knows about keys, so a later Cloudflare Worker at the same path is a drop-in. |

## 5. Experiment matrix (added 2026-09-17 from your "btw" note)

Each harness run is `exercise × condition × repeat`. A **condition** is one
record naming every lever:

| Lever | Levels |
|-------|--------|
| `accidentals` | `words` (`A-FLAT`) / `unicode` (`A♭`) |
| `align` | columns aligned / not |
| `formatGuide` | `none` / `brief` / `full` (with worked example) |
| `theory` | `none` / `exercise` (only the exercise's own text) / `primer` (general SATB rules primer) / `detailed` (longer primer) |
| `stepWording` | `plain` / `contextual` (question restates key, neighbours, etc.) |

Cautions from the Jev docs: **context rot** — a long primer may *hurt*, so
"more instruction" is a hypothesis to measure, not an assumed improvement.
Token limits (64k total / 32k state+question) are far off; requests are
~1.2–1.4k tokens today.

Outputs: every run is graded (§4 F) and appended to a ledger,
`runs/index.jsonl` (one row: exercise, condition, repeat, grader summary,
turns, stopped?, tokens, cost, wall time). `_plan/results.md` is regenerated
from the ledger. **Repeats are built in from the start** — the pitch step
runs at ~0.2 confidence, so run-to-run variance is real and must be
measured before small differences between conditions mean anything.

Later levers: windowed score context; speculative fan-out (all sub-steps in
one request) vs the sequential sub-loop.

### 5.1 Strategies (added 2026-09-17 from your second note)

A second dimension, orthogonal to the prompt levers: *how the controller
constrains the order of work*, and whether Jev is told what's wrong. These
are pilots first (a few runs each); anything promising joins the full matrix.

| Strategy | What changes |
|----------|--------------|
| `free` | (default) any editable location, any time |
| `forward` | only the earliest undecided moment is offered until the score is complete; then free editing / STOP |
| `backward` | same, from the end (cadence-first approach) |
| `line` | one voice at a time, in order B → S → A → T; positions within the voice are free |
| `feedback` | after every move the grader runs and its issue list (text only, no suggestions) is placed in state as `feedback` |
| `merged-pitch` (mine) | PITCH and OCTAVE become one Choice (`A-FLAT-4`, 105 options) — does splitting the register decision hurt? |
| `windowed` (mine) | score text limited to the current measure ± 1 (tests context rot; needs a MEASURE choice first) |
| `no-revision` (mine) | force STOP the moment the score is complete — measures whether Jev's revisions help or hurt (also computable from logs: grade at first completion vs final) |
| `fanout` (mine) | all six sub-questions in a single request, none seeing earlier answers — does the sequential context matter? |

Strategy constraints are *mechanical* ordering constraints on the controller,
not musical filtering, so they stay inside the "no help" rule — except
`feedback`, which deliberately crosses it, as you asked.

## 6. Decisions

- **D1 (you).** No pre-validation or rule hints. Complete option sets every step.
- **D2 (you).** Turn = sequential sub-loop of Choice questions, full context + answers-so-far each step.
- **D3 (you).** CSV score format as in §2; undecided = empty; enharmonics distinct.
- **D4 (you).** Jev may overwrite anything it placed; given notes are immutable and not offered.
- **D5 (you).** STOP offered at the start of every turn; Jev may keep editing a full score.
- **D6 (you).** Playback matters → abcjs (me). Play the note when Jev selects it.
- **D7 (you).** Stack: Vite + TypeScript + React.
- **D8 (you).** Local only for now, but nothing that must be rebuilt for deployment (→ relative API path + proxy).
- **D9 (you).** Autonomous mode. Stop only for keys/permissions. Self-answer design questions in `self-answered.md`, choosing whatever best tests Jev's theory knowledge.
- **D10 (you).** Not production. Tests only where they help me. Code readable to me.
- **D11 (me).** Jev sees the score as the literal CSV text (a string inside the state object), alongside `exercise_instructions`, `format_guide`, and `this_turn_so_far`. Jev never sees ABC or any renderer format.
- **D12 (me).** Pin the model version (`jev-1.13.0`) in config; log the response `model` field with every answer.
- **D13 (me).** Every Jev request/response is logged (state, questions, full probabilities, latency, tokens) to the in-app turn log and, in the harness, to `runs/`. Cheap and it's the data.

## 7. Open (waiting on you)

- **TypeSafe API key** — put it in `/home/amw/jev-demo/.env` as
  `TYPESAFE_API_KEY=...` (I'll add `.env` to `.gitignore` in the scaffold).
- **"Go."**

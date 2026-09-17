# Findings, round 2 — formats, a theory quiz, Claude vs Jev, and what finally helped

Written 2026-09-17, after round 1 (`findings.md`). Tables regenerate from
`runs/index.jsonl`, `runs/quiz.jsonl`, `runs/oneshot.jsonl`. Cell sizes are
small (Jev n=3, Claude n=1 unless noted), so read patterns, not decimals.

## The four steps and the one-line answer to each

1. **Was the CSV format the problem?** No. ABC and LilyPond change nothing
   material; LilyPond is marginally the best and ~20% cheaper in tokens.
2. **What does Jev actually know?** Named concepts, recalled well; relations
   between spelled pitches, computed badly. A generated quiz makes this exact.
3. **How do Claude models compare?** Per-step at low effort, Sonnet 5 makes
   1/3 the errors of Jev at ~50× the cost and ~10× the wall time; Haiku 4.5
   is roughly Jev's equal. One-shot with thinking, Sonnet 5 and Opus 5 produce
   near-perfect and sometimes perfect harmonizations at $0.2–0.7 each.
4. **What draws Jev out?** Not location control, not option filtering —
   **framing**. Present the single decision as the previous beat, this beat
   and the next beat (a "slice"), or as one sentence of prose, and Jev's
   errors drop by half to two-thirds on every exercise, it always finishes,
   and it costs a third as much. The melody-harmonization exercise it could
   not complete at all in round 1 comes out with 91% recognizable chords.

## 1. Score format (Jev, 4 exercises × 3 repeats)

| exercise | csv | abc | lilypond | csv+backward | abc+backward | lilypond+backward |
|---|---|---|---|---|---|---|
| 001 cadence (S+B) | 6.3 · 72% | 5.3 · 79% (stalls) | 8.0 · 90% (stalls) | 6.7 · 86% | 4.7 · 90% | **3.3** · 69% |
| 002 figured bass | 8.0 · 50% | 10.7 · 65% | 6.0 · 17% (stalls) | 8.7 · 44% | 13.3 · 71% | 11.7 · 65% |
| 003 melody, D minor | 12.5 · 18% (stalls) | 13.3 · 32% | 9.3 · 42% | 13.7 · 58% | 17.7 · 31% | 12.3 · 64% |
| 012 chorale melody | 9.0 · 11% (stalls) | 7.7 · 27% | **2.3** · 52% | 4.0 · 58% | 7.0 · 59% | **3.0** · 63% |

(errors · chord rate; "stalls" = never chose STOP, ended by the stall detector.)

Same failure profile under every format: parallel octaves, overlap,
crossing. ABC and LilyPond in free mode never STOP — the `x`/`s` rests that
mark undecided beats seem less legible to it than the CSV's `_`. The
notation-oriented formats Jev has surely seen in training do not unlock
anything; the model's limits are not in reading.

## 2. The theory quiz (19 generated question kinds, 5 tiers, 152 questions)

| tier | chance | Jev | Haiku 4.5 | Sonnet 5 | Opus 5 |
|---|---|---|---|---|---|
| 1 fundamentals | 5% | 71% | 88% | 100% | 100% |
| 2 intervals, triads | 22% | 38% | 54% | 92% | 100% |
| 3 harmony in a key | 14% | 20% | 33% | 85% | 98% |
| 4 four-voice judgments | 31% | 56% | 66% | 100% | 100% |
| 5 chromatic harmony | 17% | 81% | 94% | 100% | 100% |
| all | 18% | 51% | 64% | 95% | 99% |
| cost for 152 | | $0.003 | $0.08 | $0.31 | $0.62 |

Claude was asked the identical Choice questions at low effort (Haiku without
thinking), so this is "snap judgment" for everyone.

Jev's profile is bimodal in a way the tiers hide. **Recalled facts**: scale
degrees 100%, cadence types 100%, secondary dominants / Neapolitan /
enharmonics ~88%. **Computed relations**: Roman numeral from spelled pitches
13% (chance 14%), figured bass 13%, triad root 25%, interval naming 38%, and
the chordal seventh of V7 **0%** — it answers the seventh *scale degree*
every time, a literal-reading slip the docs warn about. This is exactly the
part-writing failure seen from the other side: it knows what a Neapolitan is
but cannot tell you what chord D–F–A is in B♭ major.

Haiku 4.5 without thinking has the same shape, a little higher. Sonnet 5
and Opus 5 are near ceiling; the quiz is not hard for a reasoning model.

## 3. Claude in the loop, and one-shot

### Per step (same controller, same options, low effort; n=1 per cell)

| exercise · condition | Jev | Haiku 4.5 | Sonnet 5 | Opus 5 |
|---|---|---|---|---|
| 001 · csv baseline | 6.3 · $0.005 · 15s | 7 · $0.21 · 128s | 3 · $0.35 · 164s | refused |
| 001 · slice | **2.0** · $0.001 · 4s | 6 · $0.03 · 21s | 2 · $0.07 · 42s | 4 · $0.17 · 73s |
| 002 · slice | 7.0 · $0.001 · 6s | 10 · $0.04 | 4 · $0.10 | refused |
| 003 · slice | 8.0 · $0.002 · 11s | 5 · $0.07 · 54s | 2 · $0.19 · 107s | **0** · $0.46 · 211s |
| 003 · narrative+chord-tones | 6.3 · $0.002 | 8 · $0.06 | 2 · $0.17 | 2 · $0.49 |
| 012 · slice | 5.7 · $0.002 · 7s | 4 · $0.05 · 36s | **0** · $0.12 · 68s | 5 · $0.29 · 114s |
| 012 · lilypond+backward | 3.0 · $0.003 | (parse fail) | 1 · $0.50 · 255s | 5 · $1.38 · 422s |

(errors · cost · wall time.)

- **Sonnet 5 at low effort is the best per-step decider**: 0–4 errors
  everywhere it ran. Opus 5 at low effort is *not* better than Sonnet here
  (0–5) — presumably low effort on a bigger model is not the same thing as
  more knowledge.
- **Haiku 4.5 ≈ Jev.** On the framed conditions they trade wins (Haiku 5 vs
  Jev 8 on 003; Jev 2 vs Haiku 6 on 001), at 30–50× Jev's cost.
- **Cost and time**: Jev $0.001–0.005 and 4–18 s per completion; Haiku
  $0.03–0.25 and 20–170 s; Sonnet $0.07–0.8 and 40–350 s; Opus $0.17–1.4 and
  1–7 min. Per decision Jev is ~$0.00006 vs ~$0.01 for Opus.
- **Opus 5 refused the CSV-format prompts** — every time, deterministically,
  with `stop_details.category: "cyber"`. A four-voice chorale in a JSON
  state with a "controller" and a STOP option is, to the classifier,
  violative cyber content. The framed prompts (slice/narrative) pass. Left
  as-is rather than routed to a fallback model, since the comparison is the
  point; it's a real deployment consideration.

### One-shot (whole score in one reply, thinking on, medium effort)

| exercise | Haiku 4.5 | Sonnet 5 | Opus 5 |
|---|---|---|---|
| 001 cadence | 5–7 err · $0.03 · 45s | **0, 0** err · $0.23 · 230s | 1, 0 err · $0.17–0.35 · 85–183s |
| 002 figured bass | 5 err · $0.10 · 142s | **0** err · $0.28 · 297s | 2 err · $0.05 · 27s |
| 003 D-minor melody | 5 err · $0.05 · 64s | 1 err · $0.17 · 174s | **0 err, 0 warn** · $0.68 · 325s |
| 012 chorale melody | 3 err · $0.05 · 76s | 1 err · $0.13 · 138s | **0 err**, 1 warn · $0.09 · 45s |

A reasoning model given the whole problem and minutes to think solves these
exercises: Sonnet 5 wrote two grader-clean cadences and a clean figured-bass
realization; Opus 5 wrote a harmonization of the D-minor melody with no
errors and no warnings at all. Thinking is what does it — Sonnet spends
15–28k output tokens per exercise — and it is what makes it slow and 30–100×
Jev's cost. Haiku with an 8k thinking budget lands at 3–7 errors, about
where framed Jev is.

Asking for **LilyPond** output instead of CSV was worse for one-shot: Sonnet
barely thought (1k tokens, 7 errors on 001) and Opus's 012 answer used
constructs outside the documented subset, so only part of it parsed
(recorded as incomplete with 6 given notes "changed"). CSV — the invented
format — is the more reliable output format, because it is fully specified
in the prompt and has nothing else the model might reach for.

## 4. Policies and framings (Jev, 4 exercises × 3 repeats)

| exercise | baseline | code location | +diatonic | +chord tones | **slice** | **narrative** | **narrative + chord tones** | slice, merged pitch/oct | narrative, merged |
|---|---|---|---|---|---|---|---|---|---|
| 001 | 6.3 · 72% | 5.0 · 92% | 7.7 · 83% | 6.0 · 96% | **2.0** · 96% | 4.0 · 100% | 4.7 · 100% | 4.0 · 89% | 3.0 · 94% |
| 002 | 8.0 · 50% | 8.3 · 89% | 11.7 · 83% | 10.0 · 83% | 7.0 · 94% | 5.3 · 83% | 5.0 · 100% | 3.3 · 67% | **3.0** · 83% |
| 003 | 12.5 · 18% ✗ | 16.0 · 55% | 21.0 · 42% | 21.7 · 61% | 8.0 · 73% | 8.0 · 70% | **6.3** · 91% | 13.7 · 42% | 11.3 · 48% |
| 012 | 9.0 · 11% ✗ | 5.0 · 48% | 4.0 · 48% | 4.7 · 59% | 5.7 · 70% | **2.7** · 78% | 4.7 · 74% | 4.3 · 70% | 9.0 · 52% |

(errors · chord rate; ✗ = never completed. Every step-4 condition completes
every run and costs $0.001–0.004.)

What this says:

- **Telling Jev where to write (code location) fixes completion, not
  quality.** Errors are unchanged or worse; it just stops looping.
- **Filtering the options doesn't help.** Diatonic-only is no better than
  all 21 spellings (Jev already picks diatonic pitches); chord-tones-only
  raises the chord rate by construction but the voice-leading errors stay.
  The mistakes are not "wrong pitch class"; they are register, spacing and
  motion — decisions the filter doesn't touch.
- **Framing is the lever.** Replacing the whole score with the three
  neighbouring beats (`slice`) or one sentence (`narrative`) halves the
  errors on 001 and 002 and turns 003 and 012 from failures into
  completions with 70–91% recognizable chords. This is the docs' "context
  rot" and "indirection" warnings in practice: the same information, placed
  next to the question in the words a theory student would use, is usable;
  buried in a 200-token score it is not.
- **Merged pitch+octave helps on the easy exercises, hurts on the melody
  ones** — a 105-way choice is fine when the register is obvious and not
  otherwise.

## What I'd conclude

- Jev's music theory is *lexical*: it has the vocabulary of harmony and the
  associations between named things, and it can match a pitch to a chord
  when the chord is spelled out next to it. It cannot compute relations
  between pitches, and it has no representation of motion between chords,
  so voice leading is out of reach under any prompt tried.
- Presentation matters more than format: the winning move was not a better
  notation but a smaller, more literal question.
- For this task the LLMs are clearly superior in accuracy; Jev's niche is
  the 100× cost and speed gap, and with slice framing it reaches Haiku-level
  quality there. A propose-and-check design (Jev proposes, code rejects
  parallels, Jev proposes again) is the obvious next experiment — it stays
  inside the "no musical hints" rule if the rejection reason is withheld.
- The Opus 5 "cyber" false-positive on chorale JSON is worth reporting.

## Not done / caveats

- n=1 for all Claude per-step cells and most one-shot cells; the Jev cells are n=3.
- One-shot was run at medium effort with a 32k output cap after Sonnet spent all of a 16k cap thinking at high effort.
- `windowed` (measure ±1) from round 1 was never re-run; `slice` supersedes it.
- The quiz's tier-5 questions have 5 options built by perturbing one accidental, which makes them easier than their label suggests; Jev's 81% there is partly recognition of the canonical spelling.

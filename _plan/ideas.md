# Ideas to come back to

## Bach agreement: does Jev have taste, or only vocabulary? (proposed 2026-09-17, not built)

Rule checking belongs to code — a proposer + checker is 1970s generate-and-test
done worse. The one thing a constraint solver can't do is *prefer* among
legal options. Test that directly:

- Use the eight Bach chorale exercises (we have Bach's actual inner voices).
- For each inner-voice note Bach wrote, enumerate the candidates the grader
  calls legal in context (usually 3–8 pitch+octave options).
- Ask Jev to pick, with `slice` framing. Score agreement with Bach's choice
  against two baselines: uniform random among legal candidates, and
  nearest-to-previous-note. Run Haiku/Sonnet on the same items for reference.
- Outcome A: Jev beats random-among-legal clearly → a stylistic signal exists;
  "solver constrains, Jev chooses" is a real design.
- Outcome B: near random / near nearest-note → its chord-tone behaviour is
  fully explained by the constraints; nothing here for a System One model,
  which is a clean negative result.

~300–500 decisions; ~$0.05 on Jev, a few dollars on Claude; ~1 hour.

## "Jev plays piano" demos (your ideas, 2026-09-17)

### Free melody generation
Minimal instruction (a sentence or two), Jev's output so far (or the last N
decisions), a range-constrained keyboard (pitch, maybe duration) and a STOP
option. Musically boring is fine; the demo is watching it decide, and *when
it chooses to stop* is a taste metric in itself (phrase lengths, cadence-like
endings, whether it stops at all).

### Next-chord picker → never-ending mellow piano — BUILT 2026-09-17 (`core/piano/`, `src/piano/`, `experiments/piano/run.ts`; the *piano* tab)
Options = a large set of jazz chord symbols (with inversions); input = what
has been played so far; Jev picks the next chord; code voices it onto the
piano with basic block-chord voice leading (minimal movement from the previous
voicing, keep in a mid register, root or inversion in the bass as chosen).
A stream of chords at the speed of Jev inference. Measure: chord-transition
plausibility against a corpus of jazz progressions (e.g. proportion of
transitions that appear in common standards), repetition rate, key drift.

#### Piano notes (first sessions, Jev, argmax unless noted)
- With a vibe that mentioned "falling-fifth root movement" it spiralled through
  m7 chords by descending fifths (Fm7 B♭m7 E♭m7 A♭m7 D♭m7 G♭m7…) and snapped
  back to Cmaj7–G7–Cmaj7 — the prompt's own words became the attractor.
- With a neutral vibe: an idiomatic 10–13 chord opening (Cmaj7 Am7/G Dm7 G7/F
  Cmaj7 Fmaj7♯11 Bm7♭5 Am7/G G7/F Cmaj7 …), then the fixed point: the same
  chord repeated (36/60), or with identical repeats forbidden, an oscillation
  on the tonic (Cmaj7 ↔ Cmaj9 ↔ Cmaj7♯11). Once home, argmax Jev never leaves.
- Sampling from its distribution at T=1 is near-random (flat distributions:
  20 key changes in 40 chords, m7♭5 and ♯11 everywhere). T≈0.4 is the sweet
  spot: mostly m7/maj7/7, ii–V–I returns, inversions, no loops. That is the
  demo default ("adventure" slider).
- Cost ≈ $0.0001 per chord, ~0.5 s of model time for the three calls.

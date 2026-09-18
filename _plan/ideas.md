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

### Next-chord picker → never-ending mellow piano
Options = a large set of jazz chord symbols (with inversions); input = what
has been played so far; Jev picks the next chord; code voices it onto the
piano with basic block-chord voice leading (minimal movement from the previous
voicing, keep in a mid register, root or inversion in the bass as chosen).
A stream of chords at the speed of Jev inference. Measure: chord-transition
plausibility against a corpus of jazz progressions (e.g. proportion of
transitions that appear in common standards), repetition rate, key drift.

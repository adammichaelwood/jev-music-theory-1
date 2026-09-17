# Self-answered design questions

Per D9: when I hit a design fork during autonomous work, I write the question
as I'd ask you, then answer it as you would (optimizing for "does Jev
understand basic music theory?"). Newest at the bottom. Flip any of these.

### S1. The controller in your message had no OCTAVE step, but the format needs an octave. Add one, or infer?
**Answer:** Add an explicit OCTAVE step (`2`–`6`) after PITCH. Inferring the
octave (e.g. "nearest to the previous note") would be code making a musical
decision — exactly what we're not doing. Choosing the register is part of
part-writing knowledge (ranges, spacing, crossing), so it's a real test.

### S2. Beat positions: your example listed `[1][2][3][4]`, but EIGHTH is a duration option. Offer off-beats?
**Answer:** Yes: `1, AND OF 1, 2, AND OF 2, …` for simple meters (and the
equivalent for compound). Otherwise eighths could only ever be placed on beats.
Worded semantically ("AND OF 2") rather than numerically ("2.5") because Jev
reads numbers poorly.

### S3. "No filtering" vs mechanically impossible moves (placing on top of a given note, a duration that crosses the barline). Offer them anyway?
**Answer:** Filter *mechanical* impossibilities only — a move that cannot be
represented in the score is not a music-theory choice, it's a UI bug. So:
BEAT omits positions occupied by given notes; DURATION omits values that
would overrun the barline or collide with a given note. Everything that is
musically wrong-but-representable (parallel fifths, a B♯ in C major, a bass
above the soprano) stays on the menu. The distinction is logged so we can
revisit it.

### S4. What happens to a Jev-placed note that the new note overlaps?
**Answer:** It is removed (and its remainder is not preserved). The turn log
records the overwrite. Simple, and it makes "revise" a natural consequence of
the same controller rather than a separate mode.

### S5. What is "the score context" Jev sees each sub-step?
**Answer:** A JSON state object: `{ format_guide, exercise: { title, key,
time_signature, instructions }, score_csv, this_turn_so_far }`. The score is
the exact CSV text you'd see in the exercise file (in the active format
variant). `this_turn_so_far` is the list of answers already chosen this turn
in words ("voice: SOPRANO", "measure: 2", …). No per-turn history of previous
turns (the score itself is the history).

### S6. Termination safety.
**Answer:** A per-run max-turn cap (default 150, adjustable) in addition to
Jev's own STOP. A run that hits the cap is reported as "did not stop".

### S7. Should I commit as I go?
**Answer:** Yes — local commits per phase, nothing pushed. Autonomous mode
implies it, and a per-phase history is the only sane way for either of us to
find where something went wrong.

### S8. Durations offered: your list was EIGHTH/QUARTER/HALF/WHOLE. Dotted values?
**Answer:** Also offer DOTTED-QUARTER and DOTTED-HALF (when they fit). A 3/4
cadence needs a dotted half; without it Jev has no way to write one and we'd
be measuring the controller, not the model.

### S9. Chorale excerpts start with a pickup and end mid-bar. Support pickups in the format?
**Answer:** No format change: pad the pickup bar and the final bar with
*given rests* in every voice (`REST-HALF`). Rests are ordinary notation, the
parser already reads them, and the alternative (variable bar lengths) touches
every module.

### S10. The `feedback` strategy loops: Jev rewrites the same note at the first-listed problem forever. Add a loop breaker?
**Answer:** No. A loop breaker would be code steering the model; the loop
*is* the finding (literal reading + no memory of its own failed attempts).
Cap the run, record it. A variant that lists issues in a different order or
names the offending voice more directly is a legitimate future condition.

### S11. Matrix was going to take 5+ hours sequentially.
**Answer:** Run jobs in parallel (8 workers) with `--resume` so a killed
matrix continues from the ledger. Rate limits (1,200 rpm) are far away.

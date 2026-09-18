# Jev plays piano — notes

The *piano* tab is not an experiment with a right answer; it is Jev improvising
chords, three multiple-choice decisions at a time (root → quality → bass tone),
with code voicing, arpeggiating and playing the result. There is nothing to
grade, only the shape of what it plays. These are the things we noticed.

## What it does

- **Argmax, neutral vibe:** an idiomatic opening of ten to thirteen chords
  (Cmaj7 · Am7/G · Dm7 · G7/F · Cmaj7 · Fmaj7♯11 · Bm7♭5 · Am7/G · G7/F · Cmaj7…),
  then a fixed point. Either the same chord repeated (36 of 60 in one run) or,
  with identical repeats forbidden, an oscillation on the tonic
  (Cmaj7 ↔ Cmaj9 ↔ Cmaj7♯11). Once "home", a decision model with no memory
  beyond the chord list has no reason to leave. This is the same fixed-point
  behaviour the chorale lab showed when a score reached a state it liked.
- **The prompt's words become the attractor.** A vibe sentence that mentioned
  "falling-fifth root movement" produced a spiral of minor sevenths down by
  fifths (Fm7 · B♭m7 · E♭m7 · A♭m7 · D♭m7 · G♭m7…) until it ran out of keys,
  with periodic snaps back to Cmaj7–G7–Cmaj7. Literal reading, as the docs warn.
- **Its distributions are flat.** Sampling from them at full temperature is
  near-random: 20 key changes in 40 chords, m7♭5 and ♯11 everywhere.
  Sharpened to about T = 0.4 the stream is what the demo wants — mostly
  m7 / maj7 / 7, ii–V–I returns, inversions, no loops. So the demo runs on
  Jev's own probabilities, sharpened, rather than its top choice; the
  "adventure" slider moves between the two.
- **The escape hatch** raises the temperature by 0.25 per chord whenever the
  last four roots contain at most two distinct roots, and decays back once the
  music moves. Neither this nor the no-repeat rule is a musical hint; both are
  ways of hearing more of what it knows.
- **Cost:** about $0.0001 per chord, ~0.5–0.8 s of model time for the three
  calls, hidden entirely under the hold.

## What it doesn't tell us

Whether any of it is *taste*. A random walk over jazz chord symbols with a
mild preference for common qualities would also sound mellow at a 4-second
hold with a Rhodes. The honest test — does Jev's choice among legal options
agree with what real players did? — is the Bach-agreement idea in `ideas.md`,
and it applies here too (agreement with the next chord in a corpus of
standards). We haven't run it.

We built it because it was fun.

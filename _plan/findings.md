# Findings — does Jev understand basic music theory?

## What we were exploring, and why

The question behind this project is simple to state: **how much music theory
does Jev know?** Jev is TypeSafe's System One model. Unlike a chat model it
does not generate text or reason out loud; it takes a state and a set of
typed questions and returns calibrated probabilities over the answers you
define. That makes it fast, cheap and easy to build software around — but it
also means its knowledge is only visible through the questions you ask.

Common-practice harmony is a good place to look for that knowledge. The
domain has explicit, teachable rules (chord construction, voice ranges,
parallel fifths, tendency-tone resolution), a large written literature that
any broadly trained model has seen, and a standard pedagogical task — the
undergraduate SATB part-writing exercise — whose results a program can grade.
If Jev has absorbed any of this, it should show up as better-than-chance
choices of pitches, registers and chords; if it hasn't, the grader will say so.

There are several ways one could put a decision model to work on music:

- **As a judge**: give it a finished passage and ask whether a rule is
  violated, which chord a sonority is, or which of two harmonizations is
  better. This is the most natural fit for a Choice/Score/Noul model, but it
  only tests recognition.
- **As a filter inside a search**: have code enumerate candidate notes or
  chords and let the model rank them. Powerful, but it hides how much the
  model itself knows behind the code that generated the candidates.
- **As the composer**, one decision at a time: give it the whole score and a
  controller, let it choose *where* to write and *what*, and never pre-filter
  its options for musical reasons. This is the hardest framing and the most
  revealing one, because every mistake is the model's own.

We chose the third. The hope was that Jev could act as a small unit of
"musical common sense" — able to look at a partly written chorale in a plain
text format, find the empty places, and fill them with chord tones in the
right register, following the basic voice-leading rules — and that we could
then learn what *presentation* (spelling of accidentals, alignment of the
score text, instructions, order of work) drew that ability out most fully.
Everything below is measured against that hope.

Narrative over the numbers in `results.md` (regenerated from `runs/index.jsonl`).
Model: `jev-1.13.0`. Written 2026-09-17 after ~250 runs; n per cell is 2–6,
so treat single-cell differences as suggestive, patterns across cells as real.

## Short answer

**Partial, and lopsided.** Jev has usable *chord-membership* knowledge and
sensible *register/rhythm* instincts, but essentially no *voice-leading* or
*bass-line* knowledge, and it cannot tell when it is looping.

## What it can do

- **Read the format.** Across every condition with any format guide, moves
  are mechanically sensible: it fills empty beats, matches the soprano's
  rhythm (HALF where the soprano has a half), and its BEAT/MEASURE/DURATION
  answers run at 0.7–0.95 confidence. The controller metaphor works.
- **Pick chord tones when the outer voices are given.** On 001 (S+B given,
  2 bars), 12/12 pitches in the first run were members of the chord implied
  by soprano+bass; chord rate across conditions is 72–94%. The piano view
  shows the diatonic set getting ~all the mass and every chromatic option at
  0–2% (in C major).
- **Register per voice.** OCTAVE 4 for alto, OCTAVE 3 for tenor, at 0.8+
  confidence, without ever seeing a range table (in `theory: exercise`).
- **Stop when the score is full** — on the easy exercise (001) every
  informative condition STOPs at 13–18 turns, right after completion.
- **Occasionally revise for the better** (baseline run 2: replaced a
  non-chord B with A).

## What it cannot do

- **Voice leading.** Parallel octaves (3–8 per run) and voice overlap (3–5)
  dominate every condition. It never treats the *relationship* between
  successive chords; each pitch is chosen as "a member of this chord".
- **Generate a bass line.** Given a melody alone (003, and the `-s-`
  chorales), it copies the melody into the other voices — the bass line
  becomes the tune an octave or two down. Chord rate collapses to 3–27%.
- **Figured bass.** On 002 it reads figures only weakly: `6` and `7` are
  frequently ignored (root-position triads under a `6`; no seventh under a
  `7`). Errors 6–15 per run versus 2–6 on 001.
- **Spacing / crossing.** Tenor written *below* the bass (OCTAVE 3 for both,
  no check against the bass's actual position) is common.
- **Know when it is looping.** The dominant failure on anything harder than
  001: it oscillates between two pitches at one slot (D↔F, alto m2 b2 of
  003) forever. With no memory of previous turns and a deterministic
  argmax, the state alternates and it never escapes. Runs hit the 80-turn cap
  with 55–78 "revisions". (Now cut short by the stall detector.)
- **Pitch confidence is flat (~0.2)** regardless of condition; the argmax is
  often right but the distribution never sharpens. Everything else it
  decides at 0.7–0.95.

## What draws it out (prompt levers)

- **Unicode accidentals hurt.** `A♭`-style spelling creates a "♭ attractor":
  in C major it writes B♭ at 44–58% confidence over an F chord, loops on it,
  and pitch confidence *doubles* to 0.43 while chord rate drops to 60%.
  Spell accidentals as words.
- **Column alignment alone hurts** (52 turns, 39 revisions on 001; 80-turn
  loops on 002/003). Combined with underscores + a detailed primer
  (`maximal`) it was the *best* cell on 001 (2.3 errors vs 5.8) but not on
  002/003 — likely noise at n=3, worth a larger test.
- **Removing the exercise text (`theory-none`, `minimal`) removes the STOP
  signal**: 0/3 stop, ~75 revisions. The task framing is what tells it the
  job has an end.
- **Theory primers** (brief or detailed) don't reduce voice-leading errors.
  Consistent with the docs' warning that Jev is not a rule-follower; rules in
  the state are just more text.
- **Format guide level** (none/brief/full) barely matters once the exercise
  text is present. `guide-none` still works on 001 — the CSV is
  self-explanatory enough.
- **Step wording** (plain vs contextual) makes no measurable difference.
- **Empty measure as `_ _ _ _` vs blank cell**: no clear effect on 001;
  on 002 (where blank trailing cells were suspected of causing premature
  STOP) underscores did *not* fix it.

## What draws it out (strategies)

- **`backward`** (cadence-first) is the one strategy that reliably
  *finishes* the hard exercises (3/3 STOP on 002 and 003) with zero
  revisions, and had the fewest errors on 002 (7.7 vs 15 baseline). It
  removes the choice of *where* to work, which is where the loops start.
- **`forward`** finishes fast with zero revisions but more parallel octaves
  (it never looks back).
- **`line`** (one voice at a time) — no benefit; loops on 003.
- **`feedback`** (grader issues in state, no suggestions) is a trap: it
  fixates on the first-listed issue and rewrites the same note 28+ times.
  Combined with `forward` it produced the best chord rates on 003 (64%) but
  never STOPs.
- **`merged-pitch`** (pitch+octave as one 105-way Choice): best chord rate
  on 001 (89%) and the fewest crossings overall (0.3 vs 2.1) — choosing
  register *with* the pitch seems to help — but it loops on 003.
- **`fanout`** (all six questions in one request): fails; without seeing its
  own voice/measure choice the pitch answer is generic ("G, octave 4").
  The sequential sub-loop is doing real work.
- **`windowed`** (measure ±1): n=1, 3 errors on 001 — promising, untested
  further.
- **`history`** (recent moves in state): breaks the D↔F oscillation on 003
  (39 turns, STOP) but the result is still melody-copying.

## Where the capability ends (graded chorale series, round two — partial, n=2)

Exercises 010–017 are real Bach chorale phrases (Humdrum kern → our format),
levels 2–5: soprano+bass given (`-sb-`) or soprano only (`-s-`), one to three
phrases, with pickup bars padded by rests.

- **Most conditions stall on the first note.** `baseline`, `maximal`,
  `merged-pitch` and `history` end after 3–7 turns: Jev writes the pickup
  note, then re-writes the *identical* note at the identical place. With no
  memory and a (near-)deterministic argmax, a no-op move is a fixed point —
  the stall detector ends the run. This never happened on the 2-bar
  exercises; the rest-padded pickup bar (`REST-HALF _`) is the likely
  trigger, since the free beat in measure 1 stays the most salient target.
- **`backward` is the exception.** It finished 011 and 012 (2/2 STOP each),
  and on 012 — harmonizing a C-major chorale melody, all three lower voices
  from scratch — produced **3 errors, 58% recognizable chords, 0 revisions**.
  That is the best result on any melody-only exercise, and it comes from
  forcing the *order of work*, not from any musical hint. On the two-phrase
  013 it stalled too (23 errors): the boundary is about one phrase.
- Rough capability ladder, best condition per exercise:

| level | exercise | best condition | errors | chords | finishes? |
|---|---|---|---|---|---|
| 1 | 001 cadence, S+B given, 2 bars | maximal | 2.3 | 89% | yes |
| 1 | 004 root-doubled, S+B given | baseline | 10–14 | 86% | yes |
| 2 | 002 figured bass, 2 bars | backward | 7.7 | 44% | yes |
| 2 | 010/011 chorale phrase, S+B | backward | 13 | 24–48% | mostly |
| 3 | 003 D-minor melody, 3/4 | backward | 17 | 52% | yes |
| 3 | 012 chorale phrase, S only | backward | 3 | 58% | yes |
| 3 | 013 two chorale phrases, S only | — | 23–24 | 6–15% | no |

## Cost

$0.004–0.04 per run; ~1,200–1,500 input tokens per request; 100–400 ms per
request. The whole matrix so far cost under $5.

## Open questions / next experiments

1. Larger n on `maximal`, `backward`, `merged-pitch`, `windowed` and their
   combinations (`backward-history`, `maximal-history` are in round two).
2. ~~Is chord-membership knowledge real or is it "pick the pitch that appears
   in the other voices"?~~ **Tested (exercise 004, S and B double every root
   in F major):** it supplies pitches absent from the given voices — A over
   F/F and D over B♭/B♭, the correct thirds — so it is not copying. But it
   wrote E♭ over C (a minor v in F major), A-A over G (no ii chord at all),
   and never supplied a fifth. Its chord knowledge is roughly "a third above
   the bass", with chord *quality* unreliable in a flat key.
3. A "chord first" decomposition (choose a Roman numeral per beat, then
   pitches) would test harmonic knowledge separately from part writing — it
   is help of a kind, but a different kind.

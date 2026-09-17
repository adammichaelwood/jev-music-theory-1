# Jev / TypeSafe notes relevant to this project

Distilled from the live docs on 2026-09-17 (skill: `typesafe-ai`; index at
https://docs.typesafe.ai/llms.txt). Re-check the docs before writing
integration code — this is orientation, not the contract.

## What Jev is
- System One decision model. Input: `state` (string / JSON object / array of
  text) + `questions`. Output: typed answers with probabilities. **No text
  generation.**
- Three primitives:
  - **Choice** — pick one of a defined set; returns `choice`, `probabilities`
    over all options, `confidence`.
  - **Score** — position on ordered described levels; returns `score`,
    `probabilities`, `confidence`.
  - **Noul** — yes/no; returns probability of yes (`noul`), no confidence field.
- All questions in a request see the same state, are evaluated independently
  and in parallel. Adding questions is nearly free in latency → **speculative
  fan-out**: ask everything you might need in one call.
- Reference state fields in instructions with backticked paths:
  `` `score.voices.alto[3]` ``.
- Question IDs are not sent to the model; put the full question in
  `instructions`. Criteria (options/levels) can be strings or structured JSON.

## Limits that shape the design (jev-1.13)
- **No counting / arithmetic / numeric comparison.** Intervals, parallels,
  spacing, ranges → code.
- **Prefers semantic representations over numeric.** Use `Ab4`, `"minor
  sixth"`, `"leading tone"` — not MIDI 68 or semitone counts.
- **Literal reading.** Write the exact condition; put boundary cases in criteria.
- **Indirection hurts.** Don't ask "would the note that resolves the note
  before this one be…". Precompute and name the relevant facts in state.
- **Context rot.** Irrelevant state lowers accuracy. Send a *windowed* view of
  the score (the neighborhood of the decision) plus global facts (key, meter,
  cadence goals), not necessarily the whole chorale for every question.
- **Limits:** 64k tokens total (state + all questions); 32k for state + the
  longest single question.
- **Adversarial/misleading state can steer it** — not a concern here, but
  keep instruction text and state labels consistent.
- Contradictory instructions vs criteria degrade results; align them.

## API / SDK
- Endpoint: `POST https://api.typesafe.ai/v1/systemone`, `Authorization:
  Bearer <key>`. Field `model`: `jev-latest` (default) or pinned `jev-1.13.0`.
  Response reports the versioned model that answered.
- JS SDK: `npm install @typesafe-ai/sdk` (Node ≥ 20). `new TypeSafeClient()`
  reads `TYPESAFE_API_KEY`; `client.systemOne({ state, questions })`;
  helpers `choice()`, `score()`, `noul()`. SDK v0.6.0 at time of writing.
- **CORS:** browser origins are rejected (`Disallowed CORS origin`, tested
  with `localhost:5173` and a `github.io` origin). Calls must go through a
  server-side proxy.
- Pricing: $0.042 / Mtok input; output free. Rate limits: 250k tok/s,
  1,200 req/min (subject to change).

## Doc pages to re-read before the relevant phase
- Primitives & structure: `/primitives.md`, `/primitives/choice.md`,
  `/primitives/advanced.md`
- Confidence: `/confidence.md`, `/patterns/confidence-routing.md`
- Fan-out: `/patterns/fan-out.md`
- Building guide: `/concepts/how-to-build-with-system-one.md`
- JS SDK reference: `/sdk/javascript/api.md`; HTTP API: `/api.md`
- Closest cookbooks: `function_calling` (route + fill typed args),
  `rerank_typesafe` (per-candidate judgments), `hierarchical_classification`
  (beam search over Choice probabilities — relevant to look-ahead).

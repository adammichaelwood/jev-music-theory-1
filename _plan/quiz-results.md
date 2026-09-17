# Theory quiz results

Generated 2026-09-17T23:16:04.921Z from `runs/quiz.jsonl` (607 answers). Accuracy per decider; "chance" is the mean of 1/options.

## By tier

| tier | n | chance | jev | claude-haiku | claude-sonnet | claude-opus |
|---|---|---|---|---|---|---|
| 1 | 24 | 5% | 71% | 88% | 100% | 100% |
| 2 | 24 | 22% | 38% | 54% | 92% | 100% |
| 3 | 40 | 14% | 20% | 33% | 85% | 98% |
| 4 | 32 | 31% | 56% | 66% | 100% | 100% |
| 5 | 32 | 17% | 81% | 94% | 100% | 100% |
| **all** | 152 | 18% | 51% | 64% | 95% | 99% |

## By question kind

| tier | kind | chance | jev | claude-haiku | claude-sonnet | claude-opus | Jev mean p(correct) |
|---|---|---|---|---|---|---|---|
| 1 | key-signature | 7% | 50% | 88% | 100% | 100% | 0.43 |
| 1 | scale-degree | 5% | 100% | 100% | 100% | 100% | 0.56 |
| 1 | interval-above | 5% | 63% | 75% | 100% | 100% | 0.45 |
| 2 | interval-name | 8% | 38% | 50% | 88% | 100% | 0.26 |
| 2 | triad-quality | 25% | 50% | 38% | 100% | 100% | 0.34 |
| 2 | triad-root | 33% | 25% | 75% | 88% | 100% | 0.32 |
| 3 | roman-numeral | 14% | 13% | 13% | 88% | 100% | 0.14 |
| 3 | inversion | 33% | 38% | 38% | 75% | 100% | 0.37 |
| 3 | figured-bass | 14% | 13% | 13% | 75% | 88% | 0.17 |
| 3 | seventh-of-v7 | 5% | 0% | 0% | 88% | 100% | 0.05 |
| 3 | tendency-resolution | 5% | 38% | 100% | 100% | 100% | 0.37 |
| 4 | parallels | 33% | 50% | 38% | 100% | 100% | 0.36 |
| 4 | doubling | 33% | 50% | 38% | 100% | 100% | 0.49 |
| 4 | spacing-crossing | 33% | 25% | 88% | 100% | 100% | 0.44 |
| 4 | cadence-type | 25% | 100% | 100% | 100% | 100% | 0.93 |
| 5 | secondary-dominant | 20% | 88% | 86% | 100% | 100% | 0.66 |
| 5 | enharmonic | 5% | 88% | 100% | 100% | 100% | 0.78 |
| 5 | neapolitan | 20% | 88% | 88% | 100% | 100% | 0.61 |
| 5 | augmented-sixth | 22% | 63% | 100% | 100% | 100% | 0.53 |

## Cost and latency

| decider | model | answers | total $ | $/answer | mean ms |
|---|---|---|---|---|---|
| jev | jev-1.13.0 | 152 | 0.0026 | 0.00002 | 350 |
| claude-haiku | claude-haiku-4-5-20251001 | 151 | 0.0840 | 0.00056 | 870 |
| claude-sonnet | claude-sonnet-5 | 152 | 0.3106 | 0.00204 | 2323 |
| claude-opus | claude-opus-5 | 152 | 0.6195 | 0.00408 | 2692 |

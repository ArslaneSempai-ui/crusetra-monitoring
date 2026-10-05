# Crusetra Monitoring: the public measure

**Provenance**: no real transaction is public: written and generated, and it says so. Cases written by this repository (archetypes of
suspicion and their benign look-alikes) plus seeded, structure-preserving variants,
measured APART and never merged. Commit `85f8a11`, 2026-09-07. Sealed as
`releve-public.json`; every rate below carries its n and its 95 % Wilson interval, and
the FULL threshold grid (51 steps) lives in the JSON; this page shows
8 declared columns of it. The record also carries the declared scales it was
measured under (`echelles`): change a scale and the scores move with it.

Scenarios measured: `amount`, `velocity`, `structuring`, `round`, `zscore`, `passthrough`, `peer`. An eighth, learned scenario is named ABSENT from day one: it will come or it will not, it will never be guessed.

## Written cases (authored): 42 suspicious, 42 benign

The set's value is its benign look-alikes: a payroll looks like rapid movement from afar.
Natures: structuring x7, rapid-movement x7, dormant-burst x7, round-tripping x7, cash-intensive x7, layering-fan-out x7, payroll x7, seasonal-trade x7, loan-repayment x7, rent-collection x7, savings-transfer x7, one-off-purchase x7.

### Recall on the suspicious cases (higher is safer)

| scenario | 0.50 | 0.60 | 0.70 | 0.80 | 0.85 | 0.90 | 0.95 | 1.00 |
|---|---|---|---|---|---|---|---|---|
| `amount` | 95% [84-99] | 86% [72-93] | 67% [52-79] | 50% [36-64] | 50% [36-64] | 40% [27-56] | 26% [15-41] | 0% [0-8] |
| `velocity` | 29% [17-44] | 21% [12-36] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] |
| `structuring` | 17% [8-31] | 17% [8-31] | 17% [8-31] | 17% [8-31] | 17% [8-31] | 17% [8-31] | 17% [8-31] | 0% [0-8] |
| `round` | 45% [31-60] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] |
| `zscore` | 83% [69-92] | 83% [69-92] | 83% [69-92] | 83% [69-92] | 83% [69-92] | 83% [69-92] | 83% [69-92] | 0% [0-8] |
| `passthrough` | 50% [36-64] | 50% [36-64] | 48% [33-62] | 48% [33-62] | 43% [29-58] | 40% [27-56] | 29% [17-44] | 5% [1-16] |
| `peer` | 88% [75-95] | 79% [64-88] | 76% [61-87] | 76% [61-87] | 76% [61-87] | 76% [61-87] | 74% [59-85] | 0% [0-8] |

### False alerts on the benign look-alikes (every point is an analyst's minutes)

| scenario | 0.50 | 0.60 | 0.70 | 0.80 | 0.85 | 0.90 | 0.95 | 1.00 |
|---|---|---|---|---|---|---|---|---|
| `amount` | 17% [8-31] | 17% [8-31] | 17% [8-31] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] |
| `velocity` | 50% [36-64] | 19% [10-33] | 5% [1-16] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] |
| `structuring` | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] |
| `round` | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] |
| `zscore` | 67% [52-79] | 50% [36-64] | 33% [21-48] | 33% [21-48] | 33% [21-48] | 33% [21-48] | 33% [21-48] | 0% [0-8] |
| `passthrough` | 17% [8-31] | 14% [7-28] | 2% [0-12] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] |
| `peer` | 17% [8-31] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] | 0% [0-8] |

## Generated variants (synthetic): 126 suspicious, 126 benign

Seeded, declared, never merged with the written set.

### Recall

| scenario | 0.50 | 0.60 | 0.70 | 0.80 | 0.85 | 0.90 | 0.95 | 1.00 |
|---|---|---|---|---|---|---|---|---|
| `amount` | 100% [97-100] | 94% [89-97] | 87% [79-91] | 58% [49-66] | 51% [42-59] | 41% [33-50] | 36% [28-44] | 0% [0-3] |
| `velocity` | 29% [21-37] | 21% [15-29] | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] |
| `structuring` | 17% [11-24] | 17% [11-24] | 17% [11-24] | 17% [11-24] | 17% [11-24] | 17% [11-24] | 17% [11-24] | 0% [0-3] |
| `round` | 46% [38-55] | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] |
| `zscore` | 83% [76-89] | 83% [76-89] | 83% [76-89] | 83% [76-89] | 83% [76-89] | 83% [76-89] | 83% [76-89] | 0% [0-3] |
| `passthrough` | 50% [41-59] | 49% [41-58] | 48% [39-56] | 45% [37-54] | 42% [34-51] | 33% [26-42] | 27% [20-35] | 11% [7-18] |
| `peer` | 93% [87-96] | 88% [81-93] | 79% [71-86] | 76% [68-83] | 76% [68-83] | 76% [68-83] | 76% [68-83] | 0% [0-3] |

### False alerts

| scenario | 0.50 | 0.60 | 0.70 | 0.80 | 0.85 | 0.90 | 0.95 | 1.00 |
|---|---|---|---|---|---|---|---|---|
| `amount` | 17% [11-24] | 17% [11-24] | 12% [7-19] | 4% [2-9] | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] |
| `velocity` | 50% [41-59] | 19% [13-27] | 5% [2-10] | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] |
| `structuring` | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] |
| `round` | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] |
| `zscore` | 61% [52-69] | 48% [39-56] | 34% [26-43] | 33% [26-42] | 33% [26-42] | 33% [26-42] | 33% [26-42] | 0% [0-3] |
| `passthrough` | 13% [8-20] | 12% [7-19] | 2% [1-7] | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] |
| `peer` | 13% [8-20] | 8% [4-14] | 1% [0-4] | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] | 0% [0-3] |

## The cell the tool's own rule retains

No cell holds a recall lower bound of 90 % on the written cases: said, not hidden.

Generated by `npm run measure`; a sealed record refuses silent overwrite.

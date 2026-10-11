# Monitoring measurement on your own dispositioned alerts

## What was measured

1200 alert(s) from `amlworld-alerts.csv` (sha256 58ee67e865d4e430…), rebuilt into thirty-day cases from `amlworld-transactions.csv` (17826 transaction row(s) over 1200 account(s), sha256 5bca84e6ed11085a…), measured on this machine on 2026-10-11. Nothing left it.

- confirmed suspicious: 300
- benign (closed without action): 900
- cases with no transaction before their window: 1200; the relative
  scenarios (zscore, peer) score 0 there; the count travels with the rates rather than
  dissolving into them.
- period: not measured; no readable decided_at column. Monthly figures downstream need it.
- accounts monitored per month: not supplied. The alerts-per-thousand column does not appear; it is never estimated in silence.

One limit, stated up front: this history contains only the alerts your CURRENT programme
raised and your analysts dispositioned. A pattern nobody ever alerted on is invisible to
this file. Robustness on manufactured cases is measured separately, on the public record,
which is entirely synthetic and says so (section 4).

## The frontier, scenario by scenario

Thresholds shown: 0.50, 0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 0.99, 1.00; the full grid of
51 lives in the sealed record beside this file.

### `amount` (the largest single amount in the window, squashed onto [0, 1] by the declared amount scale)

| threshold | alerts raised | recall (n=300) | interval | false alerts (n=900) | interval |
|---|---|---|---|---|---|
| 0.50 | 644 | 65.7 % | [60–71] | 49.7 % | [46–53] |
| 0.60 | 604 | 61.3 % | [56–67] | 46.7 % | [43–50] |
| 0.70 | 556 | 54.7 % | [49–60] | 43.6 % | [40–47] |
| 0.75 | 538 | 53.0 % | [47–59] | 42.1 % | [39–45] |
| 0.80 | 524 | 52.0 % | [46–58] | 40.9 % | [38–44] |
| 0.85 | 492 | 50.3 % | [45–56] | 37.9 % | [35–41] |
| 0.90 | 468 | 48.3 % | [43–54] | 35.9 % | [33–39] |
| 0.95 | 438 | 44.7 % | [39–50] | 33.8 % | [31–37] |
| 0.99 | 396 | 41.0 % | [36–47] | 30.3 % | [27–33] |
| 1.00 | 168 | 18.0 % | [14–23] | 12.7 % | [11–15] |

### `velocity` (how many transactions the window holds, squashed onto [0, 1] by the declared velocity scale)

| threshold | alerts raised | recall (n=300) | interval | false alerts (n=900) | interval |
|---|---|---|---|---|---|
| 0.50 | 559 | 48.0 % | [42–54] | 46.1 % | [43–49] |
| 0.60 | 463 | 39.3 % | [34–45] | 38.3 % | [35–42] |
| 0.70 | 329 | 29.3 % | [24–35] | 26.8 % | [24–30] |
| 0.75 | 294 | 24.7 % | [20–30] | 24.4 % | [22–27] |
| 0.80 | 234 | 20.0 % | [16–25] | 19.3 % | [17–22] |
| 0.85 | 186 | 15.3 % | [12–20] | 15.6 % | [13–18] |
| 0.90 | 138 | 11.3 % | [8–15] | 11.6 % | [10–14] |
| 0.95 | 68 | 7.0 % | [5–10] | 5.2 % | [4–7] |
| 0.99 | 18 | 2.0 % | [1–4] | 1.3 % | [1–2] |
| 1.00 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |

### `structuring` (cash deposits sitting just under the declaration threshold, summed over short sliding sub-windows)

| threshold | alerts raised | recall (n=300) | interval | false alerts (n=900) | interval |
|---|---|---|---|---|---|
| 0.50 | 6 | 0.3 % | [0–2] | 0.6 % | [0–1] |
| 0.60 | 3 | 0.3 % | [0–2] | 0.2 % | [0–1] |
| 0.70 | 3 | 0.3 % | [0–2] | 0.2 % | [0–1] |
| 0.75 | 3 | 0.3 % | [0–2] | 0.2 % | [0–1] |
| 0.80 | 3 | 0.3 % | [0–2] | 0.2 % | [0–1] |
| 0.85 | 3 | 0.3 % | [0–2] | 0.2 % | [0–1] |
| 0.90 | 3 | 0.3 % | [0–2] | 0.2 % | [0–1] |
| 0.95 | 3 | 0.3 % | [0–2] | 0.2 % | [0–1] |
| 0.99 | 2 | 0.3 % | [0–2] | 0.1 % | [0–1] |
| 1.00 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |

### `round` (the share of round amounts, and how many outgoings follow an incoming within the declared pass-through delay)

| threshold | alerts raised | recall (n=300) | interval | false alerts (n=900) | interval |
|---|---|---|---|---|---|
| 0.50 | 185 | 16.3 % | [13–21] | 15.1 % | [13–18] |
| 0.60 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.70 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.75 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.80 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.85 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.90 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.95 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.99 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 1.00 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |

### `zscore` (the window's peak amount measured in standard deviations above this account's own pre-window history)

| threshold | alerts raised | recall (n=300) | interval | false alerts (n=900) | interval |
|---|---|---|---|---|---|
| 0.50 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.60 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.70 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.75 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.80 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.85 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.90 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.95 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.99 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 1.00 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |

### `passthrough` (how much of what came in went back out, and how briefly the funds stayed (first-in, first-out))

| threshold | alerts raised | recall (n=300) | interval | false alerts (n=900) | interval |
|---|---|---|---|---|---|
| 0.50 | 295 | 28.3 % | [24–34] | 23.3 % | [21–26] |
| 0.60 | 278 | 27.3 % | [23–33] | 21.8 % | [19–25] |
| 0.70 | 267 | 26.3 % | [22–32] | 20.9 % | [18–24] |
| 0.75 | 262 | 26.0 % | [21–31] | 20.4 % | [18–23] |
| 0.80 | 256 | 25.7 % | [21–31] | 19.9 % | [17–23] |
| 0.85 | 253 | 25.3 % | [21–31] | 19.7 % | [17–22] |
| 0.90 | 249 | 25.3 % | [21–31] | 19.2 % | [17–22] |
| 0.95 | 244 | 25.0 % | [20–30] | 18.8 % | [16–21] |
| 0.99 | 240 | 25.0 % | [20–30] | 18.3 % | [16–21] |
| 1.00 | 238 | 24.3 % | [20–29] | 18.3 % | [16–21] |

### `peer` (how far the window's mean amount sits from a declared peer-group profile, in peer standard deviations)

| threshold | alerts raised | recall (n=300) | interval | false alerts (n=900) | interval |
|---|---|---|---|---|---|
| 0.50 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.60 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.70 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.75 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.80 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.85 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.90 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.95 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 0.99 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |
| 1.00 | 0 | 0.0 % | [0–1] | 0.0 % | [0–0] |

## The recommended cell, under the declared recall floor

The rule of the tool: recall lower bound at or above recallFloor = 0.9 suspicious cases recalled/confirmed case (assumed),
then the fewest false alerts; yours to set with `optimise -- --recall=<min>`.

No cell holds a recall lower bound of 0.9 on this sample
(300 confirmed suspicious). Lower the floor knowingly, or measure a
longer window of history: the bound tightens with n.

## Synthetic robustness, kept apart

Not measured in this run: no real transaction is public, so the public record of this
tool is ENTIRELY fabricated (authored archetypes of suspicion with their benign
look-alikes, plus seeded variants) and it says so on every figure. It never merges
with the rates above: your history measures your programme's reality, the fabricated
cases measure what a scenario can see at all. Provenance keeps the words apart:
those figures are `synthetic` or `authored`, never `measured`.

## Provenance

- measured: every rate in section 2, on your files, n and interval attached.
- assumed: seuilDeclaration = 10000 account currency/report (assumed); echelleMontant = 20000 account currency at 0.63 score (assumed); echelleVelocite = 15 transactions per window at 0.63 score (assumed); joursStructuration = 7 days/sub-window (assumed); joursPassage = 3 days in-to-out (assumed); pairsMoyenne = 900 account currency/transaction (assumed); pairsEcartType = 1200 account currency/transaction (assumed); minutesPerAlert = 20 minutes/alert (assumed); analystAnnualCost = 62000 usd/year (assumed); productiveHoursPerDay = 6 hours/day (assumed); workingDaysPerYear = 220 days/year (assumed); accountsPerMonth = 100000 accounts/month (assumed); recallFloor = 0.9 suspicious cases recalled/confirmed case (assumed).
- the scales above are the ones THIS record was measured under; the sealed record
  snapshots them, because changing a scale changes every score.
- seal: 13d0ad682c461ac7 · measured 2026-10-11 · code at commit 8e87d5a

No value from your files (no account_id, no amount, no transaction date, no country)
appears in this report or in the sealed record; verdicts are keyed by your alert_id and
carry your analyst's disposition and whether the case had history, never a score. The
alert ids and the file names are yours and DO survive: choose them opaque.

# Crusetra · Monitoring

**Which transaction-monitoring scenario suffices, at which threshold, measured on your own
dispositioned alerts.** Nothing of yours goes up: this tool downloads nothing, your alerts
and your transactions stay on your machine.

Transaction monitoring raises alerts; most of them are false, each one costs analyst
minutes, and nobody can say why a scenario sits at its threshold except "that is the
vendor's setting". This tool measures it: several scenarios, from a bare amount to the
deviation from a peer profile, are replayed over the alerts your analysts already
dispositioned, each alert rebuilt into a thirty-day case from your own transactions, and
each scenario × threshold cell is read for recall on confirmed suspicious cases, false-alert
rate on benign ones and alerts per thousand accounts, with its count and its interval, or
not at all.

No real transaction is public, so the public record of this tool is entirely written and
generated, and says so: cases we wrote (with their benign look-alikes) and seeded variants,
kept apart. The measure that counts is yours, on your machine.

It is the third tool of the Crusetra suite, after [Crusetra Routing](https://github.com/ArslaneSempai-ui/crusetra-routing)
(which extraction tier suffices per field) and [Crusetra Screening](https://github.com/ArslaneSempai-ui/crusetra-screening)
(which name matcher, at which threshold). Same method, same seal, same key.

<!-- figures:commandes -->
| Command | What it does, in the order that makes sense |
|---|---|
| `npm ci --ignore-scripts` | install exactly the versions the lockfile pins, and run no install script from any dependency; the only command that needs the network: this tool downloads nothing else, ever |
| `npm run test` | types, the README blocks, the licence inventory, and the suite. Start here; it runs with the network cut |
| `npm run measure [-- --yes-overwrite]` | the public measure: every scenario at every threshold on cases we wrote (benign cases included) plus declared generated variants, sealed into `releve-public.json` and readable in `RELEVE-PUBLIC.md`: no real transaction is public, and the record says so; it refuses to overwrite a sealed one without the flag |
| `npm run measure:yours -- --alerts=<csv> --transactions=<csv> [--volume=N]` | your own dispositioned alerts, rebuilt into thirty-day cases from your transactions: recall on confirmed suspicious cases and false-alert rate on benign ones per scenario and threshold, with n and interval; a sealed record and a report beside your file, never a value of yours |
| `npm run optimise -- --from=<record> --recall=<min>` | the best trade-off: fewest alerts with the recall lower bound held, or `--alert-budget=<N>` for the highest bounded recall under a monthly alert budget |
| `npm run sceller -- <record.json>` | seal a record: the content hash that makes a silently edited measurement fail loudly; the same content hash as Crusetra Routing |
| `npm run verify -- <report>` | check that a report was issued by the holder of the suite's public key, `cle-publique.pem`, without asking us |
| `npm run licences` | regenerate `LICENCES.md`, the licence of every shipped package; `--check` fails the suite when the table drifts |
<!-- /figures:commandes -->

## Requirements

Node 24 or newer, on **macOS or Linux**. Windows has not been tested and is not claimed.

## What leaves your machine

Nothing. This tool has no list to download and no model to fetch: every command runs with
the network cut, and a test reads every source so that no module ever grows a network call
(`src/frontiere.test.ts`).

## What is measured, assumed, synthetic

Every rate in a report carries its `n` and its 95 % Wilson interval. The scales that turn
an amount or a count into a score, the cash reporting threshold, analyst minutes per alert
and analyst cost are **assumed** and declared in `src/assumptions.ts`. The public record is
**written and generated**: cases we authored and seeded variants, measured apart, never
merged into anything measured on your data. Below five confirmed suspicious cases, no
recall is quoted, and the report states why.

## Seals and signatures

Records are sealed (`npm run sceller`) with the same content hash as Crusetra Routing, and
reports are verified against the same public key, [`cle-publique.pem`](cle-publique.pem),
with `npm run verify`.

<!-- figures:tests -->
**128 tests** across 18 files, counted by running the suite rather than typed here.
<!-- /figures:tests -->

## Licence

The same public licence as Crusetra Routing: non-commercial use without limit of time, a
thirty-day evaluation on your own records for organisations, a commercial licence for
production. See [LICENSE](LICENSE) and [LICENCES.md](LICENCES.md).

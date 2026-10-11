# IBM AMLworld: the tool measured on public, synthetic transactions

This folder is a complete, public run of `npm run measure:yours` on a public dataset, so that anyone can read what
the tool writes without sending us a file of theirs. The dataset is IBM AMLworld ("IBM Transactions for Anti Money
Laundering (AML)", by Erik Altman and IBM, on [Kaggle](https://www.kaggle.com/datasets/ealtman2019/ibm-transactions-for-anti-money-laundering-aml)),
a simulation of a banking world whose generator plants laundering patterns among ordinary payments. We use its
`HI-Small_Trans.csv` file. The sealed record is `amlworld-alerts-measured.json` and its report is
`amlworld-alerts-measured.md`. Every rate, count and interval is in those two files; none is typed here.

## What this is, and what it is not

AMLworld labels **transactions** (a column says whether a row belongs to a laundering pattern). It holds no alert and
no analyst decision. The alerts in this folder are therefore **constructed** by `map-alerts.ts` from those labels:
no monitoring system raised them and no analyst closed them. So the rates in the record are not the false-alert rate
of a real system, and not yours. They show what the tool writes, and what a first look at a scenario grid on this
kind of data reads like. The measure that counts is the one you run on your own alerts.

## How the alerts are built

The whole story is the header of `map-alerts.ts`; in short:

- Only accounts seen in US Dollars alone are used. The tool's amounts have one currency, and no exchange rate is
  invented. An account that touches another currency, on either side of a row, is left out.
- An account in at least one laundering row is a `suspicious` alert, its window ending on the day of its earliest
  laundering row. A selection of them is kept, by a fixed hash order on a declared seed.
- A `benign` alert is an account in no laundering row at all, drawn among the accounts active the same day as a
  suspicious one, three for each. The tool's window grows with its end day, so without this matching the largest
  amount in the window would tell the classes apart for a reason that has nothing to do with laundering.
- The transactions file keeps, for each alerted account, its rows up to the end of its window day: `out` at the amount
  paid for the payer, `in` at the amount received for the payee, one `out` row for a transfer to oneself. The file
  gives no time zone; its clock times are read as UTC. Payment formats are folded onto the tool's five channels by a
  table in the script, and a format the table does not know stops the run.

## What the record says, and what it cannot

- **No case has history.** The whole file falls inside one thirty-day window, so no account has a transaction before
  its window. The scenarios that compare an account with its own past or with a peer profile (`zscore`, `peer`) score
  nothing here, and the record counts these cases instead of hiding them.
- **The scenarios do not separate the two classes much.** In the report, at every threshold, the recall and the false-alert
  rate of a scenario move together, and the report finds no cell that holds the declared recall floor. That is a
  statement about constructed alerts on a synthetic world, not about the scenarios.
- **The benign alerts are not what a system would have raised.** They are ordinary accounts. A real alert queue is
  made of accounts that already looked odd to some rule, which is harder to tell from a laundering one than a random
  active account is.
- **The seal says the record did not move after it was written.** It does not say the mapping is right. Read the
  header of `map-alerts.ts`, and the test that plants a file and checks each rule (`src/amlworld-mapping.test.ts`).

## Run it again

The network statement of this tool, repeated here word for word from the main README and kept in `src/reseau.ts`:

<!-- figures:reseau -->
Only `npm ci --ignore-scripts` reaches the network, to get the pinned development dependencies from the npm registry at install time. Every other command, `npm run test`, `npm run measure:yours` and `npm run example:amlworld` included, uses no network at all: the tool has no runtime dependency and imports `node:` built-ins only. No command downloads the AMLworld file: you get it yourself from Kaggle, with your own account, and `npm run example:amlworld` reads that local copy.
<!-- /figures:reseau -->

The file to get is `HI-Small_Trans.csv`, from the Kaggle page above (a Kaggle login is needed).

```
node examples/amlworld/map-alerts.ts --input=<HI-Small_Trans.csv> --out=<a new folder>
npm run measure:yours -- --alerts=<that folder>/amlworld-alerts.csv --transactions=<that folder>/amlworld-transactions.csv
npm run sceller -- examples/amlworld/amlworld-alerts-measured.json --check
```

The first command refuses an output folder that already holds files. Run the second one on the files in the new
folder, not on the ones in this folder: it writes its record beside the alerts file and would overwrite the committed
one. The regenerated alerts file is the same as the committed one, byte for byte, and the transactions file is
the one the record names by its SHA-256 (`transactions.sha256`). Compare both hashes with the record's: they match
when the mapping is reproduced. The seal and the measurement date differ, because the record also holds the date and
the commit it was measured at. The third command checks that the committed record still matches its seal; it never
writes.

## Licence of this folder

The alerts file `amlworld-alerts.csv` is a **changed** subset of IBM AMLworld, and the record
`amlworld-alerts-measured.json` and its report `amlworld-alerts-measured.md` are derived from it. All three stay
under the [Community Data License Agreement, Sharing, Version 1.0](https://cdla.dev/sharing-1-0/) (CDLA-Sharing 1.0):
the agreement, not this README, says what anyone who receives them may do with them. It is shipped unmodified in
`CDLA-Sharing-1.0.txt`, as read on https://cdla.dev/sharing-1-0/ on 2026-10-11 (the page's markup removed, no word
changed); a test holds the file to that text by its hash.

Credit to the provider: the data come from IBM Transactions for Anti Money Laundering (AML), also called IBM
AMLworld, by Erik Altman and IBM, <https://www.kaggle.com/datasets/ealtman2019/ibm-transactions-for-anti-money-laundering-aml>.

Notice that these files were changed (CDLA-Sharing 1.0, section 3.1(b)): none of them is the original data.

- `amlworld-alerts.csv`: changed. A small selection of the accounts of the original file, rearranged into one row per
  alert; the transaction labels are mapped to a disposition per account, and an alert id and a window end date are
  added. The account identifiers are the dataset's own.
- `amlworld-alerts-measured.json`: changed. Written by the tool from the alerts file and from the transactions of the
  alerted accounts; it holds counts, rates, intervals and, by alert id, the disposition.
- `amlworld-alerts-measured.md`: changed. The report the tool writes beside that record.

The transactions file the mapping produces, with the original amounts and times of the alerted accounts, is not
shipped: a reader regenerates it from the original file.

The rest of the folder (this README and `map-alerts.ts`) follows the repository's licence. It is code and prose, not
data, and adds no restriction on the data above.

## An open point for a lawyer

Whether the derived alert file is "Enhanced Data" (the part of the data you publish that is made of your additions
or modifications, which stays share-alike) or "Results" (the outputs of computational use, on which the agreement
puts no obligation, provided they carry no more than a de minimis portion of the data) is a point for a lawyer. The
alerts file keeps account identifiers and dates of the original, selected and relabeled, which does not read as a
de minimis portion. We have not asked a lawyer, and we treat the alerts file as Enhanced Data: it ships under
CDLA-Sharing 1.0, with the agreement, the credit and the change notice above. We ship the sealed record and the report
under the same agreement as well, the safe reading for files that hold only counts and rates. This is a working
reading, not legal advice, and it is not a claim that the files could not be treated otherwise.

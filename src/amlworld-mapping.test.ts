/**
 * THE AMLWORLD MAPPING TURNS TRANSACTION LABELS INTO DISPOSITIONED ALERTS, AND SAYS WHAT IT DROPPED.
 *
 * IBM AMLworld labels transactions (`Is Laundering`), not alerts. examples/amlworld/map-alerts.ts
 * builds the two files `npm run measure:yours` reads, under rules this witness fixes:
 *
 *   - an alert is an account in US Dollars only (the tool's amounts have one currency, and no
 *     exchange rate is invented): any account that touches another currency, on either side of a
 *     row, is out;
 *   - an account in at least one laundering row is `suspicious`, and its window ends on the day
 *     of its EARLIEST laundering row (the file is not sorted by time);
 *   - a `benign` alert is an account in no laundering row, sampled among the accounts active on the
 *     SAME day as a suspicious one, so that a benign window is not shorter than a suspicious one
 *     (the window grows with its end day: the peak amount would otherwise tell the classes apart);
 *   - a suspicious account with too few benign matches that day is dropped, and counted;
 *   - the choice depends on the seed and on the accounts, never on the order of the rows;
 *   - the transactions file holds, per alerted account, the rows up to the end of its window day,
 *     `out` for the payer (Amount Paid) and `in` for the payee (Amount Received), one `out` row for
 *     a transfer to itself, the payment format folded onto the tool's five channels.
 *
 * The oracle is the generator below: it knows who it planted where, and the mapper never sees it.
 * The output is then read by the tool's own readers, because a mapping that the tool refuses is
 * worth nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cartographier, alertesEnCsv, transactionsEnCsv, type Resultat } from "../examples/amlworld/map-alerts.ts";
import { lireAlertes, lireTransactions, executer } from "./your-alerts.ts";
import { registre } from "./scenarios/index.ts";

const ENTETE = "Timestamp,From Bank,Account,To Bank,Account,Amount Received,Receiving Currency,Amount Paid,Payment Currency,Payment Format,Is Laundering";
const USD = "US Dollar";
const CANAUX: Record<string, string> = {
  "Cheque": "other", "Credit Card": "card", "ACH": "transfer", "Cash": "cash",
  "Reinvestment": "other", "Wire": "wire", "Bitcoin": "other",
};
const FORMATS = Object.keys(CANAUX);

/** An account as the file writes it: a bank and an account column. */
const compte = (nom: string) => ({ banque: "0" + (nom.charCodeAt(0) % 90 + 10), numero: "8000" + nom });
const cle = (nom: string) => `${compte(nom).banque}-${compte(nom).numero}`;

type Plan = { lignes: string[]; suspects: Map<string, number>; benins: string[]; exclus: string[]; premierJour: Map<string, number> };

/** The planted file. Days run 1 to 5 of September; `suspects` maps each laundering-involved
 *  account to the earliest day of its laundering rows, as planted. */
function plan(): Plan {
  const lignes: string[] = [];
  const premierJour = new Map<string, number>();
  const ts = (jour: number, h: number) => `2022/09/0${jour} ${String(h).padStart(2, "0")}:${String((h * 7) % 60).padStart(2, "0")}`;
  const ecrire = (jour: number, h: number, de: string, vers: string, recu: string, payeFmt: [string, string, string, string], label: 0 | 1) => {
    const [paye, devise, devise2, format] = payeFmt;
    const a = compte(de), b = compte(vers);
    lignes.push([ts(jour, h), a.banque, a.numero, b.banque, b.numero, recu, devise2, paye, devise, format, String(label)].join(","));
    if (label === 1) for (const x of [de, vers]) premierJour.set(x, Math.min(premierJour.get(x) ?? 99, jour));
  };
  const usd = (paye: string, format: string): [string, string, string, string] => [paye, USD, USD, format];

  /* Ten laundering pairs on days 1 to 3; S0 first writes its day 3 row, THEN a day 2 row to E0. */
  for (let i = 0; i < 10; i++) {
    const jour = (i % 3) + 1;
    ecrire(i === 0 ? 3 : jour, 9 + i, `S${i}`, `M${i}`, (5000.2 + i).toFixed(2), usd((5000.1 + i).toFixed(2), FORMATS[i % FORMATS.length]!), 1);
  }
  ecrire(2, 20, "S0", "E0", "812.50", usd("812.50", "Wire"), 1);

  /* Eighty benign accounts, each active on days 1 to 4, paying the next one. */
  for (let jour = 1; jour <= 4; jour++) {
    for (let i = 0; i < 80; i++) {
      ecrire(jour, 1 + (i % 22), `B${i}`, `B${(i + 1) % 80}`, (10 + i * 3.37 + jour).toFixed(2), usd((10 + i * 3.37 + jour).toFixed(2), FORMATS[(i + jour) % FORMATS.length]!), 0);
    }
  }
  /* A laundering account is also busy outside its laundering rows: it must never be sampled as benign. */
  for (let jour = 1; jour <= 4; jour++) {
    for (let i = 0; i < 10; i++) ecrire(jour, 3, `S${i}`, `B${i}`, "44.40", usd("44.40", "ACH"), 0);
  }
  /* Every benign account transfers to itself on day 1: one `out` row each, not two rows. */
  for (let i = 0; i < 80; i++) ecrire(1, 5, `B${i}`, `B${i}`, (1000 + i * 1.01).toFixed(2), usd((1000 + i * 1.01).toFixed(2), "Reinvestment"), 0);

  /* Outside the rules, each also busy in dollars every day so that only the currency rule keeps it
     out: a laundering pair in Euros, a benign pair in Euros, and a pair that is all dollars but for
     one row whose two currencies differ. */
  ecrire(2, 6, "N0", "N1", "900.00", ["900.00", "Euro", "Euro", "Wire"], 1);
  ecrire(1, 6, "Q0", "Q1", "30.00", ["30.00", "Euro", "Euro", "Cash"], 0);
  ecrire(2, 8, "X0", "Y0", "50.00", ["52.00", USD, "Euro", "Wire"], 0);
  for (let jour = 1; jour <= 4; jour++) {
    for (const [i, x] of ["N0", "N1", "Q0", "Q1", "X0", "Y0"].entries()) ecrire(jour, 7, x, `B${i + 10}`, "61.10", usd("61.10", "Cheque"), 0);
  }

  /* Day 5: a laundering pair, and only two benign accounts active that day: not enough matches. */
  ecrire(5, 10, "Z0", "Z1", "3100.00", usd("3100.00", "Wire"), 1);
  ecrire(5, 11, "P0", "P1", "20.00", usd("20.00", "Cash"), 0);
  ecrire(5, 12, "P1", "P0", "21.00", usd("21.00", "Cash"), 0);

  const suspects = new Map([...premierJour].filter(([x]) => !["N0", "N1", "Z0", "Z1"].includes(x)));
  const benins = [...Array(80).keys()].map((i) => `B${i}`);
  return { lignes: [ENTETE, ...lignes], suspects, benins, exclus: ["N0", "N1", "Q0", "Q1", "X0", "Y0"], premierJour };
}

const iso = (jour: number) => `2022-09-0${jour}`;

function lancer(p: Plan, options?: Parameters<typeof cartographier>[1]): Resultat {
  return cartographier(() => p.lignes, options);
}

test("a suspicious alert is a dollar-only account in a laundering row, dated on its earliest laundering row", () => {
  const p = plan();
  const r = lancer(p);
  const suspects = r.alertes.filter((a) => a.disposition === "suspicious");
  assert.deepEqual(suspects.map((a) => a.compte).sort(), [...p.suspects.keys()].map(cle).sort(),
    "the suspicious accounts are not exactly the dollar-only accounts of the laundering rows");
  for (const a of suspects) {
    const nom = [...p.suspects.keys()].find((x) => cle(x) === a.compte)!;
    assert.equal(a.finFenetre, iso(p.suspects.get(nom)!), `${nom}: the window must end on its earliest laundering day`);
  }
  assert.equal(r.alertes.find((a) => a.compte === cle("S0"))!.finFenetre, iso(2),
    "S0 writes its day 3 row first and its day 2 row later: the earliest by time wins, not the first in the file");
});

test("a benign alert is in no laundering row and is matched by day, three to one", () => {
  const p = plan();
  const r = lancer(p);
  const benins = r.alertes.filter((a) => a.disposition === "benign");
  const suspects = r.alertes.filter((a) => a.disposition === "suspicious");
  const laundering = new Set([...p.premierJour.keys()].map(cle));
  assert.deepEqual(benins.filter((a) => laundering.has(a.compte)), [], "a laundering-involved account was sampled as benign");
  assert.deepEqual(benins.filter((a) => !p.benins.map(cle).includes(a.compte)), [], "an account outside the planted benign set was sampled");
  assert.equal(new Set(r.alertes.map((a) => a.compte)).size, r.alertes.length, "an account is alerted at most once");
  for (const jour of [1, 2, 3]) {
    const s = suspects.filter((a) => a.finFenetre === iso(jour)).length;
    const b = benins.filter((a) => a.finFenetre === iso(jour)).length;
    assert.ok(s > 0, `day ${jour}: no suspicious alert, the check would test nothing`);
    assert.equal(b, 3 * s, `day ${jour}: ${s} suspicious alerts need ${3 * s} benign ones that day, got ${b}`);
  }
});

test("accounts outside the rules are never alerted, and the dropped ones are counted by cause", () => {
  const p = plan();
  const r = lancer(p);
  const alertes = new Set(r.alertes.map((a) => a.compte));
  for (const x of [...p.exclus, "Z0", "Z1"]) assert.ok(!alertes.has(cle(x)), `${x} must not be alerted`);
  assert.ok(!alertes.has(cle("P0")) && !alertes.has(cle("P1")), "P0 and P1 are benign candidates of day 5 only: no suspicious alert is dated then");
  assert.equal(r.resume.ecartesFauteDeBenins, 2, "Z0 and Z1 are suspicious on a day with two benign candidates: both are dropped and counted");
  assert.equal(r.resume.suspectsEligibles, p.suspects.size + 2, "eligible suspects: the dollar-only laundering accounts, Z0 and Z1 included");
  assert.equal(r.resume.suspectsRetenus, p.suspects.size);
});

test("the transactions are the alerted accounts' rows up to the end of their window day, in the account's own direction", () => {
  const p = plan();
  const r = lancer(p);
  const parCompte = new Map(r.alertes.map((a) => [a.compte, a]));
  assert.ok(r.transactions.length > 0);
  for (const t of r.transactions) {
    const a = parCompte.get(t.compte);
    assert.ok(a, `a transaction row for the account ${t.compte}, which is not alerted`);
    assert.ok(t.ts.slice(0, 10) <= a.finFenetre, `${t.compte}: a row at ${t.ts} lies after its window day ${a.finFenetre}`);
    assert.match(t.ts, /^2022-09-0\dT\d\d:\d\d:00Z$/, "a timestamp must be read as UTC ISO, which the tool parses");
    assert.match(t.amount, /^\d+(\.\d+)?$/);
  }
  /* The laundering row S3 -> M3 (day 1): Amount Paid for the payer, Amount Received for the payee. */
  const sortie = r.transactions.find((t) => t.compte === cle("S3") && t.amount === "5003.10");
  const entree = r.transactions.find((t) => t.compte === cle("M3") && t.amount === "5003.20");
  assert.equal(sortie?.direction, "out", "the payer's row is `out`, at Amount Paid");
  assert.equal(entree?.direction, "in", "the payee's row is `in`, at Amount Received");
  assert.equal(sortie?.channel, CANAUX[FORMATS[3 % FORMATS.length]!]);
  /* Every format lands on the channel written above (S0 is checked apart: its day 3 row is after its window). */
  for (let i = 1; i < 10; i++) {
    const t = r.transactions.find((x) => x.compte === cle(`S${i}`) && x.amount === (5000.1 + i).toFixed(2));
    assert.equal(t?.channel, CANAUX[FORMATS[i % FORMATS.length]!], `S${i}: format ${FORMATS[i % FORMATS.length]} folded onto the wrong channel`);
  }
  assert.equal(r.transactions.find((x) => x.compte === cle("S0") && x.amount === "5000.10"), undefined,
    "S0's day 3 laundering row lies after its window day (2) and must not be in the file");
  /* A transfer to itself is a single `out` row. */
  const benins = r.alertes.filter((a) => a.disposition === "benign");
  assert.ok(benins.length > 0);
  for (const a of benins) {
    const i = Number(/8000B(\d+)$/.exec(a.compte)![1]);
    const soi = r.transactions.filter((t) => t.compte === a.compte && t.amount === (1000 + i * 1.01).toFixed(2));
    assert.deepEqual(soi.map((t) => `${t.direction}/${t.channel}`), ["out/other"], `B${i}: a transfer to oneself must be one \`out\` row`);
  }
});

test("the choice does not depend on the order of the rows, and the seed and the cap do change it", () => {
  const p = plan();
  const a = lancer(p);
  const [entete, ...corps] = p.lignes;
  const melange = { ...p, lignes: [entete!, ...corps.slice().reverse()] };
  const b = lancer(melange);
  assert.deepEqual(b.alertes, a.alertes, "reversing the rows changed the alerts");
  assert.deepEqual(b.transactions, a.transactions, "reversing the rows changed the transactions");
  assert.equal(alertesEnCsv(b.alertes), alertesEnCsv(a.alertes));
  assert.equal(transactionsEnCsv(b.transactions), transactionsEnCsv(a.transactions));

  const petit = lancer(p, { suspectsMax: 5 });
  assert.equal(petit.alertes.filter((x) => x.disposition === "suspicious").length, 5, "the cap holds");
  assert.equal(petit.alertes.filter((x) => x.disposition === "benign").length, 15, "three benign for each retained suspicious alert");
  const autre = lancer(p, { suspectsMax: 5, seed: "another seed" });
  assert.notDeepEqual(autre.alertes.map((x) => x.compte), petit.alertes.map((x) => x.compte), "the seed must matter");
});

test("the output is read by the tool itself, and measured", () => {
  const p = plan();
  const r = lancer(p);
  const csvA = alertesEnCsv(r.alertes);
  const csvT = transactionsEnCsv(r.transactions);
  assert.equal(csvA.split("\n")[0], "alert_id,account_id,window_end,disposition");
  assert.equal(csvT.split("\n")[0], "account_id,ts,amount,direction,channel");
  assert.ok(!/(suspicious|benign)/.test(r.alertes.map((a) => a.id).join(" ")), "an alert id must not carry its disposition");
  const lues = lireAlertes(csvA);
  assert.equal(lues.alertes.length, r.alertes.length);
  assert.equal(lireTransactions(csvT).lignes, r.transactions.length);
  const d = mkdtempSync(join(tmpdir(), "amlworld-"));
  try {
    writeFileSync(join(d, "a.csv"), csvA);
    writeFileSync(join(d, "t.csv"), csvT);
    const { mesure } = executer(join(d, "a.csv"), join(d, "t.csv"), registre(), null);
    assert.equal(mesure.source.alerts, r.alertes.length);
    assert.equal(mesure.source.suspicious, r.alertes.filter((x) => x.disposition === "suspicious").length);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("a file that is not the AMLworld shape is refused in words, never read on", () => {
  const p = plan();
  assert.throws(() => cartographier(() => ["Timestamp,From Bank,Account", "x"]), /header/i, "a wrong header must be refused");
  assert.throws(() => cartographier(() => [...p.lignes, "2022/09/01 00:00,010,A,010,B,1.00"]), /line \d+.*11/i,
    "a row of the wrong width must be refused with its line number");
  assert.throws(() => cartographier(() => [...p.lignes, "2022/09/01 00:00,010,A,010,B,1e-5,US Dollar,1e-5,US Dollar,Wire,0"]), /amount/i,
    "an amount the tool cannot read must be refused, not skipped");
  assert.throws(() => cartographier(() => [...p.lignes, "2022-09-01 00:00,010,A,010,B,1.00,US Dollar,1.00,US Dollar,Wire,0"]), /timestamp/i,
    "a timestamp of another shape must be refused");
  assert.throws(() => cartographier(() => [...p.lignes, "2022/09/01 00:00,010,A,010,B,1.00,US Dollar,1.00,US Dollar,Wire,2"]), /label/i,
    "a label that is neither 0 nor 1 must be refused");
  assert.throws(() => cartographier(() => [...p.lignes, "2022/09/01 00:00,010,A,010,B,1.00,US Dollar,1.00,US Dollar,Barter,0"]), /format/i,
    "a payment format the channel table does not know must be refused, not folded onto `other` in silence");
});

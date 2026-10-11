/**
 * THE SEALED RECORD LEAKS NO AMOUNT OF THE CLIENT, NOR ANY NUMBER THAT READS BACK TO ONE.
 *
 * The `amount` scenario scores an alert as 1 - exp(-peak / scale), with the peak being the
 * largest amount of its window and the scale printed in the record's own `echelles`. A raw
 * score per alert is therefore the peak amount in disguise: -scale * ln(1 - score) gives it
 * back to the cent. The same holds for `structuring` (the sum of the deposits just under the
 * declaration threshold, scale `seuilDeclaration`) and for `zscore` (a z-score against a
 * history that the client's own transactions fix).
 *
 * This witness plants amounts no other test uses, runs the REAL scenario registry through
 * `executer`, reads back the sealed JSON that would leave the client's machine, and walks
 * every number in it. For each number it also tries every inversion the scenarios allow. No
 * planted amount, no sum of planted deposits and no planted window total may come out.
 * The detector is proven on a fabricated leak first, so a green here means "looked, found
 * nothing" and not "could not look".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executer } from "./your-alerts.ts";
import { registre } from "./scenarios/index.ts";
import { Z_BARRE } from "./scenarios/zscore.ts";

const ALERTES = 40;
const SUSPECTS = 10;
const TOLERANCE = 1e-6;       /* an inversion is exact to about 1e-8; two planted cents apart are 1e-2 apart */

const arrondi = (x: number) => Math.round(x * 100) / 100;

type Compte = { historique: number[] };

/** Forty accounts whose amounts are all planted: a peak, a small card payment, and for the
 *  suspicious ones two cash deposits just under the declaration threshold. Three history
 *  transactions each, so that `zscore` scores and `sansHistorique` is false. */
function jeuPlante(): { alertes: string; tx: string; plantes: number[]; comptes: Compte[] } {
  const a = ["alert_id,account_id,window_end,disposition"];
  const t = ["account_id,ts,amount,direction,channel"];
  const plantes: number[] = [];
  const comptes: Compte[] = [];
  for (let i = 0; i < ALERTES; i++) {
    const compte = `acc-plante-${i}`;
    a.push(`al-${i},${compte},2026-08-30,${i < SUSPECTS ? "suspicious" : "benign"}`);
    const fenetre = [arrondi(4321.57 + i * 7.77), arrondi(150.25 + i * 1.13)];
    t.push(`${compte},2026-08-20T10:00:00Z,${fenetre[0]},out,wire`);
    t.push(`${compte},2026-08-21T10:00:00Z,${fenetre[1]},out,card`);
    let somme = fenetre[0]! + fenetre[1]!;
    if (i < SUSPECTS) {
      const depots = [arrondi(8101.11 + i * 3.01), arrondi(8203.33 + i * 2.07)];
      t.push(`${compte},2026-08-10T10:00:00Z,${depots[0]},in,cash`);
      t.push(`${compte},2026-08-11T10:00:00Z,${depots[1]},in,cash`);
      fenetre.push(...depots);
      plantes.push(arrondi(depots[0]! + depots[1]!));          /* what `structuring` sums */
      somme += depots[0]! + depots[1]!;
    }
    plantes.push(...fenetre, arrondi(somme));
    const historique = [120.10, arrondi(250.20 + i), 90.05];
    historique.forEach((h, k) => t.push(`${compte},2026-0${k + 3}-15T09:00:00Z,${h},in,transfer`));
    comptes.push({ historique });
  }
  return { alertes: a.join("\n") + "\n", tx: t.join("\n") + "\n", plantes, comptes };
}

/** Every number of a parsed record, at any depth. */
function nombres(x: unknown, sortie: number[] = []): number[] {
  if (typeof x === "number") sortie.push(x);
  else if (Array.isArray(x)) for (const v of x) nombres(v, sortie);
  else if (x && typeof x === "object") for (const v of Object.values(x)) nombres(v, sortie);
  return sortie;
}

/** What a number in (0, 1) could be a squashed amount of: -scale * ln(1 - v) for every scale the record
 *  prints, and the zscore inversion against each account's own history. */
function lectures(v: number, echelles: number[], comptes: Compte[]): number[] {
  if (!(v > 0 && v < 1)) return [];
  const x = -Math.log(1 - v);
  const zscores = comptes.map(({ historique }) => {
    const moyenne = historique.reduce((s, h) => s + h, 0) / historique.length;
    const ecartType = Math.max(Math.sqrt(historique.reduce((s, h) => s + (h - moyenne) ** 2, 0) / historique.length), 1);
    return x * Z_BARRE * ecartType + moyenne;
  });
  return [...echelles.map((s) => x * s), ...zscores];
}

/** The leaks found: each number that is, or reads back as, a planted value. */
function fuites(record: unknown, plantes: number[], echelles: number[], comptes: Compte[]): string[] {
  const trouvees: string[] = [];
  for (const v of nombres(record)) {
    for (const lu of [v, ...lectures(v, echelles, comptes)]) {
      const p = plantes.find((q) => Math.abs(q - lu) < TOLERANCE);
      if (p !== undefined) trouvees.push(`${v} reads back as the planted amount ${p}`);
    }
  }
  return trouvees;
}

const echellesDe = (record: { echelles: Record<string, unknown> }): number[] =>
  nombres(record.echelles).filter((s) => s > 0);

test("the sealed record holds no amount of the client and no number that reads back to one", () => {
  const { alertes, tx, plantes, comptes } = jeuPlante();
  const d = mkdtempSync(join(tmpdir(), "sans-score-"));
  const cheminA = join(d, "alertes.csv");
  const cheminT = join(d, "tx.csv");
  writeFileSync(cheminA, alertes);
  writeFileSync(cheminT, tx);
  const { cheminJson } = executer(cheminA, cheminT, registre(), null);
  const emis = JSON.parse(readFileSync(cheminJson, "utf8")) as { echelles: Record<string, unknown> };
  const echelles = echellesDe(emis);

  /* THE DETECTOR FIRST: the amount scenario's own formula, applied to a planted peak, is seen. */
  const fabrique = { verdicts: { "al-0": { scores: { amount: 1 - Math.exp(-plantes[0]! / 20000) } } } };
  assert.ok(fuites(fabrique, plantes, [20000], comptes).length > 0,
    "the detector must see a score that inverts to a planted amount");
  assert.ok(nombres(emis).length > 1000, "the walk covers the whole grid, not a stub");
  assert.ok(echelles.includes(20000), "the record prints the amount scale an inversion would use");

  const trouvees = fuites(emis, plantes, echelles, comptes);
  assert.deepEqual(trouvees.slice(0, 5), [],
    `${trouvees.length} number(s) of the sealed record read back as an amount of the client: "never a value" just became false`);
});

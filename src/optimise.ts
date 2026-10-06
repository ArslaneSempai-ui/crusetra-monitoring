/**
 * LA FRONTIÈRE — deux questions symétriques sur le même relevé scellé :
 *
 *     npm run optimise -- --from=<measured.json> --recall=0.90
 *       → parmi les cellules dont la BORNE BASSE de Wilson tient l'exigence, celle qui
 *         lève le MOINS DE FAUSSES ALERTES (la règle de l'outil, contrat §6) — un point
 *         au-dessus du seuil avec un intervalle qui plonge dessous est exactement la
 *         promesse qu'un comité ne doit pas recevoir ;
 *
 *     npm run optimise -- --from=<measured.json> --alert-budget=800
 *       → le rappel maximal (à la borne basse) sous un budget d'alertes PAR MOIS — la
 *         conversion au mois vient des dates `decided_at` du fichier mesuré, jamais
 *         d'une hypothèse muette.
 *
 * Chaque dollar et chaque heure affichés portent leur hypothèse à côté, avec unité et
 * provenance : un chiffre dérivé d'une hypothèse invisible se lit comme une mesure.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { isMain, refuserDrapeauxInconnus } from "./cli.ts";
import { scelleIntact, empreinteDuReleve } from "./empreinte.ts";
import { lignesEvaluationDe } from "./evaluation.ts";
import { ASSUMPTIONS, UNITS, symboleDe, analystHourlyCost, ligneDHypothese } from "./assumptions.ts";
import type { MesureAlertes, Cellule } from "./your-alerts.ts";
import type { PalierId } from "./scenario.ts";

export type CellulePlacee = Cellule & { palier: PalierId; rang: number };

/**
 * Le plancher CONTRACTUEL du rappel : il se cite et s'optimise dès CINQ cas confirmés
 * suspects, à la borne basse de Wilson — l'intervalle large est précisément ce que le
 * lecteur doit voir, et le seuil général ENOUGH (20) priverait de rappel la plupart des
 * historiques réels. Sous cinq, rien ne se cite ni ne s'optimise.
 *
 * ET UN SEUL SENS PAR DRAPEAU (le « -Infinity % » du rouge, payé le 5/09) : le
 * `reportable` posé par rate() garde son sens général (il pilote le format commun et la
 * note « read the interval ») ; partout où la CITATION ou la SÉLECTION du rappel se
 * joue, c'est `rappel.n >= MINIMUM_SUSPECTS` qui décide, explicitement.
 */
export const MINIMUM_SUSPECTS = 5;

export function cellulesDe(m: MesureAlertes): CellulePlacee[] {
  return Object.entries(m.paliers).flatMap(([palier, p]) =>
    p!.cellules.map((c) => ({ ...c, palier: palier as PalierId, rang: p!.rang })));
}

/**
 * LA RÈGLE DE L'OUTIL (contrat §6) : parmi les cellules dont la borne basse tient
 * l'exigence, le MOINS de fausses alertes d'abord — c'est le coût d'analyste que le
 * client paie chaque jour — puis le moins d'alertes levées, puis le palier le moins
 * cher, puis le seuil le plus strict. `null` quand rien ne tient : une absence nommée.
 */
export function meilleureSousRappel(cellules: readonly CellulePlacee[], rappelMin: number): CellulePlacee | null {
  const tenables = cellules.filter((c) => c.rappel.n >= MINIMUM_SUSPECTS && c.rappel.low >= rappelMin);
  if (tenables.length === 0) return null;
  return [...tenables].sort((a, b) =>
    a.faussesAlertes.successes - b.faussesAlertes.successes
    || a.tirees - b.tirees || a.rang - b.rang || b.seuil - a.seuil)[0]!;
}

/** Le rappel maximal (borne basse) sous un budget d'alertes par mois. */
export function meilleureSousBudget(
  cellules: readonly CellulePlacee[], budgetParMois: number, joursDePeriode: number,
): CellulePlacee | null {
  const parMois = (c: CellulePlacee) => c.tirees * (30 / joursDePeriode);
  const tenables = cellules.filter((c) => c.rappel.n >= MINIMUM_SUSPECTS && parMois(c) <= budgetParMois);
  if (tenables.length === 0) return null;
  return [...tenables].sort((a, b) =>
    b.rappel.low - a.rappel.low
    || a.faussesAlertes.successes - b.faussesAlertes.successes || a.rang - b.rang)[0]!;
}

/** La plus forte borne basse ATTEIGNABLE, ou null : Math.max() sur un ensemble vide rend
 *  -Infinity, et « -Infinity % » est ce qu'un message d'échec a déjà imprimé une fois. */
export function plusForteBorne(cellules: readonly CellulePlacee[]): number | null {
  const bornees = cellules.filter((c) => c.rappel.n >= MINIMUM_SUSPECTS);
  if (bornees.length === 0) return null;
  return Math.max(...bornees.map((c) => c.rappel.low));
}

/** Les heures d'analyste que `n` alertes coûtent, dérivées des hypothèses déclarées. */
export function heuresDAnalyste(nAlertes: number): { heures: number; usd: number } {
  const heures = (nAlertes * ASSUMPTIONS.minutesPerAlert) / 60;
  return { heures, usd: heures * analystHourlyCost() };
}

export function lireReleve(chemin: string): MesureAlertes {
  const brut = JSON.parse(readFileSync(chemin, "utf8")) as MesureAlertes;
  if (brut?.kind !== "monitoring-client-record") {
    throw new Error(`${basename(chemin)} is not a monitoring record: its kind is `
      + `${JSON.stringify((brut as { kind?: unknown })?.kind ?? null)}.\n`
      + `  Point --from at the <file>-measured.json that measure:yours wrote.`);
  }
  if (typeof brut.empreinte !== "string" || !brut.empreinte) {
    throw new Error(`${basename(chemin)} carries no seal; a hand-made record would enter\n`
      + `  the frontier with the authority of a measurement. Re-run measure:yours.`);
  }
  if (!scelleIntact(brut as unknown as Record<string, unknown>)) {
    throw new Error(`${basename(chemin)} does not match its own content hash: it carries `
      + `${brut.empreinte}, its content computes to ${empreinteDuReleve(brut)}.\n`
      + `  The file changed after it was sealed. Nothing was optimised.`);
  }
  return brut;
}

/** `--recall=0.9` — strict : le motif décide, la conversion ne voit que ce qu'il accepte. */
export function lireRappelMin(brut: string): number {
  if (!/^(0(\.\d+)?|1(\.0+)?)$/.test(brut)) {
    throw new Error(`--recall=${brut} is not a recall this tool reads. It wants a number\n`
      + `  between 0 and 1, like --recall=0.90: the floor your compliance committee owns.`);
  }
  return Number(brut);
}

export function lireBudget(brut: string): number {
  if (!/^\d{1,9}$/.test(brut) || Number(brut) < 1) {
    throw new Error(`--alert-budget=${brut} is not a budget this tool reads. It wants a whole\n`
      + `  number of alerts per month your analysts can clear, like --alert-budget=800.`);
  }
  return Number(brut);
}

function decrire(c: CellulePlacee, m: MesureAlertes): string[] {
  const l: string[] = [];
  l.push(`  scenario ${c.palier} at threshold ${c.seuil.toFixed(2)}`);
  l.push(`  recall on confirmed suspicious  ${(c.rappel.rate * 100).toFixed(1)} % `
    + `[${(c.rappel.low * 100).toFixed(0)}–${(c.rappel.high * 100).toFixed(0)}], n=${c.rappel.n}`);
  l.push(`  false-alert rate on benign      ${(c.faussesAlertes.rate * 100).toFixed(1)} % `
    + `[${(c.faussesAlertes.low * 100).toFixed(0)}–${(c.faussesAlertes.high * 100).toFixed(0)}], n=${c.faussesAlertes.n}`);
  l.push(`  alerts raised on this history   ${c.tirees} of ${m.source.alerts}`);
  if (c.pourMille !== undefined) l.push(`  alerts per thousand accounts    ${c.pourMille}`);
  return l;
}

async function principal(): Promise<void> {
  for (const l of lignesEvaluationDe("monitoring")) console.log(l);
  refuserDrapeauxInconnus(["--from", "--recall", "--alert-budget"]);
  const arg = (nom: string) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.split("=").slice(1).join("=");

  const chemin = arg("from");
  const brutRappel = arg("recall");
  const brutBudget = arg("alert-budget");
  if (!chemin || (brutRappel === undefined && brutBudget === undefined)) {
    console.log(`
The frontier, from a sealed measurement:

  npm run optimise -- --from=<file>-measured.json --recall=<min>
      among cells whose recall LOWER BOUND holds <min>: the fewest false alerts

  npm run optimise -- --from=<file>-measured.json --alert-budget=<N>
      the highest bounded recall under N alerts per month (needs decided_at dates)

The record comes from: npm run measure:yours -- --alerts=<csv> --transactions=<csv>
`);
    process.exit(2);
  }
  if (brutRappel !== undefined && brutBudget !== undefined) {
    console.error(`\nGive --recall OR --alert-budget, not both: they are the two directions of the\n`
      + `  same frontier, and answering both at once would answer neither.\n`);
    process.exit(2);
  }

  const m = lireReleve(chemin);
  const cellules = cellulesDe(m);
  console.log(`\n${m.source.alerts} alert(s) measured on ${m.measuredAt.slice(0, 10)}, seal ${m.empreinte}: `
    + `${Object.keys(m.paliers).length} scenario(s) × ${new Set(cellules.map((c) => c.seuil)).size} thresholds.`);
  if (m.absents.length) console.log(`contract scenario(s) absent from that record: ${m.absents.join(", ")}`);

  if (m.source.suspicious < MINIMUM_SUSPECTS) {
    console.error(`\n${m.source.suspicious} confirmed suspicious case(s) in the record: too few confirmed\n`
      + `  cases to bound recall (the contract cites and optimises recall from ${MINIMUM_SUSPECTS}). Export a\n`
      + `  longer window of history and re-measure.\n`);
    process.exit(2);
  }

  if (brutRappel !== undefined) {
    const min = lireRappelMin(brutRappel);
    const c = meilleureSousRappel(cellules, min);
    if (!c) {
      const borne = plusForteBorne(cellules);
      console.error(`\nNo cell holds a recall lower bound of ${min} on this sample `
        + `(${m.source.suspicious} confirmed suspicious).`);
      console.error(borne === null
        ? `  No cell has enough confirmed cases to bound recall at all.`
        : `  The strongest bound available is ${(borne * 100).toFixed(0)} %: lower the floor,`
          + ` or measure a wider window.`);
      console.error("");
      process.exit(1);
    }
    console.log(`\nFewest false alerts with the recall lower bound at or above ${min}:\n`);
    for (const l of decrire(c, m)) console.log(l);
    const economisees = m.source.alerts - c.tirees;
    const h = heuresDAnalyste(economisees);
    console.log(`\nAgainst your current programme's history: ${economisees} alert(s) fewer over the`);
    console.log(`file's period, ${h.heures.toFixed(1)} analyst hour(s), ${symboleDe(UNITS.analystAnnualCost)}${h.usd.toFixed(0)}, computed from:`);
    console.log(`  ${ligneDHypothese("minutesPerAlert")}`);
    console.log(`  ${ligneDHypothese("analystAnnualCost")} over ${ASSUMPTIONS.workingDaysPerYear} days × ${ASSUMPTIONS.productiveHoursPerDay} h`);
    console.log(`Change the assumptions and the dollars move; the recall bound does not.\n`);
    return;
  }

  const budget = lireBudget(brutBudget!);
  if (!m.source.periode || m.source.periode.jours <= 0) {
    console.error(`\n--alert-budget is a MONTHLY figure, and your file carries no readable\n`
      + `  decided_at dates: alerts per month cannot be derived from it without inventing a\n`
      + `  period. Add decided_at to the export and re-measure, or use --recall instead.\n`);
    process.exit(2);
  }
  const c = meilleureSousBudget(cellules, budget, m.source.periode.jours);
  if (!c) {
    console.error(`\nNo cell fits ${budget} alert(s) per month on this history\n`
      + `  (period measured: ${m.source.periode.jours} day(s)). Raise the budget, or accept an\n`
      + `  unbounded recall.\n`);
    process.exit(1);
  }
  console.log(`\nHighest bounded recall under ${budget} alert(s) per month `
    + `(period: ${m.source.periode.from} to ${m.source.periode.to}, ${m.source.periode.jours} day(s)):\n`);
  for (const l of decrire(c, m)) console.log(l);
  if (c.rappel.low === 0) {
    console.log(`\n  ⚠ the best recall this budget buys is bounded at ZERO: under ${budget} alert(s)`);
    console.log(`    per month, no cell retains any guaranteed recall. Raise the budget before`);
    console.log(`    reading anything else here.`);
  }
  console.log(`  alerts per month at this cell   ${(c.tirees * (30 / m.source.periode.jours)).toFixed(0)}`);
  const h = heuresDAnalyste(c.tirees * (30 / m.source.periode.jours));
  console.log(`\nClearing them costs ${h.heures.toFixed(1)} analyst hour(s) per month, ${symboleDe(UNITS.analystAnnualCost)}${h.usd.toFixed(0)}, computed from:`);
  console.log(`  ${ligneDHypothese("minutesPerAlert")}`);
  console.log(`  ${ligneDHypothese("analystAnnualCost")} over ${ASSUMPTIONS.workingDaysPerYear} days × ${ASSUMPTIONS.productiveHoursPerDay} h\n`);
}

if (isMain(import.meta)) {
  try {
    await principal();
  } catch (e) {
    console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
  }
}

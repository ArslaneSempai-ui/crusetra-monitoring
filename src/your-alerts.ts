/**
 * LA MESURE SUR LES ALERTES DISPOSITIONNÉES DU CLIENT — la question du contrat :
 *
 *     npm run measure:yours -- --alerts=your-alerts.csv --transactions=your-transactions.csv
 *     → which scenario suffices, at which threshold, on your own dispositioned alerts
 *
 * DEUX fichiers entrent : les alertes que les analystes ont déjà tranchées (`suspicious`
 * ou `benign`) et les transactions des comptes alertés. L'outil REJOINT les deux par
 * `account_id`, reconstruit pour chaque alerte le CAS du contrat — la fenêtre de trente
 * jours qui finit à `window_end`, l'historique jusqu'à cent quatre-vingts jours avant —
 * puis rejoue chaque scénario du registre à chaque seuil : rappel sur les cas confirmés
 * suspects, taux de fausses alertes sur les cas classés sans suite, n et Wilson partout.
 *
 * ─── CE QUE CETTE MESURE NE VOIT PAS, dit d'emblée ───
 *
 * L'historique ne contient que les alertes que le SYSTÈME ACTUEL a levées : un compte que
 * personne n'a jamais alerté n'y figure pas, et le rappel mesuré ici est « parmi les cas
 * suspects que vos analystes ont confirmés ». La robustesse sur des cas fabriqués est
 * mesurée À PART (la mesure publique, entièrement synthétique et déclarée telle).
 *
 * ─── JAMAIS UNE VALEUR ───
 *
 * Les sorties (`<alerts>-measured.md`, `<alerts>-measured.json` scellé) portent des
 * comptes, des taux, des intervalles et un verdict par `alert_id` : JAMAIS un
 * `account_id`, un montant, une date de transaction ou un pays. Un test plante des
 * sentinelles dans chaque colonne et prouve d'abord que son détecteur sait les voir.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isMain, refuserDrapeauxInconnus } from "./cli.ts";
import { lireTable, apercu, MONTRES } from "./csv.ts";
import { rate, type Rate } from "./interval.ts";
import { SEUILS, PALIERS, type PalierId, type Registre, type Echelles } from "./scenario.ts";
import { JOURS_FENETRE, JOURS_HISTORIQUE, DIRECTIONS, CHANNELS, exigerCas,
         type Cas, type Transaction, type Direction, type Channel } from "./cas.ts";
import { ECHELLES } from "./assumptions.ts";
import { empreinteDuReleve } from "./empreinte.ts";
import { lignesEvaluationDe } from "./evaluation.ts";
import { rendreRapport } from "./rapport.ts";

export const COLONNES_ALERTES = ["alert_id", "account_id", "window_end", "disposition"] as const;
export const COLONNES_ALERTES_OPT = ["scenario_fired", "decided_at"] as const;
export const COLONNES_TX = ["account_id", "ts", "amount", "direction", "channel"] as const;
export const COLONNES_TX_OPT = ["counterparty_country"] as const;

/** Sous ce nombre d'alertes, aucune cellule de la frontière ne peut être bornée : refus. */
export const MINIMUM_ALERTES = 30;

export type Disposition = "suspicious" | "benign";

export type Alerte = {
  id: string;
  compte: string;              /* account_id : la clé de jointure, NE SORT JAMAIS */
  finFenetre: string;          /* ISO jour */
  disposition: Disposition;
  scenarioEditeur?: string;
  decideeLe?: string;
};

function colonnes(noms: readonly string[], requises: readonly string[], optionnelles: readonly string[],
  quoi: string, aide: string): void {
  const connues = new Set<string>([...requises, ...optionnelles]);
  const inconnues = noms.filter((n) => !connues.has(n));
  if (inconnues.length > 0) {
    throw new Error(
      `Your ${quoi} header carries ${inconnues.length} column(s) this command does not know: `
      + `${apercu(inconnues.map((n) => `"${n}"`), MONTRES)}.\n`
      + `  Accepted: ${requises.join(", ")}`
      + (optionnelles.length ? `; then, optionally: ${optionnelles.join(", ")}.` : ".")
      + `\n  Left as they were, unknown columns would be read as something else or dropped in\n`
      + `  silence, and the rates would answer a different question than the one you asked.`);
  }
  const manquantes = requises.filter((n) => !noms.includes(n));
  if (manquantes.length > 0) {
    throw new Error(
      `Your ${quoi} header is missing ${manquantes.map((n) => `"${n}"`).join(", ")}.\n${aide}`);
  }
}

/* ─────────────────────────── les alertes du client ─────────────────────────── */

export function lireAlertes(texte: string): { alertes: Alerte[]; avertissements: string[] } {
  const t = lireTable(texte);
  colonnes(t.noms, COLONNES_ALERTES, COLONNES_ALERTES_OPT, "alerts",
    `  alert_id names the alert, account_id joins it to your transactions file,\n`
    + `  window_end is the ISO day the alerted thirty-day window ends on, disposition is\n`
    + `  the analyst's decision: suspicious (confirmed, escalated or filed) or benign\n`
    + `  (closed without action). Optional: scenario_fired, decided_at.`);

  const avertissements: string[] = [];
  if (t.ecartees.length) avertissements.push(
    `${t.ecartees.length} alert row(s) carried more cells than the header and were discarded: `
    + `line(s) ${t.ecartees.slice(0, 8).map((e) => e.ligne).join(", ")}.`);
  if (t.courtes.length) avertissements.push(
    `${t.courtes.length} alert row(s) were shorter than the header; missing cells read as empty: `
    + `line(s) ${t.courtes.slice(0, 8).map((e) => e.ligne).join(", ")}.`);

  const col = Object.fromEntries(t.noms.map((n, i) => [n, i])) as Record<string, number>;
  const lire = (l: string[], nom: string): string => (l[col[nom]!] ?? "").trim();

  /* La disposition se lit après trim + minuscules (le fichier NORMAL d'un export écrit
     « Suspicious » ou « BENIGN ») ; tout autre MOT se refuse en nommant ligne et valeur —
     sur la console locale seulement, jamais dans une sortie émise. */
  const horsVocabulaire = t.lignes
    .map((l, i) => ({ ligne: t.numeros[i]!, valeur: lire(l, "disposition") }))
    .filter((x) => !["suspicious", "benign"].includes(x.valeur.toLowerCase()));
  if (horsVocabulaire.length > 0) {
    const montre = horsVocabulaire.slice(0, 8).map((x) => `line ${x.ligne}: "${x.valeur}"`).join("; ");
    throw new Error(
      `${horsVocabulaire.length} alert row(s) carry a disposition outside the vocabulary: ${montre}.\n`
      + `  This tool reads exactly two: "suspicious" (confirmed, escalated or filed) and\n`
      + `  "benign" (closed without action). Anything else (pending, a typo) has no place\n`
      + `  in either rate, and guessing a side would move the figure you publish.\n`
      + `  Map your dispositions to these two, or drop the undecided rows.`);
  }

  const datesIllisibles = t.lignes
    .map((l, i) => ({ ligne: t.numeros[i]!, valeur: lire(l, "window_end") }))
    .filter((x) => !/^\d{4}-\d{2}-\d{2}$/.test(x.valeur) || Number.isNaN(Date.parse(x.valeur)));
  if (datesIllisibles.length > 0) {
    throw new Error(
      `${datesIllisibles.length} alert row(s) carry an unreadable window_end: `
      + `line(s) ${datesIllisibles.slice(0, 8).map((x) => x.ligne).join(", ")}.\n`
      + `  window_end is the ISO day (YYYY-MM-DD) the alerted window ends on; the window is\n`
      + `  the ${JOURS_FENETRE} days up to and including it. A window that cannot be placed in\n`
      + `  time cannot be rebuilt, and guessing one would score the wrong transactions.`);
  }

  const vides = t.lignes.map((l, i) => ({ ligne: t.numeros[i]!, id: lire(l, "alert_id"), compte: lire(l, "account_id") }))
    .filter((x) => x.id === "" || x.compte === "");
  if (vides.length > 0) {
    throw new Error(
      `${vides.length} alert row(s) have an empty alert_id or account_id: line(s) `
      + `${vides.slice(0, 8).map((x) => x.ligne).join(", ")}.\n`
      + `  The verdicts are keyed by alert_id and the join runs on account_id: an empty one\n`
      + `  cannot be told apart from another empty one.`);
  }

  const parId = new Map<string, number[]>();
  t.lignes.forEach((l, i) => {
    const id = lire(l, "alert_id");
    parId.set(id, [...(parId.get(id) ?? []), t.numeros[i]!]);
  });
  const doublons = [...parId.entries()].filter(([, lignes]) => lignes.length > 1);
  if (doublons.length > 0) {
    const lignesDe = (lignes: number[]) => lignes.length <= 8
      ? lignes.join(", ") : `${lignes.slice(0, 8).join(", ")}, and ${lignes.length - 8} more`;
    const montre = doublons.slice(0, 6).map(([id, lignes]) => `"${id}" (rows ${lignesDe(lignes)})`).join("; ");
    throw new Error(
      `duplicate alert_id(s): ${montre}.\n`
      + `  One row is one alert: a duplicate would count the same case twice in a rate\n`
      + `  without a word. Deduplicate the export, or give each row its own id.\n`
      + `  Nothing was measured.`);
  }

  if (t.lignes.length < MINIMUM_ALERTES) {
    throw new Error(
      `Your file holds ${t.lignes.length} alert(s); this measurement wants at least ${MINIMUM_ALERTES}.\n`
      + `  Below that, no cell of the threshold frontier can be bounded: every interval\n`
      + `  spans most of the scale. Export a longer window of history and run again.`);
  }

  const alertes: Alerte[] = t.lignes.map((l) => ({
    id: lire(l, "alert_id"),
    compte: lire(l, "account_id"),
    finFenetre: lire(l, "window_end"),
    disposition: lire(l, "disposition").toLowerCase() as Disposition,
    ...(lire(l, "scenario_fired") !== "" ? { scenarioEditeur: lire(l, "scenario_fired") } : {}),
    ...(lire(l, "decided_at") !== "" ? { decideeLe: lire(l, "decided_at") } : {}),
  }));
  return { alertes, avertissements };
}

/* ───────────────────────── les transactions du client ───────────────────────── */

export function lireTransactions(texte: string): { parCompte: Map<string, Transaction[]>; lignes: number; avertissements: string[] } {
  const t = lireTable(texte);
  colonnes(t.noms, COLONNES_TX, COLONNES_TX_OPT, "transactions",
    `  account_id joins a transaction to its alerts, ts is an ISO date-time, amount a\n`
    + `  positive decimal (decimal point), direction is in or out for the account,\n`
    + `  channel is one of ${CHANNELS.join("/")}. Optional: counterparty_country (ISO alpha-2).`);

  const avertissements: string[] = [];
  if (t.ecartees.length) avertissements.push(
    `${t.ecartees.length} transaction row(s) carried more cells than the header and were `
    + `discarded: line(s) ${t.ecartees.slice(0, 8).map((e) => e.ligne).join(", ")}.`);

  const col = Object.fromEntries(t.noms.map((n, i) => [n, i])) as Record<string, number>;
  const lire = (l: string[], nom: string): string => (l[col[nom]!] ?? "").trim();

  const fautes: { quoi: string; lignes: number[] }[] = [];
  const releve = (quoi: string, ligne: number) => {
    const f = fautes.find((x) => x.quoi === quoi) ?? fautes[fautes.push({ quoi, lignes: [] }) - 1]!;
    f.lignes.push(ligne);
  };

  const parCompte = new Map<string, Transaction[]>();
  t.lignes.forEach((l, i) => {
    const ligne = t.numeros[i]!;
    const brutMontant = lire(l, "amount");
    /* Le refus AVANT la conversion, structurellement : Number("") vaut 0, et un vide
       converti d'abord entrerait comme un montant lu. Le motif décide, PUIS la
       conversion ne voit que ce qu'il a accepté. */
    if (brutMontant === "") { releve("a non-positive or unreadable amount", ligne); return; }
    if (!/^\d+(\.\d+)?$/.test(brutMontant)) { releve("a non-positive or unreadable amount", ligne); return; }
    const montant = Number(brutMontant);
    if (montant <= 0) { releve("a non-positive or unreadable amount", ligne); return; }
    const direction = lire(l, "direction").toLowerCase();
    if (!DIRECTIONS.includes(direction as Direction)) { releve(`a direction outside ${DIRECTIONS.join("/")}`, ligne); return; }
    const channel = lire(l, "channel").toLowerCase();
    if (!CHANNELS.includes(channel as Channel)) { releve(`a channel outside ${CHANNELS.join("/")}`, ligne); return; }
    const ts = lire(l, "ts");
    if (Number.isNaN(Date.parse(ts))) { releve("an unreadable ts", ligne); return; }
    const compte = lire(l, "account_id");
    if (compte === "") { releve("an empty account_id", ligne); return; }
    const pays = lire(l, "counterparty_country");
    const tx: Transaction = { ts, amount: montant, direction: direction as Direction,
      channel: channel as Channel, ...(pays !== "" ? { country: pays } : {}) };
    parCompte.set(compte, [...(parCompte.get(compte) ?? []), tx]);
  });
  if (fautes.length > 0) {
    const montre = fautes.map((f) => `${f.lignes.length} row(s) with ${f.quoi} `
      + `(line(s) ${f.lignes.slice(0, 6).join(", ")}${f.lignes.length > 6 ? `, and ${f.lignes.length - 6} more` : ""})`).join(";\n  ");
    throw new Error(
      `The transactions file cannot be read as measured data:\n  ${montre}.\n`
      + `  A malformed transaction inside a window would silently move a case's score, so\n`
      + `  nothing is measured until the export is clean. Fix the rows and run again.`);
  }
  for (const liste of parCompte.values()) liste.sort((a, b) => a.ts.localeCompare(b.ts));
  return { parCompte, lignes: t.lignes.length, avertissements };
}

/* ─────────────── la reconstruction : une alerte devient un Cas ─────────────── */

const JOUR_MS = 86_400_000;

export function reconstruire(a: Alerte, txs: readonly Transaction[]): Cas {
  const fin = Date.parse(a.finFenetre) + JOUR_MS - 1;               /* fin de journée incluse */
  const debutFenetre = Date.parse(a.finFenetre) - (JOURS_FENETRE - 1) * JOUR_MS;
  const debutHistorique = debutFenetre - JOURS_HISTORIQUE * JOUR_MS;
  const fenetre: Transaction[] = [], historique: Transaction[] = [];
  for (const t of txs) {
    const ts = Date.parse(t.ts);
    if (ts >= debutFenetre && ts <= fin) fenetre.push(t);
    else if (ts >= debutHistorique && ts < debutFenetre) historique.push(t);
  }
  /* Le tri appartient à la FRONTIÈRE qui promet un Cas valide, pas à la politesse de
     l'appelant : compter sur l'ordre d'entrée est le couplage caché qu'exigerCas existe
     pour attraper — et il l'a attrapé, au premier test passé non trié. */
  fenetre.sort((x, y) => x.ts.localeCompare(y.ts));
  historique.sort((x, y) => x.ts.localeCompare(y.ts));
  return exigerCas({ id: a.id, fenetre, historique, finFenetre: a.finFenetre });
}

/* ───────────────────────────── la mesure elle-même ───────────────────────────── */

export type Cellule = {
  seuil: number;
  tirees: number;
  rappel: Rate;
  faussesAlertes: Rate;
  pourMille?: number;
};

export type MesurePalier = { description: string; rang: number; cellules: Cellule[] };

export type MesureAlertes = {
  kind: "monitoring-client-record";
  version: 1;
  measuredAt: string;
  source: {
    file: string; sha256: string;
    alerts: number; suspicious: number; benign: number;
    /** les cas mesurés SANS transaction avant leur fenêtre : les scénarios relatifs y
     *  rendent 0, et le compte voyage avec le taux plutôt que de se fondre dedans */
    sansHistorique: number;
    periode: { from: string; to: string; jours: number; illisibles: number } | null;
  };
  transactions: { file: string; sha256: string; rows: number; accounts: number };
  volume: { origine: "volume"; n: number } | null;
  /** les échelles SOUS LESQUELLES ce relevé a été mesuré : les changer change les scores */
  echelles: Echelles;
  paliers: Partial<Record<PalierId, MesurePalier>>;
  absents: PalierId[];
  verdicts: Record<string, { disposition: Disposition; sansHistorique: boolean; scores: Partial<Record<PalierId, number>> }>;
  code: { commit: string } | null;
  empreinte?: string;
};

export function periodeDe(alertes: readonly Alerte[]): MesureAlertes["source"]["periode"] {
  const brutes = alertes.map((a) => a.decideeLe).filter((d): d is string => d !== undefined);
  if (brutes.length === 0) return null;
  const lues = brutes.map((d) => Date.parse(d));
  const illisibles = lues.filter((t) => Number.isNaN(t)).length;
  const valides = lues.filter((t) => !Number.isNaN(t));
  if (valides.length === 0) return { from: "", to: "", jours: 0, illisibles };
  const from = new Date(Math.min(...valides)).toISOString().slice(0, 10);
  const to = new Date(Math.max(...valides)).toISOString().slice(0, 10);
  const jours = Math.max(1, Math.round((Math.max(...valides) - Math.min(...valides)) / JOUR_MS));
  return { from, to, jours, illisibles };
}

export function mesurer(
  alertes: readonly Alerte[],
  parCompte: ReadonlyMap<string, Transaction[]>,
  registre: Registre,
  fichiers: { alerts: string; alertsSha: string; tx: string; txSha: string; txRows: number },
  volume: MesureAlertes["volume"],
  echelles: Echelles = ECHELLES,
  measuredAt = new Date().toISOString(),
): MesureAlertes {
  /* Un compte alerté sans AUCUNE transaction dans sa fenêtre est un refus du contrat :
     le cas ne peut pas être noté, et un score inventé sur une fenêtre vide déplacerait
     les deux taux. Nommé, avec le geste qui corrige. */
  const cas = new Map<string, Cas>();
  const sansFenetre: string[] = [];
  for (const a of alertes) {
    const c = reconstruire(a, parCompte.get(a.compte) ?? []);
    if (c.fenetre.length === 0) { sansFenetre.push(a.id); continue; }
    cas.set(a.id, c);
  }
  if (sansFenetre.length > 0) {
    throw new Error(
      `${sansFenetre.length} alerted account(s) have no transaction at all inside their\n`
      + `  ${JOURS_FENETRE}-day window: alert(s) ${apercu(sansFenetre, 8)}.\n`
      + `  A case with an empty window cannot be scored, and inventing a score would move\n`
      + `  both rates. Export the transactions covering each alerted window and run again.`);
  }

  const suspects = alertes.filter((a) => a.disposition === "suspicious");
  const benins = alertes.filter((a) => a.disposition === "benign");
  const sansHistorique = [...cas.values()].filter((c) => c.historique.length === 0).length;

  const paliers: Partial<Record<PalierId, MesurePalier>> = {};
  const verdicts: MesureAlertes["verdicts"] = Object.fromEntries(alertes.map((a) => [a.id, {
    disposition: a.disposition,
    sansHistorique: cas.get(a.id)!.historique.length === 0,
    scores: {} as Partial<Record<PalierId, number>>,
  }]));

  for (const s of [...registre.values()].sort((x, y) => x.rang - y.rang)) {
    /* Le score d'un cas se calcule UNE fois et voyage BRUT : un arrondi avant la
       comparaison ferait tirer au seuil 1,00 un score de 0,99996 (payé chez le rouge). */
    const scores = new Map<string, number>(
      alertes.map((a) => [a.id, s.score(cas.get(a.id)!, echelles)]));
    for (const a of alertes) verdicts[a.id]!.scores[s.id] = scores.get(a.id)!;
    const cellules: Cellule[] = SEUILS.map((seuil) => {
      const tire = (a: Alerte) => scores.get(a.id)! >= seuil;
      const tirees = alertes.filter(tire).length;
      return {
        seuil, tirees,
        rappel: rate(suspects.filter(tire).length, suspects.length),
        faussesAlertes: rate(benins.filter(tire).length, benins.length),
        ...(volume ? { pourMille: Math.round((tirees / volume.n) * 1000 * 100) / 100 } : {}),
      };
    });
    paliers[s.id] = { description: s.description, rang: s.rang, cellules };
  }

  return {
    kind: "monitoring-client-record", version: 1, measuredAt,
    source: {
      file: basename(fichiers.alerts), sha256: fichiers.alertsSha,
      alerts: alertes.length, suspicious: suspects.length, benign: benins.length,
      sansHistorique, periode: periodeDe(alertes),
    },
    transactions: { file: basename(fichiers.tx), sha256: fichiers.txSha,
      rows: fichiers.txRows, accounts: parCompte.size },
    volume, echelles, paliers,
    absents: PALIERS.filter((p) => !registre.has(p)),
    verdicts,
    code: commitCourant(),
  };
}

export function commitCourant(): { commit: string } | null {
  try {
    const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"],
      { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8" }).trim();
    return commit ? { commit } : null;
  } catch { return null; }
}

export function lireVolume(brut: string): number {
  if (!/^\d{1,12}$/.test(brut) || Number(brut) < 1) {
    throw new Error(
      `--volume=${brut} is not a number of accounts this tool reads. It wants a whole\n`
      + `  number of accounts monitored per month, like --volume=100000.`);
  }
  return Number(brut);
}

/* ─────────────────────────────── l'exécution entière ─────────────────────────────── */

export function executer(
  cheminAlertes: string,
  cheminTx: string,
  registre: Registre,
  volume: MesureAlertes["volume"],
): { mesure: MesureAlertes; cheminMd: string; cheminJson: string; avertissements: string[] } {
  const texteAlertes = readFileSync(cheminAlertes, "utf8");
  const texteTx = readFileSync(cheminTx, "utf8");
  const { alertes, avertissements: a1 } = lireAlertes(texteAlertes);
  const { parCompte, lignes, avertissements: a2 } = lireTransactions(texteTx);

  if (registre.size === 0) {
    throw new Error(
      `The scenario registry is empty: there is nothing to measure with.\n`
      + `  The scenarios live in src/scenarios/ and register themselves in src/scenarios/index.ts.`);
  }

  const m = mesurer(alertes, parCompte, registre, {
    alerts: cheminAlertes, alertsSha: createHash("sha256").update(texteAlertes).digest("hex"),
    tx: cheminTx, txSha: createHash("sha256").update(texteTx).digest("hex"), txRows: lignes,
  }, volume);
  m.empreinte = empreinteDuReleve(m);

  const base = cheminAlertes.replace(/\.csv$/i, "");
  const cheminJson = `${base}-measured.json`;
  const cheminMd = `${base}-measured.md`;
  writeFileSync(cheminJson, JSON.stringify(m, null, 2) + "\n");
  writeFileSync(cheminMd, rendreRapport(m));
  return { mesure: m, cheminMd, cheminJson, avertissements: [...a1, ...a2] };
}

async function principal(): Promise<void> {
  for (const l of lignesEvaluationDe("monitoring")) console.log(l);
  refuserDrapeauxInconnus(["--alerts", "--transactions", "--volume"]);
  const arg = (nom: string) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.split("=").slice(1).join("=");
  const cheminAlertes = arg("alerts");
  const cheminTx = arg("transactions");
  if (!cheminAlertes || !cheminTx) {
    console.log(`
Which scenario suffices, at which threshold, on your own dispositioned alerts.

  npm run measure:yours -- --alerts=your-alerts.csv --transactions=your-transactions.csv [--volume=N]

The ALERTS file wants these columns, names deciding, order free:

  alert_id,account_id,window_end,disposition[,scenario_fired,decided_at]

  alert_id       the alert in your system
  account_id     the alerted account: joins the transactions file
  window_end     ISO day the alerted ${JOURS_FENETRE}-day window ends on, inclusive
  disposition    the analyst's decision: suspicious or benign
  scenario_fired optional: the vendor scenario that fired, any label
  decided_at     optional ISO date: buys the period, and monthly figures downstream

The TRANSACTIONS file covers the alerted accounts, their windows and up to
${JOURS_HISTORIQUE} days before (for the relative scenarios):

  account_id,ts,amount,direction,channel[,counterparty_country]

--volume=N supplies the accounts monitored per month; without it, alerts-per-thousand
is not shown: never estimated in silence.

It writes, next to your alerts file and nowhere else:
  <file>-measured.md     the report (no account, no amount, no date of yours)
  <file>-measured.json   the sealed record: counts, rates, verdicts by alert_id

Then: npm run optimise -- --from=<file>-measured.json --recall=0.90
Nothing about your files leaves this machine.
`);
    return;
  }
  const brutVolume = arg("volume");
  const volume: MesureAlertes["volume"] =
    brutVolume !== undefined ? { origine: "volume", n: lireVolume(brutVolume) } : null;

  let registre: Registre;
  {
    const { registre: charger } = await import("./scenarios/index.ts");
    registre = charger();
  }

  const { mesure, cheminMd, cheminJson, avertissements } = executer(cheminAlertes, cheminTx, registre, volume);
  for (const a of avertissements) console.warn(`⚠ ${a}`);

  console.log(`\n${mesure.source.alerts} alert(s): ${mesure.source.suspicious} suspicious, `
    + `${mesure.source.benign} benign, ${mesure.source.sansHistorique} without history; `
    + `${Object.keys(mesure.paliers).length} scenario(s), ${SEUILS.length} thresholds each.`);
  if (mesure.absents.length) {
    console.log(`  ${mesure.absents.length} contract scenario(s) not in the registry: `
      + `${mesure.absents.join(", ")}; said in the report, not guessed.`);
  }
  console.log(`  ${cheminMd}`);
  console.log(`  ${cheminJson}`);
  console.log(`\nNext: npm run optimise -- --from=${basename(cheminJson)} --recall=0.90\n`);
}

/* Un refus destiné au client ne sort pas en trace de pile. */
if (isMain(import.meta)) {
  try {
    await principal();
  } catch (e) {
    console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
  }
}

/**
 * IBM AMLWORLD -> THE TWO FILES `npm run measure:yours` READS.
 *
 *   node examples/amlworld/map-alerts.ts --input=<HI-Small_Trans.csv> --out=<new folder>
 *
 * WHAT IS MAPPED, SAID FIRST. AMLworld (Altman et al., IBM, synthetic) labels TRANSACTIONS
 * (`Is Laundering`). It holds no alert and no analyst decision. The alerts below are CONSTRUCTED
 * by the rules that follow, they were not raised by any monitoring system, and the rates measured
 * on them say nothing about the false-alert rate of a real system. They show the tool's output on
 * public data, no more.
 *
 *   1. Only accounts that appear in dollars alone count: an account that touches another currency
 *      on either side of a row is out. The tool's amounts have one currency and no exchange rate
 *      is invented here.
 *   2. An account in at least one laundering row is a `suspicious` alert. Its window ends on the
 *      day of its EARLIEST laundering row (the file is not sorted by time).
 *   3. A `benign` alert is an account in no laundering row at all, drawn among the accounts that
 *      were active on the SAME day as a suspicious alert (BENINS_PAR_SUSPECT for each). The window
 *      of the tool grows with its end day, so unmatched days would let the peak amount tell the
 *      classes apart. A suspicious account with too few benign matches that day is dropped and
 *      counted.
 *   4. The draw is a fixed hash order on (SEED, account), so the output depends on the seed and the
 *      accounts and never on the order of the rows. At most SUSPECTS_MAX suspicious alerts are kept.
 *   5. The transactions file holds, per alerted account, its rows up to the end of its window day:
 *      `out` at Amount Paid for the payer, `in` at Amount Received for the payee, one `out` row for
 *      a transfer to oneself. The file gives no time zone and its clock times are read as UTC.
 *      Payment formats fold onto the tool's five channels (CANAUX below), nothing is guessed: a
 *      format the table does not know is refused.
 *
 * Any row that does not have the shape described here stops the run with its line number. A file
 * is never read on past a row the mapping does not understand. Nothing leaves the machine.
 */
import { closeSync, existsSync, mkdirSync, openSync, readSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { isMain, refuserDrapeauxInconnus } from "../../src/cli.ts";

export const SEED = "amlworld-hi-small-2026-10-11";
export const SUSPECTS_MAX = 300;
export const BENINS_PAR_SUSPECT = 3;

export const ENTETE = "Timestamp,From Bank,Account,To Bank,Account,Amount Received,Receiving Currency,Amount Paid,Payment Currency,Payment Format,Is Laundering";
const USD = "US Dollar";
/** The seven payment formats of the file, folded onto the tool's channels. */
export const CANAUX: Record<string, string> = {
  "Cheque": "other", "Credit Card": "card", "ACH": "transfer", "Cash": "cash",
  "Reinvestment": "other", "Wire": "wire", "Bitcoin": "other",
};
const MAX_JOURS = 31;

export type Alerte = { id: string; compte: string; finFenetre: string; disposition: "suspicious" | "benign" };
export type Ligne = { compte: string; ts: string; amount: string; direction: "in" | "out"; channel: string };
export type Resultat = {
  alertes: Alerte[];
  transactions: Ligne[];
  resume: {
    lignesLues: number;
    comptes: number;
    /** accounts left out because they touch another currency */
    comptesHorsDollar: number;
    /** laundering-involved dollar-only accounts */
    suspectsEligibles: number;
    /** kept as suspicious alerts */
    suspectsRetenus: number;
    /** examined and dropped for lack of benign accounts active the same day */
    ecartesFauteDeBenins: number;
    benins: number;
  };
};
export type Options = { seed?: string; suspectsMax?: number; beninsParSuspect?: number };

type Ligne11 = { ts: string; jour: string; de: string; vers: string; recu: string; paye: string; dollar: boolean; format: string; laundering: boolean };

/** Every row of the file, validated. The header is line 1; a row that is not understood stops the run. */
function* rangees(source: Iterable<string>): Generator<Ligne11> {
  let n = 0;
  for (const brut of source) {
    n++;
    if (n === 1) {
      if (brut !== ENTETE) throw new Error(`line 1: the header is not the AMLworld one.\n  Expected: ${ENTETE}\n  Read:     ${brut.slice(0, 200)}`);
      continue;
    }
    const c = brut.split(",");
    if (c.length !== 11) throw new Error(`line ${n} has ${c.length} fields, expected 11`);
    const [ts, bd, ad, bv, av, recu, devRecu, paye, devPaye, format, label] = c as [string, string, string, string, string, string, string, string, string, string, string];
    if (!/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(ts)) throw new Error(`line ${n}: the timestamp "${ts}" is not YYYY/MM/DD HH:MM`);
    if (label !== "0" && label !== "1") throw new Error(`line ${n}: the label "${label}" is neither 0 nor 1`);
    if (!(format in CANAUX)) throw new Error(`line ${n}: the payment format "${format}" is not in the channel table (${Object.keys(CANAUX).join(", ")})`);
    const dollar = devRecu === USD && devPaye === USD;
    if (dollar) {
      for (const [nom, v] of [["received", recu], ["paid", paye]] as const) {
        if (!/^\d+(\.\d+)?$/.test(v) || Number(v) <= 0) throw new Error(`line ${n}: the amount ${nom} "${v}" is not a positive plain decimal`);
      }
    }
    yield { ts, jour: ts.slice(0, 10).replaceAll("/", "-"), de: `${bd}-${ad}`, vers: `${bv}-${av}`, recu, paye, dollar, format, laundering: label === "1" };
  }
  if (n < 2) throw new Error("the file holds no row");
}

const empreinte = (seed: string, cle: string): string => createHash("sha256").update(`${seed}|${cle}`).digest("hex");

type Etat = { hors: boolean; premier: string | null; jours: number };

export function cartographier(lire: () => Iterable<string>, options: Options = {}): Resultat {
  const seed = options.seed ?? SEED;
  const max = options.suspectsMax ?? SUSPECTS_MAX;
  const k = options.beninsParSuspect ?? BENINS_PAR_SUSPECT;

  /* PASS 1: per account, is it out (another currency), its earliest laundering day, the days it was active. */
  const comptes = new Map<string, Etat>();
  const indexJour = new Map<string, number>();
  let lignesLues = 0;
  const etat = (cle: string): Etat => {
    let e = comptes.get(cle);
    if (!e) { e = { hors: false, premier: null, jours: 0 }; comptes.set(cle, e); }
    return e;
  };
  for (const r of rangees(lire())) {
    lignesLues++;
    if (!indexJour.has(r.jour)) {
      if (indexJour.size >= MAX_JOURS) throw new Error(`the file spans more than ${MAX_JOURS} days; the tool's window is thirty days and this mapping reads one month at most`);
      indexJour.set(r.jour, indexJour.size);
    }
    for (const cle of r.de === r.vers ? [r.de] : [r.de, r.vers]) {
      const e = etat(cle);
      if (!r.dollar) { e.hors = true; continue; }
      e.jours |= 1 << indexJour.get(r.jour)!;
      if (r.laundering && (e.premier === null || r.jour < e.premier)) e.premier = r.jour;
    }
  }

  /* THE DRAW: suspicious accounts in hash order, each asking for K benign accounts of its day. */
  const hash = new Map<string, string>();
  const h = (cle: string): string => hash.get(cle) ?? (hash.set(cle, empreinte(seed, cle)), hash.get(cle)!);
  const parHash = (a: string, b: string): number => (h(a) < h(b) ? -1 : h(a) > h(b) ? 1 : a < b ? -1 : 1);

  const eligibles = [...comptes].filter(([, e]) => !e.hors && e.premier !== null).map(([c]) => c).sort(parHash);
  const benins = [...comptes].filter(([, e]) => !e.hors && e.premier === null).map(([c]) => c);
  const listes = new Map<string, { liste: string[]; depuis: number }>();
  const pris = new Set<string>();
  const candidats = (jour: string) => {
    let l = listes.get(jour);
    if (!l) {
      const bit = 1 << indexJour.get(jour)!;
      l = { liste: benins.filter((c) => (comptes.get(c)!.jours & bit) !== 0).sort(parHash), depuis: 0 };
      listes.set(jour, l);
    }
    return l;
  };

  const alertes: Omit<Alerte, "id">[] = [];
  let ecartes = 0;
  let retenus = 0;
  for (const s of eligibles) {
    if (retenus >= max) break;
    const jour = comptes.get(s)!.premier!;
    const l = candidats(jour);
    while (l.depuis < l.liste.length && pris.has(l.liste[l.depuis]!)) l.depuis++;
    const choisis: string[] = [];
    for (let i = l.depuis; i < l.liste.length && choisis.length < k; i++) if (!pris.has(l.liste[i]!)) choisis.push(l.liste[i]!);
    if (choisis.length < k) { ecartes++; continue; }
    retenus++;
    alertes.push({ compte: s, finFenetre: jour, disposition: "suspicious" });
    for (const b of choisis) { pris.add(b); alertes.push({ compte: b, finFenetre: jour, disposition: "benign" }); }
  }

  /* The ids carry no disposition: they follow the window day, then the hash order. */
  alertes.sort((a, b) => (a.finFenetre < b.finFenetre ? -1 : a.finFenetre > b.finFenetre ? 1 : parHash(a.compte, b.compte)));
  const largeur = Math.max(4, String(alertes.length).length);
  const finales: Alerte[] = alertes.map((a, i) => ({ id: `aml-${String(i + 1).padStart(largeur, "0")}`, ...a }));
  const parCompte = new Map(finales.map((a) => [a.compte, a]));

  /* PASS 2: the rows of the alerted accounts, up to the end of their window day. */
  const transactions: Ligne[] = [];
  const iso = (ts: string): string => `${ts.slice(0, 10).replaceAll("/", "-")}T${ts.slice(11, 16)}:00Z`;
  for (const r of rangees(lire())) {
    if (!r.dollar) continue;
    const a = parCompte.get(r.de);
    if (a && r.jour <= a.finFenetre) transactions.push({ compte: r.de, ts: iso(r.ts), amount: r.paye, direction: "out", channel: CANAUX[r.format]! });
    const b = r.vers === r.de ? undefined : parCompte.get(r.vers);
    if (b && r.jour <= b.finFenetre) transactions.push({ compte: r.vers, ts: iso(r.ts), amount: r.recu, direction: "in", channel: CANAUX[r.format]! });
  }
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  transactions.sort((x, y) => cmp(x.compte, y.compte) || cmp(x.ts, y.ts) || cmp(x.direction, y.direction) || cmp(x.amount, y.amount) || cmp(x.channel, y.channel));

  return {
    alertes: finales,
    transactions,
    resume: {
      lignesLues, comptes: comptes.size,
      comptesHorsDollar: [...comptes.values()].filter((e) => e.hors).length,
      suspectsEligibles: eligibles.length, suspectsRetenus: retenus, ecartesFauteDeBenins: ecartes,
      benins: finales.filter((a) => a.disposition === "benign").length,
    },
  };
}

export const alertesEnCsv = (alertes: readonly Alerte[]): string =>
  ["alert_id,account_id,window_end,disposition", ...alertes.map((a) => `${a.id},${a.compte},${a.finFenetre},${a.disposition}`)].join("\n") + "\n";

export const transactionsEnCsv = (lignes: readonly Ligne[]): string =>
  ["account_id,ts,amount,direction,channel", ...lignes.map((t) => `${t.compte},${t.ts},${t.amount},${t.direction},${t.channel}`)].join("\n") + "\n";

/** The lines of a file, read in chunks so that a file larger than memory is fine; the last empty piece is not a line. */
export function* lignesDuFichier(chemin: string): Generator<string> {
  const fd = openSync(chemin, "r");
  try {
    const tampon = Buffer.alloc(4 * 1024 * 1024);
    const decodeur = new TextDecoder("utf-8", { fatal: true });
    let reste = "";
    for (;;) {
      const lu = readSync(fd, tampon, 0, tampon.length, null);
      if (lu === 0) break;
      const morceaux = (reste + decodeur.decode(tampon.subarray(0, lu), { stream: true })).split("\n");
      reste = morceaux.pop()!;
      for (const m of morceaux) yield m.endsWith("\r") ? m.slice(0, -1) : m;
    }
    reste += decodeur.decode();
    if (reste !== "") yield reste.endsWith("\r") ? reste.slice(0, -1) : reste;
  } finally {
    closeSync(fd);
  }
}

if (isMain(import.meta)) {
  refuserDrapeauxInconnus(["--input", "--out"]);
  const arg = (nom: string) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.split("=").slice(1).join("=");
  const entree = arg("input");
  const sortie = arg("out");
  if (!entree || !sortie) {
    console.error("  usage: node examples/amlworld/map-alerts.ts --input=<HI-Small_Trans.csv> --out=<a new folder>\n"
      + "  Nothing is written next to the input, and the output folder must not already hold files.");
    process.exit(2);
  }
  if (!existsSync(entree)) { console.error(`  ${entree} does not exist.`); process.exit(2); }
  if (existsSync(sortie) && readdirSync(sortie).length > 0) {
    console.error(`  ${sortie} already holds files. Name a new folder: a mapping never overwrites.`);
    process.exit(2);
  }
  try {
    const r = cartographier(() => lignesDuFichier(entree));
    mkdirSync(sortie, { recursive: true });
    const a = join(sortie, "amlworld-alerts.csv");
    const t = join(sortie, "amlworld-transactions.csv");
    writeFileSync(a, alertesEnCsv(r.alertes));
    writeFileSync(t, transactionsEnCsv(r.transactions));
    console.log(`  ${r.resume.lignesLues} rows read, ${r.resume.comptes} accounts, ${r.resume.comptesHorsDollar} left out for touching another currency.`);
    console.log(`  ${r.resume.suspectsEligibles} dollar-only accounts in a laundering row; ${r.resume.suspectsRetenus} kept, ${r.resume.ecartesFauteDeBenins} dropped for lack of benign accounts active the same day.`);
    console.log(`  ${r.alertes.length} alerts (${r.resume.benins} benign), ${r.transactions.length} transaction rows.`);
    console.log(`  ${a}\n  ${t}`);
  } catch (e) {
    console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
  }
}

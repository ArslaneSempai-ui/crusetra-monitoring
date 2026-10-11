/**
 * LE RAPPORT — les sections du contrat (§6), dans son ordre :
 *
 *   1. ce qui a été mesuré : n alertes, n suspects, n bénins, n sans historique, période ;
 *   2. la grille scénario × seuil : rappel [intervalle], fausses alertes [intervalle],
 *      alertes pour mille comptes quand le volume existe ;
 *   3. la cellule recommandée sous l'exigence déclarée (borne basse >= recallFloor puis
 *      le moins de fausses alertes) et ce que le pas suivant coûte, hypothèses à côté ;
 *   4. la robustesse synthétique, À PART, jamais fusionnée ;
 *   5. la provenance : measured / assumed / synthetic, les échelles, sceau, date, commit.
 *
 * Aucun taux ne se formate ici à la main hors la règle contractuelle du rappel :
 * `cellulesDeTaux` porte la condition générale, `celluleRappel` porte la règle des cinq.
 * JAMAIS une valeur du client : ni account_id, ni montant, ni date de transaction.
 */
import { table } from "./figures.ts";
import { rate, cellulesDeTaux, ENOUGH } from "./interval.ts";
import { cellule } from "./csv.ts";
import { SEUILS } from "./scenario.ts";
import { ASSUMPTIONS, STATUSES, UNITS, symboleDe, ligneDHypothese } from "./assumptions.ts";
import { cellulesDe, meilleureSousRappel, heuresDAnalyste, MINIMUM_SUSPECTS } from "./optimise.ts";
import type { MesureAlertes, Cellule } from "./your-alerts.ts";

export { MINIMUM_SUSPECTS };
export const TROP_PEU_DE_SUSPECTS = "too few confirmed cases to bound recall";
/** La note du contrat pour 5 <= n < 20 : l'intervalle est la lecture, jamais le point. */
export const NOTE_PETIT_N = "n below 20: read the interval, not the point";

/** Les seuils montrés dans le fichier lisible ; la grille entière vit dans le relevé scellé. */
export const SEUILS_MONTRES: readonly number[] = [0.50, 0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 0.99, 1.00];

/**
 * La cellule du rappel suit le CONTRAT, pas le seuil général : sous cinq suspects, la
 * phrase du contrat ; dès cinq, le taux AVEC son intervalle même sous ENOUGH — et la note
 * `NOTE_PETIT_N` voyage sous chaque table concernée. Les fausses alertes restent au
 * régime général de `cellulesDeTaux`.
 */
function celluleRappel(c: Cellule, suspects: number): { taux: string; intervalle: string } {
  if (suspects < MINIMUM_SUSPECTS) return { taux: `n/a: ${TROP_PEU_DE_SUSPECTS}`, intervalle: `n=${suspects}` };
  const r = rate(c.rappel.successes, c.rappel.n);
  if (r.reportable) return cellulesDeTaux(r);
  return {
    taux: `${(r.rate * 100).toFixed(1)} %`,
    intervalle: `[${(r.low * 100).toFixed(0)}–${(r.high * 100).toFixed(0)}]`,
  };
}

export function rendreRapport(m: MesureAlertes): string {
  const l: string[] = [`# Monitoring measurement on your own dispositioned alerts`, ``];

  /* ── 1 · ce qui a été mesuré ── */
  l.push(`## What was measured`, ``);
  l.push(`${m.source.alerts} alert(s) from ${cellule(m.source.file)} (sha256 ${m.source.sha256.slice(0, 16)}…), `
    + `rebuilt into thirty-day cases from ${cellule(m.transactions.file)} `
    + `(${m.transactions.rows} transaction row(s) over ${m.transactions.accounts} account(s), `
    + `sha256 ${m.transactions.sha256.slice(0, 16)}…), measured on this machine on ${m.measuredAt.slice(0, 10)}. `
    + `Nothing left it.`);
  l.push(``);
  l.push(`- confirmed suspicious: ${m.source.suspicious}`);
  l.push(`- benign (closed without action): ${m.source.benign}`);
  l.push(`- cases with no transaction before their window: ${m.source.sansHistorique}; the relative`);
  l.push(`  scenarios (zscore, peer) score 0 there; the count travels with the rates rather than`);
  l.push(`  dissolving into them.`);
  if (m.source.periode && m.source.periode.from) {
    l.push(`- period, from your decided_at column: ${m.source.periode.from} to ${m.source.periode.to} `
      + `(${m.source.periode.jours} day(s)`
      + (m.source.periode.illisibles ? `; ${m.source.periode.illisibles} unreadable date(s), counted, not hidden` : "")
      + `)`);
  } else {
    l.push(`- period: not measured; no readable decided_at column. Monthly figures downstream need it.`);
  }
  l.push(m.volume
    ? `- accounts monitored per month: ${m.volume.n} (declared with --volume)`
    : `- accounts monitored per month: not supplied. The alerts-per-thousand column does not appear; it is never estimated in silence.`);
  l.push(``);
  l.push(`One limit, stated up front: this history contains only the alerts your CURRENT programme`);
  l.push(`raised and your analysts dispositioned. A pattern nobody ever alerted on is invisible to`);
  l.push(`this file. Robustness on manufactured cases is measured separately, on the public record,`);
  l.push(`which is entirely synthetic and says so (section 4).`);
  l.push(``);

  /* ── 2 · la grille ── */
  l.push(`## The frontier, scenario by scenario`, ``);
  l.push(`Thresholds shown: ${SEUILS_MONTRES.map((s) => s.toFixed(2)).join(", ")}; the full grid of`);
  l.push(`${SEUILS.length} lives in the sealed record beside this file.`);
  l.push(``);
  const paliers = Object.entries(m.paliers).sort(([, a], [, b]) => a!.rang - b!.rang);
  for (const [id, p] of paliers) {
    l.push(`### ${cellule(id)} (${p!.description})`, ``);
    const entetes = ["threshold", "alerts raised", `recall (n=${m.source.suspicious})`, "interval",
      `false alerts (n=${m.source.benign})`, "interval"];
    if (m.volume) entetes.push("per 1000 accounts");
    const lignes = p!.cellules
      .filter((c) => SEUILS_MONTRES.includes(c.seuil))
      .map((c) => {
        const r = celluleRappel(c, m.source.suspicious);
        const f = cellulesDeTaux(rate(c.faussesAlertes.successes, c.faussesAlertes.n));
        const ligne: (string | number)[] = [c.seuil.toFixed(2), c.tirees, r.taux, r.intervalle, f.taux, f.intervalle];
        if (m.volume) ligne.push(c.pourMille ?? "");
        return ligne;
      });
    l.push(table(entetes, lignes));
    if (m.source.suspicious >= MINIMUM_SUSPECTS && m.source.suspicious < ENOUGH) {
      l.push(``, `*${NOTE_PETIT_N}.*`);
    }
    l.push(``);
  }
  if (m.absents.length) {
    l.push(`Contract scenarios absent from the registry, said rather than guessed: `
      + `${m.absents.map((a) => cellule(a)).join(", ")}. The frontier above covers what was measured.`);
    l.push(``);
  }

  /* ── 3 · la cellule recommandée ── */
  l.push(`## The recommended cell, under the declared recall floor`, ``);
  if (m.source.suspicious < MINIMUM_SUSPECTS) {
    l.push(`No recommendation: ${TROP_PEU_DE_SUSPECTS} (${m.source.suspicious} confirmed suspicious in`);
    l.push(`this file). A cell recommended on that would be a guess wearing a threshold. The`);
    l.push(`synthetic robustness of the public record stands apart and does not substitute for it.`);
  } else {
    const c = meilleureSousRappel(cellulesDe(m), ASSUMPTIONS.recallFloor);
    l.push(`The rule of the tool: recall lower bound at or above ${ligneDHypothese("recallFloor")},`);
    l.push(`then the fewest false alerts; yours to set with \`optimise -- --recall=<min>\`.`);
    l.push(``);
    if (!c) {
      l.push(`No cell holds a recall lower bound of ${ASSUMPTIONS.recallFloor} on this sample`);
      l.push(`(${m.source.suspicious} confirmed suspicious). Lower the floor knowingly, or measure a`);
      l.push(`longer window of history: the bound tightens with n.`);
    } else {
      l.push(`Fewest false alerts with the bound held: ${cellule(c.palier)} at threshold ${c.seuil.toFixed(2)}; `
        + `${c.faussesAlertes.successes} false alert(s) of ${c.faussesAlertes.n} benign case(s), `
        + `${c.tirees} of ${m.source.alerts} historical alerts raised, recall `
        + `${(c.rappel.rate * 100).toFixed(1)} % [${(c.rappel.low * 100).toFixed(0)}–${(c.rappel.high * 100).toFixed(0)}], n=${c.rappel.n}.`);
      const economisees = m.source.alerts - c.tirees;
      const h = heuresDAnalyste(economisees);
      l.push(``);
      l.push(`Against your current programme's history: ${economisees} alert(s) fewer over the file's`);
      l.push(`period, ${h.heures.toFixed(1)} analyst hour(s), ${symboleDe(UNITS.analystAnnualCost)}${h.usd.toFixed(0)}, computed from assumptions shown here:`);
      l.push(`- ${ligneDHypothese("minutesPerAlert")}`);
      l.push(`- ${ligneDHypothese("analystAnnualCost")}, over ${ASSUMPTIONS.workingDaysPerYear} days/year × ${ASSUMPTIONS.productiveHoursPerDay} h/day`);
      const suivant = m.paliers[c.palier]!.cellules.find((x) => x.seuil === Math.round((c.seuil + 0.01) * 100) / 100);
      if (suivant) {
        const dr = celluleRappel(suivant, m.source.suspicious);
        l.push(``);
        l.push(`The next step (threshold ${suivant.seuil.toFixed(2)}) would drop ${c.tirees - suivant.tirees} more alert(s)`);
        l.push(`and put the recall at ${dr.taux} ${dr.intervalle}: what tightening costs, before you pay it.`);
      }
    }
  }
  l.push(``);

  /* ── 4 · la robustesse synthétique, à part ── */
  l.push(`## Synthetic robustness, kept apart`, ``);
  l.push(`Not measured in this run: no real transaction is public, so the public record of this`);
  l.push(`tool is ENTIRELY fabricated (authored archetypes of suspicion with their benign`);
  l.push(`look-alikes, plus seeded variants) and it says so on every figure. It never merges`);
  l.push(`with the rates above: your history measures your programme's reality, the fabricated`);
  l.push(`cases measure what a scenario can see at all. Provenance keeps the words apart:`);
  l.push(`those figures are \`synthetic\` or \`authored\`, never \`measured\`.`);
  l.push(``);

  /* ── 5 · la provenance ── */
  l.push(`## Provenance`, ``);
  l.push(`- measured: every rate in section 2, on your files, n and interval attached.`);
  l.push(`- assumed: ${(Object.keys(STATUSES) as (keyof typeof STATUSES)[])
    .map((k) => ligneDHypothese(k)).join("; ")}.`);
  l.push(`- the scales above are the ones THIS record was measured under; the sealed record`);
  l.push(`  snapshots them, because changing a scale changes every score.`);
  l.push(`- seal: ${m.empreinte ?? "(sealed after rendering; see the .json beside this file)"} · `
    + `measured ${m.measuredAt.slice(0, 10)}`
    + (m.code ? ` · code at commit ${m.code.commit}` : ""));
  l.push(``);
  l.push(`No value from your files (no account_id, no amount, no transaction date, no country)`);
  l.push(`appears in this report or in the sealed record; verdicts are keyed by your alert_id and`);
  l.push(`carry your analyst's disposition and whether the case had history, never a score. The`);
  l.push(`alert ids and the file names are yours and DO survive: choose them opaque.`);
  l.push(``);
  return l.join("\n");
}

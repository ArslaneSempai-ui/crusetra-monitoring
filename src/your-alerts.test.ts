/**
 * La mesure client, éprouvée contre un REGISTRE FACTICE conforme à scenario.ts : les
 * vrais scénarios appartiennent au lot L1. Le scénario factice lit son score DANS le
 * cas : le montant de la première transaction de la fenêtre, divisé par un million —
 * chaque test contrôle donc exactement quelle cellule tire.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  lireAlertes, lireTransactions, reconstruire, mesurer, executer, periodeDe, lireVolume,
  MINIMUM_ALERTES, type Alerte,
} from "./your-alerts.ts";
import { rendreRapport, TROP_PEU_DE_SUSPECTS, NOTE_PETIT_N } from "./rapport.ts";
import { scelleIntact, empreinteDuReleve } from "./empreinte.ts";
import { ECHELLES } from "./assumptions.ts";
import type { Registre, Scenario, PalierId } from "./scenario.ts";
import { JOURS_HISTORIQUE, JOURS_FENETRE } from "./cas.ts";
import type { Transaction } from "./cas.ts";

/* ─── le registre factice, conforme à la couture ─── */
export function registreFactice(ids: PalierId[] = ["amount", "zscore"]): Registre {
  return new Map(ids.map((id, i) => [id, {
    id, description: `fake ${id} for the seam tests`, rang: i + 1,
    echellesLues: [] as const,
    /* zscore factice : 0 sans historique, sinon comme amount — pour éprouver la règle
       « sans historique, les scénarios relatifs rendent 0 » sans attendre le lot L1 */
    score: (cas) => (id === "zscore" && cas.historique.length === 0) ? 0
      : Math.min(1, (cas.fenetre[0]?.amount ?? 0) / 1_000_000),
  } as Scenario]));
}

const ENTETE_A = "alert_id,account_id,window_end,disposition";
const ENTETE_T = "account_id,ts,amount,direction,channel";

/** n alertes valides : s suspects (scores donnés), le reste bénin à 0,40. */
function jeu(scoresSuspects: number[], nBenins: number, avecHistorique = true): { alertes: string; tx: string } {
  const a: string[] = [ENTETE_A + ",decided_at"];
  const t: string[] = [ENTETE_T];
  scoresSuspects.forEach((s, i) => {
    a.push(`s-${i},acc-s${i},2026-08-30,suspicious,2026-0${(i % 3) + 6}-15`);
    t.push(`acc-s${i},2026-08-20T10:00:00Z,${Math.round(s * 1_000_000)},in,cash`);
    if (avecHistorique) t.push(`acc-s${i},2026-05-01T10:00:00Z,100,in,transfer`);
  });
  for (let i = 0; i < nBenins; i++) {
    a.push(`b-${i},acc-b${i},2026-08-30,benign,2026-07-0${(i % 9) + 1}`);
    t.push(`acc-b${i},2026-08-10T09:00:00Z,400000,out,wire`);
    if (avecHistorique) t.push(`acc-b${i},2026-04-01T09:00:00Z,90,out,card`);
  }
  return { alertes: a.join("\n") + "\n", tx: t.join("\n") + "\n" };
}

function mesureDe(scoresSuspects: number[], nBenins: number, opts: { volume?: number; historique?: boolean } = {}) {
  const { alertes, tx } = jeu(scoresSuspects, nBenins, opts.historique ?? true);
  const { alertes: a } = lireAlertes(alertes);
  const { parCompte } = lireTransactions(tx);
  return mesurer(a, parCompte, registreFactice(), {
    alerts: "x.csv", alertsSha: "0".repeat(64), tx: "y.csv", txSha: "1".repeat(64), txRows: 1,
  }, opts.volume ? { origine: "volume", n: opts.volume } : null);
}

/* ─── les refus du contrat ─── */

test("colonne manquante et colonne inconnue : refusées en les nommant, chaque fichier", () => {
  assert.throws(() => lireAlertes("alert_id,account_id,disposition\n1,a,benign\n"),
    /alerts header is missing "window_end"/);
  assert.throws(() => lireAlertes(ENTETE_A + ",note\n1,a,2026-01-01,benign,x\n"), /"note"/);
  assert.throws(() => lireTransactions("account_id,ts,amount,direction\na,2026-01-01T00:00:00Z,5,in\n"),
    /transactions header is missing "channel"/);
});

test("la disposition se lit sans casse, et le hors-vocabulaire est refusé avec ligne et valeur", () => {
  const lignes = [ENTETE_A];
  for (let i = 0; i < 30; i++) {
    lignes.push(`c-${i},acc,2026-08-30,${i === 0 ? "Suspicious" : i === 1 ? "BENIGN" : "benign"}`);
  }
  const { alertes } = lireAlertes(lignes.join("\n") + "\n");
  assert.equal(alertes[0]!.disposition, "suspicious");
  assert.equal(alertes[1]!.disposition, "benign");
  assert.throws(() => lireAlertes(ENTETE_A + "\n1,a,2026-01-01,Pending\n"), /line 2: "Pending"/);
});

test("window_end illisible, ids vides, alert_id dupliqué (lignes tronquées), moins de 30 : refusés", () => {
  assert.throws(() => lireAlertes(ENTETE_A + "\n1,a,30/08/2026,benign\n"), /unreadable window_end/);
  assert.throws(() => lireAlertes(ENTETE_A + "\n1,,2026-01-01,benign\n"), /empty alert_id or account_id/);
  const doubles = [ENTETE_A];
  for (let i = 0; i < 31; i++) doubles.push(`meme,acc,2026-08-30,benign`);
  assert.throws(() => lireAlertes(doubles.join("\n") + "\n"), (e: Error) => {
    assert.match(e.message, /duplicate alert_id/);
    assert.match(e.message, /and 23 more/, "les lignes d'un même id se tronquent, le reste se compte");
    return true;
  });
  assert.throws(() => lireAlertes(ENTETE_A + "\n1,a,2026-01-01,benign\n"),
    new RegExp(`at least ${MINIMUM_ALERTES}`));
});

test("transactions : montant non positif refusé AVANT conversion, direction/channel/ts nommés", () => {
  const cas = (ligne: string, motif: RegExp) =>
    assert.throws(() => lireTransactions(ENTETE_T + "\n" + ligne + "\n"), motif);
  cas("a,2026-01-01T00:00:00Z,0,in,cash", /non-positive or unreadable amount/);
  cas("a,2026-01-01T00:00:00Z,,in,cash", /non-positive or unreadable amount/);
  cas("a,2026-01-01T00:00:00Z,-5,in,cash", /non-positive or unreadable amount/);
  cas("a,2026-01-01T00:00:00Z,abc,in,cash", /non-positive or unreadable amount/);
  cas("a,2026-01-01T00:00:00Z,5,sideways,cash", /direction outside in\/out/);
  cas("a,2026-01-01T00:00:00Z,5,in,crypto", /channel outside/);
  cas("a,pas-une-date,5,in,cash", /unreadable ts/);
});

/* ─── la reconstruction ─── */

test("la fenêtre est les trente jours qui précèdent window_end, inclus ; l'historique va à 180 jours", () => {
  /* Les nombres du titre sont TENUS par les constantes du contrat, pas récités. */
  assert.equal(JOURS_FENETRE, 30);
  assert.equal(JOURS_HISTORIQUE, 180);
  const txs: Transaction[] = [
    { ts: "2026-08-30T23:00:00Z", amount: 1, direction: "in", channel: "cash" },   /* dernier jour : dedans */
    { ts: "2026-08-01T00:00:00Z", amount: 2, direction: "in", channel: "cash" },   /* jour 1 de la fenêtre : dedans */
    { ts: "2026-07-31T23:59:59Z", amount: 3, direction: "in", channel: "cash" },   /* veille : historique */
    { ts: "2026-02-03T00:00:00Z", amount: 4, direction: "in", channel: "cash" },   /* ~180 j avant : historique */
    { ts: "2025-12-01T00:00:00Z", amount: 5, direction: "in", channel: "cash" },   /* au-delà : ignoré */
  ];
  const c = reconstruire({ id: "a", compte: "x", finFenetre: "2026-08-30", disposition: "benign" }, txs);
  assert.deepEqual(c.fenetre.map((t) => t.amount), [2, 1]);
  assert.deepEqual(c.historique.map((t) => t.amount), [4, 3]);
});

test("un compte alerté sans transaction dans sa fenêtre est un refus qui NOMME les alertes", () => {
  const { alertes, tx } = jeu([0.9, 0.9, 0.9, 0.9, 0.9], 25);
  const { alertes: a } = lireAlertes(alertes);
  const { parCompte } = lireTransactions(tx);
  parCompte.delete("acc-s0");           /* plus une transaction pour ce compte */
  assert.throws(() => mesurer(a, parCompte, registreFactice(), {
    alerts: "x.csv", alertsSha: "0".repeat(64), tx: "y.csv", txSha: "1".repeat(64), txRows: 1,
  }, null), /no transaction at all inside their[\s\S]*s-0/);
});

test("les cas sans historique sont comptés à part, et le zscore factice y rend zéro", () => {
  const m = mesureDe([0.9, 0.9, 0.9, 0.9, 0.9, 0.9], 24, { historique: false });
  assert.equal(m.source.sansHistorique, 30);
  assert.equal(m.verdicts["s-0"]!.sansHistorique, true);
  /* the verdicts no longer carry scores (record-sans-score.test.ts): the cells say it */
  assert.ok(m.paliers.zscore!.cellules.every((c) => c.tirees === 0), "un scénario relatif sans historique rend 0 : aucune cellule ne tire");
  assert.ok(m.paliers.amount!.cellules.find((c) => c.seuil === 0.8)!.tirees > 0, "un scénario absolu note quand même");
});

/* ─── la grille ─── */

test("rappel et fausses alertes comptent les bonnes populations, au bon seuil, >= inclus", () => {
  const m = mesureDe([0.9, 0.9, 0.8, 0.7, 0.6, 0.55], 24);
  const c85 = m.paliers.amount!.cellules.find((c) => c.seuil === 0.85)!;
  assert.deepEqual([c85.rappel.successes, c85.rappel.n], [2, 6]);
  assert.deepEqual([c85.faussesAlertes.successes, c85.faussesAlertes.n], [0, 24]);
  const c55 = m.paliers.amount!.cellules.find((c) => c.seuil === 0.55)!;
  assert.deepEqual([c55.rappel.successes, c55.rappel.n], [6, 6], "0,55 compte le cas à 0,55 : >= est la règle");
  assert.equal(c55.pourMille, undefined, "sans volume, la colonne n'existe pas");
});

test("le volume rend les alertes pour mille comptes ; les paliers absents sont dits, pas devinés", () => {
  const m = mesureDe([0.9, 0.9, 0.9, 0.9, 0.9, 0.9], 24, { volume: 10_000 });
  const c85 = m.paliers.amount!.cellules.find((c) => c.seuil === 0.85)!;
  assert.equal(c85.pourMille, (c85.tirees / 10_000) * 1000);
  assert.ok(m.absents.includes("structuring") && m.absents.includes("peer"));
  assert.match(rendreRapport(m), /absent from the registry/);
});

test("la période vient des decided_at lisibles, les illisibles comptés", () => {
  const p = periodeDe([
    { id: "1", compte: "", finFenetre: "", disposition: "benign", decideeLe: "2026-01-10" },
    { id: "2", compte: "", finFenetre: "", disposition: "benign", decideeLe: "2026-02-09" },
    { id: "3", compte: "", finFenetre: "", disposition: "benign", decideeLe: "n-importe-quoi" },
  ] as Alerte[])!;
  assert.deepEqual([p.from, p.to, p.jours, p.illisibles], ["2026-01-10", "2026-02-09", 30, 1]);
  assert.equal(periodeDe([{ id: "1", compte: "", finFenetre: "", disposition: "benign" } as Alerte]), null);
});

test("--volume se lit strictement : le motif refuse ce que Number() avalerait", () => {
  assert.equal(lireVolume("100000"), 100_000);
  for (const brut of ["", "0", "1e3", "0x50", "12.5", "-3"]) {
    assert.throws(() => lireVolume(brut), /not a number of accounts/, `« ${brut} » doit être refusé`);
  }
});

/* ─── les trois zones du rappel ─── */

test("les zones du rappel : 4 suspects pas cités, 6 cités avec la note, 25 cités sans elle", () => {
  const rendu = (n: number) => rendreRapport(mesureDe(Array(n).fill(0.9), 30));
  const r4 = rendu(4);
  assert.match(r4, new RegExp(TROP_PEU_DE_SUSPECTS));
  const r6 = rendu(6);
  assert.match(r6, /100\.0 % \| \[61–100\]/, "6 suspects : cités avec l'intervalle");
  assert.match(r6, new RegExp(NOTE_PETIT_N));
  const r25 = rendu(25);
  assert.match(r25, /100\.0 % \| \[87–100\]/, "25 : cités");
  assert.doesNotMatch(r25, new RegExp(NOTE_PETIT_N), "sans la note : n est au régime général");
});

/* ─── never a value, avec témoin ─── */

test("le relevé et le rapport ne portent AUCUNE valeur du client, et le détecteur sait voir", () => {
  const SENTINELLES = ["ACC-SENTINELLE-77", "424242.42", "2026-08-21T13:37:00Z", "KY"];
  const d = mkdtempSync(join(tmpdir(), "lapis-"));
  const cheminA = join(d, "alertes.csv");
  const cheminT = join(d, "tx.csv");
  const a = [ENTETE_A]; const t = [ENTETE_T + ",counterparty_country"];
  for (let i = 0; i < 30; i++) {
    const compte = `${SENTINELLES[0]}-${i}`;
    a.push(`al-${i},${compte},2026-08-30,${i < 6 ? "suspicious" : "benign"}`);
    t.push(`${compte},${SENTINELLES[2]},${SENTINELLES[1]},in,cash,${SENTINELLES[3]}`);
  }
  writeFileSync(cheminA, a.join("\n") + "\n");
  writeFileSync(cheminT, t.join("\n") + "\n");
  const { cheminMd, cheminJson, mesure } = executer(cheminA, cheminT, registreFactice(), null);
  for (const fichier of [cheminMd, cheminJson]) {
    const emis = readFileSync(fichier, "utf8");
    for (const s of SENTINELLES) {
      assert.ok(!emis.includes(s),
        `« ${s} » sort du fichier du client vers ${fichier} : « never a value » vient de devenir faux.`);
    }
    assert.ok(!emis.includes(d), "le chemin absolu ne sort pas non plus : basename seul");
  }
  /* CONTRE-ÉPREUVE : la recherche sait trouver — un émis fabriqué qui fuit est vu. */
  assert.ok(JSON.stringify({ fuite: SENTINELLES[0] }).includes(SENTINELLES[0]!));
  assert.equal(mesure.verdicts["al-0"]!.disposition, "suspicious");
  assert.deepEqual(Object.keys(mesure.verdicts["al-0"]!).sort(), ["disposition", "sansHistorique"],
    "a verdict holds the disposition and the history flag, never a score");
});

/* ─── le scellé ─── */

test("le relevé est scellable, et une retouche le fait mentir", () => {
  const m = mesureDe([0.9, 0.9, 0.9, 0.9, 0.9, 0.9], 24);
  m.empreinte = empreinteDuReleve(m);
  assert.ok(scelleIntact(m as unknown as Record<string, unknown>));
  const copie = JSON.parse(JSON.stringify(m)) as typeof m;
  copie.source.suspicious = 25;
  assert.ok(!scelleIntact(copie as unknown as Record<string, unknown>));
});

test("le relevé photographie les échelles sous lesquelles il a été mesuré", () => {
  const m = mesureDe([0.9, 0.9, 0.9, 0.9, 0.9, 0.9], 24);
  assert.deepEqual(m.echelles, ECHELLES, "les changer change les scores : elles voyagent scellées");
});

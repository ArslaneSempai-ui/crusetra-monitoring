/**
 * LA MESURE PUBLIQUE DU BLEU — celle que NOUS publions, sans aucune donnée client.
 *
 * Aucune vraie transaction bancaire n'est publique, et ce relevé le DIT en toutes lettres :
 * ce qui est mesuré ici est écrit et généré. Deux moitiés, tenues À PART et jamais
 * fusionnées :
 *
 *   — les cas ÉCRITS par nous (`src/cas-etiquetes.json`, lot L2), déclarés `authored` :
 *     des archétypes de suspicion ET leurs sosies bénins — la valeur du jeu tient aux
 *     sosies, une paie ressemble à un passage rapide vue de loin ;
 *   — les variantes GÉNÉRÉES à graine (`synthetic.ts`, lot L2), déclarées `synthetic` :
 *     montants et dates gigués, structure préservée, graine fixe écrite ici.
 *
 * Deux verdicts par cellule (scénario × seuil) : le RAPPEL sur les cas `suspicious` et le
 * taux de FAUSSES ALERTES sur les cas `benign`, toujours avec n et l'intervalle de Wilson.
 * Le relevé photographie aussi les ÉCHELLES sous lesquelles il a été mesuré : les changer
 * change les scores, donc elles font partie du chiffre.
 *
 * Le relevé va À LA RACINE, scellé (`releve-public.json` + `RELEVE-PUBLIC.md`) ; le
 * réécrire demande `--yes-overwrite`. Les absents du registre sont DÉRIVÉS, jamais récités
 * (la leçon du lot E du rouge, payée une fois).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { isMain, refuserDrapeauxInconnus } from "./cli.ts";
import { registre as registreDesScenarios } from "./scenarios/index.ts";
import { SEUILS, PALIERS, exigerScore, type Registre, type Echelles } from "./scenario.ts";
import { rate, type Rate } from "./interval.ts";
import { empreinteDuReleve, scelleIntact } from "./empreinte.ts";
import { chargerCasEtiquetes, jeuSynthetique, NATURES_SUSPECTES, type CasEtiquete } from "./synthetic.ts";
import { ASSUMPTIONS, ECHELLES } from "./assumptions.ts";
import { meilleureSousRappel, type CellulePlacee } from "./optimise.ts";

/** La graine de la moitié synthétique, et son ampleur : écrites ici pour que deux
 *  lancements du même arbre scellent le MÊME relevé (le déterminisme est un témoin). */
export const GRAINE_PUBLIQUE = 20_260_907;
export const VARIANTES_PAR_CAS = 3;

/** Le minimum de cas PAR disposition (contrat §4) : en dessous, le jeu ne borne rien. */
export const ASSEZ_PAR_DISPOSITION = 40;

export const estSuspect = (c: CasEtiquete): boolean =>
  (NATURES_SUSPECTES as readonly string[]).includes(c.nature);

/** Une cellule du relevé : le taux avec tout ce qu'il faut pour le relire. */
export type Cellule = { succes: number; n: number; taux: number; bas: number; haut: number };
const cellule = (r: Rate): Cellule =>
  ({ succes: r.successes, n: r.n, taux: r.rate, bas: r.low, haut: r.high });

export type TableDUnScenario = Record<string, { rappel: Cellule; fauxPositifs: Cellule }>;

/**
 * La mesure elle-même : chaque scénario note chaque cas UNE fois (le score passe par
 * `exigerScore` : un scénario qui sort de [0, 1] est un défaut nommé, pas une donnée), la
 * grille de seuils relit les scores. Pure — le registre, les cas et les échelles entrent,
 * la table sort — pour qu'un témoin puisse la nourrir d'un scénario scripté et refaire
 * l'arithmétique à la main.
 */
export function mesurerCas(
  r: Registre, cas: readonly CasEtiquete[], echelles: Echelles,
): Record<string, TableDUnScenario> {
  const sortie: Record<string, TableDUnScenario> = {};
  for (const [id, s] of r) {
    const notes = cas.map((c) => ({ suspect: estSuspect(c), score: exigerScore(s.score(c, echelles), id, c) }));
    const suspects = notes.filter((x) => x.suspect);
    const benins = notes.filter((x) => !x.suspect);
    const table: TableDUnScenario = {};
    for (const seuil of SEUILS) {
      table[seuil.toFixed(2)] = {
        rappel: cellule(rate(suspects.filter((x) => x.score >= seuil).length, suspects.length)),
        fauxPositifs: cellule(rate(benins.filter((x) => x.score >= seuil).length, benins.length)),
      };
    }
    sortie[id] = table;
  }
  return sortie;
}

export type MoitiePublique = {
  provenance: string;
  nSuspicious: number;
  nBenign: number;
  natures?: Record<string, number>;
  tables: Record<string, TableDUnScenario>;
};

export type MesurePublique = {
  version: 1;
  date: string;
  commit: string;
  paliers: { presents: string[]; absents: string[] };
  authored: MoitiePublique & { natures: Record<string, number> };
  synthetic: MoitiePublique;
  /** la photo des échelles SOUS LESQUELLES ce relevé a été mesuré : les changer change les scores */
  echelles: Echelles;
  empreinte?: string;
};

/** La phrase du contrat, en toutes lettres, dans les DEUX provenances et dans le md. */
export const PHRASE_PROVENANCE = "no real transaction is public: written and generated, and it says so";

/**
 * Le jeu d'une moitié, validé avant toute mesure : assez de cas de CHAQUE disposition, et
 * pas de fuite d'une moitié dans l'autre. La convention d'identifiant des variantes est
 * celle du message de livraison du lot L2 (`<id>~v<n>`) : un cas écrit qui la porte, ou
 * une variante qui ne la porte pas, est le symptôme d'un jeu fusionné — le refus le nomme.
 */
export function validerMoitie(cas: readonly CasEtiquete[], moitie: "authored" | "synthetic"): void {
  const nSuspects = cas.filter(estSuspect).length;
  const nBenins = cas.length - nSuspects;
  if (nSuspects < ASSEZ_PAR_DISPOSITION || nBenins < ASSEZ_PAR_DISPOSITION) {
    throw new Error(`${moitie}: ${nSuspects} suspicious / ${nBenins} benign case(s): at least `
      + `${ASSEZ_PAR_DISPOSITION} of EACH.\n  Below that, a rate here bounds nothing, and the missing side is`
      + ` usually the benign look-alikes,\n  which are what the set is for.`);
  }
  const intrus = cas.filter((c) => (moitie === "authored") === c.id.includes("~v"));
  if (intrus.length > 0) {
    throw new Error(`${intrus.length} case(s) in the ${moitie} half carry the ${moitie === "authored" ? "" : "wrong "}variant marker "~v"`
      + ` (first: "${intrus[0]!.id}").\n  The two halves are measured APART and never merged: a merged set would launder a\n`
      + `  synthetic figure into an authored one. Nothing was measured.`);
  }
}

/**
 * Le relevé complet, PUR : les deux jeux, le registre, les échelles, la date et le commit
 * entrent ; le relevé sort, sans scellé (le scellé est le geste de la commande). Les
 * absents se DÉRIVENT du registre reçu — un témoin peut donc en retirer un scénario et
 * regarder la liste changer, sans toucher au code.
 */
export function construireReleve(
  ecrits: readonly CasEtiquete[], synthetiques: readonly CasEtiquete[],
  r: Registre, echelles: Echelles, date: string, commit: string,
): MesurePublique {
  validerMoitie(ecrits, "authored");
  validerMoitie(synthetiques, "synthetic");
  const natures: Record<string, number> = {};
  for (const c of ecrits) natures[c.nature] = (natures[c.nature] ?? 0) + 1;
  return {
    version: 1, date, commit,
    paliers: {
      presents: [...r.keys()],
      absents: PALIERS.filter((p) => !r.has(p)),
    },
    authored: {
      provenance: `written by hand in this repository: archetypes of suspicion and their benign look-alikes; ${PHRASE_PROVENANCE}`,
      nSuspicious: ecrits.filter(estSuspect).length,
      nBenign: ecrits.filter((c) => !estSuspect(c)).length,
      natures,
      tables: mesurerCas(r, ecrits, echelles),
    },
    synthetic: {
      provenance: `seeded variants of the authored cases (seed ${GRAINE_PUBLIQUE}, ${VARIANTES_PAR_CAS} per case), structure preserved; ${PHRASE_PROVENANCE}`,
      nSuspicious: synthetiques.filter(estSuspect).length,
      nBenign: synthetiques.filter((c) => !estSuspect(c)).length,
      tables: mesurerCas(r, synthetiques, echelles),
    },
    echelles,
  };
}

/**
 * La cellule que LA RÈGLE DE L'OUTIL retient sur la moitié écrite — la même règle que
 * `optimise` (meilleureSousRappel importée, pas restituée de mémoire) : borne basse du
 * rappel ≥ l'exigence, puis le moins de fausses alertes, puis le moins d'alertes levées,
 * puis le scénario le moins cher, puis le seuil le plus strict. Les Rate sont RECOMPOSÉS
 * par rate(succes, n) depuis les comptes bruts : la même recomposition que l'extracteur du
 * site exigera, exercée ici en premier.
 */
export function celluleRecommandee(
  m: MesurePublique, r: Registre, rappelMin: number = ASSUMPTIONS.recallFloor,
): CellulePlacee | null {
  const cellules: CellulePlacee[] = [];
  for (const [palier, table] of Object.entries(m.authored.tables)) {
    const rang = r.get(palier as (typeof PALIERS)[number])!.rang;
    for (const [seuil, c] of Object.entries(table)) {
      cellules.push({
        palier: palier as (typeof PALIERS)[number], rang, seuil: Number(seuil),
        tirees: c.rappel.succes + c.fauxPositifs.succes,
        rappel: rate(c.rappel.succes, c.rappel.n),
        faussesAlertes: rate(c.fauxPositifs.succes, c.fauxPositifs.n),
      });
    }
  }
  return meilleureSousRappel(cellules, rappelMin);
}

/* ─── le rapport lisible ─── */

/** Les seuils MONTRÉS dans le md ; la grille entière vit dans le json, et la ligne le dit. */
export const SEUILS_MONTRES = [0.50, 0.60, 0.70, 0.80, 0.85, 0.90, 0.95, 1.00] as const;

const pc = (c: Cellule) => `${(c.taux * 100).toFixed(0)}% [${(c.bas * 100).toFixed(0)}-${(c.haut * 100).toFixed(0)}]`;

function tableMd(tables: Record<string, TableDUnScenario>, quoi: "rappel" | "fauxPositifs"): string {
  const entete = `| scenario | ${SEUILS_MONTRES.map((s) => s.toFixed(2)).join(" | ")} |`;
  const barre = `|---|${SEUILS_MONTRES.map(() => "---").join("|")}|`;
  const lignes = Object.entries(tables).map(([id, t]) =>
    `| \`${id}\` | ${SEUILS_MONTRES.map((s) => pc(t[s.toFixed(2)]![quoi])).join(" | ")} |`);
  return [entete, barre, ...lignes].join("\n");
}

export function rapportMd(m: MesurePublique, recommandee: CellulePlacee | null): string {
  const l: string[] = [
    `# Crusetra Monitoring: the public measure`,
    ``,
    `**Provenance**: ${PHRASE_PROVENANCE}. Cases written by this repository (archetypes of`,
    `suspicion and their benign look-alikes) plus seeded, structure-preserving variants,`,
    `measured APART and never merged. Commit \`${m.commit}\`, ${m.date}. Sealed as`,
    `\`releve-public.json\`; every rate below carries its n and its 95 % Wilson interval, and`,
    `the FULL threshold grid (${SEUILS.length} steps) lives in the JSON; this page shows`,
    `${SEUILS_MONTRES.length} declared columns of it. The record also carries the declared scales it was`,
    `measured under (\`echelles\`): change a scale and the scores move with it.`,
    ``,
    `Scenarios measured: ${m.paliers.presents.map((p) => `\`${p}\``).join(", ")}.`
    + (m.paliers.absents.length
      ? ` **Not in tonight's registry: ${m.paliers.absents.map((p) => `\`${p}\``).join(", ")}**. Measured when it ships, absent rather than faked.`
      : ` An eighth, learned scenario is named ABSENT from day one: it will come or it will not, it will never be guessed.`),
    ``,
    `## Written cases (authored): ${m.authored.nSuspicious} suspicious, ${m.authored.nBenign} benign`,
    ``,
    `The set's value is its benign look-alikes: a payroll looks like rapid movement from afar.`,
    `Natures: ${Object.entries(m.authored.natures).map(([k, n]) => `${k} x${n}`).join(", ")}.`,
    ``,
    `### Recall on the suspicious cases (higher is safer)`,
    ``, tableMd(m.authored.tables, "rappel"), ``,
    `### False alerts on the benign look-alikes (every point is an analyst's minutes)`,
    ``, tableMd(m.authored.tables, "fauxPositifs"), ``,
    `## Generated variants (synthetic): ${m.synthetic.nSuspicious} suspicious, ${m.synthetic.nBenign} benign`,
    ``,
    `Seeded, declared, never merged with the written set.`,
    ``, `### Recall`, ``, tableMd(m.synthetic.tables, "rappel"), ``,
    `### False alerts`, ``, tableMd(m.synthetic.tables, "fauxPositifs"), ``,
    `## The cell the tool's own rule retains`,
    ``,
    recommandee
      ? `Under a recall LOWER BOUND of ${(ASSUMPTIONS.recallFloor * 100).toFixed(0)} % on the written cases, then fewest false`
        + ` alerts, then fewest alerts raised, then the cheaper scenario, then the stricter threshold:`
        + ` \`${recommandee.palier}\` at threshold ${recommandee.seuil.toFixed(2)}; recall ${pc(cellule(recommandee.rappel))},`
        + ` false alerts ${pc(cellule(recommandee.faussesAlertes))}. The rule is \`optimise\`'s, imported, not restated.`
      : `No cell holds a recall lower bound of ${(ASSUMPTIONS.recallFloor * 100).toFixed(0)} % on the written cases: said, not hidden.`,
    ``,
    `Generated by \`npm run measure\`; a sealed record refuses silent overwrite.`,
    ``,
  ];
  return l.join("\n");
}

/* ─── la commande ─── */

/**
 * Le droit d'écraser, SORTI de la commande pour porter ses témoins : un relevé scellé
 * intact ne se réécrit que si `--yes-overwrite` est écrit dans la commande ; un relevé
 * absent, ou déjà abîmé, se réécrit sans cérémonie — il n'est pas publié, ou plus fiable.
 */
export function exigerDroitDEcraser(cheminJson: string, argv: readonly string[]): void {
  if (!existsSync(cheminJson)) return;
  const existant = JSON.parse(readFileSync(cheminJson, "utf8")) as Record<string, unknown>;
  if (scelleIntact(existant) && !argv.includes("--yes-overwrite")) {
    throw new Error(`releve-public.json exists, sealed and intact: it is the PUBLISHED record.\n`
      + `  A published figure does not move because a command was re-run by accident.\n`
      + `  To remeasure and replace it, say so: npm run measure -- --yes-overwrite`);
  }
}

async function principal(): Promise<void> {
  refuserDrapeauxInconnus(["--yes-overwrite"]);
  const racine = fileURLToPath(new URL("..", import.meta.url));
  const cheminJson = racine + "releve-public.json";
  exigerDroitDEcraser(cheminJson, process.argv);
  const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: racine, encoding: "utf8" }).trim();
  const ecrits = chargerCasEtiquetes();
  const synthetiques = jeuSynthetique(ecrits, GRAINE_PUBLIQUE, VARIANTES_PAR_CAS);
  const r = registreDesScenarios();
  const m = construireReleve(ecrits, synthetiques, r, ECHELLES, new Date().toISOString().slice(0, 10), commit);
  m.empreinte = empreinteDuReleve(m);
  const recommandee = celluleRecommandee(m, r);
  writeFileSync(cheminJson, JSON.stringify(m, null, 1) + "\n");
  writeFileSync(racine + "RELEVE-PUBLIC.md", rapportMd(m, recommandee));
  console.log(`releve-public.json written and sealed (${m.empreinte}); RELEVE-PUBLIC.md alongside.`);
  console.log(`authored: ${m.authored.nSuspicious} suspicious / ${m.authored.nBenign} benign; `
    + `synthetic: ${m.synthetic.nSuspicious} / ${m.synthetic.nBenign}. scenarios: ${m.paliers.presents.join(", ")}`
    + (m.paliers.absents.length ? `. absent: ${m.paliers.absents.join(", ")}` : ""));
  console.log(recommandee
    ? `recommended under recall lower bound >= ${ASSUMPTIONS.recallFloor}: ${recommandee.palier} at ${recommandee.seuil.toFixed(2)}.`
    : `no cell holds the recall floor of ${ASSUMPTIONS.recallFloor} at the lower bound: said, not hidden.`);
}

if (isMain(import.meta)) {
  try {
    await principal();
  } catch (e) {
    console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  }
}

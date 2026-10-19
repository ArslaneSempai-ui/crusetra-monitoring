/**
 * Les variantes SYNTHÉTIQUES des cas écrits : la moitié `synthetic` du relevé public lapis.
 *
 * Le contrat (§4) : des variantes à graine des cas écrits — montants et dates gigués,
 * échelle, nombre — déclarées `synthetic`, réparties sur toutes les natures, jamais
 * fusionnées aux cas écrits. Déterministe : graine explicite, et la graine de chaque cas
 * DÉRIVE de son identifiant — retirer un cas ne recompose pas les variantes des autres
 * (la leçon du rouge, gardée).
 *
 * ─── LE GIGAGE PRÉSERVE LA NATURE, ET C'EST LA SEULE RÈGLE QUI COMPTE ───
 *
 * Un gigage aveugle DÉFAIT le motif qu'il prétend varier, et le rappel synthétique mesuré
 * dessus serait un chiffre sur rien :
 *
 *   structuring      un dépôt à 9 900 gigué de +10 % passe à 10 890 : AU-DESSUS du seuil
 *                    de déclaration, le cas n'est plus une structuration. Les dépôts en
 *                    espèces d'un cas de structuration restent bornés sous le seuil.
 *   round-tripping   « le même montant part et revient » : deux gigages indépendants
 *                    cassent l'égalité. Un FACTEUR COMMUN à tout le cas la préserve.
 *   loan-repayment   la même échéance AU CENTIME chaque mois : même règle, facteur commun.
 *   savings-transfer le montant est ROND (500, 800, 1000) : après le facteur, chaque
 *                    montant rond d'origine est rarrondi au multiple de 50.
 *
 * Tout le reste se gigue librement : ±10 % par transaction, ±4 h par horodatage (l'ordre
 * est retrié), la fenêtre entière glisse de quelques jours, et l'échelle du cas bouge.
 */
import { readFileSync } from "node:fs";
import { cheminPrive, jeuPresent, JeuPriveAbsent } from "./jeux.ts";
import { exigerCas, type Cas, type Transaction } from "./cas.ts";

export const NATURES_SUSPECTES = [
  "structuring", "rapid-movement", "dormant-burst", "round-tripping", "cash-intensive", "layering-fan-out",
] as const;
export const NATURES_BENIGNES = [
  "payroll", "seasonal-trade", "loan-repayment", "rent-collection", "savings-transfer", "one-off-purchase",
] as const;
export type NatureCas = (typeof NATURES_SUSPECTES)[number] | (typeof NATURES_BENIGNES)[number];

export type CasEtiquete = Cas & { nature: NatureCas; raison: string };

/** Le générateur : même forme que le rouge et cascade-routing (`draw`), graine explicite. */
export function tirage(graine: number): () => number {
  let etat = graine >>> 0;
  return () => {
    etat = (etat * 1_664_525 + 1_013_904_223) >>> 0;
    return etat / 4_294_967_296;
  };
}

/** Le seuil de déclaration que la structuration évite : celui des cas écrits. */
export const SEUIL_DECLARATION = 10_000;

/* Comment les montants d'une nature se gigent : librement, par facteur commun (les motifs
   d'égalité), ou par facteur commun rarrondi (les montants ronds). */
const MODE_MONTANTS: Partial<Record<NatureCas, "facteur-commun" | "facteur-rond">> = {
  "round-tripping": "facteur-commun",
  "loan-repayment": "facteur-commun",
  "savings-transfer": "facteur-rond",
};

const eur = (x: number): number => Math.round(x * 100) / 100;

/** The full authored set is private: see jeux.ts. Its public sample is echantillons/cas-20.json. */
export const CAS_PRIVES = "src/cas-etiquetes.json";

/** Les cas écrits, relus depuis le fichier et revalidés un par un : la couture de L4. */
export function chargerCasEtiquetes(): CasEtiquete[] {
  if (!jeuPresent(CAS_PRIVES)) throw new JeuPriveAbsent(CAS_PRIVES);
  const chemin = cheminPrive(CAS_PRIVES);
  const brut = JSON.parse(readFileSync(chemin, "utf8")) as { cas: CasEtiquete[] };
  const toutes = new Set<string>([...NATURES_SUSPECTES, ...NATURES_BENIGNES]);
  for (const c of brut.cas) {
    exigerCas(c);
    if (!toutes.has(c.nature)) throw new Error(`case "${c.id}": unknown nature "${c.nature}"`);
    if (!c.raison || !c.raison.trim()) throw new Error(`case "${c.id}" carries no raison`);
  }
  return brut.cas;
}

function giguerDate(ts: string, decalageJours: number, r: () => number, borne = 4): string {
  const d = new Date(ts);
  d.setUTCDate(d.getUTCDate() + decalageJours);
  d.setUTCMinutes(d.getUTCMinutes() + Math.round((r() * 2 - 1) * borne * 60));
  return d.toISOString().replace(".000Z", "Z");
}

/**
 * `n` variantes d'un cas écrit, déterministes à graine donnée, nature conservée.
 *
 * Chaque variante : un facteur d'échelle (×0,7 à ×1,5), un glissement de fenêtre (−10 à
 * +10 jours), puis les gigages par transaction que la nature AUTORISE (voir MODE_MONTANTS).
 * Les listes restent triées, les montants positifs, `exigerCas` repasse sur chaque
 * variante avant qu'elle sorte — une variante mal formée est un défaut d'ici, pas une
 * donnée pour la mesure.
 */
export function variantes(cas: CasEtiquete, graine: number, n: number): CasEtiquete[] {
  const resultat: CasEtiquete[] = [];
  for (let v = 0; v < n; v++) {
    const r = tirage((graine ^ (v * 2_654_435_761)) >>> 0);
    const echelle = 0.7 + r() * 0.8;
    const glissement = Math.round(r() * 20) - 10;
    const mode = MODE_MONTANTS[cas.nature];
    const facteurCommun = echelle * (0.9 + r() * 0.2);

    const giguerMontant = (t: Transaction): number => {
      if (mode === "facteur-commun") return eur(t.amount * facteurCommun);
      if (mode === "facteur-rond") {
        /* Un montant rond (multiple de 50) le reste ; le tout-venant se gigue librement. */
        if (t.amount % 50 === 0) return Math.max(50, Math.round((t.amount * facteurCommun) / 50) * 50);
        return eur(t.amount * echelle * (0.9 + r() * 0.2));
      }
      let m = t.amount * echelle * (0.9 + r() * 0.2);
      /* La structuration reste une structuration : un dépôt en espèces écrit sous le seuil
         de déclaration ne le franchit jamais en gigant. */
      if (cas.nature === "structuring" && t.channel === "cash" && t.direction === "in"
        && t.amount < SEUIL_DECLARATION) {
        m = Math.min(m, SEUIL_DECLARATION - 60);
      }
      return eur(Math.max(m, 1));
    };
    const giguer = (l: Transaction[]): Transaction[] => l
      .map((t) => ({ ...t, ts: giguerDate(t.ts, glissement, r), amount: giguerMontant(t) }))
      .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

    const finGlissee = new Date(cas.finFenetre + "T00:00:00Z");
    finGlissee.setUTCDate(finGlissee.getUTCDate() + glissement);

    const variante: CasEtiquete = {
      id: `${cas.id}~v${v + 1}`,
      finFenetre: finGlissee.toISOString().slice(0, 10),
      fenetre: giguer(cas.fenetre),
      historique: giguer(cas.historique),
      nature: cas.nature,
      raison: `synthetic variant of ${cas.id}: amounts and dates jittered, window slid, structure kept`,
    };
    exigerCas(variante);
    resultat.push(variante);
  }
  return resultat;
}

/**
 * Le jeu synthétique complet : `parCas` variantes de chaque cas écrit, toutes natures
 * couvertes dès que l'entrée les couvre. La graine de chaque cas dérive de la graine
 * globale ET de son identifiant : retirer un cas laisse les variantes des autres
 * STRICTEMENT identiques.
 */
export function jeuSynthetique(
  cases: readonly CasEtiquete[], graine: number, parCas = 3,
): CasEtiquete[] {
  const jeu: CasEtiquete[] = [];
  for (const c of cases) {
    let h = graine >>> 0;
    for (const ch of c.id) h = ((h * 31) + ch.codePointAt(0)!) >>> 0;
    jeu.push(...variantes(c, h, parCas));
  }
  return jeu;
}

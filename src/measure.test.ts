/**
 * LA MESURE PUBLIQUE, ÉPROUVÉE — l'arithmétique refaite à la main, les absents DÉRIVÉS,
 * les deux moitiés jamais fusionnées, le scellé qui refuse la retouche.
 *
 * Les témoins nourrissent les fonctions PURES (mesurerCas, construireReleve) de scénarios
 * scriptés et de cas écrits ICI : la grille se recompose au crayon, et un registre amputé
 * fait bouger la liste des absents sans toucher au code — c'est la définition de « dérivé ».
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PALIERS, type Registre, type Scenario, type Echelles } from "./scenario.ts";
import { exigerCas } from "./cas.ts";
import { registre } from "./scenarios/index.ts";
import { chargerCasEtiquetes, jeuSynthetique, CAS_PRIVES, type CasEtiquete } from "./synthetic.ts";
import { jeuPresent, raisonAbsent } from "./jeux.ts";
import { empreinteDuReleve, scelleIntact } from "./empreinte.ts";
import { ECHELLES } from "./assumptions.ts";
import {
  ASSEZ_PAR_DISPOSITION, GRAINE_PUBLIQUE, VARIANTES_PAR_CAS, PHRASE_PROVENANCE,
  celluleRecommandee, construireReleve, estSuspect, exigerDroitDEcraser, mesurerCas,
} from "./measure.ts";

/** Un scénario scripté : le score est lu dans une table par identifiant de cas. */
const scripte = (id: (typeof PALIERS)[number], rang: number, notes: Record<string, number>): Scenario => ({
  id, rang, description: `scripted witness scenario ${id}`, echellesLues: [],
  score: (c) => notes[c.id] ?? 0,
});

/** Un cas minimal : une transaction, la nature demandée. */
const casMinimal = (id: string, nature: CasEtiquete["nature"]): CasEtiquete => ({
  ...exigerCas({
    id, finFenetre: "2026-06-30",
    fenetre: [{ ts: "2026-06-10T09:00:00Z", amount: 100, direction: "in", channel: "transfer" }],
    historique: [],
  }), nature, raison: "hand-written witness case",
});

/** Un jeu assez grand pour passer la validation : `assez` suspects et `assez` bénins. */
function jeuTemoin(assez = ASSEZ_PAR_DISPOSITION, marque = ""): CasEtiquete[] {
  return [
    ...Array.from({ length: assez }, (_, i) => casMinimal(`s-${i}${marque}`, "structuring")),
    ...Array.from({ length: assez }, (_, i) => casMinimal(`b-${i}${marque}`, "payroll")),
  ];
}

test("mesurerCas : l'arithmétique d'une cellule se refait au crayon", () => {
  const cas = [
    casMinimal("s-a", "structuring"), casMinimal("s-b", "rapid-movement"),
    casMinimal("b-a", "payroll"), casMinimal("b-b", "payroll"), casMinimal("b-c", "rent-collection"),
  ];
  const r: Registre = new Map([["amount", scripte("amount", 1, { "s-a": 0.9, "s-b": 0.6, "b-a": 0.55, "b-b": 0.1, "b-c": 0.95 })]]);
  const t = mesurerCas(r, cas, ECHELLES)["amount"]!;
  /* Au seuil 0,60 : les deux suspects tirent (0,9 et 0,6 >= 0,60) ; un bénin sur trois. */
  assert.deepEqual({ succes: t["0.60"]!.rappel.succes, n: t["0.60"]!.rappel.n }, { succes: 2, n: 2 });
  assert.deepEqual({ succes: t["0.60"]!.fauxPositifs.succes, n: t["0.60"]!.fauxPositifs.n }, { succes: 1, n: 3 });
  /* Au seuil 0,95 : plus aucun suspect, le bénin à 0,95 tire encore (>= est la règle). */
  assert.equal(t["0.95"]!.rappel.succes, 0);
  assert.equal(t["0.95"]!.fauxPositifs.succes, 1);
  assert.equal(Object.keys(t).length, 51, "la grille entière, pas un échantillon");
  /* Le rappel ne peut que baisser quand le seuil monte : la grille est cohérente. */
  let precedent = Number.POSITIVE_INFINITY;
  for (const seuil of Object.keys(t)) {
    assert.ok(t[seuil]!.rappel.succes <= precedent, `rappel remonte au seuil ${seuil}`);
    precedent = t[seuil]!.rappel.succes;
  }
});

test("les absents sont DÉRIVÉS : amputer le registre change la liste, sans toucher au code", () => {
  const deux: Registre = new Map([
    ["amount", scripte("amount", 1, {})], ["peer", scripte("peer", 7, {})],
  ]);
  const m = construireReleve(jeuTemoin(), jeuTemoin(1, "~v1").slice(0, 0).concat(
    jeuTemoin(ASSEZ_PAR_DISPOSITION).map((c) => ({ ...c, id: `${c.id}~v1` }))), deux, ECHELLES, "2026-09-07", "temoin");
  assert.deepEqual(m.paliers.presents, ["amount", "peer"]);
  assert.deepEqual(m.paliers.absents, PALIERS.filter((p) => p !== "amount" && p !== "peer"));
  const complet = construireReleve(jeuTemoin(), jeuTemoin(ASSEZ_PAR_DISPOSITION).map((c) => ({ ...c, id: `${c.id}~v1` })),
    registre(), ECHELLES, "2026-09-07", "temoin");
  assert.deepEqual(complet.paliers.absents, [], "le registre du lot L1 est complet : aucun absent");
});

test("les deux moitiés ne se fusionnent JAMAIS : l'une ne pèse pas dans les tables de l'autre", () => {
  const r: Registre = new Map([["amount", scripte("amount", 1, {})]]);
  const ecrits = jeuTemoin();
  const varianteBruyante = jeuTemoin(ASSEZ_PAR_DISPOSITION).map((c) => ({ ...c, id: `${c.id}~v1` }));
  const seul = mesurerCas(r, ecrits, ECHELLES);
  const m = construireReleve(ecrits, varianteBruyante, r, ECHELLES, "2026-09-07", "temoin");
  assert.deepEqual(m.authored.tables, seul,
    "la table authored doit être IDENTIQUE avec ou sans moitié synthétique à côté");
  assert.equal(m.authored.nSuspicious, ASSEZ_PAR_DISPOSITION);
  assert.equal(m.synthetic.nSuspicious, ASSEZ_PAR_DISPOSITION);
  /* Et le mélange se REFUSE en le nommant, dans les deux sens. */
  assert.throws(() => construireReleve([...ecrits, varianteBruyante[0]!], varianteBruyante, r, ECHELLES, "d", "c"),
    /never merged/, "une variante glissée dans les cas écrits doit être nommée");
  assert.throws(() => construireReleve(ecrits, [...varianteBruyante, ecrits[0]!], r, ECHELLES, "d", "c"),
    /never merged/, "un cas écrit glissé dans les variantes aussi");
});

test("moins de quarante cas d'une disposition : refus qui dit quoi corriger", () => {
  const r: Registre = new Map([["amount", scripte("amount", 1, {})]]);
  const maigre = jeuTemoin().filter((c) => estSuspect(c)).slice(0, ASSEZ_PAR_DISPOSITION - 1)
    .concat(jeuTemoin().filter((c) => !estSuspect(c)));
  assert.throws(() => construireReleve(maigre, jeuTemoin().map((c) => ({ ...c, id: `${c.id}~v1` })), r, ECHELLES, "d", "c"),
    new RegExp(`at least ${ASSEZ_PAR_DISPOSITION} of EACH`));
});

test("le scellé refuse la retouche : un chiffre bougé fait mentir l'empreinte", () => {
  const r: Registre = new Map([["amount", scripte("amount", 1, {})]]);
  const m = construireReleve(jeuTemoin(), jeuTemoin().map((c) => ({ ...c, id: `${c.id}~v1` })), r, ECHELLES, "2026-09-07", "temoin");
  m.empreinte = empreinteDuReleve(m);
  assert.equal(scelleIntact(m as unknown as Record<string, unknown>), true);
  const retouche = JSON.parse(JSON.stringify(m)) as typeof m;
  retouche.authored.tables["amount"]!["0.50"]!.rappel.succes += 1;
  assert.equal(scelleIntact(retouche as unknown as Record<string, unknown>), false,
    "un succès de plus dans une seule cellule doit suffire à casser le scellé");
});

test("la moitié synthétique est déterministe : même graine, même empreinte de tables",
  { skip: jeuPresent(CAS_PRIVES) ? false : raisonAbsent(CAS_PRIVES) }, () => {
  const ecrits = chargerCasEtiquetes();
  const a = jeuSynthetique(ecrits, GRAINE_PUBLIQUE, VARIANTES_PAR_CAS);
  const b = jeuSynthetique(ecrits, GRAINE_PUBLIQUE, VARIANTES_PAR_CAS);
  assert.equal(empreinteDuReleve(a), empreinteDuReleve(b),
    "deux lancements du même arbre doivent sceller le MÊME relevé");
  assert.equal(a.length, ecrits.length * VARIANTES_PAR_CAS);
});

test("l'écrasement d'un relevé scellé exige le drapeau ; un relevé abîmé se réécrit sans cérémonie", () => {
  const dossier = mkdtempSync(join(tmpdir(), "lapis-releve-"));
  try {
    const chemin = join(dossier, "releve-public.json");
    assert.doesNotThrow(() => exigerDroitDEcraser(chemin, []), "absent : rien à protéger");
    const releve: Record<string, unknown> = { version: 1, valeur: 42 };
    releve.empreinte = empreinteDuReleve(releve);
    writeFileSync(chemin, JSON.stringify(releve));
    assert.throws(() => exigerDroitDEcraser(chemin, []), /--yes-overwrite/);
    assert.doesNotThrow(() => exigerDroitDEcraser(chemin, ["--yes-overwrite"]));
    releve.valeur = 43;   /* la retouche casse le scellé : plus rien à protéger */
    writeFileSync(chemin, JSON.stringify(releve));
    assert.doesNotThrow(() => exigerDroitDEcraser(chemin, []));
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});

test("la cellule recommandée applique la règle de l'outil : borne basse d'abord, puis le moins de fausses alertes", () => {
  /* Deux scénarios scriptés : `amount` traîne UN bénin au-dessus de tous ses suspects
     (0,99 contre 0,96 : aucun seuil ne garde le rappel sans lui) ; `peer` sépare
     parfaitement mais coûte plus cher (rang 7). La règle doit préférer peer (zéro fausse
     alerte) malgré son rang : le coût d'analyste passe avant le coût machine. */
  const notes: Record<string, number> = {};
  const cas = jeuTemoin();
  for (const c of cas) notes[c.id] = estSuspect(c) ? 0.96 : (c.id === "b-0" ? 0.99 : 0.2);
  const parfait: Record<string, number> = {};
  for (const c of cas) parfait[c.id] = estSuspect(c) ? 0.96 : 0.2;
  const r: Registre = new Map([
    ["amount", scripte("amount", 1, notes)], ["peer", scripte("peer", 7, parfait)],
  ]);
  const m = construireReleve(cas, cas.map((c) => ({ ...c, id: `${c.id}~v1` })), r, ECHELLES, "2026-09-07", "temoin");
  const choix = celluleRecommandee(m, r, 0.8);
  assert.ok(choix, "quarante suspects à 96 % : une cellule tient une borne basse de 0,8");
  assert.equal(choix.palier, "peer", "zéro fausse alerte doit battre le rang moins cher");
  assert.equal(choix.faussesAlertes.successes, 0);
  /* Et une exigence que rien ne tient rend null, jamais une cellule par défaut. */
  assert.equal(celluleRecommandee(m, r, 0.999), null);
});

test("le relevé public porte la phrase de provenance en toutes lettres, dans les deux moitiés", () => {
  const r: Registre = new Map([["amount", scripte("amount", 1, {})]]);
  const m = construireReleve(jeuTemoin(), jeuTemoin().map((c) => ({ ...c, id: `${c.id}~v1` })), r, ECHELLES, "2026-09-07", "temoin");
  assert.ok(m.authored.provenance.includes(PHRASE_PROVENANCE));
  assert.ok(m.synthetic.provenance.includes(PHRASE_PROVENANCE));
  assert.deepEqual(m.echelles, ECHELLES, "la photo des échelles voyage avec le relevé");
});

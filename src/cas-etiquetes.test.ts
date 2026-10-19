import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chargerCasEtiquetes, variantes, jeuSynthetique, tirage,
  NATURES_SUSPECTES, NATURES_BENIGNES, SEUIL_DECLARATION, CAS_PRIVES, type CasEtiquete,
} from "./synthetic.ts";
import { jeuPresent, raisonAbsent } from "./jeux.ts";
import { exigerCas, JOURS_FENETRE } from "./cas.ts";

/** The full set is private: without it these cases skip with a named reason. */
const SKIP = jeuPresent(CAS_PRIVES) ? false : raisonAbsent(CAS_PRIVES);
const cas = SKIP ? [] : chargerCasEtiquetes();

test("au moins 40 suspects et 40 bénins, chaque nature du contrat présente, identifiants uniques", { skip: SKIP }, () => {
  const suspects = cas.filter((c) => (NATURES_SUSPECTES as readonly string[]).includes(c.nature));
  const benins = cas.filter((c) => (NATURES_BENIGNES as readonly string[]).includes(c.nature));
  assert.ok(suspects.length >= 40, `${suspects.length} suspect(s) : le contrat en demande 40`);
  assert.ok(benins.length >= 40, `${benins.length} bénin(s) : le contrat en demande 40`);
  assert.equal(suspects.length + benins.length, cas.length, "aucun cas d'une nature hors contrat");
  const presentes = new Set(cas.map((c) => c.nature));
  for (const n of [...NATURES_SUSPECTES, ...NATURES_BENIGNES]) {
    assert.ok(presentes.has(n), `nature absente du jeu écrit : ${n}`);
  }
  assert.equal(new Set(cas.map((c) => c.id)).size, cas.length, "identifiants en double");
});

test("chaque cas écrit passe exigerCas, porte une raison d'une phrase, et sa fenêtre tient dans les trente jours", { skip: SKIP }, () => {
  for (const c of cas) {
    exigerCas(c);
    assert.ok(c.raison.trim().length > 20, `raison trop courte pour ${c.id}`);
    assert.ok(!c.raison.includes("—"), `cadratin dans la raison de ${c.id}`);
    const fin = Date.parse(c.finFenetre + "T23:59:59Z");
    const debut = fin - JOURS_FENETRE * 86_400_000;
    for (const t of c.fenetre) {
      const ts = Date.parse(t.ts);
      assert.ok(ts <= fin && ts >= debut, `${c.id}: transaction de fenêtre hors des trente jours`);
    }
    for (const t of c.historique) {
      assert.ok(Date.parse(t.ts) < debut, `${c.id}: transaction d'historique dans la fenêtre`);
    }
  }
});

test("les sosies sont structurellement des sosies : l'historique porte la différence", { skip: SKIP }, () => {
  /* Le jeu vaut par ses sosies (contrat §4) : ce qui sépare le bénin de son jumeau suspect
     doit être DANS les données, pas dans l'étiquette. Trois paires épinglées. */
  for (const c of cas) {
    if (c.nature === "dormant-burst") {
      assert.ok(c.historique.length <= 2, `${c.id}: un dormant a un historique quasi vide`);
    }
    if (c.nature === "seasonal-trade") {
      assert.ok(c.historique.length >= 8,
        `${c.id}: le sosie saisonnier porte sa saison précédente dans l'historique`);
    }
    if (c.nature === "loan-repayment") {
      const sorties = [...c.fenetre, ...c.historique]
        .filter((t) => t.direction === "out" && t.channel === "transfer");
      const montants = new Set(sorties.map((t) => t.amount));
      assert.ok(montants.size < sorties.length,
        `${c.id}: l'échéance doit se répéter au centime dans l'historique`);
    }
    if (c.nature === "structuring") {
      for (const t of c.fenetre) {
        if (t.channel === "cash" && t.direction === "in") {
          assert.ok(t.amount < SEUIL_DECLARATION, `${c.id}: un dépôt de structuration dépasse le seuil`);
        }
      }
    }
  }
});

test("le générateur et les variantes sont déterministes : même graine, mêmes cas ; autre graine, autres cas", { skip: SKIP }, () => {
  const a = tirage(9), b = tirage(9), c = tirage(10);
  assert.deepEqual([a(), a()], [b(), b()]);
  assert.notDeepEqual([tirage(9)(), 0], [c(), 0]);
  const ecrit = cas.find((x) => x.nature === "rapid-movement")!;
  assert.deepEqual(variantes(ecrit, 20260906, 3), variantes(ecrit, 20260906, 3));
  assert.notDeepEqual(variantes(ecrit, 20260906, 3), variantes(ecrit, 20260907, 3));
});

test("chaque variante passe exigerCas, garde sa nature, et se déclare synthétique", { skip: SKIP }, () => {
  for (const nature of [...NATURES_SUSPECTES, ...NATURES_BENIGNES]) {
    const ecrit = cas.find((c) => c.nature === nature)!;
    for (const v of variantes(ecrit, 7, 3)) {
      exigerCas(v);
      assert.equal(v.nature, nature);
      assert.match(v.id, new RegExp(`^${ecrit.id}~v\\d+$`));
      assert.match(v.raison, /^synthetic variant/);
    }
  }
});

test("le gigage préserve la nature : seuil de structuration, égalités d'aller-retour, échéance au centime", { skip: SKIP }, () => {
  const str = cas.find((c) => c.nature === "structuring")!;
  for (const v of variantes(str, 123, 8)) {
    for (const t of v.fenetre) {
      if (t.channel === "cash" && t.direction === "in") {
        assert.ok(t.amount < SEUIL_DECLARATION,
          `variante ${v.id}: un dépôt gigué franchit le seuil de déclaration (${t.amount})`);
      }
    }
  }
  const rtr = cas.find((c) => c.nature === "round-tripping")!;
  for (const v of variantes(rtr, 123, 4)) {
    /* Le rapport sortie/retour de chaque cycle doit rester celui du cas écrit : le facteur
       commun préserve « le même montant part et revient ». */
    const sorties = v.fenetre.filter((t) => t.direction === "out" && t.channel === "wire");
    const retours = v.fenetre.filter((t) => t.direction === "in" && t.channel === "wire");
    assert.equal(sorties.length, retours.length);
    for (let i = 0; i < sorties.length; i++) {
      const rapport = retours[i]!.amount / sorties[i]!.amount;
      assert.ok(rapport > 0.99 && rapport < 1.01,
        `variante ${v.id}: l'aller-retour ne revient plus au même montant (rapport ${rapport.toFixed(4)})`);
    }
  }
  const loa = cas.find((c) => c.nature === "loan-repayment")!;
  for (const v of variantes(loa, 123, 4)) {
    const echeances = [...v.fenetre, ...v.historique]
      .filter((t) => t.direction === "out" && t.channel === "transfer").map((t) => t.amount);
    assert.equal(new Set(echeances).size, 1,
      `variante ${v.id}: l'échéance n'est plus identique au centime après gigage`);
  }
  const sav = cas.find((c) => c.nature === "savings-transfer")!;
  for (const v of variantes(sav, 123, 4)) {
    const rondes = v.fenetre.filter((t) => t.direction === "out" && t.channel === "transfer");
    for (const t of rondes) {
      assert.equal(t.amount % 50, 0, `variante ${v.id}: le virement d'épargne n'est plus rond (${t.amount})`);
    }
  }
});

test("le jeu synthétique couvre toutes les natures et reste stable sous retrait d'un cas", { skip: SKIP }, () => {
  const jeu = jeuSynthetique(cas, 20260906, 2);
  assert.equal(jeu.length, cas.length * 2);
  const natures = new Set(jeu.map((c) => c.nature));
  for (const n of [...NATURES_SUSPECTES, ...NATURES_BENIGNES]) assert.ok(natures.has(n), `nature absente du jeu : ${n}`);
  const sans = jeuSynthetique(cas.filter((c) => c.id !== "l-str-01"), 20260906, 2);
  assert.deepEqual(sans, jeu.filter((c) => !c.id.startsWith("l-str-01~")),
    "retirer un cas écrit recompose les variantes des autres : la graine ne dérive pas du cas");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/*
 * THE SUITE RUNS ON THE THREE SYSTEMS A BUYER HAS, OR THE README CLAIMS NOTHING ABOUT THEM.
 *
 * The audit runs on the client's machine, and a mortgage lender's analyst runs Windows. A suite
 * that was only ever green on the developer's Mac says nothing about that machine, and the
 * README disclaims it in words. The sister tools measure the claim instead: a job matrix over
 * ubuntu-latest, macos-latest and windows-latest that runs `npm test` on each push.
 *
 * What this case asks of the REPOSITORY, not of a function: some workflow under
 * `.github/workflows/` holds a job whose matrix names the three systems, whose `runs-on` reads
 * that matrix, and whose steps run `npm test`. A workflow that lists the systems but never
 * runs the suite, or runs it on one system only, does not count. A word in a comment does not
 * count either: comments are stripped before anything is read. Nor does a matrix that excludes
 * one of the three systems (even for one Node version), a `npm test` step that is dead (`if:`
 * anything but always true) or whose failure is tolerated (`continue-on-error`), or a job that
 * tolerates failure as a whole: the file would name three systems and the chain try fewer.
 *
 * No YAML parser, because the repository has no dependency to spare for one: plain line logic
 * over the shapes a workflow actually takes (inline `[a, b]` list or block `- a` list; `run:`
 * as a one-liner or as a `|` block; LF or CRLF line endings, because a Windows checkout may
 * hand this very file back with a carriage return per line).
 *
 * The witness case plays the refusals on fabricated workflows: without it, a parser that reads
 * nothing would turn a missing file into the only red, and a present-but-wrong file into green.
 */
const WORKFLOWS = fileURLToPath(new URL("../.github/workflows/", import.meta.url));
const SYSTEMS = ["ubuntu-latest", "macos-latest", "windows-latest"];

/** One line without its comment; a `#` inside quotes is kept, which no workflow here needs more than. */
function sansCommentaire(ligne: string): string {
  if (/^\s*#/.test(ligne)) return "";
  return ligne.replace(/\s+#.*$/, "");
}

const indent = (l: string) => l.length - l.trimStart().length;

/** The jobs of a workflow: name -> its lines (comments stripped, blank lines dropped). */
function jobs(texte: string): Map<string, string[]> {
  const lignes = texte.split(/\r?\n/).map(sansCommentaire).filter((l) => l.trim() !== "");
  const debut = lignes.findIndex((l) => /^jobs:\s*$/.test(l));
  const resultat = new Map<string, string[]>();
  if (debut === -1) return resultat;
  let courant: string[] | null = null;
  for (const l of lignes.slice(debut + 1)) {
    if (indent(l) === 0) break;
    const cle = /^(\s+)([\w-]+):\s*$/.exec(l);
    if (cle && cle[1]!.length === 2) {
      courant = [];
      resultat.set(cle[2]!, courant);
    } else if (courant) {
      courant.push(l);
    }
  }
  return resultat;
}

/** The lines under `matrix:`, up to the first line that leaves it. */
function blocDeLaMatrice(job: string[]): string[] {
  const m = job.findIndex((l) => /^\s+matrix:\s*$/.test(l));
  if (m === -1) return [];
  const bloc: string[] = [];
  for (const l of job.slice(m + 1)) {
    if (indent(l) <= indent(job[m]!)) break;
    bloc.push(l);
  }
  return bloc;
}

/** The index, in the matrix block, of one of the matrix's own keys (not a key nested under another). */
function cleDeLaMatrice(bloc: string[], cle: string): number {
  if (bloc.length === 0) return -1;
  const propre = Math.min(...bloc.map(indent));
  return bloc.findIndex((l) => indent(l) === propre && new RegExp(`^\\s+${cle}:`).test(l));
}

/** The systems named under `matrix: os:`, whether inline or as a block list. */
function systemesDeLaMatrice(job: string[]): string[] {
  const bloc = blocDeLaMatrice(job);
  const o = cleDeLaMatrice(bloc, "os");
  if (o === -1) return [];
  const inline = /^\s+os:\s*\[(.*)\]\s*$/.exec(bloc[o]!);
  if (inline) return inline[1]!.split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
  const noms: string[] = [];
  for (const l of bloc.slice(o + 1)) {
    const item = /^\s+-\s+(.+?)\s*$/.exec(l);
    if (!item || indent(l) < indent(bloc[o]!)) break;
    noms.push(item[1]!.replace(/^['"]|['"]$/g, ""));
  }
  return noms;
}

/** The systems that `matrix: exclude:` names, in any shape. A system the matrix excludes, even
 *  for one Node version only, is a system the chain does not fully try: the job does not count. */
function systemesExclus(job: string[]): string[] {
  const bloc = blocDeLaMatrice(job);
  const e = cleDeLaMatrice(bloc, "exclude");
  if (e === -1) return [];
  const base = indent(bloc[e]!);
  const dedans = [bloc[e]!];
  for (const l of bloc.slice(e + 1)) {
    /* La liste peut s'écrire au niveau de sa clé (`exclude:` puis `- os: ...` sans retrait). */
    if (indent(l) < base || (indent(l) === base && !/^\s*-\s/.test(l))) break;
    dedans.push(l);
  }
  return SYSTEMS.filter((s) => dedans.some((l) => l.includes(s)));
}

/** The step's own `key: value` texts: the keys of the step holding job[i], not the body of a `|` block. */
function clesDuPas(job: string[], i: number): string[] {
  let debut = i;
  if (!/^\s*-\s/.test(job[i]!)) {
    debut = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (/^\s*-\s/.test(job[j]!) && indent(job[j]!) < indent(job[i]!)) { debut = j; break; }
    }
    if (debut === -1) return [];
  }
  const base = indent(job[debut]!);
  const cles = [job[debut]!.replace(/^\s*-\s+/, "").trim()];
  for (let k = debut + 1; k < job.length && indent(job[k]!) > base; k++) {
    if (indent(job[k]!) === base + 2) cles.push(job[k]!.trim());
  }
  return cles;
}

/** The commands of the job's `run:` steps, one entry per command line, with the keys of their step. */
function commandes(job: string[]): { commande: string; cles: string[] }[] {
  const out: { commande: string; cles: string[] }[] = [];
  for (let i = 0; i < job.length; i++) {
    const r = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(job[i]!);
    if (!r) continue;
    const cles = clesDuPas(job, i);
    const reste = r[2]!.trim();
    if (/^[|>][+-]?$/.test(reste)) {
      const base = indent(job[i]!);
      for (let j = i + 1; j < job.length && indent(job[j]!) > base; j++) out.push({ commande: job[j]!.trim(), cles });
    } else {
      out.push({ commande: reste, cles });
    }
  }
  return out;
}

/** The value of a key among `key: value` texts, quotes and `${{ }}` taken off; undefined when absent. */
function valeur(cles: string[], nom: string): string | undefined {
  const c = cles.find((k) => k.startsWith(`${nom}:`));
  if (c === undefined) return undefined;
  return c.slice(nom.length + 1).trim()
    .replace(/^(['"])(.*)\1$/, "$2")
    .replace(/^\$\{\{\s*(.*?)\s*\}\}$/, "$1")
    .trim();
}

/** A step that really runs, and whose failure counts: no condition but an always-true one, and no
 *  failure tolerated (`continue-on-error` absent or the literal false). */
function pasQuiCompte(cles: string[]): boolean {
  const si = valeur(cles, "if");
  if (si !== undefined && !/^(true|always\(\)|success\(\))$/.test(si)) return false;
  const tolere = valeur(cles, "continue-on-error");
  return tolere === undefined || tolere === "false";
}

/** A job whose own failure does not fail the run (`continue-on-error` on the job, not on a step). */
function jobToleraLEchec(job: string[]): boolean {
  if (job.length === 0) return false;
  const propre = Math.min(...job.map(indent));
  const tolere = valeur(job.filter((l) => indent(l) === propre).map((l) => l.trim()), "continue-on-error");
  return tolere !== undefined && tolere !== "false";
}

const LANCE_LES_CAS = /(^|&&|;|\|\|)\s*npm test(\s|$)/;

/** The jobs of a workflow that run the suite across all three systems. */
function jobsSurTroisSystemes(texte: string): string[] {
  const trouves: string[] = [];
  for (const [nom, job] of jobs(texte)) {
    const systemes = systemesDeLaMatrice(job);
    const toutes = SYSTEMS.every((s) => systemes.includes(s));
    const lit = job.some((l) => /^\s+runs-on:\s*\$\{\{\s*matrix\.os\s*\}\}\s*$/.test(l));
    const lance = commandes(job).some((c) => LANCE_LES_CAS.test(c.commande) && pasQuiCompte(c.cles));
    const entier = systemesExclus(job).length === 0 && !jobToleraLEchec(job);
    if (toutes && lit && lance && entier) trouves.push(nom);
  }
  return trouves;
}

test("la suite tourne sur ubuntu, macOS et Windows : un job à matrice lance `npm test` sur les trois", () => {
  assert.ok(existsSync(WORKFLOWS),
    ".github/workflows/ n'existe pas : aucune chaîne ne lance la suite, sur aucun système. "
    + "Ajouter .github/workflows/tests.yml (matrice ubuntu-latest, macos-latest, windows-latest, `npm test`).");
  const fichiers = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f)).sort();
  assert.ok(fichiers.length > 0, ".github/workflows/ ne contient aucun fichier .yml.");
  const retenus = fichiers.flatMap((f) =>
    jobsSurTroisSystemes(readFileSync(join(WORKFLOWS, f), "utf8")).map((j) => `${f}:${j}`));
  assert.ok(retenus.length > 0,
    `aucun job de ${fichiers.join(", ")} ne tient une matrice os avec ${SYSTEMS.join(", ")}, `
    + "lue par runs-on (`${{ matrix.os }}`), et dont les pas lancent `npm test`.");
});

test("témoin : la lecture des chaînes voit un job complet, et refuse les fautes qui lui ressemblent", () => {
  const complet = [
    "name: tests",
    "jobs:",
    "  test:",
    "    strategy:",
    "      matrix:",
    "        os: [ubuntu-latest, macos-latest, windows-latest]",
    "        node: ['24', '26']",
    "    runs-on: ${{ matrix.os }}",
    "    steps:",
    "      - run: npm ci --ignore-scripts",
    "      - run: npm test",
  ].join("\n");
  assert.deepEqual(jobsSurTroisSystemes(complet), ["test"], "un job complet n'est pas vu : la lecture ne regarde pas.");

  const enBloc = complet
    .replace("os: [ubuntu-latest, macos-latest, windows-latest]",
      "os:\n          - ubuntu-latest\n          - macos-latest\n          - 'windows-latest'")
    .replace("      - run: npm test", "      - name: suite\n        run: |\n          set -o pipefail\n          npm test 2>&1 | tee suite.txt");
  assert.deepEqual(jobsSurTroisSystemes(enBloc), ["test"], "la matrice en liste de blocs, ou `run: |`, n'est pas vue.");

  const sansWindows = complet.replace(", windows-latest]", "]");
  assert.deepEqual(jobsSurTroisSystemes(sansWindows), [], "une matrice sans Windows est acceptée.");

  const jamaisLance = complet.replace("      - run: npm test", "      - run: npm run build");
  assert.deepEqual(jobsSurTroisSystemes(jamaisLance), [], "un job qui ne lance pas `npm test` est accepté.");

  const enCommentaire = complet.replace("      - run: npm test", "      # - run: npm test\n      - name: npm test");
  assert.deepEqual(jobsSurTroisSystemes(enCommentaire), [], "`npm test` dans un commentaire ou un nom de pas est accepté.");

  const matriceIgnoree = complet.replace("runs-on: ${{ matrix.os }}", "runs-on: ubuntu-latest");
  assert.deepEqual(jobsSurTroisSystemes(matriceIgnoree), [], "une matrice que runs-on ne lit pas est acceptée.");

  /* Une matrice qui nomme les trois systèmes mais en retire un par `exclude:`, ou un pas
     `npm test` qui ne tourne pas (`if:` faux) ou dont l'échec ne compte pas
     (`continue-on-error`) : le fichier dit trois systèmes, la chaîne n'en éprouve que deux. */
  const avecMatrice = (ajout: string) => complet.replace("        node: ['24', '26']", `        node: ['24', '26']\n${ajout}`);
  assert.deepEqual(jobsSurTroisSystemes(avecMatrice("        exclude:\n          - os: windows-latest\n            node: '26'")), [],
    "une matrice qui exclut Windows (même pour une seule version de Node) est acceptée.");
  assert.deepEqual(jobsSurTroisSystemes(avecMatrice("        exclude:\n          - {os: macos-latest, node: '24'}")), [],
    "une exclusion écrite en ligne est acceptée.");
  assert.deepEqual(jobsSurTroisSystemes(avecMatrice("        exclude: [{os: ubuntu-latest}]")), [],
    "une exclusion en liste inline est acceptée.");
  assert.deepEqual(jobsSurTroisSystemes(avecMatrice("        exclude:\n        - os: windows-latest")), [],
    "une exclusion dont la liste est au niveau de sa clé est acceptée.");
  assert.deepEqual(jobsSurTroisSystemes(avecMatrice("        exclude:\n          - os: ubuntu-20.04")), ["test"],
    "une exclusion qui ne touche aucun des trois systèmes est refusée : la garde déborde.");

  const pas = (ligne: string) => complet.replace("      - run: npm test", `      - ${ligne}\n        run: npm test`);
  assert.deepEqual(jobsSurTroisSystemes(pas("if: false")), [], "un pas `npm test` à `if: false` est accepté.");
  assert.deepEqual(jobsSurTroisSystemes(pas("if: ${{ false }}")), [], "un pas `npm test` à `if: ${{ false }}` est accepté.");
  assert.deepEqual(jobsSurTroisSystemes(pas("if: matrix.os != 'windows-latest'")), [],
    "un pas `npm test` qui saute un système est accepté.");
  assert.deepEqual(jobsSurTroisSystemes(pas("if: success()")), ["test"], "`if: success()` est refusé : la garde déborde.");
  assert.deepEqual(jobsSurTroisSystemes(pas("continue-on-error: true")), [],
    "un pas `npm test` dont l'échec ne compte pas est accepté.");
  assert.deepEqual(jobsSurTroisSystemes(pas("continue-on-error: ${{ matrix.os == 'windows-latest' }}")), [],
    "un échec toléré sur un système par expression est accepté.");
  assert.deepEqual(jobsSurTroisSystemes(pas("continue-on-error: false")), ["test"],
    "`continue-on-error: false` est refusé : la garde déborde.");
  assert.deepEqual(jobsSurTroisSystemes(complet.replace("    runs-on: ${{ matrix.os }}", "    runs-on: ${{ matrix.os }}\n    continue-on-error: true")), [],
    "un job entier qui tolère l'échec est accepté.");
  const deuxPas = complet.replace("      - run: npm test", "      - if: false\n        run: npm test\n      - run: npm test");
  assert.deepEqual(jobsSurTroisSystemes(deuxPas), ["test"],
    "un pas mort ne doit pas annuler un autre pas `npm test` qui tourne vraiment.");

  /* Un checkout Windows réécrit les fins de ligne en CRLF : le même workflow doit être lu de
     la même façon, sinon le témoin rougirait sur la machine même qu'il garde. */
  assert.deepEqual(jobsSurTroisSystemes(`${complet}\n`.replace(/\n/g, "\r\n")), ["test"],
    "un workflow à fins de ligne CRLF n'est pas lu : `run:` et les commentaires se lisent mal avec le retour chariot.");
  assert.deepEqual(jobsSurTroisSystemes(enBloc.replace(/\n/g, "\r\n")), ["test"],
    "la forme en liste de blocs et `run: |`, en CRLF, n'est pas lue.");
  assert.deepEqual(jobsSurTroisSystemes(sansWindows.replace(/\n/g, "\r\n")), [],
    "une matrice sans Windows est acceptée dès qu'elle est en CRLF.");
});

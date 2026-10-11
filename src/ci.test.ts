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
 * count either: comments are stripped before anything is read.
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

/** The systems named under `matrix: os:`, whether inline or as a block list. */
function systemesDeLaMatrice(job: string[]): string[] {
  const m = job.findIndex((l) => /^\s+matrix:\s*$/.test(l));
  if (m === -1) return [];
  const o = job.findIndex((l, i) => i > m && /^\s+os:/.test(l));
  if (o === -1) return [];
  const inline = /^\s+os:\s*\[(.*)\]\s*$/.exec(job[o]!);
  if (inline) return inline[1]!.split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
  const noms: string[] = [];
  for (const l of job.slice(o + 1)) {
    const item = /^\s+-\s+(.+?)\s*$/.exec(l);
    if (!item || indent(l) < indent(job[o]!)) break;
    noms.push(item[1]!.replace(/^['"]|['"]$/g, ""));
  }
  return noms;
}

/** The commands of the job's `run:` steps, one entry per command line. */
function commandes(job: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < job.length; i++) {
    const r = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(job[i]!);
    if (!r) continue;
    const reste = r[2]!.trim();
    if (/^[|>][+-]?$/.test(reste)) {
      const base = indent(job[i]!);
      for (let j = i + 1; j < job.length && indent(job[j]!) > base; j++) out.push(job[j]!.trim());
    } else {
      out.push(reste);
    }
  }
  return out;
}

const LANCE_LES_CAS = /(^|&&|;|\|\|)\s*npm test(\s|$)/;

/** The jobs of a workflow that run the suite across all three systems. */
function jobsSurTroisSystemes(texte: string): string[] {
  const trouves: string[] = [];
  for (const [nom, job] of jobs(texte)) {
    const systemes = systemesDeLaMatrice(job);
    const toutes = SYSTEMS.every((s) => systemes.includes(s));
    const lit = job.some((l) => /^\s+runs-on:\s*\$\{\{\s*matrix\.os\s*\}\}\s*$/.test(l));
    const lance = commandes(job).some((c) => LANCE_LES_CAS.test(c));
    if (toutes && lit && lance) trouves.push(nom);
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

  /* Un checkout Windows réécrit les fins de ligne en CRLF : le même workflow doit être lu de
     la même façon, sinon le témoin rougirait sur la machine même qu'il garde. */
  assert.deepEqual(jobsSurTroisSystemes(`${complet}\n`.replace(/\n/g, "\r\n")), ["test"],
    "un workflow à fins de ligne CRLF n'est pas lu : `run:` et les commentaires se lisent mal avec le retour chariot.");
  assert.deepEqual(jobsSurTroisSystemes(enBloc.replace(/\n/g, "\r\n")), ["test"],
    "la forme en liste de blocs et `run: |`, en CRLF, n'est pas lue.");
  assert.deepEqual(jobsSurTroisSystemes(sansWindows.replace(/\n/g, "\r\n")), [],
    "une matrice sans Windows est acceptée dès qu'elle est en CRLF.");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, sep } from "node:path";
import { RESEAU } from "./reseau.ts";

/*
 * ONE STATEMENT ABOUT THE NETWORK, IN BOTH READMES.
 *
 * Found by Qualite on 2026-10-11: README.md named `npm ci` "the only command that needs the
 * network", and examples/amlworld/README.md named the Kaggle download "the only step that needs
 * the network". Two "only" cannot both hold. The truth is in the code: nothing of this tool
 * reaches the network at run time (no runtime dependency, `node:` built-ins only), `npm ci
 * --ignore-scripts` reaches the npm registry at install time, and the AMLworld file is
 * downloaded by the user, with their own account, outside any command of this tool.
 *
 * The text lives in src/reseau.ts, is printed between `figures:reseau` markers in both
 * READMEs by `npm run figures`, and is held here: the two blocks must be equal, equal to the
 * source, and true of package.json and of the imports. A third phrasing elsewhere in either
 * README is refused. The witness cases plant each fault and require that it is seen.
 */

const racine = fileURLToPath(new URL("..", import.meta.url));
const CHEMINS = {
  "README.md": join(racine, "README.md"),
  "examples/amlworld/README.md": join(racine, "examples", "amlworld", "README.md"),
};

/** The text between the two markers of the block, trimmed; null when a marker is missing. */
export function bloc(markdown: string, nom: string): string | null {
  const ouvre = `<!-- figures:${nom} -->`;
  const ferme = `<!-- /figures:${nom} -->`;
  const a = markdown.indexOf(ouvre);
  const b = markdown.indexOf(ferme);
  if (a === -1 || b === -1 || b < a) return null;
  return markdown.slice(a + ouvre.length, b).trim();
}

/** The README with the statement block blanked: what is left is hand-written prose. */
function sansLeBloc(markdown: string): string {
  const ouvre = "<!-- figures:reseau -->";
  const ferme = "<!-- /figures:reseau -->";
  const a = markdown.indexOf(ouvre);
  const b = markdown.indexOf(ferme);
  if (a === -1 || b === -1 || b < a) return markdown;
  return markdown.slice(0, a) + markdown.slice(b + ferme.length);
}

/** Other phrasings of the same claim, which may not live beside the statement. */
const AUTRES_FORMULATIONS: RegExp[] = [
  /\bonly\s+(?:command|step)\b[^.\n]*\bnetwork\b/i,
  /\bevery\s+command\s+runs\s+with\s+the\s+network\s+cut\b/i,
  /\bnetwork\b[^.\n]*\bonly\s+(?:command|step)\b/i,
];

/** The faults of a set of READMEs (name to text), as readable lines; empty when all is well. */
export function fautes(textes: Record<string, string>, attendu: string): string[] {
  const out: string[] = [];
  for (const [nom, texte] of Object.entries(textes)) {
    const b = bloc(texte, "reseau");
    if (b === null) { out.push(`${nom}: no figures:reseau block, so no network statement`); continue; }
    if (b !== attendu) out.push(`${nom}: the network statement differs from src/reseau.ts`);
    for (const motif of AUTRES_FORMULATIONS) {
      const m = motif.exec(sansLeBloc(texte));
      if (m) out.push(`${nom}: a second phrasing of the claim outside the statement: "${m[0]}"`);
    }
  }
  const blocs = Object.values(textes).map((t) => bloc(t, "reseau"));
  if (new Set(blocs).size > 1) out.push("the READMEs do not carry the same network statement");
  return out;
}

const lus = () => Object.fromEntries(Object.entries(CHEMINS).map(([nom, p]) => [nom, readFileSync(p, "utf8")]));

test("both READMEs carry the same network statement, the one src/reseau.ts holds", () => {
  const textes = lus();
  assert.equal(Object.keys(textes).length, 2, "the two READMEs were not both read");
  assert.deepEqual(fautes(textes, RESEAU), []);
});

test("witness: a missing block, another wording and a second claim are each seen", () => {
  // Built from the source text, not from the real READMEs: the witness must work whatever they hold.
  const avecBloc = (corps: string, apres = "") => `# A README\n\n<!-- figures:reseau -->\n${corps}\n<!-- /figures:reseau -->\n${apres}`;
  const bon = { "a/README.md": avecBloc(RESEAU), "b/README.md": avecBloc(RESEAU) };
  assert.deepEqual(fautes(bon, RESEAU), [], "the planted good pair must be clean, or the cases below prove nothing");

  const sansBloc = fautes({ ...bon, "b/README.md": "# no block here\n" }, RESEAU);
  assert.ok(sansBloc.some((f) => /b\/README\.md: no figures:reseau block/.test(f)), sansBloc.join("\n"));

  const diff = fautes({ ...bon, "b/README.md": avecBloc("Only the Kaggle download needs the network.") }, RESEAU);
  assert.ok(diff.some((f) => /b\/README\.md: the network statement differs/.test(f)), diff.join("\n"));
  assert.ok(diff.some((f) => /do not carry the same/.test(f)), diff.join("\n"));

  const second = fautes({ ...bon, "a/README.md": avecBloc(RESEAU, "\nThis is the only step that needs the network.\n") }, RESEAU);
  assert.ok(second.some((f) => /a\/README\.md: a second phrasing/.test(f)), second.join("\n"));

  const cut = fautes({ ...bon, "a/README.md": avecBloc(RESEAU, "\nEvery command runs with the network cut.\n") }, RESEAU);
  assert.ok(cut.some((f) => /a\/README\.md: a second phrasing/.test(f)), cut.join("\n"));
});

test("the statement is true of the code: no runtime dependency, node: built-ins only, real commands", () => {
  const pkg = JSON.parse(readFileSync(join(racine, "package.json"), "utf8"));
  assert.deepEqual(pkg.dependencies ?? {}, {}, "a runtime dependency exists: the statement 'no runtime dependency' is false");

  // Every command the statement names must exist: `npm run X` is a script, `npm ci` is npm's own.
  const nommes = [...RESEAU.matchAll(/`npm run ([a-z:]+)`/g)].map((m) => m[1]!);
  assert.ok(nommes.length >= 3, `${nommes.length} npm run command(s) read from the statement: the reading failed`);
  for (const nom of nommes) assert.ok(pkg.scripts?.[nom], `the statement names \`npm run ${nom}\`, which package.json does not define`);
  assert.ok(RESEAU.includes("`npm ci --ignore-scripts`"), "the statement no longer names the one install command");

  // Every module that ships imports `node:` built-ins or a sibling file, nothing from the registry.
  const src = join(racine, "src");
  const tout = (readdirSync(src, { recursive: true }) as string[]).map((n) => n.split(sep).join("/"));
  const livres = tout.filter((n) => /\.(ts|mjs)$/.test(n) && !/\.test\.(ts|mjs)$/.test(n) && !n.startsWith("fixtures/"));
  const fichiers = [...livres.map((n) => join(src, n)), join(racine, "examples", "amlworld", "map-alerts.ts")];
  assert.ok(fichiers.length >= 7, `${fichiers.length} file(s) read: the reading failed`);
  const etrangers = fichiers.flatMap((f) => importsNus(readFileSync(f, "utf8")).map((s) => `${f.slice(racine.length)}: ${s}`));
  assert.deepEqual(etrangers, [], "a shipped module imports something that is not a node: built-in or a sibling file");
});

/** The bare import specifiers of a module that are not `node:` built-ins (a relative path is a sibling). */
export function importsNus(source: string): string[] {
  const specs = [...source.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)"([^"]+)"/gm)].map((m) => m[1]!);
  return specs.filter((s) => !s.startsWith("node:") && !s.startsWith("."));
}

test("witness: a registry import is seen, a node: built-in and a sibling are not", () => {
  assert.deepEqual(importsNus(`import { a } from "left-pad";`), ["left-pad"]);
  assert.deepEqual(importsNus(`const x = await import("undici");`), ["undici"]);
  assert.deepEqual(importsNus(`import { test } from "node:test";\nimport { b } from "./b.ts";\nimport fs from "node:fs";`), []);
});

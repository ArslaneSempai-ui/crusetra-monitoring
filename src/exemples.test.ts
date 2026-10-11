/**
 * EVERY PUBLIC EXAMPLE UNDER examples/ CARRIES ITS LICENCE, AND ITS SEALED RECORD STILL HOLDS.
 *
 * An example is a folder of data (or a mapping) published beside the sold tool. Two things
 * make it safe to publish, and both rot silently if nothing looks:
 *
 *   1. Its README has a "Licence of this folder" section (the form of the CORD example in
 *      Routing): the licence of the data it carries, a link, and the files it covers. When that
 *      licence is CDLA-Sharing 1.0 (IBM AMLworld) the conditions are checked too: the licence
 *      text shipped in the folder, the credit to the provider, a notice that the files were
 *      changed and which, and the open point for a lawyer (derived alert file: "Enhanced Data",
 *      share-alike, or "Results", free), with the reading we apply while it is open.
 *   2. Each sealed record in it still matches its seal, checked by the real tool
 *      (`sceller.ts --check`, which never writes) and not by a second implementation.
 *
 * The folder must exist: a green run over zero examples says nothing. The checks then run on
 * planted folders as well, one defect at a time, so that each rule is shown to fire. A rule that
 * was never seen to fail is not a rule.
 *
 * NOT CHECKED HERE: that the licence text is the official one, byte for byte. Pin its hash in
 * this file when the text is first fetched from cdla.dev, not before.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { empreinteDuReleve } from "./empreinte.ts";

const RACINE = fileURLToPath(new URL("..", import.meta.url));
const EXEMPLES = join(RACINE, "examples");
const SCELLER = join(RACINE, "src", "sceller.ts");

const TITRE = "Licence of this folder";
const LICENCE_NOMMEE = /CC BY|CC0|Creative Commons|CDLA|Community Data License|ODbL|Open Database License|Apache|\bMIT\b|PolyForm/i;
const CDLA = /CDLA|Community Data License/i;
const FICHIER_NOMME = /`([^`\s]+\.(?:csv|tsv|jsonl?|txt|md|py|ts|mjs|pdf))`/g;

/** The files of a folder, recursively, as paths relative to it with forward slashes. */
function fichiersDe(dossier: string): string[] {
  const sortie: string[] = [];
  const descendre = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) descendre(p);
      else sortie.push(relative(dossier, p).split(sep).join("/"));
    }
  };
  descendre(dossier);
  return sortie.sort();
}

/** The body of the "Licence of this folder" section: from its heading to the next heading of the
 *  same or a higher level (headings inside a fenced block do not count). null when absent. */
export function sectionLicence(readme: string): string | null {
  const lignes = readme.split("\n");
  const debut = lignes.findIndex((l) => new RegExp(`^#{1,6}\\s+${TITRE}\\s*$`).test(l));
  if (debut < 0) return null;
  const niveau = /^#+/.exec(lignes[debut]!)![0].length;
  const corps: string[] = [];
  let cloture = false;
  for (const l of lignes.slice(debut + 1)) {
    if (l.trimStart().startsWith("```")) cloture = !cloture;
    const titre = cloture ? null : /^(#+)\s/.exec(l);
    if (titre && titre[1]!.length <= niveau) break;
    corps.push(l);
  }
  return corps.join("\n").trim();
}

/** The CDLA-Sharing 1.0 conditions, on top of the generic section. */
function fautesCdla(nom: string, readme: string, section: string, dossier: string, presents: string[]): string[] {
  const fautes: string[] = [];
  const textes = presents.filter((f) => /cdla/i.test(basename(f)));
  const texteLivre = textes.some((f) => {
    const t = readFileSync(join(dossier, f), "utf8");
    return /Community Data License Agreement/i.test(t) && /Sharing/.test(t) && /Version 1\.0/i.test(t);
  });
  if (!texteLivre) {
    fautes.push(`${nom}: the CDLA-Sharing 1.0 licence text is not in the folder (a file whose name carries CDLA, holding the agreement)`);
  }
  if (!/Altman/.test(section) || !/\bIBM\b/.test(section)) {
    fautes.push(`${nom}: the licence section does not credit the provider (Altman, IBM)`);
  }
  if (!/\b(changed|modified)\b/i.test(section)) {
    fautes.push(`${nom}: the licence section carries no change notice (the files were changed from the original)`);
  }
  const donnees = presents.filter((f) => /\.(csv|tsv|jsonl?|txt)$/i.test(f) && !/\.signature\.json$/.test(f) && !textes.includes(f));
  for (const f of donnees) {
    if (!section.includes(f)) fautes.push(`${nom}: data file ${f} is not named in the licence section, so it carries no change notice`);
  }
  for (const mot of ["Enhanced Data", "Results", "lawyer"]) {
    if (!readme.includes(mot)) fautes.push(`${nom}: the README does not state the open point for a lawyer ("${mot}" is absent)`);
  }
  if (!/we treat[^.]*Enhanced Data/i.test(readme)) {
    fautes.push(`${nom}: the README does not say that we treat the derived alert file as Enhanced Data (we treat ...)`);
  }
  return fautes;
}

/** The licence defects of one example folder. */
export function fautesDeLicence(dossier: string): string[] {
  const nom = basename(dossier);
  const chemin = join(dossier, "README.md");
  if (!existsSync(chemin)) return [`${nom}: no README.md`];
  const readme = readFileSync(chemin, "utf8");
  const section = sectionLicence(readme);
  if (section === null) return [`${nom}/README.md: no "${TITRE}" section`];
  const fautes: string[] = [];
  const presents = fichiersDe(dossier);
  if (!LICENCE_NOMMEE.test(section)) fautes.push(`${nom}/README.md: the licence section names no licence`);
  if (!/https?:\/\//.test(section)) fautes.push(`${nom}/README.md: the licence section links no licence text`);
  const nommes = [...section.matchAll(FICHIER_NOMME)].map((m) => m[1]!);
  if (nommes.length === 0) fautes.push(`${nom}/README.md: the licence section names no file of the folder, so it covers nothing`);
  for (const n of nommes) {
    if (!presents.includes(n)) fautes.push(`${nom}/README.md: the licence section names \`${n}\`, which is not in the folder`);
  }
  if (CDLA.test(section)) fautes.push(...fautesCdla(nom, readme, section, dossier, presents));
  return fautes;
}

/** The seal defects of one example folder: every JSON that carries a root seal is checked by the
 *  real tool, and the folder must hold at least one. */
export function fautesDeScelle(dossier: string): string[] {
  const nom = basename(dossier);
  const fautes: string[] = [];
  let scelles = 0;
  for (const f of fichiersDe(dossier)) {
    if (!f.endsWith(".json") || f.endsWith(".signature.json")) continue;
    let o: unknown;
    try {
      o = JSON.parse(readFileSync(join(dossier, f), "utf8"));
    } catch {
      fautes.push(`${nom}/${f}: not valid JSON`);
      continue;
    }
    if (typeof o !== "object" || o === null || !("empreinte" in o)) continue;
    scelles++;
    const r = spawnSync(process.execPath, [SCELLER, join(dossier, f), "--check"], { encoding: "utf8" });
    if (r.status !== 0) {
      const dit = `${r.stderr ?? ""} ${r.stdout ?? ""}`.replace(/\s+/g, " ").trim();
      fautes.push(`${nom}/${f}: ${dit || String(r.error ?? "the seal check did not run")}`);
    }
  }
  if (scelles === 0) fautes.push(`${nom}: holds no sealed record (a JSON with a root \`empreinte\`)`);
  return fautes;
}

/* ───────────────────────── the real examples ───────────────────────── */

const exemples = existsSync(EXEMPLES)
  ? readdirSync(EXEMPLES, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(EXEMPLES, e.name)).sort()
  : [];

test("examples/ exists and holds at least one example", () => {
  assert.ok(existsSync(EXEMPLES), "examples/ does not exist: the public example of the tool is missing");
  assert.ok(exemples.length >= 1, "examples/ holds no folder: nothing is published to check");
});

test("every example README carries its \"Licence of this folder\" section", () => {
  assert.ok(exemples.length >= 1, "no example folder under examples/: this check read nothing");
  assert.deepEqual(exemples.flatMap(fautesDeLicence), [],
    "an example is published without the licence of its data, the credit and the change notice that licence asks for");
});

test("every sealed record under examples/ still matches its seal", () => {
  assert.ok(exemples.length >= 1, "no example folder under examples/: this check read nothing");
  assert.deepEqual(exemples.flatMap(fautesDeScelle), [],
    "a sealed record was edited after it was sealed (or an example holds none): re-measure it, never re-seal by hand");
});

/* ───────────────────────── the witnesses: planted folders ───────────────────────── */

const README_BON = [
  "# Example",
  "",
  "## Licence of this folder",
  "",
  "`alerts.csv` and `record.json` are derived from IBM AMLworld (Altman, IBM), released under",
  "[CDLA-Sharing 1.0](https://cdla.dev/sharing-1-0/). Both files were changed from the original: rows mapped to alerts.",
  "The licence text is in `CDLA-Sharing-1.0.txt`, unmodified.",
  "",
  "## Open point",
  "",
  "Whether the alert file is Enhanced Data or Results is a point for a lawyer. We treat it as Enhanced Data.",
].join("\n");

const TEXTE_CDLA = "Community Data License Agreement - Sharing - Version 1.0\nA stand-in for the real text, for a planted folder.\n";

function releveScelle(valeur: number): string {
  const r: Record<string, unknown> = { kind: "monitoring-record", grille: [valeur, 2, 3] };
  r["empreinte"] = empreinteDuReleve(r);
  return JSON.stringify(r, null, 2);
}

/** A planted example folder; `retoucher` edits the files of the good one. */
function plante(retoucher: (f: Record<string, string>) => void = () => {}): string {
  const f: Record<string, string> = {
    "README.md": README_BON,
    "CDLA-Sharing-1.0.txt": TEXTE_CDLA,
    "alerts.csv": "alert_id,window_end,disposition\nal-1,2026-08-30,benign\n",
    "record.json": releveScelle(1),
  };
  retoucher(f);
  const d = mkdtempSync(join(tmpdir(), "exemples-"));
  for (const [nom, texte] of Object.entries(f)) {
    mkdirSync(dirname(join(d, nom)), { recursive: true });
    writeFileSync(join(d, nom), texte);
  }
  return d;
}

function avecDossier<T>(retoucher: (f: Record<string, string>) => void, travail: (d: string) => T): T {
  const d = plante(retoucher);
  try { return travail(d); } finally { rmSync(d, { recursive: true, force: true }); }
}

test("witness: a complete CDLA-Sharing example passes both checks, or the rules eat the good case", () => {
  avecDossier(() => {}, (d) => {
    assert.deepEqual(fautesDeLicence(d), []);
    assert.deepEqual(fautesDeScelle(d), []);
  });
});

test("witness: the licence check sees each missing piece, one at a time", () => {
  const cas: [string, (f: Record<string, string>) => void, RegExp][] = [
    ["no licence section", (f) => { f["README.md"] = README_BON.replace("## Licence of this folder", "## Licensing"); }, /no "Licence of this folder" section/],
    ["no README", (f) => { delete f["README.md"]; }, /no README\.md/],
    ["an empty section", (f) => { f["README.md"] = "# Example\n\n## Licence of this folder\n\n## Open point\n"; }, /names no licence/],
    ["no link", (f) => { f["README.md"] = README_BON.replace("(https://cdla.dev/sharing-1-0/)", ""); }, /links no licence text/],
    ["a file that is not there", (f) => { f["README.md"] = README_BON.replace("`alerts.csv`", "`gone.csv`"); }, /`gone\.csv`, which is not in the folder/],
    ["no licence text shipped", (f) => { delete f["CDLA-Sharing-1.0.txt"]; }, /licence text is not in the folder/],
    ["a licence file that is not the agreement", (f) => { f["CDLA-Sharing-1.0.txt"] = "all rights reserved\n"; }, /licence text is not in the folder/],
    ["no credit", (f) => { f["README.md"] = README_BON.replace("(Altman, IBM)", ""); }, /does not credit the provider/],
    ["no change notice", (f) => { f["README.md"] = README_BON.replace("were changed from the original", "were kept"); }, /no change notice/],
    ["a data file the section does not name", (f) => { f["extra.csv"] = "a,b\n1,2\n"; }, /data file extra\.csv is not named/],
    ["no lawyer point", (f) => { f["README.md"] = README_BON.replace("is a point for a lawyer", "is settled"); }, /"lawyer" is absent/],
    ["no stated reading", (f) => { f["README.md"] = README_BON.replace(" We treat it as Enhanced Data.", ""); }, /we treat/],
  ];
  for (const [quoi, retoucher, attendu] of cas) {
    avecDossier(retoucher, (d) => {
      const fautes = fautesDeLicence(d);
      assert.ok(fautes.some((x) => attendu.test(x)), `${quoi}: not seen. Faults: ${JSON.stringify(fautes)}`);
    });
  }
});

test("witness: a licence other than CDLA is held to the generic section only", () => {
  avecDossier((f) => {
    f["README.md"] = "# Example\n\n## Licence of this folder\n\n`labels.csv` is released under [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/).\n";
    f["labels.csv"] = "a,b\n";
    delete f["CDLA-Sharing-1.0.txt"];
    delete f["alerts.csv"];
  }, (d) => assert.deepEqual(fautesDeLicence(d), [], "the CDLA conditions leaked onto an example under another licence"));
});

test("witness: the seal check sees an edited record, an unsealed one, and a folder with none", () => {
  avecDossier((f) => { f["record.json"] = f["record.json"]!.replace('"grille": [\n    1,', '"grille": [\n    9,'); }, (d) => {
    assert.match(readFileSync(join(d, "record.json"), "utf8"), /\n {4}9,/, "the planted edit did not land: the case would test nothing");
    const fautes = fautesDeScelle(d);
    assert.ok(fautes.some((x) => /record\.json: .*SEAL DOES NOT MATCH/.test(x)), `an edited record was not refused: ${JSON.stringify(fautes)}`);
  });
  avecDossier((f) => { f["record.json"] = JSON.stringify({ kind: "monitoring-record", grille: [1, 2, 3] }); }, (d) => {
    assert.ok(fautesDeScelle(d).some((x) => /holds no sealed record/.test(x)), "a folder whose only record is unsealed was accepted");
  });
  avecDossier((f) => { delete f["record.json"]; }, (d) => {
    assert.ok(fautesDeScelle(d).some((x) => /holds no sealed record/.test(x)), "a folder without any record was accepted");
  });
  avecDossier((f) => { f["record.json"] = "{ not json"; }, (d) => {
    assert.ok(fautesDeScelle(d).some((x) => /not valid JSON/.test(x)), "a broken JSON was skipped");
  });
});

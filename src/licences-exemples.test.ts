/**
 * A FOLDER OF THIS REPOSITORY THAT IS NOT UNDER THE REPOSITORY'S LICENCE IS SAID SO IN LICENCES.md.
 *
 * `examples/amlworld/` carries data under CDLA-Sharing 1.0 while the repository declares
 * PolyForm-Noncommercial-1.0.0. A reader who opens LICENCES.md (the page a purchasing department
 * reads) must not be left to infer which applies where. The sentence is a fact, not an opinion
 * about what either licence allows: the folder, the licence it is under, and where the text is.
 *
 * LICENCES.md is generated (`npm run licences`; `--check` refuses a hand edit), so the sentence
 * is written by the generator, from the folders found on disk: a new folder that ships the CDLA
 * text is pointed at without anyone editing this file, and a folder that does not ship it is not.
 * What the wording is, in law, is not decided here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { document, dossiersSousAutreLicence } from "./licences.ts";

const racine = fileURLToPath(new URL("..", import.meta.url));
const PHRASE = (d: string) => `examples/${d}/ is not under the repository licence: it is under CDLA-Sharing 1.0, `
  + `see examples/${d}/README.md and examples/${d}/CDLA-Sharing-1.0.txt.`;

test("witness: the folders that ship the CDLA text are pointed at, the others are not, in a fixed sentence", () => {
  const d = mkdtempSync(join(tmpdir(), "licences-exemples-"));
  try {
    const poser = (nom: string, texte: string) => {
      mkdirSync(dirname(join(d, nom)), { recursive: true });
      writeFileSync(join(d, nom), texte);
    };
    poser("examples/zeta/CDLA-Sharing-1.0.txt", "x");
    poser("examples/alpha/CDLA-Sharing-1.0.txt", "x");
    poser("examples/plain/README.md", "x");
    poser("examples/other/LICENSE.txt", "x");
    poser("examples/stray.txt", "x");
    assert.deepEqual(dossiersSousAutreLicence(d), [PHRASE("alpha"), PHRASE("zeta")],
      "one sentence per folder holding the CDLA text, in name order, and nothing for the others");
    assert.deepEqual(dossiersSousAutreLicence(join(d, "nothing-here")), [], "no examples/ folder: nothing to say, and no error");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("witness: the document carries the sentences under their own heading, and is unchanged without them", () => {
  const sans = document([], "PolyForm-Noncommercial-1.0.0");
  assert.doesNotMatch(sans, /Folders under another licence/, "no heading when no folder is under another licence");
  assert.equal(document([], "PolyForm-Noncommercial-1.0.0", []), sans, "an empty list changes nothing");
  const avec = document([], "PolyForm-Noncommercial-1.0.0", [PHRASE("alpha"), PHRASE("zeta")]);
  assert.match(avec, /## Folders under another licence\n\n- examples\/alpha\/ is not under the repository licence: it is under CDLA-Sharing 1\.0,/);
  assert.ok(avec.includes(`- ${PHRASE("zeta")}\n`), "each sentence is one list item");
  assert.ok(avec.indexOf("## Folders under another licence") > avec.indexOf("## This tool's own licence")
    && avec.indexOf("## Folders under another licence") < avec.indexOf("## Bill of materials"),
    "the section follows the repository's own licence and precedes the bill of materials");
});

test("every folder of this repository that ships the CDLA text is pointed at in LICENCES.md", () => {
  const dossiers = dossiersSousAutreLicence(racine);
  assert.ok(dossiers.includes(PHRASE("amlworld")), `examples/amlworld/ ships the CDLA text and is not found (${dossiers.join(" | ")}): the walk reads nothing`);
  const md = readFileSync(join(racine, "LICENCES.md"), "utf8");
  for (const phrase of dossiers) assert.ok(md.includes(`- ${phrase}\n`), `LICENCES.md does not carry: ${phrase} (run npm run licences)`);
});

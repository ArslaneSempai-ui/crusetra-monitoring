import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { exigerCas } from "./cas.ts";
import { NATURES_SUSPECTES, NATURES_BENIGNES, CAS_PRIVES, chargerCasEtiquetes } from "./synthetic.ts";
import { jeuPresent, raisonAbsent } from "./jeux.ts";

/*
 * WITNESS: the full labelled case set is private, so no git index may track it.
 * The public sample must stay valid and, when the private set is present, must be what the
 * written rule draws from it.
 */
const RACINE = fileURLToPath(new URL("..", import.meta.url));
const ECHANTILLON = fileURLToPath(new URL("./echantillons/cas-20.json", import.meta.url));

test("the moved labelled case set is not tracked by git", () => {
  const suivis = execFileSync("git", ["ls-files", "--", CAS_PRIVES], { cwd: RACINE, encoding: "utf8" })
    .split("\n").filter(Boolean);
  assert.deepEqual(suivis, [], `this private set is still tracked: ${suivis.join(", ")}`);
});

type Echantillon = { seed: string; drawnFrom: number; cas: { id: string; nature: string }[] };

test("the public sample holds 20 valid cases and every family", () => {
  const e = JSON.parse(readFileSync(ECHANTILLON, "utf8")) as Echantillon;
  assert.equal(e.cas.length, 20);
  assert.equal(new Set(e.cas.map((c) => c.id)).size, 20);
  for (const c of e.cas) exigerCas(c as never);
  const presentes = new Set(e.cas.map((c) => c.nature));
  for (const n of [...NATURES_SUSPECTES, ...NATURES_BENIGNES]) assert.ok(presentes.has(n), `family missing from the sample: ${n}`);
});

test("the public sample is the draw of its written rule on the private set",
  { skip: jeuPresent(CAS_PRIVES) ? false : raisonAbsent(CAS_PRIVES) }, async () => {
  const { createHash } = await import("node:crypto");
  const e = JSON.parse(readFileSync(ECHANTILLON, "utf8")) as Echantillon;
  const tous = chargerCasEtiquetes();
  assert.equal(e.drawnFrom, tous.length);
  const h = (id: string) => createHash("sha256").update(`${e.seed}:${id}`).digest("hex");
  const choisis = new Set<string>();
  for (const n of [...new Set(tous.map((c) => c.nature))].sort()) {
    choisis.add(tous.filter((c) => c.nature === n).map((c) => c.id).sort((a, b) => h(a).localeCompare(h(b)))[0]!);
  }
  for (const id of tous.map((c) => c.id).sort((a, b) => h(a).localeCompare(h(b)))) {
    if (choisis.size >= 20) break;
    choisis.add(id);
  }
  assert.deepEqual([...choisis].sort(), e.cas.map((c) => c.id).sort());
  for (const c of e.cas) assert.deepEqual(c, tous.find((x) => x.id === c.id), `${c.id} differs from the private set`);
});

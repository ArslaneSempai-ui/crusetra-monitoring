/**
 * THE SEALED RECORDS UNDER examples/ TRAVEL WITH THEIR SIGNATURE, OR THEY SAY WHY NOT.
 *
 * `signature-livree.test.ts` (shared across the family, byte for byte, source: cascade) walks the
 * repository root only: a sealed JSON tracked by git there must have a tracked `.signature.json`
 * that verifies against `cle-publique.pem` over the seal's bytes. `examples/` escapes it, so a
 * sealed record published under `examples/amlworld/` shipped with nothing to verify it by.
 *
 * This case walks `examples/` with the same three requirements. It is written here, not in the
 * shared file, so that the sibling repositories (which carry a byte-identical copy of that file,
 * compared by `couche-famille.test.ts`) do not fall behind on a change only this repository needs.
 * Routing did the same with its own `signature-exemples.test.ts`.
 *
 * A record published unsigned on purpose is declared in SANS_SIGNATURE with its reason and its
 * date, never silently, and the declaration EXPIRES: once the record has a valid signature, the
 * entry protects nothing and this case asks for it to be removed. The witness plays each refusal
 * on fabricated files, because a zero from a walk that never looked proves nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPublicKey, verify as verifierBrut, generateKeyPairSync, sign as signerBrut } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const racine = fileURLToPath(new URL("..", import.meta.url));
const SCEAU = /^[0-9a-f]{16}$/;

/** A sealed record published without a signature on purpose: path from the root, reason, date. */
export const SANS_SIGNATURE: Record<string, { pourquoi: string; depuis: string }> = {};

/** The tracked JSON files under examples/ that carry a seal at their root, from the root. */
export function relevesScellesDesExemples(dir: string, suivis: ReadonlySet<string>): string[] {
  return [...suivis].filter((n) => n.startsWith("examples/") && n.endsWith(".json") && !n.endsWith(".signature.json"))
    .filter((n) => {
      try {
        const o: unknown = JSON.parse(readFileSync(join(dir, n), "utf8"));
        return typeof o === "object" && o !== null && SCEAU.test(String((o as Record<string, unknown>)["empreinte"] ?? ""));
      } catch { return false; }
    })
    .sort();
}

/** What a record under examples/ lacks to be checked by a reader who does not trust us. */
export function manquesDUnExemple(dir: string, nom: string, suivis: ReadonlySet<string>, clePubliquePem: string | null): string[] {
  const sig = nom.replace(/\.json$/, ".signature.json");
  if (!existsSync(join(dir, sig))) return [`${nom}: no ${sig} beside it; the record is sealed but nothing says who issued it`];
  if (!suivis.has(sig)) return [`${nom}: ${sig} is on disk and not tracked by git; a reader who clones gets the record and nothing to verify it with`];
  if (clePubliquePem === null) return [`${nom}: ${sig} is shipped, but the repository ships no cle-publique.pem`];
  let s: { alg?: string; valeur?: string };
  try { s = JSON.parse(readFileSync(join(dir, sig), "utf8")) as typeof s; }
  catch (e) { return [`${nom}: ${sig} is unreadable (${e instanceof Error ? e.message : String(e)})`]; }
  const sceau = String((JSON.parse(readFileSync(join(dir, nom), "utf8")) as Record<string, unknown>)["empreinte"]);
  let bon = false;
  try { bon = verifierBrut(null, Buffer.from(sceau, "utf8"), createPublicKey(clePubliquePem), Buffer.from(String(s.valeur ?? ""), "base64")); }
  catch { bon = false; }
  return bon ? [] : [`${nom}: ${sig} does not verify against cle-publique.pem over the seal ${sceau}`];
}

/** The declarations that no longer protect anything: the record is gone, or it now carries a valid signature. */
export function exemptionsPerimees(dir: string, suivis: ReadonlySet<string>, cle: string | null,
  declarees: Record<string, { pourquoi: string; depuis: string }> = SANS_SIGNATURE): string[] {
  const perimees: string[] = [];
  for (const [nom, { pourquoi, depuis }] of Object.entries(declarees)) {
    if (!pourquoi.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(depuis)) perimees.push(`${nom}: a declaration needs its reason and its date (YYYY-MM-DD)`);
    else if (!existsSync(join(dir, nom))) perimees.push(`${nom}: declared unsigned but the record is not there; remove the entry`);
    else if (manquesDUnExemple(dir, nom, suivis, cle).length === 0) perimees.push(`${nom}: declared unsigned but now carries a valid signature; remove the entry`);
  }
  return perimees;
}

test("every sealed record shipped under examples/ is signed against the repository's key, or declared unsigned with its reason", (t) => {
  let suivis: Set<string>;
  try {
    suivis = new Set(execFileSync("git", ["-C", racine, "ls-files", "--", "examples"], { encoding: "utf8" }).split("\n").filter(Boolean));
  } catch {
    return t.skip("not a git checkout: the guard looks at what git ships, and without git it cannot tell a published file from a working one");
  }
  const cle = existsSync(join(racine, "cle-publique.pem")) ? readFileSync(join(racine, "cle-publique.pem"), "utf8") : null;
  const tous = relevesScellesDesExemples(racine, suivis);
  assert.ok(tous.includes("examples/amlworld/amlworld-alerts-measured.json"),
    `the AMLworld record is not among the sealed records found under examples/ (${tous.join(", ")}): the walk reads nothing`);
  const fautes = tous.filter((n) => !(n in SANS_SIGNATURE)).flatMap((n) => manquesDUnExemple(racine, n, suivis, cle));
  assert.deepEqual(fautes, [], "sealed records under examples/ are not verifiable by a reader who does not trust us");
  assert.deepEqual(exemptionsPerimees(racine, suivis, cle), [], "a declaration of an unsigned record no longer protects anything");
});

test("witness: the walk refuses a missing signature, an untracked one and one from another key, and the exemption expires", () => {
  const d = mkdtempSync(join(tmpdir(), "signature-exemples-"));
  try {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const sceau = "0123456789abcdef";
    const nom = "examples/x/x-measured.json";
    mkdirSync(dirname(join(d, nom)), { recursive: true });
    writeFileSync(join(d, nom), JSON.stringify({ empreinte: sceau }));
    writeFileSync(join(d, "examples/x/config.json"), JSON.stringify({ rien: 1 }));
    const suivisSeuls = new Set([nom, "examples/x/config.json"]);
    assert.deepEqual(relevesScellesDesExemples(d, suivisSeuls), [nom], "only a tracked JSON that carries a seal is a sealed record");

    assert.match(manquesDUnExemple(d, nom, suivisSeuls, pem)[0] ?? "", /no examples\/x\/x-measured\.signature\.json beside it/, "an absent signature must be named");
    const sig = "examples/x/x-measured.signature.json";
    const valeur = signerBrut(null, Buffer.from(sceau, "utf8"), privateKey).toString("base64");
    writeFileSync(join(d, sig), JSON.stringify({ alg: "Ed25519", valeur }));
    assert.match(manquesDUnExemple(d, nom, suivisSeuls, pem)[0] ?? "", /not tracked by git/, "a signature on disk and not tracked must be named");
    const suivis = new Set([nom, sig]);
    assert.deepEqual(manquesDUnExemple(d, nom, suivis, pem), [], "the right signature, tracked, must pass, or the guard has eaten the tool");
    const autre = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
    assert.match(manquesDUnExemple(d, nom, suivis, autre)[0] ?? "", /does not verify/, "a signature checked against another key must fall");

    /* The exemption: valid while the record is unsigned, refused once it is signed, once it is gone, or with no reason. */
    const declaree = { [nom]: { pourquoi: "not signed yet", depuis: "2026-10-11" } };
    assert.deepEqual(exemptionsPerimees(d, suivis, pem, {}), []);
    assert.match(exemptionsPerimees(d, suivis, pem, declaree)[0] ?? "", /now carries a valid signature; remove the entry/);
    rmSync(join(d, sig));
    assert.deepEqual(exemptionsPerimees(d, suivisSeuls, pem, declaree), [], "an exemption for an unsigned record is still good");
    assert.match(exemptionsPerimees(d, suivisSeuls, pem, { [nom]: { pourquoi: " ", depuis: "2026-10-11" } })[0] ?? "", /needs its reason and its date/);
    assert.match(exemptionsPerimees(d, suivisSeuls, pem, { [nom]: { pourquoi: "x", depuis: "soon" } })[0] ?? "", /needs its reason and its date/);
    assert.match(exemptionsPerimees(d, suivisSeuls, pem, { "examples/y/gone.json": { pourquoi: "x", depuis: "2026-10-11" } })[0] ?? "", /record is not there/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

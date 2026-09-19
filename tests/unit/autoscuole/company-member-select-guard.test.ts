import fs from "fs";
import path from "path";

/**
 * REG-498 — chi legge `CompanyMember` da un job deve passare un `select`.
 *
 * `include` (o nessuna proiezione) fa chiedere a Prisma **tutte** le colonne
 * scalari del modello. `CompanyMember` è il modello che cambia più spesso, e
 * ogni colonna nuova esiste nel client generato prima di esistere nel DB di
 * quell'ambiente: in quella finestra — fra il deploy e la sua migrazione — la
 * query muore con `42703 column does not exist`.
 *
 * Su una pagina lo si vede subito. Dentro un cron che gira ogni minuto no: i
 * messaggi smettono di partire e nessuno se ne accorge. È successo il
 * 19/09/2026 con `resolveRecipients` in `communications.ts`.
 *
 * La lista dei file non si scrive a mano: si ricava dagli import dei task in
 * `trigger/`. Una lista manuale invecchia in silenzio — è successo entro l'ora,
 * con il job nuovo di REG-442.
 */

const REPO_ROOT = path.join(__dirname, "..", "..", "..");

const TRIGGER_DIR = path.join(REPO_ROOT, "trigger");

/** I task Trigger.dev, cioè i punti d'ingresso dei cron. */
const triggerFiles = fs
  .readdirSync(TRIGGER_DIR)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => path.join("trigger", f));

/**
 * I moduli `@/...` importati dai task, risolti a file reali. Un livello solo:
 * basta a coprire dove vivono davvero le query dei job, e non trascina mezza
 * codebase dentro il test.
 */
const importedByJobs = (): string[] => {
  const found = new Set<string>();

  for (const rel of triggerFiles) {
    const source = fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
    const imports = /from\s+"@\/([^"]+)"/g;

    for (let m = imports.exec(source); m; m = imports.exec(source)) {
      for (const candidate of [`${m[1]}.ts`, path.join(m[1], "index.ts")]) {
        if (fs.existsSync(path.join(REPO_ROOT, candidate))) {
          found.add(candidate);
          break;
        }
      }
    }
  }

  return [...found].sort();
};

// `trigger/prisma.ts` è sia un file di trigger/ sia un import: dedupe.
const JOB_REACHABLE = [...new Set([...triggerFiles, ...importedByJobs()])];

/** Estrae il corpo `{...}` che segue una posizione, bilanciando le graffe. */
const objectArgAt = (source: string, openBraceIndex: number): string => {
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(openBraceIndex, i + 1);
    }
  }
  throw new Error("graffa non chiusa: il file non compila?");
};

type Finding = { file: string; line: number; snippet: string };

const readsWithoutSelect = (relPath: string): Finding[] => {
  const source = fs.readFileSync(path.join(REPO_ROOT, relPath), "utf8");
  const findings: Finding[] = [];

  // `prisma.companyMember.findMany({`, `.findFirst({`, `.findUnique({`,
  // con o senza prefisso (tx.companyMember…, this.prisma.companyMember…).
  const call = /companyMember\s*\.\s*(findMany|findFirst|findUnique|findUniqueOrThrow|findFirstOrThrow)\s*\(\s*\{/g;

  for (let m = call.exec(source); m; m = call.exec(source)) {
    const braceIndex = source.indexOf("{", m.index + m[0].length - 1);
    const arg = objectArgAt(source, braceIndex);

    // `select:` al primo livello dell'argomento (non dentro un include annidato).
    let depth = 0;
    let hasTopLevelSelect = false;
    for (let i = 0; i < arg.length; i++) {
      const ch = arg[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (depth === 1 && arg.startsWith("select:", i)) {
        hasTopLevelSelect = true;
        break;
      }
    }

    if (!hasTopLevelSelect) {
      findings.push({
        file: relPath,
        line: source.slice(0, m.index).split("\n").length,
        snippet: arg.replace(/\s+/g, " ").slice(0, 120),
      });
    }
  }

  return findings;
};

describe("letture di CompanyMember dai job (REG-498)", () => {
  it("copre i moduli dove i job leggono davvero CompanyMember", () => {
    // Se un refactor sposta le query altrove e la derivazione dagli import
    // smette di trovarle, questo si accorge del buco.
    expect(JOB_REACHABLE).toEqual(
      expect.arrayContaining([
        "lib/autoscuole/communications.ts",
        "lib/autoscuole/theory-reminders.ts",
        "lib/autoscuole/exam-ready-nudge.ts",
      ]),
    );
    expect(JOB_REACHABLE.length).toBeGreaterThanOrEqual(6);
  });

  it("il guard riconosce una lettura senza select", () => {
    // Sanità del test stesso: senza questo, un regex rotto lo farebbe passare
    // sempre e la guardia non guarderebbe niente.
    const fixture = path.join(REPO_ROOT, "tests", "unit", "autoscuole", "__fixture-bad-read.ts");
    fs.writeFileSync(
      fixture,
      `export const bad = () => prisma.companyMember.findMany({\n  where: { companyId },\n  include: { user: { select: { email: true } } },\n});\n`,
    );
    try {
      const found = readsWithoutSelect(path.relative(REPO_ROOT, fixture));
      expect(found).toHaveLength(1);
      expect(found[0].snippet).toContain("include");
    } finally {
      fs.unlinkSync(fixture);
    }
  });

  it.each(JOB_REACHABLE)("%s proietta sempre con select", (relPath) => {
    const findings = readsWithoutSelect(relPath);
    const report = findings
      .map((f) => `  ${f.file}:${f.line} → ${f.snippet}`)
      .join("\n");

    expect(
      findings.length === 0 ? "" : `letture di CompanyMember senza select:\n${report}`,
    ).toBe("");
  });
});

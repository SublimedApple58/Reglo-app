import fs from "node:fs";
import path from "node:path";

/**
 * La guardia di REG-458.
 *
 * Prima di REG-458 il percorso patente **era** l'allievo: categoria, cambio,
 * numero e data stavano su `CompanyMember` e chiunque poteva riscriverli con una
 * `updateMany` di due righe. E' esattamente cosi' che lo storico si perdeva — e
 * in produzione quattro persone del consorzio erano state registrate due volte
 * (C+CQC, D+DE) per aggirare la cosa.
 *
 * Ora quei campi sono lo **specchio** della riga del percorso, e devono muoversi
 * solo insieme a lei. Questo test legge i sorgenti e fallisce se qualcuno torna
 * a scriverli per conto proprio: non verifica un comportamento, impedisce che il
 * problema si ripresenti.
 */

const ROOT = path.resolve(__dirname, "../../..");

/** I campi che sono lo specchio del percorso, e che quindi nessuno tocca a mano. */
const CAMPI_SPECCHIO = [
  "licenseCategory",
  "transmission",
  "licenseNumber",
  "licenseObtainedAt",
  "activeLicensePathId",
] as const;

/**
 * Chi puo' ancora scriverli, e perche'. Ogni voce e' un'eccezione **motivata**:
 * se ne aggiungi una, la motivazione va scritta qui, non nel codice.
 */
const AMMESSI: Record<string, string> = {
  "lib/autoscuole/license-path-writes.ts":
    "e' la struttura stessa: e' l'unico posto che deve scriverli, sempre insieme alla riga del percorso",
  "lib/actions/autoscuole-settings.actions.ts":
    "unica scrittura MASSIVA (REG-424, seed del percorso di default sugli allievi " +
    "self-registered ancora senza categoria): aggiorna allievi e percorsi aperti " +
    "con gli stessi valori nella stessa transazione",
  "scripts/seed-e2e.ts":
    "fixture degli e2e: crea membri da zero, non modifica un percorso esistente. " +
    "Il percorso gli viene creato da ensureActivePath alla prima operazione utile",
};

const SORGENTI = ["lib", "app", "scripts"];

const elencaFile = (dir: string): string[] => {
  const base = path.join(ROOT, dir);
  if (!fs.existsSync(base)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...elencaFile(rel));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
};

const tuttiIFile = SORGENTI.flatMap(elencaFile);

/**
 * Il contenuto bilanciato di una parentesi/graffa aperta in `apertura`.
 * Serve a non sbordare: una finestra a caratteri fissi finirebbe per leggere il
 * codice che viene dopo la chiamata e accusare file innocenti.
 */
const bloccoBilanciato = (codice: string, apertura: number): string => {
  const coppie: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const chiusura = coppie[codice[apertura]];
  if (!chiusura) return "";
  let livello = 0;
  for (let i = apertura; i < codice.length; i += 1) {
    const c = codice[i];
    if (c === codice[apertura]) livello += 1;
    else if (c === chiusura) {
      livello -= 1;
      if (livello === 0) return codice.slice(apertura + 1, i);
    }
  }
  return codice.slice(apertura);
};

/**
 * I blocchi `data: { ... }` delle scritture su `companyMember` — e solo quelli:
 * un `select` o un `where` che nomina `licenseCategory` sta leggendo, non
 * scrivendo, e accusarlo renderebbe la guardia rumorosa fino a farla disattivare.
 */
const scrittureSuMembro = (codice: string): string[] => {
  const blocchi: string[] = [];
  const re = /companyMember\.(update|updateMany|upsert|create|createMany)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(codice)) !== null) {
    const argomenti = bloccoBilanciato(codice, re.lastIndex - 1);
    const dataRe = /\bdata\s*:\s*\{/g;
    let d: RegExpExecArray | null;
    while ((d = dataRe.exec(argomenti)) !== null) {
      blocchi.push(bloccoBilanciato(argomenti, dataRe.lastIndex - 1));
    }
  }
  return blocchi;
};

describe("lo specchio del percorso patente non si scrive a mano", () => {
  it.each(CAMPI_SPECCHIO)("nessuno scrive %s su CompanyMember", (campo) => {
    const colpevoli: string[] = [];
    for (const file of tuttiIFile) {
      if (file in AMMESSI) continue;
      const codice = fs.readFileSync(path.join(ROOT, file), "utf8");
      if (!codice.includes("companyMember.")) continue;
      for (const blocco of scrittureSuMembro(codice)) {
        if (new RegExp(`\\b${campo}\\s*:`).test(blocco)) {
          colpevoli.push(file);
          break;
        }
      }
    }
    expect({ campo, colpevoli }).toEqual({ campo, colpevoli: [] });
  });

  it("il rilevatore vede davvero una scrittura (controllo positivo)", () => {
    // Senza questo, la guardia potrebbe passare perche' il rilevatore si e'
    // rotto invece che perche' il codice e' a posto — ed e' il modo piu' comune
    // in cui un test di questo tipo smette di proteggere senza dirlo.
    const struttura = fs.readFileSync(
      path.join(ROOT, "lib/autoscuole/license-path-writes.ts"),
      "utf8",
    );
    const blocchi = scrittureSuMembro(struttura);
    expect(blocchi.length).toBeGreaterThan(0);
    expect(blocchi.some((b) => /\blicenseCategory\s*:/.test(b))).toBe(true);
    expect(blocchi.some((b) => /\bactiveLicensePathId\s*:/.test(b))).toBe(true);
  });

  it("un select o un where non vengono scambiati per una scrittura", () => {
    // La controprova dell'altro verso: la guardia deve restare silenziosa su
    // chi legge, o diventerebbe rumore e finirebbe disattivata.
    const finto = `
      await prisma.companyMember.update({
        where: { companyId_userId: { companyId, userId } },
        select: { licenseCategory: true, transmission: true },
        data: { studentPhase: "PRATICA" },
      });
    `;
    const blocchi = scrittureSuMembro(finto);
    expect(blocchi).toHaveLength(1);
    expect(blocchi[0]).toContain("studentPhase");
    expect(blocchi[0]).not.toContain("licenseCategory");
  });

  it("ogni file ammesso esiste davvero (la lista bianca non invecchia in silenzio)", () => {
    for (const file of Object.keys(AMMESSI)) {
      expect({ file, esiste: fs.existsSync(path.join(ROOT, file)) }).toEqual({
        file,
        esiste: true,
      });
    }
  });

  it("ogni eccezione ha una motivazione scritta", () => {
    for (const [file, motivo] of Object.entries(AMMESSI)) {
      expect({ file, lunga: motivo.trim().length > 30 }).toEqual({ file, lunga: true });
    }
  });

  it("l'indice unico parziale sul percorso aperto e' nella migrazione", () => {
    // Prisma non sa esprimere un indice parziale: vive solo in SQL grezzo, e se
    // qualcuno rigenera la migrazione sparisce senza che niente se ne accorga —
    // e due percorsi aperti sullo stesso allievo romperebbero lo specchio.
    const dir = path.join(ROOT, "prisma/migrations");
    const sql = fs
      .readdirSync(dir)
      .filter((n) => fs.existsSync(path.join(dir, n, "migration.sql")))
      .map((n) => fs.readFileSync(path.join(dir, n, "migration.sql"), "utf8"))
      .join("\n");
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "AutoscuolaLicensePath_companyId_studentId_active_key"',
    );
    expect(sql).toMatch(/WHERE "status" = 'active'/);
  });
});

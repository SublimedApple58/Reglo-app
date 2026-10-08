import fs from "node:fs";
import path from "node:path";

/**
 * La guardia di REG-604.
 *
 * Il difetto che REG-604 ha chiuso non era un bug in una riga: era che
 * **nascere ignorando i canali era la cosa più facile da fare**. Chi scriveva
 * una notifica nuova copiava il punto di invio accanto — una `push` seguita da
 * una `sendDynamicEmail` — e nessuno dei due guardava cosa l'autoscuola avesse
 * configurato.
 *
 * Questo test legge i sorgenti e fallisce se quelle due funzioni ricompaiono
 * fuori dalla lista bianca. Non verifica un comportamento: impedisce che il
 * problema si ripresenti.
 */

const ROOT = path.resolve(__dirname, "../../..");

/**
 * Chi può ancora chiamare direttamente push ed email, e perché.
 *
 * Ogni voce è un'eccezione **motivata**: se ne aggiungi una, la motivazione va
 * scritta qui, non nel codice.
 */
const AMMESSI: Record<string, string> = {
  "lib/autoscuole/notify.ts":
    "è la struttura stessa: è l'unico posto che deve chiamarle",
  "lib/autoscuole/communications.ts":
    "i promemoria hanno la loro cascata (regole + template Meta) e rispettano già i canali",
  "lib/autoscuole/push.ts": "è l'implementazione della push",
  "lib/actions/support.actions.ts":
    "avvisi interni al team Reglo: non è l'autoscuola che parla ai suoi utenti",
  "lib/auth/password-reset.ts":
    "autenticazione: filtrarla impedirebbe di rientrare nel proprio account",
  "email/index.ts":
    "invito a una company: l'invitato non è ancora un utente dell'autoscuola",
  "lib/actions/autoscuole.actions.ts":
    "broadcast del titolare e test push: restituiscono il conteggio degli invii alla UI, " +
    "cosa che la struttura non fa (registra invece di restituire). Sono strumenti del " +
    "titolare, non comunicazioni automatiche",
};

const SORGENTI = ["lib", "app", "email"];

const elencaFile = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...elencaFile(rel));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
};

const tuttiIFile = SORGENTI.flatMap(elencaFile);

describe("nessun invio fuori dalla struttura comune", () => {
  it.each([
    ["sendAutoscuolaPushToUsers", /sendAutoscuolaPushToUsers\s*\(/],
    ["sendDynamicEmail", /sendDynamicEmail\s*\(/],
  ])("%s non compare fuori dalla lista bianca", (_nome, pattern) => {
    const colpevoli = tuttiIFile.filter((file) => {
      if (file in AMMESSI) return false;
      const codice = fs.readFileSync(path.join(ROOT, file), "utf8");
      // L'import non è una chiamata.
      const senzaImport = codice.replace(/^import[\s\S]*?from\s+"[^"]+";$/gm, "");
      return pattern.test(senzaImport);
    });
    expect(colpevoli).toEqual([]);
  });

  it("la lista bianca non cresce di nascosto", () => {
    // Se questo numero cambia, qualcuno ha aggiunto un'eccezione: che sia una
    // scelta vista, non un effetto collaterale.
    expect(Object.keys(AMMESSI)).toHaveLength(7);
    for (const motivo of Object.values(AMMESSI)) {
      expect(motivo.length).toBeGreaterThan(20);
    }
  });
});

describe("WhatsApp: nessuno lo dichiara senza un template approvato", () => {
  it("ogni templateKind passato a notifyAutoscuolaUser esiste nel catalogo", () => {
    const catalogo = fs.readFileSync(
      path.join(ROOT, "lib/autoscuole/whatsapp-templates.ts"),
      "utf8",
    );
    const approvati = new Set(
      [...catalogo.matchAll(/^ {2}([a-z_]+): \{$/gm)].map((m) => m[1]),
    );
    expect(approvati.size).toBeGreaterThanOrEqual(6);

    const dichiarati = tuttiIFile.flatMap((file) => {
      const codice = fs.readFileSync(path.join(ROOT, file), "utf8");
      return [...codice.matchAll(/templateKind:\s*"([a-z_]+)"/g)].map((m) => ({
        file,
        kind: m[1],
      }));
    });

    for (const { file, kind } of dichiarati) {
      expect({ file, kind, approvato: approvati.has(kind) }).toEqual({
        file,
        kind,
        approvato: true,
      });
    }
  });
});

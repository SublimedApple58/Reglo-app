import {
  asLicensePathStatus,
  closedPathsNewestFirst,
  historySectionTitle,
  isPathOpen,
  isQualification,
  openPath,
  pathForDate,
  pathLabel,
  currentPath,
  lessonsPathFilterId,
  ALL_LESSON_PATHS,
} from "@/lib/autoscuole/license-paths";

/**
 * REG-458 — il modulo puro dei percorsi patente.
 *
 * Il pezzo che conta davvero e' `pathForDate`: e' la regola che ha preso il
 * posto di una colonna `licensePathId` sugli appuntamenti. Una colonna del
 * genere andava scritta in tredici punti diversi del prodotto, e sarebbe bastato
 * dimenticarne uno perche' il dato cominciasse a mentire in silenzio.
 */

const percorso = (over: Partial<Parameters<typeof pathLabel>[0]> & { startedAt?: string } = {}) => ({
  licenseCategory: "B",
  transmission: "manual",
  status: "obtained",
  startedAt: "2026-01-01T00:00:00.000Z",
  closedAt: "2026-06-01T00:00:00.000Z",
  obtainedAt: "2026-06-01T00:00:00.000Z",
  licenseNumber: null,
  ...over,
});

describe("stato del percorso", () => {
  it("riconosce i tre stati previsti", () => {
    expect(asLicensePathStatus("active")).toBe("active");
    expect(asLicensePathStatus("obtained")).toBe("obtained");
    expect(asLicensePathStatus("abandoned")).toBe("abandoned");
  });

  it("qualunque cosa ignota vale 'in corso', non esplode", () => {
    // Il dato storico e' quello che e': uno stato sconosciuto non deve far
    // sparire un percorso dalla UI.
    expect(asLicensePathStatus("iscritto")).toBe("active");
    expect(asLicensePathStatus(null)).toBe("active");
    expect(asLicensePathStatus(undefined)).toBe("active");
  });

  it("solo 'active' e' aperto", () => {
    expect(isPathOpen(percorso({ status: "active" }))).toBe(true);
    expect(isPathOpen(percorso({ status: "obtained" }))).toBe(false);
    expect(isPathOpen(percorso({ status: "abandoned" }))).toBe(false);
  });
});

describe("qualificazioni", () => {
  it("CQC e ADR non sono patenti", () => {
    expect(isQualification("CQC")).toBe(true);
    expect(isQualification("ADR")).toBe(true);
  });

  it("le patenti vere no", () => {
    for (const c of ["B", "BE", "C", "CE", "D", "A", "A2", "AM", "B1"]) {
      expect({ c, qualifica: isQualification(c) }).toEqual({ c, qualifica: false });
    }
  });
});

describe("etichetta del percorso", () => {
  it("patente e cambio", () => {
    expect(pathLabel(percorso({ licenseCategory: "B", transmission: "manual" }))).toBe(
      "B · Manuale",
    );
    expect(pathLabel(percorso({ licenseCategory: "A2", transmission: "automatic" }))).toBe(
      "A2 · Automatico",
    );
  });

  it("su una qualificazione il cambio non si scrive: la CQC non e' 'manuale'", () => {
    expect(pathLabel(percorso({ licenseCategory: "CQC", transmission: "manual" }))).toBe("CQC");
    expect(pathLabel(percorso({ licenseCategory: "ADR", transmission: "manual" }))).toBe("ADR");
  });

  it("senza categoria resta un trattino, non una categoria inventata", () => {
    expect(pathLabel(percorso({ licenseCategory: null }))).toBe("—");
    expect(pathLabel(percorso({ licenseCategory: "  " }))).toBe("—");
  });

  it("senza cambio mostra la sola patente", () => {
    expect(pathLabel(percorso({ licenseCategory: "C", transmission: null }))).toBe("C");
  });
});

describe("titolo della sezione storico", () => {
  it("solo patenti → 'Patenti conseguite'", () => {
    expect(historySectionTitle([percorso({ licenseCategory: "B" })])).toBe(
      "Patenti conseguite",
    );
  });

  it("basta una qualificazione perche' 'patenti' diventi una bugia", () => {
    expect(
      historySectionTitle([
        percorso({ licenseCategory: "C" }),
        percorso({ licenseCategory: "CQC" }),
      ]),
    ).toBe("Percorsi conclusi");
  });
});

describe("storico ordinato", () => {
  it("tiene solo i chiusi, dal piu' recente", () => {
    const chiusi = closedPathsNewestFirst([
      percorso({ licenseCategory: "B", closedAt: "2024-05-01T00:00:00.000Z" }),
      percorso({ licenseCategory: "A", status: "active", closedAt: null }),
      percorso({ licenseCategory: "C", closedAt: "2026-02-01T00:00:00.000Z" }),
    ]);
    expect(chiusi.map((p) => p.licenseCategory)).toEqual(["C", "B"]);
  });

  it("il percorso aperto si trova da solo", () => {
    const aperto = openPath([
      percorso({ licenseCategory: "B" }),
      percorso({ licenseCategory: "A", status: "active" }),
    ]);
    expect(aperto?.licenseCategory).toBe("A");
    expect(openPath([percorso({ licenseCategory: "B" })])).toBeNull();
  });
});

describe("a quale percorso appartiene una guida", () => {
  const b = percorso({
    licenseCategory: "B",
    startedAt: "2026-01-01T00:00:00.000Z",
    closedAt: "2026-06-01T00:00:00.000Z",
  });
  const a = percorso({
    licenseCategory: "A",
    status: "active",
    startedAt: "2026-07-01T00:00:00.000Z",
    closedAt: null,
  });

  it("una guida dentro il primo percorso e' del primo", () => {
    expect(pathForDate([b, a], "2026-03-15T10:00:00.000Z")?.licenseCategory).toBe("B");
  });

  it("una guida dopo l'inizio del secondo e' del secondo", () => {
    expect(pathForDate([b, a], "2026-09-10T10:00:00.000Z")?.licenseCategory).toBe("A");
  });

  it("nel buco fra i due vince quello prima: nessuna data resta senza risposta", () => {
    // Il 15 giugno la B e' chiusa e la A non e' ancora cominciata. Con le
    // finestre [startedAt, closedAt] questa guida non sarebbe di nessuno.
    expect(pathForDate([b, a], "2026-06-15T10:00:00.000Z")?.licenseCategory).toBe("B");
  });

  it("una guida piu' vecchia di tutti i percorsi cade sul piu' vecchio", () => {
    // Capita davvero: il backfill fa partire il percorso dalla data di
    // iscrizione, e qualche guida storica puo' precederla.
    expect(pathForDate([b, a], "2025-11-01T10:00:00.000Z")?.licenseCategory).toBe("B");
  });

  it("l'ordine in ingresso non conta", () => {
    expect(pathForDate([a, b], "2026-03-15T10:00:00.000Z")?.licenseCategory).toBe("B");
  });

  it("senza percorsi, o con una data assurda, non indovina niente", () => {
    expect(pathForDate([], "2026-03-15T10:00:00.000Z")).toBeNull();
    expect(pathForDate([b, a], "non-una-data")).toBeNull();
  });

  it("con un percorso solo risponde sempre quello — il caso di tutti, oggi", () => {
    // Dopo il backfill ogni allievo ha esattamente un percorso: e' il motivo per
    // cui il giorno del rilascio non cambia niente per nessuno.
    for (const quando of ["2020-01-01", "2026-03-15", "2030-12-31"]) {
      expect(pathForDate([b], quando)?.licenseCategory).toBe("B");
    }
  });
});

/**
 * Il filtro del tab Guide. Nasce da un bug vero trovato in QA su produzione il
 * 9 ottobre, il giorno dopo il rilascio: su un allievo con A2 conseguita e B
 * appena avviata, il tab Guide si presentava etichettato sul percorso VECCHIO
 * (A2) invece che su quello in corso, e «Mostra tutte» sembrava non fare niente
 * perche' tutte le guide erano comunque dell'A2.
 */
/** Come `percorso`, ma con l'id: il filtro ragiona sugli id. */
const percorsoConId = (
  id: string,
  over: Partial<Parameters<typeof percorso>[0]> = {},
): ReturnType<typeof percorso> & { id: string } => ({ id, ...percorso(over) });

describe("lessonsPathFilterId", () => {
  const a2 = percorsoConId("a2", {
    licenseCategory: "A2",
    status: "obtained",
    startedAt: "2026-08-28T13:49:19.000Z",
    closedAt: "2026-09-11T09:47:44.000Z",
  });
  const b = percorsoConId("b", {
    licenseCategory: "B",
    status: "active",
    startedAt: "2026-10-08T23:22:05.000Z",
    closedAt: null,
    obtainedAt: null,
  });

  it("con un percorso solo non filtra: niente banner per quasi tutti gli allievi", () => {
    expect(lessonsPathFilterId([b], null)).toBeNull();
    // e nemmeno se qualcuno avesse una scelta appiccicata addosso
    expect(lessonsPathFilterId([b], "b")).toBeNull();
    expect(lessonsPathFilterId([], null)).toBeNull();
  });

  it("il default e' il percorso IN CORSO, non quello vecchio chiuso", () => {
    // Il bug del 9 ottobre: qui tornava "a2".
    expect(lessonsPathFilterId([a2, b], null)).toBe("b");
    expect(lessonsPathFilterId([b, a2], null)).toBe("b");
  });

  it("«Mostra tutte» non filtra, e non viene ri-filtrato dal default", () => {
    expect(lessonsPathFilterId([a2, b], ALL_LESSON_PATHS)).toBeNull();
  });

  it("«Vedi guide» su un percorso chiuso lo rispetta", () => {
    expect(lessonsPathFilterId([a2, b], "a2")).toBe("a2");
  });

  it("una scelta che non esiste piu' ricade sul percorso corrente", () => {
    // Register ricaricato, percorso spostato: meglio il default che zero guide
    // senza spiegazione.
    expect(lessonsPathFilterId([a2, b], "percorso-fantasma")).toBe("b");
  });

  it("su un patentato senza percorsi aperti il corrente e' l'ultimo chiuso", () => {
    const vecchia = percorsoConId("am", {
      licenseCategory: "AM",
      status: "abandoned",
      startedAt: "2026-01-01T00:00:00.000Z",
      closedAt: "2026-02-01T00:00:00.000Z",
    });
    expect(currentPath([vecchia, a2])?.licenseCategory).toBe("A2");
    expect(lessonsPathFilterId([vecchia, a2], null)).toBe("a2");
  });

  it("currentPath preferisce sempre il percorso aperto", () => {
    expect(currentPath([a2, b])?.licenseCategory).toBe("B");
    expect(currentPath([])).toBeNull();
  });
});

/**
 * Il caso di Marco Reglo (Autoscuola Maltese) esattamente come sta in
 * produzione: due guide di settembre, A2 chiusa l'11 settembre, B avviata l'8
 * ottobre. Entrambe le guide sono dell'A2 — la B e' nuova e non ne ha ancora
 * nessuna. E' il motivo per cui «Mostra tutte» sembrava rotto: filtrando per A2
 * o non filtrando si vedevano le stesse due righe.
 */
describe("il caso Marco Reglo, dal dato di produzione", () => {
  const a2 = percorsoConId("e0682100", {
    licenseCategory: "A2",
    status: "obtained",
    startedAt: "2026-08-28T13:49:19.000Z",
    closedAt: "2026-09-11T09:47:44.000Z",
  });
  const b = percorsoConId("b4c12985", {
    licenseCategory: "B",
    status: "active",
    startedAt: "2026-10-08T23:22:05.000Z",
    closedAt: null,
    obtainedAt: null,
  });
  const guide = ["2026-09-02T14:00:00.000Z", "2026-09-24T09:00:00.000Z"];

  it("il tab Guide si apre sul percorso B, quello in corso", () => {
    expect(lessonsPathFilterId([a2, b], null)).toBe("b4c12985");
  });

  it("entrambe le guide restano attribuite all'A2, anche quella nel buco fra i due percorsi", () => {
    // La guida del 24/09 cade dopo la chiusura dell'A2 e prima dell'avvio della
    // B: pathForDate la da' all'A2, cioe' all'ultimo percorso iniziato prima.
    expect(guide.map((g) => pathForDate([a2, b], g)?.id)).toEqual(["e0682100", "e0682100"]);
  });

  it("quindi il percorso B mostra zero guide, e lo dice", () => {
    const filtro = lessonsPathFilterId([a2, b], null);
    expect(guide.filter((g) => pathForDate([a2, b], g)?.id === filtro)).toHaveLength(0);
  });
});

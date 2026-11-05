import {
  compatibleLocations,
  lessonLicense,
  lessonLicenseCategory,
  locationServesLicense,
  locationsByLicenseEnabled,
  parseLicenseTransmissions,
  resolveGroupPrefilledLocation,
  resolveGroupPrefilledLocationId,
  resolvePrefilledLocation,
  resolvePrefilledLocationId,
  withoutLicenseCategories,
  type LicenseAwareLocation,
} from "@/lib/autoscuole/location-for-license";

/** Ordine come da `listLocationsForCompany`: sede prima, poi nome A→Z. */
const LOCATIONS: LicenseAwareLocation[] = [
  { id: "sede", isDefault: true, licenseCategories: ["B", "BE"] },
  { id: "moto", isDefault: false, licenseCategories: ["AM", "A1", "A2", "A"] },
  { id: "camion", isDefault: false, licenseCategories: ["C", "CE"] },
  { id: "parcheggio", isDefault: false, licenseCategories: [] },
];

/**
 * REG-725: la B sta in tre luoghi con cambi diversi, la AM in due e la sede
 * non la fa.
 *   sede     B (entrambi), BE
 *   bovisa   B solo manuale
 *   firenze  B solo manuale, AM (entrambi)
 *   lotto    B solo automatico, AM solo automatico
 */
const MULTI: LicenseAwareLocation[] = [
  { id: "sede", isDefault: true, licenseCategories: ["B", "BE"] },
  { id: "bovisa", isDefault: false, licenseCategories: ["B"], licenseTransmissions: { B: "manual" } },
  { id: "firenze", isDefault: false, licenseCategories: ["B", "AM"], licenseTransmissions: { B: "manual" } },
  {
    id: "lotto",
    isDefault: false,
    licenseCategories: ["B", "AM"],
    licenseTransmissions: { B: "automatic", AM: "automatic" },
  },
];

describe("lessonLicenseCategory / lessonLicense", () => {
  it("usa la categoria del veicolo quando c'è (è il veicolo a fare la guida)", () => {
    expect(
      lessonLicenseCategory({ licenseCategory: "A2" }, { licenseCategory: "A1" }),
    ).toBe("A1");
  });

  it("ricade sul percorso dell'allievo senza veicolo", () => {
    expect(lessonLicenseCategory({ licenseCategory: "A2" }, null)).toBe("A2");
    expect(
      lessonLicenseCategory({ licenseCategory: "A2" }, { licenseCategory: null }),
    ).toBe("A2");
  });

  it("null quando non si sa nulla", () => {
    expect(lessonLicenseCategory(null, null)).toBeNull();
    expect(lessonLicenseCategory({ licenseCategory: "  " }, null)).toBeNull();
    expect(lessonLicense(null, null)).toBeNull();
  });

  it("il cambio segue la stessa fonte della patente", () => {
    expect(
      lessonLicense(
        { licenseCategory: "B", transmission: "manual" },
        { licenseCategory: "B", transmission: "automatic" },
      ),
    ).toEqual({ category: "B", transmission: "automatic" });
    expect(lessonLicense({ licenseCategory: "b", transmission: "manual" }, null)).toEqual({
      category: "B",
      transmission: "manual",
    });
    expect(lessonLicense({ licenseCategory: "B", transmission: "boh" }, null)).toEqual({
      category: "B",
      transmission: null,
    });
  });
});

describe("compatibilità luogo ↔ patente e cambio", () => {
  it("ripulisce la mappa dei cambi", () => {
    expect(parseLicenseTransmissions({ b: "automatic", AM: "x", A: null })).toEqual({
      B: "automatic",
    });
    expect(parseLicenseTransmissions(null)).toEqual({});
    expect(parseLicenseTransmissions(["B"])).toEqual({});
  });

  it("patente senza cambio = entrambi; cambio ignoto = qualsiasi", () => {
    const [sede, bovisa, , lotto] = MULTI;
    expect(locationServesLicense(sede, { category: "B", transmission: "automatic" })).toBe(true);
    expect(locationServesLicense(bovisa, { category: "B", transmission: "automatic" })).toBe(false);
    expect(locationServesLicense(lotto, { category: "B", transmission: "automatic" })).toBe(true);
    expect(locationServesLicense(lotto, { category: "B", transmission: null })).toBe(true);
    expect(locationServesLicense(sede, { category: "AM", transmission: null })).toBe(false);
  });

  it("una patente non assegnata a nessun luogo non restringe niente", () => {
    expect(compatibleLocations(MULTI, [{ category: "D", transmission: null }])).toEqual({
      ids: ["sede", "bovisa", "firenze", "lotto"],
      filtered: false,
    });
  });

  it("restituisce i compatibili nell'ordine della lista", () => {
    expect(compatibleLocations(MULTI, [{ category: "B", transmission: "manual" }])).toEqual({
      ids: ["sede", "bovisa", "firenze"],
      filtered: true,
    });
  });
});

describe("resolvePrefilledLocation — la regola di REG-725", () => {
  it("1. il principale dell'allievo vince se è compatibile", () => {
    expect(
      resolvePrefilledLocationId({
        locations: MULTI,
        studentDefaultLocationId: "bovisa",
        student: { licenseCategory: "B", transmission: "manual" },
      }),
    ).toBe("bovisa");
  });

  it("1. …ma non se non è compatibile (B automatico, principale solo manuale)", () => {
    expect(
      resolvePrefilledLocationId({
        locations: MULTI,
        studentDefaultLocationId: "bovisa",
        student: { licenseCategory: "B", transmission: "automatic" },
      }),
    ).toBe("sede");
  });

  it("2. l'unico compatibile tra gli altri luoghi dell'allievo", () => {
    expect(
      resolvePrefilledLocationId({
        locations: MULTI,
        studentDefaultLocationId: "bovisa",
        studentLocationIds: ["bovisa", "lotto"],
        student: { licenseCategory: "B", transmission: "automatic" },
      }),
    ).toBe("lotto");
  });

  it("2. più compatibili tra i suoi (principale escluso) → regola dei luoghi dell'autoscuola", () => {
    // AM: firenze e lotto entrambi suoi e compatibili, principale "sede" non fa AM.
    const res = resolvePrefilledLocation({
      locations: MULTI,
      studentDefaultLocationId: "sede",
      studentLocationIds: ["sede", "firenze", "lotto"],
      student: { licenseCategory: "AM", transmission: "automatic" },
    });
    expect(res).toEqual({
      locationId: null,
      ambiguous: true,
      compatibleIds: ["firenze", "lotto"],
      filtered: true,
    });
  });

  it("3. l'unico compatibile dell'autoscuola", () => {
    expect(
      resolvePrefilledLocationId({
        locations: MULTI,
        student: { licenseCategory: "AM", transmission: "manual" },
      }),
    ).toBe("firenze");
    expect(
      resolvePrefilledLocationId({ locations: LOCATIONS, student: { licenseCategory: "A2" } }),
    ).toBe("moto");
  });

  it("4. più compatibili con la sede tra questi → sede", () => {
    expect(
      resolvePrefilledLocationId({
        locations: MULTI,
        student: { licenseCategory: "B", transmission: "manual" },
      }),
    ).toBe("sede");
  });

  it("4. più compatibili senza la sede → nessuna precompilazione", () => {
    const res = resolvePrefilledLocation({
      locations: MULTI,
      student: { licenseCategory: "AM", transmission: "automatic" },
    });
    expect(res.locationId).toBeNull();
    expect(res.ambiguous).toBe(true);
    expect(res.compatibleIds).toEqual(["firenze", "lotto"]);
  });

  it("5. nessun compatibile → sede", () => {
    const soloAuto: LicenseAwareLocation[] = [
      { id: "sede", isDefault: true, licenseCategories: [] },
      { id: "lotto", isDefault: false, licenseCategories: ["B"], licenseTransmissions: { B: "automatic" } },
    ];
    expect(
      resolvePrefilledLocationId({
        locations: soloAuto,
        student: { licenseCategory: "B", transmission: "manual" },
      }),
    ).toBe("sede");
  });

  it("il veicolo scelto ridefinisce patente e cambio della guida", () => {
    expect(
      resolvePrefilledLocationId({
        locations: MULTI,
        student: { licenseCategory: "B", transmission: "manual" },
        vehicle: { licenseCategory: "AM", transmission: "automatic" },
      }),
    ).toBeNull();
    expect(
      resolvePrefilledLocationId({
        locations: LOCATIONS,
        student: { licenseCategory: "A2" },
        vehicle: { licenseCategory: "B" },
      }),
    ).toBe("sede");
  });

  it("patente non assegnata: comportamento di sempre (default allievo → sede)", () => {
    expect(
      resolvePrefilledLocationId({
        locations: LOCATIONS,
        studentDefaultLocationId: "parcheggio",
        student: { licenseCategory: "D" },
      }),
    ).toBe("parcheggio");
    expect(
      resolvePrefilledLocationId({ locations: LOCATIONS, student: { licenseCategory: "D" } }),
    ).toBe("sede");
    expect(resolvePrefilledLocationId({ locations: LOCATIONS })).toBe("sede");
  });

  it("ignora un principale archiviato (non è più nella lista)", () => {
    expect(
      resolvePrefilledLocationId({
        locations: LOCATIONS,
        studentDefaultLocationId: "luogo-cancellato",
        student: { licenseCategory: "A2" },
      }),
    ).toBe("moto");
  });

  it("null se la company non ha nemmeno la sede", () => {
    expect(
      resolvePrefilledLocationId({
        locations: [{ id: "x", isDefault: false, licenseCategories: [] }],
        student: { licenseCategory: "B" },
      }),
    ).toBeNull();
  });
});

describe("resolveGroupPrefilledLocation (guide di gruppo)", () => {
  it("usa il default degli allievi quando sono d'accordo e il luogo è compatibile", () => {
    expect(
      resolveGroupPrefilledLocationId({
        locations: LOCATIONS,
        studentDefaultLocationIds: ["moto", null, "moto"],
        licenseCategories: ["A1"],
      }),
    ).toBe("moto");
  });

  it("default concorde ma non compatibile → si scende ai luoghi dell'autoscuola", () => {
    expect(
      resolveGroupPrefilledLocationId({
        locations: LOCATIONS,
        studentDefaultLocationIds: ["parcheggio", "parcheggio"],
        licenseCategories: ["A2"],
      }),
    ).toBe("moto");
  });

  it("default in conflitto → non si sceglie a caso", () => {
    expect(
      resolveGroupPrefilledLocationId({
        locations: LOCATIONS,
        studentDefaultLocationIds: ["parcheggio", "camion"],
        licenseCategories: ["A2"],
      }),
    ).toBe("moto");
  });

  it("flotta moto: serve un luogo che vada bene a tutti i veicoli", () => {
    expect(
      resolveGroupPrefilledLocationId({ locations: LOCATIONS, licenseCategories: ["A1", "A2", "A"] }),
    ).toBe("moto");
    expect(
      resolveGroupPrefilledLocationId({ locations: LOCATIONS, licenseCategories: ["A1", "C"] }),
    ).toBe("sede");
  });

  it("legge il cambio dei veicoli", () => {
    const res = resolveGroupPrefilledLocation({
      locations: MULTI,
      licenseCategories: [{ licenseCategory: "AM", transmission: "automatic" }],
    });
    expect(res.locationId).toBeNull();
    expect(res.compatibleIds).toEqual(["firenze", "lotto"]);
    expect(
      resolveGroupPrefilledLocationId({
        locations: MULTI,
        licenseCategories: [{ licenseCategory: "AM", transmission: "manual" }],
      }),
    ).toBe("firenze");
  });

  it("nessun veicolo / patente non assegnata → sede; company senza sede → null", () => {
    expect(resolveGroupPrefilledLocationId({ locations: LOCATIONS })).toBe("sede");
    expect(
      resolveGroupPrefilledLocationId({ locations: LOCATIONS, licenseCategories: ["D"] }),
    ).toBe("sede");
    expect(
      resolveGroupPrefilledLocationId({ locations: [], licenseCategories: ["B"] }),
    ).toBeNull();
  });
});

describe("interruttore «Luoghi diversi per tipo di patente»", () => {
  const SENZA_PATENTI: LicenseAwareLocation[] = [
    { id: "sede", isDefault: true, licenseCategories: [] },
    { id: "parcheggio", isDefault: false, licenseCategories: [] },
  ];

  it("una scelta esplicita vince sempre sul dato", () => {
    expect(locationsByLicenseEnabled(false, LOCATIONS)).toBe(false);
    expect(locationsByLicenseEnabled(true, SENZA_PATENTI)).toBe(true);
  });

  it("senza scelta esplicita si deduce dai luoghi", () => {
    expect(locationsByLicenseEnabled(undefined, LOCATIONS)).toBe(true);
    expect(locationsByLicenseEnabled(null, LOCATIONS)).toBe(true);
    expect(locationsByLicenseEnabled(undefined, SENZA_PATENTI)).toBe(false);
    expect(locationsByLicenseEnabled(undefined, [])).toBe(false);
  });

  it("spento, patenti e cambi non entrano più nella precedenza", () => {
    const spenti = withoutLicenseCategories(MULTI);
    expect(
      resolvePrefilledLocationId({
        locations: spenti,
        student: { licenseCategory: "AM", transmission: "automatic" },
      }),
    ).toBe("sede");
    expect(spenti[3].licenseTransmissions).toEqual({});
  });

  it("il default dell'allievo continua a vincere da spento (REG-392)", () => {
    expect(
      resolvePrefilledLocationId({
        locations: withoutLicenseCategories(LOCATIONS),
        studentDefaultLocationId: "parcheggio",
        vehicle: { licenseCategory: "A1" },
      }),
    ).toBe("parcheggio");
  });

  it("non tocca i luoghi originali", () => {
    const copia = withoutLicenseCategories(LOCATIONS);
    expect(copia[1].licenseCategories).toEqual([]);
    expect(LOCATIONS[1].licenseCategories).toEqual(["AM", "A1", "A2", "A"]);
  });
});

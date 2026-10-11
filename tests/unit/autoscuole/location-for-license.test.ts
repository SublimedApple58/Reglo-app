import {
  lessonLicenseCategory,
  locationIdForLicenseCategory,
  locationsByLicenseEnabled,
  resolveGroupPrefilledLocationId,
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

describe("lessonLicenseCategory", () => {
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
  });
});

describe("locationIdForLicenseCategory", () => {
  it("trova il luogo assegnato alla categoria", () => {
    expect(locationIdForLicenseCategory(LOCATIONS, "A1")).toBe("moto");
    expect(locationIdForLicenseCategory(LOCATIONS, "CE")).toBe("camion");
    expect(locationIdForLicenseCategory(LOCATIONS, "B")).toBe("sede");
  });

  it("è insensibile a maiuscole e spazi", () => {
    expect(locationIdForLicenseCategory(LOCATIONS, " a2 ")).toBe("moto");
  });

  it("null per categoria non assegnata o assente", () => {
    expect(locationIdForLicenseCategory(LOCATIONS, "D")).toBeNull();
    expect(locationIdForLicenseCategory(LOCATIONS, null)).toBeNull();
    expect(locationIdForLicenseCategory(LOCATIONS, "")).toBeNull();
  });

  it("con doppia assegnazione vince il primo in lista (esito deterministico)", () => {
    const conflicting: LicenseAwareLocation[] = [
      { id: "primo", isDefault: true, licenseCategories: ["B"] },
      { id: "secondo", isDefault: false, licenseCategories: ["B"] },
    ];
    expect(locationIdForLicenseCategory(conflicting, "B")).toBe("primo");
  });
});

describe("resolvePrefilledLocationId", () => {
  it("il default dell'allievo (REG-392) vince sul luogo della patente", () => {
    expect(
      resolvePrefilledLocationId({
        locations: LOCATIONS,
        studentDefaultLocationId: "parcheggio",
        student: { licenseCategory: "A2" },
        vehicle: { licenseCategory: "A2" },
      }),
    ).toBe("parcheggio");
  });

  it("ignora un default dell'allievo su un luogo archiviato e passa alla patente", () => {
    expect(
      resolvePrefilledLocationId({
        locations: LOCATIONS,
        studentDefaultLocationId: "luogo-cancellato",
        student: { licenseCategory: "A2" },
      }),
    ).toBe("moto");
  });

  it("senza default allievo usa il luogo della patente della guida", () => {
    expect(
      resolvePrefilledLocationId({
        locations: LOCATIONS,
        student: { licenseCategory: "A2" },
      }),
    ).toBe("moto");
  });

  it("il veicolo scelto ridefinisce la patente della guida", () => {
    // Allievo A2 che guida una moto A1 → resta il luogo moto; su un'auto B
    // torna la sede perché la guida è una B.
    expect(
      resolvePrefilledLocationId({
        locations: LOCATIONS,
        student: { licenseCategory: "A2" },
        vehicle: { licenseCategory: "B" },
      }),
    ).toBe("sede");
  });

  it("ricade sulla sede se la patente non è assegnata a nessun luogo", () => {
    expect(
      resolvePrefilledLocationId({
        locations: LOCATIONS,
        student: { licenseCategory: "D" },
      }),
    ).toBe("sede");
  });

  it("ricade sulla sede senza allievo né veicolo", () => {
    expect(resolvePrefilledLocationId({ locations: LOCATIONS })).toBe("sede");
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

describe("resolveGroupPrefilledLocationId (guide di gruppo)", () => {
  it("usa il default degli allievi quando sono tutti d'accordo", () => {
    expect(
      resolveGroupPrefilledLocationId({
        locations: LOCATIONS,
        studentDefaultLocationIds: ["parcheggio", "parcheggio"],
        licenseCategories: ["B"],
      }),
    ).toBe("parcheggio");
  });

  it("chi non ha un default non blocca gli altri", () => {
    expect(
      resolveGroupPrefilledLocationId({
        locations: LOCATIONS,
        studentDefaultLocationIds: ["parcheggio", null, undefined],
        licenseCategories: ["B"],
      }),
    ).toBe("parcheggio");
  });

  it("default in conflitto → si scende alla patente, non si sceglie a caso", () => {
    expect(
      resolveGroupPrefilledLocationId({
        locations: LOCATIONS,
        studentDefaultLocationIds: ["parcheggio", "camion"],
        licenseCategories: ["A2"],
      }),
    ).toBe("moto");
  });

  it("ignora un default che punta a un luogo archiviato", () => {
    expect(
      resolveGroupPrefilledLocationId({
        locations: LOCATIONS,
        studentDefaultLocationIds: ["sparito", "sparito"],
        licenseCategories: ["A1"],
      }),
    ).toBe("moto");
  });

  it("flotta moto concorde → luogo delle moto", () => {
    expect(
      resolveGroupPrefilledLocationId({
        locations: LOCATIONS,
        licenseCategories: ["A1", "A2", "A"],
      }),
    ).toBe("moto");
  });

  it("veicoli che puntano a luoghi diversi → sede", () => {
    expect(
      resolveGroupPrefilledLocationId({
        locations: LOCATIONS,
        licenseCategories: ["A1", "C"],
      }),
    ).toBe("sede");
  });

  it("nessun allievo e nessun veicolo → sede", () => {
    expect(resolveGroupPrefilledLocationId({ locations: LOCATIONS })).toBe("sede");
  });

  it("categoria non assegnata a nessun luogo → sede", () => {
    expect(
      resolveGroupPrefilledLocationId({ locations: LOCATIONS, licenseCategories: ["D"] }),
    ).toBe("sede");
  });

  it("company senza nemmeno la sede → null", () => {
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
    // Chi aveva già assegnato delle patenti continua come prima...
    expect(locationsByLicenseEnabled(undefined, LOCATIONS)).toBe(true);
    expect(locationsByLicenseEnabled(null, LOCATIONS)).toBe(true);
    // ...e chi non l'ha mai usato parte spento.
    expect(locationsByLicenseEnabled(undefined, SENZA_PATENTI)).toBe(false);
    expect(locationsByLicenseEnabled(undefined, [])).toBe(false);
  });

  it("spento, il luogo della patente non entra più nella precedenza", () => {
    const spenti = withoutLicenseCategories(LOCATIONS);
    // Acceso la A1 porta al luogo "moto"...
    expect(
      resolvePrefilledLocationId({ locations: LOCATIONS, vehicle: { licenseCategory: "A1" } }),
    ).toBe("moto");
    // ...spento si ricade in sede.
    expect(
      resolvePrefilledLocationId({ locations: spenti, vehicle: { licenseCategory: "A1" } }),
    ).toBe("sede");
    expect(
      resolveGroupPrefilledLocationId({ locations: spenti, licenseCategories: ["A1", "A2"] }),
    ).toBe("sede");
  });

  it("il default dell'allievo continua a vincere anche da spento (REG-392)", () => {
    const spenti = withoutLicenseCategories(LOCATIONS);
    expect(
      resolvePrefilledLocationId({
        locations: spenti,
        studentDefaultLocationId: "parcheggio",
        vehicle: { licenseCategory: "A1" },
      }),
    ).toBe("parcheggio");
  });

  it("non tocca i luoghi originali: le patenti restano dove sono", () => {
    const copia = withoutLicenseCategories(LOCATIONS);
    expect(copia[1].licenseCategories).toEqual([]);
    expect(LOCATIONS[1].licenseCategories).toEqual(["AM", "A1", "A2", "A"]);
  });
});

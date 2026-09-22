import {
  isLicenseCategory,
  isTransmission,
  isMotoLicenseCategory,
  licenseCategoryEligible,
  vehicleServesLicense,
  LICENSE_CATEGORIES,
  LICENSE_CATEGORY_LABELS,
  TRANSMISSIONS,
  TRANSMISSION_LABELS,
} from "@/lib/autoscuole/license";

describe("isLicenseCategory", () => {
  it("accepts every known category", () => {
    for (const c of LICENSE_CATEGORIES) expect(isLicenseCategory(c)).toBe(true);
  });

  it("rejects unknown strings and non-strings", () => {
    expect(isLicenseCategory("A3")).toBe(false);
    expect(isLicenseCategory("b")).toBe(false); // case-sensitive
    expect(isLicenseCategory(null)).toBe(false);
    expect(isLicenseCategory(undefined)).toBe(false);
    expect(isLicenseCategory(1)).toBe(false);
  });
});

describe("isTransmission", () => {
  it("accepts manual and automatic", () => {
    expect(isTransmission("manual")).toBe(true);
    expect(isTransmission("automatic")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isTransmission("auto")).toBe(false);
    expect(isTransmission(null)).toBe(false);
  });
});

describe("isMotoLicenseCategory", () => {
  it("is true for every moto category", () => {
    for (const c of ["AM", "A1", "A2", "A"]) expect(isMotoLicenseCategory(c)).toBe(true);
  });

  it("is false for every non-moto category", () => {
    for (const c of ["B", "BE", "C", "CE", "D", "DE"]) {
      expect(isMotoLicenseCategory(c)).toBe(false);
    }
  });

  it("is false for null / invalid", () => {
    expect(isMotoLicenseCategory(null)).toBe(false);
    expect(isMotoLicenseCategory("X")).toBe(false);
  });
});

describe("licenseCategoryEligible (moto hierarchy AM < A1 < A2 < A)", () => {
  it("allows a moto of category <= the student's", () => {
    // A2 student → A2, A1, AM eligible
    expect(licenseCategoryEligible("A2", "A2")).toBe(true);
    expect(licenseCategoryEligible("A1", "A2")).toBe(true);
    expect(licenseCategoryEligible("AM", "A2")).toBe(true);
  });

  it("rejects a moto of category > the student's", () => {
    expect(licenseCategoryEligible("A", "A2")).toBe(false);
    expect(licenseCategoryEligible("A2", "A1")).toBe(false);
    expect(licenseCategoryEligible("A1", "AM")).toBe(false);
  });

  it("treats B (car) as a separate class — never mixes with motos", () => {
    expect(licenseCategoryEligible("B", "A")).toBe(false);
    expect(licenseCategoryEligible("A", "B")).toBe(false);
    expect(licenseCategoryEligible("B", "B")).toBe(true);
  });

  it("non-moto categories self-match, and never cross into moto", () => {
    for (const c of ["BE", "C", "CE", "D", "DE"]) {
      expect(licenseCategoryEligible(c, c)).toBe(true);
      expect(licenseCategoryEligible(c, "A")).toBe(false);
      expect(licenseCategoryEligible("A", c)).toBe(false);
    }
  });

  // REG-507: a trailer is not a drivable vehicle. A CE course runs on the C
  // truck the school actually owns.
  it("a trailer course runs on its motrice", () => {
    expect(licenseCategoryEligible("C", "CE")).toBe(true);
    expect(licenseCategoryEligible("D", "DE")).toBe(true);
    expect(licenseCategoryEligible("B", "BE")).toBe(true);
    expect(licenseCategoryEligible("C1", "C1E")).toBe(true);
    expect(licenseCategoryEligible("D1", "D1E")).toBe(true);
  });

  it("a vehicle already marked with the trailer category still serves it", () => {
    // Autoscuola Macchiavello mislabelled its truck as "CE" to work around the
    // old rule: that fleet must keep working untouched.
    expect(licenseCategoryEligible("CE", "CE")).toBe(true);
    expect(licenseCategoryEligible("DE", "DE")).toBe(true);
  });

  it("the trailer hierarchy runs ONE WAY: a C student may not drive a CE rig", () => {
    expect(licenseCategoryEligible("CE", "C")).toBe(false);
    expect(licenseCategoryEligible("DE", "D")).toBe(false);
    expect(licenseCategoryEligible("BE", "B")).toBe(false);
    expect(licenseCategoryEligible("C1E", "C1")).toBe(false);
  });

  // REG-507: CQC e ADR sono abilitazioni, non classi di veicolo. Si fanno su un
  // camion — pretendere un mezzo omonimo lasciava 18 allievi senza veicolo.
  it("a qualification runs on the truck it is taught on", () => {
    expect(licenseCategoryEligible("C", "CQC")).toBe(true);
    expect(licenseCategoryEligible("C", "ADR")).toBe(true);
    // E un mezzo già marcato con la qualifica continua a servire.
    expect(licenseCategoryEligible("CQC", "CQC")).toBe(true);
    expect(licenseCategoryEligible("ADR", "ADR")).toBe(true);
  });

  it("a qualification does not unlock buses, nor the other way round", () => {
    expect(licenseCategoryEligible("D", "CQC")).toBe(false);
    expect(licenseCategoryEligible("D", "ADR")).toBe(false);
    // Senso unico come le altre catene: un allievo C non guida col CQC altrui.
    expect(licenseCategoryEligible("CQC", "C")).toBe(false);
    expect(licenseCategoryEligible("ADR", "C")).toBe(false);
  });

  it("does not open the door to unrelated categories", () => {
    // The tolerance is the motrice, not "anything big".
    expect(licenseCategoryEligible("D", "CE")).toBe(false);
    expect(licenseCategoryEligible("C", "DE")).toBe(false);
    expect(licenseCategoryEligible("C1", "CE")).toBe(false);
    expect(licenseCategoryEligible("B", "CE")).toBe(false);
    expect(licenseCategoryEligible("C", "BE")).toBe(false);
  });

  it("the top moto A serves every moto below", () => {
    for (const v of ["A", "A2", "A1", "AM"]) {
      expect(licenseCategoryEligible(v, "A")).toBe(true);
    }
  });
});

describe("vehicleServesLicense", () => {
  it("applies the moto hierarchy: A1 vehicle serves an A2 student", () => {
    expect(
      vehicleServesLicense(
        { licenseCategory: "A1", transmission: "manual" },
        { licenseCategory: "A2", transmission: "manual" },
      ),
    ).toBe(true);
  });

  it("rejects a higher moto: an A vehicle does NOT serve an A2 student", () => {
    expect(
      vehicleServesLicense(
        { licenseCategory: "A", transmission: "manual" },
        { licenseCategory: "A2", transmission: "manual" },
      ),
    ).toBe(false);
  });

  it("still enforces transmission even within the hierarchy", () => {
    expect(
      vehicleServesLicense(
        { licenseCategory: "A1", transmission: "automatic" },
        { licenseCategory: "A2", transmission: "manual" },
      ),
    ).toBe(false);
  });

  it("matches when category AND transmission are equal", () => {
    expect(
      vehicleServesLicense(
        { licenseCategory: "B", transmission: "manual" },
        { licenseCategory: "B", transmission: "manual" },
      ),
    ).toBe(true);
  });

  it("fails on category mismatch", () => {
    expect(
      vehicleServesLicense(
        { licenseCategory: "A", transmission: "manual" },
        { licenseCategory: "B", transmission: "manual" },
      ),
    ).toBe(false);
  });

  it("fails on transmission mismatch", () => {
    expect(
      vehicleServesLicense(
        { licenseCategory: "B", transmission: "manual" },
        { licenseCategory: "B", transmission: "automatic" },
      ),
    ).toBe(false);
  });

  it("is permissive when the student's path is incomplete (null on either side)", () => {
    expect(
      vehicleServesLicense(
        { licenseCategory: "A", transmission: "manual" },
        { licenseCategory: null, transmission: "manual" },
      ),
    ).toBe(true);
    expect(
      vehicleServesLicense(
        { licenseCategory: "A", transmission: "manual" },
        { licenseCategory: "B", transmission: null },
      ),
    ).toBe(true);
  });

  it("is permissive when the vehicle's data is incomplete", () => {
    expect(
      vehicleServesLicense(
        { licenseCategory: null, transmission: "manual" },
        { licenseCategory: "B", transmission: "manual" },
      ),
    ).toBe(true);
  });
});

describe("labels (sanity)", () => {
  it("has a label for every category and transmission", () => {
    for (const c of LICENSE_CATEGORIES) expect(LICENSE_CATEGORY_LABELS[c]).toBeTruthy();
    for (const t of TRANSMISSIONS) expect(TRANSMISSION_LABELS[t]).toBeTruthy();
  });
});

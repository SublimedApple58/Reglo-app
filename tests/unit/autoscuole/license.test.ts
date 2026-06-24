import {
  isLicenseCategory,
  isTransmission,
  isMotoLicenseCategory,
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

  it("is false for the car license B", () => {
    expect(isMotoLicenseCategory("B")).toBe(false);
  });

  it("is false for null / invalid", () => {
    expect(isMotoLicenseCategory(null)).toBe(false);
    expect(isMotoLicenseCategory("X")).toBe(false);
  });
});

describe("vehicleServesLicense", () => {
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

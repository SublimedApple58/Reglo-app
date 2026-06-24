import {
  parseFollowCarRulesFromLimits,
  requiresFollowCar,
  isFollowCarVehicle,
  bookableLicenseKeysAtSlot,
  FOLLOW_CAR_CATEGORY,
  type FollowCarRules,
} from "@/lib/autoscuole/follow-car";

describe("FOLLOW_CAR_CATEGORY", () => {
  it("is the car license (B) — the follow car is always a car in Italy", () => {
    expect(FOLLOW_CAR_CATEGORY).toBe("B");
  });
});

describe("parseFollowCarRulesFromLimits", () => {
  it("returns an empty map when followCarRules is absent", () => {
    expect(parseFollowCarRulesFromLimits({})).toEqual({});
  });

  it("returns an empty map when followCarRules is not an object", () => {
    expect(parseFollowCarRulesFromLimits({ followCarRules: "nope" })).toEqual({});
    expect(parseFollowCarRulesFromLimits({ followCarRules: 42 })).toEqual({});
    expect(parseFollowCarRulesFromLimits({ followCarRules: null })).toEqual({});
  });

  it("keeps valid moto-category rules (enabled true or false)", () => {
    const rules = parseFollowCarRulesFromLimits({
      followCarRules: { A: { enabled: true }, A2: { enabled: false } },
    });
    expect(rules).toEqual({ A: { enabled: true }, A2: { enabled: false } });
  });

  it("drops the B key — a car requiring a follow car makes no sense", () => {
    const rules = parseFollowCarRulesFromLimits({
      followCarRules: { B: { enabled: true }, A: { enabled: true } },
    });
    expect(rules).toEqual({ A: { enabled: true } });
    expect(rules).not.toHaveProperty("B");
  });

  it("drops unknown / non-license keys", () => {
    const rules = parseFollowCarRulesFromLimits({
      followCarRules: { Z: { enabled: true }, foo: { enabled: true }, A1: { enabled: true } },
    });
    expect(rules).toEqual({ A1: { enabled: true } });
  });

  it("drops entries whose `enabled` is not a boolean", () => {
    const rules = parseFollowCarRulesFromLimits({
      followCarRules: {
        A: { enabled: "true" }, // string, not boolean
        A1: { enabled: 1 }, // number, not boolean
        A2: {}, // missing enabled
        AM: { enabled: true }, // the only valid one
      },
    });
    expect(rules).toEqual({ AM: { enabled: true } });
  });

  it("ignores non-object values for a category", () => {
    const rules = parseFollowCarRulesFromLimits({
      followCarRules: { A: true, A1: null, A2: { enabled: true } },
    });
    expect(rules).toEqual({ A2: { enabled: true } });
  });

  it("parses all four moto categories together", () => {
    const rules = parseFollowCarRulesFromLimits({
      followCarRules: {
        AM: { enabled: true },
        A1: { enabled: false },
        A2: { enabled: true },
        A: { enabled: true },
      },
    });
    expect(rules).toEqual({
      AM: { enabled: true },
      A1: { enabled: false },
      A2: { enabled: true },
      A: { enabled: true },
    });
  });
});

describe("requiresFollowCar", () => {
  const rules: FollowCarRules = { A: { enabled: true }, A2: { enabled: false } };

  it("is true when the category's rule is enabled", () => {
    expect(requiresFollowCar(rules, "A")).toBe(true);
  });

  it("is false when the category's rule is explicitly disabled", () => {
    expect(requiresFollowCar(rules, "A2")).toBe(false);
  });

  it("is false when the category has no rule", () => {
    expect(requiresFollowCar(rules, "A1")).toBe(false);
    expect(requiresFollowCar(rules, "B")).toBe(false);
  });

  it("is false for null / undefined / invalid categories", () => {
    expect(requiresFollowCar(rules, null)).toBe(false);
    expect(requiresFollowCar(rules, undefined)).toBe(false);
    expect(requiresFollowCar(rules, "ZZ")).toBe(false);
  });

  it("is false against an empty ruleset", () => {
    expect(requiresFollowCar({}, "A")).toBe(false);
  });
});

describe("isFollowCarVehicle", () => {
  it("is true for a category-B car", () => {
    expect(isFollowCarVehicle({ licenseCategory: "B" })).toBe(true);
  });

  it("is false for a moto", () => {
    expect(isFollowCarVehicle({ licenseCategory: "A" })).toBe(false);
    expect(isFollowCarVehicle({ licenseCategory: "A1" })).toBe(false);
  });

  it("is false when the category is missing", () => {
    expect(isFollowCarVehicle({ licenseCategory: null })).toBe(false);
    expect(isFollowCarVehicle({})).toBe(false);
  });
});

describe("bookableLicenseKeysAtSlot", () => {
  const motoRuleOn: FollowCarRules = { A: { enabled: true } };

  it("emits a moto key WITHOUT the rule, even if no car is free", () => {
    const keys = bookableLicenseKeysAtSlot({
      freeVehicles: [{ category: "A", licenseKey: "A|manual" }],
      followCarRules: {},
    });
    expect([...keys]).toEqual(["A|manual"]);
  });

  it("DROPS a moto key when its category needs a follow car and no free B exists", () => {
    const keys = bookableLicenseKeysAtSlot({
      freeVehicles: [{ category: "A", licenseKey: "A|manual" }],
      followCarRules: motoRuleOn,
    });
    expect(keys.size).toBe(0);
  });

  it("KEEPS the moto key when a free category-B car is also present", () => {
    const keys = bookableLicenseKeysAtSlot({
      freeVehicles: [
        { category: "A", licenseKey: "A|manual" },
        { category: "B", licenseKey: "B|manual" },
      ],
      followCarRules: motoRuleOn,
    });
    expect(keys).toEqual(new Set(["A|manual", "B|manual"]));
  });

  it("always emits car (B) keys regardless of the rule", () => {
    const keys = bookableLicenseKeysAtSlot({
      freeVehicles: [{ category: "B", licenseKey: "B|automatic" }],
      followCarRules: motoRuleOn,
    });
    expect([...keys]).toEqual(["B|automatic"]);
  });

  it("does not gate a moto category whose rule is OFF", () => {
    const keys = bookableLicenseKeysAtSlot({
      freeVehicles: [{ category: "A1", licenseKey: "A1|manual" }],
      followCarRules: { A: { enabled: true }, A1: { enabled: false } },
    });
    expect([...keys]).toEqual(["A1|manual"]);
  });

  it("deduplicates identical license keys", () => {
    const keys = bookableLicenseKeysAtSlot({
      freeVehicles: [
        { category: "B", licenseKey: "B|manual" },
        { category: "B", licenseKey: "B|manual" },
      ],
      followCarRules: {},
    });
    expect(keys.size).toBe(1);
  });
});

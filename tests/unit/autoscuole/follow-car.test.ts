import {
  parseFollowCarRulesFromLimits,
  readFollowCarMotoEnabled,
  followCarRulesForEnabled,
  requiresFollowCar,
  isFollowCarVehicle,
  bookableLicenseKeysAtSlot,
  FOLLOW_CAR_CATEGORY,
  type FollowCarRules,
} from "@/lib/autoscuole/follow-car";

// The single global rule expands to all moto categories enabled.
const ALL_MOTO_ON = {
  AM: { enabled: true },
  A1: { enabled: true },
  A2: { enabled: true },
  A: { enabled: true },
};

describe("FOLLOW_CAR_CATEGORY", () => {
  it("is the car license (B) — the follow car is always a car in Italy", () => {
    expect(FOLLOW_CAR_CATEGORY).toBe("B");
  });
});

describe("followCarRulesForEnabled", () => {
  it("returns an empty map when the global rule is off", () => {
    expect(followCarRulesForEnabled(false)).toEqual({});
  });

  it("enables ALL moto categories together when on", () => {
    expect(followCarRulesForEnabled(true)).toEqual(ALL_MOTO_ON);
  });
});

describe("readFollowCarMotoEnabled", () => {
  it("reads the global flag when present", () => {
    expect(readFollowCarMotoEnabled({ followCarMotoEnabled: true })).toBe(true);
    expect(readFollowCarMotoEnabled({ followCarMotoEnabled: false })).toBe(false);
  });

  it("defaults to false when nothing is set", () => {
    expect(readFollowCarMotoEnabled({})).toBe(false);
  });

  it("falls back to legacy per-category rules: ON if ANY moto was enabled", () => {
    expect(
      readFollowCarMotoEnabled({ followCarRules: { A2: { enabled: true } } }),
    ).toBe(true);
    expect(
      readFollowCarMotoEnabled({ followCarRules: { A: { enabled: false } } }),
    ).toBe(false);
  });

  it("ignores non-moto / malformed legacy keys in the fallback", () => {
    expect(
      readFollowCarMotoEnabled({
        followCarRules: { B: { enabled: true }, Z: { enabled: true }, A: true },
      }),
    ).toBe(false);
  });

  it("the explicit global flag wins over legacy rules", () => {
    expect(
      readFollowCarMotoEnabled({
        followCarMotoEnabled: false,
        followCarRules: { A: { enabled: true } },
      }),
    ).toBe(false);
  });
});

describe("parseFollowCarRulesFromLimits", () => {
  it("returns an empty map when nothing is configured", () => {
    expect(parseFollowCarRulesFromLimits({})).toEqual({});
  });

  it("returns all-moto-on when the global flag is true", () => {
    expect(parseFollowCarRulesFromLimits({ followCarMotoEnabled: true })).toEqual(
      ALL_MOTO_ON,
    );
  });

  it("returns empty when the global flag is false", () => {
    expect(parseFollowCarRulesFromLimits({ followCarMotoEnabled: false })).toEqual(
      {},
    );
  });

  it("derives all-moto-on from a legacy map with any moto enabled", () => {
    expect(
      parseFollowCarRulesFromLimits({ followCarRules: { A2: { enabled: true } } }),
    ).toEqual(ALL_MOTO_ON);
  });

  it("returns empty for a legacy map with everything disabled", () => {
    expect(
      parseFollowCarRulesFromLimits({ followCarRules: { A: { enabled: false } } }),
    ).toEqual({});
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

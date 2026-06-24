import {
  buildVehicleResolutionMaps,
  resolveVehiclesForInstructor,
  pickBestInstructorVehicleSet,
  type VehicleRow,
} from "@/lib/autoscuole/vehicle-resolution";

const vehicle = (
  id: string,
  assignedInstructorId: string | null = null,
  followsInstructorAvailability = true,
  licenseCategory: string | null = "B",
): VehicleRow => ({
  id,
  assignedInstructorId,
  followsInstructorAvailability,
  licenseCategory,
});

const allAvailable = () => true;
const noOverlap = () => false;
const flatScore = () => 0;

const baseArgs = (over: Partial<Parameters<typeof resolveVehiclesForInstructor>[0]>) => ({
  instructorId: "i1",
  studentCategory: "B" as string | null,
  activeVehicleIds: ["v1", "v2", "v3"],
  maps: buildVehicleResolutionMaps({ vehicles: [vehicle("v1"), vehicle("v2"), vehicle("v3")] }),
  isVehicleAvailable: allAvailable,
  hasOverlap: noOverlap,
  scoreVehicle: flatScore,
  ...over,
});

describe("resolveVehiclesForInstructor — backward compat (single exclusive = old fixed)", () => {
  it("forces the exclusive vehicle and skips its availability when it follows the instructor", () => {
    const maps = buildVehicleResolutionMaps({ vehicles: [vehicle("v1", "i1", true)] });
    const res = resolveVehiclesForInstructor(
      baseArgs({ maps, isVehicleAvailable: () => false }),
    );
    expect(res?.primary.id).toBe("v1");
  });

  it("enforces the exclusive vehicle's own availability when it does NOT follow", () => {
    const maps = buildVehicleResolutionMaps({ vehicles: [vehicle("v1", "i1", false)] });
    const res = resolveVehiclesForInstructor(
      baseArgs({ maps, isVehicleAvailable: (id) => id !== "v1" }),
    );
    expect(res).toBeNull();
  });

  it("disqualifies the exclusive vehicle on overlap (no pool fallback for a covered category)", () => {
    // v2/v3 are open B cars, but the instructor is FORCED to his exclusive B car.
    const maps = buildVehicleResolutionMaps({
      vehicles: [vehicle("v1", "i1", true), vehicle("v2"), vehicle("v3")],
    });
    const res = resolveVehiclesForInstructor(
      baseArgs({ maps, hasOverlap: (id) => id === "v1" }),
    );
    expect(res).toBeNull();
  });

  it("returns null when the exclusive vehicle does not serve the student's category and no pool car exists", () => {
    const maps = buildVehicleResolutionMaps({ vehicles: [vehicle("v1", "i1", true, "A")] });
    const res = resolveVehiclesForInstructor(
      baseArgs({
        maps,
        activeVehicleIds: ["v1"],
        matchesLicenseCategory: (id) => id !== "v1", // student needs B, v1 is moto
      }),
    );
    expect(res).toBeNull();
  });
});

describe("resolveVehiclesForInstructor — pool & open (no exclusive for category)", () => {
  it("excludes vehicles exclusive to OTHER instructors from the open pool", () => {
    const maps = buildVehicleResolutionMaps({
      vehicles: [vehicle("v1", "iOther"), vehicle("v2"), vehicle("v3", "iOther2")],
    });
    const res = resolveVehiclesForInstructor(
      baseArgs({ instructorId: "iX", maps }),
    );
    expect(res?.primary.id).toBe("v2"); // only the open one
  });

  it("restricts to an explicit pool when present", () => {
    const maps = buildVehicleResolutionMaps({
      vehicles: [vehicle("v1"), vehicle("v2"), vehicle("v3")],
      poolMembers: [{ vehicleId: "v2", instructorId: "i1" }], // v2 pooled to i1 only
    });
    // i1 may use v2 (pooled) and v1/v3 (open). iOther may use only v1/v3.
    const forOther = resolveVehiclesForInstructor(
      baseArgs({ instructorId: "iOther", maps, scoreVehicle: (id) => (id === "v2" ? 9 : 0) }),
    );
    expect(forOther?.primary.id).not.toBe("v2"); // v2 is pooled away from iOther
  });

  it("picks the preferred vehicle for the category over packing score", () => {
    const maps = buildVehicleResolutionMaps({
      vehicles: [vehicle("v1"), vehicle("v2"), vehicle("v3")],
      preferred: [{ instructorId: "iX", licenseCategory: "B", vehicleId: "v3" }],
    });
    const res = resolveVehiclesForInstructor(
      baseArgs({ instructorId: "iX", maps, scoreVehicle: (id) => (id === "v1" ? 9 : 0) }),
    );
    expect(res?.primary.id).toBe("v3"); // preferred beats the higher-scoring v1
  });
});

describe("resolveVehiclesForInstructor — D1 multiple exclusive vehicles (Mario)", () => {
  it("picks the exclusive vehicle matching the student's category (car for B, moto for A)", () => {
    const maps = buildVehicleResolutionMaps({
      vehicles: [vehicle("car", "i1", true, "B"), vehicle("moto", "i1", true, "A")],
    });
    const forB = resolveVehiclesForInstructor(
      baseArgs({ maps, activeVehicleIds: ["car", "moto"], studentCategory: "B", matchesLicenseCategory: (id) => id === "car" }),
    );
    const forA = resolveVehiclesForInstructor(
      baseArgs({ maps, activeVehicleIds: ["car", "moto"], studentCategory: "A", matchesLicenseCategory: (id) => id === "moto" }),
    );
    expect(forB?.primary.id).toBe("car");
    expect(forA?.primary.id).toBe("moto");
  });

  it("falls back to a pool moto when the instructor has only an exclusive car (occasional moto)", () => {
    const maps = buildVehicleResolutionMaps({
      vehicles: [vehicle("car", "i1", true, "B"), vehicle("poolMoto", null, true, "A")],
    });
    const forA = resolveVehiclesForInstructor(
      baseArgs({
        maps,
        activeVehicleIds: ["car", "poolMoto"],
        studentCategory: "A",
        matchesLicenseCategory: (id) => id === "poolMoto",
      }),
    );
    expect(forA?.primary.id).toBe("poolMoto");
  });
});

describe("resolveVehiclesForInstructor — follow car (auto al seguito)", () => {
  const maps = buildVehicleResolutionMaps({
    vehicles: [vehicle("moto", "i1", true, "A"), vehicle("car", null, true, "B")],
  });
  const common = {
    instructorId: "i1",
    studentCategory: "A" as string | null,
    activeVehicleIds: ["moto", "car"],
    maps,
    isVehicleAvailable: allAvailable,
    hasOverlap: noOverlap,
    scoreVehicle: flatScore,
    matchesLicenseCategory: (id: string) => id === "moto",
    matchesFollowCar: (id: string) => id === "car",
  };

  it("resolves primary moto + follow car when required", () => {
    const res = resolveVehiclesForInstructor({ ...common, requireFollowCar: true });
    expect(res?.primary.id).toBe("moto");
    expect(res?.follow?.id).toBe("car");
  });

  it("returns null when a follow car is required but none is available", () => {
    const res = resolveVehiclesForInstructor({
      ...common,
      requireFollowCar: true,
      hasOverlap: (id) => id === "car",
    });
    expect(res).toBeNull();
  });

  it("does not resolve a follow car when not required", () => {
    const res = resolveVehiclesForInstructor({ ...common, requireFollowCar: false });
    expect(res?.follow).toBeUndefined();
  });

  it("never reuses the primary vehicle as the follow car", () => {
    // both predicates match the same single vehicle → no distinct follow car
    const singleMaps = buildVehicleResolutionMaps({ vehicles: [vehicle("only", "i1", true, "B")] });
    const res = resolveVehiclesForInstructor({
      ...common,
      maps: singleMaps,
      activeVehicleIds: ["only"],
      matchesLicenseCategory: () => true,
      matchesFollowCar: () => true,
      requireFollowCar: true,
    });
    expect(res).toBeNull();
  });
});

describe("resolveVehiclesForInstructor — additional edge cases", () => {
  it("grants a pooled vehicle to an instructor IN the pool (positive case)", () => {
    const maps = buildVehicleResolutionMaps({
      vehicles: [vehicle("v1"), vehicle("v2"), vehicle("v3")],
      poolMembers: [{ vehicleId: "v2", instructorId: "i1" }],
    });
    // i1 is in v2's pool and v2 scores highest → i1 gets v2.
    const res = resolveVehiclesForInstructor(
      baseArgs({ instructorId: "i1", maps, scoreVehicle: (id) => (id === "v2" ? 9 : 0) }),
    );
    expect(res?.primary.id).toBe("v2");
  });

  it("forces the instructor's exclusive vehicle over a higher-scoring open one (no pool dilution)", () => {
    const maps = buildVehicleResolutionMaps({
      vehicles: [vehicle("excl", "i1", true, "B"), vehicle("open", null, true, "B")],
    });
    const res = resolveVehiclesForInstructor(
      baseArgs({
        maps,
        activeVehicleIds: ["excl", "open"],
        // both serve B; the open car scores much higher but must be ignored.
        scoreVehicle: (id) => (id === "open" ? 99 : 0),
      }),
    );
    expect(res?.primary.id).toBe("excl");
  });

  it("does NOT apply a preferred vehicle bound to a different category", () => {
    const maps = buildVehicleResolutionMaps({
      vehicles: [vehicle("v1", null, true, "A"), vehicle("v2", null, true, "A")],
      preferred: [{ instructorId: "i1", licenseCategory: "B", vehicleId: "v2" }],
    });
    // Student category is A; the preferred (for B) must not override packing score.
    const res = resolveVehiclesForInstructor(
      baseArgs({
        maps,
        studentCategory: "A",
        activeVehicleIds: ["v1", "v2"],
        scoreVehicle: (id) => (id === "v1" ? 9 : 0),
      }),
    );
    expect(res?.primary.id).toBe("v1");
  });

  it("picks an alternative free follow car when the first category-B car overlaps", () => {
    const maps = buildVehicleResolutionMaps({
      vehicles: [
        vehicle("moto", "i1", true, "A"),
        vehicle("car1", null, true, "B"),
        vehicle("car2", null, true, "B"),
      ],
    });
    const res = resolveVehiclesForInstructor({
      instructorId: "i1",
      studentCategory: "A",
      activeVehicleIds: ["moto", "car1", "car2"],
      maps,
      isVehicleAvailable: allAvailable,
      hasOverlap: (id) => id === "car1", // car1 busy → must fall back to car2
      scoreVehicle: flatScore,
      matchesLicenseCategory: (id) => id === "moto",
      matchesFollowCar: (id) => id === "car1" || id === "car2",
      requireFollowCar: true,
    });
    expect(res?.primary.id).toBe("moto");
    expect(res?.follow?.id).toBe("car2");
  });
});

describe("pickBestInstructorVehicleSet", () => {
  it("returns the best instructor with null vehicles when vehicles are disabled", () => {
    const pick = pickBestInstructorVehicleSet({
      availableInstructors: [
        { id: "i1", score: 1 },
        { id: "i2", score: 2 },
      ],
      vehiclesEnabled: false,
      resolveVehicles: () => null,
    });
    expect(pick).toEqual({ instructorId: "i2", vehicleId: null, followVehicleId: null, score: 2 });
  });

  it("skips instructors that cannot get a vehicle", () => {
    const pick = pickBestInstructorVehicleSet({
      availableInstructors: [
        { id: "i1", score: 5 },
        { id: "i2", score: 1 },
      ],
      vehiclesEnabled: true,
      resolveVehicles: (id) => (id === "i1" ? null : { primary: { id: "v2", score: 0 } }),
    });
    expect(pick).toEqual({ instructorId: "i2", vehicleId: "v2", followVehicleId: null, score: 1 });
  });

  it("sums instructor + primary + follow scores", () => {
    const pick = pickBestInstructorVehicleSet({
      availableInstructors: [{ id: "i1", score: 1 }],
      vehiclesEnabled: true,
      resolveVehicles: () => ({ primary: { id: "moto", score: 2 }, follow: { id: "car", score: 3 } }),
    });
    expect(pick).toEqual({
      instructorId: "i1",
      vehicleId: "moto",
      followVehicleId: "car",
      score: 6,
    });
  });

  it("keeps the FIRST instructor on a score tie (strict >)", () => {
    const pick = pickBestInstructorVehicleSet({
      availableInstructors: [
        { id: "i1", score: 2 },
        { id: "i2", score: 2 },
      ],
      vehiclesEnabled: false,
      resolveVehicles: () => null,
    });
    expect(pick?.instructorId).toBe("i1");
  });

  it("returns null when no instructor can be served", () => {
    const pick = pickBestInstructorVehicleSet({
      availableInstructors: [{ id: "i1", score: 5 }],
      vehiclesEnabled: true,
      resolveVehicles: () => null,
    });
    expect(pick).toBeNull();
  });
});

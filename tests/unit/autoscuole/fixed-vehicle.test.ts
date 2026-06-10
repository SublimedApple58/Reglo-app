import {
  buildFixedVehicleMaps,
  resolveVehicleForInstructor,
  pickBestInstructorVehiclePair,
  type FixedVehicleRow,
} from "@/lib/autoscuole/fixed-vehicle";

const vehicle = (
  id: string,
  assignedInstructorId: string | null = null,
  followsInstructorAvailability = true,
): FixedVehicleRow => ({ id, assignedInstructorId, followsInstructorAvailability });

describe("buildFixedVehicleMaps", () => {
  it("maps reserved vehicles by instructor and collects reserved ids", () => {
    const { fixedByInstructor, reservedVehicleIds } = buildFixedVehicleMaps([
      vehicle("v1", "i1"),
      vehicle("v2", null),
      vehicle("v3", "i2", false),
    ]);
    expect(fixedByInstructor.get("i1")?.id).toBe("v1");
    expect(fixedByInstructor.get("i2")?.id).toBe("v3");
    expect(fixedByInstructor.has("i3")).toBe(false);
    expect([...reservedVehicleIds].sort()).toEqual(["v1", "v3"]);
  });
});

describe("resolveVehicleForInstructor", () => {
  const activeVehicleIds = ["v1", "v2", "v3"];
  const allAvailable = () => true;
  const noOverlap = () => false;
  const flatScore = () => 0;

  it("forces the fixed vehicle and skips its availability when it follows the instructor", () => {
    const maps = buildFixedVehicleMaps([vehicle("v1", "i1", true)]);
    const res = resolveVehicleForInstructor({
      instructorId: "i1",
      activeVehicleIds,
      maps,
      isVehicleAvailable: () => false, // own availability empty
      hasOverlap: noOverlap,
      scoreVehicle: flatScore,
    });
    expect(res?.id).toBe("v1"); // available because it follows the instructor
  });

  it("enforces the fixed vehicle's own availability when it does NOT follow the instructor", () => {
    const maps = buildFixedVehicleMaps([vehicle("v1", "i1", false)]);
    const res = resolveVehicleForInstructor({
      instructorId: "i1",
      activeVehicleIds,
      maps,
      isVehicleAvailable: (id) => id !== "v1", // v1 not available
      hasOverlap: noOverlap,
      scoreVehicle: flatScore,
    });
    expect(res).toBeNull();
  });

  it("disqualifies the fixed vehicle on overlap even when following the instructor", () => {
    const maps = buildFixedVehicleMaps([vehicle("v1", "i1", true)]);
    const res = resolveVehicleForInstructor({
      instructorId: "i1",
      activeVehicleIds,
      maps,
      isVehicleAvailable: allAvailable,
      hasOverlap: (id) => id === "v1",
      scoreVehicle: flatScore,
    });
    expect(res).toBeNull();
  });

  it("excludes reserved vehicles from the pool for an instructor without a fixed vehicle", () => {
    const maps = buildFixedVehicleMaps([
      vehicle("v1", "i1"), // reserved to i1
      vehicle("v2", null),
      vehicle("v3", "i2"), // reserved to i2
    ]);
    const res = resolveVehicleForInstructor({
      instructorId: "iX", // no fixed vehicle
      activeVehicleIds,
      maps,
      isVehicleAvailable: allAvailable,
      hasOverlap: noOverlap,
      scoreVehicle: flatScore,
    });
    expect(res?.id).toBe("v2"); // only the non-reserved vehicle
  });

  it("picks the highest-scoring vehicle from the pool", () => {
    const maps = buildFixedVehicleMaps([vehicle("v1"), vehicle("v2"), vehicle("v3")]);
    const res = resolveVehicleForInstructor({
      instructorId: "iX",
      activeVehicleIds,
      maps,
      isVehicleAvailable: allAvailable,
      hasOverlap: noOverlap,
      scoreVehicle: (id) => (id === "v2" ? 2 : 0),
    });
    expect(res?.id).toBe("v2");
  });

  it("returns null when the pool is empty after exclusions", () => {
    const maps = buildFixedVehicleMaps([vehicle("v1", "i1"), vehicle("v2", "i2")]);
    const res = resolveVehicleForInstructor({
      instructorId: "iX",
      activeVehicleIds: ["v1", "v2"],
      maps,
      isVehicleAvailable: allAvailable,
      hasOverlap: noOverlap,
      scoreVehicle: flatScore,
    });
    expect(res).toBeNull();
  });
});

describe("resolveVehicleForInstructor — license category filter", () => {
  const activeVehicleIds = ["v1", "v2", "v3"];
  const allAvailable = () => true;
  const noOverlap = () => false;
  const flatScore = () => 0;

  it("returns null when the instructor's FIXED vehicle does not serve the student's category", () => {
    const maps = buildFixedVehicleMaps([vehicle("v1", "i1", true)]);
    const res = resolveVehicleForInstructor({
      instructorId: "i1",
      activeVehicleIds,
      maps,
      isVehicleAvailable: allAvailable,
      hasOverlap: noOverlap,
      scoreVehicle: flatScore,
      matchesLicenseCategory: (id) => id !== "v1", // v1 is e.g. a moto, student needs B
    });
    expect(res).toBeNull();
  });

  it("keeps the FIXED vehicle when it serves the student's category", () => {
    const maps = buildFixedVehicleMaps([vehicle("v1", "i1", true)]);
    const res = resolveVehicleForInstructor({
      instructorId: "i1",
      activeVehicleIds,
      maps,
      isVehicleAvailable: allAvailable,
      hasOverlap: noOverlap,
      scoreVehicle: flatScore,
      matchesLicenseCategory: () => true,
    });
    expect(res?.id).toBe("v1");
  });

  it("filters the POOL to vehicles serving the student's category", () => {
    const maps = buildFixedVehicleMaps([vehicle("v1"), vehicle("v2"), vehicle("v3")]);
    const res = resolveVehicleForInstructor({
      instructorId: "iX",
      activeVehicleIds,
      maps,
      isVehicleAvailable: allAvailable,
      hasOverlap: noOverlap,
      scoreVehicle: flatScore,
      matchesLicenseCategory: (id) => id === "v3", // only v3 matches (e.g. the only 125)
    });
    expect(res?.id).toBe("v3");
  });

  it("returns null when no pool vehicle serves the student's category", () => {
    const maps = buildFixedVehicleMaps([vehicle("v1"), vehicle("v2")]);
    const res = resolveVehicleForInstructor({
      instructorId: "iX",
      activeVehicleIds: ["v1", "v2"],
      maps,
      isVehicleAvailable: allAvailable,
      hasOverlap: noOverlap,
      scoreVehicle: flatScore,
      matchesLicenseCategory: () => false,
    });
    expect(res).toBeNull();
  });
});

describe("pickBestInstructorVehiclePair", () => {
  it("returns the best instructor with null vehicle when vehicles are disabled", () => {
    const pair = pickBestInstructorVehiclePair({
      availableInstructors: [
        { id: "i1", score: 1 },
        { id: "i2", score: 2 },
      ],
      vehiclesEnabled: false,
      resolveVehicle: () => null,
    });
    expect(pair).toEqual({ instructorId: "i2", vehicleId: null, score: 2 });
  });

  it("skips instructors that cannot get a vehicle when vehicles are enabled", () => {
    const pair = pickBestInstructorVehiclePair({
      availableInstructors: [
        { id: "i1", score: 5 },
        { id: "i2", score: 1 },
      ],
      vehiclesEnabled: true,
      resolveVehicle: (id) => (id === "i1" ? null : { id: "v2", score: 0 }),
    });
    expect(pair).toEqual({ instructorId: "i2", vehicleId: "v2", score: 1 });
  });

  it("combines instructor and vehicle score to choose the pair", () => {
    const pair = pickBestInstructorVehiclePair({
      availableInstructors: [
        { id: "i1", score: 1 },
        { id: "i2", score: 1 },
      ],
      vehiclesEnabled: true,
      resolveVehicle: (id) => (id === "i1" ? { id: "v1", score: 0 } : { id: "v2", score: 2 }),
    });
    expect(pair).toEqual({ instructorId: "i2", vehicleId: "v2", score: 3 });
  });

  it("returns null when no instructor is available", () => {
    const pair = pickBestInstructorVehiclePair({
      availableInstructors: [],
      vehiclesEnabled: true,
      resolveVehicle: () => ({ id: "v1", score: 0 }),
    });
    expect(pair).toBeNull();
  });
});

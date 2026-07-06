import {
  assignMotoForStudent,
  eligibleForMotoGroup,
  assignMotosToStudents,
  groupMotoFollowCarRequired,
  instructorCanUseVehicle,
  validateMotoGroupSetup,
  MOTO_GROUP_SETUP_MESSAGES,
  type FleetVehicle,
} from "@/lib/autoscuole/group-moto";
import type { FollowCarRules } from "@/lib/autoscuole/follow-car";

const moto = (id: string, licenseCategory: string, transmission = "manual"): FleetVehicle => ({
  id,
  licenseCategory,
  transmission,
});

// A representative mixed fleet: 2× A2 + 1× A.
const FLEET: FleetVehicle[] = [moto("m1", "A2"), moto("m2", "A2"), moto("m3", "A")];

describe("assignMotoForStudent", () => {
  it("picks the first free moto serving the student's license", () => {
    const id = assignMotoForStudent({
      fleet: FLEET,
      takenVehicleIds: [],
      student: { licenseCategory: "A2", transmission: "manual" },
    });
    expect(id).toBe("m1");
  });

  it("skips motos already taken by siblings", () => {
    const id = assignMotoForStudent({
      fleet: FLEET,
      takenVehicleIds: ["m1"],
      student: { licenseCategory: "A2", transmission: "manual" },
    });
    expect(id).toBe("m2");
  });

  it("returns null when no compatible moto is free (category exhausted)", () => {
    const id = assignMotoForStudent({
      fleet: FLEET,
      takenVehicleIds: ["m1", "m2"],
      student: { licenseCategory: "A2", transmission: "manual" },
    });
    expect(id).toBeNull();
  });

  it("matches a different category in the same fleet (mixed categories)", () => {
    const id = assignMotoForStudent({
      fleet: FLEET,
      takenVehicleIds: ["m1", "m2"],
      student: { licenseCategory: "A", transmission: "manual" },
    });
    expect(id).toBe("m3");
  });

  it("does not match a car student against a moto fleet", () => {
    const id = assignMotoForStudent({
      fleet: FLEET,
      takenVehicleIds: [],
      student: { licenseCategory: "B", transmission: "manual" },
    });
    expect(id).toBeNull();
  });

  it("respects transmission (manual vs automatic)", () => {
    const fleet = [moto("a1", "A2", "automatic")];
    expect(
      assignMotoForStudent({
        fleet,
        takenVehicleIds: [],
        student: { licenseCategory: "A2", transmission: "manual" },
      }),
    ).toBeNull();
    expect(
      assignMotoForStudent({
        fleet,
        takenVehicleIds: [],
        student: { licenseCategory: "A2", transmission: "automatic" },
      }),
    ).toBe("a1");
  });
});

describe("eligibleForMotoGroup", () => {
  it("is true when any fleet moto serves the license (hierarchy)", () => {
    // A1 moto in fleet → A1, A2 and A students are eligible…
    const fleet = [moto("m1", "A1")];
    for (const cat of ["A1", "A2", "A"]) {
      expect(
        eligibleForMotoGroup({ fleet, student: { licenseCategory: cat, transmission: "manual" } }),
      ).toBe(true);
    }
    // …but an AM student is not (AM < A1).
    expect(
      eligibleForMotoGroup({ fleet, student: { licenseCategory: "AM", transmission: "manual" } }),
    ).toBe(false);
  });

  it("ignores how many siblings already ride the motos (turns allowed)", () => {
    // Single A2 moto, capacity handled elsewhere: an A2 student stays eligible
    // no matter how many participants exist.
    expect(
      eligibleForMotoGroup({
        fleet: [moto("m1", "A2")],
        student: { licenseCategory: "A2", transmission: "manual" },
      }),
    ).toBe(true);
  });

  it("is false when no fleet moto matches the transmission", () => {
    expect(
      eligibleForMotoGroup({
        fleet: [moto("m1", "A2", "automatic")],
        student: { licenseCategory: "A2", transmission: "manual" },
      }),
    ).toBe(false);
  });
});

describe("assignMotosToStudents", () => {
  it("assigns distinct motos to a mixed group (A2, A2, A)", () => {
    const res = assignMotosToStudents({
      fleet: FLEET,
      students: [
        { studentId: "s1", license: { licenseCategory: "A2", transmission: "manual" } },
        { studentId: "s2", license: { licenseCategory: "A2", transmission: "manual" } },
        { studentId: "s3", license: { licenseCategory: "A", transmission: "manual" } },
      ],
    });
    expect(res).toEqual({
      ok: true,
      assignments: [
        { studentId: "s1", vehicleId: "m1" },
        { studentId: "s2", vehicleId: "m2" },
        { studentId: "s3", vehicleId: "m3" },
      ],
    });
  });

  it("leaves the overflow student without a moto (rides in turns) instead of failing", () => {
    // 3× A2 students on 2 free A2 motos (the A moto doesn't serve A2): the
    // third student enrols with vehicleId null.
    const res = assignMotosToStudents({
      fleet: FLEET,
      students: [
        { studentId: "s1", license: { licenseCategory: "A2", transmission: "manual" } },
        { studentId: "s2", license: { licenseCategory: "A2", transmission: "manual" } },
        { studentId: "s3", license: { licenseCategory: "A2", transmission: "manual" } },
      ],
    });
    expect(res).toEqual({
      ok: true,
      assignments: [
        { studentId: "s1", vehicleId: "m1" },
        { studentId: "s2", vehicleId: "m2" },
        { studentId: "s3", vehicleId: null },
      ],
    });
  });

  it("fails only for a student with NO compatible moto in the whole fleet", () => {
    const res = assignMotosToStudents({
      fleet: FLEET, // A2 + A motos: nothing serves an AM student
      students: [
        { studentId: "s1", license: { licenseCategory: "A2", transmission: "manual" } },
        { studentId: "s2", license: { licenseCategory: "AM", transmission: "manual" } },
      ],
    });
    expect(res).toEqual({ ok: false, incompatibleStudentId: "s2" });
  });
});

describe("instructorCanUseVehicle", () => {
  it("allows a vehicle exclusively assigned to the instructor", () => {
    expect(instructorCanUseVehicle({ assignedInstructorId: "i1", poolInstructorIds: [] }, "i1")).toBe(true);
  });
  it("denies a vehicle exclusive to another instructor", () => {
    expect(instructorCanUseVehicle({ assignedInstructorId: "i2", poolInstructorIds: [] }, "i1")).toBe(false);
    expect(instructorCanUseVehicle({ assignedInstructorId: "i2", poolInstructorIds: ["i1"] }, "i1")).toBe(false);
  });
  it("allows an open vehicle (no owner, empty pool)", () => {
    expect(instructorCanUseVehicle({ assignedInstructorId: null, poolInstructorIds: [] }, "i1")).toBe(true);
  });
  it("allows a pooled vehicle the instructor belongs to, denies otherwise", () => {
    expect(instructorCanUseVehicle({ assignedInstructorId: null, poolInstructorIds: ["i1", "i3"] }, "i1")).toBe(true);
    expect(instructorCanUseVehicle({ assignedInstructorId: null, poolInstructorIds: ["i2", "i3"] }, "i1")).toBe(false);
  });
});

describe("groupMotoFollowCarRequired", () => {
  const rules: FollowCarRules = { A: { enabled: true }, A2: { enabled: false } };

  it("is true when any fleet category requires a follow car", () => {
    expect(groupMotoFollowCarRequired(rules, ["A2", "A"])).toBe(true);
  });

  it("is false when no fleet category requires one", () => {
    expect(groupMotoFollowCarRequired(rules, ["A2", "A1"])).toBe(false);
  });

  it("is false for an empty ruleset", () => {
    expect(groupMotoFollowCarRequired({}, ["A", "A2"])).toBe(false);
  });
});

describe("validateMotoGroupSetup", () => {
  const noRules: FollowCarRules = {};

  it("accepts a valid all-moto fleet within capacity, no follow car needed", () => {
    expect(
      validateMotoGroupSetup({
        fleet: FLEET,
        followVehicle: null,
        followCarRules: noRules,
        capacity: 3,
      }),
    ).toBeNull();
  });

  it("rejects an empty fleet", () => {
    expect(
      validateMotoGroupSetup({ fleet: [], followVehicle: null, followCarRules: noRules, capacity: 1 }),
    ).toBe("empty_fleet");
  });

  it("rejects a duplicated fleet vehicle", () => {
    expect(
      validateMotoGroupSetup({
        fleet: [moto("m1", "A2"), moto("m1", "A2")],
        followVehicle: null,
        followCarRules: noRules,
        capacity: 1,
      }),
    ).toBe("duplicate_fleet_vehicle");
  });

  it("rejects a car (non-moto) in the fleet", () => {
    expect(
      validateMotoGroupSetup({
        fleet: [moto("c1", "B")],
        followVehicle: null,
        followCarRules: noRules,
        capacity: 1,
      }),
    ).toBe("non_moto_in_fleet");
  });

  it("rejects a follow car that is not a category-B car", () => {
    expect(
      validateMotoGroupSetup({
        fleet: FLEET,
        followVehicle: moto("x", "A"),
        followCarRules: noRules,
        capacity: 3,
      }),
    ).toBe("follow_car_not_b");
  });

  it("rejects a follow car that is also part of the fleet", () => {
    expect(
      validateMotoGroupSetup({
        fleet: [moto("m1", "A2"), { id: "shared", licenseCategory: "B", transmission: "manual" }],
        followVehicle: { id: "shared", licenseCategory: "B", transmission: "manual" },
        followCarRules: noRules,
        capacity: 1,
      }),
    ).toBe("non_moto_in_fleet"); // the B in the fleet fails first
  });

  it("requires a follow car when the rules demand it for a fleet category", () => {
    expect(
      validateMotoGroupSetup({
        fleet: FLEET, // contains "A"
        followVehicle: null,
        followCarRules: { A: { enabled: true } },
        capacity: 3,
      }),
    ).toBe("follow_car_required_missing");
  });

  it("accepts when the required follow car is provided", () => {
    expect(
      validateMotoGroupSetup({
        fleet: FLEET,
        followVehicle: { id: "car1", licenseCategory: "B", transmission: "manual" },
        followCarRules: { A: { enabled: true } },
        capacity: 3,
      }),
    ).toBeNull();
  });

  it("accepts capacity greater than the fleet size (participants ride in turns)", () => {
    expect(
      validateMotoGroupSetup({
        fleet: FLEET,
        followVehicle: null,
        followCarRules: noRules,
        capacity: 8,
      }),
    ).toBeNull();
  });

  it("has a human message for every error code", () => {
    const codes = [
      "empty_fleet",
      "duplicate_fleet_vehicle",
      "non_moto_in_fleet",
      "follow_car_not_b",
      "follow_car_in_fleet",
      "follow_car_required_missing",
    ] as const;
    for (const c of codes) {
      expect(typeof MOTO_GROUP_SETUP_MESSAGES[c]).toBe("string");
      expect(MOTO_GROUP_SETUP_MESSAGES[c].length).toBeGreaterThan(0);
    }
  });
});

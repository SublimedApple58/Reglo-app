import {
  resolveSlotAssignmentForStudent,
  type SlotAssignmentContext,
} from "@/lib/autoscuole/slot-assignment";
import { buildVehicleResolutionMaps } from "@/lib/autoscuole/vehicle-resolution";

// 2026-07-08 is a Wednesday (dayOfWeek 3). 10:00–11:00 Europe/Rome (CEST).
const START = new Date("2026-07-08T10:00:00+02:00");
const END = new Date("2026-07-08T11:00:00+02:00");

const ALL_DAY = { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], ranges: [{ startMinutes: 0, endMinutes: 1440 }] };

type Vehicle = {
  id: string;
  assignedInstructorId: string | null;
  followsInstructorAvailability: boolean;
  licenseCategory: string | null;
  transmission: string | null;
};

const buildCtx = (args: {
  vehicles: Vehicle[];
  instructorIds?: string[];
  poolMembers?: Array<{ vehicleId: string; instructorId: string }>;
  followCarMotoEnabled?: boolean;
  busy?: Map<string, Array<{ start: number; end: number }>>;
  vehiclesEnabled?: boolean;
}): SlotAssignmentContext => ({
  vehiclesEnabled: args.vehiclesEnabled ?? true,
  activeInstructorIds: args.instructorIds ?? ["instr-1"],
  activeVehicles: args.vehicles,
  activeVehicleIds: args.vehicles.map((v) => v.id),
  maps: buildVehicleResolutionMaps({ vehicles: args.vehicles, poolMembers: args.poolMembers ?? [] }),
  followCarRules: args.followCarMotoEnabled
    ? { AM: { enabled: true }, A1: { enabled: true }, A2: { enabled: true }, A: { enabled: true } }
    : {},
  instructorResolver: { resolve: () => ALL_DAY },
  vehicleResolver: { resolve: () => ALL_DAY },
  pubFilter: () => true,
  intervals: args.busy ?? new Map(),
});

const carB = (id: string, transmission = "manual"): Vehicle => ({
  id,
  assignedInstructorId: null,
  followsInstructorAvailability: true,
  licenseCategory: "B",
  transmission,
});

const motoA2 = (id: string, transmission = "manual"): Vehicle => ({
  id,
  assignedInstructorId: null,
  followsInstructorAvailability: true,
  licenseCategory: "A2",
  transmission,
});

describe("resolveSlotAssignmentForStudent", () => {
  it("assigns an eligible open vehicle for a B student", () => {
    const ctx = buildCtx({ vehicles: [carB("car-1")] });
    const res = resolveSlotAssignmentForStudent(ctx, {
      licenseCategory: "B",
      transmission: "manual",
      startsAt: START,
      endsAt: END,
    });
    expect(res).toEqual({ instructorId: "instr-1", vehicleId: "car-1", followVehicleId: null });
  });

  it("rejects a vehicle whose TRANSMISSION does not match the student's path", () => {
    // Only manual car available, student pursues B automatic → no assignment.
    const ctx = buildCtx({ vehicles: [carB("car-1", "manual")] });
    const res = resolveSlotAssignmentForStudent(ctx, {
      licenseCategory: "B",
      transmission: "automatic",
      startsAt: START,
      endsAt: END,
    });
    expect(res).toBeNull();
  });

  it("picks the automatic car for an automatic-path student", () => {
    const ctx = buildCtx({ vehicles: [carB("car-man", "manual"), carB("car-auto", "automatic")] });
    const res = resolveSlotAssignmentForStudent(ctx, {
      licenseCategory: "B",
      transmission: "automatic",
      startsAt: START,
      endsAt: END,
    });
    expect(res?.vehicleId).toBe("car-auto");
  });

  it("never assigns a vehicle EXCLUSIVE to another instructor", () => {
    const exclusiveToOther: Vehicle = { ...carB("car-1"), assignedInstructorId: "instr-OTHER" };
    const ctx = buildCtx({ vehicles: [exclusiveToOther], instructorIds: ["instr-1"] });
    const res = resolveSlotAssignmentForStudent(ctx, {
      licenseCategory: "B",
      transmission: "manual",
      startsAt: START,
      endsAt: END,
    });
    expect(res).toBeNull();
  });

  it("respects explicit POOL membership", () => {
    const ctx = buildCtx({
      vehicles: [carB("car-1")],
      instructorIds: ["instr-1"],
      poolMembers: [{ vehicleId: "car-1", instructorId: "instr-OTHER" }],
    });
    const res = resolveSlotAssignmentForStudent(ctx, {
      licenseCategory: "B",
      transmission: "manual",
      startsAt: START,
      endsAt: END,
    });
    expect(res).toBeNull();
  });

  it("requires and returns a FOLLOW CAR for a moto student when the rule is on", () => {
    const withCar = buildCtx({
      vehicles: [motoA2("moto-1"), carB("car-1")],
      followCarMotoEnabled: true,
    });
    const res = resolveSlotAssignmentForStudent(withCar, {
      licenseCategory: "A2",
      transmission: "manual",
      startsAt: START,
      endsAt: END,
    });
    expect(res).toEqual({ instructorId: "instr-1", vehicleId: "moto-1", followVehicleId: "car-1" });

    const withoutCar = buildCtx({ vehicles: [motoA2("moto-1")], followCarMotoEnabled: true });
    expect(
      resolveSlotAssignmentForStudent(withoutCar, {
        licenseCategory: "A2",
        transmission: "manual",
        startsAt: START,
        endsAt: END,
      }),
    ).toBeNull();
  });

  it("treats a vehicle busy through the appointmentVehicles join as unavailable", () => {
    const busy = new Map([["car-1", [{ start: START.getTime(), end: END.getTime() }]]]);
    const ctx = buildCtx({ vehicles: [carB("car-1")], busy });
    expect(
      resolveSlotAssignmentForStudent(ctx, {
        licenseCategory: "B",
        transmission: "manual",
        startsAt: START,
        endsAt: END,
      }),
    ).toBeNull();
  });

  it("enforces the moto hierarchy (A2 student cannot get an A moto)", () => {
    const motoA: Vehicle = { ...motoA2("moto-A"), licenseCategory: "A" };
    const ctx = buildCtx({ vehicles: [motoA] });
    expect(
      resolveSlotAssignmentForStudent(ctx, {
        licenseCategory: "A2",
        transmission: "manual",
        startsAt: START,
        endsAt: END,
      }),
    ).toBeNull();
  });
});

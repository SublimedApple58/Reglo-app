import {
  reconcileAppointmentVehicles,
  resolveVehicleOwnerOnUpdate,
  type AppointmentVehicleTx,
} from "@/lib/autoscuole/appointment-vehicles";

const makeTx = () => {
  const deleteMany = jest.fn().mockResolvedValue(undefined);
  const create = jest.fn().mockResolvedValue(undefined);
  const tx: AppointmentVehicleTx = {
    autoscuolaAppointmentVehicle: { deleteMany, create },
  };
  return { tx, deleteMany, create };
};

describe("reconcileAppointmentVehicles", () => {
  it("always wipes existing rows first", async () => {
    const { tx, deleteMany } = makeTx();
    await reconcileAppointmentVehicles(tx, "appt1", "v1", null);
    expect(deleteMany).toHaveBeenCalledWith({ where: { appointmentId: "appt1" } });
  });

  it("writes a single primary row when there is no follow car", async () => {
    const { tx, create } = makeTx();
    await reconcileAppointmentVehicles(tx, "appt1", "v1", null);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: { appointmentId: "appt1", vehicleId: "v1", role: "primary" },
    });
  });

  it("writes primary + follow rows for a moto lesson with an auto al seguito", async () => {
    const { tx, create } = makeTx();
    await reconcileAppointmentVehicles(tx, "appt1", "moto", "car");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(1, {
      data: { appointmentId: "appt1", vehicleId: "moto", role: "primary" },
    });
    expect(create).toHaveBeenNthCalledWith(2, {
      data: { appointmentId: "appt1", vehicleId: "car", role: "follow" },
    });
  });

  it("clears all rows when there is no primary (and never writes a follow without a primary)", async () => {
    const { tx, deleteMany, create } = makeTx();
    await reconcileAppointmentVehicles(tx, "appt1", null, "car");
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("de-dupes a follow car equal to the primary (no duplicate row)", async () => {
    const { tx, create } = makeTx();
    await reconcileAppointmentVehicles(tx, "appt1", "v1", "v1");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: { appointmentId: "appt1", vehicleId: "v1", role: "primary" },
    });
  });
});

describe("resolveVehicleOwnerOnUpdate", () => {
  it("releases the exclusive owner when the vehicle goes inactive", () => {
    expect(
      resolveVehicleOwnerOnUpdate({ nextStatus: "inactive", payloadAssignedInstructorId: "i1" }),
    ).toBeNull();
    // even if the payload tries to keep/assign one
    expect(
      resolveVehicleOwnerOnUpdate({ nextStatus: "inactive", payloadAssignedInstructorId: undefined }),
    ).toBeNull();
  });

  it("keeps the owner untouched on maintenance (payload undefined → undefined)", () => {
    expect(
      resolveVehicleOwnerOnUpdate({
        nextStatus: "maintenance",
        payloadAssignedInstructorId: undefined,
      }),
    ).toBeUndefined();
  });

  it("assigns / unassigns per payload when active", () => {
    expect(
      resolveVehicleOwnerOnUpdate({ nextStatus: "active", payloadAssignedInstructorId: "i9" }),
    ).toBe("i9");
    expect(
      resolveVehicleOwnerOnUpdate({ nextStatus: "active", payloadAssignedInstructorId: null }),
    ).toBeNull();
    expect(
      resolveVehicleOwnerOnUpdate({ nextStatus: "active", payloadAssignedInstructorId: undefined }),
    ).toBeUndefined();
  });
});

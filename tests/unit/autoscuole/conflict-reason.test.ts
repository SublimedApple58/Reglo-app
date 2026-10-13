import {
  asSentence,
  busyVehicleIds,
  describeConflict,
  pickConflictingVehicle,
  type ReservedVehicle,
} from "@/lib/autoscuole/conflict-reason";

const MOTO: ReservedVehicle = { id: "moto", role: "primary" };
const EXTRA: ReservedVehicle = { id: "moto2", role: "extra_moto" };
const FOLLOW: ReservedVehicle = { id: "polo", role: "follow" };
// L'ordine è quello che usano i percorsi di creazione: principale, extra, seguito.
const RESERVED = [MOTO, EXTRA, FOLLOW];

describe("busyVehicleIds", () => {
  it("raccoglie principale, join e flotta senza duplicati", () => {
    expect(
      busyVehicleIds({
        vehicleId: "a",
        appointmentVehicles: [{ vehicleId: "a" }, { vehicleId: "b" }],
      }),
    ).toEqual(["a", "b"]);
  });

  it("conta anche l'auto al seguito di un container di gruppo", () => {
    expect(
      busyVehicleIds({
        vehicleId: "moto1",
        followVehicleId: "polo",
        fleetVehicles: [{ vehicleId: "moto2" }],
      }),
    ).toEqual(["moto1", "polo", "moto2"]);
  });

  it("ignora i null e torna lista vuota se non c'è nessun mezzo", () => {
    expect(busyVehicleIds({ vehicleId: null, followVehicleId: null })).toEqual([]);
  });
});

describe("pickConflictingVehicle", () => {
  it("trova l'auto al seguito quando è l'unica occupata", () => {
    expect(pickConflictingVehicle(RESERVED, ["polo"])).toEqual(FOLLOW);
  });

  it("con moto e auto al seguito occupate racconta la MOTO (non sostituibile)", () => {
    expect(pickConflictingVehicle(RESERVED, ["polo", "moto"])).toEqual(MOTO);
  });

  it("torna null quando l'impegno non tocca nessun veicolo riservato (è l'istruttore)", () => {
    expect(pickConflictingVehicle(RESERVED, ["altra-auto"])).toBeNull();
  });

  it("torna null senza veicoli riservati", () => {
    expect(pickConflictingVehicle([], ["polo"])).toBeNull();
  });
});

describe("describeConflict", () => {
  it("nomina l'auto al seguito", () => {
    expect(
      describeConflict({ kind: "vehicle", vehicleId: "polo", role: "follow" }, "POLO BLU"),
    ).toBe("l'auto al seguito POLO BLU è già impegnata in quell'orario");
  });

  it("accorda il genere sul veicolo principale", () => {
    expect(
      describeConflict({ kind: "vehicle", vehicleId: "v", role: "primary" }, "GOLF BLU"),
    ).toBe("il veicolo GOLF BLU è già impegnato in quell'orario");
  });

  it("distingue la moto aggiuntiva", () => {
    expect(
      describeConflict({ kind: "vehicle", vehicleId: "v", role: "extra_moto" }, "HONDA 500"),
    ).toBe("la moto aggiuntiva HONDA 500 è già impegnata in quell'orario");
  });

  it("dice quando l'impegno è una guida di gruppo", () => {
    expect(
      describeConflict(
        { kind: "vehicle", vehicleId: "polo", role: "follow", inGroupLesson: true },
        "POLO BLU",
      ),
    ).toBe("l'auto al seguito POLO BLU è impegnata in una guida di gruppo");
  });

  it("regge anche senza nome del veicolo", () => {
    expect(describeConflict({ kind: "vehicle", vehicleId: "polo", role: "follow" })).toBe(
      "l'auto al seguito è già impegnata in quell'orario",
    );
  });

  it("copre istruttore, istruttore in gruppo e slot bloccato", () => {
    expect(describeConflict({ kind: "instructor" })).toBe(
      "l'istruttore ha già un impegno in quell'orario",
    );
    expect(describeConflict({ kind: "instructor", inGroupLesson: true })).toBe(
      "l'istruttore è impegnato in una guida di gruppo",
    );
    expect(describeConflict({ kind: "block" })).toBe(
      "l'istruttore ha uno slot bloccato in quell'orario",
    );
  });
});

describe("asSentence", () => {
  it("mette maiuscola e punto", () => {
    expect(asSentence("l'auto al seguito POLO BLU è già impegnata in quell'orario")).toBe(
      "L'auto al seguito POLO BLU è già impegnata in quell'orario.",
    );
  });

  it("non esplode sulla stringa vuota", () => {
    expect(asSentence("")).toBe("");
  });
});

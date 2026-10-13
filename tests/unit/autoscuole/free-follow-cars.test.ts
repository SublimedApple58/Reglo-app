import { computeFreeVehiclesPerSlot } from "@/lib/autoscuole/free-follow-cars";

const car = (id: string) => ({ id, name: id.toUpperCase() });
const CARS = [car("polo"), car("golf"), car("panda")];

/** Un intervallo del 17/10/2026 che parte all'ora tonda `h` e dura `durationMin`. */
const span = (h: number, durationMin = 60) => {
  const startsAt = new Date(2026, 9, 17, h, 0, 0, 0);
  return { startsAt, endsAt: new Date(startsAt.getTime() + durationMin * 60 * 1000) };
};

const at = (h: number, durationMin = 60) => span(h, durationMin);
const slot = (key: string, h: number, durationMin = 60) => ({ key, ...span(h, durationMin) });

describe("computeFreeVehiclesPerSlot", () => {
  it("toglie l'auto occupata e tiene le altre", () => {
    const free = computeFreeVehiclesPerSlot({
      slots: [slot("s1", 9)],
      vehicles: CARS,
      busy: [{ ...at(9), vehicleIds: ["polo"] }],
    });
    expect(free.get("s1")?.map((c) => c.id)).toEqual(["golf", "panda"]);
  });

  it("un impegno che NON si sovrappone non toglie niente", () => {
    const free = computeFreeVehiclesPerSlot({
      slots: [slot("s1", 9)],
      vehicles: CARS,
      busy: [{ ...at(11), vehicleIds: ["polo"] }],
    });
    expect(free.get("s1")?.map((c) => c.id)).toEqual(["polo", "golf", "panda"]);
  });

  it("basta una sovrapposizione parziale per occupare", () => {
    // impegno 09:30-10:30 contro slot 09:00-10:00
    const busyStart = new Date(2026, 9, 17, 9, 30);
    const free = computeFreeVehiclesPerSlot({
      slots: [slot("s1", 9)],
      vehicles: CARS,
      busy: [
        {
          startsAt: busyStart,
          endsAt: new Date(busyStart.getTime() + 60 * 60 * 1000),
          vehicleIds: ["golf"],
        },
      ],
    });
    expect(free.get("s1")?.map((c) => c.id)).toEqual(["polo", "panda"]);
  });

  it("due slot diversi hanno risposte diverse", () => {
    const free = computeFreeVehiclesPerSlot({
      slots: [slot("mattina", 9), slot("pomeriggio", 15)],
      vehicles: CARS,
      busy: [
        { ...at(9), vehicleIds: ["polo"] },
        { ...at(15), vehicleIds: ["golf", "panda"] },
      ],
    });
    expect(free.get("mattina")?.map((c) => c.id)).toEqual(["golf", "panda"]);
    expect(free.get("pomeriggio")?.map((c) => c.id)).toEqual(["polo"]);
  });

  it("uno slot senza nessuna auto libera torna lista vuota, non assente", () => {
    const free = computeFreeVehiclesPerSlot({
      slots: [slot("s1", 9)],
      vehicles: CARS,
      busy: [{ ...at(9), vehicleIds: ["polo", "golf", "panda"] }],
    });
    expect(free.has("s1")).toBe(true);
    expect(free.get("s1")).toEqual([]);
  });

  it("un impegno che tiene piu' mezzi li toglie tutti", () => {
    const free = computeFreeVehiclesPerSlot({
      slots: [slot("s1", 9)],
      vehicles: CARS,
      busy: [{ ...at(9), vehicleIds: ["polo", "panda"] }],
    });
    expect(free.get("s1")?.map((c) => c.id)).toEqual(["golf"]);
  });

  it("conserva l'ordine dei veicoli in ingresso", () => {
    const free = computeFreeVehiclesPerSlot({
      slots: [slot("s1", 9)],
      vehicles: [car("zeta"), car("alfa")],
      busy: [],
    });
    expect(free.get("s1")?.map((c) => c.id)).toEqual(["zeta", "alfa"]);
  });
});

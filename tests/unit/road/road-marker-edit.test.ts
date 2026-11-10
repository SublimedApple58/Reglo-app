import { streetFromAddress } from "@/lib/places/nearby-address";
import { streetAt } from "@/lib/autoscuole/road/street-at";

describe("Road novembre R3 — via di una segnalazione spostata", () => {
  it("prende solo il nome della via dall'indirizzo", () => {
    expect(streetFromAddress("Via Roma, 42, 20123 Milano MI, Italia")).toBe("Via Roma");
    expect(streetFromAddress("P.za Castello, 10122 Torino TO, Italia")).toBe("P.za Castello");
  });
  it("solo zona o niente = null", () => {
    expect(streetFromAddress("20123 Milano MI, Italia")).toBeNull();
    expect(streetFromAddress(null)).toBeNull();
    expect(streetFromAddress("")).toBeNull();
  });
  it("un errore di Places dà null, senza lanciare", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(streetAt(45.07, 7.68, async () => { throw new Error("boom"); })).resolves.toBeNull();
    warn.mockRestore();
  });
  it("usa la via trovata", async () => {
    await expect(streetAt(45.07, 7.68, async () => "Via Po")).resolves.toBe("Via Po");
  });
});

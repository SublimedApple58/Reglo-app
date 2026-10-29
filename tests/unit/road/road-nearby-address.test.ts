

import { pickStreetAddress } from "@/lib/places/nearby-address";

describe("Reglo Road — indirizzo della posizione attuale (REG-656)", () => {
  it("preferisce via e numero alla sola zona", () => {
    expect(
      pickStreetAddress(["20123 Milano MI, Italia", "P.za del Duomo, 20122 Milano MI, Italia", "Via Torino, 2, 20123 Milano MI, Italia"]),
    ).toBe("Via Torino, 2, 20123 Milano MI, Italia");
  });
  it("senza numero civico: la prima con la via", () => {
    expect(pickStreetAddress(["20123 Milano MI, Italia", "P.za Castello, 10122 Torino TO, Italia"])).toBe(
      "P.za Castello, 10122 Torino TO, Italia",
    );
  });
  it("solo zona o niente", () => {
    expect(pickStreetAddress(["20123 Milano MI, Italia", undefined])).toBe("20123 Milano MI, Italia");
    expect(pickStreetAddress([])).toBeNull();
  });
});

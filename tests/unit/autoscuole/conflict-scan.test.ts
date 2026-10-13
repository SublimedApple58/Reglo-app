import {
  buildReservedVehicles,
  effectiveFollowVehicleId,
} from "@/lib/autoscuole/conflict-scan";

describe("buildReservedVehicles", () => {
  it("mette i mezzi nell'ordine in cui si racconta il conflitto", () => {
    expect(
      buildReservedVehicles({
        primaryVehicleId: "moto",
        extraMotoVehicleIds: ["moto2", "moto3"],
        followVehicleId: "polo",
      }),
    ).toEqual([
      { id: "moto", role: "primary" },
      { id: "moto2", role: "extra_moto" },
      { id: "moto3", role: "extra_moto" },
      { id: "polo", role: "follow" },
    ]);
  });

  it("salta quello che non c'è", () => {
    expect(buildReservedVehicles({ primaryVehicleId: "auto" })).toEqual([
      { id: "auto", role: "primary" },
    ]);
  });

  it("una guida senza veicoli non riserva niente", () => {
    expect(buildReservedVehicles({})).toEqual([]);
  });

  it("senza veicolo principale l'auto al seguito resta comunque riservata", () => {
    // Il backend lo vieta a monte (solo guide moto), ma l'elenco non deve
    // perdere pezzi per conto suo: chi lo usa decide cosa è lecito.
    expect(buildReservedVehicles({ followVehicleId: "polo" })).toEqual([
      { id: "polo", role: "follow" },
    ]);
  });
});

describe("effectiveFollowVehicleId", () => {
  it("assente eredita l'auto condivisa", () => {
    expect(effectiveFollowVehicleId("polo", undefined)).toBe("polo");
  });

  it("un id per la data vince su quello condiviso", () => {
    expect(effectiveFollowVehicleId("polo", "golf")).toBe("golf");
  });

  it("null è una scelta esplicita: nessuna auto al seguito", () => {
    expect(effectiveFollowVehicleId("polo", null)).toBeNull();
  });

  it("senza niente da nessuna delle due parti resta null", () => {
    expect(effectiveFollowVehicleId(undefined, undefined)).toBeNull();
    expect(effectiveFollowVehicleId(null, undefined)).toBeNull();
  });
});

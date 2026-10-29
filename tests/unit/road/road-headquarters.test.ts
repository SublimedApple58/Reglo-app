/**
 * REG-655: la sede di Road è solo quella vera (`isDefault`, non archiviata).
 * Niente più ripieghi su un altro luogo dell'autoscuola.
 */
const findFirst = jest.fn();
const updateMany = jest.fn().mockResolvedValue({ count: 1 });

jest.mock("@/lib/cache/redis", () => ({ getRedis: () => null }));
jest.mock("@/db/prisma", () => ({ prisma: { autoscuolaLocation: { findFirst, updateMany } } }));

import { roadHeadquarters } from "@/lib/autoscuole/road/headquarters";

describe("Reglo Road — la sede è una sola (REG-655)", () => {
  beforeEach(() => {
    findFirst.mockReset();
    updateMany.mockClear();
  });

  it("cerca solo la sede vera, non archiviata", async () => {
    findFirst.mockResolvedValue({ id: "s", address: "Via Roma 1", latitude: "45.1", longitude: "7.6" });
    await expect(roadHeadquarters("c", jest.fn())).resolves.toEqual({ lat: 45.1, lng: 7.6 });
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst.mock.calls[0][0].where).toEqual({ companyId: "c", isDefault: true, archivedAt: null });
  });

  it("senza sede: null, nessun altro luogo", async () => {
    findFirst.mockResolvedValue(null);
    const geocode = jest.fn();
    await expect(roadHeadquarters("c", geocode)).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(geocode).not.toHaveBeenCalled();
  });

  it("sede senza coordinate né indirizzo: null", async () => {
    findFirst.mockResolvedValue({ id: "s", address: null, latitude: null, longitude: null });
    await expect(roadHeadquarters("c", jest.fn())).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("sede con indirizzo senza coordinate: geocodifica e le salva", async () => {
    findFirst.mockResolvedValue({ id: "s", address: "Via Roma 1", latitude: null, longitude: null });
    const geocode = jest.fn().mockResolvedValue({ lat: 45.2, lng: 7.7 });
    await expect(roadHeadquarters("c", geocode)).resolves.toEqual({ lat: 45.2, lng: 7.7 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "s", address: "Via Roma 1", latitude: null, longitude: null },
      data: { latitude: 45.2, longitude: 7.7 },
    });
  });

  it("indirizzo non trovato: null, senza ripiego", async () => {
    findFirst.mockResolvedValue({ id: "s", address: "Via Nessuna", latitude: null, longitude: null });
    await expect(roadHeadquarters("c", jest.fn().mockResolvedValue(null))).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});

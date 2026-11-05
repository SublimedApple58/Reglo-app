/**
 * REG-724 — il luogo di una fascia scritta da un'eccezione (override del giorno,
 * ricorrente) o da una settimana a pubblicazione: il salvataggio lo tiene
 * (`sanitizeRangeLocations`, lo stesso della settimana tipo) e il motore lo
 * legge dal JSON dell'override (`scopeAvailabilityRecord`, `locationOfCoveringRange`).
 */
const findMany = jest.fn();
jest.mock("@/db/prisma", () => ({ prisma: { autoscuolaLocation: { findMany } } }));

import { sanitizeRangeLocations } from "@/lib/autoscuole/range-locations";
import { locationOfCoveringRange, scopeAvailabilityRecord } from "@/lib/autoscuole/location-booking";

const SEDE = "11111111-1111-4111-8111-111111111111";
const LINGOTTO = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  findMany.mockReset();
  findMany.mockResolvedValue([{ id: SEDE }, { id: LINGOTTO }]);
});

describe("override con il luogo: salvataggio", () => {
  it("tiene il luogo valido, omette «Tutti i luoghi» e i luoghi non attivi", async () => {
    const { ranges } = await sanitizeRangeLocations("c1", "instructor", {
      ranges: [
        { startMinutes: 480, endMinutes: 780, locationId: LINGOTTO },
        { startMinutes: 870, endMinutes: 1110, locationId: null },
        { startMinutes: 1140, endMinutes: 1200, locationId: "33333333-3333-4333-8333-333333333333" },
      ],
    });
    expect(ranges).toEqual([
      { startMinutes: 480, endMinutes: 780, locationId: LINGOTTO },
      { startMinutes: 870, endMinutes: 1110 },
      { startMinutes: 1140, endMinutes: 1200 },
    ]);
    expect(findMany).toHaveBeenCalledWith({ where: { companyId: "c1", archivedAt: null }, select: { id: true } });
  });

  it("senza luoghi richiesti non interroga il database e il JSON resta identico a prima", async () => {
    const { ranges } = await sanitizeRangeLocations("c1", "instructor", {
      ranges: [{ startMinutes: 480, endMinutes: 780 }],
    });
    expect(ranges).toEqual([{ startMinutes: 480, endMinutes: 780 }]);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("override con il luogo: motore", () => {
  it("dal JSON salvato il motore filtra per luogo e assegna il luogo della fascia", async () => {
    const { ranges } = await sanitizeRangeLocations("c1", "instructor", {
      ranges: [
        { startMinutes: 480, endMinutes: 780, locationId: LINGOTTO },
        { startMinutes: 870, endMinutes: 1110 },
      ],
    });
    // Come lo restituisce il resolver per una data con override.
    const record = { daysOfWeek: [3], ranges: JSON.parse(JSON.stringify(ranges)) };

    // Allievo della sede: resta solo la fascia valida per tutti.
    expect(scopeAvailabilityRecord(record, new Set([SEDE]))?.ranges).toEqual([{ startMinutes: 870, endMinutes: 1110 }]);
    // Allievo del Lingotto: entrambe.
    expect(scopeAvailabilityRecord(record, new Set([LINGOTTO]))?.ranges).toHaveLength(2);
    // Luogo della guida = luogo della fascia che la contiene.
    expect(locationOfCoveringRange(record.ranges, 540, 600)).toBe(LINGOTTO);
    expect(locationOfCoveringRange(record.ranges, 900, 960)).toBeNull();
  });
});

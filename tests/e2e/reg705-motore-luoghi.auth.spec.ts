import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * REG-705d — motore slot per luogo, via API (niente UI).
 *
 * Su un giorno lontano mette all'istruttore un override con due fasce in due
 * luoghi diversi, accende «Disponibilità per luogo» e controlla gli slot
 * dell'allievo del seed (allievo@reglo.it):
 * - allievo senza luoghi → slot da entrambe le fasce, ognuno col suo luogo;
 * - allievo con un luogo solo → solo gli slot di quella fascia.
 * Alla fine rimette override, luoghi dell'allievo e setting com'erano.
 *
 * Tocca setting condivisi con gli altri spec reg705: `--workers=1`.
 */

test.describe.configure({ timeout: 180_000 });

const DAY = "2026-12-22"; // martedì lontano, non usato dagli altri spec

type Slot = { startsAt: string; endsAt: string; locationId?: string | null; locationName?: string | null };

async function json(res: Awaited<ReturnType<APIRequestContext["get"]>>) {
  return (await res.json()) as { success: boolean; data?: unknown; message?: string };
}

test("gli slot seguono i luoghi delle fasce e dell'allievo", async ({ request }) => {
  const settings = (await json(await request.get("/api/autoscuole/settings"))).data as Record<string, unknown>;
  const locations = (await json(await request.get("/api/autoscuole/locations"))).data as {
    id: string;
    name: string;
    isDefault: boolean;
  }[];
  test.skip(locations.length < 2, "Servono almeno due luoghi.");
  const [locA, locB] = [locations.find((l) => l.isDefault) ?? locations[0], locations.find((l) => !l.isDefault)!];

  const students = (await json(await request.get("/api/autoscuole/students"))).data as {
    id: string;
    email: string | null;
    locationIds?: string[];
    defaultLocationId?: string | null;
    assignedInstructorId?: string | null;
  }[];
  const student = students.find((s) => s.email === "allievo@reglo.it");
  test.skip(!student, "Serve allievo@reglo.it nel seed.");
  if (!student) return;

  const instructors = (await json(await request.get("/api/autoscuole/instructors"))).data as {
    id: string;
    status: string;
  }[];
  // L'allievo legato al suo istruttore vede solo lui: si usa quello.
  const instructor =
    instructors.find((i) => i.id === student.assignedInstructorId) ??
    instructors.find((i) => i.status === "active")!;

  const before = (await json(
    await request.get(
      `/api/autoscuole/availability/overrides?ownerType=instructor&ownerId=${instructor.id}&from=${DAY}&to=${DAY}`,
    ),
  )).data as { date: string; ranges: unknown }[];
  const previousOverride = before.find((o) => String(o.date).slice(0, 10) === DAY) ?? null;

  const slotsFor = async () => {
    const res = await json(
      await request.get(
        `/api/autoscuole/available-slots?studentId=${student.id}&date=${DAY}&durationMinutes=60&instructorId=${instructor.id}`,
      ),
    );
    expect(res.success, res.message).toBe(true);
    return res.data as Slot[];
  };

  try {
    await request.patch("/api/autoscuole/settings", {
      data: { availabilityByLocation: true, locationChangeBufferEnabled: false },
    });
    const set = await json(
      await request.post("/api/autoscuole/availability/overrides", {
        data: {
          ownerType: "instructor",
          ownerId: instructor.id,
          date: DAY,
          ranges: [
            { startMinutes: 8 * 60, endMinutes: 10 * 60, locationId: locA.id },
            { startMinutes: 14 * 60, endMinutes: 16 * 60, locationId: locB.id },
          ],
        },
      }),
    );
    expect(set.success, set.message).toBe(true);

    // Allievo senza luoghi: entrambe le fasce, ognuna col suo luogo.
    await request.put(`/api/autoscuole/students/${student.id}/locations`, { data: { locationIds: [] } });
    const all = await slotsFor();
    expect(all.length).toBeGreaterThan(0);
    const locs = new Set(all.map((s) => s.locationId));
    expect(locs).toEqual(new Set([locA.id, locB.id]));
    expect(all.find((s) => s.locationId === locB.id)?.locationName).toBe(locB.name);

    // Allievo con il solo luogo B: solo gli slot del pomeriggio.
    await request.put(`/api/autoscuole/students/${student.id}/locations`, { data: { locationIds: [locB.id] } });
    const onlyB = await slotsFor();
    expect(onlyB.length).toBeGreaterThan(0);
    expect(onlyB.every((s) => s.locationId === locB.id)).toBe(true);
    expect(onlyB.every((s) => new Date(s.startsAt).getUTCHours() >= 12)).toBe(true);

    // Funzione spenta: gli slot tornano senza luogo, da entrambe le fasce.
    await request.patch("/api/autoscuole/settings", { data: { availabilityByLocation: false } });
    const off = await slotsFor();
    expect(off.length).toBe(all.length);
    expect(off.every((s) => s.locationId === undefined)).toBe(true);
  } finally {
    if (previousOverride) {
      await request.post("/api/autoscuole/availability/overrides", {
        data: { ownerType: "instructor", ownerId: instructor.id, date: DAY, ranges: previousOverride.ranges },
      });
    } else {
      await request.delete("/api/autoscuole/availability/overrides", {
        data: { ownerType: "instructor", ownerId: instructor.id, date: DAY },
      });
    }
    await request.put(`/api/autoscuole/students/${student.id}/locations`, {
      data: { locationIds: student.locationIds ?? [] },
    });
    await request.patch(`/api/autoscuole/students/${student.id}/default-location`, {
      data: { locationId: student.defaultLocationId ?? null },
    });
    await request.patch("/api/autoscuole/settings", {
      data: {
        availabilityByLocation: settings.availabilityByLocation === true,
        locationChangeBufferEnabled: settings.locationChangeBufferEnabled === true,
      },
    });
  }
});

import { test, expect, request as pwRequest, type APIRequestContext, type Page } from "@playwright/test";
import { markNewsSeen } from "./news-seen";

/**
 * REG-717 — cambio rapido del luogo di una fascia dall'agenda web + controllo
 * dei ruoli sulle scritture della disponibilità.
 *
 * 1. Ruoli (API, come dall'app): l'allievo non può scrivere fasce, override né
 *    approvare guide fuori disponibilità; l'istruttore scrive le proprie fasce
 *    ma non quelle di un collega.
 * 2. Agenda: clic sulla scritta della fascia → menu → nuovo luogo solo per quel
 *    giorno (override), «Annulla» dal messaggio rimette tutto com'era.
 * 3. Agenda: lo stesso con «Ogni martedì» → cambia la settimana tipo, «Annulla»
 *    la rimette identica.
 *
 * Gira sul titolare del seed («Disponibilità per luogo» accesa e poi rimessa
 * com'era). Non prenota né manda niente. Tocca setting condivisi con gli spec
 * reg705/706: `--workers=1`.
 */

test.describe.configure({ timeout: 240_000 });

const PASSWORD = process.env.E2E_PASSWORD || "RegloTest2026!";
const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL || "allievo@reglo.it";
const INSTRUCTOR_EMAIL = process.env.E2E_INSTRUCTOR_EMAIL || "istruttore@reglo.it";
const FORBIDDEN = "Non puoi modificare questa disponibilità.";
// Martedì lontani, non usati dagli altri spec (reg705 usa il 22/12).
const DAY = "2026-12-15";
const DAY_INSTRUCTOR = "2026-12-17";

type Instructor = { id: string; name: string; userId: string | null; companyId: string; status: string };
type Location = { id: string; name: string; isDefault: boolean };
type Range = { startMinutes: number; endMinutes: number; locationId?: string | null };

async function json(res: Awaited<ReturnType<APIRequestContext["get"]>>) {
  return (await res.json()) as { success: boolean; data?: unknown; message?: string };
}

async function mobileContext(baseURL: string, email: string, companyId: string) {
  const anon = await pwRequest.newContext({ baseURL });
  const login = (await json(await anon.post("/api/mobile/auth/login", { data: { email, password: PASSWORD } }))) as {
    success: boolean;
    message?: string;
    data?: { token: string; user: { id: string } };
  };
  await anon.dispose();
  expect(login.success, login.message).toBe(true);
  const ctx = await pwRequest.newContext({
    baseURL,
    extraHTTPHeaders: { authorization: `Bearer ${login.data!.token}`, "x-reglo-company-id": companyId },
  });
  return { ctx, userId: login.data!.user.id };
}

async function overridesOn(request: APIRequestContext, instructorId: string, date: string) {
  const res = await json(
    await request.get(`/api/autoscuole/availability/overrides?ownerType=instructor&ownerId=${instructorId}&from=${date}&to=${date}`),
  );
  return ((res.data ?? []) as { date: string; ranges: Range[] }[]).filter((o) => String(o.date).slice(0, 10) === date);
}

async function weeklyOf(request: APIRequestContext, instructorId: string) {
  const res = await json(await request.get(`/api/autoscuole/availability/default?ownerType=instructor&ownerId=${instructorId}`));
  return res.data as { daysOfWeek: number[]; ranges: Range[]; scheduleByDay: Record<string, Range[]> } | null;
}

async function seed(request: APIRequestContext) {
  const instructors = ((await json(await request.get("/api/autoscuole/instructors"))).data ?? []) as Instructor[];
  const locations = ((await json(await request.get("/api/autoscuole/locations"))).data ?? []) as Location[];
  const marco = instructors.find((i) => i.name === "Marco Bianchi" && i.status === "active");
  return { instructors, locations, marco };
}

test("ruoli: l'allievo non scrive la disponibilità, l'istruttore solo la propria", async ({ request, baseURL }) => {
  const { instructors, marco } = await seed(request);
  test.skip(!marco, "Serve Marco Bianchi nel seed.");
  const companyId = marco!.companyId;
  // Il titolare invece li ha (scheda Allievi, codici degli istruttori autonomi).
  for (const i of instructors) expect(i).toHaveProperty("inviteCode");
  const ranges = [{ startMinutes: 9 * 60, endMinutes: 10 * 60 }];
  const before = await overridesOn(request, marco!.id, DAY);

  // Allievo, come dall'app.
  const student = await mobileContext(baseURL!, STUDENT_EMAIL, companyId);
  try {
    const writes = [
      student.ctx.post("/api/autoscuole/availability/overrides", {
        data: { ownerType: "instructor", ownerId: marco!.id, date: DAY, ranges },
      }),
      student.ctx.delete("/api/autoscuole/availability/overrides", {
        data: { ownerType: "instructor", ownerId: marco!.id, date: DAY },
      }),
      student.ctx.post("/api/autoscuole/availability/overrides/recurring", {
        data: { ownerType: "instructor", ownerId: marco!.id, dayOfWeek: 2, ranges, weeksAhead: 1 },
      }),
      student.ctx.post("/api/autoscuole/availability/slots", {
        data: {
          ownerType: "instructor",
          ownerId: marco!.id,
          startsAt: "2026-12-15T09:00:00.000Z",
          endsAt: "2026-12-15T10:00:00.000Z",
          daysOfWeek: [2],
          weeks: 1,
        },
      }),
      student.ctx.delete("/api/autoscuole/availability/slots", {
        data: { ownerType: "instructor", ownerId: marco!.id, startsAt: "2026-12-15T09:00:00.000Z", endsAt: "2026-12-15T10:00:00.000Z" },
      }),
      // Le preferenze di un ALTRO allievo.
      student.ctx.delete("/api/autoscuole/availability/slots", {
        data: {
          ownerType: "student",
          ownerId: marco!.userId ?? marco!.id,
          startsAt: "2026-12-15T09:00:00.000Z",
          endsAt: "2026-12-15T10:00:00.000Z",
        },
      }),
      student.ctx.post(`/api/autoscuole/appointments/${marco!.id}/approve-override`),
    ];
    for (const res of await Promise.all(writes)) {
      const body = await json(res);
      expect(body.success).toBe(false);
      expect(body.message).toBe(FORBIDDEN);
    }
    // La lista istruttori (la legge la Home allievo) non porta i codici di invito.
    const list = (await json(await student.ctx.get("/api/autoscuole/instructors"))).data as Record<string, unknown>[];
    expect(list.length).toBeGreaterThan(0);
    for (const i of list) expect(i).not.toHaveProperty("inviteCode");
  } finally {
    await student.ctx.dispose();
  }
  // Niente è cambiato.
  expect(await overridesOn(request, marco!.id, DAY)).toEqual(before);
  expect(await weeklyOf(request, marco!.id)).not.toBeNull();

  // Istruttore, come dall'app: le proprie fasce sì, quelle di Marco no.
  const instructor = await mobileContext(baseURL!, INSTRUCTOR_EMAIL, companyId);
  try {
    const own = instructors.find((i) => i.userId === instructor.userId);
    test.skip(!own, "L'istruttore di test non è in questa autoscuola.");
    expect(await overridesOn(request, own!.id, DAY_INSTRUCTOR)).toEqual([]);
    const mine = await json(
      await instructor.ctx.post("/api/autoscuole/availability/overrides", {
        data: { ownerType: "instructor", ownerId: own!.id, date: DAY_INSTRUCTOR, ranges },
      }),
    );
    expect(mine.success, mine.message).toBe(true);
    const removed = await json(
      await instructor.ctx.delete("/api/autoscuole/availability/overrides", {
        data: { ownerType: "instructor", ownerId: own!.id, date: DAY_INSTRUCTOR },
      }),
    );
    expect(removed.success, removed.message).toBe(true);
    expect(await overridesOn(request, own!.id, DAY_INSTRUCTOR)).toEqual([]);

    if (own!.id !== marco!.id) {
      const other = await json(
        await instructor.ctx.post("/api/autoscuole/availability/overrides", {
          data: { ownerType: "instructor", ownerId: marco!.id, date: DAY, ranges },
        }),
      );
      expect(other.success).toBe(false);
      expect(other.message).toBe(FORBIDDEN);
      expect(await overridesOn(request, marco!.id, DAY)).toEqual(before);
    }
  } finally {
    await instructor.ctx.dispose();
  }
});

async function openMarcoDay(page: Page, marcoId: string) {
  await page.addInitScript((id) => {
    try {
      localStorage.setItem("reglo-agenda-filters", JSON.stringify({ instructor: [id], vehicle: [], status: [], type: [] }));
    } catch {
      // storage non disponibile
    }
  }, marcoId);
  await page.goto(`/it/user/autoscuole?date=${DAY}`);
  const giorno = page.getByText("Giorno", { exact: true });
  await expect(giorno.first()).toBeVisible({ timeout: 120_000 });
  await giorno.first().click();
  const col = page.locator(`[data-agenda-col-instructor="${marcoId}"][data-agenda-col-day="${DAY}"]`);
  await expect(col).toBeVisible({ timeout: 60_000 });
  return col.locator("[data-agenda-band-location]").first();
}

test("agenda: luogo della fascia solo per quel giorno, poi «Annulla»", async ({ page, request }) => {
  await markNewsSeen(page);
  const original = (await json(await request.get("/api/autoscuole/settings"))).data as { availabilityByLocation?: boolean };
  const { locations, marco } = await seed(request);
  test.skip(!marco || locations.length < 2, "Servono Marco Bianchi e almeno due luoghi.");
  const target = locations.find((l) => !l.isDefault)!;
  expect(await overridesOn(request, marco!.id, DAY)).toEqual([]);
  const weeklyBefore = await weeklyOf(request, marco!.id);

  try {
    await request.patch("/api/autoscuole/settings", { data: { availabilityByLocation: true } });
    const label = await openMarcoDay(page, marco!.id);
    await expect(label).toHaveText("Tutti i luoghi", { timeout: 60_000 });

    await label.click();
    const menu = page.getByTestId("band-location-menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByText("Luogo della fascia 08:00–13:00")).toBeVisible();
    await expect(menu.getByText("Solo martedì 15")).toBeVisible();
    await expect(menu.getByTestId("band-location-every-weekday")).toHaveAttribute("aria-checked", "false");
    await menu.getByTestId("band-location-option").filter({ hasText: target.name }).click();
    await expect(menu).toBeHidden();

    await expect(label).toHaveText(target.name, { timeout: 30_000 });
    const toastTitle = `Tutti i luoghi → ${target.name}, solo martedì 15`;
    await expect(page.getByText(toastTitle).first()).toBeVisible();
    const day = await overridesOn(request, marco!.id, DAY);
    expect(day).toHaveLength(1);
    expect(day[0].ranges).toEqual([
      { startMinutes: 480, endMinutes: 780, locationId: target.id },
      { startMinutes: 840, endMinutes: 1140 },
    ]);
    expect(await weeklyOf(request, marco!.id)).toEqual(weeklyBefore);

    // «Annulla»: l'override sparisce, il giorno torna alla settimana tipo.
    await page.getByRole("button", { name: "Annulla" }).first().click();
    await expect(label).toHaveText("Tutti i luoghi", { timeout: 30_000 });
    await expect.poll(() => overridesOn(request, marco!.id, DAY)).toEqual([]);
  } finally {
    const left = await overridesOn(request, marco!.id, DAY);
    if (left.length) {
      await request.delete("/api/autoscuole/availability/overrides", {
        data: { ownerType: "instructor", ownerId: marco!.id, date: DAY },
      });
    }
    await request.patch("/api/autoscuole/settings", {
      data: { availabilityByLocation: original.availabilityByLocation === true },
    });
  }
});

test("agenda: «Ogni martedì» cambia la settimana tipo, «Annulla» la rimette identica", async ({ page, request }) => {
  await markNewsSeen(page);
  const original = (await json(await request.get("/api/autoscuole/settings"))).data as { availabilityByLocation?: boolean };
  const { locations, marco } = await seed(request);
  test.skip(!marco || locations.length < 2, "Servono Marco Bianchi e almeno due luoghi.");
  const target = locations.find((l) => !l.isDefault)!;
  expect(await overridesOn(request, marco!.id, DAY)).toEqual([]);
  const weeklyBefore = await weeklyOf(request, marco!.id);

  try {
    await request.patch("/api/autoscuole/settings", { data: { availabilityByLocation: true } });
    const label = await openMarcoDay(page, marco!.id);
    await expect(label).toHaveText("Tutti i luoghi", { timeout: 60_000 });

    await label.click();
    const menu = page.getByTestId("band-location-menu");
    const every = menu.getByTestId("band-location-every-weekday");
    await every.click();
    await expect(every).toHaveAttribute("aria-checked", "true");
    await menu.getByTestId("band-location-option").filter({ hasText: target.name }).click();
    await expect(menu).toBeHidden();

    await expect(label).toHaveText(target.name, { timeout: 30_000 });
    await expect(page.getByText(`Tutti i luoghi → ${target.name}, ogni martedì`).first()).toBeVisible();
    // Nessun override: è cambiata la settimana tipo, solo il martedì.
    expect(await overridesOn(request, marco!.id, DAY)).toEqual([]);
    const weekly = await weeklyOf(request, marco!.id);
    expect(weekly?.scheduleByDay?.["2"]?.[0]).toEqual({ startMinutes: 480, endMinutes: 780, locationId: target.id });
    expect(weekly?.scheduleByDay?.["1"]?.[0]).toEqual({ startMinutes: 480, endMinutes: 780 });

    await page.getByRole("button", { name: "Annulla" }).first().click();
    await expect(label).toHaveText("Tutti i luoghi", { timeout: 30_000 });
    await expect.poll(() => weeklyOf(request, marco!.id)).toEqual(weeklyBefore);
  } finally {
    await request.patch("/api/autoscuole/settings", {
      data: { availabilityByLocation: original.availabilityByLocation === true },
    });
  }
});

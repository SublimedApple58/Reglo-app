import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { markNewsSeen } from "./news-seen";

/**
 * REG-724 — luogo delle fasce nelle eccezioni (Calendario della modalità
 * predefinita) e nelle settimane della modalità «A pubblicazione» (web).
 *
 * Gira sul titolare del seed, su Marco Bianchi. Accende «Disponibilità per
 * luogo», sceglie un luogo per la prima fascia di un giorno lontano e controlla
 * che l'override salvato lo porti; poi rimette override, modalità
 * dell'istruttore e setting com'erano. Non pubblica né prenota.
 *
 * Tocca setting condivisi con gli spec reg705/706/717: `--workers=1`.
 */

test.describe.configure({ timeout: 240_000 });

test.beforeEach(async ({ page }) => {
  await markNewsSeen(page);
});

const URL = "/it/user/autoscuole?tab=settings&pane=instructors";

type Range = { startMinutes: number; endMinutes: number; locationId?: string | null };
type Instructor = { id: string; name: string; status: string; settings: Record<string, unknown> | null };
type Location = { id: string; name: string };

async function json(res: Awaited<ReturnType<APIRequestContext["get"]>>) {
  return (await res.json()) as { success: boolean; data?: unknown; message?: string };
}

async function patchSettings(request: APIRequestContext, data: Record<string, unknown>) {
  expect((await json(await request.patch("/api/autoscuole/settings", { data }))).success).toBe(true);
}

async function overrideOn(request: APIRequestContext, instructorId: string, date: string) {
  const res = await json(
    await request.get(`/api/autoscuole/availability/overrides?ownerType=instructor&ownerId=${instructorId}&from=${date}&to=${date}`),
  );
  return ((res.data ?? []) as { date: string; ranges: Range[] }[]).find((o) => String(o.date).slice(0, 10) === date) ?? null;
}

async function restoreOverride(
  request: APIRequestContext,
  instructorId: string,
  date: string,
  before: { ranges: Range[] } | null,
) {
  const res = before
    ? await request.post("/api/autoscuole/availability/overrides", {
        data: { ownerType: "instructor", ownerId: instructorId, date, ranges: before.ranges },
      })
    : await request.delete("/api/autoscuole/availability/overrides", {
        data: { ownerType: "instructor", ownerId: instructorId, date },
      });
  expect((await json(res)).success).toBe(true);
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDaysUTC = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
const mondayOf = (d: Date) => addDaysUTC(d, -((d.getUTCDay() + 6) % 7));

async function seed(request: APIRequestContext) {
  const instructors = ((await json(await request.get("/api/autoscuole/instructors"))).data ?? []) as Instructor[];
  const locations = ((await json(await request.get("/api/autoscuole/locations"))).data ?? []) as Location[];
  const marco = instructors.find((i) => i.name === "Marco Bianchi" && i.status === "active") ?? null;
  return { locations, marco };
}

// `settings` null nel database = nessuna personalizzazione: l'API vuole un
// oggetto, `{}` è equivalente.
async function setMode(request: APIRequestContext, instructor: Instructor, settings: Record<string, unknown> | null) {
  const res = await json(
    await request.patch(`/api/autoscuole/instructors/${instructor.id}`, { data: { settings: settings ?? {} } }),
  );
  expect(res.success, res.message).toBe(true);
}

async function openAvailability(page: Page, name: string) {
  await page.goto(URL);
  const row = page.getByText(name, { exact: true }).first().locator("xpath=../..");
  const gestisci = row.getByRole("button", { name: "Gestisci" });
  await expect(gestisci).toBeVisible({ timeout: 120_000 });
  await gestisci.click();
  await page.getByRole("button", { name: "Disponibilità", exact: true }).click();
}

async function pickLocation(page: Page, scope: ReturnType<Page["locator"]>, target: string) {
  const select = scope.getByTestId("range-location-select").first();
  await expect(select).toBeVisible({ timeout: 30_000 });
  // Timeout per azione: se qualcosa si blocca il test fallisce prima del suo
  // timeout e il `finally` rimette tutto com'era.
  await select.click({ timeout: 20_000 });
  await page.getByRole("menuitem").filter({ hasText: target }).first().click({ timeout: 20_000 });
  await expect(select).toHaveText(target);
}

test("eccezione del giorno dal Calendario: il luogo si sceglie e si salva", async ({ page, request }) => {
  const original = (await json(await request.get("/api/autoscuole/settings"))).data as Record<string, unknown>;
  const { locations, marco } = await seed(request);
  test.skip(!marco || locations.length < 2, "Servono Marco Bianchi e almeno due luoghi.");
  const instructor = marco!;
  test.skip(instructor.settings?.availabilityMode === "publication", "Marco è in modalità pubblicazione.");

  // Un mercoledì tra ~6 settimane, nel mese successivo o in quello dopo.
  const today = new Date();
  let day = addDaysUTC(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())), 42);
  while (day.getUTCDay() !== 3) day = addDaysUTC(day, 1);
  const date = ymd(day);
  const monthOffset = (day.getUTCFullYear() - today.getFullYear()) * 12 + day.getUTCMonth() - today.getMonth();
  const before = await overrideOn(request, instructor.id, date);
  const target = locations[1];

  await patchSettings(request, { availabilityByLocation: true });
  try {
    // Giorno di partenza noto: due fasce senza luogo. Vedere le due righe a
    // schermo prova che le eccezioni sono caricate (prima il pannello mostra la
    // settimana tipo e un clic finirebbe sui dati sbagliati).
    const seeded = await json(
      await request.post("/api/autoscuole/availability/overrides", {
        data: {
          ownerType: "instructor",
          ownerId: instructor.id,
          date,
          ranges: [
            { startMinutes: 8 * 60, endMinutes: 12 * 60 },
            { startMinutes: 14 * 60, endMinutes: 17 * 60 },
          ],
        },
      }),
    );
    expect(seeded.success, seeded.message).toBe(true);

    await openAvailability(page, instructor.name);
    await page.getByRole("button", { name: "Calendario", exact: true }).click();
    for (let i = 0; i < monthOffset; i++) await page.getByRole("button", { name: "Mese successivo" }).click();
    const list = page.getByTestId("located-range-list");
    await expect(async () => {
      const cell = page.locator(`[data-date="${date}"]`);
      if ((await cell.getAttribute("class"))?.includes("bg-navy-900") !== true) await cell.click();
      await expect(list.getByTestId("located-range-row")).toHaveCount(2, { timeout: 3_000 });
    }).toPass({ timeout: 60_000 });
    await pickLocation(page, list, target.name);

    // Salvato davvero: l'override del giorno porta il luogo sulla prima fascia.
    await expect
      .poll(async () => (await overrideOn(request, instructor.id, date))?.ranges?.[0]?.locationId ?? null, {
        timeout: 20_000,
      })
      .toBe(target.id);

    // Ricaricando, il selettore mostra lo stesso luogo.
    await openAvailability(page, instructor.name);
    await page.getByRole("button", { name: "Calendario", exact: true }).click();
    for (let i = 0; i < monthOffset; i++) await page.getByRole("button", { name: "Mese successivo" }).click();
    await page.locator(`[data-date="${date}"]`).click();
    await expect(page.getByTestId("located-range-list").getByTestId("range-location-select").first()).toHaveText(
      target.name,
      { timeout: 30_000 },
    );
  } finally {
    await restoreOverride(request, instructor.id, date, before);
    await patchSettings(request, { availabilityByLocation: original.availabilityByLocation === true });
  }
});

test("settimana a pubblicazione: il luogo della giornata si sceglie e si salva", async ({ page, request }) => {
  const original = (await json(await request.get("/api/autoscuole/settings"))).data as Record<string, unknown>;
  const { locations, marco } = await seed(request);
  test.skip(!marco || locations.length < 2, "Servono Marco Bianchi e almeno due luoghi.");
  const instructor = marco!;
  const originalSettings = instructor.settings ?? null;

  // Lunedì della «Settimana +4»: non pubblicata dagli altri spec.
  const date = ymd(addDaysUTC(mondayOf(new Date()), 28));
  const before = await overrideOn(request, instructor.id, date);
  const target = locations[1];

  await patchSettings(request, { availabilityByLocation: true });
  await setMode(request, instructor, { ...(originalSettings ?? {}), availabilityMode: "publication" });
  try {
    await openAvailability(page, instructor.name);
    await page.getByRole("button", { name: /Settimana \+4/ }).click();
    // La settimana si ricarica (e chiude la riga aperta) quando arrivano le
    // pubblicate: si riapre finché compare l'editor della giornata.
    // Riga del lunedì giusto, con i luoghi già caricati (la riga chiusa mostra
    // il luogo accanto all'orario).
    const dayNum = Number(date.slice(8, 10));
    const monday = page.getByRole("button", { name: new RegExp(`^Lunedì ${dayNum} `) });
    await expect(monday).toContainText(/luoghi|Riposo/, { timeout: 30_000 });
    const save = page.getByRole("button", { name: "Salva giorno" });
    await expect(async () => {
      if (!(await save.isVisible())) await monday.click();
      await expect(save).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });

    const on = page.getByText("Disponibile", { exact: true }).locator("xpath=..").getByRole("switch");
    if ((await on.getAttribute("aria-checked")) !== "true") await on.click();
    await pickLocation(page, page.locator("body"), target.name);
    await page.getByRole("button", { name: "Salva giorno" }).click();

    await expect
      .poll(async () => (await overrideOn(request, instructor.id, date))?.ranges?.[0]?.locationId ?? null, {
        timeout: 20_000,
      })
      .toBe(target.id);
    // La riga chiusa mostra il luogo accanto all'orario.
    await expect(monday).toContainText(target.name, { timeout: 20_000 });
  } finally {
    await restoreOverride(request, instructor.id, date, before);
    await setMode(request, instructor, originalSettings);
    await patchSettings(request, { availabilityByLocation: original.availabilityByLocation === true });
  }
});

import { test, expect, type APIRequestContext } from "@playwright/test";
import { markNewsSeen } from "./news-seen";

/**
 * REG-705b — «Disponibilità per luogo» in Sede e luoghi + luoghi dell'allievo
 * nella scheda. Gira loggato come il titolare del seed (titolare@reglo.it,
 * «Autoscuola Reglo», che ha più luoghi). Alla fine rimette setting e luoghi
 * dell'allievo com'erano.
 *
 * Tocca un setting dell'autoscuola condiviso con `reg705-luogo-fasce`: lanciali
 * con `--workers=1`, in parallelo si sovrascrivono a vicenda.
 */

// Il dev server compila le pagine al primo giro: margine largo.
test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page }) => {
  await markNewsSeen(page);
});

const SETTINGS_URL = "/it/user/autoscuole?tab=settings&pane=locations";
const STUDENTS_URL = "/it/user/autoscuole/students";

type Settings = {
  availabilityByLocation: boolean;
  locationChangeBufferEnabled: boolean;
  locationChangeBufferMinutes: number;
};

async function readSettings(request: APIRequestContext): Promise<Settings> {
  const res = await request.get("/api/autoscuole/settings");
  const json = await res.json();
  expect(json.success).toBe(true);
  return {
    availabilityByLocation: json.data.availabilityByLocation,
    locationChangeBufferEnabled: json.data.locationChangeBufferEnabled,
    locationChangeBufferMinutes: json.data.locationChangeBufferMinutes,
  };
}

async function patchSettings(request: APIRequestContext, patch: Partial<Settings>) {
  const res = await request.patch("/api/autoscuole/settings", { data: patch });
  expect((await res.json()).success).toBe(true);
}

test("interruttore e pausa tra luoghi in Sede e luoghi", async ({ page, request }) => {
  const original = await readSettings(request);
  await patchSettings(request, {
    availabilityByLocation: false,
    locationChangeBufferEnabled: true,
    locationChangeBufferMinutes: 30,
  });
  try {
    await page.goto(SETTINGS_URL);
    const card = page.getByTestId("location-availability-card");
    await expect(card).toBeVisible({ timeout: 60_000 });
    // Il clic prima dell'idratazione andrebbe perso: si aspetta che la card
    // abbia letto i setting (testo dello stato spento).
    await expect(card.getByText("valgono per tutti gli allievi")).toBeVisible({ timeout: 30_000 });
    // La card sta in fondo al pane che scorre: centrata, il clic non finisce
    // sul contenitore.
    await card.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const main = card.getByRole("switch").first();
    await expect(main).toHaveAttribute("aria-checked", "false");

    await main.click();
    await expect(main).toHaveAttribute("aria-checked", "true");
    await expect(card.getByText("Pausa tra luoghi diversi")).toBeVisible();

    await card.getByRole("button", { name: "Più minuti" }).click();
    await expect(card.getByTestId("location-change-buffer-minutes")).toHaveText("35 min");
    // Il salvataggio dei minuti parte dopo una pausa nei clic.
    await expect
      .poll(async () => (await readSettings(request)).locationChangeBufferMinutes, {
        timeout: 10_000,
      })
      .toBe(35);
    expect((await readSettings(request)).availabilityByLocation).toBe(true);

    const pause = card.getByRole("switch", { name: "Pausa tra luoghi diversi" });
    await pause.click();
    await expect(pause).toHaveAttribute("aria-checked", "false");
    await expect
      .poll(async () => (await readSettings(request)).locationChangeBufferEnabled, {
        timeout: 20_000,
      })
      .toBe(false);
  } finally {
    await patchSettings(request, original);
  }
});

test("luoghi dell'allievo e principale nella scheda", async ({ page, request }) => {
  const original = await readSettings(request);
  await patchSettings(request, { availabilityByLocation: true });

  // L'allievo è il primo della lista a schermo (la lista filtra per fase).
  await page.goto(STUDENTS_URL);
  await expect(page.getByTestId("autoscuole-students-page")).toBeVisible({ timeout: 60_000 });
  const firstBox = page.getByRole("checkbox", { name: /^Seleziona (?!tutti)/ }).first();
  await expect(firstBox).toBeVisible({ timeout: 30_000 });
  const label = (await firstBox.getAttribute("aria-label")) ?? "";
  const shownName = label.replace(/^Seleziona /, "").trim();

  const studentsJson = await (await request.get("/api/autoscuole/students")).json();
  expect(studentsJson.success).toBe(true);
  type Row = { id: string; firstName: string; lastName: string; locationIds?: string[]; defaultLocationId?: string | null };
  const student = (studentsJson.data as Row[]).find((s) => {
    const a = `${s.firstName} ${s.lastName}`.trim();
    const b = `${s.lastName} ${s.firstName}`.trim();
    return a === shownName || b === shownName;
  });
  test.skip(!student, `Allievo «${shownName}» non trovato nell'API.`);
  if (!student) return;
  const before = {
    locationIds: student.locationIds ?? [],
    defaultLocationId: student.defaultLocationId ?? null,
  };

  try {
    // Parte da «tutti i luoghi» per un esito prevedibile.
    await request.put(`/api/autoscuole/students/${student.id}/locations`, {
      data: { locationIds: [] },
    });
    await page.reload();
    await expect(page.getByTestId("autoscuole-students-page")).toBeVisible({ timeout: 60_000 });
    // Stesso ordine di prima: l'allievo è ancora la prima riga.
    await expect(page.getByRole("checkbox", { name: `Seleziona ${shownName}` })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Dettaglio" }).first().click();

    const section = page.getByTestId("student-locations");
    await expect(section).toBeVisible({ timeout: 30_000 });
    await expect(section.getByTestId("student-locations-count")).toHaveText("Tutti");
    await expect(section.getByText("Nessun luogo scelto")).toBeVisible();

    const boxes = section.getByRole("checkbox");
    const total = await boxes.count();
    expect(total).toBeGreaterThanOrEqual(2);

    await boxes.nth(0).click();
    await expect(section.getByTestId("student-locations-count")).toHaveText(`1 di ${total}`);
    await boxes.nth(1).click();
    await expect(section.getByTestId("student-locations-count")).toHaveText(`2 di ${total}`);

    // Il primo scelto è diventato il principale; lo spostiamo sul secondo.
    const radios = section.getByRole("radio");
    await expect(radios.nth(0)).toHaveAttribute("aria-checked", "true");
    await radios.nth(1).click();
    await expect(radios.nth(1)).toHaveAttribute("aria-checked", "true");
    await expect(radios.nth(0)).toHaveAttribute("aria-checked", "false");

    // Togliendo il principale, il principale torna sull'altro luogo scelto.
    await boxes.nth(1).click();
    await expect(section.getByTestId("student-locations-count")).toHaveText(`1 di ${total}`);
    await expect(radios.nth(0)).toHaveAttribute("aria-checked", "true");
    // I luoghi non scelti non possono essere principali.
    await expect(radios.nth(1)).toBeDisabled();

    // Il server ha gli stessi dati della scheda.
    const after = await (await request.get("/api/autoscuole/students")).json();
    const row = after.data.find((s: { id: string }) => s.id === student.id);
    expect(row.locationIds).toHaveLength(1);
    expect(row.defaultLocationId).toBe(row.locationIds[0]);
  } finally {
    await request.put(`/api/autoscuole/students/${student.id}/locations`, {
      data: { locationIds: before.locationIds },
    });
    await request.patch(`/api/autoscuole/students/${student.id}/default-location`, {
      data: { locationId: before.defaultLocationId },
    });
    await patchSettings(request, original);
  }
});

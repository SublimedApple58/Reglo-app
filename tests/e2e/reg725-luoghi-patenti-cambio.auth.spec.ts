import { test, expect, type APIRequestContext } from "@playwright/test";
import { markNewsSeen } from "./news-seen";

/**
 * REG-725 — la stessa patente in più luoghi + cambio per patente.
 *
 * Gira loggato come il titolare del seed su un'autoscuola con la sede e almeno
 * un altro luogo (su staging «Autoscuola Reglo», via `E2E_COMPANY_ID`). Lavora
 * su un luogo che NON è la sede e alla fine rimette patenti, cambi e
 * interruttore com'erano.
 */

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page }) => {
  await markNewsSeen(page);
});

const SETTINGS_URL = "/it/user/autoscuole?tab=settings&pane=locations";

type Loc = {
  id: string;
  name: string;
  isDefault: boolean;
  licenseCategories: string[];
  licenseTransmissions?: Record<string, string>;
};

async function listLocations(request: APIRequestContext): Promise<Loc[]> {
  const json = await (await request.get("/api/autoscuole/locations")).json();
  expect(json.success).toBe(true);
  return json.data;
}

async function readByLicense(request: APIRequestContext): Promise<boolean | null> {
  const json = await (await request.get("/api/autoscuole/settings")).json();
  expect(json.success).toBe(true);
  return json.data.locationsByLicense;
}

async function setByLicense(request: APIRequestContext, value: boolean) {
  const json = await (
    await request.patch("/api/autoscuole/settings", { data: { locationsByLicense: value } })
  ).json();
  expect(json.success).toBe(true);
}

async function patchLocation(
  request: APIRequestContext,
  id: string,
  data: { licenseCategories: string[]; licenseTransmissions: Record<string, string> },
) {
  const json = await (await request.patch(`/api/autoscuole/locations/${id}`, { data })).json();
  expect(json.success, json.message).toBe(true);
  return json.data as Loc;
}

test("la stessa patente resta su due luoghi e il cambio si salva per patente (API)", async ({
  request,
}) => {
  const storedByLicense = await readByLicense(request);
  await setByLicense(request, true);
  const before = await listLocations(request);
  const sede = before.find((l) => l.isDefault)!;
  const other = before.find((l) => !l.isDefault);
  test.skip(!other, "serve un luogo oltre alla sede");
  const sedeCats = sede.licenseCategories;
  try {
    // B sull'altro luogo, solo automatico; AM con un cambio che va ripulito
    // perché la patente non c'è; CQC senza cambio.
    const saved = await patchLocation(request, other!.id, {
      licenseCategories: ["B", "A1"],
      licenseTransmissions: { B: "automatic", AM: "manual" },
    });
    expect(saved.licenseCategories).toEqual(["B", "A1"]);
    expect(saved.licenseTransmissions).toEqual({ B: "automatic" });

    // Nessuna esclusività: la sede tiene le sue patenti.
    const after = await listLocations(request);
    expect(after.find((l) => l.id === sede.id)!.licenseCategories).toEqual(sedeCats);

    // Togliendo la B se ne va anche il suo cambio.
    const trimmed = await patchLocation(request, other!.id, {
      licenseCategories: ["A1"],
      licenseTransmissions: { B: "automatic" },
    });
    expect(trimmed.licenseTransmissions).toEqual({});
  } finally {
    await patchLocation(request, other!.id, {
      licenseCategories: other!.licenseCategories,
      licenseTransmissions: other!.licenseTransmissions ?? {},
    });
    if (typeof storedByLicense === "boolean") await setByLicense(request, storedByLicense);
  }
});

test("modale: patente su un secondo luogo con cambio automatico, card aggiornata", async ({
  page,
  request,
}) => {
  const storedByLicense = await readByLicense(request);
  await setByLicense(request, true);
  const before = await listLocations(request);
  const other = before.find((l) => !l.isDefault);
  test.skip(!other, "serve un luogo oltre alla sede");
  // Si parte senza la B sul luogo, così il clic la aggiunge.
  await patchLocation(request, other!.id, {
    licenseCategories: other!.licenseCategories.filter((c) => c !== "B"),
    licenseTransmissions: {},
  });
  try {
    await page.goto(SETTINGS_URL);
    const row = page.getByTestId(`location-row-${other!.id}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.getByRole("button", { name: "Modifica" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Patenti e cambio")).toBeVisible();
    const key = dialog.getByTestId("location-license-B");
    await key.scrollIntoViewIfNeeded();
    await key.click();
    await expect(key).toHaveAttribute("aria-pressed", "true");

    const gearRow = dialog.getByTestId("location-gear-row-B");
    await expect(gearRow).toBeVisible();
    const automatic = dialog.getByTestId("location-gear-B-automatic");
    await automatic.scrollIntoViewIfNeeded();
    await automatic.click();
    await expect(automatic).toHaveAttribute("aria-checked", "true");

    await dialog.getByRole("button", { name: "Salva luogo" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await expect(row.getByTestId("location-licenses")).toContainText("B solo automatico");
    const saved = (await listLocations(request)).find((l) => l.id === other!.id)!;
    expect(saved.licenseCategories).toContain("B");
    expect(saved.licenseTransmissions).toEqual({ B: "automatic" });
  } finally {
    await patchLocation(request, other!.id, {
      licenseCategories: other!.licenseCategories,
      licenseTransmissions: other!.licenseTransmissions ?? {},
    });
    if (typeof storedByLicense === "boolean") await setByLicense(request, storedByLicense);
  }
});

for (const viewport of [
  { width: 390, height: 700, label: "telefono" },
  { width: 1280, height: 560, label: "finestra bassa" },
]) {
  test(`modale scorrevole con intestazione e Salva sempre visibili (${viewport.label})`, async ({
    page,
    request,
  }) => {
    const storedByLicense = await readByLicense(request);
    await setByLicense(request, true);
    try {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(SETTINGS_URL);
      const other = (await listLocations(request)).find((l) => !l.isDefault);
      test.skip(!other, "serve un luogo oltre alla sede");
      const row = page.getByTestId(`location-row-${other!.id}`);
      await expect(row).toBeVisible({ timeout: 60_000 });
      await row.getByRole("button", { name: "Modifica" }).click();

      const dialog = page.getByRole("dialog");
      const body = dialog.getByTestId("location-dialog-body");
      await expect(body).toBeVisible();
      // Il contenuto è più alto dello spazio: il corpo scorre, la pagina no.
      const { scrollHeight, clientHeight } = await body.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
      expect(scrollHeight).toBeGreaterThan(clientHeight);
      await body.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));

      const title = dialog.getByRole("heading").first();
      const save = dialog.getByRole("button", { name: "Salva luogo" });
      await expect(title).toBeInViewport();
      await expect(save).toBeInViewport();
      // In fondo si vede la fine della sezione patenti, sopra il piede.
      await expect(dialog.getByText("Una patente può stare in più luoghi")).toBeInViewport();
      // Nessuna tendina dei suggerimenti aperta da sola sull'indirizzo salvato.
      await expect(dialog.getByRole("button", { name: /Milano, MI, Italia/ })).toHaveCount(0);
    } finally {
      if (typeof storedByLicense === "boolean") await setByLicense(request, storedByLicense);
    }
  });
}

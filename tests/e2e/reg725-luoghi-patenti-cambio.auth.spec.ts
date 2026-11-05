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
  { width: 360, height: 700, label: "telefono stretto" },
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
      // Niente scorrimento orizzontale e la scelta del cambio dentro la card.
      const overflow = await dialog.evaluate((el) => {
        const body = el.querySelector('[data-testid="location-dialog-body"]') as HTMLElement;
        const card = body.querySelector('[data-testid^="location-gear-row-"]')?.closest(".overflow-hidden.rounded-\\[14px\\]") as HTMLElement | null;
        const right = card ? card.getBoundingClientRect().right : el.getBoundingClientRect().right;
        const segs = Array.from(body.querySelectorAll('[role="radiogroup"]')) as HTMLElement[];
        return {
          bodyX: body.scrollWidth - body.clientWidth,
          dialogX: el.scrollWidth - el.clientWidth,
          segOut: segs.filter((g) => g.offsetParent && g.getBoundingClientRect().right > right + 0.5).length,
          clipped: segs.flatMap((g) => Array.from(g.querySelectorAll("button"))).filter((b) => b.scrollWidth > b.clientWidth + 0.5).length,
        };
      });
      expect(overflow).toEqual({ bodyX: 0, dialogX: 0, segOut: 0, clipped: 0 });
      // In fondo si vede la fine della sezione patenti, sopra il piede.
      await expect(dialog.getByText("Una patente può stare in più luoghi")).toBeInViewport();
      // Nessuna tendina dei suggerimenti aperta da sola sull'indirizzo salvato.
      await expect(dialog.getByRole("button", { name: /Milano, MI, Italia/ })).toHaveCount(0);
    } finally {
      if (typeof storedByLicense === "boolean") await setByLicense(request, storedByLicense);
    }
  });
}

// ─── Luogo obbligatorio quando la scelta è ambigua ───────────────────────────
// Scenario: sede B solo manuale, due altri luoghi B solo automatico, allievo B
// automatico senza luoghi → due compatibili, sede esclusa → ambiguo.

type StudentRow = {
  id: string;
  firstName?: string;
  lastName?: string;
  licenseCategory?: string | null;
  transmission?: string | null;
  defaultLocationId?: string | null;
  locationIds?: string[];
};

const testDay = () => {
  const d = new Date();
  d.setDate(d.getDate() + 52);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7)); // mercoledì
  return d;
};

test("guida senza luogo rifiutata solo se ambigua; agenda blocca finché non si sceglie", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const storedByLicense = await readByLicense(request);
  const before = await listLocations(request);
  const sede = before.find((l) => l.isDefault)!;
  const other = before.find((l) => !l.isDefault);
  test.skip(!other, "serve un luogo oltre alla sede");

  const day = testDay();
  const startsAt = new Date(day);
  startsAt.setHours(7, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
  const boot = await (
    await request.get("/api/autoscuole/agenda/bootstrap", {
      params: { from: day.toISOString(), to: new Date(day.getTime() + 86_400_000).toISOString() },
    })
  ).json();
  const instructor = boot.data.instructors[0];
  const student = (boot.data.students as StudentRow[]).find(
    (s) =>
      s.licenseCategory === "B" &&
      s.transmission === "automatic" &&
      !s.defaultLocationId &&
      !(s.locationIds ?? []).length,
  );
  test.skip(!student || !instructor, "serve un allievo B automatico senza luoghi");

  let tempId: string | null = null;
  const created: string[] = [];
  const post = async (extra: Record<string, unknown>) =>
    (await (
      await request.post("/api/autoscuole/appointments", {
        data: {
          studentId: student!.id,
          instructorId: instructor.id,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          type: "guida",
          ...extra,
        },
      })
    ).json()) as { success: boolean; message?: string; code?: string; data?: { id: string } };

  try {
    await setByLicense(request, true);
    await patchLocation(request, sede.id, { licenseCategories: ["B"], licenseTransmissions: { B: "manual" } });
    await patchLocation(request, other!.id, {
      licenseCategories: Array.from(new Set([...other!.licenseCategories, "B"])),
      licenseTransmissions: { ...(other!.licenseTransmissions ?? {}), B: "automatic" },
    });
    const temp = await (
      await request.post("/api/autoscuole/locations", {
        data: { name: "REG-725 e2e", isPrecise: false, licenseCategories: ["B"], licenseTransmissions: { B: "automatic" } },
      })
    ).json();
    expect(temp.success, temp.message).toBe(true);
    tempId = temp.data.id;

    // 1. Ambiguo e senza luogo → rifiutata, con il messaggio.
    const refused = await post({});
    expect(refused.success).toBe(false);
    expect(refused.code).toBe("LOCATION_REQUIRED");
    expect(refused.message).toContain("Scegli il luogo");

    // 2. Con il luogo scelto → passa (il blocco riguarda solo l'assenza).
    const ok = await post({ locationId: tempId });
    expect(ok.code).not.toBe("LOCATION_REQUIRED");
    if (ok.success && ok.data) created.push(ok.data.id);

    // 3. A funzione spenta lo stesso salvataggio senza luogo non è bloccato.
    for (const id of created.splice(0)) {
      await request.post(`/api/autoscuole/appointments/${id}/permanent-cancel`);
    }
    await setByLicense(request, false);
    const off = await post({});
    expect(off.code).not.toBe("LOCATION_REQUIRED");
    if (off.success && off.data) created.push(off.data.id);
    await setByLicense(request, true);

    // 4. Agenda: messaggio sotto il campo e «Crea guida» disabilitato finché non
    //    si sceglie il luogo; i dati inseriti restano.
    await page.goto("/it/user/autoscuole?tab=agenda");
    await expect(page.getByTestId("autoscuole-agenda-page").first()).toBeVisible({ timeout: 60_000 });
    const newAppointment = page.getByRole("button", { name: "Appuntamento" }).first();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await page.getByTitle("Inserisci a mano").click();
      try {
        await newAppointment.waitFor({ state: "visible", timeout: 4_000 });
        break;
      } catch {
        await page.waitForTimeout(500);
      }
    }
    await newAppointment.click();
    const card = page.getByRole("dialog", { name: /Nuovo appuntamento/ });
    await expect(card).toBeVisible();
    await card.getByPlaceholder("Cerca allievo...").fill(student!.firstName ?? "");
    await page.getByText(new RegExp(`${student!.firstName} ${student!.lastName}`)).last().click();
    const required = card.getByTestId("create-location-required");
    await expect(required).toBeVisible({ timeout: 15_000 });
    await expect(required).toContainText("B automatico");
    const createButton = card.getByRole("button", { name: "Crea guida" });
    await expect(createButton).toBeDisabled();

    const trigger = card.getByTestId("create-location-trigger");
    await trigger.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await trigger.click({ force: true });
    await page.getByRole("option", { name: /REG-725 e2e/ }).click();
    await expect(required).toBeHidden();
    await expect(card.getByText(`${student!.firstName} ${student!.lastName}`).first()).toBeVisible();
  } finally {
    for (const id of created) {
      await request.post(`/api/autoscuole/appointments/${id}/permanent-cancel`);
    }
    if (tempId) await request.delete(`/api/autoscuole/locations/${tempId}`);
    await patchLocation(request, sede.id, {
      licenseCategories: sede.licenseCategories,
      licenseTransmissions: sede.licenseTransmissions ?? {},
    });
    await patchLocation(request, other!.id, {
      licenseCategories: other!.licenseCategories,
      licenseTransmissions: other!.licenseTransmissions ?? {},
    });
    if (typeof storedByLicense === "boolean") await setByLicense(request, storedByLicense);
  }
});

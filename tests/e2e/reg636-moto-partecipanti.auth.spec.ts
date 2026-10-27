import fs from "node:fs";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

/**
 * REG-636 — moto di ogni partecipante nelle guide di gruppo MOTO (titolare).
 *
 * Prepara su un giorno lontano un gruppo moto con flotta Honda CB (A2) +
 * Yamaha MT-07 (A2) + Aprilia RS (A1) e tre iscritti delle fixture «Reglo E2E»
 * sul DB dev: Elena Rosa (A2), Gino Neri (A2), Dario Blu (A1). L'assegnazione
 * automatica dà Honda → Elena, Yamaha → Gino, Aprilia → Dario.
 *
 * 1. API: validazioni (moto fuori patente, scambio non confermato, conferma
 *    stantia), rotazione e ritorno su moto libera.
 * 2. UI (dialog «Gestisci guida di gruppo»): menu con le sole moto compatibili,
 *    scambio pulito Elena ↔ Gino, poi Elena prende l'Aprilia di Dario che non
 *    può guidare la Yamaha → Dario passa ad «A rotazione», detto prima.
 *
 * Screenshot ritagliati in REG636_SHOTS_DIR.
 */

const SHOTS = process.env.REG636_SHOTS_DIR ?? "test-results/reg636";
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const target = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 160);
  // Un martedì: lontano dai giorni usati dagli altri spec.
  d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7));
  return d;
})();
const at = (h: number) => {
  const d = new Date(target);
  d.setHours(h, 0, 0, 0);
  return d;
};

type Participant = {
  appointmentId: string;
  studentId: string;
  studentName: string | null;
  vehicleId: string | null;
  vehicleName: string | null;
  studentLicenseCategory: string | null;
};

type Ctx = {
  groupLessonId: string;
  motos: { honda: string; yamaha: string; aprilia: string };
  seats: { elena: string; gino: string; dario: string };
};

const EMAILS = {
  elena: "e2e-grp-elena@reglo.test",
  gino: "e2e-grp-gino@reglo.test",
  dario: "e2e-grp-dario@reglo.test",
};

async function bootstrap(api: APIRequestContext, from: Date, to: Date) {
  const res = await api.get("/api/autoscuole/agenda/bootstrap", {
    params: { from: from.toISOString(), to: to.toISOString() },
  });
  expect(res.ok(), "GET /agenda/bootstrap").toBeTruthy();
  return ((await res.json()) as {
    data: {
      instructors: Array<{ id: string; name: string }>;
      students: Array<{ id: string; email: string | null }>;
      appointments: Array<{ id: string; groupLessonId: string | null }>;
    };
  }).data;
}

async function participants(api: APIRequestContext, groupLessonId: string) {
  const res = await api.get(`/api/autoscuole/group-lessons/${groupLessonId}`);
  expect(res.ok(), "GET /group-lessons/:id").toBeTruthy();
  return ((await res.json()) as { data: { participants: Participant[] } }).data.participants;
}

async function setMoto(
  api: APIRequestContext,
  groupLessonId: string,
  body: { appointmentId: string; vehicleId: string | null; swapWithAppointmentId?: string | null },
) {
  const res = await api.post(`/api/autoscuole/group-lessons/${groupLessonId}/participant-moto`, { data: body });
  return (await res.json()) as { success: boolean; message?: string };
}

async function cleanup(api: APIRequestContext) {
  const data = await bootstrap(api, at(0), at(23));
  const ids = new Set(data.appointments.map((a) => a.groupLessonId).filter(Boolean) as string[]);
  for (const id of ids) await api.delete(`/api/autoscuole/group-lessons/${id}`).catch(() => undefined);
}

async function prepare(api: APIRequestContext): Promise<Ctx> {
  await cleanup(api);
  const data = await bootstrap(api, at(0), at(23));
  const vehicles = ((await (await api.get("/api/autoscuole/vehicles")).json()) as {
    data: Array<{ id: string; name: string }>;
  }).data;
  const byName = (name: string) => {
    const v = vehicles.find((x) => x.name === name);
    expect(v, `veicolo «${name}» nelle fixture E2E`).toBeTruthy();
    return v!.id;
  };
  const motos = {
    honda: byName("Honda CB (moto E2E)"),
    yamaha: byName("Yamaha MT-07"),
    aprilia: byName("Aprilia RS (moto E2E)"),
  };
  const studentId = (email: string) => {
    const s = data.students.find((x) => x.email === email);
    expect(s, `allievo ${email} nelle fixture E2E`).toBeTruthy();
    return s!.id;
  };
  const res = await api.post("/api/autoscuole/group-lessons", {
    data: {
      kind: "moto",
      startsAt: at(9).toISOString(),
      endsAt: at(12).toISOString(),
      instructorId: data.instructors[0].id,
      vehicleIds: [motos.honda, motos.yamaha, motos.aprilia],
      capacity: 4,
      studentIds: [studentId(EMAILS.elena), studentId(EMAILS.gino), studentId(EMAILS.dario)],
    },
  });
  const json = (await res.json()) as { success?: boolean; message?: string; data?: { groupLessonId: string } };
  expect(json.success, `POST /group-lessons → ${json.message ?? ""}`).toBeTruthy();
  const groupLessonId = json.data!.groupLessonId;

  const list = await participants(api, groupLessonId);
  const seatOf = (email: string) => list.find((p) => p.studentId === studentId(email))!.appointmentId;
  return {
    groupLessonId,
    motos,
    seats: { elena: seatOf(EMAILS.elena), gino: seatOf(EMAILS.gino), dario: seatOf(EMAILS.dario) },
  };
}

const motoOf = async (api: APIRequestContext, ctx: Ctx) => {
  const list = await participants(api, ctx.groupLessonId);
  const of = (seat: string) => list.find((p) => p.appointmentId === seat)!.vehicleId;
  return { elena: of(ctx.seats.elena), gino: of(ctx.seats.gino), dario: of(ctx.seats.dario) };
};

/** Screenshot of the union of some elements' boxes, with breathing room. */
async function shot(page: Page, file: string, els: Locator[], pad = 10) {
  const boxes = (await Promise.all(els.map((e) => e.boundingBox()))).filter(Boolean) as Array<{
    x: number; y: number; width: number; height: number;
  }>;
  const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + pad;
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
  await page.screenshot({ path: `${SHOTS}/${file}`, clip: { x, y, width: right - x, height: bottom - y } });
}

async function openManageDialog(page: Page) {
  await page.goto("/it/user/autoscuole?tab=agenda");
  await expect(page.locator("[data-agenda-col-day]").first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole("tab", { name: "Settimana", exact: true }).click();
  const next = page.locator("span.md\\:min-w-\\[130px\\]").locator("xpath=following-sibling::button[1]");
  for (let i = 0; i < 40; i += 1) {
    const days = await page
      .locator("[data-agenda-col-day]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-agenda-col-day")));
    if (days.includes(ymd(target))) break;
    await next.click();
    await page.waitForTimeout(200);
  }
  await page.locator(`[data-agenda-day-header="${ymd(target)}"]`).click();
  await page.waitForTimeout(1200);
  const card = page.locator(".agenda-card").filter({ hasText: /Elena|Gino|Dario|gruppo/i }).first();
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await page.getByRole("button", { name: "Gestisci guida di gruppo" }).first().click();
  await expect(page.getByTestId("group-roster")).toBeVisible({ timeout: 30_000 });
}

test.describe.configure({ mode: "serial" });
test.use({ deviceScaleFactor: 2 });

test.describe("REG-636 moto dei partecipanti nei gruppi moto", () => {
  test.setTimeout(240_000);
  let ctx: Ctx;

  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext({ baseURL, storageState: "tests/e2e/.auth/owner.json" });
    ctx = await prepare(api);
    await api.dispose();
  });

  test.afterAll(async ({ playwright }) => {
    const api = await playwright.request.newContext({ baseURL, storageState: "tests/e2e/.auth/owner.json" });
    await cleanup(api);
    await api.dispose();
  });

  test("API: assegnazione, validazioni, rotazione", async ({ page }) => {
    const api = page.request;
    expect(await motoOf(api, ctx)).toEqual({
      elena: ctx.motos.honda,
      gino: ctx.motos.yamaha,
      dario: ctx.motos.aprilia,
    });
    const list = await participants(api, ctx.groupLessonId);
    expect(list.find((p) => p.appointmentId === ctx.seats.dario)!.studentLicenseCategory).toBe("A1");

    // Dario (A1) non può guidare la Honda (A2).
    const incompatible = await setMoto(api, ctx.groupLessonId, { appointmentId: ctx.seats.dario, vehicleId: ctx.motos.honda });
    expect(incompatible.success).toBeFalsy();
    expect(incompatible.message).toContain("non è compatibile");

    // Moto di un altro senza conferma dello scambio → rifiutato, niente cambia.
    const unconfirmed = await setMoto(api, ctx.groupLessonId, { appointmentId: ctx.seats.elena, vehicleId: ctx.motos.yamaha });
    expect(unconfirmed.success).toBeFalsy();
    expect(unconfirmed.message).toContain("conferma lo scambio");
    // Conferma che indica il posto sbagliato (roster cambiato) → rifiutato.
    const stale = await setMoto(api, ctx.groupLessonId, {
      appointmentId: ctx.seats.elena,
      vehicleId: ctx.motos.yamaha,
      swapWithAppointmentId: ctx.seats.dario,
    });
    expect(stale.success).toBeFalsy();
    expect(await motoOf(api, ctx)).toEqual({ elena: ctx.motos.honda, gino: ctx.motos.yamaha, dario: ctx.motos.aprilia });

    // Rotazione e ritorno sulla moto (ora libera).
    expect((await setMoto(api, ctx.groupLessonId, { appointmentId: ctx.seats.gino, vehicleId: null })).success).toBeTruthy();
    expect((await motoOf(api, ctx)).gino).toBeNull();
    expect((await setMoto(api, ctx.groupLessonId, { appointmentId: ctx.seats.gino, vehicleId: ctx.motos.yamaha })).success).toBeTruthy();
    expect((await motoOf(api, ctx)).gino).toBe(ctx.motos.yamaha);
  });

  test("UI: menu, scambio pulito, scambio con rotazione", async ({ page }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openManageDialog(page);
    const roster = page.getByTestId("group-roster");
    await roster.scrollIntoViewIfNeeded();
    await expect(page.getByTestId(`moto-trigger-${ctx.seats.elena}`)).toContainText("Honda CB (moto E2E)");
    await expect(page.getByTestId(`moto-trigger-${ctx.seats.dario}`)).toContainText("Aprilia RS");
    await shot(page, "web-roster.png", [roster]);

    // Menu di Elena (A2): Honda attuale, Yamaha di Gino (scambio), Aprilia di Dario
    // (scambio), «A rotazione». Niente moto oltre la sua patente.
    await page.getByTestId(`moto-trigger-${ctx.seats.elena}`).click();
    const menu = page.getByTestId("moto-menu");
    await expect(menu).toBeVisible();
    await expect(menu).toContainText("Moto per patente A2");
    await expect(menu.getByTestId(`moto-option-${ctx.motos.yamaha}`)).toContainText("Con Gino N. · scambio");
    await expect(menu.getByTestId(`moto-option-${ctx.motos.aprilia}`)).toContainText("Con Dario B. · scambio");
    await expect(menu.getByTestId("moto-option-rotation")).toBeVisible();
    await page.waitForTimeout(250);
    await shot(page, "web-menu.png", [page.getByTestId(`group-seat-${ctx.seats.elena}`), menu]);

    // Scambio pulito: Elena prende la Yamaha di Gino, Gino la Honda.
    await menu.getByTestId(`moto-option-${ctx.motos.yamaha}`).click();
    const confirm = page.getByTestId("moto-swap-confirm");
    await expect(confirm).toContainText("Scambiare le moto con Gino?");
    await expect(confirm).not.toContainText("passerà ad A rotazione");
    await page.waitForTimeout(250);
    await shot(page, "web-swap.png", [page.getByTestId(`group-seat-${ctx.seats.elena}`)]);
    await confirm.getByRole("button", { name: "Scambia" }).click();
    await expect(confirm).toBeHidden({ timeout: 15_000 });
    // Quando la conferma sparisce il roster è GIÀ ricaricato: niente finestra
    // in cui i selettori mostrano le moto vecchie (bug visto su staging).
    await expect(page.getByTestId(`moto-trigger-${ctx.seats.elena}`)).toContainText("Yamaha MT-07", { timeout: 300 });
    await expect(page.getByTestId(`moto-trigger-${ctx.seats.gino}`)).toContainText("Honda CB", { timeout: 300 });
    expect(await motoOf(page.request, ctx)).toEqual({ elena: ctx.motos.yamaha, gino: ctx.motos.honda, dario: ctx.motos.aprilia });

    // Elena prende l'Aprilia di Dario: Dario (A1) non può guidare la Yamaha (A2).
    await page.getByTestId(`moto-trigger-${ctx.seats.elena}`).click();
    await page.getByTestId("moto-menu").getByTestId(`moto-option-${ctx.motos.aprilia}`).click();
    await expect(confirm).toContainText("Dare a Elena la moto di Dario?");
    await expect(confirm).toContainText("Dario passerà ad A rotazione: non può guidare la Yamaha MT-07 (A2), la sua patente è A1.");
    await page.waitForTimeout(250);
    await shot(page, "web-swap-rotazione.png", [page.getByTestId(`group-seat-${ctx.seats.elena}`)]);
    // Annulla: niente cambia. Poi riprova e conferma.
    await confirm.getByRole("button", { name: "Annulla" }).click();
    await expect(confirm).toBeHidden();
    expect((await motoOf(page.request, ctx)).dario).toBe(ctx.motos.aprilia);
    await page.getByTestId(`moto-trigger-${ctx.seats.elena}`).click();
    await page.getByTestId("moto-menu").getByTestId(`moto-option-${ctx.motos.aprilia}`).click();
    await confirm.getByRole("button", { name: "Conferma" }).click();
    await expect(confirm).toBeHidden({ timeout: 15_000 });
    await expect(page.getByTestId(`moto-trigger-${ctx.seats.dario}`)).toContainText("A rotazione");
    expect(await motoOf(page.request, ctx)).toEqual({ elena: ctx.motos.aprilia, gino: ctx.motos.honda, dario: null });
    await shot(page, "web-roster-dopo.png", [roster]);
  });
});

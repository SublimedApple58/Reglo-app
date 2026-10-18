import fs from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * REG-622 — le guide a cambio automatico tengono il colore normale e si
 * riconoscono dal bordo. Prepara un veicolo automatico e due guide uguali
 * (stessa durata, quindi stesso colore) su un giorno lontano, una col veicolo
 * automatico e una con quello manuale; verifica che solo la prima abbia il
 * bordo e fotografa agenda e riga del setting in Aspetto.
 *
 * Gli screenshot (per la conferma design) finiscono in REG622_SHOTS_DIR.
 */

const SHOTS = process.env.REG622_SHOTS_DIR ?? "test-results/reg622";
const AUTO_VEHICLE = "Ypsilon automatica REG622";
const MANUAL_VEHICLE = "Fiat Panda (auto E2E)";

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const target = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 140);
  // Un mercoledì: in settimana la colonna è piena (il weekend è più stretto).
  d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7));
  return d;
})();
const at = (h: number, m = 0) => {
  const d = new Date(target);
  d.setHours(h, m, 0, 0);
  return d;
};

type Ctx = {
  instructorId: string;
  students: Array<{ id: string; name: string }>;
  vehicles: Array<{ id: string; name: string; transmission?: string }>;
};

async function context(api: APIRequestContext, from = new Date(), to?: Date) {
  const res = await api.get("/api/autoscuole/agenda/bootstrap", {
    params: {
      from: from.toISOString(),
      to: (to ?? new Date(from.getTime() + 86_400_000)).toISOString(),
    },
  });
  expect(res.ok(), "GET /agenda/bootstrap").toBeTruthy();
  return ((await res.json()) as {
    data: {
      instructors: Array<{ id: string; name: string }>;
      students: Array<{ id: string; firstName?: string; lastName?: string }>;
      appointments: Array<{ id: string; studentId?: string | null; status: string }>;
    };
  }).data;
}

async function prepare(api: APIRequestContext): Promise<Ctx> {
  const data = await context(api);
  const instructor = data.instructors.find((i) => i.name === "Istruttore E2E") ?? data.instructors[0];
  const students = data.students
    .map((s) => ({ id: s.id, name: `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() }))
    .filter((s) => /^(Luca Gallo|Giulia Conti)$/.test(s.name));

  const listVehicles = async () =>
    ((await (await api.get("/api/autoscuole/vehicles")).json()) as {
      data: Array<{ id: string; name: string; transmission?: string }>;
    }).data;
  let vehicles = await listVehicles();
  if (!vehicles.some((v) => v.name === AUTO_VEHICLE)) {
    const res = await api.post("/api/autoscuole/vehicles", {
      data: { name: AUTO_VEHICLE, licenseCategory: "B", transmission: "automatic" },
    });
    expect(res.ok(), `POST /vehicles ${await res.text()}`).toBeTruthy();
    vehicles = await listVehicles();
  }
  return { instructorId: instructor.id, students, vehicles };
}

async function seed(api: APIRequestContext, ctx: Ctx, studentId: string, startsAt: Date, vehicle: string) {
  const vehicleId = ctx.vehicles.find((v) => v.name === vehicle)?.id;
  expect(vehicleId, `veicolo ${vehicle}`).toBeTruthy();
  const res = await api.post("/api/autoscuole/appointments", {
    data: {
      studentId,
      instructorId: ctx.instructorId,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
      vehicleId,
      type: "guida",
      types: ["guida"],
    },
  });
  expect(res.ok(), `POST /appointments ${await res.text()}`).toBeTruthy();
}

/** Annulla solo le guide dei due allievi di prova nel giorno del test. */
async function cleanup(api: APIRequestContext, ctx: Ctx) {
  const mine = new Set(ctx.students.map((s) => s.id));
  const data = await context(api, target, new Date(target.getTime() + 86_400_000));
  for (const a of data.appointments ?? []) {
    if (a.id.startsWith("gl-") || !a.studentId || !mine.has(a.studentId)) continue;
    if (a.status === "cancelled") continue;
    await api.post(`/api/autoscuole/appointments/${a.id}/permanent-cancel`).catch(() => undefined);
  }
}

async function openWeek(page: Page) {
  await page.goto("/it/user/autoscuole?tab=agenda");
  await expect(page.locator("[data-agenda-col-day]").first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole("tab", { name: "Settimana", exact: true }).click();
  const next = page.locator("span.min-w-\\[130px\\]").locator("xpath=following-sibling::button[1]");
  for (let i = 0; i < 40; i += 1) {
    const days = await page
      .locator("[data-agenda-col-day]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-agenda-col-day")));
    if (days.includes(ymd(target))) break;
    await next.click();
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(1500);
  // Scroll della griglia sulle 8:00 (all'apertura segue l'ora attuale).
  await page.evaluate(() => {
    const col = document.querySelector("[data-agenda-col-day]");
    let el = col?.parentElement ?? null;
    while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement;
    if (el) el.scrollTop = 8 * 72;
  });
  await page.waitForTimeout(600);
}

/** Il blocco guida di un allievo: il nodo `.agenda-card` che ne contiene il nome. */
const block = (page: Page, student: string) =>
  page.locator(".agenda-card").filter({ hasText: student.split(" ")[0] }).first();

const ring = (page: Page, student: string) =>
  block(page, student).evaluate((el) => getComputedStyle(el).getPropertyValue("--agenda-card-ring").trim());

test.describe.configure({ mode: "serial" });
test.use({ deviceScaleFactor: 2 });

test.describe("REG-622 contrassegno guide automatiche", () => {
  test.setTimeout(180_000);
  let ctx: Ctx;

  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
      storageState: "tests/e2e/.auth/owner.json",
    });
    ctx = await prepare(api);
    expect(ctx.students.length).toBe(2);
    await cleanup(api, ctx);
    await seed(api, ctx, ctx.students[0].id, at(9), AUTO_VEHICLE);
    await seed(api, ctx, ctx.students[1].id, at(10, 30), MANUAL_VEHICLE);
    await api.dispose();
  });

  test.afterAll(async ({ playwright }) => {
    const api = await playwright.request.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
      storageState: "tests/e2e/.auth/owner.json",
    });
    await cleanup(api, ctx);
    await api.dispose();
  });

  test("agenda: bordo solo sulla guida automatica, stesso colore di fondo", async ({ page }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openWeek(page);
    const auto = block(page, ctx.students[0].name);
    const manual = block(page, ctx.students[1].name);
    await expect(auto).toBeVisible();
    await expect(manual).toBeVisible();

    // Il bordo compare quando arrivano i settings (prima nessun bordo).
    await expect.poll(() => ring(page, ctx.students[0].name)).toBe("#111111");
    expect(await ring(page, ctx.students[1].name)).toBe("");
    const bg = (l: typeof auto) => l.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await bg(auto)).toBe(await bg(manual));

    const a = (await auto.boundingBox())!;
    const m = (await manual.boundingBox())!;
    const pad = 36;
    const x = Math.min(a.x, m.x) - pad;
    const y = Math.min(a.y, m.y) - pad;
    await page.screenshot({
      path: `${SHOTS}/web-agenda.png`,
      clip: {
        x,
        y,
        width: Math.max(a.x + a.width, m.x + m.width) - x + pad,
        height: Math.max(a.y + a.height, m.y + m.height) - y + pad,
      },
    });
  });

  test("Aspetto: una sola riga per le guide automatiche", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/it/user/autoscuole?tab=settings&pane=aspetto");
    const row = page.getByTestId("automatic-marker-setting");
    await expect(row).toBeVisible({ timeout: 60_000 });
    const pane = page.getByTestId("aspetto-settings-pane");
    await expect(pane).not.toContainText("B autom.");
    await expect(pane).not.toContainText("Cambio automatico in evidenza");
    await row.screenshot({ path: `${SHOTS}/web-aspetto.png` });
  });
});

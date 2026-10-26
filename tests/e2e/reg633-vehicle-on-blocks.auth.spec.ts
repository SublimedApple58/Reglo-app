import fs from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * REG-633 — nome del veicolo nei blocchi guida dell'agenda, dietro
 * l'impostazione «Mostra il veicolo nei blocchi delle guide» (Aspetto, spenta
 * di default). Prepara su un giorno lontano una guida da un'ora (blocco alto:
 * riga propria) e una da mezz'ora (blocco basso: veicolo accodato all'orario),
 * accende il setting e verifica blocchi, tooltip e vista Giorno; poi lo spegne
 * e controlla che il veicolo sparisca. Rimette il setting com'era.
 *
 * Gli screenshot (per la conferma design) finiscono in REG633_SHOTS_DIR.
 */

const SHOTS = process.env.REG633_SHOTS_DIR ?? "test-results/reg633";

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const target = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 150);
  // Un giovedì: in settimana la colonna è piena.
  d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7));
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
  vehicle: { id: string; name: string };
  previous: boolean;
};

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

async function bootstrap(api: APIRequestContext, from: Date, to: Date) {
  const res = await api.get("/api/autoscuole/agenda/bootstrap", {
    params: { from: from.toISOString(), to: to.toISOString() },
  });
  expect(res.ok(), "GET /agenda/bootstrap").toBeTruthy();
  return ((await res.json()) as {
    data: {
      instructors: Array<{ id: string; name: string }>;
      students: Array<{ id: string; firstName?: string; lastName?: string; licenseCategory?: string | null }>;
      appointments: Array<{ id: string; studentId?: string | null; status: string }>;
    };
  }).data;
}

async function setShowVehicle(api: APIRequestContext, value: boolean) {
  const res = await api.patch("/api/autoscuole/agenda-colors", { data: { agendaShowVehicle: value } });
  expect(res.ok(), `PATCH /agenda-colors ${await res.text()}`).toBeTruthy();
}

async function prepare(api: APIRequestContext): Promise<Ctx> {
  const data = await bootstrap(api, new Date(), new Date(Date.now() + 86_400_000));
  const settings = (await (await api.get("/api/autoscuole/settings")).json()) as {
    data: { agendaShowVehicle?: boolean };
  };
  const vehicles = ((await (await api.get("/api/autoscuole/vehicles")).json()) as {
    data: Array<{ id: string; name: string; licenseCategory?: string | null; transmission?: string | null }>;
  }).data;
  const vehicle =
    vehicles.find((v) => v.licenseCategory === "B" && v.transmission !== "automatic") ?? vehicles[0];
  const students = data.students
    .filter((s) => (s.licenseCategory ?? "B") === "B")
    .slice(0, 2)
    .map((s) => ({ id: s.id, name: `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() }));
  return {
    instructorId: data.instructors[0].id,
    students,
    vehicle: { id: vehicle.id, name: vehicle.name },
    previous: settings.data.agendaShowVehicle === true,
  };
}

async function seed(api: APIRequestContext, ctx: Ctx, studentId: string, startsAt: Date, minutes: number) {
  const res = await api.post("/api/autoscuole/appointments", {
    data: {
      studentId,
      instructorId: ctx.instructorId,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + minutes * 60_000).toISOString(),
      vehicleId: ctx.vehicle.id,
      type: "guida",
      types: ["guida"],
    },
  });
  expect(res.ok(), `POST /appointments ${await res.text()}`).toBeTruthy();
}

/** Annulla solo le guide dei due allievi di prova nel giorno del test. */
async function cleanup(api: APIRequestContext, ctx: Ctx) {
  const mine = new Set(ctx.students.map((s) => s.id));
  const data = await bootstrap(api, target, new Date(target.getTime() + 86_400_000));
  for (const a of data.appointments ?? []) {
    if (a.id.startsWith("gl-") || !a.studentId || !mine.has(a.studentId)) continue;
    if (a.status === "cancelled") continue;
    await api.post(`/api/autoscuole/appointments/${a.id}/permanent-cancel`).catch(() => undefined);
  }
}

async function goToTargetDay(page: Page, view: "Settimana" | "Giorno") {
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
  if (view === "Giorno") {
    // Dalla settimana giusta si entra nel giorno toccandone l'intestazione.
    await page.locator(`[data-agenda-day-header="${ymd(target)}"]`).click();
  }
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const card = document.querySelector(".agenda-card");
    let el = card?.parentElement ?? null;
    while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement;
    if (el) el.scrollTop = 8 * 72;
  });
  await page.waitForTimeout(600);
}

const block = (page: Page, student: string) =>
  page.locator(".agenda-card").filter({ hasText: student.split(" ")[0] }).first();

test.describe.configure({ mode: "serial" });
test.use({ deviceScaleFactor: 2 });

test.describe("REG-633 veicolo nei blocchi dell'agenda", () => {
  test.setTimeout(180_000);
  let ctx: Ctx;

  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext({ baseURL, storageState: "tests/e2e/.auth/owner.json" });
    ctx = await prepare(api);
    expect(ctx.students.length).toBe(2);
    await cleanup(api, ctx);
    await seed(api, ctx, ctx.students[0].id, at(9), 60);
    await seed(api, ctx, ctx.students[1].id, at(10, 30), 30);
    await setShowVehicle(api, true);
    await api.dispose();
  });

  test.afterAll(async ({ playwright }) => {
    const api = await playwright.request.newContext({ baseURL, storageState: "tests/e2e/.auth/owner.json" });
    await cleanup(api, ctx);
    await setShowVehicle(api, ctx.previous);
    await api.dispose();
  });

  test("settimana: riga propria nel blocco alto, accodato all'orario nel basso, tooltip", async ({ page }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await goToTargetDay(page, "Settimana");
    const tall = block(page, ctx.students[0].name);
    const low = block(page, ctx.students[1].name);
    await expect(tall.locator("[data-agenda-vehicle]")).toHaveText(ctx.vehicle.name);
    await expect(low.locator("[data-agenda-vehicle]")).toHaveCount(0);
    await expect(low).toContainText(` · ${ctx.vehicle.name}`);
    expect(await tall.getAttribute("title")).toContain(ctx.vehicle.name);
    await tall.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    const a = (await tall.boundingBox())!;
    const b = (await low.boundingBox())!;
    const pad = 40;
    const x = Math.min(a.x, b.x) - pad;
    const y = Math.min(a.y, b.y) - pad;
    await page.screenshot({
      path: `${SHOTS}/web-settimana.png`,
      clip: {
        x,
        y,
        width: Math.max(a.x + a.width, b.x + b.width) - x + pad,
        height: Math.max(a.y + a.height, b.y + b.height) - y + pad,
      },
    });
  });

  test("giorno: il veicolo sotto la patente", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await goToTargetDay(page, "Giorno");
    const tall = block(page, ctx.students[0].name);
    await expect(tall.locator("[data-agenda-vehicle]")).toHaveText(ctx.vehicle.name);
    const low = block(page, ctx.students[1].name);
    await tall.scrollIntoViewIfNeeded();
    // Mouse lontano dai blocchi: l'hover li solleva e sfoca il ritaglio.
    await page.mouse.move(5, 5);
    await page.waitForTimeout(600);
    const a = (await tall.boundingBox())!;
    const b = (await low.boundingBox())!;
    const pad = 32;
    await page.screenshot({
      path: `${SHOTS}/web-giorno.png`,
      clip: { x: a.x - pad, y: a.y - pad, width: a.width + pad * 2, height: b.y + b.height - a.y + pad * 2 },
    });
  });

  test("Aspetto: interruttore acceso; spento, il veicolo sparisce", async ({ page, playwright }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/it/user/autoscuole?tab=settings&pane=aspetto");
    const row = page.getByTestId("agenda-vehicle-setting");
    await expect(row).toBeVisible({ timeout: 60_000 });
    await expect(row.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    await row.screenshot({ path: `${SHOTS}/web-aspetto.png` });

    const api = await playwright.request.newContext({ baseURL, storageState: "tests/e2e/.auth/owner.json" });
    await setShowVehicle(api, false);
    await api.dispose();
    await goToTargetDay(page, "Settimana");
    await expect(block(page, ctx.students[0].name)).toBeVisible();
    await expect(page.locator("[data-agenda-vehicle]")).toHaveCount(0);
  });
});

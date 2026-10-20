import fs from "node:fs";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

/**
 * REG-624 — nota dell'ufficio sul blocco della guida annullata.
 * REG-625 — nota diversa per ogni data nella prenotazione multipla web.
 *
 * Dati veri del DB dev in un mercoledì della settimana prossima, ripuliti a
 * fine test. Per le anteprime istruttore e veicolo di prova prendono nomi
 * realistici (solo a schermo). Shots in REG624_SHOTS_DIR.
 */

const SHOTS = process.env.REG624_SHOTS_DIR ?? "test-results/reg624-625";
const VEHICLE = "Fiat Panda (auto E2E)";
const NOTE = "Proposta a Rossi e Bianchi, aspetto risposta entro le 18";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const wednesday = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7) + 7);
  return d;
})();
const at = (dayOffset: number, h: number, m = 0) => {
  const d = new Date(wednesday);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
};

type Row = {
  id: string;
  studentId?: string | null;
  status: string;
  startsAt: string;
  notes?: string | null;
  agendaNote?: string | null;
  cancellationKind?: string | null;
};
type Ctx = { instructorId: string; vehicleId: string; studentId: (name: string) => string };

async function bootstrap(api: APIRequestContext, from: Date, to: Date, officeNotes = false) {
  const res = await api.get("/api/autoscuole/agenda/bootstrap", {
    params: { from: from.toISOString(), to: to.toISOString(), ...(officeNotes ? { officeNotes: "1" } : {}) },
  });
  expect(res.ok(), "GET /agenda/bootstrap").toBeTruthy();
  return ((await res.json()) as {
    data: {
      instructors: Array<{ id: string; name: string }>;
      vehicles: Array<{ id: string; name: string }>;
      students: Array<{ id: string; firstName?: string; lastName?: string }>;
      appointments: Row[];
      meta: { officeNotes?: boolean };
    };
  }).data;
}

async function prepare(api: APIRequestContext): Promise<Ctx> {
  const data = await bootstrap(api, new Date(), new Date(Date.now() + 86_400_000));
  const instructor = data.instructors.find((i) => i.name === "Istruttore E2E") ?? data.instructors[0];
  const vehicle = data.vehicles.find((v) => v.name === VEHICLE)!;
  const byName = new Map(data.students.map((s) => [`${s.firstName ?? ""} ${s.lastName ?? ""}`.trim(), s.id]));
  return {
    instructorId: instructor.id,
    vehicleId: vehicle.id,
    studentId: (name) => {
      const id = byName.get(name);
      expect(id, `allievo ${name}`).toBeTruthy();
      return id!;
    },
  };
}

async function seed(api: APIRequestContext, ctx: Ctx, student: string, start: Date, minutes = 60) {
  const res = await api.post("/api/autoscuole/appointments", {
    data: {
      studentId: ctx.studentId(student),
      instructorId: ctx.instructorId,
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + minutes * 60_000).toISOString(),
      vehicleId: ctx.vehicleId,
      type: "guida",
      types: ["guida"],
    },
  });
  expect(res.ok(), `POST /appointments ${await res.text()}`).toBeTruthy();
}

async function annul(api: APIRequestContext, ctx: Ctx, student: string, start: Date) {
  const data = await bootstrap(api, at(-1, 0), at(3, 0));
  const row = data.appointments.find(
    (a) =>
      a.studentId === ctx.studentId(student) &&
      new Date(a.startsAt).getTime() === start.getTime() &&
      a.status !== "cancelled",
  )!;
  const res = await api.post(`/api/autoscuole/appointments/${row.id}/annul`, { data: { fault: "student" } });
  expect(res.ok(), `POST /annul ${await res.text()}`).toBeTruthy();
  return row.id;
}

async function cleanup(api: APIRequestContext) {
  const data = await bootstrap(api, at(-1, 0), at(3, 0));
  for (const a of data.appointments ?? []) {
    if (a.id.startsWith("gl-") || !a.studentId || a.cancellationKind === "permanent_cancel") continue;
    await api.post(`/api/autoscuole/appointments/${a.id}/permanent-cancel`).catch(() => undefined);
  }
}

async function setCancelledBlocks(page: Page, on: boolean) {
  await page.goto("/it/user/autoscuole?tab=settings&pane=aspetto");
  const row = page.getByTestId("cancelled-blocks-setting");
  await expect(row).toBeVisible({ timeout: 30_000 });
  const toggle = row.getByRole("switch");
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  if ((await toggle.getAttribute("aria-checked")) !== String(on)) {
    await toggle.click();
    await expect(row.getByRole("switch")).toHaveAttribute("aria-checked", String(on), { timeout: 15_000 });
  }
}

async function openWeek(page: Page) {
  await page.goto("/it/user/autoscuole?tab=agenda");
  await expect(page.locator("[data-agenda-col-day]").first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole("tab", { name: "Settimana", exact: true }).click();
  const next = page.locator("span.min-w-\\[130px\\]").locator("xpath=following-sibling::button[1]");
  for (let i = 0; i < 6; i += 1) {
    const days = await page
      .locator("[data-agenda-col-day]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-agenda-col-day")));
    if (days.includes(ymd(wednesday))) break;
    await next.click();
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const col = document.querySelector("[data-agenda-col-day]");
    let el = col?.parentElement ?? null;
    while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement;
    if (el) el.scrollTop = 7.5 * 72;
  });
  await page.waitForTimeout(500);
}

type Box = { x: number; y: number; width: number; height: number };
const boxOf = async (locator: Locator, padding = 16): Promise<Box> => {
  const b = (await locator.boundingBox())!;
  return { x: b.x - padding, y: b.y - padding, width: b.width + padding * 2, height: b.height + padding * 2 };
};
const union = (...boxes: Box[]): Box => {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
};
async function shot(page: Page, clip: Box, name: string) {
  const path = `${SHOTS}/${name}`;
  await page.screenshot({ path, clip });
  console.log("HIRO_SHOT", path);
}

/** Nomi realistici per istruttore e veicolo di prova (solo a schermo). */
async function realisticNames(page: Page) {
  const rename = (n: string) => (n === "Istruttore E2E" ? "Marco Ferri" : n === VEHICLE ? "Fiat Panda" : n);
  await page.route("**/api/autoscuole/agenda/bootstrap?**", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    const data = body?.data;
    if (data) {
      for (const i of data.instructors ?? []) i.name = rename(i.name);
      for (const v of data.vehicles ?? []) v.name = rename(v.name);
      for (const a of data.appointments ?? []) {
        if (a.instructor) a.instructor.name = rename(a.instructor.name);
        if (a.vehicle) a.vehicle.name = rename(a.vehicle.name);
      }
    }
    await route.fulfill({ response: res, json: body });
  });
}

const lastPopper = (page: Page) => page.locator("[data-radix-popper-content-wrapper]").last();

const pickDate = async (page: Page, trigger: Locator, target: Date) => {
  await trigger.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await trigger.click();
  const pop = lastPopper(page);
  const wanted = target.toLocaleDateString("it-IT", { month: "long", year: "numeric" }).toLowerCase();
  for (let i = 0; i < 18; i += 1) {
    const label = (await pop.locator("span").first().innerText()).trim().toLowerCase();
    if (label === wanted) break;
    await pop.getByLabel("Mese successivo").click();
    await page.waitForTimeout(80);
  }
  await pop.getByRole("button", { name: String(target.getDate()), exact: true }).click();
};

const pickTime = async (page: Page, card: Locator, trigger: Locator, hhmm: string) => {
  await trigger.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await trigger.click();
  const pop = lastPopper(page);
  const columns = pop.locator("div.overflow-y-auto");
  const [hour, minute] = hhmm.split(":");
  await columns.nth(0).getByRole("button", { name: hour, exact: true }).click();
  await columns.nth(1).getByRole("button", { name: minute, exact: true }).click();
  await card.getByText("Modalità", { exact: true }).click();
  await page.waitForTimeout(150);
};

test.describe.configure({ mode: "serial" });
test.use({ deviceScaleFactor: 2 });

test.describe("REG-624/625 note in agenda", () => {
  test.setTimeout(300_000);

  test("REG-624: nota dell'ufficio sul blocco annullato", async ({ page, playwright }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const api = await playwright.request.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
      storageState: "tests/e2e/.auth/owner.json",
    });
    const ctx = await prepare(api);
    await cleanup(api);

    await seed(api, ctx, "Giulia Conti", at(-1, 8));
    await seed(api, ctx, "Sofia Bruno", at(-1, 9, 30), 90);
    await seed(api, ctx, "Davide Greco", at(-1, 11));
    await seed(api, ctx, "Giulia Conti", at(0, 8));
    await seed(api, ctx, "Luca Gallo", at(0, 9), 120); // → annullata, con nota
    await seed(api, ctx, "Sofia Bruno", at(0, 11));
    await seed(api, ctx, "Matteo De Luca", at(0, 12));
    await seed(api, ctx, "Chiara Esposito", at(1, 8, 30));
    await seed(api, ctx, "Marta Rossi", at(1, 10));
    const lucaId = await annul(api, ctx, "Luca Gallo", at(0, 9));
    await realisticNames(page);

    try {
      await setCancelledBlocks(page, true);
      await openWeek(page);
      const wedCol = page.locator(`[data-agenda-col-day="${ymd(wednesday)}"]`).first();
      const block = wedCol.locator("[data-cancelled-block]").filter({ hasText: "Luca" });
      await expect(block).toHaveCount(1);
      await expect(block.getByTestId("cancelled-block-note")).toHaveCount(0);

      // Riquadro: si scrive la nota.
      await block.click({ position: { x: 20, y: 30 } });
      const card = page.getByTestId("cancelled-lesson-card");
      await expect(card).toBeVisible();
      const input = card.getByTestId("cancelled-note-input");
      await input.fill(NOTE);
      await expect(card.getByTestId("cancelled-note-save")).toBeVisible();
      await page.waitForTimeout(350);
      await shot(page, union(await boxOf(card, 18), await boxOf(block, 18)), "2-riquadro-campo-nota.png");

      await card.getByTestId("cancelled-note-save").click();
      await expect(card.getByText("Salvata")).toBeVisible({ timeout: 15_000 });
      await page.keyboard.press("Escape");
      await expect(card).toBeHidden();

      // Il testo compare sul blocco rigato, e resta dopo il ricaricamento.
      await openWeek(page);
      await expect(block.getByTestId("cancelled-block-note")).toContainText("Proposta a Rossi e Bianchi");
      const tue = page.locator(`[data-agenda-col-day="${ymd(at(-1, 0))}"]`).first();
      const thu = page.locator(`[data-agenda-col-day="${ymd(at(1, 0))}"]`).first();
      const top = (await page.locator(".agenda-card").filter({ hasText: "Giulia" }).first().boundingBox())!;
      const tueBox = (await tue.boundingBox())!;
      const thuBox = (await thu.boundingBox())!;
      await page.mouse.move(0, 0);
      await page.waitForTimeout(300);
      await shot(
        page,
        { x: tueBox.x - 64, y: top.y - 30, width: thuBox.x + thuBox.width - tueBox.x + 72, height: 5.4 * 72 + 30 },
        "1-blocco-annullato-con-nota.png",
      );

      // Solo ufficio sul web: senza officeNotes (l'app) la nota non viaggia.
      const office = await bootstrap(api, at(0, 0), at(1, 0), true);
      expect(office.meta.officeNotes).toBe(true);
      expect(office.appointments.find((a) => a.id === lucaId)?.agendaNote).toBe(NOTE);
      const app = await bootstrap(api, at(0, 0), at(1, 0));
      expect(app.meta.officeNotes).toBe(false);
      expect(app.appointments.find((a) => a.id === lucaId)).not.toHaveProperty("agendaNote");

      // Slot riempito → il blocco sparisce e la nota con lui.
      await seed(api, ctx, "Nicolò Bianchi", at(0, 9), 120);
      await openWeek(page);
      await expect(wedCol.locator(".agenda-card").filter({ hasText: "Nicol" })).toBeVisible({ timeout: 30_000 });
      await expect(wedCol.locator("[data-cancelled-block]")).toHaveCount(0);
      await expect(page.getByText("Proposta a Rossi e Bianchi")).toHaveCount(0);
    } finally {
      await cleanup(api);
      await setCancelledBlocks(page, false).catch(() => undefined);
      await api.dispose();
    }
  });

  test("REG-625: nota diversa per ogni data nella multipla", async ({ page, playwright }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1800 });
    const api = await playwright.request.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
      storageState: "tests/e2e/.auth/owner.json",
    });
    const ctx = await prepare(api);
    await cleanup(api);
    await realisticNames(page);

    try {
      await page.goto("/it/user/autoscuole?tab=agenda");
      await expect(page.getByTestId("autoscuole-agenda-page").first()).toBeVisible({ timeout: 60_000 });
      const newAppointment = page.getByRole("button", { name: "Appuntamento" }).first();
      for (let attempt = 0; attempt < 4; attempt += 1) {
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

      await card.getByPlaceholder("Cerca allievo...").fill("Giulia");
      await page.getByText(/Giulia Conti/).last().click();
      await page.waitForTimeout(300);
      await card.getByRole("combobox", { name: "Istruttore" }).click();
      await page.getByRole("option", { name: "Marco Ferri" }).click();
      const vehicle = card.getByRole("combobox", { name: "Veicolo" });
      if (!(await vehicle.innerText()).includes("Fiat Panda")) {
        await vehicle.click();
        await page.getByRole("option", { name: /Fiat Panda/ }).first().click();
      }

      await card.getByRole("button", { name: "60 min", exact: true }).first().click();
      await card.getByText("Più guide in una volta sola").click();
      await card.getByRole("button", { name: "Aggiungi guida" }).click();
      await card.getByRole("button", { name: "Aggiungi guida" }).click();
      const slots = [
        { date: at(0, 0), time: "09:00", note: "" },
        { date: at(1, 0), time: "15:00", note: "Parcheggio in salita a Sant'Ilario" },
        { date: at(2, 0), time: "10:00", note: "Simulazione d'esame sul percorso della Motorizzazione" },
      ];
      for (const [index, slot] of slots.entries()) {
        const row = card.getByTestId("multi-entry").nth(index);
        await pickDate(page, row.getByRole("button").first(), slot.date);
        await pickTime(page, card, row.getByRole("button").nth(1), slot.time);
        if (slot.note) await row.getByTestId("multi-entry-note").fill(slot.note);
      }
      await card.getByPlaceholder("Note opzionali sulla guida").fill("Portare il foglio rosa");
      await expect(card.getByTestId("multi-entry-note").first()).toHaveAttribute(
        "placeholder",
        "Nota comune: Portare il foglio rosa",
      );
      await page.mouse.move(0, 0);
      const list = card.getByTestId("multi-entry").first().locator("xpath=..");
      const notesField = card.getByPlaceholder("Note opzionali sulla guida");
      await notesField.evaluate((el) => el.scrollIntoView({ block: "end" }));
      await page.waitForTimeout(300);
      await list.evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(400);
      // Elenco delle date + nota comune: le note per data e la loro predefinita.
      await shot(page, union(await boxOf(list, 14), await boxOf(notesField, 14)), "3-multipla-note-per-data.png");

      await card.getByRole("button", { name: /Crea 3 guid/ }).click();
      await expect(card).toBeHidden({ timeout: 30_000 });

      // La nota della data SOSTITUISCE la comune; vuota = eredita.
      const data = await bootstrap(api, at(-1, 0), at(3, 0));
      const giulia = data.appointments
        .filter((a) => a.studentId === ctx.studentId("Giulia Conti") && a.status !== "cancelled")
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      expect(giulia.map((a) => a.notes)).toEqual([
        "Portare il foglio rosa",
        "Parcheggio in salita a Sant'Ilario",
        "Simulazione d'esame sul percorso della Motorizzazione",
      ]);
    } finally {
      await cleanup(api);
      await api.dispose();
    }
  });
});

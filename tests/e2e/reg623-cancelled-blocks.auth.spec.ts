import fs from "node:fs";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

/**
 * REG-623 — blocchi delle guide annullate non ancora sostituite.
 *
 * Tutto su dati veri del DB dev, in un giorno della settimana prossima:
 *  - guide normali + due guide annullate dalla segreteria (blocchi) + una
 *    annullata e già sostituita da un'altra guida (nessun blocco);
 *  - setting acceso da Impostazioni → Aspetto;
 *  - X all'hover, riquadro al click, «Assegna sostituto» precompilato e,
 *    salvando, il blocco che sparisce da solo.
 * Per le anteprime una sola riga del bootstrap viene "raccontata" come
 * annullata dall'allievo (con offerta del posto), e nomi di istruttore e
 * veicolo resi realistici: il resto è il dato vero. Shots in REG623_SHOTS_DIR.
 */

const SHOTS = process.env.REG623_SHOTS_DIR ?? "test-results/reg623";
const VEHICLE = "Fiat Panda (auto E2E)";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Mercoledì della settimana prossima (annullare con >24h di preavviso non è tardivo).
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

type Ctx = {
  instructorId: string;
  vehicleId: string;
  studentId: (name: string) => string;
};

async function bootstrap(api: APIRequestContext, from: Date, to: Date) {
  const res = await api.get("/api/autoscuole/agenda/bootstrap", {
    params: { from: from.toISOString(), to: to.toISOString() },
  });
  expect(res.ok(), "GET /agenda/bootstrap").toBeTruthy();
  return ((await res.json()) as {
    data: {
      instructors: Array<{ id: string; name: string }>;
      vehicles: Array<{ id: string; name: string }>;
      students: Array<{ id: string; firstName?: string; lastName?: string }>;
      appointments: Array<{ id: string; studentId?: string | null; status: string; startsAt: string }>;
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

async function findId(api: APIRequestContext, ctx: Ctx, student: string, start: Date) {
  const data = await bootstrap(api, at(-1, 0), at(3, 0));
  const row = data.appointments.find(
    (a) =>
      a.studentId === ctx.studentId(student) &&
      new Date(a.startsAt).getTime() === start.getTime() &&
      a.status !== "cancelled",
  );
  expect(row, `guida di ${student}`).toBeTruthy();
  return row!.id;
}

/** «Annulla guida» della segreteria, colpa dell'allievo, con largo preavviso. */
async function annul(api: APIRequestContext, ctx: Ctx, student: string, start: Date) {
  const id = await findId(api, ctx, student, start);
  const res = await api.post(`/api/autoscuole/appointments/${id}/annul`, { data: { fault: "student" } });
  expect(res.ok(), `POST /annul ${await res.text()}`).toBeTruthy();
  return id;
}

/** Fine test: le guide di prova diventano «eliminate», mai candidate a blocco. */
async function cleanup(api: APIRequestContext) {
  const data = await bootstrap(api, at(-1, 0), at(3, 0));
  for (const a of (data.appointments ?? []) as Array<{ id: string; studentId?: string | null; cancellationKind?: string | null }>) {
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
  return row;
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

async function shot(page: Page, box: { x: number; y: number; width: number; height: number }, path: string) {
  await page.screenshot({ path, clip: box });
}
const boxOf = async (locator: Locator, pad = 16) => {
  const b = (await locator.boundingBox())!;
  return { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 };
};
const union = (...boxes: Array<{ x: number; y: number; width: number; height: number }>) => {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
};

test.describe.configure({ mode: "serial" });
test.use({ deviceScaleFactor: 2 });

test.describe("REG-623 blocchi guide annullate", () => {
  test.setTimeout(240_000);

  test("blocco finché l'orario è libero, sparisce col sostituto", async ({ page, playwright }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const api = await playwright.request.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
      storageState: "tests/e2e/.auth/owner.json",
    });
    const ctx = await prepare(api);
    await cleanup(api);

    // Martedì e mercoledì della settimana prossima: una giornata normale di guide.
    await seed(api, ctx, "Giulia Conti", at(-1, 8));
    await seed(api, ctx, "Sofia Bruno", at(-1, 9, 30), 90);
    await seed(api, ctx, "Davide Greco", at(-1, 11));
    await seed(api, ctx, "Giulia Conti", at(0, 8));
    await seed(api, ctx, "Luca Gallo", at(0, 9)); // → annullata dall'allievo (racconto)
    await seed(api, ctx, "Sofia Bruno", at(0, 10));
    await seed(api, ctx, "Martina Marino", at(0, 11)); // → annullata dalla segreteria
    await seed(api, ctx, "Matteo De Luca", at(0, 12));
    await seed(api, ctx, "Chiara Esposito", at(1, 8, 30));
    await seed(api, ctx, "Francesca Colombo", at(1, 10)); // → annullata e già sostituita
    const lucaId = await annul(api, ctx, "Luca Gallo", at(0, 9));
    await annul(api, ctx, "Martina Marino", at(0, 11));
    await annul(api, ctx, "Francesca Colombo", at(1, 10));
    await seed(api, ctx, "Marta Rossi", at(1, 10));

    // Racconto per l'anteprima: la guida di Luca annullata da lui, con
    // l'offerta del posto partita. Nomi realistici per istruttore e veicolo.
    await page.route("**/api/autoscuole/agenda/bootstrap?**", async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      const data = body?.data;
      if (data) {
        const rename = (n: string) => (n === "Istruttore E2E" ? "Marco Ferri" : n === VEHICLE ? "Fiat Panda" : n);
        for (const i of data.instructors ?? []) i.name = rename(i.name);
        for (const v of data.vehicles ?? []) v.name = rename(v.name);
        for (const a of data.appointments ?? []) {
          if (a.instructor) a.instructor.name = rename(a.instructor.name);
          if (a.vehicle) a.vehicle.name = rename(a.vehicle.name);
          if (a.id === lucaId) {
            const cancelledAt = new Date(Date.now() - 2 * 3_600_000);
            a.cancelledAt = cancelledAt.toISOString();
            a.cancelledBy = { name: null, role: "student" };
            a.slotFillOffer = {
              sentAt: new Date(cancelledAt.getTime() + 30_000).toISOString(),
              expiresAt: new Date(Date.now() + 3 * 3_600_000).toISOString(),
              declined: 0,
            };
          }
        }
      }
      await route.fulfill({ response: res, json: body });
    });

    try {
      // Spento (default): nessun blocco.
      await setCancelledBlocks(page, false);
      await openWeek(page);
      await expect(page.locator("[data-cancelled-block]")).toHaveCount(0);

      // Acceso da Aspetto.
      const settingRow = await setCancelledBlocks(page, true);
      await page.mouse.move(0, 0);
      await shot(page, await boxOf(settingRow, 12), `${SHOTS}/5-setting-aspetto.png`);

      await openWeek(page);
      const wedCol = page.locator(`[data-agenda-col-day="${ymd(wednesday)}"]`).first();
      const thuCol = page.locator(`[data-agenda-col-day="${ymd(at(1, 0))}"]`).first();
      const blocks = wedCol.locator("[data-cancelled-block]");
      await expect(blocks).toHaveCount(2);
      // Francesca annullata ma già sostituita da Marta: nessun blocco.
      await expect(thuCol.locator("[data-cancelled-block]")).toHaveCount(0);

      // 1. Agenda: blocchi accanto alle guide normali (mar–gio, 8–13).
      const tue = page.locator(`[data-agenda-col-day="${ymd(at(-1, 0))}"]`).first();
      const top = (await page.locator(".agenda-card").filter({ hasText: "Giulia" }).first().boundingBox())!;
      const tueBox = (await tue.boundingBox())!;
      const thuBox = (await thuCol.boundingBox())!;
      const agendaBox = {
        x: tueBox.x - 64,
        y: top.y - 30,
        width: thuBox.x + thuBox.width - tueBox.x + 64 + 8,
        height: 5.4 * 72 + 30,
      };
      await page.mouse.move(0, 0);
      await page.waitForTimeout(300);
      await shot(page, agendaBox, `${SHOTS}/1-agenda-blocchi.png`);

      // 2. X all'hover.
      const martina = blocks.filter({ hasText: "Martina" });
      await martina.hover();
      await expect(martina.getByRole("button", { name: "Togli dall'agenda" })).toBeVisible();
      await page.waitForTimeout(250);
      const mb = (await martina.boundingBox())!;
      await shot(page, { x: mb.x - 70, y: mb.y - 46, width: mb.width + 140, height: mb.height + 92 }, `${SHOTS}/2-hover-x.png`);

      // 3. Riquadro al click (guida di Luca, annullata dall'allievo).
      const luca = blocks.filter({ hasText: "Luca" });
      await luca.click({ position: { x: 20, y: 30 } });
      const card = page.getByTestId("cancelled-lesson-card");
      await expect(card).toBeVisible();
      await expect(card).toContainText("L'allievo, dall'app");
      await expect(card).toContainText("Marco Ferri");
      await expect(card.getByRole("button", { name: "Assegna sostituto" })).toBeVisible();
      await page.waitForTimeout(350);
      await shot(page, union(await boxOf(card, 18), await boxOf(luca, 18)), `${SHOTS}/3-riquadro.png`);
      await page.keyboard.press("Escape");

      // 4. «Assegna sostituto» sulla guida di Martina (dato vero: segreteria).
      await martina.click({ position: { x: 20, y: 30 } });
      await expect(card).toContainText("Segreteria");
      await card.getByRole("button", { name: "Assegna sostituto" }).click();
      const form = page.getByRole("dialog", { name: "Assegna sostituto" });
      await expect(form).toBeVisible();
      await expect(form).toContainText("Martina");
      await expect(form.getByRole("combobox", { name: "Istruttore" })).toContainText("Marco Ferri");
      // Il blocco annullato lascia il posto al ghost della nuova guida.
      await expect(blocks).toHaveCount(1);
      await page.waitForTimeout(500);
      const formBox = await boxOf(form, 14);
      await shot(page, formBox, `${SHOTS}/4-form-sostituto.png`);

      await form.getByPlaceholder("Cerca allievo...").fill("Nicol");
      await page.getByText(/Nicolò Bianchi/).last().click();
      await page.waitForTimeout(300);
      await form.getByRole("button", { name: "Crea guida" }).click();
      await expect(form).toBeHidden({ timeout: 30_000 });

      // Sostituto trovato → il blocco sparisce da solo, la guida nuova è lì.
      await expect(wedCol.locator(".agenda-card").filter({ hasText: "Nicol" })).toBeVisible({ timeout: 30_000 });
      await expect(blocks).toHaveCount(1);
      await expect(blocks.filter({ hasText: "Martina" })).toHaveCount(0);

      // La X toglie il blocco di Luca e lo fa per tutti (dato salvato).
      await luca.hover();
      await luca.getByRole("button", { name: "Togli dall'agenda" }).click();
      await expect(blocks).toHaveCount(0);
      await openWeek(page);
      await expect(wedCol.locator("[data-cancelled-block]")).toHaveCount(0);
      // …e la guida resta annullata nello storico.
      const after = await bootstrap(api, at(0, 0), at(1, 0));
      expect(after.appointments.find((a) => a.id === lucaId)?.status).toBe("cancelled");
    } finally {
      await cleanup(api);
      await setCancelledBlocks(page, false).catch(() => undefined);
      await api.dispose();
    }
  });
});

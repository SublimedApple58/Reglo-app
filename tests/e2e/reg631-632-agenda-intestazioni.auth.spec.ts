import fs from "node:fs";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

/**
 * REG-631 — mese abbreviato su ogni colonna dell'agenda («lun 16 nov»).
 * REG-632 — nota del giorno nell'intestazione della data («Genova quiz»).
 *
 * Dati veri del DB dev nella settimana del lunedì 16 novembre (lontana dalle
 * altre spec), ripuliti a fine test. Istruttore e veicolo di prova prendono
 * nomi realistici solo a schermo. Shots in REG631_SHOTS_DIR.
 */

const SHOTS = process.env.REG631_SHOTS_DIR ?? "test-results/reg631-632";
const VEHICLE = "Fiat Panda (auto E2E)";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Lunedì 16 novembre del primo anno in cui è ancora futuro. */
const monday = (() => {
  const now = new Date();
  for (let y = now.getFullYear(); ; y += 1) {
    const d = new Date(y, 10, 16);
    if (d.getDay() === 1 && d > now) return d;
  }
})();
const at = (dayOffset: number, h: number, m = 0) => {
  const d = new Date(monday);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
};
const TUE = ymd(at(1, 0));
const WED = ymd(at(2, 0));
const THU = ymd(at(3, 0));

type Row = { id: string; studentId?: string | null; cancellationKind?: string | null };
type Ctx = { instructorId: string; vehicleId: string; studentId: (name: string) => string };

async function bootstrap(api: APIRequestContext, officeNotes = false) {
  const res = await api.get("/api/autoscuole/agenda/bootstrap", {
    params: {
      from: at(0, 0).toISOString(),
      to: at(7, 0).toISOString(),
      ...(officeNotes ? { officeNotes: "1" } : {}),
    },
  });
  expect(res.ok(), "GET /agenda/bootstrap").toBeTruthy();
  return ((await res.json()) as {
    data: {
      instructors: Array<{ id: string; name: string }>;
      vehicles: Array<{ id: string; name: string }>;
      students: Array<{ id: string; firstName?: string; lastName?: string }>;
      appointments: Row[];
      holidays?: Array<{ date: string }>;
      dayNotes?: Array<{ date: string; text: string }>;
    };
  }).data;
}

async function prepare(api: APIRequestContext): Promise<Ctx> {
  const data = await bootstrap(api);
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

const putNote = (api: APIRequestContext, date: string, text: string) =>
  api.put("/api/autoscuole/day-notes", { data: { date, text } });

async function cleanup(api: APIRequestContext) {
  const data = await bootstrap(api, true);
  for (const a of data.appointments ?? []) {
    if (a.id.startsWith("gl-") || !a.studentId || a.cancellationKind === "permanent_cancel") continue;
    await api.post(`/api/autoscuole/appointments/${a.id}/permanent-cancel`).catch(() => undefined);
  }
  for (const n of data.dayNotes ?? []) await putNote(api, n.date, "");
  for (const h of data.holidays ?? []) {
    // `deleteHoliday` azzera l'ora col fuso del server: alle 23:30 UTC il
    // giorno resta lo stesso sia in UTC (Vercel) sia a Roma (dev locale).
    const day = new Date(h.date).toISOString().slice(0, 10);
    await api.delete("/api/autoscuole/holidays", { data: { date: `${day}T23:30:00.000Z` } });
  }
}

/** Nomi realistici per istruttore e veicolo di prova (solo a schermo), in
 *  tutte le risposte dell'agenda: le colonne istruttore della settimana
 *  arrivano anche da altre rotte oltre al bootstrap. */
async function realisticNames(page: Page) {
  await page.route("**/api/autoscuole/**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch();
    const type = res.headers()["content-type"] ?? "";
    if (!type.includes("application/json")) return route.fulfill({ response: res });
    const body = (await res.text())
      .replaceAll("Istruttore E2E", "Marco Ferri")
      .replaceAll(VEHICLE, "Fiat Panda");
    await route.fulfill({ response: res, body });
  });
}

async function openWeek(page: Page) {
  await page.goto("/it/user/autoscuole?tab=agenda");
  await expect(page.locator("[data-agenda-col-day]").first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole("tab", { name: "Settimana", exact: true }).click();
  const next = page.locator("span.min-w-\\[130px\\]").locator("xpath=following-sibling::button[1]");
  for (let i = 0; i < 12; i += 1) {
    const days = await page
      .locator("[data-agenda-col-day]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-agenda-col-day")));
    if (days.includes(ymd(monday))) break;
    await next.click();
    await page.waitForTimeout(250);
  }
  await expect(page.locator(`[data-agenda-day-header="${ymd(monday)}"]`)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const col = document.querySelector("[data-agenda-col-day]");
    let el = col?.parentElement ?? null;
    while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement;
    if (el) el.scrollTop = 8 * 72;
  });
  await page.waitForTimeout(500);
}

type Box = { x: number; y: number; width: number; height: number };
const boxOf = async (locator: Locator, padding = 16): Promise<Box> => {
  const b = (await locator.boundingBox())!;
  return { x: b.x - padding, y: b.y - padding, width: b.width + padding * 2, height: b.height + padding * 2 };
};
async function shot(page: Page, clip: Box, name: string) {
  const path = `${SHOTS}/${name}`;
  await page.screenshot({ path, clip });
  console.log("HIRO_SHOT", path);
}

const header = (page: Page, date: string) => page.locator(`[data-agenda-day-header="${date}"]`);

test.describe.configure({ mode: "serial" });
test.use({ deviceScaleFactor: 2, viewport: { width: 1440, height: 1000 } });

test.describe("REG-631/632 intestazioni dell'agenda", () => {
  test.setTimeout(300_000);

  test("mese su ogni colonna, nota del giorno in agenda e in stampa", async ({ page }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const api = page.request;
    const ctx = await prepare(api);
    await cleanup(api);

    try {
      // Festivo il mercoledì, nota già scritta il giovedì, qualche guida vera.
      const holiday = await api.post("/api/autoscuole/holidays", {
        data: { from: WED, to: WED, label: "Santo patrono", cancelAppointments: false },
      });
      expect(holiday.ok(), await holiday.text()).toBeTruthy();
      expect((await putNote(api, THU, "Genova uffici")).ok()).toBeTruthy();
      await seed(api, ctx, "Marta Rossi", at(0, 9));
      await seed(api, ctx, "Luca Gallo", at(0, 11));
      await seed(api, ctx, "Giulia Conti", at(1, 10));
      await seed(api, ctx, "Davide Greco", at(3, 9, 30), 90);
      await seed(api, ctx, "Sofia Bruno", at(4, 10));

      await realisticNames(page);
      await openWeek(page);

      // ── REG-631: il mese su ogni colonna ─────────────────────────────────
      const dates = page.getByTestId("agenda-day-date");
      await expect(dates.first()).toContainText("nov");
      await expect(header(page, ymd(monday))).toContainText(/lun\s*16\s*nov/i);

      // ── REG-632: la nota si aggiunge col tasto destro sulla data ─────────
      await header(page, TUE).click({ button: "right" });
      const menu = page.getByTestId("day-header-menu");
      await expect(menu).toBeVisible();
      await expect(menu.getByText("Segna festivo")).toBeVisible();
      await menu.getByTestId("day-header-menu-note").click();
      const dialog = page.getByTestId("day-note-dialog");
      await expect(dialog).toBeVisible();
      await dialog.getByTestId("day-note-input").fill("Genova quiz");
      await page.waitForTimeout(200);
      await shot(page, await boxOf(dialog, 28), "3-dialog-nota-del-giorno.png");
      await dialog.getByTestId("day-note-save").click();
      await expect(dialog).toBeHidden();
      await expect(header(page, TUE).getByTestId("agenda-day-note")).toHaveText("Genova quiz");
      await expect(header(page, THU).getByTestId("agenda-day-note")).toHaveText("Genova uffici");
      // Il festivo resta riconoscibile e diverso, accanto alla nota.
      await expect(header(page, WED)).toContainText(/santo patrono/i);

      // Intestazioni della settimana: mese, nota e festivo, più l'inizio della griglia.
      await page.mouse.move(5, 5);
      await page.waitForTimeout(300);
      const headerWrap = page.locator("[data-agenda-header-wrap]");
      // Colonne istruttore: arrivano da una server action, non dal bootstrap.
      await headerWrap.evaluate((el) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (n.textContent === "Istruttore") n.textContent = "Marco";
          else if (n.textContent === "IE") n.textContent = "MF";
        }
      });
      const hb = (await headerWrap.boundingBox())!;
      await shot(page, { x: hb.x - 12, y: hb.y - 12, width: hb.width + 24, height: hb.height + 230 }, "1-settimana-intestazioni.png");

      // Solo l'ufficio: senza `officeNotes=1` (app, istruttori) la nota non arriva.
      expect((await bootstrap(api, false)).dayNotes).toBeUndefined();
      expect((await bootstrap(api, true)).dayNotes?.map((n) => n.text).sort()).toEqual(["Genova quiz", "Genova uffici"]);

      // Non blocca: sul giorno con la nota si prenota come sempre.
      await seed(api, ctx, "Chiara Esposito", at(1, 15));

      // ── Stampa: la nota esce sul foglio ──────────────────────────────────
      await page.getByTitle("Stampa agenda").click();
      const sheet = page.locator("#agenda-print-root");
      await expect(sheet).toBeVisible({ timeout: 20_000 });
      await expect(sheet.getByTestId("print-day-note").first()).toBeVisible();
      await expect(sheet).toContainText("Genova quiz");
      await page.waitForTimeout(400);
      const sb = (await sheet.boundingBox())!;
      await shot(page, { x: sb.x, y: sb.y, width: sb.width, height: Math.min(sb.height, 360) }, "4-stampa-con-nota.png");
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden({ timeout: 10_000 });

      // ── Vista giorno: data col mese in alto e nota del giorno ────────────
      await header(page, TUE).click();
      const dayNote = page.getByTestId("agenda-day-note").first();
      await expect(dayNote).toHaveText("Genova quiz");
      await page.waitForTimeout(800);
      const toolbarDate = page.locator("span.min-w-\\[130px\\]");
      await expect(toolbarDate).toContainText(/nov/i);
      const tb = (await toolbarDate.boundingBox())!;
      const nb = (await dayNote.boundingBox())!;
      await shot(page, { x: tb.x - 70, y: tb.y - 22, width: nb.x + nb.width - tb.x + 76, height: tb.height + 44 }, "2-giorno-data-e-nota.png");

      // ── Modifica e togli: un clic sulla nota ─────────────────────────────
      await dayNote.click();
      await expect(dialog).toBeVisible();
      await dialog.getByTestId("day-note-remove").click();
      await expect(dialog).toBeHidden();
      await expect(page.getByTestId("agenda-day-note")).toHaveCount(0);
      expect((await bootstrap(api, true)).dayNotes?.map((n) => n.text)).toEqual(["Genova uffici"]);
    } finally {
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await cleanup(api);
      const after = await bootstrap(api, true);
      expect(after.holidays ?? [], "festivo di prova tolto").toHaveLength(0);
      expect(after.dayNotes ?? []).toHaveLength(0);
    }
  });
});

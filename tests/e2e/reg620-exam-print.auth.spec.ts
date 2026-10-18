import fs from "node:fs";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

/**
 * REG-620 — stampa agenda "Solo esami".
 *
 * 1. Integrazione vera: crea due esami oggi (uno con orario, uno senza) e
 *    controlla che la stampa li mostri, quello senza orario in cima.
 * 2. Anteprime per la conferma design: la sola chiamata degli esami
 *    (bootstrap con `type=esame`) è servita da un set di dati di prova
 *    realistico, così il DB dev non si riempie di istruttori finti.
 *    Gli screenshot finiscono in REG620_SHOTS_DIR.
 */

const SHOTS = process.env.REG620_SHOTS_DIR ?? "test-results/reg620";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Screenshot ritagliato attorno a un elemento, con un margine. */
async function shot(page: Page, locator: Locator, path: string, pad = 24) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  const b = (await locator.boundingBox())!;
  await page.screenshot({
    path,
    clip: { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 },
  });
}

async function openExamSetup(page: Page) {
  await page.goto("/it/user/autoscuole?tab=agenda");
  await expect(page.locator("[data-agenda-col-day]").first()).toBeVisible({ timeout: 60_000 });
  await page.getByTitle("Stampa agenda").click();
  await page.getByTestId("print-mode-switch").getByRole("tab", { name: "Solo esami" }).click();
  await expect(page.getByTestId("exam-print-setup")).toBeVisible();
}

test.describe.configure({ mode: "serial" });
test.use({ deviceScaleFactor: 2 });

test.describe("REG-620 stampa solo esami", () => {
  test.setTimeout(180_000);

  test("gli esami del periodo finiscono nella tabella, senza orario in cima", async ({ page, playwright }) => {
    const api: APIRequestContext = await playwright.request.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
      storageState: "tests/e2e/.auth/owner.json",
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const boot = await api.get("/api/autoscuole/agenda/bootstrap", {
      params: { from: today.toISOString(), to: new Date(today.getTime() + 86_400_000).toISOString() },
    });
    const data = (await boot.json()).data as {
      students: Array<{ id: string; firstName: string; lastName: string }>;
      instructors: Array<{ id: string; name: string }>;
    };
    const luca = data.students.find((s) => `${s.firstName} ${s.lastName}` === "Luca Gallo")!;
    const giulia = data.students.find((s) => `${s.firstName} ${s.lastName}` === "Giulia Conti")!;
    const instructor = data.instructors.find((i) => i.name === "Istruttore E2E") ?? data.instructors[0];

    const created: string[] = [];
    const create = async (studentId: string, startsAt: Date, endsAt: Date | null) => {
      const res = await api.post("/api/autoscuole/exam", {
        data: {
          studentIds: [studentId],
          startsAt: startsAt.toISOString(),
          endsAt: endsAt?.toISOString() ?? null,
          instructorId: instructor.id,
          notes: "REG620 e2e",
        },
      });
      expect(res.ok(), `POST /exam ${await res.text()}`).toBeTruthy();
    };
    const at = (h: number) => new Date(today.getTime() + h * 3_600_000);
    await create(luca.id, at(21), at(22));
    await create(giulia.id, today, null);

    try {
      await openExamSetup(page);
      await page.getByRole("button", { name: "Mostra anteprima" }).click();
      const day = page.locator(`[data-exam-day="${ymd(today)}"]`);
      await expect(day).toBeVisible({ timeout: 30_000 });
      const rows = day.locator("tbody tr");
      await expect(rows.first()).toContainText("Orario da definire");
      await expect(rows.first()).toContainText("Giulia Conti");
      await expect(day).toContainText("21:00 – 22:00");
      await expect(day).toContainText("Luca Gallo");
    } finally {
      const after = await api.get("/api/autoscuole/agenda/bootstrap", {
        params: {
          from: today.toISOString(),
          to: new Date(today.getTime() + 86_400_000).toISOString(),
          type: "esame",
        },
      });
      const appts = ((await after.json()).data?.appointments ?? []) as Array<{ id: string; notes?: string | null }>;
      for (const a of appts) {
        if (a.notes === "REG620 e2e") created.push(a.id);
      }
      for (const id of created) {
        await api.post(`/api/autoscuole/appointments/${id}/permanent-cancel`).catch(() => undefined);
      }
      await api.dispose();
    }
  });

  test("anteprime: flusso di scelta e foglio A4", async ({ page }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1100 });

    // Lunedì della settimana prossima: 4 giorni con esami su 5.
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
    const day = (offset: number, h = 0, m = 0) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + offset);
      d.setHours(h, m, 0, 0);
      return d;
    };
    const fixture = buildFixture(day);
    await page.route("**/api/autoscuole/agenda/bootstrap?**", async (route) => {
      if (new URL(route.request().url()).searchParams.get("type") !== "esame") return route.continue();
      await route.fulfill({ json: { success: true, data: fixture } });
    });

    await openExamSetup(page);

    // 1. Selettore Agenda / Solo esami (barra in alto dell'anteprima).
    const bar = page.getByTestId("print-mode-switch").locator("xpath=..");
    await shot(page, bar, `${SHOTS}/1-selettore.png`, 0);

    // 2. Calendario: periodo da lunedì a venerdì della settimana prossima.
    const period = page.getByTestId("exam-print-period");
    const clickDay = async (d: Date) => {
      for (let i = 0; i < 3; i += 1) {
        const cell = period.locator(`[data-day="${ymd(d)}"]`);
        if (await cell.count()) return cell.click();
        await period.getByRole("button", { name: "Mese successivo" }).click();
      }
      throw new Error(`giorno ${ymd(d)} non trovato`);
    };
    await clickDay(day(0));
    await clickDay(day(4));
    await expect(period).toContainText(/Dal \d+ al \d+/);
    await period.scrollIntoViewIfNeeded();
    await shot(page, period, `${SHOTS}/2-calendario.png`);

    // 3. Dettagli: i default del blocco esame + le note.
    const fields = page.getByTestId("exam-print-fields");
    await fields.getByText("Note", { exact: true }).click();
    await fields.scrollIntoViewIfNeeded();
    await shot(page, fields, `${SHOTS}/3-dettagli.png`);

    // 4. Anteprima A4 intera.
    await page.getByRole("button", { name: "Mostra anteprima" }).click();
    const sheet = page.locator("#agenda-print-root");
    await expect(sheet.locator("[data-exam-day]")).toHaveCount(4);
    await page.setViewportSize({ width: 1440, height: 2400 });
    await page.waitForTimeout(300);
    await shot(page, sheet, `${SHOTS}/4-anteprima-a4.png`);

    // 5. Un giorno leggibile da vicino (quello con l'esame senza orario).
    await shot(page, sheet.locator(`[data-exam-day="${ymd(day(3))}"]`), `${SHOTS}/5-giorno.png`);

    // PDF vero, per controllare l'impaginazione di stampa.
    await page.emulateMedia({ media: "print" });
    await page.pdf({ path: `${SHOTS}/stampa.pdf`, format: "A4", printBackground: true, preferCSSPageSize: true });
  });
});

function buildFixture(day: (offset: number, h?: number, m?: number) => Date) {
  const ferri = { id: "fx-i-ferri", name: "Marco Ferri" };
  const galli = { id: "fx-i-galli", name: "Elena Galli" };
  const marchetti = { id: "fx-i-marchetti", name: "Paolo Marchetti" };
  const students: Array<{ id: string; firstName: string; lastName: string; licenseCategory: string; transmission: string }> = [];
  const appointments: unknown[] = [];
  let n = 0;
  const exam = (
    start: Date,
    end: Date | null,
    instructor: { id: string; name: string },
    people: Array<[string, string, string, string?]>,
    extra: { notes?: string; co?: Array<{ id: string; name: string }> } = {},
  ) => {
    for (const [first, last, license, transmission] of people) {
      const id = `fx-s-${first}-${last}`.toLowerCase().replace(/[^a-z-]/g, "");
      students.push({ id, firstName: first, lastName: last, licenseCategory: license, transmission: transmission ?? "manual" });
      appointments.push({
        id: `fx-a-${(n += 1)}`,
        type: "esame",
        types: ["esame"],
        status: "scheduled",
        startsAt: start.toISOString(),
        endsAt: end?.toISOString() ?? null,
        notes: extra.notes ?? null,
        examOutcome: null,
        student: { id, firstName: first, lastName: last },
        instructor,
        coInstructors: extra.co ?? [],
      });
    }
  };
  exam(day(0, 8, 30), day(0, 10), ferri, [
    ["Giulia", "Conti", "B"],
    ["Luca", "Gallo", "B"],
    ["Sofia", "Bruno", "B", "automatic"],
  ], { notes: "Ritrovo in Motorizzazione alle 8:10" });
  exam(day(0, 11), day(0, 12), galli, [
    ["Matteo", "De Luca", "A2"],
    ["Nicolò", "Bianchi", "A2"],
  ], { notes: "Moto della scuola già sul piazzale" });
  exam(day(1, 9), day(1, 10, 30), marchetti, [
    ["Chiara", "Esposito", "B"],
    ["Davide", "Greco", "B"],
    ["Martina", "Marino", "B"],
  ]);
  exam(day(1, 14, 30), day(1, 15, 30), ferri, [["Francesca", "Colombo", "BE"]], {
    notes: "Rimorchio da agganciare in sede",
  });
  exam(day(3, 0), null, galli, [
    ["Giuseppe", "Romano", "AM"],
    ["Alessandro", "Ricci", "A"],
  ], { notes: "Orario in attesa della Motorizzazione" });
  exam(day(3, 10), day(3, 11), ferri, [
    ["Marta", "Rossi", "B"],
    ["Benedetta", "Faà", "B"],
  ], { co: [galli] });
  exam(day(4, 8), day(4, 9, 30), marchetti, [
    ["Mario", "Rossi", "B"],
    ["Sara", "Neri", "B", "automatic"],
    ["Andrea", "Costa", "B"],
  ]);
  return { appointments, students, instructors: [ferri, galli, marchetti], vehicles: [], meta: {} };
}

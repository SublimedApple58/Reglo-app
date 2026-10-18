import fs from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * REG-621 — dopo un'azione in agenda la vista non deve tornare da sola a oggi.
 *
 * Matrice vista × azione. Ogni caso porta l'agenda su un giorno futuro, la
 * scrolla a metà giornata, esegue l'azione e confronta il periodo visibile e lo
 * scroll prima/dopo. Il nodo radice viene marcato: se dopo l'azione il
 * marcatore non c'è più, il componente è stato rimontato (è il modo più rapido
 * per perdere data e scroll insieme, e va distinto da una navigazione voluta).
 *
 * I risultati finiscono anche in `test-results/reg621-matrix.json`.
 */

const AGENDA = "/it/user/autoscuole?tab=agenda";
const PREFS_KEY = "reglo-agenda-view-prefs";
const RESULTS = path.join(__dirname, "../../test-results/reg621-matrix.json");

type View = "Settimana" | "Settimana 7gg" | "Giorno";
type Action =
  | "prenota da slot"
  | "prenota dal +"
  | "multipla dal +"
  | "esame dal +"
  | "blocco dal +"
  | "gruppo dal +"
  | "modifica orario"
  | "annulla guida";

type Snap = { label: string; scrollTop: number; mounted: boolean; colDays: string[] };
type Row = { view: View; action: Action; target: string; before: Snap; during?: Snap; after: Snap };

const VIEWS: View[] = ["Settimana", "Settimana 7gg", "Giorno"];
const ACTIONS: Action[] = [
  "prenota da slot",
  "prenota dal +",
  "multipla dal +",
  "esame dal +",
  "blocco dal +",
  "gruppo dal +",
  "modifica orario",
  "annulla guida",
];

const root = (page: Page) => page.getByTestId("autoscuole-agenda-page").first();

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Un giorno diverso per ogni caso, lontano da oggi: niente collisioni fra casi. */
const targetDay = (index: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 120 + index);
  return d;
};

const at = (day: Date, h: number, m = 0) => {
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
};

/* ─────────────────────────────── misure ─────────────────────────────────── */

/**
 * Lo scroller vero dell'agenda: il primo antenato della colonna con overflow
 * auto/scroll. Non basta "scrollHeight > clientHeight": i wrapper con overflow
 * visibile lo soddisfano lo stesso, e il loro scrollTop è sempre 0.
 */
const FIND_SCROLLER = `
  (start) => {
    let el = start;
    while (el && !(/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 4)) {
      el = el.parentElement;
    }
    return el;
  }
`;

async function snap(page: Page): Promise<Snap> {
  return page.evaluate((findScroller) => {
    const find = eval(findScroller) as (el: HTMLElement | null) => HTMLElement | null;
    const r = document.querySelector('[data-testid="autoscuole-agenda-page"]') as
      | (HTMLElement & { __reg621?: boolean })
      | null;
    const label = r?.querySelector("span.min-w-\\[130px\\]")?.textContent?.trim() ?? "";
    const scroller = find(r?.querySelector("[data-agenda-col-day]") as HTMLElement | null);
    const colDays = [
      ...new Set(
        [...(r?.querySelectorAll("[data-agenda-col-day]") ?? [])].map(
          (el) => (el as HTMLElement).dataset.agendaColDay ?? "",
        ),
      ),
    ];
    return { label, scrollTop: Math.round(scroller?.scrollTop ?? -1), mounted: Boolean(r?.__reg621), colDays };
  }, FIND_SCROLLER);
}

async function mark(page: Page) {
  await page.evaluate(() => {
    const r = document.querySelector('[data-testid="autoscuole-agenda-page"]') as
      | (HTMLElement & { __reg621?: boolean })
      | null;
    if (r) r.__reg621 = true;
  });
}

async function scrollGrid(page: Page, top: number) {
  await page.evaluate(
    ([findScroller, t]) => {
      const find = eval(findScroller as string) as (el: HTMLElement | null) => HTMLElement | null;
      find(document.querySelector("[data-agenda-col-day]") as HTMLElement | null)?.scrollTo({ top: t as number });
    },
    [FIND_SCROLLER, top] as const,
  );
  await page.waitForTimeout(300);
}

/* ─────────────────────────────── navigazione ────────────────────────────── */

async function openAgenda(page: Page, view: View) {
  await page.addInitScript(
    ([key, weekMode]) => {
      try {
        const prev = JSON.parse(window.localStorage.getItem(key) ?? "{}");
        window.localStorage.setItem(key, JSON.stringify({ ...prev, weekMode }));
      } catch {
        /* storage non disponibile */
      }
    },
    [PREFS_KEY, view === "Settimana 7gg" ? "rolling" : "classic"] as const,
  );
  await page.goto(AGENDA);
  await expect(root(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("[data-agenda-col-day]").first()).toBeVisible({ timeout: 60_000 });
  // SegmentedPill: sono tab, non bottoni. Al Giorno si arriva come fa
  // l'autoscuola su date lontane: settimana giusta, poi clic sull'intestazione
  // del giorno (vedi goToDay).
  await root(page).getByRole("tab", { name: "Settimana", exact: true }).click();
  await page.waitForTimeout(400);
}

async function goToDay(page: Page, target: Date, view: View) {
  await goToWeekOf(page, target);
  if (view !== "Giorno") return;
  await root(page)
    .locator("div.h-\\[52px\\].cursor-pointer")
    .filter({ has: page.locator("span", { hasText: new RegExp(`^${target.getDate()}$`) }) })
    .first()
    .click();
  await expect.poll(async () => (await snap(page)).colDays).toEqual([ymd(target)]);
  await page.waitForTimeout(800);
}

async function goToWeekOf(page: Page, target: Date) {
  const next = root(page).locator("span.min-w-\\[130px\\]").locator("xpath=following-sibling::button[1]");
  for (let i = 0; i < 80; i += 1) {
    if ((await snap(page)).colDays.includes(ymd(target))) {
      await page.waitForTimeout(800); // ricarica silenziosa del nuovo range
      return;
    }
    await next.click();
    await page.waitForTimeout(200);
  }
  throw new Error(`giorno ${ymd(target)} non raggiunto`);
}

/* ─────────────────────────────── azioni ─────────────────────────────────── */

const createCard = (page: Page) => page.getByRole("dialog", { name: /Nuovo appuntamento/ });

/** "+" in alto a destra → voce del menu. Riprova: in idratazione il menu può non aprirsi. */
async function openPlus(page: Page, item: string) {
  const entry = page.getByRole("button", { name: item, exact: true }).first();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.getByTitle("Inserisci a mano").click();
    try {
      await entry.waitFor({ state: "visible", timeout: 4_000 });
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  await entry.click();
  await page.waitForTimeout(1_200);
}

async function pickFormDay(page: Page, target: Date) {
  // DatePickerInput non ha un wrapper: il fratello dell'etichetta È il bottone.
  const trigger = createCard(page)
    .getByText("Giorno", { exact: true })
    .locator("xpath=following-sibling::button[1]");
  await trigger.click();
  const pop = page.locator("[data-radix-popper-content-wrapper]").last();
  const wanted = target.toLocaleDateString("it-IT", { month: "long", year: "numeric" }).toLowerCase();
  for (let i = 0; i < 18; i += 1) {
    const label = (await pop.locator("span").first().innerText()).trim().toLowerCase();
    if (label === wanted) break;
    await pop.getByLabel("Mese successivo").click();
    await page.waitForTimeout(80);
  }
  await pop.getByRole("button", { name: String(target.getDate()), exact: true }).click();
  await page.waitForTimeout(800);
}

async function fillAndCreate(page: Page, student: string) {
  const card = createCard(page);
  await expect(card).toBeVisible({ timeout: 10_000 });
  await card.getByPlaceholder("Cerca allievo...").fill(student);
  await page.getByText(new RegExp(student)).last().click();
  await page.waitForTimeout(400);
  const create = card.getByRole("button", { name: "Crea guida" });
  // Dal "+" l'istruttore non arriva dalla colonna: va scelto a mano.
  const instructor = card.getByRole("combobox", { name: "Istruttore" });
  if ((await create.isDisabled()) && (await instructor.innerText()).trim() === "Istruttore") {
    await instructor.click();
    await page.getByRole("option", { name: "Istruttore E2E" }).click();
    await page.waitForTimeout(300);
  }
  if (await create.isDisabled()) {
    const vehicle = card.getByRole("combobox", { name: /Auto|Veicolo/ }).first();
    if (await vehicle.count()) {
      await vehicle.click();
      await page.getByRole("option").first().click();
    }
  }
  await create.click();
  await expect(card).toBeHidden({ timeout: 60_000 });
}

async function closeAnyDialog(page: Page) {
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }
}

/** Il blocco di una guida nella colonna del giorno, dal nome dell'allievo. */
async function openBlockMenu(page: Page, day: Date, student: string) {
  const b = page
    .locator(`[data-agenda-col-day="${ymd(day)}"]`)
    .getByText(student.split(" ")[0], { exact: false })
    .first();
  await b.click();
  await page.waitForTimeout(500);
}

/* ─────────────────────────────── dati di prova ──────────────────────────── */

type Ctx = { instructorId: string; students: Array<{ id: string; name: string }> };

async function context(api: APIRequestContext): Promise<Ctx> {
  const from = new Date();
  const res = await api.get("/api/autoscuole/agenda/bootstrap", {
    params: { from: from.toISOString(), to: new Date(from.getTime() + 86_400_000).toISOString() },
  });
  expect(res.ok(), "GET /agenda/bootstrap").toBeTruthy();
  const data = ((await res.json()) as {
    data: {
      instructors: Array<{ id: string; name: string }>;
      students: Array<{ id: string; firstName?: string; lastName?: string }>;
    };
  }).data;
  const instructor = data.instructors.find((i) => i.name === "Istruttore E2E") ?? data.instructors[0];
  return {
    instructorId: instructor.id,
    students: data.students
      .map((s) => ({ id: s.id, name: `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() }))
      .filter((s) =>
        /^(Luca Gallo|Giulia Conti|Davide Greco|Chiara Esposito|Mario Rossi|Francesca Colombo|Alessandro Ricci|Giuseppe Romano)$/.test(
          s.name,
        ),
      ),
  };
}

async function seedLesson(api: APIRequestContext, ctx: Ctx, studentId: string, startsAt: Date) {
  const res = await api.post("/api/autoscuole/appointments", {
    data: {
      studentId,
      instructorId: ctx.instructorId,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
      vehicleId: null,
      type: "guida",
      types: ["guida"],
    },
  });
  expect(res.ok(), `POST /appointments ${await res.text()}`).toBeTruthy();
}

/**
 * Pulizia: annulla le guide di questi allievi nei giorni dei casi, così non
 * occupano slot ai giri successivi. Non è una cancellazione fisica (l'API non ne
 * ha una): restano come "annullate" nello storico dell'autoscuola di prova.
 * Solo le loro: il DB di dev è condiviso, e la stessa autoscuola di prova può
 * avere dati di altri test negli stessi giorni.
 */
async function cleanup(api: APIRequestContext, from: Date, to: Date) {
  const ctx = await context(api);
  const mine = new Set(ctx.students.map((s) => s.id));
  const res = await api.get("/api/autoscuole/agenda/bootstrap", {
    params: { from: from.toISOString(), to: to.toISOString() },
  });
  if (!res.ok()) return;
  const data = ((await res.json()) as {
    data: { appointments: Array<{ id: string; studentId?: string | null }> };
  }).data;
  for (const a of data.appointments ?? []) {
    if (a.id.startsWith("gl-") || !a.studentId || !mine.has(a.studentId)) continue;
    await api.post(`/api/autoscuole/appointments/${a.id}/permanent-cancel`).catch(() => undefined);
  }
}

/* ─────────────────────────────── la matrice ─────────────────────────────── */

test.describe.configure({ mode: "serial" });

test.describe("REG-621 matrice vista × azione", () => {
  test.setTimeout(180_000);
  const rows: Row[] = [];

  test.afterAll(async ({ browser }) => {
    fs.mkdirSync(path.dirname(RESULTS), { recursive: true });
    fs.writeFileSync(RESULTS, JSON.stringify(rows, null, 2));
    const context = await browser.newContext({ storageState: "tests/e2e/.auth/owner.json" });
    const page = await context.newPage();
    await cleanup(page.request, targetDay(0), targetDay(VIEWS.length * ACTIONS.length + 1));
    await context.close();
  });

  VIEWS.forEach((view, vi) => {
    ACTIONS.forEach((action, ai) => {
      const index = vi * ACTIONS.length + ai;
      test(`${view} · ${action}`, async ({ page }) => {
        const api = page.request;
        const ctx = await context(api);
        const target = targetDay(index);
        const student = ctx.students[index % ctx.students.length];
        expect(student, "allievi del seed").toBeTruthy();

        if (action === "modifica orario" || action === "annulla guida") {
          // Dentro la fascia visibile a scroll 900 (≈ 12:30–17:45): così il clic
          // sul blocco non costringe Playwright a scrollare, e lo scroll misurato
          // è solo quello dell'app.
          await seedLesson(api, ctx, student.id, at(target, 14));
        }

        await openAgenda(page, view);
        await goToDay(page, target, view);
        await scrollGrid(page, 900);
        await mark(page);
        const before = await snap(page);
        let during: Snap | undefined;

        switch (action) {
          case "prenota da slot": {
            const col = page.locator(`[data-agenda-col-day="${ymd(target)}"]`).first();
            const box = await col.boundingBox();
            if (!box) throw new Error("colonna non visibile");
            await col.click({ position: { x: box.width / 2, y: (15 * 60) / 1440 * box.height + 10 } });
            await page.getByRole("button", { name: "Appuntamento", exact: true }).last().click();
            await fillAndCreate(page, student.name);
            break;
          }
          case "prenota dal +": {
            await openPlus(page, "Appuntamento");
            during = await snap(page);
            await pickFormDay(page, target);
            await fillAndCreate(page, student.name);
            break;
          }
          case "multipla dal +": {
            await openPlus(page, "Appuntamento");
            await createCard(page).getByText("Più guide in una volta sola").click();
            await page.waitForTimeout(1_000);
            during = await snap(page);
            await closeAnyDialog(page);
            break;
          }
          case "esame dal +":
          case "blocco dal +":
          case "gruppo dal +": {
            const item =
              action === "esame dal +" ? "Esame" : action === "blocco dal +" ? "Evento bloccante" : "Guida di gruppo";
            await openPlus(page, item);
            during = await snap(page);
            await closeAnyDialog(page);
            break;
          }
          case "modifica orario": {
            await openBlockMenu(page, target, student.name);
            await page.getByRole("button", { name: "Modifica", exact: true }).first().click();
            await page.waitForTimeout(1_000);
            during = await snap(page);
            const dialog = page.getByRole("dialog").filter({ hasText: "Salva modifiche" }).last();
            await expect(dialog).toBeVisible();
            const timeTrigger = dialog
              .getByText("Orario", { exact: true })
              .locator("xpath=following-sibling::button[1]");
            await timeTrigger.click();
            const pop = page.locator("[data-radix-popper-content-wrapper]").last();
            const cols = pop.locator("div.overflow-y-auto");
            await cols.nth(0).getByRole("button", { name: "15", exact: true }).click();
            await cols.nth(1).getByRole("button", { name: "00", exact: true }).click();
            await dialog.getByText("Orario", { exact: true }).click();
            await page.waitForTimeout(300);
            await dialog.getByRole("button", { name: "Salva modifiche" }).click();
            await expect(dialog).toBeHidden({ timeout: 15_000 });
            break;
          }
          case "annulla guida": {
            await openBlockMenu(page, target, student.name);
            await page.getByRole("button", { name: "Annulla guida", exact: true }).first().click();
            const dialog = page.getByRole("dialog").filter({ hasText: "Annullare questa guida?" });
            await expect(dialog).toBeVisible();
            await dialog.getByRole("button").last().click();
            await expect(dialog).toBeHidden({ timeout: 15_000 });
            break;
          }
        }

        await page.waitForTimeout(2_500);
        const after = await snap(page);
        const row: Row = { view, action, target: ymd(target), before, during, after };
        rows.push(row);
        console.log(`REG621 ${JSON.stringify(row)}`);

        // ── Il contratto di REG-621 ──────────────────────────────────────────
        // 1. L'agenda non si rimonta: rimontarsi vuol dire ripartire da oggi.
        expect(after.mounted, "agenda rimontata").toBe(true);
        // 2. Il periodo visibile non cambia: né aprendo il form, né dopo.
        if (during) expect(during.label, "salto aprendo il form").toBe(before.label);
        expect(after.label, "salto dopo l'azione").toBe(before.label);
        expect(after.colDays).toContain(ymd(target));
        // 3. Se il blocco toccato era già in vista, lo scroll resta dov'era.
        //    (Dal "+" la bozza nasce alle 09:00, fuori vista: lì seguirla è voluto.)
        if (["prenota da slot", "modifica orario", "annulla guida"].includes(action)) {
          expect(Math.abs(after.scrollTop - before.scrollTop), "scroll spostato").toBeLessThanOrEqual(2);
        }
      });
    });
  });
});

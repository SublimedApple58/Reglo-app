import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * REG-637 — quando e da chi una guida è stata segnata pagata / da pagare.
 *
 * Dati veri su dev (`scripts/seed-reg637.ts`): Chiara Moretti con tre guide
 * completate — una da pagare senza storico, una segnata pagata PRIMA della
 * feature (niente storico: resta solo l'etichetta) e una coperta da credito
 * dal titolare (storico letto dal ledger crediti, senza migrazione dati).
 *
 * Web: il titolare segna pagata e poi da pagare dal tab Guide → riga sotto
 * l'etichetta + «Storico 2» con la timeline. App: l'istruttore riceve lo
 * storico dalla lista guide dell'allieva e il suo gesto torna col suo nome;
 * l'allieva non lo riceve mai. Shot ritagliati in /tmp/hiro-anteprime/reg-637.
 */

const SHOTS = process.env.REG637_SHOTS_DIR ?? "/tmp/hiro-anteprime/reg-637";
const PASSWORD = process.env.E2E_PASSWORD || "RegloTest2026!";
const EMAIL = "reg637.chiara@e2e.reglo.test";
const DEV_ENV = { ...process.env, DOTENV_CONFIG_PATH: ".env.dev", NODE_OPTIONS: "--require=dotenv/config" };
const run = (script: string) => execSync(`npx tsx ${script}`, { env: DEV_ENV, stdio: "pipe" }).toString();

test.use({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 });
test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  run("scripts/seed-reg637.ts");
});

test.afterAll(() => {
  run("scripts/seed-reg637.ts --cleanup");
});

const shot = async (page: Page, name: string, target: Locator, pad = 16) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const box = await target.boundingBox();
  if (!box) throw new Error(`${name}: elemento non visibile`);
  await page.screenshot({
    path: path.join(SHOTS, `${name}.png`),
    clip: { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 },
  });
};

async function openChiara(page: Page) {
  await page.goto("/it/user/autoscuole?tab=students");
  await expect(page.getByTestId("autoscuole-students-page")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Cerca" }).first().click();
  await page.getByPlaceholder("Cerca allievi").fill("Chiara Moretti");
  const riga = page
    .locator("div")
    .filter({ has: page.getByText(EMAIL, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Dettaglio" }) })
    .last();
  await riga.getByRole("button", { name: "Dettaglio" }).click();
  await expect(page.getByText(EMAIL, { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await expect(page.getByTestId("student-lesson-row").first()).toBeVisible({ timeout: 30_000 });
}

const lessonRow = (page: Page, day: string) =>
  page.getByTestId("student-lesson-row").filter({ hasText: day });

test("web: riga «chi e quando» sotto l'etichetta + storico", async ({ page }) => {
  await openChiara(page);

  // Segnata pagata prima di REG-637: solo l'etichetta, nessuna riga.
  const legacy = lessonRow(page, "13 ott");
  await expect(legacy.getByText("Pagata", { exact: true })).toBeVisible();
  await expect(legacy.getByTestId("lesson-payment-trail")).toHaveCount(0);

  // Coperta da credito: lo storico arriva dal ledger, già oggi.
  const covered = lessonRow(page, "20 ott");
  const coveredTrail = covered.getByTestId("lesson-payment-trail");
  await expect(coveredTrail).toContainText("Coperta da credito");
  await expect(coveredTrail).toContainText("Titolare E2E");
  await expect(coveredTrail).toContainText("20 ott, 19:42");
  await expect(covered.getByTestId("lesson-payment-history-trigger")).toHaveCount(0);

  // Gesto 1: segna pagata → riga col nome di chi l'ha fatto, niente storico.
  const row = lessonRow(page, "06 ott");
  await expect(row.getByTestId("lesson-payment-trail")).toHaveCount(0);
  await row.getByRole("button", { name: "Segna pagata" }).click();
  const trail = row.getByTestId("lesson-payment-trail");
  await expect(trail).toContainText("Segnata pagata");
  await expect(trail).toContainText("Titolare E2E");
  await expect(row.getByTestId("lesson-payment-history-trigger")).toHaveCount(0);
  await page.waitForTimeout(400);
  await shot(page, "web-01-riga-pagata", row, 12);

  // Gesto 2: torna da pagare → la riga lo dice, e compare «Storico 2».
  await row.getByRole("button", { name: "Segna da pagare" }).click();
  await expect(trail).toContainText("Segnata da pagare");
  const trigger = row.getByTestId("lesson-payment-history-trigger");
  await expect(trigger).toContainText("Storico");
  await expect(trigger).toContainText("2");
  await page.waitForTimeout(400);
  await shot(page, "web-02-riga-storico", row, 12);

  // Persistenza: ricaricando la pagina lo storico viene dal server.
  await openChiara(page);
  const reloaded = lessonRow(page, "06 ott");
  await expect(reloaded.getByTestId("lesson-payment-trail")).toContainText("Segnata da pagare");
  await reloaded.getByTestId("lesson-payment-history-trigger").click();
  const pop = page.getByTestId("lesson-payment-history");
  await expect(pop).toBeVisible();
  await expect(pop.getByRole("listitem")).toHaveCount(2);
  await expect(pop.getByRole("listitem").nth(0)).toContainText("Segnata da pagare");
  await expect(pop.getByRole("listitem").nth(1)).toContainText("Segnata pagata");
  await expect(pop).toContainText("Titolare E2E");
  await page.waitForTimeout(600);
  await shot(page, "web-03-storico-popover", pop, 20);
  // Il clic fallisce se il popover sta sotto il pannello del dettaglio
  // (z-index): toBeVisible da solo non se ne accorge.
  await pop.getByRole("button", { name: "Chiudi" }).click();
  await expect(pop).toHaveCount(0);
});

test("app: l'istruttore riceve lo storico, l'allieva no", async ({ playwright, baseURL }) => {
  const api = await playwright.request.newContext({ baseURL });
  const login = async (email: string) => {
    const res = await api.post("/api/mobile/auth/login", { data: { email, password: PASSWORD } });
    expect(res.ok(), `login mobile ${email}`).toBeTruthy();
    return ((await res.json()) as { data: { token: string; activeCompanyId: string } }).data;
  };

  const student = await login(EMAIL);
  // L'istruttore di prova sta in due autoscuole: l'header sceglie quella
  // dell'allieva richiesta per richiesta, senza toccare la fixture.
  const instructor = await login("istruttore@reglo.it");
  const asStudent = { Authorization: `Bearer ${student.token}` };
  const asInstructor = {
    Authorization: `Bearer ${instructor.token}`,
    "x-reglo-company-id": student.activeCompanyId,
  };

  type Lesson = {
    id: string;
    studentId: string;
    startsAt: string;
    paymentHistory?: Array<{ kind: string; actorName: string | null }>;
  };
  const list = async (headers: Record<string, string>, studentId?: string) => {
    const res = await api.get("/api/autoscuole/appointments", {
      params: { ...(studentId ? { studentId } : {}), limit: 500 },
      headers,
    });
    expect(res.ok()).toBeTruthy();
    return ((await res.json()) as { data: Lesson[] }).data;
  };
  const mark = async (id: string, status: "paid" | "unpaid") => {
    const res = await api.patch(`/api/autoscuole/appointments/${id}/manual-payment`, {
      data: { status },
      headers: asInstructor,
    });
    expect(res.ok()).toBeTruthy();
    return ((await res.json()) as { data: { paymentEvent: { kind: string; actorName: string } | null } })
      .data.paymentEvent;
  };

  const own = await list(asStudent);
  expect(own).toHaveLength(3);
  const sid = own[0].studentId;

  const lessons = await list(asInstructor, sid);
  expect(lessons).toHaveLength(3);
  const oct6 = lessons.find((l) => l.startsAt.startsWith("2026-10-06"))!;
  // I due gesti del titolare dal web, dal più recente.
  expect(oct6.paymentHistory?.map((e) => e.kind)).toEqual(["unpaid", "paid"]);
  expect(lessons.find((l) => l.startsAt.startsWith("2026-10-13"))?.paymentHistory).toEqual([]);
  expect(lessons.find((l) => l.startsAt.startsWith("2026-10-20"))?.paymentHistory?.[0]).toMatchObject({
    kind: "credit_applied",
    actorName: "Titolare E2E",
  });

  // Il gesto dall'app torna col nome dell'istruttore.
  expect(await mark(oct6.id, "paid")).toMatchObject({ kind: "paid", actorName: "Istruttore E2E" });
  // Stesso stato due volte (due dispositivi): nessun evento in più.
  expect(await mark(oct6.id, "paid")).toBeNull();
  const after = await list(asInstructor, sid);
  expect(after.find((l) => l.id === oct6.id)?.paymentHistory?.map((e) => e.kind)).toEqual([
    "paid",
    "unpaid",
    "paid",
  ]);

  // L'allieva non riceve mai lo storico, nemmeno chiedendolo per sé.
  for (const l of await list(asStudent, sid)) expect(l.paymentHistory).toBeUndefined();
});

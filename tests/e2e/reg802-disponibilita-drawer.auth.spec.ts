import { execSync } from "node:child_process";
import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * REG-802 — «Disponibilità» nel drawer allievo (sola lettura) e il flusso API
 * che la riempie: Sara (fase guide) le salva dall'onboarding, Luca (teoria) no.
 *
 *   E2E_BASE_URL=http://127.0.0.1:3637 npx playwright test reg802-disponibilita-drawer
 *
 * Solo su dev: crea e toglie gli allievi di prova con scripts/seed-reg802.ts.
 */
const SHOTS = process.env.REG802_SHOTS_DIR ?? "test-results/reg802";
const PASSWORD = process.env.E2E_PASSWORD || "RegloTest2026!";
const DEV_ENV = { ...process.env, DOTENV_CONFIG_PATH: ".env.dev", NODE_OPTIONS: "--require=dotenv/config" };
const run = (script: string) => execSync(`npx tsx ${script}`, { env: DEV_ENV, stdio: "pipe" }).toString();
const SARA = "reg802.pratica@e2e.reglo.test";
const LUCA = "reg802.teoria@e2e.reglo.test";

test.use({ viewport: { width: 1440, height: 1400 }, deviceScaleFactor: 2 });
test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  run("scripts/seed-reg802.ts");
});

test.afterAll(() => {
  run("scripts/seed-reg802.ts --cleanup");
});

async function openStudent(page: Page, name: string, email: string, phaseTab?: RegExp) {
  await page.goto("/it/user/autoscuole?tab=students");
  await expect(page.getByTestId("autoscuole-students-page")).toBeVisible({ timeout: 60_000 });
  // Gli allievi in teoria stanno nella loro scheda.
  if (phaseTab) await page.getByRole("tab", { name: phaseTab }).click();
  await page.getByRole("button", { name: "Cerca" }).first().click();
  await page.getByPlaceholder("Cerca allievi").fill(name);
  const riga = page
    .locator("div")
    .filter({ has: page.getByText(email, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Dettaglio" }) })
    .last();
  await riga.getByRole("button", { name: "Dettaglio" }).click();
  await expect(page.getByText(email, { exact: true }).last()).toBeVisible();
}

async function shotSection(page: Page, name: string) {
  const section = page.getByTestId("student-availability");
  await section.scrollIntoViewIfNeeded();
  fs.mkdirSync(SHOTS, { recursive: true });
  await section.screenshot({ path: `${SHOTS}/${name}.png`, animations: "disabled" });
}

test("onboarding da API: Sara completa, il server non chiede più niente", async ({ playwright, baseURL }) => {
  const api = await playwright.request.newContext({ baseURL });
  const login = await api.post("/api/mobile/auth/login", { data: { email: SARA, password: PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const token = ((await login.json()) as { data: { token: string } }).data.token;
  const headers = { Authorization: `Bearer ${token}` };

  const me = await (await api.get("/api/mobile/me", { headers })).json();
  expect(me.data.onboarding.steps.map((s: { key: string }) => s.key)).toEqual(["name", "email", "phone", "availability"]);

  const done = await api.post("/api/autoscuole/me/onboarding", {
    headers,
    data: {
      firstName: "Sara",
      lastName: "Conti",
      phone: "+393471234567",
      availability: { days: { "1": ["evening"], "3": ["morning", "afternoon"], "5": ["afternoon"] } },
    },
  });
  expect(done.ok()).toBeTruthy();
  expect((await done.json()).data.onboarding).toBeNull();
});

test("web: il titolare vede le disponibilità di Sara, giorno per giorno", async ({ page }) => {
  await openStudent(page, "Sara Conti", SARA);
  const section = page.getByTestId("student-availability");
  await expect(section).toBeVisible({ timeout: 30_000 });
  await expect(section.getByText("3 giorni")).toBeVisible();
  await expect(section.getByText("Mattina e pomeriggio")).toBeVisible();
  await expect(section.getByText("Sera", { exact: true })).toBeVisible();
  await expect(section.getByText(/Indicate da Sara il/)).toBeVisible();
  await shotSection(page, "drawer-disponibilita");
});

test("web: Luca non le ha ancora indicate", async ({ page }) => {
  await openStudent(page, "Luca Ferri", LUCA, /^Teoria/);
  const section = page.getByTestId("student-availability");
  await expect(section).toBeVisible({ timeout: 30_000 });
  await expect(section.getByText("Non ancora indicate")).toBeVisible();
  await shotSection(page, "drawer-disponibilita-vuota");
});

import { execSync } from "node:child_process";
import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * REG-629 — ex allievi archiviati.
 *
 * Dati veri su dev (`scripts/seed-reg629.ts`): due allievi escono con il flusso
 * NUOVO (Giulia cancella l'account dall'app, Marco lo rimuove l'ufficio dalla
 * Directory); tre erano usciti col flusso VECCHIO e li recupera lo script
 * `reg-629-recover-former-students.ts`. Poi l'ufficio li ritrova nel tab
 * «Ex allievi», con saldo, scheda, pagamento registrabile e «Assegna nome».
 * Shots in REG629_SHOTS_DIR. Ripulisce tutto a fine test.
 */

const SHOTS = process.env.REG629_SHOTS_DIR ?? "test-results/reg629";
const PASSWORD = process.env.E2E_PASSWORD || "RegloTest2026!";
const DEV_ENV = { ...process.env, DOTENV_CONFIG_PATH: ".env.dev", NODE_OPTIONS: "--require=dotenv/config" };
const run = (script: string) => execSync(`npx tsx ${script}`, { env: DEV_ENV, stdio: "pipe" }).toString();

test.use({ viewport: { width: 1440, height: 1400 }, deviceScaleFactor: 2 });
test.describe.configure({ mode: "serial" });

const shot = async (page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, clip, animations: "disabled" });
};

/** Riquadro del pannello ritagliato sul contenuto (niente bianco sotto). */
const panelClip = async (page: Page) => {
  const panel = page.getByTestId("former-student-panel");
  const box = await panel.boundingBox();
  const content = await panel.evaluate((el) => el.scrollHeight);
  return box ? { ...box, height: Math.min(box.height, content + 8) } : undefined;
};

/** Nomi di prova del DB dev → nomi realistici, solo a schermo. */
const realisticNames = (page: Page) =>
  page.evaluate(() => {
    const map: Record<string, string> = {
      "Istruttore E2E": "Paolo Rinaldi",
      "Fiat Panda (auto E2E)": "Fiat Panda",
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      let text = node.textContent ?? "";
      for (const [from, to] of Object.entries(map)) text = text.split(from).join(to);
      if (text !== node.textContent) node.textContent = text;
    }
  });

async function openExTab(page: Page) {
  await page.goto("/it/user/autoscuole/students");
  await expect(page.getByTestId("autoscuole-students-page")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("tab", { name: /Ex allievi/ }).click();
  await expect(page.getByTestId("former-students-list")).toBeVisible();
}

const rowOf = (page: Page, text: string | RegExp) =>
  page.getByTestId("former-student-row").filter({ hasText: text });

test.beforeAll(() => {
  run("scripts/seed-reg629.ts");
});

test.afterAll(() => {
  run("scripts/seed-reg629.ts --cleanup");
});

test("uscita reale: l'allievo cancella l'account dall'app", async ({ playwright, baseURL }) => {
  const api = await playwright.request.newContext({ baseURL });
  const login = await api.post("/api/mobile/auth/login", {
    data: { email: "reg629.giulia@e2e.reglo.test", password: PASSWORD },
  });
  expect(login.ok(), "login mobile di Giulia").toBeTruthy();
  const token = ((await login.json()) as { data: { token: string } }).data.token;
  const del = await api.post("/api/mobile/auth/delete-account", {
    data: { confirm: true },
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(del.ok(), "cancellazione account").toBeTruthy();
  // L'account non entra più.
  const again = await api.post("/api/mobile/auth/login", {
    data: { email: "reg629.giulia@e2e.reglo.test", password: PASSWORD },
  });
  expect(again.status()).toBe(401);
  await api.dispose();
});

test("uscita reale: l'ufficio rimuove l'allievo dalla Directory", async ({ page }) => {
  await page.goto("/it/admin/users?query=Marco%20Bianchi");
  await expect(page.getByTestId("admin-users-page")).toBeVisible({ timeout: 60_000 });
  const row = page.locator("div.grid").filter({ hasText: "Marco Bianchi" }).first();
  await row.getByRole("button", { name: "Dettaglio" }).click();
  await page.getByRole("button", { name: "Elimina utente" }).click();
  await expect(page.getByText(/passerà tra gli Ex allievi/)).toBeVisible();
  await page.getByRole("button", { name: "Elimina", exact: true }).click();
  await expect(page.getByText("Utente eliminato.", { exact: true })).toBeVisible();
});

test("recupero dei casi vecchi: idempotente", () => {
  const first = run("scripts/reg-629-recover-former-students.ts --apply");
  expect(first).toContain("Create 3 righe ex allievo.");
  const second = run("scripts/reg-629-recover-former-students.ts --apply");
  expect(second).toContain("Create 0 righe ex allievo.");
});

test("tab «Ex allievi»: badge, saldo, riepilogo", async ({ page }) => {
  await openExTab(page);
  await expect(page.getByTestId("former-student-row")).toHaveCount(5);

  await expect(rowOf(page, "Giulia Ferrari")).toContainText("Ha eliminato l'account");
  await expect(rowOf(page, "Giulia Ferrari")).toContainText("120,00");
  await expect(rowOf(page, "Giulia Ferrari")).toContainText("3 guide da pagare");
  await expect(rowOf(page, "Marco Bianchi")).toContainText("Rimosso dall'ufficio");
  await expect(rowOf(page, "Marco Bianchi")).toContainText("In pari");
  await expect(rowOf(page, "Luca Esposito")).toContainText("Ha eliminato l'account");
  await expect(rowOf(page, "Luca Esposito")).toContainText("135,00");
  // Senza nome: Sara (rimossa dall'ufficio, prezzo non indicato) e Davide (motivo perso).
  const nameless = rowOf(page, "Ex allievo senza nome");
  await expect(nameless).toHaveCount(2);
  await expect(nameless.filter({ hasText: "Rimosso dall'ufficio" })).toContainText("2 guide");
  await expect(nameless.filter({ hasText: "Uscita non registrata" })).toContainText("In pari");
  await expect(page.getByTestId("former-summary")).toContainText("255,00");

  // Nessun contatto in lista.
  await expect(page.getByTestId("former-students-list")).not.toContainText("@");

  const header = await page.locator("h1, [class*='PageHeader']").first().boundingBox();
  const list = await page.getByTestId("former-students-list").boundingBox();
  const top = Math.max(0, (header?.y ?? 0) - 16);
  await shot(page, "01-lista-ex-allievi", {
    x: (list?.x ?? 0) - 8,
    y: top,
    width: (list?.width ?? 1200) + 16,
    height: (list?.y ?? 0) + (list?.height ?? 0) - top + 12,
  });
});

test("scheda ex allievo: sola lettura, pagamento registrabile", async ({ page }) => {
  await openExTab(page);
  await rowOf(page, "Giulia Ferrari").getByRole("button", { name: "Scheda" }).click();
  const panel = page.getByTestId("former-student-panel");
  // In dev le server action vanno in coda dietro ai caricamenti della pagina.
  await expect(panel.getByTestId("former-panel-name")).toHaveText("Giulia Ferrari", { timeout: 30_000 });
  await expect(panel.getByTestId("former-panel-balance")).toContainText("120,00");
  await expect(panel).toContainText("Cancellati");
  await expect(panel).not.toContainText("reg629.giulia");
  // Sola lettura: nessuna delle azioni della scheda allievo attivo.
  for (const action of ["Cambia fase", "Avvia nuovo percorso", "Annulla", "Rimuovi"]) {
    await expect(panel.getByRole("button", { name: action, exact: true })).toHaveCount(0);
  }
  await expect(panel.getByTestId("former-lesson-row")).toHaveCount(3);
  await page.waitForTimeout(300);
  await realisticNames(page);
  await shot(page, "02-scheda-ex-allievo", await panelClip(page));

  // Registra il pagamento della penale: il saldo scende di 30 €.
  await panel
    .getByTestId("former-lesson-row")
    .filter({ hasText: "Penale annullamento" })
    .getByTestId("former-mark-paid")
    .click();
  await expect(panel.getByTestId("former-panel-balance")).toContainText("90,00", { timeout: 30_000 });
  await expect(panel.getByTestId("former-lesson-row")).toHaveCount(2);
  await panel.getByRole("button", { name: /Tutte/ }).click();
  await expect(panel.getByTestId("former-lesson-row").filter({ hasText: "Penale annullamento" })).toContainText("Pagata");
  await realisticNames(page);
  await shot(page, "03-scheda-pagamento-registrato", await panelClip(page));
  await page.getByRole("button", { name: "Chiudi" }).click();
  await expect(rowOf(page, "Giulia Ferrari")).toContainText("90,00", { timeout: 30_000 });
});

test("«Assegna nome» per chi l'ha perso", async ({ page }) => {
  await openExTab(page);
  await rowOf(page, "Rimosso dall'ufficio")
    .filter({ hasText: "Ex allievo senza nome" })
    .getByTestId("former-assign-name-link")
    .click();
  const panel = page.getByTestId("former-student-panel");
  const input = panel.getByTestId("former-assign-name-input");
  await expect(input).toBeFocused({ timeout: 30_000 });
  await input.fill("Sara Conti");
  await page.waitForTimeout(200);
  await realisticNames(page);
  const box = await panelClip(page);
  if (box) await shot(page, "04-assegna-nome", { ...box, height: Math.min(box.height, 760) });
  await panel.getByTestId("former-assign-name-save").click();
  await expect(panel.getByTestId("former-panel-name")).toHaveText("Sara Conti", { timeout: 30_000 });
  await page.getByRole("button", { name: "Chiudi" }).click();
  await expect(rowOf(page, "Sara Conti")).toContainText("Rimosso dall'ufficio", { timeout: 30_000 });
  await expect(rowOf(page, "Ex allievo senza nome")).toHaveCount(1);
});

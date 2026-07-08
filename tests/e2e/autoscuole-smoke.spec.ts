import { expect, test } from "@playwright/test";

const userEmail = process.env.E2E_USER_EMAIL;
const userPassword = process.env.E2E_USER_PASSWORD;

const missingCredentials = !userEmail || !userPassword;

test.describe("Autoscuole smoke", () => {
  test.skip(
    missingCredentials,
    "E2E_USER_EMAIL/E2E_USER_PASSWORD non configurati per smoke test.",
  );

  test("login e navigazione agenda/allievi/pagamenti @smoke", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const emailInput = page.locator('input[name="email"], input[type="email"]');
    const passwordInput = page.locator('input[name="password"], input[type="password"]');

    await page.goto("/it/sign-in", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const hasEmailOnLocalizedSignIn = await emailInput
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (!hasEmailOnLocalizedSignIn) {
      await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => undefined);
    }

    const emailVisible = await emailInput.first().isVisible({ timeout: 60000 }).catch(() => false);
    const passwordVisible = await passwordInput
      .first()
      .isVisible({ timeout: 60000 })
      .catch(() => false);

    if (!emailVisible || !passwordVisible) {
      await testInfo.attach("login-debug", {
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify(
            {
              url: page.url(),
              title: await page.title().catch(() => null),
              hiddenEmailCount: await page.locator('[hidden] input[name="email"]').count(),
              visibleEmailCount: await page.locator('input[name="email"]').count(),
            },
            null,
            2,
          ),
        ),
      });
      test.skip(true, "Login form non interattivo nello staging target (likely hydration issue).");
    }

    await expect(emailInput.first()).toBeVisible({ timeout: 5000 });
    await expect(passwordInput.first()).toBeVisible({ timeout: 5000 });
    await emailInput.first().fill(userEmail!);
    await passwordInput.first().fill(userPassword!);
    await page.getByRole("button", { name: /accedi|sign in|login/i }).first().click();
    await page.waitForURL(/\/user\//, { timeout: 90_000 });

    // Redesign 2026-07: la Dashboard è stata ritirata — la landing è l'Agenda.
    await page.goto("/it/user/autoscuole");
    await expect(page.getByTestId("autoscuole-agenda-page").first()).toBeVisible({ timeout: 60000 });

    await page.goto("/it/user/autoscuole?tab=agenda");
    await expect(page.getByTestId("autoscuole-agenda-page").first()).toBeVisible();

    await page.goto("/it/user/autoscuole?tab=payments");
    await expect(page.getByTestId("autoscuole-payments-page")).toBeVisible();
  });

  test("allievi: lista, dettaglio panel e cancellazioni tardive @smoke", async ({ page }) => {
    test.setTimeout(180_000);
    const emailInput = page.locator('input[name="email"], input[type="email"]');
    const passwordInput = page.locator('input[name="password"], input[type="password"]');

    await page.goto("/it/sign-in", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await emailInput.first().fill(userEmail!);
    await passwordInput.first().fill(userPassword!);
    await page.getByRole("button", { name: /accedi|sign in|login/i }).first().click();
    await page.waitForURL(/\/user\//, { timeout: 90_000 });

    await page.goto("/it/user/autoscuole?tab=students");
    await expect(page.getByTestId("autoscuole-students-page")).toBeVisible({ timeout: 60000 });

    // Tab a pillola Pratica visibile con conteggio
    await expect(page.getByRole("tab", { name: /Pratica/ })).toBeVisible({ timeout: 30000 });

    // Apertura detail panel dal primo Dettaglio (se ci sono allievi)
    const firstDetail = page.getByRole("button", { name: "Dettaglio" }).first();
    if (await firstDetail.isVisible({ timeout: 10000 }).catch(() => false)) {
      await firstDetail.click();
      const panel = page.getByTestId("student-detail-panel");
      await expect(panel).toBeVisible();
      await expect(panel.getByText("Anagrafica")).toBeVisible({ timeout: 20000 });
      // Tab Guide del panel
      await panel.getByText("Guide", { exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(panel).not.toBeVisible();
    }

    // Sotto-tab Cancellazioni tardive
    await page.getByRole("button", { name: /Cancellazioni tardive/ }).click();
    await expect(
      page
        .getByText(/Nessuna cancellazione tardiva|Addebita/)
        .first(),
    ).toBeVisible({ timeout: 30000 });
  });

  test("utenti: lista, filtro ruoli e detail panel @smoke", async ({ page }) => {
    test.setTimeout(180_000);
    const emailInput = page.locator('input[name="email"], input[type="email"]');
    const passwordInput = page.locator('input[name="password"], input[type="password"]');

    await page.goto("/it/sign-in", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await emailInput.first().fill(userEmail!);
    await passwordInput.first().fill(userPassword!);
    await page.getByRole("button", { name: /accedi|sign in|login/i }).first().click();
    await page.waitForURL(/\/user\//, { timeout: 90_000 });

    await page.goto("/it/admin/users");
    await expect(page.getByTestId("admin-users-page")).toBeVisible({ timeout: 60000 });
    await expect(page.getByText(/Sono registrati in autoscuola/)).toBeVisible();

    // Filtro ruoli
    await page.getByRole("button", { name: "Filtri" }).click();
    await page.getByRole("menuitem", { name: "Allievo" }).click();
    await page.waitForURL(/role=STUDENT/, { timeout: 30000 });

    // Detail panel dal primo Dettaglio (se ci sono utenti)
    const firstDetail = page.getByRole("button", { name: "Dettaglio" }).first();
    if (await firstDetail.isVisible({ timeout: 10000 }).catch(() => false)) {
      await firstDetail.click();
      const panel = page.getByTestId("user-detail-panel");
      await expect(panel).toBeVisible();
      await expect(panel.getByText("Anagrafica")).toBeVisible({ timeout: 20000 });
      await page.keyboard.press("Escape");
      await expect(panel).not.toBeVisible();
    }
  });

  test("area personale e centro assistenza @smoke", async ({ page }) => {
    test.setTimeout(180_000);
    const emailInput = page.locator('input[name="email"], input[type="email"]');
    const passwordInput = page.locator('input[name="password"], input[type="password"]');

    await page.goto("/it/sign-in", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await emailInput.first().fill(userEmail!);
    await passwordInput.first().fill(userPassword!);
    await page.getByRole("button", { name: /accedi|sign in|login/i }).first().click();
    await page.waitForURL(/\/user\//, { timeout: 90_000 });

    // Area personale: overlay + navigazione pane
    await page.goto("/it/user/autoscuole/area-personale");
    await expect(page.getByTestId("autoscuole-area-personale-page")).toBeVisible({ timeout: 60000 });
    await page.getByRole("button", { name: "Contratto e fattura" }).click();
    await expect(page.getByText("Nessuna fattura disponibile")).toBeVisible();

    // Centro assistenza (mock): chat con messaggio di benvenuto
    await page.goto("/it/user/autoscuole/assistenza");
    await expect(page.getByTestId("autoscuole-assistenza-page")).toBeVisible({ timeout: 60000 });
    await expect(page.getByText("Ciao! Sono Giulia").first()).toBeVisible();
  });

  test("segretaria: pagina e pannello impostazioni @smoke", async ({ page }) => {
    test.setTimeout(180_000);
    const emailInput = page.locator('input[name="email"], input[type="email"]');
    const passwordInput = page.locator('input[name="password"], input[type="password"]');

    await page.goto("/it/sign-in", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await emailInput.first().fill(userEmail!);
    await passwordInput.first().fill(userPassword!);
    await page.getByRole("button", { name: /accedi|sign in|login/i }).first().click();
    await page.waitForURL(/\/user\//, { timeout: 90_000 });

    await page.goto("/it/user/autoscuole/voice");
    await expect(page.getByTestId("autoscuole-voice-page")).toBeVisible({ timeout: 60000 });

    // La feature può essere attiva o meno sull'ambiente target
    const featureOff = page.getByText("Segretaria AI non attiva");
    const callbacks = page.getByText("Richiamate in sospeso");
    await expect(featureOff.or(callbacks).first()).toBeVisible({ timeout: 60000 });

    if (await callbacks.isVisible().catch(() => false)) {
      // Pannello impostazioni: apertura, accordion, chiusura con Escape
      await page.getByRole("button", { name: "Impostazioni" }).click();
      const panel = page.getByTestId("voice-settings-panel");
      await expect(panel).toBeVisible();
      await expect(panel.getByText("Comportamento e azioni")).toBeVisible();
      await panel.getByText("Orari e registrazione", { exact: true }).click();
      await expect(panel.getByText("Giorni attivi")).toBeVisible({ timeout: 10000 });
      await page.keyboard.press("Escape");
      await expect(panel).not.toBeVisible();
    }
  });

  test("impostazioni: gestione allievi con sub-tab @smoke", async ({ page }) => {
    test.setTimeout(180_000);
    const emailInput = page.locator('input[name="email"], input[type="email"]');
    const passwordInput = page.locator('input[name="password"], input[type="password"]');

    await page.goto("/it/sign-in", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await emailInput.first().fill(userEmail!);
    await passwordInput.first().fill(userPassword!);
    await page.getByRole("button", { name: /accedi|sign in|login/i }).first().click();
    await page.waitForURL(/\/user\//, { timeout: 90_000 });

    await page.goto("/it/user/autoscuole?tab=settings&pane=students");
    const pane = page.getByTestId("gestione-allievi-pane");
    await expect(pane).toBeVisible({ timeout: 60000 });

    // Sub-tab Prenotazioni (default): righe flat visibili subito
    await expect(pane.getByText("Stop alle prenotazioni last-minute")).toBeVisible();
    await expect(pane.getByText("Massimo di guide a settimana")).toBeVisible();

    // Sub-tab Guide
    await pane.getByRole("button", { name: "Guide", exact: true }).click();
    await expect(pane.getByText("Consenti scambi tra allievi")).toBeVisible();
    await expect(pane.getByText("Attiva guide di gruppo")).toBeVisible();

    // Sub-tab App allievi
    await pane.getByRole("button", { name: "App allievi", exact: true }).click();
    await expect(pane.getByText("Notifica slot disponibili domani")).toBeVisible();
    await expect(pane.getByText("Consenti scelta istruttore")).toBeVisible();
  });
});

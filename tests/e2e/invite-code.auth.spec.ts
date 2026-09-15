import { test, expect } from "@playwright/test";

/**
 * REG-407 — dialog "Chiave di accesso" nella sezione Allievi.
 * Owner seeded (titolare@reglo.it): apre il dialog, verifica struttura del
 * prototipo, il Copia e che il PDF QR sia servito e scaricabile.
 */
test.describe("Allievi — chiave di accesso", () => {
  test("dialog: codice, copia e PDF QR @students", async ({ page, context }) => {
    test.setTimeout(120_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/it/user/autoscuole?tab=students");

    const trigger = page.getByTitle("Chiave di accesso");
    await expect(async () => {
      await trigger.click();
      await expect(page.getByTestId("invite-code-dialog")).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 60_000 });

    const dialog = page.getByTestId("invite-code-dialog");
    await expect(dialog.getByRole("heading", { name: "Chiave di accesso" })).toBeVisible();
    await expect(dialog.getByText("QR per gli allievi")).toBeVisible();
    await expect(dialog.getByText("Note sulla distribuzione")).toBeVisible();

    const code = (await dialog.getByTestId("invite-code-value").textContent())?.trim();
    expect(code).toBeTruthy();
    await dialog.getByRole("button", { name: "Copia" }).first().click();
    await expect(dialog.getByRole("button", { name: "Copiato ✓" }).first()).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);

    const pdfLink = dialog.getByRole("link", { name: "PDF", exact: true });
    await expect(pdfLink).toHaveAttribute("download", "Reglo - Scarica l'app.pdf");
    const res = await page.request.get((await pdfLink.getAttribute("href"))!);
    expect(res.ok()).toBeTruthy();
    expect(res.headers()["content-type"]).toContain("application/pdf");

    const downloadPromise = page.waitForEvent("download");
    await pdfLink.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("Reglo - Scarica l'app.pdf");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});

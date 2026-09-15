import { test, expect } from "@playwright/test";

/**
 * Menu hamburger → Novità (REG-453): la voce "Pagellino personalizzabile" è la
 * più recente, apre il dialog del prototipo e la CTA porta al pane Pagellino.
 */
test.describe("Novità — pagellino", () => {
  test("voce nel menu, dialog e CTA verso il pagellino @novita", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/it/user/autoscuole?tab=students");

    const item = page.getByRole("menuitem", { name: "Pagellino personalizzabile" });
    await expect(async () => {
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Menu" }).click();
      await expect(item).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 60_000 });

    // In cima alla timeline c'è la voce più recente (card QR, REG-451), poi il pagellino.
    const entries = page.getByRole("menuitem").filter({ hasText: /Card QR dell'istruttore|Pagellino personalizzabile|Foto e firme digitali/ });
    await expect(entries.nth(0)).toHaveText("Card QR dell'istruttore");
    await expect(entries.nth(1)).toHaveText("Pagellino personalizzabile");

    await item.click();
    const dialog = page.getByTestId("novita-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("13 settembre 2026")).toBeVisible();
    await expect(dialog.getByText("Il pagellino è tuo")).toBeVisible();
    await expect(dialog.getByText("Come si configura")).toBeVisible();
    const cover = dialog.locator("img");
    await expect(cover).toHaveAttribute("src", "/images/novita/pagellino.jpg");
    await expect.poll(() => cover.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

    await dialog.getByRole("button", { name: "Vai al pagellino" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/tab=settings&pane=evaluation/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Pagellino" }).first()).toBeVisible({ timeout: 60_000 });
  });

  test("card QR dell'istruttore: dialog e CTA verso gli istruttori @novita", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/it/user/autoscuole?tab=students");
    const item = page.getByRole("menuitem", { name: "Card QR dell'istruttore" });
    await expect(async () => {
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Menu" }).click();
      await expect(item).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 60_000 });
    await item.click();
    const dialog = page.getByTestId("novita-dialog");
    await expect(dialog.getByText("Card QR dell'istruttore")).toBeVisible();
    await expect(dialog.getByText("Ispirazioni da grande schermo 🍿")).toBeVisible();
    await expect(dialog.locator("img")).toHaveCount(7);
    await dialog.getByRole("button", { name: "Vai agli istruttori" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/tab=settings&pane=instructors/, { timeout: 60_000 });
    await expect(page.getByTestId("instructors-pane")).toBeVisible({ timeout: 60_000 });
  });
});

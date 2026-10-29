import { expect, test } from "@playwright/test";

/**
 * REG-651 Reglo Road — Impostazioni › Reglo Road › «Il giro»: i due
 * interruttori si salvano al tocco e restano dopo un reload; con il giro
 * spento gli avvisi non si toccano. Alla fine tutto torna acceso.
 */

test.setTimeout(150_000);

const toggle = (page: import("@playwright/test").Page, id: string) => page.getByTestId(id).getByRole("switch");

test("giro: interruttori in Impostazioni › Reglo Road", async ({ page }) => {
  await page.goto("/it/user/autoscuole?tab=settings&pane=road");
  const box = page.getByTestId("road-plan-settings").first();
  await expect(box).toBeVisible({ timeout: 60_000 });
  const plan = toggle(page, "road-plan-toggle");
  const alerts = toggle(page, "road-plan-alerts-toggle");
  await expect(plan).toBeVisible({ timeout: 30_000 });

  // Si parte da acceso (default o lasciato acceso da un giro precedente).
  if ((await plan.getAttribute("aria-checked")) === "false") {
    await plan.click();
    await expect(plan).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
  }
  if ((await alerts.getAttribute("aria-checked")) === "false") {
    await alerts.click();
    await expect(alerts).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
  }

  try {
    // Avvisi spenti: salvati davvero.
    await alerts.click();
    await expect(alerts).toHaveAttribute("aria-checked", "false", { timeout: 30_000 });
    await page.reload();
    await expect(toggle(page, "road-plan-alerts-toggle")).toHaveAttribute("aria-checked", "false", { timeout: 60_000 });

    // Giro spento: gli avvisi non si toccano.
    await toggle(page, "road-plan-toggle").click();
    await expect(toggle(page, "road-plan-toggle")).toHaveAttribute("aria-checked", "false", { timeout: 30_000 });
    await expect(toggle(page, "road-plan-alerts-toggle")).toBeDisabled();
  } finally {
    // Tutto di nuovo acceso.
    await page.reload();
    const p = toggle(page, "road-plan-toggle");
    await expect(p).toBeVisible({ timeout: 60_000 });
    if ((await p.getAttribute("aria-checked")) === "false") {
      await p.click();
      await expect(p).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
    }
    const a = toggle(page, "road-plan-alerts-toggle");
    await expect(a).toBeEnabled({ timeout: 30_000 });
    if ((await a.getAttribute("aria-checked")) === "false") {
      await a.click();
      await expect(a).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
    }
  }
});

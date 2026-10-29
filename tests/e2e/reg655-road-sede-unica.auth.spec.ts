import { expect, test } from "@playwright/test";

/**
 * REG-655 Reglo Road — la sede è una sola: la mappa live ha come `base` solo la
 * sede vera (`isDefault`) e gli altri luoghi a parte in `places`;
 * `/road/headquarters` dice se la sede manca. Su staging «Autoscuola Reglo» ha
 * la sede con le coordinate e un luogo in più («Piazzale Lotto»).
 */

test.setTimeout(90_000);

test("sede unica: base, places e stato della sede", async ({ page }) => {
  await page.goto("/it/user/autoscuole?tab=road");
  const api = (path: string) =>
    page.evaluate(async (p) => (await fetch(`/api/autoscuole/road${p}`, { cache: "no-store" })).json(), path);

  const status = await api("/headquarters");
  expect(status.success).toBe(true);
  expect(status.data).toMatchObject({ roadEnabled: true, missing: false, canEdit: true });

  const live = await api("/live");
  expect(live.success).toBe(true);
  const { base, places } = live.data as {
    base: { name: string; lat: number; lng: number } | null;
    places: Array<{ id: string; name: string; lat: number; lng: number }>;
  };
  expect(base).not.toBeNull();
  expect(Array.isArray(places)).toBe(true);
  // La sede non compare anche fra i luoghi.
  expect(places.some((p) => p.name === base!.name && p.lat === base!.lat && p.lng === base!.lng)).toBe(false);
  for (const p of places) expect(typeof p.lat === "number" && typeof p.lng === "number").toBe(true);
});

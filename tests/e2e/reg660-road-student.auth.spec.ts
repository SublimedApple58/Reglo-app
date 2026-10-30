import { expect, test } from "@playwright/test";

/**
 * REG-660 Reglo Road — `GET /road/students/[id]` per il foglio «Road di
 * <allievo>» dell'app: oltre a guide e briefing, per ogni guida `startedAt` e
 * il pagellino `{ done, total }` (null se il pagellino è spento) e i punti
 * dell'allievo (`hotspots`, i suoi errori ripetuti). Sola lettura: prende
 * l'allievo di una guida già nello storico di staging.
 */

test.setTimeout(90_000);

type Item = { appointmentId: string; startedAt: string; evaluation: { done: number; total: number } | null; thumb: unknown[] };

test("dati Road dell'allievo: guide con data e pagellino, punti da migliorare", async ({ page }) => {
  await page.goto("/it/user/autoscuole/road?view=history");
  const history = await page.evaluate(async () => (await fetch("/api/autoscuole/road/history?limit=20", { cache: "no-store" })).json());
  const studentId = (history.data?.items ?? []).find((i: { lesson?: { student?: { id?: string } | null } }) => i.lesson?.student?.id)
    ?.lesson.student.id as string | undefined;
  test.skip(!studentId, "Nessuna guida Road nello storico");

  const res = await page.evaluate(
    async (id) => (await fetch(`/api/autoscuole/road/students/${id}`, { cache: "no-store" })).json(),
    studentId,
  );
  expect(res.success).toBe(true);
  const items = res.data.items as Item[];
  expect(items.length).toBeGreaterThan(0);
  for (const it of items) {
    expect(Number.isNaN(Date.parse(it.startedAt))).toBe(false);
    expect("evaluation" in it).toBe(true);
    if (it.evaluation) {
      expect(it.evaluation.total).toBeGreaterThan(0);
      expect(it.evaluation.done).toBeGreaterThanOrEqual(0);
      expect(it.evaluation.done).toBeLessThanOrEqual(it.evaluation.total);
    }
  }
  // Dalla più recente.
  const times = items.map((i) => Date.parse(i.startedAt));
  expect([...times].sort((a, b) => b - a)).toEqual(times);

  expect(Array.isArray(res.data.hotspots)).toBe(true);
  for (const h of res.data.hotspots as Array<{ key: string; errors: number; sessions: number }>) {
    expect(typeof h.key).toBe("string");
    expect(h.sessions).toBeGreaterThanOrEqual(2);
    expect(h.errors).toBeGreaterThanOrEqual(h.sessions);
  }
});

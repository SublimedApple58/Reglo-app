import { expect, test } from "@playwright/test";

/**
 * REG-641 Reglo Road — API dei percorsi d'esame (titolare, cookie web).
 * Crea un percorso, lo ritrova, lo modifica (linea semplificata e lunghezza
 * ricalcolate dal server), lo archivia: esce dalla lista ma resta fra gli
 * archiviati. Serve Road acceso sull'autoscuola del titolare e2e.
 */

test.setTimeout(120_000);

// Strada dritta verso nord: un punto ogni ~11 m per ~1,1 km.
const straight = Array.from({ length: 101 }, (_, i) => [45.07 + i * 0.0001, 7.68]);

test("percorsi d'esame: crea, modifica, archivia", async ({ page }) => {
  const api = page.request;
  const name = `E2E percorso ${Date.now()}`;

  const created = await api.post("/api/autoscuole/road/exam-routes", {
    data: { name, examSite: "Motorizzazione di Torino", licenseCategories: ["b"], waypoints: [straight[0], straight[100]], path: straight },
  });
  const c = await created.json();
  expect(c.success, c.message).toBe(true);
  expect(c.data.licenseCategories).toEqual(["B"]);
  expect(c.data.path).toHaveLength(2);
  expect(c.data.lengthMeters).toBeGreaterThan(1100);
  const id = c.data.id as string;

  try {
    const list = await (await api.get("/api/autoscuole/road/exam-routes")).json();
    expect(list.success).toBe(true);
    expect(list.data.map((r: { id: string }) => r.id)).toContain(id);

    const bad = await (await api.patch(`/api/autoscuole/road/exam-routes/${id}`, { data: { name: "  " } })).json();
    expect(bad).toMatchObject({ success: false, code: "INVALID" });

    const patched = await (await api.patch(`/api/autoscuole/road/exam-routes/${id}`, { data: { name: `${name} bis`, examSite: "" } })).json();
    expect(patched.success).toBe(true);
    expect(patched.data).toMatchObject({ name: `${name} bis`, examSite: null, lengthMeters: c.data.lengthMeters });
  } finally {
    const archived = await (await api.delete(`/api/autoscuole/road/exam-routes/${id}`)).json();
    expect(archived).toEqual({ success: true, data: { archived: true } });
  }

  const after = await (await api.get("/api/autoscuole/road/exam-routes")).json();
  expect(after.data.map((r: { id: string }) => r.id)).not.toContain(id);
  const withArchived = await (await api.get("/api/autoscuole/road/exam-routes?archived=1")).json();
  const row = withArchived.data.find((r: { id: string }) => r.id === id);
  expect(row?.archivedAt).toBeTruthy();

  const again = await (await api.delete(`/api/autoscuole/road/exam-routes/${id}`)).json();
  expect(again).toMatchObject({ success: false, code: "NOT_FOUND" });
});

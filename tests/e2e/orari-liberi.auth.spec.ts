import { test, expect } from "@playwright/test";

/**
 * Orari spezzati (Ricca, punto 5) — lo staff prenota, sposta e blocca a
 * minuti liberi (es. 14:50), non solo a quarti d'ora.
 *
 * Gira loggato come il titolare del seed (titolare@reglo.it). Richiede il seed
 * dev: `pnpm seed:e2e:dev`. Passa dalle API reali (le stesse server action di
 * web e app), poi controlla il campo «Scrivi un orario» del TimePickerInput
 * nel form della guida.
 */

/** Giorno di lavoro lontano, per non incrociare dati veri o festività vicine. */
const testDay = () => {
  const d = new Date();
  d.setDate(d.getDate() + 52);
  d.setHours(0, 0, 0, 0);
  // Porta a giovedì: evita weekend e il giorno usato da lesson-buffer.
  d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7));
  return d;
};

const at = (day: Date, hours: number, minutes: number) => {
  const d = new Date(day);
  d.setHours(hours, minutes, 0, 0);
  return d;
};

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  });

type Appointment = { id: string; startsAt: string; endsAt: string | null };

test.describe("Orari spezzati per lo staff", () => {
  test("guida alle 14:50, spostata alle 15:05, blocco 16:10–16:35 @orari-liberi", async ({ page }) => {
    test.setTimeout(180_000);
    const api = page.request;
    const day = testDay();
    const windowStart = at(day, 8, 0);
    const windowEnd = at(day, 20, 0);
    const createdAppointments: string[] = [];
    const createdBlocks: string[] = [];

    try {
      const bootstrapRes = await api.get("/api/autoscuole/agenda/bootstrap", {
        params: { from: windowStart.toISOString(), to: windowEnd.toISOString() },
      });
      expect(bootstrapRes.ok(), "GET /agenda/bootstrap").toBeTruthy();
      const bootstrap = ((await bootstrapRes.json()) as {
        data: {
          appointments: Array<{ id: string }>;
          instructors: Array<{ id: string; name: string }>;
          students: Array<{ id: string; email: string | null }>;
          instructorBlocks: Array<{ id: string }>;
        };
      }).data;
      const instructorName = process.env.E2E_INSTRUCTOR_NAME || "Istruttore E2E";
      const instructor =
        bootstrap.instructors.find((i) => i.name === instructorName) ?? bootstrap.instructors[0];
      const student = bootstrap.students.find((s) => s.email === "allievo@reglo.it");
      expect(instructor, "almeno un istruttore in autoscuola").toBeTruthy();
      expect(student, "allievo del seed (allievo@reglo.it)").toBeTruthy();

      // Residui di run precedenti nella stessa finestra.
      for (const appt of bootstrap.appointments) {
        await api.post(`/api/autoscuole/appointments/${appt.id}/permanent-cancel`);
      }
      for (const block of bootstrap.instructorBlocks) {
        await api.delete(`/api/autoscuole/instructor-blocks/${block.id}`);
      }

      // ── 1. Guida a orario spezzato ───────────────────────────────────────
      const createRes = await api.post("/api/autoscuole/appointments", {
        data: {
          studentId: student!.id,
          instructorId: instructor!.id,
          startsAt: at(day, 14, 50).toISOString(),
          endsAt: at(day, 15, 50).toISOString(),
          vehicleId: null,
          type: "guida",
          types: ["guida"],
        },
      });
      expect(createRes.status(), await createRes.text()).toBe(200);
      const created = ((await createRes.json()) as { data: Appointment }).data;
      createdAppointments.push(created.id);
      expect(hhmm(created.startsAt)).toBe("14:50");

      // ── 2. Spostata a un altro orario spezzato ───────────────────────────
      const moveRes = await api.patch(`/api/autoscuole/appointments/${created.id}/reschedule`, {
        data: { startsAt: at(day, 15, 5).toISOString(), endsAt: at(day, 16, 5).toISOString() },
      });
      expect(moveRes.status(), await moveRes.text()).toBe(200);

      const afterRes = await api.get("/api/autoscuole/agenda/bootstrap", {
        params: { from: windowStart.toISOString(), to: windowEnd.toISOString() },
      });
      const after = ((await afterRes.json()) as { data: { appointments: Appointment[] } }).data;
      const moved = after.appointments.find((a) => a.id === created.id);
      expect(moved, "la guida spostata è in agenda").toBeTruthy();
      expect(hhmm(moved!.startsAt)).toBe("15:05");
      expect(hhmm(moved!.endsAt!)).toBe("16:05");

      // ── 3. Blocco a orari liberi ─────────────────────────────────────────
      const blockRes = await api.post("/api/autoscuole/instructor-blocks", {
        data: {
          instructorId: instructor!.id,
          startsAt: at(day, 16, 10).toISOString(),
          endsAt: at(day, 16, 35).toISOString(),
          reason: "other",
        },
      });
      expect(blockRes.status(), await blockRes.text()).toBe(200);
      const block = ((await blockRes.json()) as { data: { id: string; startsAt: string; endsAt: string } }).data;
      createdBlocks.push(block.id);
      expect(`${hhmm(block.startsAt)}–${hhmm(block.endsAt)}`).toBe("16:10–16:35");
    } finally {
      for (const id of createdAppointments) {
        await api.post(`/api/autoscuole/appointments/${id}/permanent-cancel`);
      }
      for (const id of createdBlocks) {
        await api.delete(`/api/autoscuole/instructor-blocks/${id}`);
      }
    }
  });
});

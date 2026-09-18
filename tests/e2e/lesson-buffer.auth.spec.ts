import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Pausa tra una guida e l'altra (REG-484) — e2e lato titolare.
 *
 * Gira loggato come il titolare del seed (titolare@reglo.it). Richiede il seed
 * dev: `pnpm seed:e2e:dev`.
 *
 * Passa dalle API reali (stesse server action della web app e dell'app
 * istruttore) invece di pilotare l'agenda a mano: l'oggetto del test è il
 * comportamento del backend — nasce la pausa? si ferma sull'impegno dopo?
 * scatta l'avviso quando non c'è spazio? — e guidare la griglia oraria
 * aggiungerebbe solo fragilità. Il rendering del blocco «Pausa» è coperto dal
 * test UI in fondo.
 */

const BUFFER_MINUTES = 15;
const BUFFER_REASON = "lesson_buffer";

/** Giorno di lavoro lontano, per non incrociare dati veri o festività vicine. */
const testDay = () => {
  const d = new Date();
  d.setDate(d.getDate() + 45);
  d.setHours(0, 0, 0, 0);
  // Porta a mercoledì: evita weekend e la maggior parte delle festività.
  d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7));
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

type Json = Record<string, unknown>;

const getSettings = async (api: APIRequestContext) => {
  const res = await api.get("/api/autoscuole/settings");
  expect(res.ok(), "GET /settings").toBeTruthy();
  return ((await res.json()) as { data: Json }).data;
};

const patchSettings = async (api: APIRequestContext, data: Json) => {
  const res = await api.patch("/api/autoscuole/settings", { data });
  expect(res.ok(), `PATCH /settings ${JSON.stringify(data)}`).toBeTruthy();
};

const bufferBlocks = async (api: APIRequestContext, from: Date, to: Date) => {
  const res = await api.get("/api/autoscuole/instructor-blocks", {
    params: {
      reason: BUFFER_REASON,
      from: from.toISOString(),
      to: to.toISOString(),
    },
  });
  expect(res.ok(), "GET /instructor-blocks").toBeTruthy();
  return ((await res.json()) as { data: Array<{ id: string; startsAt: string; endsAt: string }> })
    .data;
};

const bookLesson = async (
  api: APIRequestContext,
  body: {
    studentId: string;
    instructorId: string;
    startsAt: Date;
    endsAt: Date;
    confirmNoBuffer?: boolean;
  },
) =>
  api.post("/api/autoscuole/appointments", {
    data: {
      studentId: body.studentId,
      instructorId: body.instructorId,
      startsAt: body.startsAt.toISOString(),
      endsAt: body.endsAt.toISOString(),
      vehicleId: null,
      type: "guida",
      types: ["guida"],
      ...(body.confirmNoBuffer ? { confirmNoBuffer: true } : {}),
    },
  });

test.describe("Pausa tra le guide (REG-484)", () => {
  test("nasce dopo la guida, si ferma sull'impegno dopo, e avvisa quando non ci sta @lesson-buffer", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const api = page.request;
    const day = testDay();
    const windowStart = at(day, 8, 0);
    const windowEnd = at(day, 17, 0);

    const original = await getSettings(api);
    const createdAppointments: string[] = [];

    try {
      // ── Contesto: chi prenota per chi, e finestra pulita ──────────────────
      const bootstrapRes = await api.get("/api/autoscuole/agenda/bootstrap", {
        params: { from: windowStart.toISOString(), to: windowEnd.toISOString() },
      });
      expect(bootstrapRes.ok(), "GET /agenda/bootstrap").toBeTruthy();
      const bootstrap = ((await bootstrapRes.json()) as {
        data: {
          appointments: Array<{ id: string }>;
          instructors: Array<{ id: string; name: string }>;
          students: Array<{ id: string; name: string }>;
          instructorBlocks: Array<{ id: string }>;
        };
      }).data;

      const instructor = bootstrap.instructors.find((i) => i.name === "Istruttore E2E");
      const student = bootstrap.students.find((s) => s.name?.includes("Allievo E2E"));
      expect(instructor, "istruttore del seed (pnpm seed:e2e:dev)").toBeTruthy();
      expect(student, "allievo del seed (pnpm seed:e2e:dev)").toBeTruthy();

      // Residui di run precedenti nella stessa finestra.
      for (const appt of bootstrap.appointments) {
        await api.post(`/api/autoscuole/appointments/${appt.id}/permanent-cancel`);
      }
      for (const block of bootstrap.instructorBlocks) {
        await api.delete(`/api/autoscuole/instructor-blocks/${block.id}`);
      }

      await patchSettings(api, {
        lessonBufferEnabled: true,
        lessonBufferMinutes: BUFFER_MINUTES,
      });

      // ── 1. La guida lascia la sua pausa ───────────────────────────────────
      const aStart = at(day, 10, 0);
      const aEnd = at(day, 11, 0);
      const aRes = await bookLesson(api, {
        studentId: student!.id,
        instructorId: instructor!.id,
        startsAt: aStart,
        endsAt: aEnd,
      });
      expect(aRes.status(), await aRes.text()).toBe(200);
      createdAppointments.push(((await aRes.json()) as { data: { id: string } }).data.id);

      let blocks = await bufferBlocks(api, windowStart, windowEnd);
      expect(blocks).toHaveLength(1);
      expect(hhmm(blocks[0].startsAt)).toBe("11:00");
      expect(hhmm(blocks[0].endsAt)).toBe("11:15");

      // ── 2. Dentro la pausa non si prenota ─────────────────────────────────
      const insideBuffer = await bookLesson(api, {
        studentId: student!.id,
        instructorId: instructor!.id,
        startsAt: at(day, 11, 0),
        endsAt: at(day, 11, 30),
      });
      expect(insideBuffer.status()).toBe(400);
      expect(await insideBuffer.text()).toContain("slot bloccato");

      // ── 3. Una guida più in là: anche lei lascia la sua pausa ─────────────
      const cRes = await bookLesson(api, {
        studentId: student!.id,
        instructorId: instructor!.id,
        startsAt: at(day, 12, 15),
        endsAt: at(day, 13, 15),
      });
      expect(cRes.status(), await cRes.text()).toBe(200);
      createdAppointments.push(((await cRes.json()) as { data: { id: string } }).data.id);

      blocks = await bufferBlocks(api, windowStart, windowEnd);
      expect(blocks.map((b) => `${hhmm(b.startsAt)}–${hhmm(b.endsAt)}`)).toEqual([
        "11:00–11:15",
        "13:15–13:30",
      ]);

      // ── 4. La guida che riempie ESATTAMENTE il buco → avviso ──────────────
      // 11:15 (fine pausa di A) → 12:15 (inizio di C): un'ora netta, dopo la
      // quale non resta un minuto per la pausa.
      const bStart = at(day, 11, 15);
      const bEnd = at(day, 12, 15);
      const bRes = await bookLesson(api, {
        studentId: student!.id,
        instructorId: instructor!.id,
        startsAt: bStart,
        endsAt: bEnd,
      });
      expect(bRes.status()).toBe(400);
      const bBody = (await bRes.json()) as { code?: string; message?: string };
      expect(bBody.code).toBe("LESSON_BUFFER_CONFIRM");
      expect(bBody.message).toContain("Non avrai tempo per una pausa");

      // La guida NON è stata creata: l'avviso viene prima di scrivere.
      const afterWarning = await bufferBlocks(api, windowStart, windowEnd);
      expect(afterWarning).toHaveLength(2);

      // ── 5. "Procedi comunque" → la guida nasce, senza pausa ───────────────
      const bConfirmed = await bookLesson(api, {
        studentId: student!.id,
        instructorId: instructor!.id,
        startsAt: bStart,
        endsAt: bEnd,
        confirmNoBuffer: true,
      });
      expect(bConfirmed.status(), await bConfirmed.text()).toBe(200);
      createdAppointments.push(
        ((await bConfirmed.json()) as { data: { id: string } }).data.id,
      );

      blocks = await bufferBlocks(api, windowStart, windowEnd);
      expect(
        blocks.map((b) => `${hhmm(b.startsAt)}–${hhmm(b.endsAt)}`),
        "nessuna pausa sopra la guida delle 12:15",
      ).toEqual(["11:00–11:15", "13:15–13:30"]);

      // ── 6. Pausa troncata quando lo spazio è parziale ─────────────────────
      // 14:00–15:00 con un impegno alle 15:05: la pausa nasce di 5', non 15'.
      const blockRes = await api.post("/api/autoscuole/instructor-blocks", {
        data: {
          instructorId: instructor!.id,
          startsAt: at(day, 15, 5).toISOString(),
          endsAt: at(day, 16, 0).toISOString(),
          reason: "Impegno E2E",
        },
      });
      expect(blockRes.status(), await blockRes.text()).toBe(200);

      const dRes = await bookLesson(api, {
        studentId: student!.id,
        instructorId: instructor!.id,
        startsAt: at(day, 14, 0),
        endsAt: at(day, 15, 0),
      });
      expect(dRes.status(), await dRes.text()).toBe(200);
      createdAppointments.push(((await dRes.json()) as { data: { id: string } }).data.id);

      blocks = await bufferBlocks(api, windowStart, windowEnd);
      expect(blocks.map((b) => `${hhmm(b.startsAt)}–${hhmm(b.endsAt)}`)).toContain(
        "15:00–15:05",
      );

      // ── 7. Il blocco «Pausa» si legge in agenda ───────────────────────────
      const isoDay = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      await page.goto(`/it/user/autoscuole?tab=agenda&day=${isoDay}`);
      await expect(page.getByTestId("autoscuole-agenda-page").first()).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByText("Pausa", { exact: true }).first()).toBeVisible({
        timeout: 30_000,
      });

      // ── 8. Setting spento → nessuna pausa nuova ───────────────────────────
      await patchSettings(api, { lessonBufferEnabled: false });
      const before = (await bufferBlocks(api, windowStart, windowEnd)).length;
      const offRes = await bookLesson(api, {
        studentId: student!.id,
        instructorId: instructor!.id,
        startsAt: at(day, 8, 30),
        endsAt: at(day, 9, 30),
      });
      expect(offRes.status(), await offRes.text()).toBe(200);
      createdAppointments.push(((await offRes.json()) as { data: { id: string } }).data.id);
      expect(await bufferBlocks(api, windowStart, windowEnd)).toHaveLength(before);
    } finally {
      // Pulizia: la finestra torna come l'abbiamo trovata.
      for (const id of createdAppointments) {
        await api.post(`/api/autoscuole/appointments/${id}/permanent-cancel`);
      }
      const leftoverRes = await api.get("/api/autoscuole/instructor-blocks", {
        params: { from: windowStart.toISOString(), to: windowEnd.toISOString() },
      });
      if (leftoverRes.ok()) {
        const leftover = ((await leftoverRes.json()) as { data: Array<{ id: string }> }).data;
        for (const block of leftover) {
          await api.delete(`/api/autoscuole/instructor-blocks/${block.id}`);
        }
      }
      await patchSettings(api, {
        lessonBufferEnabled: original.lessonBufferEnabled === true,
        lessonBufferMinutes:
          typeof original.lessonBufferMinutes === "number"
            ? original.lessonBufferMinutes
            : BUFFER_MINUTES,
      });
    }
  });
});

import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Luogo delle guide di GRUPPO (REG-409, follow-up) — e2e lato titolare.
 *
 * Gira loggato come il titolare del seed (titolare@reglo.it). Richiede il seed
 * dev: `pnpm seed:e2e:dev`.
 *
 * Passa dalle API reali invece di pilotare il dialog: l'oggetto del test è il
 * giro completo — il luogo si risolve alla creazione, finisce sul container,
 * si copia sui posti e si rilegge dall'agenda. La precedenza in sé (default
 * allievi concordi → patente → sede, con le regole sui conflitti) è coperta
 * dai test unitari di `resolveGroupPrefilledLocationId`, che non hanno bisogno
 * di un database.
 */

const MOTO_CATEGORIES = ["AM", "A1", "A2", "A"];

/** Giorno di lavoro lontano, per non incrociare dati veri. */
const testDay = () => {
  const d = new Date();
  d.setDate(d.getDate() + 46);
  d.setHours(0, 0, 0, 0);
  // Porta a giovedì: evita weekend e la finestra usata dal test della pausa.
  d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7));
  return d;
};

const at = (day: Date, hours: number) => {
  const d = new Date(day);
  d.setHours(hours, 0, 0, 0);
  return d;
};

type LocationRow = {
  id: string;
  name: string;
  isDefault: boolean;
  licenseCategories?: string[] | null;
};

type VehicleRow = {
  id: string;
  name: string;
  licenseCategory: string | null;
  status?: string | null;
  assignedInstructorId?: string | null;
};

type AgendaRow = {
  id: string;
  type: string;
  groupLessonId: string | null;
  locationId: string | null;
  location: { id: string; name: string } | null;
};

const getLocations = async (api: APIRequestContext) => {
  const res = await api.get("/api/autoscuole/locations");
  expect(res.ok(), "GET /locations").toBeTruthy();
  return ((await res.json()) as { data: LocationRow[] }).data;
};

const agendaRows = async (api: APIRequestContext, from: Date, to: Date) => {
  const res = await api.get("/api/autoscuole/agenda/bootstrap", {
    params: { from: from.toISOString(), to: to.toISOString() },
  });
  expect(res.ok(), "GET /agenda/bootstrap").toBeTruthy();
  return (await res.json()) as {
    data: {
      appointments: AgendaRow[];
      instructors: Array<{ id: string; name: string }>;
      students: Array<{ id: string; email: string | null }>;
      vehicles: VehicleRow[];
    };
  };
};

const createGroupLesson = async (api: APIRequestContext, body: Record<string, unknown>) => {
  const res = await api.post("/api/autoscuole/group-lessons", { data: body });
  const json = (await res.json()) as {
    success?: boolean;
    message?: string;
    data?: { groupLessonId: string };
  };
  expect(json.success, `POST /group-lessons → ${json.message ?? "errore"}`).toBeTruthy();
  return json.data!.groupLessonId;
};

/** La riga d'agenda del container: il posto dell'allievo, o il segnaposto `gl-empty:`. */
const rowForGroupLesson = (rows: AgendaRow[], groupLessonId: string) =>
  rows.find((r) => r.groupLessonId === groupLessonId) ??
  rows.find((r) => r.id === `gl-empty:${groupLessonId}`);

test.describe("Luogo delle guide di gruppo (REG-409)", () => {
  test("si risolve dalla patente, si copia sui posti, resta se scelto a mano @group-lesson-location", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const api = page.request;
    const day = testDay();
    const windowStart = at(day, 8);
    const windowEnd = at(day, 20);

    const createdGroupLessons: string[] = [];

    try {
      const locations = await getLocations(api);
      const sede = locations.find((l) => l.isDefault);
      expect(sede, "l'autoscuola ha una sede").toBeTruthy();

      const hasCategory = (loc: LocationRow, category: string) =>
        (loc.licenseCategories ?? []).some(
          (c) => c.trim().toUpperCase() === category.toUpperCase(),
        );

      const bootstrap = await agendaRows(api, windowStart, windowEnd);
      const instructor = bootstrap.data.instructors[0];
      expect(instructor, "almeno un istruttore in autoscuola").toBeTruthy();

      // Veicoli SENZA istruttore assegnato: sono usabili da chiunque, quindi il
      // test non dipende da come è configurata l'esclusività nel seed.
      const openVehicles = bootstrap.data.vehicles.filter(
        (v) => (v.status ?? "active") === "active" && !v.assignedInstructorId,
      );
      const car = openVehicles.find((v) => v.licenseCategory === "B");
      const motos = openVehicles.filter((v) =>
        MOTO_CATEGORIES.includes(v.licenseCategory ?? ""),
      );
      expect(car, "un'auto di categoria B libera da esclusività").toBeTruthy();
      expect(motos.length, "almeno una moto libera da esclusività").toBeGreaterThan(0);

      // Residui di run precedenti nella finestra.
      for (const row of bootstrap.data.appointments) {
        if (row.groupLessonId) {
          await api.delete(`/api/autoscuole/group-lessons/${row.groupLessonId}`);
        }
        if (!row.id.startsWith("gl-empty:")) {
          await api.post(`/api/autoscuole/appointments/${row.id}/permanent-cancel`);
        }
      }

      // ── 1. Gruppo MOTO: la patente viene dalla flotta ─────────────────────
      // Solo moto che puntano allo stesso luogo, altrimenti il risultato atteso
      // sarebbe la sede (conflitto) e il test non direbbe niente sul routing.
      const motoLocation = locations.find(
        (l) => !l.isDefault && motos.some((m) => hasCategory(l, m.licenseCategory ?? "")),
      );
      const fleet = motoLocation
        ? motos.filter((m) => hasCategory(motoLocation, m.licenseCategory ?? ""))
        : motos.slice(0, 1);

      const motoGroupId = await createGroupLesson(api, {
        kind: "moto",
        startsAt: at(day, 9).toISOString(),
        endsAt: at(day, 12).toISOString(),
        instructorId: instructor.id,
        vehicleIds: fleet.map((m) => m.id),
        capacity: fleet.length,
      });
      createdGroupLessons.push(motoGroupId);

      let rows = (await agendaRows(api, windowStart, windowEnd)).data.appointments;
      const motoRow = rowForGroupLesson(rows, motoGroupId);
      expect(motoRow, "la guida di gruppo moto compare in agenda").toBeTruthy();
      if (motoLocation) {
        // Routing per patente: la flotta porta al luogo delle moto, non in sede.
        expect(motoRow!.locationId, "gruppo moto → luogo delle moto").toBe(motoLocation.id);
        expect(motoRow!.location?.id).toBe(motoLocation.id);
      } else {
        // Nessun luogo dedicato alle moto in questo ambiente: resta la sede.
        expect(motoRow!.locationId, "gruppo moto → sede (nessun luogo moto)").toBe(sede!.id);
      }

      // ── 2. Gruppo STANDARD con allievo: il luogo si copia sul posto ───────
      const student = bootstrap.data.students.find((s) => s.email === "allievo@reglo.it");
      expect(student, "allievo del seed (allievo@reglo.it)").toBeTruthy();
      const carLocation = locations.find((l) => hasCategory(l, "B")) ?? sede!;

      const standardGroupId = await createGroupLesson(api, {
        startsAt: at(day, 14).toISOString(),
        endsAt: at(day, 17).toISOString(),
        instructorId: instructor.id,
        vehicleId: car!.id,
        capacity: 3,
        studentIds: [student!.id],
      });
      createdGroupLessons.push(standardGroupId);

      rows = (await agendaRows(api, windowStart, windowEnd)).data.appointments;
      const seatRow = rows.find(
        (r) => r.groupLessonId === standardGroupId && !r.id.startsWith("gl-empty:"),
      );
      expect(seatRow, "il posto dell'allievo compare in agenda").toBeTruthy();
      // È la riga del POSTO: se il luogo è qui, l'allievo lo vede dall'app.
      expect(seatRow!.locationId, "il posto eredita il luogo del gruppo").toBe(carLocation.id);
      expect(seatRow!.location?.id).toBe(carLocation.id);

      // ── 3. Scelta manuale: vince sempre ───────────────────────────────────
      const manual = locations.find((l) => l.id !== carLocation.id) ?? sede!;
      const manualGroupId = await createGroupLesson(api, {
        startsAt: at(day, 18).toISOString(),
        endsAt: at(day, 19).toISOString(),
        instructorId: instructor.id,
        vehicleId: car!.id,
        capacity: 3,
        locationId: manual.id,
      });
      createdGroupLessons.push(manualGroupId);

      rows = (await agendaRows(api, windowStart, windowEnd)).data.appointments;
      const manualRow = rowForGroupLesson(rows, manualGroupId);
      expect(manualRow, "la guida con luogo scelto a mano compare in agenda").toBeTruthy();
      expect(manualRow!.locationId, "il luogo scelto a mano non viene ricalcolato").toBe(
        manual.id,
      );

      // ── 4. Un luogo di un'altra autoscuola viene rifiutato ────────────────
      const bogus = await api.post("/api/autoscuole/group-lessons", {
        data: {
          startsAt: at(day, 19).toISOString(),
          endsAt: at(day, 20).toISOString(),
          instructorId: instructor.id,
          vehicleId: car!.id,
          capacity: 3,
          locationId: "00000000-0000-0000-0000-000000000000",
        },
      });
      const bogusJson = (await bogus.json()) as { success?: boolean; message?: string };
      expect(bogusJson.success, "luogo inesistente → creazione rifiutata").toBeFalsy();
      expect(bogusJson.message ?? "").toContain("Luogo non valido");
    } finally {
      for (const id of createdGroupLessons) {
        await api.delete(`/api/autoscuole/group-lessons/${id}`);
      }
      const leftovers = (await agendaRows(api, windowStart, windowEnd)).data.appointments;
      for (const row of leftovers) {
        if (!row.id.startsWith("gl-empty:")) {
          await api.post(`/api/autoscuole/appointments/${row.id}/permanent-cancel`);
        }
      }
    }
  });
});

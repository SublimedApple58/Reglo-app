import {
  appointmentBusyOwnerIds,
  appointmentBusyInstructorIds,
  APPOINTMENT_BUSY_SELECT,
} from "@/lib/autoscuole/appointment-busy";
import { addGroupLessonBusyIntervals } from "@/lib/autoscuole/group-lesson-busy";

/**
 * REG-591 — il secondo istruttore di una guida di gruppo o di un esame deve
 * risultare OCCUPATO come il principale. Finché non lo era, il motore di
 * disponibilità lo offriva libero e gli allievi si prenotavano sopra: doppia
 * prenotazione vera, segnalata il 2026-10-02.
 */

const PRINCIPALE = "11111111-1111-1111-1111-111111111111";
const COLLEGA = "22222222-2222-2222-2222-222222222222";
const ALLIEVO = "33333333-3333-3333-3333-333333333333";
const AUTO = "44444444-4444-4444-4444-444444444444";
const MOTO_SEGUITO = "55555555-5555-5555-5555-555555555555";

describe("appointmentBusyOwnerIds", () => {
  it("occupa allievo, istruttore e veicolo di una guida normale", () => {
    expect(
      appointmentBusyOwnerIds({
        studentId: ALLIEVO,
        instructorId: PRINCIPALE,
        vehicleId: AUTO,
      }),
    ).toEqual([ALLIEVO, PRINCIPALE, AUTO]);
  });

  it("occupa ANCHE il co-istruttore — è il bug REG-591", () => {
    const occupati = appointmentBusyOwnerIds({
      studentId: ALLIEVO,
      instructorId: PRINCIPALE,
      vehicleId: AUTO,
      coInstructors: [{ instructorId: COLLEGA }],
    });
    expect(occupati).toContain(COLLEGA);
  });

  it("occupa più co-istruttori insieme", () => {
    const terzo = "66666666-6666-6666-6666-666666666666";
    const occupati = appointmentBusyOwnerIds({
      studentId: ALLIEVO,
      instructorId: PRINCIPALE,
      vehicleId: null,
      coInstructors: [{ instructorId: COLLEGA }, { instructorId: terzo }],
    });
    expect(occupati).toEqual(expect.arrayContaining([PRINCIPALE, COLLEGA, terzo]));
  });

  it("regge il segnaposto d'esame senza allievo: istruttori occupati lo stesso", () => {
    const occupati = appointmentBusyOwnerIds({
      studentId: null,
      instructorId: PRINCIPALE,
      vehicleId: null,
      coInstructors: [{ instructorId: COLLEGA }],
    });
    expect(occupati).toEqual([PRINCIPALE, COLLEGA]);
  });

  it("non duplica il veicolo principale presente anche nel join", () => {
    const occupati = appointmentBusyOwnerIds({
      studentId: ALLIEVO,
      instructorId: PRINCIPALE,
      vehicleId: AUTO,
      appointmentVehicles: [{ vehicleId: AUTO }, { vehicleId: MOTO_SEGUITO }],
    });
    expect(occupati.filter((id) => id === AUTO)).toHaveLength(1);
    expect(occupati).toContain(MOTO_SEGUITO);
  });

  it("non si rompe quando il join non è stato caricato", () => {
    expect(
      appointmentBusyOwnerIds({ studentId: null, instructorId: PRINCIPALE, vehicleId: null }),
    ).toEqual([PRINCIPALE]);
  });
});

describe("APPOINTMENT_BUSY_SELECT", () => {
  // Un campo nella funzione ma non nel select è `undefined` a runtime: non
  // impegna nessuno, e in silenzio. I due vanno letti in coppia.
  it("carica i co-istruttori, se no la funzione non li vedrebbe mai", () => {
    expect(APPOINTMENT_BUSY_SELECT.coInstructors).toEqual({
      select: { instructorId: true },
    });
  });
});

describe("appointmentBusyInstructorIds", () => {
  it("restituisce principale + colleghi, senza allievi né veicoli", () => {
    expect(
      appointmentBusyInstructorIds({
        instructorId: PRINCIPALE,
        coInstructors: [{ instructorId: COLLEGA }],
      }),
    ).toEqual([PRINCIPALE, COLLEGA]);
  });

  it("è vuoto se la riga non ha istruttori", () => {
    expect(appointmentBusyInstructorIds({ instructorId: null })).toEqual([]);
  });
});

describe("addGroupLessonBusyIntervals", () => {
  const start = new Date("2026-10-05T09:00:00.000Z");
  const end = new Date("2026-10-05T10:00:00.000Z");

  it("occupa il co-istruttore di una guida di gruppo VUOTA", () => {
    // Una guida di gruppo senza iscritti non ha righe appuntamento: se il
    // contenitore non porta i colleghi, il secondo istruttore resta libero.
    const intervals = new Map<string, Array<{ start: number; end: number }>>();
    addGroupLessonBusyIntervals(intervals, [
      {
        instructorId: PRINCIPALE,
        coInstructorIds: [COLLEGA],
        vehicleId: AUTO,
        followVehicleId: null,
        fleetVehicleIds: [],
        startsAt: start,
        endsAt: end,
      },
    ]);
    expect(intervals.get(COLLEGA)).toEqual([
      { start: start.getTime(), end: end.getTime() },
    ]);
    expect(intervals.get(PRINCIPALE)).toHaveLength(1);
    expect(intervals.get(AUTO)).toHaveLength(1);
  });

  it("ignora i contenitori senza orario di fine", () => {
    const intervals = new Map<string, Array<{ start: number; end: number }>>();
    addGroupLessonBusyIntervals(intervals, [
      {
        instructorId: PRINCIPALE,
        coInstructorIds: [COLLEGA],
        vehicleId: null,
        followVehicleId: null,
        fleetVehicleIds: [],
        startsAt: start,
        endsAt: null,
      },
    ]);
    expect(intervals.size).toBe(0);
  });
});

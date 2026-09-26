/**
 * Agenda **finta** per le anteprime sfocate delle sezioni bloccate (REG-429).
 *
 * Dietro la card di una funzione non comprata non ci va una pagina bianca: ci
 * va la funzione, piena e sfocata, come nel prototipo e come già succede per
 * gli Allievi. Una settimana vuota non invoglia nessuno.
 *
 * Tutto è **statico e locale**: nessuna chiamata al server, nessun dato di
 * un'altra autoscuola. I nomi sono inventati, le date sono relative a oggi —
 * così l'anteprima è piena in qualunque settimana si apra.
 *
 * Le durate sono scelte apposta su tutta la scala (30/45/60/90/120): l'agenda
 * colora i blocchi per durata, quindi così l'anteprima mostra la tavolozza
 * vera invece di un muro di un colore solo.
 */

import type { AgendaBootstrapPayload } from "@/components/pages/Autoscuole/AutoscuoleAgendaPage";

const INSTRUCTORS = [
  { id: "demo-i1", name: "Angelo Mastro" },
  { id: "demo-i2", name: "Merilu Basso" },
  { id: "demo-i3", name: "Sergio Ravera" },
  { id: "demo-i4", name: "Massimo Conti" },
];

const VEHICLES = [
  { id: "demo-v1", name: "Fiat 500" },
  { id: "demo-v2", name: "Lancia Ypsilon" },
  { id: "demo-v3", name: "Yamaha MT-07" },
];

const STUDENTS = [
  ["Giulia", "Ferrari"],
  ["Marco", "Bianchi"],
  ["Sara", "Gallo"],
  ["Luca", "Costa"],
  ["Emma", "Neri"],
  ["Paolo", "Rizzo"],
  ["Chiara", "Moretti"],
  ["Davide", "Ferri"],
  ["Alice", "Greco"],
  ["Matteo", "Longo"],
  ["Sofia", "Marini"],
  ["Riccardo", "Nanni"],
] as const;

/**
 * Una giornata tipo, ripetuta con piccole variazioni sui giorni feriali:
 * `[colonna, ora, minuti, durata, tipo]`. Il sabato è più scarico, la
 * domenica vuota — come in una settimana vera.
 */
const DAY_PLAN: Array<[number, number, number, number, "guida" | "esame"]> = [
  [0, 8, 0, 60, "guida"],
  [1, 8, 30, 45, "guida"],
  [2, 8, 0, 90, "guida"],
  [3, 9, 0, 60, "guida"],
  [0, 9, 30, 30, "guida"],
  [1, 10, 0, 60, "guida"],
  [2, 10, 30, 120, "guida"],
  [3, 10, 30, 45, "guida"],
  [0, 11, 0, 60, "guida"],
  [1, 11, 30, 60, "guida"],
  [3, 12, 0, 30, "guida"],
  [0, 14, 0, 90, "guida"],
  [1, 14, 30, 60, "guida"],
  [2, 14, 0, 60, "guida"],
  [3, 15, 0, 45, "guida"],
  [0, 16, 0, 60, "guida"],
  [1, 16, 30, 120, "guida"],
  [2, 16, 0, 60, "guida"],
  [3, 17, 0, 60, "guida"],
  [0, 18, 0, 45, "guida"],
  [2, 18, 30, 60, "guida"],
];

/**
 * Costruisce la settimana finta che contiene `from`.
 *
 * Deterministica: lo stesso giorno produce sempre la stessa agenda, così
 * navigando avanti e indietro l'anteprima non "salta".
 */
export function demoAgendaBootstrap(from: Date, to: Date): AgendaBootstrapPayload {
  const appointments: AgendaBootstrapPayload["appointments"] = [];
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);

  const days = Math.max(1, Math.round((to.getTime() - start.getTime()) / 86_400_000));

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const day = new Date(start);
    day.setDate(day.getDate() + dayIndex);
    const weekday = day.getDay(); // 0 = domenica
    if (weekday === 0) continue;
    const saturday = weekday === 6;

    DAY_PLAN.forEach((entry, planIndex) => {
      // Sabato: solo la mattina, e neanche tutta.
      if (saturday && (entry[1] >= 13 || planIndex % 2 === 1)) return;
      // Un buco ogni tanto nei feriali: un'agenda piena al 100% non è vera.
      if (!saturday && (planIndex + dayIndex) % 7 === 3) return;

      const [column, hour, minute, duration, type] = entry;
      const startsAt = new Date(day);
      startsAt.setHours(hour, minute, 0, 0);
      const endsAt = new Date(startsAt.getTime() + duration * 60_000);
      const studentIndex = (planIndex * 3 + dayIndex * 5) % STUDENTS.length;
      const [firstName, lastName] = STUDENTS[studentIndex];
      // Qualche guida passata già completata, una annullata: l'agenda vera ha
      // anche quelle, e hanno colori diversi.
      const past = endsAt.getTime() < Date.now();
      const cancelled = (planIndex + dayIndex) % 11 === 5;

      appointments.push({
        id: `demo-${dayIndex}-${planIndex}`,
        type,
        status: cancelled ? "cancelled" : past ? "completed" : "scheduled",
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        student: { id: `demo-s${studentIndex}`, firstName, lastName },
        instructor: INSTRUCTORS[column],
        vehicle: VEHICLES[(planIndex + column) % VEHICLES.length],
      });
    });
  }

  return {
    appointments,
    students: [],
    instructors: INSTRUCTORS,
    vehicles: VEHICLES,
    vehiclesEnabled: true,
    groupLessonsEnabled: false,
    holidays: [],
    instructorBlocks: [],
    meta: {
      from: start.toISOString(),
      to: to.toISOString(),
      generatedAt: new Date().toISOString(),
      count: appointments.length,
    },
  };
}

/** Orario di apertura finto, per l'anteprima della Segretaria. */
export const DEMO_CALL_HOURS = { open: "08:30", lunch: "12:30 – 15:00", close: "19:00" };

export const DEMO_PENDING_CALLS = [
  { initials: "MR", name: "Marco Rossi", when: "oggi 14:32", topic: "Chiede i prezzi del pacchetto guide" },
  { initials: "LC", name: "Laura Conti", when: "oggi 11:08", topic: "Vuole spostare la guida di giovedì" },
  { initials: "GF", name: "Giulia Ferrari", when: "ieri 17:45", topic: "Documenti per il foglio rosa" },
  { initials: "DF", name: "Davide Ferri", when: "ieri 09:20", topic: "Orari di apertura della sede" },
];

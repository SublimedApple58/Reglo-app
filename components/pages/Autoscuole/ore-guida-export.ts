import type { InstructorHoursEntry } from "@/lib/actions/autoscuole.actions";
import { sumOccupancy } from "@/lib/autoscuole/agenda-occupancy";

/**
 * Export del report "Ore guida" (REG-444/ex REG-447).
 *
 * CSV con `;` e BOM, non `.xlsx`: è il formato che l'Excel italiano apre con
 * un doppio clic senza procedura di importazione, ed è già il precedente della
 * casa (backoffice → Esporta CSV). Le ore escono in decimale con la VIRGOLA,
 * così Excel le legge come numeri e le somma; il minutaggio leggibile sta
 * nella colonna accanto, per chi il file lo guarda e basta.
 */

const csvCell = (value: string | number | null) => {
  const text = value === null ? "" : String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Ore decimali all'italiana: "41,5". Excel-IT le tratta come numero. */
const hoursCell = (minutes: number) => (minutes / 60).toFixed(2).replace(".", ",");

/** Minutaggio leggibile: "41h 30m". */
const readableHours = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0 && m > 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

const percentCell = (ratio: number) => (ratio * 100).toFixed(1).replace(".", ",");

const DAY_FMT = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export function buildOreGuidaCsv(input: {
  entries: InstructorHoursEntry[];
  weekStartISO: string;
  weekEndISO: string;
  weekLabel: string;
}): string {
  const rows: Array<Array<string | number | null>> = [];
  const push = (...cells: Array<string | number | null>) => rows.push(cells);

  const team = sumOccupancy(input.entries.map((e) => e.weekly.occupancy));
  const teamDriving = input.entries.reduce((s, e) => s + e.weekly.totalMinutes, 0);
  const teamTheory = input.entries.reduce((s, e) => s + e.weekly.theoryMinutes, 0);
  const teamLate = input.entries.reduce((s, e) => s + e.monthly.lateCancellationMinutes, 0);

  push("Reglo — Ore guida");
  push("Settimana", `${input.weekStartISO} → ${input.weekEndISO}`, input.weekLabel);
  push("Generato il", new Date().toLocaleString("it-IT"));
  push();

  push("Riepilogo settimana", "Ore (decimali)", "Ore (leggibili)");
  push("Ore di guida svolte", hoursCell(teamDriving), readableHours(teamDriving));
  push("Ore di lezione teorica", hoursCell(teamTheory), readableHours(teamTheory));
  push("Ore disponibili in agenda", hoursCell(team.availableMinutes), readableHours(team.availableMinutes));
  push("Ore occupate in agenda", hoursCell(team.busyMinutes), readableHours(team.busyMinutes));
  push("Ore libere in agenda", hoursCell(Math.max(0, team.availableMinutes - team.busyMinutes)), readableHours(Math.max(0, team.availableMinutes - team.busyMinutes)));
  push("Ore occupate fuori dalle fasce", hoursCell(team.outsideMinutes), readableHours(team.outsideMinutes));
  push("Agenda occupata (%)", percentCell(team.ratio), `${Math.round(team.ratio * 100)}%`);
  push();

  push(
    "Istruttore",
    "Ore guida settimana",
    "Ore teoria settimana",
    "Ore disponibili",
    "Ore occupate",
    "Ore libere",
    "Fuori fascia",
    "Agenda occupata (%)",
    "Cancellazioni tardive (mese)",
    "Ore guida mese",
    "Mese",
  );
  for (const entry of input.entries) {
    const occ = entry.weekly.occupancy;
    push(
      entry.instructorName,
      hoursCell(entry.weekly.totalMinutes),
      hoursCell(entry.weekly.theoryMinutes),
      hoursCell(occ.availableMinutes),
      hoursCell(occ.busyMinutes),
      hoursCell(Math.max(0, occ.availableMinutes - occ.busyMinutes)),
      hoursCell(occ.outsideMinutes),
      occ.availableMinutes > 0 ? percentCell(occ.ratio) : "",
      hoursCell(entry.monthly.lateCancellationMinutes),
      hoursCell(entry.monthly.totalMinutes),
      entry.monthly.monthLabel,
    );
  }
  push();

  push("Dettaglio per giorno");
  push("Istruttore", "Giorno", "Ore guida", "Ore teoria", "Guide");
  for (const entry of input.entries) {
    for (const day of entry.weekly.byDay) {
      push(
        entry.instructorName,
        DAY_FMT.format(new Date(`${day.date}T12:00:00Z`)),
        hoursCell(day.totalMinutes),
        hoursCell(day.theoryMinutes),
        day.appointmentCount,
      );
    }
  }

  if (teamLate > 0) {
    push();
    push("Nota", "Le cancellazioni tardive sono del MESE, non della settimana: non dipendono dagli istruttori.");
  }
  push();
  push(
    "Nota",
    "Le ore disponibili sono le fasce che gli istruttori hanno in agenda, al netto di ferie, malattia, lezioni teoriche, blocchi e giorni di chiusura. Sono occupate tutte le guide, gli esami e le guide di gruppo non annullati, comprese quelle ancora da svolgere.",
  );

  return rows.map((row) => row.map(csvCell).join(";")).join("\n");
}

export function downloadCsv(filename: string, content: string) {
  // BOM: senza, Excel sbaglia gli accenti.
  const blob = new Blob([`﻿${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

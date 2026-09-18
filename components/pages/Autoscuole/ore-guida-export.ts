import type { InstructorHoursRange } from "@/lib/actions/autoscuole.actions";
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

export function buildOreGuidaCsv(input: {
  entries: InstructorHoursRange[];
  range: { from: string; to: string };
  periodLabel: string;
  meta: { measuredUntil: string | null; partial: boolean };
}): string {
  const rows: Array<Array<string | number | null>> = [];
  const push = (...cells: Array<string | number | null>) => rows.push(cells);

  const team = sumOccupancy(input.entries.map((e) => e.occupancy));
  const teamDriving = input.entries.reduce((s, e) => s + e.total.totalMinutes, 0);
  const teamTheory = input.entries.reduce((s, e) => s + e.total.theoryMinutes, 0);
  const teamLate = input.entries.reduce((s, e) => s + e.total.lateCancellationMinutes, 0);
  const teamFree = Math.max(0, team.availableMinutes - team.busyMinutes);
  const granularity = input.entries[0]?.granularity ?? "day";

  push("Reglo — Ore guida");
  push("Periodo", `${input.range.from} → ${input.range.to}`, input.periodLabel);
  push(
    "Occupazione misurata fino a",
    input.meta.measuredUntil
      ? new Date(input.meta.measuredUntil).toLocaleString("it-IT")
      : "periodo non ancora iniziato",
  );
  push("Generato il", new Date().toLocaleString("it-IT"));
  push();

  push("Riepilogo periodo", "Ore (decimali)", "Ore (leggibili)");
  push("Ore di guida svolte", hoursCell(teamDriving), readableHours(teamDriving));
  push("Ore di lezione teorica", hoursCell(teamTheory), readableHours(teamTheory));
  push("Ore disponibili in agenda", hoursCell(team.availableMinutes), readableHours(team.availableMinutes));
  push("Ore occupate in agenda", hoursCell(team.busyMinutes), readableHours(team.busyMinutes));
  push("Ore libere in agenda", hoursCell(teamFree), readableHours(teamFree));
  push("Ore occupate fuori dalle fasce", hoursCell(team.outsideMinutes), readableHours(team.outsideMinutes));
  push("Agenda occupata (%)", percentCell(team.ratio), `${Math.round(team.ratio * 100)}%`);
  push("Cancellazioni tardive", hoursCell(teamLate), readableHours(teamLate));
  push();

  push(
    "Istruttore",
    "Ore guida",
    "Ore teoria",
    "Guide",
    "Ore disponibili",
    "Ore occupate",
    "Ore libere",
    "Fuori fascia",
    "Agenda occupata (%)",
    "Cancellazioni tardive",
  );
  for (const entry of input.entries) {
    const occ = entry.occupancy;
    push(
      entry.instructorName,
      hoursCell(entry.total.totalMinutes),
      hoursCell(entry.total.theoryMinutes),
      entry.total.appointmentCount,
      hoursCell(occ.availableMinutes),
      hoursCell(occ.busyMinutes),
      hoursCell(Math.max(0, occ.availableMinutes - occ.busyMinutes)),
      hoursCell(occ.outsideMinutes),
      occ.availableMinutes > 0 ? percentCell(occ.ratio) : "",
      hoursCell(entry.total.lateCancellationMinutes),
    );
  }
  push();

  push(granularity === "day" ? "Dettaglio per giorno" : "Dettaglio per settimana");
  push(
    "Istruttore",
    granularity === "day" ? "Giorno" : "Settimana dal",
    "Ore guida",
    "Ore teoria",
    "Guide",
  );
  for (const entry of input.entries) {
    for (const bucket of entry.buckets) {
      push(
        entry.instructorName,
        bucket.startDate,
        hoursCell(bucket.totalMinutes),
        hoursCell(bucket.theoryMinutes),
        bucket.appointmentCount,
      );
    }
  }

  push();
  push(
    "Nota",
    "L'occupazione conta solo le ore GIÀ TRASCORSE del periodo: quelle ancora da venire non sono né occupate né perse. Le ore disponibili sono le fasce che gli istruttori hanno in agenda, al netto di ferie, malattia, lezioni teoriche, blocchi e giorni di chiusura. Sono occupate tutte le guide, gli esami e le guide di gruppo non annullati, comprese quelle ancora da svolgere: per questo le ore occupate non coincidono con le ore di guida svolte.",
  );
  if (teamLate > 0) {
    push(
      "Nota",
      "Le cancellazioni tardive non dipendono dagli istruttori: sono gli allievi che annullano oltre il preavviso. A differenza dell'occupazione coprono tutto il periodo, non solo la parte trascorsa.",
    );
  }

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

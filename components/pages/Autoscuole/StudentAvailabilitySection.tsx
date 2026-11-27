"use client";

import * as React from "react";

import { getStudentAvailabilityForStaff } from "@/lib/actions/autoscuole-student-availability.actions";
import type { StudentAvailabilityPayload } from "@/lib/autoscuole/student-availability-store";
import { DetailRow, DetailRows, DetailSection } from "./student-detail-sheet";

/** Da lunedì a domenica; chiavi come `rangesByDay` (0 = domenica). */
const WEEK: Array<[string, string]> = [
  ["1", "Lunedì"],
  ["2", "Martedì"],
  ["3", "Mercoledì"],
  ["4", "Giovedì"],
  ["5", "Venerdì"],
  ["6", "Sabato"],
  ["0", "Domenica"],
];

type Bands = StudentAvailabilityPayload["bands"];

const ordered = (keys: readonly string[] | undefined, bands: Bands) =>
  bands.filter((b) => keys?.includes(b.key));

/** «Sera», «Mattina e pomeriggio», «Tutto il giorno». */
const bandsLabel = (keys: readonly string[] | undefined, bands: Bands) => {
  const list = ordered(keys, bands);
  if (!list.length) return null;
  if (list.length === bands.length) return "Tutto il giorno";
  const labels = list.map((b) => b.label);
  return labels.length === 1
    ? labels[0]
    : `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1].toLowerCase()}`;
};

/** «18–21», «8–13, 18–21» (fasce attaccate fuse). */
const hoursLabel = (keys: readonly string[] | undefined, bands: Bands) => {
  const out: Array<[number, number]> = [];
  for (const b of ordered(keys, bands)) {
    const last = out[out.length - 1];
    if (last && last[1] === b.startMinutes) last[1] = b.endMinutes;
    else out.push([b.startMinutes, b.endMinutes]);
  }
  const h = (m: number) => (m % 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}` : `${m / 60}`);
  return out.map(([s, e]) => `${h(s)}–${h(e)}`).join(", ");
};

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });

/**
 * REG-802 — le disponibilità dell'allievo aperto nel drawer. `ready` diventa
 * vero solo con la risposta di QUESTO allievo: la sezione entra nella lista
 * già giusta (dentro `DetailSections` un figlio vuoto lascerebbe un separatore).
 */
export function useStudentAvailabilityForStaff(studentId: string | null) {
  const [state, setState] = React.useState<{ id: string | null; data: StudentAvailabilityPayload | null }>({
    id: null,
    data: null,
  });
  React.useEffect(() => {
    if (!studentId) return;
    let alive = true;
    getStudentAvailabilityForStaff({ studentId })
      .then((res) => alive && setState({ id: studentId, data: res.success ? res.data : null }))
      .catch(() => alive && setState({ id: studentId, data: null }));
    return () => {
      alive = false;
    };
  }, [studentId]);
  return { ready: !!studentId && state.id === studentId, data: state.data };
}

/**
 * REG-802 — «Disponibilità» nel drawer allievo: le fasce che l'allievo ha
 * indicato dall'app, giorno per giorno, in sola lettura. Non vincolano le
 * prenotazioni; decidono chi riceve gli avvisi dei posti liberi.
 */
export function StudentAvailabilitySection({
  data,
  firstName,
}: {
  data: StudentAvailabilityPayload | null;
  firstName: string;
}) {
  const has = Boolean(data?.hasAvailability);
  const days = data?.days ?? {};
  const bands = data?.bands ?? [];
  const count = WEEK.filter(([k]) => (days[k]?.length ?? 0) > 0).length;
  const who = firstName.trim() || "l'allievo";

  return (
    <div className="animate-in fade-in-0 duration-200">
      <DetailSection
        title="Disponibilità"
        aside={has ? `${count} ${count === 1 ? "giorno" : "giorni"}` : undefined}
        testId="student-availability"
        foot={
          has
            ? `${data?.confirmedAt ? `Indicate da ${who} il ${dateLabel(data.confirmedAt)}. ` : ""}Non vincolano le prenotazioni: servono a proporre orari adatti e ad avvisare dei posti liberi.`
            : undefined
        }
      >
        <DetailRows>
          {has ? (
            WEEK.map(([key, day]) => {
              const label = bandsLabel(days[key], bands);
              return (
                <DetailRow
                  key={key}
                  label={day}
                  value={
                    label ? (
                      <span>
                        <span className="font-semibold text-foreground">{label}</span>
                        <span className="text-[#6a6a6a]"> · {hoursLabel(days[key], bands)}</span>
                      </span>
                    ) : (
                      <span className="text-[#b0b0b0]">—</span>
                    )
                  }
                />
              );
            })
          ) : (
            <DetailRow
              label="Non ancora indicate"
              description="L'app gliele chiede al prossimo accesso. Finché mancano non riceve gli avvisi dei posti liberi."
            />
          )}
        </DetailRows>
      </DetailSection>
    </div>
  );
}

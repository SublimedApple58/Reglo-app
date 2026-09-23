"use client";

import * as React from "react";

import type { ConsorzioStudentPhase } from "@/lib/actions/consorzio.actions";
import type { PillTone } from "@/components/pages/Autoscuole/student-detail-ui";

/**
 * Fase percorso nella scheda autoscuola del consorzio: badge di riga e filtri.
 *
 * Il dato esiste da sempre (`CompanyMember.studentPhase`), ma fino a oggi il
 * consorzio non aveva né un modo per leggerlo né uno per impostarlo: in
 * produzione tutti e 12 gli allievi erano `PRATICA` — il default dello schema —
 * con `phaseClassifiedAt` nullo. Per questo il comando di cambio fase nel
 * drawer e questi filtri nascono insieme: separati, uno mostra sempre lo stesso
 * numero e l'altro non ha dove mostrarsi.
 */

const PHASE_STYLE: Record<
  ConsorzioStudentPhase,
  { label: string; background: string; color: string }
> = {
  // Lo stato normale è volutamente neutro: è quello di quasi tutti, e un badge
  // colorato su ogni riga renderebbe la tabella illeggibile. Il verde spicca
  // sull'eccezione che si sta cercando — chi ha finito.
  PRATICA: { label: "In pratica", background: "#F4F4F5", color: "#6A6A6A" },
  PATENTATO: { label: "Patentato", background: "#E8F5EC", color: "#1F6B2A" },
  // Sul consorzio non sono raggiungibili (updateStudentPhase le rifiuta senza
  // la fase teoria attiva). Restano qui perché il dato del database le ammette
  // e una riga non deve mai restare senza etichetta.
  AWAITING: { label: "In attesa", background: "#FFF4E5", color: "#B45309" },
  TEORIA: { label: "Teoria", background: "#EEF4FF", color: "#2A6FDB" },
};

export function studentPhaseLabel(phase: ConsorzioStudentPhase): string {
  return PHASE_STYLE[phase].label;
}

/**
 * Tono equivalente per la `Pill` del drawer. Due forme della stessa pastiglia,
 * non due linguaggi: nella tabella i badge sono senza bordo (accanto a quello
 * della patente), nel drawer hanno il bordo come tutti gli altri lì intorno.
 */
export const STUDENT_PHASE_PILL_TONE: Record<ConsorzioStudentPhase, PillTone> = {
  PRATICA: "gray",
  PATENTATO: "green",
  AWAITING: "amber",
  TEORIA: "blue",
};

/** Pastiglia della fase, stessa forma di quella della patente accanto. */
export function StudentPhaseBadge({
  phase,
  className,
}: {
  phase: ConsorzioStudentPhase;
  className?: string;
}) {
  const style = PHASE_STYLE[phase];
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap px-2.5 py-1 text-[12px] font-bold leading-[1.4] ${className ?? ""}`}
      style={{ background: style.background, color: style.color, borderRadius: 20 }}
    >
      {style.label}
    </span>
  );
}

/**
 * Tre voci e non quattro: "In attesa" e "Teoria" non sono vuote, sono
 * irraggiungibili su un account consorzio. Una pastiglia che non potrà mai
 * popolarsi è peggio di una assente.
 */
export type PhaseFilter = "all" | "pratica" | "patentati";

export function matchesPhaseFilter(
  phase: ConsorzioStudentPhase,
  filter: PhaseFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "patentati") return phase === "PATENTATO";
  // "In pratica" raccoglie tutto ciò che non è concluso: se un allievo si
  // trovasse in una fase teoria ereditata, sparirebbe da entrambi i filtri.
  return phase !== "PATENTATO";
}

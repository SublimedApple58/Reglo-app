import { CONSORTIUM_LICENSE_CATEGORIES } from "@/lib/autoscuole/license";
import type { ConsorzioPricing } from "@/lib/consorzio/pricing";

/**
 * Cosa cambia davvero quando si salva il pane Prezzi del consorzio.
 *
 * Serve perché il prezzo di una voce **non esiste finché non viene
 * congelata**: `ConsorzioLessonBilling` nasce al primo toggle
 * saldata/fatturata, prima di allora la Fatturazione calcola live col listino
 * corrente. Quindi ritoccare una tariffa non "ricalcola" il passato: lo
 * rivela, perché quel passato non ha mai avuto un prezzo scritto.
 *
 * In produzione il consorzio ha **zero** righe di billing: 10 esami e 5 guide
 * passate, tutti esposti a ogni ritocco. Da qui la richiesta di Tiziano del
 * 23/09 — chiedere, invece di applicare in automatico.
 *
 * Qui si calcola solo **cosa è cambiato**; quante voci ne siano toccate lo
 * conta chi ha il database davanti.
 */

export type PricingChange = {
  /** Identificatore stabile, per i test e per l'ordinamento. */
  key: string;
  /** Come si legge nel dialogo: "Tariffa oraria · CE". */
  label: string;
  /** null = non era impostata. */
  from: number | null;
  to: number | null;
  /** "€" o "%": il dialogo formatta di conseguenza. */
  unit: "eur" | "pct";
};

const num = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * Le tariffe che, cambiando, riscrivono il conto di una voce già passata.
 *
 * `lateCancellationCutoffHours` e `guideRequestMinLeadHours` NON sono qui: la
 * prima decide *se* un'assenza è addebitabile e la seconda il preavviso delle
 * richieste — sono regole, non prezzi, e non rideterminano l'importo di una
 * voce già esistente.
 */
export function diffConsorzioPricing(
  prev: ConsorzioPricing,
  next: ConsorzioPricing,
): PricingChange[] {
  const changes: PricingChange[] = [];

  const push = (key: string, label: string, a: number | null, b: number | null, unit: PricingChange["unit"]) => {
    if (a === b) return;
    changes.push({ key, label, from: a, to: b, unit });
  };

  for (const category of CONSORTIUM_LICENSE_CATEGORIES) {
    push(
      `hourly:${category}`,
      `Tariffa oraria · ${category}`,
      num(prev.hourlyByCategory[category]),
      num(next.hourlyByCategory[category]),
      "eur",
    );
    push(
      `course:${category}`,
      `Prezzo percorso · ${category}`,
      num(prev.courseByCategory[category]),
      num(next.courseByCategory[category]),
      "eur",
    );
  }

  push("examFee", "Tariffa esame", num(prev.examFee), num(next.examFee), "eur");

  // Le penali sono tariffe a tutti gli effetti: un'assenza addebitata è una
  // voce di costo come le altre (deciso da Tiziano il 23/09).
  push(
    "lateCancellationFixedAmount",
    "Costo assenza · importo fisso",
    num(prev.lateCancellationFixedAmount),
    num(next.lateCancellationFixedAmount),
    "eur",
  );
  push(
    "lateCancellationPenaltyPct",
    "Costo assenza · percentuale",
    num(prev.lateCancellationPenaltyPct),
    num(next.lateCancellationPenaltyPct),
    "pct",
  );

  return changes;
}

/**
 * Il criterio del costo assenza (percentuale ⇄ importo fisso) non è una cifra
 * ma cambia il conto quanto una cifra: va trattato come un cambio di tariffa.
 */
export function lateCancellationModeChanged(
  prev: ConsorzioPricing,
  next: ConsorzioPricing,
): boolean {
  return prev.lateCancellationMode !== next.lateCancellationMode;
}

/** Il dialogo si apre solo se c'è qualcosa da chiedere. */
export function pricingAffectsPast(
  prev: ConsorzioPricing,
  next: ConsorzioPricing,
): boolean {
  return diffConsorzioPricing(prev, next).length > 0 || lateCancellationModeChanged(prev, next);
}

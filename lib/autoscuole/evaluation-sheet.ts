/**
 * Pagellino di valutazione (REG-443) — regole pure, condivise da web, API e
 * app istruttore. Ogni autoscuola sceglie le proprie voci; su ogni guida
 * l'istruttore dà un punteggio a stelline per voce.
 *
 * Convive con AutoscuolaAppointment.rating, che resta la valutazione
 * COMPLESSIVA a stelle della guida.
 */

/** Stelline ammesse per una voce. La scala 10 è stata scartata: a quella
 *  densità le stelline diventano scomode da centrare col pollice. */
export const EVALUATION_SCALES = [3, 5] as const;
export type EvaluationScale = (typeof EVALUATION_SCALES)[number];

export const DEFAULT_EVALUATION_SCALE: EvaluationScale = 5;

/** Tetto di voci per autoscuola: oltre, il foglio sul telefono non si compila
 *  più "in pochi secondi" (che è il punto della feature). */
export const MAX_EVALUATION_ITEMS = 12;

export const MAX_EVALUATION_LABEL_LENGTH = 60;

/** Modello base proposto alla prima apertura del pane Impostazioni. */
export const BASE_EVALUATION_TEMPLATE: ReadonlyArray<{
  label: string;
  scaleMax: EvaluationScale;
}> = [
  { label: "Sicurezza e precedenze", scaleMax: 5 },
  { label: "Controllo del veicolo", scaleMax: 5 },
  { label: "Manovre e parcheggio", scaleMax: 5 },
  { label: "Osservazione e specchietti", scaleMax: 5 },
  { label: "Comportamento in strada", scaleMax: 5 },
];

export const asEvaluationScale = (value: unknown): EvaluationScale =>
  EVALUATION_SCALES.includes(value as EvaluationScale)
    ? (value as EvaluationScale)
    : DEFAULT_EVALUATION_SCALE;

/**
 * Punteggio di partenza di una voce: metà scala arrotondata per eccesso
 * (3 su 5, 2 su 3). L'istruttore tocca solo ciò che vuole correggere.
 */
export const defaultEvaluationScore = (scaleMax: number): number =>
  Math.max(1, Math.ceil(asEvaluationScale(scaleMax) / 2));

/** Riporta un punteggio dentro 1..scaleMax (difesa contro payload sporchi). */
export const clampEvaluationScore = (score: number, scaleMax: number): number => {
  const max = asEvaluationScale(scaleMax);
  if (!Number.isFinite(score)) return defaultEvaluationScore(max);
  return Math.min(max, Math.max(1, Math.round(score)));
};

/**
 * Etichetta di una voce archiviata nello storico: le voci non si cancellano,
 * così un punteggio vecchio resta leggibile anche se l'autoscuola ha cambiato
 * pagellino.
 */
export const evaluationItemDisplayLabel = (item: {
  label: string;
  archivedAt?: Date | string | null;
}): string => (item.archivedAt ? `${item.label} (non più in uso)` : item.label);

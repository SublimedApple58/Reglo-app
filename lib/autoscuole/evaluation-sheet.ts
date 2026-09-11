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

/**
 * Riga di pagellino come arriva dal DB o dal client. `score` è null quando la
 * voce è "non valutabile" su quella guida; `notApplicable` resta assente sulle
 * righe scritte prima della feature (e dalle app che non lo mandano).
 */
export type EvaluationRowLike = {
  score: number | null;
  scaleMax: number;
  notApplicable?: boolean;
};

export type EvaluationSummary = {
  /** Voci effettivamente valutate (le escluse non contano). */
  count: number;
  average: number | null;
  scaleMax: number | null;
  /** Voci marcate "non valutabile" su questa guida. */
  skipped: number;
};

/**
 * Riepilogo del pagellino di una guida per lo storico: la media ha senso solo
 * se tutte le voci usano la stessa scala — con scale miste (3 e 5) sarebbe un
 * numero fuorviante, quindi si mostra solo il conteggio.
 *
 * Le voci "non valutabili" restano fuori dalla media e dal conteggio: se lo
 * sono tutte il pagellino esiste ma non ha un voto (`count: 0`).
 */
export const evaluationSummary = (
  rows: ReadonlyArray<EvaluationRowLike>,
): EvaluationSummary | null => {
  if (!rows.length) return null;
  const scored = rows.filter(
    (r): r is EvaluationRowLike & { score: number } => !r.notApplicable && r.score != null,
  );
  const skipped = rows.length - scored.length;
  if (!scored.length) return { count: 0, average: null, scaleMax: null, skipped };
  const scales = new Set(scored.map((r) => r.scaleMax));
  if (scales.size > 1) return { count: scored.length, average: null, scaleMax: null, skipped };
  const average = scored.reduce((sum, r) => sum + r.score, 0) / scored.length;
  return { count: scored.length, average, scaleMax: scored[0].scaleMax, skipped };
};

/** "4,2/5" all'italiana; null quando le scale sono miste o non c'è nessun voto. */
export const formatEvaluationAverage = (
  summary: { average: number | null; scaleMax: number | null } | null,
): string | null =>
  summary && summary.average != null && summary.scaleMax != null
    ? `${summary.average.toFixed(1).replace(".", ",")}/${summary.scaleMax}`
    : null;

/**
 * Etichetta unica della chip "Pagellino" nello storico, così web e app dicono
 * le stesse tre cose: media, conteggio (scale miste) o "non applicabile"
 * (tutte le voci escluse su quella guida).
 */
export const evaluationSummaryLabel = (summary: EvaluationSummary | null): string | null => {
  if (!summary) return null;
  if (!summary.count) return "non applicabile";
  return formatEvaluationAverage(summary) ?? `${summary.count} voci`;
};

/** Testo della singola voce esclusa, identico su web e app. */
export const EVALUATION_NOT_APPLICABLE_LABEL = "non valutabile";

/* ── Media del pagellino su tutto lo storico di un allievo ───────────────── */

export type StudentEvaluationAverage = {
  itemId: string;
  label: string;
  scaleMax: number;
  /** Media dei voti dati su questa voce. */
  average: number;
  /** Quante guide hanno un voto su questa voce. */
  count: number;
  /** La voce non è più nel pagellino della scuola (archiviata). */
  archived: boolean;
};

export type StudentEvaluationAggregate = {
  items: StudentEvaluationAverage[];
  /** Guide con almeno un voto (le annullate non contano). */
  lessonCount: number;
  /** Media di tutti i voti; null con scale miste. */
  average: number | null;
  scaleMax: number | null;
  /** Voci del pagellino attuale mai valutate su questo allievo. */
  notEvaluated: number;
  /** Voce con la media più bassa (in proporzione alla sua scala). */
  weakest: StudentEvaluationAverage | null;
};

/**
 * Media per voce su tutte le guide di un allievo (scheda allievo → tab Note).
 * Non tocca il DB: lavora sui punteggi che il registro guide porta già con sé.
 *
 * Fuori dal calcolo: guide annullate, voci "non valutabili" e voci senza voto —
 * cioè tutto ciò che non è un giudizio che qualcuno ha dato davvero.
 *
 * `sheetItems` sono le voci ATTIVE del pagellino della scuola: danno l'ordine
 * (lo stesso che l'istruttore vede nel foglio) e dicono quante voci non sono
 * mai state valutate. Le voci archiviate che hanno voti restano in coda.
 */
export const aggregateStudentEvaluations = (
  lessons: ReadonlyArray<{
    cancelledAt?: Date | string | null;
    evaluations?: ReadonlyArray<{
      itemId: string;
      label: string;
      scaleMax: number;
      score: number | null;
      notApplicable?: boolean;
    }> | null;
  }>,
  sheetItems: ReadonlyArray<{ id: string; label: string; scaleMax: number }> = [],
): StudentEvaluationAggregate | null => {
  const acc = new Map<string, { label: string; scaleMax: number; sum: number; count: number }>();
  let lessonCount = 0;

  for (const lesson of lessons) {
    if (lesson.cancelledAt) continue;
    let scoredHere = false;
    for (const row of lesson.evaluations ?? []) {
      if (row.notApplicable || row.score == null) continue;
      scoredHere = true;
      const prev = acc.get(row.itemId);
      if (prev) {
        prev.sum += row.score;
        prev.count += 1;
      } else {
        acc.set(row.itemId, {
          label: row.label,
          scaleMax: row.scaleMax,
          sum: row.score,
          count: 1,
        });
      }
    }
    if (scoredHere) lessonCount += 1;
  }

  if (!acc.size) return null;

  const order = new Map(sheetItems.map((item, index) => [item.id, index]));
  const items: StudentEvaluationAverage[] = [...acc.entries()]
    .map(([itemId, row]) => ({
      itemId,
      label: row.label,
      scaleMax: row.scaleMax,
      average: row.sum / row.count,
      count: row.count,
      archived: !order.has(itemId),
    }))
    // Ordine del pagellino della scuola; le archiviate in coda, per etichetta.
    .sort((a, b) => {
      const ia = order.get(a.itemId);
      const ib = order.get(b.itemId);
      if (ia != null && ib != null) return ia - ib;
      if (ia != null) return -1;
      if (ib != null) return 1;
      return a.label.localeCompare(b.label, "it");
    });

  const scales = new Set(items.map((i) => i.scaleMax));
  const totalScores = items.reduce((sum, i) => sum + i.count, 0);
  const average =
    scales.size === 1
      ? items.reduce((sum, i) => sum + i.average * i.count, 0) / totalScores
      : null;

  const weakest =
    items.length > 1
      ? items.reduce((min, i) => (i.average / i.scaleMax < min.average / min.scaleMax ? i : min))
      : null;

  return {
    items,
    lessonCount,
    average,
    scaleMax: scales.size === 1 ? items[0].scaleMax : null,
    notEvaluated: sheetItems.filter((item) => !acc.has(item.id)).length,
    weakest,
  };
};

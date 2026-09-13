/**
 * Ordine custom delle colonne istruttore in agenda (REG-449).
 *
 * L'ordine è un elenco di id istruttore salvato nei `limits` dell'autoscuola
 * (`agendaInstructorOrder`), accanto agli altri setting d'aspetto dell'agenda.
 * È volutamente PARZIALE e tollerante: chi non compare (istruttore aggiunto
 * dopo, colonna di sola disponibilità) finisce in coda in ordine alfabetico,
 * chi compare ma non esiste più viene semplicemente ignorato.
 *
 * Modulo client-safe: lo usano sia l'action sia l'agenda sia il pane Aspetto.
 */

/** Tetto di sicurezza: nessuna autoscuola ha 200 istruttori, è anti-abuso. */
const MAX_ORDER_ENTRIES = 200;

/** Normalizza il valore grezzo del JSON limits in una lista di id pulita. */
export function asAgendaInstructorOrder(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_ORDER_ENTRIES) break;
  }
  return out;
}

/**
 * Comparatore: prima gli istruttori ordinati a mano (nell'ordine scelto), poi
 * tutti gli altri in ordine alfabetico. Mai un istruttore "perso".
 */
export function agendaInstructorComparator(
  order: string[],
): (a: { id: string; name: string }, b: { id: string; name: string }) => number {
  const rank = new Map<string, number>();
  order.forEach((id, index) => {
    if (!rank.has(id)) rank.set(id, index);
  });
  return (a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    // Un ordinato vince sempre su un non ordinato: i nuovi arrivano in fondo.
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return a.name.localeCompare(b.name, "it");
  };
}

/** Copia ordinata della lista (non muta l'array in ingresso). */
export function sortInstructorsForAgenda<T extends { id: string; name: string }>(
  list: T[],
  order: string[],
): T[] {
  return [...list].sort(agendaInstructorComparator(order));
}

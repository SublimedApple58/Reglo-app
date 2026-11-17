/**
 * Ricerca inversa allievo → autoscuola (REG-756).
 *
 * Il consorzio ha decine di autoscuole: dato un nome, deve capire da quale sede
 * arriva l'allievo senza aprire le schede una per una. La ricerca della pagina
 * Autoscuole passa da qui anche per gli allievi.
 *
 * `User.name` è un campo unico (debito REG-508), quindi non si distingue nome
 * da cognome: si cercano le parole della query **in qualunque ordine**, così
 * "Rossi Mario" trova "Mario Rossi" a prescindere dall'ordine scelto in
 * Aspetto. Maiuscole e accenti non contano ("nicolo" trova "Nicolò").
 */

export type SearchableStudent = {
  userId: string;
  name: string;
  schoolId: string;
};

export const normalizeSearchText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Ogni parola della query deve comparire nel nome, in qualunque ordine. */
export function studentMatchesQuery(name: string, query: string): boolean {
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return false;
  const words = normalizeSearchText(name).split(" ").filter(Boolean);
  return tokens.every((token) => words.some((word) => word.startsWith(token)));
}

/**
 * Allievi che corrispondono alla query, i più pertinenti in cima: prima chi ha
 * una parola che coincide per intero con la prima della query, poi in ordine
 * alfabetico. Query vuota → nessun risultato (la lista non si mostra).
 */
export function searchStudents<T extends SearchableStudent>(
  students: T[],
  query: string,
): T[] {
  const first = normalizeSearchText(query).split(" ")[0] ?? "";
  if (!first) return [];
  const exact = (name: string) =>
    normalizeSearchText(name).split(" ").includes(first) ? 0 : 1;
  return students
    .filter((student) => studentMatchesQuery(student.name, query))
    .sort(
      (a, b) =>
        exact(a.name) - exact(b.name) ||
        normalizeSearchText(a.name).localeCompare(normalizeSearchText(b.name), "it"),
    );
}

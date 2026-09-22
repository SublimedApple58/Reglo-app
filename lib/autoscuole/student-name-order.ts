/**
 * Ordine con cui si scrive il nome di un allievo — REG-507.
 *
 * Richiesta del Consorzio Autoscuole Riunite Car: in agenda gli allievi devono
 * comparire come COGNOME NOME, e le liste devono essere ordinate per cognome,
 * coerentemente. Per tutte le altre autoscuole resta NOME COGNOME: è un setting
 * per autoscuola (`studentNameOrder` nel JSON `limits`), spento di default.
 *
 * Modulo client-safe: lo usano l'action, l'agenda, le liste e il pane Aspetto.
 * Punto unico, perché `nome + cognome` è composto in una decina di posti nella
 * sola agenda e devono restare tutti d'accordo.
 *
 * ⚠️ DEBITO NOTO — nel database `User.name` è **un unico campo di testo**:
 * nome e cognome non esistono separati, vengono ricavati spezzando sul primo
 * spazio. Sui nomi composti l'euristica sbaglia ("Maria Grazia Rossi" → nome
 * *Maria*, cognome *Grazia Rossi*), e invertirli produce "Grazia Rossi Maria".
 * Questo modulo NON risolve il problema: si limita a non peggiorarlo, tenendo
 * l'inversione in un posto solo. La correzione vera sono due colonne
 * `firstName`/`lastName` con migrazione e backfill (~1.200 utenti) — vedi
 * `plans/consorzio/002-richieste-federica.md`.
 */

export const STUDENT_NAME_ORDERS = ["nome_cognome", "cognome_nome"] as const;
export type StudentNameOrder = (typeof STUDENT_NAME_ORDERS)[number];

/** Il comportamento storico, e quello di tutte le autoscuole non consorzio. */
export const DEFAULT_STUDENT_NAME_ORDER: StudentNameOrder = "nome_cognome";

export const STUDENT_NAME_ORDER_LABELS: Record<StudentNameOrder, string> = {
  nome_cognome: "Nome e cognome",
  cognome_nome: "Cognome e nome",
};

export const STUDENT_NAME_ORDER_HINTS: Record<StudentNameOrder, string> = {
  nome_cognome: "Mario Rossi",
  cognome_nome: "Rossi Mario",
};

/** Normalizza il valore grezzo del JSON limits. Sconosciuto → default. */
export function asStudentNameOrder(value: unknown): StudentNameOrder {
  return typeof value === "string" &&
    (STUDENT_NAME_ORDERS as readonly string[]).includes(value)
    ? (value as StudentNameOrder)
    : DEFAULT_STUDENT_NAME_ORDER;
}

type NameParts = { firstName?: string | null; lastName?: string | null };

/**
 * Nome completo nell'ordine scelto dall'autoscuola.
 *
 * Tollera le parti mancanti senza lasciare spazi orfani: in agenda alcune righe
 * hanno solo il nome (le guide di gruppo ci mettono l'etichetta del gruppo nel
 * campo `firstName` e lasciano vuoto il cognome), e non devono diventare
 * "Guida di gruppo · 2/3 " con lo spazio in coda.
 */
export function formatStudentName(
  student: NameParts,
  order: StudentNameOrder = DEFAULT_STUDENT_NAME_ORDER,
): string {
  const first = (student.firstName ?? "").trim();
  const last = (student.lastName ?? "").trim();
  if (!first || !last) return first || last;
  return order === "cognome_nome" ? `${last} ${first}` : `${first} ${last}`;
}

/**
 * Forma breve per gli spazi stretti (blocco agenda in vista settimana), dove
 * per esteso non ci sta: "Mario R." oppure "Rossi M.".
 *
 * L'iniziale è sempre quella della parte che viene **omessa**, così la parte
 * per cui l'autoscuola ordina resta quella leggibile per intero.
 */
export function formatStudentNameShort(
  student: NameParts,
  order: StudentNameOrder = DEFAULT_STUDENT_NAME_ORDER,
): string {
  const first = (student.firstName ?? "").trim();
  const last = (student.lastName ?? "").trim();
  if (!first || !last) return first || last;
  return order === "cognome_nome"
    ? `${last} ${first.charAt(0)}.`
    : `${first} ${last.charAt(0)}.`;
}

/**
 * Comparatore per le liste di allievi: ordina per la parte che viene scritta
 * per prima, con la seconda come spareggio. Un'autoscuola che legge "Rossi
 * Mario" si aspetta di trovarlo alla R, non alla M.
 *
 * `localeCompare` italiano con `sensitivity: "base"`: le anagrafiche reali
 * mescolano maiuscole e minuscole ("VERONICA BILIOTTI" accanto a "Luca rubino")
 * e un ordinamento che separa i due casi sembra rotto.
 */
export function studentNameComparator<T extends NameParts>(
  order: StudentNameOrder = DEFAULT_STUDENT_NAME_ORDER,
): (a: T, b: T) => number {
  const collator = new Intl.Collator("it", { sensitivity: "base", numeric: true });
  return (a, b) => {
    const aFirst = (a.firstName ?? "").trim();
    const aLast = (a.lastName ?? "").trim();
    const bFirst = (b.firstName ?? "").trim();
    const bLast = (b.lastName ?? "").trim();
    const [aPrimary, aSecondary] =
      order === "cognome_nome" ? [aLast, aFirst] : [aFirst, aLast];
    const [bPrimary, bSecondary] =
      order === "cognome_nome" ? [bLast, bFirst] : [bFirst, bLast];
    const primary = collator.compare(aPrimary, bPrimary);
    return primary !== 0 ? primary : collator.compare(aSecondary, bSecondary);
  };
}

/** Copia ordinata della lista (non muta l'array in ingresso). */
export function sortStudentsByName<T extends NameParts>(
  list: T[],
  order: StudentNameOrder = DEFAULT_STUDENT_NAME_ORDER,
): T[] {
  return [...list].sort(studentNameComparator<T>(order));
}

/**
 * Iniziali per l'avatar, nell'ordine in cui il nome viene scritto: se in lista
 * si legge "Rossi Mario", un avatar "MR" sembra un errore.
 */
export function studentInitials(
  student: NameParts,
  order: StudentNameOrder = DEFAULT_STUDENT_NAME_ORDER,
): string {
  const first = (student.firstName ?? "").trim()[0] ?? "";
  const last = (student.lastName ?? "").trim()[0] ?? "";
  const pair = order === "cognome_nome" ? `${last}${first}` : `${first}${last}`;
  return pair.toUpperCase() || "?";
}

/**
 * Ricerca per nome **indipendente dall'ordine**: chi scrive "Rossi Mario" lo
 * trova anche dove l'app scrive "Mario Rossi", e viceversa. Senza questo, il
 * setting spezzerebbe le ricerche invece di assecondarle.
 */
export function studentMatchesQuery(student: NameParts, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const first = (student.firstName ?? "").trim().toLowerCase();
  const last = (student.lastName ?? "").trim().toLowerCase();
  return `${first} ${last}`.includes(q) || `${last} ${first}`.includes(q);
}

/**
 * Nome e cognome da `User.name`, che nel database è **un campo solo**.
 *
 * È la stessa euristica che il server applica in `parseNameParts`
 * (`lib/actions/autoscuole.actions.ts`) per costruire la directory allievi: si
 * spezza sul primo spazio e il resto è cognome. Sta qui perché ci sia **un solo
 * posto** che indovina, invece di una copia per ogni schermata.
 *
 * Da qui la conseguenza che conta: le superfici che ricevono già
 * `firstName`/`lastName` **non hanno dati più puliti** delle altre — hanno solo
 * la stessa congettura fatta prima, lato server. Applicarla anche qui non
 * aggiunge una classe di errore nuova. Vedi REG-508 per la correzione vera.
 */
export function splitStoredName(name: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  const clean = (name ?? "").trim().replace(/\s+/g, " ");
  if (!clean) return { firstName: "", lastName: "" };
  const [first, ...rest] = clean.split(" ");
  return { firstName: first ?? "", lastName: rest.join(" ") };
}

/** Come `formatStudentName`, partendo dal campo unico del database. */
export function formatStoredName(
  name: string | null | undefined,
  order: StudentNameOrder = DEFAULT_STUDENT_NAME_ORDER,
): string {
  return formatStudentName(splitStoredName(name), order);
}

/** Iniziali per l'avatar partendo dal campo unico del database. */
export function storedNameInitials(
  name: string | null | undefined,
  order: StudentNameOrder = DEFAULT_STUDENT_NAME_ORDER,
): string {
  return studentInitials(splitStoredName(name), order);
}

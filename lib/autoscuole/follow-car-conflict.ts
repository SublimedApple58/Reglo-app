/**
 * Le due regole di lettura della schermata «Auto al seguito occupata»: in che
 * ordine si mostrano le date da sistemare e quante guide promette il bottone.
 *
 * Stanno qui, fuori dal componente, per due motivi: si provano senza montare
 * React, e l'app istruttore ne tiene una copia gemella
 * (`reglo-mobile/src/components/booking/FollowCarConflictSheet.tsx`) che deve
 * dire le stesse cose.
 */

/** Quel poco che serve per decidere: il resto della riga non c'entra. */
type ConflictLike = {
  index: number;
  startsAt: string;
  conflict?: unknown;
};

/**
 * Le date da sistemare in ordine **cronologico**, non in quello in cui sono
 * state digitate: qui si guarda un calendario, e un 15:00 in mezzo fra le 9 e
 * le 11 fa perdere il filo. Si numerano poi di seguito (1, 2, 3...).
 */
export const orderConflicts = <T extends ConflictLike>(entries: readonly T[]): T[] =>
  entries.filter((entry) => entry.conflict).sort((a, b) => a.startsAt.localeCompare(b.startsAt));

/**
 * Quante guide nascono premendo **adesso**: le date libere piu' quelle gia'
 * sistemate, meno quelle tolte. Il bottone non promette numeri che non puo'
 * mantenere — una riga ancora senza risposta non e' una guida.
 */
export const countCreatable = <T extends ConflictLike>(
  entries: readonly T[],
  choice: Record<number, unknown>,
): number =>
  entries.filter(
    (entry) =>
      choice[entry.index] !== "remove" &&
      (!entry.conflict || choice[entry.index] !== undefined),
  ).length;

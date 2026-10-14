/**
 * Ricerca di persone in una lista: nome e cognome, senza accenti ne' maiuscole.
 *
 * Nata per il foglio «Aggiungi allievo» (REG-617), dove l'elenco degli idonei
 * su un'autoscuola vera arriva a qualche centinaio di righe e scorrerlo a mano
 * non e' una risposta. La stessa regola vale ovunque si cerchi una persona, e
 * da qui la usano i dialoghi delle guide di gruppo sul web; il picker nativo
 * del mobile la rispecchia.
 *
 * Due scelte dietro il comportamento:
 *
 * 1. **Senza accenti**: chi cerca scrive "Nicolo", non "Nicolò" — e sulla
 *    tastiera di un telefono l'accento e' un ostacolo, non un dettaglio.
 * 2. **A parole, non a sottostringa**: "rossi mario" trova "Mario Rossi".
 *    Chi cerca non sa in che ordine la lista tiene nome e cognome, e
 *    `includes` secco glielo farebbe indovinare.
 */

/** Minuscolo e senza segni diacritici: la forma in cui si confronta. */
export const foldForSearch = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Vero se ogni parola della ricerca compare in `haystack`, in qualunque
 * ordine. Una ricerca vuota (o di soli spazi) non filtra niente.
 */
export const matchesPersonSearch = (haystack: string, query: string): boolean => {
  const needles = foldForSearch(query).split(/\s+/).filter(Boolean);
  if (!needles.length) return true;
  const hay = foldForSearch(haystack);
  return needles.every((needle) => hay.includes(needle));
};

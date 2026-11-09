import { z } from "zod";

/**
 * REG-640: esaminatori dell'esame.
 *
 * Sono persone ESTERNE (la motorizzazione), non istruttori: per questo sono
 * nomi liberi e non una relazione. Di solito uno, mai tanti — il tetto serve
 * solo a non far entrare spazzatura. Come le note, vivono su ogni riga
 * dell'esame (una per allievo), quindi chi li scrive li scrive per tutto lo
 * slot.
 */
export const EXAMINERS_MAX = 5;
export const EXAMINER_NAME_MAX = 80;

export const examinersSchema = z.array(z.string().max(EXAMINER_NAME_MAX)).max(EXAMINERS_MAX * 2);

/** Spazi ripuliti, righe vuote via, doppioni (senza badare alle maiuscole) via. */
export const normalizeExaminers = (names: readonly string[] | null | undefined): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names ?? []) {
    const name = raw.replace(/\s+/g, " ").trim().slice(0, EXAMINER_NAME_MAX);
    if (!name) continue;
    const key = name.toLocaleLowerCase("it");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length === EXAMINERS_MAX) break;
  }
  return out;
};

/**
 * Nome della Company creata per un'autoscuola consorziata.
 *
 * Le 37 anagrafiche in produzione sono scritte in MAIUSCOLO ("ODOS CISANELLO",
 * "AUTOSCUOLE SAGGINI COLLINE", "S.CROCE S/ARNO"): buone per un elenco
 * contabile, brutte come nome di un account che il titolare si vedrà nella
 * propria shell. Decisione di Tiziano (25/09): Title Case.
 *
 * Regole, tutte nate dai dati veri:
 * - si capitalizza dentro ogni segmento separato da spazio, punto, slash o
 *   trattino ("ODOS S.CROCE" → "Odos S.Croce", "S/ARNO" → "S/Arno");
 * - le sigle di 1-2 lettere restano maiuscole ("CAR" resta "Car" perché è una
 *   parola di 3, ma "AC" resterebbe "AC");
 * - le particelle italiane in mezzo al nome restano minuscole
 *   ("AUTOSCUOLA DI PISA" → "Autoscuola di Pisa"), mai la prima parola;
 * - un nome già scritto in minuscolo/misto NON si tocca: se qualcuno ha già
 *   curato la capitalizzazione, riscriverla è un peggioramento.
 */

const PARTICLES = new Set([
  "di",
  "de",
  "del",
  "della",
  "dello",
  "dei",
  "degli",
  "delle",
  "da",
  "dal",
  "e",
  "ed",
  "in",
  "la",
  "le",
  "lo",
  "il",
  "su",
  "sul",
]);

const capitalizeSegment = (segment: string): string => {
  if (segment.length === 0) return segment;
  // Sigle corte: "AC", "F", "SG" restano come sono.
  if (segment.length <= 2) return segment;
  return segment[0].toUpperCase() + segment.slice(1).toLowerCase();
};

export function affiliateCompanyName(schoolName: string): string {
  const trimmed = schoolName.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) return trimmed;

  // Già curato a mano (contiene minuscole): si rispetta.
  if (/[a-zà-ù]/.test(trimmed)) return trimmed;

  const words = trimmed.split(" ");
  return words
    .map((word, index) => {
      // I separatori interni (punto, slash, trattino) vanno capitalizzati
      // anch'essi: "S.CROCE" → "S.Croce", "S/ARNO" → "S/Arno".
      const rebuilt = word
        .split(/([./-])/)
        .map((part) => (/^[./-]$/.test(part) ? part : capitalizeSegment(part)))
        .join("");
      const lower = word.toLowerCase();
      // Le particelle si valutano PRIMA della regola sulle sigle corte,
      // altrimenti "LE PIAGGE" finiva in "LE Piagge" ("LE" è di 2 lettere).
      if (PARTICLES.has(lower)) {
        return index === 0 ? lower[0].toUpperCase() + lower.slice(1) : lower;
      }
      return rebuilt;
    })
    .join(" ");
}

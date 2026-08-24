// Tipo strutturato di una guida MOTO: "birilli" (prova in area chiusa, slalom
// tra i coni) vs "strada" (guida su strada aperta). Attributo OPZIONALE della
// guida moto individuale — non una nota libera. Null = non specificato / guida
// non-moto. Modulo client-safe (niente "use server"): condiviso tra form di
// creazione, dialog di modifica e rendering dei blocchi in agenda.

export const MOTO_LESSON_TYPES = ["birilli", "strada"] as const;

export type MotoLessonType = (typeof MOTO_LESSON_TYPES)[number];

export const MOTO_LESSON_TYPE_LABELS: Record<MotoLessonType, string> = {
  birilli: "Birilli",
  strada: "Strada",
};

// Descrizione breve mostrata sotto l'etichetta nei selettori.
export const MOTO_LESSON_TYPE_HINTS: Record<MotoLessonType, string> = {
  birilli: "Area chiusa · coni",
  strada: "Guida su strada",
};

// Normalizza un valore sconosciuto (query string, payload) a un MotoLessonType
// valido o null.
export function asMotoLessonType(value: unknown): MotoLessonType | null {
  return typeof value === "string" &&
    (MOTO_LESSON_TYPES as readonly string[]).includes(value)
    ? (value as MotoLessonType)
    : null;
}

export function motoLessonTypeLabel(value: unknown): string | null {
  const t = asMotoLessonType(value);
  return t ? MOTO_LESSON_TYPE_LABELS[t] : null;
}

import { z } from "zod";

/**
 * Reglo Aula — schema del contenuto slide (il "pacchetto .rppt").
 *
 * Il pacchetto è un oggetto JSON salvato su R2 e referenziato da
 * `AulaLesson.packageR2Key`. NON sta nel DB. Vedi docs/features/reglo-aula.md.
 *
 * Set di blocchi chiuso e minimo (MVP). Le immagini sono binari su R2: il blocco
 * porta solo l'`r2Key`. `quizRef` richiama una `QuizQuestion` della banca globale.
 */

export const slideBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: z.string().max(200) }),
  z.object({ type: z.literal("text"), text: z.string().max(4000) }),
  z.object({
    type: z.literal("image"),
    r2Key: z.string().min(1),
    caption: z.string().max(300).optional(),
  }),
  z.object({
    type: z.literal("bullets"),
    items: z.array(z.string().max(500)).max(20),
  }),
  z.object({ type: z.literal("quizRef"), questionId: z.string().uuid() }),
]);

export type SlideBlock = z.infer<typeof slideBlockSchema>;

/** Una slide = un array ordinato di blocchi. */
export const slideSchema = z.array(slideBlockSchema).max(30);
export type Slide = z.infer<typeof slideSchema>;

/** Versione corrente del formato pacchetto. */
export const AULA_PACKAGE_VERSION = 1 as const;

export const slidePackageSchema = z.object({
  version: z.literal(AULA_PACKAGE_VERSION),
  slides: z.array(slideSchema).max(200),
});

export type SlidePackage = z.infer<typeof slidePackageSchema>;

/** Pacchetto vuoto di partenza (usato alla creazione di una lezione). */
export const emptyPackage = (): SlidePackage => ({
  version: AULA_PACKAGE_VERSION,
  slides: [],
});

/** Estrae gli `r2Key` immagine referenziati (utile per cleanup / copia asset). */
export const collectImageKeys = (pkg: SlidePackage): string[] => {
  const keys: string[] = [];
  for (const slide of pkg.slides) {
    for (const block of slide) {
      if (block.type === "image") keys.push(block.r2Key);
    }
  }
  return keys;
};

/** Estrae gli id `QuizQuestion` referenziati nelle slide. */
export const collectQuizRefIds = (pkg: SlidePackage): string[] => {
  const ids: string[] = [];
  for (const slide of pkg.slides) {
    for (const block of slide) {
      if (block.type === "quizRef") ids.push(block.questionId);
    }
  }
  return ids;
};

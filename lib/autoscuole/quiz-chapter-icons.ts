/**
 * Icone degli argomenti (capitoli ministeriali) del quiz teoria.
 *
 * Stesso set usato dall'app mobile — Microsoft Fluent Emoji 3D, PNG 256x256 —
 * copiato da `reglo-mobile/assets/icons/chapters/chapter-NN.png` in
 * `public/images/3d/chapters/`, così un argomento ha la STESSA faccia sul web e
 * sul telefono. Il mapping è per `chapterNumber` (1-25), la stessa chiave usata
 * da `CHAPTER_ICONS` in `reglo-mobile/src/screens/TopicListScreen.tsx`: se lì
 * cambia un'icona, va ricopiata anche qui.
 */

/** Numeri di capitolo per cui esiste un'icona (1-25, i capitoli ministeriali). */
const CHAPTER_ICON_NUMBERS = new Set(
  Array.from({ length: 25 }, (_, index) => index + 1),
);

/**
 * Path pubblico dell'icona dell'argomento, o `null` se il capitolo non ne ha una
 * (capitoli fuori dai 25 ministeriali — per esempio i capitoli demo di staging):
 * in quel caso chi renderizza mostra il numero in un cerchio, come fa il mobile.
 */
export function quizChapterIconSrc(chapterNumber: number): string | null {
  if (!CHAPTER_ICON_NUMBERS.has(chapterNumber)) return null;
  return `/images/3d/chapters/chapter-${String(chapterNumber).padStart(2, "0")}.png`;
}

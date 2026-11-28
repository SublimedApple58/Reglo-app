import { currentAvatarKey } from "@/lib/images/avatar-variant";

/**
 * REG-818 — l'istruttore di un codice di invito, come lo mostra la conferma
 * della registrazione («È il tuo istruttore?»): nome, foto e colore.
 *
 * La foto è quella del profilo dell'utente collegato: la copia avatar 512 px
 * se è quella della foto attuale, altrimenti l'originale. Senza utente o
 * senza foto (o se la firma dell'URL fallisce) `photoUrl` è null e l'app
 * mostra le iniziali sul colore scelto dal titolare (`color`, null = automatico).
 */
export type SignupInstructor = {
  name: string;
  photoUrl: string | null;
  color: string | null;
};

export type SignupInstructorRow = {
  name: string;
  color: string | null;
  user: { image: string | null; imageAvatar: string | null } | null;
};

export async function buildSignupInstructor(
  row: SignupInstructorRow | null,
  signUrl: (key: string) => Promise<string>,
): Promise<SignupInstructor | null> {
  if (!row) return null;
  const image = row.user?.image ?? null;
  let photoUrl: string | null = null;
  if (image) {
    photoUrl = await signUrl(currentAvatarKey(image, row.user?.imageAvatar) ?? image).catch(() => null);
  }
  return { name: row.name, photoUrl, color: row.color ?? null };
}

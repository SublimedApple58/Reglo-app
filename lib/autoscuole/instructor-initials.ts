/**
 * REG-451 — helper PURI del QR istruttore (usabili anche lato client).
 */

export const INSTRUCTOR_LINK_PATH = "/i";

// Forma, non charset: i codici nuovi escludono 0/O/1/I, ma la validità vera la
// decide il lookup su DB (così non si scartano codici legacy).
const CODE_RE = /^[A-Z0-9]{6}$/;

/**
 * Normalizza quello che arriva da scanner o input manuale: il codice nudo
 * ("gm4k2p") o l'URL completo del QR (".../i/GM4K2P", anche con locale o query).
 * Ritorna null se non è un codice istruttore ben formato.
 */
export function normalizeInstructorCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim();
  const fromUrl = value.match(/\/i\/([A-Za-z0-9]{4,12})(?:[/?#]|$)/);
  if (fromUrl) value = fromUrl[1];
  value = value.replace(/\s+/g, "").toUpperCase();
  return CODE_RE.test(value) ? value : null;
}

export function instructorLinkUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}${INSTRUCTOR_LINK_PATH}/${code}`;
}

export function instructorInitials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  return initials || "IS";
}


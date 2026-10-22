import crypto from "crypto";
import { promisify } from "util";

/**
 * Mattoni crittografici dell'accesso personale al backoffice (REG-413).
 *
 * File puro (niente Next, niente Prisma) così lo usano sia le server action sia
 * `scripts/backoffice-admin.ts`. La password NON passa da `lib/encrypt.ts`:
 * quello è un HMAC veloce, pensato per i codici a scadenza; una password che
 * vive anni vuole un hash lento con sale proprio (scrypt).
 */

const scryptAsync = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS: crypto.ScryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Policy dell'accesso. */
export const BACKOFFICE_PASSWORD_MIN_LENGTH = 12;
export const BACKOFFICE_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 giorni
export const BACKOFFICE_LINK_TTL_MS = 30 * 60 * 1000; // 30 minuti
export const BACKOFFICE_MAX_FAILED_LOGINS = 5; // tentativi sbagliati prima del blocco
export const BACKOFFICE_LOCK_MS = 15 * 60 * 1000;
export const BACKOFFICE_LINK_COOLDOWN_MS = 60 * 1000;
export const BACKOFFICE_LINK_MAX_PER_WINDOW = 3;
export const BACKOFFICE_LINK_WINDOW_MS = 15 * 60 * 1000;

/** `scrypt$<salt hex>$<hash hex>` */
export async function hashBackofficePassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyBackofficePassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  const [scheme, saltHex, hashHex] = (stored ?? "").split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const derived = await scryptAsync(
    password,
    Buffer.from(saltHex, "hex"),
    expected.length,
    SCRYPT_OPTIONS,
  );
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

/** Token casuale per cookie di sessione e link di attivazione (in chiaro solo nel cookie/link). */
export const generateBackofficeToken = (): string => crypto.randomBytes(32).toString("base64url");

/** Sul DB finisce solo questo: chi legge le tabelle non può usare i token. */
export const hashBackofficeToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

/** Confronto a tempo costante tra due stringhe qualsiasi. */
export const safeEqual = (a: string, b: string): boolean => {
  const left = crypto.createHash("sha256").update(a).digest();
  const right = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(left, right);
};

/** Problema della password scelta, o null se va bene. */
export function backofficePasswordProblem(password: string, email: string): string | null {
  if (password.length < BACKOFFICE_PASSWORD_MIN_LENGTH) {
    return `La password deve avere almeno ${BACKOFFICE_PASSWORD_MIN_LENGTH} caratteri.`;
  }
  if (password.length > 200) return "La password è troppo lunga.";
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  const lower = password.toLowerCase();
  if (lower.includes("reglo") || (local && lower.includes(local.split(".")[0] ?? local))) {
    return "Evita nella password il tuo nome o la parola «reglo».";
  }
  return null;
}

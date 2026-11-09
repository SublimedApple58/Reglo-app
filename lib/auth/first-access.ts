/**
 * «Primo accesso» degli allievi creati col solo telefono (richiesta Ricca,
 * decisione Tiziano 09/11/2026: nessun codice).
 *
 * L'autoscuola crea l'allievo con nome, cognome, telefono e percorso: niente
 * email, niente password. Il ragazzo apre l'app, scrive il suo numero e, se
 * esiste un account MAI attivato con quel numero, completa i suoi dati (email,
 * password, data di nascita) ed entra.
 *
 * ⚠️ Senza codice, chi conosce il numero di un allievo non ancora attivato può
 * attivarlo al posto suo. Le protezioni sono volutamente leggere:
 * - vale solo per account mai attivati: dopo l'attivazione serve la password;
 * - limite di tentativi per numero e per IP;
 * - risposta generica quando il numero non corrisponde a un account da attivare;
 * - il titolare vede sul web se e quando l'allievo ha attivato l'account.
 */

import crypto from "crypto";

import { prisma } from "@/db/prisma";
import { releaseEmailIfOrphaned } from "@/lib/account-deletion";
import { hash } from "@/lib/encrypt";
import { normalizeLoginPhone } from "@/lib/users/login-phone";

/** Il permesso dura il tempo di compilare l'onboarding con calma. */
export const ACTIVATION_TOKEN_TTL_MS = 30 * 60 * 1000;

export const FIRST_ACCESS_NOT_FOUND_MESSAGE =
  "Non troviamo un account da attivare con questo numero. Controlla il numero, oppure accedi con la tua password se l'hai già attivato.";

export const FIRST_ACCESS_RATE_LIMIT_MESSAGE =
  "Troppi tentativi. Riprova tra qualche minuto.";

/** Un account si può attivare solo se non ha mai avuto una password. */
const pendingActivationWhere = (loginPhone: string) => ({
  loginPhone,
  password: null,
  profileCompletedAt: null,
  companyMembers: { some: { autoscuolaRole: "STUDENT" as const } },
});

/** Vero per un account creato col telefono e non ancora attivato. */
export const isActivationPending = (user: {
  loginPhone: string | null;
  password: string | null;
  profileCompletedAt: Date | null;
}) => Boolean(user.loginPhone) && !user.password && !user.profileCompletedAt;

const secret = () => {
  const value = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!value) throw new Error("NEXTAUTH_SECRET mancante.");
  return value;
};

const sign = (payload: string) =>
  crypto.createHmac("sha256", secret()).update(`first-access:${payload}`).digest("base64url");

/** Permesso firmato `<userId>.<scadenza>.<firma>`: niente tabelle, niente stato. */
export function createActivationToken(userId: string, now = Date.now()): string {
  const payload = `${userId}.${now + ACTIVATION_TOKEN_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

export function readActivationToken(token: string, now = Date.now()): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAt, signature] = parts;
  const expected = sign(`${userId}.${expiresAt}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!Number(expiresAt) || Number(expiresAt) < now) return null;
  return userId;
}

/** `User.name` è un campo solo: si spezza sul primo spazio (debito noto, student-name-order.ts). */
export function splitName(name: string | null): { firstName: string; lastName: string } {
  const clean = (name ?? "").trim();
  if (!clean || clean === "NO_NAME") return { firstName: "", lastName: "" };
  const space = clean.indexOf(" ");
  if (space < 0) return { firstName: clean, lastName: "" };
  return { firstName: clean.slice(0, space), lastName: clean.slice(space + 1).trim() };
}

export type FirstAccessStart =
  | {
      ok: true;
      activationToken: string;
      firstName: string;
      lastName: string;
      phone: string;
      companyName: string | null;
    }
  | { ok: false };

/** Primo passo: il numero corrisponde a un allievo da attivare? */
export async function startFirstAccess(rawPhone: string): Promise<FirstAccessStart> {
  const loginPhone = normalizeLoginPhone(rawPhone);
  if (!loginPhone) return { ok: false };

  const user = await prisma.user.findFirst({
    where: pendingActivationWhere(loginPhone),
    select: {
      id: true,
      name: true,
      companyMembers: {
        where: { autoscuolaRole: "STUDENT" },
        select: { company: { select: { name: true } } },
        take: 1,
      },
    },
  });
  if (!user) return { ok: false };

  return {
    ok: true,
    activationToken: createActivationToken(user.id),
    ...splitName(user.name),
    phone: loginPhone,
    companyName: user.companyMembers[0]?.company.name ?? null,
  };
}

export type FirstAccessDetails = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  /** `YYYY-MM-DD` */
  birthDate: string;
};

/**
 * Ultimo passo: salva i dati e attiva l'account. L'update è condizionato a
 * `password: null`, quindi due attivazioni concorrenti non possono vincere
 * entrambe e un account già attivato non si riattiva.
 */
export async function completeFirstAccess(
  userId: string,
  details: FirstAccessDetails,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const email = details.email.trim().toLowerCase();
  const emailFree = await releaseEmailIfOrphaned(email);
  if (!emailFree) {
    return { ok: false, message: "Questa email è già usata da un altro account." };
  }

  const passwordHash = await hash(details.password);
  const name = `${details.firstName.trim()} ${details.lastName.trim()}`;

  try {
    const result = await prisma.user.updateMany({
      where: { id: userId, password: null, profileCompletedAt: null, loginPhone: { not: null } },
      data: {
        name,
        email,
        password: passwordHash,
        birthDate: new Date(`${details.birthDate}T00:00:00.000Z`),
        profileCompletedAt: new Date(),
      },
    });
    if (result.count === 0) {
      return { ok: false, message: "Questo account è già stato attivato. Accedi con la tua password." };
    }
  } catch (error) {
    // Email presa nel frattempo da un altro account (vincolo unico).
    if ((error as { code?: string }).code === "P2002") {
      return { ok: false, message: "Questa email è già usata da un altro account." };
    }
    throw error;
  }
  return { ok: true };
}

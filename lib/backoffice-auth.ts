import { cookies } from "next/headers";

import { prisma } from "@/db/prisma";
import { GLOBAL_ADMIN_EMAIL } from "@/lib/constants";
import { hash } from "@/lib/encrypt";
import {
  BACKOFFICE_SESSION_TTL_MS,
  generateBackofficeToken,
  hashBackofficeToken,
  safeEqual,
} from "@/lib/backoffice/admin-credentials";

/**
 * Accesso al backoffice (REG-413).
 *
 * - **Personale** (il modo vero): ogni persona in `BackofficeAdmin` entra con la
 *   propria password; il cookie `reglo_backoffice_session` porta un token
 *   casuale e sul DB c'è solo il suo hash (`BackofficeSession`).
 * - **Credenziale unica (vecchia)**: resta finché il nuovo accesso non è
 *   verificato, ma SOLO se `GLOBAL_ADMIN_PASSWORD` è impostata nell'ambiente.
 *   Nel codice non c'è più nessuna password di riserva: togliere la variabile
 *   da Vercel = spegnere il vecchio accesso, senza deploy di codice.
 */

export const BACKOFFICE_COOKIE = "reglo_backoffice_auth";
export const BACKOFFICE_SESSION_COOKIE = "reglo_backoffice_session";

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/** Il vecchio accesso condiviso, se ancora acceso da env. */
export function legacyBackofficeCredential() {
  const password = process.env.GLOBAL_ADMIN_PASSWORD;
  if (!password) return null;
  return { email: GLOBAL_ADMIN_EMAIL.toLowerCase(), password };
}

export function matchesLegacyCredential(email: string, password: string) {
  const legacy = legacyBackofficeCredential();
  if (!legacy) return false;
  // Due confronti separati e sempre entrambi: niente scorciatoie temporali.
  const emailOk = safeEqual(email, legacy.email);
  const passwordOk = safeEqual(password, legacy.password);
  return emailOk && passwordOk;
}

async function legacyToken() {
  const legacy = legacyBackofficeCredential();
  return legacy ? hash(`${GLOBAL_ADMIN_EMAIL}:${legacy.password}`) : null;
}

export async function setLegacyBackofficeCookie() {
  const token = await legacyToken();
  if (!token) return;
  const cookieStore = await cookies();
  cookieStore.set(BACKOFFICE_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: 60 * 60 * 24 * 7 });
}

/** Apre una sessione personale e mette il cookie. */
export async function startBackofficeSession(adminId: string) {
  const token = generateBackofficeToken();
  const expiresAt = new Date(Date.now() + BACKOFFICE_SESSION_TTL_MS);
  await prisma.backofficeSession.create({
    data: { adminId, tokenHash: hashBackofficeToken(token), expiresAt },
  });
  const cookieStore = await cookies();
  cookieStore.set(BACKOFFICE_SESSION_COOKIE, token, { ...COOKIE_OPTIONS, expires: expiresAt });
  // Una sessione personale sostituisce quella condivisa.
  cookieStore.delete(BACKOFFICE_COOKIE);
}

export async function clearBackofficeCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get(BACKOFFICE_SESSION_COOKIE)?.value;
  if (token) {
    await prisma.backofficeSession.deleteMany({
      where: { tokenHash: hashBackofficeToken(token) },
    });
  }
  cookieStore.delete(BACKOFFICE_SESSION_COOKIE);
  cookieStore.delete(BACKOFFICE_COOKIE);
}

export type BackofficeIdentity =
  | { kind: "personal"; adminId: string; email: string; name: string }
  | { kind: "legacy"; email: string; name: null };

const TOUCH_EVERY_MS = 10 * 60 * 1000;

/** Chi sta usando il backoffice, o null se nessuno è entrato. */
export async function getBackofficeIdentity(): Promise<BackofficeIdentity | null> {
  const cookieStore = await cookies();

  const sessionToken = cookieStore.get(BACKOFFICE_SESSION_COOKIE)?.value;
  if (sessionToken) {
    const session = await prisma.backofficeSession.findUnique({
      where: { tokenHash: hashBackofficeToken(sessionToken) },
      include: { admin: { select: { id: true, email: true, name: true, disabledAt: true } } },
    });
    const now = Date.now();
    if (session && session.expiresAt.getTime() > now && !session.admin.disabledAt) {
      if (!session.lastUsedAt || now - session.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
        await prisma.backofficeSession
          .update({ where: { id: session.id }, data: { lastUsedAt: new Date(now) } })
          .catch(() => undefined);
      }
      return {
        kind: "personal",
        adminId: session.admin.id,
        email: session.admin.email,
        name: session.admin.name,
      };
    }
  }

  const legacyCookie = cookieStore.get(BACKOFFICE_COOKIE)?.value;
  if (legacyCookie) {
    const expected = await legacyToken();
    if (expected && safeEqual(legacyCookie, expected)) {
      return { kind: "legacy", email: GLOBAL_ADMIN_EMAIL, name: null };
    }
  }

  return null;
}

export async function validateBackofficeCookie() {
  return (await getBackofficeIdentity()) !== null;
}

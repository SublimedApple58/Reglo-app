"use server";

import { z } from "zod";

import { formatError } from "@/lib/utils";
import {
  clearBackofficeCookie,
  getBackofficeIdentity,
  matchesLegacyCredential,
  setLegacyBackofficeCookie,
  startBackofficeSession,
} from "@/lib/backoffice-auth";
import {
  BACKOFFICE_INVALID_LOGIN,
  BACKOFFICE_LINK_SENT,
  completeBackofficeAccessLink,
  requestBackofficeAccessLink,
  verifyBackofficeAdminLogin,
} from "@/lib/backoffice/admin-access";

/**
 * Server action dell'accesso al backoffice (REG-413). La logica sta in
 * `lib/backoffice/admin-access.ts`; qui solo validazione e cookie.
 */

const signInSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
});

export async function backofficeSignIn(input: z.infer<typeof signInSchema>) {
  try {
    const parsed = signInSchema.safeParse(input);
    if (!parsed.success) return { success: false as const, message: BACKOFFICE_INVALID_LOGIN };
    const email = parsed.data.email.toLowerCase();
    const { password } = parsed.data;

    // Vecchia credenziale condivisa: vale solo finché è impostata nell'ambiente.
    if (matchesLegacyCredential(email, password)) {
      await setLegacyBackofficeCookie();
      return { success: true as const };
    }

    const result = await verifyBackofficeAdminLogin(email, password);
    if (!result.ok) return { success: false as const, message: result.message };

    await startBackofficeSession(result.adminId);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function backofficeSignOut() {
  await clearBackofficeCookie();
}

const requestLinkSchema = z.object({
  email: z.string().trim().email(),
  locale: z.string().max(5).optional(),
});

export async function requestBackofficeLink(input: z.infer<typeof requestLinkSchema>) {
  try {
    const parsed = requestLinkSchema.safeParse(input);
    if (parsed.success) {
      await requestBackofficeAccessLink(parsed.data.email, parsed.data.locale ?? "it");
    }
    // Sempre lo stesso messaggio: la risposta non rivela chi ha accesso.
    return { success: true as const, message: BACKOFFICE_LINK_SENT };
  } catch (error) {
    console.error("[backoffice-access] request link failed", error);
    return { success: true as const, message: BACKOFFICE_LINK_SENT };
  }
}

const completeSchema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(1).max(200),
});

export async function completeBackofficeLink(input: z.infer<typeof completeSchema>) {
  try {
    const parsed = completeSchema.safeParse(input);
    if (!parsed.success) return { success: false as const, message: "Dati non validi." };
    const result = await completeBackofficeAccessLink(parsed.data.token, parsed.data.password);
    if (!result.ok) return { success: false as const, message: result.message };
    await startBackofficeSession(result.adminId);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/** Per l'intestazione: chi è entrato (nome) o la vecchia credenziale condivisa. */
export async function getBackofficeWhoAmI() {
  const identity = await getBackofficeIdentity();
  if (!identity) return null;
  return identity.kind === "personal"
    ? { kind: "personal" as const, name: identity.name, email: identity.email }
    : { kind: "legacy" as const, name: null, email: identity.email };
}

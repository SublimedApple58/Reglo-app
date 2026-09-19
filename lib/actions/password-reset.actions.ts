'use server';

import { z } from 'zod';
import { isRedirectError } from 'next/dist/client/components/redirect-error';

import { signIn } from '@/auth';
import { prisma } from '@/db/prisma';
import {
  applyNewPassword,
  checkPasswordResetCode,
  requestPasswordResetCode,
  RESET_GENERIC_REQUEST_MESSAGE,
  RESET_INVALID_CODE_MESSAGE,
} from '@/lib/auth/password-reset';

/**
 * Recupero password lato **web** (`/[locale]/reset-password`).
 *
 * Stesso identico meccanismo del mobile — codice OTP di 6 cifre via email, 15
 * minuti di validità, 5 tentativi — perché il cuore è condiviso in
 * `lib/auth/password-reset.ts`. Qui sopra ci sono solo l'involucro da server
 * action e i messaggi in italiano per il form.
 *
 * Nota: un file `'use server'` può esportare **solo funzioni async**, quindi gli
 * schemi Zod restano privati.
 */

type ActionResult = { success: boolean; message: string };

const emailSchema = z.string().trim().toLowerCase().email();

const passwordSchema = z
  .object({
    password: z.string().min(6, 'La password deve avere almeno 6 caratteri.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Le due password non coincidono.',
    path: ['confirmPassword'],
  });

/** Codice a 6 cifre, così com'è digitato nel form (spazi tollerati). */
const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, RESET_INVALID_CODE_MESSAGE);

/**
 * Passo 1 — manda il codice. La risposta è **sempre** la stessa, che l'email
 * esista, sia sconosciuta o abbia già chiesto troppi codici: altrimenti questa
 * pagina pubblica diventerebbe un modo per sapere chi ha un account Reglo.
 */
export async function sendPasswordResetCode(rawEmail: string): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(rawEmail);

  if (!parsed.success) {
    return { success: false, message: 'Inserisci un indirizzo email valido.' };
  }

  try {
    await requestPasswordResetCode(parsed.data, 'browser');
  } catch (error) {
    console.error('[password-reset] request failed', error);
    return {
      success: false,
      message: 'Non siamo riusciti a inviare il codice. Riprova tra un minuto.',
    };
  }

  return { success: true, message: RESET_GENERIC_REQUEST_MESSAGE };
}

/**
 * Passo 2 — controlla il codice senza consumarlo, così l'utente può tornare
 * indietro sul passo password senza bruciarlo.
 */
export async function verifyPasswordResetCode(
  rawEmail: string,
  rawCode: string,
): Promise<ActionResult> {
  const email = emailSchema.safeParse(rawEmail);
  const code = codeSchema.safeParse(rawCode);

  if (!email.success || !code.success) {
    return { success: false, message: RESET_INVALID_CODE_MESSAGE };
  }

  const check = await checkPasswordResetCode(email.data, code.data);

  if (!check.ok) {
    return { success: false, message: RESET_INVALID_CODE_MESSAGE };
  }

  return { success: true, message: '' };
}

/**
 * Passo 3 — imposta la nuova password e fa entrare l'utente.
 *
 * In caso di successo **non ritorna**: `signIn` lancia il redirect di Next, che
 * va rilanciato così com'è. Il valore di ritorno serve solo agli errori.
 */
export async function completePasswordReset(input: {
  email: string;
  code: string;
  password: string;
  confirmPassword: string;
  callbackUrl?: string;
}): Promise<ActionResult> {
  const email = emailSchema.safeParse(input.email);
  const code = codeSchema.safeParse(input.code);

  if (!email.success || !code.success) {
    return { success: false, message: RESET_INVALID_CODE_MESSAGE };
  }

  const password = passwordSchema.safeParse({
    password: input.password,
    confirmPassword: input.confirmPassword,
  });

  if (!password.success) {
    return {
      success: false,
      message: password.error.issues[0]?.message ?? 'Password non valida.',
    };
  }

  // Ricontrolla il codice: tra il passo 2 e qui può essere scaduto, e questo è
  // l'unico punto che lo consuma davvero.
  const check = await checkPasswordResetCode(email.data, code.data);

  if (!check.ok) {
    return { success: false, message: RESET_INVALID_CODE_MESSAGE };
  }

  await applyNewPassword({
    userId: check.userId,
    codeId: check.codeId,
    password: password.data.password,
  });

  // Auto-login, come fa il mobile dopo il reset: la password l'ha appena
  // scelta lui, richiederla sarebbe solo un passaggio in più.
  try {
    const memberships = await prisma.companyMember.count({
      where: { userId: check.userId },
    });

    const callbackUrl = input.callbackUrl?.startsWith('/') ? input.callbackUrl : '/';
    const redirectTo =
      memberships > 1
        ? '/select-company'
        : callbackUrl.includes('/sign-in') || callbackUrl.includes('/reset-password')
          ? '/'
          : callbackUrl;

    await signIn('credentials', {
      email: email.data,
      password: password.data.password,
      redirectTo,
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;

    // La password È stata cambiata: dirlo, invece di far ritentare il reset con
    // un codice ormai consumato.
    console.error('[password-reset] auto sign-in failed', error);
    return {
      success: true,
      message: 'Password aggiornata. Accedi con le nuove credenziali.',
    };
  }

  return { success: true, message: '' };
}

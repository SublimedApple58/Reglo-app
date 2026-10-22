import { after } from "next/server";

import { prisma } from "@/db/prisma";
import { sendDynamicEmail } from "@/email";
import { SERVER_URL } from "@/lib/constants";
import {
  BACKOFFICE_LINK_COOLDOWN_MS,
  BACKOFFICE_LINK_MAX_PER_WINDOW,
  BACKOFFICE_LINK_TTL_MS,
  BACKOFFICE_LINK_WINDOW_MS,
  BACKOFFICE_LOCK_MS,
  BACKOFFICE_MAX_FAILED_LOGINS,
  backofficePasswordProblem,
  generateBackofficeToken,
  hashBackofficeToken,
  hashBackofficePassword,
  verifyBackofficePassword,
} from "@/lib/backoffice/admin-credentials";

/**
 * Flussi dell'accesso personale al backoffice (REG-413): login, link di
 * attivazione / nuova password, scelta della password. Stessa filosofia del
 * recupero password delle app (`lib/auth/password-reset.ts`): messaggi che non
 * dicono se un'email esiste, token monouso salvati solo come hash, tentativi
 * contati.
 */

export const BACKOFFICE_INVALID_LOGIN = "Email o password non corretti.";
export const BACKOFFICE_LOCKED_LOGIN =
  "Troppi tentativi sbagliati. Riprova tra qualche minuto o chiedi un link per una nuova password.";
export const BACKOFFICE_LINK_SENT =
  "Se l'indirizzo ha accesso al pannello, ti abbiamo mandato un link. Controlla la posta.";
export const BACKOFFICE_INVALID_LINK = "Il link non è valido o è scaduto. Chiedine uno nuovo.";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

type SignInResult = { ok: true; adminId: string } | { ok: false; message: string };

/** Controlla email e password personali; conta i tentativi sbagliati. */
export async function verifyBackofficeAdminLogin(
  rawEmail: string,
  password: string,
): Promise<SignInResult> {
  const email = normalizeEmail(rawEmail);
  const admin = await prisma.backofficeAdmin.findUnique({ where: { email } });

  if (!admin || admin.disabledAt || !admin.passwordHash) {
    // Stesso costo di una verifica vera: il tempo di risposta non dice chi esiste.
    await verifyBackofficePassword(password, DUMMY_HASH);
    return { ok: false, message: BACKOFFICE_INVALID_LOGIN };
  }

  if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
    return { ok: false, message: BACKOFFICE_LOCKED_LOGIN };
  }

  if (!(await verifyBackofficePassword(password, admin.passwordHash))) {
    const failed = admin.failedLoginCount + 1;
    const lock = failed >= BACKOFFICE_MAX_FAILED_LOGINS;
    await prisma.backofficeAdmin.update({
      where: { id: admin.id },
      data: lock
        ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + BACKOFFICE_LOCK_MS) }
        : { failedLoginCount: failed },
    });
    return { ok: false, message: lock ? BACKOFFICE_LOCKED_LOGIN : BACKOFFICE_INVALID_LOGIN };
  }

  await prisma.backofficeAdmin.update({
    where: { id: admin.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  return { ok: true, adminId: admin.id };
}

// Hash di una password a caso: serve solo a spendere lo stesso tempo.
const DUMMY_HASH =
  "scrypt$00000000000000000000000000000000$" + "0".repeat(128);

/** Crea un link monouso per l'admin (brucia i precedenti). Restituisce l'URL in chiaro. */
export async function createBackofficeAccessLink(adminId: string, locale = "it") {
  const token = generateBackofficeToken();
  await prisma.$transaction([
    prisma.backofficeAdminToken.updateMany({
      where: { adminId, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.backofficeAdminToken.create({
      data: {
        adminId,
        tokenHash: hashBackofficeToken(token),
        expiresAt: new Date(Date.now() + BACKOFFICE_LINK_TTL_MS),
      },
    }),
  ]);
  const base = SERVER_URL.replace(/\/$/, "");
  return `${base}/${locale}/backoffice-sign-in/attiva?t=${encodeURIComponent(token)}`;
}

async function canRequestLink(adminId: string) {
  const now = Date.now();
  const recent = await prisma.backofficeAdminToken.findMany({
    where: { adminId, createdAt: { gt: new Date(now - BACKOFFICE_LINK_WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (recent.length >= BACKOFFICE_LINK_MAX_PER_WINDOW) return false;
  if (recent[0] && now - recent[0].createdAt.getTime() < BACKOFFICE_LINK_COOLDOWN_MS) return false;
  return true;
}

/**
 * «Primo accesso o password dimenticata»: manda il link alla mail Reglo della
 * persona. Non restituisce niente di proposito: il chiamante risponde sempre
 * `BACKOFFICE_LINK_SENT`, che l'indirizzo sia abilitato o no.
 */
export async function requestBackofficeAccessLink(rawEmail: string, locale = "it") {
  const email = normalizeEmail(rawEmail);
  const admin = await prisma.backofficeAdmin.findUnique({ where: { email } });
  if (!admin || admin.disabledAt || !(await canRequestLink(admin.id))) return;

  const url = await createBackofficeAccessLink(admin.id, locale);
  const firstName = admin.name.split(" ")[0] || admin.name;
  const minutes = Math.round(BACKOFFICE_LINK_TTL_MS / 60000);
  const isFirstAccess = !admin.passwordHash;

  after(async () => {
    try {
      await sendDynamicEmail({
        to: admin.email,
        internalStaffOnly: true,
        subject: isFirstAccess
          ? "Attiva il tuo accesso al pannello Reglo"
          : "Scegli una nuova password per il pannello Reglo",
        heading: isFirstAccess ? "Il tuo accesso al pannello" : "Nuova password",
        body: [
          `Ciao ${firstName},`,
          "",
          isFirstAccess
            ? "da oggi al pannello di amministrazione Reglo si entra con un accesso personale. Apri il link e scegli la tua password."
            : "hai chiesto di cambiare la password del pannello di amministrazione Reglo. Apri il link e scegline una nuova.",
        ].join("\n"),
        cta: { label: isFirstAccess ? "Scegli la password" : "Imposta la nuova password", url },
        bodyAfter: `Il link vale ${minutes} minuti e si può usare una volta sola.`,
        footerNote:
          "Se non l'hai chiesto tu, ignora questa email: senza il link nessuno può entrare al posto tuo.",
      });
    } catch (err) {
      console.error("[backoffice-access] email send failed", err);
    }
  });
}

/** Il link è ancora buono? Restituisce a chi appartiene, senza consumarlo. */
export async function findBackofficeAccessLink(token: string) {
  if (!token) return null;
  const record = await prisma.backofficeAdminToken.findUnique({
    where: { tokenHash: hashBackofficeToken(token) },
    include: { admin: { select: { id: true, email: true, name: true, disabledAt: true, passwordHash: true } } },
  });
  if (
    !record ||
    record.consumedAt ||
    record.expiresAt.getTime() <= Date.now() ||
    record.admin.disabledAt
  ) {
    return null;
  }
  return {
    tokenId: record.id,
    adminId: record.admin.id,
    email: record.admin.email,
    name: record.admin.name,
    isFirstAccess: !record.admin.passwordHash,
  };
}

type CompleteResult = { ok: true; adminId: string } | { ok: false; message: string };

/**
 * Imposta la password dal link: consuma il link, sblocca l'account e chiude
 * TUTTE le sessioni aperte (se qualcuno era dentro con la vecchia, esce).
 */
export async function completeBackofficeAccessLink(
  token: string,
  password: string,
): Promise<CompleteResult> {
  const link = await findBackofficeAccessLink(token);
  if (!link) return { ok: false, message: BACKOFFICE_INVALID_LINK };

  const problem = backofficePasswordProblem(password, link.email);
  if (problem) return { ok: false, message: problem };

  const passwordHash = await hashBackofficePassword(password);
  const now = new Date();
  // Il consumo è condizionato: due invii simultanei dello stesso link non passano entrambi.
  const consumed = await prisma.backofficeAdminToken.updateMany({
    where: { id: link.tokenId, consumedAt: null },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) return { ok: false, message: BACKOFFICE_INVALID_LINK };

  await prisma.$transaction([
    prisma.backofficeAdmin.update({
      where: { id: link.adminId },
      data: {
        passwordHash,
        passwordSetAt: now,
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: now,
      },
    }),
    prisma.backofficeSession.deleteMany({ where: { adminId: link.adminId } }),
  ]);

  return { ok: true, adminId: link.adminId };
}

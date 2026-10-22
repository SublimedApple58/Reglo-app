import { Resend } from "resend";
import {
  APP_NAME,
  DEFAULT_EMAIL_SENDER,
  SERVER_URL,
  VERIFIED_EMAIL_SENDERS,
} from "@/lib/constants";
import { externalSendsDisabled } from "@/lib/app-env";
import {
  renderRegloEmail,
  renderRegloEmailText,
  type EmailCta,
  type EmailHighlight,
} from "./template";

/**
 * Destinatari interni (staff Reglo): l'unica eccezione al kill switch di
 * staging. Il blocco esiste perché il DB di staging contiene i contatti veri
 * delle autoscuole; una mail a un indirizzo @reglo.it non raggiunge nessun
 * cliente. Il controllo sta qui, non nel chiamante: anche passando l'opzione
 * per errore, un indirizzo esterno resta muto.
 */
const isInternalRecipient = (to: string | string[]) =>
  (Array.isArray(to) ? to : [to]).every((address) =>
    address.trim().toLowerCase().endsWith("@reglo.it"),
  );

const getResend = ({ allowInternal = false }: { allowInternal?: boolean } = {}) => {
  // On staging (or with the kill switch) every email send is a no-op: the
  // staging DB holds real contacts and must never receive real mail. This single
  // point covers all senders in this module.
  if (externalSendsDisabled() && !allowInternal) {
    return {
      emails: {
        send: async (payload: { to?: unknown; subject?: unknown }) => {
          console.info("[app-env] external sends disabled — skipping email", {
            to: payload?.to,
            subject: payload?.subject,
          });
          return { data: null, error: null };
        },
      },
    } as unknown as Resend;
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  return new Resend(apiKey);
};

const baseUrl = SERVER_URL.replace(/\/$/, "");

const formatSender = (from?: string) =>
  from?.trim() ? `${APP_NAME} <${from.trim()}>` : `${APP_NAME} <${DEFAULT_EMAIL_SENDER}>`;

/**
 * Unico punto di invio email del prodotto. Tutte le mail passano dal template
 * di `./template.ts`: chi chiama scrive **testo semplice**, la veste la mette
 * qui. Vedi `docs/features/email-template.md`.
 */
export const sendDynamicEmail = async ({
  to,
  subject,
  body,
  bodyAfter,
  from,
  heading,
  cta,
  fallbackLink,
  highlight,
  footerNote,
  preheader,
  internalStaffOnly = false,
}: {
  /** Uno o più destinatari (Resend accetta nativamente string | string[]). */
  to: string | string[];
  subject: string;
  body: string;
  /** Testo dopo il riquadro evidenziato. */
  bodyAfter?: string | null;
  from?: string;
  /** Titolo nel corpo, quando deve dire altro rispetto all'oggetto. */
  heading?: string | null;
  cta?: EmailCta | null;
  fallbackLink?: EmailCta | null;
  highlight?: EmailHighlight | null;
  footerNote?: string | null;
  preheader?: string | null;
  /**
   * Mail per lo staff Reglo (es. accesso al backoffice): parte anche su
   * staging, ma solo se TUTTI i destinatari sono @reglo.it.
   */
  internalStaffOnly?: boolean;
}) => {
  const content = {
    subject,
    body,
    bodyAfter,
    heading,
    cta,
    fallbackLink,
    highlight,
    footerNote,
    preheader,
  };
  const resend = getResend({ allowInternal: internalStaffOnly && isInternalRecipient(to) });
  await resend.emails.send({
    from: formatSender(from),
    to,
    subject,
    html: renderRegloEmail(content, { baseUrl }),
    text: renderRegloEmailText(content),
  });
};

export const sendCompanyInviteEmail = async ({
  to,
  companyName,
  inviteUrl,
  mobileInviteUrl,
  invitedByName,
}: {
  to: string;
  companyName: string;
  inviteUrl: string;
  mobileInviteUrl?: string | null;
  invitedByName?: string | null;
}) => {
  await sendDynamicEmail({
    to,
    // Era "You have been invited to join X": l'unica mail del prodotto rimasta
    // in inglese, mandata a titolari e allievi italiani.
    subject: `Il tuo invito su Reglo — ${companyName}`,
    heading: `Benvenuto in ${companyName}`,
    body: [
      invitedByName
        ? `${invitedByName} ti ha invitato a usare Reglo con ${companyName}.`
        : `Hai ricevuto un invito a usare Reglo con ${companyName}.`,
      "",
      "Da qui prenoti le guide, segui il percorso e ricevi i promemoria dell'autoscuola. Ti bastano un minuto e una password.",
    ].join("\n"),
    cta: {
      label: mobileInviteUrl ? "Entra in autoscuola" : "Accetta l'invito",
      url: mobileInviteUrl ?? inviteUrl,
    },
    fallbackLink: mobileInviteUrl ? { label: "apri nel browser", url: inviteUrl } : null,
    footerNote: "Se non aspettavi questo invito, puoi ignorare l'email.",
  });
};

export const getVerifiedEmailSenders = () => VERIFIED_EMAIL_SENDERS;

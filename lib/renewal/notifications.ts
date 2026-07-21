import "server-only";

import { prisma } from "@/db/prisma";
import { sendDynamicEmail } from "@/email";
import { RENEWAL_TIMEZONE } from "@/lib/renewal/time";
import { RENEWAL_RESUME_TOKEN_DAYS } from "@/lib/renewal/constants";

/**
 * Rinnovo Patenti — transactional emails.
 * On booking: confirmation to the citizen + alert to the autoscuola owner.
 * Respects the APP_ENV staging kill-switch via `sendDynamicEmail`.
 */

const dateTimeFormatter = new Intl.DateTimeFormat("it-IT", {
  timeZone: RENEWAL_TIMEZONE,
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * "Ricontatto automatico": asks the citizen to re-upload documents, with a
 * tokenized link that reopens THEIR request (no account needed).
 */
export async function sendRenewalIntegrationEmail(input: {
  requestId: string;
  missingLabels: string[];
  resumeUrl: string;
  customMessage?: string;
}): Promise<void> {
  const request = await prisma.renewalRequest.findUnique({
    where: { id: input.requestId },
    include: { company: { select: { name: true } } },
  });
  if (!request?.email) return;

  await sendDynamicEmail({
    to: request.email,
    subject: `Documenti da integrare — ${request.company.name}`,
    body: [
      `Ciao ${request.firstName || ""}`.trim() + ",",
      "",
      `per completare la tua pratica di rinnovo patente presso ${request.company.name} dobbiamo chiederti di ricaricare alcuni documenti.`,
      "",
      input.missingLabels.length
        ? `Documenti da integrare:\n${input.missingLabels.map((l) => `• ${l}`).join("\n")}`
        : "",
      input.customMessage ? `\nNota dall'autoscuola:\n${input.customMessage}` : "",
      "",
      "Puoi caricarli da qui, senza registrarti:",
      input.resumeUrl,
      "",
      `Il link resta valido ${RENEWAL_RESUME_TOKEN_DAYS} giorni.`,
      "",
      "La tua prenotazione della visita resta valida: se serve modificarla, contatta l'autoscuola.",
    ]
      .filter((l) => l !== "")
      .join("\n"),
  }).catch((err) => console.error("[renewal] integration email failed", err));
}

export async function sendRenewalBookingEmails(requestId: string): Promise<void> {
  const request = await prisma.renewalRequest.findUnique({
    where: { id: requestId },
    include: {
      company: { select: { id: true, name: true } },
      booking: { include: { medico: { select: { name: true } } } },
    },
  });
  if (!request || !request.booking) return;

  const when = dateTimeFormatter.format(request.booking.startAt);
  const fullName = [request.firstName, request.lastName].filter(Boolean).join(" ") || "cittadino";
  const companyName = request.company.name;

  // 1) Citizen confirmation.
  if (request.email) {
    await sendDynamicEmail({
      to: request.email,
      subject: `Visita medica confermata — ${companyName}`,
      body: [
        `Ciao ${request.firstName || ""}`.trim() + ",",
        "",
        `la tua visita medica per il rinnovo della patente presso ${companyName} è confermata.`,
        "",
        `📅 ${when}`,
        request.booking.medico?.name ? `👨‍⚕️ Medico: ${request.booking.medico.name}` : "",
        "",
        "Cosa portare alla visita: documento di identità, patente attuale e una fototessera.",
        "Il pagamento si salda in sede.",
        "",
        "Se hai bisogno di modificare l'appuntamento, contatta direttamente l'autoscuola.",
      ]
        .filter((l) => l !== "")
        .join("\n"),
    }).catch((err) => console.error("[renewal] citizen email failed", err));
  }

  // 2) Admin alert to the owner.
  const owner = await prisma.companyMember.findFirst({
    where: {
      companyId: request.company.id,
      autoscuolaRole: { in: ["OWNER", "INSTRUCTOR_OWNER"] },
    },
    include: { user: { select: { email: true } } },
  });
  const adminEmail = owner?.user?.email;
  if (adminEmail) {
    await sendDynamicEmail({
      to: adminEmail,
      subject: `Nuova richiesta di rinnovo patente — ${fullName}`,
      body: [
        `È arrivata una nuova richiesta di rinnovo patente da ${fullName}.`,
        "",
        `📅 Visita: ${when}`,
        request.booking.medico?.name ? `👨‍⚕️ Medico: ${request.booking.medico.name}` : "",
        request.email ? `✉️ ${request.email}` : "",
        request.phone ? `📞 ${request.phone}` : "",
        "",
        "Rivedi i documenti nella sezione Rinnovi della web app.",
      ]
        .filter((l) => l !== "")
        .join("\n"),
    }).catch((err) => console.error("[renewal] admin email failed", err));
  }
}

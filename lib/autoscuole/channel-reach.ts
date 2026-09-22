/**
 * Quanti allievi raggiunge ogni canale (REG-500).
 *
 * Serve alla riga della cascata in Impostazioni: "Arriva a 863 dei tuoi 1.216
 * allievi" spiega la scelta del canale meglio di qualunque testo d'aiuto, e
 * rende evidente perché serve un ripiego — la push, da sola, lascia fuori quasi
 * un terzo delle persone.
 *
 * Si contano solo gli allievi in **PRATICA**: gli altri una guida non la fanno,
 * quindi un promemoria di guida non lo ricevono comunque e gonfierebbero il
 * totale senza significato.
 */
import { prisma } from "@/db/prisma";
import { isWhatsAppCapable, normalizeToE164 } from "@/lib/phone-e164";

export type ChannelReachMap = {
  push: { reachable: number; total: number };
  whatsapp: { reachable: number; total: number };
  email: { reachable: number; total: number };
};

/**
 * Email segnaposto degli allievi senza indirizzo vero (allievi consorzio creati
 * con solo nome e telefono): esistono per far funzionare l'account, ma un'email
 * lì dentro non la legge nessuno.
 */
const PLACEHOLDER_EMAIL_DOMAIN = "@no-app.reglo.local";

export async function getChannelReach(companyId: string): Promise<ChannelReachMap> {
  const students = await prisma.companyMember.findMany({
    where: { companyId, autoscuolaRole: "STUDENT", studentPhase: "PRATICA" },
    select: {
      userId: true,
      user: {
        select: {
          email: true,
          phone: true,
          whatsappOptOutAt: true,
          _count: { select: { pushDevices: true } },
        },
      },
    },
  });

  const total = students.length;
  let push = 0;
  let whatsapp = 0;
  let email = 0;

  for (const student of students) {
    const user = student.user;
    if (user._count.pushDevices > 0) push += 1;

    // WhatsApp: numero convertibile, non un fisso, e non ha detto STOP.
    if (!user.whatsappOptOutAt) {
      const normalized = normalizeToE164(user.phone);
      if (normalized.ok && isWhatsAppCapable(normalized.e164)) whatsapp += 1;
    }

    if (user.email && !user.email.endsWith(PLACEHOLDER_EMAIL_DOMAIN)) email += 1;
  }

  return {
    push: { reachable: push, total },
    whatsapp: { reachable: whatsapp, total },
    email: { reachable: email, total },
  };
}

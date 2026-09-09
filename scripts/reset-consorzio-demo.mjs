// Reset dei dati e2e consorzio sul DB dev: rimuove guide da richiesta,
// TUTTE le guide requests e le notifiche consorzio della company demo, così
// il reseed ricrea la richiesta pending. Da lanciare PRIMA di ogni run e2e.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const company = await prisma.company.findFirst({
  where: { name: "Consorzio Liguria Demo" },
  select: { id: true, name: true },
});
if (!company) {
  // fallback: cerca per email owner
  console.error("Company consorzio demo non trovata per nome — provo via user email");
}
const target =
  company ??
  (await (async () => {
    const user = await prisma.user.findFirst({ where: { email: "consorzio@reglo.it" }, select: { id: true } });
    if (!user) return null;
    const member = await prisma.companyMember.findFirst({ where: { userId: user.id }, select: { companyId: true } });
    if (!member) return null;
    return prisma.company.findFirst({ where: { id: member.companyId }, select: { id: true, name: true } });
  })());
if (!target) {
  console.error("✗ Nessuna company consorzio demo trovata");
  process.exit(1);
}

const appts = await prisma.autoscuolaAppointment.deleteMany({
  where: { companyId: target.id, bookingSource: "consortium_request" },
});
const reqs = await prisma.consorzioGuideRequest.deleteMany({
  where: { consorzioCompanyId: target.id },
});
const notifs = await prisma.autoscuolaNotification.deleteMany({
  where: {
    companyId: target.id,
    kind: { in: ["consortium_guide_request", "consortium_guide_accepted", "consortium_guide_rejected"] },
  },
});
console.log(`✓ Reset ${target.name}: ${appts.count} guide, ${reqs.count} richieste, ${notifs.count} notifiche`);
await prisma.$disconnect();

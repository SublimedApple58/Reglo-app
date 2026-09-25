/**
 * Backfill REG-454: ogni `ConsorzioSchool` senza `linkedCompanyId` diventa una
 * vera Company Reglo, col servizio AUTOSCUOLE **spento** e il collegamento
 * scritto nei due posti (`linkedCompanyId` + `limits.affiliateOf`).
 *
 * Cosa NON fa, di proposito:
 * - non sposta un solo dato. Allievi, guide, codici contabili e le righe di
 *   fatturazione restano dove sono, cioè nella company del CONSORZIO. È
 *   esattamente questo che non fa perdere storico né fatturato;
 * - non crea utenti. In produzione 37 scuole hanno 24 email distinte (una ne
 *   copre cinque) e `User.email` è unique: il titolare arriva per invito, e un
 *   invito accettato vale per tutte le sue sedi;
 * - non attiva niente. Reglo si accende dal backoffice quando la scuola compra.
 *
 * Idempotente: una scuola già collegata viene saltata. Rieseguirlo non
 * duplica nulla.
 *
 *   DOTENV_CONFIG_PATH=.env.dev NODE_OPTIONS=--require=dotenv/config \
 *     npx ts-node --compiler-options '{"module":"commonjs"}' \
 *     scripts/backfill-consorzio-affiliates.ts --dry-run
 *
 * Usare `--dry-run` per vedere i nomi proposti prima di scrivere.
 */
import "dotenv/config";
import crypto from "crypto";
import { PrismaClient, Prisma } from "@prisma/client";

import { affiliateCompanyName } from "../lib/consorzio/affiliate-name";

const prisma = new PrismaClient();

const main = async () => {
  const dryRun = process.argv.includes("--dry-run");

  const consorzi = await prisma.companyService.findMany({
    where: { serviceKey: "AUTOSCUOLE" },
    select: { companyId: true, limits: true, company: { select: { name: true } } },
  });
  const consorzioIds = consorzi
    .filter((service) => {
      const limits = (service.limits ?? {}) as Record<string, unknown>;
      return limits.accountKind === "consorzio";
    })
    .map((service) => service.companyId);

  if (consorzioIds.length === 0) {
    console.log("Nessun account consorzio su questo database: niente da fare.");
    return;
  }

  const schools = await prisma.consorzioSchool.findMany({
    where: {
      consorzioCompanyId: { in: consorzioIds },
      status: { not: "removed" },
      linkedCompanyId: null,
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, city: true, email: true, consorzioCompanyId: true },
  });

  console.log(
    `Consorzi: ${consorzioIds.length} · autoscuole da collegare: ${schools.length}${
      dryRun ? "  (DRY RUN)" : ""
    }`,
  );

  // Le email condivise non sono un errore: sono titolari con più sedi. Si
  // stampano perché è l'informazione che serve a chi manderà gli inviti.
  const byEmail = new Map<string, string[]>();
  for (const school of schools) {
    const email = (school.email ?? "").trim().toLowerCase();
    if (!email) continue;
    byEmail.set(email, [...(byEmail.get(email) ?? []), school.name]);
  }
  const shared = Array.from(byEmail.entries()).filter(([, names]) => names.length > 1);
  if (shared.length) {
    console.log(`\nEmail condivise fra più sedi (un solo invito le coprirà tutte):`);
    for (const [email, names] of shared) {
      console.log(`  ${email} → ${names.length} sedi: ${names.join(", ")}`);
    }
  }

  console.log("");
  let created = 0;
  for (const school of schools) {
    const name = affiliateCompanyName(school.name);
    if (dryRun) {
      console.log(`  ${school.name}  →  "${name}"`);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const inviteCode = crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 6);
      const company = await tx.company.create({
        data: { name, inviteCode },
        select: { id: true },
      });

      await tx.companyService.create({
        data: {
          companyId: company.id,
          serviceKey: "AUTOSCUOLE",
          status: "DISABLED",
          limits: { affiliateOf: school.consorzioCompanyId } as Prisma.InputJsonValue,
        },
      });

      await tx.autoscuolaLocation.create({
        data: {
          companyId: company.id,
          name: `Sede ${name}`,
          isDefault: true,
          isPrecise: false,
        },
      });

      await tx.consorzioSchool.update({
        where: { id: school.id },
        data: { linkedCompanyId: company.id },
      });
    });
    created += 1;
    console.log(`  ✓ ${school.name} → ${name}`);
  }

  console.log("");
  if (dryRun) {
    console.log("DRY RUN: niente scritto.");
  } else {
    console.log(`Collegate: ${created}.`);
    console.log(
      "Ricorda: la cache SETTINGS del consorzio va invalidata (INCR su " +
        "autoscuole:v1:<consorzioId>:settings:version) o la sezione Autoscuole " +
        "resta indietro fino a 5 minuti.",
    );
  }
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

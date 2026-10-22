/**
 * REG-413 — gestione degli accessi personali al backoffice da terminale.
 *
 * Il modo normale per entrare la prima volta è «Primo accesso o password
 * dimenticata» nella pagina di accesso: il link arriva alla mail Reglo. Questo
 * script serve per i casi fuori dal normale:
 *
 *   list                              chi ha accesso e in che stato
 *   add  --email=… --name="…"         abilita una persona nuova
 *   link --email=… [--out=file]       crea un link di attivazione (recupero se
 *                                     la mail non arriva); con --out lo scrive
 *                                     su file invece di stamparlo
 *   disable --email=…                 toglie l'accesso e chiude le sessioni
 *   enable  --email=…                 lo ridà
 *
 * Nessuna password passa da qui: la sceglie sempre la persona dal link.
 * Su prod serve anche `--prod`.
 *
 *   DOTENV_CONFIG_PATH=.env.staging NODE_OPTIONS=--require=dotenv/config \
 *     npx tsx scripts/backoffice-admin.ts list
 */

import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

import {
  BACKOFFICE_LINK_TTL_MS,
  generateBackofficeToken,
  hashBackofficeToken,
} from "../lib/backoffice/admin-credentials";

const arg = (name: string) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main() {
  const command = process.argv[2];
  const prisma = new PrismaClient();
  if (/prod/i.test(process.env.DOTENV_CONFIG_PATH ?? "") && !process.argv.includes("--prod")) {
    console.error("Su prod serve anche --prod.");
    process.exit(1);
  }
  const email = arg("email")?.trim().toLowerCase();

  try {
    if (command === "list") {
      const admins = await prisma.backofficeAdmin.findMany({
        orderBy: { createdAt: "asc" },
        include: { _count: { select: { sessions: true } } },
      });
      for (const admin of admins) {
        const state = admin.disabledAt
          ? "disabilitato"
          : admin.passwordHash
            ? `attivo (password del ${admin.passwordSetAt?.toISOString().slice(0, 10)})`
            : "da attivare";
        console.log(
          `${admin.email.padEnd(32)} ${admin.name.padEnd(22)} ${state} · sessioni ${admin._count.sessions}`,
        );
      }
      return;
    }

    if (!email) throw new Error("Manca --email=…");

    if (command === "add") {
      const name = arg("name")?.trim();
      if (!name) throw new Error('Manca --name="Nome Cognome"');
      if (!email.endsWith("@reglo.it")) throw new Error("Solo indirizzi @reglo.it.");
      await prisma.backofficeAdmin.upsert({
        where: { email },
        create: { email, name },
        update: { name, disabledAt: null },
      });
      console.log(`Abilitato ${email}. Entra con «Primo accesso» nella pagina di accesso.`);
      return;
    }

    const admin = await prisma.backofficeAdmin.findUnique({ where: { email } });
    if (!admin) throw new Error(`${email} non ha accesso al backoffice.`);

    if (command === "link") {
      const token = generateBackofficeToken();
      await prisma.$transaction([
        prisma.backofficeAdminToken.updateMany({
          where: { adminId: admin.id, consumedAt: null },
          data: { consumedAt: new Date() },
        }),
        prisma.backofficeAdminToken.create({
          data: {
            adminId: admin.id,
            tokenHash: hashBackofficeToken(token),
            expiresAt: new Date(Date.now() + BACKOFFICE_LINK_TTL_MS),
          },
        }),
      ]);
      const base = (process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3000").replace(/\/$/, "");
      const url = `${base}/it/backoffice-sign-in/attiva?t=${encodeURIComponent(token)}`;
      const out = arg("out");
      if (out) {
        writeFileSync(out, `${url}\n`, { mode: 0o600 });
        console.log(`Link per ${email} scritto in ${out} (vale 30 minuti, monouso).`);
      } else {
        console.log(url);
      }
      return;
    }

    if (command === "disable" || command === "enable") {
      await prisma.$transaction([
        prisma.backofficeAdmin.update({
          where: { id: admin.id },
          data: { disabledAt: command === "disable" ? new Date() : null },
        }),
        ...(command === "disable"
          ? [prisma.backofficeSession.deleteMany({ where: { adminId: admin.id } })]
          : []),
      ]);
      console.log(`${email}: ${command === "disable" ? "accesso tolto" : "accesso ridato"}.`);
      return;
    }

    throw new Error(`Comando sconosciuto: ${command ?? "(nessuno)"}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

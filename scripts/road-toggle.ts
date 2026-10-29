/**
 * Accende / spegne Reglo Road su un'autoscuola di DEV o STAGING (mai prod).
 * Fa la stessa scrittura del drawer «Gestisci» del backoffice
 * (`updateCompanyService`: `CompanyService.limits.roadEnabled`) e invalida la
 * cache Redis delle impostazioni, altrimenti l'app lo vede solo dopo 5 minuti.
 * In produzione Road si accende solo dal backoffice.
 *
 *   DOTENV_CONFIG_PATH=.env.staging NODE_OPTIONS=--require=dotenv/config \
 *     npx ts-node --transpile-only --compiler-options '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' \
 *     scripts/road-toggle.ts --on            # autoscuola attiva di titolare@reglo.it
 *   … scripts/road-toggle.ts --off --company <companyId>
 */
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { Redis } from "@upstash/redis";

async function main() {
  const envFile = process.env.DOTENV_CONFIG_PATH ?? "";
  if (!/\.env\.(dev|staging)$/.test(envFile) || (process.env.APP_ENV ?? "").toLowerCase() === "prod") {
    throw new Error("Solo con DOTENV_CONFIG_PATH=.env.dev o .env.staging.");
  }
  const host = (url?: string) => (url ? new URL(url).host : "");
  let prodHost = "";
  try {
    prodHost = host(readFileSync(join(process.cwd(), ".env.prod"), "utf8").match(/^DATABASE_URL="?([^"\n]+)/m)?.[1]);
  } catch {
    // Nessun .env.prod qui.
  }
  if (!process.env.DATABASE_URL || host(process.env.DATABASE_URL) === prodHost) throw new Error("È il DB di produzione: fermo.");

  const on = process.argv.includes("--on");
  if (on === process.argv.includes("--off")) throw new Error("Passa --on oppure --off.");
  const i = process.argv.indexOf("--company");
  const prisma = new PrismaClient();
  try {
    const companyId =
      i > 0
        ? process.argv[i + 1]
        : (await prisma.user.findUniqueOrThrow({ where: { email: "titolare@reglo.it" }, select: { activeCompanyId: true } }))
            .activeCompanyId;
    if (!companyId) throw new Error("Autoscuola non trovata.");
    const svc = await prisma.companyService.findFirstOrThrow({
      where: { companyId, serviceKey: "AUTOSCUOLE" },
      select: { id: true, limits: true, company: { select: { name: true } } },
    });
    const limits = { ...((svc.limits as Record<string, unknown> | null) ?? {}), roadEnabled: on };
    await prisma.companyService.update({ where: { id: svc.id }, data: { limits } });
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) await new Redis({ url, token }).incr(`autoscuole:v1:${companyId}:settings:version`);
    console.log(`Road ${on ? "acceso" : "spento"} su «${svc.company.name}» (${companyId}).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

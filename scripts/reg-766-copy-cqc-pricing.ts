/**
 * REG-766 — la CQC persone parte col prezzo della CQC.
 *
 * Dal REG-766 la CQC è divisa in merci (`CQC`, la sigla di prima) e persone
 * (`CQCP`, nuova). Nella tabella Prezzi di un consorzio la riga «CQC persone»
 * nascerebbe vuota, e una guida senza tariffa costa 0 €. Decisione di Tiziano:
 * parte con quello che il consorzio aveva già scelto per la CQC (in produzione,
 * al 22/11/2026, il pacchetto a 1250 €). Poi il consorzio la cambia da sé.
 *
 * Copia tariffa oraria, prezzo del percorso e criterio di fatturazione della
 * `CQC` sulla `CQCP`, ma solo dove la `CQCP` non ha ancora niente: se il
 * consorzio l'ha già impostata a mano, si lascia stare. Idempotente.
 *
 * A vuoto di default; `--apply` per scrivere.
 *
 *   DOTENV_CONFIG_PATH=.env.staging NODE_OPTIONS=--require=dotenv/config \
 *     npx ts-node --transpile-only \
 *     --compiler-options '{"module":"commonjs","moduleResolution":"node","target":"ES2021","esModuleInterop":true}' \
 *     scripts/reg-766-copy-cqc-pricing.ts [--apply]
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const NodeModule = require("module");
const nodePath = require("path");
const REPO_ROOT = nodePath.join(__dirname, "..");
const originalResolve = NodeModule._resolveFilename;
NodeModule._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === "server-only") return originalResolve.call(this, "path", ...rest);
  const target = request.startsWith("@/")
    ? nodePath.join(REPO_ROOT, request.slice(2))
    : request;
  return originalResolve.call(this, target, ...rest);
};

const { prisma } = require("../db/prisma");
const {
  invalidateAutoscuoleCache,
  AUTOSCUOLE_CACHE_SEGMENTS,
} = require("../lib/autoscuole/cache");

export {};

const APPLY = process.argv.includes("--apply");
const FROM = "CQC";
const TO = "CQCP";
const MAPS = ["hourlyByCategory", "courseByCategory", "billingModeByCategory"] as const;

type Pricing = Record<string, unknown> & Partial<Record<(typeof MAPS)[number], Record<string, unknown>>>;

async function main() {
  const services = await prisma.companyService.findMany({
    where: { serviceKey: "AUTOSCUOLE" },
    select: { id: true, companyId: true, limits: true, company: { select: { name: true } } },
  });

  let changed = 0;
  for (const service of services) {
    const limits = (service.limits ?? {}) as Record<string, unknown>;
    const pricing = limits.consorzioPricing as Pricing | undefined;
    if (!pricing || typeof pricing !== "object") continue;

    const hasSource = MAPS.some((key) => pricing[key]?.[FROM] !== undefined);
    const hasTarget = MAPS.some((key) => pricing[key]?.[TO] !== undefined);
    if (!hasSource || hasTarget) continue;

    const next: Pricing = { ...pricing };
    const copied: string[] = [];
    for (const key of MAPS) {
      const value = pricing[key]?.[FROM];
      if (value === undefined) continue;
      next[key] = { ...(pricing[key] ?? {}), [TO]: value };
      copied.push(`${key}=${JSON.stringify(value)}`);
    }

    changed += 1;
    console.log(`${service.company?.name ?? service.companyId}: ${TO} ← ${copied.join(", ")}`);
    if (!APPLY) continue;
    await prisma.companyService.update({
      where: { id: service.id },
      data: { limits: { ...limits, consorzioPricing: next } as object },
    });
    await invalidateAutoscuoleCache({
      companyId: service.companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.SETTINGS],
    });
  }

  console.log(
    APPLY
      ? `Fatto: ${changed} consorzi aggiornati.`
      : `A vuoto: ${changed} consorzi da aggiornare. Rilancia con --apply per scrivere.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/**
 * REG-500 — allinea i canali degli istruttori a quelli degli allievi.
 *
 * Dal 22/10 Impostazioni → Promemoria e notifiche ha una sola scelta («Come
 * avvisiamo allievi e istruttori») che scrive entrambe le chiavi. Le
 * autoscuole che avevano scelto canali diversi per gli istruttori — nella
 * vecchia matrice «Personalizza», ora sparita — resterebbero con un valore che
 * nessuno vede più. Qui si portano allo stesso valore degli allievi, con
 * `push` sempre incluso (in UI l'app è «sempre inclusa»).
 *
 * `slotFillChannels` non si tocca: il backend la ignora (offerte solo push).
 *
 * Idempotente. A vuoto di default; `--apply` per scrivere.
 *
 *   DOTENV_CONFIG_PATH=.env.staging NODE_OPTIONS=--require=dotenv/config \
 *     npx ts-node --transpile-only \
 *     --compiler-options '{"module":"commonjs","moduleResolution":"node","target":"ES2021","esModuleInterop":true}' \
 *     scripts/reg-500-align-channels.ts [--apply]
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
const { parseReminderChannels } = require("../lib/autoscuole/reminder-channels");
const {
  invalidateAutoscuoleCache,
  AUTOSCUOLE_CACHE_SEGMENTS,
} = require("../lib/autoscuole/cache");

export {};

const APPLY = process.argv.includes("--apply");
const ORDER = ["push", "whatsapp", "email"];

const normalize = (value: unknown): string[] => {
  const parsed: string[] = parseReminderChannels(value);
  return ORDER.filter((channel) => channel === "push" || parsed.includes(channel));
};

async function main() {
  const services = await prisma.companyService.findMany({
    where: { serviceKey: "AUTOSCUOLE" },
    select: { id: true, companyId: true, limits: true, company: { select: { name: true } } },
  });

  let changed = 0;
  for (const service of services) {
    const limits = (service.limits ?? {}) as Record<string, unknown>;
    // Mai scelto niente: valgono i default per entrambi, già allineati.
    if (limits.studentReminderChannels == null && limits.instructorReminderChannels == null) {
      continue;
    }
    const student = normalize(limits.studentReminderChannels);
    const before = {
      student: JSON.stringify(limits.studentReminderChannels ?? null),
      instructor: JSON.stringify(limits.instructorReminderChannels ?? null),
    };
    const sameStudent = JSON.stringify(limits.studentReminderChannels) === JSON.stringify(student);
    const sameInstructor = JSON.stringify(limits.instructorReminderChannels) === JSON.stringify(student);
    if (sameStudent && sameInstructor) continue;

    changed += 1;
    console.log(
      `${service.company?.name ?? service.companyId}: allievi ${before.student} istruttori ${before.instructor} → ${JSON.stringify(student)}`,
    );
    if (!APPLY) continue;
    await prisma.companyService.update({
      where: { id: service.id },
      data: {
        limits: { ...limits, studentReminderChannels: student, instructorReminderChannels: student },
      },
    });
    await invalidateAutoscuoleCache({
      companyId: service.companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.SETTINGS],
    });
  }

  console.log(
    `\n${changed} autoscuole su ${services.length} ${APPLY ? "aggiornate" : "da aggiornare (a vuoto: --apply per scrivere)"}.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

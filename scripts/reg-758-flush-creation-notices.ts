/**
 * REG-758 — svuota a mano la coda dell'avviso «guida fissata».
 *
 * In produzione lo fa il job `autoscuole-reminders` ogni minuto. Su staging il
 * job non esiste (Trigger.dev è solo prod), quindi per la QA si lancia questo:
 * stessa funzione, stesse regole (3 minuti di quiete, 15 al massimo). Gli invii
 * esterni su staging sono no-op, salvo la lista bianca WhatsApp.
 *
 *   DOTENV_CONFIG_PATH=.env.staging NODE_OPTIONS=--require=dotenv/config \
 *     npx ts-node --transpile-only \
 *     --compiler-options '{"module":"commonjs","moduleResolution":"node","target":"ES2021","esModuleInterop":true}' \
 *     scripts/reg-758-flush-creation-notices.ts [--now=<ISO>]
 *
 * `--now` simula un altro istante (per non aspettare i 3 minuti).
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
const { processAutoscuolaCreationNotices } = require("../lib/autoscuole/creation-notice-queue");

export {};

const nowArg = process.argv.find((arg) => arg.startsWith("--now="));
const now = nowArg ? new Date(nowArg.slice("--now=".length)) : new Date();

async function main() {
  const result = await processAutoscuolaCreationNotices({ prisma, now });
  console.log(`[reg-758] ${now.toISOString()} → inviati ${result.sent}, saltati ${result.skipped}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

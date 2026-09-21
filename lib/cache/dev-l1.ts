/**
 * L1 cache in-memory — attiva SOLO sotto `next dev` in locale.
 *
 * In locale il "compute" non è una function in `fra1` ma il portatile dello
 * sviluppatore: ogni hop verso Upstash (Francoforte) costa ~50ms invece di ~5ms.
 * La cache autoscuole fa due hop causalmente sequenziali per richiesta — prima la
 * versione del segmento, poi il payload (la chiave dipende dalla versione) —
 * quindi in dev si spendono ~100ms solo per *leggere* la cache. Questo L1 li
 * assorbe. Vedi docs/architecture/performance-playbook.md §0.5/§6.
 *
 * CORRETTEZZA — perché non può servire dati stantii:
 * le chiavi di payload includono già la versione del segmento, quindi un bump di
 * versione produce una chiave diversa e l'L1 fa miss per costruzione. L'unica
 * finestra di staleness è la *versione*, che è cappata a `VERSION_TTL_MS` e viene
 * cancellata immediatamente nel processo che chiama `invalidateAutoscuoleCache`.
 * Resta solo il caso cross-processo (il worker trigger.dev è un secondo processo
 * sotto `pnpm dev`): lì la finestra è ≤ `VERSION_TTL_MS`.
 *
 * Non tocca `lib/aula/live-state.ts`, che usa Redis come stato condiviso fra
 * processi e non come cache: quello deve restare su Upstash anche in dev.
 *
 * Disattivabile con `REGLO_DISABLE_DEV_L1=1`.
 */

/** Finestra massima di staleness cross-processo per la versione di segmento. */
export const VERSION_TTL_MS = 3_000;

type Entry = { value: unknown; expiresAt: number };

// Su globalThis così l'HMR di `next dev` non svuota la cache a ogni salvataggio
// (stesso pattern di db/prisma.ts).
declare global {
  // eslint-disable-next-line no-var
  var __regloDevL1: Map<string, Entry> | undefined;
}

const store = (): Map<string, Entry> => {
  if (!global.__regloDevL1) global.__regloDevL1 = new Map();
  return global.__regloDevL1;
};

/**
 * Solo `next dev`. `NODE_ENV` è l'unico segnale affidabile: `.env.dev` non imposta
 * `APP_ENV` (e `lib/app-env.ts` tratta l'assenza come "prod" di proposito), ed è
 * usato anche da `pnpm build`/`pnpm start`, dove NODE_ENV=production e questo L1
 * resta correttamente spento.
 */
export const devL1Enabled = (): boolean =>
  process.env.NODE_ENV === "development" &&
  process.env.REGLO_DISABLE_DEV_L1 !== "1";

export const l1Get = <T>(key: string): T | undefined => {
  if (!devL1Enabled()) return undefined;
  const entry = store().get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store().delete(key);
    return undefined;
  }
  return entry.value as T;
};

export const l1Set = (key: string, value: unknown, ttlMs: number): void => {
  if (!devL1Enabled()) return;
  if (ttlMs <= 0) return;
  store().set(key, { value, expiresAt: Date.now() + ttlMs });
};

export const l1Delete = (key: string): void => {
  if (!devL1Enabled()) return;
  store().delete(key);
};

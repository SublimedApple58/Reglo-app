/**
 * Percorsi patente di un allievo (REG-458).
 *
 * Fino a REG-458 il percorso **era** l'allievo: categoria, cambio, numero e data
 * di conseguimento vivevano su `CompanyMember` e si sovrascrivevano al secondo
 * giro. Chi prendeva la B e poi voleva la A perdeva la B dal dato — e in
 * produzione quattro persone del consorzio erano state **registrate due volte**
 * (C+CQC, D+DE) proprio per aggirare la cosa.
 *
 * Ora il percorso e' una riga (`AutoscuolaLicensePath`). I campi su
 * `CompanyMember` restano come **specchio dell'ultimo percorso**: e' cio' che
 * permette alle ~560 letture di `licenseCategory` sparse per il prodotto
 * (abbinamento veicoli, luoghi, tariffe, colori agenda, bucket di prenotazione)
 * di non cambiare di una riga.
 *
 * Questo file e' puro: niente Prisma, niente sessione. Le scritture stanno in
 * `lib/actions/autoscuole-license-paths.actions.ts`.
 */

import { TRANSMISSION_LABELS, type Transmission } from "@/lib/autoscuole/license";

export const LICENSE_PATH_STATUSES = ["active", "obtained", "abandoned"] as const;
export type LicensePathStatus = (typeof LICENSE_PATH_STATUSES)[number];

export function isLicensePathStatus(value: unknown): value is LicensePathStatus {
  return (
    typeof value === "string" &&
    (LICENSE_PATH_STATUSES as readonly string[]).includes(value)
  );
}

/** Null-safe: qualunque cosa non sia uno stato noto vale "in corso". */
export function asLicensePathStatus(value: unknown): LicensePathStatus {
  return isLicensePathStatus(value) ? value : "active";
}

export const LICENSE_PATH_STATUS_LABELS: Record<LicensePathStatus, string> = {
  active: "In corso",
  obtained: "Conseguita",
  abandoned: "Abbandonato",
};

/**
 * La forma minima che serve a questo modulo. Volutamente strutturale e non il
 * tipo Prisma: cosi' lo usano anche i componenti client, che il modello non ce
 * l'hanno.
 */
export type LicensePathLike = {
  licenseCategory?: string | null;
  transmission?: string | null;
  status?: string | null;
  startedAt?: Date | string | null;
  obtainedAt?: Date | string | null;
  closedAt?: Date | string | null;
  licenseNumber?: string | null;
};

export const isPathOpen = (path: LicensePathLike): boolean =>
  asLicensePathStatus(path.status) === "active";

/**
 * CQC e ADR **non sono patenti**: sono qualificazioni che si aggiungono a una
 * patente che gia' si ha. `lib/autoscuole/license.ts` le modella come
 * pseudo-categorie per non introdurre una seconda dimensione su allievi,
 * veicoli e tariffe — scelta che resta valida — ma quando si scrivono le parole
 * la differenza conta: "Patenti conseguite" su un corso CQC e' sbagliato.
 */
const QUALIFICATION_CATEGORIES = new Set<string>(["CQC", "ADR"]);

export function isQualification(category: unknown): boolean {
  return typeof category === "string" && QUALIFICATION_CATEGORIES.has(category);
}

/** «B · Manuale», «CQC», «—» se non si sa ancora niente. */
export function pathLabel(path: LicensePathLike): string {
  const category = path.licenseCategory?.trim();
  if (!category) return "—";
  const transmission = path.transmission?.trim();
  // Sulle qualificazioni il cambio non vuol dire niente: la CQC non e' "manuale".
  if (!transmission || isQualification(category)) return category;
  const label =
    TRANSMISSION_LABELS[transmission as Transmission] ?? transmission;
  return `${category} · ${label}`;
}

/**
 * Titolo della sezione storico nel dettaglio allievo. Su un consorzio i percorsi
 * sono spesso qualificazioni, non patenti: la parola cambia in base a cosa c'e'
 * davvero dentro, non in base al tipo di account — un'autoscuola che facesse una
 * CQC leggerebbe comunque la cosa giusta.
 */
export function historySectionTitle(paths: LicensePathLike[]): string {
  // Basta una qualificazione nel mazzo perche' "Patenti conseguite" diventi una
  // bugia: in quel caso vince il termine neutro.
  return paths.some((p) => isQualification(p.licenseCategory))
    ? "Percorsi conclusi"
    : "Patenti conseguite";
}

/**
 * I percorsi chiusi, dal piu' recente al piu' vecchio. Un percorso senza
 * `closedAt` (non dovrebbe esistere, ma il dato storico e' quello che e') finisce
 * in fondo invece di far esplodere l'ordinamento.
 */
export function closedPathsNewestFirst<T extends LicensePathLike>(paths: T[]): T[] {
  return paths
    .filter((p) => !isPathOpen(p))
    .sort((a, b) => {
      const at = a.closedAt ? new Date(a.closedAt).getTime() : 0;
      const bt = b.closedAt ? new Date(b.closedAt).getTime() : 0;
      return bt - at;
    });
}

export const openPath = <T extends LicensePathLike>(paths: T[]): T | null =>
  paths.find(isPathOpen) ?? null;

/**
 * Il percorso «corrente» di un allievo: quello in corso, oppure — se e'
 * patentato e non ha ancora ripreso — l'ultimo chiuso. Non e' sempre
 * `openPath`: un patentato non ha percorsi aperti, ma ha comunque un percorso
 * di cui si parla.
 */
const closedAtMs = (path: LicensePathLike): number => {
  const when = path.obtainedAt ?? path.closedAt;
  return when ? new Date(when).getTime() : 0;
};

export function currentPath<T extends LicensePathLike>(paths: T[]): T | null {
  return openPath(paths) ?? closedPathsNewestFirst(paths)[0] ?? null;
}

/**
 * Le patenti conseguite nei percorsi **precedenti** a quello corrente, dalla
 * piu' recente.
 *
 * Non sono «tutte le conseguite»: per un patentato con un percorso solo,
 * «ha gia' la B» accanto alla patente in corso «B · Manuale» e' la stessa cosa
 * detta due volte — e in produzione sono **71 allievi su 72**. Qui interessa
 * solo cio' che la patente corrente non dice gia'.
 */
export function licensesObtainedBeforeCurrent<T extends LicensePathLike & { id: string }>(
  paths: T[],
): T[] {
  if (paths.length < 2) return [];
  const corrente = currentPath(paths);
  return paths
    .filter((path) => path.id !== corrente?.id && asLicensePathStatus(path.status) === "obtained")
    .sort((a, b) => closedAtMs(b) - closedAtMs(a));
}

/**
 * REG-458 — «vedi tutte le guide, di tutti i percorsi». Un id di percorso e' un
 * uuid, quindi non puo' collidere con questo valore.
 */
export const ALL_LESSON_PATHS = "all";

/**
 * Su quale percorso va ristretto il tab Guide, data la scelta di chi guarda
 * (`null` = non ha scelto, vale il default).
 *
 * Tre regole, tutte volute:
 * 1. **Con meno di due percorsi non si filtra**, e di conseguenza il banner non
 *    si vede: «solo le guide del percorso B» e' una precisazione inutile quando
 *    B e' l'unico percorso che esiste — ed e' il caso di quasi tutti gli
 *    allievi.
 * 2. **Il default e' il percorso corrente**, non il piu' vecchio: chi apre un
 *    allievo vuole sapere dove sta adesso.
 * 3. Una scelta che **non esiste piu'** (il register si e' ricaricato, il
 *    percorso e' cambiato) ricade sul default invece di mostrare zero guide
 *    senza spiegazione.
 */
export function lessonsPathFilterId<T extends LicensePathLike & { id: string }>(
  paths: T[],
  choice: string | null,
): string | null {
  if (paths.length < 2) return null;
  if (choice === ALL_LESSON_PATHS) return null;
  if (choice && paths.some((path) => path.id === choice)) return choice;
  return currentPath(paths)?.id ?? null;
}

const startedAtMs = (path: LicensePathLike): number => {
  const raw = path.startedAt;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/**
 * A quale percorso appartiene una guida svolta in `date`.
 *
 * **Regola unica: l'ultimo percorso iniziato non dopo quella data.** Niente
 * finestre `[startedAt, closedAt]`, che lascerebbero scoperti i giorni fra un
 * percorso e il successivo; cosi' invece la risposta esiste sempre ed e' una
 * sola. Una guida piu' vecchia del primo percorso (succede: il backfill fa
 * partire il percorso dalla data di iscrizione, e qualche guida storica puo'
 * precederla) cade sul percorso piu' vecchio, che e' l'unica attribuzione
 * sensata.
 *
 * E' il motivo per cui le guide non portano una colonna `licensePathId`: questa
 * funzione non puo' divergere dal dato, una colonna scritta in 13 punti si'.
 */
export function pathForDate<T extends LicensePathLike>(
  paths: T[],
  date: Date | string,
): T | null {
  if (paths.length === 0) return null;
  const when = new Date(date).getTime();
  if (Number.isNaN(when)) return null;

  const oldestFirst = [...paths].sort((a, b) => startedAtMs(a) - startedAtMs(b));
  let current: T | null = null;
  for (const path of oldestFirst) {
    if (startedAtMs(path) <= when) current = path;
    else break;
  }
  return current ?? oldestFirst[0] ?? null;
}

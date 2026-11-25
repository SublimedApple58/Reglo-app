/**
 * Avviso «guida fissata» all'allievo (REG-758) — le regole, senza database.
 *
 * Richiesta del consorzio Autoscuole Riunite: quando è lo **staff** (titolare,
 * segreteria, istruttore, consorzio) o l'**assistente vocale** a fissare una
 * guida, l'allievo deve saperlo. Prima non lo sapeva su nessun canale: l'unico
 * appuntamento che avvisava alla creazione era l'esame (`exam_scheduled`).
 *
 * ## Perché una coda e non un invio subito
 *
 * Lo staff fissa le guide una alla volta dall'agenda: il 24/09 il consorzio ne
 * ha create 17 per 9 allievi in pochi minuti. Un invio per guida vorrebbe dire
 * raffiche di messaggi — e su WhatsApp, bolletta. Quindi la guida nasce
 * `creationNotice = "pending"` e il job dei promemoria (ogni minuto) manda
 * **un messaggio per allievo** con tutte le sue guide in coda, quando per lui
 * non ne arrivano di nuove da `CREATION_NOTICE_QUIET_MS`, o comunque dopo
 * `CREATION_NOTICE_MAX_DELAY_MS` dalla prima.
 *
 * ## Quando non si manda (decisioni di Tiziano, 17/11)
 *
 * - funzione spenta (default): interruttore in Impostazioni → Promemoria e
 *   notifiche, `limits.studentCreationNoticeEnabled`;
 * - guide prenotate dall'allievo stesso (app, posto liberato, scambio, invito
 *   a guida di gruppo): lo sa già. Non entrano mai in coda;
 * - esami: hanno già «esame fissato»;
 * - guide nel passato (registrazioni a posteriori) o già iniziate all'invio;
 * - guide annullate prima dell'invio.
 */
import {
  describeWhen,
  formatDateLong,
  formatTimeShort,
  isExamType,
  type NotificationText,
} from "@/lib/autoscuole/exam-notifications";

export const CREATION_NOTICE = {
  pending: "pending",
  sent: "sent",
  skipped: "skipped",
} as const;

export type CreationNoticeState = (typeof CREATION_NOTICE)[keyof typeof CREATION_NOTICE];

/** Quanto deve restare fermo lo staff su un allievo prima che partano gli avvisi. */
export const CREATION_NOTICE_QUIET_MS = 3 * 60_000;
/** Il ritardo massimo dalla prima guida in coda, anche se lo staff continua. */
export const CREATION_NOTICE_MAX_DELAY_MS = 15 * 60_000;

/** Oltre questo numero l'elenco si chiude con «e altre N». */
const MAX_LISTED = 10;

/** Le guide che contano come «ancora in piedi» al momento dell'invio. */
export const CREATION_NOTICE_ACTIVE_STATUSES = ["scheduled", "confirmed"] as const;

export const isCreationNoticeEnabled = (limits: Record<string, unknown>) =>
  limits.studentCreationNoticeEnabled === true;

/**
 * Lo stato con cui nasce la guida. `null` = nessun avviso, e la guida non
 * entra mai in coda: accendere la funzione dopo non manda avvisi per le guide
 * fissate prima.
 */
export function initialCreationNotice({
  enabled,
  type,
  startsAt,
  now,
}: {
  enabled: boolean;
  type: string | null | undefined;
  startsAt: Date;
  now: Date;
}): CreationNoticeState | null {
  if (!enabled) return null;
  if (isExamType(type)) return null;
  if (startsAt.getTime() <= now.getTime()) return null;
  return CREATION_NOTICE.pending;
}

/**
 * Le guide in coda di un allievo si mandano quando lo staff si è fermato da
 * 3 minuti, o quando la prima aspetta da 15.
 */
export function isReadyToFlush(createdAts: Date[], now: Date): boolean {
  if (!createdAts.length) return false;
  const times = createdAts.map((date) => date.getTime());
  const newest = Math.max(...times);
  const oldest = Math.min(...times);
  return (
    now.getTime() - newest >= CREATION_NOTICE_QUIET_MS ||
    now.getTime() - oldest >= CREATION_NOTICE_MAX_DELAY_MS
  );
}

/**
 * Ricostruisce a posteriori i messaggi già partiti (inbox mobile): guide in
 * ordine di creazione, una nuova serie quando passano più di 3 minuti dalla
 * precedente o più di 15 dalla prima. È la stessa regola della coda, letta
 * all'indietro.
 */
export function groupCreationNoticeBatches<T extends { createdAt: Date }>(rows: T[]): T[][] {
  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const batches: T[][] = [];
  for (const row of sorted) {
    const current = batches[batches.length - 1];
    const previous = current?.[current.length - 1];
    if (
      current &&
      previous &&
      row.createdAt.getTime() - previous.createdAt.getTime() < CREATION_NOTICE_QUIET_MS &&
      row.createdAt.getTime() - current[0].createdAt.getTime() < CREATION_NOTICE_MAX_DELAY_MS
    ) {
      current.push(row);
    } else {
      batches.push([row]);
    }
  }
  return batches;
}

export type NoticeLesson = {
  type: string | null;
  startsAt: Date;
  endsAt: Date | null;
  instructorName?: string | null;
};

const isGroupLesson = (type: string | null) => type === "group_lesson";

const byStart = (lessons: NoticeLesson[]) =>
  [...lessons].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

/** «a, b e c» */
const joinItalian = (items: string[]) =>
  items.length <= 1
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;

/** Elenco con tetto: oltre `MAX_LISTED` si chiude con «e altre N». */
const listWithCap = (items: string[]) => {
  if (items.length <= MAX_LISTED) return joinItalian(items);
  const shown = items.slice(0, MAX_LISTED);
  return `${shown.join(", ")} e altre ${items.length - MAX_LISTED}`;
};

/** «giovedì 20/11 alle 15:00» — la forma corta per l'elenco su WhatsApp. */
const shortWhen = (lesson: NoticeLesson) => {
  const weekday = lesson.startsAt.toLocaleDateString("it-IT", {
    weekday: "long",
    timeZone: "Europe/Rome",
  });
  const dayMonth = lesson.startsAt.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Rome",
  });
  return `${weekday} ${dayMonth} alle ${formatTimeShort(lesson.startsAt)}`;
};

const longWhen = (lesson: NoticeLesson) =>
  `${formatDateLong(lesson.startsAt)} alle ${formatTimeShort(lesson.startsAt)}`;

/** « con Marco Rossi» solo se tutte le guide hanno lo stesso istruttore. */
const sharedInstructor = (lessons: NoticeLesson[]) => {
  const names = new Set(lessons.map((lesson) => lesson.instructorName?.trim() || ""));
  if (names.size !== 1) return "";
  const [name] = Array.from(names);
  return name ? ` con ${name}` : "";
};

/**
 * Chiusura uguale per tutti (richiesta di Federica del consorzio, approvata da
 * Tiziano il 25/11): prima era «Per modifiche o disdette contatta
 * l'autoscuola.», tolta perché invitava gli allievi a disdire.
 */
const CLOSING = "Ti aspettiamo in autoscuola.";

/** Titolo e testo di push ed email. Il nome dell'istruttore sta solo qui. */
export function creationNoticeText(input: NoticeLesson[]): NotificationText {
  const lessons = byStart(input);
  if (lessons.length === 1) {
    const [lesson] = lessons;
    const group = isGroupLesson(lesson.type);
    const { when } = describeWhen(lesson);
    return {
      title: group ? "📅 Guida di gruppo fissata" : "📅 Guida fissata",
      body:
        `Ti è stata fissata la ${group ? "guida di gruppo" : "guida"} di ` +
        `${when}${sharedInstructor(lessons)}. ${CLOSING}`,
    };
  }
  const items = lessons.map(
    (lesson) => `${longWhen(lesson)}${isGroupLesson(lesson.type) ? " (di gruppo)" : ""}`,
  );
  return {
    title: `📅 ${lessons.length} guide fissate`,
    body:
      `Ti sono state fissate ${lessons.length} guide${sharedInstructor(lessons)}: ` +
      `${listWithCap(items)}. ${CLOSING}`,
  };
}

/**
 * La variabile `guide` dei template `guida_fissata_allievo_v2` («Ciao {{1}},
 * ti abbiamo fissato {{2}}. Ti aspettiamo in autoscuola.») e `_v1` («Ciao
 * {{1}}, l'autoscuola ha fissato per te {{2}}. …»): stesso valore, grammaticale
 * in tutti e due sia con una guida sia con più. Senza istruttore (decisione
 * 17/11), tutto su una riga (Meta rifiuta gli a capo nei parametri).
 */
export function creationNoticeWhatsAppGuides(input: NoticeLesson[]): string {
  const lessons = byStart(input);
  if (lessons.length === 1) {
    const [lesson] = lessons;
    const { when } = describeWhen(lesson);
    return `la ${isGroupLesson(lesson.type) ? "guida di gruppo" : "guida"} di ${when}`;
  }
  const items = lessons.map(
    (lesson) => `${shortWhen(lesson)}${isGroupLesson(lesson.type) ? " (di gruppo)" : ""}`,
  );
  return `${lessons.length} guide: ${listWithCap(items)}`;
}

/**
 * I testi delle comunicazioni su guide ed esami (REG-604).
 *
 * Modulo **puro**: niente Prisma, niente Resend, niente env. Si apre in un
 * test e si legge. È voluto: il difetto che REG-604 chiude nasceva dal fatto
 * che ogni punto di invio si formattava l'orario per conto suo, e nessuno
 * guardava `endsAt`.
 *
 * ## La regola
 *
 * **L'orario si scrive se e solo se `endsAt` è valorizzato.**
 *
 * Un esame senza orario esiste per progetto: l'autoscuola fissa la data, e la
 * convocazione la comunica lei, a volte il giorno prima. In quel caso
 * `startsAt` porta la mezzanotte come segnaposto — chiunque lo formatti senza
 * guardare `endsAt` scrive «00:00», che è il bug segnalato da Macchiavello.
 *
 * Sulle guide `endsAt` c'è sempre, quindi la regola non cambia niente: è la
 * stessa funzione per entrambi, senza rami per tipo.
 */

const TIMEZONE = "Europe/Rome";

export type AppointmentLike = {
  type?: string | null;
  startsAt: Date;
  endsAt: Date | null;
};

export const isExamType = (type: string | null | undefined) =>
  (type ?? "").trim().toLowerCase() === "esame";

/** L'orario è stato definito dall'autoscuola? */
export const hasDefinedTime = (appointment: { endsAt: Date | null }) =>
  appointment.endsAt !== null;

/** «martedì 14 ottobre» */
export const formatDateLong = (when: Date) =>
  when.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TIMEZONE,
  });

/** «09:00» */
export const formatTimeShort = (when: Date) =>
  when.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIMEZONE,
  });

/**
 * Come si chiama questo appuntamento e quando è, pronti da infilare in una
 * frase. `when` è l'unico posto da cui può uscire un orario.
 */
export const describeWhen = (appointment: AppointmentLike) => {
  const isExam = isExamType(appointment.type);
  const timeKnown = hasDefinedTime(appointment);
  const dateLabel = formatDateLong(appointment.startsAt);
  return {
    isExam,
    timeKnown,
    /** «esame di guida» | «guida» */
    noun: isExam ? "esame di guida" : "guida",
    /** «il tuo esame di guida» | «la tua guida» */
    subject: isExam ? "il tuo esame di guida" : "la tua guida",
    /** «martedì 14 ottobre alle 09:00» | «martedì 14 ottobre» */
    when: timeKnown
      ? `${dateLabel} alle ${formatTimeShort(appointment.startsAt)}`
      : dateLabel,
    dateLabel,
  };
};

/**
 * La coda che spiega all'allievo chi gli dirà l'orario. Cambia a seconda di
 * quanto già sa: senza orario mancano entrambe le informazioni, con l'orario
 * manca solo il luogo.
 *
 * La versione senza orario è la stessa frase di `EXAM_REMINDER_SUFFIX`
 * (`communications.ts`): l'allievo deve leggere le stesse parole nel promemoria
 * e nel messaggio di prenotazione, altrimenti sembrano due regole diverse.
 */
export const examTail = (timeKnown: boolean) =>
  timeKnown
    ? "Il luogo di presentazione ti verrà comunicato dall'autoscuola."
    : "Orario e luogo di presentazione ti verranno comunicati dall'autoscuola.";

export type NotificationText = { title: string; body: string };

// ---------------------------------------------------------------------------
// Esame fissato — notifica nuova: prima di REG-604 prenotare un esame non
// mandava niente all'allievo, su nessun canale.
// ---------------------------------------------------------------------------

export const examCreatedText = (appointment: AppointmentLike): NotificationText => {
  const { when, timeKnown } = describeWhen({ ...appointment, type: "esame" });
  return {
    title: "🎓 Esame fissato",
    body: `Il tuo esame di guida è fissato per ${when}. ${examTail(timeKnown)}`,
  };
};

// ---------------------------------------------------------------------------
// Orario definito dopo — l'esame nasce senza orario e lo acquista più tardi.
// ---------------------------------------------------------------------------

export const examTimeSetText = (appointment: {
  startsAt: Date;
  endsAt: Date;
}): NotificationText => ({
  title: "🎓 Orario dell'esame definito",
  body:
    `L'orario del tuo esame di guida di ${formatDateLong(appointment.startsAt)} ` +
    `è stato definito: alle ${formatTimeShort(appointment.startsAt)}. ` +
    examTail(true),
});

/** L'orario c'era e non c'è più: va detto, altrimenti l'allievo resta con il vecchio. */
export const examTimeClearedText = (appointment: {
  startsAt: Date;
}): NotificationText => ({
  title: "🎓 Orario dell'esame da definire",
  body:
    `L'orario del tuo esame di guida di ${formatDateLong(appointment.startsAt)} ` +
    `è da definire: te lo comunicherà l'autoscuola.`,
});

// ---------------------------------------------------------------------------
// Spostamento
// ---------------------------------------------------------------------------

/**
 * `null` = non mandare niente.
 *
 * Succede quando le due etichette coincidono: cambia solo la durata a start
 * invariato, oppure l'esame non ha orario né prima né dopo e resta nello stesso
 * giorno. Senza questo controllo l'allievo leggerebbe «il tuo esame del 14
 * ottobre è stato spostato al 14 ottobre».
 */
export const movedText = (
  before: AppointmentLike,
  after: AppointmentLike,
  options?: { actorRole?: "instructor" | "owner" | "admin"; instructorName?: string | null },
): NotificationText | null => {
  const from = describeWhen(before);
  const to = describeWhen(after);

  if (from.when === to.when) return null;

  // Da con-orario a senza-orario: non è uno spostamento, è un orario ritirato.
  if (from.timeKnown && !to.timeKnown && from.dateLabel === to.dateLabel) {
    return to.isExam
      ? examTimeClearedText(after)
      : {
          title: "🔄 Guida spostata",
          body: `La tua guida di ${from.when} è stata spostata a ${to.when}.`,
        };
  }

  // Da senza-orario a con-orario, stesso giorno: è l'orario che arriva.
  if (!from.timeKnown && to.timeKnown && from.dateLabel === to.dateLabel && to.isExam) {
    return examTimeSetText({ startsAt: after.startsAt, endsAt: after.endsAt! });
  }

  if (to.isExam) {
    const tail = to.timeKnown ? "" : ` ${examTail(false)}`;
    return {
      title: "🎓 Esame spostato",
      body: `Il tuo esame di guida di ${from.when} è stato spostato a ${to.when}.${tail}`,
    };
  }

  // Sulle guide il testo resta quello di prima, attore incluso: lì «dalla
  // segreteria» è un'informazione utile (chi ha mosso la mia guida?), mentre su
  // un esame suonerebbe come un'attribuzione di colpa — la data la fissa la
  // Motorizzazione, non la segreteria.
  const instrLabel = options?.instructorName ? ` con ${options.instructorName}` : "";
  const actorSuffix =
    options?.actorRole === "instructor" ? "dall'istruttore" : "dalla segreteria";
  return {
    title: "🔄 Guida spostata",
    body: `La tua guida del ${from.when}${instrLabel} è stata spostata ${actorSuffix} al ${to.when}.`,
  };
};

// ---------------------------------------------------------------------------
// Annullamento
// ---------------------------------------------------------------------------

export const cancelledText = (
  appointment: AppointmentLike,
  options: {
    actorRole?: "instructor" | "owner" | "admin";
    instructorName?: string | null;
    /** Guide: la riga finale cambia se l'allievo non può riprenotare da solo. */
    guideCta?: string;
    /** Guide: `permanent_cancel` ha un titolo più forte. Sugli esami no. */
    permanent?: boolean;
  } = {},
): NotificationText => {
  const { isExam, when, subject } = describeWhen(appointment);

  if (isExam) {
    // «annullata definitivamente» è una distinzione interna (manual_cancel vs
    // permanent_cancel) che per l'allievo non significa niente, e la CTA delle
    // guide — «prenota una nuova guida dall'app» — su un esame è assurda:
    // l'esame non se lo prenota lui.
    return {
      title: "❌ Esame annullato",
      body: `${capitalize(subject)} di ${when} è stato annullato. Per la nuova data ti contatterà l'autoscuola.`,
    };
  }

  const instrLabel = options.instructorName ? ` con ${options.instructorName}` : "";
  const actorSuffix =
    options.actorRole === "instructor" ? "dall'istruttore" : "dalla segreteria";
  const cta = options.guideCta ? ` ${options.guideCta}` : "";
  return {
    title: options.permanent ? "❌ Guida annullata definitivamente" : "❌ Guida annullata",
    body: `La tua guida di ${when}${instrLabel} è stata annullata ${actorSuffix}.${cta}`,
  };
};

// ---------------------------------------------------------------------------
// Luogo
// ---------------------------------------------------------------------------

export const locationChangedText = (
  appointment: AppointmentLike,
  locationName: string,
): NotificationText => {
  const { isExam, when, subject } = describeWhen(appointment);
  return {
    title: isExam ? "📍 Luogo dell'esame aggiornato" : "📍 Luogo guida aggiornato",
    body: `Il luogo di ${subject} di ${when} è cambiato: ${locationName}.`,
  };
};

const capitalize = (value: string) =>
  value.length ? value[0].toUpperCase() + value.slice(1) : value;

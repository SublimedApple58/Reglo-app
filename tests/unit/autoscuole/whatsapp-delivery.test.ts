import {
  firstNameFor,
  hasWhatsAppTemplate,
  whatsAppSkipReason,
} from "@/lib/autoscuole/whatsapp-delivery";

/**
 * REG-500 — il cancello unico degli invii WhatsApp.
 *
 * Il bug che questi test impediscono di rifare: lo stack nuovo era scritto ma
 * non innestato, e gli invii continuavano a passare dal vecchio percorso Twilio
 * in testo libero. In produzione: 618 `401 Authenticate`, mentre la UI mostrava
 * WhatsApp come "In arrivo". Il cancello stava davanti, il retro era aperto.
 */

const approvedUtility = {
  name: "promemoria_guida_allievo_v3",
  category: "utility",
  approval: "approved",
  variables: ["nome", "quando", "durata"],
  body: "",
} as const;

// I test non dipendono dallo stato di approvazione di oggi su Meta: il
// template approvato è esplicito, i casi "pending" e "marketing" pure.
const base = {
  recipient: "+393331234567",
  templateKind: "appointment_reminder_student",
  channelAvailable: true,
  optedOut: false,
  template: approvedUtility,
};

describe("quando NON si manda", () => {
  it("canale non configurato: si salta, non si prova", () => {
    expect(whatsAppSkipReason({ ...base, channelAvailable: false })).toMatch(
      /non configurato/,
    );
  });

  it("nessun template approvato per quel tipo di messaggio", () => {
    // Testo libero (offerte di scambio, inviti, comunicazioni da regola): Meta
    // lo accetta solo entro 24 ore da un messaggio dell'utente.
    expect(whatsAppSkipReason({ ...base, templateKind: "swap_offer_student" })).toMatch(
      /nessun template approvato/,
    );
  });

  it("l'utente ha revocato il consenso", () => {
    expect(whatsAppSkipReason({ ...base, optedOut: true })).toMatch(/revocato/);
  });

  it("template ancora in approvazione su Meta", () => {
    expect(
      whatsAppSkipReason({ ...base, template: { ...approvedUtility, approval: "pending" } }),
    ).toMatch(/non ancora approvato/);
  });

  // 22/10: Meta ha riclassificato marketing due template sottomessi come
  // utility. Costano di più e chiedono un opt-in esplicito: non si mandano, la
  // cascata ripiega sull'email.
  it("template riclassificato marketing da Meta", () => {
    expect(
      whatsAppSkipReason({ ...base, template: { ...approvedUtility, category: "marketing" } }),
    ).toMatch(/marketing/);
  });

  it("destinatario mancante", () => {
    expect(whatsAppSkipReason({ ...base, recipient: "" })).toMatch(/destinatario/);
  });
});

describe("quando si manda", () => {
  it("canale acceso, template approvato, consenso valido", () => {
    expect(whatsAppSkipReason(base)).toBeNull();
  });

  it.each([
    "appointment_reminder_student",
    "morning_reminder_student",
    "day_before_reminder_student",
    "exam_reminder_student",
    "appointment_reminder_instructor",
  ])("%s ha il suo template", (kind) => {
    expect(hasWhatsAppTemplate(kind)).toBe(true);
  });

  // I quattro messaggi-evento aggiunti il 16/10. Il nome della chiave è il
  // `kind` del registro: se qualcuno lo rinomina, `deliverWhatsApp` non trova
  // più il template e il messaggio torna a essere uno `skipped` muto.
  it.each([
    "appointment_cancelled",
    "appointment_rescheduled",
    "appointment_location_changed",
    "exam_scheduled",
  ])("%s ha il suo template", (kind) => {
    expect(hasWhatsAppTemplate(kind)).toBe(true);
  });
});

describe("gli inviti restano su push (decisione del 21/09, confermata il 16/10)", () => {
  // Non è una dimenticanza: sono proposte, non impegni presi, e da soli valgono
  // piu' di tutti i promemoria in bolletta (5.489 inviti ai gruppi in 30
  // giorni). Se un giorno qualcuno aggiunge il template, questo test cade e
  // costringe a rileggere la decisione.
  it.each([
    "group_lesson_invite",
    "group_lesson_invite_student",
    "slot_fill_offer",
    "swap_offer",
    "swap_offer_student",
    "waitlist_slot_student",
    "available_slots",
    "broadcast",
  ])("%s NON ha un template", (kind) => {
    expect(hasWhatsAppTemplate(kind)).toBe(false);
  });
});

describe("la variabile `nome`", () => {
  it("usa il nome di battesimo: i testi cominciano con «Ciao …»", () => {
    expect(firstNameFor({ name: "Marco Rossi", email: "marco@example.com" })).toBe("Marco");
    expect(firstNameFor({ name: "  Anna   Maria De Luca " })).toBe("Anna");
  });

  it("senza nome ripiega sull'email, non lascia un buco", () => {
    // Meta rifiuta i parametri vuoti: un buco qui sarebbe un invio perso.
    expect(firstNameFor({ name: null, email: "giulia@example.com" })).toBe("Giulia");
    expect(firstNameFor({ name: "", email: "" })).toBe("Allievo");
    expect(firstNameFor({})).toBe("Allievo");
  });
});

describe("l'ordine dei controlli", () => {
  it("il canale spento vince su tutto: nessun motivo più specifico lo copre", () => {
    // Se il canale è spento il messaggio non parte comunque: dire "manca il
    // template" manderebbe chi legge il registro a cercare la cosa sbagliata.
    expect(
      whatsAppSkipReason({
        recipient: "",
        templateKind: "swap_offer_student",
        channelAvailable: false,
        optedOut: true,
      }),
    ).toMatch(/destinatario/);
    expect(
      whatsAppSkipReason({
        ...base,
        templateKind: "swap_offer_student",
        channelAvailable: false,
      }),
    ).toMatch(/non configurato/);
  });
});

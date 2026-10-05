import {
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

const base = {
  recipient: "+393331234567",
  templateKind: "appointment_reminder_student",
  channelAvailable: true,
  optedOut: false,
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

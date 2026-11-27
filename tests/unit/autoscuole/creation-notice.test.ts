import {
  CREATION_NOTICE_MAX_DELAY_MS,
  CREATION_NOTICE_QUIET_MS,
  creationNoticeText,
  creationNoticeWhatsAppGuides,
  groupCreationNoticeBatches,
  initialCreationNotice,
  isReadyToFlush,
} from "@/lib/autoscuole/creation-notice";
import {
  WHATSAPP_TEMPLATES,
  buildTemplateParameters,
  sendableTemplateName,
} from "@/lib/autoscuole/whatsapp-templates";

/**
 * REG-758 — avviso «guida fissata». Le regole da blindare:
 * quando una guida entra in coda, quando la coda parte, e cosa legge l'allievo.
 */
const NOW = new Date("2026-11-17T10:00:00Z");
const minutes = (n: number) => n * 60_000;
const at = (iso: string) => new Date(iso);

// Giovedì 19/11/2026 15:00 a Roma = 14:00 UTC.
const thursday = {
  type: "guida",
  startsAt: at("2026-11-19T14:00:00Z"),
  endsAt: at("2026-11-19T15:00:00Z"),
  instructorName: "Marco Rossi",
};
const friday = {
  type: "guida",
  startsAt: at("2026-11-20T08:00:00Z"),
  endsAt: at("2026-11-20T09:00:00Z"),
  instructorName: "Marco Rossi",
};

describe("initialCreationNotice", () => {
  it("mette in coda una guida futura se la funzione è accesa", () => {
    expect(
      initialCreationNotice({ enabled: true, type: "guida", startsAt: thursday.startsAt, now: NOW }),
    ).toBe("pending");
  });

  it("spenta (default) non mette in coda niente", () => {
    expect(
      initialCreationNotice({ enabled: false, type: "guida", startsAt: thursday.startsAt, now: NOW }),
    ).toBeNull();
  });

  it("gli esami hanno già «esame fissato»", () => {
    expect(
      initialCreationNotice({ enabled: true, type: "esame", startsAt: thursday.startsAt, now: NOW }),
    ).toBeNull();
  });

  it("una guida nel passato è una registrazione a posteriori", () => {
    expect(
      initialCreationNotice({
        enabled: true,
        type: "guida",
        startsAt: new Date(NOW.getTime() - minutes(30)),
        now: NOW,
      }),
    ).toBeNull();
  });

  it("le guide di gruppo entrano in coda", () => {
    expect(
      initialCreationNotice({
        enabled: true,
        type: "group_lesson",
        startsAt: thursday.startsAt,
        now: NOW,
      }),
    ).toBe("pending");
  });
});

describe("isReadyToFlush", () => {
  it("aspetta 3 minuti di quiete dall'ultima guida", () => {
    const last = new Date(NOW.getTime() - CREATION_NOTICE_QUIET_MS + 1_000);
    expect(isReadyToFlush([last], NOW)).toBe(false);
    expect(isReadyToFlush([new Date(NOW.getTime() - CREATION_NOTICE_QUIET_MS)], NOW)).toBe(true);
  });

  it("parte comunque dopo 15 minuti dalla prima, anche se lo staff continua", () => {
    const first = new Date(NOW.getTime() - CREATION_NOTICE_MAX_DELAY_MS);
    const justNow = new Date(NOW.getTime() - 10_000);
    expect(isReadyToFlush([first, justNow], NOW)).toBe(true);
  });

  it("senza guide non parte", () => {
    expect(isReadyToFlush([], NOW)).toBe(false);
  });
});

describe("creationNoticeText (push ed email)", () => {
  it("una guida: data, ora e istruttore", () => {
    expect(creationNoticeText([thursday])).toEqual({
      title: "📅 Guida fissata",
      body:
        "Ti è stata fissata la guida di giovedì 19 novembre alle 15:00 con Marco Rossi. " +
        "Ti aspettiamo in autoscuola.",
    });
  });

  it("più guide: un messaggio solo, in ordine di orario", () => {
    const text = creationNoticeText([friday, thursday]);
    expect(text.title).toBe("📅 2 guide fissate");
    expect(text.body).toBe(
      "Ti sono state fissate 2 guide con Marco Rossi: giovedì 19 novembre alle 15:00 e " +
        "venerdì 20 novembre alle 09:00. Ti aspettiamo in autoscuola.",
    );
  });

  it("istruttori diversi: il nome non si scrive", () => {
    const text = creationNoticeText([thursday, { ...friday, instructorName: "Anna Bianchi" }]);
    expect(text.body).not.toContain("Marco");
    expect(text.body).not.toContain("Anna");
  });

  it("guida di gruppo", () => {
    expect(creationNoticeText([{ ...thursday, type: "group_lesson" }]).title).toBe(
      "📅 Guida di gruppo fissata",
    );
  });

  it("oltre dieci guide l'elenco si chiude con «e altre N»", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...thursday,
      startsAt: new Date(thursday.startsAt.getTime() + i * 86_400_000),
    }));
    expect(creationNoticeText(many).body).toContain("e altre 2.");
  });
});

describe("creationNoticeWhatsAppGuides (variabile {{2}} del template)", () => {
  it("una guida", () => {
    expect(creationNoticeWhatsAppGuides([thursday])).toBe(
      "la guida di giovedì 19 novembre alle 15:00",
    );
  });

  it("più guide, forma corta e senza istruttore", () => {
    const value = creationNoticeWhatsAppGuides([thursday, friday]);
    expect(value).toBe("2 guide: giovedì 19/11 alle 15:00 e venerdì 20/11 alle 09:00");
    expect(value).not.toContain("Marco");
  });

  it("il template ha le due variabili nell'ordine giusto e il testo approvato da Tiziano", () => {
    const template = WHATSAPP_TEMPLATES.appointment_created;
    expect(template.name).toBe("guida_fissata_allievo_v2");
    expect(template.category).toBe("utility");
    expect(template.body).toBe(
      "Ciao {{1}}, ti abbiamo fissato {{2}}. Ti aspettiamo in autoscuola.",
    );
    expect(
      buildTemplateParameters("appointment_created", {
        nome: "Giulia",
        guide: creationNoticeWhatsAppGuides([thursday]),
      }),
    ).toEqual(["Giulia", "la guida di giovedì 19 novembre alle 15:00"]);
  });
});

describe("groupCreationNoticeBatches (inbox mobile)", () => {
  const row = (id: string, offsetMinutes: number) => ({
    id,
    createdAt: new Date(NOW.getTime() + minutes(offsetMinutes)),
  });

  it("guide create di fila finiscono nello stesso messaggio", () => {
    const batches = groupCreationNoticeBatches([row("a", 0), row("b", 1), row("c", 2.5)]);
    expect(batches.map((batch) => batch.map((r) => r.id))).toEqual([["a", "b", "c"]]);
  });

  it("dopo 3 minuti di pausa comincia un messaggio nuovo", () => {
    const batches = groupCreationNoticeBatches([row("a", 0), row("b", 4)]);
    expect(batches).toHaveLength(2);
  });

  it("oltre 15 minuti dalla prima comincia un messaggio nuovo", () => {
    const rows = [0, 2, 4, 6, 8, 10, 12, 14, 16].map((m, i) => row(String(i), m));
    const batches = groupCreationNoticeBatches(rows);
    expect(batches[0]).toHaveLength(8);
    expect(batches[1].map((r) => r.id)).toEqual(["8"]);
  });
});

describe("chiusura senza «modifiche o disdette» (25/11)", () => {
  it("push ed email non invitano più a disdire", () => {
    for (const lessons of [[thursday], [thursday, friday]]) {
      const { body } = creationNoticeText(lessons);
      expect(body).not.toContain("disdette");
      expect(body.endsWith("Ti aspettiamo in autoscuola.")).toBe(true);
    }
  });

  it("la v2 è approvata e parte lei; la v1 resta come ripiego", () => {
    const template = WHATSAPP_TEMPLATES.appointment_created;
    expect(template.approval).toBe("approved");
    expect(sendableTemplateName(template)).toBe("guida_fissata_allievo_v2");
    expect(sendableTemplateName({ ...template, approval: "pending" })).toBe(
      "guida_fissata_allievo_v1",
    );
  });
});

import {
  effectiveMessageChannels,
  messageChannelsForSettings,
  storedMessageChannels,
  whatsappReadyByMessage,
} from "@/lib/autoscuole/message-channels";

/**
 * REG-767 — i canali per singola comunicazione: si parte con solo l'App,
 * sovrascrivibili riga per riga, riga vuota = spenta.
 */

describe("storedMessageChannels", () => {
  it("le righe mai toccate partono con solo l'App, qualunque fosse la scelta globale", () => {
    const limits = {
      studentReminderChannels: ["push", "whatsapp", "email"],
      instructorReminderChannels: ["email"],
    };
    expect(storedMessageChannels(limits, "appointment_cancelled")).toEqual(["push"]);
    expect(storedMessageChannels(limits, "appointment_reminder_instructor")).toEqual(["push"]);
    expect(storedMessageChannels({}, "appointment_reminder_student")).toEqual(["push"]);
  });

  it("la riga salvata vince sulla globale, e una lista vuota resta vuota", () => {
    const limits = {
      studentReminderChannels: ["push", "whatsapp", "email"],
      channelsByMessage: { appointment_rescheduled: ["whatsapp"], exam_scheduled: [] },
    };
    expect(storedMessageChannels(limits, "appointment_rescheduled")).toEqual(["whatsapp"]);
    expect(storedMessageChannels(limits, "exam_scheduled")).toEqual([]);
  });

  it("scarta valori strani e doppioni, e rimette l'ordine", () => {
    const limits = { channelsByMessage: { appointment_created: ["email", "sms", "push", "email"] } };
    expect(storedMessageChannels(limits, "appointment_created")).toEqual(["push", "email"]);
  });
});

describe("effectiveMessageChannels", () => {
  it("una comunicazione spenta dal suo interruttore non parte", () => {
    const limits = {
      studentReminderMorningEnabled: false,
      channelsByMessage: { morning_reminder_student: ["push"] },
    };
    expect(effectiveMessageChannels(limits, "morning_reminder_student")).toEqual([]);
  });

  it("il promemoria istruttore è acceso di default", () => {
    expect(effectiveMessageChannels({}, "appointment_reminder_instructor")).toEqual(["push"]);
    expect(
      effectiveMessageChannels({ instructorReminderEnabled: false }, "appointment_reminder_instructor"),
    ).toEqual([]);
  });

  it("le righe senza interruttore si spengono con la lista vuota", () => {
    const limits = { channelsByMessage: { appointment_cancelled: [] } };
    expect(effectiveMessageChannels(limits, "appointment_cancelled")).toEqual([]);
  });
});

describe("per la pagina", () => {
  it("dà una lista per ogni comunicazione del catalogo", () => {
    const all = messageChannelsForSettings({});
    expect(Object.keys(all)).toHaveLength(9);
    // mattino e giorno prima sono spenti di default, come prima
    expect(all.morning_reminder_student).toEqual([]);
    expect(all.appointment_reminder_student).toEqual(["push"]);
  });

  it("WhatsApp solo dove c'è un modello Meta utility approvato", () => {
    const ready = whatsappReadyByMessage();
    expect(ready.appointment_cancelled).toBe(true);
    // v2 marketing, v3 in attesa
    expect(ready.morning_reminder_student).toBe(false);
    expect(ready.appointment_rescheduled).toBe(false);
    // v1 in attesa
    expect(ready.appointment_created).toBe(false);
  });
});

import {
  effectiveMessageChannels,
  messageChannelsForSettings,
  storedMessageChannels,
  whatsappReadyByMessage,
} from "@/lib/autoscuole/message-channels";
import { sendableTemplateName } from "@/lib/autoscuole/whatsapp-templates";

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
    expect(Object.keys(all)).toHaveLength(10);
    // REG-771: la riga istruttori dello spostamento parte con solo l'App
    expect(all.appointment_rescheduled_instructor).toEqual(["push"]);
    // mattino e giorno prima sono spenti di default, come prima
    expect(all.morning_reminder_student).toEqual([]);
    expect(all.appointment_reminder_student).toEqual(["push"]);
  });

  it("REG-771: tutte le righe hanno un modello Meta utility approvato, tranne lo spostamento agli istruttori", () => {
    const { appointment_rescheduled_instructor, ...rest } = whatsappReadyByMessage();
    expect(Object.values(rest).every(Boolean)).toBe(true);
    expect(appointment_rescheduled_instructor).toBe(false);
  });

  it("REG-771: la riga istruttori dello spostamento è indipendente da quella degli allievi", () => {
    const limits = {
      channelsByMessage: { appointment_rescheduled: ["email"], appointment_rescheduled_instructor: ["push"] },
    };
    expect(effectiveMessageChannels(limits, "appointment_rescheduled")).toEqual(["email"]);
    expect(effectiveMessageChannels(limits, "appointment_rescheduled_instructor")).toEqual(["push"]);
  });

  it("un modello si manda solo se approvato e utility, altrimenti la versione precedente", () => {
    const base = { variables: ["nome"], body: "Ciao {{1}}, prova." };
    // in attesa, precedente marketing: nessuno si può mandare
    expect(
      sendableTemplateName({
        ...base,
        name: "x_v3",
        category: "utility",
        approval: "pending",
        previous: { name: "x_v2", category: "marketing", approval: "approved" },
      }),
    ).toBeNull();
    // in attesa, precedente utility approvato: si manda il precedente
    expect(
      sendableTemplateName({
        ...base,
        name: "x_v3",
        category: "utility",
        approval: "pending",
        previous: { name: "x_v2", category: "utility", approval: "approved" },
      }),
    ).toBe("x_v2");
  });
});

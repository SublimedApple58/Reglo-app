import { friendlyReason, groupDeliveries } from "@/lib/autoscuole/recent-deliveries";

/**
 * REG-500 — «Ultimi invii»: un messaggio, non un tentativo. La cascata lascia
 * più righe per lo stesso promemoria; l'autoscuola deve vederne una.
 */

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 22, 8, minutes));
const row = (over: Partial<Parameters<typeof groupDeliveries>[0][number]>) => ({
  kind: "appointment_reminder_student",
  channel: "push",
  status: "sent",
  error: null,
  appointmentId: "a1",
  studentId: "s1",
  recipient: "s1",
  createdAt: at(0),
  ...over,
});

const names = new Map([["s1", "Giulia Rossi"], ["s2", "Luca Ferri"]]);

describe("groupDeliveries", () => {
  it("push saltata + WhatsApp partito = un messaggio arrivato su WhatsApp", () => {
    const result = groupDeliveries(
      [
        row({ channel: "whatsapp", status: "sent", recipient: "+39333" }),
        row({ channel: "push", status: "skipped", error: "nessun dispositivo con l'app attiva" }),
      ],
      names,
      10,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      studentName: "Giulia Rossi",
      label: "Promemoria guida",
      channel: "whatsapp",
      reason: null,
    });
  });

  it("niente arrivato: il motivo è detto in parole della segreteria", () => {
    const [item] = groupDeliveries(
      [
        row({ studentId: "s2", channel: "whatsapp", status: "skipped", error: "l'utente ha revocato il consenso WhatsApp" }),
        row({ studentId: "s2", channel: "push", status: "skipped", error: "nessun dispositivo con l'app attiva" }),
      ],
      names,
      10,
    );
    expect(item.channel).toBeNull();
    expect(item.reason).toBe("ha chiesto di non ricevere WhatsApp · non ha l'app");
  });

  it("due guide diverse restano due messaggi", () => {
    const result = groupDeliveries(
      [row({ appointmentId: "a1" }), row({ appointmentId: "a2" })],
      names,
      10,
    );
    expect(result).toHaveLength(2);
  });

  it("lo stesso promemoria a distanza di ore non si fonde", () => {
    const result = groupDeliveries([row({ createdAt: at(30) }), row({ createdAt: at(0) })], names, 10);
    expect(result).toHaveLength(2);
  });
});

describe("friendlyReason", () => {
  it("non inventa motivi per errori che non conosce", () => {
    expect(friendlyReason("whatsapp", "Telnyx: 500")).toBeNull();
  });
});

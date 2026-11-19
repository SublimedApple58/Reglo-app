import { deliverAndLog } from "@/lib/autoscuole/delivery-log";
import { friendlyReason } from "@/lib/autoscuole/recent-deliveries";

/**
 * Il registro non deve dire «inviato» per una email che non parte.
 *
 * Il bug che questi test impediscono di rifare: gli allievi creati senza email
 * hanno un segnaposto `allievo+<id>@no-app.reglo.local`. `sendDynamicEmail` lo
 * scarta senza lanciare, `deliverAndLog` registrava `sent` e la cascata si
 * fermava lì. Al consorzio (17-19/11) WhatsApp era bloccato da Telnyx e ogni
 * promemoria risultava «inviato via email» senza arrivare a nessuno.
 */

const logged: Array<{ channel: string; recipient: string; status: string; error: string | null }> = [];

jest.mock("@/db/prisma", () => ({
  prisma: {
    autoscuolaMessageLog: {
      create: jest.fn(async ({ data }: { data: (typeof logged)[number] }) => {
        logged.push({
          channel: data.channel,
          recipient: data.recipient,
          status: data.status,
          error: data.error,
        });
        return data;
      }),
    },
  },
}));

const attempt = (recipient: string) => ({
  companyId: "company-1",
  kind: "appointment_reminder_student",
  channel: "email" as const,
  recipient,
  appointmentId: "appointment-1",
  studentId: "student-1",
});

beforeEach(() => {
  logged.length = 0;
});

describe("deliverAndLog — email non consegnabile", () => {
  it.each([
    "allievo+6ec035f4-8308-4ec6-aeba-c691299ff134@no-app.reglo.local",
    "deleted+abc@deleted.reglo.local",
  ])("%s: non prova a inviare, registra skipped e lascia scendere la cascata", async (recipient) => {
    const send = jest.fn(async () => undefined);

    const delivered = await deliverAndLog(attempt(recipient), send);

    expect(delivered).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(logged).toEqual([
      { channel: "email", recipient, status: "skipped", error: "nessuna email reale" },
    ]);
  });

  it("un indirizzo vero parte e resta `sent`", async () => {
    const send = jest.fn(async () => undefined);

    const delivered = await deliverAndLog(attempt("mario.rossi@example.com"), send);

    expect(delivered).toBe(true);
    expect(send).toHaveBeenCalledWith("mario.rossi@example.com");
    expect(logged).toEqual([
      { channel: "email", recipient: "mario.rossi@example.com", status: "sent", error: null },
    ]);
  });

  it("il segnaposto conta solo per l'email: una push con l'id utente non viene toccata", async () => {
    const send = jest.fn(async () => ({ sent: 1 }));

    const delivered = await deliverAndLog(
      { ...attempt("user-1"), channel: "push", kind: "appointment_reminder_student" },
      send,
    );

    expect(delivered).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("in «Ultimi invii» il motivo si legge come per l'email mancante", () => {
    expect(friendlyReason("email", "nessuna email reale")).toBe("nessuna email in anagrafica");
  });
});

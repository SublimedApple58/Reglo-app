import { studentBookedText } from "@/lib/autoscuole/exam-notifications";
import {
  MESSAGE_AUDIENCE,
  effectiveMessageChannels,
} from "@/lib/autoscuole/message-channels";

/**
 * REG-742: avviso all'istruttore quando un suo allievo prenota.
 * Due cose da blindare: è spento finché l'autoscuola non lo accende, e i testi
 * sono quelli approvati («lun 12 ott alle 09:30», ora di Roma).
 */
describe("REG-742 — guida prenotata dall'allievo", () => {
  // 12 ottobre 2026, 09:30 a Roma (ora legale: UTC+2).
  const startsAt = new Date("2026-10-12T07:30:00Z");

  it("è una riga degli istruttori", () => {
    expect(MESSAGE_AUDIENCE.student_booked).toBe("instructor");
  });

  it("è spenta di default, anche con la riga mai toccata", () => {
    expect(effectiveMessageChannels({}, "student_booked")).toEqual([]);
    expect(
      effectiveMessageChannels({ channelsByMessage: { student_booked: ["push"] } }, "student_booked"),
    ).toEqual([]);
  });

  it("parte sui canali accesi quando il flag è acceso", () => {
    expect(
      effectiveMessageChannels(
        {
          instructorBookingNoticeEnabled: true,
          channelsByMessage: { student_booked: ["email", "push"] },
        },
        "student_booked",
      ),
    ).toEqual(["push", "email"]);
    // Flag acceso, riga mai toccata: solo l'App, come tutte le righe.
    expect(
      effectiveMessageChannels({ instructorBookingNoticeEnabled: true }, "student_booked"),
    ).toEqual(["push"]);
  });

  it("testo della guida prenotata", () => {
    expect(
      studentBookedText({ studentName: "Mario Rossi", startsAt, isGroupLesson: false }),
    ).toEqual({
      title: "Nuova guida prenotata",
      body: "Mario Rossi ha prenotato una guida per lun 12 ott alle 09:30.",
    });
  });

  it("testo dell'iscrizione alla guida di gruppo", () => {
    expect(
      studentBookedText({ studentName: "Mario Rossi", startsAt, isGroupLesson: true }),
    ).toEqual({
      title: "Nuovo iscritto alla guida di gruppo",
      body: "Mario Rossi si è iscritto alla guida di gruppo di lun 12 ott alle 09:30.",
    });
  });
});

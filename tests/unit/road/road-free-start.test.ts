import { freeLessonEnd } from "@/lib/autoscuole/road/geo";

describe("Road libero: fine della guida nata da Road", () => {
  const start = new Date("2026-10-28T10:00:00Z");
  const booked = new Date("2026-10-28T11:00:00Z");

  it("arrotonda per eccesso ai 5 minuti", () => {
    expect(freeLessonEnd(start, booked, new Date("2026-10-28T10:41:10Z")).toISOString()).toBe("2026-10-28T10:45:00.000Z");
  });

  it("non va mai oltre la fine prenotata", () => {
    expect(freeLessonEnd(start, booked, new Date("2026-10-28T11:20:00Z")).toISOString()).toBe(booked.toISOString());
  });

  it("dura almeno 5 minuti", () => {
    expect(freeLessonEnd(start, booked, new Date("2026-10-28T10:00:30Z")).toISOString()).toBe("2026-10-28T10:05:00.000Z");
  });
});

import {
  DEFAULT_REMINDER_CHANNELS,
  getConfiguredChannels,
  parseReminderChannels,
  resolveChannels,
} from "@/lib/autoscuole/reminder-channels";

const limitsMock = jest.fn();
jest.mock("@/lib/autoscuole/cached-service", () => ({
  getCachedCompanyServiceLimits: (...args: unknown[]) => limitsMock(...args),
}));

beforeEach(() => limitsMock.mockReset());

describe("parseReminderChannels", () => {
  it("non impostato → tutti e tre", () => {
    // Un'autoscuola che non ha mai aperto quelle impostazioni non deve
    // perdere un canale: è il default storico dei promemoria.
    expect(parseReminderChannels(undefined)).toEqual([...DEFAULT_REMINDER_CHANNELS]);
    expect(parseReminderChannels(null)).toEqual([...DEFAULT_REMINDER_CHANNELS]);
    expect(parseReminderChannels("push")).toEqual([...DEFAULT_REMINDER_CHANNELS]);
  });

  it("lista vuota o tutta sporca → tutti e tre", () => {
    expect(parseReminderChannels([])).toEqual([...DEFAULT_REMINDER_CHANNELS]);
    expect(parseReminderChannels(["sms", 42, null])).toEqual([...DEFAULT_REMINDER_CHANNELS]);
  });

  it("tiene solo i canali validi e li deduplica", () => {
    expect(parseReminderChannels(["push", "push", "sms", "email"])).toEqual(["push", "email"]);
  });
});

describe("getConfiguredChannels", () => {
  it("l'allievo legge studentReminderChannels", async () => {
    limitsMock.mockResolvedValue({
      studentReminderChannels: ["push"],
      instructorReminderChannels: ["push", "email"],
    });
    await expect(getConfiguredChannels("c1", "student")).resolves.toEqual(["push"]);
  });

  it("l'istruttore legge il suo, non quello dell'allievo", async () => {
    limitsMock.mockResolvedValue({
      studentReminderChannels: ["push"],
      instructorReminderChannels: ["push", "email"],
    });
    await expect(getConfiguredChannels("c1", "instructor")).resolves.toEqual(["push", "email"]);
  });

  it("il titolare non ha un'impostazione: non filtra e non interroga nemmeno", async () => {
    // Il gancio c'è per il giorno in cui `ownerNotificationChannels` nascerà.
    await expect(getConfiguredChannels("c1", "owner")).resolves.toEqual([
      ...DEFAULT_REMINDER_CHANNELS,
    ]);
    expect(limitsMock).not.toHaveBeenCalled();
  });
});

describe("resolveChannels — configurati ∩ supportati", () => {
  it("solo push configurato: l'email non parte anche se il messaggio la prevede", async () => {
    limitsMock.mockResolvedValue({ studentReminderChannels: ["push"] });
    await expect(resolveChannels("c1", "student", ["push", "email"])).resolves.toEqual(["push"]);
  });

  it("push+whatsapp configurati, messaggio senza template: resta la push", async () => {
    limitsMock.mockResolvedValue({ studentReminderChannels: ["push", "whatsapp"] });
    await expect(resolveChannels("c1", "student", ["push", "email"])).resolves.toEqual(["push"]);
  });

  it("non impostato: push ed email", async () => {
    limitsMock.mockResolvedValue({});
    await expect(resolveChannels("c1", "student", ["push", "email"])).resolves.toEqual([
      "push",
      "email",
    ]);
  });

  it("nessuna intersezione → lista vuota, e chi invia non manda niente", async () => {
    // In produzione non esiste (tutte le 20 autoscuole hanno `push`), ma il
    // comportamento va fissato: silenzio, non un ripiego forzato.
    limitsMock.mockResolvedValue({ studentReminderChannels: ["whatsapp"] });
    await expect(resolveChannels("c1", "student", ["push", "email"])).resolves.toEqual([]);
  });

  it("l'ordine è quello del messaggio, non quello della configurazione", async () => {
    limitsMock.mockResolvedValue({ studentReminderChannels: ["email", "push"] });
    await expect(resolveChannels("c1", "student", ["push", "email"])).resolves.toEqual([
      "push",
      "email",
    ]);
  });
});

import { isOptOutText } from "@/lib/autoscuole/whatsapp-webhook";

/**
 * Il consenso è la parte che fa bloccare il mittente se sbagliata: scrivere a
 * chi ha detto STOP fa scendere la quality rating di Meta, e il mittente è
 * **uno solo per tutte le autoscuole** — un errore qui le colpisce tutte insieme.
 */
describe("riconoscimento della revoca", () => {
  it.each([
    "STOP",
    "stop",
    " Stop! ",
    "cancellami",
    "per favore cancellami dalla lista",
    "non scrivetemi più",
    "basta messaggi",
    "UNSUBSCRIBE",
  ])("tratta %p come revoca", (text) => {
    expect(isOptOutText(text)).toBe(true);
  });

  it.each([
    "ok grazie",
    "posso spostare la guida?",
    "a domani!",
    "non ho capito a che ora",
    "",
  ])("NON tratta %p come revoca", (text) => {
    expect(isOptOutText(text)).toBe(false);
  });
});

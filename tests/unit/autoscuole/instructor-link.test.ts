

import {
  instructorInitials,
  instructorLinkUrl,
  normalizeInstructorCode,
} from "@/lib/autoscuole/instructor-initials";

describe("normalizeInstructorCode", () => {
  it("accetta il codice nudo, anche minuscolo o con spazi", () => {
    expect(normalizeInstructorCode("GM4K2P")).toBe("GM4K2P");
    expect(normalizeInstructorCode(" gm4 k2p ")).toBe("GM4K2P");
  });

  it("estrae il codice dall'URL del QR, con locale o query", () => {
    expect(normalizeInstructorCode("https://app.reglo.it/i/GM4K2P")).toBe("GM4K2P");
    expect(normalizeInstructorCode("https://app.reglo.it/it/i/gm4k2p?x=1")).toBe("GM4K2P");
    expect(normalizeInstructorCode("https://staging.reglo.it/i/GM4K2P/")).toBe("GM4K2P");
  });

  it("rifiuta codici malformati o di lunghezza sbagliata", () => {
    expect(normalizeInstructorCode("Q7XZ1A")).toBe("Q7XZ1A"); // la validità la decide il DB
    expect(normalizeInstructorCode("GM4-2P")).toBeNull();
    expect(normalizeInstructorCode("GM4K2")).toBeNull();
    expect(normalizeInstructorCode("https://example.com/foo")).toBeNull();
    expect(normalizeInstructorCode("")).toBeNull();
    expect(normalizeInstructorCode(null)).toBeNull();
  });
});

describe("helpers", () => {
  it("costruisce l'URL del QR senza doppie barre", () => {
    expect(instructorLinkUrl("https://app.reglo.it/", "GM4K2P")).toBe("https://app.reglo.it/i/GM4K2P");
  });

  it("iniziali da nome e cognome, con fallback", () => {
    expect(instructorInitials("Giulia Moretti")).toBe("GM");
    expect(instructorInitials("marco")).toBe("M");
    expect(instructorInitials("  ")).toBe("IS");
  });
});

describe("charset", () => {
  it("resta allineato a quello della generazione dei codici", () => {
    jest.isolateModules(() => {
      jest.doMock("@/db/prisma", () => ({ prisma: {} }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { INSTRUCTOR_CODE_CHARSET } = require("@/lib/autoscuole/invite-codes");
      for (const ch of INSTRUCTOR_CODE_CHARSET) {
        expect(normalizeInstructorCode(ch.repeat(6))).toBe(ch.repeat(6));
      }
      expect(INSTRUCTOR_CODE_CHARSET).toHaveLength(32);
    });
  });
});

describe("deep link verso l'app", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dl = require("@/lib/autoscuole/instructor-link-deeplink");

  it("riconosce la piattaforma dallo user agent", () => {
    expect(dl.detectMobilePlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios");
    expect(dl.detectMobilePlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("android");
    expect(dl.detectMobilePlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("other");
    expect(dl.detectMobilePlatform(null)).toBe("other");
  });

  it("iOS usa lo scheme dell'app, Android un intent con fallback su Play Store", () => {
    expect(dl.appOpenUrl("GM4K2P", "ios")).toBe("com.tiziano.developer.reglo-mobile://associa-istruttore?code=GM4K2P");
    const intent = dl.appOpenUrl("GM4K2P", "android");
    expect(intent).toContain("intent://associa-istruttore?code=GM4K2P#Intent;");
    expect(intent).toContain("scheme=com.tiziano.developer.reglo-mobile");
    expect(intent).toContain("package=com.tiziano.developer.reglomobile");
    expect(intent).toContain(`S.browser_fallback_url=${encodeURIComponent(dl.PLAY_STORE_URL)}`);
  });
});

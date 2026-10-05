import {
  AUTOSCUOLA_LICENSE_CATEGORIES,
  CONSORTIUM_LICENSE_CATEGORIES,
  LICENSE_CATEGORY_LABELS,
  QUADRICYCLE_LICENSE_CATEGORIES,
  STUDENT_LICENSE_CATEGORIES,
  isMotoLicenseCategory,
  licenseCategoryEligible,
  licenseCategoryGroupsForMode,
  licensePathBucket,
  vehicleServesLicense,
} from "@/lib/autoscuole/license";
import { licenseColorEntryForTag } from "@/lib/autoscuole/agenda-color-criterion";

/**
 * REG-588 — microcar (AMQ) e quadriciclo pesante (B1).
 *
 * La AM copre per legge sia il ciclomotore sia il quadriciclo leggero, ma sono
 * due corsi su due mezzi diversi. Questi test tengono ferma la decisione che
 * conta: i quadricicli sono **quattro ruote, non moto**.
 */

describe("i quadricicli non sono moto", () => {
  it.each(QUADRICYCLE_LICENSE_CATEGORIES)("%s non è una categoria moto", (cat) => {
    expect(isMotoLicenseCategory(cat)).toBe(false);
  });

  it("un allievo della A NON può guidare una microcar", () => {
    // La famiglia moto ha la gerarchia AM < A1 < A2 < A: un allievo della A può
    // usare un mezzo AM. Se la microcar fosse moto, se la vedrebbe assegnare.
    expect(licenseCategoryEligible("AM", "A")).toBe(true); // il ciclomotore sì
    expect(licenseCategoryEligible("AMQ", "A")).toBe(false); // la microcar no
    expect(licenseCategoryEligible("B1", "A")).toBe(false);
  });

  it("un allievo microcar non guida né moto né auto", () => {
    expect(licenseCategoryEligible("AM", "AMQ")).toBe(false);
    expect(licenseCategoryEligible("B", "AMQ")).toBe(false);
    expect(licenseCategoryEligible("B1", "AMQ")).toBe(false);
  });

  it("ciascuna combacia solo con se stessa", () => {
    expect(licenseCategoryEligible("AMQ", "AMQ")).toBe(true);
    expect(licenseCategoryEligible("B1", "B1")).toBe(true);
  });

  it("il cambio deve comunque combaciare", () => {
    const microcar = { licenseCategory: "AMQ", transmission: "automatic" };
    expect(vehicleServesLicense(microcar, { licenseCategory: "AMQ", transmission: "automatic" })).toBe(true);
    expect(vehicleServesLicense(microcar, { licenseCategory: "AMQ", transmission: "manual" })).toBe(false);
  });
});

describe("percorso di prenotazione", () => {
  it.each(QUADRICYCLE_LICENSE_CATEGORIES)("%s segue il percorso auto", (cat) => {
    // Decisione di prodotto (Tiziano, 03/10/2026): nessun bucket nuovo, quindi
    // nessun setting nuovo. Oggi ci arrivano dal default della funzione: se un
    // domani quel default cambiasse, questo test se ne accorgerebbe.
    expect(licensePathBucket(cat)).toBe("auto");
  });
});

describe("dove compaiono", () => {
  it("nel percorso patente dell'autoscuola", () => {
    for (const cat of QUADRICYCLE_LICENSE_CATEGORIES) {
      expect(AUTOSCUOLA_LICENSE_CATEGORIES).toContain(cat);
    }
  });

  it("fra quelle che l'allievo può scegliersi da solo", () => {
    for (const cat of QUADRICYCLE_LICENSE_CATEGORIES) {
      expect(STUDENT_LICENSE_CATEGORIES).toContain(cat);
    }
  });

  it("in un gruppo proprio nei picker, non dentro Moto", () => {
    const gruppi = licenseCategoryGroupsForMode(false);
    expect(gruppi.find((g) => g.label === "Quadricicli")?.categories).toEqual(["AMQ", "B1"]);
    expect(gruppi.find((g) => g.label === "Moto")?.categories).toEqual(["AM", "A1", "A2", "A"]);
  });

  it("NON fra le categorie del consorzio: non sono patenti superiori", () => {
    for (const cat of QUADRICYCLE_LICENSE_CATEGORIES) {
      expect(CONSORTIUM_LICENSE_CATEGORIES).not.toContain(cat);
    }
    expect(licenseCategoryGroupsForMode(true).map((g) => g.label)).not.toContain("Quadricicli");
  });

  it("hanno un'etichetta che distingue microcar da ciclomotore", () => {
    expect(LICENSE_CATEGORY_LABELS.AMQ).toBe("AM quadriciclo (microcar)");
    expect(LICENSE_CATEGORY_LABELS.AM).toBe("AM (ciclomotore)");
    expect(LICENSE_CATEGORY_LABELS.B1).toBe("B1 (quadriciclo pesante)");
  });
});

describe("colore in agenda", () => {
  // Senza una voce propria il tag cadrebbe nei prefissi: "AMQ" → am (verde
  // moto) e "B1" → b (blu auto). Due patenti nuove invisibili, in silenzio.
  it("la microcar ha il suo colore, non quello della AM", () => {
    expect(licenseColorEntryForTag("AMQ").key).toBe("amq");
    expect(licenseColorEntryForTag("AM").key).toBe("am");
  });

  it("la B1 ha il suo colore, non quello della B", () => {
    expect(licenseColorEntryForTag("B1").key).toBe("b1");
    expect(licenseColorEntryForTag("B").key).toBe("b");
  });
});

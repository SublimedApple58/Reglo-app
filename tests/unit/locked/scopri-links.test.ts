import fs from "node:fs";
import path from "node:path";

/**
 * Guardia su REG-579: i "Scopri di più" dei cartelli bloccati devono portare
 * alla pagina del sito che parla di quell'argomento.
 *
 * Il test legge i **sorgenti**, non monta i componenti: qui non interessa come
 * sono renderizzati, interessa che nessuno rimetta la homepage nuda o un link
 * interno. Il difetto che REG-579 ha chiuso era esattamente quello, ripetuto
 * in quattro punti, e nasceva dal fatto che l'url stava dentro il componente
 * condiviso invece che accanto al cartello.
 */

const ROOT = path.resolve(__dirname, "../../..");
const LOCKED_DIR = path.join(ROOT, "components/pages/Autoscuole/locked");

const read = (file: string) => fs.readFileSync(file, "utf8");

const lockedSources = fs
  .readdirSync(LOCKED_DIR)
  .filter((name) => name.endsWith(".tsx"))
  .map((name) => ({ name, code: read(path.join(LOCKED_DIR, name)) }));

const teaser = {
  name: "AutoscuoleRinnoviTeaser.tsx",
  code: read(path.join(ROOT, "components/pages/Autoscuole/AutoscuoleRinnoviTeaser.tsx")),
};

const features = read(path.join(LOCKED_DIR, "locked-features.tsx"));

describe("destinazioni dei link del sito", () => {
  it("nessun cartello punta più alla homepage nuda", () => {
    for (const { name, code } of [...lockedSources, teaser]) {
      expect({ name, hit: /href="https:\/\/reglo\.it"/.test(code) }).toEqual({
        name,
        hit: false,
      });
    }
  });

  it("nessun 'Scopri di più' resta dentro l'app", () => {
    // La card Segretaria puntava a `/${locale}`, cioè alla home del prodotto.
    for (const { name, code } of lockedSources) {
      expect({ name, hit: /href=\{`\/\$\{locale\}`\}/.test(code) }).toEqual({
        name,
        hit: false,
      });
    }
  });

  it("le pagine del sito usano tutte il dominio canonico con www", () => {
    const urls = [...features.matchAll(/`\$\{SITO\}(\/[a-z-]+)`/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThanOrEqual(6);
    expect(features).toContain('const SITO = "https://www.reglo.it"');
  });

  it("ogni destinazione passa da SITE_URLS, non da una stringa a mano", () => {
    for (const { name, code } of lockedSources) {
      // Solo le assegnazioni (finiscono con la virgola), non le dichiarazioni
      // di tipo `scopriUrl: string;`.
      const assegnazioni = [...code.matchAll(/scopriUrl:\s*([^;\n]+),$/gm)].map((m) =>
        m[1].trim(),
      );
      for (const valore of assegnazioni) {
        expect({ name, valore }).toEqual({
          name,
          valore: expect.stringMatching(/^SITE_URLS\./),
        });
      }
    }
  });

  it("i 14 cartelli delle Impostazioni hanno tutti una destinazione", () => {
    const code = read(path.join(LOCKED_DIR, "LockedSettingsPane.tsx"));
    const cartelli = [...code.matchAll(/^ {2}("?[a-z:]+"?): \{$/gm)].length;
    const destinazioni = [...code.matchAll(/^ {4}scopriUrl: /gm)].length;
    expect(cartelli).toBe(14);
    expect(destinazioni).toBe(14);
  });

  it("le quattro sezioni di LOCKED_SECTIONS hanno una destinazione", () => {
    const code = read(path.join(LOCKED_DIR, "LockedSection.tsx"));
    expect([...code.matchAll(/^ {4}scopriUrl: /gm)]).toHaveLength(4);
  });
});

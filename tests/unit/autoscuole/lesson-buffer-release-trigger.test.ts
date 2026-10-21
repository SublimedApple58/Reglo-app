import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * REG-628: la pausa si libera con un trigger sul DB (copre ogni strada che
 * annulla una guida). Il trigger lo prova l'e2e sul DB vero; qui si fissano
 * le regole che non devono cambiare per sbaglio.
 */
const sql = readFileSync(
  join(process.cwd(), "prisma/migrations/20261021120000_release_lesson_buffer_on_cancel/migration.sql"),
  "utf8",
);

describe("trigger che libera la pausa della guida annullata (REG-628)", () => {
  it("scatta su annullamento e su cancellazione della riga", () => {
    expect(sql).toMatch(/AFTER UPDATE OF "status" OR DELETE ON "AutoscuolaAppointment"/);
  });

  it("tocca solo le pause automatiche che partono alla fine della guida", () => {
    expect(sql).toMatch(/b\."reason" = 'lesson_buffer'/);
    expect(sql).toMatch(/b\."startsAt" = OLD\."endsAt"/);
    expect(sql).toMatch(/b\."instructorId" = OLD\."instructorId"/);
  });

  it("non tocca la pausa riusata da un sostituto attivo (fix aa25e00)", () => {
    expect(sql).toMatch(/NOT EXISTS[\s\S]*a\."endsAt" = OLD\."endsAt"[\s\S]*<> 'cancelled'/);
  });

  it("ignora le guide già annullate", () => {
    expect(sql).toMatch(/IF lower\(OLD\."status"\) = 'cancelled' THEN\s+RETURN NULL;/);
  });
});

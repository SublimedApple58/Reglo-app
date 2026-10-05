/**
 * Scrive in `/tmp/hiro-anteprime/reg-599/` un HTML per ogni tipo di email, così
 * si guardano in un browser senza montare l'app e senza spedire niente.
 *
 *   npx tsx scripts/preview-emails.ts
 *
 * Il modulo `email/template.ts` è puro apposta: nessun import di Next, nessun
 * client Resend. Vedi docs/features/email-template.md.
 */
import fs from "node:fs";
import path from "node:path";
import { renderRegloEmail, type RegloEmailContent } from "../email/template";

const OUT = "/tmp/hiro-anteprime/reg-599";
const baseUrl = process.env.PREVIEW_BASE_URL ?? `file://${path.resolve(__dirname, "../public")}`;

const samples: Array<{ file: string; content: RegloEmailContent }> = [
  {
    file: "1-invito",
    content: {
      subject: "Il tuo invito su Reglo — Autoscuola Solferino",
      heading: "Benvenuto in Autoscuola Solferino",
      body: [
        "Chiara Bianchi ti ha invitato a usare Reglo con Autoscuola Solferino.",
        "",
        "Da qui prenoti le guide, segui il percorso e ricevi i promemoria dell'autoscuola. Ti bastano un minuto e una password.",
      ].join("\n"),
      cta: { label: "Entra in autoscuola", url: "https://app.reglo.it/it/invite/abc" },
      fallbackLink: { label: "apri nel browser", url: "https://app.reglo.it/it/invite/abc" },
      footerNote: "Se non aspettavi questo invito, puoi ignorare l'email.",
    },
  },
  {
    file: "2-promemoria-guida",
    content: {
      subject: "Domani hai la guida — Reglo",
      body: "Promemoria: domani hai una guida alle 15:00. Durata 60 minuti.",
    },
  },
  {
    file: "3-codice-password",
    content: {
      subject: "Il tuo codice per reimpostare la password — Reglo",
      heading: "Reimposta la tua password",
      body: [
        "Ciao Marco,",
        "",
        "hai chiesto di reimpostare la password del tuo account Reglo. Inserisci questo codice nell'app:",
      ].join("\n"),
      highlight: { label: "Il tuo codice", value: "418 236".replace(" ", ""), mono: true },
      bodyAfter: "Il codice scade tra 10 minuti.",
      footerNote: "Se non hai richiesto tu il reset, ignora questa email: la password resta com'è.",
    },
  },
  {
    file: "4-guida-annullata",
    content: {
      subject: "🤒 Guida annullata — istruttore in malattia",
      body: "La guida di martedì 14 ottobre alle 15:00 con Chiara Bianchi è stata annullata perché l'istruttore è in malattia. Contatta la segreteria per riprenotarla.",
    },
  },
  {
    file: "5-pagamento-registrato",
    content: {
      subject: "Pagamento registrato",
      body: "Abbiamo registrato il pagamento della guida. Trovi il dettaglio nell'app.",
    },
  },
  {
    file: "6-posto-libero",
    content: {
      subject: "⏰ Slot guida disponibile",
      body: "Si è liberato un posto per una guida il 14/10/2026 alle 15:00. Apri Reglo per accettare o lasciarlo a un altro allievo.",
    },
  },
];

fs.mkdirSync(OUT, { recursive: true });
for (const { file, content } of samples) {
  fs.writeFileSync(path.join(OUT, `${file}.html`), renderRegloEmail(content, { baseUrl }));
  console.log(path.join(OUT, `${file}.html`));
}


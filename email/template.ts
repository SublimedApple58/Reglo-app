/**
 * Template unico di TUTTE le email che Reglo manda (REG-599).
 *
 * Modulo **puro**: niente Resend, niente `server-only`, niente env a parte il
 * `baseUrl` che gli viene passato. Serve a due cose: renderlo testabile
 * (`tests/unit/email/template.test.ts`) e renderlo apribile in un browser per
 * le anteprime, senza montare mezza app.
 *
 * ## Perché l'HTML è scritto a tabelle
 * Outlook su Windows impagina con il motore di Word: niente flex, niente grid,
 * `max-width` ignorato. Le tabelle annidate con `width` esplicite sono l'unico
 * layout che regge ovunque. Lo stile è tutto inline per lo stesso motivo:
 * Gmail scarta i `<style>` nel `<head>` su buona parte dei client.
 *
 * ## Il marchio sta in testata, la firma è una riga
 * Il peso del brand è in apertura — marchio, nome e pay-off — e in calce
 * restano solo i link e la riga di servizio. Il marchio è quello nero su
 * chiaro (`logo-reglo-tight.png`), lo stesso della web app, dentro una cella
 * con `bgcolor="#ffffff"` dichiarato: senza, un client in dark mode scurisce
 * il fondo e un marchio nero su trasparente sparisce. Va da solo, senza
 * lettering, come sul sito pubblico.
 *
 * ## Bianco e nero, nessuna cornice
 * Niente colori per tipo di messaggio, niente etichette di categoria sopra il
 * titolo, niente card arrotondata su sfondo grigio: tre giri di revisione li
 * hanno bocciati tutti, e il motivo è sempre lo stesso — erano strati che non
 * aggiungevano informazione. Che mail sia lo dice il titolo. L'identità la
 * fanno il marchio in firma, il carattere e lo spazio.
 *
 * @see docs/features/email-template.md
 */

const COLORS = {
  ink: "#111111",
  text: "#222222",
  body: "#444444",
  muted: "#6a6a6a",
  soft: "#929292",
  hairline: "#ececec",
};

/** Il sito pubblico è www.reglo.it; `baseUrl` è l'app (app.reglo.it). */
const SITE_URL = "https://www.reglo.it";

/**
 * Nessun font custom: in email non si caricano (e quando si caricano, non
 * ovunque). Lo stack di sistema è quello che il design system usa come
 * fallback di Geist, quindi la resa resta in famiglia.
 */
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MONO_STACK =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

export type EmailCta = { label: string; url: string };

export type EmailHighlight = {
  /** Etichetta piccola sopra il valore, es. "Il tuo codice". */
  label?: string | null;
  value: string;
  /** Codici e importi: spaziati e in monospace. */
  mono?: boolean;
};

export type RegloEmailContent = {
  /** Oggetto della mail: se manca `heading`, diventa anche il titolo. */
  subject: string;
  /** Corpo in **testo semplice**: riga vuota = nuovo paragrafo. */
  body: string;
  /** Testo che va **dopo** il riquadro evidenziato (es. "il codice scade tra…"). */
  bodyAfter?: string | null;
  /** Titolo dentro la mail, quando deve dire qualcosa di diverso dall'oggetto. */
  heading?: string | null;
  cta?: EmailCta | null;
  /** Link di riserva sotto il bottone (es. "apri su web" quando la CTA apre l'app). */
  fallbackLink?: EmailCta | null;
  highlight?: EmailHighlight | null;
  /** Riga extra nel piede, sotto la firma. */
  footerNote?: string | null;
  /** Anteprima in lista (preheader). Default: la prima riga del corpo. */
  preheader?: string | null;
};

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Titolo leggibile a partire dall'oggetto.
 *
 * Due ripuliture, entrambe volute:
 * - via il prefisso "Reglo Autoscuole · ", che dentro una mail già marchiata
 *   Reglo è rumore (nell'oggetto in posta serviva a riconoscerla, nel titolo no);
 * - via l'emoji iniziale, che negli oggetti c'è perché **lo stesso testo** fa
 *   da titolo alla notifica push. Lì aiuta, in un titolo di email no.
 */
export const headingFromSubject = (subject: string) =>
  subject
    .replace(/^\s*Reglo(\s+Autoscuole)?\s*[·|-]\s*/i, "")
    .replace(/\s*[—–-]\s*Reglo(\s+Autoscuole)?\s*$/i, "")
    .replace(
      /^\s*(?:[←-⯿☀-➿\uD83C-􏰀-\uDFFF️‍]+\s*)+/u,
      "",
    )
    .trim() || subject.trim();

/** Paragrafi dal testo semplice: riga vuota separa, singola va a capo. */
export const splitParagraphs = (body: string): string[] =>
  body
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

const paragraphHtml = (block: string) =>
  escapeHtml(block).replace(/\n/g, "<br />");

const renderHighlight = (highlight: EmailHighlight) => {
  const label = highlight.label
    ? `<div style="font-family:${FONT_STACK}; font-size:11px; font-weight:700; letter-spacing:0.9px; text-transform:uppercase; color:${COLORS.soft}; padding-bottom:10px;">${escapeHtml(highlight.label)}</div>`
    : "";
  const valueStyle = highlight.mono
    ? `font-family:${MONO_STACK}; font-size:30px; font-weight:600; letter-spacing:7px; color:${COLORS.ink};`
    : `font-family:${FONT_STACK}; font-size:17px; font-weight:600; color:${COLORS.text};`;
  // Delimitato da due fili, non da un riquadro pieno: la mail non ha cornici.
  return `
              <tr>
                <td style="padding:24px 0 0;">
                  <div style="height:1px; line-height:1px; font-size:0; background:${COLORS.hairline};">&nbsp;</div>
                  <div style="padding:20px 0; text-align:center;">
                    ${label}<div style="${valueStyle}">${escapeHtml(highlight.value)}</div>
                  </div>
                  <div style="height:1px; line-height:1px; font-size:0; background:${COLORS.hairline};">&nbsp;</div>
                </td>
              </tr>`;
};

const renderCta = (cta: EmailCta, fallback?: EmailCta | null) => {
  const fallbackRow = fallback
    ? `
              <tr>
                <td style="padding:12px 0 0; font-family:${FONT_STACK}; font-size:12.5px; color:${COLORS.soft};">
                  Non si apre? <a href="${escapeHtml(fallback.url)}" style="color:${COLORS.muted}; text-decoration:underline;">${escapeHtml(fallback.label)}</a>
                </td>
              </tr>`
    : "";
  return `
              <tr>
                <td style="padding:26px 0 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td bgcolor="${COLORS.ink}" style="background:${COLORS.ink}; border-radius:12px;">
                        <a href="${escapeHtml(cta.url)}" style="display:inline-block; padding:13px 26px; font-family:${FONT_STACK}; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none;">${escapeHtml(cta.label)}</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>${fallbackRow}`;
};

/** HTML completo della mail. `baseUrl` serve solo per logo e link al sito. */
export const renderRegloEmail = (
  content: RegloEmailContent,
  { baseUrl }: { baseUrl: string },
): string => {
  const base = baseUrl.replace(/\/$/, "");
  const heading = (content.heading ?? headingFromSubject(content.subject)).trim();
  const paragraphs = splitParagraphs(content.body);
  const preheader = (content.preheader ?? paragraphs[0] ?? heading).slice(0, 140);

  const headingRow = heading
    ? `
              <tr>
                <td style="padding:0; font-family:${FONT_STACK}; font-size:23px; line-height:1.28; font-weight:600; letter-spacing:-0.3px; color:${COLORS.ink};">${escapeHtml(heading)}</td>
              </tr>`
    : "";

  const bodyRows = paragraphs
    .map(
      (block, index) => `
              <tr>
                <td style="padding:${index === 0 ? (heading ? "14px" : "0") : "12px"} 0 0; font-family:${FONT_STACK}; font-size:15px; line-height:1.65; color:${COLORS.body};">${paragraphHtml(block)}</td>
              </tr>`,
    )
    .join("");

  const highlightRow = content.highlight ? renderHighlight(content.highlight) : "";
  const afterRows = splitParagraphs(content.bodyAfter ?? "")
    .map(
      (block) => `
              <tr>
                <td style="padding:18px 0 0; font-family:${FONT_STACK}; font-size:15px; line-height:1.65; color:${COLORS.body};">${paragraphHtml(block)}</td>
              </tr>`,
    )
    .join("");
  const ctaRow = content.cta ? renderCta(content.cta, content.fallbackLink) : "";
  const footerNoteRow = content.footerNote
    ? `
                  <tr>
                    <td style="padding:14px 0 0; font-family:${FONT_STACK}; font-size:12px; line-height:1.6; color:${COLORS.soft};">${escapeHtml(content.footerNote)}</td>
                  </tr>`
    : "";

  return `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0; padding:0; background:#ffffff; -webkit-font-smoothing:antialiased;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent; visibility:hidden;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background:#ffffff; margin:0; padding:0; width:100%;">
      <tr>
        <td align="center" style="padding:40px 24px 48px;">
          <!-- Nessuna cornice: niente card arrotondata, niente bordo, niente
               sfondo diverso. Solo una colonna centrata, larga quanto serve a
               leggere. Le separazioni le fanno due fili grigi. -->
          <table role="presentation" width="580" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%; max-width:580px; text-align:left;">

            <!-- Testata: è qui che sta il marchio, a piena presenza. Marchio,
                 nome e pay-off, poi un filo. La firma in calce resta una riga. -->
            <tr>
              <td style="padding:0 0 22px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td bgcolor="#ffffff" width="42" height="42" align="center" valign="middle" style="background:#ffffff; width:42px; height:42px;">
                      <img src="${base}/images/nav/logo-reglo-tight.png" width="42" height="42" alt="Reglo" style="display:block; width:42px; height:42px;" />
                    </td>
                    <td valign="middle" style="padding-left:14px; font-family:${FONT_STACK}; line-height:1.35;">
                      <div style="font-size:22px; font-weight:600; letter-spacing:-0.4px; color:${COLORS.ink};">Reglo</div>
                      <div style="font-size:13px; color:${COLORS.muted};">La tua autoscuola, semplice.</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0;">
                <div style="height:1px; line-height:1px; font-size:0; background:${COLORS.hairline};">&nbsp;</div>
              </td>
            </tr>

            <tr>
              <td style="padding:32px 0 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${headingRow}${bodyRows}${highlightRow}${afterRows}${ctaRow}
                </table>
              </td>
            </tr>

            <!-- Firma: una riga di link e una di servizio. Il marchio sta in
                 testata, qui non serve ripeterlo in grande. -->
            <tr>
              <td style="padding:40px 0 0;">
                <div style="height:1px; line-height:1px; font-size:0; background:${COLORS.hairline};">&nbsp;</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding:18px 0 0; font-family:${FONT_STACK}; font-size:12.5px; line-height:1.6; color:${COLORS.soft};">
                      <a href="${base}" style="color:${COLORS.text}; text-decoration:none; font-weight:600;">Apri Reglo</a>
                      <span style="color:#c9c9c9; padding:0 6px;">·</span>
                      <a href="${SITE_URL}" style="color:${COLORS.text}; text-decoration:none; font-weight:600;">reglo.it</a>
                    </td>
                  </tr>${footerNoteRow}
                  <tr>
                    <td style="padding:6px 0 0; font-family:${FONT_STACK}; font-size:11.5px; line-height:1.6; color:#a3a3a3;">
                      Ricevi questa email perché hai un account Reglo.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

/**
 * Versione testo della stessa mail. Resend la manda come alternativa a
 * `text/plain`: i filtri antispam la cercano, e chi legge in testo semplice
 * altrimenti riceve l'HTML grezzo.
 */
export const renderRegloEmailText = (content: RegloEmailContent): string => {
  const heading = (content.heading ?? headingFromSubject(content.subject)).trim();
  const lines = [heading, "", ...splitParagraphs(content.body)];
  if (content.highlight) {
    lines.push(
      "",
      content.highlight.label
        ? `${content.highlight.label}: ${content.highlight.value}`
        : content.highlight.value,
    );
  }
  if (content.bodyAfter) lines.push("", ...splitParagraphs(content.bodyAfter));
  if (content.cta) lines.push("", `${content.cta.label}: ${content.cta.url}`);
  if (content.fallbackLink)
    lines.push(`${content.fallbackLink.label}: ${content.fallbackLink.url}`);
  lines.push("", "—", "Reglo · La tua autoscuola, semplice.", "www.reglo.it");
  if (content.footerNote) lines.push(content.footerNote);
  lines.push("Ricevi questa email perché hai un account Reglo.");
  return lines.join("\n");
};

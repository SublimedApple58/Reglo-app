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
 * ## Perché il logo sta dentro una pastiglia nera
 * Il marchio Reglo è nero su trasparente (`logo-reglo-tight.png`): in dark mode
 * i client che scuriscono gli sfondi lo farebbero sparire. Qui viaggia la
 * variante **bianca** dentro una cella `bgcolor="#111111"`, che si vede uguale
 * in chiaro e in scuro. È anche il lockup del sito pubblico: reglo.it usa il
 * marchio da solo, senza lettering, quindi lo seguiamo.
 *
 * ## Il tono
 * Il design system dice: superfici neutre, colore solo dove porta
 * informazione. Qui il colore è **uno solo per email** — la barra in alto, la
 * sopra-riga e l'eventuale riquadro — e dice che tipo di email è: promemoria,
 * conferma, annullamento. Il resto resta bianco/nero. È quello che rende il
 * messaggio vivo senza farlo sembrare una newsletter.
 *
 * @see docs/features/email-template.md
 */

/**
 * Tipo di email: decide l'unico colore che compare nel messaggio.
 *
 * Sono tre, non quattro: con la testata nera un accento nero non si vedrebbe,
 * e "promemoria" contro "invito" non è una distinzione che interessi a chi
 * legge. Quella che interessa è: **è normale, è andata bene, c'è un problema.**
 */
export type EmailTone = "brand" | "positive" | "danger";

type ToneStyle = {
  /** Barra da 4px in cima alla card. */
  bar: string;
  /** Colore della sopra-riga (eyebrow) e del testo dentro il riquadro. */
  ink: string;
  /** Fondo del riquadro evidenziato. */
  tint: string;
  /** Bordo del riquadro evidenziato. */
  border: string;
};

/**
 * Valori presi da `docs/design-system.md` (palette bianco/nero di settembre) e
 * dalle superfici di stato già in uso nel prodotto — il verde/bordo del blocco
 * "Accesso a Reglo" del consorzio, il giallo degli highlight informativi.
 */
const TONES: Record<EmailTone, ToneStyle> = {
  // Il giallo è l'accento di Reglo: c'era nel marchio storico, è l'oro del sito
  // pubblico, ed è il colore che il design system tiene per gli highlight.
  brand: { bar: "#FACC15", ink: "#A16207", tint: "#FEFCE8", border: "#FEF08A" },
  positive: { bar: "#22C55E", ink: "#1a7f50", tint: "#f0faf4", border: "#c5e8d4" },
  danger: { bar: "#c13515", ink: "#c13515", tint: "#fdf2ef", border: "#f3d3c9" },
};

const COLORS = {
  page: "#f0f0f0",
  card: "#ffffff",
  cardBorder: "#ebebeb",
  ink: "#111111",
  text: "#222222",
  body: "#444444",
  muted: "#6a6a6a",
  soft: "#929292",
  hairline: "#ececec",
  tint: "#f7f7f7",
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
  /** Sopra-riga: due parole che dicono di che si tratta ("Promemoria"). */
  eyebrow?: string | null;
  tone?: EmailTone;
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

const renderHighlight = (highlight: EmailHighlight, tone: ToneStyle) => {
  const label = highlight.label
    ? `<div style="font-family:${FONT_STACK}; font-size:11px; font-weight:700; letter-spacing:0.9px; text-transform:uppercase; color:${tone.ink}; padding-bottom:8px;">${escapeHtml(highlight.label)}</div>`
    : "";
  const valueStyle = highlight.mono
    ? `font-family:${MONO_STACK}; font-size:28px; font-weight:600; letter-spacing:6px; color:${COLORS.ink};`
    : `font-family:${FONT_STACK}; font-size:16px; font-weight:600; color:${COLORS.text};`;
  return `
              <tr>
                <td style="padding:22px 0 0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
                    <tr>
                      <td bgcolor="${tone.tint}" style="background:${tone.tint}; border:1px solid ${tone.border}; border-radius:14px; padding:18px 22px; text-align:center;">
                        ${label}<div style="${valueStyle}">${escapeHtml(highlight.value)}</div>
                      </td>
                    </tr>
                  </table>
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
  const tone = TONES[content.tone ?? "brand"];
  const heading = (content.heading ?? headingFromSubject(content.subject)).trim();
  const paragraphs = splitParagraphs(content.body);
  const preheader = (content.preheader ?? paragraphs[0] ?? heading).slice(0, 140);

  const eyebrowRow = content.eyebrow
    ? `
              <tr>
                <td style="padding:0; font-family:${FONT_STACK}; font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:${tone.ink};">${escapeHtml(content.eyebrow)}</td>
              </tr>`
    : "";

  const headingRow = heading
    ? `
              <tr>
                <td style="padding:${content.eyebrow ? "9px" : "0"} 0 0; font-family:${FONT_STACK}; font-size:23px; line-height:1.28; font-weight:600; letter-spacing:-0.3px; color:${COLORS.ink};">${escapeHtml(heading)}</td>
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

  const highlightRow = content.highlight
    ? renderHighlight(content.highlight, tone)
    : "";
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
  <body style="margin:0; padding:0; background:${COLORS.page}; -webkit-font-smoothing:antialiased;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent; visibility:hidden;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.page}" style="background:${COLORS.page}; margin:0; padding:0; width:100%;">
      <tr>
        <td align="center" style="padding:36px 16px;">
          <!-- Il div esterno è quello che arrotonda e ritaglia: testata scura e
               piede grigio sono a filo del bordo, e un <table> non ritaglia i
               figli in modo affidabile. Outlook ignora il raggio: card squadrata. -->
          <div style="max-width:560px; margin:0 auto; border-radius:20px; overflow:hidden;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:560px; background:${COLORS.card}; border-collapse:collapse;">

            <!-- Testata: il marchio sta su fondo nero, non su bianco. È quello che
                 si vede per primo aprendo la mail, e dice Reglo prima del testo. -->
            <tr>
              <td bgcolor="${COLORS.ink}" style="background:${COLORS.ink}; padding:22px 34px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td valign="middle" style="padding-right:11px;">
                      <img src="${base}/images/nav/logo-reglo-white.png" width="28" height="28" alt="Reglo" style="display:block; width:28px; height:28px;" />
                    </td>
                    <td valign="middle" style="font-family:${FONT_STACK}; font-size:20px; font-weight:600; letter-spacing:-0.3px; color:#ffffff; line-height:28px;">Reglo</td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Il filo colorato separa testata e contenuto: è l'unico colore
                 della mail e dice che tipo di messaggio è. -->
            <tr>
              <td bgcolor="${tone.bar}" height="4" style="background:${tone.bar}; height:4px; line-height:4px; font-size:0; padding:0;">&nbsp;</td>
            </tr>

            <tr>
              <td style="padding:30px 34px 36px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${eyebrowRow}${headingRow}${bodyRows}${highlightRow}${afterRows}${ctaRow}
                </table>
              </td>
            </tr>

            <!-- Firma. Pannello a tutta larghezza, non una riga di piccolo in
                 fondo al testo: è la parte che dice chi ha scritto. -->
            <tr>
              <td bgcolor="${COLORS.tint}" style="background:${COLORS.tint}; border-top:1px solid ${COLORS.hairline}; padding:24px 34px 26px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding:0;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td bgcolor="${COLORS.ink}" width="34" height="34" align="center" valign="middle" style="background:${COLORS.ink}; width:34px; height:34px; border-radius:10px; text-align:center;">
                            <img src="${base}/images/nav/logo-reglo-white.png" width="19" height="19" alt="" style="display:block; margin:0 auto; width:19px; height:19px;" />
                          </td>
                          <td valign="middle" style="padding-left:12px; font-family:${FONT_STACK}; line-height:1.45;">
                            <div style="font-size:14px; font-weight:600; color:${COLORS.ink};">Reglo</div>
                            <div style="font-size:12.5px; color:${COLORS.muted};">La tua autoscuola, semplice.</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 0 0; font-family:${FONT_STACK}; font-size:12.5px; font-weight:600; color:${COLORS.muted};">
                      <a href="${base}" style="color:${COLORS.text}; text-decoration:none;">Apri Reglo</a>
                      <span style="color:#c2c2c2; padding:0 6px;">·</span>
                      <a href="${SITE_URL}" style="color:${COLORS.text}; text-decoration:none;">reglo.it</a>
                    </td>
                  </tr>${footerNoteRow}
                  <tr>
                    <td style="padding:14px 0 0; font-family:${FONT_STACK}; font-size:11.5px; line-height:1.6; color:#a3a3a3;">
                      Ricevi questa email perché hai un account Reglo.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

          </table>
          </div>
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

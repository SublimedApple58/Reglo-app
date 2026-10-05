# Template email (REG-599)

> Ogni email che Reglo manda — a titolari, istruttori, allievi e al team —
> esce da qui. Non esiste un secondo template.

## File

| File | Ruolo |
|------|-------|
| `email/template.ts` | **Modulo puro**: tokens, layout HTML, versione testo. Niente Resend, niente env a parte il `baseUrl` passato dal chiamante. |
| `email/index.ts` | Il client Resend e le due funzioni di invio: `sendDynamicEmail` e `sendCompanyInviteEmail`. |
| `tests/unit/email/template.test.ts` | Titolo ricavato dall'oggetto, escape, toni, ordine dei blocchi, versione testo. |

Prima di REG-599 c'erano **due** template divergenti: una stringa HTML in
`email/index.tsx` e un componente `@react-email/components`
(`email/company-invite.tsx`) che ripeteva lo stesso layout a mano. Il secondo è
stato eliminato: l'invito passa da `sendDynamicEmail` come tutto il resto.

## Come si scrive una mail

Chi chiama passa **testo semplice**. La veste la mette il template.

```ts
await sendDynamicEmail({
  to: student.email,
  subject: "Domani hai la guida — Reglo",
  body: "Promemoria: domani hai una guida alle 15:00. Durata 60 minuti.",
});
```

| Campo | A cosa serve |
|-------|--------------|
| `subject` | Oggetto. Se manca `heading`, diventa anche il titolo nel corpo. |
| `body` | Testo semplice. **Riga vuota = nuovo paragrafo**, a capo singolo resta a capo. |
| `heading` | Titolo diverso dall'oggetto. |
| `cta` / `fallbackLink` | Bottone nero + link di riserva (serve quando la CTA apre l'app). |
| `highlight` | Riquadro colorato: codici (`mono: true`), importi. |
| `bodyAfter` | Testo **dopo** il riquadro ("il codice scade tra…"). |
| `footerNote` | Riga in piccolo nel piede. |
| `preheader` | Anteprima in lista. Default: la prima riga del corpo. |

Il `body` viene sempre **escapato**: nelle comunicazioni da regola il testo lo
scrive l'autoscuola, e non deve poter iniettare HTML.

## Le scelte, e perché

**Niente colori per tipo di messaggio.** Un annullamento e un promemoria hanno
la stessa veste: cambia il testo, non la grafica. Ci sono stati due giri con la
barra colorata sotto la testata e l'etichetta di categoria in ocra — bocciati, e con
ragione: erano strati di colore che non aggiungevano informazione (l'etichetta
la dice già a parole) e facevano sembrare il prodotto meno serio. La mail è in
**bianco e nero**, e un test impedisce che i colori rientrino di soppiatto.

**Nessuna cornice.** Il contenuto sta in una colonna centrata (max 580px) su
bianco: niente card arrotondata, niente bordo, niente sfondo grigio intorno.
Una card che galleggia su grigio è un espediente da newsletter, e si vede che
lo è. A separare le parti bastano due fili grigi: uno sotto la testata, uno
sopra la firma. Anche il riquadro del codice è delimitato da fili, non da un
fondo pieno.

**Il peso del marchio è in testata, la firma è una riga.** In apertura
marchio, nome e pay-off; in calce solo i link e la riga di servizio. La firma
non è chiusa da un filo a tutta larghezza ma da una **regola corta di 36px**:
chiude il testo come un segno tipografico invece di tagliare la pagina in due.
Pesi leggeri (500, mai grassetto), separatore `/` in grigio chiaro, e tre
livelli di grigio che scendono — nota della mail, link, riga di servizio —
perché lì sotto non c'è niente da leggere con urgenza. Il marchio
è quello **nero sul chiaro** (`logo-reglo-tight.png`, lo stesso della web app),
dentro una cella con `bgcolor="#ffffff"` esplicito: senza, un client in dark
mode scurisce il fondo e un marchio nero su trasparente sparisce.

**Niente etichette di categoria sopra il titolo.** C'è stato un giro con una
sopra-riga tipo `INVITO` / `GUIDA ANNULLATA`: bocciata, e con ragione —
ripeteva il titolo con altre parole. Il titolo deve bastare da solo, ed è anche
il motivo per cui `headingFromSubject` lo ripulisce.

**Il nome "Reglo" è testo, non un lockup.** L'unico logo con lettering che
esiste negli asset è quello **vecchio rosa/giallo**, e il sito pubblico usa
comunque il marchio da solo.

**Tabelle e stile inline.** Outlook su Windows impagina col motore di Word:
niente flex, niente grid, `max-width` ignorato. E Gmail scarta i `<style>` nel
`<head>`. Il test lo blinda: niente `<style>`, niente `class=`.

**Ogni mail parte anche in testo semplice** (`renderRegloEmailText`): i filtri
antispam la cercano, e chi legge in testo altrimenti riceve l'HTML grezzo.

**Il titolo si ripulisce da solo.** `headingFromSubject` toglie dal titolo *nel
corpo* il prefisso `Reglo Autoscuole · `, il suffisso `— Reglo` e l'emoji
iniziale. L'emoji c'è perché **lo stesso testo** titola la notifica push: lì
aiuta, in un titolo di email no. L'oggetto in posta resta intatto.

## Chi manda cosa

| Dove | Mail |
|------|------|
| `email/index.ts` | Invito a una company (titolare, istruttore, allievo) |
| `lib/auth/password-reset.ts` | Codice di reset password (riquadro mono) |
| `lib/autoscuole/communications.ts` | Promemoria guida/esame: generico, mattutino, giorno prima, istruttore |
| `lib/autoscuole/communications.ts` | Comunicazioni da regola (testo dell'autoscuola) |
| `lib/autoscuole/operational-cancellation.ts` | Annullamenti organizzativi (malattia, ferie, veicolo…) |
| `lib/actions/autoscuole.actions.ts` | Guida annullata · Guida spostata |
| `lib/actions/autoscuole-holidays.actions.ts` | Autoscuola chiusa (giorno singolo e periodo) |
| `lib/actions/autoscuole-availability.actions.ts` | Posto libero · Guida di gruppo disponibile |
| `lib/actions/autoscuole-swap.actions.ts` | Richiesta sostituzione |
| `lib/autoscuole/payments.ts` | Metodo richiesto · Pagamento registrato · Non riuscito |
| `lib/actions/support.actions.ts` | Avvisi interni al team (assistenza, feedback, novità) |

Che tipo di messaggio sia lo dice il **titolo**: niente colori e niente
etichette di categoria.

## Testi rifatti con REG-599

- **Invito**: era `"You have been invited to join X"` — l'unica mail del prodotto
  rimasta in inglese, mandata a titolari e allievi italiani.
- **Pagamento riuscito**: era `` `Pagamento ${payment.phase} registrato` ``, cioè
  letteralmente *"Pagamento manual_recovery registrato"*. Ora passa da
  `describePaymentPhase`, che nessun valore interno attraversa.
- **Oggetti dei promemoria**: via il prefisso `Reglo Autoscuole · ` e
  l'anglicismo *Reminder*; `"Reglo Autoscuole · Guida domani"` → `"Domani hai la
  guida — Reglo"`.
- **Posto libero**: `"Si e liberato uno slot guida"` → `"Si è liberato un posto
  per una guida"` (accento mancante + gergo).
- **Pagamenti**: titoli e testi riscritti in italiano corrente.

> ⚠️ Titolo e corpo di annullamenti, pagamenti e promemoria sono **condivisi con
> le notifiche push**: riscriverli cambia anche quelle. È voluto dove è successo
> (i testi erano gli stessi, e sbagliati anche lì), ma chi tocca quelle stringhe
> deve sapere che tocca due canali.

## Anteprime

```bash
npx tsx scripts/preview-emails.ts   # scrive gli HTML in /tmp/hiro-anteprime/reg-599
```

Il modulo è puro apposta: per vedere una mail non serve montare l'app.

## Collegamenti

- [communications.md](communications.md) — regole, promemoria, canali
- [support-center.md](support-center.md) — avvisi interni
- [password-reset.md](password-reset.md) — flusso del codice
- [consorzio.md](consorzio.md) — inviti ai titolari consorziati
- `docs/design-system.md` §2 — palette bianco/nero di riferimento

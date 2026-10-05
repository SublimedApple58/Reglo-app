# Template email (REG-599)

> Ogni email che Reglo manda — a titolari, istruttori, allievi e al team —
> esce da qui. Non esiste un secondo template.

## File

| File | Ruolo |
|------|-------|
| `email/template.ts` | **Modulo puro**: tokens, layout HTML, versione testo. Niente Resend, niente env a parte il `baseUrl` passato dal chiamante. |
| `email/index.ts` | Il client Resend e le due funzioni di invio: `sendDynamicEmail` e `sendCompanyInviteEmail`. |
| `tests/unit/email/template.test.ts` | Titolo ricavato dall'oggetto, escape, toni, ordine dei blocchi, versione testo. |
| `public/images/nav/logo-reglo-white.png` | Marchio bianco, usato dentro la pastiglia nera dell'intestazione. |

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
  eyebrow: "Promemoria",
  tone: "info",
  body: "Promemoria: domani hai una guida alle 15:00. Durata 60 minuti.",
});
```

| Campo | A cosa serve |
|-------|--------------|
| `subject` | Oggetto. Se manca `heading`, diventa anche il titolo nel corpo. |
| `body` | Testo semplice. **Riga vuota = nuovo paragrafo**, a capo singolo resta a capo. |
| `heading` | Titolo diverso dall'oggetto. |
| `eyebrow` | Due parole sopra il titolo ("Promemoria", "Pagamenti", "Sicurezza"). |
| `tone` | `neutral` · `info` · `positive` · `danger`. |
| `cta` / `fallbackLink` | Bottone nero + link di riserva (serve quando la CTA apre l'app). |
| `highlight` | Riquadro colorato: codici (`mono: true`), importi. |
| `bodyAfter` | Testo **dopo** il riquadro ("il codice scade tra…"). |
| `footerNote` | Riga in piccolo nel piede. |
| `preheader` | Anteprima in lista. Default: la prima riga del corpo. |

Il `body` viene sempre **escapato**: nelle comunicazioni da regola il testo lo
scrive l'autoscuola, e non deve poter iniettare HTML.

## Le scelte, e perché

**Un colore per mail.** Il design system dice superfici neutre e colore solo
dove porta informazione. Qui il colore compare in tre punti coordinati — la
barra da 4px in cima, la sopra-riga, il bordo del riquadro — e dice che tipo di
messaggio è:

| Tono | Colore | Quando |
|------|--------|--------|
| `neutral` | `#111111` | Inviti, benvenuto, avvisi di servizio |
| `info` | `#FACC15` | Promemoria, posti liberi, guida spostata |
| `positive` | `#22C55E` | Pagamento registrato, conferme |
| `danger` | `#c13515` | Guide annullate, autoscuola chiusa, pagamento fallito |

**Il marchio sta in una pastiglia nera.** Il marchio Reglo è nero su
trasparente: in dark mode i client che scuriscono gli sfondi lo farebbero
sparire. Dentro una cella `bgcolor="#111111"` con la variante bianca si vede
uguale in chiaro e in scuro. È anche il lockup del sito pubblico — reglo.it usa
il marchio da solo, senza lettering.

**Tabelle e stile inline.** Outlook su Windows impagina col motore di Word:
niente flex, niente grid, `max-width` ignorato. E Gmail scarta i `<style>` nel
`<head>`. Il test lo blinda: niente `<style>`, niente `class=`.

**La card la ritaglia un `<div>`, non la `<table>`.** La barra colorata è a filo
col bordo superiore, e una tabella non ritaglia i figli in modo affidabile.
Outlook ignora il raggio e mostra una card squadrata: accettabile.

**Ogni mail parte anche in testo semplice** (`renderRegloEmailText`): i filtri
antispam la cercano, e chi legge in testo altrimenti riceve l'HTML grezzo.

**Il titolo si ripulisce da solo.** `headingFromSubject` toglie dal titolo *nel
corpo* il prefisso `Reglo Autoscuole · `, il suffisso `— Reglo` e l'emoji
iniziale. L'emoji c'è perché **lo stesso testo** titola la notifica push: lì
aiuta, in un titolo di email no. L'oggetto in posta resta intatto.

## Chi manda cosa

| Dove | Mail | Tono |
|------|------|------|
| `email/index.ts` | Invito a una company (titolare, istruttore, allievo) | neutral |
| `lib/auth/password-reset.ts` | Codice di reset password (riquadro mono) | neutral |
| `lib/autoscuole/communications.ts` | Promemoria guida/esame: generico, mattutino, giorno prima, istruttore | info |
| `lib/autoscuole/communications.ts` | Comunicazioni da regola (testo dell'autoscuola) | neutral |
| `lib/autoscuole/operational-cancellation.ts` | Annullamenti organizzativi (malattia, ferie, veicolo…) | danger |
| `lib/actions/autoscuole.actions.ts` | Guida annullata · Guida spostata | danger · info |
| `lib/actions/autoscuole-holidays.actions.ts` | Autoscuola chiusa (giorno singolo e periodo) | danger |
| `lib/actions/autoscuole-availability.actions.ts` | Posto libero · Guida di gruppo disponibile | info |
| `lib/actions/autoscuole-swap.actions.ts` | Richiesta sostituzione | info |
| `lib/autoscuole/payments.ts` | Metodo richiesto · Pagamento registrato · Non riuscito | neutral · positive · danger |
| `lib/actions/support.actions.ts` | Avvisi interni al team (assistenza, feedback, novità) | varia |

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

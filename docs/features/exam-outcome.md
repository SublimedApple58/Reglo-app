# Esito esame

Registra se un allievo è stato **idoneo** o **respinto** all'esame, e il numero
della patente conseguita. Richiesta partita dal consorzio (Federica) ma decisa
come funzione **generale**: in produzione ci sono 476 esami su 8 autoscuole.

## Il buco che colma

Le autoscuole usavano lo `status` dell'appuntamento come surrogato dell'esito —
240 esami `completed` fra Macchiavello e Robatto. Ma `completed` dice che
l'esame **si è svolto**, non che l'allievo sia passato: quell'informazione
entrava dalla porta e non veniva registrata da nessuna parte.

## Modello

| Dove | Campo |
|---|---|
| `AutoscuolaAppointment` | `examOutcome` (`"idoneo" \| "respinto" \| null`), `examOutcomeAt`, `examOutcomeByUserId` |
| `CompanyMember` | `licenseNumber`, `licenseObtainedAt` |

Migrazione `20260923150000_exam_outcome`.

**L'esito sta sulla riga dell'appuntamento** perché un esame è già **una riga
per allievo** (`materializeExamSlot`): ogni partecipante ha la propria, e un
allievo respinto che ripete l'esame ha due righe con due esiti. Lo storico non
si sovrascrive mai (decisione di Tiziano, 23/09).

**Il numero di patente sta sull'ALLIEVO**, non sull'esame: è un attributo della
persona e resta valido anche se quell'esame viene annullato o ripulito. È
**facoltativo** anche su un idoneo — spesso si conosce giorni dopo, e non deve
impedire di registrare subito l'esito.

## Regole — `lib/autoscuole/exam-outcome.ts`

- `canRecordExamOutcome` — solo su un esame vero (non un segnaposto senza
  iscritti: 27 in produzione), non annullato, e **non prima che sia iniziato**
  (tolleranza 10 minuti, la stessa dell'esito delle guide).
- `phaseAfterExamOutcome` — **un idoneo porta l'allievo a `PATENTATO`**, in
  automatico e senza conferma. Il respinto non tocca la fase.
- `normalizeLicenseNumber` — il numero si accetta solo su un idoneo; su un
  respinto si scarta, perché è un errore di compilazione, non un dato.

## Azione — `setExamOutcome`

**Una sola**, per tutti i punti di ingresso. Permessi
`ensureAutoscuolaRole(["OWNER", "INSTRUCTOR"])`: registra anche l'istruttore,
che l'esito lo conosce per primo.

Ri-cliccare l'esito già registrato lo toglie — è il modo per correggere un
errore. **Togliere l'esito non riporta indietro la fase**: l'allievo resta
PATENTATO finché il titolare non lo cambia a mano, perché nel frattempo
potrebbe esserlo diventato per un altro esame.

## Interfaccia — `components/pages/Autoscuole/ExamOutcomePanel.tsx`

Modalina laterale **"Registra esito"** che riusa lo schema del pannello
"Aggiungi allievi" dell'esame (340px, `rounded-[20px]`, entrata da `x:-14` in
180ms, intestazione con la X, ricerca, elenco bordato). Registrare l'esito e
scegliere i partecipanti sono due operazioni sorelle e si fanno nello stesso
modo — deciso dopo aver scartato l'espansione dentro la riga.

Tre punti di ingresso, **un solo componente**:

| Dove | Trigger |
|---|---|
| Agenda, pannello esame | CTA **"Registra esito"** accanto a "Sfoglia allievi" |
| Dettaglio allievo (autoscuole) | link blu sulla riga dell'esame, tab Guide |
| Drawer allievo (consorzio) | link blu sulla riga dell'esame, tab Guide |

Il CTA dell'agenda è **primario pieno** (`#222222` + `shadow-cta`) con il conteggio
in giallo finché c'è da registrare, e degrada a **"Esiti registrati"** outline
quando non c'è più: un'interfaccia che grida sempre non grida mai.

Il numero di patente compare solo scegliendo Idoneo. Nello storico guide si
legge sotto **il più recente** degli esami idonei, non sotto tutti: vive
sull'allievo, e ripeterlo farebbe sembrare che chi ha preso B e poi CQC abbia
due patenti con lo stesso numero.

## Conseguenze fuori da qui

Un idoneo porta a `PATENTATO`, quindi **azzera `examReady`** e **toglie
l'allievo dal picker "Seleziona allievo" dell'app istruttore** (REG-499 mostra
solo `PRATICA`). L'agenda web non filtra per fase: il titolare può comunque
prenotargli una guida. Reversibile riportando la fase a `PRATICA`.

⚠️ Caso noto: nel consorzio la CQC si fa su chi ha la C da anni. Un idoneo alla
CQC marca quell'allievo patentato anche se sta ancora facendo altro.

## Fatturazione

Nessun impatto. Per il consorzio l'esame è **già** una voce di costo a
`examFee` (REG-459) e l'esito non ne cambia il prezzo: un esame sostenuto si
paga comunque. Le autoscuole normali **non hanno una tariffa esame** — scelta
esplicita di Tiziano (opzione "a"), fuori scope.

## Mobile

L'istruttore registrerà l'esito dall'app: previsto **dopo** il rilascio web,
via OTA, senza anteprime separate.

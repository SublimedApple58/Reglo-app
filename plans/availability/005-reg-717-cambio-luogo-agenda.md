# REG-717 — Cambio rapido del luogo dall'agenda web + ruoli sulla disponibilità

## Cosa è stato fatto (04/11/2026, commit locale, non pushato)

- Scritta del luogo sulla fascia cliccabile → menu compatto (anteprime approvate in
  `/tmp/hiro-anteprime/reg-705/agenda-cambio-luogo/`): default solo quel giorno
  (override), interruttore «Ogni <giorno>» spento per la settimana tipo; conferma
  dentro il menu per le guide in altri luoghi; toast con «Annulla».
- Azione nuova `setAgendaBandLocation` + `undoAgendaBandLocation` (non azzera
  `availabilityOverrideApproved`).
- Controllo dei ruoli su tutte le 11 scritture della disponibilità
  (`assertCanWriteAvailability`); l'allievo scrive solo le proprie preferenze.
- Fuga chiusa: `/api/autoscuole/instructors` dava a tutti (Home allievo compresa) i
  codici di invito degli istruttori → ora solo al titolare.
- Test: 15 unit nuovi; e2e `reg717-cambio-luogo` (ruoli + giorno + ogni martedì,
  con Annulla) e regressioni 705/706 verdi su dev.

## Scelte di Tiziano

1. Default solo quel giorno; «Ogni lunedì» (spento) per la settimana tipo.
2. Controllo dei ruoli su TUTTE le azioni e API che scrivono la disponibilità, nello
   stesso branch, con e2e che verifica il rifiuto per un allievo e che l'app
   istruttore continui a funzionare.

## Modifiche emerse in implementazione

- L'allievo NON è rifiutato sempre: l'app salva le sue preferenze con
  `ownerType: "student"` (Impostazioni). L'istruttore gestisce anche i veicoli.
- Record vecchi della settimana tipo: la seconda fascia è in
  `startMinutes2`/`endMinutes2` → `weeklyLikeFromRecord` (bug trovato dall'e2e).
- Il messaggio usa il toast standard dell'app (in basso a destra, non centrato).

## Aperto

- Tab Disponibilità web: perde la seconda fascia dei record vecchi (0 righe in prod).
- Staging/prod solo col via di Tiziano.

Analisi completa: `/tmp/hiro-anteprime/reg-705/agenda-cambio-luogo/analisi.md`.

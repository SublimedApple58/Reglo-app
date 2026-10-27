# Plan: Road libero — avviare una guida senza guida in agenda (REG-638, piano A)

Stato: PIANO, in attesa di approvazione. Anteprime in /tmp/hiro-anteprime/reg-638/accesso/.

## Decisioni di prodotto proposte
- **Guida vera in agenda**: «Avvia guida» crea un `AutoscuolaAppointment` tipo `guida`, `bookingSource: "road"`, inizio = adesso (arrotondato al minuto), stato `checked_in`, fine provvisoria = adesso + durata standard dell'autoscuola (serve ai conflitti e all'agenda). A «Termina guida» la fine diventa l'orario reale e la guida passa a `completed`.
- **Conta come una guida normale**: ore/obbligo (stessa regola dei 60 min), crediti e pagamento seguono il flusso delle guide create dall'istruttore. Durata reale arrotondata ai 5 min.
- **Impostazione dell'autoscuola**: `limits.roadFreeStartEnabled`, nasce SPENTA, interruttore nel pannello web «Reglo Road». Vale solo con Road acceso.
- **Conflitti** (controllati dal server prima di creare): istruttore con guida in corso o che inizia entro la durata → se è la sua guida di adesso propone «Entra in Road su quella»; altrimenti blocca con il motivo. Allievo già in guida, bloccato per debito (`bookingBlocked`) o patente non compatibile → blocco. Veicolo occupato → lo esclude dalla scelta. Limite settimanale: come per le guide create dall'istruttore.
- **Solo v1 Road**: guide singole in auto (niente moto, gruppi, esami).

## Fasi
1. **Backend**: `POST /road/sessions/free { studentId, vehicleId }` → crea guida + sessione in una transazione con i controlli sopra; `endRoadSession` aggiorna `endsAt` per le guide nate da Road; setting in `AutoscuolaSettingsData`; test unitari dei conflitti. Migrazione: nessuna (bookingSource è già un campo libero) — da verificare.
2. **Mobile**: punto d'accesso (alternativa scelta), picker allievo (recenti + ricerca, riuso `select-student`), veicolo preselezionato (esclusivo/preferito), foglio di riepilogo, poi informativa/permesso e Road come oggi. OTA su runtime 2.4.0 (solo JS).
3. **Web**: interruttore nelle impostazioni Road; in agenda la guida nata da Road ha il chip «Road»; Dal vivo/Oggi/Storico la mostrano come le altre.

## Accesso — 2 alternative
- **A1 · Dalla home (consigliata)**: pillola nera «Avvia guida» nell'intestazione di «Oggi» + card «Adesso sei libero» quando non c'è una guida in corso. Foglio «Avvia una guida» (allievo, veicolo, durata aperta, nota su agenda/crediti) → «Parti». Perché: zero tab nuove, è dove l'istruttore guarda tra una guida e l'altra, stesso linguaggio dell'invito Road.
- **A2 · Tab «Road»**: nuova tab con la mappa e la tua posizione, pannello «Pronto a partire?» e «Avvia guida»; foglio con allievi recenti a chip e veicolo a segmenti. Più scenografica, ma aggiunge una tab per un'azione occasionale.

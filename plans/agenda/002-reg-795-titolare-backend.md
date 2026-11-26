# REG-795: backend per l'app titolare (sotto-task di REG-794)

## Cosa è stato fatto (26/11/2026, branch feat/reg-795-titolare-backend, non ancora su staging)

- **Rotta nuova** `GET /api/autoscuole/agenda/availability?from&to`: avvolge
  `getInstructorAvailabilityForAgenda`.
  - Accesso solo per titolare, istruttore titolare o admin; agli altri 403.
  - Giorni `YYYY-MM-DD` con `to` escluso, da 1 a 42 giorni.
- **Audit dei permessi** delle rotte mobile sulle guide. Il titolare puro passa
  già ovunque, perché ha `role: "admin"`.
  - L'unica lacuna era `permanent-cancel`, che non aveva alcuna guardia di
    ruolo. Ora il titolare può eliminare tutte le guide, l'istruttore solo le
    sue, l'allievo nessuna.
- **Esami creati dal fantasma**: il backend salvava già `instructorId`, quindi
  la correzione va fatta sul mobile. Aggiunti test che lo verificano.
- **Documentazione**:
  - nuovo `docs/features/owner-mobile-agenda.md`, con la tabella dei permessi;
  - aggiornati INDEX, impact-map, api-routes, appointments e
    availability-by-location.
- **Lacuna lasciata fuori**: `PATCH appointments/[id]` non esclude l'allievo.

## Piano approvato

1. **Rotta della disponibilità** di tutti gli istruttori: guardia del
   titolare, limite all'intervallo, test.
2. **Audit dei permessi** del titolare puro sulle rotte mobile (crea, sposta,
   annulla, elimina, check-in, pagellino, esami, gruppi, malattia, ferie e
   blocchi), con correzioni mirate e test.
3. **Esami dal fantasma**: test sul salvataggio di `instructorId`. Il lato
   mobile spetta a REG-794.
4. **Documentazione e verifica**: doc, typecheck, lint e test. Lo ship su
   staging aspetta l'ok di Tiziano.

### Modifiche concordate

- Il percorso è `/api/autoscuole/agenda/availability` e non `/api/mobile/...`:
  segue la convenzione che il mobile usa già.

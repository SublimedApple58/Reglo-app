# Users Directory (Utenti)

Gestione degli utenti della company (titolari, istruttori, allievi) dalla sezione **Utenti** della web app, più i flussi di registrazione/invito che creano account.

## Files

| File | Ruolo |
|------|-------|
| `lib/actions/user.actions.ts` | `getCompanyUsers`, `createCompanyUser`, `updateUser`, `deleteUser`, `signUpUser` |
| `lib/actions/invite.actions.ts` | `createCompanyInvite`, `acceptCompanyInvite*` (web), `inviteAutoscuolaStudent` |
| `lib/account-deletion.ts` | `deleteAndAnonymizeUserAccount`, `releaseEmailIfOrphaned` |
| `app/api/mobile/invites/[token]/accept/route.ts` | Accept invito da mobile (modalità accesso o registrazione) |
| `app/api/mobile/auth/student-register/route.ts` | Registrazione allievo self-service con codice scuola |
| `components/pages/AdminUsers/*` | UI Directory: tabella, dialog crea utente, dialog invito |

## Delete & riuso email (importante)

`deleteUser` rimuove la membership dalla company; se l'utente non appartiene più a **nessuna** company, l'account viene anonimizzato da `deleteAndAnonymizeUserAccount` (email → `deleted+<id>@deleted.reglo.local`, password/telefono null, ruolo `deleted`, token mobile/sessioni cancellati, inviti pending annullati, record istruttore staccato). Questo libera l'email per una futura ri-creazione.

**Lazy release degli orfani**: account rimasti senza membership ma con l'email ancora "vera" (cancellazioni precedenti al fix di luglio 2026, o company sparite) vengono anonimizzati al volo da `releaseEmailIfOrphaned(email)` quando qualcuno prova a (ri)creare un account con quella email. Chiamato in **tutti** i punti di creazione account:

1. `createCompanyUser` (Directory → Crea utente)
2. `signUpUser` (signup pubblico titolare)
3. `acceptCompanyInviteAndRegister` (accept invito web, modalità registrazione)
4. `POST /api/mobile/invites/[token]/accept` (modalità `register`)
5. `POST /api/mobile/auth/student-register` (registrazione allievo con codice scuola)

Un account con almeno una membership NON viene mai toccato: lì l'errore "Esiste già un account con questa email" è legittimo (per gli inviti l'utente esistente usa la modalità accesso).

Nota: durante l'accept di un invito, la release annulla momentaneamente l'invito pending (fa parte dell'anonimizzazione) ma il flusso lo marca subito `accepted` per id — comportamento atteso.

## Connessioni

- **Istruttori**: `deleteUser` di un istruttore → record `AutoscuolaInstructor` `inactive` + `userId: null`, guide future annullate operativamente (`operationallyCancelAppointmentsByResource`).
- **Allievi**: gli allievi si gestiscono SOLO dalla Directory (le vecchie `createAutoscuolaStudent`/`importAutoscuolaStudents` sono disattivate e rimandano alla Directory).
- **Mobile self-deletion**: usa lo stesso `deleteAndAnonymizeUserAccount`.

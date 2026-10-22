# Ex allievi (REG-629)

**Stato:** branch `feature/reg-629-ex-allievi` (web + backend) e `feature/reg-629-ex-allievi` in `reglo-mobile` (solo testo). Non ancora su staging né in prod.

## Perché

Prima di REG-629 un allievo che cancellava l'account dall'app (o che l'ufficio rimuoveva dalla Directory) diventava «Account eliminato»: il legame `CompanyMember` spariva e l'allievo usciva dalla lista Allievi e dalla scheda. Guide e pagamenti restavano nel DB, ma l'ufficio non sapeva più chi doveva pagare (richiesta di Robatto, 21/10/2026).

Decisione di Tiziano: l'ex allievo resta visibile **all'ufficio** sul web, con nome, scheda, storico guide e saldo, così si può recuperare quanto dovuto.

## Cosa si tiene e cosa si cancella

| Si tiene (solo per l'autoscuola di provenienza) | Si cancella (come prima, più foto e firma) |
|---|---|
| Nome e cognome (`AutoscuolaFormerStudent.name`) | Email (→ `deleted+<id>@deleted.reglo.local`), telefono, password |
| Storico guide, pagamenti, crediti, penali (già legati allo `userId`) | Sessioni, token mobile, dispositivi push, metodo di pagamento |
| Percorso patente e data di iscrizione (snapshot) | Foto (`User.image`) e firma (`User.signatureKey`), **anche i file su R2** |

Il nome **non** resta su `User`: l'account è «Account eliminato» per tutti; il nome vive solo sulla riga dell'autoscuola. L'account non si riattiva: chi torna si registra di nuovo (account nuovo).

## Modello dati

`AutoscuolaFormerStudent` (migrazione additiva `20261023120000_autoscuola_former_student`): `companyId`, `userId`, `name?`, `reason` (`self_delete` | `office_removed` | `unknown`), `leftAt`, `actorUserId?`, `joinedAt?`, `licenseCategory?`, `transmission?`, `nameAssignedBy?`. Unica per `(companyId, userId)`.

**Tabella separata, non un flag su `CompanyMember`**: le ~150 query sui membri (liste, prenotazioni, notifiche, conteggi, job Trigger.dev) continuano a escludere l'ex allievo da sole, senza toccarle.

## Dove si scrive

- `lib/account-deletion.ts` → `deleteAndAnonymizeUserAccount` chiama `archiveFormerStudentMemberships` **dentro la transazione, prima** di cancellare le `CompanyMember`. Il motivo arriva dal `trigger` (`self_delete` → «Ha eliminato l'account», `directory_removal` → «Rimosso dall'ufficio»). Poi cancella i file R2 di foto e firma (best-effort).
- `lib/actions/user.actions.ts` → `deleteUser` archivia l'allievo rimosso **per quell'autoscuola** anche quando l'account sopravvive perché è iscritto altrove.
- `lib/autoscuole/former-students.ts` → `archiveFormerStudentMemberships` (idempotente: upsert; un nome assegnato a mano non si perde se manca quello vero), `realStudentName`, etichette dei motivi.

## Dove si legge (solo ufficio: admin o titolare)

`lib/actions/autoscuole-former-students.actions.ts`:
- `getAutoscuolaFormerStudents()` → lista con saldo (`isLessonUnpaid`, stessa definizione della lista Allievi) e importo in euro (prezzo della guida, o penale se annullamento addebitato). Esclude chi è rientrato con lo stesso account. Agli altri ruoli restituisce `[]`.
- `getAutoscuolaFormerStudentDetail(userId)` → scheda: anagrafica rimasta, guide (escluse le `record_cleanup`), saldo.
- `assignFormerStudentName({ userId, name })` → «Assegna nome».
- Il pagamento si registra con la `setManualPaymentStatus` esistente (non richiede che l'allievo sia ancora membro).

## UI web

- `AutoscuoleStudentsPage.tsx`: tab «Ex allievi» nel `SegmentedPill` delle fasi (`PhaseTab = "ex"`), visibile solo se ce n'è almeno uno. Ricerca per nome e ordinamento A-Z valgono anche qui; filtri e selezione multipla no.
- `components/pages/Autoscuole/FormerStudents.tsx`: riepilogo «Da recuperare», righe (avatar tratteggiato, badge motivo, ultima guida, saldo), scheda in `DetailPanel` in sola lettura con «Segna pagata» / «annulla» e «Assegna nome».
- `AdminUsersPage.tsx`: la conferma di eliminazione di un allievo dice che passerà tra gli Ex allievi.

## Mobile

Solo il testo dell'alert «Elimina account» per gli allievi (`reglo-mobile/src/screens/SettingsScreen.tsx`): dice cosa si cancella e cosa conserva l'autoscuola. Va in prod con un OTA (da confermare).

## Recupero dei casi precedenti

`scripts/reg-629-recover-former-students.ts` (senza `--apply` = prova, solo conteggi; rifiuta `.env.prod`). Ricostruisce autoscuola (guide + `AccountDeletionAudit`), motivo (audit, altrimenti `unknown`), nome (solo da `AutoscuolaNotification.studentName`), percorso (ultimo `AutoscuolaLicensePath`). `createMany` + `skipDuplicates`: idempotente, non tocca righe esistenti.

Stima prod (lettura del 22/10/2026): 142 account eliminati, 100 con autoscuola ricostruibile, nome recuperabile per 4 → gli altri compaiono «Ex allievo senza nome» e l'ufficio li riconosce dallo storico guide. **Su prod non si lancia finché Tiziano non lo dice.**

## Test

- `tests/unit/autoscuole/former-students.test.ts`: archiviazione, motivo, idempotenza, ordine «archivia poi togli il legame», anonimizzazione di foto e firma.
- `tests/e2e/reg629-ex-allievi.auth.spec.ts` (dati: `scripts/seed-reg629.ts`, solo dev): uscita reale da app e da Directory, recupero idempotente, lista, scheda, pagamento, «Assegna nome».

## Fuori scope (possibile seguito)

- Agenda e sezione Pagamenti mostrano ancora «Account eliminato» per le guide di un ex allievo: il nome sta solo nella scheda Ex allievi.
- Un allievo rimosso dall'ufficio **prima** di REG-629 e ancora iscritto ad altre autoscuole non è recuperabile (il vecchio flusso non lasciava traccia).

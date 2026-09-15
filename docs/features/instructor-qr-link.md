# Card QR istruttore → associazione allievo (REG-451)

## Cosa fa
Ogni istruttore ha una **card QR da stampare** (Impostazioni → Istruttori → Gestisci → scheda **Codice** → **Utilizza**). L'allievo la inquadra e viene associato a quell'istruttore (`CompanyMember.assignedInstructorId`). Design 1:1 dal prototipo `QR Istruttore.html` (misurato sul render: scheda Codice, modale 640×790, card verticale 392×651 e orizzontale 600×380, voce Novità 640×1461).

Il QR codifica `<origin>/i/<CODICE>` (origin del browser che genera la card: prod `app.reglo.it`, staging `staging.reglo.it`). Il codice è `AutoscuolaInstructor.inviteCode`, lo stesso del signup (vedi instructor-clusters.md), generato al volo se manca.

## Flussi
1. **Fotocamera del telefono** → pagina pubblica `/i/[code]` (`app/[locale]/i/[code]/page.tsx`, pubblica nel middleware, noindex): mostra istruttore + autoscuola, **"Apri nell'app Reglo"** (iOS: scheme `com.tiziano.developer.reglo-mobile://associa-istruttore?code=`; Android: `intent://` con fallback su Play Store) e i link agli store per chi non ha l'app. Codice inesistente/istruttore disattivato → schermata "Codice non valido".
2. **App allievo** (Profilo → "Scansiona QR", o deep link dalla pagina) → schermate Conferma / Successo / Già associato / Mantieni / Errore / Codice a mano (vedi `reglo-mobile/docs/features/instructor-qr-link.md`), che usano:
   - `GET /api/autoscuole/me/instructor-link?code=` → anteprima `{status: "ok"|"invalid", instructor, companyName, currentInstructor, alreadyLinked}`; `code` accetta anche l'URL completo del QR.
   - `POST /api/autoscuole/me/instructor-link {code}` → `{status: "linked"|"invalid"}`, invalida la cache AGENDA.
   Self-scoped: solo la membership STUDENT nell'autoscuola attiva; il codice deve appartenere a un istruttore ATTIVO della stessa autoscuola.

**Regola di associazione**: vale per ogni istruttore attivo (non solo autonomi, a differenza del signup), perché è la stessa assegnazione che il personale fa già dalla scheda allievo. Il "lock" su prenotazioni/impostazioni scatta comunque solo se l'istruttore è autonomo (`getEffectiveBookingSettings`).

## File
- `lib/autoscuole/instructor-initials.ts` — helper puri (normalizza codice/URL, URL del QR, iniziali); usabili lato client
- `lib/autoscuole/instructor-link.ts` — `resolveInstructorCode`, `previewInstructorLink`, `linkStudentToInstructor`
- `lib/autoscuole/instructor-link-deeplink.ts` — scheme/intent/store, `detectMobilePlatform`
- `app/api/autoscuole/me/instructor-link/route.ts` — API mobile
- `lib/actions/instructor-qr.actions.ts` — `getInstructorQrCard` (personale: tutti; istruttore: solo la propria)
- `components/pages/Autoscuole/instructor-qr/{CodiceTab,InstructorQrCardDialog,InstructorQrCard}.tsx` — scheda, anteprima (formato, 6 sfondi da film, Scarica PNG A4 794×1123 @2x con linee di taglio via `html-to-image`, Stampa A4)
- `components/pages/InstructorLink/InstructorLinkLanding.tsx` — pagina di fallback
- `components/Layout/NovitaDialog.tsx` — voce "Card QR dell'istruttore"
- Asset: `public/images/qr-card/` (sfondi film, marchio), `public/images/novita/card-qr-istruttore.jpg`
- Test: `tests/unit/autoscuole/instructor-link.test.ts`, `tests/e2e/instructor-qr.auth.spec.ts`, `tests/e2e/novita.auth.spec.ts`

## Note
- Figtree non ha "→": nella card e nella pagina il glifo è forzato su `-apple-system, system-ui` come nel prototipo (next/font altrimenti usa "Figtree Fallback" = Arial, freccia lunga, e il testo va a capo altrove).
- Gli sfondi sono fotogrammi di film (scelta del prototipo): diritti d'immagine da valutare prima di un uso esteso.
- Universal link / App Link (`app.reglo.it/i/*` che apre direttamente l'app) richiedono una build nativa (associatedDomains + AASA/assetlinks): non fatto, la pagina di fallback copre il caso.

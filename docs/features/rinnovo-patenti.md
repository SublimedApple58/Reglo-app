# Rinnovo Patenti

Modulo **pubblico e indipendente** per il rinnovo della patente: un cittadino (non necessariamente allievo Reglo) apre il link dell'autoscuola, un **chatbot** (OpenRouter) lo guida a caricare i documenti e prenotare la **visita medica**, e il titolare gestisce medici, disponibilità, FAQ e revisione richieste dalla web app.

Deliberatamente **disaccoppiato** da Appointments / Payments / Booking Engine / Swaps: niente crediti, niente Stripe, niente slot-matcher. È un catalogo a sé, sullo stesso `Company`.

## Flusso cittadino (pubblico, no auth)

1. `GET /[locale]/rinnovo/[slug]` → pagina pubblica (whitelisted in `publicRoutes`). Lo `slug` è `Company.renewalPublicSlug`.
2. Il client apre una sessione: `POST /api/renewal/[slug]/start` → crea `RenewalRequest` (status `submitted`), ritorna `requestId`.
3. Chat: `POST /api/renewal/[slug]/chat` `{ requestId, message, imageDataUrls? }` → una "turn" del chatbot (tool-calling + eventuale soft-check vision).
4. Upload documenti: `POST /api/renewal/[slug]/upload` (multipart) → salva su R2 + crea `RenewalDocument`, porta la richiesta in `under_review`.
5. Prenotazione: il chatbot chiama i tool `list_available_slots` / `book_visit` → crea `RenewalVisitBooking` (confermata subito) e invia le email.

Le route `/api/*` **bypassano il middleware auth** (matcher esclude `api`): l'unico ancoraggio di fiducia è uno **slug valido + feature attiva** + **rate-limit** Redis (`renewalRateLimit`).

## Admin (titolare, web app)

Sezione dedicata **Rinnovi** (`/[locale]/user/autoscuole/rinnovi`), voce di nav visibile solo se `licenseRenewalEnabled`. Quattro tab:
- **Link pubblico**: imposta/mostra `renewalPublicSlug`.
- **Medici**: CRUD medici + editor disponibilità settimanale ("quando viene il medico") + durata visita.
- **FAQ**: knowledge base del chatbot (tabella `RenewalFaq`). Il bot risponde **solo** da qui.
- **Richieste**: lista + dettaglio (dati anagrafici estratti, documenti firmati con approva/rifiuta, transcript, cambio stato).

Gate admin: `requireRenewalOwner` = servizio `AUTOSCUOLE` attivo + `licenseRenewalEnabled` + ruolo `OWNER`.

### Due livelli di accensione
- **`licenseRenewalEnabled`** (backoffice, noi) = abilitazione commerciale: la company vede la sezione "Rinnovi".
- **`licenseRenewalPublicActive`** (titolare, tab "Link pubblico") = il link pubblico è attivo o sospeso (es. medico in ferie). `undefined` = attivo.

`resolveRenewalCompany` richiede **entrambi**: se il titolare sospende, la pagina pubblica va in 404.

### Certificato anamnestico configurabile
La normativa nazionale **non** lo impone a tutti (serve "in presenza di patologie"), ma molti medici monocratici lo richiedono sempre — la prassi varia per medico/regione. Perciò è un'impostazione per-autoscuola: **`licenseRenewalAnamnesticRequired`**. Quando attiva, `requiredDocumentTypes()` lo include tra gli obbligatori e il system prompt del chatbot lo richiede.

### Ricontatto automatico (integrazione documenti)
Dal dettaglio richiesta, il titolare preme **"Richiedi integrazione"**:
1. `requestDocumentIntegration` porta la richiesta in stato `awaiting_documents`, genera un **`resumeToken`** (validità `RENEWAL_RESUME_TOKEN_DAYS` = 7 giorni).
2. Parte l'email template (`sendRenewalIntegrationEmail`) con i documenti da rifare (quelli marcati `rejected`) + eventuale nota del titolare + **link di ripresa**.
3. Il cittadino apre `/rinnovo/{slug}/riprendi/{token}` → `resolveResumeToken` valida token/scadenza/company e riapre **la sua** richiesta (`RenewalChat` in `resumeMode`), senza account.

## Modelli (prisma/schema.prisma)

- `RenewalMedico` — medico convenzionato (companyId, name, phone, email, `visitDurationMinutes`, status). N medici per autoscuola.
- `RenewalMedicoAvailability` — finestre settimanali ricorrenti (`daysOfWeek Int[]`, `startMinutes`/`endMinutes` in minuti wall-clock Europe/Rome).
- `RenewalRequest` — richiesta anonima (no `userId`): status + dati cittadino (firstName, lastName, email, phone, codiceFiscale, licenseNumber, licenseExpiresAt, birthDate) + reviewNotes + `resumeToken`/`resumeTokenExpiresAt` (link di ripresa per il ricontatto automatico).
- `RenewalDocument` — documento caricato (`type`: identity | license | photo | anamnestic, `fileKey` R2, status, `softCheckResult`).
- `RenewalVisitBooking` — slot prenotato (companyId, requestId **@unique**, medicoId, startAt/endAt, status). `@@unique([medicoId, startAt])` = guardia DB anti doppia-prenotazione.
- `RenewalChatMessage` — transcript (role user/assistant, content).
- `RenewalFaq` — Q&A per-autoscuola.
- `Company.renewalPublicSlug String? @unique` — slug pubblico.

Flag in `CompanyService.limits` (`ServiceLimits`): `licenseRenewalEnabled` (backoffice), `licenseRenewalPublicActive` + `licenseRenewalAnamnesticRequired` (titolare, via `updateRenewalSettings`).

Migrazioni: `20260707120000_rinnovo_patenti` (base) + `20260707130000_rinnovo_patenti_resume_token` (token di ripresa).

## File

**Core lib (`lib/renewal/`)**
- `time.ts` — helper timezone (Europe/Rome, conversione wall-clock→UTC DST-safe).
- `slots.ts` — `generateMedicoSlots()` (pure) da finestre settimanali → slot prenotabili.
- `booking.ts` — `getBookableSlots()`, `createRenewalBooking()` (ricalcolo slot lato server + guardia unique).
- `openrouter.ts` — client `fetch` per OpenRouter (chat completions, tool-calling, vision). Env `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`.
- `chat.ts` — `runRenewalChatTurn()`: system prompt vincolato (IT), tool `save_citizen_details` / `list_available_slots` / `book_visit`, persistenza transcript.
- `constants.ts` — tipi documento, status, label, limiti upload.
- `access.ts` — `requireRenewalOwner()`.
- `public.ts` — `resolveRenewalCompany(slug)`, `renewalRateLimit()`, `clientIpFrom()`.
- `storage.ts` — `putRenewalDocument()` su R2 (`renewal/{companyId}/{requestId}/...`).
- `notifications.ts` — `sendRenewalBookingEmails()` (conferma cittadino + avviso owner, via Resend, rispetta kill-switch staging).

**Server actions (admin)**: `lib/actions/renewal.actions.ts` — settings/slug, medici CRUD, `setMedicoAvailability`, FAQ CRUD, `listRenewalRequests`/`getRenewalRequest`, `updateRenewalRequestStatus`, `updateRenewalDocumentStatus`.

**API (pubbliche)**: `app/api/renewal/[slug]/{start,chat,upload}/route.ts`.

**UI**
- Pubblica: `app/[locale]/rinnovo/[slug]/page.tsx` + `components/pages/Renewal/RenewalChat.tsx`.
- Admin: `app/[locale]/user/(autoscuole)/autoscuole/rinnovi/page.tsx` + `components/pages/Autoscuole/AutoscuoleRenewalPage.tsx`.
- Nav: voce "Rinnovi" in `components/pages/Autoscuole/AutoscuoleNav.tsx` (gate su flag via `companyAtom`).

## Note operative

- **Env nuove**: `OPENROUTER_API_KEY` (obbligatoria per il chatbot), `OPENROUTER_MODEL` (opzionale, default `openai/gpt-4o-mini`; impostare uno slug Claude per instradare su Anthropic). R2 e Resend riusano le env esistenti.
- **Migrazione**: eseguire `pnpm migrate:dev` (la SQL è già in `prisma/migrations/20260707120000_rinnovo_patenti`), poi `npx prisma generate`.
- **Documenti**: la lista corretta a norma (art. 119 CdS) è documento identità + patente + fototessera (+ anamnestico se l'autoscuola lo richiede). Il "certificato medico" di idoneità NON è un upload: lo emette il medico alla visita.
- **Ciclo di vita**: prenotazione confermata subito, revisione documenti async. Se i documenti sono da rifare → **"Richiedi integrazione"** invia l'email con link di ripresa (7 giorni) e la richiesta passa in `awaiting_documents`.

# Messaggio di benvenuto su WhatsApp (REG-767)

Richiesta di Federica (consorzio Riunite Car): quando un allievo arriva, la segreteria gli scrive su WhatsApp che da adesso lo seguono loro. Il tasto apre WhatsApp col messaggio già scritto.

## Dove sta il tasto «Messaggio di benvenuto»
1. **Conferma dopo la creazione** (il gesto naturale): la modale «Nuovo allievo» dell'autoscuola (`AutoscuoleStudentsPage`, solo con accesso tramite telefono) e «Aggiungi allievo» del consorzio (`ConsorzioStudentCreateDialog`) non si chiudono più: mostrano «Allievo aggiunto», il tasto principale (nero, `variant="primary"`) e «Fatto». Senza permesso, o con accesso tramite email (nessun numero), comportamento di prima: toast e chiusura.
2. **Intestazione della scheda allievo** (ripiego, discreto): autoscuola (`AutoscuoleStudentsPage`) e consorzio (`ConsorzioStudentDrawer`). Mai nella vista ridotta della consorziata (`affiliate`).

Sotto il tasto, link grigio «Modifica messaggio» → `?tab=settings&pane=reminders#messaggio-di-benvenuto` (`WELCOME_SECTION_ANCHOR`): il blocco si porta in vista da solo.

## Regole
- È un link `wa.me/<numero>?text=…`: lo manda chi lo apre, dal suo numero. **Niente API WhatsApp Business** (quella è REG-500) e **niente registro «inviato»**.
- Solo **titolare e segreteria** (`canManageSettings`: `role === "admin"` o `isOwner`), lato client (`company.role`) e lato server (`getWhatsAppWelcomeContext` → `allowed`).
- Numero assente (scheda) → «Aggiungi il numero», porta al campo Telefono in modifica. Ambiguo, troppo corto o fisso → «Numero non valido per WhatsApp · Correggi». `normalizeToE164` + `isWhatsAppCapable` (`lib/phone-e164.ts`).

## Il testo
- Uno per azienda, `limits.studentWelcomeWhatsappTemplate` (null = default). Nessuna migrazione.
- Default: «Ciao {nome}! Sono {staff} di {autoscuola}, abbiamo preso in carico la tua iscrizione per {categoria}: da adesso ti seguiamo noi».
- Segnaposto: `{nome}`, `{cognome}`, `{staff}` (primo nome di chi scrive), `{autoscuola}` (azienda di chi scrive; per il consorzio il consorzio), `{categoria}` con l'articolo («la patente B», «la CQC persone», «il patentino ADR»), `{scuola}` (solo consorzio: la consorziata; altrove = `{autoscuola}`). Sconosciuti restano scritti com'è.
- **Impostazioni → Promemoria e notifiche → Messaggio di benvenuto** (`WhatsAppWelcomeSection`): campo che salva quando perde il fuoco, menu «Inserisci» per i segnaposto, «Ripristina», anteprima compatta. Max 1000 caratteri.

## File
- `lib/autoscuole/whatsapp-welcome.ts` — default, segnaposto, ancora, `renderWelcomeMessage`, `licenseCategoryWithArticle`, `buildWhatsAppLink` (puro; `tests/unit/autoscuole/whatsapp-welcome.test.ts`)
- `lib/actions/autoscuole-settings.actions.ts` — `getWhatsAppWelcomeContext()` + campo in schema/`AutoscuolaSettingsData`
- `components/pages/Autoscuole/StudentWhatsAppButton.tsx` — `StudentWhatsAppButton` (header/primary), `StudentAddedWelcomeStep`, cache del contesto (`invalidateWhatsAppWelcomeContext()` dopo il salvataggio)
- `components/pages/Autoscuole/settings/WhatsAppWelcomeSection.tsx` — il blocco nelle impostazioni
- `NeverAccessedNudge.tsx` esporta `WhatsAppGlyph`

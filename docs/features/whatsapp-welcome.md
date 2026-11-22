# Scrivi su WhatsApp — presa in carico (REG-767)

Richiesta di Federica (consorzio Riunite Car): quando un allievo passa a loro, la segreteria gli scrive su WhatsApp che da adesso lo seguono loro. Il tasto lo apre già scritto.

## Cosa fa
- Nell'intestazione della scheda allievo (autoscuola: `AutoscuoleStudentsPage`; consorzio: `ConsorzioStudentDrawer`) c'è **«Scrivi su WhatsApp»**: un link `wa.me/<numero>?text=…` che apre l'app o WhatsApp Web col messaggio pronto. Lo manda chi lo apre, dal suo numero.
- **Niente API WhatsApp Business** (quella è REG-500, promemoria automatici) e **niente registro «inviato»**: Reglo non sa se il messaggio è partito.
- Solo **titolare e segreteria** (`canManageSettings`: `role === "admin"` o `isOwner`). Gli istruttori non lo vedono. Nella vista ridotta della consorziata (`affiliate`) il tasto non c'è.
- Numero assente → **«Aggiungi il numero»**: porta al Riepilogo col campo Telefono già in modifica. Numero ambiguo, troppo corto o fisso italiano → **«Numero non valido per WhatsApp · Correggi»**. Normalizzazione con `normalizeToE164` + `isWhatsAppCapable` (`lib/phone-e164.ts`), non con `normalizeItalianWaNumber` del megafono.

## Il testo
- Uno per azienda (autoscuola o consorzio), nei limits del CompanyService: `studentWelcomeWhatsappTemplate` (null = default). Nessuna migrazione.
- Default: «Ciao {nome}! Sono {staff} di {autoscuola}, abbiamo preso in carico la tua iscrizione per {categoria}: da adesso ti seguiamo noi».
- Segnaposto: `{nome}`, `{cognome}`, `{staff}` (primo nome di chi scrive), `{autoscuola}` (l'azienda di chi scrive: per il consorzio, il consorzio), `{categoria}` con l'articolo («la patente B», «la CQC persone», «il patentino ADR»; il percorso aperto, altrimenti la categoria dell'allievo), `{scuola}` (solo consorzio: la consorziata; altrove vale come `{autoscuola}`). Un segnaposto sconosciuto resta scritto com'è.
- Si cambia in **Impostazioni → Promemoria e notifiche → Messaggio di presa in carico** (`WhatsAppWelcomeSection`): salva quando il campo perde il fuoco, anteprima dal vivo, «Ripristina il testo predefinito». Max 1000 caratteri.

## File
- `lib/autoscuole/whatsapp-welcome.ts` — default, segnaposto, `renderWelcomeMessage`, `licenseCategoryWithArticle`, `buildWhatsAppLink` (puro, testato in `tests/unit/autoscuole/whatsapp-welcome.test.ts`)
- `lib/actions/autoscuole-settings.actions.ts` — `getWhatsAppWelcomeContext()` (testo, nome di chi scrive, nome azienda; `allowed: false` per chi non può) + campo nello schema di `updateAutoscuolaSettings` e in `AutoscuolaSettingsData`
- `components/pages/Autoscuole/StudentWhatsAppButton.tsx` — il tasto (contesto in cache per pagina, `invalidateWhatsAppWelcomeContext()` dopo il salvataggio)
- `components/pages/Autoscuole/settings/WhatsAppWelcomeSection.tsx` — il campo nelle impostazioni
- `NeverAccessedNudge.tsx` esporta `WhatsAppGlyph` (logo a un colore)

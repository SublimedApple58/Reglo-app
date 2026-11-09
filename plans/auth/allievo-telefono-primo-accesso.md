# Allievo creato col telefono + «Primo accesso» (richiesta Ricca)

## Cosa è stato fatto (09/11/2026, branch `feat/allievo-telefono` su web e mobile — NON in staging né in prod)

- **Backend**:
  - migrazione additiva `20261111090000_user_login_phone`: `User.loginPhone` (E.164, unico), `birthDate`, `profileCompletedAt`;
  - login mobile col telefono, con `ACTIVATION_REQUIRED` per gli account mai attivati;
  - `POST /api/mobile/auth/first-access/{start,complete}` senza codice, con limiti per numero e per IP;
  - recupero password con email o telefono (il codice parte sempre per email);
  - `sendDynamicEmail` scarta i destinatari `*.reglo.local`;
  - customer Stripe senza email segnaposto.
- **Web**:
  - dialog «Nuovo allievo» con la scelta Telefono (predefinita: nome, cognome, telefono, percorso) | Email e password (modo classico);
  - stato del primo accesso nella scheda («Primo accesso non ancora fatto» / «Attivato il …») e nel testo dell'indicatore in lista;
  - le email segnaposto non si vedono più.
- **Mobile**:
  - stack `(auth)/first-access`: numero → «Ciao Giulia» (nome e cognome) → email → password → data di nascita → «Tutto giusto?» → «Eccoti, Giulia» → dentro;
  - ingressi dalla welcome iOS, dal login Android e dal login col numero;
  - campo «Email o telefono» nel login e nel recupero password.
- **Test**: unitari sul primo accesso, sul telefono di accesso, sul recupero e su Stripe. Smoke sul DB dev: creazione dal dialog, API con curl, flusso completo nell'app su simulatore (Maestro). Tutti i dati di prova sono stati cancellati.

## Decisioni prese lungo la strada
1. **Fisso**, niente setting per autoscuola.
2. Prima versione: il titolare sceglieva telefono e password. **Cambio Tiziano**: il titolare non sceglie la password; l'allievo completa email (obbligatoria), password (obbligatoria) e data di nascita al primo accesso.
3. Il metodo di verifica (proposta A codice / B WhatsApp OTP / C link) è stato **scartato da Tiziano: nessun codice**, protezioni leggere. Rischio accettato: chi conosce il numero di un allievo non ancora attivato può attivarlo al posto suo.
4. La creazione resta **solo dal web**, solo per il titolare e solo per gli allievi **nuovi**. Nel dialog resta anche il modo classico con email e password.

## Piano originale (fasi)
1. Worktree e branch.
2. Backend: migrazione, login col telefono, creazione, normalizzazione +39, unicità, email segnaposto, Stripe.
3. Web: dialog (anteprima → ok).
4. Mobile: login, recupero password, onboarding (anteprime → ok).
5. Verifica e rilascio: staging poi prod, OTA su entrambi i runtime, sempre con l'ok.

## Da fare prima del rilascio
- Ok di Tiziano sulle anteprime (web e app).
- Web: `git fetch && git merge origin/staging` nel branch → `ship:staging` → `pnpm migrate:staging`. Prod: `migrate:prod` prima del deploy.
- Mobile: OTA doppio (runtime 2.4.0 e 2.4.2), prima iOS poi Android. Le app senza OTA mostrano il messaggio «Tocca Primo accesso» ma senza il bottone.

# Pagellino configurabile dall'app (REG-443, coda)

**Fatto e RILASCIATO IN PROD il 2026-09-12** — web `main 7ede895` + `migrate:prod`
(2 migrazioni additive), mobile `master b674b41` + OTA prod iOS/Android runtime 2.2.0.

## Cosa è stato fatto

La configurazione delle voci esisteva solo sul web (Impostazioni → Pagellino). Ora sta
anche sull'app, in **Altro → Gestione → Pagellino**, ed è aperta **agli istruttori** oltre
che ai titolari.

1. **Backend** — `GET`/`PUT /api/autoscuole/evaluation-sheet`: due proxy sulle action già
   esistenti (`getEvaluationSheet` / `saveEvaluationSheet`), nessuna logica nuova.
   Permesso allargato: `canManageSettings = admin || isOwner || isInstructor`.
2. **Web** — corrette due copy del pane rimaste indietro dopo l'opt-in (le stelline non
   partono più da metà scala; col pagellino spento non resta nessuna valutazione da dare).
3. **Mobile** — `EvaluationSheetScreen` (interruttore, lista in drag&drop, stato vuoto col
   modello base, draft + un solo Salva, guardia sulle modifiche non salvate anche sullo
   swipe-back) e `EvaluationItemSheet` (form sheet nativo: nome, scala a stelline vere,
   eliminazione con la verità sull'archiviazione).

## Decisioni prese in corsa

- **Permessi**: aperti agli istruttori (Tiziano, 12/09). Il gate vero è lato server; quello
  nella route mobile è cortesia.
- **Riordino**: drag&drop scritto a mano con Reanimated + gesture-handler. Niente
  `react-native-draggable-flatlist`: non è allineato a Reanimated 4 e non deve finire in un
  OTA. Il pan vive solo sulla maniglia e spegne lo scroll in `onBegin`.
- **Editing in un foglio**, non in riga: un campo di testo dentro una card trascinabile è una
  rissa fra tastiera e gesto.
- **Draft + un solo Salva** invece del salvataggio a ogni tocco: la regola no-optimistic
  renderebbe il riordino a scatti, e l'API sostituisce comunque l'elenco intero.
- **Azione distruttiva in testa al foglio**, mai sotto la CTA (documentato in §13.2.1).

## Cose imparate a caro prezzo

- **Il simulatore è di Tiziano.** Ho ucciso il suo Metro per puntare l'app al dev locale e gli
  ho bruciato la sessione. Regola presa: per verifiche a schermo solo Maestro, e se Maestro non
  basta si salta la verifica.
- `ps` non mostra `EXPO_PUBLIC_API_URL`: Metro la inlina nel bundle. Non si deduce l'ambiente
  dalla riga di comando — si guarda quale DB contiene l'utente loggato.
- "Nessuna migrazione" valeva per staging, non per prod: le migrazioni del pagellino non erano
  mai state applicate lì. Controllare sempre `migrate status` sull'ambiente di destinazione.
- Il branch cresce sopra `staging` e porta dentro il lavoro altrui: prima di andare su `main`,
  verificare che `git diff --stat origin/main..HEAD` contenga SOLO la propria feature.

## Conseguenza accettata del rilascio

Su prod il pagellino nasce spento e senza voci, e la stellina singola non si compila più:
finché un'autoscuola non configura le voci, i suoi istruttori non hanno modo di valutare una
guida. I voti già dati restano leggibili. Rimedio: "Usa il modello base" + interruttore, da web
o da app.

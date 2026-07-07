# Web: editor disponibilità istruttore mode-aware (Predefinita + Pubblicazione)

**Stato: IMPLEMENTATO (2026-07-07, branch feat/fix-macchiavello).**

## What was done
- Nuovo `components/pages/Autoscuole/InstructorPublicationEditor.tsx`: vista Pubblicazione nel dialog Disponibilità (rail 8 settimane con stati pubblicata/da pubblicare/selezionata, barra Pubblica/Ritira, 7 righe giorno con editor inline delle fasce che salva `setDailyAvailabilityOverride`; template per settimane nuove = ultima settimana pubblicata → base settimanale, stessa catena di `publishInstructorWeek`).
- `AutoscuoleResourcesPage`: dialog mode-aware (`readAvailabilityMode` dai settings istruttore), badge modalità + link "Cambia modalità" (merge dei settings, `updateAutoscuolaInstructor`), tabs Predefinito/Calendario solo in modalità predefinita, footer dedicato, `min-w-0` sul body (il rail espandeva la grid del DialogContent), dialog più largo (560px) in pubblicazione.
- Card istruttore (`InstructorsTab`): sottotitolo "Disponibilità a pubblicazione" quando la modalità è publication.
- **Bug fix backend trovato durante il lavoro**: `publishInstructorWeek` materializzava i giorni mancanti leggendo le `ranges` piatte del record base — con una base per-giorno (`rangesByDay`, quella che scrive l'editor mobile) le piatte sono vuote → tutti i giorni pubblicati come RIPOSO. Ora usa `rangesForDay` (fix che vale anche per il publish da mobile). `getAutoscuolaInstructorWeeklyAvailabilities` ora espone anche `rangesByDay`.

## Piano originale (approvato con preview `~/Desktop/Reglo-Preview-Disponibilita-Pubblicazione.html`)
1. **Dialog mode-aware** — legge `availabilityMode`; predefinita = esperienza attuale invariata.
2. **Vista Pubblicazione** speculare al mobile (`PublicationModeEditor`): rail settimane, Pubblica/Ritira, righe giorno con fasce, pre-fill dall'ultima pubblicata; tab Calendario nascosto (le eccezioni SONO i giorni).
3. **Card istruttore + docs.**

Niente migrazioni: le action `publishInstructorWeek` / `unpublishInstructorWeek` / `getInstructorPublishedWeeks` esistevano già e accettano l'owner con `instructorId`.

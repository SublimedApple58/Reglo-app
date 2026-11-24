# REG-778 — Una tab bar sola + posizione delle Impostazioni nell'URL

**Fatto (2026-11-24):**
- `components/ui/underline-tabs.tsx` (`UnderlineTabs`): la tab bar del drawer
  allievo estratta e usata ovunque ci siano schede orizzontali. Usata da:
  drawer allievo (`DrawerTabs`), le sotto-schede delle Impostazioni (anche
  quelle delle viste bloccate), il menu sezioni sotto `lg`, Road e Finanza del
  backoffice. Tolto `reglo-tabs.tsx`, che era giallo e non lo usava nessuno.
- Le Impostazioni si aprono su «Informazioni aziendali».
- URL `?tab=settings&pane=…&sub=…`: le sezioni fanno push, le sotto-schede
  replace (`settings/settings-url.ts`).
- Test e2e: le sotto-schede ora si cercano come `tab`.
- Documentazione: design-system §4b-bis e `docs/features/settings-overlay.md`.

## Inventario e scelta
Tab bar (navigazione fra viste) → `UnderlineTabs`. Restano segmentati, perché
filtri o scelte di valore: periodo agenda, fasi allievi, Lista/Cancellazioni
tardive, preset KPI, Singolo/Multiplo, il selettore di modalità della stampa.
La nav principale dell'app resta com'è (macrostruttura).

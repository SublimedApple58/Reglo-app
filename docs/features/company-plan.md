# Company Plan (abbonamento)

Il team Reglo assegna dal backoffice il piano commerciale di una autoscuola; il titolare lo vede in **Area personale → Abbonamento** con la card proto "Il tuo piano" (righe con icone 3D + totale per periodo).

## Modello dati

`CompanyPlan` (1:1 con Company, cascade): `billingPeriod` ("monthly"|"annual"), `renewsAt?`, `instructorSeats` + `instructorSeatPriceCents`, `teoriaEnabled` + `teoriaSeats` + `teoriaSeatPriceCents` (prezzo PER licenza), `voiceEnabled` + `voicePriceCents`. **Prezzi in centesimi.** Migration `20260709164921_company_plan`.

**Regole di business:**
- Il **totale del DTO è solo RICORRENTE** (posti×prezzo + Segretaria se attiva): la **Licenza formazione è UNA TANTUM** (`teoriaSeats × teoriaSeatPriceCents`, es. 30 × 2,50 € = 75 €) — esclusa dal totale, esaurite le licenze se ne acquistano altre. Esplicitato sia nella dialog backoffice sia nella card web (riga "· una tantum" + nota sotto il Totale).
- **Segretaria AI a listino**: 350 €/anno (+ consumi) o 39 €/mese — la dialog precompila all'attivazione e al cambio periodo (se il prezzo era ancora il listino dell'altro periodo), ma resta modificabile.

⚠️ È la composizione **commerciale/display**: l'attivazione operativa di teoria e Segretaria resta nei `CompanyService.limits` (drawer "Gestisci" del backoffice). Le due cose non si sincronizzano automaticamente.

## File

| File | Ruolo |
|------|-------|
| `lib/company-plan.ts` | Helper condivisi: `formatEuroCents` (it-IT), `parseEuroToCents`/`centsToEuroInput` (input "264,00"), label/suffissi periodo |
| `lib/actions/company-plan.actions.ts` | `getCompanyPlan` (owner-only), `getBackofficeCompanyPlan`, `saveBackofficeCompanyPlan` (upsert, renewsAt salvato a mezzogiorno UTC), `deleteBackofficeCompanyPlan` |
| `components/pages/Backoffice/BackofficeCompanyPlanDialog.tsx` | Form: periodo, data rinnovo (DatePickerInput custom, niente calendario nativo), posti istruttore×prezzo, teoria (toggle+posti+prezzo una tantum), Segretaria (toggle+prezzo precompilato), totale ricorrente live + riga una tantum, salva/rimuovi. NB toggle = button con Checkbox `pointer-events-none` (il label-wrap doppio-scattava) |
| `components/pages/Backoffice/BackofficeCompaniesPage.tsx` | Bottone CreditCard nella riga → dialog |
| `components/pages/Autoscuole/AutoscuoleAreaPersonalePage.tsx` | `AbbonamentoPane`: card proto con "Si rinnova il …", righe attive, Totale €/anno\|€/mese; "Gestisci" → chat assistenza; empty state se senza piano; riservata OWNER/INSTRUCTOR_OWNER |

## Asset

Icone 3D dal proto in `public/images/plan/`: `icon-licenza.png` (libri), `icon-segretaria.png` (telefono rosso); per i posti istruttore si riusa `public/images/settings/istruttore-nuovo.png` (tonda 34px).

## Connessioni

- **Support Center**: "Gestisci" nella card porta alla chat (le modifiche piano passano dal team).
- **Backoffice**: stessa auth cookie; il bottone convive con Documenti nella riga company.
- **Area personale**: terza pane funzionante (con documenti e credenziali).

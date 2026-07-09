# Documenti autoscuola (contratto / fatture / altri) dal backoffice

> Richiesto e approvato il 2026-07-09 ("io dal backoffice posso aggiungere un documento come contratto, x fatture e x altri documenti e in web app devono poter vedere tutto. Vai parti"), su `feat/airbnb-redesign`.
> Stato: implementato, verificato su dev, su staging (deploy + migration `20260709161317_company_documents`).
> Doc tecnica completa: `docs/features/company-documents.md`.

## Cosa è stato fatto

- **DB**: `CompanyDocument` (kind contract/invoice/other, file su R2). Contratto unico: nuovo upload sostituisce riga + oggetto R2.
- **Backoffice**: bottone documento in ogni riga della tabella autoscuole → dialog con 3 sezioni (upload multipart, download, elimina). Guard cookie backoffice.
- **Web**: pane "Contratto e fattura" reale in Area personale — card contratto + fatture + altri documenti, download con URL firmati a 5 min (mai public base URL), riservata a OWNER/INSTRUCTOR_OWNER (altri ruoli → nota "riservata al titolare").
- **Verifica**: giro Playwright upload 3 tipi → visione titolare → download firmato (nome file originale, PDF integro); e2e aggiornato con assertion indipendenti dai dati.

## Note di rilascio

- PROD: `pnpm migrate:prod` al rilascio. R2 già configurato (stesso bucket di avatar/aula).
- In dev restano 3 PDF di prova su "Reglo E2E" (Contratto/Fattura/Informativa-193465) — utili per QA, eliminabili dalla dialog.

# Company Documents (contratto, fatture, altri documenti)

Il team Reglo carica dal backoffice i documenti di una autoscuola; il titolare li vede e scarica in **Area personale → "Contratto e fattura"**. Prima quella pane era uno scaffold statico.

## Modello dati

`CompanyDocument`: `companyId`, `kind` (`"contract"` | `"invoice"` | `"other"`), `title`, `fileKey` (R2), `fileName`, `mimeType`, `sizeBytes`. Migration `20260709161317_company_documents`. Il **contratto è unico**: un nuovo upload sostituisce riga + oggetto R2 precedenti (fatture e altri documenti sono N).

## Storage & sicurezza

- File su R2 sotto `companies/{companyId}/documents/{kind}-{uuid}.{ext}` (PDF, immagini, Word, Excel; max 20MB).
- Download SEMPRE con **URL firmato a 5 minuti** costruito ad hoc con `ResponseContentDisposition` (nome file originale). NON si usa `getSignedAssetUrl` perché con `R2_PUBLIC_BASE_URL` impostata renderebbe l'URL pubblico — questi documenti sono riservati.
- Lato company la visibilità è **solo del titolare** (`autoscuolaRole` OWNER/INSTRUCTOR_OWNER); gli altri ruoli vedono la nota "Sezione riservata al titolare".

## File

| File | Ruolo |
|------|-------|
| `lib/company-documents.ts` | Kinds, label, DTO, formatDocumentSize (condiviso client/server — le const NON possono stare nel file "use server") |
| `lib/actions/company-documents.actions.ts` | Lato company: `getCompanyDocuments`, `getCompanyDocumentDownloadUrl`. Lato backoffice: `getBackofficeCompanyDocuments`, `getBackofficeDocumentDownloadUrl`, `deleteBackofficeCompanyDocument` (elimina anche l'oggetto R2, best-effort) |
| `app/api/backoffice/company-documents/route.ts` | POST multipart (file, companyId, kind, title?) — guard `validateBackofficeCookie` diretto (401, niente redirect) |
| `components/pages/Backoffice/BackofficeCompanyDocumentsDialog.tsx` | Dialog per company: sezioni Contratto/Fatture/Altri con upload, download, delete |
| `components/pages/Backoffice/BackofficeCompaniesPage.tsx` | Bottone FileText nella riga → apre la dialog |
| `components/pages/Autoscuole/AutoscuoleAreaPersonalePage.tsx` | `DocumentiPane`: card contratto + lista fatture + altri documenti (sezione mostrata solo se presenti), skeleton+FadeIn, empty states |

## Gotcha

- Dopo la migration in dev serve **riavviare `pnpm dev`** (Prisma client ricaricato solo al riavvio).
- La riga DB è la fonte di verità: un oggetto R2 orfano (delete fallita) non rompe nulla.

## Connessioni

- **Backoffice**: stessa auth cookie (`requireGlobalAdmin` / `validateBackofficeCookie`).
- **Storage R2**: stesso client di avatar/aula (`lib/storage/r2.ts`).
- **Area personale**: pane documenti; le altre pane (profilo/credenziali) sono indipendenti.

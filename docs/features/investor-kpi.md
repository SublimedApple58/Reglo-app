# Pagina investor ("Reglo in numeri")

Pagina pubblica a **link**: i numeri aggregati della piattaforma, da girare a un
investor. Vive fuori dall'app (`/it/investor/<token>`), non ha login e non ha
navigazione: si apre, si scorre, si chiude.

## Accesso

- **Token nell'URL**: 32 byte random in base64url, generati con `crypto.randomBytes`.
- **Un link per destinatario**: ogni link ha una `label` ("Preparato per …") che
  compare **stampata in fondo alla pagina**. Se un link circola si sa da chi è
  partito, e si revoca quello soltanto.
- **Revoca** immediata e **scadenza opzionale** (default: non scade). Link
  revocato/scaduto/sconosciuto → schermata secca, zero dati.
- **`noindex, nofollow, nocache`** nei metadata: condivisibile, non scopribile.
  Nessuna sitemap la nomina.
- Rotta aggiunta alle `isPublicRoute` del `middleware.ts` accanto a `/invite/`:
  è pubblica perché protetta dal token, non da una sessione.
- Contatore visite (`viewCount`, `lastViewedAt`) aggiornato best-effort a ogni
  apertura: non deve mai far fallire la pagina.
- `dynamic = "force-dynamic"`: niente cache di pagina, così il contatore vede
  ogni apertura e i numeri sono quelli di adesso.

Gestione dal backoffice: **KPI → "Link investor"** (crea con etichetta, copia —
il link finisce negli appunti da solo appena creato —, vedi quante volte è stato
aperto, revoca con conferma a due passi).

## Cosa esce e cosa no

**Esce**: MRR, ARR, ARPA · autoscuole attive, totali e nuove nel periodo · MRR
cumulato e nuovi clienti negli ultimi 12 mesi · guide svolte nel periodo, media
al giorno e **totale dall'inizio** · allievi attivi e registrati dall'inizio ·
istruttori attivi · **quota prenotata dall'app** con variazione · adozione delle
funzionalità in forma aggregata ("9 su 13").

**Non esce mai**: nomi delle autoscuole e classifica per attività (è
riservatezza verso i nostri clienti) · stato attivo/disattivato del singolo
account · tasso di annullamento, no show · versioni app installate · acquisti
una tantum.

Questa regola è **codice testato**, non una buona intenzione:
`projectInvestorKpis` in `lib/investor/investor-shape.ts` è una funzione pura, e
`tests/unit/investor/investor-projection.test.ts` verifica che nel JSON prodotto
non compaiano nomi di autoscuole né metriche operative.

## Data model

`InvestorKpiLink` — `token` (unique), `label`, `expiresAt?`, `revokedAt?`,
`viewCount`, `lastViewedAt`, timestamp. Migrazione `20260913170000_investor_kpi_link`,
puramente additiva. Il token è **in chiaro**: chi legge questo DB ha già accesso
a tutto il resto, e in cambio il link si può ricopiare mesi dopo invece di
rigenerarlo.

## File

| File | Ruolo |
|------|-------|
| `lib/investor/investor-shape.ts` | **Puro**: tipi, periodi ammessi (`30g`/`90g`/`12m`, `asInvestorPeriod`) e `projectInvestorKpis` — l'unico punto in cui si decide cosa esce |
| `lib/investor/investor-kpi.ts` | `buildInvestorKpis` (calcolo + totali dall'inizio) e `resolveInvestorLink` (validazione token + contatore) |
| `lib/actions/investor-links.actions.ts` | `listInvestorLinks`, `createInvestorLink`, `revokeInvestorLink` (tutte `requireGlobalAdmin`) |
| `app/[locale]/investor/[token]/page.tsx` | La rotta pubblica: metadata noindex, schermata "link non valido", render |
| `components/pages/Investor/InvestorKpiPage.tsx` | La pagina: hero, sezioni, numeri che salgono in viewport, barre |
| `components/pages/Investor/InvestorCharts.tsx` | Due grafici pensati per il dito: nessun tooltip, pochi tick |
| `components/pages/Backoffice/kpi/InvestorLinksPanel.tsx` | Pannello di gestione dei link nel backoffice |
| `middleware.ts` | `/investor/` fra le rotte pubbliche |

Il **calcolo** è lo stesso del backoffice: `lib/backoffice/kpi-compute.ts`
(`computeKpis`, estratto dall'action proprio per essere condiviso). Quel modulo
**non è** `"use server"` e non ha guardie: chi lo usa mette la propria
autorizzazione davanti (backoffice → `requireGlobalAdmin`, investor → token).

## Tre orologi, separati in pagina (2026-09-13)

L'MRR non è mai dipeso dal filtro — ma stando sotto lo switcher **sembrava**
"MRR degli ultimi 30 giorni". Ora la pagina dichiara la differenza con la
posizione, non con una nota:

1. **"Stato di oggi"**, sopra il filtro: MRR, ARR, ARPA, autoscuole attive,
   allievi registrati e guide gestite dall'inizio. Non cambia mai.
2. **"Negli ultimi N giorni"**, subito sotto il filtro, con una riga che lo dice
   a voce ("da qui in giù i numeri seguono il periodo scelto"): guide svolte,
   media al giorno, nuovi clienti, quota app, allievi e istruttori attivi,
   adozione.
3. **"Crescita — ultimi 12 mesi"**, in fondo, dichiaratamente indipendente dal
   filtro.

Stessa separazione nel backoffice: le card sono in due gruppi, **"Adesso · non
cambia col periodo"** (MRR, autoscuole attive) e **"Nel periodo"** con
l'intervallo scritto accanto. Regola pratica: una card sotto "Adesso" non deve
mai citare il periodo nel sottotitolo (le "nuove autoscuole" sono infatti
migrate nel blocco periodo).

## Design (mobile-first)

Pensata prima per il telefono: colonna singola da 720px al massimo, numeri in
`clamp()` fino a 68px, sezioni che entrano dal basso una volta sola e fanno
partire i contatori solo quando sono in campo. **Nessun hover da nessuna parte**
(sul telefono non esiste): niente tooltip nei grafici, i valori che contano sono
stampati fuori. Safe-area iOS in fondo, testo mai sotto i 15px, target da 44px,
`prefers-reduced-motion` rispettato ovunque.

## Connessioni

- **Backoffice KPI** ([backoffice-kpi.md](backoffice-kpi.md)) — stesso motore di
  calcolo e pannello di gestione dei link.
- Se si aggiunge un KPI interno, **non** finisce qui automaticamente: va aggiunto
  a mano in `projectInvestorKpis`. È voluto.

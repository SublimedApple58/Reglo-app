# Pagina investor pubblica ("Reglo in numeri")

> **Fatto** (2026-09-13): link a token, KPI ridotti, pagina mobile-first.
> Rilasciata diretta in produzione con migrazione additiva.

## 1. Accesso — approvato

Token da 32 byte nell'URL (`/it/investor/<token>`), `noindex`. **Un link per
destinatario**, con etichetta stampata in fondo alla pagina: se circola si sa da
chi è partito. Revoca immediata, scadenza opzionale (default: non scade),
contatore aperture. Tutto gestito dal backoffice, dentro la pagina KPI.

Token in chiaro sul DB: chi lo legge ha già accesso a tutto il resto, e in cambio
il link si ricopia mesi dopo invece di rigenerarlo.

## 2. KPI — dentro e fuori

**Dentro**: MRR, ARR, ARPA · autoscuole attive/totali/nuove · crescita 12 mesi
(nuovi clienti + MRR cumulato) · guide svolte nel periodo, media al giorno,
**totale dall'inizio** · allievi attivi e registrati dall'inizio · istruttori
attivi · quota prenotata dall'app con variazione · adozione funzionalità
aggregata.

**Fuori**: nomi delle autoscuole e classifica (riservatezza verso i clienti),
stato dei singoli account, tasso di annullamento e no show, versioni app,
acquisti una tantum.

La regola non è affidata alla buona volontà: `projectInvestorKpis` è una
funzione **pura** e un test verifica che nel JSON non compaiano nomi di
autoscuole né metriche operative. Un KPI nuovo nel backoffice non arriva qui da
solo.

## 3. Design mobile-first

Colonna singola max 720px, numeri in `clamp()` fino a 68px, sezioni che entrano
dal basso una volta sola e avviano i contatori **solo quando sono in campo**.
Nessun hover: niente tooltip nei grafici (sul telefono non esistono), i valori
che contano stampati fuori — "picco 96 guide · 08 set". Safe-area iOS, target
44px, `prefers-reduced-motion`.

## Architettura

`computeKpis` estratto dall'action del backoffice in `lib/backoffice/kpi-compute.ts`,
condiviso dalle due superfici. Quel modulo **non è** `"use server"` e non ha
guardie: l'autorizzazione la mette chi lo usa. Farlo diventare un server action
lo renderebbe richiamabile dal client — da non fare mai.

## Trappole incontrate

- Il `next dev` in esecuzione teneva il **client Prisma vecchio**: la pagina
  esplodeva con `Cannot read properties of undefined (reading 'findUnique')`
  mentre il codice era giusto. Un tocco a `db/prisma.ts` ricarica il modulo.
- Test in Jest: importare la proiezione tirava dentro Prisma via
  `investor-kpi.ts` → suite che non parte. Da qui la separazione in
  `investor-shape.ts` (puro) e `investor-kpi.ts` (DB), che è anche l'architettura
  giusta.
- Playwright + input controllati: riempire il form di login **prima**
  dell'idratazione fa azzerare i campi da React. Aspettare un attimo.
- Barra di avanzamento a 0% con `rounded-full` e larghezza minima → un pallino
  che sembra un bug: a zero si lascia la traccia vuota.

## Verifica

Typecheck e lint puliti (resta il solo `any` storico in `middleware.ts`),
`pnpm test:unit` **253/253** (7 nuovi, di cui 3 sulla non-fuga dei dati),
anteprima reale su iPhone 14 Pro e desktop, pannello link provato nel backoffice
(creazione, copia, contatore aperture).

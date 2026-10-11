# KPI del backoffice — da decine di secondi a qualche centinaio di millisecondi

> **Fatto** (ottobre 2026). Segnalazione: "cambiare il periodo di filtro ci mette
> una vita, roba di minuti, e secondo me consuma un sacco su Vercel".

## Cosa è stato fatto

Quattro interventi, nessun cambio ai numeri mostrati:

1. I due convertitori di orologio italiano in
   `lib/backoffice/agenda-saturation.ts` non costruiscono più un
   `Intl.DateTimeFormat` a ogni chiamata e memorizzano i risultati.
   **Ciclo della saturazione sul filtro "Anno": 4.194 ms → 85 ms** (dato di
   prod, 51 istruttori). Beneficia anche il report ore del titolare, che usa lo
   stesso codice.
2. In `lib/backoffice/kpi-compute.ts` il calendario della finestra si costruisce
   una volta per finestra, non una volta per istruttore.
3. Il filtro periodo non fa più girare il calcolo due volte per click: l'URL si
   riscrive con `history.replaceState` invece di `router.replace`.
4. Cache Redis di 10 minuti dentro `computeKpis`, condivisa con la pagina
   investor pubblica. Il payload porta `computedAt` e la pagina scrive
   "calcolati alle HH:MM".

Verifica: `npx tsc --noEmit` pulito, `pnpm test:unit` 49 suite / 741 test verdi
(3 nuovi sui due giorni del cambio d'ora), e un confronto differenziale fra
vecchia e nuova implementazione dei convertitori su **33.144 casi — zero
differenze**.

## La diagnosi, perché non era dove sembrava

Misurato su produzione prima di toccare niente:

| | Costo |
|---|---|
| Le ~18 query in parallelo | **1,15 s** (3,0 s in fila) |
| Ciclo saturazione, 7 giorni | 127 ms |
| Ciclo saturazione, 30 giorni | 371 ms |
| Ciclo saturazione, 90 giorni | 1.050 ms |
| Ciclo saturazione, 365 giorni | **4.194 ms**, 37.230 iterazioni, 149.732 chiamate `Intl` |

Il database non era il problema. Il problema era `new Intl.DateTimeFormat(...)`
dentro un ciclo annidato (27,8 µs contro 2,2 µs con il formatter pronto), più il
doppio calcolo per ogni click. Su Vercel quei secondi sono **Active CPU**, cioè
la voce che si paga.

## Fasi (come erano state proposte e approvate)

### Fase 1 — I convertitori di data
Formatter a livello di modulo + memoizzazione per `(giorno, minuto)`. Modulo
puro, già testato. La chiave è per giorno **e** minuto e non per il solo giorno
perché il 25 ottobre l'offset cambia a metà giornata.

### Fase 2 — Un calcolo per click
`history.replaceState` al posto di `router.replace`.

### Fase 3 — Cache breve
Redis 10 minuti, chiave `backoffice:kpi:v1:<from>:<to>:<full|investor>`, dentro
`computeKpis` così copre anche la pagina investor. Se Redis non c'è si calcola.

### Fase 4 — Non fatta, di proposito
Trasformare le due `findMany` da ~12k righe in aggregati SQL. Non è il collo di
bottiglia (il DB sta in un secondo) e toccherebbe il cuore del calcolo: si farà
solo se dopo queste tre fasi servisse ancora.

## Quello che resta aperto

La bolletta Vercel **non** è stata attribuita a questa pagina con dati alla
mano: Observability non è attiva sul piano (404 sull'API) e Web Analytics
nemmeno, quindi invocazioni e CPU per rotta non sono leggibili. Una pagina
interna aperta qualche volta al giorno resta spiccioli anche a venti secondi di
CPU. Il vettore di spesa plausibile era la **pagina investor pubblica**, che
faceva girare il motore completo a ogni apertura del link — bot di anteprima
compresi — e che ora passa dalla cache.

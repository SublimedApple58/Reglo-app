# Agenda web — navigazione e «Oggi»

File: `components/pages/Autoscuole/AutoscuoleAgendaPage.tsx`.

- **Periodo**: `weekStart` (vista settimana, ancorato con `weekAnchor` al lunedì o a oggi in modalità «7 giorni da oggi») e `dayFocus` (vista giorno). Frecce ‹ › spostano di 7 giorni / 1 giorno.
- **Apertura**: al primo caricamento `scrollToNow("auto")` porta in vista l'ora attuale e, in vista settimana, la colonna di oggi. La griglia settimanale con molti istruttori è più larga dello schermo: senza lo scroll orizzontale, aprendo di giovedì si vedeva lunedì. La colonna si trova con `[data-agenda-day-header="YYYY-MM-DD"]` dentro `[data-agenda-header-wrap]`.
- **«Oggi»** (`renderTodayButton`, `data-testid="agenda-today"`): pulsante grigio chiaro sempre al suo posto, attenuato e disabilitato quando oggi è nel periodo a schermo (`todayVisible`, calcolato sull'intera settimana anche se dei giorni sono nascosti). Da tablet in su sta dopo il segmentato Settimana/Giorno, alto come il segmentato; su telefono chiude la riga della data (la riga strumenti è già piena). Al clic `goToToday` riporta settimana/giorno a oggi e, a griglia renderizzata, `scrollToNow("smooth")`.

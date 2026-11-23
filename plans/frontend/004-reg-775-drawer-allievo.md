# REG-775 — Redesign della pagina Riepilogo del drawer allievo (web)

## Cosa è stato fatto
- Scelta la **proposta B** (pagina piatta con separatori grigi). Il Riepilogo del drawer
  autoscuole e quello del consorzio usano gli stessi primitivi:
  `components/pages/Autoscuole/student-detail-sheet.tsx` (documentati in
  `docs/design-system.md` §4c).
- Testata compatta a sinistra: avatar 64 con bottone fotocamera, nome, una riga di
  testo con lo stato (niente pillole), WhatsApp allineato al nome, schede.
- Ogni azione è una riga (› apre il dialog di prima, l'interruttore salva subito come
  prima) o un `Button`. Niente pillole, link sottolineati sparsi o colori d'accento.
- `NextExamCard` bianca (via il viola, «tra N giorni» in grigio), `StudentMediaSection`
  diventata «Documenti» (firma + foto da scaricare), `StudentLocationsPicker` a righe,
  `StudentWhatsAppButton` in stile clay con `align="start"`, `SegmentedPill size="sm"`.
- Funzioni invariate: stesse server action, stessi dialog, stessi `data-testid` dei
  luoghi. Test e2e aggiornati da «Anagrafica» a «Contatti e accesso».

## Decisioni di Tiziano (23/11)
1. Proposta B.
2. Tolta la riga «Nome» dai contatti (il nome è nella testata).
3. Lo scarico della foto va in «Documenti».
4. Allineato anche il drawer del Consorzio, senza perdere nulla (inventario sotto).
5. Correzioni su B: «Aggiungi il numero» allineato al margine; «tra 11 giorni» non più viola.

## Struttura (autoscuole)
1. Esame di guida prenotato (card bianca, «Apri in agenda»).
2. Percorso: ore d'obbligo + barra; Patente › (correggi), Fase › (cambia fase),
   Licenza quiz (fase In attesa), Esame teorico › (fase Teoria), Pronto per l'esame
   (interruttore, fase Pratica); «Avvia un nuovo percorso».
3. Guide: 4 numeri (modalità manuale), Da pagare, Tipi completati.
4. Prenotazioni: Prenota dall'app (interruttore = blocco; motivo e scadenza nel
   sottotitolo), Esente dal limite settimanale, Priorità esame (Auto/Sì/No),
   Guide di gruppo, Istruttore (Select).
5. Crediti (se attivi): saldo, campo + Assegna/Storna, cronologia (8).
6. Luoghi (spunta + principale) oppure Luogo di default (Select).
7. Contatti e accesso: Email, Telefono (modifica sul posto), Accesso all'app.
8. Documenti: Firma e Foto profilo, «Scarica» Originale/Portale.
9. Percorsi conclusi: righe con categoria, data, numero patente, guide › Vedi guide.
Vista ridotta (affiliato): solo Percorso (Patente, Fase) e Contatti, come prima.

## Inventario del drawer Consorzio (prima → dopo)
| Prima | Dopo |
|---|---|
| X chiudi, avatar 96, nome | X clay, avatar 64, nome |
| Recapito sotto il nome (email, telefono o «Nessun recapito») | Email e telefono in Contatti; «Nessun recapito» in testata se mancano entrambi |
| Pillole autoscuola, categoria, fase | Riga di testo «Autoscuola · C · In pratica» |
| WhatsApp (benvenuto / aggiungi numero) | Uguale, allineato a sinistra |
| Schede Riepilogo / Guide / Costi | Uguali (stile nuovo della sottolineatura) |
| Anagrafica: Nome | Tolto (sta nella testata) |
| Email | Contatti › Email |
| Telefono con Modifica/Aggiungi, Salva/Annulla, Invio/Esc | Contatti › riga Telefono, stesso comportamento |
| Autoscuola (nome · città) | Contatti › Autoscuola |
| Percorso patente + «In corso» + Modifica + Avvia nuovo percorso | Percorso › Patente (sottotitolo «Percorso in corso») + «Avvia un nuovo percorso» |
| Fase percorso + Modifica | Percorso › Fase |
| Accesso all'app Attivo/Non attivo | Contatti › Accesso all'app |
| Percorsi chiusi (categoria, cambio, data, numero patente, Vedi guide) | Percorsi conclusi, stesse informazioni e stesso «Vedi guide» |
| Codici contabili: elenco, rimuovi, «Aggiungi codice»/«Chiudi», scelta dall'elenco, vuoto | Stesso, a righe: «Aggiungi» per codice, «Assegnato» per quelli già presenti |
| Attività col consorzio: guide superiori, ore certificate, da certificare | Stessi tre numeri |
| Dialog patente, nuovo percorso, fase, esito esame | Invariati |
Le schede Guide e Costi non cambiano in questo task.

## Note
- A 390px la pagina scuola del Consorzio (dietro il drawer) è larga 684px già oggi:
  non dipende dal drawer, che è largo 390 e sta a filo.

Anteprime e catture: /tmp/hiro-anteprime/reg-775/ (oggi/, proposta-*, finale/).

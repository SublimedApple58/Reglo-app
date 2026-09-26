# REG-429 — decisioni prese di notte (26/09/2026)

Lavorando in autonomia sulla vista ridotta ho incontrato dei punti che il
prototipo non copre o che copre in un modo che sull'app vera non regge. Qui c'è
cosa ho scelto e **perché**, così si rivede in un colpo solo. Ognuna è
reversibile con una riga.

---

## Impostazioni

**1. "Sede e luoghi" è diventata una sezione bloccata.**
Nel prototipo appare aperta. Ma ogni action di `autoscuola-locations.actions.ts`
passa da `requireServiceAccess`: lasciandola aperta la consorziata trovava una
pagina vuota con un bottone "Aggiungi luogo" che non fa niente. Ora ha la sua
card. Restano aperte solo le **Informazioni aziendali** (leggono company e
profilo, che non sono gated).
→ Se si vuole tenerla aperta davvero, serve una action affiliata per i luoghi.

**2. Pagellino, Istruttori e Aspetto hanno la card generica.**
Il prototipo non ha una card per queste tre (di "Istruttori" mostra addirittura
la lista piena, che una scuola senza Reglo non può avere). Invece di inventare
un'anteprima ho usato la forma già approvata per le voci del menu: lucchetto,
"Funzione extra di Reglo", titolo, descrizione, i due CTA. Le quattro card con
anteprima — Prenotazioni e allievi, Policy tipi guida, Promemoria e notifiche,
Veicoli — sono invece copiate dal prototipo parola per parola.

**3. Dietro la card c'è uno scheletro sfocato, non la pane vera.**
Nel prototipo si intravede il contenuto reale sfocato. Da noi montare la pane
vera significherebbe chiamare le action chiuse (e prendersi gli errori che
stiamo togliendo). Lo scheletro sfocato dà la stessa lettura — "qui sotto c'è
qualcosa, è bloccato" — senza toccare il server.

**4. `SERVICE_NOT_ACTIVE` non fa più toast, per nessuno.**
La correzione sta in `useFeedbackToast` e vale per tutta l'app, non solo per la
vista ridotta: quel codice è una guardia, non un guasto, e in faccia all'utente
non ci deve andare mai. Finisce in `console.debug`. Le chiamate restano
comunque evitate a monte (flag `affiliate` / `affiliateReduced`): questa è la
rete, non il pavimento.

---

## Allievi

**5. La scheda allievo si ferma all'anagrafica.**
Tab "Riepilogo" soltanto: niente Quiz, Guide, Note. Dentro, telefono
modificabile (c'è l'action affiliata), patente e fase in sola lettura — sono
dati che il consorzio gestisce.

**6. La ricerca allievi è lato client.**
`listAffiliateStudents` restituisce l'elenco intero: sono poche anagrafiche e
un giro in più al server per filtrare non si giustifica.

**7. La colonna "Guide" mostra le guide fatte col consorzio, senza obbligo.**
L'obbligo delle 6 guide è una regola dell'autoscuola con Reglo attivo: qui
`requiredLessons` è 0 e la colonna dice "Guide col consorzio".

---

## Agenda (Fase 7)

> **Aggiornamento 26/09 (dopo la revisione di Tiziano).** I punti 9, 10 e 11 qui
> sotto nascevano da una griglia riscritta a mano, che è stata **bocciata**.
> Ora l'agenda in scope Consorzio è il componente vero (`AgendaSource`), quindi
> colonne, fascia oraria, densità e comportamento sono quelli dell'agenda di
> sempre: non sono più decisioni mie. Resta valido il punto 8.

**8. Gli slot occupati si vedono sempre, non solo col dialogo aperto.**
Nel prototipo i blocchi grigi "OCCUPATO" compaiono quando si apre la richiesta.
Mi sembra sbagliato: la scuola apre l'agenda proprio per capire quando il
consorzio è libero, e doverlo scoprire aprendo un dialogo è un passaggio in
più. Non espone niente di nuovo — sono gli stessi dati, sempre senza nomi.

**9. Le colonne sono gli istruttori del consorzio, come nel prototipo.**
~~Decisione mia~~ → ora è semplicemente come funziona l'agenda. I nomi propri
restano (sono le persone che faranno guidare i suoi allievi); quello che
sparisce è **chi c'è dentro** ogni slot occupato, che è la lettura che do a
"slot occupati senza nomi".

**10. Una richiesta ancora in attesa si disegna nella prima colonna del giorno.**
Finché il consorzio non accetta, l'istruttore non esiste. Metterla altrove
significherebbe inventarlo.

**11. ~~Fascia oraria fissa 07:00–21:00.~~ Superata.**
La vista ridotta ha la stessa toolbar dell'agenda vera, pannello
"Visualizzazione" compreso: la fascia oraria si configura come sempre.

**12. Annullare una richiesta cancella la notifica in campanella del consorzio.**
La richiesta non c'è più: lasciare lì una riga da gestire sarebbe solo lavoro
inutile per il consorzio. (Accettata o rifiutata invece resta, con l'esito.)

**13. Il "+ Nuovo allievo" dentro il dialogo è una mia aggiunta.**
Nel prototipo il dialogo ha solo "Cerca allievo…". Tiziano ha però deciso che
l'allievo si deve poter creare al volo dalla richiesta, e questo è il posto in
cui serve.

---

## Giro di correzioni del 26/09

**14. L'anteprima sfocata dell'agenda è finta, ma la griglia è vera.**
Dati statici in `demo-agenda.ts` (nomi inventati, date relative a oggi, durate
su tutta la scala per far vedere la tavolozza). Nessuna chiamata al server e
nessun dato di altre autoscuole: un'anteprima non è un buon motivo per mostrare
roba di qualcun altro.

**15. In scope "Autoscuola" il segmented resta sopra la sfocatura.**
La toolbar sfocata è inerte; senza un controllo nitido da quella vista non si
tornerebbe più a "Consorzio". È l'unica cosa che sta sopra il velo.

**16. Anche il percorso patente è modificabile dalla vista ridotta.**
Tiziano aveva chiesto di valutare. L'ho fatto: la scuola sceglie già categoria
e cambio quando crea l'anagrafica, e non poterli correggere dopo lasciava un
vicolo cieco su un errore di battitura. Stesso dialogo, stessa guardia.

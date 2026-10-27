# Plan: via il blu dall'app istruttore, stile Road (piano B)

Stato: PIANO, in attesa di approvazione. Anteprime in /tmp/hiro-anteprime/reg-638/stile/.

## Inventario (reglo-mobile, 27/10)
- `#1A1A2E` (navy, `colors.primary`): 131 file, 671 occorrenze. Scala `navy[...]`: 16 file.
- `GradientCTABackground` (CTA a gradiente navy): 54 file, 120 usi.
- Blu/indaco sparsi: `#4F46E5` (8 file), `#6366F1` (5), `#3B82F6` (4), `#E0E7FF` (5), `#2563EB` (2), anello progresso `#3A3A63→#16162A`.
- Logo: `RegloLogo` (SVG, JS), `reglo-mark-navy.png`; nativi: `icon.png`, `adaptive-icon.png`, `reglo-splash.png` (tutti navy).

## Come sostituisco
- **Token, non file per file**: `colors.primary` → `#111111`; scala `navy` → scala neutra (50 `#F4F4F4`, 100 `#EBEBEB`, 200 `#D9D9D9`, 300 `#B0B0B0`, 400 `#6A6A6A`, 500 `#111111`…). Così cambia il 90% senza toccare le schermate.
- **CTA**: `GradientCTABackground` → nero pieno `#111111` con ombra leggera (come Road); il componente resta, cambia dentro.
- **Accenti blu/indaco** (link, chip, icone di stato) → nero per testo/azioni, grigi caldi `#F2F2F0`/`#6A6A6A` per i fondi tenui; il giallo pagellino e i colori di stato (verde/rosso/ambra) restano.
- **Logo**: nero ovunque in app (OTA). **Icona e splash** sono nativi: vanno nella build definitiva 2.4.0, non via OTA.
- Niente `useReducedMotion`: le animazioni restano tutte.

## Allineamento allo stile Road (schermate principali istruttore)
- **Home «Oggi»**: card «In corso» bianca con ombra morbida, pallino rosso live, auto 3D nel colore del veicolo, «Entra in Road» nera; itinerario a card bianche con orari a sinistra.
- **Dettaglio guida**: anello progresso nero, card «Dettagli guida» e «Percorso Road» con icone 3D, barra «Presente / Assente / ···» nera e grigia.
- **Dettaglio allievo, agenda settimanale, fogli**: stessa grammatica (titoli 600, superfici bianche, CTA nere a pillola, X grigie).

## Fasi
1. Token + CTA + logo in app (OTA 2.4.0) — un colpo solo, verificato schermata per schermata con Maestro.
2. Ritocchi schermata per schermata dove il token non basta (accenti hardcoded).
3. Icona + splash nella build definitiva 2.4.0 (insieme al rilascio store).

# Reglo UI System v1 — Liquid Glass

## Intent
Rendere l'interfaccia **viva, premium e minimale** con un look “liquid glass”, usando animate‑ui dove utile.

## Typography
- Primary font: **Space Grotesk** (400/500/600/700)
- Usage: titoli 24–32, label 10–12 uppercase, body 13–14

## Core Surfaces
- **glass-surface**: hero / header principali
- **glass-panel**: pannelli laterali e contenitori secondari
- **glass-card**: metriche e card interattive
- **glass-chip**: badge/pillole

## Visual Rules
- Sempre **backdrop blur** + bordi chiari (bianco 40–60%)
- Ombre soft e profonde, mai dure
- Colori base: palette attuale, resa “glass” (opacity 50–70%)
- Spaziatura ampia, niente rumore visivo

## Motion (Animate‑UI)
- Hover: translateY ‑1px + shadow morbida
- Loaders: pulse/ping leggero
- Sidebar/panel: micro‑slide (nessun bounce aggressivo)

## Componenti priorità
- Home: hero + metriche + quick actions (glass)
- Workflow editor: header minimal + canvas pulito + pannelli glass

## Non‑obiettivi per ora
- Mobile UI (app React Native dedicata)


# Reglo Design System 1.0

> Identità visiva, componenti e regole per landing page, web app e app mobile.

---

## 1. Brand Identity

**Nome:** Reglo
**Tagline:** L'autoscuola del futuro.
**Font:** Inter (Google Fonts) — pesi: 400 Regular, 500 Medium, 600 Semibold, 700 Bold, 800 Extrabold
**Tono:** Professionale, moderno, amichevole. Mai corporate o freddo.

---

## 2. Colori

### Primari

| Nome           | Hex       | Uso                                      |
|----------------|-----------|------------------------------------------|
| Rosa Brand     | `#EC4899` | CTA, bottoni primari, toggle attivi, link |
| Rosa Hover     | `#DB2777` | Hover dei bottoni rosa                   |
| Giallo Accent  | `#FACC15` | Highlight, badge, label di sezione, icone check, mascotte |
| Giallo Hover   | `#EAB308` | Hover dei bottoni gialli                 |
| Giallo Scuro   | `#CA8A04` | Titoli d'impatto (es. 404)              |

### Neutri

| Nome           | Hex       | Uso                                      |
|----------------|-----------|------------------------------------------|
| Ink (nero)     | `#111111` | Titoli, testo principale                 |
| Text Secondary | `#6B7280` | Paragrafi, descrizioni, testo secondario |
| Text Muted     | `#9CA3AF` | Label piccole, caption                   |
| Slate          | `#64748B` | Testo terziario, proiezioni              |
| Border         | `#E5E7EB` | Bordi card, divisori                     |
| Border Light   | `gray-100`| Bordi sottili interni                    |
| Surface        | `#F9FAFB` | Sfondo sezioni alternate                 |
| Paper          | `#FFFFFF` | Sfondo card, sfondo principale           |
| Dark BG        | `#111111` | Sfondo sezioni scure (es. calcolatore)   |

### Regola d'Oro: 70 / 20 / 10

- **70% Neutri** — sfondi bianchi/grigi, testo nero/grigio
- **20% Rosa** — CTA, bottoni, accenti principali
- **10% Giallo** — highlight, badge, dettagli, icone

### Opacità

| Pattern              | Uso                        |
|----------------------|----------------------------|
| `white/90`           | Testo su sfondo rosa       |
| `white/70`           | Testo secondario su rosa   |
| `#ec4899/10`         | Background icone rosa      |
| `#ec4899/15`         | Background soft rosa       |
| `#facc15/15`         | Background icone gialle    |
| `#111/15`            | Bordi bottoni outline      |
| `#111/10`            | Bordi sottili              |

---

## 3. Tipografia

### Scale

| Token         | Size    | Uso                                          |
|---------------|---------|----------------------------------------------|
| `text-xs`     | 12px    | Copyright, micro-label                       |
| `text-sm`     | 14px    | Link footer, toggle label, meta info         |
| `text-base`   | 16px    | Body text, paragrafi, bottoni                |
| `text-lg`     | 18px    | Sottotitoli leggeri                          |
| `text-xl`     | 20px    | Titoli card                                  |
| `text-2xl`    | 24px    | Sottotitoli, emoji nelle card                |
| `text-3xl`    | 30px    | Titoli sezione mobile                        |
| `text-4xl`    | 36px    | Titoli sezione                               |
| `text-5xl`    | 48px    | Titoli grandi                                |
| `text-[52px]` | 52px    | Titoli sezione desktop                       |
| `text-6xl`    | 60px    | Hero heading mobile                          |
| `text-[64px]` | 64px    | Hero heading desktop                         |
| `text-[100px]`| 100px   | Display (es. "404") mobile                   |
| `text-[120px]`| 120px   | Display (es. "404") desktop                  |

### Pesi

| Peso       | Uso                                    |
|------------|----------------------------------------|
| `400`      | Body text, paragrafi                   |
| `500`      | Enfasi leggera                         |
| `600`      | Label importanti                       |
| `700`      | Titoli, bottoni, heading               |
| `800`      | Hero heading, display                  |

### Label & Badge

- Testo: `text-xs font-bold uppercase tracking-[0.2em]`
- Colore label: `text-[#facc15]` (giallo) o `text-[#9ca3af]` (grigio)
- Esempio: "CALCOLATORE PERDITE", "PARAMETRI", "RISULTATI"

### Line Height

| Token            | Uso                    |
|------------------|------------------------|
| `leading-none`   | Display text (404)     |
| `leading-tight`  | Heading                |
| `leading-[1.05]` | Hero heading           |
| `leading-relaxed`| Body text              |

---

## 4. Spaziatura

### Layout

| Token                | Valore  | Uso                          |
|----------------------|---------|------------------------------|
| `max-w-[1440px]`     | 1440px  | Container massimo pagina     |
| `max-w-[960px]`      | 960px   | Grid feature card            |
| `max-w-[900px]`      | 900px   | Card calcolatore             |
| `px-5 sm:px-8`       | 20/32px | Padding orizzontale pagina   |
| `py-20 sm:py-28`     | 80/112px| Padding verticale sezioni    |
| `pt-16 sm:pt-20`     | 64/80px | Padding top hero             |

### Gap

| Valore | Uso                           |
|--------|-------------------------------|
| `gap-3`| Bottoni inline                |
| `gap-4`| Icone social                  |
| `gap-5`| Grid card                     |
| `gap-10`| Grid 2 colonne              |
| `gap-12`| Grid con più respiro         |

---

## 5. Componenti

### Bottoni

**Primario (Rosa pill):**
```
rounded-full bg-[#ec4899] text-white px-7 py-3.5 font-bold text-base
hover:bg-[#db2777] transition-colors
```

**Primario Large:**
```
rounded-full bg-[#ec4899] text-white px-8 py-4 font-bold text-base
hover:bg-[#db2777] transition-colors
```

**Secondario (Outline pill):**
```
rounded-full border-2 border-[#111]/15 bg-white text-[#111] px-7 py-3.5 font-bold text-base
hover:border-[#111]/30 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]
```

**Giallo (es. 404):**
```
rounded-full bg-[#facc15] text-[#111] px-8 py-3.5 font-bold text-base
hover:bg-[#eab308] transition-colors
```

**Bianco su rosa (es. footer):**
```
rounded-full bg-white text-[#ec4899] px-8 py-4 font-bold text-lg
hover:bg-gray-50 transition-colors
```

**Navbar CTA:**
```
rounded-full bg-[#ec4899] text-white px-5 py-2.5 font-bold text-sm
hover:bg-[#db2777] transition-all duration-200
```

> REGOLA: Tutti i bottoni sono `rounded-full` (pill). Mai rettangolari.

### Card

**Feature Card:**
```
bg-white rounded-2xl p-8 border border-gray-100
shadow-[0_2px_12px_rgba(0,0,0,0.04)]
hover:-translate-y-1 transition-transform duration-300
```

**Calculator Card:**
```
bg-white rounded-3xl overflow-hidden
shadow-[0_32px_80px_rgba(0,0,0,0.3)]
```

**Step Card (Allievi):**
```
bg-white rounded-2xl border border-gray-200 p-6 flex flex-col
```

### Input

**Standard:**
```
w-full bg-gray-50 rounded-xl px-4 py-3.5 border border-gray-200
text-lg font-bold text-[#111] outline-none
focus:border-[#ec4899] transition-colors
```

### Toggle Switch

```
Contenitore: w-[52px] h-[28px] rounded-full
  Attivo: bg-[#ec4899]
  Inattivo: bg-gray-300

Knob: w-[22px] h-[22px] rounded-full bg-white shadow-md
  Posizione: top-[3px] left-[3px]
  Attivo: translate-x-[24px]
  Inattivo: translate-x-0
```

### Icone Badge (nelle card)

```
w-12 h-12 rounded-xl bg-[#facc15]/15 flex items-center justify-center
Icona: text-2xl (emoji native)
```

**Variante rosa:**
```
w-10 h-10 rounded-xl bg-[#ec4899]/10 flex items-center justify-center
Icona: w-5 h-5 text-[#ec4899]
```

**Variante gialla:**
```
w-10 h-10 rounded-xl bg-[#facc15]/10 flex items-center justify-center
Icona: w-5 h-5 text-[#facc15]
```

### Check Icon (liste feature)

```svg
<svg class="w-4 h-4" viewBox="0 0 20 20" fill="none">
  <circle cx="10" cy="10" r="10" fill="#facc15" fill-opacity="0.15" />
  <path d="M6 10.5L8.5 13L14 7.5" stroke="#facc15" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" />
</svg>
```

### Navigation

- Sfondo: `bg-white/95 backdrop-blur-md` (sticky top-0)
- Altezza: auto con `py-3 px-5 sm:px-8`
- Logo: icona 36x36 + testo "Reglo" `text-[28px] font-bold`
- Link: `text-[15px] font-medium text-[#111] hover:text-[#ec4899]`
- Mobile: hamburger menu con overlay `bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.1)]`
- Container: `max-w-[1440px] mx-auto`

### Footer

- Sfondo: `bg-[#ec4899]`
- Layout: `grid lg:grid-cols-[1fr_1.2fr]`
- Logo: icona bianca `h-16 w-16` + "Reglo" `text-4xl sm:text-5xl font-bold text-white`
- Testo: `text-sm text-white/90` per link, `text-xs text-white/70` per copyright
- Social: icone SVG `w-5 h-5 text-white/90 hover:text-white`
- CTA: bottone bianco su rosa

---

## 6. Sezioni & Layout

### Hero

- Sfondo: `bg-white`
- Grid: `lg:grid-cols-2` con testo a sinistra, immagine a destra
- Heading: `text-5xl sm:text-6xl lg:text-[64px] font-bold`
- Parola accent: `text-[#ec4899]` (es. "futuro.")
- Sottotitolo: `text-lg sm:text-xl text-[#6b7280]`
- Due bottoni: primario rosa + secondario outline

### Sezione Feature (sfondo chiaro)

- Sfondo: `bg-[#f9fafb]`
- Titolo: `text-4xl sm:text-[52px] font-bold`
- Parola accent nel titolo: `text-[#facc15]`
- Grid card: `sm:grid-cols-2 max-w-[960px]`
- Label sopra: `text-sm font-bold uppercase tracking-[0.2em] text-[#facc15]`

### Sezione Calcolatore (sfondo scuro)

- Sfondo: `bg-[#111]`
- Titolo: `text-white`
- Label: `text-[#facc15]`
- Card: `bg-white rounded-3xl` con grid 2 colonne
- Mascotte: posizionata `absolute right-[-60px] -bottom-24 w-[170px]`

### Sezione Come Funziona

- Sfondo: `bg-[#f9fafb]`
- Layout: blocchi alternati `lg:grid-cols-2` con immagine + testo
- Immagini: `rounded-[25px] shadow-[0_16px_48px_rgba(0,0,0,0.08)]`
- Numerazione: `<span class="text-[#6b7280]">1.</span>` prima del titolo

### Pagina 404

- Sfondo: `bg-white`, centrato verticalmente `min-h-screen flex items-center justify-center`
- "404": `text-[100px] sm:text-[120px] font-bold text-[#111]`
- Sottotitolo: `text-[#ca8a04]` (giallo scuro)
- Nessuna navbar
- Bottone giallo: `bg-[#facc15]`

---

## 7. Ombre

| Nome        | Valore                                        | Uso                    |
|-------------|-----------------------------------------------|------------------------|
| Subtle      | `0 2px 12px rgba(0,0,0,0.04)`                | Card feature           |
| Medium      | `0 16px 48px rgba(0,0,0,0.08)`               | Immagini screenshot    |
| Large       | `0 24px 64px rgba(0,0,0,0.08)`               | Dashboard hero         |
| XLarge      | `0 32px 80px rgba(0,0,0,0.3)`                | Card calcolatore       |
| Pink Glow   | `0 12px 32px rgba(236,72,153,0.3)`           | Hover bottone rosa     |
| Button Soft | `0 8px 24px rgba(0,0,0,0.08)`                | Hover bottone outline  |
| Menu        | `0 20px 60px rgba(0,0,0,0.1)`                | Menu mobile dropdown   |

---

## 8. Animazioni

### Hover

- Bottoni: `hover:-translate-y-0.5` (leggero sollevamento)
- Card: `hover:-translate-y-1` (sollevamento card)
- Transizione: `transition-all duration-200` o `transition-transform duration-300`

### Scroll Reveal

- Fade in dal basso: `.reveal-fade` con `translateY(28px)` -> `translateY(0)`
- Slide da sinistra: `.reveal-left` con `translateX(-40px)` -> `translateX(0)`
- Slide da destra: `.reveal-right` con `translateX(40px)` -> `translateX(0)`
- Stagger: classi `.stagger-1` a `.stagger-4` con delay incrementali di 0.1s

### Micro-animazioni

- Float mascot: `floatY-a 8s ease-in-out infinite`
- Shimmer bottone CTA: `shimmerSweep 3.5s ease-in-out infinite`
- FadeInUp (post-calcolo): `fadeInUp 0.6s ease-out`

---

## 9. Breakpoint Responsive

| Breakpoint | Prefisso | Uso                      |
|------------|----------|--------------------------|
| < 640px    | (base)   | Mobile                   |
| >= 640px   | `sm:`    | Mobile grande / Tablet   |
| >= 768px   | `md:`    | Tablet / Desktop piccolo |
| >= 1024px  | `lg:`    | Desktop                  |

### Pattern comuni

- Heading: `text-4xl sm:text-[52px]`
- Hero heading: `text-5xl sm:text-6xl lg:text-[64px]`
- Padding container: `px-5 sm:px-8`
- Grid: colonna singola mobile -> `lg:grid-cols-2` desktop
- Elementi nascosti mobile: `hidden lg:block` (es. mascotte, frecce tra card)

---

## 10. Asset

| File                    | Descrizione                          |
|-------------------------|--------------------------------------|
| `/favicon.svg`          | Favicon (quadrato rosa + freccia gialla) |
| `/logo-icon.svg`        | Icona logo (per sfondo chiaro)       |
| `/logo-icon-white.svg`  | Icona logo (per sfondo rosa/scuro)   |
| `/mascot.png`           | Mascotte principale (paperotto)      |
| `/mascot-calculator.png`| Mascotte con tablet                  |
| `/mascot-404.png`       | Mascotte arrabbiata con fumetto      |
| `/og-image.png`         | Immagine Open Graph (1200x630)       |
| `/dashboard-screenshot.png` | Screenshot dashboard             |
| `/app-screenshot.png`   | Screenshot app mobile                |

---

## 11. Do & Don't

### DO
- Usa `rounded-full` per tutti i bottoni (pill shape)
- Usa giallo solo come accento (10% della pagina)
- Mantieni gerarchia tipografica chiara con pesi bold
- Usa label uppercase con `tracking-[0.2em]` per etichette di sezione
- Mantieni sfondi alternati: bianco -> grigio chiaro -> nero -> grigio chiaro

### DON'T
- Non usare bottoni rettangolari (mai `rounded-lg` sui bottoni)
- Non usare il rosa come sfondo di sezioni (solo nel footer)
- Non usare font diversi da Inter
- Non mescolare troppi colori: attieniti a rosa, giallo, nero, grigio
- Non usare ombre troppo pesanti sulle card (preferisci `subtle`)

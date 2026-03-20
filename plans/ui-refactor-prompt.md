# Prompt: Refactor UI della Web App secondo il Design System Reglo

## Obiettivo

Devi rifare completamente l'aspetto grafico della web app Reglo per allinearlo al design system definito nel file `DESIGN_SYSTEM.md` nella root del progetto. Quel file e la **fonte di verita assoluta** — leggilo per intero prima di toccare qualsiasi codice.

Il design system e stato creato per l'app mobile (React Native) ma i principi, i colori, la tipografia, le ombre, i pattern e soprattutto la **filosofia delle animazioni** si applicano 1:1 alla web app. Dove il documento fa riferimento a API React Native (es. `react-native-reanimated`, `Animated`), tu devi tradurre in equivalenti web usando **Framer Motion** (`motion` v12, gia installato) e **Tailwind CSS** (`tailwindcss-animate` gia installato).

---

## Stack attuale della web app

- **Next.js 15** (App Router, RSC) + **React 19**
- **Tailwind CSS 4** con CSS variables in `assets/styles/globals.css`
- **shadcn/ui** (Radix primitives) — componenti in `components/ui/`
- **Framer Motion** (`motion` v12.15) — gia installato, componenti animati in `components/animate-ui/`
- **Lucide React** + **Tabler Icons** per iconografia
- **Jotai** per state management (atoms)
- **react-hook-form** + **zod** per form
- **next-intl** per i18n
- **Vaul** per drawer

---

## Fase 1 — Tema e CSS Variables

Il tema attuale (`globals.css`) usa colori blu/teal (`#324e7a` primary, `#afe2d4` secondary). **Devi sostituirlo** con la palette del design system.

### Mapping CSS Variables da applicare in `:root`

```css
:root {
  /* Brand */
  --primary: #EC4899;           /* Rosa — era #324e7a */
  --primary-foreground: #FFFFFF;
  --accent: #FACC15;            /* Giallo */
  --accent-foreground: #92400E;
  --destructive: #EF4444;
  --destructive-foreground: #FFFFFF;
  --positive: #22C55E;          /* NUOVO — aggiungi */
  --positive-foreground: #FFFFFF;

  /* Superfici */
  --background: #FFFFFF;        /* era #f5f8fb */
  --foreground: #1F2937;        /* era #324e7a */
  --card: #FFFFFF;
  --card-foreground: #1F2937;
  --popover: #FFFFFF;
  --popover-foreground: #1F2937;

  /* Neutri */
  --secondary: #F8FAFC;
  --secondary-foreground: #1F2937;
  --muted: #F8FAFC;
  --muted-foreground: #6B7280;
  --border: #E5E7EB;
  --input: #E2E8F0;
  --ring: #EC4899;              /* Focus ring = primary */

  /* Sidebar — adatta al nuovo tema */
  --sidebar: #FFFFFF;
  --sidebar-foreground: #1F2937;
  --sidebar-primary: #EC4899;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #FDF2F8;    /* pink-50 */
  --sidebar-accent-foreground: #1F2937;
  --sidebar-border: #E5E7EB;
  --sidebar-ring: #EC4899;

  /* Radii — allinea al design system */
  --radius: 1.25rem;            /* 20px = radii.sm del DS */

  /* Motion — custom properties per animazioni */
  --motion-micro: 100ms;
  --motion-fast: 160ms;
  --motion-base: 220ms;
  --motion-emphasis: 350ms;
  --motion-dramatic: 500ms;

  /* Scale colori dirette */
  --pink-50: #FDF2F8;
  --pink-100: #FCE7F3;
  --pink-200: #FBCFE8;
  --pink-500: #EC4899;
  --pink-600: #DB2777;
  --pink-700: #BE185D;
  --yellow-50: #FEFCE8;
  --yellow-100: #FEF9C3;
  --yellow-200: #FEF08A;
  --yellow-400: #FACC15;
  --yellow-600: #CA8A04;
  --yellow-700: #A16207;
}
```

Aggiungi anche le variabili in `tailwind.config.ts` → `theme.extend.colors` per poterle usare come classi (`bg-positive`, `text-yellow-400`, ecc.).

**Regola 70/20/10**: 70% neutri (bianco, grigi, testo scuro), 20% rosa (CTA, interazioni, focus), 10% giallo (highlight, selezioni, info card).

---

## Fase 2 — Typography

Il design system definisce 4 token tipografici. Mappali come classi Tailwind custom o utility:

| Token DS | Web equivalent | Tailwind class suggerita |
|---|---|---|
| `title` (28px, 700, -0.3 tracking) | Titoli pagina, h1 | `text-[28px] font-bold tracking-tight` |
| `subtitle` (18px, 600) | Titoli sezione, h2, card title | `text-lg font-semibold` |
| `body` (15px, 500) | Testo corrente, label | `text-[15px] font-medium` |
| `caption` (12px, 600, 0.4 tracking) | Badge, metadata, label piccole | `text-xs font-semibold tracking-wide` |

Puoi definirli come componenti di utilita o classi `@apply` in globals.css.

---

## Fase 3 — Componenti shadcn/ui

Aggiorna i componenti in `components/ui/` per riflettere il design system. **Non eliminare i componenti**, adatta lo stile:

### Button (`button.tsx`)
- Toni: `primary` (bg rosa, testo bianco), `standard` (bg bianco, bordo grigio), `danger` (bg bianco, bordo rosso, testo rosso), `secondary` (bg bianco, bordo giallo, testo ambra `#A16207`)
- `border-radius: var(--radius)` (20px)
- `min-height: 48px`
- **Animazione OBBLIGATORIA**: press `scale(0.97)` con spring via Framer Motion. Non usare solo `:active` CSS.

### Card (`card.tsx`)
- 3 gerarchie: `primary` (border-radius 35px, ombra pronunciata), `secondary` (16px, ombra media), `tertiary` (16px, ombra leggera)
- Variant `dark`: bg `#1F2937`, testo bianco
- Bordo `1px solid var(--border)`

### Badge (`badge.tsx`)
- 4 toni: `default` (rosa), `success` (verde), `warning` (giallo), `danger` (rosso)
- Sempre pill: `border-radius: 9999px`
- Testo uppercase, `font-size: 12px`, `font-weight: 600`

### Input (`input.tsx`)
- Border-radius 20px
- Default: `bg-[#F8FAFC]`, `border-[#E2E8F0]`
- Focus: `border-primary`, `bg-white`
- **Animazione**: transizione colore bordo `var(--motion-fast)`

### Toast / Feedback Toast
- 3 toni: `success` (#22C55E), `info` (#1E293B), `danger` (#EF4444)
- Border-radius 20px, ombra colorata per tono
- **Animazione OBBLIGATORIA**: entrata spring dall'alto (translateY -30→0 + scale 0.92→1), uscita fade-up 250ms

### Dialog / Modal
- Border-radius 24px
- Backdrop `rgba(0, 0, 0, 0.35)`
- **Animazione OBBLIGATORIA**: entrata `scale(0.92)→1` spring + `opacity 0→1`. Uscita: `scale(1)→0.95` + fade 150ms.

### Sheet / Drawer (Vaul)
- Top radius 24px
- **Animazione OBBLIGATORIA**: slide-up spring (damping 22, stiffness 240 equivalent → `cubic-bezier(0.22, 1, 0.36, 1)` ~350ms)

### Skeleton
- Colore: `rgba(0, 0, 0, 0.06)`
- Pulse: opacita 0.42 ↔ 0.9, ciclo 760ms ciascuna direzione, easing `ease-in-out`
- Border-radius: 10px default, 35px per skeleton card

### Sidebar (`sidebar.tsx`)
- Accent hover: `--pink-50` (#FDF2F8)
- Active item: testo rosa, bg pink-50
- Icone: colore `--muted-foreground`, attivo `--primary`

---

## Fase 4 — Animazioni (CRITICA)

**Questa e la fase piu importante.** Leggi la sezione 8 del `DESIGN_SYSTEM.md` per intero — contiene la filosofia, le curve, i pattern obbligatori.

### Principio fondamentale
> L'assenza di animazione e un bug visivo. Ogni transizione di stato, ogni interazione, ogni cambiamento di contenuto deve avere un'animazione.

### Libreria: Framer Motion (`motion`)

Gia installata come `motion` v12. Usala per:
- Entrata/uscita componenti (`motion.div` con `initial`/`animate`/`exit`)
- Press feedback (`whileTap`)
- Hover (`whileHover`)
- Layout animations (`layout` prop)
- `AnimatePresence` per mount/unmount
- Stagger con `staggerChildren`

### Curve di easing — Web equivalents

| Nome DS | Framer Motion | CSS fallback |
|---|---|---|
| **Snappy** | `{ type: "spring", damping: 20, stiffness: 300 }` | `cubic-bezier(0.34, 1.56, 0.64, 1)` 200ms |
| **Bouncy** | `{ type: "spring", damping: 12, stiffness: 200 }` | `cubic-bezier(0.34, 1.56, 0.64, 1)` 350ms |
| **Gentle** | `{ type: "spring", damping: 22, stiffness: 240 }` | `cubic-bezier(0.22, 1, 0.36, 1)` 350ms |
| **Swift** | `{ duration: 0.2, ease: [0.33, 1, 0.68, 1] }` | `cubic-bezier(0.33, 1, 0.68, 1)` 200ms |
| **Slow reveal** | `{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }` | `ease` 400ms |

### Pattern OBBLIGATORI da implementare

#### 1. Press Feedback su OGNI bottone/card/elemento cliccabile

```tsx
<motion.button
  whileTap={{ scale: 0.97 }}
  transition={{ type: "spring", damping: 20, stiffness: 300 }}
>
```

Nessun elemento cliccabile deve avere solo un cambio colore al click. Deve "affondare" visivamente.

#### 2. Hover su card e elementi interattivi

```tsx
<motion.div
  whileHover={{ y: -2, boxShadow: "0 8px 25px rgba(0,0,0,0.08)" }}
  transition={{ type: "spring", damping: 20, stiffness: 300 }}
>
```

#### 3. Stagger su OGNI lista

Ogni lista di card, righe tabella, item griglia deve avere entrata staggerata:

```tsx
const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06 }
  }
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", damping: 20, stiffness: 260 }
  }
};

<motion.div variants={container} initial="hidden" animate="show">
  {items.map(i => <motion.div key={i.id} variants={item} />)}
</motion.div>
```

**Max stagger**: cap a ~8 item (480ms totali). Oltre, tutti insieme.

#### 4. Page transitions

Wrappa le pagine con `AnimatePresence` e `motion.div`:

```tsx
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -8 }}
  transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
>
```

#### 5. Skeleton → Contenuto

Quando i dati arrivano e lo skeleton viene sostituito, il contenuto reale deve entrare con fade + leggero scale:

```tsx
<AnimatePresence mode="wait">
  {loading ? (
    <motion.div key="skeleton" exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
      <Skeleton />
    </motion.div>
  ) : (
    <motion.div
      key="content"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      {content}
    </motion.div>
  )}
</AnimatePresence>
```

#### 6. Counter / Number change

Numeri che cambiano (contatori, importi, badge count) devono fare un micro-bounce:

```tsx
<motion.span
  key={value}
  initial={{ scale: 0.85, opacity: 0 }}
  animate={{ scale: 1, opacity: 1 }}
  transition={{ type: "spring", damping: 12, stiffness: 200 }}
>
  {value}
</motion.span>
```

Oppure usa il componente `sliding-number.tsx` gia presente in `components/animate-ui/text/`.

#### 7. Dialog/Modal entrata

```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.92 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.95 }}
  transition={{ type: "spring", damping: 22, stiffness: 260 }}
/>
```

#### 8. Toast entrata

```tsx
<motion.div
  initial={{ opacity: 0, y: -30, scale: 0.92 }}
  animate={{ opacity: 1, y: 0, scale: 1 }}
  exit={{ opacity: 0, y: -20, scale: 0.95 }}
  transition={{
    type: "spring",
    damping: 18,
    stiffness: 300,
    opacity: { duration: 0.2 }
  }}
/>
```

#### 9. Sidebar link hover/active

```tsx
// Hover: bg transition to pink-50
// Active: indicator bar animata (height o width) con spring
<motion.div layoutId="sidebar-active-indicator" />
```

Usa `layoutId` di Framer Motion per il magic move dell'indicatore attivo nella sidebar.

#### 10. Tab switch

```tsx
// Indicatore attivo sotto il tab: layout animation
<motion.div layoutId="tab-indicator" className="..." />
// Contenuto: cross-fade
<AnimatePresence mode="wait">
  <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
</AnimatePresence>
```

#### 11. Shake per errore form

```tsx
const shakeVariants = {
  shake: {
    x: [0, -8, 8, -6, 6, 0],
    transition: { duration: 0.3 }
  }
};
```

#### 12. Celebrazione / Successo

Per azioni importanti (pagamento completato, documento approvato):
- Confetti burst (particelle rosa + giallo + verde)
- O checkmark animato con ring expansion
- Ispirato al `BookingCelebration` del design system mobile

### Animazioni CSS per micro-interazioni semplici

Per casi dove Framer Motion sarebbe overkill (hover link, focus input), usa Tailwind:

```
transition-colors duration-[var(--motion-fast)]
transition-all duration-[var(--motion-base)]
hover:shadow-md hover:-translate-y-0.5 transition-all duration-200
```

---

## Fase 5 — Ombre

Definisci utility shadow custom in Tailwind o come classi:

| Nome | Valore | Uso |
|---|---|---|
| `shadow-card` | `0 2px 8px rgba(0,0,0,0.08)` | Card default |
| `shadow-card-primary` | `0 4px 12px rgba(0,0,0,0.12)` | Card primary |
| `shadow-cta` | `0 6px 12px rgba(236,72,153,0.3)` | Bottone hero rosa |
| `shadow-accent` | `0 10px 20px rgba(180,83,9,0.35)` | Card gradient giallo |
| `shadow-dropdown` | `0 8px 16px rgba(0,0,0,0.1)` | Popover, select dropdown |
| `shadow-drawer` | `0 -6px 18px rgba(0,0,0,0.12)` | Sheet / drawer |
| `shadow-toast-success` | `0 8px 16px rgba(22,163,74,0.3)` | Toast success |
| `shadow-toast-danger` | `0 8px 16px rgba(220,38,38,0.3)` | Toast danger |
| `shadow-toast-info` | `0 8px 16px rgba(15,23,42,0.3)` | Toast info |

---

## Fase 6 — Pattern UI specifici

### Card "Next Lesson" / Card Accent (Gradient Giallo)

```tsx
<div className="relative">
  {/* Wrapper ombra */}
  <div className="shadow-accent rounded-[35px]">
    <div className="bg-gradient-to-br from-yellow-400 to-yellow-200 rounded-[35px] overflow-hidden p-6">
      {/* Contenuto con testo scuro */}
    </div>
  </div>
</div>
```

### CTA Hero

```tsx
<motion.button
  className="bg-primary text-white min-h-[58px] text-lg font-bold rounded-[var(--radius)] shadow-cta w-full"
  whileTap={{ scale: 0.96 }}
  whileHover={{ scale: 1.01 }}
  transition={{ type: "spring", damping: 20, stiffness: 280 }}
>
```

### Empty State → Contenuto

Sempre con `AnimatePresence mode="wait"` e cross-fade. Mai apparizione istantanea.

---

## Fase 7 — Checklist per ogni componente/pagina

Prima di considerare finito un componente:

- [ ] Colori allineati al design system (niente blu/teal residuo)
- [ ] Border-radius corretti (20px base, 35px card primary, 9999px pill)
- [ ] Ombre dalla tabella del design system
- [ ] Press feedback (`whileTap`) su ogni elemento cliccabile
- [ ] Hover state su card e bottoni
- [ ] Entrata animata (fade + slide o stagger per liste)
- [ ] Skeleton con transizione a contenuto
- [ ] Focus ring rosa (`ring-primary`)
- [ ] Typography dai 4 token (title/subtitle/body/caption)
- [ ] Regola 70/20/10 rispettata
- [ ] Nessun colore hardcodato non presente nel design system

---

## Ordine di lavoro suggerito

1. **`globals.css`** — Sostituisci tutte le CSS variables
2. **`tailwind.config.ts`** — Aggiungi colori custom, shadow custom, radius
3. **`components/ui/button.tsx`** — Toni + animazione press
4. **`components/ui/card.tsx`** — 3 gerarchie + variant dark
5. **`components/ui/badge.tsx`** — 4 toni
6. **`components/ui/input.tsx`** — Focus animato
7. **`components/ui/dialog.tsx`** — Entrata/uscita animata
8. **`components/ui/toast.tsx` + `feedback-toast.ts`** — 3 toni + animazioni
9. **`components/ui/skeleton.tsx`** — Pulse allineato
10. **`components/ui/sheet.tsx` + `drawer.tsx`** — Animazioni drawer
11. **`components/Layout/AppSidebar.tsx`** — Tema rosa, active indicator animato
12. **`components/ui/sidebar.tsx`** — Hover/active states
13. **Pagine** — Una per una, partendo dalla home/dashboard, applicando stagger e page transitions
14. **Revisione finale** — Grep per colori residui (#324e7a, #afe2d4, ecc.) e sostituisci

---

## Riferimenti

- **Fonte di verita**: `DESIGN_SYSTEM.md` nella root del progetto — leggilo per intero
- **Sezione animazioni**: Sezione 8 del design system — e la piu lunga e dettagliata, seguila alla lettera
- **Componenti animate-ui esistenti**: `components/animate-ui/` — estendili, non duplicarli
- **Framer Motion docs**: motion.dev (v12)

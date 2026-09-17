# Reglo Web — Design System Reference

> Fonte di verita per ogni lavoro UI nella web app.
> Leggi questo documento **prima** di scrivere qualsiasi codice UI.

---

## 1. Stack UI

- **Radix UI** — headless primitives (Dialog, DropdownMenu, Select, AlertDialog, etc.)
- **Tailwind CSS 4** — utility-first styling via CSS variables
- **CVA (Class Variance Authority)** — component variant management
- **shadcn/ui** pattern — components in `components/ui/`, composed from Radix + Tailwind
- **Icons:** `@tabler/icons-react` + `lucide-react`
- **Fonts:** `Geist Sans` (--font-geist-sans) + `Geist Mono` (--font-geist-mono)

---

## 2. Palette — bianco/nero (2026-09)

> **Attenzione:** questa sezione fino al 2026-09-17 descriveva ancora il rosa
> `#EC4899` della prima versione, rimosso dal codice col redesign Airbnb di
> luglio (che aveva introdotto il navy `#1a1a2e`). Ora l'accento è **nero
> neutro**. Il mobile NON è allineato: vedi §10.

### Regola

Superfici neutre (bianco → grigi), **accento nero**, colore riservato a ciò che
porta informazione: verde/rosso/giallo per gli stati, e le palette **categoriche**
(colonne istruttore in agenda, blocchi guida per durata e per patente, avatar).
Quelle non vanno mai neutralizzate: il colore lì *è* il dato.

### CSS Variables (`assets/styles/globals.css` → `:root`)

**Brand:**
| Variable | Hex | Uso |
|----------|-----|-----|
| `--primary` | `#111111` | CTA, tab attivo, FAB, focus ring, chart-1 |
| `--accent` | `#f7f7f7` | Superficie tenue, hover di riga |
| `--destructive` | `#c13515` | Errori, azioni distruttive |
| `--positive` | `#22C55E` | Successo, conferme |

Nero pieno `#000000` no: `#111111` lascia spazio a un hover **più chiaro**
(`#2b2b2b`) senza sembrare spento, e resta distinto dal testo `#222222`.

**Superfici:**
| Variable | Hex |
|----------|-----|
| `--background` | `#FFFFFF` |
| `--foreground` | `#222222` |
| `--card` | `#FFFFFF` |
| `--secondary` | `#f7f7f7` |
| `--muted` | `#f7f7f7` |
| `--muted-foreground` | `#6a6a6a` |
| `--border` | `#dddddd` |
| `--input` | `#dddddd` |
| `--ring` | `#222222` |

**Scala accento** (nome `navy-*` storico, valori neutri — rinominarla in `ink-*`
è un refactor a parte):
| Variable | Hex | Tailwind class | Uso |
|----------|-----|---------------|-----|
| `--navy-900` | `#111111` | `bg-navy-900` | CTA, testo enfatico |
| `--navy-800` | `#2b2b2b` | `bg-navy-800` | Hover della CTA |
| `--navy-700` | `#333333` | `bg-navy-700` | Toni medi |
| `--navy-100` | `#e3e3e3` | `bg-navy-100` | Bordi tenui |
| `--navy-50` | `#f0f0f0` | `bg-navy-50` | Superfici chiare, chip |

**Giallo** (`--yellow-*`) resta per gli highlight informativi. La scala
`--pink-*` è ancora definita ma **non più usata dal codice**.

---

## 3. Typography

CSS utility classes definite in `globals.css`:

| Class | fontSize | fontWeight | letterSpacing | Uso |
|-------|----------|------------|---------------|-----|
| `.ds-title` | 28px | 700 | -0.3px | Titoli pagina |
| `.ds-subtitle` | 18px | 600 | — | Titoli sezione, card header |
| `.ds-body` | 15px | 500 | — | Testo corrente |
| `.ds-caption` | 12px | 600 | 0.4px | Badge, label piccole |

**Card title hierarchy:**
| Class | fontSize | lineHeight | fontWeight |
|-------|----------|------------|------------|
| `.ds-card-title-primary` | 30px | 34px | 700 |
| `.ds-card-title-secondary` | 22px | 27px | 700 |
| `.ds-card-title-tertiary` | 18px | 23px | 600 |

**Section header hierarchy:**
| Class | fontSize | lineHeight | fontWeight |
|-------|----------|------------|------------|
| `.ds-section-primary` | 22px | 27px | 700 |
| `.ds-section-secondary` | 19px | 24px | 700 |
| `.ds-section-tertiary` | 17px | 22px | 600 |

---

## 4. Border Radius

Definiti via `--radius: 1.25rem` (20px) in `:root`:

| Token | Valore | Tailwind class | Uso |
|-------|--------|---------------|-----|
| `--radius` | 20px | `rounded-lg` | Controlli standard |
| `calc(--radius - 2px)` | 18px | `rounded-md` | Elementi medi |
| `calc(--radius - 4px)` | 16px | `rounded-sm` | Elementi piccoli |
| `9999px` | pill | `rounded-pill` | Badge, chip |
| `35px` | card primary | `rounded-card-primary` | Card principali grandi |

---

## 5. Ombre

Definite in `tailwind.config.ts` e come CSS variables:

| Token | Valore | Tailwind class | Uso |
|-------|--------|---------------|-----|
| `shadow-card` | `0 2px 8px rgba(0,0,0,0.08)` | `shadow-card` | Card default |
| `shadow-card-primary` | `0 4px 12px rgba(0,0,0,0.12)` | `shadow-card-primary` | Card primary |
| `shadow-cta` | `0 6px 12px rgba(17,17,17,0.18)` | `shadow-cta` | CTA nera |
| `shadow-accent` | `0 10px 20px rgba(17,17,17,0.18)` | `shadow-accent` | Card in evidenza |
| `shadow-dropdown` | `0 8px 16px rgba(0,0,0,0.1)` | `shadow-dropdown` | Menu dropdown |
| `shadow-drawer` | `0 -6px 18px rgba(0,0,0,0.12)` | `shadow-drawer` | Sheet/drawer |
| `shadow-toast-*` | Vari per tone | `shadow-toast-success/danger/info` | Toast feedback |

---

## 6. Motion

CSS variables per animazioni in `globals.css`:

| Variable | Durata | Uso |
|----------|--------|-----|
| `--motion-micro` | 100ms | Press, color change |
| `--motion-fast` | 160ms | Fade, toggle |
| `--motion-base` | 220ms | Standard transition |
| `--motion-emphasis` | 350ms | Entrata contenuto |
| `--motion-dramatic` | 500ms | Prima apparizione |

**Utility classes:**
- `.reglo-interactive` — `transition: all var(--motion-base) ease-out`
- `.reglo-hover-lift` — hover: `translateY(-2px)` + `box-shadow: 0 8px 25px rgba(0,0,0,0.08)`
- `.reglo-focus-ring` — `focus-visible:ring-2 ring-primary/45`
- `.reglo-divider` — gradient divider da `transparent` via `border/70`

**Easing:** `cubic-bezier(0.33, 1, 0.68, 1)` (ease-out standard per tutte le transizioni)

**Regola web:** animare solo `transform` e `opacity` per GPU compositing. Mai `width`, `height`, `padding`, `margin`.

---

## 7. Componenti (`components/ui/`)

45 file, pattern shadcn/ui. Principali:

| Componente | File | Pattern |
|-----------|------|---------|
| Button | `button.tsx` | CVA variants: default, destructive, outline, secondary, ghost, link |
| Card | `card.tsx` | Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter |
| Dialog | `dialog.tsx` | Radix Dialog with overlay |
| Sheet | `sheet.tsx` | Side panel (drawer) |
| Drawer | `drawer.tsx` | Bottom drawer (vaul) |
| Select | `select.tsx` | Radix Select with trigger + content |
| Input | `input.tsx` | Styled text input |
| Badge | `badge.tsx` | CVA variants: default, secondary, destructive, outline |
| Table | `table.tsx` | Data table primitives |
| Sidebar | `sidebar.tsx` (21KB) | Complex sidebar with sections, collapsible |
| Filters | `filters.tsx` | Filter bar for data views |
| Tabs | `reglo-tabs.tsx` | Custom tab component |
| Skeleton | `skeleton.tsx` | Loading placeholder |
| Toast/Toaster | `toast.tsx`, `toaster.tsx`, `feedback-toast.ts` | Notification toast system |

**Componenti specifici Reglo:**
- `service-gate.tsx` — role/service gating wrapper
- `resource-card.tsx` — card per risorse (istruttori, veicoli)
- `stat-metric.tsx` — metriche dashboard
- `toggle-chip.tsx` — chip toggle (analogo SelectableChip mobile)
- `inline-toggle.tsx` — toggle inline
- `field-group.tsx` — form field grouping
- `page-states.tsx` — empty, error, loading states
- `page-skeleton.tsx` — full page skeleton
- `reglo-mark.tsx` — brand mark component
- `status-dot.tsx` — stato indicatore

---

## 8. Layout

- Page shell: `AutoscuoleShell.tsx` wraps all autoscuole pages
- Sidebar: `AppSidebar.tsx` with `SideBarWrapper.tsx`
- Page content: `ClientPageWrapper.tsx` for margin/padding
- Header: `ClientHeader.tsx` with user menu

---

## 9. Regole e Divieti

### Da fare
- Usare CSS variables per tutti i colori (`bg-primary`, `text-foreground`, etc.)
- Usare le utility classes `ds-*` per typography
- Usare le shadow tokens (`shadow-card`, `shadow-cta`, etc.)
- Usare Radix UI per componenti interattivi (Dialog, DropdownMenu, etc.)
- Usare CVA per varianti componente
- Focus visible ring su tutti gli elementi interattivi (`.reglo-focus-ring`)
- Transizioni via `transform` e `opacity` only

### Da NON fare
- **Non** hardcodare hex — usare CSS variables (`var(--primary)`) o Tailwind classes (`bg-primary`)
- **Non** creare componenti UI da zero — usare quelli in `components/ui/`
- **Non** usare radii arbitrari — seguire la scala (`rounded-sm/md/lg/pill/card-primary`)
- **Non** animare `width`/`height`/`padding`/`margin` — usare `transform` e `opacity`
- **Non** usare ombre inline — usare i preset (`shadow-card`, `shadow-cta`, etc.)

---

## 10. Mapping Mobile ↔ Web

> **I token NON sono più allineati.** Il passaggio a bianco/nero del 2026-09-17
> ha riguardato **solo il web**, su richiesta esplicita. Il mobile è rimasto
> alla palette precedente. Quando il mobile verrà allineato, `colors.primary`
> in `reglo-mobile/src/theme/colors.ts` va portato a `#111111` e questa
> tabella riallineata.

| Mobile (`src/theme/`) | Web (CSS variable) | Valore web |
|-----------------------|-------------------|-----------|
| `colors.primary` | `--primary` | `#111111` (mobile: da allineare) |
| `colors.destructive` | `--destructive` | `#c13515` |
| `colors.positive` | `--positive` | `#22C55E` |
| `colors.textPrimary` | `--foreground` | `#222222` |
| `colors.textSecondary` | `--muted-foreground` | `#6a6a6a` |
| `colors.border` | `--border` | `#dddddd` |
| `colors.surface` | `--card` | `#FFFFFF` |
| `colors.background` | `--background` | `#FFFFFF` |
| `typography.title` (28/700) | `.ds-title` | 28px/700 |
| `typography.subtitle` (18/600) | `.ds-subtitle` | 18px/600 |
| `typography.body` (15/500) | `.ds-body` | 15px/500 |
| `typography.caption` (12/600) | `.ds-caption` | 12px/600 |
| `radii.sm` (20) | `--radius` | 14px (divergente) |
| `radii.lg` (35) | `--radius-card-primary` | 35px |

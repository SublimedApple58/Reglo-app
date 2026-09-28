"use client";

/**
 * Sezione **Istruttori** per una consorziata senza Reglo (REG-429).
 *
 * Nel prototipo questa sezione non è un cartello unico: la **lista resta
 * aperta e cliccabile**, e dentro il dettaglio dell'istruttore ci sono quattro
 * sotto-tab — Disponibilità, Malattia, Ferie, Gestione autonoma — ognuna col
 * suo cartello, diverso dagli altri. È il pezzo che mi ero perso al primo giro.
 *
 * Testi, misure e illustrazioni vengono dal prototipo aperto nel browser
 * (`_paintInstrManage` e i quattro `_paint*`), non ricostruiti a memoria.
 *
 * Due dettagli che valgono la pena di sapere, perché non sono miei capricci:
 * - **"Gestione autonoma" non ha i CTA**: finisce col riquadro video. Le altre
 *   tre hanno "Scopri di più" + "Attiva Reglo". Il riquadro, a differenza del
 *   prototipo, è un link al video vero sul sito (`VIDEO_ISTRUTTORI_URL`).
 * - "Ferie" e "Malattia" hanno il cartello largo **400px**, non 420.
 *
 * Come ovunque qui dentro, il contenuto vero della pane non si monta:
 * chiamerebbe action chiuse. Dietro c'è un fondale finto e sfocato.
 */

import * as React from "react";
import Image from "next/image";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import { ATTIVA_REGLO_URL, VIDEO_ISTRUTTORI_URL } from "./locked-features";

const NERO = "#111111";

/* ── Dati finti, gli stessi del prototipo ───────────────────────────── */

const INSTRUCTORS = [
  { key: "i1", name: "Istruttore 1", meta: "17:00–20:00 · Lun, Mar, Mer, Gio", color: "#ec4899" },
  { key: "i2", name: "Istruttore 2", meta: "07:00–17:00 · Lun, Mar, Mer, Gio, Ven, Sab", color: "#64748b" },
  { key: "i3", name: "Istruttore 3", meta: "Nessuna disponibilità settimanale", color: "#10b981" },
  { key: "i4", name: "Istruttore 4", meta: "11:00–13:00, 15:00–17:00 · Lun–Ven", color: "#eab308" },
];

type TabKey = "disp" | "malattia" | "ferie" | "autonoma";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "disp", label: "Disponibilità" },
  { key: "malattia", label: "Malattia" },
  { key: "ferie", label: "Ferie" },
  { key: "autonoma", label: "Gestione autonoma" },
];

/* ── Primitivi del prototipo ────────────────────────────────────────── */

const MiniLabel = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <p className={cn("text-[11px] font-bold uppercase tracking-[0.4px] text-[#929292]", className)}>
    {children}
  </p>
);

/** Chip giorno: quadrato, selezionato col bordo scuro. */
const DayChip = ({ label, on }: { label: string; on?: boolean }) => (
  <span
    className={cn(
      "flex items-center justify-center rounded-[10px] border-[1.5px] py-[9px] text-[12.5px]",
      on
        ? "border-[#111111] bg-[#f6f6f8] font-semibold text-[#222222]"
        : "border-[#e4e4ea] font-medium text-[#6a6a6a]",
    )}
  >
    {label}
  </span>
);

const ClockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="8" r="6" stroke="#929292" strokeWidth="1.3" />
    <path d="M8 5v3.2l2 1.4" stroke="#929292" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

/** Campo orario del prototipo. */
const TimeField = ({ time }: { time: string }) => (
  <div className="flex flex-1 items-center justify-between gap-2 rounded-[10px] border-[1.5px] border-[#e4e4ea] px-3 py-[9px]">
    <span className="text-[13px] font-medium text-[#222222]">{time}</span>
    <ClockIcon />
  </div>
);

/** Una fascia: due orari con la freccia in mezzo. */
const Fascia = ({ from, to }: { from: string; to: string }) => (
  <div className="mt-2 flex items-center gap-2">
    <TimeField time={from} />
    <span className="shrink-0 text-[13px] font-semibold text-[#929292]">→</span>
    <TimeField time={to} />
  </div>
);

/** I due pulsanti. "Gestione autonoma" nel prototipo non li ha. */
const CtaRow = () => (
  <div className="flex items-center justify-center gap-2.5">
    <a
      href="https://reglo.it"
      target="_blank"
      rel="noreferrer"
      className="rounded-[32px] border-[1.5px] border-[#dddddd] px-5 py-2.5 text-[14px] font-semibold text-[#222222] transition-colors hover:border-[#b5b5b5]"
    >
      Scopri di più
    </a>
    <a
      href={ATTIVA_REGLO_URL}
      target="_blank"
      rel="noreferrer"
      style={{ backgroundColor: NERO }}
      className="rounded-[32px] px-[22px] py-[11px] text-[14px] font-bold text-white transition-colors hover:!bg-[#2b2b2b]"
    >
      Attiva Reglo
    </a>
  </div>
);

/** Guscio del cartello: bianco, 22px di raggio, ombra alta. */
const Card = ({
  width = 420,
  center,
  children,
}: {
  width?: number;
  center?: boolean;
  children: React.ReactNode;
}) => (
  <div
    data-testid="locked-instructor-card"
    style={{ maxWidth: width }}
    className={cn(
      "w-full rounded-[22px] bg-white p-[26px_24px_24px] leading-[normal] tracking-normal shadow-[0_26px_70px_rgba(10,20,30,0.32)]",
      center && "p-8 text-center",
    )}
  >
    {children}
  </div>
);

/* ── I quattro cartelli ─────────────────────────────────────────────── */

const DisponibilitaCard = ({ firstName }: { firstName: string }) => (
  <Card>
    <h3 className="text-[21px] font-bold tracking-[-0.7px] text-[#222222]">
      Disponibilità di {firstName}
    </h3>
    <p className="mt-2 text-[14px] font-medium leading-[1.45] text-[#5a5a66]">
      Giorni e fasce orarie in cui l&apos;istruttore fa guide: gli allievi vedono solo gli orari
      davvero prenotabili.
    </p>
    <MiniLabel className="mb-2 mt-[18px]">Giorni</MiniLabel>
    <div className="grid grid-cols-7 gap-[5px]">
      {["Lun", "Mar", "Mer", "Gio", "Ven"].map((d) => (
        <DayChip key={d} label={d} on />
      ))}
      <DayChip label="Sab" />
      <DayChip label="Dom" />
    </div>
    <MiniLabel className="mb-0.5 mt-4">Fasce orarie</MiniLabel>
    <Fascia from="08:00" to="13:00" />
    <Fascia from="14:30" to="19:00" />
    <div className="my-[18px] h-px bg-[#efeff2]" />
    <p className="mb-4 text-center text-[13.5px] font-medium leading-[1.5] text-[#6a6a6a]">
      L&apos;agenda si costruisce da sola sulle disponibilità: niente slot sbagliati, niente
      telefonate.
    </p>
    <CtaRow />
  </Card>
);

const MalattiaCard = () => (
  // Unico cartello centrato, con l'illustrazione sopra e un'ombra più bassa.
  <div
    data-testid="locked-instructor-card"
    className="w-full max-w-[400px] rounded-[22px] bg-white p-8 text-center leading-[normal] tracking-normal shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
  >
    <Image
      src="/images/locked/malattia-icon.png"
      alt=""
      width={192}
      height={192}
      className="mx-auto mb-5 size-24 object-contain"
    />
    <h3 className="mb-2 text-[19px] font-bold tracking-[-0.2px] text-[#222222]">
      Malattie gestite in un click!
    </h3>
    <p className="mb-5 text-[13.5px] font-medium leading-[1.5] text-[#6a6a6a]">
      Le assenze si registrano in un tap: l&apos;agenda si aggiorna da sola e le guide vengono
      ricollocate. Senza Reglo, le riorganizzi a mano.
    </p>
    <CtaRow />
  </div>
);

const FerieRow = ({
  avatar,
  name,
  dates,
  highlight,
}: {
  avatar: string;
  name: string;
  dates: string;
  highlight?: boolean;
}) => (
  <div
    className={cn(
      "flex items-center gap-3 rounded-[14px] px-3 py-2.5",
      highlight && "bg-[#f5f5f7]",
    )}
  >
    <span className="size-[42px] shrink-0 overflow-hidden rounded-full">
      <Image src={avatar} alt="" width={84} height={84} className="h-full w-full object-cover" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-[15.5px] font-bold tracking-[-0.3px] text-[#222222]">{name}</span>
      <span className="mt-0.5 block text-[13px] font-medium text-[#8a8a94]">{dates}</span>
    </span>
    <span
      className={cn(
        "relative shrink-0 whitespace-nowrap rounded-[10px] border border-[#e4e4ea] px-3.5 py-2 text-[13.5px] font-semibold text-[#222222]",
        highlight && "bg-white shadow-[0_4px_12px_rgba(0,0,0,0.1)]",
      )}
    >
      Approva
      {highlight ? (
        // Il puntatore del mouse disegnato sull'angolo, come nel prototipo.
        <svg width="17" height="20" viewBox="0 0 17 20" fill="none" className="absolute -bottom-3 -right-[7px]" aria-hidden>
          <path
            d="M1.5 1.2v14.4l3.9-3.9 2.5 5.7 2.6-1.2-2.5-5.6h5.4L1.5 1.2z"
            fill="#111118"
            stroke="#ffffff"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  </div>
);

const FerieCard = () => (
  <Card width={400}>
    <h3 className="text-[21px] font-bold tracking-[-0.7px] text-[#222222]">Ferie di agosto</h3>
    <div className="mt-2.5 flex items-center gap-[9px]">
      <span className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-[#f3f3f6]">
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="#5a5a66" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4.5" width="14" height="13" rx="2.5" />
          <path d="M3 8.5h14M7 2.5v3M13 2.5v3" />
        </svg>
      </span>
      <span className="text-[14px] font-medium text-[#5a5a66]">
        3 istruttori con ferie da approvare
      </span>
    </div>
    <div className="mt-5 flex flex-col gap-1">
      <FerieRow avatar="/images/locked/allievo-1.png" name="Valerio Biondi" dates="10 → 17 ago" />
      <FerieRow avatar="/images/locked/nota-valerio.png" name="Martina Giorgi" dates="14 → 24 ago" highlight />
      <FerieRow avatar="/images/locked/allievo-2.png" name="Carlo Antoni" dates="21 → 28 ago" />
    </div>
    <div className="my-[18px] h-px bg-[#efeff2]" />
    <p className="mb-4 text-center text-[13.5px] font-medium leading-[1.5] text-[#6a6a6a]">
      Le ferie si registrano in un tap: l&apos;agenda si aggiorna da sola e le guide vengono
      ricollocate.
    </p>
    <CtaRow />
  </Card>
);

const AutonomaCard = () => (
  // Nel prototipo questa finisce col video: niente "Scopri di più"/"Attiva Reglo".
  <Card>
    <span
      style={{ backgroundColor: NERO }}
      className="mb-3 inline-flex rounded-[20px] px-3.5 py-1.5 text-[12px] font-bold text-white"
    >
      In 1 minuto
    </span>
    <h3 className="mb-3.5 text-[16.5px] font-bold leading-[1.3] tracking-[-0.2px] text-[#222222]">
      Come funziona la modalità autonoma per gli istruttori?
    </h3>
    {/*
      Il riquadro del prototipo era muto: il play non portava a niente. Ora
      apre il video vero sul sito, già scrollato (vedi VIDEO_ISTRUTTORI_URL).
      Resta identico a vedersi — cambia solo che è un link.
    */}
    <a
      href={VIDEO_ISTRUTTORI_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Guarda il video: come funziona la modalità autonoma per gli istruttori"
      className="group relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-[12px] bg-[#ececef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111] focus-visible:ring-offset-2"
    >
      {/*
        Un fotogramma vero del video, non un rettangolo grigio: si vede subito
        di che cosa parla. È lo stesso frame del video sul sito, quindi
        l'anteprima e la pagina di destinazione combaciano.
      */}
      <Image
        src="/images/locked/video-istruttori.jpg"
        alt=""
        width={1600}
        height={878}
        className="absolute inset-0 h-full w-full object-cover object-left-top"
      />
      {/* Velo scuro: il play e la scritta devono restare leggibili sul frame. */}
      <span className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent transition-colors group-hover:from-black/55" />
      <span className="relative flex size-12 items-center justify-center rounded-full bg-[#2f2f38] shadow-[0_6px_18px_rgba(0,0,0,0.25)] transition-transform group-hover:scale-105">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M5 3.5v9l7.5-4.5L5 3.5z" fill="#ffffff" />
        </svg>
      </span>
      <span className="absolute bottom-3 left-3.5 text-[12.5px] font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
        Guarda il video
      </span>
    </a>
  </Card>
);


/* ── Popover dei colori istruttore ──────────────────────────────────── */

/**
 * I sedici colori del prototipo, nel suo ordine. Sei per riga, come là.
 */
const INSTRUCTOR_PALETTE = [
  "#ec4899", "#0ea5e9", "#eab308", "#10b981", "#6366f1", "#d946ef",
  "#ef4444", "#f97316", "#84cc16", "#14b8a6", "#3b82f6", "#8b5cf6",
  "#dc2626", "#f59e0b", "#0369a1", "#64748b",
];

const POP_WIDTH = 236;

/**
 * Il pallino colore apre la griglia, **spenta**, col suo cartello sotto.
 *
 * Nel prototipo il popover è lo stesso di quando Reglo è attivo: cambia che la
 * griglia va a `opacity 0.35` e non si può cliccare, e in fondo compare il
 * piede col lucchetto. Si vede cosa si potrebbe scegliere — che è il punto di
 * tutta la vista ridotta — senza far finta che si possa.
 *
 * Posizione calcolata dal rettangolo del pallino (sotto a destra, come là) e
 * ribaltata sopra se sborda. Si chiude con Esc o cliccando fuori.
 */
function ColorDotWithPopover({ color }: { color: string }) {
  const ref = React.useRef<HTMLButtonElement | null>(null);
  const popRef = React.useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

  const toggle = () => {
    if (pos) return setPos(null);
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = r.right - POP_WIDTH;
    if (left < 12) left = 12;
    if (left + POP_WIDTH > window.innerWidth - 12) left = window.innerWidth - POP_WIDTH - 12;
    let top = r.bottom + 8;
    if (top + 210 > window.innerHeight) top = Math.max(12, r.top - 218);
    setPos({ top, left });
  };

  React.useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPos(null);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || ref.current?.contains(t)) return;
      setPos(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={toggle}
        aria-label="Colore dell'istruttore"
        style={{ background: color }}
        className="size-8 shrink-0 cursor-pointer rounded-lg shadow-[0_0_0_1px_rgba(0,0,0,0.1)] transition-transform hover:scale-105"
      />
      {pos
        ? createPortal(
            <div
              ref={popRef}
              style={{ top: pos.top, left: pos.left, width: POP_WIDTH }}
              className="fixed z-[520] rounded-[16px] border border-[#ececec] bg-white p-[14px] leading-[normal] shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
            >
              {/* La griglia si vede ma non si tocca: è la funzione non comprata. */}
              <div
                aria-hidden
                className="pointer-events-none grid grid-cols-6 gap-[9px] opacity-[0.35]"
              >
                {INSTRUCTOR_PALETTE.map((hex) => (
                  <span
                    key={hex}
                    style={{
                      background: hex,
                      boxShadow: hex === color ? `0 0 0 2px #fff, 0 0 0 4px ${hex}` : undefined,
                    }}
                    className="flex aspect-square w-full items-center justify-center rounded-[8px]"
                  >
                    {hex === color ? (
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path
                          d="M3.5 8.5l3 3 6-6.5"
                          stroke="#fff"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                  </span>
                ))}
              </div>
              <div className="mt-3 border-t border-[#efefef] pt-3">
                <div className="flex items-center gap-[7px] text-[12.5px] font-bold text-[#222222]">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#222"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    className="shrink-0"
                    aria-hidden
                  >
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                  Un colore per ogni istruttore
                </div>
                <div className="mt-1 text-[11.5px] font-medium leading-[1.45] text-[#6a6a6a]">
                  Con Reglo attivo riconosci le sue guide in agenda a colpo d&apos;occhio.
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/* ── Fondali sfocati: i campi veri di ogni scheda ───────────────────── */

const FieldRow = ({ label, value }: { label: string; value: string }) => (
  <div>
    <MiniLabel className="mb-1.5">{label}</MiniLabel>
    <div className="flex items-center justify-between gap-2 rounded-[10px] border-[1.5px] border-[#e4e4ea] px-3 py-[9px]">
      <span className="text-[13px] font-medium text-[#222222]">{value}</span>
      <ClockIcon />
    </div>
  </div>
);

const Block = ({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children?: React.ReactNode;
}) => (
  <div>
    <p className="text-[15px] font-semibold text-foreground">{title}</p>
    {note ? <p className="mt-1 text-[13px] leading-[1.45] text-[#929292]">{note}</p> : null}
    {children ? <div className="mt-3">{children}</div> : null}
  </div>
);

const BACKDROPS: Record<TabKey, React.ReactNode> = {
  disp: (
    <div className="space-y-6">
      <div>
        <MiniLabel className="mb-2">Giorni della settimana</MiniLabel>
        <div className="grid grid-cols-7 gap-[5px]">
          {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d, i) => (
            <DayChip key={d} label={d} on={i < 5} />
          ))}
        </div>
      </div>
      <div>
        <MiniLabel className="mb-2">Fasce orarie</MiniLabel>
        <Fascia from="08:00" to="13:00" />
        <Fascia from="14:30" to="19:00" />
      </div>
      <Block title="Pausa tra le guide" note="Minuti di stacco fra una guida e la successiva." />
    </div>
  ),
  malattia: (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-5">
        <FieldRow label="Data inizio" value="10 lug 2026" />
        <FieldRow label="Data fine" value="12 lug 2026" />
      </div>
      <Block
        title="Mezza giornata"
        note="La malattia inizia a un orario specifico del giorno scelto."
      />
      <div className="h-11 w-full rounded-[10px] bg-[#6a6a72]" />
    </div>
  ),
  ferie: (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-5">
        <FieldRow label="Data inizio" value="27 lug 2026" />
        <FieldRow label="Data fine" value="10 ago 2026" />
      </div>
      <Block title="Mezza giornata" note="Le ferie iniziano a un orario specifico del giorno." />
      <div className="h-11 w-full rounded-[10px] bg-[#6a6a72]" />
    </div>
  ),
  autonoma: (
    <div className="space-y-6">
      <div>
        <MiniLabel className="mb-2">Orario di lavoro</MiniLabel>
        <Fascia from="17:00" to="20:00" />
        <p className="mt-2 text-[12.5px] text-[#929292]">
          Definisci la fascia lavorativa per identificare le ore extra.
        </p>
      </div>
      <Block
        title="Modalità autonoma"
        note="L'istruttore gestisce i propri allievi e imposta le sue disponibilità."
      />
      <div>
        <p className="text-[15px] font-semibold text-foreground">Durata guide</p>
        <p className="mt-1 text-[13px] text-[#929292]">Durate proponibili per le guide.</p>
        <div className="mt-3 flex gap-2">
          {["30 min", "45 min", "60 min", "90 min"].map((d, i) => (
            <span
              key={d}
              className={cn(
                "rounded-[20px] border-[1.5px] px-[13px] py-[7px] text-[12.5px]",
                i % 2 === 0
                  ? "border-[#111111] bg-[#f6f6f8] font-semibold text-[#222222]"
                  : "border-[#e4e4ea] font-medium text-[#6a6a6a]",
              )}
            >
              {d}
            </span>
          ))}
        </div>
      </div>
      <Block title="Solo orari tondi" note="Gli slot partono solo a ore intere (es. 16:00, 17:00)." />
    </div>
  ),
};

/* ── Lista e dettaglio ──────────────────────────────────────────────── */

function InstructorList({ onOpen }: { onOpen: (key: string) => void }) {
  return (
    <div>
      {INSTRUCTORS.map((item) => (
        <div
          key={item.key}
          className="flex items-center justify-between gap-4 border-b border-[#f2f2f2] py-3.5 last:border-b-0"
        >
          <div className="min-w-0">
            <p className="text-[14.5px] font-semibold text-foreground">{item.name}</p>
            <p className="mt-0.5 truncate text-[12.5px] text-[#929292]">{item.meta}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpen(item.key)}
            className="shrink-0 cursor-pointer text-[13px] font-semibold text-[#444444] underline underline-offset-2 transition-colors hover:text-foreground"
          >
            Scopri
          </button>
        </div>
      ))}
    </div>
  );
}

function InstructorDetail({
  instructor,
  onBack,
}: {
  instructor: (typeof INSTRUCTORS)[number];
  onBack: () => void;
}) {
  const [tab, setTab] = React.useState<TabKey>("disp");
  const firstName = instructor.name.split(" ")[0];

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-3.5 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-[#6a6a6a] transition-colors hover:text-foreground"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M10 3l-5 5 5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Istruttori
      </button>

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[24px] font-bold tracking-[-0.3px] text-[#222222]">
            {instructor.name}
          </h2>
          <p className="mt-[3px] text-[13.5px] font-medium text-[#929292]">
            Disponibilità, assenze e autonomia: con Reglo attivo li gestisci da qui
          </p>
        </div>
        <ColorDotWithPopover color={instructor.color} />
      </div>

      <div className="my-5 mb-6 flex flex-wrap items-center gap-[26px] border-b border-[#e8e8e8]">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              "-mb-px cursor-pointer select-none whitespace-nowrap border-b-[2.5px] px-px pb-3 text-[15px] transition-colors",
              tab === item.key
                ? "border-[#111111] font-semibold text-[#222222]"
                : "border-transparent font-medium text-[#6a6a6a] hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="relative min-h-[460px]">
        <div
          className="pointer-events-none max-w-[640px] select-none opacity-55 blur-[3px]"
          aria-hidden
        >
          {BACKDROPS[tab]}
        </div>
        <div className="absolute inset-0 flex items-start justify-center px-6 pt-9">
          {tab === "disp" ? <DisponibilitaCard firstName={firstName} /> : null}
          {tab === "malattia" ? <MalattiaCard /> : null}
          {tab === "ferie" ? <FerieCard /> : null}
          {tab === "autonoma" ? <AutonomaCard /> : null}
        </div>
      </div>
    </div>
  );
}

export function LockedInstructors({
  onDetailOpenChange,
}: {
  onDetailOpenChange?: (open: boolean) => void;
}) {
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const open = INSTRUCTORS.find((item) => item.key === openKey) ?? null;

  // La shell stampa il titolo "Istruttori" sopra di noi: nel dettaglio non ci
  // va, il nome dell'istruttore fa già da titolo.
  React.useEffect(() => {
    onDetailOpenChange?.(Boolean(open));
    return () => onDetailOpenChange?.(false);
  }, [open, onDetailOpenChange]);

  return open ? (
    <InstructorDetail instructor={open} onBack={() => setOpenKey(null)} />
  ) : (
    <InstructorList onOpen={setOpenKey} />
  );
}

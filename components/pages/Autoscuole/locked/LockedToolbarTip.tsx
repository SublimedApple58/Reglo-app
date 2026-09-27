"use client";

/**
 * Popup di blocco degli strumenti della **toolbar dell'agenda**, per una
 * consorziata senza Reglo (REG-429).
 *
 * Nel prototipo la toolbar dell'agenda bloccata resta lì, grigia, e ogni
 * strumento apre il **suo** pannello: titolo, una riga di spiegazione, una
 * mini-illustrazione diversa per ognuno, e in fondo lucchetto + "Funzione
 * extra di Reglo" + "Attiva Reglo". Non è lo stesso popup ripetuto cinque
 * volte: legenda, visualizzazione, schermo intero, stampa e filtri mostrano
 * cose diverse.
 *
 * Testi, colori e misure vengono dal prototipo aperto nel browser
 * (`agTipTitle` / `agTipDesc` / i cinque rami `agTipIs*`), non ricostruiti a
 * memoria.
 *
 * ⚠️ **Zoom e ricerca non esistono nel prototipo**: là lo zoom non c'è proprio
 * e la ricerca funziona davvero. Le loro due voci qui sotto sono scritte da me
 * sullo stesso stampo, marcate `fuoriPrototipo`, perché Tiziano le ha chieste:
 * se decide di lasciarle funzionanti si cancellano quelle due chiavi e basta.
 *
 * Il pannello si apre **al passaggio del mouse** come nel prototipo, e in più
 * si aggancia al click (serve al touch, dove `mouseleave` non esiste).
 */

import * as React from "react";
import { createPortal } from "react-dom";

import { ATTIVA_REGLO_URL } from "./locked-features";
import { cn } from "@/lib/utils";

const NAVY = "#1a1a2e";
const TIP_WIDTH = 300;
/** Stacco fra icona e pannello: è anche il vuoto che il cursore attraversa. */
const TIP_GAP = 10;
const CLOSE_DELAY_MS = 220;

/* ── Mattoncini delle illustrazioni ─────────────────────────────────── */

const Frame = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("mt-3 rounded-[12px] border border-[#f0f0f0] px-3.5 py-3", className)}>
    {children}
  </div>
);

const Caption = ({ children, center }: { children: React.ReactNode; center?: boolean }) => (
  <p className={cn("mt-2 text-[11px] font-medium text-[#929292]", center && "text-center")}>
    {children}
  </p>
);

const LegendRow = ({ color, label }: { color: string; label: string }) => (
  <div className="flex items-center gap-[9px]">
    <span className="inline-block h-[14px] w-[26px] rounded-[7px]" style={{ background: color }} />
    <span className="text-[12px] font-medium text-[#444444]">{label}</span>
  </div>
);

const DayChip = ({ label, on }: { label: string; on?: boolean }) => (
  <span
    className={cn(
      "inline-flex h-6 w-[30px] items-center justify-center rounded-[12px] text-[10px] font-semibold",
      on ? "bg-[#1a1a2e] text-white" : "bg-[#f2f2f2] text-[#b0b0b0]",
    )}
  >
    {label}
  </span>
);

/* ── Le cinque illustrazioni del prototipo ──────────────────────────── */

const LegendaTip = () => (
  <Frame>
    <div className="flex flex-col gap-2">
      <LegendRow color="#dbeafe" label="Fino a 30 minuti" />
      <LegendRow color="#e4f5ce" label="31–45 minuti" />
      <LegendRow color="#ede9fe" label="Esame" />
      <LegendRow color="#dcfce7" label="Guida di gruppo" />
    </div>
    <div className="my-[11px] h-px bg-[#f0f0f0]" />
    <div className="flex items-center gap-[9px]">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#222" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 21a9 9 0 1 1 9-9c0 2.2-1.8 3-3.5 3H15a2 2 0 0 0-1.4 3.4c.6.6.4 1.6-.6 1.6z" />
        <circle cx="7.5" cy="10.5" r="1" fill="#222" stroke="none" />
        <circle cx="12" cy="7.5" r="1" fill="#222" stroke="none" />
        <circle cx="16.5" cy="10.5" r="1" fill="#222" stroke="none" />
      </svg>
      <span className="text-[12px] font-semibold text-[#222222]">Aspetto</span>
      <span className="text-[11px] font-medium text-[#929292]">personalizza i colori</span>
    </div>
  </Frame>
);

const VizTip = () => (
  <Frame>
    <div className="flex gap-1.5">
      <span className="rounded-[20px] bg-[#1a1a2e] px-[13px] py-[7px] text-[11.5px] font-semibold text-white">
        Classica (lun–dom)
      </span>
      <span className="rounded-[20px] bg-[#f2f2f2] px-[13px] py-[7px] text-[11.5px] font-semibold text-[#6a6a6a]">
        7 giorni da oggi
      </span>
    </div>
    <div className="mt-2.5 flex gap-[5px]">
      {["Lun", "Mar", "Mer", "Gio", "Ven"].map((d) => (
        <DayChip key={d} label={d} on />
      ))}
      <DayChip label="Sab" />
    </div>
    <p className="mt-[9px] text-[11px] font-medium text-[#929292]">
      Giorni e orario visibili, come serve a te.
    </p>
  </Frame>
);

const FullTip = () => (
  <>
    <div className="mt-3 flex items-center gap-2.5">
      {/* Prima: sidebar + testata + agenda. */}
      <div className="flex flex-1 gap-[5px] rounded-[10px] border border-[#f0f0f0] p-[7px]">
        <div className="h-[52px] w-4 rounded-[4px] bg-[#ededf0]" />
        <div className="flex flex-1 flex-col gap-[5px]">
          <div className="h-2 rounded-[3px] bg-[#ededf0]" />
          <div className="flex-1 rounded-[4px] bg-gradient-to-b from-[#f6f6f8] to-[#f0f0f4]" />
        </div>
      </div>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M3 8h9M8.5 4l4 4-4 4" stroke="#929292" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {/* Dopo: solo agenda. */}
      <div className="flex-1 rounded-[10px] border border-[#dcdce4] p-[7px]">
        <div className="h-[52px] rounded-[4px] bg-gradient-to-b from-[#eef2ff] to-[#e8ffee]" />
      </div>
    </div>
    <Caption center>Solo l&apos;agenda, a tutto schermo.</Caption>
  </>
);

const StampaTip = () => (
  <div className="mt-3 aspect-[16/9] overflow-hidden rounded-[12px] border border-[#f0f0f0] bg-[#f6f6f8]">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      src="/images/locked/agenda-stampa.png"
      alt=""
      className="block h-full w-full object-cover object-top"
    />
  </div>
);

const FiltriTip = () => (
  <>
    <div className="mt-3 flex gap-2.5">
      <div className="w-[116px] shrink-0 rounded-[12px] border border-[#f0f0f0] p-2">
        <div className="flex items-center justify-between rounded-lg bg-[#eeeef4] px-2.5 py-[7px] text-[11.5px] font-semibold text-[#1a1a2e]">
          Istruttore
          <span className="size-1.5 rounded-full bg-[#1a1a2e]" />
        </div>
        {["Veicolo", "Tipo", "Stato"].map((label) => (
          <div key={label} className="px-2.5 py-[7px] text-[11.5px] font-medium text-[#444444]">
            {label}
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-[5px] rounded-[12px] border border-[#f0f0f0] p-2">
        {[
          ["85%", true],
          ["70%", false],
          ["92%", true],
          ["60%", false],
          ["78%", true],
        ].map(([width, on], index) => (
          <div
            key={index}
            className={cn("h-[14px] rounded-[5px]", on ? "bg-[#dbeafe]" : "bg-[#f4f4f6] opacity-40")}
            style={{ width: width as string }}
          />
        ))}
      </div>
    </div>
    <Caption>Vedi solo le guide dell&apos;istruttore scelto.</Caption>
  </>
);

/* ── Zoom e ricerca: non nel prototipo, stampo identico ─────────────── */

const ZoomTip = () => (
  <Frame className="flex items-center justify-center gap-2.5">
    <span className="inline-flex h-7 w-9 items-center justify-center rounded-md bg-[#f2f2f2] text-[11px] font-semibold text-[#6a6a6a]">
      80%
    </span>
    <span className="inline-flex h-7 w-9 items-center justify-center rounded-md bg-[#1a1a2e] text-[11px] font-semibold text-white">
      100%
    </span>
    <span className="inline-flex h-7 w-9 items-center justify-center rounded-md bg-[#f2f2f2] text-[11px] font-semibold text-[#6a6a6a]">
      140%
    </span>
  </Frame>
);

const CercaTip = () => (
  <Frame className="flex items-center gap-2">
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="#1a1a2e" strokeWidth="1.7" />
      <path d="M10.5 10.5l3 3" stroke="#1a1a2e" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
    <span className="text-[12px] font-medium text-[#929292]">Cerca in agenda…</span>
  </Frame>
);

/* ── Le voci ─────────────────────────────────────────────────────────── */

export type ToolbarTipKey =
  | "legenda"
  | "viz"
  | "full"
  | "stampa"
  | "filtri"
  | "zoom"
  | "cerca";

type TipSpec = {
  title: string;
  description: string;
  illustration: React.ReactNode;
  /** Scritta da noi: il prototipo non ha questo strumento. */
  fuoriPrototipo?: boolean;
};

export const TOOLBAR_TIPS: Record<ToolbarTipKey, TipSpec> = {
  legenda: {
    title: "Legenda colori",
    description:
      "Capisci a colpo d'occhio cosa c'è in agenda: colori per tipo di evento o per istruttore. Con Reglo attivo trovi nelle impostazioni anche Aspetto, per scegliere i colori a piacimento.",
    illustration: <LegendaTip />,
  },
  viz: {
    title: "Visualizzazione",
    description:
      "Cambia come vedi l'agenda: settimana classica o 7 giorni da oggi, giorni e fascia oraria visibili.",
    illustration: <VizTip />,
  },
  full: {
    title: "Schermo intero",
    description:
      "Nasconde il resto dell'interfaccia e lascia solo l'agenda: comodo nelle giornate piene.",
    illustration: <FullTip />,
  },
  stampa: {
    title: "Stampa l'agenda",
    description:
      "Esporta l'agenda in PDF per chi vuole il cartaceo: da consegnare agli istruttori o tenere in segreteria.",
    illustration: <StampaTip />,
  },
  filtri: {
    title: "Filtri",
    description:
      "Mostra solo quello che serve: per istruttore, per veicolo, per tipo di guida, per stato.",
    illustration: <FiltriTip />,
  },
  zoom: {
    title: "Zoom dell'agenda",
    description:
      "Allarga o stringe le righe orarie: più respiro quando la giornata è piena, più colpo d'occhio quando è vuota.",
    illustration: <ZoomTip />,
    fuoriPrototipo: true,
  },
  cerca: {
    title: "Cerca in agenda",
    description:
      "Trova una guida per nome dell'allievo o dell'istruttore, senza scorrere la settimana.",
    illustration: <CercaTip />,
    fuoriPrototipo: true,
  },
};

/* ── Il pannello ─────────────────────────────────────────────────────── */

/** Uno alla volta: le voci sono sorelle e non condividono stato. */
const listeners = new Set<(openKey: string) => void>();
const announceOpen = (key: string) => listeners.forEach((fn) => fn(key));

function Padlock() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#222222" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/**
 * Lo strumento bloccato: stessa icona di sempre, grigia e inerte, che al
 * passaggio del mouse (o al click) apre il suo pannello.
 */
export function LockedToolbarTip({
  tip,
  children,
  className,
}: {
  tip: ToolbarTipKey;
  /** L'icona, identica a quella dello strumento vero. */
  children: React.ReactNode;
  className?: string;
}) {
  const spec = TOOLBAR_TIPS[tip];
  const ref = React.useRef<HTMLDivElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const [pinned, setPinned] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = React.useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const open = React.useCallback(() => {
    cancelClose();
    announceOpen(tip);
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Allineato a destra dell'icona, come nel prototipo, ma senza sbordare.
    const left = Math.min(
      Math.max(8, r.right - TIP_WIDTH),
      window.innerWidth - TIP_WIDTH - 8,
    );
    setPos({ top: r.bottom + TIP_GAP, left });
  }, [cancelClose, tip]);

  const scheduleClose = React.useCallback(() => {
    if (pinned) return;
    cancelClose();
    timer.current = setTimeout(() => setPos(null), CLOSE_DELAY_MS);
  }, [cancelClose, pinned]);

  const close = React.useCallback(() => {
    cancelClose();
    setPinned(false);
    setPos(null);
  }, [cancelClose]);

  React.useEffect(() => () => cancelClose(), [cancelClose]);

  React.useEffect(() => {
    const onOther = (openKey: string) => {
      if (openKey === tip) return;
      cancelClose();
      setPinned(false);
      setPos(null);
    };
    listeners.add(onOther);
    return () => {
      listeners.delete(onOther);
    };
  }, [tip, cancelClose]);

  // Se sborda sotto, il pannello risale sopra l'icona.
  React.useLayoutEffect(() => {
    if (!pos || !panelRef.current || !ref.current) return;
    const h = panelRef.current.getBoundingClientRect().height;
    if (pos.top + h > window.innerHeight - 12) {
      const r = ref.current.getBoundingClientRect();
      const above = r.top - TIP_GAP - h;
      setPos((cur) => (cur ? { ...cur, top: Math.max(12, above) } : cur));
    }
  }, [pos]);

  React.useEffect(() => {
    if (!pinned) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || ref.current?.contains(target)) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [pinned, close]);

  return (
    <>
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        aria-label={spec.title}
        onMouseEnter={open}
        onMouseLeave={scheduleClose}
        onFocus={open}
        onBlur={scheduleClose}
        onClick={() => {
          setPinned(true);
          open();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setPinned(true);
            open();
          }
        }}
        className={cn(
          "flex h-[34px] shrink-0 cursor-default select-none items-center justify-center rounded-lg px-1.5 text-[#c8c8c8] outline-none",
          className,
        )}
      >
        {children}
      </div>

      {pos
        ? createPortal(
            <div
              ref={panelRef}
              data-testid="locked-toolbar-tip"
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleClose}
              style={{ top: pos.top, left: pos.left, width: TIP_WIDTH }}
              // `leading-[normal] tracking-normal`: il prototipo non impone
              // interlinea, la nostra app sì (1.5 ereditata). Senza questo il
              // titolo cresce di 3.8px, la didascalia di 3.5 e il piede di 4:
              // il pannello finisce 11px più alto del prototipo. L'unica
              // interlinea esplicita resta quella della descrizione (1.5),
              // che nel prototipo è dichiarata.
              className="fixed z-[520] rounded-[16px] border border-[#ececec] bg-white p-[18px] leading-[normal] tracking-normal shadow-[0_14px_40px_rgba(0,0,0,0.18)]"
            >
              {/* Ponte invisibile sullo stacco: il cursore non passa dal vuoto. */}
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-full"
                style={{ height: TIP_GAP }}
              />
              <p className="text-[14.5px] font-bold text-[#222222]">{spec.title}</p>
              <p className="mt-1 text-[12.5px] font-medium leading-[1.5] text-[#6a6a6a]">
                {spec.description}
              </p>
              {spec.illustration}
              <div className="mb-3 mt-3.5 h-px bg-[#f0f0f0]" />
              <div className="flex items-center gap-2">
                <Padlock />
                <span className="flex-1 text-[12px] font-bold text-[#222222]">
                  Funzione extra di Reglo
                </span>
                <a
                  href={ATTIVA_REGLO_URL}
                  target="_blank"
                  rel="noreferrer"
                  style={{ backgroundColor: NAVY }}
                  className="rounded-[32px] px-4 py-2 text-[12px] font-bold text-white transition-colors hover:!bg-[#2a2a44]"
                >
                  Attiva Reglo
                </a>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

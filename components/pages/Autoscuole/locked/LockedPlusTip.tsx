"use client";

/**
 * Cartelli delle voci **bloccate del menu "+"** dell'agenda (REG-429).
 *
 * Prima erano righe inerti: icona, etichetta, lucchetto, e al click non
 * succedeva niente. Ora ognuna apre il suo cartello — titolo, spiegazione,
 * una mini-illustrazione e in fondo lucchetto + "Attiva Reglo" — come già
 * fanno gli strumenti della toolbar.
 *
 * ⚠️ **Questi testi non vengono dal prototipo.** Il prototipo disegna le voci
 * col lucchetto ma non dà loro nessun cartello: titoli, descrizioni e
 * illustrazioni sono scritti qui (richiesta di Tiziano, 2026-09-28). Stessa
 * scelta già fatta per zoom e ricerca della toolbar. Chi in futuro trovasse
 * quei contenuti nel prototipo deve **sostituirli**, non affiancarli.
 *
 * Il guscio è identico a `LockedToolbarTip` di proposito: due pannelli diversi
 * nella stessa agenda si noterebbero.
 */

import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import { ATTIVA_REGLO_URL } from "./locked-features";

const NAVY = "#1a1a2e";
const TIP_WIDTH = 288;
/** Stacco fra voce e pannello: è anche il vuoto che il cursore attraversa. */
const TIP_GAP = 12;
const CLOSE_DELAY_MS = 220;

/** Un pannello alla volta: voci sorelle senza stato condiviso. */
const listeners = new Set<(key: string) => void>();
const announceOpen = (key: string) => listeners.forEach((fn) => fn(key));

function Padlock() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#222222"
      strokeWidth={2.2}
      strokeLinecap="round"
      className="shrink-0"
      aria-hidden
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/* ── Mini-illustrazioni ─────────────────────────────────────────────── */

const Slot = ({
  color,
  label,
  w = "100%",
  faded,
}: {
  color: string;
  label: string;
  w?: string;
  faded?: boolean;
}) => (
  <div
    style={{ background: color, width: w }}
    className={cn(
      "flex h-[26px] items-center rounded-[7px] px-2 text-[10.5px] font-semibold text-white",
      faded && "opacity-40",
    )}
  >
    {label}
  </div>
);

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-3 rounded-[11px] border border-[#f0f0f0] bg-[#fafafa] p-2.5">{children}</div>
);

const AppuntamentoArt = () => (
  <Frame>
    <div className="flex flex-col gap-1.5">
      <Slot color="#5b8def" label="09:00 · Marta" />
      <Slot color="#7bc47f" label="10:30 · Luca" w="82%" />
      <Slot color="#e0e0e6" label="" w="58%" faded />
    </div>
  </Frame>
);

const EsameArt = () => (
  <Frame>
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-[#1a1a2e] text-[15px]">
        🎓
      </span>
      <div className="min-w-0 flex-1">
        <div className="h-[9px] w-[72%] rounded-full bg-[#dcdce4]" />
        <div className="mt-1.5 h-[7px] w-[46%] rounded-full bg-[#ececf1]" />
      </div>
      <span className="shrink-0 rounded-full bg-[#e4f4e7] px-2 py-[3px] text-[9.5px] font-bold text-[#1f6b2a]">
        Idoneo
      </span>
    </div>
  </Frame>
);

const BloccoArt = () => (
  <Frame>
    <div className="flex flex-col gap-1.5">
      <Slot color="#5b8def" label="09:00 · Marta" w="70%" />
      <div className="flex h-[26px] items-center justify-center rounded-[7px] bg-[repeating-linear-gradient(45deg,#e8e8ee_0_6px,#f4f4f8_6px_12px)] text-[10.5px] font-semibold text-[#8a8a94]">
        Non prenotabile
      </div>
    </div>
  </Frame>
);

const TeoriaArt = () => (
  <Frame>
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-[#f3f0ff] text-[15px]">
        📚
      </span>
      <div className="flex -space-x-1.5">
        {["#c7d2fe", "#bfdbfe", "#bbf7d0", "#fde68a"].map((c) => (
          <span
            key={c}
            style={{ background: c }}
            className="size-[22px] rounded-full ring-2 ring-white"
          />
        ))}
        <span className="flex size-[22px] items-center justify-center rounded-full bg-[#eeeef3] text-[9px] font-bold text-[#6a6a6a] ring-2 ring-white">
          +9
        </span>
      </div>
    </div>
  </Frame>
);

const GruppoArt = () => (
  <Frame>
    <div className="flex flex-col gap-1.5">
      <Slot color="#f0a35e" label="Guida di gruppo · 4 posti" />
      <div className="flex gap-1">
        {["#bbf7d0", "#bfdbfe", "#fecaca", "#e5e7eb"].map((c) => (
          <span key={c} style={{ background: c }} className="h-[18px] flex-1 rounded-[5px]" />
        ))}
      </div>
    </div>
  </Frame>
);

const FestivoArt = () => (
  <Frame>
    <div className="grid grid-cols-7 gap-[3px]">
      {Array.from({ length: 14 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-[15px] rounded-[4px]",
            i === 4 || i === 11 ? "bg-[#f2c94c]" : "bg-[#e8e8ee]",
          )}
        />
      ))}
    </div>
  </Frame>
);

/* ── I contenuti ────────────────────────────────────────────────────── */

export type PlusTipKey =
  | "appuntamento"
  | "esame"
  | "blocco"
  | "teoria"
  | "gruppo"
  | "festivo";

type PlusTipSpec = { title: string; description: string; illustration: React.ReactNode };

export const PLUS_TIPS: Record<PlusTipKey, PlusTipSpec> = {
  appuntamento: {
    title: "Le guide, senza telefonate",
    description:
      "L'allievo prenota dall'app sugli orari che hai deciso tu: la guida compare in agenda già con istruttore e mezzo.",
    illustration: <AppuntamentoArt />,
  },
  esame: {
    title: "Esami con l'esito in un tap",
    description:
      "Metti l'esame in agenda e, appena finito, segni idoneo o respinto: il percorso dell'allievo si aggiorna da solo.",
    illustration: <EsameArt />,
  },
  blocco: {
    title: "Blocca uno slot, e nessuno lo prende",
    description:
      "Riunioni, manutenzione, un'ora che non vuoi dare: lo slot diventa non prenotabile senza spiegazioni a nessuno.",
    illustration: <BloccoArt />,
  },
  teoria: {
    title: "Lezioni di teoria con le presenze",
    description:
      "Metti la lezione in aula, gli allievi la vedono nell'app e tu segni chi c'era: le presenze restano nel registro.",
    illustration: <TeoriaArt />,
  },
  gruppo: {
    title: "Una guida, più allievi",
    description:
      "Apri i posti e gli allievi si iscrivono da soli. Il mezzo viene assegnato in automatico a chi può guidarlo.",
    illustration: <GruppoArt />,
  },
  festivo: {
    title: "I giorni di chiusura, una volta sola",
    description:
      "Segni il giorno come festivo e sparisce dalle disponibilità di tutti: nessuno può più prenotarci sopra.",
    illustration: <FestivoArt />,
  },
};

/* ── La voce ────────────────────────────────────────────────────────── */

/**
 * Riga bloccata del menu "+" che apre il suo cartello.
 *
 * Il pannello si apre **a sinistra** della voce: il menu "+" sta in alto a
 * destra, a destra non ci sarebbe spazio. Hover con ritardo alla chiusura,
 * click che aggancia (serve al touch), Esc e click fuori che chiudono — la
 * stessa meccanica di `LockedMenuItem`, per gli stessi motivi.
 */
export function LockedPlusItem({
  tip,
  icon,
  label,
  compact,
}: {
  tip: PlusTipKey;
  icon: React.ReactNode;
  label: string;
  /** Il menu del click su slot è più stretto: testo e spaziature calano. */
  compact?: boolean;
}) {
  const spec = PLUS_TIPS[tip];
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
    let left = r.left - TIP_WIDTH - TIP_GAP;
    // Se a sinistra non ci sta, si mette a destra della voce.
    if (left < 12) left = Math.min(r.right + TIP_GAP, window.innerWidth - TIP_WIDTH - 12);
    setPos({ top: Math.max(12, r.top - 40), left });
  }, [cancelClose, tip]);

  const close = React.useCallback(() => {
    cancelClose();
    setPinned(false);
    setPos(null);
  }, [cancelClose]);

  const scheduleClose = React.useCallback(() => {
    if (pinned) return;
    cancelClose();
    timer.current = setTimeout(() => setPos(null), CLOSE_DELAY_MS);
  }, [cancelClose, pinned]);

  React.useEffect(() => {
    const onOther = (key: string) => {
      if (key === tip) return;
      cancelClose();
      setPinned(false);
      setPos(null);
    };
    listeners.add(onOther);
    return () => {
      listeners.delete(onOther);
    };
  }, [tip, cancelClose]);

  // Se sborda sotto, risale.
  React.useLayoutEffect(() => {
    if (!pos || !panelRef.current) return;
    const h = panelRef.current.getBoundingClientRect().height;
    if (pos.top + h > window.innerHeight - 12) {
      setPos((cur) => (cur ? { ...cur, top: Math.max(12, window.innerHeight - h - 12) } : cur));
    }
  }, [pos]);

  React.useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || ref.current?.contains(t)) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [pinned, close]);

  React.useEffect(() => cancelClose, [cancelClose]);

  return (
    <>
      <div
        ref={ref}
        data-testid="locked-plus-item"
        title="Funzione extra di Reglo"
        onMouseEnter={open}
        onMouseLeave={scheduleClose}
        onClick={(e) => {
          // Il menu non deve chiudersi: si porterebbe via il pannello.
          e.preventDefault();
          e.stopPropagation();
          setPinned(true);
          open();
        }}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2.5 font-medium text-[#9a9a9a] transition-colors hover:bg-[#f7f7f7]",
          compact ? "rounded-[8px] px-3 py-2 text-xs" : "rounded-[8px] px-3.5 py-2.5 text-sm",
        )}
      >
        {icon}
        {label}
        <span className="ml-auto flex shrink-0 items-center">
          <svg
            width={compact ? 14 : 15}
            height={compact ? 14 : 15}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#bdbdbd"
            strokeWidth={2.1}
            strokeLinecap="round"
            aria-hidden
          >
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </span>
      </div>

      {pos
        ? createPortal(
            <div
              ref={panelRef}
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleClose}
              style={{ top: pos.top, left: pos.left, width: TIP_WIDTH }}
              className="fixed z-[540] rounded-[16px] border border-[#ececec] bg-white p-[18px] leading-[normal] tracking-normal shadow-[0_14px_40px_rgba(0,0,0,0.18)]"
            >
              {/* Ponte invisibile sullo stacco, a destra: il cursore non passa dal vuoto. */}
              <span
                aria-hidden
                className="absolute inset-y-0 left-full"
                style={{ width: TIP_GAP }}
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

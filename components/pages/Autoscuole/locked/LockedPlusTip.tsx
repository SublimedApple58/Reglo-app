"use client";

/**
 * Cartelli delle voci **bloccate del menu "+"** dell'agenda (REG-429).
 *
 * Prima erano righe inerti: icona, etichetta, lucchetto, e al click non
 * succedeva niente. Ora ognuna apre il suo cartello — titolo, spiegazione,
 * una mini-illustrazione e in fondo lucchetto + "Attiva Reglo" — come già
 * fanno gli strumenti della toolbar.
 *
 * **Vengono dal prototipo**, dove si aprono **al passaggio del mouse** — ed è
 * il motivo per cui al primo giro non li avevo trovati: cercandoli nel
 * sorgente come testo non compaiono, sono in `sc-if nuovoTipIs*` dentro un
 * pannello costruito a runtime. Il prototipo va aperto, non letto: è la stessa
 * lezione di `#istr-detail-view`.
 *
 * Guscio identico al prototipo: 300px, bordo `#ececec`, raggio 16, padding 18,
 * ombra `0 14px 40px`, titolo 14.5/700, testo 12.5/500 interlinea 1.5, e si
 * apre a sinistra con 10px di stacco (`right: 100%; padding-right: 10px`).
 *
 * ⚠️ Fa eccezione **Lezione teorica**: il menu bloccato del prototipo ha
 * cinque voci e quella non c'è: esiste solo nell'agenda vera, quindi il suo
 * testo è scritto da noi. Se il prototipo un giorno la prevedesse, va
 * **sostituito**.
 *
 * Il guscio è identico a `LockedToolbarTip` di proposito: due pannelli diversi
 * nella stessa agenda si noterebbero.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import Image from "next/image";

import { cn } from "@/lib/utils";
import { ATTIVA_REGLO_URL } from "./locked-features";

const NERO = "#222222";
const TIP_WIDTH = 300;
/** Stacco fra voce e pannello: è anche il vuoto che il cursore attraversa. */
const TIP_GAP = 10;
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

/** Il riquadro del prototipo: bordo #f0f0f0, raggio 12, padding 12/14. */
const Frame = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("mt-3 rounded-[12px] border border-[#f0f0f0] p-[12px_14px]", className)}>
    {children}
  </div>
);

/** Pastiglia durata: selezionata nera, le altre grigie. */
const Durata = ({ children, on }: { children: React.ReactNode; on?: boolean }) => (
  <span
    className={cn(
      "rounded-[16px] px-2.5 py-1.5 text-[10.5px] font-semibold",
      on ? "bg-[#222222] text-white" : "bg-[#f2f2f2] text-[#6a6a6a]",
    )}
  >
    {children}
  </span>
);

/** Interruttore acceso del prototipo: 30×17, pallino 13. */
const Acceso = () => (
  <span className="relative h-[17px] w-[30px] shrink-0 rounded-[9px] bg-[#222222]">
    <span className="absolute right-[2px] top-[2px] size-[13px] rounded-full bg-white" />
  </span>
);

/** "Una volta finito l'esame? Scopri" — lo Scopri è sottolineato. */
const Domanda = ({ children, link }: { children: React.ReactNode; link: string }) => (
  <p className="mt-2.5 text-[11.5px] font-medium leading-[1.5] text-[#6a6a6a]">
    {children}{" "}
    <span className="font-bold text-[#222222] underline underline-offset-2">{link}</span>
  </p>
);

const CalendarIcon = () => (
  <svg width="11" height="11" viewBox="0 0 13 13" fill="none" className="shrink-0" aria-hidden>
    <rect x="1" y="2" width="11" height="10" rx="1.5" stroke="#929292" strokeWidth="1.3" />
    <path d="M4 1v2.5M9 1v2.5M1 6h11" stroke="#929292" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

const EsameArt = () => (
  <Frame>
    <div className="flex gap-1.5">
      <div className="flex flex-1 items-center gap-1.5 rounded-[9px] border border-[#e6e6e6] px-2.5 py-[7px] text-[11.5px] font-semibold text-[#222222]">
        <CalendarIcon />
        20 giu 2026
      </div>
      <div className="rounded-[9px] border border-[#e6e6e6] px-2.5 py-[7px] text-[11.5px] font-semibold text-[#222222]">
        09:00
      </div>
    </div>
    <div className="mt-[9px] flex gap-1">
      <Durata>45m</Durata>
      <Durata on>1h</Durata>
      <Durata>1h30</Durata>
      <Durata>2h</Durata>
    </div>
    <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-[20px] border border-[#e6e6e6] px-[13px] py-[7px] text-[11.5px] font-semibold text-[#222222]">
      + Sfoglia allievi · 260
    </div>
  </Frame>
);

const BloccoArt = () => (
  <Frame>
    <div className="flex gap-1">
      <Durata>1h</Durata>
      <Durata>1h30</Durata>
      <Durata on>2h</Durata>
    </div>
    <div className="mt-2.5 rounded-[10px] border-[1.5px] border-dashed border-[#b9b9c4] bg-[#f6f6f9] p-[10px_12px]">
      <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-[#222222]">
        <span className="size-[7px] rounded-full bg-[#b0b0bc]" />
        08:00 – 10:00
      </div>
      <div className="mt-0.5 text-[11px] font-medium text-[#6a6a6a]">Riunione in Motorizzazione</div>
    </div>
    <div className="mt-2.5 flex items-center gap-2 rounded-[10px] border border-[#f0f0f0] p-[8px_10px]">
      <span className="flex-1 text-[10.5px] font-semibold leading-[1.4] text-[#222222]">
        Evento ricorrente
      </span>
      <Acceso />
    </div>
  </Frame>
);

const GruppoArt = () => (
  <>
    <Frame>
      <div className="flex gap-[7px]">
        <div className="flex-1 rounded-[10px] border-[1.5px] border-[#7fd3c3] bg-[#f3fbf9] p-[8px_10px]">
          <div className="text-[11.5px] font-bold text-[#222222]">Standard</div>
          <div className="text-[10px] font-medium text-[#929292]">1 veicolo</div>
        </div>
        <div className="flex-1 rounded-[10px] border border-[#e6e6e6] p-[8px_10px]">
          <div className="text-[11.5px] font-bold text-[#222222]">Moto</div>
          <div className="text-[10px] font-medium text-[#929292]">flotta + auto</div>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-2 rounded-[10px] border border-[#d9f0ea] bg-[#f6fcfa] p-[8px_10px]">
        <span className="flex-1 text-[10.5px] font-semibold leading-[1.4] text-[#222222]">
          Apri i posti rimanenti agli inviti
        </span>
        <Acceso />
      </div>
      <div className="mt-2 text-[10.5px] font-medium text-[#929292]">
        1 istruttore · 1 veicolo · fino a 3 allievi
      </div>
    </Frame>
    {/* Il cartellino "novità" del prototipo, con la sua illustrazione. */}
    <div className="relative mt-3 overflow-hidden rounded-[12px] bg-[#101018]">
      <span className="absolute right-2 top-2 z-[2] flex size-[22px] items-center justify-center rounded-full bg-white/[0.18]">
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2 2l8 8M10 2l-8 8" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      <Image
        src="/images/locked/gruppo-news.png"
        alt=""
        width={512}
        height={288}
        className="block h-[92px] w-full object-cover object-[center_0%]"
      />
      <div className="p-[12px_14px_13px]">
        <div className="text-[9.5px] font-bold uppercase tracking-[0.8px] text-[#8a8a98]">
          Anteprima · Novità
        </div>
        <div className="mt-[3px] text-[13px] font-bold text-white">Guide di gruppo</div>
        <div className="mt-0.5 text-[11px] font-medium leading-[1.4] text-[#9a9aa8]">
          Più allievi, una sola uscita: guarda la news
        </div>
      </div>
    </div>
  </>
);

const FestivoArt = () => (
  <Frame>
    <div className="flex items-center gap-[7px] rounded-[9px] border border-[#fde9b8] bg-[#fffbeb] p-[7px_10px]">
      <span className="text-[12px]">✈️</span>
      <span className="text-[10.5px] font-bold text-[#b45309]">
        Giorno festivo · FERIE AZIENDALI
      </span>
    </div>
    <div className="mt-2.5 grid grid-cols-7 gap-[3px] text-center">
      {["L", "M", "M", "G", "V", "S", "D"].map((g, i) => (
        <span key={i} className="text-[9px] font-bold text-[#b0b0b0]">
          {g}
        </span>
      ))}
      <span className="py-1 text-[10.5px] font-semibold text-[#444444]">10</span>
      <span className="py-1 text-[10.5px]">🌴</span>
      <span className="py-1 text-[10.5px]">🌴</span>
      <span className="py-1 text-[10.5px]">🌴</span>
      <span className="py-1 text-[10.5px] font-semibold text-[#444444]">14</span>
      <span className="py-1 text-[10.5px] font-semibold text-[#c8c8c8]">15</span>
      <span className="py-1 text-[10.5px] font-semibold text-[#c8c8c8]">16</span>
    </div>
    <p className="mt-2 text-[10.5px] font-medium leading-[1.4] text-[#929292]">
      Le prenotazioni si chiudono da sole nei giorni segnati.
    </p>
  </Frame>
);

/**
 * Appuntamento: la mini-agenda del prototipo — colonna delle ore, tre righe,
 * una guida già in agenda e quella che stai creando, tratteggiata e "NUOVA".
 */
const AppuntamentoArt = () => (
  <div className="mt-3 overflow-hidden rounded-[12px] border border-[#f0f0f0] p-[12px_0_12px_8px]">
    <div className="flex gap-2">
      <div className="flex w-[34px] shrink-0 flex-col gap-[26px] pt-0.5 text-right">
        {["15:00", "16:00", "17:00"].map((h) => (
          <span key={h} className="text-[9.5px] font-medium text-[#b0b0b0]">
            {h}
          </span>
        ))}
      </div>
      <div className="relative h-[104px] flex-1 border-l border-[#f0f0f0]">
        {[7, 44, 81].map((t) => (
          <span key={t} style={{ top: t }} className="absolute inset-x-0 border-t border-[#f3f3f3]" />
        ))}
        <div className="absolute left-[6px] right-[10px] top-[9px] h-[31px] rounded-[6px] bg-[#FCEFC7] p-[4px_8px]">
          <div className="text-[10px] font-semibold text-[#333333]">Allievo 12</div>
          <div className="text-[8.5px] text-[#999999]">15:00-16:00</div>
        </div>
        <div className="absolute left-[6px] right-[10px] top-[46px] h-[31px] rounded-[6px] border-[1.5px] border-dashed border-[#222222] bg-white p-[3px_8px] shadow-[0_4px_10px_rgba(0,0,0,0.12)]">
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-[#222222]">Allievo 27</span>
            <span className="rounded-[6px] bg-[#222222] px-[5px] py-px text-[8px] font-bold text-white">
              NUOVA
            </span>
          </div>
          <div className="text-[8.5px] text-[#888888]">16:00-17:00 · Istruttore 4</div>
        </div>
      </div>
    </div>
  </div>
);

/**
 * Lezione teorica: **l'unica scritta da noi.** Non è una voce del prototipo —
 * il suo menu bloccato ne ha cinque, questa no — ma esiste nell'agenda vera
 * (`AutoscuoleAgendaPage`, crea un blocco `kind: "theory"`) e quindi compare
 * nel menu finto dello scope Autoscuola. Se il prototipo un giorno la
 * prevedesse, questo testo va **sostituito**.
 */
const TeoriaArt = () => (
  <Frame>
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-[#f3f0ff] text-[15px]">
        📚
      </span>
      <div className="flex -space-x-1.5">
        {["#c7d2fe", "#bfdbfe", "#bbf7d0", "#fde68a"].map((c) => (
          <span key={c} style={{ background: c }} className="size-[22px] rounded-full ring-2 ring-white" />
        ))}
        <span className="flex size-[22px] items-center justify-center rounded-full bg-[#eeeef3] text-[9px] font-bold text-[#6a6a6a] ring-2 ring-white">
          +9
        </span>
      </div>
    </div>
  </Frame>
);

/* ── I contenuti ────────────────────────────────────────────────────── */

export type PlusTipKey =
  | "richiesta"
  | "appuntamento"
  | "esame"
  | "blocco"
  | "teoria"
  | "gruppo"
  | "festivo";

type PlusTipSpec = {
  title: string;
  description: string;
  illustration: React.ReactNode;
  /**
   * Niente "Attiva Reglo" in fondo. Nel prototipo è escluso per la sola
   * "Richiesta di guida" (`nuovoTipShowCta: key !== 'richiesta'`), ed è giusto:
   * quella funzione ce l'hanno già, invitarli ad attivarla sarebbe assurdo.
   */
  noCta?: boolean;
};

export const PLUS_TIPS: Record<PlusTipKey, PlusTipSpec> = {
  richiesta: {
    title: "Richiesta di guida",
    description:
      "Le guide le possiede il consorzio: scegli uno slot libero, il veicolo e l\u2019allievo. La richiesta resta in attesa finché il consorzio risponde.",
    illustration: null,
    noCta: true,
  },
  appuntamento: {
    title: "Appuntamento",
    description:
      "Inserisci guide e appuntamenti a mano direttamente in agenda: allievo, istruttore, veicolo e orario in pochi tap.",
    illustration: <AppuntamentoArt />,
  },
  esame: {
    title: "Nuovo esame",
    description:
      "Pianifichi un esame per uno o più allievi: data, orario, durata e istruttore accompagnatore. Gli iscritti lo vedono subito in app.",
    illustration: (
      <>
        <EsameArt />
        <Domanda link="Scopri">Una volta finito l&apos;esame?</Domanda>
      </>
    ),
  },
  blocco: {
    title: "Evento bloccante",
    description:
      "Blocchi l'agenda di uno o tutti gli istruttori per un impegno: riunione, visita medica, commissione. Anche ricorrente.",
    illustration: <BloccoArt />,
  },
  teoria: {
    title: "Lezione teorica",
    description:
      "Metti la lezione in aula, gli allievi la vedono nell'app e tu segni chi c'era: le presenze restano nel registro.",
    illustration: <TeoriaArt />,
  },
  gruppo: {
    title: "Guida di gruppo",
    description:
      "Una sola uscita, più allievi: scegli capienza e veicolo, pre-inserisci gli allievi o apri i posti agli inviti.",
    illustration: <GruppoArt />,
  },
  festivo: {
    title: "Segna festivo",
    description:
      "Chiudi un giorno o un periodo: niente prenotazioni e agenda pulita, con ferie ed eventi ben visibili.",
    illustration: (
      <>
        <FestivoArt />
        <Domanda link="Scopri">Come segno e gestisco le ferie?</Domanda>
      </>
    ),
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
  locked = true,
  onSelect,
}: {
  tip: PlusTipKey;
  icon: React.ReactNode;
  label: string;
  /** Il menu del click su slot è più stretto: testo e spaziature calano. */
  compact?: boolean;
  /**
   * `false` per una voce **vera**: resta cliccabile e senza lucchetto, ma al
   * passaggio del mouse spiega comunque cosa fa. Nel prototipo ce l'ha
   * "Richiesta di guida", l'unica voce non bloccata dello scope Consorzio.
   */
  locked?: boolean;
  onSelect?: () => void;
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
          if (!locked) {
            // Voce vera: fa il suo mestiere, il pannello era solo una spiegazione.
            close();
            onSelect?.();
            return;
          }
          // Il menu non deve chiudersi: si porterebbe via il pannello.
          e.preventDefault();
          e.stopPropagation();
          setPinned(true);
          open();
        }}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2.5 font-medium transition-colors hover:bg-[#f7f7f7]",
          locked ? "text-[#9a9a9a]" : "text-foreground",
          compact ? "rounded-[8px] px-3 py-2 text-xs" : "rounded-[8px] px-3.5 py-2.5 text-sm",
        )}
      >
        {icon}
        {label}
        <span className={cn("ml-auto flex shrink-0 items-center", !locked && "hidden")}>
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
              {spec.noCta ? null : (
                <>
              <div className="mb-3 mt-3.5 h-px bg-[#f0f0f0]" />
              <div className="flex items-center gap-2">
                <Padlock />
                <span className="flex-1 whitespace-nowrap text-[12px] font-bold text-[#222222]">
                  Funzione extra di Reglo
                </span>
                <a
                  href={ATTIVA_REGLO_URL}
                  target="_blank"
                  rel="noreferrer"
                  style={{ backgroundColor: NERO }}
                  className="rounded-[32px] px-4 py-2 text-[12px] font-bold text-white transition-colors hover:!bg-[#3a3a3a]"
                >
                  Attiva Reglo
                </a>
              </div>
                </>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

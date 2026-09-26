"use client";

/**
 * Voce del menu hamburger **bloccata** per una consorziata senza Reglo
 * (REG-429, Fase 6).
 *
 * La voce resta dov'è, con la sua icona: cambia solo che è grigia, porta un
 * lucchetto a destra e non naviga. Al passaggio del mouse si apre a sinistra
 * il dialogo del prototipo — titolo, descrizione, anteprima della funzione,
 * "Funzione extra di Reglo" e il CTA che porta al calendario di attivazione.
 *
 * Il pannello è in un portal con posizione calcolata dal rettangolo della
 * voce: dentro il dropdown di Radix un popover annidato si chiuderebbe al
 * primo mouseover, ed è il motivo per cui qui non si usa HoverCard.
 *
 * ⚠️ **Il CTA dev'essere raggiungibile col mouse.** Il primo giro chiudeva il
 * pannello sul `mouseleave` della voce: attraversando i 24px di stacco fra
 * voce e pannello il cursore usciva da entrambi e il pannello spariva prima di
 * arrivarci — "Attiva Reglo" era letteralmente impossibile da premere
 * (segnalato da Tiziano). Ora:
 *
 * - la chiusura è **ritardata di 220ms** e viene annullata se il cursore entra
 *   nel pannello: i due elementi si comportano come un'area sola;
 * - un **click sulla voce** lo aggancia (`pinned`), e da lì resta finché non
 *   si clicca fuori o si preme Esc — serve al touch, dove `mouseleave` non
 *   esiste;
 * - da tastiera il focus apre e il pannello resta finché il focus non lascia
 *   sia la voce sia il pannello.
 */

import * as React from "react";
import { createPortal } from "react-dom";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  ATTIVA_REGLO_URL,
  LOCKED_FEATURES,
  type LockedFeatureKey,
} from "./locked-features";

const PADLOCK_SIZE = 15;

function Padlock({ size = PADLOCK_SIZE, stroke = "#bdbdbd" }: { size?: number; stroke?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={2.1}
      strokeLinecap="round"
      aria-hidden
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/**
 * Una voce alla volta. Le voci sono componenti sorelle senza stato condiviso:
 * senza questo, agganciandone una col click e passando su un'altra si
 * ritroverebbero due pannelli aperti insieme.
 */
const listeners = new Set<(openKey: string) => void>();
const announceOpen = (key: string) => listeners.forEach((fn) => fn(key));

const TIP_WIDTH = 296;
/** Stacco fra voce e pannello. È anche il vuoto che il cursore deve attraversare. */
const TIP_GAP = 24;
/** Quanto il pannello sopravvive al cursore che lo sta raggiungendo. */
const CLOSE_DELAY_MS = 220;

export function LockedMenuItem({
  feature,
  icon,
  label,
}: {
  feature: LockedFeatureKey;
  icon: React.ReactNode;
  /** Se assente si usa il titolo della funzione (identico nel prototipo). */
  label?: string;
}) {
  const data = LOCKED_FEATURES[feature];
  const ref = React.useRef<HTMLDivElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = React.useState<{ top: number; left: number } | null>(null);
  /** Agganciato col click/tap: ignora l'uscita del mouse. */
  const [pinned, setPinned] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const open = React.useCallback(() => {
    cancelClose();
    announceOpen(feature);
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Il pannello è alto quanto il suo contenuto: si ancora in alto alla voce
    // e si riallinea da solo se sborda sotto (vedi effetto sotto).
    setTip({ top: Math.max(12, r.top - 60), left: Math.max(12, r.left - TIP_WIDTH - TIP_GAP) });
  }, [cancelClose, feature]);

  /** Chiude, ma solo dopo il ritardo: il tempo di attraversare lo stacco. */
  const scheduleClose = React.useCallback(() => {
    if (pinned) return;
    cancelClose();
    closeTimer.current = setTimeout(() => setTip(null), CLOSE_DELAY_MS);
  }, [cancelClose, pinned]);

  const close = React.useCallback(() => {
    cancelClose();
    setPinned(false);
    setTip(null);
  }, [cancelClose]);

  React.useEffect(() => () => cancelClose(), [cancelClose]);

  // Un'altra voce si è aperta: questa si chiude, agganciata o no.
  React.useEffect(() => {
    const onOther = (openKey: string) => {
      if (openKey === feature) return;
      cancelClose();
      setPinned(false);
      setTip(null);
    };
    listeners.add(onOther);
    return () => {
      listeners.delete(onOther);
    };
  }, [feature, cancelClose]);

  React.useLayoutEffect(() => {
    if (!tip || !panelRef.current) return;
    const h = panelRef.current.getBoundingClientRect().height;
    const max = window.innerHeight - h - 12;
    if (tip.top > max) setTip((cur) => (cur ? { ...cur, top: Math.max(12, max) } : cur));
  }, [tip]);

  // Agganciato: si chiude con Esc o con un click fuori (voce e pannello
  // esclusi). È il comportamento di un popover vero, che è quello che uno si
  // aspetta dopo aver cliccato.
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
      <DropdownMenuItem
        ref={ref}
        onMouseEnter={open}
        onMouseLeave={scheduleClose}
        onFocus={open}
        onBlur={scheduleClose}
        // Non naviga: la funzione non c'è. Il dropdown però non deve chiudersi,
        // altrimenti il pannello sparirebbe insieme a lui. Il click aggancia il
        // pannello (touch e "ci torno fra un attimo").
        onSelect={(event) => {
          event.preventDefault();
          setPinned(true);
          open();
        }}
        className="cursor-default gap-3 rounded-xl px-3 py-2.5 text-[#9a9a9a] focus:bg-[#f4f4f4] focus:text-[#9a9a9a] [&_svg]:stroke-[#bdbdbd]"
      >
        {icon}
        <span className="text-[15px] font-medium">{label ?? data.title}</span>
        <span className="ml-auto flex shrink-0 items-center">
          <Padlock />
        </span>
      </DropdownMenuItem>

      {tip
        ? createPortal(
            <div
              ref={panelRef}
              // Il pannello fa parte dell'area di hover: entrarci annulla la
              // chiusura, uscirne la rimette in coda.
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleClose}
              onFocusCapture={cancelClose}
              onBlurCapture={scheduleClose}
              style={{ top: tip.top, left: tip.left, width: TIP_WIDTH }}
              className="fixed z-[80] rounded-[20px] bg-white p-[18px] shadow-[0_22px_60px_rgba(10,20,30,0.26)]"
            >
              {/* Ponte invisibile sullo stacco fra pannello e voce: il cursore
                  non passa mai per il vuoto, quindi non esce dall'area. */}
              <span
                aria-hidden
                className="absolute top-0 h-full"
                style={{ left: "100%", width: TIP_GAP }}
              />
              <p className="mb-1.5 text-[16px] font-bold text-foreground">{data.title}</p>
              <p className="mb-3.5 text-[13px] leading-[1.45] text-muted-foreground">
                {data.description}
              </p>
              {data.preview}
              <div className="my-3.5 h-px bg-[#f0f0f0]" />
              <p className="mb-1.5 flex items-center gap-2 text-[14px] font-bold text-foreground">
                <Padlock size={16} stroke="#222222" />
                Funzione extra di Reglo
              </p>
              <p className="mb-3.5 text-[13px] leading-[1.45] text-muted-foreground">
                Attiva Reglo per sbloccare questa e tutte le altre funzioni.
              </p>
              <a
                href={ATTIVA_REGLO_URL}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "block rounded-[32px] bg-[#222222] py-3 text-center text-[14px] font-bold text-white",
                  "transition-opacity hover:opacity-90",
                )}
              >
                Attiva Reglo
              </a>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

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

const TIP_WIDTH = 296;
const TIP_GAP = 24;

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
  const [tip, setTip] = React.useState<{ top: number; left: number } | null>(null);

  const open = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Il pannello è alto quanto il suo contenuto: si ancora in alto alla voce
    // e si riallinea da solo se sborda sotto (vedi effetto sotto).
    setTip({ top: Math.max(12, r.top - 60), left: Math.max(12, r.left - TIP_WIDTH - TIP_GAP) });
  }, []);

  const panelRef = React.useRef<HTMLDivElement | null>(null);
  React.useLayoutEffect(() => {
    if (!tip || !panelRef.current) return;
    const h = panelRef.current.getBoundingClientRect().height;
    const max = window.innerHeight - h - 12;
    if (tip.top > max) setTip((cur) => (cur ? { ...cur, top: Math.max(12, max) } : cur));
  }, [tip]);

  return (
    <>
      <DropdownMenuItem
        ref={ref}
        onMouseEnter={open}
        onMouseLeave={() => setTip(null)}
        onFocus={open}
        onBlur={() => setTip(null)}
        // Non naviga: la funzione non c'è. Il dropdown però non deve chiudersi,
        // altrimenti il pannello sparirebbe insieme a lui.
        onSelect={(event) => event.preventDefault()}
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
              style={{ top: tip.top, left: tip.left, width: TIP_WIDTH }}
              className="fixed z-[80] rounded-[20px] bg-white p-[18px] shadow-[0_22px_60px_rgba(10,20,30,0.26)]"
            >
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

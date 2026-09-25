"use client";

/**
 * Presentazione condivisa dello **stato di accesso** di un'autoscuola
 * consorziata (REG-454): la usa la tabella della sezione Autoscuole, il blocco
 * "Accesso a Reglo" del dettaglio scuola e, con le stesse parole, il
 * backoffice.
 *
 * Il consorzio vede soltanto *se* il titolare può entrare — mai una password,
 * che nasce e resta dal lato del titolare.
 */

import type { AffiliateAccessStatus } from "@/lib/actions/consorzio-affiliate.actions";
import { cn } from "@/lib/utils";

export const ACCESS_LABEL: Record<AffiliateAccessStatus, string> = {
  not_linked: "Non collegata",
  not_invited: "Da invitare",
  invited: "Invitata",
  expired: "Invito scaduto",
  active: "Accede",
};

const TONE: Record<AffiliateAccessStatus, string> = {
  not_linked: "border-[#e2e2e2] bg-[#f6f6f6] text-[#6a6a6a]",
  not_invited: "border-[#e2e2e2] bg-[#f6f6f6] text-[#6a6a6a]",
  invited: "border-[#f3dcb0] bg-[#fdf6e8] text-[#96650f]",
  expired: "border-[#fad4cc] bg-[#fff4f2] text-[#c13515]",
  active: "border-[#c5e8d4] bg-[#f0faf4] text-[#1a7f50]",
};

export function AccessBadge({
  status,
  className,
}: {
  status: AffiliateAccessStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-[3px] text-[11.5px] font-bold",
        TONE[status],
        className,
      )}
    >
      {ACCESS_LABEL[status]}
    </span>
  );
}

/** Filtro della sezione Autoscuole: "Accedono" è l'unico stato positivo. */
export type AccessFilter = "all" | "active" | "pending";

export const matchesAccessFilter = (
  filter: AccessFilter,
  status: AffiliateAccessStatus | undefined,
): boolean => {
  if (filter === "all") return true;
  if (filter === "active") return status === "active";
  // "Da invitare" raccoglie tutto ciò che non permette ancora di entrare:
  // non invitata, invito scaduto e anche non collegata — per il consorzio sono
  // la stessa cosa da fare, non tre.
  return status !== "active";
};

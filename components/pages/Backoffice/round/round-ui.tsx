"use client";

import { Check } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  OWNER_LABEL,
  ROUND_OWNERS,
  STATUS_COLOR,
  STATUS_LABEL,
  type RoundOwner,
  type RoundStatus,
} from "@/lib/round/round-constants";
import { cn } from "@/lib/utils";

/**
 * Primitivi del Round pre-seed: bianco e nero, un pallino di stato e le
 * iniziali di chi se ne occupa. Niente bordi dove basta lo spazio.
 */

const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

export const shortDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const thisYear = new Date().getFullYear();
  return `${d} ${MONTHS[m - 1]}${y !== thisYear ? ` ${y}` : ""}`;
};

/** L'ordine del menu: il percorso, poi gli stati fuori percorso. */
const MENU_GROUPS: RoundStatus[][] = [
  ["da_contattare", "contattato", "risposto", "call", "interessato", "impegno"],
  ["bloccato", "in_pausa", "no"],
];

export function StatusDot({ status, className }: { status: RoundStatus; className?: string }) {
  const hollow = status === "da_contattare" || status === "no" || status === "in_pausa";
  return (
    <span
      aria-hidden
      className={cn("inline-block h-[7px] w-[7px] shrink-0 rounded-full", className)}
      style={
        hollow
          ? { boxShadow: `inset 0 0 0 1.25px ${status === "da_contattare" ? "#a1a1aa" : "#d4d4d8"}` }
          : { backgroundColor: STATUS_COLOR[status] }
      }
    />
  );
}

/** Lo stato come testo: si cambia con un clic, senza pastiglie né bordi. */
export function StatusMenu({
  value,
  onChange,
  disabled,
  align = "start",
}: {
  value: RoundStatus;
  onChange: (status: RoundStatus) => void;
  disabled?: boolean;
  align?: "start" | "end";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "-mx-2.5 inline-flex h-11 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full px-2.5 text-[13.5px] transition-colors hover:bg-[#f4f4f5] disabled:cursor-wait disabled:opacity-50 md:h-9",
            value === "bloccato" ? "text-[#9a3412]" : value === "no" || value === "in_pausa" ? "text-[#a1a1aa]" : "text-[#111111]",
          )}
        >
          <StatusDot status={value} />
          {STATUS_LABEL[value]}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-[200px] p-1" onClick={(e) => e.stopPropagation()}>
        {MENU_GROUPS.map((group, i) => (
          <div key={i}>
            {i ? <DropdownMenuSeparator className="my-1 bg-[#f0f0f1]" /> : null}
            {group.map((s) => (
              <DropdownMenuItem
                key={s}
                onSelect={() => s !== value && onChange(s)}
                className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13.5px] text-[#111111]"
              >
                <StatusDot status={s} />
                <span className="flex-1">{STATUS_LABEL[s]}</span>
                {s === value ? <Check className="h-3.5 w-3.5" /> : null}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const OWNER_STYLE: Record<RoundOwner, string> = {
  tiziano: "bg-[#111111] text-white",
  gabriele: "bg-[#ececee] text-[#111111]",
  hiro: "bg-white text-[#111111] ring-1 ring-inset ring-[#d4d4d8]",
};

export function OwnerAvatar({ owner, size = 26 }: { owner: RoundOwner | null; size?: number }) {
  return (
    <span
      title={owner ? OWNER_LABEL[owner] : "Nessuno"}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium",
        owner ? OWNER_STYLE[owner] : "border border-dashed border-[#d4d4d8]",
      )}
    >
      {owner ? OWNER_LABEL[owner].charAt(0) : ""}
    </span>
  );
}

export function OwnerMenu({
  value,
  onChange,
  disabled,
  showName,
}: {
  value: RoundOwner | null;
  onChange: (owner: RoundOwner | null) => void;
  disabled?: boolean;
  showName?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="Chi se ne occupa"
          className={cn(
            "inline-flex h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-full text-[13.5px] text-[#111111] transition-colors hover:bg-[#f4f4f5] disabled:cursor-wait disabled:opacity-50 md:h-9 md:min-w-9",
            showName ? "-mx-1.5 px-1.5 pr-3" : "",
          )}
        >
          <OwnerAvatar owner={value} />
          {showName ? <span className={value ? "" : "text-[#a1a1aa]"}>{value ? OWNER_LABEL[value] : "Nessuno"}</span> : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[180px] p-1" onClick={(e) => e.stopPropagation()}>
        {[...ROUND_OWNERS, null].map((o) => (
          <DropdownMenuItem
            key={o ?? "none"}
            onSelect={() => o !== value && onChange(o)}
            className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[13.5px]"
          >
            <OwnerAvatar owner={o} size={22} />
            <span className={cn("flex-1", !o && "text-[#71717a]")}>{o ? OWNER_LABEL[o] : "Nessuno"}</span>
            {o === value ? <Check className="h-3.5 w-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

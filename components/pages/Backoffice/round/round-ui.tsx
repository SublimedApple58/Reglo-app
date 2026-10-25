"use client";

import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LEAD_ROLE_LABEL,
  OWNER_LABEL,
  ROUND_OWNERS,
  ROUND_STATUSES,
  STATUS_COLOR,
  STATUS_HINT,
  STATUS_LABEL,
  type LeadRole,
  type RoundOwner,
  type RoundStatus,
} from "@/lib/round/round-constants";
import { cn } from "@/lib/utils";

/**
 * Primitivi del Round pre-seed: stessa grammatica della Finanza (bianco/nero,
 * cifre tabular-nums), più un pallino di stato che si scurisce lungo l'imbuto.
 */

const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

export const shortDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const thisYear = new Date().getFullYear();
  return `${d} ${MONTHS[m - 1]}${y !== thisYear ? ` ${y}` : ""}`;
};

const dayIndex = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);

/** «oggi», «domani», «tra 3 giorni», «2 giorni fa». */
export const relativeDay = (ymd: string, today: string) => {
  const diff = dayIndex(ymd) - dayIndex(today);
  if (diff === 0) return "oggi";
  if (diff === 1) return "domani";
  if (diff === -1) return "ieri";
  if (diff > 1) return diff < 45 ? `tra ${diff} giorni` : `tra ${Math.round(diff / 30)} mesi`;
  return -diff < 45 ? `${-diff} giorni fa` : `${Math.round(-diff / 30)} mesi fa`;
};

export function StatusDot({ status, className }: { status: RoundStatus; className?: string }) {
  const hollow = status === "da_contattare" || status === "no" || status === "in_pausa";
  return (
    <span
      aria-hidden
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)}
      style={
        hollow
          ? { boxShadow: `inset 0 0 0 1.5px ${status === "da_contattare" ? "#a1a1aa" : "#c9c9cf"}` }
          : { backgroundColor: STATUS_COLOR[status] }
      }
    />
  );
}

export function StatusLabel({ status }: { status: RoundStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <StatusDot status={status} />
      <span className={cn(status === "no" && "text-[#71717a] line-through decoration-[#a1a1aa]")}>
        {STATUS_LABEL[status]}
      </span>
    </span>
  );
}

/** Pastiglia di stato che apre il menu: il cambio veloce dalla lista. */
export function StatusMenu({
  value,
  onChange,
  disabled,
  size = "md",
}: {
  value: RoundStatus;
  onChange: (status: RoundStatus) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "group inline-flex cursor-pointer items-center gap-1.5 rounded-full border bg-white font-medium text-[#111111] transition-colors hover:border-[#a1a1aa] disabled:cursor-wait disabled:opacity-60",
            value === "bloccato" ? "border-[#fed7aa] bg-[#fff7ed] text-[#9a3412]" : "border-[#e4e4e7]",
            size === "sm" ? "h-8 px-2.5 text-[12.5px]" : "h-9 px-3 text-[13px]",
          )}
        >
          <StatusLabel status={value} />
          <ChevronDown className="h-3.5 w-3.5 text-[#a1a1aa] transition-colors group-hover:text-[#52525b]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[280px] p-1.5" onClick={(e) => e.stopPropagation()}>
        {ROUND_STATUSES.map((s) => (
          <DropdownMenuItem
            key={s}
            onSelect={() => s !== value && onChange(s)}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2"
          >
            <StatusDot status={s} className="mt-[5px]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium text-[#111111]">{STATUS_LABEL[s]}</span>
              <span className="block text-[12px] leading-snug text-[#71717a]">{STATUS_HINT[s]}</span>
            </span>
            {s === value ? <Check className="mt-0.5 h-4 w-4 text-[#111111]" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const OWNER_STYLE: Record<RoundOwner, string> = {
  tiziano: "bg-[#111111] text-white",
  gabriele: "bg-[#e4e4e7] text-[#111111]",
  hiro: "bg-white text-[#111111] ring-1 ring-inset ring-[#111111]",
};

export function OwnerAvatar({ owner, size = 28 }: { owner: RoundOwner | null; size?: number }) {
  return (
    <span
      title={owner ? OWNER_LABEL[owner] : "Nessuno"}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        owner ? OWNER_STYLE[owner] : "border border-dashed border-[#c9c9cf] text-[#a1a1aa]",
      )}
    >
      {owner ? OWNER_LABEL[owner].charAt(0) : "–"}
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
          className="inline-flex h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-full px-1.5 text-[13px] text-[#3f3f46] transition-colors hover:bg-[#f4f4f5] disabled:cursor-wait disabled:opacity-60"
        >
          <OwnerAvatar owner={value} />
          {showName ? <span className="pr-1.5">{value ? OWNER_LABEL[value] : "Nessuno"}</span> : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px] p-1.5" onClick={(e) => e.stopPropagation()}>
        {[...ROUND_OWNERS, null].map((o) => (
          <DropdownMenuItem
            key={o ?? "none"}
            onSelect={() => o !== value && onChange(o)}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5"
          >
            <OwnerAvatar owner={o} size={24} />
            <span className="flex-1 text-[13.5px]">{o ? OWNER_LABEL[o] : "Nessuno"}</span>
            {o === value ? <Check className="h-4 w-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LeadBadge({ role }: { role: LeadRole | null }) {
  if (!role) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
        role === "lead_probabile" && "bg-[#111111] text-white",
        role === "lead_possibile" && "border border-[#111111] text-[#111111]",
        role === "follower" && "bg-[#f4f4f5] text-[#52525b]",
      )}
    >
      {LEAD_ROLE_LABEL[role]}
    </span>
  );
}

export function PriorityTag({ priority }: { priority: string | null }) {
  if (!priority) return null;
  return (
    <span
      title={`Priorità ${priority}`}
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded-[6px] text-[11px] font-bold tabular-nums",
        priority === "A" ? "bg-[#111111] text-white" : priority === "B" ? "bg-[#e4e4e7] text-[#111111]" : "bg-[#f4f4f5] text-[#a1a1aa]",
      )}
    >
      {priority}
    </span>
  );
}

/** Data del prossimo passo: arancio se scaduta, nero se entro una settimana. */
export function NextStep({ ymd, today, compact }: { ymd: string | null; today: string; compact?: boolean }) {
  if (!ymd) return <span className="text-[#d4d4d8]">—</span>;
  const overdue = ymd < today;
  const soon = !overdue && dayIndex(ymd) - dayIndex(today) <= 7;
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1.5 whitespace-nowrap tabular-nums",
        overdue ? "text-[#c2410c]" : soon ? "text-[#111111]" : "text-[#71717a]",
      )}
    >
      <span className="font-semibold">{shortDate(ymd)}</span>
      {compact ? null : <span className="text-[12px] opacity-80">{relativeDay(ymd, today)}</span>}
    </span>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[#111111]">{children}</h2>
      {aside ? <div className="text-[12.5px] text-[#71717a]">{aside}</div> : null}
    </div>
  );
}

/** Barra impilata degli stati (per tipologia). */
export function StatusStack({
  byStatus,
  total,
  className,
}: {
  byStatus: Record<RoundStatus, number>;
  total: number;
  className?: string;
}) {
  return (
    <div className={cn("flex h-2 w-full overflow-hidden rounded-full bg-[#f4f4f5]", className)}>
      {total
        ? ROUND_STATUSES.filter((s) => s !== "da_contattare" && byStatus[s]).map((s) => (
            <span
              key={s}
              title={`${STATUS_LABEL[s]}: ${byStatus[s]}`}
              style={{ width: `${(byStatus[s] / total) * 100}%`, backgroundColor: s === "no" || s === "in_pausa" ? "#d4d4d8" : STATUS_COLOR[s] }}
              className="h-full border-r border-white last:border-r-0"
            />
          ))
        : null}
    </div>
  );
}

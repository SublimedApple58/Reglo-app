"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Primitivi visivi della sezione Finanza (REG-413), dal mockup approvato:
 * bianco/nero, grigi neutri, un solo colore d'allarme (#c2410c) per ciò che è
 * scaduto. Niente blu. Le cifre sono sempre tabular-nums.
 */

export const FIN = {
  ink: "#111111",
  ink2: "#3f3f46",
  muted: "#71717a",
  faint: "#a1a1aa",
  line: "#e9e9eb",
  line2: "#f2f2f3",
  out: "#c9c9cf",
  warn: "#c2410c",
} as const;

/** Rampa di grigi per le categorie di spesa (dal più pesante). */
export const GREY_RAMP = ["#111111", "#52525b", "#a1a1aa", "#c9c9cf", "#e4e4e7", "#f1f1f2"];

export const euro = (cents: number, opts: { sign?: boolean; precise?: boolean } = {}) => {
  // `useGrouping: "always"`: in italiano Intl non separa le migliaia sotto i
  // 10.000 ("1220 €"); in una colonna di importi il punto serve sempre.
  const value = new Intl.NumberFormat("it-IT", {
    useGrouping: "always",
    minimumFractionDigits: opts.precise ? 2 : 0,
    maximumFractionDigits: opts.precise ? 2 : 0,
  }).format(Math.abs(cents) / 100);
  const sign = opts.sign ? (cents > 0 ? "+" : cents < 0 ? "−" : "") : cents < 0 ? "−" : "";
  return `${sign}${value} €`;
};

/** Euro con centesimi solo se ci sono: 1.200 € ma 12,50 €. */
export const euroSmart = (cents: number, opts: { sign?: boolean } = {}) =>
  euro(cents, { ...opts, precise: cents % 100 !== 0 });

const MONTHS = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

export const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const name = MONTHS[m - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
};

export const monthName = (ym: string) => MONTHS[Number(ym.split("-")[1]) - 1];

export const dayMonth = (ymd: string) => {
  const [, m, d] = ymd.split("-").map(Number);
  return { day: String(d).padStart(2, "0"), month: MONTHS[m - 1].slice(0, 3) };
};

export const fullDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

export function FinCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-[20px] border border-[#e9e9eb] bg-white", className)}>{children}</div>
  );
}

export function FinLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.12em] text-[#71717a]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MonthNav({
  value,
  onPrev,
  onNext,
}: {
  value: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-[#e9e9eb] bg-white p-1">
      <button
        type="button"
        aria-label="Mese precedente"
        onClick={onPrev}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[#3f3f46] hover:bg-[#f4f4f5]"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[132px] px-2 text-center text-sm font-semibold tabular-nums">
        {monthLabel(value)}
      </span>
      <button
        type="button"
        aria-label="Mese successivo"
        onClick={onNext}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[#3f3f46] hover:bg-[#f4f4f5]"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "outline" | "warn" | "dashed";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
        tone === "neutral" && "bg-[#f4f4f5] text-[#3f3f46]",
        tone === "outline" && "border border-[#d4d4d8] text-[#3f3f46]",
        tone === "warn" && "bg-[#fff7ed] text-[#c2410c]",
        tone === "dashed" && "border border-dashed border-[#a1a1aa] text-[#71717a]",
      )}
    >
      {children}
    </span>
  );
}

/** Stato vuoto curato: mai un numero finto al posto di un dato che manca. */
export function FinEmpty({
  icon,
  title,
  body,
  action,
  compact,
}: {
  icon?: ReactNode;
  title: string;
  body: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-6 py-10" : "px-6 py-16",
      )}
    >
      {icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#e9e9eb] bg-[#fafafa] text-[#3f3f46]">
          {icon}
        </div>
      ) : null}
      <div className="text-[15px] font-semibold text-[#111111]">{title}</div>
      <div className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-[#71717a]">{body}</div>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function FinButton({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-[#111111] text-white hover:bg-[#2a2a2a]",
        variant === "ghost" &&
          "border border-[#e9e9eb] bg-white text-[#111111] hover:border-[#d4d4d8] hover:bg-[#fafafa]",
        variant === "danger" && "text-[#c2410c] hover:bg-[#fff7ed]",
        className,
      )}
    />
  );
}

/** Campo del drawer: etichetta piccola sopra, aiuto grigio sotto. */
export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-[#3f3f46]">
        {label}
      </label>
      {children}
      {hint ? <div className="text-xs text-[#71717a]">{hint}</div> : null}
    </div>
  );
}

export const inputClass =
  "flex h-11 w-full rounded-lg border border-[#e4e4e7] bg-white px-3 text-[15px] text-[#111111] outline-none transition-colors placeholder:text-[#a1a1aa] focus:border-[#111111]";

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode }>;
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-[#f1f1f2] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 cursor-pointer rounded-[9px] px-3 py-1.5 text-sm transition-colors",
            o.value === value
              ? "bg-white font-semibold text-[#111111] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
              : "text-[#71717a] hover:text-[#111111]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function vatLabel(bps: number | null) {
  if (bps === null) return "IVA non registrata";
  if (bps === 0) return "Senza IVA";
  return `IVA ${bps / 100}%`;
}

export const CATEGORY_GROUP_LABEL: Record<string, string> = {
  persone: "Persone",
  software: "Software e infrastruttura",
  marketing: "Marketing",
  consulenze: "Consulenze",
  tasse: "Tasse e contributi",
  iva: "IVA",
  altro: "Altro",
};

/** Select dei filtri: bordo nero quando filtra qualcosa (`"all"` = nessun filtro). */
export function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-10 cursor-pointer rounded-xl border bg-white px-3 pr-8 text-sm outline-none focus:border-[#111111]",
        value === "all" ? "border-[#e9e9eb] text-[#3f3f46]" : "border-[#111111] font-medium text-[#111111]",
      )}
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

/** Una cella della barra dei totali. Senza dato: trattino, mai «0» finto. */
export function FinTotal({
  label,
  value,
  note,
  empty,
  className,
}: {
  label: string;
  value: string;
  note?: ReactNode;
  empty?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-[#f2f2f3] px-5 py-4 md:border-b-0", className)}>
      <FinLabel>{label}</FinLabel>
      <div
        className={cn(
          "mt-2 text-[22px] font-semibold tracking-[-0.02em] tabular-nums",
          empty ? "text-[#d4d4d8]" : "text-[#111111]",
        )}
      >
        {empty ? "—" : value}
      </div>
      <div className="mt-0.5 min-h-[18px] text-xs text-[#71717a]">{note ?? ""}</div>
    </div>
  );
}

/** Select nativo con la freccia disegnata (appearance-none la toglie). */
export function SelectBox(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(inputClass, "cursor-pointer appearance-none pr-9", props.className)}
      />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717a]" />
    </div>
  );
}

/** Centesimi → testo per un campo importo («1.200» o «12,50»). */
export const centsToInput = (cents: number) =>
  (cents / 100).toLocaleString("it-IT", { minimumFractionDigits: cents % 100 ? 2 : 0 });

/** Punti base → testo per un campo percentuale («12,5»). */
export const bpsToInput = (bps: number) =>
  (bps / 100).toLocaleString("it-IT", { maximumFractionDigits: 2 });

/** «12,5» / «12.5» / «12,5%» → 1250 punti base. null se non valido o oltre 100. */
export function parsePercentToBps(input: string): number | null {
  const raw = input.trim().replace(/\s|%/g, "").replace(",", ".");
  if (!raw) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const bps = Math.round(Number(raw) * 100);
  return bps > 10000 ? null : bps;
}

/** Campo importo con «€» a destra. */
export function EuroInput({
  id,
  value,
  onChange,
  placeholder = "0",
  autoFocus,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        inputMode="decimal"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(inputClass, "pr-8 text-right font-semibold tabular-nums")}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#a1a1aa]">€</span>
    </div>
  );
}

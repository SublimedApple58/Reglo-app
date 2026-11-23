"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronRight, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  TRANSMISSION_LABELS,
  licenseCategoryShort,
  type Transmission,
} from "@/lib/autoscuole/license";
import { historySectionTitle, isQualification } from "@/lib/autoscuole/license-paths";

/**
 * REG-775 — il linguaggio della pagina Riepilogo del dettaglio allievo,
 * condiviso tra il drawer delle autoscuole e quello del consorzio.
 *
 * Pagina piatta: sezioni con un titolo nero, separate da una fascia grigia;
 * dentro, righe. Ogni azione è una riga (› apre un dialog o una scelta,
 * l'interruttore salva subito) oppure un `Button`. Niente pillole e niente
 * link sottolineati: gli stati sono il testo grigio sotto o accanto.
 */

const EASE = "ease-[cubic-bezier(.22,.7,.24,1)]";

/* ---------------------------------------------------------------- testata */

export function DrawerCloseButton({ onClick, label = "Chiudi" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white shadow-clay-raise-sm transition-transform duration-200 active:scale-[0.96]",
        EASE,
      )}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M3 3l8 8M11 3l-8 8" stroke="#222222" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/**
 * Testata compatta a sinistra: avatar, nome, una riga di stato in testo,
 * le azioni (WhatsApp) e le schede.
 */
export function DrawerHeader({
  avatar,
  name,
  subtitle,
  status,
  actions,
  onClose,
  closeLabel,
  tabs,
}: {
  avatar: React.ReactNode;
  name: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Riga di stato in evidenza (es. prenotazioni bloccate). */
  status?: React.ReactNode;
  actions?: React.ReactNode;
  onClose: () => void;
  closeLabel?: string;
  tabs: React.ReactNode;
}) {
  return (
    <div className="px-4 pt-5 sm:px-6 sm:pt-6">
      <div className="flex items-start gap-4">
        <div className="shrink-0">{avatar}</div>
        <div className="min-w-0 flex-1 self-center">
          <p className="truncate text-[22px] font-semibold leading-tight tracking-[-0.4px] text-foreground">
            {name}
          </p>
          {subtitle ? (
            <p className="mt-0.5 text-[14px] font-medium leading-snug text-[#6a6a6a]">{subtitle}</p>
          ) : null}
          {status ? <div className="mt-1">{status}</div> : null}
        </div>
        <DrawerCloseButton onClick={onClose} label={closeLabel} />
      </div>
      {actions ? <div className="mt-4 flex flex-wrap items-center gap-2.5">{actions}</div> : null}
      {tabs}
    </div>
  );
}

export function DrawerTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ key: T; label: string }>;
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="mt-5 flex items-stretch border-b border-[#efefef]">
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              "relative flex-1 cursor-pointer select-none whitespace-nowrap px-1 py-3 text-center text-sm transition-colors duration-200 sm:px-2",
              active ? "font-semibold text-foreground" : "font-medium text-[#6a6a6a] hover:text-foreground",
            )}
          >
            {tab.label}
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-0 -bottom-px h-[2px] origin-center bg-[#222222] transition-transform duration-[250ms]",
                EASE,
                active ? "scale-x-100" : "scale-x-0",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

/** Corpo della scheda: stesso margine della testata. */
export const drawerBodyClass = "px-4 pb-12 pt-6 sm:px-6";

/* ---------------------------------------------------------------- sezioni */

/**
 * Sezioni della pagina, separate da una fascia grigia a tutta larghezza.
 * I figli `null`/`false` non contano: la fascia sta solo tra sezioni vere.
 */
export function DetailSections({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <>
      {items.map((child, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <div aria-hidden className="-mx-4 my-7 h-2 bg-[#f7f7f7] sm:-mx-6" /> : null}
          {child}
        </React.Fragment>
      ))}
    </>
  );
}

export function DetailSection({
  title,
  aside,
  foot,
  children,
  testId,
  className,
}: {
  title?: React.ReactNode;
  aside?: React.ReactNode;
  foot?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <section data-testid={testId} className={className}>
      {title ? (
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h3 className="text-[17px] font-semibold tracking-[-0.2px] text-foreground">{title}</h3>
          {aside ? <span className="text-[13px] font-medium tabular-nums text-[#929292]">{aside}</span> : null}
        </div>
      ) : null}
      {children}
      {foot ? <p className="mt-2 text-[13px] font-medium leading-[1.5] text-[#929292]">{foot}</p> : null}
    </section>
  );
}

/** Righe con il filo sottile tra una e l'altra. */
export function DetailRows({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-[#efefef]", className)}>{children}</div>;
}

const rowBase = "flex min-h-[60px] w-full items-center gap-3.5 py-3 text-left";

function RowText({ label, description }: { label: React.ReactNode; description?: React.ReactNode }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-[15px] font-medium leading-[1.3] text-foreground">{label}</span>
      {description ? (
        <span className="mt-0.5 block text-[13px] font-medium leading-[1.35] text-[#6a6a6a]">{description}</span>
      ) : null}
    </span>
  );
}

const rowValueClass = "min-w-0 text-right text-[15px] font-medium text-[#6a6a6a]";

const Chevron = () => (
  <ChevronRight aria-hidden className="size-4 shrink-0 text-[#b8b8b8]" strokeWidth={2} />
);

/**
 * Riga: etichetta (con sottotitolo) a sinistra, valore o controllo a destra.
 * Con `onClick` è un bottone con la freccia: apre un dialog o una scelta.
 */
export function DetailRow({
  label,
  description,
  value,
  right,
  onClick,
  disabled,
  testId,
  className,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  value?: React.ReactNode;
  right?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
  className?: string;
}) {
  const content = (
    <>
      <RowText label={label} description={description} />
      {value != null && value !== "" ? <span className={rowValueClass}>{value}</span> : null}
      {right}
      {onClick ? <Chevron /> : null}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        data-testid={testId}
        onClick={onClick}
        disabled={disabled}
        className={cn(
          rowBase,
          "group cursor-pointer transition-opacity duration-200 hover:opacity-75 disabled:cursor-default disabled:opacity-50",
          className,
        )}
      >
        {content}
      </button>
    );
  }
  return (
    <div data-testid={testId} className={cn(rowBase, className)}>
      {content}
    </div>
  );
}

/** Riga-interruttore: tutta la riga è il controllo, salva subito. */
export function DetailSwitchRow({
  label,
  description,
  checked,
  onChange,
  busy,
  testId,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onChange: () => void;
  busy?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={busy || undefined}
      data-testid={testId}
      disabled={busy}
      onClick={onChange}
      className={cn(rowBase, "cursor-pointer disabled:cursor-default", busy && "[&>span:last-child]:opacity-50")}
    >
      <RowText label={label} description={description} />
      <InlineToggle checked={checked} size="lg" decorative />
    </button>
  );
}

/**
 * Riga che apre una `Select` (Radix): stessa riga con il valore e la freccia.
 * Va dentro `<Select>`; il contenuto resta quello di `components/ui/select`.
 */
export function DetailSelectRow({
  label,
  description,
  placeholder,
  disabled,
  testId,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  placeholder?: string;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <SelectPrimitive.Trigger
      data-testid={testId}
      disabled={disabled}
      className={cn(
        rowBase,
        "cursor-pointer outline-none transition-opacity duration-200 hover:opacity-75 focus-visible:opacity-75 disabled:cursor-default disabled:opacity-50",
      )}
    >
      <RowText label={label} description={description} />
      <span className={cn(rowValueClass, "truncate")}>
        <SelectPrimitive.Value placeholder={placeholder} />
      </span>
      <Chevron />
    </SelectPrimitive.Trigger>
  );
}

/** Numero grande con la sua etichetta grigia accanto (ore, crediti). */
export function DetailFigure({ value, label }: { value: React.ReactNode; label: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[38px] font-semibold leading-none tracking-[-1.2px] text-foreground tabular-nums">
        {value}
      </span>
      <span className="text-[15px] font-medium text-[#6a6a6a]">{label}</span>
    </div>
  );
}

/** Barra di avanzamento nera. */
export function DetailProgress({ ratio }: { ratio: number }) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div className="mb-2 mt-3.5 h-1.5 overflow-hidden rounded-full bg-[#efefef] shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]">
      <div
        className={cn("h-full rounded-full bg-[#1e1e1e] transition-[width] duration-300", EASE)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Fila di numeri (riepilogo guide, attività col consorzio). */
export function DetailStats({ items }: { items: Array<{ value: React.ReactNode; label: string }> }) {
  return (
    <div className="grid py-4" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((item, index) => (
        <div key={item.label} className={cn("px-1 text-center", index > 0 && "border-l border-[#efefef]")}>
          <p className="text-[22px] font-semibold leading-none tracking-[-0.5px] text-foreground tabular-nums sm:text-[24px]">
            {item.value}
          </p>
          <p className="mt-1.5 text-[12px] font-medium text-[#6a6a6a] sm:text-[12.5px]">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

/** Bottone discreto sotto una sezione («Avvia un nuovo percorso»). */
export function DetailAddButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="-ml-3 mt-1 font-semibold" onClick={onClick}>
      <Plus strokeWidth={2} />
      {children}
    </Button>
  );
}

/* ---------------------------------------------------------------- telefono */

/** Telefono: riga con freccia, che diventa campo + Salva/Annulla. */
export function PhoneRow({
  phone,
  editing,
  draft,
  saving,
  onStart,
  onDraftChange,
  onSave,
  onCancel,
}: {
  phone: string | null | undefined;
  editing: boolean;
  draft: string;
  saving: boolean;
  onStart: () => void;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (!editing) {
    return <DetailRow label="Telefono" value={phone || "Aggiungi"} onClick={onStart} testId="student-phone-row" />;
  }
  return (
    <div className="py-3">
      <p className="mb-2 text-[15px] font-medium text-foreground">Telefono</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="tel"
          autoFocus
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="+39 333 123 4567"
          disabled={saving}
          className="h-11 min-w-0 flex-1 basis-[180px]"
        />
        <div className="flex items-center gap-1.5">
          <Button type="button" size="sm" loading={saving} onClick={onSave}>
            Salva
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onCancel}>
            Annulla
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- percorsi conclusi */

type ClosedPath = {
  id: string;
  status: string;
  licenseCategory: string | null;
  transmission: string | null;
  licenseNumber: string | null;
  obtainedAt: string | null;
  closedAt: string | null;
};

const formatPathDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
};

/**
 * REG-458 — percorsi già chiusi, una riga ciascuno. Esiste solo se ce n'è
 * almeno uno (lo decide chi la usa). «Vedi guide» apre la scheda Guide
 * filtrata su quel percorso.
 */
export function ClosedPathsSection({
  paths,
  lessonsCount,
  onOpenLessons,
}: {
  paths: ClosedPath[];
  /** Solo nel drawer autoscuole: quante guide ha fatto in quel percorso. */
  lessonsCount?: (pathId: string) => number;
  onOpenLessons: (pathId: string) => void;
}) {
  return (
    <DetailSection title={historySectionTitle(paths)}>
      <DetailRows>
        {paths.map((path) => {
          const conseguita = path.status === "obtained";
          const quando = conseguita ? path.obtainedAt ?? path.closedAt : path.closedAt;
          const guide = lessonsCount?.(path.id);
          const title = [
            licenseCategoryShort(path.licenseCategory) || "—",
            path.transmission && !isQualification(path.licenseCategory)
              ? TRANSMISSION_LABELS[path.transmission as Transmission] ?? path.transmission
              : null,
            `${conseguita ? "conseguita" : "abbandonato"}${quando ? ` il ${formatPathDate(quando)}` : ""}`,
          ]
            .filter(Boolean)
            .join(" · ");
          const detail = [
            path.licenseNumber ? `Patente ${path.licenseNumber}` : "Nessun numero registrato",
            guide === undefined ? null : guide === 0 ? "nessuna guida" : guide === 1 ? "1 guida" : `${guide} guide`,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <DetailRow
              key={path.id}
              label={title}
              description={detail}
              value="Vedi guide"
              onClick={() => onOpenLessons(path.id)}
            />
          );
        })}
      </DetailRows>
    </DetailSection>
  );
}

/* ---------------------------------------------------------------- skeleton */

/** Skeleton del corpo: la forma delle sezioni vere. */
export function DetailBodySkeleton() {
  return (
    <div aria-busy className="space-y-4">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-1.5 w-full rounded-full" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center justify-between py-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
      <div aria-hidden className="-mx-4 h-2 bg-[#f7f7f7] sm:-mx-6" />
      <Skeleton className="h-5 w-32" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center justify-between py-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-[26px] w-11 rounded-full" />
        </div>
      ))}
    </div>
  );
}

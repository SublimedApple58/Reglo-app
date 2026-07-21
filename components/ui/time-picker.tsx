"use client";

import React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { motion } from "motion/react";
import { Clock } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * TimePickerInput — selettore orario ispirato al TimePicker di Ant Design,
 * con la skin del redesign (neutri, selezione near-black). Trigger compatto
 * con icona orologio; pannello a due colonne scrollabili (ore | minuti) con
 * auto-scroll sul valore selezionato e footer OK.
 *
 * Il valore cambia live nel trigger mentre si scelgono ore/minuti, ma
 * `onChange` scatta UNA volta sola alla chiusura (OK o click fuori): così le
 * pane con auto-save fanno un solo salvataggio per interazione.
 *
 * Popover NON-modale + `pointer-events-auto` sul content: dentro le Dialog
 * modali il body ha pointer-events:none (che il content sovrascrive), mentre
 * il popover `modal` innescava una race di cleanup con la Dialog che lasciava
 * il body congelato dopo la chiusura (Escape chiudeva entrambi in un colpo).
 */

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function parseTime(value: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return { hour: 0, minute: 0 };
  // 24 è ammesso come confine di fine giornata (24:00 = mezzanotte): l'unico
  // minuto valido nell'ora 24 è :00. Va abilitato dal chiamante con maxTime="24:00".
  const hour = Math.min(24, Number(match[1]));
  return {
    hour,
    minute: hour === 24 ? 0 : Math.min(59, Number(match[2])),
  };
}

function TimeColumn({
  values,
  selected,
  disabledValues,
  onSelect,
  format,
  layoutKey,
}: {
  values: number[];
  selected: number;
  disabledValues?: Set<number>;
  onSelect: (value: number) => void;
  format: (value: number) => string;
  /** Id univoco per colonna: la pill near-black SCIVOLA tra i valori (layoutId). */
  layoutKey: string;
}) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const selectedRef = React.useRef<HTMLButtonElement>(null);

  // Centra verticalmente il valore selezionato nella colonna (quando lo
  // scroll lo consente): istantaneo al mount (apertura), animato dopo.
  const mountedRef = React.useRef(false);
  React.useEffect(() => {
    const list = listRef.current;
    const item = selectedRef.current;
    if (!list || !item) return;
    list.scrollTo({
      top: item.offsetTop - list.clientHeight / 2 + item.clientHeight / 2,
      behavior: mountedRef.current ? "smooth" : "auto",
    });
    mountedRef.current = true;
  }, [selected]);

  // Se tutti i valori ci stanno nel pannello (item h-8 = 32px + py-1 = 8px)
  // la colonna si stringe sul contenuto; altezza fissa solo quando scrolla.
  const needsScroll = values.length * 32 + 8 > 224;

  return (
    <div
      ref={listRef}
      className={cn(
        "relative overflow-y-auto px-1 py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        needsScroll ? "h-[224px]" : "max-h-[224px]",
      )}
    >
      {values.map((value) => {
        const isSelected = value === selected;
        const isDisabled = disabledValues?.has(value) ?? false;
        return (
          <button
            key={value}
            ref={isSelected ? selectedRef : undefined}
            type="button"
            disabled={isDisabled}
            onClick={() => onSelect(value)}
            className={cn(
              "relative flex h-8 w-[52px] cursor-pointer select-none items-center justify-center rounded-[8px] text-sm font-medium",
              !isSelected && !isDisabled && "hover:bg-[#f5f5f5]",
              isDisabled && "cursor-not-allowed",
            )}
          >
            {isSelected && (
              <motion.span
                layoutId={layoutKey}
                className="absolute inset-0 rounded-[8px] bg-[#222222]"
                transition={{ type: "spring", stiffness: 550, damping: 38 }}
              />
            )}
            <span
              className={cn(
                "relative z-10 transition-colors duration-150",
                isSelected ? "text-white" : isDisabled ? "text-[#cccccc]" : "text-[#222222]",
              )}
            >
              {format(value)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function TimePickerInput({
  value,
  onChange,
  minTime,
  maxTime,
  minuteStep = 15,
  placeholder,
  onClear,
  clearLabel = "Azzera",
  className,
}: {
  /** Orario corrente "HH:MM" (null/undefined = non impostato, mostra placeholder). */
  value?: string | null;
  /** Chiamato UNA volta alla chiusura del pannello, se l'orario è cambiato. */
  onChange: (value: string) => void;
  /** Limiti inclusivi "HH:MM" (es. "06:00"–"10:00"). */
  minTime?: string;
  maxTime?: string;
  /** Passo dei minuti (default 15: quarti d'ora). */
  minuteStep?: number;
  /** Testo mostrato nel trigger quando value è null (es. "Non impostato"). */
  placeholder?: string;
  /** Se presente, il footer mostra un link che azzera il valore e chiude. */
  onClear?: () => void;
  clearLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(() => parseTime(value ?? minTime ?? "09:00"));
  const columnId = React.useId();
  // Con value null il pannello apre su un orario di comodo: senza interazione
  // la chiusura NON deve committare quel default.
  const touchedRef = React.useRef(false);

  const min = parseTime(minTime ?? "00:00");
  const max = parseTime(maxTime ?? "23:59");

  const hours: number[] = [];
  for (let h = min.hour; h <= max.hour; h += 1) hours.push(h);
  const minutes: number[] = [];
  for (let m = 0; m < 60; m += minuteStep) minutes.push(m);

  // Minuti fuori range sulle ore di bordo (es. max 10:00 → alle 10 solo :00)
  const disabledMinutes = new Set<number>();
  for (const m of minutes) {
    if (
      (draft.hour === min.hour && m < min.minute) ||
      (draft.hour === max.hour && m > max.minute)
    ) {
      disabledMinutes.add(m);
    }
  }

  const clampMinute = (hour: number, minute: number) => {
    let next = minute;
    if (hour === min.hour && next < min.minute) next = min.minute;
    if (hour === max.hour && next > max.minute) {
      next = minutes.filter((m) => m <= max.minute).pop() ?? 0;
    }
    return next;
  };

  const label = `${pad(draft.hour)}:${pad(draft.minute)}`;

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      touchedRef.current = false;
      setDraft(parseTime(value ?? minTime ?? "09:00"));
    } else {
      const next = `${pad(draft.hour)}:${pad(draft.minute)}`;
      if ((value != null || touchedRef.current) && next !== value) onChange(next);
    }
    setOpen(nextOpen);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex cursor-pointer select-none items-center gap-2 rounded-[10px] border-[1.5px] bg-white px-3 py-2 text-sm font-medium text-[#222222] transition-colors",
            open ? "border-[#222222]" : "border-[#dddddd] hover:border-[#929292]",
            className,
          )}
        >
          {open ? (
            label
          ) : value != null ? (
            value
          ) : (
            <span className="text-[#929292]">{placeholder ?? "—"}</span>
          )}
          <Clock
            className={cn(
              "size-[15px] shrink-0 transition-all duration-300 ease-out",
              open ? "-rotate-[30deg] scale-110 text-[#222222]" : "text-[#929292]",
            )}
            strokeWidth={1.8}
          />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="end"
          sideOffset={4}
          collisionPadding={8}
          className="pointer-events-auto z-[200] rounded-xl border border-[#ebebeb] bg-white shadow-dropdown outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1"
        >
          <div className="flex divide-x divide-[#ebebeb]">
            <TimeColumn
              values={hours}
              selected={draft.hour}
              onSelect={(hour) => {
                touchedRef.current = true;
                setDraft((prev) => ({ hour, minute: clampMinute(hour, prev.minute) }));
              }}
              format={pad}
              layoutKey={`${columnId}-h`}
            />
            <TimeColumn
              values={minutes}
              selected={draft.minute}
              disabledValues={disabledMinutes}
              onSelect={(minute) => {
                touchedRef.current = true;
                setDraft((prev) => ({ ...prev, minute }));
              }}
              format={pad}
              layoutKey={`${columnId}-m`}
            />
          </div>
          <div
            className={cn(
              "flex items-center border-t border-[#ebebeb] px-2 py-1.5",
              onClear ? "justify-between" : "justify-end",
            )}
          >
            {onClear && (
              <button
                type="button"
                onClick={() => {
                  touchedRef.current = false;
                  setOpen(false);
                  onClear();
                }}
                className="cursor-pointer px-1.5 text-xs font-medium text-[#6a6a6a] transition-colors hover:text-[#222222]"
              >
                {clearLabel}
              </button>
            )}
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="cursor-pointer rounded-full bg-[#222222] px-3.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-black"
            >
              OK
            </button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

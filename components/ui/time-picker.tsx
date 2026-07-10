"use client";

import React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
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
 * Come DatePickerInput è su Radix Popover `modal` (i popover non-modali
 * dentro le Dialog erediterebbero pointer-events:none dal body).
 */

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function parseTime(value: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return { hour: 0, minute: 0 };
  return {
    hour: Math.min(23, Number(match[1])),
    minute: Math.min(59, Number(match[2])),
  };
}

function TimeColumn({
  values,
  selected,
  disabledValues,
  onSelect,
  format,
}: {
  values: number[];
  selected: number;
  disabledValues?: Set<number>;
  onSelect: (value: number) => void;
  format: (value: number) => string;
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
              "flex h-8 w-[52px] cursor-pointer select-none items-center justify-center rounded-[8px] text-sm font-medium transition-colors",
              isSelected
                ? "bg-[#222222] text-white"
                : "text-[#222222] hover:bg-[#f5f5f5]",
              isDisabled && "cursor-not-allowed text-[#cccccc] hover:bg-transparent",
            )}
          >
            {format(value)}
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
  className,
}: {
  /** Orario corrente "HH:MM". */
  value: string;
  /** Chiamato UNA volta alla chiusura del pannello, se l'orario è cambiato. */
  onChange: (value: string) => void;
  /** Limiti inclusivi "HH:MM" (es. "06:00"–"10:00"). */
  minTime?: string;
  maxTime?: string;
  /** Passo dei minuti (default 15: quarti d'ora). */
  minuteStep?: number;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(() => parseTime(value));

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
      setDraft(parseTime(value));
    } else {
      const next = `${pad(draft.hour)}:${pad(draft.minute)}`;
      if (next !== value) onChange(next);
    }
    setOpen(nextOpen);
  };

  return (
    <PopoverPrimitive.Root modal open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex cursor-pointer select-none items-center gap-2 rounded-[10px] border-[1.5px] bg-white px-3 py-2 text-sm font-medium text-[#222222] transition-colors",
            open ? "border-[#222222]" : "border-[#dddddd] hover:border-[#929292]",
            className,
          )}
        >
          {open ? label : value}
          <Clock className="size-[15px] shrink-0 text-[#929292]" strokeWidth={1.8} />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="end"
          sideOffset={4}
          collisionPadding={8}
          className="z-[200] rounded-xl border border-[#ebebeb] bg-white shadow-dropdown outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1"
        >
          <div className="flex divide-x divide-[#ebebeb]">
            <TimeColumn
              values={hours}
              selected={draft.hour}
              onSelect={(hour) =>
                setDraft((prev) => ({ hour, minute: clampMinute(hour, prev.minute) }))
              }
              format={pad}
            />
            <TimeColumn
              values={minutes}
              selected={draft.minute}
              disabledValues={disabledMinutes}
              onSelect={(minute) => setDraft((prev) => ({ ...prev, minute }))}
              format={pad}
            />
          </div>
          <div className="flex justify-end border-t border-[#ebebeb] px-2 py-1.5">
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

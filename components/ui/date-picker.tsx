"use client";

import React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEK_DAYS = ["L", "Ma", "Me", "G", "V", "S", "D"];

const pad = (value: number) => value.toString().padStart(2, "0");

const formatDateLocal = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const formatDisplay = (value: string) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
};

function CalendarGrid({
  month,
  setMonth,
  selectedDate,
  onSelect,
}: {
  month: Date;
  setMonth: React.Dispatch<React.SetStateAction<Date>>;
  selectedDate: Date | null;
  onSelect: (date: Date) => void;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const totalDays = lastDay.getDate();
  const today = new Date();
  const todayStr = today.toDateString();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let day = 1; day <= totalDays; day++) cells.push(new Date(year, monthIndex, day));
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground capitalize">
          {month.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Mese precedente"
            onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Mese successivo"
            onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-gray-100 transition-colors"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center">
        {WEEK_DAYS.map((day, index) => (
          <div key={`${day}-${index}`} className="py-1 text-[10px] font-semibold uppercase text-muted-foreground">
            {day}
          </div>
        ))}
        {cells.map((day, index) => {
          const isSelected = day && selectedDate && day.toDateString() === selectedDate.toDateString();
          const isToday = day && day.toDateString() === todayStr;
          return (
            <button
              key={`${day?.toISOString() ?? "empty"}-${index}`}
              type="button"
              disabled={!day}
              onClick={() => day && onSelect(day)}
              className={cn(
                "h-8 w-8 mx-auto rounded-full text-xs font-medium transition-colors cursor-pointer",
                !day && "opacity-0 pointer-events-none",
                day && !isSelected && !isToday && "text-foreground hover:bg-gray-100",
                isToday && !isSelected && "border border-[#dddddd] bg-white text-foreground",
                isSelected && "bg-[#222222] text-white",
              )}
            >
              {day?.getDate() ?? ""}
            </button>
          );
        })}
      </div>
    </>
  );
}

/**
 * DatePicker — inline calendar (used in agenda, availability dialogs).
 */
export function DatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const initialDate = value ? new Date(value) : null;
  const [month, setMonth] = React.useState<Date>(initialDate ?? new Date());
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(initialDate);

  React.useEffect(() => {
    if (!value) return;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return;
    setSelectedDate(parsed);
    setMonth(parsed);
  }, [value]);

  return (
    <div className="rounded-xl border border-border bg-white p-3 shadow-card">
      <CalendarGrid
        month={month}
        setMonth={setMonth}
        selectedDate={selectedDate}
        onSelect={(day) => {
          setSelectedDate(day);
          onChange(formatDateLocal(day));
        }}
      />
    </div>
  );
}

/**
 * DatePickerInput — trigger input that opens a calendar popover.
 * Basato su Radix Popover (Portal + collision handling): non viene tagliato
 * dai contenitori con overflow e convive con le Dialog modali (layer stack).
 */
export function DatePickerInput({
  value,
  onChange,
  placeholder = "Seleziona data",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState<Date>(() => (value ? new Date(value) : new Date()));
  const selectedDate = value ? new Date(value) : null;

  // Sync month when value changes externally
  React.useEffect(() => {
    if (!value) return;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) setMonth(parsed);
  }, [value]);

  return (
    // NON-modale + pointer-events-auto sul content: dentro le Dialog modali il
    // body ha pointer-events:none (che il content sovrascrive); la variante
    // `modal` innescava una race di cleanup con la Dialog che lasciava il body
    // congelato dopo la chiusura.
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 text-sm transition-colors",
            open ? "border-[#222222]" : "border-border hover:border-[#929292]",
            value ? "text-foreground" : "text-muted-foreground",
            className,
          )}
        >
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-left truncate">
            {value ? formatDisplay(value) : placeholder}
          </span>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className="pointer-events-auto z-[200] w-[280px] rounded-xl border border-border bg-white p-3 shadow-dropdown outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1"
        >
          <CalendarGrid
            month={month}
            setMonth={setMonth}
            selectedDate={selectedDate}
            onSelect={(day) => {
              onChange(formatDateLocal(day));
              setOpen(false);
            }}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

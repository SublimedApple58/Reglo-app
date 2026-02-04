"use client";

import React from "react";

const WEEK_DAYS = ["L", "Ma", "Me", "G", "V", "S", "D"];

const pad = (value: number) => value.toString().padStart(2, "0");

const formatDateLocal = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

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

  const buildCalendar = () => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const totalDays = lastDay.getDate();
    const cells: Array<Date | null> = [];
    for (let i = 0; i < startOffset; i += 1) cells.push(null);
    for (let day = 1; day <= totalDays; day += 1) {
      cells.push(new Date(year, monthIndex, day));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };

  const days = buildCalendar();

  return (
    <div className="rounded-2xl border border-white/60 bg-white/80 p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-white/80"
          onClick={() =>
            setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
          }
        >
          ←
        </button>
        <div className="text-sm font-medium text-foreground">
          {month.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
        </div>
        <button
          type="button"
          className="rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-white/80"
          onClick={() =>
            setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
          }
        >
          →
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEK_DAYS.map((day, index) => (
          <div key={`${day}-${index}`} className="py-1 font-semibold">
            {day}
          </div>
        ))}
        {days.map((day, index) => {
          const isSelected =
            day && selectedDate && day.toDateString() === selectedDate.toDateString();
          return (
            <button
              key={`${day?.toISOString() ?? "empty"}-${index}`}
              type="button"
              disabled={!day}
              onClick={() => {
                if (!day) return;
                setSelectedDate(day);
                onChange(formatDateLocal(day));
              }}
              className={[
                "h-9 rounded-lg text-sm",
                day ? "hover:bg-[#dfeff0] text-foreground" : "opacity-0",
                isSelected ? "bg-[#aee2d4] text-[#1f2a44] font-semibold" : "",
              ].join(" ")}
            >
              {day?.getDate() ?? ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}
